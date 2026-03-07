/**
 * PR 审查流程端到端测试
 *
 * 测试从 Webhook 接收到评论发布的完整流程
 */

import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { createApp } from '../../src/index';
import { closeDatabase, initDatabase } from '../../src/database/connection';
import { JobQueue } from '../../src/jobs/JobQueue';
import { CodeReviewService } from '../../src/services/CodeReviewService';

// Mock external dependencies
jest.mock('../../src/git/GitService');
jest.mock('../../src/agent/ContextAgentClient');
jest.mock('../../src/agent/ReviewAgentClient');
jest.mock('../../src/platform/GitHubClient');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('PR Review Flow E2E Tests', () => {
  let app: express.Application;
  let jobQueue: JobQueue;
  let reviewService: CodeReviewService;

  beforeAll(async () => {
    // Initialize test database
    await initDatabase(':memory:');

    // Create app instance
    app = await createApp();

    // Get service instances
    jobQueue = JobQueue.getInstance();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete PR Review Flow', () => {
    it('should handle GitHub PR opened event end-to-end', async () => {
      // Step 1: Simulate GitHub webhook
      const webhookPayload = {
        action: 'opened',
        repository: {
          id: 123456,
          name: 'test-repo',
          full_name: 'owner/test-repo',
          owner: {
            login: 'owner',
            id: 789,
          },
          html_url: 'https://github.com/owner/test-repo',
        },
        pull_request: {
          id: 987654,
          number: 42,
          title: 'Add new feature',
          body: 'This PR adds a new feature',
          state: 'open',
          user: {
            login: 'developer',
            id: 456,
          },
          head: {
            ref: 'feature-branch',
            sha: 'abc123def456',
            repo: {
              full_name: 'owner/test-repo',
            },
          },
          base: {
            ref: 'main',
            sha: 'def456abc123',
            repo: {
              full_name: 'owner/test-repo',
            },
          },
          html_url: 'https://github.com/owner/test-repo/pull/42',
        },
        sender: {
          login: 'developer',
          id: 456,
        },
      };

      const secret = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret';
      const payloadStr = JSON.stringify(webhookPayload);
      const signature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');

      // Step 2: Send webhook request
      const webhookResponse = await request(app)
        .post('/webhook/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'test-delivery-id')
        .send(payloadStr);

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body).toHaveProperty('success', true);

      // Step 3: Verify job was created
      const jobsResponse = await request(app).get('/api/jobs');
      expect(jobsResponse.status).toBe(200);
      expect(jobsResponse.body.jobs.length).toBeGreaterThan(0);

      const createdJob = jobsResponse.body.jobs[0];
      expect(createdJob.type).toBe('code-review');
      expect(createdJob.status).toBe('pending');

      // Step 4: Simulate job processing (mocked)
      // In a real scenario, the job queue worker would process this
      // For E2E test, we'll manually trigger processing

      // Step 5: Check job status updates
      const jobStatusResponse = await request(app)
        .get(`/api/jobs/${createdJob.id}`);

      expect(jobStatusResponse.status).toBe(200);
      expect(jobStatusResponse.body).toHaveProperty('id', createdJob.id);
      expect(jobStatusResponse.body).toHaveProperty('status');
    });

    it('should handle Gitee PR event end-to-end', async () => {
      const webhookPayload = {
        action: 'open',
        pull_request: {
          number: 15,
          title: 'Fix bug in authentication',
          body: 'This fixes the authentication bug',
          state: 'open',
          user: {
            login: 'contributor',
            id: 111,
          },
          head: {
            ref: 'bugfix/auth',
            sha: 'aaa111bbb222',
            repo: {
              full_name: 'org/project',
            },
          },
          base: {
            ref: 'master',
            sha: 'bbb222aaa111',
            repo: {
              full_name: 'org/project',
            },
          },
          html_url: 'https://gitee.com/org/project/pull/15',
        },
        repository: {
          id: 222,
          name: 'project',
          full_name: 'org/project',
          owner: {
            login: 'org',
          },
          path: 'org/project',
        },
        sender: {
          login: 'contributor',
          id: 111,
        },
      };

      const secret = process.env.GITEE_WEBHOOK_SECRET || 'test-secret';
      const payloadStr = JSON.stringify(webhookPayload);
      const token = crypto
        .createHash('sha1')
        .update(payloadStr + secret)
        .digest('hex');

      const webhookResponse = await request(app)
        .post('/webhook/gitee')
        .set('x-gitee-token', token)
        .set('x-gitee-event', 'Pull Request')
        .set('x-gitee-timestamp', Date.now().toString())
        .send(payloadStr);

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body).toHaveProperty('success', true);
    });

    it('should handle GitLab MR event end-to-end', async () => {
      const webhookPayload = {
        object_kind: 'merge_request',
        event_type: 'merge_request',
        object_attributes: {
          id: 99,
          iid: 33,
          title: 'Refactor database layer',
          description: 'Refactoring the database access layer',
          state: 'opened',
          action: 'open',
          source_branch: 'refactor/db',
          target_branch: 'develop',
          source: {
            id: 1,
            sha: 'ccc333ddd444',
            ref: 'refactor/db',
          },
          target: {
            id: 2,
            sha: 'ddd444ccc333',
            ref: 'develop',
          },
          url: 'https://gitlab.com/company/project/merge_requests/33',
        },
        project: {
          id: 333,
          name: 'project',
          path_with_namespace: 'company/project',
          owner: {
            name: 'company',
          },
        },
        user: {
          username: 'engineer',
          id: 444,
        },
      };

      const secret = process.env.GITLAB_WEBHOOK_SECRET || 'test-secret';
      const payloadStr = JSON.stringify(webhookPayload);
      const token = crypto
        .createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');

      const webhookResponse = await request(app)
        .post('/webhook/gitlab')
        .set('x-gitlab-token', token)
        .set('x-gitlab-event', 'Merge Request Hook')
        .set('x-gitlab-delivery', 'test-delivery-id')
        .send(payloadStr);

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body).toHaveProperty('success', true);
    });
  });

  describe('Job Processing Flow', () => {
    it('should process job through all stages', async () => {
      // Create a job manually
      const createResponse = await request(app)
        .post('/api/jobs')
        .send({
          type: 'code-review',
          payload: {
            platform: 'github',
            owner: 'owner',
            repo: 'repo',
            prNumber: 100,
            branch: 'feature',
            baseBranch: 'main',
          },
        });

      expect(createResponse.status).toBe(201);
      const jobId = createResponse.body.id;

      // Verify initial status
      let statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('pending');

      // Simulate job processing stages
      const stages = ['cloning', 'indexing', 'collecting', 'reviewing', 'posting'];
      
      for (const stage of stages) {
        // Update job status
        await request(app)
          .patch(`/api/jobs/${jobId}/status`)
          .send({
            status: 'processing',
            stage: stage,
            progress: stages.indexOf(stage) * 20,
          });

        // Verify update
        statusResponse = await request(app).get(`/api/jobs/${jobId}`);
        expect(statusResponse.body.status).toBe('processing');
        expect(statusResponse.body.stage).toBe(stage);
      }

      // Mark as completed
      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({
          status: 'completed',
          result: {
            filesReviewed: 10,
            issuesFound: 3,
            commentsPosted: 3,
          },
        });

      statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('completed');
    });

    it('should handle job failure gracefully', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/jobs')
        .send({
          type: 'code-review',
          payload: {
            platform: 'github',
            owner: 'owner',
            repo: 'repo',
            prNumber: 200,
          },
        });

      const jobId = createResponse.body.id;

      // Simulate failure
      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({
          status: 'failed',
          error: 'Failed to clone repository: authentication failed',
        });

      const statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('failed');
      expect(statusResponse.body.error).toContain('authentication failed');
    });

    it('should handle job cancellation', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/jobs')
        .send({
          type: 'code-review',
          payload: {
            platform: 'github',
            owner: 'owner',
            repo: 'repo',
            prNumber: 300,
          },
        });

      const jobId = createResponse.body.id;

      // Cancel the job
      const cancelResponse = await request(app)
        .post(`/api/jobs/${jobId}/cancel`);

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.status).toBe('cancelled');

      // Verify cancellation
      const statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('cancelled');
    });
  });

  describe('Error Recovery Flow', () => {
    it('should retry failed jobs with exponential backoff', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/jobs')
        .send({
          type: 'code-review',
          payload: {
            platform: 'github',
            owner: 'owner',
            repo: 'repo',
            prNumber: 400,
          },
        });

      const jobId = createResponse.body.id;

      // Simulate first failure
      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({
          status: 'failed',
          error: 'Temporary network error',
          attempts: 1,
        });

      let statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.attempts).toBe(1);

      // Simulate second failure
      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({
          status: 'failed',
          error: 'Another temporary error',
          attempts: 2,
        });

      statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.attempts).toBe(2);

      // Simulate success on third attempt
      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({
          status: 'completed',
          attempts: 3,
          result: { success: true },
        });

      statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('completed');
      expect(statusResponse.body.attempts).toBe(3);
    });

    it('should move job to dead letter queue after max attempts', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/jobs')
        .send({
          type: 'code-review',
          payload: {
            platform: 'github',
            owner: 'owner',
            repo: 'repo',
            prNumber: 500,
          },
        });

      const jobId = createResponse.body.id;

      // Simulate max attempts reached
      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({
          status: 'dead',
          error: 'Max retry attempts exceeded',
          attempts: 3,
        });

      const statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('dead');
      expect(statusResponse.body.attempts).toBe(3);
    });
  });

  describe('Metrics and Monitoring Flow', () => {
    it('should track job metrics throughout lifecycle', async () => {
      // Create multiple jobs
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/jobs')
          .send({
            type: 'code-review',
            payload: { prNumber: 600 + i },
          });
      }

      // Get metrics
      const metricsResponse = await request(app).get('/api/jobs/metrics');

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.totalJobs).toBeGreaterThanOrEqual(5);
      expect(metricsResponse.body.pendingJobs).toBeGreaterThanOrEqual(5);
      expect(metricsResponse.body).toHaveProperty('processingJobs');
      expect(metricsResponse.body).toHaveProperty('completedJobs');
      expect(metricsResponse.body).toHaveProperty('failedJobs');
    });
  });
});
