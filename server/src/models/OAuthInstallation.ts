/**
 * OAuth Installation 数据模型
 *
 * 提供 OAuth 安装的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import { LOCAL_DB_NOW_SQL } from '../utils/time';
import type {
  OAuthInstallation,
  CreateInstallationDTO,
  Platform,
} from './types';

function toISOString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return new Date(date).toISOString();
}

function toNullableText(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export class OAuthInstallationModel {
  private db = getConnection();

  /**
   * 根据 ID 查找安装
   */
  findById(id: number): OAuthInstallation | null {
    const result = this.db.get<OAuthInstallation>(
      'SELECT * FROM "oauth_installations" WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 根据平台和账号 ID 查找安装
   */
  findByPlatformAndAccount(platform: Platform, accountId: string): OAuthInstallation | null {
    const result = this.db.get<OAuthInstallation>(
      'SELECT * FROM "oauth_installations" WHERE platform = ? AND account_id = ? AND is_active = 1',
      [platform, accountId]
    );
    return result || null;
  }

  /**
   * 获取所有活跃的安装
   */
  findActive(): OAuthInstallation[] {
    return this.db.all<OAuthInstallation>(
      'SELECT * FROM "oauth_installations" WHERE is_active = 1 ORDER BY created_at DESC'
    );
  }

  /**
   * 获取指定平台的活跃安装
   */
  findActiveByPlatform(platform: Platform): OAuthInstallation[] {
    return this.db.all<OAuthInstallation>(
      'SELECT * FROM "oauth_installations" WHERE platform = ? AND is_active = 1 ORDER BY created_at DESC',
      [platform]
    );
  }

  /**
   * 创建 OAuth 安装
   */
  create(dto: CreateInstallationDTO): OAuthInstallation {
    this.db.execute(
      `INSERT INTO oauth_installations (
        platform, auth_type, github_app_installation_id, account_id,
        account_name, access_token, refresh_token, token_expires_at, permissions,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${LOCAL_DB_NOW_SQL}, ${LOCAL_DB_NOW_SQL})`,
      [
        dto.platform,
        dto.auth_type || 'oauth',
        toNullableText(dto.github_app_installation_id),
        dto.account_id,
        toNullableText(dto.account_name),
        dto.access_token,
        toNullableText(dto.refresh_token),
        toISOString(dto.token_expires_at),
        toNullableText(dto.permissions),
      ]
    );

    const created = this.findByPlatformAndAccount(dto.platform, dto.account_id);
    if (!created) {
      throw new Error('创建 OAuth 安装失败');
    }

    return created;
  }

  /**
   * 更新 OAuth 安装
   */
  update(
    id: number,
    updates: Partial<Omit<OAuthInstallation, 'id' | 'created_at'>>
  ): OAuthInstallation | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.access_token !== undefined) {
      fields.push('access_token = ?');
      params.push(updates.access_token);
    }

    if (updates.refresh_token !== undefined) {
      fields.push('refresh_token = ?');
      params.push(toNullableText(updates.refresh_token));
    }

    if (updates.token_expires_at !== undefined) {
      fields.push('token_expires_at = ?');
      params.push(toISOString(updates.token_expires_at));
    }

    if (updates.permissions !== undefined) {
      fields.push('permissions = ?');
      params.push(toNullableText(updates.permissions));
    }

    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(updates.is_active ? 1 : 0);
    }

    if (updates.account_name !== undefined) {
      fields.push('account_name = ?');
      params.push(toNullableText(updates.account_name));
    }

    if (updates.auth_type !== undefined) {
      fields.push('auth_type = ?');
      params.push(updates.auth_type || 'oauth');
    }

    if (updates.github_app_installation_id !== undefined) {
      fields.push('github_app_installation_id = ?');
      params.push(toNullableText(updates.github_app_installation_id));
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = ${LOCAL_DB_NOW_SQL}`);
    params.push(id);

    const sql = `UPDATE oauth_installations SET ${fields.join(', ')} WHERE id = ?`;

    this.db.execute(sql, params);

    return this.findById(id);
  }

  /**
   * 删除 OAuth 安装
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM oauth_installations WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 设置安装状态
   */
  setActive(id: number, active: boolean): boolean {
    const result = this.db.execute(
      `UPDATE oauth_installations SET is_active = ?, updated_at = ${LOCAL_DB_NOW_SQL} WHERE id = ?`,
      [active ? 1 : 0, id]
    );

    return result.changes > 0;
  }

  /**
   * 获取平台的活跃安装数
   */
  countActiveByPlatform(platform: Platform): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM oauth_installations WHERE platform = ? AND is_active = 1',
      [platform]
    );

    return result?.count ?? 0;
  }

  /**
   * 清理过期的 token
   */
  cleanupExpiredTokens(): number {
    const now = new Date().toISOString();
    const result = this.db.execute(
      `UPDATE "oauth_installations"
       SET is_active = 0
       WHERE token_expires_at < ? AND is_active = 1`,
      [now]
    );

    return result.changes;
  }
}

// 单例实例
let oauthInstallationModelInstance: OAuthInstallationModel | null = null;

export function getOAuthInstallationModel(): OAuthInstallationModel {
  if (!oauthInstallationModelInstance) {
    oauthInstallationModelInstance = new OAuthInstallationModel();
  }
  return oauthInstallationModelInstance;
}
