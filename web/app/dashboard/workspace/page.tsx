'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatDateTime as formatDateTimeValue } from '@/lib/datetime';
import type { Platform, Repository } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const platformNames: Record<Platform, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

const platformThemes: Record<Platform, { chip: string; glow: string; border: string }> = {
  github: {
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
    glow: 'from-emerald-100/70 via-white to-sky-50 dark:from-emerald-950/40 dark:via-slate-950 dark:to-slate-950',
    border: 'border-emerald-200/80 dark:border-emerald-900/40',
  },
  gitee: {
    chip: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/60',
    glow: 'from-rose-100/70 via-white to-orange-50 dark:from-rose-950/40 dark:via-slate-950 dark:to-slate-950',
    border: 'border-rose-200/80 dark:border-rose-900/40',
  },
  gitlab: {
    chip: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900/60',
    glow: 'from-orange-100/70 via-white to-amber-50 dark:from-orange-950/40 dark:via-slate-950 dark:to-slate-950',
    border: 'border-orange-200/80 dark:border-orange-900/40',
  },
};

function formatDateTime(value?: string) {
  return formatDateTimeValue(value, { withSeconds: false });
}

function formatCount(value?: number) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '--';
}

export default function WorkspacePage() {
  const { success, error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [updatingFavoriteId, setUpdatingFavoriteId] = useState<string | null>(null);
  const [updatingWatchId, setUpdatingWatchId] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getRepositories({
        favoritesOnly: true,
        page: 1,
        pageSize: 100,
      });
      setRepositories(response.data);
    } catch (err) {
      error('加载失败', err instanceof Error ? err.message : '无法获取工作空间仓库');
    } finally {
      setIsLoading(false);
    }
  }, [error]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  const filteredRepositories = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return repositories.filter((repo) => {
      if (!keyword) {
        return true;
      }
      return `${repo.owner}/${repo.name}`.toLowerCase().includes(keyword);
    });
  }, [repositories, searchKeyword]);

  const workspaceStats = useMemo(() => ({
    total: repositories.length,
    watched: repositories.filter((repo) => repo.watchEnabled).length,
    connected: repositories.filter((repo) => repo.webhookUrl).length,
    languages: new Set(
      repositories
        .map((repo) => repo.language)
        .filter((language): language is string => Boolean(language))
    ).size,
  }), [repositories]);

  const handleToggleFavorite = useCallback(async (repo: Repository) => {
    try {
      setUpdatingFavoriteId(repo.id);
      const response = await apiClient.setRepositoryFavorite(repo.id, !repo.favorite);
      setRepositories((current) => current.filter((item) => item.id !== repo.id || response.data.favorite));
      success(
        response.data.favorite ? '已加入工作空间' : '已移出工作空间',
        `${repo.fullName} ${response.data.favorite ? '仍保留在工作空间中' : '已从工作空间列表移除'}`
      );
    } catch (err) {
      error('更新失败', err instanceof Error ? err.message : '无法更新收藏状态');
    } finally {
      setUpdatingFavoriteId(null);
    }
  }, [error, success]);

  const handleToggleWatch = useCallback(async (repo: Repository) => {
    try {
      setUpdatingWatchId(repo.id);
      const response = await apiClient.setRepositoryWatch(repo.id, !repo.watchEnabled);
      setRepositories((current) => current.map((item) => (
        item.id === repo.id ? response.data : item
      )));
      success(
        response.data.watchEnabled ? 'Watch 已开启' : 'Watch 已关闭',
        `${repo.fullName} ${response.data.watchEnabled ? '现在会自动监听 PR 更新' : '已停止自动监听'}`
      );
    } catch (err) {
      error('更新失败', err instanceof Error ? err.message : '无法更新 Watch 状态');
    } finally {
      setUpdatingWatchId(null);
    }
  }, [error, success]);

  if (isLoading) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] shadow-[0_30px_90px_-48px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_26%),linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.94))]">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              My Workspace
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              收藏仓库工作台
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              这里聚合你最常管理的仓库。页面直接使用本地缓存里的收藏数据，不额外按平台同步或筛选，适合快速进入常用仓库的管理流。
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              按加入时间直出全部常用仓库
            </div>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '工作空间', value: workspaceStats.total, tone: 'text-slate-950 dark:text-white' },
                { label: 'Watch 已开启', value: workspaceStats.watched, tone: 'text-violet-700 dark:text-violet-300' },
                { label: 'Webhook 已连', value: workspaceStats.connected, tone: 'text-emerald-700 dark:text-emerald-300' },
                { label: '语言覆盖', value: workspaceStats.languages, tone: 'text-sky-700 dark:text-sky-300' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{stat.label}</p>
                  <p className={`mt-3 text-3xl font-semibold ${stat.tone}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                Search
              </span>
              <div className="relative">
                <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="按 owner/repo 搜索收藏仓库"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-11 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-950 dark:focus:ring-blue-950/40"
                />
              </div>
            </label>
          </div>
        </div>
      </section>

      {filteredRepositories.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredRepositories.map((repo) => {
            const theme = platformThemes[repo.platform];
            return (
              <Card key={repo.id} className={`overflow-hidden border ${theme.border} bg-white/95 shadow-sm dark:bg-slate-950/80`}>
                <CardContent className="p-0">
                  <div className={`bg-gradient-to-br ${theme.glow} p-5`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${theme.chip}`}>
                            {platformNames[repo.platform]}
                          </span>
                          <Badge variant={repo.watchEnabled ? 'info' : 'default'} size="sm">
                            {repo.watchEnabled ? 'Watch 已开启' : 'Watch 未开启'}
                          </Badge>
                          {repo.private ? <Badge variant="warning" size="sm">私有仓库</Badge> : null}
                        </div>

                        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                          {repo.owner}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                          <Link href={`/dashboard/repositories/${repo.id}`} className="transition hover:text-slate-700 dark:hover:text-slate-200">
                            {repo.name}
                          </Link>
                        </h2>
                        <p className="mt-3 min-h-[3.5rem] text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {repo.description || '已加入工作空间，建议补充仓库描述，方便后续识别职责和优先级。'}
                        </p>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-white/70 bg-white/85 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Signals</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                              <div className="flex items-center justify-between gap-3">
                                <span>语言</span>
                                <span className="font-medium text-slate-950 dark:text-white">{repo.language || '--'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>最近同步</span>
                                <span className="font-medium text-slate-950 dark:text-white">{formatDateTime(repo.lastSyncedAt)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>加入时间</span>
                                <span className="font-medium text-slate-950 dark:text-white">{formatDateTime(repo.favoritedAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/70 bg-white/85 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Metrics</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                              <div className="flex items-center justify-between gap-3">
                                <span>Stars</span>
                                <span className="font-medium text-slate-950 dark:text-white">{formatCount(repo.stars)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>Forks</span>
                                <span className="font-medium text-slate-950 dark:text-white">{formatCount(repo.forks)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>PR 数</span>
                                <span className="font-medium text-slate-950 dark:text-white">{formatCount(repo.pullRequests)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row gap-2 lg:flex-col lg:items-end">
                        <button
                          type="button"
                          onClick={() => void handleToggleFavorite(repo)}
                          disabled={updatingFavoriteId === repo.id}
                          className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                            repo.favorite
                              ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                          } ${updatingFavoriteId === repo.id ? 'cursor-wait opacity-70' : ''}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {repo.favorite ? '移出工作空间' : '加入工作空间'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleWatch(repo)}
                          disabled={updatingWatchId === repo.id}
                          className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                            repo.watchEnabled
                              ? 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                          } ${updatingWatchId === repo.id ? 'cursor-wait opacity-70' : ''}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m4-2a8 8 0 11-16 0 8 8 0 0116 0z" />
                          </svg>
                          {repo.watchEnabled ? '关闭 Watch' : '开启 Watch'}
                        </button>
                        {repo.htmlUrl ? (
                          <a
                            href={repo.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                          >
                            源仓库
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden border-dashed border-slate-300 dark:border-slate-700">
          <CardContent className="py-16 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-300">
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="mt-6 text-lg font-medium text-slate-900 dark:text-white">工作空间还是空的</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              先去仓库列表把常用仓库加入工作空间，这里就会形成你的专属管理工作台。
            </p>
            <Link
              href="/dashboard/repositories"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              前往仓库管理
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
