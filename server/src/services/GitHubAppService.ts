import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { OAuthInstallation } from '../models/types';

type GitHubAppAccount = {
  id?: number;
  login?: string;
  type?: string;
};

type GitHubAppInstallation = {
  id: number;
  account?: GitHubAppAccount;
  permissions?: Record<string, string>;
};

type GitHubInstallationTokenResponse = {
  token: string;
  expires_at: string;
  permissions?: Record<string, string>;
};

type CachedToken = {
  token: string;
  expiresAt: number;
};

function base64urlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlFromBase64(value: string): string {
  return value
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizePrivateKey(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

export class GitHubAppService {
  private readonly apiUrl = 'https://api.github.com';
  private readonly tokenCache = new Map<string, CachedToken>();
  private jwtCache: CachedToken | null = null;

  private getAppId(): string {
    const appId = process.env.GITHUB_APP_ID;
    if (!appId) {
      throw new Error('GITHUB_APP_ID 未配置，无法使用 GitHub App 身份');
    }

    return appId;
  }

  private async getPrivateKey(): Promise<string> {
    if (process.env.GITHUB_APP_PRIVATE_KEY) {
      return normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY);
    }

    const configuredPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    if (!configuredPath) {
      throw new Error('GITHUB_APP_PRIVATE_KEY_PATH 或 GITHUB_APP_PRIVATE_KEY 未配置');
    }

    const resolvedPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);

    try {
      return await fs.readFile(resolvedPath, 'utf8');
    } catch (error) {
      throw new Error(
        `GitHub App 私钥文件不可用: ${resolvedPath} (${(error as Error).message})`
      );
    }
  }

  private async getAppJwt(): Promise<string> {
    if (this.jwtCache && this.jwtCache.expiresAt > Date.now() + 30_000) {
      return this.jwtCache.token;
    }

    const appId = this.getAppId();
    const privateKey = await this.getPrivateKey();
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iat: now - 60,
      exp: now + 600,
      iss: appId,
    };

    const encodedHeader = base64urlEncode(JSON.stringify(header));
    const encodedPayload = base64urlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signingInput)
      .sign(privateKey, 'base64');
    const jwt = `${signingInput}.${base64urlFromBase64(signature)}`;

    this.jwtCache = {
      token: jwt,
      expiresAt: Date.now() + 9 * 60_000,
    };

    return jwt;
  }

  private async requestWithJwt<T>(resourcePath: string, init?: RequestInit): Promise<T> {
    const jwt = await this.getAppJwt();
    const response = await fetch(`${this.apiUrl}${resourcePath}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'CodaGraph/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub App API 请求失败 ${resourcePath}: ${response.status} ${await response.text()}`
      );
    }

    return response.json() as Promise<T>;
  }

  async listInstallations(): Promise<GitHubAppInstallation[]> {
    const installations = await this.requestWithJwt<GitHubAppInstallation[]>('/app/installations');
    return Array.isArray(installations) ? installations : [];
  }

  async getInstallation(installationId: string): Promise<GitHubAppInstallation> {
    return this.requestWithJwt<GitHubAppInstallation>(`/app/installations/${installationId}`);
  }

  async findInstallationForAccount(
    accountName?: string | null,
    accountId?: string | null
  ): Promise<GitHubAppInstallation | null> {
    const installations = await this.listInstallations();

    const byLogin = accountName
      ? installations.find((installation) =>
          installation.account?.login?.toLowerCase() === accountName.toLowerCase()
        )
      : null;
    if (byLogin) {
      return byLogin;
    }

    if (!accountId) {
      return null;
    }

    return installations.find((installation) =>
      String(installation.account?.id || '') === String(accountId)
    ) || null;
  }

  async resolveInstallation(installation: OAuthInstallation): Promise<GitHubAppInstallation> {
    const explicitId = installation.github_app_installation_id;
    if (explicitId) {
      return this.getInstallation(explicitId);
    }

    const matched = await this.findInstallationForAccount(
      installation.account_name || null,
      installation.account_id
    );
    if (!matched) {
      throw new Error(
        `未找到 GitHub App installation: ${installation.account_name || installation.account_id}`
      );
    }

    return matched;
  }

  async getInstallationAccessToken(
    installationId: string,
    forceRefresh = false
  ): Promise<GitHubInstallationTokenResponse> {
    const cached = this.tokenCache.get(installationId);
    if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) {
      return {
        token: cached.token,
        expires_at: new Date(cached.expiresAt).toISOString(),
      };
    }

    const response = await this.requestWithJwt<GitHubInstallationTokenResponse>(
      `/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        body: '{}',
      }
    );

    const expiresAt = new Date(response.expires_at).getTime();
    this.tokenCache.set(installationId, {
      token: response.token,
      expiresAt,
    });

    return response;
  }
}

let gitHubAppService: GitHubAppService | null = null;

export function getGitHubAppService(): GitHubAppService {
  if (!gitHubAppService) {
    gitHubAppService = new GitHubAppService();
  }

  return gitHubAppService;
}
