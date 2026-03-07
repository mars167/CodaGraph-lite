/**
 * API 端点集成测试
 *
 * 测试所有主要 API 端点的完整流程
 */

import request from 'supertest';
import express from 'express';
import { createApp } from '../../src/index';
import { closeDatabase, initDatabase } from '../../src/database/connection';

// Mock dependencies
jest.mock('../../src/jobs/JobQueue');
jest.mock('../../src/database/connection');
jest.mock('../../src/utils/logger');

describe('API Integration Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Create fresh app instance
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Initialize test database
    await initDatabase(':memory:');
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('Health Check Endpoints', () => {
    it('GET /health should return system status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/login', () => {
      it('should login with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'admin',
            password: 'password123',
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.headers['set-cookie']).toBeDefined();
      });

      it('should reject invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'admin',
            password: 'wrongpassword',
          });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      });

      it('should reject missing credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({});

        expect(response.status).toBe(400);
      });
    });

    describe('POST /api/auth/logout', () => {
      it('should logout successfully', async () => {
        // First login
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'admin',
            password: 'password123',
          });

        const cookie = loginResponse.headers['set-cookie'][0];

        // Then logout
        const response = await request(app)
          .post('/api/auth/logout')
          .set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });
    });

    describe('GET /api/auth/session', () => {
      it('should return session info when authenticated', async () => {
        // First login
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'admin',
            password: 'password123',
          });

        const cookie = loginResponse.headers['set-cookie'][0];

        // Get session
        const response = await request(app)
          .get('/api/auth/session')
          .set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('authenticated', true);
      });

      it('should return unauthenticated when no session', async () => {
        const response = await request(app).get('/api/auth/session');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('authenticated', false);
      });
    });
  });

  describe('Job Endpoints', () => {
    describe('GET /api/jobs', () => {
      it('should list all jobs', async () => {
        const response = await request(app).get('/api/jobs');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('jobs');
        expect(Array.isArray(response.body.jobs)).toBe(true);
      });
    });

    describe('POST /api/jobs', () => {
      it('should create a new job', async () => {
        const response = await request(app)
          .post('/api/jobs')
          .send({
            type: 'review',
            payload: { prNumber: 1, repository: 'owner/repo' },
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.type).toBe('review');
      });
    });

    describe('GET /api/jobs/:id', () => {
      it('should get a specific job by ID', async () => {
        // First create a job
        const createResponse = await request(app)
          .post('/api/jobs')
          .send({
            type: 'review',
            payload: { prNumber: 1, repository: 'owner/repo' },
          });

        const jobId = createResponse.body.id;

        // Then retrieve it
        const response = await request(app).get(`/api/jobs/${jobId}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(jobId);
      });

      it('should return 404 for non-existent job', async () => {
        const response = await request(app).get('/api/jobs/non-existent-id');

        expect(response.status).toBe(404);
      });
    });

    describe('PATCH /api/jobs/:id/status', () => {
      it('should update job status', async () => {
        // Create a job
        const createResponse = await request(app)
          .post('/api/jobs')
          .send({
            type: 'review',
            payload: { prNumber: 1, repository: 'owner/repo' },
          });

        const jobId = createResponse.body.id;

        // Update its status
        const response = await request(app)
          .patch(`/api/jobs/${jobId}/status`)
          .send({
            status: 'completed',
            result: { reviews: 5 },
          });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('completed');
      });
    });

    describe('POST /api/jobs/:id/cancel', () => {
      it('should cancel a job', async () => {
        // Create a job
        const createResponse = await request(app)
          .post('/api/jobs')
          .send({
            type: 'review',
            payload: { prNumber: 1, repository: 'owner/repo' },
          });

        const jobId = createResponse.body.id;

        // Cancel it
        const response = await request(app).post(`/api/jobs/${jobId}/cancel`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('cancelled');
      });
    });
  });

  describe('Job Metrics Endpoints', () => {
    describe('GET /api/jobs/metrics', () => {
      it('should get job metrics', async () => {
        const response = await request(app).get('/api/jobs/metrics');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('totalJobs');
        expect(response.body).toHaveProperty('pendingJobs');
        expect(response.body).toHaveProperty('processingJobs');
        expect(response.body).toHaveProperty('completedJobs');
        expect(response.body).toHaveProperty('failedJobs');
      });
    });
  });

  describe('Repository Endpoints', () => {
    describe('GET /api/repositories', () => {
      it('should list all repositories', async () => {
        const response = await request(app).get('/api/repositories');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('repositories');
        expect(Array.isArray(response.body.repositories)).toBe(true);
      });
    });
  });

  describe('OAuth Integration Endpoints', () => {
    let authCookie: string;

    beforeEach(async () => {
      // Login first to get auth cookie
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });

      authCookie = loginResponse.headers['set-cookie'][0];
    });

    describe('GET /api/oauth/installations', () => {
      it('should return list of oauth installations', async () => {
        const response = await request(app)
          .get('/api/oauth/installations')
          .set('Cookie', authCookie);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('installations');
        expect(Array.isArray(response.body.installations)).toBe(true);
      });
    });

    describe('GET /api/oauth/:platform/authorize', () => {
      it('should redirect to OAuth authorization URL', async () => {
        const response = await request(app)
          .get('/api/oauth/github/authorize')
          .set('Cookie', authCookie);

        expect(response.status).toBe(302);
        expect(response.headers['location']).toBeDefined();
      });
    });
  });

  describe('Webhook Endpoints', () => {
    let authCookie: string;

    beforeEach(async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'password123',
        });

      authCookie = loginResponse.headers['set-cookie'][0];
    });

    describe('POST /webhook/:platform', () => {
      it('should handle GitHub webhook with valid signature', async () => {
        const payload = {
          action: 'opened',
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            owner: { login: 'owner' },
          },
          pull_request: {
            number: 42,
            title: 'Test PR',
          },
        };

        const crypto = require('crypto');
        const secret = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret';
        const payloadStr = JSON.stringify(payload);
        const signature = 'sha256=' + crypto
          .createHmac('sha256', secret)
          .update(payloadStr)
          .digest('hex');

        const response = await request(app)
          .post('/webhook/github')
          .set('x-hub-signature-256', signature)
          .set('x-github-event', 'pull_request')
          .send(payloadStr);

        expect(response.status).toBe(200);
      });

      it('should reject webhook with invalid signature', async () => {
        const response = await request(app)
          .post('/webhook/github')
          .set('x-hub-signature-256', 'sha256=invalid')
          .set('x-github-event', 'pull_request')
          .send({ test: 'data' });

        expect(response.status).toBe(401);
      });
    });
  });
});
