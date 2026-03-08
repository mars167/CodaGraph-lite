/**
 * OAuth 处理器
 *
 * 提供 GitHub/Gitee/GitLab 的 OAuth 流程处理
 */

import type { Platform } from '../models/types';

/**
 * OAuth 配置
 */
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string[];
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

export type OAuthAuthType = 'oauth' | 'github_app';

/**
 * GitHub OAuth 配置
 */
export const GITHUB_CONFIG: OAuthConfig = {
  clientId: process.env.GITHUB_CLIENT_ID || '',
  clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  redirectUri: process.env.GITHUB_CALLBACK_URL || process.env.GITHUB_REDIRECT_URI || 'http://localhost:7900/api/oauth/callback/github',
  scope: ['read:user', 'repo', 'admin:repo_hook'],
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userInfoUrl: 'https://api.github.com/user',
};

export const GITHUB_APP_CONFIG: OAuthConfig = {
  clientId: process.env.GITHUB_APP_CLIENT_ID || '',
  clientSecret: process.env.GITHUB_APP_CLIENT_SECRET || '',
  redirectUri: process.env.GITHUB_APP_REDIRECT_URI || process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/app/github/callback',
  scope: ['read:user', 'repo'],
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userInfoUrl: 'https://api.github.com/user',
};

/**
 * Gitee OAuth 配置
 */
export const GITEE_CONFIG: OAuthConfig = {
  clientId: process.env.GITEE_CLIENT_ID || '',
  clientSecret: process.env.GITEE_CLIENT_SECRET || '',
  redirectUri: process.env.GITEE_CALLBACK_URL || process.env.GITEE_REDIRECT_URI || 'http://localhost:7900/api/oauth/gitee/callback',
  scope: ['user_info', 'projects', 'pull_requests'],
  authorizationUrl: 'https://gitee.com/oauth/authorize',
  tokenUrl: 'https://gitee.com/oauth/token',
  userInfoUrl: 'https://gitee.com/api/v5/user',
};

/**
 * GitLab OAuth 配置
 */
export const GITLAB_CONFIG: OAuthConfig = {
  clientId: process.env.GITLAB_CLIENT_ID || '',
  clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
  redirectUri: process.env.GITLAB_CALLBACK_URL || process.env.GITLAB_REDIRECT_URI || 'http://localhost:7900/api/oauth/callback/gitlab',
  scope: ['read_user', 'api', 'read_repository'],
  authorizationUrl: 'https://gitlab.com/oauth/authorize',
  tokenUrl: 'https://gitlab.com/oauth/token',
  userInfoUrl: 'https://gitlab.com/api/v4/user',
};

/**
 * 生成随机状态码
 */
export function generateState(): string {
  return Buffer.from(`${Date.now()}-${Math.random().toString(36)}`).toString('base64');
}

/**
 * 根据 platform 获取配置
 */
export function getConfig(platform: Platform, authType: OAuthAuthType = 'oauth'): OAuthConfig {
  switch (platform) {
    case 'github': {
      if (authType === 'github_app') {
        return {
          ...GITHUB_APP_CONFIG,
          clientId: process.env.GITHUB_APP_CLIENT_ID || GITHUB_APP_CONFIG.clientId,
          clientSecret: process.env.GITHUB_APP_CLIENT_SECRET || GITHUB_APP_CONFIG.clientSecret,
          redirectUri: process.env.GITHUB_APP_REDIRECT_URI || process.env.GITHUB_CALLBACK_URL || GITHUB_APP_CONFIG.redirectUri,
        };
      }
      return {
        ...GITHUB_CONFIG,
        clientId: process.env.GITHUB_CLIENT_ID || GITHUB_CONFIG.clientId,
        clientSecret: process.env.GITHUB_CLIENT_SECRET || GITHUB_CONFIG.clientSecret,
        redirectUri: process.env.GITHUB_CALLBACK_URL || process.env.GITHUB_REDIRECT_URI || GITHUB_CONFIG.redirectUri,
      };
    }
    case 'gitee':
      return {
        ...GITEE_CONFIG,
        clientId: process.env.GITEE_CLIENT_ID || GITEE_CONFIG.clientId,
        clientSecret: process.env.GITEE_CLIENT_SECRET || GITEE_CONFIG.clientSecret,
        redirectUri: process.env.GITEE_CALLBACK_URL || process.env.GITEE_REDIRECT_URI || GITEE_CONFIG.redirectUri,
      };
    case 'gitlab':
      return {
        ...GITLAB_CONFIG,
        clientId: process.env.GITLAB_CLIENT_ID || GITLAB_CONFIG.clientId,
        clientSecret: process.env.GITLAB_CLIENT_SECRET || GITLAB_CONFIG.clientSecret,
        redirectUri: process.env.GITLAB_CALLBACK_URL || process.env.GITLAB_REDIRECT_URI || GITLAB_CONFIG.redirectUri,
      };
    default:
      throw new Error(`不支持的 platform: ${platform}`);
  }
}

/**
 * 构建 OAuth 授权 URL
 */
export function buildAuthorizationUrl(
  platform: Platform,
  state: string,
  authType: OAuthAuthType = 'oauth'
): string {
  if (platform === 'github' && authType === 'github_app') {
    const appSlug = process.env.GITHUB_APP_SLUG;
    if (!appSlug) {
      throw new Error('GITHUB_APP_SLUG 未配置，无法发起 GitHub App 安装');
    }

    const params = new URLSearchParams();
    params.append('state', state);
    return `https://github.com/apps/${appSlug}/installations/new?${params.toString()}`;
  }

  const config = getConfig(platform, authType);
  const params = new URLSearchParams();
  params.append('client_id', config.clientId);
  params.append('redirect_uri', config.redirectUri);
  params.append('scope', (config.scope || []).join(' '));
  params.append('state', state);
  params.append('response_type', 'code');

  return `${config.authorizationUrl}?${params.toString()}`;
}

/**
 * 验证回调请求的 state（防止 CSRF）
 */
export function validateState(state: string, provider: string): boolean {
  // state 应该是 base64 编码的时间戳
  try {
    const decoded = Buffer.from(state, 'base64').toString();
    const timestamp = parseInt(decoded.split('-')[0]);
    const timestampMs = Date.now() - timestamp;

    // state 应该在 5 分钟内有效
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

/**
 * 交换授权码获取访问令牌
 */
export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForToken(
  platform: Platform,
  code: string,
  authType: OAuthAuthType = 'oauth'
): Promise<TokenResponse> {
  const config = getConfig(platform, authType);

  // 根据平台使用不同的交换方式
  if (platform === 'github') {
    // GitHub 使用标准 POST 交换
    const params = new URLSearchParams();
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('code', code);

    const response = await fetch(`${config.tokenUrl}`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: params,
    });

    return await response.json() as TokenResponse;
  } else if (platform === 'gitee') {
    // Gitee 使用标准 POST 交换
    const params = new URLSearchParams();
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', config.redirectUri);

    const response = await fetch(`${config.tokenUrl}`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: params,
    });

    return await response.json() as TokenResponse;
  } else if (platform === 'gitlab') {
    // GitLab 也使用标准 POST 交换
    const params = new URLSearchParams();
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', config.redirectUri);

    const response = await fetch(`${config.tokenUrl}`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: params,
    });

    return await response.json() as TokenResponse;
  } else {
    return {
      error: `不支持的 platform: ${platform}`,
      error_description: '暂不支持该平台的 OAuth 集成',
      access_token: '',
    };
  }
}

export async function refreshAccessToken(
  platform: Platform,
  refreshToken: string,
  authType: OAuthAuthType = 'oauth'
): Promise<TokenResponse> {
  const config = getConfig(platform, authType);
  const params = new URLSearchParams();

  if (platform === 'github') {
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: params,
    });

    return await response.json() as TokenResponse;
  }

  if (platform === 'gitee') {
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: params,
    });

    return await response.json() as TokenResponse;
  }

  if (platform === 'gitlab') {
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('redirect_uri', config.redirectUri);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: params,
    });

    return await response.json() as TokenResponse;
  }

  return {
    error: `不支持的 platform: ${platform}`,
    error_description: '暂不支持该平台的 refresh token 刷新',
    access_token: '',
  };
}
