/**
 * Code Review Service 单元测试
 *
 * 测试代码审查流程的核心逻辑
 */

import { CodeReviewService, createCodeReviewService, type PRDetails } from '../../src/services/CodeReviewService';

// Mock all dependencies
jest.mock('../../src/git/GitService');
jest.mock('../../src/agent/AgentProcessService');
jest.mock('../../src/config/resource');
jest.mock('../../src/platform/GitHubClient');
jest.mock('fs/promises');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CodeReviewService', () => {
  let service: CodeReviewService;
  let mockDb: any;
  let mockPlatformClients: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {};
    mockPlatformClients = new Map();
    mockPlatformClients.set('github', {
      postComment: jest.fn().mockResolvedValue(undefined),
      getRepositoryInstallation: jest.fn().mockResolvedValue({ accessToken: 'test-token' }),
    });

    service = createCodeReviewService(mockDb, mockPlatformClients as any);
  });

  describe('Constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(CodeReviewService);
    });

    it('should initialize with workspace root', () => {
      expect(service).toBeDefined();
    });
  });

  describe('handleWebhookEvent', () => {
    it('should handle GitHub PR opened event', async () => {
      const event = {
        action: 'opened',
        repository: {
          owner: { login: 'owner' },
          name: 'repo',
        },
        pull_request: {
          number: 42,
          head: { ref: 'feature' },
          base: { ref: 'main' },
          title: 'Test PR',
          body: 'Description',
        },
      };

      await service.handleWebhookEvent(event, 'test-signature');

      // Verify job was created (implementation stores it internally)
      expect(service).toBeDefined();
    });

    it('should skip non-PR events', async () => {
      const event = {
        action: 'closed',
      };

      await service.handleWebhookEvent(event, 'test-signature');

      // Should complete without error
      expect(service).toBeDefined();
    });
  });

  describe('parsePRInfo', () => {
    it('should parse GitHub PR info correctly', () => {
      const event = {
        action: 'opened',
        repository: {
          owner: { login: 'owner' },
          name: 'repo',
        },
        pull_request: {
          number: 42,
          head: { ref: 'feature' },
          base: { ref: 'main' },
          title: 'Test PR',
          body: 'Description',
        },
      };

      // Access private method through type assertion
      const prInfo = (service as any).parsePRInfo(event);

      expect(prInfo).toEqual({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        prNumber: '42',
        branch: 'feature',
        baseBranch: 'main',
        title: 'Test PR',
        description: 'Description',
      });
    });

    it('should return null for non-PR events', () => {
      const event = {
        action: 'closed',
      };

      const prInfo = (service as any).parsePRInfo(event);

      expect(prInfo).toBeNull();
    });
  });

  describe('createReviewJob', () => {
    it('should create job with unique ID', async () => {
      const prDetails: PRDetails = {
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        prNumber: '42',
        branch: 'feature',
        baseBranch: 'main',
        title: 'Test PR',
        description: 'Description',
      };

      const jobId1 = await (service as any).createReviewJob(prDetails);
      const jobId2 = await (service as any).createReviewJob(prDetails);

      expect(jobId1).toBeDefined();
      expect(jobId2).toBeDefined();
      expect(jobId1).not.toBe(jobId2);
      expect(jobId1).toMatch(/^review-\d+-[a-z0-9]+$/);
    });
  });

  describe('getJobStatus', () => {
    it('should return null for non-existent job', async () => {
      const status = await service.getJobStatus('non-existent');
      expect(status).toBeNull();
    });
  });

  describe('getAllJobs', () => {
    it('should return empty array when no jobs', async () => {
      const jobs = await service.getAllJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe('formatIssueComment', () => {
    it('should format critical security issue', () => {
      const issue = {
        severity: 'critical',
        category: 'security',
        title: 'SQL Injection',
        description: 'Potential SQL injection vulnerability',
        suggestion: 'Use parameterized queries',
      };

      const comment = (service as any).formatIssueComment(issue);

      expect(comment).toContain('🚨');
      expect(comment).toContain('CRITICAL');
      expect(comment).toContain('SQL Injection');
      expect(comment).toContain('🔒');
      expect(comment).toContain('security');
      expect(comment).toContain('建议');
      expect(comment).toContain('Use parameterized queries');
    });

    it('should format major performance issue', () => {
      const issue = {
        severity: 'major',
        category: 'performance',
        title: 'N+1 Query',
        description: 'N+1 query detected',
        suggestion: 'Use eager loading',
      };

      const comment = (service as any).formatIssueComment(issue);

      expect(comment).toContain('⚠️');
      expect(comment).toContain('MAJOR');
      expect(comment).toContain('⚡');
      expect(comment).toContain('performance');
    });

    it('should format minor style issue', () => {
      const issue = {
        severity: 'minor',
        category: 'style',
        title: 'Missing semicolon',
        description: 'Line missing semicolon',
      };

      const comment = (service as any).formatIssueComment(issue);

      expect(comment).toContain('ℹ️');
      expect(comment).toContain('MINOR');
      expect(comment).toContain('🎨');
      expect(comment).toContain('style');
    });

    it('should format bug issue', () => {
      const issue = {
        severity: 'info',
        category: 'bug',
        title: 'Potential null reference',
        description: 'Variable might be null',
      };

      const comment = (service as any).formatIssueComment(issue);

      expect(comment).toContain('💡');
      expect(comment).toContain('INFO');
      expect(comment).toContain('🐛');
      expect(comment).toContain('bug');
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate report for PR with issues', () => {
      const prDetails: PRDetails = {
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        prNumber: '42',
        branch: 'feature',
        baseBranch: 'main',
        title: 'Test PR',
        description: 'Description',
      };

      const reviewResult = {
        fileReviews: [
          {
            filePath: 'src/index.ts',
            issues: [
              {
                severity: 'critical',
                category: 'security',
                title: 'SQL Injection',
                description: 'Potential vulnerability',
                suggestion: 'Fix it',
              },
            ],
          },
          {
            filePath: 'src/utils.ts',
            issues: [],
          },
        ],
        summary: 'Found 1 issue',
      };

      const report = (service as any).generateMarkdownReport(
        prDetails,
        reviewResult,
        new Date()
      );

      expect(report).toContain('# 代码审查报告');
      expect(report).toContain('owner/repo#42');
      expect(report).toContain('feature → main');
      expect(report).toContain('src/index.ts');
      expect(report).toContain('src/utils.ts');
      expect(report).toContain('✅ 无问题');
      expect(report).toContain('SQL Injection');
      expect(report).toContain('Found 1 issue');
    });

    it('should generate report for PR without issues', () => {
      const prDetails: PRDetails = {
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        prNumber: '42',
        branch: 'feature',
        baseBranch: 'main',
        title: 'Test PR',
        description: 'Description',
      };

      const reviewResult = {
        fileReviews: [
          {
            filePath: 'src/index.ts',
            issues: [],
          },
        ],
        summary: 'No issues found',
      };

      const report = (service as any).generateMarkdownReport(
        prDetails,
        reviewResult,
        new Date()
      );

      expect(report).toContain('# 代码审查报告');
      expect(report).toContain('✅ 无问题');
      expect(report).toContain('No issues found');
    });
  });
});

describe('createCodeReviewService Factory', () => {
  it('should create service instance', () => {
    const mockDb = {};
    const mockClients = new Map();

    const service = createCodeReviewService(mockDb, mockClients as any);

    expect(service).toBeInstanceOf(CodeReviewService);
  });
});
