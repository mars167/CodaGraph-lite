'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/datetime';
import type { Analysis, AnalysisJob, JobLog } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const statusVariantMap: Record<AnalysisJob['status'], 'warning' | 'info' | 'success' | 'error'> = {
  pending: 'warning',
  processing: 'info',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
};

const levelStyleMap: Record<JobLog['level'], {
  badge: string;
  row: string;
  accent: string;
}> = {
  info: {
    badge: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
    row: 'border-cyan-400/10 hover:bg-cyan-400/5',
    accent: 'text-cyan-300',
  },
  warn: {
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    row: 'border-amber-400/10 hover:bg-amber-400/5',
    accent: 'text-amber-300',
  },
  error: {
    badge: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
    row: 'border-rose-400/10 hover:bg-rose-400/5',
    accent: 'text-rose-300',
  },
};

const jobTypeLabels: Record<AnalysisJob['type'], string> = {
  analyze_pr: 'PR Review',
  sync_repository: '上下文分析',
  refresh_oauth: '代码审查',
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;
  const { success, error } = useNotificationHelpers();
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!jobId) {
      return;
    }

    try {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const [detailResponse, logResponse] = await Promise.all([
        apiClient.getJobDetail(jobId),
        apiClient.getJobLogs(jobId),
      ]);

      setJob(detailResponse.data.job);
      setAnalysis(detailResponse.data.analysis || null);
      setLogs(logResponse.data.logs);
    } catch (err) {
      error('加载失败', err instanceof Error ? err.message : '无法获取作业详情');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [error, jobId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isLive = useMemo(() => job?.status === 'pending' || job?.status === 'processing', [job?.status]);

  useEffect(() => {
    if (!isLive) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadData(true);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isLive, loadData]);

  const formatDate = (value?: string) => formatDateTime(value);
  const formatTerminalTime = (value?: string) => formatDateTime(value, { withSeconds: true });

  const handleCancel = async () => {
    if (!job) {
      return;
    }

    try {
      await apiClient.cancelJob(job.id);
      success('已发送终止请求', `作业 #${job.id} 将尽快停止`);
      await loadData(true);
    } catch (err) {
      error('终止失败', err instanceof Error ? err.message : '无法终止作业');
    }
  };

  const handleRetry = async () => {
    if (!job) {
      return;
    }

    try {
      const response = await apiClient.retryJob(job.id);
      success('重试成功', `已创建新的作业 #${response.data.jobId}`);
    } catch (err) {
      error('重试失败', err instanceof Error ? err.message : '无法重试作业');
    }
  };

  if (isLoading && !job) {
    return <Loading />;
  }

  if (!job) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/jobs" className="text-sm text-blue-600 hover:underline dark:text-blue-400">返回作业列表</Link>
        <Card><CardContent className="py-16 text-center text-gray-500 dark:text-gray-400">作业不存在</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Link href="/dashboard/jobs" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            返回作业列表
          </Link>
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
              作业 #{job.id}{analysis?.prTitle ? ` · ${analysis.prTitle}` : ''}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">查看实时状态和实时日志。{isLive ? '当前作业进行中，页面自动刷新。' : '当前作业已结束。'}</p>
          </div>
        </div>
        <button
          onClick={() => void loadData(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          刷新
        </button>
        {job.status === 'pending' || job.status === 'processing' ? (
          <Button variant="danger" onClick={() => void handleCancel()}>
            手动终止
          </Button>
        ) : (
          <Button onClick={() => void handleRetry()}>
            重试
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariantMap[job.status]}>{job.status}</Badge>
              <Badge variant="default">{jobTypeLabels[job.type]}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm text-gray-600 dark:text-gray-300 md:grid-cols-2">
              <p>创建时间: {formatDate(job.createdAt)}</p>
              <p>开始时间: {formatDate(job.startedAt)}</p>
              <p>完成时间: {formatDate(job.completedAt)}</p>
              <p>尝试次数: {job.attempts} / {job.maxAttempts}</p>
            </div>
            {job.errorMessage && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">{job.errorMessage}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">关联分析</p>
            {analysis ? (
              <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <p className="font-medium">PR #{analysis.platformPrNumber}</p>
                <p className="line-clamp-2">{analysis.prTitle}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{analysis.platform}</p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/dashboard/history" className="inline-flex text-sm text-blue-600 hover:underline dark:text-blue-400">查看分析历史</Link>
                  <Link href={`/dashboard/reports/${analysis.id}`} className="inline-flex text-sm text-blue-600 hover:underline dark:text-blue-400">查看 Review 报告</Link>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">暂无关联分析记录</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">日志条数</p>
            <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">{logs.length}</p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">最后更新: {formatDate(logs.at(-1)?.createdAt)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="overflow-hidden rounded-3xl border border-slate-800 bg-[#08111f] p-0 shadow-[0_28px_90px_-44px_rgba(2,6,23,0.95)]">
          <div className="relative border-b border-slate-800/90 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_38%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.98))] px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-400/90" />
                  <span className="h-3 w-3 rounded-full bg-amber-300/90" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400/90" />
                  <span className="ml-3 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-200">
                    job-console
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-50">实时日志</h2>
                <p className="mt-1 text-sm text-slate-400">
                  终端流式视图，展示 review worker 生命周期、推理节点和工具调用摘要。
                </p>
              </div>
              <div className="grid min-w-[220px] grid-cols-2 gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                  <div>entries</div>
                  <div className="mt-2 text-2xl tracking-normal text-slate-100">{logs.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                  <div>session</div>
                  <div className={`mt-2 text-sm tracking-[0.24em] ${isLive ? 'text-emerald-300' : 'text-slate-200'}`}>
                    {isLive ? 'TAILING' : 'CLOSED'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative bg-[linear-gradient(180deg,_rgba(2,6,23,0.96),_rgba(2,6,23,1))]">
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:100%_28px]" />
            {logs.length > 0 ? (
              <div className="relative max-h-[620px] overflow-y-auto font-mono">
                {logs.map((log, index) => {
                  const styles = levelStyleMap[log.level];
                  const prompt = log.message.startsWith('[tool]') ? '$' : log.level === 'error' ? '!' : '>';

                  return (
                    <div
                      key={log.id}
                      className={`grid grid-cols-[116px_96px_24px_minmax(0,1fr)] items-start gap-3 border-b px-5 py-3 text-sm transition-colors ${styles.row} ${index === logs.length - 1 ? 'shadow-[inset_0_-1px_0_rgba(15,23,42,0)]' : ''}`}
                    >
                      <div className="pt-0.5 text-[11px] tracking-[0.08em] text-slate-500">
                        {formatTerminalTime(log.createdAt)}
                      </div>
                      <div>
                        <span className={`inline-flex min-w-[72px] items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.badge}`}>
                          {log.level}
                        </span>
                      </div>
                      <div className={`pt-0.5 text-base font-semibold ${styles.accent}`}>
                        {prompt}
                      </div>
                      <div className="min-w-0">
                        <pre className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-100">
                          <code>{log.message}</code>
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="relative px-5 py-10 font-mono text-sm text-slate-500">
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 px-5 py-8 text-center">
                  [ console idle ] 暂无日志输出
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
