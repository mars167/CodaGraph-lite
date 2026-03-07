/**
 * 作业队列单元测试
 */

import { JobQueue, Job, JobStatus, JobType } from '../src/queue/JobQueue';

describe('JobQueue', () => {
    let queue: JobQueue;

    beforeAll(async () => {
        queue = new JobQueue(':memory:');
        await queue.initialize();
    });

    afterAll(async () => {
        await queue.close();
    });

    describe('job submission', () => {
        it('should submit job with correct status', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'testowner',
                repo: 'testrepo',
                pr_number: 42
            };

            const jobId = await queue.submit(job);
            expect(jobId).toBeGreaterThan(0);

            const savedJob = await queue.getById(jobId);
            expect(savedJob?.status).toBe('pending');
        });

        it('should assign job ID', async () => {
            const job = {
                type: 'context_analysis' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 10
            };

            const jobId1 = await queue.submit(job);
            const jobId2 = await queue.submit(job);

            expect(jobId1).not.toBe(jobId2);
        });

        it('should set created timestamp', async () => {
            const beforeSubmit = Date.now();
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            await queue.submit(job);
            const savedJob = await queue.getById(job.job_id);

            expect(savedJob?.created_at).toBeDefined();
            expect(savedJob!.created_at.getTime()).toBeGreaterThanOrEqual(beforeSubmit);
        });
    });

    describe('job retrieval', () => {
        it('should get job by ID', async () => {
            const submittedJob = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            const jobId = await queue.submit(submittedJob);
            const retrievedJob = await queue.getById(jobId);

            expect(retrievedJob?.id).toBe(jobId);
            expect(retrievedJob?.platform).toBe('github');
        });

        it('should return null for non-existent job', async () => {
            const job = await queue.getById(999999);
            expect(job).toBeNull();
        });

        it('should list jobs with pagination', async () => {
            // 提交多个作业
            for (let i = 0; i < 5; i++) {
                await queue.submit({
                    type: 'code_review' as JobType,
                    platform: 'github',
                    owner: 'owner',
                    repo: 'repo',
                    pr_number: i
                });
            }

            const page1 = await queue.list({ page: 1, pageSize: 2 });
            expect(page1).toHaveLength(2);
            expect(page1.pagination.page).toBe(1);
            expect(page1.pagination.totalPages).toBe(3);

            const page2 = await queue.list({ page: 2, pageSize: 2 });
            expect(page2).toHaveLength(2);
            expect(page2.pagination.page).toBe(2);
        });
    });

    describe('job status transitions', () => {
        let jobId: number;

        beforeEach(async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };
            jobId = await queue.submit(job);
        });

        it('should transition from pending to processing', async () => {
            await queue.updateStatus(jobId, 'processing');
            const job = await queue.getById(jobId);
            expect(job?.status).toBe('processing');
            expect(job?.started_at).toBeDefined();
        });

        it('should transition from processing to completed', async () => {
            await queue.updateStatus(jobId, 'completed');
            const job = await queue.getById(jobId);
            expect(job?.status).toBe('completed');
            expect(job?.completed_at).toBeDefined();
        });

        it('should transition to failed with error', async () => {
            const error = new Error('Test error');
            await queue.updateStatus(jobId, 'failed', error);
            const job = await queue.getById(jobId);
            expect(job?.status).toBe('failed');
            expect(job?.error_message).toBe('Test error');
        });

        it('should reset status on retry', async () => {
            await queue.updateStatus(jobId, 'failed');
            await queue.retry(jobId);
            const job = await queue.getById(jobId);
            expect(job?.status).toBe('pending');
            expect(job?.attempts).toBe(1);
        });
    });

    describe('retry mechanism', () => {
        it('should increment attempt counter', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            const jobId = await queue.submit(job);
            await queue.updateStatus(jobId, 'failed');

            await queue.retry(jobId);
            const afterRetry = await queue.getById(jobId);
            expect(afterRetry?.attempts).toBe(1);
        });

        it('should calculate exponential backoff', () => {
            const delays: number[] = [];
            for (let i = 1; i <= 5; i++) {
                delays.push(JobQueue.calculateBackoff(i));
            }

            expect(delays).toEqual([2000, 4000, 8000, 16000, 32000]);
        });

        it('should stop retrying after max attempts', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            const jobId = await queue.submit(job);

            // 模拟达到最大重试次数
            for (let i = 0; i < 3; i++) {
                await queue.updateStatus(jobId, 'failed');
                await queue.retry(jobId);
            }

            const finalJob = await queue.getById(jobId);
            expect(finalJob?.status).toBe('dead');
        });
    });

    describe('priority handling', () => {
        it('should process high priority jobs first', async () => {
            const highPriorityJob = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1,
                priority: 'high'
            };

            const lowPriorityJob = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 2,
                priority: 'low'
            };

            // 按相反顺序提交
            await queue.submit(lowPriorityJob);
            await queue.submit(highPriorityJob);

            const nextJob = await queue.getNextJob();
            expect(nextJob?.priority).toBe('high');
            });
    });

    describe('dead letter queue', () => {
        it('should move failed jobs to dead letter queue', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            const jobId = await queue.submit(job);

            // 模拟多次失败
            for (let i = 0; i < 3; i++) {
                await queue.updateStatus(jobId, 'failed');
            }

            const deadJobs = await queue.getDeadJobs();
            expect(deadJobs).toContainEqual(jobId);
        });
    });

    describe('worker polling', () => {
        it('should poll for pending jobs', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            await queue.submit(job);

            const worker = new QueueWorker(queue);
            const polledJob = await worker.pollOnce();

            expect(polledJob?.id).toBe(job.job_id);
            expect(polledJob?.status).toBe('pending');
        });

        it('should respect worker count (1 for 2u2g)', async () => {
            // 2u2g 优化：只能有一个 worker
            const job1 = await queue.submit({
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            });

            const job2 = await queue.submit({
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 2
            });

            const worker = new QueueWorker(queue, { workerCount: 1 });
            const processing1 = worker.isProcessing();

            worker.processJob(job1!);

            const processing2 = worker.isProcessing();
            expect(processing2).toBe(true); // 仍然在处理 job1
        });
    });

    describe('job cancellation', () => {
        it('should cancel pending job', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            const jobId = await queue.submit(job);
            await queue.cancel(jobId);

            const cancelledJob = await queue.getById(jobId);
            expect(cancelledJob?.status).toBe('cancelled');
        });

        it('should not cancel processing job', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            const jobId = await queue.submit(job);
            await queue.updateStatus(jobId, 'processing');

            await expect(queue.cancel(jobId)).rejects.toThrow('Cannot cancel processing job');
        });
    });

    describe('job timeout', () => {
        it('should mark job as failed on timeout', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            const jobId = await queue.submit(job);
            await queue.updateStatus(jobId, 'processing');

            // 模拟超时
            await queue.handleTimeout(jobId);

            const timedOutJob = await queue.getById(jobId);
            expect(timedOutJob?.status).toBe('failed');
            expect(timedOutJob?.error_message).toContain('timeout');
        });

        it('should allow retry after timeout', async () => {
            const job = {
                type: 'code_review' as JobType,
                platform: 'github',
                owner: 'owner',
                repo: 'repo',
                pr_number: 1
            };

            const jobId = await queue.submit(job);
            await queue.updateStatus(jobId, 'processing');
            await queue.handleTimeout(jobId);

            const timedOutJob = await queue.getById(jobId);
            expect(timedOutJob?.attempts).toBe(0); // 重试前重置次数
        });
    });

    describe('queue statistics', () => {
        it('should calculate accurate statistics', async () => {
            // 提交测试作业
            for (let i = 0; i < 10; i++) {
                await queue.submit({
                    type: 'code_review' as JobType,
                    platform: 'github',
                    owner: 'owner',
                    repo: 'repo',
                    pr_number: i
                });
                await queue.updateStatus(i + 1, 'completed');
            }

            for (let i = 10; i < 12; i++) {
                await queue.submit({
                    type: 'code_review' as JobType,
                    platform: 'github',
                    owner: 'owner',
                    repo: 'repo',
                    pr_number: i
                });
                await queue.updateStatus(i + 1, 'failed');
            }

            const stats = await queue.getStatistics();

            expect(stats.total).toBe(22);
            expect(stats.completed).toBe(10);
            expect(stats.failed).toBe(2);
            expect(stats.successRate).toBeCloseTo(45.45);
        });
    });
});

/**
 * Queue Worker 辅助类
 */
class QueueWorker {
    private queue: JobQueue;
    private options: { workerCount: number };
    private processingJob: Job | null = null;

    constructor(queue: JobQueue, options: { workerCount?: number } = {}) {
        this.queue = queue;
        this.options = { workerCount: 1, ...options };
    }

    isProcessing(): boolean {
        return this.processingJob !== null;
    }

    async processJob(job: Job): Promise<void> {
        this.processingJob = job;
    }

    async pollOnce(): Promise<Job | null> {
        // 模拟一次轮询
        return await this.queue.getNextJob();
    }
}
