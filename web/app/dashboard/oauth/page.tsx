'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { OAuthInstallation, Platform } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useNotificationHelpers } from '@/contexts/NotificationContext';
import { rememberOAuthStatePlatform } from '@/lib/oauth-state';

const platformIcons: Record<Platform, React.ReactNode> = {
  github: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.98-.399 3-.405 1.02.006 2.04.139 3 .405 2.281-1.552 3.285-1.23 3.285-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.192 1.377 0 0-1.424 1.705-3.868 1.705-8.032 0-12.028-6.601-12.028-14.321 0-2.662.682-5.15 1.858-7.228 3.795-3.016 8.775-3.016 14.06 0 5.22 1.435 9.652 4.063 12.414.995 2.687 1.438 6.061 2.045 7.607.057.067.1.141.1.218-.005.072-.055.114-.13.114-.075 0-.163-.005-.248-.005-6.241 0-11.302-5.06-11.302-11.302s5.061-11.302 11.302-11.302 11.302 5.06 11.302 11.302z" />
    </svg>
  ),
  gitee: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.984 0zm6.09 5.333h-4.679a1.143 1.143 0 0 0-1.143 1.143v4.857h-1.714V7.048a1.143 1.143 0 0 0-1.143-1.143H5.924a1.143 1.143 0 0 0-1.143 1.143v4.857H2.667a.667.667 0 0 0-.667.667v2.666a.667.667 0 0 0 .667.667h15.407a.667.667 0 0 0 .667-.667v-2.666a.667.667 0 0 0-.667-.667z" />
    </svg>
  ),
  gitlab: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A1.59 1.59 0 0 1 6.29 1.6h11.42a1.59 1.59 0 0 1 1.56 1.22l2.44 7.51 1.22 3.78a.84.84 0 0 1-.28.94zM12 14.5l-3.19-3.32h6.38zm-5.18-4l-2.3-2.1-2.48 7.64 4.78-5.54zm10.36 0l.06.1 4.78 5.54-2.48-7.64zm-6.18-4h-2.19l1.1 3.27z" />
    </svg>
  ),
};

const platformNames: Record<Platform, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

export default function OAuthPage() {
  const { success, error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState<Platform | null>(null);
  const [installations, setInstallations] = useState<OAuthInstallation[]>([]);

  const loadInstallations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getOAuthInstallations();
      setInstallations(response.data.installations);
    } catch (err) {
      error('加载失败', err instanceof Error ? err.message : '无法获取 OAuth 集成信息');
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  const handleAuthorize = async (platform: Platform) => {
    try {
      setIsAuthorizing(platform);
      const authType = platform === 'github' ? 'github_app' : 'oauth';
      const response = await apiClient.getOAuthAuthorizationUrl(platform, authType);
      rememberOAuthStatePlatform(response.data.authorizationUrl, platform);
      window.location.href = response.data.authorizationUrl;
    } catch (err) {
      error('授权失败', err instanceof Error ? err.message : '无法获取授权链接');
      setIsAuthorizing(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('确定要断开此 OAuth 连接吗？')) {
      return;
    }

    try {
      await apiClient.disconnectOAuth(id);
      success('断开成功', 'OAuth 连接已断开');
      await loadInstallations();
    } catch (err) {
      error('断开失败', err instanceof Error ? err.message : '无法断开 OAuth 连接');
    }
  };

  const handleRefreshToken = async (id: string) => {
    try {
      await apiClient.refreshOAuthToken(id);
      success('刷新成功', 'Token 已刷新');
      await loadInstallations();
    } catch (err) {
      error('刷新失败', err instanceof Error ? err.message : '无法刷新 Token');
    }
  };

  useEffect(() => {
    loadInstallations();
  }, [loadInstallations]);

  if (isLoading) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          OAuth 集成管理
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          管理与 GitHub、Gitee、GitLab 的 OAuth 连接
        </p>
      </div>

      {/* 可添加的平台 */}
      <Card>
        <CardHeader>
          <CardTitle>添加新连接</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['github', 'gitee', 'gitlab'] as Platform[]).map((platform) => {
              const isConnected = installations.some((i) => i.platform === platform);
              return (
                <div
                  key={platform}
                  className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                    isConnected
                      ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-gray-900 dark:text-gray-100">
                      {platformIcons[platform]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {platformNames[platform]}
                      </p>
                      {isConnected && (
                        <Badge variant="success" size="sm" className="mt-1">
                          已连接
                        </Badge>
                      )}
                    </div>
                  </div>
                  {isConnected ? (
                    <Badge variant="info" size="sm">
                      ✓
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleAuthorize(platform)}
                      loading={isAuthorizing === platform}
                    >
                      {isAuthorizing === platform ? '授权中...' : '授权'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 已连接的安装 */}
      {installations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>已连接的账户</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {installations.map((installation) => (
                <div
                  key={installation.id}
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-gray-900 dark:text-gray-100">
                      {platformIcons[installation.platform]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {installation.platformUsername}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {platformNames[installation.platform]} · {installation.platformUserId}
                      </p>
                      {installation.webhookUrl && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Webhook: {installation.webhookUrl}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRefreshToken(installation.id)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      刷新 Token
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDisconnect(installation.id)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      断开
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {installations.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <p className="text-gray-600 dark:text-gray-400">
              暂无 OAuth 连接，请添加您的第一个连接
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
