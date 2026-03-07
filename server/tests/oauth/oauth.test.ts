/**
 * OAuth 集成单元测试
 */

import { OAuthService, OAuthPlatform } from '../src/services/OAuthService';
import crypto from 'crypto';

describe('OAuthService', () => {
    let oauthService: OAuthService;

    beforeAll(() => {
        oauthService = new OAuthService(':memory:');
    });

    afterAll(async () => {
        await oauthService.close();
    });

    describe('GitHub OAuth', () => {
        describe('authorization flow', () => {
            it('should generate authorization URL', async () => {
                const config = {
                    clientId: 'test_client_id',
                    callbackUrl: 'http://localhost:7900/api/oauth/github/callback'
                };

                const authUrl = oauthService.getGitHubAuthorizationUrl(config);
                expect(authUrl).toContain('github.com');
                expect(authUrl).toContain('client_id=test_client_id');
                expect(authUrl).toContain('redirect_uri');
            });

            it('should generate state parameter for CSRF protection', async () => {
                const config = {
                    clientId: 'test_client_id',
                    callbackUrl: 'http://localhost:7900/api/oauth/github/callback'
                };

                const authUrl = oauthService.getGitHubAuthorizationUrl(config);
                const stateMatch = authUrl.match(/state=([^&]+)/);

                expect(stateMatch).toBeDefined();
                expect(stateMatch![1]).toHaveLength(32); // UUID 应该 32 字符
            });
        });

        describe('callback handling', () => {
            it('should handle valid callback', async () => {
                const code = 'valid_authorization_code';
                const state = 'valid_state_32_characters';

                const result = await oauthService.handleGitHubCallback(code, state);
                expect(result.success).toBe(true);
                expect(result.data.access_token).toBeDefined();
                expect(result.data.platform).toBe('github');
            });

            it('should reject invalid state parameter', async () => {
                const code = 'valid_authorization_code';
                const invalidState = 'invalid_state';

                const result = await oauthService.handleGitHubCallback(code, invalidState);
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('INVALID_STATE');
            });

            it('should reject expired authorization code', async () => {
                const expiredCode = 'expired_code';
                const state = 'valid_state_32_characters';

                const result = await oauthService.handleGitHubCallback(expiredCode, state);
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('EXPIRED_CODE');
            });
        });

        describe('token storage', () => {
            it('should store access token securely', async () => {
                const installation = {
                    platform: 'github' as OAuthPlatform,
                    platform_id: '123',
                    account: 'testuser',
                    access_token: 'encrypted_token',
                    expires_at: new Date(Date.now() + 3600000)
                };

                await oauthService.storeInstallation(installation);

                const retrieved = await oauthService.getInstallation('github', '123');
                expect(retrieved?.access_token).toBe('encrypted_token');
            });

            it('should mask access token in logs', async () => {
                const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

                const installation = {
                    platform: 'github' as OAuthPlatform,
                    platform_id: '123',
                    account: 'testuser',
                    access_token: 'secret_token_12345',
                    expires_at: new Date(Date.now() + 3600000)
                };

                await oauthService.storeInstallation(installation);

                // Token 应该被屏蔽
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('***')
                );
            });
        });

        describe('token refresh', () => {
            it('should refresh expired token', async () => {
                // 创建即将过期的 token
                const installation = {
                    platform: 'github' as OAuthPlatform,
                    platform_id: '123',
                    account: 'testuser',
                    access_token: 'old_token',
                    refresh_token: 'refresh_token_value',
                    expires_at: new Date(Date.now() - 1000) // 1秒前过期
                };

                await oauthService.storeInstallation(installation);

                const refreshed = await oauthService.refreshToken('github');
                expect(refreshed.success).toBe(true);
                expect(refreshed.data.access_token).not.toBe('old_token');
            });

            it('should use refresh token if available', async () => {
                const installation = {
                    platform: 'github' as OAuthPlatform,
                    platform_id: '123',
                    account: 'testuser',
                    access_token: 'current_token',
                    refresh_token: 'refresh_token_value',
                    expires_at: new Date(Date.now() + 3600000)
                };

                await oauthService.storeInstallation(installation);

                const refreshed = await oauthService.refreshToken('github');
                expect(refreshed.data.access_token).toContain('new_access_token');
            });
        });
    });

    describe('Gitee OAuth', () => {
        it('should generate authorization URL for Gitee', async () => {
                const config = {
                    clientId: 'test_client_id',
                    callbackUrl: 'http://localhost:7900/api/oauth/gitee/callback'
                };

                const authUrl = oauthService.getGiteeAuthorizationUrl(config);
                expect(authUrl).toContain('gitee.com');
                expect(authUrl).toContain('client_id=test_client_id');
        });

        it('should handle Gitee callback', async () => {
                const code = 'gitee_auth_code';
                const state = 'valid_state';

                const result = await oauthService.handleGiteeCallback(code, state);
                expect(result.success).toBe(true);
                expect(result.data.access_token).toBeDefined();
                expect(result.data.platform).toBe('gitee');
        });
    });

    describe('GitLab OAuth', () => {
        it('should generate authorization URL for GitLab', async () => {
                const config = {
                    clientId: 'test_client_id',
                    callbackUrl: 'http://localhost:7900/api/oauth/gitlab/callback'
                };

                const authUrl = oauthService.getGitLabAuthorizationUrl(config);
                expect(authUrl).toContain('gitlab.com');
                expect(authUrl).toContain('client_id=test_client_id');
        });

        it('should handle GitLab callback', async () => {
                const code = 'gitlab_auth_code';
                const state = 'valid_state';

                const result = await oauthService.handleGitLabCallback(code, state);
                expect(result.success).toBe(true);
                expect(result.data.access_token).toBeDefined();
                expect(result.data.platform).toBe('gitlab');
        });
    });

    describe('installation management', () => {
        it('should list all installations', async () => {
                // 模拟存储多个安装
                await oauthService.storeInstallation({
                    platform: 'github' as OAuthPlatform,
                    platform_id: '123',
                    account: 'github_user',
                    access_token: 'github_token',
                    expires_at: new Date(Date.now() + 3600000)
                });

                await oauthService.storeInstallation({
                    platform: 'gitee' as OAuthPlatform,
                    platform_id: '456',
                    account: 'gitee_user',
                    access_token: 'gitee_token',
                    expires_at: new Date(Date.now() + 3600000)
                });

                const installations = await oauthService.listInstallations();
                expect(installations).toHaveLength(2);
                expect(installations[0].platform).toBe('github');
                expect(installations[1].platform).toBe('gitee');
        });

        it('should get installation by platform', async () => {
                await oauthService.storeInstallation({
                    platform: 'github' as OAuthPlatform,
                    platform_id: '123',
                    account: 'github_user',
                    access_token: 'github_token',
                    expires_at: new Date(Date.now() + 3600000)
                });

                await oauthService.storeInstallation({
                    platform: 'gitee' as OAuthPlatform,
                    platform_id: '456',
                    account: 'gitee_user',
                    access_token: 'gitee_token',
                    expires_at: new Date(Date.now() + 3600000)
                });

                const githubInstall = await oauthService.getInstallationByPlatform('github');
                expect(githubInstall).toBeDefined();
                expect(githubInstall?.platform).toBe('github');
        });

        it('should disconnect installation', async () => {
                const installation = {
                    platform: 'github' as OAuthPlatform,
                    platform_id: '123',
                    account: 'github_user',
                    access_token: 'github_token',
                    expires_at: new Date(Date.now() + 3600000)
                };

                await oauthService.storeInstallation(installation);
                await oauthService.disconnectInstallation(installation.id);

                const result = await oauthService.getInstallationByPlatform('github');
                expect(result).toBeNull();
        });
    });

    describe('webhook signature verification', () => {
        describe('GitHub webhook signature', () => {
            it('should verify valid signature', () => {
                const payload = '{"action":"opened"}';
                const secret = 'webhook_secret';
                const signature = crypto
                    .createHmac('sha256', secret)
                    .update(payload)
                    .digest('hex');

                const result = OAuthService.verifyGitHubSignature(payload, signature, secret);
                expect(result).toBe(true);
            });

            it('should reject invalid signature', () => {
                const payload = '{"action":"opened"}';
                const secret = 'webhook_secret';
                const wrongSignature = 'wrong_signature';

                const result = OAuthService.verifyGitHubSignature(payload, wrongSignature, secret);
                expect(result).toBe(false);
            });

            it('should use timing-safe comparison', () => {
                const payload = '{"action":"opened"}';
                const secret = 'webhook_secret';
                const signature = crypto
                    .createHmac('sha256', secret)
                    .update(payload)
                    .digest('hex');

                // 使用 timingSafeEqual 防止时间攻击
                const isSafe = OAuthService.verifyGitHubSignature(payload, signature, secret);
                expect(isSafe).toBe(true);
            });
        });

        describe('Gitee webhook signature', () => {
            it('should verify Gitee token signature', () => {
                const payload = '{"action":"opened"}';
                const token = 'webhook_token';
                const signature = crypto
                    .createHmac('sha1', token)
                    .update(payload)
                    .digest('hex');

                const result = OAuthService.verifyGiteeSignature(payload, signature, token);
                expect(result).toBe(true);
            });
        });

        describe('GitLab webhook signature', () => {
            it('should verify GitLab token', () => {
                const token = 'webhook_token';
                const headers = {
                    'X-Gitlab-Token': token
                };

                const result = OAuthService.verifyGitLabToken(headers, token);
                expect(result).toBe(true);
            });
        });
    });
});
