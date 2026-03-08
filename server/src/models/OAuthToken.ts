/**
 * OAuth Token 数据模型
 *
 * 存储 OAuth 访问令牌和刷新令牌
 */

import { getConnection } from '../database/connection';
import { LOCAL_DB_NOW_SQL } from '../utils/time';
import type {
  OAuthToken,
  Platform,
} from './types';

/**
 * 令牌类型
 */
export type TokenType = 'access' | 'refresh' | 'state';

export class OAuthTokenModel {
  private db = getConnection();

  /**
   * 根据 ID 查找令牌
   */
  findById(id: number): OAuthToken | null {
    const result = this.db.get<OAuthToken>(
      'SELECT * FROM "oauth_tokens" WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 根据平台和账号 ID 查找访问令牌
   */
  findAccessToken(platform: Platform, accountId: string): OAuthToken | null {
    const result = this.db.get<OAuthToken>(
      `SELECT * FROM "oauth_tokens"
       WHERE platform = ? AND account_id = ? AND token_type = ? AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [platform, accountId, 'access', new Date().toISOString()]
    );
    return result || null;
  }

  /**
   * 根据平台和账号 ID 查找刷新令牌
   */
  findRefreshToken(platform: Platform, accountId: string): OAuthToken | null {
    const result = this.db.get<OAuthToken>(
      `SELECT * FROM "oauth_tokens"
       WHERE platform = ? AND account_id = ? AND token_type = ? AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [platform, accountId, 'refresh', new Date().toISOString()]
    );
    return result || null;
  }

  /**
   * 创建新令牌
   */
  create(
    platform: Platform,
    accountId: string,
    tokenType: TokenType,
    accessToken: string,
    expiresIn: number,
    refreshToken?: string
  ): OAuthToken {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const result = this.db.execute(
      `INSERT INTO "oauth_tokens" (platform, account_id, token_type, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [platform, accountId, tokenType, accessToken, refreshToken || null, expiresAt.toISOString()]
    );

    const created = this.findById(result.lastInsertRowid as number);
    if (!created) {
      throw new Error('创建令牌失败');
    }

    return created;
  }

  /**
   * 更新令牌
   */
  update(
    id: number,
    updates: Partial<Omit<OAuthToken, 'id' | 'created_at' | 'platform' | 'account_id'>>
  ): OAuthToken | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.access_token !== undefined) {
      fields.push('access_token = ?');
      params.push(updates.access_token);
    }

    if (updates.refresh_token !== undefined) {
      fields.push('refresh_token = ?');
      params.push(updates.refresh_token || null);
    }

    if (updates.expires_at !== undefined) {
      fields.push('expires_at = ?');
      params.push(
        typeof updates.expires_at === 'string'
          ? updates.expires_at
          : new Date(updates.expires_at as any).toISOString()
      );
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = ${LOCAL_DB_NOW_SQL}`);
    params.push(id);

    const sql = `UPDATE "oauth_tokens" SET ${fields.join(', ')} WHERE id = ?`;

    this.db.execute(sql, params);

    return this.findById(id);
  }

  /**
   * 删除指定令牌
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM "oauth_tokens" WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 清理过期令牌
   */
  cleanupExpired(): number {
    const now = new Date().toISOString();
    const result = this.db.execute(
      `DELETE FROM "oauth_tokens" WHERE expires_at < ?`,
      [now]
    );

    return result.changes;
  }

  /**
   * 根据平台和账号 ID 删除所有令牌
   */
  deleteByPlatformAndAccount(platform: Platform, accountId: string): number {
    const result = this.db.execute(
      'DELETE FROM "oauth_tokens" WHERE platform = ? AND account_id = ?',
      [platform, accountId]
    );

    return result.changes;
  }
}

// 单例实例
let oAuthTokenModelInstance: OAuthTokenModel | null = null;

export function getOAuthTokenModel(): OAuthTokenModel {
  if (!oAuthTokenModelInstance) {
    oAuthTokenModelInstance = new OAuthTokenModel();
  }
  return oAuthTokenModelInstance;
}
