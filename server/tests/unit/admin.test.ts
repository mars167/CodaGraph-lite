/**
 * Admin 模型单元测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  createTestDatabase,
  initializeTestSchema,
  cleanupTestDatabase,
  closeTestDatabase,
  hashPassword
} from '../utils/testUtils';

describe('AdminModel', () => {
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

  describe('创建管理员', () => {
    it('应该成功创建管理员账户', () => {
      const passwordHash = hashPassword('password123');
      const result = db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin', passwordHash);

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBeGreaterThan(0);
    });

    it('应该拒绝重复的用户名', () => {
      const passwordHash = hashPassword('password123');
      db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin', passwordHash);

      expect(() => {
        db.prepare(
          'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
        ).run('admin', passwordHash);
      }).toThrow(/UNIQUE constraint failed/);
    });

    it('应该自动设置创建和更新时间', () => {
      const passwordHash = hashPassword('password123');
      db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin', passwordHash);

      const admin = db.prepare(
        'SELECT created_at, updated_at FROM admin WHERE username = ?'
      ).get('admin') as { created_at: string; updated_at: string };

      expect(admin.created_at).toBeDefined();
      expect(admin.updated_at).toBeDefined();
      expect(new Date(admin.created_at).getTime()).not.toBeNaN();
    });
  });

  describe('密码验证', () => {
    beforeEach(() => {
      const passwordHash = hashPassword('correct_password');
      db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin', passwordHash);
    });

    it('应该验证正确的密码', () => {
      const admin = db.prepare(
        'SELECT password_hash FROM admin WHERE username = ?'
      ).get('admin') as { password_hash: string };

      const inputHash = hashPassword('correct_password');
      expect(admin.password_hash).toBe(inputHash);
    });

    it('应该拒绝错误的密码', () => {
      const admin = db.prepare(
        'SELECT password_hash FROM admin WHERE username = ?'
      ).get('admin') as { password_hash: string };

      const wrongHash = hashPassword('wrong_password');
      expect(admin.password_hash).not.toBe(wrongHash);
    });

    it('应该为不同密码生成不同的哈希值', () => {
      const hash1 = hashPassword('password1');
      const hash2 = hashPassword('password2');

      expect(hash1).not.toBe(hash2);
    });

    it('应该为相同密码生成相同的哈希值', () => {
      const hash1 = hashPassword('same_password');
      const hash2 = hashPassword('same_password');

      expect(hash1).toBe(hash2);
    });
  });

  describe('查询操作', () => {
    beforeEach(() => {
      const passwordHash = hashPassword('password');
      db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin', passwordHash);
    });

    it('应该根据用户名查找管理员', () => {
      const admin = db.prepare(
        'SELECT * FROM admin WHERE username = ?'
      ).get('admin') as { id: number; username: string };

      expect(admin).toBeDefined();
      expect(admin.username).toBe('admin');
    });

    it('应该根据 ID 查找管理员', () => {
      const inserted = db.prepare(
        'SELECT id FROM admin WHERE username = ?'
      ).get('admin') as { id: number };

      const admin = db.prepare(
        'SELECT * FROM admin WHERE id = ?'
      ).get(inserted.id) as { id: number; username: string };

      expect(admin).toBeDefined();
      expect(admin.id).toBe(inserted.id);
    });

    it('应该在找不到管理员时返回 undefined', () => {
      const admin = db.prepare(
        'SELECT * FROM admin WHERE username = ?'
      ).get('nonexistent');

      expect(admin).toBeUndefined();
    });
  });

  describe('更新操作', () => {
    let adminId: number;

    beforeEach(() => {
      const passwordHash = hashPassword('old_password');
      const result = db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin', passwordHash);
      adminId = result.lastInsertRowid as number;
    });

    it('应该成功更新密码', () => {
      const newPasswordHash = hashPassword('new_password');
      db.prepare(
        'UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(newPasswordHash, adminId);

      const admin = db.prepare(
        'SELECT password_hash FROM admin WHERE id = ?'
      ).get(adminId) as { password_hash: string };

      expect(admin.password_hash).toBe(newPasswordHash);
    });

    it('应该成功更新最后登录时间', () => {
      db.prepare(
        'UPDATE admin SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(adminId);

      const admin = db.prepare(
        'SELECT last_login_at FROM admin WHERE id = ?'
      ).get(adminId) as { last_login_at: string };

      expect(admin.last_login_at).toBeDefined();
      expect(new Date(admin.last_login_at).getTime()).not.toBeNaN();
    });
  });

  describe('删除操作', () => {
    let adminId: number;

    beforeEach(() => {
      const passwordHash = hashPassword('password');
      const result = db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin', passwordHash);
      adminId = result.lastInsertRowid as number;
    });

    it('应该成功删除管理员', () => {
      const result = db.prepare(
        'DELETE FROM admin WHERE id = ?'
      ).run(adminId);

      expect(result.changes).toBe(1);

      const admin = db.prepare(
        'SELECT * FROM admin WHERE id = ?'
      ).get(adminId);

      expect(admin).toBeUndefined();
    });
  });

  describe('统计操作', () => {
    beforeEach(() => {
      const passwordHash = hashPassword('password');
      db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin1', passwordHash);
      db.prepare(
        'INSERT INTO admin (username, password_hash) VALUES (?, ?)'
      ).run('admin2', passwordHash);
    });

    it('应该正确统计管理员数量', () => {
      const result = db.prepare(
        'SELECT COUNT(*) as count FROM admin'
      ).get() as { count: number };

      expect(result.count).toBe(2);
    });

    it('应该检查用户名是否存在', () => {
      const existing = db.prepare(
        'SELECT COUNT(*) as count FROM admin WHERE username = ?'
      ).get('admin1') as { count: number };

      const nonExisting = db.prepare(
        'SELECT COUNT(*) as count FROM admin WHERE username = ?'
      ).get('nonexistent') as { count: number };

      expect(existing.count).toBe(1);
      expect(nonExisting.count).toBe(0);
    });
  });
});