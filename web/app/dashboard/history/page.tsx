'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { Platform, PullRequestHistoryItem, PullRequestReviewJob, PullRequestReviewStatus, PullRequestRiskLevel } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Badge } from '@/components/ui/Badge';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const platformNames: Record<Platform, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

const reviewStatusConfig: Record<PullRequestReviewStatus, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  not_started: { label: '未开始', variant: 'default' },
  pending: { label: '排队中', variant: 'warning' },
  processing: { label: 'Review 中', variant: 'info' },
  completed: { label: '已完成', variant: 'success' },
  failed: { label: '失败', variant: 'error' },
};

const riskConfig: Record<PullRequestRiskLevel, { label: string; className: string }> = {
  low: { label: '低风险', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50' },
  medium: { label: '中风险', className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50' },
  high: { label: '高风险', className: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900/50' },
  critical: { label: '严重风险', className: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50' },
  unknown: { label: '未知', className: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700' },
};

const jobStatusConfig: Record<PullRequestReviewJob['status'], { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  pending: { label: '等待', variant: 'warning' },
  processing: { label: '进行中', variant: 'info' },
  completed: { label: '完成', variant: 'success' },
  failed: { label: '失败', variant: 'error' },
  cancelled: { label: '取消', variant: 'default' },
  dead: { label: '死信', variant: 'error' },
};

const triggerSourceLabel: Record<NonNullable<PullRequestReviewJob['triggerSource']>, string> = {
  manual: '手动',
  watch: 'Watch',
  webhook: 'Webhook',
  unknown: '未知',
};

type FilterOption = { key: string; label: string };

function formatDate(dateString?: string) {
  if (!dateString) {
    return '--';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });
}

function renderCommitLabel(commit?: string) {
  if (!commit) {
    return '未记录';
  }
  return commit.length > 8 ? commit.slice(0, 8) : commit;
}

export default function AnalysisHistoryPage() {
  const { error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [pullRequests, setPullRequests] = useState<PullRequestHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>('all');
  const pageSize = 20;

  const loadPullRequests = useCallback(async (currentPage = 1, currentFilter = filter) => {
    try {
      setIsLoading(true);
      const params: { page: number; pageSize: number; status?: string; platform?: string } = {
        page: currentPage,
        pageSize,
      };

      if (currentFilter === 'github' || currentFilter === 'gitee' || currentFilter === 'gitlab') {
        params.platform = currentFilter;
      } else if (currentFilter !== 'all') {
        params.status = currentFilter;
      }

      const response = await apiClient.getPullRequestHistory(params);
      setPullRequests(response.data);
      setTotal(response.total);
      setPage(currentPage);
      setFilter(currentFilter);
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法获取 PR 历史';
      error('加载失败', message);
    } finally {
      setIsLoading(false);
    }
  }, [error, filter]);

  useEffect(() => {
    void loadPullRequests();
  }, [loadPullRequests]);

  const totalPages = Math.ceil(total / pageSize);
  const stats = useMemo(() => ({
    pullRequests: pullRequests.length,
    jobs: pullRequests.reduce((sum, item) => sum + item.jobCount, 0),
    reports: pullRequests.reduce((sum, item) => sum + item.reports.length, 0),
    watchedRepositories: new Set(
      pullRequests
        .filter((item) => item.repositoryWatchEnabled)
        .map((item) => item.repositoryFullName)
    ).size,
  }), [pullRequests]);

  const filterOptions: FilterOption[] = [
    { key: 'all', label: '全部' },
    { key: 'github', label: 'GitHub' },
    { key: 'gitee', label: 'Gitee' },
    { key: 'gitlab', label: 'GitLab' },
    { key: 'pending', label: '等待中' },
    { key: 'processing', label: '分析中' },
    { key: 'completed', label: '已完成' },
    { key: 'failed', label: '失败' },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.86))] shadow-sm dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.16),_transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.88))]">
        <div className="flex flex-col gap-8 px-6 py-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              Pull Request History
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              按 PR 维度回看 Review 历史
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              每一条记录都按 Pull Request 聚合展示，能直接看到这个 PR 一共触发了多少个 Job、每个 Job 对应哪个 commit，以及最后产出了哪份报告。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: '本页 PR', value: stats.pullRequests },
              { label: '关联 Jobs', value: stats.jobs },
              { label: '可查看报告', value: stats.reports },
              { label: '开启 Watch 的仓库', value: stats.watchedRepositories },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/70 bg-white/75 px-4 py-4 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/50">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Card className="border-slate-200/80 dark:border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((filterOption) => (
              <button
                key={filterOption.key}
                onClick={() => void loadPullRequests(1, filterOption.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  filterOption.key === filter
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {filterOption.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading && pullRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <Loading size="lg" text="加载 PR 历史..." />
          </CardContent>
        </Card>
      ) : pullRequests.length > 0 ? (
        <>
          <div className="space-y-4">
            {pullRequests.map((item) => {
              const reviewConfig = reviewStatusConfig[item.reviewStatus];
              const risk = riskConfig[item.latestRiskLevel];

              return (
                <Card key={`${item.platform}:${item.repositoryFullName}#${item.prNumber}`} className="overflow-hidden border-slate-200/80 shadow-sm dark:border-slate-800">
                  <CardContent className="p-0">
                    <div className="border-l-4 border-l-blue-500 px-5 py-5 dark:border-l-blue-400">
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="default" size="sm">{platformNames[item.platform]}</Badge>
                            <Badge variant={reviewConfig.variant}>{reviewConfig.label}</Badge>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${risk.className}`}>
                              {risk.label}
                            </span>
                            {item.repositoryWatchEnabled && <Badge variant="info">Watch</Badge>}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                            <Link
                              href={item.repositoryId ? `/dashboard/repositories/${item.repositoryId}` : '/dashboard/repositories'}
                              className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                            >
                              {item.repositoryFullName}
                            </Link>
                            <span className="text-sm text-slate-400 dark:text-slate-500">/</span>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 truncate text-lg font-semibold text-slate-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                            >
                              #{item.prNumber} {item.title}
                            </a>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
                            <span>作者 {item.author}</span>
                            <span>最近活动 {formatDate(item.lastActivityAt)}</span>
                            <span>最近报告 {formatDate(item.lastReviewedAt)}</span>
                          </div>

                          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Latest Job</p>
                              <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                                {item.latestReviewJobId ? `#${item.latestReviewJobId}` : '--'}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {item.latestReviewJobStatus || '暂无'} · {formatDate(item.latestReviewJobCreatedAt)}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Jobs / Reports</p>
                              <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">{item.jobCount} / {item.reports.length}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                共 {item.issueCount} 个问题，{item.commentCount} 条评论
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Latest Commit</p>
                              <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">{renderCommitLabel(item.latestHeadCommit)}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Review 进度 {item.reviewProgress}%
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Latest Risk</p>
                              <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">{risk.label}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {item.latestRiskSummary || '暂无风险摘要'}
                              </p>
                            </div>
                          </div>

                          <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                            <div className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/50">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950 dark:text-white">Job 时间线</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">按更新时间展示每次 review 触发、对应 commit 与输出报告。</p>
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{item.jobCount} 个</span>
                              </div>

                              {item.jobs.length > 0 ? (
                                <div className="mt-4 space-y-3">
                                  {item.jobs.map((job) => {
                                    const jobStatus = jobStatusConfig[job.status];
                                    const linkedReport = job.report;
                                    return (
                                      <div key={job.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                          <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <Badge variant={jobStatus.variant}>{jobStatus.label}</Badge>
                                              <Link href={`/dashboard/jobs/${job.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                                                Job #{job.id}
                                              </Link>
                                              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white dark:bg-slate-200 dark:text-slate-900">
                                                {renderCommitLabel(job.shortHeadCommit || job.headCommit)}
                                              </span>
                                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                                {triggerSourceLabel[job.triggerSource || 'unknown']}
                                              </span>
                                            </div>
                                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                              更新时间 {formatDate(job.updatedAt)}
                                              {job.errorMessage ? ` · ${job.errorMessage}` : ''}
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            {linkedReport ? (
                                              <Link
                                                href={`/dashboard/reports/${linkedReport.analysisId}`}
                                                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                              >
                                                报告 #{linkedReport.analysisId}
                                              </Link>
                                            ) : (
                                              <span className="inline-flex items-center rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
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
                                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                  这个 PR 还没有已记录的 review job。
                                </div>
                              )}
                            </div>

                            <div className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/50">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950 dark:text-white">Review 报告</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">每次完成的 review 结果都保留在这里。</p>
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{item.reports.length} 份</span>
                              </div>

                              {item.reports.length > 0 ? (
                                <div className="mt-4 space-y-3">
                                  {item.reports.map((report) => {
                                    const reportRisk = riskConfig[report.riskLevel];
                                    return (
                                      <div key={report.analysisId} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${reportRisk.className}`}>
                                            {reportRisk.label}
                                          </span>
                                          <Badge variant={report.status === 'completed' ? 'success' : report.status === 'failed' ? 'error' : 'warning'}>
                                            {report.status}
                                          </Badge>
                                          <span className="text-xs text-slate-500 dark:text-slate-400">报告 #{report.analysisId}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{report.summary || '暂无摘要'}</p>
                                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                          {report.commentCount} 评论 / {report.issueCount} 问题 / {report.fileCount} 文件 · {formatDate(report.completedAt || report.createdAt)}
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <Link
                                            href={`/dashboard/reports/${report.analysisId}`}
                                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                          >
                                            查看报告
                                          </Link>
                                          <Link
                                            href={report.jobId ? `/dashboard/jobs/${report.jobId}` : '/dashboard/jobs'}
                                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                          >
                                            {report.jobId ? '对应 Job' : '查看 Job 列表'}
                                          </Link>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                  当前 PR 还没有产出可查看的 review 报告。
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 xl:w-44">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                          >
                            打开 PR
                          </a>
                          <Link
                            href={item.repositoryId ? `/dashboard/repositories/${item.repositoryId}` : '/dashboard/repositories'}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            仓库管理页
                          </Link>
                          <Link
                            href={item.latestReviewJobId ? `/dashboard/jobs/${item.latestReviewJobId}` : '/dashboard/jobs'}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {item.latestReviewJobId ? '查看最新 Job' : '查看 Job 列表'}
                          </Link>
                          {item.latestAnalysisId && (
                            <Link
                              href={`/dashboard/reports/${item.latestAnalysisId}`}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              最新报告
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

          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => void loadPullRequests(page - 1, filter)}
                disabled={page === 1}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                上一页
              </button>
              <span className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => void loadPullRequests(page + 1, filter)}
                disabled={page === totalPages}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                下一页
              </button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <svg className="mx-auto h-16 w-16 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4 text-slate-600 dark:text-slate-400">暂无可展示的 PR 历史</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">连接仓库并触发 review 后，这里会按 PR 维度沉淀完整历史。</p>
            <Link href="/dashboard/settings#oauth" className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400">
              前往系统设置
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
