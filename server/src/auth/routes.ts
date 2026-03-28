/**
 * 认证相关路由
 *
 * 提供：
 * - POST /api/auth/login - 管理员登录
 * - POST /api/auth/logout - 管理员登出
 * - POST /api/auth/change-password - 修改密码
 * - GET /api/auth/verify - 验证会话
 * - GET /api/auth/mode - 查询当前认证模式（免登录/正常）
 */

import express, { Request, Response } from 'express';
import { getAdminModel } from '../models/Admin';
import { getActivityLogModel } from '../models/ActivityLog';
import { getSessionManager } from './SessionManager';
import { getSystemSettingsService } from '../services/SystemSettingsService';
import type { LoginRequest, UpdatePasswordRequest, AuthResponse } from './types';

const router = express.Router();

/**
 * 查询当前认证模式
 * 此端点无需认证，供前端初始化时使用
 */
router.get('/mode', (_req: Request, res: Response) => {
  const noLoginMode = getSystemSettingsService().getSettings().noLoginMode;
  return res.json({
    success: true,
    noLoginMode,
  });
});

/**
 * 管理员登录
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as LoginRequest;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    // 验证必填字段
    if (!username || !password) {
      return res.status(400).json({
        error: '缺少必填字段：username, password',
      });
    }

    const adminModel = getAdminModel();
    const activityLogModel = getActivityLogModel();

    const admin = adminModel.findByUsername(username);
    const isValid = admin ? adminModel.verifyPassword(username, password) : false;

    if (!isValid) {
      if (admin) {
        activityLogModel.logFailedLogin(admin.id, username, ipAddress, userAgent);
      }
      return res.status(401).json({
        error: '用户名或密码错误',
      });
    }

    if (!admin) {
      return res.status(401).json({
        error: '用户不存在',
      });
    }

    // 更新最后登录时间
    adminModel.updateLastLogin(admin.id);

    // 记录登录活动
    activityLogModel.logLogin(admin.id, ipAddress, userAgent);

    // 创建会话
    const sessionManager = getSessionManager();
    const session = sessionManager.create(admin);

    // 设置会话 cookie
    res.cookie('session_id', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 小时
      sameSite: 'strict',
    });

    console.log(`🔐 管理员登录成功：${username}`);

    const response: AuthResponse = {
      success: true,
      message: '登录成功',
      admin: {
        id: admin.id,
        username: admin.username,
        created_at: admin.created_at,
        updated_at: admin.updated_at,
      },
    };

    return res.json(response);
  } catch (error) {
    console.error('登录失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 管理员登出
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session_id;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    if (sessionId) {
      const sessionManager = getSessionManager();
      const session = sessionManager.get(sessionId);

      // 记录登出活动
      if (session) {
        const activityLogModel = getActivityLogModel();
        activityLogModel.logLogout(session.adminId, ipAddress, userAgent);
      }

      sessionManager.destroy(sessionId);
    }

    // 清除会话 cookie
    res.clearCookie('session_id');

    console.log(`🚪 管理员登出成功`);

    return res.json({
      success: true,
      message: '登出成功',
    });
  } catch (error) {
    console.error('登出失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 验证会话
 */
router.get('/verify', async (req: Request, res: Response) => {
  try {
    // 免登录模式：直接返回成功
    const noLoginMode = getSystemSettingsService().getSettings().noLoginMode;
    if (noLoginMode) {
      const adminModel = getAdminModel();
      const admin = adminModel.findAll()[0] ?? null;
      return res.json({
        success: true,
        message: '免登录模式已启用',
        noLoginMode: true,
        admin: admin ? {
          id: admin.id,
          username: admin.username,
          created_at: admin.created_at,
          updated_at: admin.updated_at,
        } : null,
      });
    }

    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      return res.json({
        success: false,
        message: '未登录',
      });
    }

    const sessionManager = getSessionManager();
    const session = sessionManager.get(sessionId);

    if (!session) {
      return res.json({
        success: false,
        message: '会话无效',
      });
    }

    // 检查会话是否过期
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    if (now > expiresAt) {
      return res.json({
        success: false,
        message: '会话已过期',
      });
    }

    // 获取管理员信息
    const adminModel = getAdminModel();
    const admin = adminModel.findById(session.adminId);

    return res.json({
      success: true,
      message: '会话有效',
      admin: admin ? {
        id: admin.id,
        username: admin.username,
        created_at: admin.created_at,
        updated_at: admin.updated_at,
      } : null,
    });
  } catch (error) {
    console.error('验证会话失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 修改密码
 */
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body as UpdatePasswordRequest;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    // 验证必填字段
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        error: '缺少必填字段：oldPassword, newPassword',
      });
    }

    // 验证密码长度
    if (newPassword.length < 6) {
      return res.status(400).json({
        error: '新密码长度不能少于 6 位',
      });
    }

    const sessionId = req.cookies?.session_id;
    if (!sessionId) {
      return res.status(401).json({
        error: '未登录',
      });
    }

    const sessionManager = getSessionManager();
    const session = sessionManager.get(sessionId);

    if (!session) {
      return res.status(401).json({
        error: '会话无效',
      });
    }

    // 验证旧密码
    const adminModel = getAdminModel();
    const admin = adminModel.findById(session.adminId);

    if (!admin) {
      return res.status(404).json({
        error: '管理员不存在',
      });
    }

    const isValidOldPassword = adminModel.verifyPassword(
      admin.username,
      oldPassword
    );

    if (!isValidOldPassword) {
      return res.status(400).json({
        error: '旧密码错误',
      });
    }

    // 更新密码
    const updated = adminModel.update(admin.id, {
      password: newPassword,
    });

    if (!updated) {
      return res.status(500).json({
        error: '密码更新失败',
      });
    }

    // 记录密码更改活动
    const activityLogModel = getActivityLogModel();
    activityLogModel.logPasswordChange(admin.id, ipAddress, userAgent);

    console.log(`🔑 管理员 ${admin.username} 密码已更新`);

    return res.json({
      success: true,
      message: '密码更新成功',
    });
  } catch (error) {
    console.error('修改密码失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 获取会话信息
 */
router.get('/session', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      return res.json({
        success: false,
        message: '未登录',
      });
    }

    const sessionManager = getSessionManager();
    const session = sessionManager.get(sessionId);

    if (!session) {
      return res.json({
        success: false,
        message: '会话无效',
      });
    }

    return res.json({
      success: true,
      session: {
        id: session.id,
        adminUsername: session.adminUsername,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error('获取会话信息失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 获取活动日志
 */
router.get('/activity-log', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session_id;
    if (!sessionId) {
      return res.status(401).json({
        error: '未登录',
      });
    }

    const sessionManager = getSessionManager();
    const session = sessionManager.get(sessionId);

    if (!session) {
      return res.status(401).json({
        error: '会话无效',
      });
    }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const activityLogModel = getActivityLogModel();
    const logs = activityLogModel.findByAdminId(session.adminId, limit);

    return res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error('获取活动日志失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

export default router;
