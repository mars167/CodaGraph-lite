'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { Repository, Platform } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Badge } from '@/components/ui/Badge';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const platformNames: Record<Platform, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

const platformThemes: Record<Platform, {
  pill: string;
  accent: string;
  soft: string;
  button: string;
  link: string;
}> = {
  github: {
    pill: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
    accent: 'bg-emerald-600 dark:bg-emerald-400',
    soft: 'from-emerald-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-900 dark:to-emerald-950/30',
    button: 'border-emerald-200 bg-white text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900/60 dark:bg-gray-900 dark:text-emerald-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30',
    link: 'text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200',
  },
  gitee: {
    pill: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-white',
    accent: 'bg-rose-500 dark:bg-rose-400',
    soft: 'from-rose-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-900 dark:to-rose-950/30',
    button: 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-gray-900 dark:text-rose-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/30',
    link: 'text-rose-700 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200',
  },
  gitlab: {
    pill: 'bg-orange-500 text-white dark:bg-orange-400 dark:text-slate-950',
    accent: 'bg-orange-500 dark:bg-orange-400',
    soft: 'from-orange-50 via-white to-amber-50 dark:from-gray-900 dark:via-gray-900 dark:to-orange-950/30',
    button: 'border-orange-200 bg-white text-orange-700 hover:border-orange-300 hover:bg-orange-50 dark:border-orange-900/60 dark:bg-gray-900 dark:text-orange-300 dark:hover:border-orange-800 dark:hover:bg-orange-950/30',
    link: 'text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200',
  },
};

function formatDateTime(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatCount(value?: number) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '--';
}

export default function RepositoriesPage() {
  const { success, error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Platform>('github');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [updatingWatchId, setUpdatingWatchId] = useState<string | null>(null);
  const [updatingFavoriteId, setUpdatingFavoriteId] = useState<string | null>(null);
  const pageSize = 20;

  const loadRepositories = useCallback(async (currentPage = 1, platformFilter = filter) => {
    try {
      setIsLoading(true);
      const params: { page: number; pageSize: number; platform?: string } = {
        page: currentPage,
        pageSize,
        platform: platformFilter,
      };
      const response = await apiClient.getRepositories(params);
      setRepositories(response.data);
      setTotal(response.total);
      setPage(currentPage);
      setFilter(platformFilter);
    } catch (err) {
      error('加载失败', err instanceof Error ? err.message : '无法获取仓库列表');
    } finally {
      setIsLoading(false);
    }
  }, [error, filter]);

  useEffect(() => {
    loadRepositories();
  }, [loadRepositories]);

  const filteredRepositories = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return repositories;
    }

    return repositories.filter((repo) => {
      const fullName = `${repo.owner}/${repo.name}`.toLowerCase();
      return fullName.includes(keyword);
    });
  }, [repositories, searchKeyword]);

  const repositoryInsights = useMemo(() => {
    const visible = filteredRepositories.length;
    const privateCount = filteredRepositories.filter((repo) => repo.private).length;
    const connectedCount = filteredRepositories.filter((repo) => Boolean(repo.webhookUrl)).length;
    const watchedCount = filteredRepositories.filter((repo) => Boolean(repo.watchEnabled)).length;
    const favoriteCount = filteredRepositories.filter((repo) => Boolean(repo.favorite)).length;
    const languageCount = new Set(
      filteredRepositories
        .map((repo) => repo.language)
        .filter((language): language is string => Boolean(language))
    ).size;

    return {
      visible,
      privateCount,
      connectedCount,
      watchedCount,
      favoriteCount,
      languageCount,
    };
  }, [filteredRepositories]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeTheme = platformThemes[filter];

  const handleToggleWatch = useCallback(async (repo: Repository) => {
    try {
      setUpdatingWatchId(repo.id);
      const response = await apiClient.setRepositoryWatch(repo.id, !repo.watchEnabled);
      setRepositories((current) => current.map((item) => (
        item.id === repo.id ? response.data : item
      )));
      success(
        response.data.watchEnabled ? 'Watch 已开启' : 'Watch 已关闭',
        `${repo.fullName} ${response.data.watchEnabled ? '现在会每分钟检查 PR 更新' : '已停止自动检查 PR 更新'}`
      );
    } catch (err) {
      error('更新失败', err instanceof Error ? err.message : '无法更新仓库 Watch 状态');
    } finally {
      setUpdatingWatchId(null);
    }
  }, [error, success]);

  const handleToggleFavorite = useCallback(async (repo: Repository) => {
    try {
      setUpdatingFavoriteId(repo.id);
      const response = await apiClient.setRepositoryFavorite(repo.id, !repo.favorite);
      setRepositories((current) => current.map((item) => (
        item.id === repo.id ? response.data : item
      )));
      success(
        response.data.favorite ? '已加入工作空间' : '已移出工作空间',
        `${repo.fullName} ${response.data.favorite ? '已加入收藏仓库列表' : '已从收藏仓库列表移除'}`
      );
    } catch (err) {
      error('更新失败', err instanceof Error ? err.message : '无法更新仓库收藏状态');
    } finally {
      setUpdatingFavoriteId(null);
    }
  }, [error, success]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200/80 bg-white shadow-[0_22px_60px_-40px_rgba(15,23,42,0.45)] dark:border-gray-800 dark:bg-gray-900">
        <CardContent className="p-0">
          <div className={`relative overflow-hidden bg-gradient-to-br ${activeTheme.soft}`}>
            <div className="absolute inset-0 opacity-70">
              <div className="absolute -left-20 top-0 h-40 w-40 rounded-full bg-white/70 blur-3xl dark:bg-white/5" />
              <div className="absolute right-0 top-8 h-56 w-56 rounded-full bg-blue-100/60 blur-3xl dark:bg-blue-500/10" />
              <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-emerald-100/60 blur-3xl dark:bg-emerald-500/10" />
            </div>

            <div className="relative grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] lg:px-8 lg:py-7">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  Repository Console
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                  仓库管理
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-gray-300 sm:text-base">
                  当前视图聚焦 {platformNames[filter]} 仓库。先筛平台，再按 owner/repo 搜索，最后直接进入每个仓库的 PR 流水线。
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    { label: '平台仓库', value: total.toLocaleString('zh-CN'), tone: 'text-slate-950 dark:text-white' },
                    { label: '当前结果', value: repositoryInsights.visible.toLocaleString('zh-CN'), tone: activeTheme.link },
                    { label: '收藏仓库', value: repositoryInsights.favoriteCount.toLocaleString('zh-CN'), tone: 'text-amber-700 dark:text-amber-300' },
                    { label: 'Watch 中', value: repositoryInsights.watchedCount.toLocaleString('zh-CN'), tone: 'text-violet-700 dark:text-violet-300' },
                    { label: 'Webhook 已连', value: repositoryInsights.connectedCount.toLocaleString('zh-CN'), tone: 'text-emerald-700 dark:text-emerald-300' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
                    >
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">
                        {item.label}
                      </p>
                      <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-gray-950/70 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">筛选器</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                      平台切换会重新读取列表，搜索在当前平台结果内即时过滤。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href="/dashboard/workspace"
                      className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:border-amber-800"
                    >
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="m9.049 2.927.951 1.927 2.126.309a1 1 0 0 1 .554 1.706l-1.539 1.5.364 2.118a1 1 0 0 1-1.451 1.054L8 10.347l-1.902.999a1 1 0 0 1-1.451-1.054l.364-2.118-1.539-1.5a1 1 0 0 1 .554-1.706l2.126-.309.951-1.927a1 1 0 0 1 1.792 0Z" />
                      </svg>
                      我的工作空间
                    </Link>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                      {platformNames[filter]}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {(['github', 'gitee', 'gitlab'] as const).map((platform) => {
                    const isActive = filter === platform;
                    return (
                      <button
                        key={platform}
                        onClick={() => loadRepositories(1, platform)}
                        className={[
                          'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200',
                          isActive
                            ? `${platformThemes[platform].pill} border-transparent shadow-sm`
                            : platformThemes[platform].button,
                        ].join(' ')}
                      >
                        <span className={`h-2 w-2 rounded-full ${platformThemes[platform].accent}`} />
                        {platformNames[platform]}
                      </button>
                    );
                  })}
                </div>

                <label className="mt-5 block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500">
                    Search
                  </span>
                  <div className="relative">
                    <svg
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="按仓库名筛选（owner/repo）"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-11 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-blue-500 dark:focus:bg-gray-950 dark:focus:ring-blue-950/40"
                    />
                  </div>
                </label>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-gray-800">
                    当前页 {page} / {totalPages}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-gray-800">
                    私有仓库 {repositoryInsights.privateCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-gray-800">
                    活跃语言 {repositoryInsights.languageCount}
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    收藏 {repositoryInsights.favoriteCount}
                  </span>
                  {searchKeyword.trim() ? (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      搜索命中 {repositoryInsights.visible}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && repositories.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <Loading size="lg" text="正在读取仓库列表..." />
          </CardContent>
        </Card>
      ) : filteredRepositories.length > 0 ? (
        <>
          <div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                Repository View
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                当前展示 {filteredRepositories.length} 个仓库
              </h2>
            </div>
          </div>

          <div className="space-y-4">
            {filteredRepositories.map((repo) => {
              const theme = platformThemes[repo.platform];
              const lastCommitText = formatDateTime(repo.lastCommitAt);

              const metrics = [
                { label: 'Stars', value: formatCount(repo.stars) },
                { label: 'Forks', value: formatCount(repo.forks) },
                { label: 'PR 数', value: formatCount(repo.pullRequests) },
              ];

              return (
                <Card
                  key={repo.id}
                  className="overflow-hidden border-slate-200/80 bg-white/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_55px_-36px_rgba(15,23,42,0.45)] dark:border-gray-800 dark:bg-gray-900/90"
                >
                  <CardContent className="p-0">
                    <div className="grid gap-0 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
                      <div className={`relative bg-gradient-to-br ${theme.soft} p-5 sm:p-6`}>
                        <div className={`absolute inset-y-0 left-0 w-1 ${theme.accent}`} />

                        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${theme.pill}`}>
                                {platformNames[repo.platform]}
                              </span>
                              <Badge variant={repo.private ? 'warning' : 'info'} size="sm">
                                {repo.private ? '私有仓库' : '公开仓库'}
                              </Badge>
                              <Badge variant={repo.webhookUrl ? 'success' : 'warning'} size="sm">
                                {repo.webhookUrl ? 'Webhook 已连接' : '待配置 Webhook'}
                              </Badge>
                              <Badge variant={repo.watchEnabled ? 'info' : 'default'} size="sm">
                                {repo.watchEnabled ? 'Watch 已开启' : 'Watch 未开启'}
                              </Badge>
                              {repo.favorite ? (
                                <Badge variant="warning" size="sm">
                                  已收藏
                                </Badge>
                              ) : null}
                              {typeof repo.active === 'boolean' ? (
                                <Badge variant={repo.active ? 'success' : 'default'} size="sm">
                                  {repo.active ? '启用中' : '已停用'}
                                </Badge>
                              ) : null}
                            </div>

                            <div className="mt-4 min-w-0">
                              <div className="flex flex-wrap items-baseline gap-2 text-sm text-slate-500 dark:text-gray-400">
                                <span className="font-medium">{repo.owner}</span>
                                <span className="text-slate-300 dark:text-gray-600">/</span>
                              </div>
                              <Link
                                href={`/dashboard/repositories/${repo.id}`}
                                className="mt-1 block truncate text-2xl font-semibold tracking-tight text-slate-950 transition-colors hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                              >
                                {repo.name}
                              </Link>
                              <p className="mt-3 min-h-[3.25rem] text-sm leading-6 text-slate-600 dark:text-gray-300">
                                {repo.description || '暂无仓库描述。建议补充一句用途说明，方便在列表里快速识别职责边界。'}
                              </p>
                            </div>

                            <div className="mt-5 grid gap-3 md:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/70">
                                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500">
                                  Repository Link
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                  <svg className="h-4 w-4 text-slate-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                  </svg>
                                  {repo.htmlUrl ? (
                                    <a
                                      href={repo.htmlUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`truncate text-sm font-medium transition-colors ${theme.link}`}
                                    >
                                      打开平台仓库
                                    </a>
                                  ) : (
                                    <span className="text-sm text-slate-500 dark:text-gray-400">
                                      暂无外链地址
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/70">
                                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500">
                                  Runtime Signals
                                </p>
                                <div className="mt-2 space-y-2 text-sm text-slate-600 dark:text-gray-300">
                                  <div className="flex items-center justify-between gap-3">
                                    <span>主语言</span>
                                    <span className="font-medium text-slate-900 dark:text-gray-100">
                                      {repo.language || '--'}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span>最近提交</span>
                                    <span className="truncate font-medium text-slate-900 dark:text-gray-100">
                                      {lastCommitText || '--'}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span>Watch 检查</span>
                                    <span className="truncate font-medium text-slate-900 dark:text-gray-100">
                                      {repo.watchLastCheckedAt ? formatDateTime(repo.watchLastCheckedAt) : '--'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-row gap-2 xl:flex-col xl:items-end">
                            <button
                              type="button"
                              onClick={() => void handleToggleFavorite(repo)}
                              disabled={updatingFavoriteId === repo.id}
                              className={[
                                'inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all',
                                repo.favorite
                                  ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:border-amber-800 dark:hover:bg-amber-950/70'
                                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800',
                                updatingFavoriteId === repo.id ? 'cursor-wait opacity-70' : '',
                              ].join(' ')}
                            >
                              {updatingFavoriteId === repo.id ? (
                                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4" fill={repo.favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m11.049 2.927.95 1.927a1 1 0 00.753.548l2.126.309a1 1 0 01.554 1.706l-1.538 1.499a1 1 0 00-.287.886l.363 2.118a1 1 0 01-1.45 1.054l-1.902-.999a1 1 0 00-.93 0l-1.902.999a1 1 0 01-1.45-1.054l.363-2.118a1 1 0 00-.287-.886L2.57 7.417a1 1 0 01.554-1.706l2.126-.309a1 1 0 00.753-.548l.95-1.927a1 1 0 011.793 0z" />
                                </svg>
                              )}
                              {repo.favorite ? '取消收藏' : '加入收藏'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleWatch(repo)}
                              disabled={updatingWatchId === repo.id}
                              className={[
                                'inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all',
                                repo.watchEnabled
                                  ? 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:border-violet-800 dark:hover:bg-violet-950/70'
                                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800',
                                updatingWatchId === repo.id ? 'cursor-wait opacity-70' : '',
                              ].join(' ')}
                            >
                              {updatingWatchId === repo.id ? (
                                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m4-2a8 8 0 11-16 0 8 8 0 0116 0z" />
                                </svg>
                              )}
                              {repo.watchEnabled ? '关闭 Watch' : '开启 Watch'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-200/80 bg-slate-50/70 dark:border-gray-800 dark:bg-gray-950/60 xl:border-l xl:border-t-0">
                        <div className="grid grid-cols-2 gap-px bg-slate-200/80 dark:bg-gray-800 sm:grid-cols-4 xl:grid-cols-2">
                          {metrics.map((metric) => (
                            <div
                              key={metric.label}
                              className="bg-white px-4 py-4 dark:bg-gray-900"
                            >
                              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                                {metric.label}
                              </p>
                              <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                                {metric.value}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                              Next Action
                            </p>
                            <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">
                              {repo.watchEnabled
                                ? '已进入每分钟轮询。发现新 PR 或 head commit 更新时，会自动创建 review job。'
                                : '进入仓库详情后，可以继续查看 PR、报告和风险摘要。'}
                            </p>
                          </div>
                          <Link
                            href={`/dashboard/repositories/${repo.id}`}
                            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-white"
                          >
                            进入
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:flex-row">
              <p className="text-sm text-slate-500 dark:text-gray-400">
                当前为第 {page} 页，共 {totalPages} 页。
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadRepositories(page - 1, filter)}
                  disabled={page === 1}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                >
                  上一页
                </button>
                <button
                  onClick={() => loadRepositories(page + 1, filter)}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                >
                  下一页
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <Card className="overflow-hidden border-dashed border-slate-300 dark:border-gray-700">
          <CardContent className="py-16 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-gray-800 dark:text-gray-500">
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <p className="mt-6 text-lg font-medium text-slate-900 dark:text-white">
              {searchKeyword.trim() ? '没有匹配的仓库' : '暂无仓库'}
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
              {searchKeyword.trim()
                ? '换一个 owner/repo 关键词试试，或者先切换到其他平台。'
                : '请先在系统设置中连接平台，仓库列表会在读取时自动刷新。'}
            </p>
            <Link
              href="/dashboard/settings#oauth"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              前往系统设置
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
