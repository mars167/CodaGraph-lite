/**
 * Repository 数据模型
 *
 * 提供仓库的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import type {
  Repository,
  CreateRepositoryDTO,
  Platform,
  PaginationParams,
  PaginatedResult,
} from './types';

/**
 * 辅助函数：将 Date|string 转换为 ISO 字符串
 */
function toISOString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return new Date(date).toISOString();
}

function toNullableText(value: string | null | undefined): string | null {
  if (value == null || value === '') {
    return null;
  }
  return value;
}

export class RepositoryModel {
  private db = getConnection();

  /**
   * 根据 ID 查找仓库
   */
  findById(id: number): Repository | null {
    const result = this.db.get<Repository>(
      `SELECT * FROM repository WHERE id = ?`,
      [id]
    );
    return result || null;
  }

  /**
   * 根据平台、所有者和名称查找仓库
   */
  findByPlatformOwnerName(
    platform: Platform,
    owner: string,
    name: string
  ): Repository | null {
    const result = this.db.get<Repository>(
      `SELECT * FROM repository
       WHERE platform = ? AND owner = ? AND name = ?`,
      [platform, owner, name]
    );
    return result || null;
  }

  /**
   * 获取指定安装的所有仓库
   */
  findByInstallation(installationId: number): Repository[] {
    return this.db.all<Repository>(
      `SELECT * FROM repository
       WHERE installation_id = ?
       ORDER BY owner, name ASC`,
      [installationId]
    );
  }

  /**
   * 获取指定平台的所有活跃仓库
   */
  findActiveByPlatform(platform: Platform): Repository[] {
    return this.db.all<Repository>(
      `SELECT *
       FROM repository
       WHERE platform = ? AND is_active = 1
       ORDER BY created_at DESC`,
      [platform]
    );
  }

  findFavorites(limit = 100): Repository[] {
    return this.db.all<Repository>(
      `SELECT *
       FROM repository
       WHERE is_active = 1 AND is_favorite = 1
       ORDER BY favorited_at DESC, updated_at DESC
       LIMIT ?`,
      [limit]
    );
  }

  /**
   * 获取所有仓库
   */
  findAll(params: PaginationParams = {}): Repository[] {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const offset = params.offset ?? (page - 1) * limit;
    const sortBy = params.sortBy ?? 'created_at';
    const sortOrder = params.sortOrder ?? 'DESC';

    return this.db.all<Repository>(
      `SELECT * FROM repository
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  /**
   * 分页查询仓库
   */
  paginate(params: PaginationParams = {}): PaginatedResult<Repository> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const sortBy = params.sortBy ?? 'created_at';
    const sortOrder = params.sortOrder ?? 'DESC';
    const offset = (page - 1) * limit;

    // 获取总数
    const totalResult = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM repository'
    );
    const total = totalResult?.count ?? 0;

    // 获取数据
    const data = this.findAll({ limit, offset, sortBy, sortOrder });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 创建仓库
   */
  create(dto: CreateRepositoryDTO): Repository {
    const result = this.db.execute(
      `INSERT INTO repository (
        platform, remote_id, owner, name, full_name, description,
        is_private, language, stars_count, forks_count, default_branch,
        html_url, installation_id, webhook_id, webhook_secret, webhook_url,
        is_active, watch_enabled, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.platform,
        toNullableText(dto.remote_id),
        dto.owner,
        dto.name,
        dto.full_name,
        toNullableText(dto.description),
        dto.is_private ? 1 : 0,
        toNullableText(dto.language),
        dto.stars_count ?? 0,
        dto.forks_count ?? 0,
        toNullableText(dto.default_branch),
        toNullableText(dto.html_url),
        dto.installation_id,
        dto.webhook_id || null,
        dto.webhook_secret || null,
        dto.webhook_url || null,
        dto.is_active ? 1 : 0,
        dto.watch_enabled ? 1 : 0,
        toISOString(new Date()),
      ]
    );

    const created = this.findByPlatformOwnerName(
      dto.platform,
      dto.owner,
      dto.name
    );
    if (!created) {
      throw new Error('创建仓库失败');
    }

    return created;
  }

  /**
   * 更新仓库
   */
  update(
    id: number,
    updates: Partial<
      Pick<
        Repository,
        | 'webhook_id'
        | 'webhook_secret'
        | 'webhook_url'
        | 'is_active'
        | 'remote_id'
        | 'description'
        | 'is_private'
        | 'language'
        | 'stars_count'
        | 'forks_count'
        | 'default_branch'
        | 'html_url'
        | 'installation_id'
        | 'last_synced_at'
        | 'watch_enabled'
        | 'is_favorite'
        | 'watch_last_checked_at'
        | 'last_analyzed_at'
        | 'favorited_at'
      >
    >
  ): Repository | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.webhook_id !== undefined) {
      fields.push('webhook_id = ?');
      params.push(updates.webhook_id);
    }
    if (updates.webhook_secret !== undefined) {
      fields.push('webhook_secret = ?');
      params.push(updates.webhook_secret);
    }
    if (updates.webhook_url !== undefined) {
      fields.push('webhook_url = ?');
      params.push(updates.webhook_url);
    }
    if (updates.remote_id !== undefined) {
      fields.push('remote_id = ?');
      params.push(toNullableText(updates.remote_id));
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      params.push(toNullableText(updates.description));
    }
    if (updates.is_private !== undefined) {
      fields.push('is_private = ?');
      params.push(updates.is_private ? 1 : 0);
    }
    if (updates.language !== undefined) {
      fields.push('language = ?');
      params.push(toNullableText(updates.language));
    }
    if (updates.stars_count !== undefined) {
      fields.push('stars_count = ?');
      params.push(updates.stars_count);
    }
    if (updates.forks_count !== undefined) {
      fields.push('forks_count = ?');
      params.push(updates.forks_count);
    }
    if (updates.default_branch !== undefined) {
      fields.push('default_branch = ?');
      params.push(toNullableText(updates.default_branch));
    }
    if (updates.html_url !== undefined) {
      fields.push('html_url = ?');
      params.push(toNullableText(updates.html_url));
    }
    if (updates.installation_id !== undefined) {
      fields.push('installation_id = ?');
      params.push(updates.installation_id);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(updates.is_active ? 1 : 0);
    }
    if (updates.watch_enabled !== undefined) {
      fields.push('watch_enabled = ?');
      params.push(updates.watch_enabled ? 1 : 0);
    }
    if (updates.is_favorite !== undefined) {
      fields.push('is_favorite = ?');
      params.push(updates.is_favorite ? 1 : 0);
    }
    if (updates.last_synced_at !== undefined) {
      fields.push('last_synced_at = ?');
      params.push(
        updates.last_synced_at ? toISOString(updates.last_synced_at) : null
      );
    }
    if (updates.watch_last_checked_at !== undefined) {
      fields.push('watch_last_checked_at = ?');
      params.push(
        updates.watch_last_checked_at ? toISOString(updates.watch_last_checked_at) : null
      );
    }
    if (updates.last_analyzed_at !== undefined) {
      fields.push('last_analyzed_at = ?');
      params.push(
        updates.last_analyzed_at ? toISOString(updates.last_analyzed_at) : null
      );
    }
    if (updates.favorited_at !== undefined) {
      fields.push('favorited_at = ?');
      params.push(
        updates.favorited_at ? toISOString(updates.favorited_at) : null
      );
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE repository SET ${fields.join(', ')} WHERE id = ?`;

    this.db.execute(sql, params);

    return this.findById(id);
  }

  upsert(dto: CreateRepositoryDTO): Repository {
    const existing = this.findByPlatformOwnerName(dto.platform, dto.owner, dto.name);

    if (!existing) {
      return this.create(dto);
    }

    const updated = this.update(existing.id, {
      remote_id: dto.remote_id,
      description: dto.description,
      is_private: dto.is_private ?? false,
      language: dto.language,
      stars_count: dto.stars_count ?? 0,
      forks_count: dto.forks_count ?? 0,
      default_branch: dto.default_branch,
      html_url: dto.html_url,
      installation_id: dto.installation_id,
      is_active: dto.is_active,
      last_synced_at: new Date(),
    });

    if (!updated) {
      throw new Error('更新仓库缓存失败');
    }

    return updated;
  }

  /**
   * 更新最后分析时间
   */
  updateLastAnalyzed(id: number, analyzedAt: Date): boolean {
    const result = this.db.execute(
      `UPDATE repository
       SET last_analyzed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [toISOString(analyzedAt), id]
    );

    return result.changes > 0;
  }

  /**
   * 激活仓库
   */
  activate(id: number): boolean {
    return this.update(id, { is_active: true }) !== null;
  }

  /**
   * 停用仓库
   */
  deactivate(id: number): boolean {
    return this.update(id, { is_active: false }) !== null;
  }

  findWatchedActive(): Repository[] {
    return this.db.all<Repository>(
      `SELECT *
       FROM repository
       WHERE is_active = 1 AND watch_enabled = 1
       ORDER BY updated_at DESC`,
      []
    );
  }

  updateWatchCheck(id: number, checkedAt: Date): boolean {
    return this.update(id, { watch_last_checked_at: checkedAt }) !== null;
  }

  updateFavorite(id: number, enabled: boolean): Repository | null {
    return this.update(id, {
      is_favorite: enabled,
      favorited_at: enabled ? new Date() : null,
    });
  }

  /**
   * 删除仓库
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM repository WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 根据安装删除仓库
   */
  deleteByInstallation(installationId: number): number {
    const result = this.db.execute(
      'DELETE FROM repository WHERE installation_id = ?',
      [installationId]
    );

    return result.changes;
  }

  deactivateMissingForInstallation(
    installationId: number,
    activeFullNames: string[]
  ): number {
    if (activeFullNames.length === 0) {
      const result = this.db.execute(
        `UPDATE repository
         SET is_active = 0, updated_at = CURRENT_TIMESTAMP
         WHERE installation_id = ? AND is_active = 1`,
        [installationId]
      );

      return result.changes;
    }

    const placeholders = activeFullNames.map(() => '?').join(', ');
    const result = this.db.execute(
      `UPDATE repository
       SET is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE installation_id = ?
         AND is_active = 1
         AND full_name NOT IN (${placeholders})`,
      [installationId, ...activeFullNames]
    );

    return result.changes;
  }

  /**
   * 统计仓库数量
   */
  count(): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM repository'
    );
    return result?.count ?? 0;
  }

  /**
   * 统计活跃仓库数量
   */
  countActive(): number {
    const result = this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM repository WHERE is_active = 1"
    );
    return result?.count ?? 0;
  }

  /**
   * 搜索仓库
   */
  search(query: string, platform?: Platform): Repository[] {
    const searchPattern = `%${query}%`;
    let sql = `
      SELECT *
       FROM repository r
       WHERE (r.owner LIKE ? OR r.name LIKE ? OR r.full_name LIKE ?)
    `;
    const params = [searchPattern, searchPattern, searchPattern];

    if (platform) {
      sql += ' AND r.platform = ?';
      params.push(platform);
    }

    sql += ' ORDER BY r.created_at DESC LIMIT 50';

    return this.db.all<Repository>(sql, params);
  }
}

// 单例实例
let repositoryModelInstance: RepositoryModel | null = null;

export function getRepositoryModel(): RepositoryModel {
  if (!repositoryModelInstance) {
    repositoryModelInstance = new RepositoryModel();
  }
  return repositoryModelInstance;
}
