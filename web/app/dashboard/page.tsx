'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { SystemStatus, ResourceStats } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Badge } from '@/components/ui/Badge';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

export default function DashboardPage() {
  const { error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [resourceStats, setResourceStats] = useState<ResourceStats | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [statusRes, statsRes] = await Promise.allSettled([
        apiClient.getSystemStatus(),
        apiClient.getResourceStats().catch(() => null),
      ]);

      if (statusRes.status === 'fulfilled') {
        setSystemStatus(statusRes.value);
      }
      if (statsRes.status === 'fulfilled') {
        setResourceStats(statsRes.value?.data || null);
      }
    } catch (err) {
      error('加载失败', '无法获取系统状态');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // 每 30 秒刷新一次
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return <Loading />;
  }

  const statusColors = {
    healthy: 'text-green-600 dark:text-green-400',
    degraded: 'text-yellow-600 dark:text-yellow-400',
    unhealthy: 'text-red-600 dark:text-red-400',
  };

  const workerStatusColors = {
    running: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
    stopped: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  };

  const formatMemory = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          仪表板
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          系统概览和运行状态
        </p>
      </div>

      {/* 系统状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">系统状态</p>
                <p className={`text-2xl font-bold mt-1 ${statusColors[systemStatus?.status || 'unhealthy']}`}>
                  {systemStatus?.status === 'healthy' && '正常'}
                  {systemStatus?.status === 'degraded' && '降级'}
                  {systemStatus?.status === 'unhealthy' && '异常'}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">数据库</p>
                <p className={`text-2xl font-bold mt-1 ${systemStatus?.database === 'connected' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {systemStatus?.database === 'connected' ? '已连接' : '未连接'}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">作业处理器</p>
                <Badge className="mt-1" variant={systemStatus?.worker === 'running' ? 'success' : 'error'}>
                  {systemStatus?.worker === 'running' ? '运行中' : systemStatus?.worker || '未知'}
                </Badge>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">运行时间</p>
                <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">
                  {systemStatus?.uptime ? formatUptime(systemStatus.uptime) : '--'}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 内存使用 */}
      {systemStatus?.memoryUsage && (
        <Card>
          <CardHeader>
            <CardTitle>内存使用情况</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">总内存</span>
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {formatMemory(systemStatus.memoryUsage.total)} MB
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${systemStatus.memoryUsage.percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1 text-gray-500 dark:text-gray-400">
                  <span>已使用: {formatMemory(systemStatus.memoryUsage.used)} MB</span>
                  <span>可用: {formatMemory(systemStatus.memoryUsage.available)} MB</span>
                </div>
              </div>

              {systemStatus.memoryUsage?.swapPercentage !== undefined && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Swap 使用</span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">
                      {systemStatus.memoryUsage.swapPercentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${systemStatus.memoryUsage.swapPercentage > 0 ? 'bg-yellow-500' : 'bg-gray-400'}`}
                      style={{ width: `${systemStatus.memoryUsage.swapPercentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 资源统计 */}
      {resourceStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">已处理作业</p>
              <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">
                {resourceStats.jobsProcessed || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">失败作业</p>
              <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
                {resourceStats.jobsFailed || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">平均处理时间</p>
              <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">
                {resourceStats.avgProcessingTime?.toFixed(1) || '0.0'}s
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 快捷操作 */}
      <Card>
        <CardHeader>
          <CardTitle>快捷操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="/dashboard/oauth"
              className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="font-medium text-gray-900 dark:text-gray-100">添加 OAuth 连接</span>
            </a>

            <a
              href="/dashboard/repositories"
              className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="font-medium text-gray-900 dark:text-gray-100">管理仓库</span>
            </a>

            <a
              href="/dashboard/jobs"
              className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="font-medium text-gray-900 dark:text-gray-100">查看作业</span>
            </a>

            <a
              href="/dashboard/history"
              className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium text-gray-900 dark:text-gray-100">查看历史</span>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
