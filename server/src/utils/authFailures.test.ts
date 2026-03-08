import { isAuthenticationFailure, isAuthenticationFailureMessage } from './authFailures';

describe('authFailures', () => {
  it('recognizes common authentication failure messages', () => {
    expect(isAuthenticationFailureMessage('GitHub API 失败: 401 Bad credentials')).toBe(true);
    expect(isAuthenticationFailureMessage('GET /pulls 失败: 401 Unauthorized')).toBe(true);
    expect(isAuthenticationFailureMessage('OAuth token 已失效，请重新授权')).toBe(true);
    expect(isAuthenticationFailure(new Error('Request failed with unauthorized response'))).toBe(true);
  });

  it('does not treat unrelated numeric strings as authentication failures', () => {
    expect(isAuthenticationFailureMessage('处理任务 14012 失败')).toBe(false);
    expect(isAuthenticationFailureMessage('500 Internal Server Error')).toBe(false);
  });
});
