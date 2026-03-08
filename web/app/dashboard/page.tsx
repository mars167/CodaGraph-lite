'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';
import type { ResourceStats, SystemStatus } from '@/types';

type ThroughputMetricKey =
  | 'jobsProcessed'
  | 'jobsFailed'
  | 'avgProcessingTime'
  | 'workerConfigured'
  | 'workerRunningJobs'
  | 'workerPendingJobs';

type LlmMetricKey =
  | 'llmPromptTokens'
  | 'llmCompletionTokens'
  | 'llmTotalTokens'
  | 'llmFailedRequests';

type TrendSnapshot = {
  timestamp: number;
  jobsProcessed: number;
  jobsFailed: number;
  avgProcessingTime: number;
  workerConfigured: number;
  workerRunningJobs: number;
  workerPendingJobs: number;
  llmPromptTokens: number;
  llmCompletionTokens: number;
  llmTotalTokens: number;
  llmFailedRequests: number;
};

const TREND_HISTORY_STORAGE_KEY = 'codagraph.dashboard.trend-history';
const MAX_TREND_POINTS = 24;

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

function formatClock(timestamp?: number | null) {
  if (!timestamp) {
    return '--:--:--';
  }

  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

function readStoredTrendHistory(): TrendSnapshot[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TREND_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as TrendSnapshot[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item.timestamp === 'number')
      .slice(-MAX_TREND_POINTS);
  } catch {
    return [];
  }
}

function writeStoredTrendHistory(history: TrendSnapshot[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      TREND_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(-MAX_TREND_POINTS))
    );
  } catch {
    // ignore storage failures
  }
}

function createTrendSnapshot(statsData: ResourceStats): TrendSnapshot {
  return {
    timestamp: Date.now(),
    jobsProcessed: statsData.jobsProcessed || 0,
    jobsFailed: statsData.jobsFailed || 0,
    avgProcessingTime: statsData.avgProcessingTime || 0,
    workerConfigured: statsData.limits?.workerCount || 0,
    workerRunningJobs: statsData.queue?.activeCount || 0,
    workerPendingJobs: statsData.queue?.pendingCount || 0,
    llmPromptTokens: statsData.llm?.promptTokens || 0,
    llmCompletionTokens: statsData.llm?.completionTokens || 0,
    llmTotalTokens: statsData.llm?.totalTokens || 0,
    llmFailedRequests: statsData.llm?.failedRequests || 0,
  };
}

function mergeTrendHistory(history: TrendSnapshot[], snapshot: TrendSnapshot): TrendSnapshot[] {
  const next = [...history];
  const last = next[next.length - 1];

  if (
    last
    && last.jobsProcessed === snapshot.jobsProcessed
    && last.jobsFailed === snapshot.jobsFailed
    && last.avgProcessingTime === snapshot.avgProcessingTime
    && last.workerConfigured === snapshot.workerConfigured
    && last.workerRunningJobs === snapshot.workerRunningJobs
    && last.workerPendingJobs === snapshot.workerPendingJobs
    && last.llmPromptTokens === snapshot.llmPromptTokens
    && last.llmCompletionTokens === snapshot.llmCompletionTokens
    && last.llmTotalTokens === snapshot.llmTotalTokens
    && last.llmFailedRequests === snapshot.llmFailedRequests
  ) {
    next[next.length - 1] = {
      ...snapshot,
      timestamp: snapshot.timestamp,
    };
    return next.slice(-MAX_TREND_POINTS);
  }

  next.push(snapshot);
  return next.slice(-MAX_TREND_POINTS);
}

function buildTrendSeries(values: number[]) {
  if (values.length === 0) {
    return {
      hasData: false,
      points: '',
      min: 0,
      max: 0,
      latest: 0,
    };
  }

  const chartValues = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...chartValues);
  const max = Math.max(...chartValues);
  const range = max - min;
  const padding = 4;
  const points = chartValues.map((value, index) => {
    const normalized = range === 0 ? 0.5 : (value - min) / range;
    const x = padding + (index / Math.max(chartValues.length - 1, 1)) * (100 - padding * 2);
    const y = (100 - padding) - normalized * (100 - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return {
    hasData: true,
    points,
    min,
    max,
    latest: values[values.length - 1] ?? 0,
  };
}

export default function DashboardPage() {
  const { error } = useNotificationHelpers();
  const hasLoadedRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [resourceStats, setResourceStats] = useState<ResourceStats | null>(null);
  const [activeTrendMetric, setActiveTrendMetric] = useState<ThroughputMetricKey>('jobsProcessed');
  const [activeLlmTrendMetric, setActiveLlmTrendMetric] = useState<LlmMetricKey>('llmTotalTokens');
  const [trendHistory, setTrendHistory] = useState<TrendSnapshot[]>([]);

  useEffect(() => {
    setTrendHistory(readStoredTrendHistory());
  }, []);

  useEffect(() => {
    if (trendHistory.length > 0) {
      writeStoredTrendHistory(trendHistory);
    }
  }, [trendHistory]);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (silent || hasLoadedRef.current) {
        setIsRefreshing(true);
      } else {
        setIsInitialLoading(true);
      }

      const [statusRes, statsRes] = await Promise.allSettled([
        apiClient.getSystemStatus(),
        apiClient.getResourceStats().catch(() => null),
      ]);

      if (statusRes.status === 'fulfilled') {
        setSystemStatus(statusRes.value);
      }

      if (statsRes.status === 'fulfilled') {
        const statsData = statsRes.value?.data || null;
        if (statsData) {
          setResourceStats(statsData);
          setTrendHistory((prev) => mergeTrendHistory(prev, createTrendSnapshot(statsData)));
        }
      }

      hasLoadedRef.current = true;
      setLastUpdatedAt(Date.now());
    } catch {
      if (!hasLoadedRef.current) {
        error('加载失败', '无法获取系统状态');
      }
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [error]);

  useEffect(() => {
    void loadData(false);
    const timer = window.setInterval(() => {
      void loadData(true);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [loadData]);

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

  const throughputMetrics: Array<{
    key: ThroughputMetricKey;
    label: string;
    value: number;
    unit?: string;
    valueColor: string;
    panelClass: string;
    labelClass: string;
  }> = [
    {
      key: 'jobsProcessed',
      label: '已处理作业',
      value: resourceStats?.jobsProcessed || 0,
      valueColor: 'text-slate-950 dark:text-white',
      panelClass: 'bg-slate-50 dark:bg-slate-900',
      labelClass: 'text-gray-600 dark:text-gray-400',
    },
    {
      key: 'jobsFailed',
      label: '失败作业',
      value: resourceStats?.jobsFailed || 0,
      valueColor: 'text-rose-700 dark:text-rose-300',
      panelClass: 'bg-rose-50 dark:bg-rose-950/20',
      labelClass: 'text-rose-700 dark:text-rose-300',
    },
    {
      key: 'avgProcessingTime',
      label: '平均处理时间',
      value: resourceStats?.avgProcessingTime || 0,
      unit: 's',
      valueColor: 'text-cyan-700 dark:text-cyan-300',
      panelClass: 'bg-cyan-50 dark:bg-cyan-950/20',
      labelClass: 'text-cyan-700 dark:text-cyan-300',
    },
    {
      key: 'workerConfigured',
      label: 'Worker 配置数',
      value: resourceStats?.limits?.workerCount || 0,
      valueColor: 'text-violet-700 dark:text-violet-300',
      panelClass: 'bg-violet-50 dark:bg-violet-950/20',
      labelClass: 'text-violet-700 dark:text-violet-300',
    },
    {
      key: 'workerRunningJobs',
      label: '运行中作业',
      value: resourceStats?.queue?.activeCount || 0,
      valueColor: 'text-emerald-700 dark:text-emerald-300',
      panelClass: 'bg-emerald-50 dark:bg-emerald-950/20',
      labelClass: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'workerPendingJobs',
      label: '等待中作业',
      value: resourceStats?.queue?.pendingCount || 0,
      valueColor: 'text-amber-700 dark:text-amber-300',
      panelClass: 'bg-amber-50 dark:bg-amber-950/20',
      labelClass: 'text-amber-700 dark:text-amber-300',
    },
  ];

  const llmMetrics: Array<{
    key: LlmMetricKey;
    label: string;
    value: number;
    valueClass: string;
    panelClass: string;
    labelClass: string;
  }> = [
    {
      key: 'llmPromptTokens',
      label: 'Prompt',
      value: llmStats?.promptTokens || 0,
      valueClass: 'text-cyan-700 dark:text-cyan-300',
      panelClass: 'bg-cyan-50 dark:bg-cyan-950/20',
      labelClass: 'text-cyan-700 dark:text-cyan-300',
    },
    {
      key: 'llmCompletionTokens',
      label: 'Completion',
      value: llmStats?.completionTokens || 0,
      valueClass: 'text-emerald-700 dark:text-emerald-300',
      panelClass: 'bg-emerald-50 dark:bg-emerald-950/20',
      labelClass: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'llmTotalTokens',
      label: '总 Token',
      value: llmStats?.totalTokens || 0,
      valueClass: 'text-indigo-700 dark:text-indigo-300',
      panelClass: 'bg-indigo-50 dark:bg-indigo-950/20',
      labelClass: 'text-indigo-700 dark:text-indigo-300',
    },
    {
      key: 'llmFailedRequests',
      label: '失败请求',
      value: llmStats?.failedRequests || 0,
      valueClass: 'text-rose-700 dark:text-rose-300',
      panelClass: 'bg-rose-50 dark:bg-rose-950/20',
      labelClass: 'text-rose-700 dark:text-rose-300',
    },
  ];

  const activeMetricMeta = throughputMetrics.find((item) => item.key === activeTrendMetric) || throughputMetrics[0];
  const activeLlmMetricMeta = llmMetrics.find((item) => item.key === activeLlmTrendMetric) || llmMetrics[0];
  const throughputSeries = useMemo(
    () => buildTrendSeries(trendHistory.map((item) => item[activeTrendMetric])),
    [activeTrendMetric, trendHistory]
  );
  const llmSeries = useMemo(
    () => buildTrendSeries(trendHistory.map((item) => item[activeLlmTrendMetric])),
    [activeLlmTrendMetric, trendHistory]
  );

  if (isInitialLoading) {
    return <Loading />;
  }

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
                这里集中展示服务健康度、队列处理情况和 LLM token 消耗。指标每 30 秒后台静默刷新，不会再把整页切回加载态。
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
              <Badge variant={isRefreshing ? 'info' : 'default'}>
                {isRefreshing ? '刷新中' : `上次更新 ${formatClock(lastUpdatedAt)}`}
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
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {throughputMetrics.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => setActiveTrendMetric(metric.key)}
                  className={`rounded-2xl px-4 py-4 text-left transition-all ${metric.panelClass} ${
                    activeTrendMetric === metric.key
                      ? 'ring-2 ring-cyan-500 shadow-sm'
                      : 'ring-1 ring-transparent hover:ring-cyan-300 dark:hover:ring-cyan-700'
                  }`}
                >
                  <p className={`text-sm ${metric.labelClass}`}>{metric.label}</p>
                  <p className={`mt-3 text-2xl font-semibold ${metric.valueColor}`}>
                    {metric.key === 'avgProcessingTime' ? metric.value.toFixed(1) : metric.value}
                    {metric.unit || ''}
                  </p>
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white/80 p-4 dark:border-gray-800 dark:bg-gray-950/60">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {activeMetricMeta.label} 趋势（最近 {trendHistory.length || 1} 次采样）
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  最新值 {activeTrendMetric === 'avgProcessingTime' ? throughputSeries.latest.toFixed(1) : throughputSeries.latest}{activeMetricMeta.unit || ''} · {formatClock(lastUpdatedAt)}
                </p>
              </div>
              {throughputSeries.hasData ? (
                <div className="h-52 overflow-hidden">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-full w-full">
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      className="text-cyan-500"
                      points={throughputSeries.points}
                    />
                  </svg>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="min-w-0 truncate">
                      最小值 {activeTrendMetric === 'avgProcessingTime' ? throughputSeries.min.toFixed(1) : throughputSeries.min}{activeMetricMeta.unit || ''}
                    </span>
                    <span className="min-w-0 truncate text-right">
                      最大值 {activeTrendMetric === 'avgProcessingTime' ? throughputSeries.max.toFixed(1) : throughputSeries.max}{activeMetricMeta.unit || ''}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex h-52 items-center justify-center rounded-2xl bg-gray-50 text-sm text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                  等待首个采样写入
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>LLM Token 统计</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {llmMetrics.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => setActiveLlmTrendMetric(metric.key)}
                  className={`rounded-2xl px-4 py-4 text-left transition-all ${metric.panelClass} ${
                    activeLlmTrendMetric === metric.key
                      ? 'ring-2 ring-violet-500 shadow-sm'
                      : 'ring-1 ring-transparent hover:ring-violet-300 dark:hover:ring-violet-700'
                  }`}
                >
                  <p className={`text-sm ${metric.labelClass}`}>{metric.label}</p>
                  <p className={`mt-3 text-2xl font-semibold ${metric.valueClass}`}>
                    {formatTokenCount(metric.value)}
                  </p>
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white/80 p-4 dark:border-gray-800 dark:bg-gray-950/60">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {activeLlmMetricMeta.label} 趋势（最近 {trendHistory.length || 1} 次采样）
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  最新值 {formatTokenCount(llmSeries.latest)} · {formatClock(lastUpdatedAt)}
                </p>
              </div>
              {llmSeries.hasData ? (
                <div className="h-52 overflow-hidden">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-full w-full">
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      className="text-violet-500"
                      points={llmSeries.points}
                    />
                  </svg>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="min-w-0 truncate">最小值 {formatTokenCount(llmSeries.min)}</span>
                    <span className="min-w-0 truncate text-right">最大值 {formatTokenCount(llmSeries.max)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-52 items-center justify-center rounded-2xl bg-gray-50 text-sm text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                  等待首个采样写入
                </div>
              )}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
                href: '/dashboard/workspace',
                title: '我的工作空间',
                description: '集中进入已收藏的常用仓库',
                accent: 'text-amber-600 dark:text-amber-400',
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
                accent: 'text-orange-600 dark:text-orange-400',
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-3xl border border-gray-200/80 bg-gray-50/70 px-5 py-5 transition-colors hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-950/60 dark:hover:border-gray-700 dark:hover:bg-gray-950"
              >
                <p className={`text-sm font-medium ${item.accent}`}>{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{item.description}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
