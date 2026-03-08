import type { Platform } from '@/types';

const OAUTH_PLATFORM_STATE_PREFIX = 'oauth-platform-state:';

function isPlatform(value: string | null): value is Platform {
  return value === 'github' || value === 'gitee' || value === 'gitlab';
}

export function rememberOAuthStatePlatform(authorizationUrl: string, platform: Platform): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const state = new URL(authorizationUrl).searchParams.get('state');
    if (!state) {
      return;
    }

    sessionStorage.setItem(`${OAUTH_PLATFORM_STATE_PREFIX}${state}`, platform);
  } catch (error) {
    console.warn('记录 OAuth 授权 state 失败:', error);
  }
}

export function resolveOAuthPlatform(
  explicitPlatform: string | null,
  state: string | null
): Platform | null {
  if (isPlatform(explicitPlatform)) {
    return explicitPlatform;
  }

  if (!state || typeof window === 'undefined') {
    return null;
  }

  const storedPlatform = sessionStorage.getItem(`${OAUTH_PLATFORM_STATE_PREFIX}${state}`);
  return isPlatform(storedPlatform) ? storedPlatform : null;
}

export function clearOAuthStatePlatform(state: string | null): void {
  if (!state || typeof window === 'undefined') {
    return;
  }

  sessionStorage.removeItem(`${OAUTH_PLATFORM_STATE_PREFIX}${state}`);
}
