'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';
import type { AnalysisJob, Repository, ResourceStats, SystemStatus } from '@/types';

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

type TrendWindowKey = '10m' | '30m' | '120m' | '24h' | '3d' | '7d' | 'custom';

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
const MAX_TREND_POINTS = 20160; // 7 days * 24h * 60m * 2 (30s interval)

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

  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
}

function formatClockMinute(timestamp?: number | null) {
  if (!timestamp) {
    return '--:--';
  }

  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  });
}

function formatShortDateTime(value?: string) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  });
}

function toIsoStringLocal(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
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

function fillTrendGaps(history: TrendSnapshot[]): TrendSnapshot[] {
  if (history.length < 2) return history;

  const filled: TrendSnapshot[] = [history[0]];
  const GAP_THRESHOLD = 65 * 1000; // > 1 minute (allow some jitter)

  for (let i = 1; i < history.length; i++) {
    const prev = filled[filled.length - 1];
    const curr = history[i];
    const diff = curr.timestamp - prev.timestamp;

    if (diff > GAP_THRESHOLD) {
      filled.push({
        timestamp: prev.timestamp + 30000,
        jobsProcessed: prev.jobsProcessed, // Keep cumulative metrics steady
        jobsFailed: prev.jobsFailed,
        avgProcessingTime: 0,
        workerConfigured: 0,
        workerRunningJobs: 0,
        workerPendingJobs: 0,
        llmPromptTokens: prev.llmPromptTokens,
        llmCompletionTokens: prev.llmCompletionTokens,
        llmTotalTokens: prev.llmTotalTokens,
        llmFailedRequests: prev.llmFailedRequests,
      });

      if (diff > GAP_THRESHOLD * 2) {
        filled.push({
          timestamp: curr.timestamp - 30000,
          jobsProcessed: prev.jobsProcessed,
          jobsFailed: prev.jobsFailed,
          avgProcessingTime: 0,
          workerConfigured: 0,
          workerRunningJobs: 0,
          workerPendingJobs: 0,
          llmPromptTokens: prev.llmPromptTokens,
          llmCompletionTokens: prev.llmCompletionTokens,
          llmTotalTokens: prev.llmTotalTokens,
          llmFailedRequests: prev.llmFailedRequests,
        });
      }
    }
    filled.push(curr);
  }
  return filled;
}

function buildSeriesStats(values: number[]) {
  if (values.length === 0) {
    return {
      hasData: false,
      min: 0,
      max: 0,
      latest: 0,
    };
  }

  return {
    hasData: true,
    min: Math.min(...values),
    max: Math.max(...values),
    latest: values[values.length - 1] ?? 0,
  };
}

function formatTrendValue(value: number, withDecimal: boolean, unit?: string) {
  const normalized = withDecimal ? value.toFixed(1) : value.toLocaleString('zh-CN');
  return `${normalized}${unit || ''}`;
}

function buildThroughputValues(history: TrendSnapshot[], metric: ThroughputMetricKey): number[] {
  if (history.length === 0) {
    return [];
  }

  if (metric !== 'jobsProcessed' && metric !== 'jobsFailed') {
    return history.map((item) => item[metric]);
  }

  return history.map((item, index) => {
    if (index === 0) {
      return 0;
    }

    const prev = history[index - 1];
    const delta = Math.max(item[metric] - prev[metric], 0);
    const elapsedMs = Math.max(item.timestamp - prev.timestamp, 30_000);
    return delta / (elapsedMs / 60_000);
  });
}

function EChartLine({
  option,
  heightClassName = 'h-56',
}: {
  option: EChartsOption;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const instance = echarts.getInstanceByDom(container) || echarts.init(container, undefined, { renderer: 'svg' });
    chartInstanceRef.current = instance;
    instance.setOption(option, true);

    const handleResize = () => {
      instance.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [option]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className={`w-full ${heightClassName}`} />;
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
  const [activeTrendWindow, setActiveTrendWindow] = useState<TrendWindowKey>('30m');
  const [activeLlmTrendWindow, setActiveLlmTrendWindow] = useState<TrendWindowKey>('30m');
  const [customThroughputRange, setCustomThroughputRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [customLlmRange, setCustomLlmRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [trendHistory, setTrendHistory] = useState<TrendSnapshot[]>([]);
  const [recentJobs, setRecentJobs] = useState<AnalysisJob[]>([]);
  const [workspaceRepositories, setWorkspaceRepositories] = useState<Repository[]>([]);

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

      const [statusRes, statsRes, jobsRes, workspaceRes] = await Promise.allSettled([
        apiClient.getSystemStatus(),
        apiClient.getResourceStats().catch(() => null),
        apiClient.getJobs({ page: 1, pageSize: 20 }),
        apiClient.getRepositories({ favoritesOnly: true, page: 1, pageSize: 8 }),
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

      if (jobsRes.status === 'fulfilled') {
        setRecentJobs(jobsRes.value.data.filter((job) => job.status !== 'pending').slice(0, 10));
      }

      if (workspaceRes.status === 'fulfilled') {
        setWorkspaceRepositories(workspaceRes.value.data.slice(0, 8));
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
  const jobStatusVariantMap = {
    pending: 'warning',
    processing: 'info',
    completed: 'success',
    failed: 'error',
    cancelled: 'default',
  } as const;
  const jobStatusLabelMap = {
    pending: '排队中',
    processing: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
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
  const trendWindows: Array<{ key: TrendWindowKey; label: string; minutes?: number }> = [
    { key: '10m', label: '最近 10 分钟', minutes: 10 },
    { key: '30m', label: '最近 30 分钟', minutes: 30 },
    { key: '120m', label: '最近 2 小时', minutes: 120 },
    { key: '24h', label: '最近 24 小时', minutes: 1440 },
    { key: '3d', label: '最近 3 天', minutes: 4320 },
    { key: '7d', label: '最近 7 天', minutes: 10080 },
    { key: 'custom', label: '自定义范围' },
  ];
  const activeTrendWindowMeta = trendWindows.find((item) => item.key === activeTrendWindow) || trendWindows[1];
  const activeLlmTrendWindowMeta = trendWindows.find((item) => item.key === activeLlmTrendWindow) || trendWindows[1];
  const getFilteredHistory = (
    history: TrendSnapshot[],
    windowKey: TrendWindowKey,
    windowMeta: { minutes?: number },
    customRange: { start: string; end: string }
  ) => {
    if (history.length === 0) return [];

    if (windowKey === 'custom') {
      const startTime = customRange.start ? new Date(customRange.start).getTime() : 0;
      const endTime = customRange.end ? new Date(customRange.end).getTime() : Infinity;
      const filtered = history.filter((item) => item.timestamp >= startTime && item.timestamp <= endTime);
      return filtered.length > 0 ? fillTrendGaps(filtered) : [];
    }

    const latestTimestamp = history[history.length - 1]?.timestamp || Date.now();
    const minutes = windowMeta.minutes || 30;
    const windowStart = latestTimestamp - (minutes * 60 * 1000);
    const filtered = history.filter((item) => item.timestamp >= windowStart);
    return filtered.length > 0 ? fillTrendGaps(filtered) : history.slice(-1);
  };

  const throughputTrendHistory = useMemo(() => {
    return getFilteredHistory(trendHistory, activeTrendWindow, activeTrendWindowMeta, customThroughputRange);
  }, [activeTrendWindow, activeTrendWindowMeta, customThroughputRange, trendHistory]);

  const llmTrendHistory = useMemo(() => {
    return getFilteredHistory(trendHistory, activeLlmTrendWindow, activeLlmTrendWindowMeta, customLlmRange);
  }, [activeLlmTrendWindow, activeLlmTrendWindowMeta, customLlmRange, trendHistory]);
  const throughputValues = useMemo(
    () => buildThroughputValues(throughputTrendHistory, activeTrendMetric),
    [activeTrendMetric, throughputTrendHistory]
  );
  const llmValues = useMemo(
    () => llmTrendHistory.map((item) => item[activeLlmTrendMetric]),
    [activeLlmTrendMetric, llmTrendHistory]
  );
  const throughputStats = useMemo(
    () => buildSeriesStats(throughputValues),
    [throughputValues]
  );
  const llmStatsSeries = useMemo(
    () => buildSeriesStats(llmValues),
    [llmValues]
  );
  const isRateMetric = activeTrendMetric === 'jobsProcessed' || activeTrendMetric === 'jobsFailed';
  const throughputDisplayLabel = activeTrendMetric === 'jobsProcessed'
    ? '已处理作业速率'
    : activeTrendMetric === 'jobsFailed'
      ? '失败作业速率'
      : activeMetricMeta.label;
  const throughputDisplayUnit = activeTrendMetric === 'avgProcessingTime'
    ? activeMetricMeta.unit || 's'
    : isRateMetric
      ? '个/分钟'
      : activeMetricMeta.unit || '';
  const throughputNeedDecimal = activeTrendMetric === 'avgProcessingTime' || isRateMetric;
  const throughputOption = useMemo<EChartsOption>(() => {
    const valueFormatter = (value: number) => {
      if (throughputNeedDecimal) {
        return Number(value).toFixed(2);
      }
      return Math.floor(value).toLocaleString('zh-CN');
    };
    return {
      animationDuration: 360,
      grid: { left: 44, right: 18, top: 18, bottom: 34 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
        textStyle: { color: '#e2e8f0' },
        formatter: (params: unknown) => {
          const first = Array.isArray(params) ? params[0] : params;
          const dataIndex = typeof first === 'object' && first && 'dataIndex' in first ? Number((first as { dataIndex: number }).dataIndex) : 0;
          const value = typeof first === 'object' && first && 'value' in first ? Number((first as { value: number }).value) : 0;
          const timestamp = throughputTrendHistory[dataIndex]?.timestamp;
          return `${formatClock(timestamp)}<br/>${throughputDisplayLabel}：${valueFormatter(value)}${throughputDisplayUnit}`;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: throughputTrendHistory.map((item) => formatClockMinute(item.timestamp)),
        axisLine: { lineStyle: { color: '#94a3b8' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748b' },
      },
      yAxis: {
        type: 'value',
        name: throughputDisplayUnit ? `单位 ${throughputDisplayUnit}` : '数值',
        nameTextStyle: { color: '#64748b', fontSize: 11, padding: [0, 0, 0, 8] },
        splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
        axisLabel: {
          color: '#64748b',
          formatter: (value: number) => `${valueFormatter(value)}${throughputDisplayUnit}`,
        },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: throughputValues,
          lineStyle: { width: 3, color: '#06b6d4' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(6,182,212,0.35)' },
                { offset: 1, color: 'rgba(6,182,212,0.02)' },
              ],
            },
          },
        },
      ],
    };
  }, [throughputNeedDecimal, throughputTrendHistory, throughputValues, throughputDisplayLabel, throughputDisplayUnit]);
  const llmOption = useMemo<EChartsOption>(() => {
    return {
      animationDuration: 360,
      grid: { left: 52, right: 18, top: 18, bottom: 34 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
        textStyle: { color: '#e2e8f0' },
        formatter: (params: unknown) => {
          const first = Array.isArray(params) ? params[0] : params;
          const dataIndex = typeof first === 'object' && first && 'dataIndex' in first ? Number((first as { dataIndex: number }).dataIndex) : 0;
          const value = typeof first === 'object' && first && 'value' in first ? Number((first as { value: number }).value) : 0;
          const timestamp = llmTrendHistory[dataIndex]?.timestamp;
          return `${formatClock(timestamp)}<br/>${activeLlmMetricMeta.label}：${value.toLocaleString('zh-CN')}`;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: llmTrendHistory.map((item) => formatClockMinute(item.timestamp)),
        axisLine: { lineStyle: { color: '#94a3b8' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748b' },
      },
      yAxis: {
        type: 'value',
        name: 'Token',
        nameTextStyle: { color: '#64748b', fontSize: 11, padding: [0, 0, 0, 8] },
        splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
        axisLabel: {
          color: '#64748b',
          formatter: (value: number) => Number(value).toLocaleString('zh-CN'),
        },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: llmValues,
          lineStyle: { width: 3, color: '#8b5cf6' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(139,92,246,0.35)' },
                { offset: 1, color: 'rgba(139,92,246,0.02)' },
              ],
            },
          },
        },
      ],
    };
  }, [activeLlmMetricMeta.label, llmTrendHistory, llmValues]);

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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {throughputDisplayLabel} 趋势
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    周期 {activeTrendWindowMeta.label} · 样本 {throughputTrendHistory.length} 条 · 北京时间{isRateMetric ? ' · 由累计值换算为每分钟增量' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeTrendWindow === 'custom' && (
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900">
                      <input
                        type="datetime-local"
                        value={customThroughputRange.start}
                        onChange={(e) => setCustomThroughputRange((prev) => ({ ...prev, start: e.target.value }))}
                        className="bg-transparent text-slate-900 outline-none dark:text-slate-100"
                      />
                      <span className="text-slate-400">-</span>
                      <input
                        type="datetime-local"
                        value={customThroughputRange.end}
                        onChange={(e) => setCustomThroughputRange((prev) => ({ ...prev, end: e.target.value }))}
                        className="bg-transparent text-slate-900 outline-none dark:text-slate-100"
                      />
                    </div>
                  )}
                  <select
                    value={activeTrendWindow}
                    onChange={(e) => {
                      const val = e.target.value as TrendWindowKey;
                      setActiveTrendWindow(val);
                      if (val === 'custom' && !customThroughputRange.start && trendHistory.length > 0) {
                        const first = trendHistory[0];
                        const last = trendHistory[trendHistory.length - 1];
                        if (first && last) {
                          setCustomThroughputRange({
                            start: toIsoStringLocal(first.timestamp),
                            end: toIsoStringLocal(last.timestamp),
                          });
                        }
                      }
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700"
                  >
                    {trendWindows.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {throughputStats.hasData ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-2xl border border-cyan-100 bg-gradient-to-b from-cyan-50/80 to-white p-2 dark:border-cyan-900/40 dark:from-cyan-950/40 dark:to-slate-950">
                    <EChartLine option={throughputOption} />
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                    <span className="min-w-0 truncate">
                      最新值 {formatTrendValue(throughputStats.latest, throughputNeedDecimal, throughputDisplayUnit)} · 更新时间 {formatClock(lastUpdatedAt)}
                    </span>
                    <span className="min-w-0 truncate sm:text-right">
                      最小值 {formatTrendValue(throughputStats.min, throughputNeedDecimal, throughputDisplayUnit)} · 最大值 {formatTrendValue(throughputStats.max, throughputNeedDecimal, throughputDisplayUnit)}
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {activeLlmMetricMeta.label} 趋势
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    周期 {activeLlmTrendWindowMeta.label} · 样本 {llmTrendHistory.length} 条 · 北京时间
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeLlmTrendWindow === 'custom' && (
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900">
                      <input
                        type="datetime-local"
                        value={customLlmRange.start}
                        onChange={(e) => setCustomLlmRange((prev) => ({ ...prev, start: e.target.value }))}
                        className="bg-transparent text-slate-900 outline-none dark:text-slate-100"
                      />
                      <span className="text-slate-400">-</span>
                      <input
                        type="datetime-local"
                        value={customLlmRange.end}
                        onChange={(e) => setCustomLlmRange((prev) => ({ ...prev, end: e.target.value }))}
                        className="bg-transparent text-slate-900 outline-none dark:text-slate-100"
                      />
                    </div>
                  )}
                  <select
                    value={activeLlmTrendWindow}
                    onChange={(e) => {
                      const val = e.target.value as TrendWindowKey;
                      setActiveLlmTrendWindow(val);
                      if (val === 'custom' && !customLlmRange.start && trendHistory.length > 0) {
                        const first = trendHistory[0];
                        const last = trendHistory[trendHistory.length - 1];
                        if (first && last) {
                          setCustomLlmRange({
                            start: toIsoStringLocal(first.timestamp),
                            end: toIsoStringLocal(last.timestamp),
                          });
                        }
                      }
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700"
                  >
                    {trendWindows.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {llmStatsSeries.hasData ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-b from-violet-50/80 to-white p-2 dark:border-violet-900/40 dark:from-violet-950/40 dark:to-slate-950">
                    <EChartLine option={llmOption} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="min-w-0 truncate">最新值 {formatTokenCount(llmStatsSeries.latest)} · {formatClock(lastUpdatedAt)}</span>
                    <span className="min-w-0 truncate text-right">最小值 {formatTokenCount(llmStatsSeries.min)} · 最大值 {formatTokenCount(llmStatsSeries.max)}</span>
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="min-w-0 rounded-[28px]">
          <CardHeader>
            <CardTitle>最近执行的作业</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentJobs.length > 0 ? recentJobs.map((job) => (
              <div
                key={job.id}
                className="grid gap-3 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/60 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link href={`/dashboard/jobs/${job.id}`} className="text-sm font-semibold text-slate-900 hover:text-cyan-700 dark:text-slate-100 dark:hover:text-cyan-300">
                      Job #{job.id}
                    </Link>
                    <Badge variant={jobStatusVariantMap[job.status]}>{jobStatusLabelMap[job.status]}</Badge>
                    {job.triggerSource && <Badge variant="default">{job.triggerSource}</Badge>}
                  </div>
                  <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                    {job.repoName ? `${job.repoName}${job.prNumber ? ` · PR #${job.prNumber}` : ''}` : '未关联仓库'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {job.prTitle || '无标题'}{job.errorMessage ? ` · ${job.errorMessage}` : ''}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 lg:justify-end lg:text-right">
                  <span className="truncate">创建于 {formatShortDateTime(job.createdAt)}</span>
                  <span className="truncate">
                    {job.completedAt ? `结束于 ${formatShortDateTime(job.completedAt)}` : job.startedAt ? `开始于 ${formatShortDateTime(job.startedAt)}` : '等待执行'}
                  </span>
                </div>
              </div>
            )) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                暂无最近执行作业。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-[28px]">
          <CardHeader>
            <CardTitle>工作空间仓库</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {workspaceRepositories.length > 0 ? (
              <div className="grid gap-3 2xl:grid-cols-2">
                {workspaceRepositories.map((repo) => (
                  <Link
                    key={repo.id}
                    href={`/dashboard/repositories/${repo.id}`}
                    className="group min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-sm dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.9))]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950 group-hover:text-cyan-700 dark:text-slate-100 dark:group-hover:text-cyan-300">
                          {repo.fullName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {repo.language || '未知语言'}
                        </p>
                      </div>
                      <Badge variant="info">{repo.platform}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>Star {repo.stars ?? 0}</span>
                      <span>Fork {repo.forks ?? 0}</span>
                      <span>{repo.watchEnabled ? 'Watch 开启' : 'Watch 关闭'}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                工作空间还没有已收藏仓库，可以先去仓库页加入。
              </div>
            )}
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
                description: '统一管理管理员密码、认证连接和 LLM API',
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
