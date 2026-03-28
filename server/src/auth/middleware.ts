/**
 * 认证中间件
 *
 * 功能：
 * - 会话验证
 * - 检查会话过期
 * - 禁止未登录用户访问受保护路由
 * - 支持免登录模式 (NO_LOGIN_MODE)
 */

import { Request, Response, NextFunction } from 'express';
import { getSessionManager } from './SessionManager';
import { getAdminModel } from '../models/Admin';
import { getSystemSettingsService } from '../services/SystemSettingsService';

/**
 * 检查是否处于免登录模式
 */
function isNoLoginMode(): boolean {
  try {
    return getSystemSettingsService().getSettings().noLoginMode;
  } catch {
    return false;
  }
}

/**
 * 注入免登录虚拟会话
 */
function injectNoLoginSession(req: Request): void {
  const adminModel = getAdminModel();
  const admin = adminModel.findAll()[0];
  if (admin) {
    const fakeSession = {
      id: 'no-login-session',
      adminId: admin.id,
      adminUsername: admin.username,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    (req as any).session = fakeSession;
    (req as any).sessionData = fakeSession;
  }
}

/**
 * 检查会话是否有效的中间件
 */
export function validateSession(
  req: Request,
  res: Response,
  next: NextFunction
): void | Response {
  const sessionId = req.cookies?.session_id;

  if (!sessionId) {
    // 没有会话，继续
    return next();
  }

  // 在 req 中注入会话信息供后续中间件使用
  const manager = getSessionManager();
  const session = manager.get(sessionId);

  if (!session) {
    // 会话无效
    return res.status(401).json({
      error: '会话无效',
    });
  }

  // 检查会话是否过期
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  if (now > expiresAt) {
    return res.status(401).json({
      error: '会话已过期',
    });
  }

  // 注入会话到 req
  (req as any).session = session;
  (req as any).sessionData = session;

  console.log(`✅ 会话验证通过: 用户 ${session.adminUsername}`);
  next();
}

/**
 * 会话过期清理中间件
 */
export function cleanupExpiredSessions(_req: Request, _res: Response, next: NextFunction): void {
  console.log('🧹 清理过期会话...');

  const manager = getSessionManager();
  const cleanedCount = manager.cleanupExpiredSessions();

  console.log(`✅ 清理完成，移除了 ${cleanedCount} 个过期会话`);

  next();
}

/**
 * 认证中间件 - 检查会话并注入
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void | Response {
  // 免登录模式：注入虚拟会话，直接放行
  if (isNoLoginMode()) {
    injectNoLoginSession(req);
    return next();
  }

  const sessionId = req.cookies?.session_id;

  if (!sessionId) {
    return res.status(401).json({
      error: '未登录',
    });
  }

  const manager = getSessionManager();
  const session = manager.get(sessionId);

  if (!session) {
    return res.status(401).json({
      error: '会话无效',
    });
  }

  // 检查会话是否过期
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  if (now > expiresAt) {
    return res.status(401).json({
      error: '会话已过期',
    });
  }

  // 注入会话到 req
  (req as any).session = session;
  (req as any).sessionData = session;

  console.log(`✅ 认证通过: 用户 ${session.adminUsername}`);

  // 记录登录活动
  // TODO: 添加活动日志记录

  next();
}

/**
 * 受保护路由中间件包装器
 */
export function requireAuth(
  _handler: (req: Request, res: Response, next: NextFunction) => void
): (req: Request, res: Response, next: NextFunction) => void | Response {
  return (req, res, next) => {
    try {
      // 免登录模式：注入虚拟会话，直接放行
      if (isNoLoginMode()) {
        injectNoLoginSession(req);
        return next();
      }

      // 验证会话
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: '未登录' });
      }

      const manager = getSessionManager();
      const session = manager.get(sessionId);

      if (!session) {
        return res.status(401).json({ error: '会话无效' });
      }

      // 检查会话是否过期
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      if (now > expiresAt) {
        return res.status(401).json({ error: '会话已过期' });
      }

      // 注入会话到 req
      (req as any).session = session;
      (req as any).sessionData = session;

      // 继续
      next();
    } catch (error) {
      console.error('认证中间件错误:', error);
      next();
    }
  };
}
