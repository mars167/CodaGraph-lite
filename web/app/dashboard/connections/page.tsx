'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type { OAuthInstallation, Platform } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const platformIcons: Record<Platform, React.ReactNode> = {
  github: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.98-.399 3-.405 1.02.006 2.04.139 3 .405 2.281-1.552 3.285-1.23 3.285-1.653 1.242-2.874 1.438-6.03 9-6.03 1-4.478 0 0-1.626.682-5.15 1.858-7.228 3.795-3.016 8.775-3.016 14.06 0 5.22-1.435 9.652 4.063 12.414.995 2.687 1.438 6.061 2.045 7.607.057.067 1.141 1.218-.005.072-.055.114-.13.114-.075 0-.163-.005-.248-.005-6.241 0-11.302-5.06-11.302-11.302s5.061-11.302 11.302 11.302z" />
    </svg>
  ),
  gitee: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0A12 12 0 0 0 12 12 12 0 0 1 4.24 7.76 12 0a12 12 0 0 0 0 12 0-4.24-7.76 0A12 12 0 0 1 12 0z" />
    </svg>
  ),
  gitlab: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0a12 12 0 0 0 0 12 12 0 0 1 4.24 7.76 12 0a12 12 0 0 0 0 12 0-4.24-7.76 0A12 12 0 0 1 12 0z" />
    </svg>
  ),
};

const platformNames: Record<Platform, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

const platformColors: Record<Platform, string> = {
  github: 'bg-gray-900 dark:bg-white text-white dark:text-gray-900',
  gitee: 'bg-red-600 dark:bg-red-500 text-white',
  gitlab: 'bg-orange-600 dark:bg-orange-500 text-white',
};

export default function ConnectionsPage() {
  const { success, error } = useNotificationHelpers();
  const [installations, setInstallations] = useState<OAuthInstallation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // 加载连接列表
  useEffect(() => {
    loadInstallations();
  }, []);

  const loadInstallations = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getOAuthInstallations();
      if (response.success && response.data?.installations) {
        setInstallations(response.data.installations);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载连接列表失败';
      error('加载失败', message);
    } finally {
      setIsLoading(false);
    }
  };

  // 刷新 Token
  const handleRefreshToken = async (id: string) => {
    try {
      setActionLoading({ ...actionLoading, [id]: true });
      await apiClient.refreshOAuthToken(id);
      success('刷新成功', 'Token 已更新');
      await loadInstallations();
    } catch (err) {
      const message = err instanceof Error ? err.message : '刷新 Token 失败';
      error('刷新失败', message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  // 断开连接
  const handleDisconnect = async (id: string) => {
    if (!confirm('确定要断开此连接吗？')) {
      return;
    }

    try {
      setActionLoading({ ...actionLoading, [id]: true });
      await apiClient.disconnectOAuth(id);
      success('断开成功', '连接已移除');
      await loadInstallations();
    } catch (err) {
      const message = err instanceof Error ? err.message : '断开连接失败';
      error('断开失败', message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个连接吗？`)) {
      return;
    }

    try {
      setActionLoading({ ...actionLoading, batch: true });
      for (const id of selectedIds) {
        await apiClient.disconnectOAuth(id);
      }
      success('删除成功', `已删除 ${selectedIds.size} 个连接`);
      setSelectedIds(new Set());
      await loadInstallations();
    } catch (err) {
      const message = err instanceof Error ? err.message : '批量删除失败';
      error('删除失败', message);
    } finally {
      setActionLoading((prev) => ({ ...prev, batch: false }));
    }
  };

  // 切换选择
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === installations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(installations.map((inst) => inst.id)));
    }
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航栏 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                平台连接管理
              </h1>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                共 {installations.length} 个连接
              </span>
            </div>

            <div className="flex items-center gap-3">
              {selectedIds.size > 0 && (
                <Button
                  variant="danger"
                  loading={actionLoading.batch}
                  onClick={handleBatchDelete}
                >
                  删除选中 ({selectedIds.size})
                </Button>
              )}
              <Button
                onClick={() => window.location.href = '/oauth'}
              >
                添加新连接
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {installations.length === 0 ? (
          // 空状态
          <Card>
            <CardContent className="py-16 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l4-4a4 4 0 00-.172-5.656M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364a9 9 0 00-5.98-16.98A8.99 8.99 0 005 8c-3.552 0-6.766 2.138-8.5 5.636l.982.982a9.97 9.97 0 015.846 11.537 2.464 4.335 5.952 9.578 5.952 8.964 0 6.66-5.977 8.964-11.798 5.364M6 13.5h12M8 6l2 10 2-10M8 17l2-10-2 10" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  暂无平台连接
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  连接您的 GitHub、Gitee 或 GitLab 账户，开始使用 CodaGraph 进行代码审查
                </p>
                <Button
                  onClick={() => window.location.href = '/oauth'}
                  size="lg"
                >
                  添加第一个连接
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 批量操作栏 */}
            <div className="mb-6 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={selectedIds.size === installations.length && installations.length > 0}
                  onChange={toggleSelectAll}
                />
                <span>全选</span>
              </label>

              <Button
                variant="outline"
                size="sm"
                onClick={loadInstallations}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                刷新
              </Button>
            </div>

            {/* 连接列表 */}
            <div className="space-y-4">
              {installations.map((installation) => (
                <Card key={installation.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      {/* 左侧：基本信息 */}
                      <div className="flex-1">
                        <div className="flex items-start gap-4">
                          {/* 复选框 */}
                          <input
                            type="checkbox"
                            className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={selectedIds.has(installation.id)}
                            onChange={() => toggleSelect(installation.id)}
                          />

                          {/* 平台图标和名称 */}
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${platformColors[installation.platform]}`}>
                              {platformIcons[installation.platform]}
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {platformNames[installation.platform]}
                              </h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                @{installation.platformUsername}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* 详情网格 */}
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">安装 ID</p>
                            <p className="text-sm font-mono text-gray-900 dark:text-white">
                              {installation.id}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">平台用户 ID</p>
                            <p className="text-sm font-mono text-gray-900 dark:text-white">
                              {installation.platformUserId}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">创建时间</p>
                            <p className="text-sm text-gray-900 dark:text-white">
                              {formatDate(installation.createdAt)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">最后更新</p>
                            <p className="text-sm text-gray-900 dark:text-white">
                              {formatDate(installation.updatedAt)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">权限范围</p>
                            <p className="text-sm text-gray-900 dark:text-white truncate max-w-xs">
                              {installation.scope}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Token 过期</p>
                            <p className="text-sm text-gray-900 dark:text-white">
                              {formatDate(installation.expiresAt)}
                            </p>
                          </div>
                        </div>

                        {/* Webhook 信息 */}
                        {installation.webhookUrl && (
                          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="font-medium">Webhook 已配置</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 右侧：操作按钮 */}
                      <div className="flex lg:flex-col gap-2 lg:border-l lg:border-gray-200 dark:lg:border-gray-700 lg:pl-4">
                        <Button
                          variant="outline"
                          size="sm"
                          loading={actionLoading[installation.id]}
                          onClick={() => handleRefreshToken(installation.id)}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          刷新 Token
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={actionLoading[installation.id]}
                          onClick={() => handleDisconnect(installation.id)}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          断开连接
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 使用说明 */}
      {installations.length > 0 && (
        <Card className="max-w-7xl mx-auto mt-8">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              连接管理说明
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Token 过期后需要手动刷新，或重新授权</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2z" />
                </svg>
                <span>断开连接后，相关仓库将无法进行代码审查</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Webhook 配置后，PR 事件将自动触发分析</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
