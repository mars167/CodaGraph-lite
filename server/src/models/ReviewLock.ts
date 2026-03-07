import { getConnection } from '../database/connection';
import type { Platform, ReviewLock } from './types';

type ReviewLockSource = ReviewLock['source'];

interface AcquireReviewLockInput {
  platform: Platform;
  owner: string;
  repoName: string;
  prNumber: number;
  headCommit: string;
  source: ReviewLockSource;
}

export class ReviewLockModel {
  private db = getConnection();

  findById(id: number): ReviewLock | null {
    const result = this.db.get<ReviewLock>(
      'SELECT * FROM review_lock WHERE id = ?',
      [id]
    );
    return result || null;
  }

  findActive(
    platform: Platform,
    owner: string,
    repoName: string,
    prNumber: number,
    headCommit: string
  ): ReviewLock | null {
    const result = this.db.get<ReviewLock>(
      `SELECT * FROM review_lock
       WHERE platform = ?
         AND owner = ?
         AND repo_name = ?
         AND pr_number = ?
         AND head_commit = ?
         AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [platform, owner, repoName, prNumber, headCommit]
    );
    return result || null;
  }

  acquire(input: AcquireReviewLockInput): ReviewLock | null {
    try {
      const result = this.db.execute(
        `INSERT INTO review_lock (
          platform, owner, repo_name, pr_number, head_commit, source, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
        [
          input.platform,
          input.owner,
          input.repoName,
          input.prNumber,
          input.headCommit,
          input.source,
        ]
      );

      return this.findById(Number(result.lastInsertRowid));
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('UNIQUE constraint failed')) {
        return null;
      }
      throw error;
    }
  }

  attach(id: number, updates: { analysisId?: number | null; jobId?: number | null }): ReviewLock | null {
    const fields: string[] = [];
    const params: Array<number | null> = [];

    if (updates.analysisId !== undefined) {
      fields.push('analysis_id = ?');
      params.push(updates.analysisId);
    }

    if (updates.jobId !== undefined) {
      fields.push('job_id = ?');
      params.push(updates.jobId);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.execute(
      `UPDATE review_lock
       SET ${fields.join(', ')}
       WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  release(id: number): boolean {
    const result = this.db.execute(
      `UPDATE review_lock
       SET status = 'released',
           released_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND status = 'active'`,
      [id]
    );

    return result.changes > 0;
  }

  releaseByAnalysisId(analysisId: number): number {
    const result = this.db.execute(
      `UPDATE review_lock
       SET status = 'released',
           released_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE analysis_id = ?
         AND status = 'active'`,
      [analysisId]
    );

    return result.changes;
  }
}

let reviewLockModelInstance: ReviewLockModel | null = null;

export function getReviewLockModel(): ReviewLockModel {
  if (!reviewLockModelInstance) {
    reviewLockModelInstance = new ReviewLockModel();
  }
  return reviewLockModelInstance;
}
