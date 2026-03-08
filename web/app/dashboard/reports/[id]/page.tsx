'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/datetime';
import type { ReviewFinding, ReviewReportCodeLine, ReviewReportDetail, ReviewReportFileContext } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const riskBadgeMap: Record<ReviewReportDetail['riskLevel'], 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error',
  unknown: 'default',
};

const severityBadgeMap: Record<ReviewFinding['severity'], 'error' | 'warning' | 'info'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'info',
};

const severityPanelMap: Record<ReviewFinding['severity'], string> = {
  critical: 'border-red-300/90 bg-red-50/90 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
  high: 'border-rose-300/90 bg-rose-50/90 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-100',
  medium: 'border-amber-300/90 bg-amber-50/90 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100',
  low: 'border-sky-300/90 bg-sky-50/90 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100',
};

const lineToneMap: Record<ReviewReportCodeLine['type'], string> = {
  add: 'bg-emerald-50/80 dark:bg-emerald-950/20',
  delete: 'bg-rose-50/75 dark:bg-rose-950/20',
  context: 'bg-white dark:bg-slate-950/80',
  omitted: 'bg-slate-50/80 dark:bg-slate-900/80',
};

const formatDate = (value?: string) => formatDateTime(value);

function getFindingLineLabel(finding: ReviewFinding) {
  const resolved = finding.resolvedLineNumber || finding.lineNumber;
  return resolved ? `${finding.filePath}:${resolved}` : finding.filePath;
}

function renderFindingCard(finding: ReviewFinding, key: string, compact = false) {
  const paddingClass = compact ? 'p-3' : 'p-4';

  return (
    <div
      key={key}
      className={`rounded-2xl border ${paddingClass} ${severityPanelMap[finding.severity]}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={severityBadgeMap[finding.severity]} size="sm">
          {finding.severity}
        </Badge>
        <Badge variant="default" size="sm">
          {finding.category}
        </Badge>
        {finding.source && (
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            {finding.source}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-semibold">{finding.title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700/90 dark:text-slate-200/90">{finding.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600/90 dark:text-slate-300/90">
        <span>{getFindingLineLabel(finding)}</span>
        {finding.suggestion && <span>建议：{finding.suggestion}</span>}
      </div>
    </div>
  );
}

function renderCodeLine(line: ReviewReportCodeLine, index: number) {
  if (line.type === 'omitted') {
    return (
      <div
        key={`omitted-${index}`}
        className="grid grid-cols-[72px_72px_minmax(0,1fr)] border-t border-slate-200/70 dark:border-slate-800/80"
      >
        <div className="col-span-3 px-4 py-2 text-center font-mono text-xs text-slate-500 dark:text-slate-400">
          {line.content}
        </div>
      </div>
    );
  }

  const codeCellClass = [
    'grid grid-cols-[72px_72px_minmax(0,1fr)] border-t border-slate-200/70 dark:border-slate-800/80',
    lineToneMap[line.type],
  ].join(' ');

  return (
    <div key={`${line.type}-${line.oldLineNumber ?? 'x'}-${line.newLineNumber ?? 'x'}-${index}`}>
      <div className={codeCellClass}>
        <div className="select-none border-r border-slate-200/70 px-3 py-2 text-right font-mono text-xs text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
          {line.oldLineNumber ?? ''}
        </div>
        <div className="select-none border-r border-slate-200/70 px-3 py-2 text-right font-mono text-xs text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
          {line.newLineNumber ?? ''}
        </div>
        <pre className="overflow-x-auto px-4 py-2 text-[12.5px] leading-6 text-slate-800 dark:text-slate-100">
          <code className="font-mono">{line.content || ' '}</code>
        </pre>
      </div>
      {line.findings.map((finding, findingIndex) => (
        <div
          key={`${finding.title}-${findingIndex}`}
          className="grid grid-cols-[72px_72px_minmax(0,1fr)] border-t border-slate-200/70 bg-white dark:border-slate-800/80 dark:bg-slate-950/90"
        >
          <div className="border-r border-slate-200/70 dark:border-slate-800/80" />
          <div className="border-r border-slate-200/70 dark:border-slate-800/80" />
          <div className="px-4 py-3">
            {renderFindingCard(finding, `${finding.title}-${findingIndex}`, true)}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderFileContext(context: ReviewReportFileContext) {
  const statusLabel = context.status || 'modified';

  return (
    <Card
      key={context.filePath}
      className="overflow-hidden rounded-3xl border-slate-200/80 bg-white/95 shadow-[0_20px_70px_-44px_rgba(15,23,42,0.55)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/80"
      padding="none"
    >
      <CardContent className="p-0">
        <div className="border-b border-slate-200/80 bg-slate-50/75 px-5 py-4 dark:border-slate-800/80 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default" size="sm">
                  {statusLabel}
                </Badge>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {context.language}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{context.filePath}</h3>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {context.fileSummary || '该文件的 patch 已加载，可查看具体问题与代码位置。'}
              </p>
            </div>
            <div className="grid min-w-[220px] grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                <div className="text-xs uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">+</div>
                <div className="mt-1 text-base font-semibold text-emerald-900 dark:text-emerald-100">{context.additions}</div>
              </div>
              <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-3 py-3 dark:border-rose-900/60 dark:bg-rose-950/20">
                <div className="text-xs uppercase tracking-[0.14em] text-rose-700 dark:text-rose-300">-</div>
                <div className="mt-1 text-base font-semibold text-rose-900 dark:text-rose-100">{context.deletions}</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3 dark:border-slate-800/80 dark:bg-slate-950/80">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">问题</div>
                <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{context.totalFindings}</div>
              </div>
            </div>
          </div>
        </div>

        {context.generalFindings.length > 0 && (
          <div className="space-y-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800/80">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                未精确定位的问题
              </h4>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                这些问题暂时无法绑定到具体行号
              </span>
            </div>
            <div className="space-y-3">
              {context.generalFindings.map((finding, index) =>
                renderFindingCard(finding, `${context.filePath}-general-${index}`, true)
              )}
            </div>
          </div>
        )}

        {context.patchAvailable ? (
          <div className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-950 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:border-slate-800/80">
              GitHub-style review frame
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">{context.lines.map(renderCodeLine)}</div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
            当前报告没有可用 patch，上面仅展示问题说明。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReviewReportPage() {
  const params = useParams<{ id: string }>();
  const reportId = params?.id;
  const { error } = useNotificationHelpers();
  const [report, setReport] = useState<ReviewReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadReport = useCallback(async () => {
    if (!reportId) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await apiClient.getReviewReport(reportId);
      setReport(response.data);
    } catch (err) {
      error('加载失败', err instanceof Error ? err.message : '无法获取审查报告');
    } finally {
      setIsLoading(false);
    }
  }, [error, reportId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const overallFindings = useMemo(
    () => report?.findings.filter((finding) => finding.filePath === 'PR_OVERALL') || [],
    [report?.findings]
  );

  const severitySummary = useMemo(() => {
    return (report?.findings || []).reduce(
      (accumulator, finding) => {
        accumulator[finding.severity] += 1;
        return accumulator;
      },
      { critical: 0, high: 0, medium: 0, low: 0 } satisfies Record<ReviewFinding['severity'], number>
    );
  }, [report?.findings]);

  const highlightedFileContexts = useMemo(
    () => report?.fileContexts.filter((context) => context.totalFindings > 0) || [],
    [report?.fileContexts]
  );

  if (isLoading && !report) {
    return <Loading />;
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-gray-500 dark:text-gray-400">
          报告不存在
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.16),_transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] shadow-[0_30px_120px_-60px_rgba(15,23,42,0.75)] dark:border-slate-800/80 dark:bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_36%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.92))]">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="space-y-4">
            <Link href="/dashboard/history" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回分析历史
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Review 报告 #{report.analysis.id}
              </h1>
              <Badge variant={riskBadgeMap[report.riskLevel]}>{report.riskLevel}</Badge>
              <Badge
                variant={
                  report.analysis.status === 'completed'
                    ? 'success'
                    : report.analysis.status === 'failed'
                      ? 'error'
                      : 'warning'
                }
              >
                {report.analysis.status}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium text-slate-900 dark:text-slate-100">{report.analysis.prTitle}</p>
              <p className="max-w-4xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                {report.summary || '暂无摘要。'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-3xl border border-white/70 bg-white/75 p-4 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/55">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">生成时间</p>
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                {formatDate(report.generatedAt || report.analysis.completedAt || report.analysis.createdAt)}
              </p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/75 p-4 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/55">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">总体统计</p>
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                {report.issueCount} 问题 / {report.commentCount} 评论 / {report.fileCount} 文件
              </p>
            </div>
            <div className="flex gap-3 sm:col-span-2 lg:col-span-1">
              {report.jobId && (
                <Link
                  href={`/dashboard/jobs/${report.jobId}`}
                  className="inline-flex flex-1 items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                >
                  查看作业详情
                </Link>
              )}
              <a
                href={report.analysis.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                打开 PR
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card
          className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/96 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.5)] dark:border-slate-800/80 dark:bg-slate-950/85"
          padding="none"
        >
          <CardContent className="p-0">
            <div className="border-b border-slate-200/80 px-6 py-5 dark:border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Rendered Markdown</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-100">PR 审查报告</h2>
                </div>
                <span className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  GitHub-style prose
                </span>
              </div>
            </div>
            <div className="px-6 py-6">
              {report.reportMarkdown ? (
                <div className="[&_a]:text-teal-700 [&_a]:no-underline hover:[&_a]:underline [&_blockquote]:rounded-r-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-teal-400 [&_blockquote]:bg-teal-50/70 [&_blockquote]:px-5 [&_blockquote]:py-3 [&_blockquote]:text-slate-700 dark:[&_blockquote]:bg-teal-950/25 dark:[&_blockquote]:text-slate-200 [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.92em] [&_code]:font-medium [&_code]:text-slate-700 dark:[&_code]:bg-slate-800 dark:[&_code]:text-slate-100 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-10 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-3 [&_h2]:text-xl [&_h2]:font-semibold dark:[&_h2]:border-slate-800 [&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1.5 [&_ol]:pl-5 [&_p]:my-4 [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-slate-800 [&_pre]:bg-slate-950 [&_pre]:px-4 [&_pre]:py-4 [&_pre]:text-[13px] [&_pre]:leading-6 [&_pre]:text-slate-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:block [&_table]:overflow-x-auto [&_table]:rounded-2xl [&_table]:border [&_table]:border-slate-200 dark:[&_table]:border-slate-800 [&_tbody_tr:nth-child(odd)]:bg-slate-50/80 dark:[&_tbody_tr:nth-child(odd)]:bg-slate-900/50 [&_td]:border-t [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 dark:[&_td]:border-slate-800 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left dark:[&_th]:bg-slate-900">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report.reportMarkdown}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  当前报告没有 Markdown 内容。
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 xl:sticky xl:top-6">
          <Card className="rounded-[28px] border-slate-200/80 bg-white/96 dark:border-slate-800/80 dark:bg-slate-950/85">
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Severity mix</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {(['critical', 'high', 'medium', 'low'] as Array<ReviewFinding['severity']>).map((severity) => (
                    <div key={severity} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800/80 dark:bg-slate-900/70">
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant={severityBadgeMap[severity]} size="sm">
                          {severity}
                        </Badge>
                        <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {severitySummary[severity]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {overallFindings.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    PR 级问题
                  </p>
                  {overallFindings.map((finding, index) => renderFindingCard(finding, `overall-${index}`, true))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200/80 bg-white/96 dark:border-slate-800/80 dark:bg-slate-950/85">
            <CardContent className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Raw Findings
              </p>
              <div className="space-y-3">
                {report.findings.length > 0 ? (
                  report.findings
                    .filter((finding) => finding.filePath !== 'PR_OVERALL')
                    .slice(0, 6)
                    .map((finding, index) => renderFindingCard(finding, `raw-${index}`, true))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    没有具体问题记录。
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Code Review Lens</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
              问题代码与上下文
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            有行号的问题会直接挂在对应代码行下方；没有精确定位的信息会保留在文件级问题区。
          </p>
        </div>

        <div className="space-y-5">
          {highlightedFileContexts.length > 0 ? (
            highlightedFileContexts.map(renderFileContext)
          ) : (
            <Card>
              <CardContent className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                这份报告还没有生成可展示的代码上下文。
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
