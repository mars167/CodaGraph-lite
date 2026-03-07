'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';
import type { ResourceStats, SystemStatus } from '@/types';

function formatMemory(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatTokenCount(value?: number) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}天 ${hours}小时 ${minutes}分钟`;
}

export default function DashboardPage() {
  const { error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [resourceStats, setResourceStats] = useState<ResourceStats | null>(null);

  useEffect(() => {
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
      } catch {
        error('加载失败', '无法获取系统状态');
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
    const timer = setInterval(() => {
      void loadData();
    }, 30000);
    return () => clearInterval(timer);
  }, [error]);

  if (isLoading) {
    return <Loading />;
  }

  const statusTextMap = {
    healthy: '正常',
    degraded: '降级',
    unhealthy: '异常',
  } as const;

  const statusColorMap = {
    healthy: 'text-emerald-600 dark:text-emerald-400',
    degraded: 'text-amber-600 dark:text-amber-400',
    unhealthy: 'text-rose-600 dark:text-rose-400',
  } as const;

  const workerTextMap = {
    running: '运行中',
    stopped: '已停止',
    error: '异常',
  } as const;

  const workerVariantMap = {
    running: 'success',
    stopped: 'warning',
    error: 'error',
  } as const;

  const llmStats = resourceStats?.llm;
  const llmFailureRate = llmStats && llmStats.requests > 0
    ? `${((llmStats.failedRequests / llmStats.requests) * 100).toFixed(1)}%`
    : '0.0%';
  const completionShare = llmStats && llmStats.totalTokens > 0
    ? (llmStats.completionTokens / llmStats.totalTokens) * 100
    : 0;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_36%),linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.92))] p-6 shadow-sm dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.22),_transparent_34%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.96))]">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              Dashboard Overview
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                审查系统正在如何运行，一眼看清
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                这里集中展示服务健康度、队列处理情况和 LLM token 消耗。所有指标每 30 秒自动刷新。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Badge variant={systemStatus?.status === 'healthy' ? 'success' : systemStatus?.status === 'degraded' ? 'warning' : 'error'}>
                系统 {systemStatus?.status ? statusTextMap[systemStatus.status] : '未知'}
              </Badge>
              <Badge variant={systemStatus?.database === 'connected' ? 'success' : 'error'}>
                数据库 {systemStatus?.database === 'connected' ? '已连接' : '未连接'}
              </Badge>
              <Badge variant={systemStatus?.worker ? workerVariantMap[systemStatus.worker] : 'error'}>
                Worker {systemStatus?.worker ? workerTextMap[systemStatus.worker] : '未知'}
              </Badge>
              <Badge variant={llmStats?.configured ? 'info' : 'warning'}>
                {llmStats?.configured ? `LLM ${llmStats.model || llmStats.provider}` : 'LLM 未配置'}
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="rounded-3xl border-white/70 bg-white/85 dark:border-slate-800 dark:bg-slate-950/60">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">运行时间</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {systemStatus?.uptime ? formatUptime(systemStatus.uptime) : '--'}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-white/70 bg-white/85 dark:border-slate-800 dark:bg-slate-950/60">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">总 Token</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {formatTokenCount(llmStats?.totalTokens)}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-white/70 bg-white/85 dark:border-slate-800 dark:bg-slate-950/60">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">LLM 请求数</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {formatTokenCount(llmStats?.requests)}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-white/70 bg-white/85 dark:border-slate-800 dark:bg-slate-950/60">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">失败率</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {llmFailureRate}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-3xl">
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">系统状态</p>
            <p className={`mt-3 text-2xl font-semibold ${statusColorMap[systemStatus?.status || 'unhealthy']}`}>
              {systemStatus?.status ? statusTextMap[systemStatus.status] : '未知'}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">数据库</p>
            <p className={`mt-3 text-2xl font-semibold ${systemStatus?.database === 'connected' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {systemStatus?.database === 'connected' ? '已连接' : '未连接'}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">作业处理器</p>
            <div className="mt-3">
              <Badge variant={systemStatus?.worker ? workerVariantMap[systemStatus.worker] : 'error'}>
                {systemStatus?.worker ? workerTextMap[systemStatus.worker] : '未知'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">当前模型</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
              {llmStats?.model || '--'}
            </p>
          </CardContent>
        </Card>
      </div>

      {systemStatus?.memoryUsage && (
        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>内存使用情况</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Node 与系统总内存</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatMemory(systemStatus.memoryUsage.used)} / {formatMemory(systemStatus.memoryUsage.total)}
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 transition-all"
                  style={{ width: `${systemStatus.memoryUsage.percentage}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>已使用 {formatMemory(systemStatus.memoryUsage.used)}</span>
                <span>可用 {formatMemory(systemStatus.memoryUsage.available)}</span>
              </div>
            </div>

            {systemStatus.memoryUsage.swapPercentage !== undefined && (
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Swap 使用</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {systemStatus.memoryUsage.swapPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      systemStatus.memoryUsage.swapPercentage > 0 ? 'bg-amber-500' : 'bg-gray-400'
                    }`}
                    style={{ width: `${systemStatus.memoryUsage.swapPercentage}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>作业吞吐</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:bg-slate-900">
              <p className="text-sm text-gray-600 dark:text-gray-400">已处理作业</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
                {resourceStats?.jobsProcessed || 0}
              </p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-4 dark:bg-rose-950/20">
              <p className="text-sm text-rose-700 dark:text-rose-300">失败作业</p>
              <p className="mt-3 text-2xl font-semibold text-rose-700 dark:text-rose-300">
                {resourceStats?.jobsFailed || 0}
              </p>
            </div>
            <div className="rounded-2xl bg-cyan-50 px-4 py-4 dark:bg-cyan-950/20">
              <p className="text-sm text-cyan-700 dark:text-cyan-300">平均处理时间</p>
              <p className="mt-3 text-2xl font-semibold text-cyan-700 dark:text-cyan-300">
                {(resourceStats?.avgProcessingTime || 0).toFixed(1)}s
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>LLM Token 统计</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-200/80 px-4 py-4 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">Prompt</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
                  {formatTokenCount(llmStats?.promptTokens)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 px-4 py-4 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">Completion</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
                  {formatTokenCount(llmStats?.completionTokens)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 px-4 py-4 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">失败请求</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
                  {formatTokenCount(llmStats?.failedRequests)}
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-950 px-5 py-5 text-slate-100 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">Prompt / Completion 结构</p>
                  <p className="mt-1 text-lg font-semibold">
                    {llmStats?.model || llmStats?.provider || '未配置 LLM'}
                  </p>
                </div>
                <Badge variant={llmStats?.configured ? 'success' : 'warning'}>
                  {llmStats?.configured ? '已启用' : '未启用'}
                </Badge>
              </div>
              <div className="mt-5 h-3 rounded-full bg-slate-700">
                <div className="flex h-3 overflow-hidden rounded-full">
                  <div className="bg-cyan-400" style={{ width: `${Math.max(0, 100 - completionShare)}%` }} />
                  <div className="bg-emerald-400" style={{ width: `${completionShare}%` }} />
                </div>
              </div>
              <div className="mt-3 flex justify-between text-xs text-slate-400">
                <span>Prompt {formatTokenCount(llmStats?.promptTokens)}</span>
                <span>Completion {formatTokenCount(llmStats?.completionTokens)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px]">
        <CardHeader>
          <CardTitle>快捷操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                href: '/dashboard/settings',
                title: '系统设置',
                description: '统一管理管理员密码、OAuth 连接和 LLM API',
                accent: 'text-cyan-600 dark:text-cyan-400',
              },
              {
                href: '/dashboard/repositories',
                title: '管理仓库',
                description: '查看 watch 状态和 PR 审查入口',
                accent: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                href: '/dashboard/jobs',
                title: '查看作业',
                description: '跟踪自动 review 和失败重试',
                accent: 'text-violet-600 dark:text-violet-400',
              },
              {
                href: '/dashboard/history',
                title: '查看历史',
                description: '进入最近报告和审查结果历史',
                accent: 'text-amber-600 dark:text-amber-400',
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-3xl border border-gray-200/80 bg-gray-50/70 px-5 py-5 transition-colors hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-950/60 dark:hover:border-gray-700 dark:hover:bg-gray-950"
              >
                <p className={`text-sm font-medium ${item.accent}`}>{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{item.description}</p>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
