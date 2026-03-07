/**
 * Webhook Handlers 单元测试
 *
 * 测试 webhook 事件处理逻辑
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import {
  handleWebhookRequest,
  handlePullRequestEvent,
  handlePingEvent,
  handlePushEvent,
  createEventHandler,
  parseGitHubAction,
  parseGitLabAction,
  shouldProcessEvent,
  type WebhookHandlerOptions,
} from '../../src/webhook/handlers';
import { WebhookEventType } from '../../src/webhook/validator';

describe('Webhook Handlers', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockRequest = {
      body: {},
      headers: {},
    };
    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };
  });

  describe('handleWebhookRequest', () => {
    const options: WebhookHandlerOptions = {
      platform: 'github',
      secret: 'test-secret',
    };

    it('should reject request with invalid signature', async () => {
      mockRequest.body = JSON.stringify({ action: 'opened' });
      mockRequest.headers = {
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'pull_request',
      };

      const result = await handleWebhookRequest(
        mockRequest as Request,
        mockResponse as Response,
        options
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('签名验证失败');
      expect(mockStatus).toHaveBeenCalledWith(401);
    });

    it('should reject request with unknown event type', async () => {
      mockRequest.body = JSON.stringify({ action: 'opened' });
      mockRequest.headers = {
        'x-hub-signature-256': 'sha256=abc123',
        'x-github-event': 'unknown_event',
      };

      const result = await handleWebhookRequest(
        mockRequest as Request,
        mockResponse as Response,
        options
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('未知的事件类型');
      expect(mockStatus).toHaveBeenCalledWith(400);
    });

    it('should successfully handle valid webhook request', async () => {
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
          html_url: 'https://github.com/owner/repo/pull/42',
          state: 'open',
          user: { login: 'author', id: 1 },
          head: { sha: 'abc123', ref: 'feature', repo: { full_name: 'owner/repo' } },
          base: { sha: 'def456', ref: 'main', repo: { full_name: 'owner/repo' } },
        },
      };

      // Create valid signature
      const payloadStr = JSON.stringify(payload);
      const signature = 'sha256=' + crypto
        .createHmac('sha256', options.secret)
        .update(payloadStr, 'utf8')
        .digest('hex');

      mockRequest.body = payloadStr;
      mockRequest.headers = {
        'x-hub-signature-256': signature,
        'x-github-event': 'pull_request',
      };

      const result = await handleWebhookRequest(
        mockRequest as Request,
        mockResponse as Response,
        options
      );

      expect(result.success).toBe(true);
      expect(result.data?.eventType).toBe(WebhookEventType.PULL_REQUEST);
      expect(result.data?.repository?.fullName).toBe('owner/repo');
      expect(result.data?.pullRequest?.number).toBe(42);
      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should call event handler callback when provided', async () => {
      const payload = { action: 'opened' };
      const payloadStr = JSON.stringify(payload);
      const signature = 'sha256=' + crypto
        .createHmac('sha256', options.secret)
        .update(payloadStr, 'utf8')
        .digest('hex');

      mockRequest.body = payloadStr;
      mockRequest.headers = {
        'x-hub-signature-256': signature,
        'x-github-event': 'ping',
      };

      const mockCallback = jest.fn();
      await handleWebhookRequest(
        mockRequest as Request,
        mockResponse as Response,
        options,
        mockCallback
      );

      expect(mockCallback).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockRequest.body = 'invalid json{{{';
      mockRequest.headers = {
        'x-hub-signature-256': 'sha256=abc123',
        'x-github-event': 'pull_request',
      };

      const result = await handleWebhookRequest(
        mockRequest as Request,
        mockResponse as Response,
        options
      );

      expect(result.success).toBe(false);
      expect(mockStatus).toHaveBeenCalledWith(500);
    });
  });

  describe('handlePullRequestEvent', () => {
    it('should handle PR opened event', async () => {
      const payload = {
        repository: {
          full_name: 'owner/repo',
          name: 'repo',
          owner: { login: 'owner' },
        },
        pull_request: {
          number: 42,
          title: 'Test PR',
          html_url: 'https://github.com/owner/repo/pull/42',
          state: 'open',
          user: { login: 'author', id: 1 },
        },
      };

      await expect(
        handlePullRequestEvent('github', payload, 'opened')
      ).resolves.not.toThrow();
    });

    it('should skip event without PR info', async () => {
      const payload = {};

      await expect(
        handlePullRequestEvent('github', payload, 'opened')
      ).resolves.not.toThrow();
    });
  });

  describe('handlePingEvent', () => {
    it('should handle ping event', async () => {
      await expect(
        handlePingEvent('github', {})
      ).resolves.not.toThrow();
    });
  });

  describe('handlePushEvent', () => {
    it('should handle push event', async () => {
      const payload = {
        repository: {
          full_name: 'owner/repo',
          name: 'repo',
          owner: { login: 'owner' },
        },
      };

      await expect(
        handlePushEvent('github', payload)
      ).resolves.not.toThrow();
    });

    it('should skip event without repository info', async () => {
      const payload = {};

      await expect(
        handlePushEvent('github', payload)
      ).resolves.not.toThrow();
    });
  });

  describe('createEventHandler', () => {
    it('should create handler for pull request events', async () => {
      const mockPRHandler = jest.fn();
      const handler = createEventHandler(mockPRHandler);

      await handler('github', WebhookEventType.PULL_REQUEST, {
        action: 'opened',
        repository: { full_name: 'owner/repo' },
        pull_request: { number: 42 },
      });

      expect(mockPRHandler).toHaveBeenCalled();
    });

    it('should create handler for ping events', async () => {
      const mockPingHandler = jest.fn();
      const handler = createEventHandler(undefined, mockPingHandler);

      await handler('github', WebhookEventType.PING, {});

      expect(mockPingHandler).toHaveBeenCalled();
    });

    it('should create handler for push events', async () => {
      const mockPushHandler = jest.fn();
      const handler = createEventHandler(undefined, undefined, mockPushHandler);

      await handler('github', WebhookEventType.PUSH, {
        repository: { full_name: 'owner/repo' },
      });

      expect(mockPushHandler).toHaveBeenCalled();
    });

    it('should not call handler if callback is undefined', async () => {
      const handler = createEventHandler();

      await expect(
        handler('github', WebhookEventType.PULL_REQUEST, { action: 'opened' })
      ).resolves.not.toThrow();
    });
  });

  describe('parseGitHubAction', () => {
    it('should parse action from GitHub payload', () => {
      const payload = { action: 'opened' };
      const action = parseGitHubAction(payload);
      expect(action).toBe('opened');
    });

    it('should return null if action is missing', () => {
      const payload = {};
      const action = parseGitHubAction(payload);
      expect(action).toBeNull();
    });
  });

  describe('parseGitLabAction', () => {
    it('should parse action from GitLab payload', () => {
      const payload = {
        object_attributes: { action: 'open' },
      };
      const action = parseGitLabAction(payload);
      expect(action).toBe('open');
    });

    it('should return null if action is missing', () => {
      const payload = {};
      const action = parseGitLabAction(payload);
      expect(action).toBeNull();
    });
  });

  describe('shouldProcessEvent', () => {
    it('should process PR opened event', () => {
      const should = shouldProcessEvent(WebhookEventType.PULL_REQUEST, 'opened');
      expect(should).toBe(true);
    });

    it('should process PR synchronize event', () => {
      const should = shouldProcessEvent(WebhookEventType.PULL_REQUEST, 'synchronize');
      expect(should).toBe(true);
    });

    it('should process PR reopened event', () => {
      const should = shouldProcessEvent(WebhookEventType.PULL_REQUEST, 'reopened');
      expect(should).toBe(true);
    });

    it('should not process PR closed event', () => {
      const should = shouldProcessEvent(WebhookEventType.PULL_REQUEST, 'closed');
      expect(should).toBe(false);
    });

    it('should always process ping event', () => {
      const should = shouldProcessEvent(WebhookEventType.PING);
      expect(should).toBe(true);
    });

    it('should not process other events by default', () => {
      const should = shouldProcessEvent(WebhookEventType.PUSH);
      expect(should).toBe(false);
    });
  });
});
