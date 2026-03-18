import { notFound } from 'next/navigation';
import { OAuthCallbackPageClient } from '@/components/oauth/OAuthCallbackPage';
import type { Platform } from '@/types';

type CallbackPageProps = {
  params: Promise<{
    platform: string;
  }>;
};

function isFrontendOAuthPlatform(value: string): value is Extract<Platform, 'gitee' | 'gitlab'> {
  return value === 'gitee' || value === 'gitlab';
}

export default async function FrontendOAuthCallbackPage({ params }: CallbackPageProps) {
  const { platform } = await params;

  if (!isFrontendOAuthPlatform(platform)) {
    notFound();
  }

  return <OAuthCallbackPageClient forcedPlatform={platform} />;
}
