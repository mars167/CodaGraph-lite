/**
 * AnalysisJob 数据模型
 *
 * 提供分析作业进度的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import { sanitizeSensitiveText } from '../utils/redactSensitive';
import { LOCAL_DB_NOW_SQL } from '../utils/time';
import type {
  AnalysisJob,
  AnalysisJobStage,
  JobStatus,
} from './types';

export class AnalysisJobModel {
  private db = getConnection();

  /**
   * 根据 ID 查找分析作业
   */
  findById(id: number): AnalysisJob | null {
    const result = this.db.get<AnalysisJob>(
      'SELECT * FROM analysis_job WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 根据分析 ID 查找所有作业
   */
  findByAnalysisId(analysisId: number): AnalysisJob[] {
    return this.db.all<AnalysisJob>(
      'SELECT * FROM analysis_job WHERE analysis_id = ? ORDER BY id ASC',
      [analysisId]
    );
  }

  /**
   * 获取正在处理的作业
   */
  findProcessing(): AnalysisJob[] {
    return this.db.all<AnalysisJob>(
      `SELECT * FROM analysis_job
       WHERE status = 'processing'
       ORDER BY created_at ASC`
    );
  }

  /**
   * 获取指定阶段和状态的作业
   */
  findByStageAndStatus(
    stage: AnalysisJobStage,
    status: JobStatus
  ): AnalysisJob[] {
    return this.db.all<AnalysisJob>(
      `SELECT * FROM analysis_job
       WHERE stage = ? AND status = ?
       ORDER BY created_at DESC`,
      [stage, status]
    );
  }

  /**
   * 创建分析作业
   */
  create(analysisId: number | null, stage: AnalysisJobStage): AnalysisJob {
    const result = this.db.execute(
      `INSERT INTO analysis_job (analysis_id, stage, status, progress, message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ${LOCAL_DB_NOW_SQL}, ${LOCAL_DB_NOW_SQL})`,
      [analysisId, stage, 'pending', 0, '等待开始']
    );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('创建分析作业失败');
    }

    return created;
  }

  /**
   * 更新作业状态
   */
  updateStatus(id: number, status: JobStatus): AnalysisJob | null {
    const fields: string[] = [];
    const params: any[] = [status];

    if (status === 'processing') {
      fields.push(`started_at = ${LOCAL_DB_NOW_SQL}`);
    } else if (status === 'completed') {
      fields.push(`completed_at = ${LOCAL_DB_NOW_SQL}`);
    } else if (status === 'failed') {
      fields.push(`failed_at = ${LOCAL_DB_NOW_SQL}`);
    }

    const sql = `UPDATE analysis_job
       SET status = ?, ${fields.join(', ')}, updated_at = ${LOCAL_DB_NOW_SQL}
       WHERE id = ?`;

    this.db.execute(sql, [...params, id]);

    return this.findById(id);
  }

  /**
   * 更新作业进度
   */
  updateProgress(
    id: number,
    progress: number,
    message?: string
  ): AnalysisJob | null {
    const fields = ['progress = ?'];
    const params: any[] = [progress];

    if (message !== undefined) {
      fields.push('message = ?');
      params.push(sanitizeSensitiveText(message));
    }

    const sql = `UPDATE analysis_job
       SET ${fields.join(', ')}, updated_at = ${LOCAL_DB_NOW_SQL}
       WHERE id = ?`;

    this.db.execute(sql, [...params, id]);

    return this.findById(id);
  }

  /**
   * 标记为处理中
   */
  markProcessing(id: number): AnalysisJob | null {
    return this.updateStatus(id, 'processing');
  }

  /**
   * 标记为完成
   */
  markComplete(id: number, progress = 1.0, message?: string): AnalysisJob | null {
    const fields = ['progress = ?', 'status = ?', `completed_at = ${LOCAL_DB_NOW_SQL}`, `updated_at = ${LOCAL_DB_NOW_SQL}`];
    const params: any[] = [progress, 'completed'];

    if (message !== undefined) {
      fields.push('message = ?');
      params.push(sanitizeSensitiveText(message));
    }

    const sql = `UPDATE analysis_job
       SET ${fields.join(', ')}
       WHERE id = ?`;

    this.db.execute(sql, [...params, id]);

    return this.findById(id);
  }

  /**
   * 标记为失败
   */
  markFailed(id: number, errorMessage: string): AnalysisJob | null {
    const sql = `UPDATE analysis_job
       SET status = 'failed',
           error_message = ?,
           failed_at = ${LOCAL_DB_NOW_SQL},
           updated_at = ${LOCAL_DB_NOW_SQL}
       WHERE id = ?`;

    this.db.execute(sql, [sanitizeSensitiveText(errorMessage), id]);

    return this.findById(id);
  }

  /**
   * 删除作业
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM analysis_job WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 根据分析 ID 删除所有作业
   */
  deleteByAnalysisId(analysisId: number): number {
    const result = this.db.execute(
      'DELETE FROM analysis_job WHERE analysis_id = ?',
      [analysisId]
    );

    return result.changes;
  }

  /**
   * 统计作业数量
   */
  count(): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM analysis_job'
    );
    return result?.count ?? 0;
  }

  /**
   * 根据状态统计
   */
  countByStatus(status: JobStatus): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM analysis_job WHERE status = ?',
      [status]
    );
    return result?.count ?? 0;
  }
}

// 单例实例
let analysisJobModelInstance: AnalysisJobModel | null = null;

export function getAnalysisJobModel(): AnalysisJobModel {
  if (!analysisJobModelInstance) {
    analysisJobModelInstance = new AnalysisJobModel();
  }
  return analysisJobModelInstance;
}
