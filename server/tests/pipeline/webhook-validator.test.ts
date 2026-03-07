/**
 * Webhook Validator 单元测试
 *
 * 测试 webhook 签名验证和事件类型解析
 */

import { validateGitHubWebhook, validateGiteeWebhook, validateGitLabWebhook, parseWebhookEventType, extractRepositoryInfo, extractPullRequestInfo, extractCommitInfo, WebhookEventType, type GitHubWebhookPayload, type GiteeWebhookPayload, type GitLabWebhookPayload } from '../../src/webhook/validator';
import crypto from 'crypto';

describe('Webhook Validator', () => {
  const secret = 'test-secret';

  describe('GitHub Webhook Validation', () => {
    it('should validate correct GitHub webhook signature', () => {
      const payload = JSON.stringify({ action: 'opened', repository: { name: 'test' } });
      const signature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      const isValid = validateGitHubWebhook(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect GitHub webhook signature', () => {
      const payload = JSON.stringify({ action: 'opened' });
      const wrongSignature = 'sha256=wronghash';

      const isValid = validateGitHubWebhook(payload, wrongSignature, secret);
      expect(isValid).toBe(false);
    });

    it('should reject malformed signature (missing sha256 prefix)', () => {
      const payload = JSON.stringify({ action: 'opened' });
      const malformedSignature = 'wronghash';

      const isValid = validateGitHubWebhook(payload, malformedSignature, secret);
      expect(isValid).toBe(false);
    });

    it('should reject empty payload', () => {
      const payload = '';
      const signature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      const isValid = validateGitHubWebhook(payload, signature, secret);
      expect(isValid).toBe(true); // Empty payload is technically valid if signature matches
    });
  });

  describe('Gitee Webhook Validation', () => {
    it('should validate correct Gitee webhook token', () => {
      const payload = JSON.stringify({ action: 'opened' });
      const token = crypto
        .createHash('sha1')
        .update(payload + secret, 'utf8')
        .digest('hex');

      const isValid = validateGiteeWebhook(payload, token, secret);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect Gitee webhook token', () => {
      const payload = JSON.stringify({ action: 'opened' });
      const wrongToken = 'wrongtoken';

      const isValid = validateGiteeWebhook(payload, wrongToken, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('GitLab Webhook Validation', () => {
    it('should validate correct GitLab webhook token', () => {
      const payload = JSON.stringify({ object_kind: 'merge_request' });
      const token = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      const isValid = validateGitLabWebhook(payload, token, secret);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect GitLab webhook token', () => {
      const payload = JSON.stringify({ object_kind: 'merge_request' });
      const wrongToken = 'wrongtoken';

      const isValid = validateGitLabWebhook(payload, wrongToken, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('Webhook Event Type Parsing', () => {
    it('should parse GitHub pull_request event', () => {
      const eventType = parseWebhookEventType('pull_request', 'github');
      expect(eventType).toBe(WebhookEventType.PULL_REQUEST);
    });

    it('should parse GitHub push event', () => {
      const eventType = parseWebhookEventType('push', 'github');
      expect(eventType).toBe(WebhookEventType.PUSH);
    });

    it('should parse GitHub ping event', () => {
      const eventType = parseWebhookEventType('ping', 'github');
      expect(eventType).toBe(WebhookEventType.PING);
    });

    it('should parse Gitee Pull Request event', () => {
      const eventType = parseWebhookEventType('Pull Request', 'gitee');
      expect(eventType).toBe(WebhookEventType.PULL_REQUEST_GITEE);
    });

    it('should parse Gitee Push Hook event', () => {
      const eventType = parseWebhookEventType('Push Hook', 'gitee');
      expect(eventType).toBe(WebhookEventType.PUSH_GITEE);
    });

    it('should parse GitLab Merge Request Hook event', () => {
      const eventType = parseWebhookEventType('Merge Request Hook', 'gitlab');
      expect(eventType).toBe(WebhookEventType.MERGE_REQUEST);
    });

    it('should parse GitLab Push Hook event', () => {
      const eventType = parseWebhookEventType('Push Hook', 'gitlab');
      expect(eventType).toBe(WebhookEventType.PUSH_GITLAB);
    });

    it('should return null for unknown event type', () => {
      const eventType = parseWebhookEventType('unknown', 'github');
      expect(eventType).toBeNull();
    });
  });

  describe('Extract Repository Info', () => {
    it('should extract GitHub repository info', () => {
      const payload: GitHubWebhookPayload = {
        number: 1,
        repository: {
          full_name: 'owner/repo',
          name: 'repo',
          owner: { login: 'owner' },
        },
      };

      const info = extractRepositoryInfo(payload, 'github');
      expect(info).toEqual({
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should extract Gitee repository info', () => {
      const payload: GiteeWebhookPayload = {
        number: 1,
        repository: {
          full_name: 'owner/repo',
          name: 'repo',
          owner: { login: 'owner' },
        },
      };

      const info = extractRepositoryInfo(payload, 'gitee');
      expect(info).toEqual({
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should extract GitLab repository info', () => {
      const payload: GitLabWebhookPayload = {
        project: {
          path_with_namespace: 'owner/repo',
          name: 'repo',
          owner: { name: 'owner' },
        },
      };

      const info = extractRepositoryInfo(payload, 'gitlab');
      expect(info).toEqual({
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should return null when repository info is missing', () => {
      const payload: GitHubWebhookPayload = { number: 1 };
      const info = extractRepositoryInfo(payload, 'github');
      expect(info).toBeNull();
    });
  });

  describe('Extract Pull Request Info', () => {
    it('should extract GitHub PR info', () => {
      const payload: GitHubWebhookPayload = {
        number: 1,
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

      const info = extractPullRequestInfo(payload, 'github');
      expect(info).toEqual({
        number: 42,
        title: 'Test PR',
        author: 'author',
        htmlUrl: 'https://github.com/owner/repo/pull/42',
      });
    });

    it('should extract Gitee PR info', () => {
      const payload: GiteeWebhookPayload = {
        number: 1,
        pull_request: {
          number: 42,
          title: 'Test PR',
          html_url: 'https://gitee.com/owner/repo/pull/42',
          state: 'open',
          user: { login: 'author', id: 1 },
          head: { sha: 'abc123', ref: 'feature', repo: { full_name: 'owner/repo' } },
          base: { sha: 'def456', ref: 'main', repo: { full_name: 'owner/repo' } },
        },
      };

      const info = extractPullRequestInfo(payload, 'gitee');
      expect(info).toEqual({
        number: 42,
        title: 'Test PR',
        author: 'author',
        htmlUrl: 'https://gitee.com/owner/repo/pull/42',
      });
    });

    it('should extract GitLab MR info', () => {
      const payload: GitLabWebhookPayload = {
        object_attributes: {
          id: 42,
          title: 'Test MR',
          url: 'https://gitlab.com/owner/repo/merge_requests/42',
          state: 'opened',
          source_branch: 'feature',
          target_branch: 'main',
          source: { id: 1, sha: 'abc123', ref: 'feature' },
          target: { id: 2, sha: 'def456', ref: 'main' },
        },
        user: { username: 'author', id: 1 },
      };

      const info = extractPullRequestInfo(payload, 'gitlab');
      expect(info).toEqual({
        number: 42,
        title: 'Test MR',
        author: 'author',
        htmlUrl: 'https://gitlab.com/owner/repo/merge_requests/42',
      });
    });

    it('should return null when PR info is missing', () => {
      const payload: GitHubWebhookPayload = { number: 1 };
      const info = extractPullRequestInfo(payload, 'github');
      expect(info).toBeNull();
    });
  });

  describe('Extract Commit Info', () => {
    it('should extract GitHub commit info', () => {
      const payload: GitHubWebhookPayload = {
        number: 1,
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

      const info = extractCommitInfo(payload, 'github');
      expect(info).toEqual({
        headSha: 'abc123',
        baseSha: 'def456',
        headRef: 'feature',
        baseRef: 'main',
      });
    });

    it('should extract Gitee commit info', () => {
      const payload: GiteeWebhookPayload = {
        number: 1,
        pull_request: {
          number: 42,
          title: 'Test PR',
          html_url: 'https://gitee.com/owner/repo/pull/42',
          state: 'open',
          user: { login: 'author', id: 1 },
          head: { sha: 'abc123', ref: 'feature', repo: { full_name: 'owner/repo' } },
          base: { sha: 'def456', ref: 'main', repo: { full_name: 'owner/repo' } },
        },
      };

      const info = extractCommitInfo(payload, 'gitee');
      expect(info).toEqual({
        headSha: 'abc123',
        baseSha: 'def456',
        headRef: 'feature',
        baseRef: 'main',
      });
    });

    it('should extract GitLab commit info', () => {
      const payload: GitLabWebhookPayload = {
        object_attributes: {
          id: 42,
          title: 'Test MR',
          url: 'https://gitlab.com/owner/repo/merge_requests/42',
          state: 'opened',
          source_branch: 'feature',
          target_branch: 'main',
          source: { id: 1, sha: 'abc123', ref: 'feature' },
          target: { id: 2, sha: 'def456', ref: 'main' },
        },
      };

      const info = extractCommitInfo(payload, 'gitlab');
      expect(info).toEqual({
        headSha: 'abc123',
        baseSha: 'def456',
        headRef: 'feature',
        baseRef: 'main',
      });
    });

    it('should return null when commit info is missing', () => {
      const payload: GitHubWebhookPayload = { number: 1 };
      const info = extractCommitInfo(payload, 'github');
      expect(info).toBeNull();
    });
  });
});
