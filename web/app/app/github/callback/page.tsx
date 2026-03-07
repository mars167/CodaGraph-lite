'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

function getCallbackRequestKey(installationId: string, state: string): string {
  return `oauth-callback:github_app:${installationId}:${state}`;
}

function GitHubAppCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error } = useNotificationHelpers();

  useEffect(() => {
    const run = async () => {
      const state = searchParams.get('state');
      const installationId = searchParams.get('installation_id');
      const setupAction = searchParams.get('setup_action');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        error('授权失败', decodeURIComponent(errorParam));
        router.replace('/dashboard/settings#oauth');
        return;
      }

      if (!installationId || !state) {
        error('授权失败', '缺少 installation_id 或 state 参数');
        router.replace('/dashboard/settings#oauth');
        return;
      }

      const requestKey = getCallbackRequestKey(installationId, state);
      if (typeof window !== 'undefined') {
        const existing = sessionStorage.getItem(requestKey);
        if (existing === 'done' || existing === 'pending') {
          router.replace('/dashboard/settings#oauth');
          return;
        }
        sessionStorage.setItem(requestKey, 'pending');
      }

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7900';
        const response = await fetch(`${apiUrl}/api/oauth/callback/github`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            state,
            authType: 'github_app',
            installation_id: installationId,
            setup_action: setupAction || undefined,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || data.message || '授权处理失败');
        }

        if (typeof window !== 'undefined') {
          sessionStorage.setItem(requestKey, 'done');
        }
        success('授权成功', 'GitHub App 已完成授权');
      } catch (e) {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(requestKey);
        }
        error('授权失败', e instanceof Error ? e.message : '授权处理失败');
      } finally {
        router.replace('/dashboard/settings#oauth');
      }
    };

    run();
  }, [searchParams, router, success, error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-12 text-center">
          <Loading size="lg" text="正在完成 GitHub App 授权..." />
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-12 text-center">
          <Loading size="lg" text="加载中..." />
        </CardContent>
      </Card>
    </div>
  );
}

export default function GitHubAppCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <GitHubAppCallbackContent />
    </Suspense>
  );
}
