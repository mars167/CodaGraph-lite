/**
 * Job 模型单元测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  createTestDatabase,
  initializeTestSchema,
  cleanupTestDatabase,
  closeTestDatabase
} from '../utils/testUtils';

describe('JobModel', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDatabase();
    initializeTestSchema(db);
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  beforeEach(() => {
    cleanupTestDatabase(db);
  });

  describe('作业创建', () => {
    it('应该成功创建作业', () => {
      const payload = JSON.stringify({
        platform: 'github',
        repo_name: 'test/repo',
        pr_number: '1'
      });

      const result = db.prepare(
        'INSERT INTO jobs (type, payload) VALUES (?, ?)'
      ).run('pr_analysis', payload);

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBeGreaterThan(0);
    });

    it('应该设置默认值', () => {
      const payload = JSON.stringify({ test: true });
      db.prepare(
        'INSERT INTO jobs (type, payload) VALUES (?, ?)'
      ).run('pr_analysis', payload);

      const job = db.prepare(
        'SELECT * FROM jobs WHERE type = ?'
      ).get('pr_analysis') as {
        status: string;
        priority: number;
        attempts: number;
        max_attempts: number;
      };

      expect(job.status).toBe('pending');
      expect(job.priority).toBe(5);
      expect(job.attempts).toBe(0);
      expect(job.max_attempts).toBe(3);
    });

    it('应该允许设置自定义优先级', () => {
      const payload = JSON.stringify({ test: true });
      db.prepare(
        'INSERT INTO jobs (type, payload, priority) VALUES (?, ?, ?)'
      ).run('pr_analysis', payload, 1);

      const job = db.prepare(
        'SELECT priority FROM jobs WHERE type = ?'
      ).get('pr_analysis') as { priority: number };

      expect(job.priority).toBe(1);
    });

    it('应该支持不同的作业类型', () => {
      const types = ['pr_analysis', 'context_analysis', 'code_review'];

      types.forEach((type, index) => {
        db.prepare(
          'INSERT INTO jobs (type, payload) VALUES (?, ?)'
        ).run(type, JSON.stringify({ index }));
      });

      const jobs = db.prepare(
        'SELECT type FROM jobs ORDER BY id'
      ).all() as { type: string }[];

      expect(jobs.map(j => j.type)).toEqual(types);
    });
  });

  describe('作业查询', () => {
    beforeEach(() => {
      // 创建多个作业
      for (let i = 1; i <= 5; i++) {
        db.prepare(
          'INSERT INTO jobs (type, payload, priority, status) VALUES (?, ?, ?, ?)'
        ).run('pr_analysis', JSON.stringify({ num: i }), i, i <= 2 ? 'pending' : 'completed');
      }
    });

    it('应该根据 ID 查找作业', () => {
      const result = db.prepare(
        'INSERT INTO jobs (type, payload) VALUES (?, ?)'
      ).run('test_job', JSON.stringify({}));

      const job = db.prepare(
        'SELECT * FROM jobs WHERE id = ?'
      ).get(result.lastInsertRowid) as { type: string };

      expect(job.type).toBe('test_job');
    });

    it('应该按优先级获取下一个待处理作业', () => {
      const job = db.prepare(
        `SELECT * FROM jobs
         WHERE status = 'pending'
         ORDER BY priority ASC, created_at ASC
         LIMIT 1`
      ).get() as { priority: number; status: string };

      expect(job).toBeDefined();
      expect(job.status).toBe('pending');
      expect(job.priority).toBe(1); // 最高优先级
    });

    it('应该获取所有待处理作业', () => {
      const jobs = db.prepare(
        `SELECT * FROM jobs WHERE status = 'pending' ORDER BY priority ASC`
      ).all() as { id: number }[];

      expect(jobs).toHaveLength(2);
    });

    it('应该支持分页查询', () => {
      const page = 1;
      const limit = 3;
      const offset = (page - 1) * limit;

      const jobs = db.prepare(
        'SELECT * FROM jobs ORDER BY id LIMIT ? OFFSET ?'
      ).all(limit, offset) as { id: number }[];

      expect(jobs).toHaveLength(3);
    });
  });

  describe('状态转换', () => {
    let jobId: number;

    beforeEach(() => {
      const result = db.prepare(
        'INSERT INTO jobs (type, payload) VALUES (?, ?)'
      ).run('pr_analysis', JSON.stringify({}));
      jobId = result.lastInsertRowid as number;
    });

    it('应该从 pending 转换到 processing', () => {
      db.prepare(
        `UPDATE jobs SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(jobId);

      const job = db.prepare(
        'SELECT status, started_at FROM jobs WHERE id = ?'
      ).get(jobId) as { status: string; started_at: string };

      expect(job.status).toBe('processing');
      expect(job.started_at).toBeDefined();
    });

    it('应该从 processing 转换到 completed', () => {
      db.prepare(
        `UPDATE jobs SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(jobId);

      db.prepare(
        `UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(jobId);

      const job = db.prepare(
        'SELECT status, completed_at FROM jobs WHERE id = ?'
      ).get(jobId) as { status: string; completed_at: string };

      expect(job.status).toBe('completed');
      expect(job.completed_at).toBeDefined();
    });

    it('应该从 processing 转换到 failed 并记录错误', () => {
      db.prepare(
        `UPDATE jobs SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(jobId);

      db.prepare(
        `UPDATE jobs SET status = 'failed', error_message = ?, failed_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(jobId, 'Test error message');

      const job = db.prepare(
        'SELECT status, error_message, failed_at FROM jobs WHERE id = ?'
      ).get(jobId) as { status: string; error_message: string; failed_at: string };

      expect(job.status).toBe('failed');
      expect(job.error_message).toBe('Test error message');
      expect(job.failed_at).toBeDefined();
    });

    it('应该在失败时递增尝试次数', () => {
      // 第一次失败
      db.prepare(
        `UPDATE jobs SET status = 'failed', attempts = attempts + 1, failed_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(jobId);

      let job = db.prepare(
        'SELECT attempts FROM jobs WHERE id = ?'
      ).get(jobId) as { attempts: number };
      expect(job.attempts).toBe(1);

      // 重置并再次失败
      db.prepare(
        `UPDATE jobs SET status = 'pending', attempts = attempts + 1 WHERE id = ?`
      ).run(jobId);

      job = db.prepare(
        'SELECT attempts FROM jobs WHERE id = ?'
      ).get(jobId) as { attempts: number };
      expect(job.attempts).toBe(2);
    });
  });

  describe('重试机制', () => {
    it('应该检查是否可以重试', () => {
      const result = db.prepare(
        'INSERT INTO jobs (type, payload, attempts, max_attempts) VALUES (?, ?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 2, 3);
      const jobId = result.lastInsertRowid as number;

      const job = db.prepare(
        'SELECT attempts, max_attempts FROM jobs WHERE id = ?'
      ).get(jobId) as { attempts: number; max_attempts: number };

      expect(job.attempts).toBeLessThan(job.max_attempts);
    });

    it('应该在达到最大尝试次数后标记为 dead', () => {
      const result = db.prepare(
        'INSERT INTO jobs (type, payload, attempts, max_attempts, status) VALUES (?, ?, ?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 3, 3, 'failed');
      const jobId = result.lastInsertRowid as number;

      // 标记为 dead
      db.prepare(
        `UPDATE jobs SET status = 'dead', failed_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(jobId);

      const job = db.prepare(
        'SELECT status FROM jobs WHERE id = ?'
      ).get(jobId) as { status: string };

      expect(job.status).toBe('dead');
    });
  });

  describe('死信队列', () => {
    beforeEach(() => {
      // 创建一些 dead 状态的作业
      db.prepare(
        'INSERT INTO jobs (type, payload, status, attempts, max_attempts) VALUES (?, ?, ?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'dead', 3, 3);
    });

    it('应该能够查询死信队列', () => {
      const deadJobs = db.prepare(
        `SELECT * FROM jobs WHERE status = 'dead'`
      ).all() as { id: number }[];

      expect(deadJobs).toHaveLength(1);
    });

    it('应该能够重新排队死信作业', () => {
      const job = db.prepare(
        `SELECT id FROM jobs WHERE status = 'dead'`
      ).get() as { id: number };

      db.prepare(
        `UPDATE jobs SET status = 'pending', attempts = 0 WHERE id = ?`
      ).run(job.id);

      const updated = db.prepare(
        'SELECT status, attempts FROM jobs WHERE id = ?'
      ).get(job.id) as { status: string; attempts: number };

      expect(updated.status).toBe('pending');
      expect(updated.attempts).toBe(0);
    });
  });

  describe('作业取消', () => {
    let jobId: number;

    beforeEach(() => {
      const result = db.prepare(
        'INSERT INTO jobs (type, payload) VALUES (?, ?)'
      ).run('pr_analysis', JSON.stringify({}));
      jobId = result.lastInsertRowid as number;
    });

    it('应该能够取消 pending 状态的作业', () => {
      db.prepare(
        `UPDATE jobs SET status = 'cancelled' WHERE id = ? AND status = 'pending'`
      ).run(jobId);

      const job = db.prepare(
        'SELECT status FROM jobs WHERE id = ?'
      ).get(jobId) as { status: string };

      expect(job.status).toBe('cancelled');
    });

    it('不应该能够取消 processing 状态的作业', () => {
      db.prepare(
        `UPDATE jobs SET status = 'processing' WHERE id = ?`
      ).run(jobId);

      const result = db.prepare(
        `UPDATE jobs SET status = 'cancelled' WHERE id = ? AND status = 'pending'`
      ).run(jobId);

      expect(result.changes).toBe(0);

      const job = db.prepare(
        'SELECT status FROM jobs WHERE id = ?'
      ).get(jobId) as { status: string };

      expect(job.status).toBe('processing');
    });
  });

  describe('统计信息', () => {
    beforeEach(() => {
      // 创建不同状态的作业
      db.prepare(
        'INSERT INTO jobs (type, payload, status) VALUES (?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'pending');
      db.prepare(
        'INSERT INTO jobs (type, payload, status) VALUES (?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'pending');
      db.prepare(
        'INSERT INTO jobs (type, payload, status) VALUES (?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'processing');
      db.prepare(
        'INSERT INTO jobs (type, payload, status) VALUES (?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'completed');
      db.prepare(
        'INSERT INTO jobs (type, payload, status) VALUES (?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'completed');
      db.prepare(
        'INSERT INTO jobs (type, payload, status) VALUES (?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'failed');
    });

    it('应该正确统计各状态作业数量', () => {
      const stats = {
        total: db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number },
        pending: db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'").get() as { count: number },
        processing: db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'processing'").get() as { count: number },
        completed: db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'completed'").get() as { count: number },
        failed: db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'failed'").get() as { count: number },
      };

      expect(stats.total.count).toBe(6);
      expect(stats.pending.count).toBe(2);
      expect(stats.processing.count).toBe(1);
      expect(stats.completed.count).toBe(2);
      expect(stats.failed.count).toBe(1);
    });
  });

  describe('清理操作', () => {
    beforeEach(() => {
      // 创建一些已完成的旧作业
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 天前
      db.prepare(
        'INSERT INTO jobs (type, payload, status, created_at) VALUES (?, ?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'completed', oldDate);
      db.prepare(
        'INSERT INTO jobs (type, payload, status) VALUES (?, ?, ?)'
      ).run('pr_analysis', JSON.stringify({}), 'completed');
    });

    it('应该能够清理旧的已完成作业', () => {
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 天前

      const result = db.prepare(
        `DELETE FROM jobs WHERE status IN ('completed', 'dead') AND created_at < ?`
      ).run(cutoffDate);

      expect(result.changes).toBe(1); // 只删除了旧的那个

      const remaining = db.prepare(
        'SELECT COUNT(*) as count FROM jobs'
      ).get() as { count: number };

      expect(remaining.count).toBe(1);
    });
  });
});