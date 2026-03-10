'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/datetime';
import type { AnalysisJob } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const statusColors = {
  pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200',
  processing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200',
  completed: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
  failed: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
  cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
} as const;

const statusLabels = {
  pending: '等待中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
} as const;

const jobTypeLabels: Record<AnalysisJob['type'], string> = {
  analyze_pr: 'PR Review',
  sync_repository: '上下文分析',
  refresh_oauth: '代码审查',
};

const triggerSourceLabels: Record<NonNullable<AnalysisJob['triggerSource']>, string> = {
  manual: '手动触发',
  watch: 'Watch 触发',
  webhook: 'Webhook 触发',
};

export default function JobsPage() {
  const { success, error } = useNotificationHelpers();
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [stats, setStats] = useState<{ pending: number; processing: number; completed: number; failed: number } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>('all');
  const pageSize = 20;

  const loadJobs = useCallback(async (currentPage = 1, statusFilter = filter) => {
    try {
      const params: { page: number; pageSize: number; status?: string } = { page: currentPage, pageSize };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const [jobsRes, statsRes] = await Promise.allSettled([
        apiClient.getJobs(params),
        apiClient.getJobStats(),
      ]);

      if (jobsRes.status === 'fulfilled') {
        setJobs(jobsRes.value.data);
        setTotal(jobsRes.value.total);
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }
      setPage(currentPage);
      setFilter(statusFilter);
    } catch (err) {
      error('加载失败', err instanceof Error ? err.message : '无法获取作业列表');
    }
  }, [error, filter]);

  const handleCancel = async (jobId: string) => {
    if (!confirm('确定要取消此作业吗？')) {
      return;
    }

    try {
      await apiClient.cancelJob(jobId);
      success('取消成功', '作业已取消');
      loadJobs(page, filter);
    } catch (err) {
      error('取消失败', err instanceof Error ? err.message : '无法取消作业');
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      const response = await apiClient.retryJob(jobId);
      success('重试成功', `已创建新的作业 #${response.data.jobId}`);
      await loadJobs(page, filter);
    } catch (err) {
      error('重试失败', err instanceof Error ? err.message : '无法重试作业');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadJobs();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadJobs]);

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (dateString?: string) => formatDateTime(dateString);

  const formatDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt || !completedAt) return '--';
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const seconds = (end - start) / 1000;
    return `${seconds.toFixed(1)}s`;
  };

  const getJobHeadline = (job: AnalysisJob) => {
    if (job.prTitle) {
      return job.prTitle;
    }
    if (job.prNumber && job.repoName) {
      return `${job.repoName} · PR #${job.prNumber}`;
    }
    if (job.prNumber) {
      return `PR #${job.prNumber}`;
    }
    return jobTypeLabels[job.type];
  };

  const getJobMeta = (job: AnalysisJob) => {
    if (job.repoName && job.prNumber) {
      return `${job.repoName} · PR #${job.prNumber}`;
    }
    if (job.repoName) {
      return job.repoName;
    }
    return jobTypeLabels[job.type];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          作业状态
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          查看和管理代码审查作业
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">等待中</p>
              <p className="mt-1 text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {stats.pending || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">处理中</p>
              <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.processing || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">已完成</p>
              <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.completed || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">失败</p>
              <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
                {stats.failed || 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'processing', 'completed', 'failed', 'cancelled'] as const).map((status) => (
              <button
                key={status}
                onClick={() => loadJobs(1, status)}
                className={`
                  rounded-md px-4 py-2 text-sm font-medium transition-colors
                  ${filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }
                `}
              >
                {status === 'all' ? '全部' : statusLabels[status]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {jobs.length > 0 ? (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge className={statusColors[job.status]}>
                            {statusLabels[job.status]}
                          </Badge>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {jobTypeLabels[job.type]}
                          </span>
                          {job.triggerSource ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {triggerSourceLabels[job.triggerSource]}
                            </span>
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/jobs/${job.id}`}
                            className="block truncate text-lg font-semibold text-gray-900 transition-colors hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                          >
                            Job #{job.id} · {getJobHeadline(job)}
                          </Link>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {getJobMeta(job)}
                          </p>
                        </div>

                        <div className="mt-3 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                          <p>创建时间: {formatDate(job.createdAt)}</p>
                          {job.startedAt ? <p>开始时间: {formatDate(job.startedAt)}</p> : null}
                          {job.completedAt ? (
                            <p>
                              完成时间: {formatDate(job.completedAt)} · 耗时: {formatDuration(job.startedAt, job.completedAt)}
                            </p>
                          ) : null}
                          {job.errorMessage ? (
                            <p className="text-red-600 dark:text-red-400">
                              错误: {job.errorMessage}
                            </p>
                          ) : null}
                          <p>尝试次数: {job.attempts} / {job.maxAttempts}</p>
                        </div>
                      </div>

                      {job.status === 'pending' || job.status === 'processing' ? (
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancel(job.id)}
                          >
                            手动终止
                          </Button>
                        </div>
                      ) : job.status === 'failed' || job.status === 'cancelled' || job.status === 'completed' ? (
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleRetry(job.id)}
                          >
                            重试
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {totalPages > 1 ? (
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => loadJobs(page - 1, filter)}
                disabled={page === 1}
                className="rounded-md border border-gray-300 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
              >
                上一页
              </button>
              <span className="px-4 py-2 text-gray-700 dark:text-gray-300">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => loadJobs(page + 1, filter)}
                disabled={page === totalPages}
                className="rounded-md border border-gray-300 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
              >
                下一页
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <svg className="mx-auto mb-4 h-16 w-16 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <p className="text-gray-600 dark:text-gray-400">
              暂无作业记录
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
