/**
 * OAuth 会话管理
 *
 * 为 OAuth 登录用户创建和管理会话
 */

import type { Platform } from '../models/types';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';

/**
 * OAuth 会话数据接口
 */
export interface OAuthSessionData {
  sessionId: string;
  adminId: number;
  adminUsername: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  installationId: number;
  platform: Platform;
  accountLogin: string;
  accountName?: string;
}

/**
 * OAuth 会话存储
 * 将 OAuth 安装与会话关联
 */
const oauthSessions = new Map<string, OAuthSessionData>();

/**
 * 创建 OAuth 会话
 */
export function createOAuthSession(
  installationId: number,
  platform: Platform,
  accountLogin: string,
  accountName?: string
): string {
  const sessionId = `oauth_${platform}_${installationId}_${Date.now()}`;

  const sessionData: OAuthSessionData = {
    sessionId,
    adminId: installationId, // 使用 installationId 作为标识
    adminUsername: accountLogin,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24小时
    lastActivity: new Date(),
    installationId,
    platform,
    accountLogin,
    accountName,
  };

  oauthSessions.set(sessionId, sessionData);

  console.log(`🔐 创建 OAuth 会话: ${accountLogin} @ ${platform} - Session ID: ${sessionId}`);

  return sessionId;
}

/**
 * 获取 OAuth 会话
 */
export function getOAuthSession(sessionId: string): OAuthSessionData | null {
  return oauthSessions.get(sessionId) || null;
}

/**
 * 验证 OAuth 会话
 */
export function validateOAuthSession(sessionId: string): boolean {
  const session = oauthSessions.get(sessionId);

  if (!session) {
    return false;
  }

  // 检查会话是否过期
  if (session.expiresAt < new Date()) {
    return false;
  }

  // 检查 OAuth 安装是否仍然有效
  const installationModel = getOAuthInstallationModel();
  const installation = installationModel.findById(session.installationId);

  if (!installation || !installation.is_active) {
    return false;
  }

  return true;
}

/**
 * 更新会话最后活动时间
 */
export function updateSessionActivity(sessionId: string): boolean {
  const session = oauthSessions.get(sessionId);

  if (!session) {
    return false;
  }

  session.lastActivity = new Date();

  return true;
}

/**
 * 删除 OAuth 会话
 */
export function deleteOAuthSession(sessionId: string): boolean {
  const session = oauthSessions.get(sessionId);

  if (!session) {
    return false;
  }

  oauthSessions.delete(sessionId);

  console.log(`🗑 删除 OAuth 会话: ${session.accountLogin}`);

  return true;
}

/**
 * 获取所有活跃的 OAuth 会话
 */
export function getActiveOAuthSessions(): OAuthSessionData[] {
  const activeSessions: OAuthSessionData[] = [];

  for (const [sessionId, session] of oauthSessions) {
    if (validateOAuthSession(sessionId)) {
      activeSessions.push(session);
    }
  }

  return activeSessions;
}

/**
 * 清理过期会话
 */
export function cleanupExpiredSessions(): number {
  let cleaned = 0;
  const now = new Date();

  for (const [sessionId, session] of oauthSessions) {
    if (session.expiresAt < now) {
      oauthSessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 清理 ${cleaned} 个过期会话`);
  }

  return cleaned;
}

/**
 * 获取会话统计信息
 */
export function getSessionStats() {
  const total = oauthSessions.size;
  const active = getActiveOAuthSessions().length;
  const expired = total - active;

  return {
    total,
    active,
    expired,
  };
}

/**
 * 根据会话 ID 获取 OAuth 安装信息
 */
export function getInstallationBySession(sessionId: string) {
  const session = oauthSessions.get(sessionId);
  if (!session) return null;

  const installationModel = getOAuthInstallationModel();
  return installationModel.findById(session.installationId);
}
