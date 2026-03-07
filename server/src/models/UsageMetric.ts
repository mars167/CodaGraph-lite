/**
 * UsageMetric 数据模型
 *
 * 提供使用指标的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import type { UsageMetric, MetricType, Platform } from './types';

export class UsageMetricModel {
  private db = getConnection();

  /**
   * 根据 ID 查找指标
   */
  findById(id: number): UsageMetric | null {
    const result = this.db.get<UsageMetric>(
      'SELECT * FROM usage_metric WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 根据类型查找指标
   */
  findByType(type: MetricType, limit = 100): UsageMetric[] {
    return this.db.all<UsageMetric>(
      `SELECT * FROM usage_metric
       WHERE metric_type = ?
       ORDER BY recorded_at DESC
       LIMIT ?`,
      [type, limit]
    );
  }

  /**
   * 根据平台查找指标
   */
  findByPlatform(platform: Platform, limit = 100): UsageMetric[] {
    return this.db.all<UsageMetric>(
      `SELECT * FROM usage_metric
       WHERE platform = ?
       ORDER BY recorded_at DESC
       LIMIT ?`,
      [platform, limit]
    );
  }

  /**
   * 根据仓库查找指标
   */
  findByRepository(repositoryId: number, limit = 100): UsageMetric[] {
    return this.db.all<UsageMetric>(
      `SELECT * FROM usage_metric
       WHERE repository_id = ?
       ORDER BY recorded_at DESC
       LIMIT ?`,
      [repositoryId, limit]
    );
  }

  /**
   * 获取所有指标
   */
  findAll(limit = 100): UsageMetric[] {
    return this.db.all<UsageMetric>(
      `SELECT * FROM usage_metric
       ORDER BY recorded_at DESC
       LIMIT ?`,
      [limit]
    );
  }

  /**
   * 创建指标记录
   */
  create(
    type: MetricType,
    value: number,
    platform?: Platform,
    repositoryId?: number
  ): UsageMetric {
    const result = this.db.execute(
      `INSERT INTO usage_metric (metric_type, metric_value, platform, repository_id)
       VALUES (?, ?, ?, ?)`,
      [type, value, platform || null, repositoryId || null]
    );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('创建使用指标失败');
    }

    return created;
  }

  /**
   * 增加指标值（累积计数）
   */
  increment(
    type: MetricType,
    delta = 1,
    platform?: Platform,
    repositoryId?: number
  ): UsageMetric | null {
    // 查找最新的指标记录
    const latest = this.db.get<{ max_value: number }>(
      `SELECT metric_value as max_value
       FROM usage_metric
       WHERE metric_type = ?
         AND (platform = ? OR platform IS NULL)
         AND (repository_id = ? OR repository_id IS NULL)
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [type, platform || null, repositoryId || null]
    );

    const newValue = (latest?.max_value ?? 0) + delta;

    // 创建新的指标记录
    return this.create(type, newValue, platform, repositoryId);
  }

  /**
   * 获取指标统计
   */
  getStatistics(
    platform?: Platform
  ): Map<MetricType, number> {
    const stats = new Map<MetricType, number>();

    // 遍历所有指标类型
    const metricTypes: MetricType[] = [
      'analysis_total',
      'analysis_completed',
      'analysis_failed',
      'pr_analyzed',
      'comments_posted',
      'files_reviewed',
      'llm_prompt_tokens',
      'llm_completion_tokens',
      'llm_total_tokens',
      'llm_requests_total',
      'llm_requests_failed',
    ];

    for (const type of metricTypes) {
      let sql = 'SELECT SUM(metric_value) as total FROM usage_metric WHERE metric_type = ?';
      const params: any[] = [type];

      if (platform) {
        sql += ' AND platform = ?';
        params.push(platform);
      }

      const result = this.db.get<{ total: number }>(sql, params);
      stats.set(type, result?.total ?? 0);
    }

    return stats;
  }

  getTotal(type: MetricType, options: { platform?: Platform; since?: Date | string } = {}): number {
    let sql = 'SELECT SUM(metric_value) as total FROM usage_metric WHERE metric_type = ?';
    const params: Array<string | Date> = [type];

    if (options.platform) {
      sql += ' AND platform = ?';
      params.push(options.platform);
    }

    if (options.since) {
      sql += ' AND recorded_at >= ?';
      params.push(typeof options.since === 'string' ? options.since : options.since.toISOString());
    }

    const result = this.db.get<{ total: number }>(sql, params);
    return result?.total ?? 0;
  }

  /**
   * 获取近期趋势（按天统计）
   */
  getRecentTrend(days: number = 7, type?: MetricType): Array<{
    date: string;
    count: number;
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let sql = `
      SELECT DATE(recorded_at) as date, SUM(metric_value) as count
       FROM usage_metric
       WHERE recorded_at >= ?`;

    const params: any[] = [startDate.toISOString()];

    if (type) {
      sql += ' AND metric_type = ?';
      params.push(type);
    }

    sql += ' GROUP BY DATE(recorded_at) ORDER BY date DESC';

    return this.db.all(sql, params);
  }

  /**
   * 删除指标
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM usage_metric WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 清理旧指标（超过指定天数）
   */
  deleteOlderThan(days: number): number {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = this.db.execute(
      `DELETE FROM usage_metric WHERE recorded_at < ?`,
      [cutoffDate.toISOString()]
    );

    return result.changes;
  }

  /**
   * 统计指标数量
   */
  count(): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM usage_metric'
    );
    return result?.count ?? 0;
  }

  /**
   * 重置所有指标（谨慎使用！）
   */
  reset(): number {
    const result = this.db.execute('DELETE FROM usage_metric');
    return result.changes;
  }
}

// 单例实例
let usageMetricModelInstance: UsageMetricModel | null = null;

export function getUsageMetricModel(): UsageMetricModel {
  if (!usageMetricModelInstance) {
    usageMetricModelInstance = new UsageMetricModel();
  }
  return usageMetricModelInstance;
}
