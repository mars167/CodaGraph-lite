/**
 * OAuth 路由
 *
 * 提供 OAuth 认证和授权相关 API 端点
 */

import express, { Request, Response } from 'express';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import { getOAuthAuthorizeModel } from '../models/OAuthAuthorize';
import type { Platform, CreateInstallationDTO } from '../models/types';
import {
  generateState,
  buildAuthorizationUrl,
  getConfig,
  exchangeCodeForToken,
  type OAuthAuthType,
} from './handlers';
import { createOAuthSession } from './session';

const router = express.Router();

interface OAuthCallbackSuccessResponse {
  success: true;
  message: string;
  user: Awaited<ReturnType<typeof getUserInfo>>;
  sessionId: string;
  setupAction: string | null;
  installationId: string | null;
}

interface OAuthCallbackCacheEntry {
  expiresAt: number;
  promise: Promise<OAuthCallbackSuccessResponse>;
  result?: OAuthCallbackSuccessResponse;
}

const oauthCallbackCache = new Map<string, OAuthCallbackCacheEntry>();
const OAUTH_CALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;

function resolveAuthType(platform: Platform, authType?: string): OAuthAuthType {
  if (platform === 'github' && authType === 'github_app') {
    return 'github_app';
  }
  return 'oauth';
}

/**
 * OAuth 授权流程 - 重定向到平台授权页面
 */
router.get('/authorize/:platform', (req: Request, res: Response) => {
  try {
    const platform = req.params.platform as Platform;
    const authType = resolveAuthType(platform, typeof req.query.authType === 'string' ? req.query.authType : undefined);
    const state = generateState();
    const config = getConfig(platform, authType);
    const authUrl = buildAuthorizationUrl(platform, state, authType);
    const authorizeModel = getOAuthAuthorizeModel();
    authorizeModel.create(platform, state, config.redirectUri, authType);

    console.log(`🔐 OAuth 授权: ${platform} - 重定向到 ${authUrl}`);
    if (req.query.redirect === '1') {
      return res.redirect(authUrl);
    }

    return res.json({
      success: true,
      data: {
        authorizationUrl: authUrl,
      },
    });
  } catch (error) {
    console.error('OAuth 授权错误:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 验证 state 的辅助函数
 */
function validateState(state: string, provider: string): boolean {
  try {
    const decoded = Buffer.from(state, 'base64').toString();
    const timestamp = parseInt(decoded.split('-')[0]);
    const timestampMs = Date.now() - timestamp;

    if (timestampMs > 5 * 60 * 1000) {
      console.warn(`⚠️  OAuth state 已过期: ${provider}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('验证 state 失败:', error);
    return false;
  }
}

function getOAuthCallbackCacheKey(platform: Platform, code: string, state: string): string {
  return `${platform}:${code}:${state}`;
}

function setOAuthSessionCookie(res: Response, sessionId: string): void {
  res.cookie('oauth_session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

function cleanupOAuthCallbackCache(): void {
  const now = Date.now();
  for (const [key, entry] of oauthCallbackCache.entries()) {
    if (entry.expiresAt <= now) {
      oauthCallbackCache.delete(key);
    }
  }
}

/**
 * 获取用户信息的辅助函数
 */
interface UserInfoResponse {
  id?: string | number;
  login?: string;
  name?: string;
  avatar_url?: string;
  email?: string | null;
  bio?: string | null;
  location?: string | null;
  html_url?: string;
  blog?: string | null;
  company?: string | null;
  type?: string;
  public_repos?: number;
  followers?: number;
  following?: number;
}

async function getUserInfo(platform: Platform, accessToken: string) {
  const config = getConfig(platform);
  const response = await fetch(`${config.userInfoUrl}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'CodaGraph/1.0',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`获取用户信息失败: ${response.statusText}`);
  }

  const userData = await response.json() as UserInfoResponse;

  return {
    id: userData.id || userData.login,
    account_id: userData.id?.toString() || '',
    login: userData.login || userData.name || '',
    name: userData.name || userData.login || '',
    avatar_url: userData.avatar_url,
    email: userData.email,
    bio: userData.bio,
    location: userData.location,
    html_url: userData.html_url,
    blog: userData.blog,
    company: userData.company,
    type: userData.type,
    public_repos: userData.public_repos,
    followers: userData.followers,
    following: userData.following,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

interface OAuthCallbackPayload {
  code?: string;
  state?: string;
  authType?: string;
  installation_id?: string;
  setup_action?: string;
}

async function handleOAuthCallback(
  platform: Platform,
  req: Request,
  res: Response,
  payload: OAuthCallbackPayload
) {
  try {
    const { code, state, installation_id, setup_action } = payload;
    const authType = resolveAuthType(platform, payload.authType);

    console.log(`📥 OAuth 回调: ${platform}`);

    if (!code || !state) {
      return res.status(400).json({ error: '缺少 code/state 参数' });
    }

    // 验证 state
    if (!state || !validateState(state, platform)) {
      return res.status(400).json({ error: '无效的 state 参数' });
    }

    cleanupOAuthCallbackCache();
    const callbackCacheKey = getOAuthCallbackCacheKey(platform, code, state);
    const cached = oauthCallbackCache.get(callbackCacheKey);
    if (cached) {
      const cachedResponse = cached.result || await cached.promise;
      setOAuthSessionCookie(res, cachedResponse.sessionId);
      return res.json(cachedResponse);
    }

    const authorizeModel = getOAuthAuthorizeModel();
    const existingAuth = authorizeModel.findByState(state);

    if (!existingAuth || existingAuth.platform !== platform) {
      return res.status(400).json({ error: 'state 不存在或已失效' });
    }

    const storedAuthType = (existingAuth.scope || 'oauth') as OAuthAuthType;
    authorizeModel.delete(existingAuth.id);

    const processingPromise = (async (): Promise<OAuthCallbackSuccessResponse> => {
      const tokenResponse = await exchangeCodeForToken(
        platform,
        code,
        authType === 'github_app' ? storedAuthType : authType
      );

      if (tokenResponse.error) {
        throw new Error(tokenResponse.error_description || tokenResponse.error);
      }

      const userInfo = await getUserInfo(platform, tokenResponse.access_token);
      const installationModel = getOAuthInstallationModel();
      const existing = installationModel.findByPlatformAndAccount(
        platform,
        userInfo.account_id
      );

      let installationId: number;

      if (existing) {
        installationModel.update(existing.id, {
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token || null,
          token_expires_at: new Date(Date.now() + (tokenResponse.expires_in || 7200) * 1000),
          auth_type: authType,
          github_app_installation_id: authType === 'github_app'
            ? (installation_id || existing.github_app_installation_id || null)
            : null,
        });
        installationId = existing.id;
      } else {
        const createDto: CreateInstallationDTO = {
          platform,
          auth_type: authType,
          github_app_installation_id: authType === 'github_app' ? (installation_id || null) : null,
          account_id: userInfo.account_id,
          account_name: userInfo.login || userInfo.name,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token || null,
          token_expires_at: new Date(Date.now() + (tokenResponse.expires_in || 7200) * 1000),
        };

        const created = installationModel.create(createDto);
        installationId = created.id;
      }

      console.log(`✅ OAuth 授权成功: ${platform} - 账号: ${userInfo.account_id}`);

      const sessionId = createOAuthSession(
        installationId,
        platform,
        userInfo.login || userInfo.name,
        userInfo.name
      );

      return {
        success: true,
        message: '授权成功',
        user: userInfo,
        sessionId,
        setupAction: setup_action || null,
        installationId: installation_id || null,
      };
    })();

    oauthCallbackCache.set(callbackCacheKey, {
      expiresAt: Date.now() + OAUTH_CALLBACK_CACHE_TTL_MS,
      promise: processingPromise,
    });

    try {
      const responseBody = await processingPromise;
      oauthCallbackCache.set(callbackCacheKey, {
        expiresAt: Date.now() + OAUTH_CALLBACK_CACHE_TTL_MS,
        promise: Promise.resolve(responseBody),
        result: responseBody,
      });
      setOAuthSessionCookie(res, responseBody.sessionId);
      return res.json(responseBody);
    } catch (processingError) {
      oauthCallbackCache.delete(callbackCacheKey);
      throw processingError;
    }
  } catch (error) {
    console.error('OAuth 回调处理错误:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
}

/**
 * OAuth 回调处理 - Query 参数（适配 GitHub/GitHub App 回调）
 */
router.get('/callback/:platform', async (req: Request, res: Response) => {
  const platform = req.params.platform as Platform;
  const payload = req.query as OAuthCallbackPayload;
  return handleOAuthCallback(platform, req, res, payload);
});

/**
 * OAuth 回调处理 - JSON Body
 */
router.post('/callback/:platform', async (req: Request, res: Response) => {
  const platform = req.params.platform as Platform;
  const payload = req.body as OAuthCallbackPayload;
  return handleOAuthCallback(platform, req, res, payload);
});

router.get('/github/callback', async (req: Request, res: Response) => {
  return handleOAuthCallback('github', req, res, req.query as OAuthCallbackPayload);
});

router.post('/github/callback', async (req: Request, res: Response) => {
  return handleOAuthCallback('github', req, res, req.body as OAuthCallbackPayload);
});

router.get('/gitee/callback', async (req: Request, res: Response) => {
  return handleOAuthCallback('gitee', req, res, req.query as OAuthCallbackPayload);
});

router.get('/gitlab/callback', async (req: Request, res: Response) => {
  return handleOAuthCallback('gitlab', req, res, req.query as OAuthCallbackPayload);
});

/**
 * 获取安装列表（管理员用）
 */
router.get('/installations', async (_req: Request, res: Response) => {
  try {
    const installationModel = getOAuthInstallationModel();
    const installations = installationModel.findActive();

    return res.json({
      installations,
      count: installations.length,
    });
  } catch (error) {
    console.error('获取安装列表失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 删除安装
 */
router.delete('/installations/:id', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const installationModel = getOAuthInstallationModel();
    const success = installationModel.setActive(id, false);

    if (!success) {
      return res.status(404).json({ error: '安装不存在或操作失败' });
    }

    console.log(`🗑 删除 OAuth 安装: ${id}`);
    return res.json({
      success: true,
      message: '安装已删除',
    });
  } catch (error) {
    console.error('删除安装失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.post('/installations/:id/refresh', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const installationModel = getOAuthInstallationModel();
    const installation = installationModel.findById(id);
    if (!installation || !installation.is_active) {
      return res.status(404).json({ error: '安装不存在' });
    }

    return res.json({
      success: true,
      message: 'Token 刷新请求已受理',
    });
  } catch (error) {
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

export default router;
