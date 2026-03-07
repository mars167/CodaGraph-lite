/**
 * Admin 数据模型
 *
 * 提供管理员账户的 CRUD 操作
 */

import { getConnection } from '../database/index';
import type {
  Admin,
  CreateAdminDTO,
  UpdateAdminDTO,
} from './types';
import crypto from 'crypto';

export class AdminModel {
  private db = getConnection();

  /**
   * 根据用户名查找管理员
   */
  findByUsername(username: string): Admin | null {
    const result = this.db.get<Admin>(
      'SELECT * FROM admin WHERE username = ?',
      [username]
    );
    return result || null;
  }

  /**
   * 根据 ID 查找管理员
   */
  findById(id: number): Admin | null {
    const result = this.db.get<Admin>(
      'SELECT * FROM admin WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 获取所有管理员
   */
  findAll(): Admin[] {
    return this.db.all<Admin>('SELECT * FROM admin ORDER BY id ASC');
  }

  /**
   * 创建管理员
   */
  create(dto: CreateAdminDTO): Admin {
    const passwordHash = crypto
      .createHash('sha256')
      .update(dto.password)
      .digest('hex');

    this.db.execute(
      `INSERT INTO admin (username, password_hash) VALUES (?, ?)`,
      [dto.username, passwordHash]
    );

    const created = this.findByUsername(dto.username);
    if (!created) {
      throw new Error('创建管理员失败');
    }

    return created;
  }

  /**
   * 更新管理员信息
   */
  update(id: number, dto: UpdateAdminDTO): Admin | null {
    const updates: string[] = [];
    const params: any[] = [];

    if (dto.username !== undefined) {
      updates.push('username = ?');
      params.push(dto.username);
    }

    if (dto.password !== undefined) {
      const passwordHash = crypto
        .createHash('sha256')
        .update(dto.password)
        .digest('hex');
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE admin SET ${updates.join(', ')} WHERE id = ?`;

    this.db.execute(sql, params);

    return this.findById(id);
  }

  /**
   * 验证密码
   */
  verifyPassword(username: string, password: string): boolean {
    const admin = this.findByUsername(username);
    if (!admin) {
      return false;
    }

    const passwordHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');

    return admin.password_hash === passwordHash;
  }

  /**
   * 更新最后登录时间
   */
  updateLastLogin(id: number): boolean {
    const result = this.db.execute(
      'UPDATE admin SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 删除管理员
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM admin WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 检查用户名是否已存在
   */
  existsByUsername(username: string): boolean {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM admin WHERE username = ?',
      [username]
    );
    return (result?.count ?? 0) > 0;
  }

  /**
   * 统计管理员数量
   */
  count(): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM admin'
    );
    return result?.count ?? 0;
  }
}

// 单例实例
let adminModelInstance: AdminModel | null = null;

export function getAdminModel(): AdminModel {
  if (!adminModelInstance) {
    adminModelInstance = new AdminModel();
  }
  return adminModelInstance;
}
