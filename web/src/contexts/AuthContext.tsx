'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Admin, Session } from '@/types';
import { apiClient, isNetworkErrorMessage, setAuthToken } from '@/lib/api-client';

interface AuthContextType {
  admin: Admin | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  noLoginMode: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAdmin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 会话持续时间 (24 小时)
const SESSION_DURATION = 24 * 60 * 60 * 1000;

// Storage key
const STORAGE_KEY_SESSION = 'codagraph_session';
const STORAGE_KEY_TOKEN = 'auth_token';

function isValidSession(session: Session | null): session is Session {
  if (!session) return false;
  return new Date(session.expiresAt) > new Date();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [noLoginMode, setNoLoginMode] = useState(false);

  // 清除会话
  const clearSession = useCallback(() => {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(STORAGE_KEY_SESSION);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    setAdmin(null);
  }, []);

  // 从存储加载会话
  const loadSession = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const sessionData = localStorage.getItem(STORAGE_KEY_SESSION);
      if (sessionData) {
        const session: Session = JSON.parse(sessionData);
        if (isValidSession(session)) {
          setAdmin(session.admin);
          return true;
        } else {
          // 会话过期，清除存储
          clearSession();
        }
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      clearSession();
    }
    return false;
  }, [clearSession]);

  // 保存会话
  const saveSession = useCallback((session: Session) => {
    if (typeof window === 'undefined') return;

    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    setAdmin(session.admin);
  }, []);

  // 登录
  const login = useCallback(async (username: string, password: string) => {
    try {
      const response = await apiClient.login({ username, password });

      if (!response.success || !response.admin) {
        throw new Error(response.message || '登录失败');
      }

      // 保存 token
      setAuthToken(response.admin.id);

      // 创建会话
      const session: Session = {
        admin: response.admin,
        expiresAt: new Date(Date.now() + SESSION_DURATION).toISOString(),
      };

      saveSession(session);
    } catch (error) {
      clearSession();
      throw error;
    }
  }, [saveSession, clearSession]);

  // 登出
  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearSession();
    }
  }, [clearSession]);

  // 刷新管理员信息
  const refreshAdmin = useCallback(async () => {
    try {
      const response = await apiClient.getCurrentAdmin();
      if (response.success) {
        setAdmin({
          id: response.data.admin.id,
          username: response.data.admin.username,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      if (error instanceof Error && isNetworkErrorMessage(error.message)) {
        return;
      }

      clearSession();
      if (error instanceof Error && (error.message === '未登录' || error.message === '会话无效' || error.message === '会话已过期')) {
        return;
      }
      console.error('Failed to refresh admin:', error);
    }
  }, [clearSession]);

  // 初始化：检查认证模式，并根据模式恢复会话
  useEffect(() => {
    async function init() {
      try {
        const { noLoginMode: noLogin } = await apiClient.getAuthMode();
        setNoLoginMode(noLogin);

        if (noLogin) {
          // 免登录模式：从 verify 端点获取管理员信息
          try {
            const response = await apiClient.getCurrentAdmin();
            if (response.success && response.data.admin) {
              setAdmin({
                id: response.data.admin.id,
                username: response.data.admin.username,
                createdAt: new Date().toISOString(),
              });
            }
          } catch {
            // 忽略错误，免登录模式下保持未认证状态也可接受
          }
        } else {
          // 正常模式：从本地存储恢复会话
          const hasValidSession = loadSession();
          if (hasValidSession) {
            await refreshAdmin().catch((error) => {
              if (error instanceof Error && isNetworkErrorMessage(error.message)) {
                return;
              }
              clearSession();
            });
          }
        }
      } catch (error) {
        // 无法获取认证模式时（例如后端未启动），退回到本地存储会话
        if (error instanceof Error && !isNetworkErrorMessage(error.message)) {
          const hasValidSession = loadSession();
          if (hasValidSession) {
            await refreshAdmin().catch(() => clearSession());
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    void init();
  }, [loadSession, refreshAdmin, clearSession]);

  // 检查会话过期（仅在非免登录模式下）
  useEffect(() => {
    if (!admin || noLoginMode) return;

    const checkExpiry = setInterval(() => {
      const sessionData = localStorage.getItem(STORAGE_KEY_SESSION);
      if (sessionData) {
        const session: Session = JSON.parse(sessionData);
        if (!isValidSession(session)) {
          clearSession();
        }
      }
    }, 60000); // 每分钟检查一次

    return () => clearInterval(checkExpiry);
  }, [admin, noLoginMode, clearSession]);

  const value: AuthContextType = {
    admin,
    isAuthenticated: admin !== null,
    isLoading,
    noLoginMode,
    login,
    logout,
    refreshAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
