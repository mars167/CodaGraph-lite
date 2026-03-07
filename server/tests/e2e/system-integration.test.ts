import request from 'supertest';
import express from 'express';
import { createApp } from '../../src/index';
import { closeDatabase, initDatabase } from '../../src/database/connection';
import { JobQueue } from '../../src/jobs/JobQueue';
import crypto from 'crypto';

jest.mock('../../src/agent/ContextAgentClient');
jest.mock('../../src/agent/ReviewAgentClient');
jest.mock('../../src/git/GitService');
jest.mock('../../src/platform/GitHubClient');
jest.mock('../../src/utils/logger');

describe('End-to-End System Integration Tests', () => {
  let app: express.Application;
  let jobQueue: JobQueue;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.SESSION_SECRET = 'test-secret';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'password123';
    process.env.GITHUB_WEBHOOK_SECRET = 'github-secret';
    process.env.GITEE_WEBHOOK_SECRET = 'gitee-secret';
    process.env.GITLAB_WEBHOOK_SECRET = 'gitlab-secret';

    await initDatabase();
    app = await createApp();
    jobQueue = JobQueue.getInstance();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    await jobQueue.clear();
  });

  describe('Complete Code Review Flow', () => {
    it('should process GitHub PR from webhook to completion', async () => {
      const webhookPayload = {
        action: 'opened',
        repository: {
          id: 123,
          name: 'test-repo',
          full_name: 'owner/test-repo',
          owner: { login: 'owner' },
          html_url: 'https://github.com/owner/test-repo',
        },
        pull_request: {
          id: 456,
          number: 42,
          title: 'Add new feature',
          body: 'This PR adds a new feature',
          state: 'open',
          user: { login: 'developer' },
          head: {
            ref: 'feature-branch',
            sha: 'abc123',
            repo: { full_name: 'owner/test-repo' },
          },
          base: {
            ref: 'main',
            sha: 'def456',
            repo: { full_name: 'owner/test-repo' },
          },
          html_url: 'https://github.com/owner/test-repo/pull/42',
        },
        sender: { login: 'developer' },
      };

      const secret = process.env.GITHUB_WEBHOOK_SECRET!;
      const payloadStr = JSON.stringify(webhookPayload);
      const signature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');

      const webhookResponse = await request(app)
        .post('/webhook/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'pull_request')
        .send(payloadStr);

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body.success).toBe(true);

      const jobsResponse = await request(app).get('/api/jobs');
      expect(jobsResponse.status).toBe(200);
      expect(jobsResponse.body.jobs).toHaveLength(1);

      const job = jobsResponse.body.jobs[0];
      expect(job.type).toBe('code-review');
      expect(job.status).toBe('pending');

      const jobDetails = await request(app).get(`/api/jobs/${job.id}`);
      expect(jobDetails.status).toBe(200);
      expect(jobDetails.body.id).toBe(job.id);

      const metricsResponse = await request(app).get('/api/jobs/metrics');
      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.totalJobs).toBe(1);
      expect(metricsResponse.body.pendingJobs).toBe(1);
    });

    it('should handle Gitee PR webhook flow', async () => {
      const webhookPayload = {
        action: 'open',
        pull_request: {
          number: 15,
          title: 'Fix authentication bug',
          state: 'open',
          user: { login: 'contributor' },
          head: {
            ref: 'bugfix/auth',
            sha: 'aaa111',
            repo: { full_name: 'org/project' },
          },
          base: {
            ref: 'master',
            sha: 'bbb222',
            repo: { full_name: 'org/project' },
          },
          html_url: 'https://gitee.com/org/project/pull/15',
        },
        repository: {
          id: 222,
          name: 'project',
          full_name: 'org/project',
          owner: { login: 'org' },
        },
      };

      const secret = process.env.GITEE_WEBHOOK_SECRET!;
      const payloadStr = JSON.stringify(webhookPayload);
      const token = crypto
        .createHash('sha1')
        .update(payloadStr + secret)
        .digest('hex');

      const webhookResponse = await request(app)
        .post('/webhook/gitee')
        .set('x-gitee-token', token)
        .set('x-gitee-event', 'Pull Request')
        .send(payloadStr);

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body.success).toBe(true);

      const jobsResponse = await request(app).get('/api/jobs');
      expect(jobsResponse.body.jobs).toHaveLength(1);
    });

    it('should handle GitLab MR webhook flow', async () => {
      const webhookPayload = {
        object_kind: 'merge_request',
        object_attributes: {
          id: 99,
          iid: 33,
          title: 'Refactor database layer',
          state: 'opened',
          action: 'open',
          source_branch: 'refactor/db',
          target_branch: 'develop',
          source: { sha: 'ccc333' },
          target: { sha: 'ddd444' },
          url: 'https://gitlab.com/company/project/merge_requests/33',
        },
        project: {
          id: 333,
          name: 'project',
          path_with_namespace: 'company/project',
        },
        user: { username: 'engineer' },
      };

      const secret = process.env.GITLAB_WEBHOOK_SECRET!;
      const payloadStr = JSON.stringify(webhookPayload);
      const token = crypto
        .createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');

      const webhookResponse = await request(app)
        .post('/webhook/gitlab')
        .set('x-gitlab-token', token)
        .set('x-gitlab-event', 'Merge Request Hook')
        .send(payloadStr);

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body.success).toBe(true);

      const jobsResponse = await request(app).get('/api/jobs');
      expect(jobsResponse.body.jobs).toHaveLength(1);
    });
  });

  describe('Authentication Flow', () => {
    it('should complete login-logout cycle', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
      const cookie = loginResponse.headers['set-cookie'][0];

      const sessionResponse = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookie);

      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.body.authenticated).toBe(true);

      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);

      const afterLogoutResponse = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookie);

      expect(afterLogoutResponse.body.authenticated).toBe(false);
    });

    it('should reject invalid login attempts', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Job Lifecycle Flow', () => {
    it('should process job through all states', async () => {
      const createResponse = await request(app)
        .post('/api/jobs')
        .send({
          type: 'code-review',
          payload: {
            platform: 'github',
            owner: 'owner',
            repo: 'repo',
            prNumber: 100,
          },
        });

      expect(createResponse.status).toBe(201);
      const jobId = createResponse.body.id;

      let statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('pending');

      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'processing', stage: 'cloning' });

      statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('processing');

      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'processing', stage: 'indexing' });

      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'processing', stage: 'collecting' });

      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'processing', stage: 'reviewing' });

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
      expect(statusResponse.body.result.filesReviewed).toBe(10);
    });

    it('should handle job failure and retry', async () => {
      const createResponse = await request(app)
        .post('/api/jobs')
        .send({
          type: 'code-review',
          payload: { prNumber: 200 },
        });

      const jobId = createResponse.body.id;

      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({
          status: 'failed',
          error: 'Temporary error',
          attempts: 1,
        });

      let statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('failed');
      expect(statusResponse.body.attempts).toBe(1);

      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'pending', attempts: 2 });

      await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({
          status: 'completed',
          attempts: 2,
          result: { success: true },
        });

      statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('completed');
      expect(statusResponse.body.attempts).toBe(2);
    });

    it('should handle job cancellation', async () => {
      const createResponse = await request(app)
        .post('/api/jobs')
        .send({
          type: 'code-review',
          payload: { prNumber: 300 },
        });

      const jobId = createResponse.body.id;

      const cancelResponse = await request(app).post(`/api/jobs/${jobId}/cancel`);

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.status).toBe('cancelled');

      const statusResponse = await request(app).get(`/api/jobs/${jobId}`);
      expect(statusResponse.body.status).toBe('cancelled');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid webhook signatures', async () => {
      const response = await request(app)
        .post('/webhook/github')
        .set('x-hub-signature-256', 'sha256=invalid')
        .set('x-github-event', 'pull_request')
        .send({ test: 'data' });

      expect(response.status).toBe(401);
    });

    it('should handle malformed webhook payloads', async () => {
      const secret = process.env.GITHUB_WEBHOOK_SECRET!;
      const payloadStr = 'invalid json{';
      const signature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');

      const response = await request(app)
        .post('/webhook/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'pull_request')
        .send(payloadStr);

      expect(response.status).toBe(500);
    });

    it('should handle non-existent job queries', async () => {
      const response = await request(app).get('/api/jobs/non-existent-id');
      expect(response.status).toBe(404);
    });

    it('should handle concurrent job operations', async () => {
      const jobPromises = [];
      for (let i = 0; i < 10; i++) {
        jobPromises.push(
          request(app)
            .post('/api/jobs')
            .send({
              type: 'code-review',
              payload: { prNumber: i },
            })
        );
      }

      const responses = await Promise.all(jobPromises);
      responses.forEach((response) => {
        expect(response.status).toBe(201);
      });

      const jobsResponse = await request(app).get('/api/jobs');
      expect(jobsResponse.body.jobs).toHaveLength(10);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track job metrics accurately', async () => {
      await request(app)
        .post('/api/jobs')
        .send({ type: 'code-review', payload: { prNumber: 1 } });

      await request(app)
        .post('/api/jobs')
        .send({ type: 'code-review', payload: { prNumber: 2 } });

      const jobResponse = await request(app)
        .post('/api/jobs')
        .send({ type: 'code-review', payload: { prNumber: 3 } });

      await request(app)
        .patch(`/api/jobs/${jobResponse.body.id}/status`)
        .send({ status: 'processing' });

      const metricsResponse = await request(app).get('/api/jobs/metrics');

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.totalJobs).toBe(3);
      expect(metricsResponse.body.pendingJobs).toBe(2);
      expect(metricsResponse.body.processingJobs).toBe(1);
    });
  });

  describe('System Health Checks', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return system status', async () => {
      const response = await request(app).get('/api/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
    });
  });
});
