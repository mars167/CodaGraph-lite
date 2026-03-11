/**
 * Analysis 数据模型
 *
 * 提供分析记录的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import { sanitizeSensitiveText } from '../utils/redactSensitive';
import { LOCAL_DB_NOW_SQL } from '../utils/time';
import type {
  Analysis,
  CreateAnalysisDTO,
  UpdateAnalysisDTO,
  AnalysisStatus,
  PaginationParams,
  PaginatedResult,
  Platform,
} from './types';

export class AnalysisModel {
  private db = getConnection();

  /**
   * 根据 ID 查找分析
   */
  findById(id: number): Analysis | null {
    const result = this.db.get<Analysis>(
      'SELECT * FROM analysis WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 根据 PR 查找分析
   */
  findByPR(
    platform: Platform,
    owner: string,
    repoName: string,
    prNumber: number
  ): Analysis | null {
    const result = this.db.get<Analysis>(
      `SELECT * FROM analysis
       WHERE platform = ? AND owner = ? AND repo_name = ? AND pr_number = ?
       ORDER BY id DESC
       LIMIT 1`,
      [platform, owner, repoName, prNumber]
    );
    return result || null;
  }

  /**
   * 获取指定仓库的分析历史
   */
  findByRepository(
    platform: Platform,
    owner: string,
    repoName: string,
    params: PaginationParams = {}
  ): Analysis[] {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const offset = params.offset ?? (page - 1) * limit;
    const sortBy = params.sortBy ?? 'created_at';
    const sortOrder = params.sortOrder ?? 'DESC';

    return this.db.all<Analysis>(
      `SELECT * FROM analysis
       WHERE platform = ? AND owner = ? AND repo_name = ?
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [platform, owner, repoName, limit, offset]
    );
  }

  /**
   * 根据状态获取分析
   */
  findByStatus(status: AnalysisStatus, limit = 50): Analysis[] {
    return this.db.all<Analysis>(
      `SELECT * FROM analysis
       WHERE status = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [status, limit]
    );
  }

  /**
   * 获取待处理的分析
   */
  findPending(limit = 10): Analysis[] {
    return this.findByStatus('pending', limit);
  }

  /**
   * 获取正在处理的分析
   */
  findProcessing(): Analysis[] {
    return this.findByStatus('processing');
  }

  /**
   * 获取所有分析
   */
  findAll(params: PaginationParams = {}): Analysis[] {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const offset = params.offset ?? (page - 1) * limit;
    const sortBy = params.sortBy ?? 'created_at';
    const sortOrder = params.sortOrder ?? 'DESC';

    return this.db.all<Analysis>(
      `SELECT * FROM analysis
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  /**
   * 分页查询分析
   */
  paginate(params: PaginationParams = {}): PaginatedResult<Analysis> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const sortBy = params.sortBy ?? 'created_at';
    const sortOrder = params.sortOrder ?? 'DESC';
    const offset = (page - 1) * limit;

    // 获取总数
    const totalResult = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM analysis'
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
   * 创建分析记录
   */
  create(dto: CreateAnalysisDTO): Analysis {
    const result = this.db.execute(
      `INSERT INTO analysis (
        platform, owner, repo_name, pr_number,
        pr_title, pr_author, base_commit, head_commit,
        status, analysis_result, comment_count, file_count, issue_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${LOCAL_DB_NOW_SQL}, ${LOCAL_DB_NOW_SQL})`,
      [
        dto.platform,
        dto.owner,
        dto.repo_name,
        dto.pr_number,
        dto.pr_title || null,
        dto.pr_author || null,
        dto.base_commit || null,
        dto.head_commit || null,
        'pending',
        '{}',
        0,
        0,
        0,
      ]
    );

    const created = this.findByPR(
      dto.platform,
      dto.owner,
      dto.repo_name,
      dto.pr_number
    );
    if (!created) {
      throw new Error('创建分析记录失败');
    }

    return created;
  }

  /**
   * 更新分析
   */
  update(
    id: number,
    updates: UpdateAnalysisDTO
  ): Analysis | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');

      // 根据状态设置时间戳
      if (updates.status === 'processing') {
        fields.push(`started_at = ${LOCAL_DB_NOW_SQL}`);
      } else if (updates.status === 'completed') {
        fields.push(`completed_at = ${LOCAL_DB_NOW_SQL}`);
      } else if (updates.status === 'failed' || updates.status === 'cancelled') {
        fields.push(`failed_at = ${LOCAL_DB_NOW_SQL}`);
      }

      params.push(updates.status);
    }

    if (updates.analysis_result !== undefined) {
      fields.push('analysis_result = ?');
      params.push(updates.analysis_result);
    }

    if (updates.comment_count !== undefined) {
      fields.push('comment_count = ?');
      params.push(updates.comment_count);
    }

    if (updates.file_count !== undefined) {
      fields.push('file_count = ?');
      params.push(updates.file_count);
    }

    if (updates.issue_count !== undefined) {
      fields.push('issue_count = ?');
      params.push(updates.issue_count);
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

    const sql = `UPDATE analysis SET ${fields.join(', ')} WHERE id = ?`;

    this.db.execute(sql, params);

    return this.findById(id);
  }

  /**
   * 标记为处理中
   */
  markProcessing(id: number): Analysis | null {
    return this.update(id, { status: 'processing' });
  }

  /**
   * 恢复为待处理状态
   */
  markPending(id: number): Analysis | null {
    this.db.execute(
      `UPDATE analysis
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
  markComplete(
    id: number,
    result?: string,
    commentCount = 0,
    fileCount = 0,
    issueCount = 0
  ): Analysis | null {
    return this.update(id, {
      status: 'completed',
      analysis_result: result,
      comment_count: commentCount,
      file_count: fileCount,
      issue_count: issueCount,
    });
  }

  /**
   * 标记为失败
   */
  markFailed(id: number, errorMessage: string): Analysis | null {
    return this.update(id, {
      status: 'failed',
      error_message: errorMessage,
    });
  }

  /**
   * 取消分析
   */
  cancel(id: number): Analysis | null {
    return this.update(id, { status: 'cancelled' });
  }

  /**
   * 删除分析
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM analysis WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 统计分析数量
   */
  count(): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM analysis'
    );
    return result?.count ?? 0;
  }

  /**
   * 根据状态统计
   */
  countByStatus(status: AnalysisStatus): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM analysis WHERE status = ?',
      [status]
    );
    return result?.count ?? 0;
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    avgDuration?: number;
  } {
    const total = this.count();

    return {
      total,
      pending: this.countByStatus('pending'),
      processing: this.countByStatus('processing'),
      completed: this.countByStatus('completed'),
      failed: this.countByStatus('failed'),
    };
  }

  /**
   * 清理旧的分析记录（超过指定天数）
   */
  deleteOlderThan(days: number): number {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = this.db.execute(
      `DELETE FROM analysis WHERE created_at < ?`,
      [cutoffDate.toISOString()]
    );

    return result.changes;
  }
}

// 单例实例
let analysisModelInstance: AnalysisModel | null = null;

export function getAnalysisModel(): AnalysisModel {
  if (!analysisModelInstance) {
    analysisModelInstance = new AnalysisModel();
  }
  return analysisModelInstance;
}
