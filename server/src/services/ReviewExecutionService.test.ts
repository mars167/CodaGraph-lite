const analysisModelMock = {
  findById: jest.fn(),
  findByPR: jest.fn(),
  markProcessing: jest.fn(),
  markComplete: jest.fn(),
  markFailed: jest.fn(),
  cancel: jest.fn(),
};

const analysisJobModelMock = {
  findById: jest.fn(),
  findByAnalysisId: jest.fn(),
  markProcessing: jest.fn(),
  updateProgress: jest.fn(),
  markComplete: jest.fn(),
  markFailed: jest.fn(),
};

const repositoryModelMock = {
  findById: jest.fn(),
  findByPlatformOwnerName: jest.fn(),
  updateLastAnalyzed: jest.fn(),
};

const oauthInstallationModelMock = {
  findById: jest.fn(),
};

const oauthInstallationServiceMock = {
  ensureValidAccessToken: jest.fn(),
};

const jobLogModelMock = {
  create: jest.fn(),
};

const queueServiceMock = {
  isCancellationRequested: jest.fn(() => false),
};

const reviewLockModelMock = {
  releaseByAnalysisId: jest.fn(),
};

const platformApiClientMock = {
  getPullRequest: jest.fn(),
  getRepository: jest.fn(),
  getPullRequestFiles: jest.fn(),
};

const commentClientMock = {
  postComment: jest.fn(),
  postReviewComment: jest.fn(),
  submitReview: jest.fn(),
};
const GitHubClientMock = jest.fn(() => commentClientMock);
const GiteeClientMock = jest.fn(() => commentClientMock);
const GitLabClientMock = jest.fn(() => commentClientMock);

const reviewEngineReviewMock = jest.fn();
const defaultTrace = {
  mode: 'improve',
  promptVersion: '2026-03-10-impact-security-logic-v1',
  generatedAt: '2026-03-10T00:00:00.000Z',
  entries: [
    {
      kind: 'stage',
      stage: 'workspace_prepare',
      status: 'completed',
      detail: 'ready',
      durationMs: 120,
      at: '2026-03-10T00:00:00.000Z',
    },
  ],
};

jest.mock('../models/Analysis', () => ({
  getAnalysisModel: () => analysisModelMock,
}));

jest.mock('../models/AnalysisJob', () => ({
  getAnalysisJobModel: () => analysisJobModelMock,
}));

jest.mock('../models/Repository', () => ({
  getRepositoryModel: () => repositoryModelMock,
}));

jest.mock('../models/OAuthInstallation', () => ({
  getOAuthInstallationModel: () => oauthInstallationModelMock,
}));

jest.mock('./OAuthInstallationService', () => ({
  getOAuthInstallationService: () => oauthInstallationServiceMock,
}));

jest.mock('../models/JobLog', () => ({
  getJobLogModel: () => jobLogModelMock,
}));

jest.mock('../jobs/QueueService', () => ({
  getQueueService: () => queueServiceMock,
}));

jest.mock('../models/ReviewLock', () => ({
  getReviewLockModel: () => reviewLockModelMock,
}));

jest.mock('../platform/client', () => ({
  createPlatformClient: () => platformApiClientMock,
}));

jest.mock('../platform/GitHubClient', () => ({
  GitHubClient: GitHubClientMock,
  GiteeClient: GiteeClientMock,
  GitLabClient: GitLabClientMock,
}));

jest.mock('../review/reviewEngine', () => ({
  AdvancedReviewEngine: jest.fn().mockImplementation(() => ({
    review: reviewEngineReviewMock,
  })),
}));

import { ReviewExecutionService } from './ReviewExecutionService';

describe('ReviewExecutionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    commentClientMock.submitReview.mockResolvedValue(undefined);
    commentClientMock.postReviewComment.mockResolvedValue(undefined);
    commentClientMock.postComment.mockResolvedValue(undefined);

    repositoryModelMock.findById.mockReturnValue({
      id: 7,
      platform: 'github',
      owner: 'mars',
      name: 'lite',
      full_name: 'mars/lite',
      installation_id: 11,
    });

    oauthInstallationModelMock.findById.mockReturnValue({
      id: 11,
      is_active: true,
      access_token: 'old-token',
    });

    oauthInstallationServiceMock.ensureValidAccessToken.mockResolvedValue({
      access_token: 'valid-token',
    });

    analysisModelMock.findById.mockReturnValue({
      id: 13,
      platform: 'github',
      owner: 'mars',
      repo_name: 'lite',
      pr_number: 42,
    });

    analysisJobModelMock.findById.mockReturnValue({
      id: 17,
      analysis_id: 13,
    });

    platformApiClientMock.getPullRequest.mockResolvedValue({
      number: 42,
      title: 'Improve review engine',
      head: {
        sha: 'head-sha',
        ref: 'feature/review',
        repo: { full_name: 'mars/lite' },
      },
      base: {
        sha: 'base-sha',
        ref: 'main',
        repo: { full_name: 'mars/lite' },
      },
    });

    platformApiClientMock.getRepository.mockResolvedValue({
      clone_url: 'https://github.com/mars/lite.git',
      default_branch: 'main',
    });

    platformApiClientMock.getPullRequestFiles.mockResolvedValue([
      {
        filename: 'src/review.ts',
        status: 'modified',
        patch: '@@ -1,2 +1,3 @@\n export const run = () => {\n+  console.log("debug")\n }\n',
        additions: 1,
        deletions: 0,
        changes: 1,
      },
    ]);

    reviewEngineReviewMock.mockResolvedValue({
      fileReviews: [
        {
          filePath: 'src/review.ts',
          status: 'modified',
          language: 'typescript',
          fileSummary: 'review.ts 新增了调试逻辑。',
          findings: [
            {
              filePath: 'src/review.ts',
              lineNumber: 2,
              severity: 'medium',
              category: 'maintainability',
              title: '存在调试语句',
              description: 'console.log 会污染生产日志。',
              suggestion: '删除 console.log。',
              source: 'rule',
            },
          ],
          semanticContext: {
            changedSymbols: ['run'],
            relatedSnippets: [],
            impactReferences: [],
            relatedTests: [],
            contextEngineAvailable: false,
          },
          patch: '@@ -1,2 +1,3 @@\n export const run = () => {\n+  console.log("debug")\n }\n',
          usedFallback: true,
        },
      ],
      allFindings: [
        {
          filePath: 'src/review.ts',
          lineNumber: 2,
          severity: 'medium',
          category: 'maintainability',
          title: '存在调试语句',
          description: 'console.log 会污染生产日志。',
          suggestion: '删除 console.log。',
          source: 'rule',
        },
      ],
      summaryFindings: [],
      inlineComments: [
        {
          finding: {
            filePath: 'src/review.ts',
            lineNumber: 2,
            severity: 'medium',
            category: 'maintainability',
            title: '存在调试语句',
            description: 'console.log 会污染生产日志。',
            suggestion: '删除 console.log。',
            source: 'rule',
          },
          position: {
            line: 2,
            side: 'RIGHT',
          },
        },
      ],
      fallbackFindings: [],
      summary: '已完成仓库上下文驱动的 PR review。',
      riskLevel: 'medium',
      confidence: 'medium',
      coverage: {
        totalFiles: 1,
        reviewedFiles: 1,
        skippedFiles: [],
        partialReview: false,
      },
      nextActions: ['删除 console.log。'],
      suppressedFindings: [],
      trace: defaultTrace,
      mode: 'rule-only',
      metadata: {
        llmEnabled: false,
        llmUsed: false,
        contextEngineAvailable: false,
        reviewedFiles: 1,
        inlineCommentLimit: 8,
        reviewMode: 'normal',
        promptVersion: '2026-03-10-impact-security-logic-v1',
      },
    });
  });

  it('submits a GitHub review with inline comments and persists the richer payload', async () => {
    const service = new ReviewExecutionService();

    const result = await service.execute(1001, JSON.stringify({
      platform: 'github',
      repo_name: 'mars/lite',
      pr_number: '42',
      repository_id: '7',
      analysis_id: '13',
      analysis_job_id: '17',
    }));

    expect(reviewEngineReviewMock).toHaveBeenCalledWith(expect.objectContaining({
      repositoryCloneUrl: 'https://github.com/mars/lite.git',
      accessToken: 'valid-token',
      baseSha: 'base-sha',
      headSha: 'head-sha',
      files: [
        expect.objectContaining({
          path: 'src/review.ts',
          status: 'modified',
        }),
      ],
      reviewMode: 'normal',
    }));

    expect(commentClientMock.submitReview).toHaveBeenCalledTimes(1);
    expect(commentClientMock.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'github',
        owner: 'mars',
        repo: 'lite',
        prNumber: '42',
      }),
      expect.objectContaining({
        commitId: 'head-sha',
        comments: [
          expect.objectContaining({
            body: expect.stringContaining('存在调试语句'),
            position: expect.objectContaining({
              path: 'src/review.ts',
              line: 2,
            }),
          }),
        ],
      })
    );
    expect(commentClientMock.postReviewComment).not.toHaveBeenCalled();
    expect(commentClientMock.postComment).not.toHaveBeenCalled();
    expect(result.postedCommentCount).toBe(2);
    expect(result.riskLevel).toBe('medium');

    const persistedPayload = JSON.parse(analysisModelMock.markComplete.mock.calls[0][1]);
    expect(persistedPayload.mode).toBe('rule-only');
    expect(persistedPayload.inlineComments).toEqual({ planned: 1, posted: 1 });
    expect(persistedPayload.fileReviews).toHaveLength(1);
    expect(persistedPayload.coverage).toEqual({
      totalFiles: 1,
      reviewedFiles: 1,
      skippedFiles: [],
      partialReview: false,
    });
    expect(persistedPayload.trace.entries).toHaveLength(1);
    expect(persistedPayload.reportMarkdown).toContain('- 置信度: medium');
    expect(persistedPayload.reportMarkdown).toContain('- Improve Trace: 1');
  });

  it('falls back to single inline comments and a summary comment when GitHub batch review fails', async () => {
    commentClientMock.submitReview.mockRejectedValueOnce(new Error('review batch rejected'));
    const service = new ReviewExecutionService();

    const result = await service.execute(1002, JSON.stringify({
      platform: 'github',
      repo_name: 'mars/lite',
      pr_number: '42',
      repository_id: '7',
      analysis_id: '13',
      analysis_job_id: '17',
    }));

    expect(commentClientMock.submitReview).toHaveBeenCalledTimes(1);
    expect(commentClientMock.postReviewComment).toHaveBeenCalledTimes(1);
    expect(commentClientMock.postComment).toHaveBeenCalledTimes(1);
    expect(result.postedCommentCount).toBe(2);

    const persistedPayload = JSON.parse(analysisModelMock.markComplete.mock.calls[0][1]);
    expect(persistedPayload.inlineComments).toEqual({ planned: 1, posted: 1 });
  });

  it('forces token refresh and retries once when GitHub review submission returns 401', async () => {
    oauthInstallationServiceMock.ensureValidAccessToken
      .mockResolvedValueOnce({
        access_token: 'stale-token',
        auth_type: 'github_app',
        github_app_installation_id: '109713665',
      })
      .mockResolvedValueOnce({
        access_token: 'fresh-token',
        auth_type: 'github_app',
        github_app_installation_id: '109713665',
      });

    commentClientMock.submitReview
      .mockRejectedValueOnce(new Error('GitHub API 批量 review 失败: 401: Bad credentials'))
      .mockResolvedValueOnce(undefined);

    const service = new ReviewExecutionService();

    const result = await service.execute(1004, JSON.stringify({
      platform: 'github',
      repo_name: 'mars/lite',
      pr_number: '42',
      repository_id: '7',
      analysis_id: '13',
      analysis_job_id: '17',
    }));

    expect(result.postedCommentCount).toBe(2);
    expect(commentClientMock.submitReview).toHaveBeenCalledTimes(2);
    expect(oauthInstallationServiceMock.ensureValidAccessToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 11,
        access_token: 'old-token',
      })
    );
    expect(oauthInstallationServiceMock.ensureValidAccessToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        access_token: 'stale-token',
      }),
      true
    );
    expect(GitHubClientMock).toHaveBeenNthCalledWith(1, 'stale-token');
    expect(GitHubClientMock).toHaveBeenNthCalledWith(2, 'fresh-token');
  });

  it('still creates a GitHub review when there are no inline findings', async () => {
    reviewEngineReviewMock.mockResolvedValueOnce({
      fileReviews: [
        {
          filePath: 'src/review.ts',
          status: 'modified',
          language: 'typescript',
          fileSummary: 'review.ts 已完成审查，未发现高价值问题。',
          findings: [],
          semanticContext: {
            changedSymbols: ['run'],
            relatedSnippets: [],
            impactReferences: [],
            relatedTests: [],
            contextEngineAvailable: false,
          },
          patch: '@@ -1,2 +1,2 @@\n export const run = () => {\n }\n',
          usedFallback: true,
        },
      ],
      allFindings: [],
      summaryFindings: [],
      inlineComments: [],
      fallbackFindings: [],
      summary: '已完成仓库上下文驱动的 PR review，未发现需要处理的问题。',
      riskLevel: 'low',
      confidence: 'high',
      coverage: {
        totalFiles: 1,
        reviewedFiles: 1,
        skippedFiles: [],
        partialReview: false,
      },
      nextActions: [],
      suppressedFindings: [],
      trace: undefined,
      mode: 'rule-only',
      metadata: {
        llmEnabled: false,
        llmUsed: false,
        contextEngineAvailable: false,
        reviewedFiles: 1,
        inlineCommentLimit: 8,
        reviewMode: 'normal',
        promptVersion: '2026-03-10-impact-security-logic-v1',
      },
    });

    const service = new ReviewExecutionService();

    const result = await service.execute(1003, JSON.stringify({
      platform: 'github',
      repo_name: 'mars/lite',
      pr_number: '42',
      repository_id: '7',
      analysis_id: '13',
      analysis_job_id: '17',
    }));

    expect(commentClientMock.submitReview).toHaveBeenCalledTimes(1);
    expect(commentClientMock.submitReview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        comments: [],
      })
    );
    expect(commentClientMock.postReviewComment).not.toHaveBeenCalled();
    expect(commentClientMock.postComment).not.toHaveBeenCalled();
    expect(result.postedCommentCount).toBe(1);

    const persistedPayload = JSON.parse(analysisModelMock.markComplete.mock.calls[0][1]);
    expect(persistedPayload.inlineComments).toEqual({ planned: 0, posted: 0 });
  });

  it('persists improve mode metadata and emits trace logs', async () => {
    reviewEngineReviewMock.mockResolvedValueOnce({
      fileReviews: [],
      allFindings: [],
      summaryFindings: [],
      inlineComments: [],
      fallbackFindings: [],
      summary: 'Improve review summary',
      riskLevel: 'low',
      confidence: 'low',
      coverage: {
        totalFiles: 2,
        reviewedFiles: 1,
        skippedFiles: [{ path: 'assets/logo.png', status: 'modified', reason: 'unsupported_type' }],
        partialReview: true,
      },
      nextActions: ['补充人工检查被跳过的文件。'],
      suppressedFindings: [
        {
          finding: {
            filePath: 'src/review.ts',
            lineNumber: 2,
            severity: 'low',
            category: 'maintainability',
            title: '存在调试语句',
            description: 'console.log 会污染生产日志。',
            suggestion: '删除 console.log。',
            source: 'rule',
          },
          reason: '低价值样式/清理类提示默认不参与发布，避免 review 噪音',
        },
      ],
      trace: defaultTrace,
      mode: 'rule-only',
      metadata: {
        llmEnabled: false,
        llmUsed: false,
        contextEngineAvailable: false,
        reviewedFiles: 1,
        inlineCommentLimit: 8,
        reviewMode: 'improve',
        promptVersion: '2026-03-10-impact-security-logic-v1',
      },
    });

    const service = new ReviewExecutionService();

    await service.execute(1005, JSON.stringify({
      platform: 'github',
      repo_name: 'mars/lite',
      pr_number: '42',
      repository_id: '7',
      analysis_id: '13',
      analysis_job_id: '17',
      review_mode: 'improve',
    }));

    expect(reviewEngineReviewMock).toHaveBeenCalledWith(expect.objectContaining({
      reviewMode: 'improve',
    }));

    const persistedPayload = JSON.parse(analysisModelMock.markComplete.mock.calls[0][1]);
    expect(persistedPayload.reviewMode).toBe('improve');
    expect(persistedPayload.suppressedFindings).toHaveLength(1);
    expect(persistedPayload.coverage.partialReview).toBe(true);
    expect(persistedPayload.trace.entries).toHaveLength(1);
    expect(persistedPayload.reportMarkdown).toContain('- 跳过文件: 1');
    expect(persistedPayload.reportMarkdown).toContain('- 抑制噪音项: 1');
    expect(jobLogModelMock.create).toHaveBeenCalledWith(
      1005,
      'info',
      expect.stringContaining('[trace][session]')
    );
  });
});
