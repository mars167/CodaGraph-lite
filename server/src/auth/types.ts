/**
 * 认证相关类型定义
 */

/**
 * 认证请求体
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 管理员用户
 */
export interface AdminUser {
  id: number;
  username: string;
  password_hash: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_login_at?: Date | string | null;
}

/**
 * 密码更新请求
 */
export interface UpdatePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/**
 * 会话信息
 */
export interface SessionData {
  adminId: number;
  username: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * 认证响应
 */
export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  admin?: Omit<AdminUser, 'password_hash' | 'last_login_at'>;
}

/**
 * 活动日志
 */
export interface ActivityLog {
  id: number;
  admin_id: number;
  action: 'login' | 'logout' | 'password_change';
  ip_address?: string;
  user_agent?: string;
  created_at: Date | string;
}
