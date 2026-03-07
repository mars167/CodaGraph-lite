/**
 * 数据库模型单元测试
 */

import { Installation, Repository, Analysis, AnalysisJob, WebhookEvent } from '../src/database/models';

describe('Database Models', () => {
    describe('Installation', () => {
        describe('validation', () => {
            it('should validate required fields', () => {
                const invalid = {} as any;
                expect(() => Installation.validate(invalid)).toThrow();
            });

            it('should validate platform enum', () => {
                const invalid = { ...Installation.create(), platform: 'invalid' };
                expect(() => Installation.validate(invalid)).toThrow();
            });

            it('should accept valid platforms', () => {
                const valid = Installation.create({
                    platform: 'github',
                    platform_id: '123',
                    account: 'testuser',
                    access_token: 'token'
                });
                expect(() => Installation.validate(valid)).not.toThrow();
            });
        });

        describe('Token management', () => {
            it('should detect expired tokens', () => {
                const expired = Installation.create({
                    platform: 'github',
                    platform_id: '123',
                    account: 'testuser',
                    access_token: 'token',
                    expires_at: new Date(Date.now() - 1000) // 1秒前过期
                });
                expect(Installation.isExpired(expired)).toBe(true);
            });

            it('should detect valid tokens', () => {
                const valid = Installation.create({
                    platform: 'github',
                    platform_id: '123',
                    account: 'testuser',
                    access_token: 'token',
                    expires_at: new Date(Date.now() + 3600000) // 1小时后过期
                });
                expect(Installation.isExpired(valid)).toBe(false);
            });
        });
    });

    describe('Repository', () => {
        it('should create repository with correct fields', () => {
            const repo = Repository.create({
                installation_id: 1,
                platform: 'github',
                owner: 'testowner',
                repo: 'testrepo',
                url: 'https://github.com/testowner/testrepo',
                is_connected: true
            });
            expect(repo.id).toBeDefined();
            expect(repo.platform).toBe('github');
            expect(repo.owner).toBe('testowner');
            expect(repo.repo).toBe('testrepo');
        });

        it('should validate repository URL', () => {
            const invalid = Repository.create({
                installation_id: 1,
                platform: 'github',
                owner: 'testowner',
                repo: 'testrepo',
                url: 'invalid-url'
            });
            expect(() => Repository.validate(invalid)).toThrow();
        });
    });

    describe('Analysis', () => {
        describe('status transitions', () => {
            it('should allow status progression', () => {
                const analysis = Analysis.create({ status: 'pending' });
                analysis.status = 'processing';
                expect(analysis.status).toBe('processing');

                analysis.status = 'completed';
                expect(analysis.status).toBe('completed');
            });

            it('should prevent invalid status transitions', () => {
                const analysis = Analysis.create({ status: 'completed' });
                expect(() => {
                    analysis.status = 'pending';
                }).toThrow();
            });
        });

        describe('progress tracking', () => {
            it('should validate progress range', () => {
                const analysis = Analysis.create();
                expect(() => {
                    analysis.progress = 150; // > 100
                }).toThrow();
            });

            it('should accept valid progress', () => {
                const analysis = Analysis.create();
                analysis.progress = 75;
                expect(analysis.progress).toBe(75);
            });
        });

        describe('duration calculation', () => {
            it('should calculate duration correctly', () => {
                const analysis = Analysis.create({
                    started_at: new Date('2024-03-01T10:00:00Z'),
                    completed_at: new Date('2024-03-01T10:15:00Z')
                });
                expect(analysis.getDuration()).toBe(900000); // 15分钟 = 900000毫秒
            });
        });
    });

    describe('AnalysisJob', () => {
        describe('attempts counter', () => {
            it('should increment attempts on retry', () => {
                const job = AnalysisJob.create({ attempts: 1 });
                job.recordAttempt();
                expect(job.attempts).toBe(2);

                job.recordAttempt();
                expect(job.attempts).toBe(3);
            });

            it('should not exceed max attempts', () => {
                const job = AnalysisJob.create({
                    attempts: 3,
                    max_attempts: 3
                });
                expect(job.canRetry()).toBe(false);
            });
        });

        describe('exponential backoff', () => {
            it('should calculate backoff delay', () => {
                const job = AnalysisJob.create({ attempts: 1 });
                expect(job.getBackoffDelay()).toBe(2000); // 2^1 * 1000

                job.attempts = 2;
                expect(job.getBackoffDelay()).toBe(4000); // 2^2 * 1000
            });

            it('should cap backoff delay', () => {
                const job = AnalysisJob.create({ attempts: 10 });
                const delay = job.getBackoffDelay();
                expect(delay).toBeLessThanOrEqual(60000); // 最大 60 秒
            });
        });

        describe('dead letter queue', () => {
            it('should move to dead letter after max attempts', () => {
                const job = AnalysisJob.create({
                    attempts: 3,
                    max_attempts: 3
                });
                expect(job.isDead()).toBe(true);
                expect(job.moveToDeadLetter()).toBe('dead');
            });
        });
    });

    describe('WebhookEvent', () => {
        it('should create webhook event with correct fields', () => {
            const event = WebhookEvent.create({
                platform: 'github',
                event_type: 'pull_request',
                payload: '{"action":"opened"}'
            });
            expect(event.id).toBeDefined();
            expect(event.platform).toBe('github');
            expect(event.event_type).toBe('pull_request');
        });

        it('should validate event type', () => {
            const validTypes = ['pull_request', 'push', 'ping'];
            validTypes.forEach(type => {
                const event = WebhookEvent.create({
                    platform: 'github',
                    event_type: type
                });
                expect(() => WebhookEvent.validate(event)).not.toThrow();
            });
        });

        it('should reject invalid event types', () => {
            const event = WebhookEvent.create({
                platform: 'github',
                event_type: 'invalid_type'
            });
            expect(() => WebhookEvent.validate(event)).toThrow();
        });
    });
});
