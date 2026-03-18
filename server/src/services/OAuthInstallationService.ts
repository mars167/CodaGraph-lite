import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import type { OAuthInstallation } from '../models/types';
import { refreshAccessToken } from '../oauth/handlers';
import { getGitHubAppService } from './GitHubAppService';

function isExpired(tokenExpiresAt?: string | Date | null): boolean {
  if (!tokenExpiresAt) {
    return false;
  }

  const expiresAt = new Date(tokenExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() <= Date.now() + 60_000;
}

export class OAuthInstallationService {
  private installationModel = getOAuthInstallationModel();
  private gitHubAppService = getGitHubAppService();

  private async ensureGitHubAppToken(
    installation: OAuthInstallation,
    forceRefresh: boolean
  ): Promise<OAuthInstallation> {
    const appInstallation = await this.gitHubAppService.resolveInstallation(installation);
    const tokenResponse = await this.gitHubAppService.getInstallationAccessToken(
      String(appInstallation.id),
      forceRefresh || isExpired(installation.token_expires_at)
    );

    const updated = this.installationModel.update(installation.id, {
      auth_type: 'github_app',
      github_app_installation_id: String(appInstallation.id),
      account_name: appInstallation.account?.login || installation.account_name || null,
      access_token: tokenResponse.token,
      refresh_token: null,
      token_expires_at: tokenResponse.expires_at,
      permissions: JSON.stringify(appInstallation.permissions || tokenResponse.permissions || null),
    });

    if (!updated) {
      throw new Error('刷新 GitHub App installation token 后更新本地安装记录失败');
    }

    return updated;
  }

  async ensureValidAccessToken(installation: OAuthInstallation, forceRefresh = false): Promise<OAuthInstallation> {
    if (installation.platform === 'github' && installation.auth_type === 'github_app') {
      if (!forceRefresh && installation.github_app_installation_id && !isExpired(installation.token_expires_at)) {
        return installation;
      }
      return this.ensureGitHubAppToken(installation, forceRefresh);
    }

    if (installation.auth_type === 'pat') {
      return installation;
    }

    if (!forceRefresh && !isExpired(installation.token_expires_at)) {
      return installation;
    }

    if (!installation.refresh_token) {
      throw new Error('OAuth token 已过期且缺少 refresh_token，请重新授权');
    }

    const tokenResponse = await refreshAccessToken(
      installation.platform,
      installation.refresh_token,
      installation.auth_type || 'oauth'
    );

    if (tokenResponse.error || !tokenResponse.access_token) {
      throw new Error(tokenResponse.error_description || tokenResponse.error || '刷新 OAuth token 失败，请重新授权');
    }

    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : installation.token_expires_at || null;

    const updated = this.installationModel.update(installation.id, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || installation.refresh_token || null,
      token_expires_at: expiresAt,
    });

    if (!updated) {
      throw new Error('刷新 OAuth token 后更新本地安装记录失败');
    }

    return updated;
  }
}

let oauthInstallationService: OAuthInstallationService | null = null;

export function getOAuthInstallationService(): OAuthInstallationService {
  if (!oauthInstallationService) {
    oauthInstallationService = new OAuthInstallationService();
  }
  return oauthInstallationService;
}
