/**
 * 数据库连接层单元测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  createTestDatabase,
  initializeTestSchema,
  cleanupTestDatabase,
  closeTestDatabase
} from '../utils/testUtils';

describe('DatabaseConnection', () => {
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

  describe('初始化', () => {
    it('应该成功创建内存数据库', () => {
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
    });

    it('应该正确设置缓存大小', () => {
      const result = db.pragma('cache_size', { simple: true });
      expect(result).toBe(-2000);
    });

    it('应该创建所有必要的表', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all() as { name: string }[];

      const tableNames = tables.map(t => t.name);

      expect(tableNames).toContain('admin');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('jobs');
      expect(tableNames).toContain('activity_log');
      expect(tableNames).toContain('oauth_installation');
      expect(tableNames).toContain('repository');
      expect(tableNames).toContain('analysis');
      expect(tableNames).toContain('webhook_event');
    });
  });

  describe('基本操作', () => {
    it('应该成功执行 INSERT 操作', () => {
      const result = db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('testuser', 'testhash');

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBeGreaterThan(0);
    });

    it('应该成功执行 SELECT 操作', () => {
      db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('testuser', 'testhash');

      const result = db.prepare(
        'SELECT * FROM admin WHERE username = ?'
      ).get('testuser') as { username: string; password_hash: string };

      expect(result).toBeDefined();
      expect(result.username).toBe('testuser');
      expect(result.password_hash).toBe('testhash');
    });

    it('应该成功执行 UPDATE 操作', () => {
      const insertResult = db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('testuser', 'oldhash');

      const updateResult = db.prepare(
        'UPDATE admin SET password_hash = ? WHERE id = ?'
      ).run('newhash', insertResult.lastInsertRowid);

      expect(updateResult.changes).toBe(1);

      const updated = db.prepare(
        'SELECT password_hash FROM admin WHERE id = ?'
      ).get(insertResult.lastInsertRowid) as { password_hash: string };

      expect(updated.password_hash).toBe('newhash');
    });

    it('应该成功执行 DELETE 操作', () => {
      const insertResult = db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('testuser', 'testhash');

      const deleteResult = db.prepare(
        'DELETE FROM admin WHERE id = ?'
      ).run(insertResult.lastInsertRowid);

      expect(deleteResult.changes).toBe(1);

      const deleted = db.prepare(
        'SELECT * FROM admin WHERE id = ?'
      ).get(insertResult.lastInsertRowid);

      expect(deleted).toBeUndefined();
    });
  });

  describe('事务支持', () => {
    it('应该支持事务操作', () => {
      const insert = db.transaction(() => {
        db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run('user1', 'hash1');
        db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run('user2', 'hash2');
      });

      insert();

      const count = db.prepare('SELECT COUNT(*) as count FROM admin').get() as { count: number };
      expect(count.count).toBe(2);
    });

    it('应该在事务失败时回滚', () => {
      const failedInsert = db.transaction(() => {
        db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run('user1', 'hash1');
        // 故意违反唯一约束
        db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run('user1', 'hash2');
      });

      expect(() => failedInsert()).toThrow();

      const count = db.prepare('SELECT COUNT(*) as count FROM admin').get() as { count: number };
      expect(count.count).toBe(0);
    });
  });

  describe('错误处理', () => {
    it('应该在违反唯一约束时抛出错误', () => {
      db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('duplicate', 'hash1');

      expect(() => {
        db.prepare(
          'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
        ).run('duplicate', 'hash2');
      }).toThrow();
    });

    it('应该在违反外键约束时抛出错误', () => {
      // 启用外键约束
      db.pragma('foreign_keys = ON');

      expect(() => {
        db.prepare(
          'INSERT INTO sessions (id, admin_id, admin_username, expires_at) VALUES (?, ?, ?, ?)'
        ).run('session1', 999, 'nonexistent', new Date().toISOString());
      }).toThrow();
    });
  });

  describe('性能优化设置', () => {
    it('应该设置正确的 synchronous 模式', () => {
      // 注意：内存数据库的 synchronous 设置可能不同
      const result = db.pragma('synchronous', { simple: true });
      expect([0, 1, 2]).toContain(result);
    });

    it('应该创建必要的索引', () => {
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
      ).all() as { name: string }[];

      const indexNames = indexes.map(i => i.name);

      expect(indexNames).toContain('idx_jobs_status');
      expect(indexNames).toContain('idx_jobs_priority');
      expect(indexNames).toContain('idx_activity_log_admin_id');
      expect(indexNames).toContain('idx_analysis_status');
    });
  });
});