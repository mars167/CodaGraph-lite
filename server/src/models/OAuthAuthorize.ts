/**
 * OAuth Authorize 数据模型
 *
 * 提供 OAuth 授权码的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import type {
  OAuthAuthorize,
  Platform,
} from './types';

export class OAuthAuthorizeModel {
  private db = getConnection();

  /**
   * 根据 ID 查找授权
   */
  findById(id: number): OAuthAuthorize | null {
    const result = this.db.get<OAuthAuthorize>(
      'SELECT * FROM "oauth_authorize" WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 根据状态码查找授权
   */
  findByState(state: string): OAuthAuthorize | null {
    const result = this.db.get<OAuthAuthorize>(
      'SELECT * FROM "oauth_authorize" WHERE state = ?',
      [state]
    );
    return result || null;
  }

  /**
   * 创建新授权
   */
  create(platform: Platform, state: string, redirectUri: string, scope?: string): OAuthAuthorize {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const result = this.db.execute(
      `INSERT INTO "oauth_authorize" (platform, state, redirect_uri, scope, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [platform, state, redirectUri, scope || '', expiresAt]
    );

    const created = this.findByState(state);
    if (!created) {
      throw new Error('创建授权失败');
    }

    return created;
  }

  /**
   * 删除过期或已使用的授权
   */
  deleteExpiredOrUsed(): number {
    const now = new Date();
    const result = this.db.execute(
      `DELETE FROM "oauth_authorize"
       WHERE expires_at < ? OR expires_at IS NULL
       AND created_at < ?`,
      [now.toISOString(), now.toISOString().substring(0, 10)]
    );

    return result.changes;
  }

  /**
   * 清理过期的授权（定期任务）
   */
  cleanupExpired(): number {
    return this.deleteExpiredOrUsed();
  }

  /**
   * 删除指定授权
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM "oauth_authorize" WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }
}

// 单例实例
let oauthAuthorizeModelInstance: OAuthAuthorizeModel | null = null;

export function getOAuthAuthorizeModel(): OAuthAuthorizeModel {
  if (!oauthAuthorizeModelInstance) {
    oauthAuthorizeModelInstance = new OAuthAuthorizeModel();
  }
  return oauthAuthorizeModelInstance;
}
