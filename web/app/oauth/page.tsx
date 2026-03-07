'use client';

import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import type { Platform } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useNotificationHelpers } from '@/contexts/NotificationContext';
import { useState } from 'react';

const platformConfigs: Record<Platform, {
  name: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}> = {
  github: {
    name: 'GitHub',
    icon: (
      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.98-.399 3-.405 1.02.006 2.04.139 3 .405 2.281-1.552 3.285-1.23 3.285-1.653 1.242-2.874 1.438-6.03 9-6.03 1-4.478 0 0-1.626.682-5.15 1.858-7.228 3.795-3.016 8.775-3.016 14.06 0 5.22-1.435 9.652 4.063 12.414.995 2.687 1.438 6.061 2.045 7.607.057.067 1.141 1.218-.005.072-.055.114-.13.114-.075 0-.163-.005-.248-.005-6.241 0-11.302-5.06-11.302-11.302s5.061-11.302 11.302 11.302z" />
      </svg>
    ),
    color: 'bg-gray-900 dark:bg-white text-white dark:text-gray-900',
    description: '连接 GitHub 账户',
  },
  gitee: {
    name: 'Gitee',
    icon: (
      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0A12 12 0 0 0 12 12 12 0 0 1 4.24 7.76 12 0a12 12 0 0 0 0 12 0-4.24-7.76 0A12 12 0 0 1 12 0z" />
        <text x="8" y="15" fontSize="7" fill="white" textAnchor="middle" fontWeight="bold">G</text>
      </svg>
    ),
    color: 'bg-red-600 dark:bg-red-500 text-white',
    description: '连接 Gitee 账户',
  },
  gitlab: {
    name: 'GitLab',
    icon: (
      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0a12 12 0 0 0 0 12 12 0 0 1 4.24 7.76 12 0a12 12 0 0 0 0 12 0-4.24-7.76 0A12 12 0 0 1 12 0z" />
        <path d="M8.5 16.5L10 13.5H14L12 11H9.5L8.5 16.5Z" fill="white" />
      </svg>
    ),
    color: 'bg-orange-600 dark:bg-orange-500 text-white',
    description: '连接 GitLab 账户',
  },
};

export default function OAuthPage() {
  const { error } = useNotificationHelpers();
  const [isAuthorizing, setIsAuthorizing] = useState<Platform | null>(null);

  const handleAuthorize = async (platform: Platform) => {
    try {
      setIsAuthorizing(platform);
      const response = await apiClient.getOAuthAuthorizationUrl(platform);
      if (response.success && response.data?.authorizationUrl) {
        window.location.href = response.data.authorizationUrl;
      } else {
        throw new Error('未获取到授权 URL');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '授权失败，请稍后重试';
      error('授权失败', message);
    } finally {
      setIsAuthorizing(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* 返回首页 */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-8"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回首页
        </Link>

        {/* 标题 */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            OAuth 登录
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            选择一个平台开始授权
          </p>
        </div>

        {/* 平台卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(['github', 'gitee', 'gitlab'] as Platform[]).map((platform) => {
            const config = platformConfigs[platform];
            return (
              <Card
                key={platform}
                className="hover:shadow-lg transition-shadow duration-300"
              >
                <CardContent className="p-8 text-center">
                  <div className={`
                    w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4
                    ${config.color}
                  `}>
                    {config.icon}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {config.name}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    {config.description}
                  </p>
                  <Button
                    fullWidth
                    size="lg"
                    loading={isAuthorizing === platform}
                    onClick={() => handleAuthorize(platform)}
                    className="text-base"
                  >
                    {isAuthorizing === platform ? '授权中...' : `授权 ${config.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* 说明信息 */}
        <Card className="mt-8">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              授权说明
            </h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>点击授权后，将跳转到对应平台的授权页面</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>授权完成后，将自动跳转回仪表板</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2z" />
                </svg>
                <span>授权成功后，可以在 OAuth 管理页面管理已连接的账户</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* 底部提示 */}
        <div className="mt-12 text-center text-sm text-gray-500 dark:text-gray-500">
          <p>需要帮助？查看 <Link href="/docs/USAGE" className="text-blue-600 dark:text-blue-400 hover:underline">使用指南</Link></p>
        </div>
      </div>
    </div>
  );
}
