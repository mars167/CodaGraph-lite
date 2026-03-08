/**
 * Installation 数据模型
 *
 * 提供 OAuth 安装的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import { LOCAL_DB_NOW_SQL } from '../utils/time';
import type {
  Installation,
  CreateInstallationDTO,
  Platform,
} from './types';

/**
 * 辅助函数：将 Date|string 转换为 ISO 字符串
 */
function toISOString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return new Date(date).toISOString();
}

export class InstallationModel {
  private db = getConnection();

  /**
   * 根据 ID 查找安装
   */
  findById(id: number): Installation | null {
    const result = this.db.get<Installation>(
      'SELECT * FROM installation WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 根据平台和账户 ID 查找安装
   */
  findByPlatformAndAccount(
    platform: Platform,
    accountId: string
  ): Installation | null {
    const result = this.db.get<Installation>(
      'SELECT * FROM installation WHERE platform = ? AND account_id = ?',
      [platform, accountId]
    );
    return result || null;
  }

  /**
   * 获取指定平台的所有安装
   */
  findByPlatform(platform: Platform): Installation[] {
    return this.db.all<Installation>(
      'SELECT * FROM installation WHERE platform = ? ORDER BY created_at DESC',
      [platform]
    );
  }

  /**
   * 获取所有活跃安装
   */
  findActive(): Installation[] {
    return this.db.all<Installation>(
      "SELECT * FROM installation WHERE is_active = 1 ORDER BY created_at DESC"
    );
  }

  /**
   * 获取所有安装
   */
  findAll(): Installation[] {
    return this.db.all<Installation>(
      'SELECT * FROM installation ORDER BY created_at DESC'
    );
  }

  /**
   * 创建安装
   */
  create(dto: CreateInstallationDTO): Installation {
    const result = this.db.execute(
      `INSERT INTO installation (
        platform, account_id, account_name, access_token,
        refresh_token, token_expires_at, permissions
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.platform,
        dto.account_id,
        dto.account_name || null,
        dto.access_token,
        dto.refresh_token || null,
        toISOString(dto.token_expires_at),
        dto.permissions || null,
      ]
    );

    const created = this.findByPlatformAndAccount(
      dto.platform,
      dto.account_id
    );
    if (!created) {
      throw new Error('创建安装失败');
    }

    return created;
  }

  /**
   * 更新安装
   */
  update(
    id: number,
    updates: Partial<
      Pick<
        Installation,
        | 'account_name'
        | 'access_token'
        | 'refresh_token'
        | 'token_expires_at'
        | 'permissions'
        | 'is_active'
      >
    >
  ): Installation | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.account_name !== undefined) {
      fields.push('account_name = ?');
      params.push(updates.account_name);
    }
    if (updates.access_token !== undefined) {
      fields.push('access_token = ?');
      params.push(updates.access_token);
    }
    if (updates.refresh_token !== undefined) {
      fields.push('refresh_token = ?');
      params.push(updates.refresh_token);
    }
    if (updates.token_expires_at !== undefined) {
      fields.push('token_expires_at = ?');
      params.push(toISOString(updates.token_expires_at));
    }
    if (updates.permissions !== undefined) {
      fields.push('permissions = ?');
      params.push(updates.permissions);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(updates.is_active ? 1 : 0);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = ${LOCAL_DB_NOW_SQL}`);
    params.push(id);

    const sql = `UPDATE installation SET ${fields.join(', ')} WHERE id = ?`;

    this.db.execute(sql, params);

    return this.findById(id);
  }

  /**
   * 更新访问令牌
   */
  updateToken(
    id: number,
    accessToken: string,
    refreshToken: string | null,
    expiresAt: Date
  ): boolean {
    const result = this.db.execute(
      `UPDATE installation
       SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = ${LOCAL_DB_NOW_SQL}
       WHERE id = ?`,
      [accessToken, refreshToken, expiresAt.toISOString(), id]
    );

    return result.changes > 0;
  }

  /**
   * 激活安装
   */
  activate(id: number): boolean {
    return this.update(id, { is_active: true }) !== null;
  }

  /**
   * 停用安装
   */
  deactivate(id: number): boolean {
    return this.update(id, { is_active: false }) !== null;
  }

  /**
   * 删除安装
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM installation WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 根据平台和账户 ID 删除
   */
  deleteByPlatformAndAccount(
    platform: Platform,
    accountId: string
  ): boolean {
    const result = this.db.execute(
      'DELETE FROM installation WHERE platform = ? AND account_id = ?',
      [platform, accountId]
    );

    return result.changes > 0;
  }

  /**
   * 检查是否存在指定平台的活跃安装
   */
  hasActiveInstallation(platform: Platform): boolean {
    const result = this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM installation WHERE platform = ? AND is_active = 1",
      [platform]
    );
    return (result?.count ?? 0) > 0;
  }

  /**
   * 获取令牌即将过期的安装
   */
  findExpiring(thresholdMinutes: number = 60): Installation[] {
    const thresholdDate = new Date(
      Date.now() + thresholdMinutes * 60 * 1000
    );

    return this.db.all<Installation>(
      `SELECT * FROM installation
       WHERE is_active = 1
         AND token_expires_at IS NOT NULL
         AND token_expires_at < ?
       ORDER BY token_expires_at ASC`,
      [thresholdDate.toISOString()]
    );
  }

  /**
   * 统计安装数量
   */
  count(): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM installation'
    );
    return result?.count ?? 0;
  }

  /**
   * 统计指定平台的安装数量
   */
  countByPlatform(platform: Platform): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM installation WHERE platform = ?',
      [platform]
    );
    return result?.count ?? 0;
  }
}

// 单例实例
let installationModelInstance: InstallationModel | null = null;

export function getInstallationModel(): InstallationModel {
  if (!installationModelInstance) {
    installationModelInstance = new InstallationModel();
  }
  return installationModelInstance;
}
