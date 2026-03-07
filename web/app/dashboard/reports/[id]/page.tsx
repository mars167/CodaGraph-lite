'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import type { ReviewReportDetail } from '@/types';
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

  const markdownBlocks = useMemo(() => report?.reportMarkdown?.split('\n') || [], [report?.reportMarkdown]);

  const formatDate = (value?: string) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('zh-CN', { hour12: false });
  };

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
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/dashboard/history" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回分析历史
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Review 报告 #{report.analysis.id}</h1>
          <Badge variant={riskBadgeMap[report.riskLevel]}>{report.riskLevel}</Badge>
          <Badge variant={report.analysis.status === 'completed' ? 'success' : report.analysis.status === 'failed' ? 'error' : 'warning'}>
            {report.analysis.status}
          </Badge>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{report.analysis.prTitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardContent className="p-5">
            <p className="text-sm uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">摘要</p>
            <p className="mt-3 text-base leading-7 text-gray-700 dark:text-gray-200">{report.summary || '暂无摘要'}</p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>生成时间：{formatDate(report.generatedAt || report.analysis.completedAt || report.analysis.createdAt)}</span>
              <span>问题数：{report.issueCount}</span>
              <span>评论数：{report.commentCount}</span>
              <span>文件数：{report.fileCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">跳转</p>
            {report.jobId && (
              <Link href={`/dashboard/jobs/${report.jobId}`} className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
                查看作业详情
              </Link>
            )}
            <a href={report.analysis.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              打开 PR
            </a>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">问题清单</h2>
          <div className="mt-4 space-y-4">
            {report.findings.length > 0 ? report.findings.map((finding, index) => (
              <div key={`${finding.filePath}-${index}`} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={finding.severity === 'critical' || finding.severity === 'high' ? 'error' : finding.severity === 'medium' ? 'warning' : 'info'}>
                    {finding.severity}
                  </Badge>
                  <Badge variant="default">{finding.category}</Badge>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{finding.title}</span>
                </div>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{finding.description}</p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{finding.filePath}{finding.lineNumber ? `:${finding.lineNumber}` : ''}</p>
                {finding.suggestion && <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">建议：{finding.suggestion}</p>}
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                这次 review 没有记录到具体问题。
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {markdownBlocks.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Markdown 报告</h2>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-4 text-sm leading-6 text-gray-100">
              {markdownBlocks.join('\n')}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
