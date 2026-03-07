/**
 * 会话管理器
 *
 * 功能：
 * - 会话创建
 * - 会话验证
 * - 会话过期清理
 * - 会话销毁
 */

/**
 * 管理员用户接口
 */
interface AdminUser {
  id: number;
  username: string;
  password_hash?: string;
}

/**
 * 会话数据结构
 */
interface Session {
  id: string;
  adminId: number;
  adminUsername: string;
  createdAt: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
}

/**
 * 活跃会话存储
 */
const activeSessions = new Map<string, Session>();

/**
 * 生成会话 ID
 */
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * 创建会话管理器
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private readonly sessionTimeoutMs = 24 * 60 * 60 * 1000; // 24 小时

  /**
   * 创建新会话
   */
  create(adminUser: AdminUser): Session {
    const sessionId = generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTimeoutMs);

    const session: Session = {
      id: sessionId,
      adminId: adminUser.id,
      adminUsername: adminUser.username,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    this.sessions.set(sessionId, session);
    activeSessions.set(sessionId, session);

    console.log(`🔑 创建会话: ${sessionId}, 用户: ${adminUser.username}`);

    return session;
  }

  /**
   * 获取会话
   */
  get(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 验证会话
   */
  validate(sessionId: string): boolean {
    // 检查会话是否存在
    if (!this.sessions.has(sessionId)) {
      return false;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // 检查会话是否过期
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    if (now > expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * 销毁会话
   */
  destroy(sessionId: string): void {
    this.sessions.delete(sessionId);
    activeSessions.delete(sessionId);

    console.log(`🗑 销毁会话: ${sessionId}`);
  }

  /**
   * 销毁所有会话
   */
  destroyAll(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    activeSessions.clear();

    console.log(`🗑 销毁所有会话: ${count} 个`);
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(): number {
    const now = new Date();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const expiresAt = new Date(session.expiresAt);
      if (now > expiresAt) {
        this.destroy(sessionId);
        expired.push(sessionId);
      }
    }

    if (expired.length > 0) {
      console.log(`🧹 清理了 ${expired.length} 个过期会话`);
    }

    return expired.length;
  }

  /**
   * 获取活动会话
   */
  getActiveSessions(): Session[] {
    return Array.from(activeSessions.values());
  }

  /**
   * 检查会话是否活跃
   */
  isActive(sessionId: string): boolean {
    return this.sessions.has(sessionId) && activeSessions.has(sessionId);
  }

  /**
   * 获取会话统计
   */
  getStats(): {
    total: number;
    active: number;
    expired: number;
  } {
    return {
      total: this.sessions.size,
      active: activeSessions.size,
      expired: 0, // 已清理
    };
  }
}

// 单例实例
let sessionManagerInstance: SessionManager | null = null;

/**
 * 获取会话管理器单例
 */
export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance;
}
