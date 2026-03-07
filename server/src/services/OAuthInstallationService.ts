import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import type { OAuthInstallation } from '../models/types';
import { refreshAccessToken } from '../oauth/handlers';

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

  async ensureValidAccessToken(installation: OAuthInstallation, forceRefresh = false): Promise<OAuthInstallation> {
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
