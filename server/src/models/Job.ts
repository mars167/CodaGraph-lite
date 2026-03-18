/**
 * Job 数据模型
 *
 * 提供作业队列的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import { sanitizeSensitiveText } from '../utils/redactSensitive';
import { LOCAL_DB_NOW_SQL } from '../utils/time';
import type {
  Job,
  JobPayload,
  JobType,
  QueueJobStatus,
  PaginationParams,
  PaginatedResult,
} from './types';

export class JobModel {
  private db = getConnection();

  /**
   * 根据 ID 查找作业
   */
  findById(id: number): Job | null {
    const result = this.db.get<Job>(
      'SELECT * FROM jobs WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 获取待处理的作业（按优先级排序）
   */
  findNext(): Job | null {
    const result = this.db.get<Job>(
      `SELECT * FROM jobs
       WHERE status = 'pending'
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`
    );
    return result || null;
  }

  /**
   * 获取待处理的作业列表
   */
  findPending(limit = 10): Job[] {
    return this.db.all<Job>(
      `SELECT * FROM jobs
       WHERE status = 'pending'
       ORDER BY priority ASC, created_at ASC
       LIMIT ?`,
      [limit]
    );
  }

  /**
   * 根据类型查找作业
   */
  findByType(type: JobType, limit = 50): Job[] {
    return this.db.all<Job>(
      `SELECT * FROM jobs
       WHERE type = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [type, limit]
    );
  }

  findLatestByAnalysisId(analysisId: number): Job | null {
    const result = this.db.get<Job>(
      `SELECT * FROM jobs
       WHERE json_extract(payload, '$.analysis_id') = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [String(analysisId)]
    );
    return result || null;
  }

  /**
   * 获取正在处理的作业
   */
  findProcessing(): Job[] {
    return this.db.all<Job>(
      `SELECT * FROM jobs
       WHERE status = 'processing'
       ORDER BY started_at ASC`
    );
  }

  /**
   * 获取所有作业
   */
  findAll(params: PaginationParams = {}): Job[] {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const offset = params.offset ?? (page - 1) * limit;
    const sortBy = params.sortBy ?? 'created_at';
    const sortOrder = params.sortOrder ?? 'DESC';

    return this.db.all<Job>(
      `SELECT * FROM jobs
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  /**
   * 分页查询作业
   */
  paginate(params: PaginationParams = {}): PaginatedResult<Job> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const sortBy = params.sortBy ?? 'created_at';
    const sortOrder = params.sortOrder ?? 'DESC';
    const offset = (page - 1) * limit;

    // 获取总数
    const totalResult = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM jobs'
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
   * 创建作业
   */
  create(type: JobType, payload: JobPayload, priority = 5): Job {
    const result = this.db.execute(
      `INSERT INTO jobs (type, payload, priority, created_at, updated_at)
       VALUES (?, ?, ?, ${LOCAL_DB_NOW_SQL}, ${LOCAL_DB_NOW_SQL})`,
      [type, JSON.stringify(payload), priority]
    );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('创建作业失败');
    }

    return created;
  }

  /**
   * 更新作业
   */
  update(id: number, updates: Partial<Pick<Job, 'status' | 'error_message'>>): Job | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');

      // 根据状态设置时间戳
      if (updates.status === 'processing') {
        fields.push(`started_at = ${LOCAL_DB_NOW_SQL}`);
      } else if (updates.status === 'completed') {
        fields.push(`completed_at = ${LOCAL_DB_NOW_SQL}`);
      } else if (updates.status === 'failed' || updates.status === 'cancelled' || updates.status === 'dead') {
        fields.push(`failed_at = ${LOCAL_DB_NOW_SQL}`);
        // 获取当前 attempts 并递增
        const currentJob = this.findById(id);
        const currentAttempts = currentJob?.attempts || 0;
        if (updates.status !== 'cancelled') {
          fields.push(`attempts = ${currentAttempts + 1}`);
        }
      }

      params.push(updates.status);
    }

    if (updates.error_message !== undefined) {
      fields.push('error_message = ?');
      params.push(updates.error_message === null ? null : sanitizeSensitiveText(updates.error_message));
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = ${LOCAL_DB_NOW_SQL}`);
    params.push(id);

    const sql = `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`;

    this.db.execute(sql, params);

    return this.findById(id);
  }

  /**
   * 标记为处理中
   */
  markProcessing(id: number): Job | null {
    return this.update(id, { status: 'processing' });
  }

  /**
   * 恢复为待处理状态
   */
  markPending(id: number): Job | null {
    this.db.execute(
      `UPDATE jobs
       SET status = 'pending',
           error_message = NULL,
           started_at = NULL,
           completed_at = NULL,
           failed_at = NULL,
           updated_at = ${LOCAL_DB_NOW_SQL}
       WHERE id = ?`,
      [id]
    );

    return this.findById(id);
  }

  /**
   * 标记为完成
   */
  markComplete(id: number): Job | null {
    return this.update(id, { status: 'completed' });
  }

  /**
   * 标记为失败
   */
  markFailed(id: number, errorMessage: string): Job | null {
    return this.update(id, {
      status: 'failed',
      error_message: errorMessage,
    });
  }

  /**
   * 标记为已取消
   */
  markCancelled(id: number, message: string): Job | null {
    return this.update(id, {
      status: 'cancelled',
      error_message: message,
    });
  }

  /**
   * 标记为死信队列（永久失败）
   */
  markDead(id: number): Job | null {
    return this.update(id, { status: 'dead' });
  }

  /**
   * 增加重试次数
   */
  incrementAttempts(id: number): Job | null {
    const result = this.db.execute(
      `UPDATE jobs SET attempts = attempts + 1, updated_at = ${LOCAL_DB_NOW_SQL}
       WHERE id = ?`,
      [id]
    );

    return this.findById(id);
  }

  /**
   * 删除作业
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM jobs WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 清理已完成的旧作业（超过指定天数）
   */
  deleteCompletedOlderThan(days: number): number {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = this.db.execute(
      `DELETE FROM jobs
       WHERE status IN ('completed', 'dead')
         AND created_at < ?`,
      [cutoffDate.toISOString()]
    );

    return result.changes;
  }

  /**
   * 统计作业数量
   */
  count(): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM jobs'
    );
    return result?.count ?? 0;
  }

  /**
   * 根据状态统计
   */
  countByStatus(status: QueueJobStatus): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM jobs WHERE status = ?',
      [status]
    );
    return result?.count ?? 0;
  }

  /**
   * 检查是否有正在处理的作业
   */
  hasProcessingJob(): boolean {
    const count = this.countByStatus('processing');
    return count > 0;
  }

  /**
   * 获取作业队列统计
   */
  getQueueStats() {
    const total = this.count();
    
    // 计算平均处理时间（仅针对已完成的作业）
    const avgResult = this.db.get<{ avg_time: number }>(
      `SELECT AVG((strftime('%s', completed_at) - strftime('%s', started_at)) * 1000) as avg_time
       FROM jobs 
       WHERE status = 'completed' 
       AND started_at IS NOT NULL 
       AND completed_at IS NOT NULL`
    );

    return {
      total,
      pending: this.countByStatus('pending'),
      processing: this.countByStatus('processing'),
      completed: this.countByStatus('completed'),
      failed: this.countByStatus('failed'),
      dead: this.countByStatus('dead'),
      avgProcessingTime: avgResult?.avg_time || 0,
    };
  }

  /**
   * 清空作业队列（谨慎使用！）
   */
  clear(): number {
    const result = this.db.execute('DELETE FROM jobs');
    return result.changes;
  }

  /**
   * 重新排队死信队列中的作业
   */
  requeueDead(maxAttempts = 3): number {
    const result = this.db.execute(
      `UPDATE jobs
       SET status = 'pending',
           attempts = 0,
           updated_at = ${LOCAL_DB_NOW_SQL}
       WHERE status = 'dead'
         AND attempts < ?`,
      [maxAttempts]
    );

    return result.changes;
  }

  /**
   * 根据类型查找作业
   */
  findByTypeAndStatus(type: JobType, status: QueueJobStatus, limit = 50): Job[] {
    return this.db.all<Job>(
      `SELECT * FROM jobs
       WHERE type = ? AND status = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [type, status, limit]
    );
  }

  /**
   * 根据状态查找作业
   */
  findByStatus(status: QueueJobStatus, limit = 50): Job[] {
    return this.db.all<Job>(
      `SELECT * FROM jobs
       WHERE status = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [status, limit]
    );
  }
}

// 单例实例
let jobModelInstance: JobModel | null = null;

export function getJobModel(): JobModel {
  if (!jobModelInstance) {
    jobModelInstance = new JobModel();
  }
  return jobModelInstance;
}
