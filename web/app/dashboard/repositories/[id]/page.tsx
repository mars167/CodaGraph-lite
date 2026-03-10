'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import type { Repository, RepositoryPullRequest } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const reviewStatusConfig: Record<RepositoryPullRequest['reviewStatus'], { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  not_started: { label: '未开始', variant: 'default' },
  pending: { label: '排队中', variant: 'warning' },
  processing: { label: 'Review 中', variant: 'info' },
  completed: { label: '已完成', variant: 'success' },
  failed: { label: '失败', variant: 'error' },
};

const riskConfig: Record<RepositoryPullRequest['latestRiskLevel'], { label: string; className: string }> = {
  low: { label: '低风险', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-900/50' },
  medium: { label: '中风险', className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-900/50' },
  high: { label: '高风险', className: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:ring-orange-900/50' },
  critical: { label: '严重风险', className: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-900/50' },
  unknown: { label: '未知', className: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700' },
};

const prStateConfig: Record<RepositoryPullRequest['state'], { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-900/50' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700' },
  merged: { label: 'Merged', className: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-900/50' },
};

const jobStatusConfig: Record<RepositoryPullRequest['jobs'][number]['status'], { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  pending: { label: '等待', variant: 'warning' },
  processing: { label: '进行中', variant: 'info' },
  completed: { label: '完成', variant: 'success' },
  failed: { label: '失败', variant: 'error' },
  cancelled: { label: '取消', variant: 'default' },
  dead: { label: '死信', variant: 'error' },
};

const triggerSourceLabel: Record<NonNullable<RepositoryPullRequest['jobs'][number]['triggerSource']>, string> = {
  manual: '手动',
  watch: 'Watch',
  webhook: 'Webhook',
  unknown: '未知',
};

export default function RepositoryPullRequestsPage() {
  const params = useParams<{ id: string }>();
  const repositoryId = params?.id;
  const { success, error } = useNotificationHelpers();
  const [repository, setRepository] = useState<Repository | null>(null);
  const [pullRequests, setPullRequests] = useState<RepositoryPullRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reviewingPr, setReviewingPr] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [isUpdatingWatch, setIsUpdatingWatch] = useState(false);

  const loadPullRequests = useCallback(async (silent = false) => {
    if (!repositoryId) {
      return;
    }

    try {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const response = await apiClient.getRepositoryPullRequests(repositoryId, {
        state: stateFilter,
        page: 1,
        pageSize: 20,
      });

      setRepository(response.data.repository);
      setPullRequests(response.data.pullRequests);
    } catch (err) {
      error('加载失败', err instanceof Error ? err.message : '无法获取 PR 列表');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [error, repositoryId, stateFilter]);

  useEffect(() => {
    void loadPullRequests();
  }, [loadPullRequests]);

  const hasRunningReview = useMemo(
    () => pullRequests.some((pr) => pr.reviewStatus === 'pending' || pr.reviewStatus === 'processing'),
    [pullRequests]
  );

  useEffect(() => {
    if (!hasRunningReview) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadPullRequests(true);
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [hasRunningReview, loadPullRequests]);

  const handleStartReview = async (pr: RepositoryPullRequest, mode: 'normal' | 'improve' = 'normal') => {
    if (!repositoryId) {
      return;
    }

    try {
      setReviewingPr(`${pr.prNumber}:${mode}`);
      const response = await apiClient.startRepositoryPullRequestReview(repositoryId, pr.prNumber, mode);
      success(
        response.data.created ? (mode === 'improve' ? '已开始 Improve Review' : '已开始 Review') : '未重复触发',
        response.data.jobId
          ? `PR #${pr.prNumber} ${response.data.message}，作业 #${response.data.jobId}${mode === 'improve' ? '，将记录详细 trace' : ''}`
          : `PR #${pr.prNumber} ${response.data.message}`
      );
      await loadPullRequests(true);
    } catch (err) {
      error('启动失败', err instanceof Error ? err.message : '无法启动 PR Review');
    } finally {
      setReviewingPr(null);
    }
  };

  const formatDate = (value?: string) => {
    if (!value) {
      return '--';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '--';
    }

    return date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
  };

  const formatCommit = (value?: string) => {
    if (!value) {
      return '未记录';
    }
    return value.length > 8 ? value.slice(0, 8) : value;
  };

  const handleToggleWatch = async () => {
    if (!repository) {
      return;
    }

    try {
      setIsUpdatingWatch(true);
      const response = await apiClient.setRepositoryWatch(repository.id, !repository.watchEnabled);
      setRepository(response.data);
      success(
        response.data.watchEnabled ? 'Watch 已开启' : 'Watch 已关闭',
        `${response.data.fullName} ${response.data.watchEnabled ? '现在会每分钟检查 PR 更新' : '已停止自动检查 PR 更新'}`
      );
    } catch (err) {
      error('更新失败', err instanceof Error ? err.message : '无法更新仓库 Watch 状态');
    } finally {
      setIsUpdatingWatch(false);
    }
  };

  if (isLoading && !repository) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Link href="/dashboard/repositories" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回仓库列表
          </Link>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
              {repository?.fullName || '仓库 PR 列表'}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              实时读取平台 PR 列表，并展示最近一次 review 的状态、作业和风险等级。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {repository && (
            <button
              type="button"
              onClick={() => void handleToggleWatch()}
              disabled={isUpdatingWatch}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                repository.watchEnabled
                  ? 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:border-violet-800 dark:hover:bg-violet-950/70'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
              } ${isUpdatingWatch ? 'cursor-wait opacity-70' : ''}`}
            >
              <svg className={`h-4 w-4 ${isUpdatingWatch ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m4-2a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
              {repository.watchEnabled ? '关闭 Watch' : '开启 Watch'}
            </button>
          )}
          <button
            onClick={() => void loadPullRequests(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新 PR
          </button>
          {repository?.htmlUrl && (
            <a
              href={repository.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              打开仓库
            </a>
          )}
        </div>
      </div>

      {repository && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Repository</p>
                  <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{repository.fullName}</h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{repository.description || '暂无仓库描述'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {repository.private && <Badge variant="default">私有</Badge>}
                  {repository.language && <Badge variant="info">{repository.language}</Badge>}
                  <Badge variant={repository.watchEnabled ? 'info' : 'default'}>
                    {repository.watchEnabled ? 'Watch 已开启' : 'Watch 未开启'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Star / Fork</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{repository.stars ?? 0} / {repository.forks ?? 0}</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">缓存更新时间：{formatDate(repository.lastSyncedAt)}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Watch 检查：{formatDate(repository.watchLastCheckedAt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">PR 统计</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{pullRequests.length}</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{hasRunningReview ? '存在 review 进行中，页面自动刷新' : '当前无进行中的 review'}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {(['open', 'all', 'closed'] as const).map((state) => (
              <button
                key={state}
                onClick={() => setStateFilter(state)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${stateFilter === state ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                {state === 'open' ? 'Open PR' : state === 'all' ? '全部' : '已关闭'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {pullRequests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
            当前筛选下没有 PR。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pullRequests.map((pr) => {
            const reviewConfig = reviewStatusConfig[pr.reviewStatus];
            const risk = riskConfig[pr.latestRiskLevel];
            const prState = prStateConfig[pr.state];

            return (
              <Card key={pr.prNumber} className="overflow-hidden border-gray-200/80 dark:border-gray-800">
                <CardContent className="p-0">
                  <div className="border-l-4 border-l-blue-500 px-5 py-4 dark:border-l-blue-400">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${prState.className}`}>{prState.label}</span>
                          <Badge variant={reviewConfig.variant}>{reviewConfig.label}</Badge>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${risk.className}`}>{risk.label}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                          <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                            #{pr.prNumber} {pr.title}
                          </a>
                          <span className="text-sm text-gray-500 dark:text-gray-400">作者 {pr.author}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-600 dark:text-gray-300 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Review Progress</p>
                            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                              <div className="h-full rounded-full bg-blue-600 transition-all dark:bg-blue-400" style={{ width: `${Math.min(100, Math.max(0, pr.reviewProgress))}%` }} />
                            </div>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{pr.reviewProgress}% {pr.analysisJobStage ? `· ${pr.analysisJobStage}` : ''}</p>
                            {pr.analysisJobMessage && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{pr.analysisJobMessage}</p>}
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Latest Review Job</p>
                            {pr.latestReviewJobId ? (
                              <Link
                                href={`/dashboard/jobs/${pr.latestReviewJobId}`}
                                className="mt-2 inline-flex font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                #{pr.latestReviewJobId}
                              </Link>
                            ) : (
                              <p className="mt-2 font-medium text-gray-900 dark:text-white">--</p>
                            )}
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{pr.latestReviewJobStatus || '暂无'} · {formatDate(pr.latestReviewJobCreatedAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Latest Risk</p>
                            <p className="mt-2 font-medium text-gray-900 dark:text-white">{risk.label}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{pr.latestRiskSummary || '暂无风险摘要'}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Review Result</p>
                            <p className="mt-2 font-medium text-gray-900 dark:text-white">{pr.commentCount} 评论 / {pr.issueCount} 问题 / {pr.fileCount} 文件</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">最近完成：{formatDate(pr.lastReviewedAt)}</p>
                          </div>
                        </div>
                        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                          <div className="rounded-2xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Job 时间线</p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">查看这个 PR 被触发过多少次 review，每次对应哪个 commit 与报告。</p>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{pr.jobCount} 个</span>
                            </div>
                            {pr.jobs.length > 0 ? (
                              <div className="mt-3 space-y-3">
                                {pr.jobs.map((job) => {
                                  const jobStatus = jobStatusConfig[job.status];
                                  return (
                                    <div key={job.id} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950/60">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant={jobStatus.variant}>{jobStatus.label}</Badge>
                                            <Link href={`/dashboard/jobs/${job.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                                              Job #{job.id}
                                            </Link>
                                            <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white dark:bg-gray-200 dark:text-gray-900">
                                              {formatCommit(job.shortHeadCommit || job.headCommit)}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                              {triggerSourceLabel[job.triggerSource || 'unknown']}
                                            </span>
                                          </div>
                                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                            更新时间 {formatDate(job.updatedAt)}
                                            {job.errorMessage ? ` · ${job.errorMessage}` : ''}
                                          </p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-2">
                                          {job.report ? (
                                            <Link
                                              href={`/dashboard/reports/${job.report.analysisId}`}
                                              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                            >
                                              报告 #{job.report.analysisId}
                                            </Link>
                                          ) : (
                                            <span className="inline-flex items-center rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                              暂无报告
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-3 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                当前 PR 还没有已记录的 review job。
                              </div>
                            )}
                          </div>

                          <div className="rounded-2xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Review 报告</p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">每次完成的 review 都会生成独立报告，可回看历史结论。</p>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{pr.reports.length} 份</span>
                            </div>
                            {pr.reports.length > 0 ? (
                              <div className="mt-3 space-y-3">
                                {pr.reports.map((report) => {
                                  const reportRisk = riskConfig[report.riskLevel];
                                  return (
                                    <div key={report.analysisId} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950/60">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${reportRisk.className}`}>{reportRisk.label}</span>
                                        <Badge variant={report.status === 'completed' ? 'success' : report.status === 'failed' ? 'error' : 'warning'}>
                                          {report.status}
                                        </Badge>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">报告 #{report.analysisId}</span>
                                      </div>
                                      <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{report.summary || '暂无摘要'}</p>
                                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        {report.commentCount} 评论 / {report.issueCount} 问题 / {report.fileCount} 文件 · {formatDate(report.completedAt || report.createdAt)}
                                      </p>
                                      <div className="mt-3 flex shrink-0 flex-wrap gap-2">
                                        <Link
                                          href={`/dashboard/reports/${report.analysisId}`}
                                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                        >
                                          查看报告
                                        </Link>
                                        <Link
                                          href={report.jobId ? `/dashboard/jobs/${report.jobId}` : '/dashboard/jobs'}
                                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                        >
                                          {report.jobId ? '跳转 Job' : '查看 Job 列表'}
                                        </Link>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-3 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                当前 PR 还没有可查看的 review 报告。
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2 xl:w-44">
                        <Button
                          onClick={() => void handleStartReview(pr, 'normal')}
                          loading={reviewingPr === `${pr.prNumber}:normal`}
                          disabled={reviewingPr !== null || pr.reviewStatus === 'processing'}
                        >
                          {pr.reviewStatus === 'not_started' ? '开始 Review' : '重新 Review'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => void handleStartReview(pr, 'improve')}
                          disabled={reviewingPr !== null || pr.reviewStatus === 'processing'}
                          className="inline-flex items-center justify-center rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:bg-cyan-950/70"
                        >
                          Improve Review
                        </button>
                        <Link
                          href={pr.latestReviewJobId ? `/dashboard/jobs/${pr.latestReviewJobId}` : '/dashboard/jobs'}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          {pr.latestReviewJobId ? '查看实时 Job' : '查看 Job 列表'}
                        </Link>
                        {pr.latestAnalysisId && (
                          <Link
                            href="/dashboard/history"
                            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            查看历史
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
