'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { Analysis, AnalysisStatus, Platform } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const platformNames: Record<Platform, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

const statusConfigs: Record<AnalysisStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'error' }> = {
  pending: { label: '等待中', variant: 'warning' },
  processing: { label: '分析中', variant: 'info' },
  completed: { label: '已完成', variant: 'success' },
  failed: { label: '失败', variant: 'error' },
};

type FilterOption = { key: string; label: string };

export default function AnalysisHistoryPage() {
  const { success, error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>('all');
  const pageSize = 20;

  const loadAnalyses = useCallback(async (currentPage = 1, statusFilter = filter) => {
    try {
      setIsLoading(true);
      const params: { page: number; pageSize: number; status?: string; platform?: string } = { page: currentPage, pageSize };
      if (statusFilter === 'github' || statusFilter === 'gitee' || statusFilter === 'gitlab') {
        params.platform = statusFilter;
      } else if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const response = await apiClient.getAnalyses(params);
      setAnalyses(response.data);
      setTotal(response.total);
      setPage(currentPage);
      setFilter(statusFilter);
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法获取分析历史';
      error('加载失败', message);
    } finally {
      setIsLoading(false);
    }
  }, [error, filter]);

  useEffect(() => {
    loadAnalyses();
  }, [loadAnalyses]);

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '--';
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt || !completedAt) return '--';
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const diff = end - start;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}分${seconds}秒`;
  };

  const handleRetry = async (analysis: Analysis) => {
    try {
      await apiClient.retryAnalysis(analysis.id);
      success('重新触发成功', `已重新触发 ${analysis.prTitle} 的分析`);
      loadAnalyses(page, filter);
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法重新触发分析';
      error('操作失败', message);
    }
  };

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          分析历史
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          查看 Pull Request 代码审查历史记录
        </p>
      </div>

      {/* 筛选器 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((filterOption) => (
              <button
                key={filterOption.key}
                onClick={() => loadAnalyses(1, filterOption.key)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${filterOption.key === filter
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }
                `}
              >
                {filterOption.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 统计卡片 */}
      {!isLoading && analyses.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { key: 'total', label: '总分析', value: total },
            { key: 'completed', label: '已完成', value: analyses.filter(a => a.status === 'completed').length },
            { key: 'processing', label: '分析中', value: analyses.filter(a => a.status === 'processing').length },
            { key: 'failed', label: '失败', value: analyses.filter(a => a.status === 'failed').length },
            { key: 'pending', label: '等待中', value: analyses.filter(a => a.status === 'pending').length },
          ].map((stat) => (
            <Card key={stat.key}>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分析列表 */}
      {isLoading && analyses.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <Loading size="lg" text="加载中..." />
          </CardContent>
        </Card>
      ) : analyses.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4">
            {analyses.map((analysis) => {
              const statusConfig = statusConfigs[analysis.status];
              return (
                <Card key={analysis.id} className="hover:shadow-lg transition-all">
                  <CardContent className="p-5">
                    {/* 头部信息 */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={statusConfig.variant}>
                          {statusConfig.label}
                        </Badge>
                        <Badge variant="default" size="sm">
                          {platformNames[analysis.platform]}
                        </Badge>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        #{analysis.platformPrNumber}
                      </span>
                    </div>

                    {/* PR 链接 */}
                    <a
                      href={analysis.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline font-medium"
                    >
                      {analysis.prTitle}
                    </a>

                    {/* 描述 */}
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-3 mt-2">
                      {analysis.baseBranch} → {analysis.headBranch}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      作者: {analysis.prAuthor}
                    </p>

                    {/* 分析结果 */}
                    {analysis.status === 'completed' && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <div className="flex items-center gap-4 text-sm mb-2">
                          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {analysis.reviewCommentCount} 条评论
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            • {analysis.fileAnalysisCount} 个文件分析
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          完成时间: {formatDate(analysis.completedAt)}
                        </p>
                      </div>
                    )}

                    {/* 错误信息 */}
                    {analysis.status === 'failed' && analysis.errorMessage && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <div className="flex items-start gap-3 mb-2">
                          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                              分析失败
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {analysis.errorMessage}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(analysis)}
                        >
                          重试
                        </Button>
                      </div>
                    )}

                    {/* 时间信息 */}
                    <div className="flex items-center flex-wrap gap-4 pt-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>创建: {formatDate(analysis.createdAt)}</span>
                      {analysis.startedAt && (
                        <span>开始: {formatDate(analysis.startedAt)}</span>
                      )}
                      {analysis.completedAt && (
                        <span>完成: {formatDate(analysis.completedAt)}</span>
                      )}
                      {analysis.completedAt && analysis.startedAt && (
                        <span className="ml-2">
                          ({formatDuration(analysis.startedAt, analysis.completedAt)})
                        </span>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="pt-4">
                      <a
                        href={analysis.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M10 2V6a2 2 0 00-2-2h-2a2 2 0 00-2-2z" />
                        </svg>
                        查看 PR
                      </a>
                      {analysis.status === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-2"
                          onClick={() => handleRetry(analysis)}
                        >
                          重试分析
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => loadAnalyses(page - 1, filter)}
                disabled={page === 1}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-gray-800"
              >
                上一页
              </button>
              <span className="px-4 py-2 text-gray-700 dark:text-gray-300">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => loadAnalyses(page + 1, filter)}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-gray-800"
              >
                下一页
              </button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <svg className="w-20 h-20 mx-auto text-gray-400 dark:text-gray-600 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-600 dark:text-gray-400 mt-4 mb-2">
              暂无分析记录
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              提交 Pull Request 后，分析将自动开始
            </p>
            <a
              href="/dashboard/settings#oauth"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-4"
            >
              前往系统设置
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
