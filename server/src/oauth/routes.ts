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
import { getGitHubAppService } from '../services/GitHubAppService';
import { getOAuthInstallationService } from '../services/OAuthInstallationService';

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

class OAuthCallbackError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'OAuthCallbackError';
    this.statusCode = statusCode;
  }
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

function getOAuthCallbackCacheKey(
  platform: Platform,
  payload: Pick<OAuthCallbackPayload, 'code' | 'state' | 'installation_id'>
): string {
  return `${platform}:${payload.code || 'no-code'}:${payload.state || 'no-state'}:${payload.installation_id || 'no-install'}`;
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
    let providerMessage: string | undefined;
    try {
      const errorPayload = await response.json() as Record<string, unknown>;
      if (typeof errorPayload.error_description === 'string') {
        providerMessage = errorPayload.error_description;
      } else if (typeof errorPayload.message === 'string') {
        providerMessage = errorPayload.message;
      } else if (typeof errorPayload.error === 'string') {
        providerMessage = errorPayload.error;
      }
    } catch {
      providerMessage = undefined;
    }

    throw new OAuthCallbackError(
      providerMessage || `获取用户信息失败: ${response.status} ${response.statusText}`,
      response.status >= 500 ? 502 : 400
    );
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

function mapGitHubAppInstallationUser(installation: {
  id: number;
  account?: { id?: number; login?: string; type?: string };
  permissions?: Record<string, string>;
}) {
  return {
    id: installation.account?.id || installation.id,
    account_id: String(installation.account?.id || installation.id),
    login: installation.account?.login || `installation-${installation.id}`,
    name: installation.account?.login || `installation-${installation.id}`,
    avatar_url: undefined,
    email: null,
    bio: null,
    location: null,
    html_url: installation.account?.login ? `https://github.com/${installation.account.login}` : undefined,
    blog: null,
    company: null,
    type: installation.account?.type || 'Bot',
    public_repos: undefined,
    followers: undefined,
    following: undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    permissions: installation.permissions || null,
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

    if (!state || (authType !== 'github_app' && !code)) {
      return res.status(400).json({ error: authType === 'github_app' ? '缺少 state 参数' : '缺少 code/state 参数' });
    }

    if (!validateState(state, platform)) {
      return res.status(400).json({ error: '无效的 state 参数' });
    }

    cleanupOAuthCallbackCache();
    const callbackCacheKey = getOAuthCallbackCacheKey(platform, payload);
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
      const installationModel = getOAuthInstallationModel();
      let userInfo: Awaited<ReturnType<typeof getUserInfo>> | ReturnType<typeof mapGitHubAppInstallationUser>;
      let accessToken: string;
      let refreshToken: string | null = null;
      let expiresAt: Date | string | null;
      let resolvedGitHubAppInstallationId: string | null = null;

      if (authType === 'github_app' && platform === 'github') {
        if (!installation_id) {
          throw new Error('缺少 installation_id，无法完成 GitHub App 安装');
        }

        const gitHubAppService = getGitHubAppService();
        const appInstallation = await gitHubAppService.getInstallation(installation_id);
        const installationToken = await gitHubAppService.getInstallationAccessToken(installation_id);

        userInfo = mapGitHubAppInstallationUser(appInstallation);
        accessToken = installationToken.token;
        expiresAt = installationToken.expires_at;
        resolvedGitHubAppInstallationId = installation_id;
      } else {
        const tokenResponse = await exchangeCodeForToken(
          platform,
          code!,
          storedAuthType
        );

        if (tokenResponse.error) {
          throw new OAuthCallbackError(tokenResponse.error_description || tokenResponse.error, 400);
        }

        userInfo = await getUserInfo(platform, tokenResponse.access_token);
        accessToken = tokenResponse.access_token;
        refreshToken = tokenResponse.refresh_token || null;
        expiresAt = new Date(Date.now() + (tokenResponse.expires_in || 7200) * 1000);
      }

      const existing = installationModel.findByPlatformAndAccount(platform, userInfo.account_id);

      let installationId: number;

      if (existing) {
        installationModel.update(existing.id, {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: expiresAt,
          auth_type: authType,
          github_app_installation_id: authType === 'github_app'
            ? (resolvedGitHubAppInstallationId || existing.github_app_installation_id || null)
            : null,
          account_name: userInfo.login || userInfo.name,
          permissions: 'permissions' in userInfo && userInfo.permissions
            ? JSON.stringify(userInfo.permissions)
            : existing.permissions || null,
        });
        installationId = existing.id;
      } else {
        const createDto: CreateInstallationDTO = {
          platform,
          auth_type: authType,
          github_app_installation_id: authType === 'github_app' ? (resolvedGitHubAppInstallationId || null) : null,
          account_id: userInfo.account_id,
          account_name: userInfo.login || userInfo.name,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: expiresAt,
          permissions: 'permissions' in userInfo && userInfo.permissions
            ? JSON.stringify(userInfo.permissions)
            : null,
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
    if (error instanceof OAuthCallbackError) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }
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

    const refreshed = await getOAuthInstallationService().ensureValidAccessToken(installation, true);

    return res.json({
      success: true,
      message: refreshed.auth_type === 'github_app' ? 'GitHub App installation token 已刷新' : 'OAuth Token 已刷新',
    });
  } catch (error) {
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

export default router;
