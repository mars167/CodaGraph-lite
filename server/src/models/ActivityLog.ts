/**
 * ActivityLog 数据模型
 *
 * 提供管理员活动日志的 CRUD 操作
 */

import { getConnection } from '../database/index';
import type { ActivityLog, CreateActivityLogDTO } from './types';

export class ActivityLogModel {
  private db = getConnection();

  /**
   * 创建活动日志
   */
  create(dto: CreateActivityLogDTO): ActivityLog {
    this.db.execute(
      `INSERT INTO activity_log (admin_id, action, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?)`,
      [dto.admin_id, dto.action, dto.ip_address || null, dto.user_agent || null, dto.details || null]
    );

    const row = this.db.get<{ id: number | null }>('SELECT last_insert_rowid() as id');
    const insertId = row?.id;
    if (!insertId) {
      throw new Error('创建活动日志失败');
    }
    const log = this.findById(insertId);
    if (!log) {
      throw new Error('创建活动日志失败');
    }
    return log;
  }

  /**
   * 根据 ID 查找活动日志
   */
  findById(id: number): ActivityLog | null {
    const result = this.db.get<ActivityLog>(
      'SELECT * FROM activity_log WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 获取管理员的所有活动日志
   */
  findByAdminId(adminId: number, limit = 50): ActivityLog[] {
    return this.db.all<ActivityLog>(
      'SELECT * FROM activity_log WHERE admin_id = ? ORDER BY created_at DESC LIMIT ?',
      [adminId, limit]
    );
  }

  /**
   * 按动作类型获取活动日志
   */
  findByAction(action: 'login' | 'logout' | 'password_change' | 'failed_login', limit = 50): ActivityLog[] {
    return this.db.all<ActivityLog>(
      'SELECT * FROM activity_log WHERE action = ? ORDER BY created_at DESC LIMIT ?',
      [action, limit]
    );
  }

  /**
   * 获取所有活动日志
   */
  findAll(limit = 100): ActivityLog[] {
    return this.db.all<ActivityLog>(
      'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }

  /**
   * 记录登录活动
   */
  logLogin(adminId: number, ipAddress?: string, userAgent?: string): ActivityLog {
    return this.create({
      admin_id: adminId,
      action: 'login',
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  /**
   * 记录登出活动
   */
  logLogout(adminId: number, ipAddress?: string, userAgent?: string): ActivityLog {
    return this.create({
      admin_id: adminId,
      action: 'logout',
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  /**
   * 记录密码更改活动
   */
  logPasswordChange(adminId: number, ipAddress?: string, userAgent?: string): ActivityLog {
    return this.create({
      admin_id: adminId,
      action: 'password_change',
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  /**
   * 记录失败登录尝试
   */
  logFailedLogin(adminId: number, username: string, ipAddress?: string, userAgent?: string): ActivityLog {
    return this.create({
      admin_id: adminId,
      action: 'failed_login',
      ip_address: ipAddress,
      user_agent: userAgent,
      details: `尝试登录用户名：${username}`,
    });
  }

  /**
   * 删除活动日志
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM activity_log WHERE id = ?',
      [id]
    );
    return result.changes > 0;
  }

  /**
   * 清理指定天数前的活动日志
   */
  cleanupOlderThan(days: number): number {
    const result = this.db.execute(
      `DELETE FROM activity_log WHERE created_at < datetime('now', '-${days} days')`,
    );
    return result.changes;
  }
}

// 单例实例
let activityLogModelInstance: ActivityLogModel | null = null;

export function getActivityLogModel(): ActivityLogModel {
  if (!activityLogModelInstance) {
    activityLogModelInstance = new ActivityLogModel();
  }
  return activityLogModelInstance;
}
