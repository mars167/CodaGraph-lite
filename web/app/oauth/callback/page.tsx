'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

const platformNames: Record<string, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

function getCallbackRequestKey(platform: string, code: string, state: string): string {
  return `oauth-callback:${platform}:${code}:${state}`;
}

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error } = useNotificationHelpers();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const platform = searchParams.get('platform') as string;
      const errorParam = searchParams.get('error');
      const state = searchParams.get('state');

      if (errorParam) {
        const errorMsg = decodeURIComponent(errorParam);
        error('授权失败', `${platformNames[platform] || '平台'} 授权失败: ${errorMsg}`);
        setIsProcessing(false);
        setTimeout(() => {
          router.push('/oauth');
        }, 3000);
        return;
      }

      if (!code || !platform) {
        error('无效回调', '缺少必要参数');
        setIsProcessing(false);
        setTimeout(() => {
          router.push('/oauth');
        }, 3000);
        return;
      }

      try {
        const requestKey = getCallbackRequestKey(platform, code, state || '');
        if (typeof window !== 'undefined') {
          const existing = sessionStorage.getItem(requestKey);
          if (existing === 'done' || existing === 'pending') {
            router.push('/dashboard/oauth');
            return;
          }
          sessionStorage.setItem(requestKey, 'pending');
        }

        // 调用后端回调处理 API
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7900';
        const raw = await fetch(`${apiUrl}/api/oauth/callback/${platform}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            code,
            state: state || '',
            authType: 'oauth',
          }),
        });
        const response = await raw.json();

        if (raw.ok && response.success) {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(requestKey, 'done');
          }
          success('授权成功', `已成功连接到 ${platformNames[platform]}`);
          setTimeout(() => {
            router.push('/dashboard/oauth');
          }, 1500);
        } else {
          throw new Error(response.message || '授权处理失败');
        }
      } catch (err) {
        if (code && platform && typeof window !== 'undefined') {
          sessionStorage.removeItem(getCallbackRequestKey(platform, code, state || ''));
        }
        const message = err instanceof Error ? err.message : '授权处理失败';
        error('授权失败', message);
        setIsProcessing(false);
        setTimeout(() => {
          router.push('/oauth');
        }, 3000);
      }
    };

    handleCallback();
  }, [searchParams, router, success, error]);

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-12 text-center">
            <Loading size="lg" text="处理授权中..." />
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              请稍候，正在完成授权流程...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 错误状态
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              授权失败
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              {decodeURIComponent(errorParam) || '授权过程中出现错误'}
            </p>
            <button
              onClick={() => router.push('/oauth')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              返回重试
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            授权成功
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            正在跳转到 OAuth 管理页面...
          </p>
          <Loading size="sm" text="跳转中..." />
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-12 text-center">
          <Loading size="lg" text="加载中..." />
        </CardContent>
      </Card>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
