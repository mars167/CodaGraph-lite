import { getConnection } from '../database/connection';
import type { JobLog } from './types';

export class JobLogModel {
  private db = getConnection();

  create(jobId: number, level: JobLog['level'], message: string): JobLog {
    const result = this.db.execute(
      `INSERT INTO job_log (job_id, level, message)
       VALUES (?, ?, ?)`,
      [jobId, level, message]
    );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('创建作业日志失败');
    }

    return created;
  }

  findById(id: number): JobLog | null {
    const result = this.db.get<JobLog>('SELECT * FROM job_log WHERE id = ?', [id]);
    return result || null;
  }

  findByJobId(jobId: number, limit = 200): JobLog[] {
    return this.db.all<JobLog>(
      `SELECT * FROM job_log
       WHERE job_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [jobId, limit]
    );
  }
}

let jobLogModelInstance: JobLogModel | null = null;

export function getJobLogModel(): JobLogModel {
  if (!jobLogModelInstance) {
    jobLogModelInstance = new JobLogModel();
  }

  return jobLogModelInstance;
}
