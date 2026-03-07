/**
 * 认证系统单元测试
 */

import { AuthService, Session } from '../src/services/AuthService';
import bcrypt from 'bcrypt';

describe('AuthService', () => {
    let authService: AuthService;

    beforeAll(() => {
        authService = new AuthService(':memory:');
    });

    afterAll(async () => {
        await authService.close();
    });

    describe('login', () => {
        describe('with valid credentials', () => {
            it('should return session ID on successful login', async () => {
                const result = await authService.login('admin', 'correct_password');
                expect(result.success).toBe(true);
                expect(result.data.sessionId).toBeDefined();
                expect(result.data.user.username).toBe('admin');
            });

            it('should set session expiration correctly', async () => {
                const now = Date.now();
                const result = await authService.login('admin', 'correct_password');

                // Session 应该在未来 24 小时过期
                const session = await authService.getSession(result.data.sessionId);
                expect(session.expiresAt.getTime()).toBeGreaterThan(now + 86000000 - 1000);
                expect(session.expiresAt.getTime()).toBeLessThanOrEqual(now + 86400000 + 1000);
            });
        });

        describe('with invalid credentials', () => {
            it('should reject with wrong username', async () => {
                const result = await authService.login('wrong_user', 'correct_password');
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('INVALID_CREDENTIALS');
            });

            it('should reject with wrong password', async () => {
                const result = await authService.login('admin', 'wrong_password');
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('INVALID_CREDENTIALS');
            });

            it('should not create session on failed login', async () => {
                await authService.login('admin', 'wrong_password');

                const sessions = await authService.getAllSessions();
                expect(sessions).toHaveLength(0);
            });
        });
    });

    describe('verify session', () => {
        let validSessionId: string;

        beforeEach(async () => {
                const loginResult = await authService.login('admin', 'correct_password');
                validSessionId = loginResult.data.sessionId;
        });

        it('should return true for valid session', async () => {
                const result = await authService.verifySession(validSessionId);
                expect(result.success).toBe(true);
                expect(result.data.valid).toBe(true);
                expect(result.data.user.username).toBe('admin');
        });

        it('should return false for expired session', async () => {
                // 手动使 Session 过期
                await authService.expireSession(validSessionId);

                const result = await authService.verifySession(validSessionId);
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('SESSION_EXPIRED');
        });

        it('should return false for non-existent session', async () => {
                const result = await authService.verifySession('non_existent_session');
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('SESSION_NOT_FOUND');
        });
    });

    describe('logout', () => {
        let validSessionId: string;

        beforeEach(async () => {
                const loginResult = await authService.login('admin', 'correct_password');
                validSessionId = loginResult.data.sessionId;
        });

        it('should invalidate session', async () => {
                await authService.logout(validSessionId);

                const verifyResult = await authService.verifySession(validSessionId);
                expect(verifyResult.success).toBe(false);
                expect(verifyResult.error.code).toBe('SESSION_NOT_FOUND');
        });

        it('should return success message', async () => {
                const result = await authService.logout(validSessionId);
                expect(result.success).toBe(true);
                expect(result.message).toContain('logout');
        });
    });

    describe('password update', () => {
        let validSessionId: string;

        beforeEach(async () => {
                const loginResult = await authService.login('admin', 'old_password');
                validSessionId = loginResult.data.sessionId;
        });

        it('should update password with correct current password', async () => {
                const result = await authService.updatePassword(
                    validSessionId,
                    'old_password',
                    'new_password'
                );
                expect(result.success).toBe(true);

                // 验证新密码
                const loginResult = await authService.login('admin', 'new_password');
                expect(loginResult.success).toBe(true);
        });

        it('should reject with incorrect current password', async () => {
                const result = await authService.updatePassword(
                    validSessionId,
                    'wrong_current_password',
                    'new_password'
                );
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('INVALID_CURRENT_PASSWORD');
        });

        it('should require authentication', async () => {
                // 不带 session 调用应该失败
                const result = await authService.updatePassword(
                    'invalid_session',
                    'old_password',
                    'new_password'
                );
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('SESSION_NOT_FOUND');
        });
    });

    describe('session security', () => {
        it('should generate cryptographically secure session IDs', () => {
                const sessions: Session[] = [];
                for (let i = 0; i < 100; i++) {
                        const result = await authService.login('admin', 'correct_password');
                        sessions.push(result.data);
                }

                // 验证所有 Session ID 不重复
                const sessionIds = sessions.map(s => s.sessionId);
                const uniqueIds = new Set(sessionIds);
                expect(uniqueIds.size).toBe(100);
        });

        it('should use strong hashing for passwords', async () => {
                const password = 'test_password_123';

                const hash = await bcrypt.hash(password, 10);
                const isValid = await bcrypt.compare(password, hash);

                expect(isValid).toBe(true);
                expect(await bcrypt.compare('wrong_password', hash)).toBe(false);
        });
    });

    describe('admin management', () => {
        it('should create admin account on first run', async () => {
                // 清空数据库模拟首次运行
                await authService.clearAllAdmins();

                const result = await authService.createAdmin('admin', 'secure_password');
                expect(result.success).toBe(true);
                expect(result.data.username).toBe('admin');
        });

        it('should not create admin if already exists', async () => {
                // 先创建管理员
                await authService.createAdmin('admin', 'secure_password');

                // 再次尝试创建
                const result = await authService.createAdmin('admin', 'another_password');
                expect(result.success).toBe(false);
                expect(result.error.code).toBe('ADMIN_EXISTS');
        });

        it('should validate admin password strength', async () => {
                await authService.clearAllAdmins();

                const weakPassword = '123';
                const result1 = await authService.createAdmin('admin', weakPassword);
                expect(result1.success).toBe(false);
                expect(result1.error.code).toBe('WEAK_PASSWORD');

                const strongPassword = 'Secure_P@ssw0rd123!';
                const result2 = await authService.createAdmin('admin', strongPassword);
                expect(result2.success).toBe(true);
        });
    });

    describe('session timeout', () => {
        it('should expire sessions after timeout period', async () => {
                const loginResult = await authService.login('admin', 'correct_password');
                const sessionId = loginResult.data.sessionId;

                // 手动使 Session 过期
                await authService.expireSession(sessionId);

                // 验证 Session 不可用
                const verifyResult = await authService.verifySession(sessionId);
                expect(verifyResult.success).toBe(false);
                expect(verifyResult.error.code).toBe('SESSION_EXPIRED');
        });

        it('should clean up expired sessions periodically', async () => {
                // 创建多个 Session
                const sessions: string[] = [];
                for (let i = 0; i < 5; i++) {
                        const result = await authService.login('admin', 'correct_password');
                        sessions.push(result.data.sessionId);
                }

                // 使所有 Session 过期
                for (const session of sessions) {
                        await authService.expireSession(session.sessionId);
                }

                // 执行清理
                await authService.cleanupExpiredSessions();

                // 验证所有 Session 已清理
                const activeSessions = await authService.getAllSessions();
                expect(activeSessions).toHaveLength(0);
        });
    });
});
