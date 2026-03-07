import { buildAuthorizationUrl, GITEE_CONFIG } from './handlers';

describe('oauth handlers', () => {
  it('uses the current Gitee OAuth endpoints', () => {
    expect(GITEE_CONFIG.authorizationUrl).toBe('https://gitee.com/oauth/authorize');
    expect(GITEE_CONFIG.tokenUrl).toBe('https://gitee.com/oauth/token');
  });

  it('builds a Gitee authorization URL with the configured callback', () => {
    const url = buildAuthorizationUrl('gitee', 'test-state');

    expect(url).toContain('https://gitee.com/oauth/authorize?');
    expect(url).toContain(encodeURIComponent(GITEE_CONFIG.redirectUri));
    expect(url).toContain('response_type=code');
  });
});
