/**
 * 会话管理器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SessionManager } from '../../src/auth/SessionManager';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    // 创建新的 SessionManager 实例
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    // 清理所有会话
    sessionManager.destroyAll();
  });

  describe('会话创建', () => {
    it('应该成功创建会话', () => {
      const adminUser = {
        id: 1,
        username: 'admin',
      };

      const session = sessionManager.create(adminUser);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^sess_/);
      expect(session.adminId).toBe(1);
      expect(session.adminUsername).toBe('admin');
    });

    it('应该设置正确的过期时间（24小时）', () => {
      const adminUser = { id: 1, username: 'admin' };
      const beforeCreate = Date.now();

      const session = sessionManager.create(adminUser);

      const expiresAt = new Date(session.expiresAt).getTime();
      const expectedExpiry = beforeCreate + 24 * 60 * 60 * 1000;

      // 允许 1 秒误差
      expect(expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
    });

    it('应该为每次创建生成唯一的会话 ID', () => {
      const adminUser = { id: 1, username: 'admin' };

      const session1 = sessionManager.create(adminUser);
      const session2 = sessionManager.create(adminUser);

      expect(session1.id).not.toBe(session2.id);
    });

    it('应该记录会话创建时间', () => {
      const adminUser = { id: 1, username: 'admin' };
      const beforeCreate = new Date();

      const session = sessionManager.create(adminUser);

      const createdAt = new Date(session.createdAt);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000);
    });
  });

  describe('会话获取', () => {
    it('应该能够获取已创建的会话', () => {
      const adminUser = { id: 1, username: 'admin' };
      const created = sessionManager.create(adminUser);

      const session = sessionManager.get(created.id);

      expect(session).toBeDefined();
      expect(session?.id).toBe(created.id);
      expect(session?.adminUsername).toBe('admin');
    });

    it('应该在会话不存在时返回 null', () => {
      const session = sessionManager.get('nonexistent_session_id');
      expect(session).toBeNull();
    });
  });

  describe('会话验证', () => {
    it('应该验证有效的会话', () => {
      const adminUser = { id: 1, username: 'admin' };
      const session = sessionManager.create(adminUser);

      const isValid = sessionManager.validate(session.id);

      expect(isValid).toBe(true);
    });

    it('应该拒绝无效的会话 ID', () => {
      const isValid = sessionManager.validate('invalid_session_id');
      expect(isValid).toBe(false);
    });

    it('应该拒绝已过期的会话', () => {
      const adminUser = { id: 1, username: 'admin' };
      const session = sessionManager.create(adminUser);

      // 手动修改过期时间为过去
      const expiredSession = sessionManager.get(session.id);
      if (expiredSession) {
        expiredSession.expiresAt = new Date(Date.now() - 1000).toISOString();
      }

      const isValid = sessionManager.validate(session.id);
      expect(isValid).toBe(false);
    });
  });

  describe('会话销毁', () => {
    it('应该成功销毁会话', () => {
      const adminUser = { id: 1, username: 'admin' };
      const session = sessionManager.create(adminUser);

      sessionManager.destroy(session.id);

      const destroyedSession = sessionManager.get(session.id);
      expect(destroyedSession).toBeNull();
    });

    it('销毁不存在的会话不应该抛出错误', () => {
      expect(() => {
        sessionManager.destroy('nonexistent_session_id');
      }).not.toThrow();
    });

    it('应该能够销毁所有会话', () => {
      const adminUser = { id: 1, username: 'admin' };
      sessionManager.create(adminUser);
      sessionManager.create(adminUser);
      sessionManager.create(adminUser);

      sessionManager.destroyAll();

      const sessions = sessionManager.getActiveSessions();
      expect(sessions).toHaveLength(0);
    });
  });

  describe('过期会话清理', () => {
    it('应该清理已过期的会话', () => {
      const adminUser = { id: 1, username: 'admin' };

      // 创建一个会话
      const session = sessionManager.create(adminUser);

      // 手动设置过期
      const sessionData = sessionManager.get(session.id);
      if (sessionData) {
        sessionData.expiresAt = new Date(Date.now() - 1000).toISOString();
      }

      const cleanedCount = sessionManager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(1);
      expect(sessionManager.get(session.id)).toBeNull();
    });

    it('不应该清理未过期的会话', () => {
      const adminUser = { id: 1, username: 'admin' };
      sessionManager.create(adminUser);

      const cleanedCount = sessionManager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(0);
      expect(sessionManager.getActiveSessions()).toHaveLength(1);
    });
  });

  describe('会话状态检查', () => {
    it('应该正确报告会话是否活跃', () => {
      const adminUser = { id: 1, username: 'admin' };
      const session = sessionManager.create(adminUser);

      expect(sessionManager.isActive(session.id)).toBe(true);

      sessionManager.destroy(session.id);

      expect(sessionManager.isActive(session.id)).toBe(false);
    });
  });

  describe('会话统计', () => {
    it('应该返回正确的会话统计信息', () => {
      const adminUser = { id: 1, username: 'admin' };

      // 创建多个会话
      sessionManager.create(adminUser);
      sessionManager.create(adminUser);
      sessionManager.create(adminUser);

      const stats = sessionManager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(3);
    });
  });

  describe('并发安全', () => {
    it('应该处理并发创建会话', async () => {
      const adminUser = { id: 1, username: 'admin' };
      const promises: Promise<void>[] = [];

      // 并发创建 10 个会话
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise(resolve => {
            const session = sessionManager.create(adminUser);
            expect(session).toBeDefined();
            resolve();
          })
        );
      }

      await Promise.all(promises);

      const sessions = sessionManager.getActiveSessions();
      expect(sessions).toHaveLength(10);

      // 验证所有会话 ID 唯一
      const ids = sessions.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });
  });
});