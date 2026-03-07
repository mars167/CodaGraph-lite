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

const platformApiClientMock = {
  getPullRequest: jest.fn(),
  getRepository: jest.fn(),
  getPullRequestFiles: jest.fn(),
};

const commentClientMock = {
  postComment: jest.fn(),
  postReviewComment: jest.fn(),
};

const reviewEngineReviewMock = jest.fn();

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

jest.mock('../platform/client', () => ({
  createPlatformClient: () => platformApiClientMock,
}));

jest.mock('../platform/GitHubClient', () => ({
  GitHubClient: jest.fn(() => commentClientMock),
  GiteeClient: jest.fn(() => commentClientMock),
  GitLabClient: jest.fn(() => commentClientMock),
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
            callers: [],
            callees: [],
            usedGitAi: false,
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
      mode: 'rule-only',
      metadata: {
        llmEnabled: false,
        llmUsed: false,
        gitAiAvailable: false,
        reviewedFiles: 1,
        inlineCommentLimit: 8,
      },
    });
  });

  it('orchestrates advanced review, posts inline comments, and persists the richer payload', async () => {
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
    }));

    expect(commentClientMock.postReviewComment).toHaveBeenCalledTimes(1);
    expect(commentClientMock.postComment).toHaveBeenCalledTimes(1);
    expect(result.postedCommentCount).toBe(2);
    expect(result.riskLevel).toBe('medium');

    const persistedPayload = JSON.parse(analysisModelMock.markComplete.mock.calls[0][1]);
    expect(persistedPayload.mode).toBe('rule-only');
    expect(persistedPayload.inlineComments).toEqual({ planned: 1, posted: 1 });
    expect(persistedPayload.fileReviews).toHaveLength(1);
  });
});
