const analysisModelMock = {
  findById: jest.fn(),
  findByPR: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};

const analysisJobModelMock = {
  create: jest.fn(),
  delete: jest.fn(),
  findByAnalysisId: jest.fn(),
};

const jobLogModelMock = {
  create: jest.fn(),
};

const jobModelMock = {
  findById: jest.fn(),
  findLatestByAnalysisId: jest.fn(),
};

const oauthInstallationModelMock = {
  findById: jest.fn(),
};

const oauthInstallationServiceMock = {
  ensureValidAccessToken: jest.fn(),
};

const queueServiceMock = {
  createJob: jest.fn(),
};

const repositoryModelMock = {
  findById: jest.fn(),
};

const reviewLockModelMock = {
  findActive: jest.fn(),
  acquire: jest.fn(),
  attach: jest.fn(),
  release: jest.fn(),
};

const getPullRequestMock = jest.fn();
const createPlatformClientMock = jest.fn(() => ({
  getPullRequest: getPullRequestMock,
}));

jest.mock('../models/Analysis', () => ({
  getAnalysisModel: () => analysisModelMock,
}));

jest.mock('../models/AnalysisJob', () => ({
  getAnalysisJobModel: () => analysisJobModelMock,
}));

jest.mock('../models/Job', () => ({
  getJobModel: () => jobModelMock,
}));

jest.mock('../models/JobLog', () => ({
  getJobLogModel: () => jobLogModelMock,
}));

jest.mock('../models/OAuthInstallation', () => ({
  getOAuthInstallationModel: () => oauthInstallationModelMock,
}));

jest.mock('../models/Repository', () => ({
  getRepositoryModel: () => repositoryModelMock,
}));

jest.mock('../models/ReviewLock', () => ({
  getReviewLockModel: () => reviewLockModelMock,
}));

jest.mock('../jobs/QueueService', () => ({
  getQueueService: () => queueServiceMock,
}));

jest.mock('./OAuthInstallationService', () => ({
  getOAuthInstallationService: () => oauthInstallationServiceMock,
}));

jest.mock('../platform/client', () => ({
  createPlatformClient: createPlatformClientMock,
}));

import { ReviewTriggerService, ReviewTriggerError } from './ReviewTriggerService';

describe('ReviewTriggerService', () => {
  const repository = {
    id: 7,
    platform: 'github' as const,
    owner: 'mars',
    name: 'lite',
    full_name: 'mars/lite',
    installation_id: 11,
  };

  const pullRequest = {
    number: 42,
    title: 'Improve repository watch',
    user: { login: 'mars', id: 1 },
    head: {
      sha: 'head-sha',
      ref: 'feature/watch',
      repo: { full_name: 'mars/lite' },
    },
    base: {
      sha: 'base-sha',
      ref: 'main',
      repo: { full_name: 'mars/lite' },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    reviewLockModelMock.findActive.mockReturnValue(null);
    jobModelMock.findLatestByAnalysisId.mockReturnValue(null);
    analysisJobModelMock.findByAnalysisId.mockReturnValue([]);
    oauthInstallationModelMock.findById.mockReturnValue({
      id: 11,
      is_active: true,
      access_token: 'token',
      auth_type: 'oauth',
    });
    oauthInstallationServiceMock.ensureValidAccessToken.mockResolvedValue({
      id: 11,
      is_active: true,
      access_token: 'token',
      auth_type: 'oauth',
    });
    getPullRequestMock.mockResolvedValue(pullRequest);
  });

  it('queues a new review for watch when the head commit is new', async () => {
    analysisModelMock.findByPR.mockReturnValue(null);
    reviewLockModelMock.acquire.mockReturnValue({ id: 91 });
    analysisModelMock.create.mockReturnValue({ id: 14, head_commit: 'head-sha' });
    analysisJobModelMock.create.mockReturnValue({ id: 22, analysis_id: 14 });
    queueServiceMock.createJob.mockResolvedValue({ id: 301 });

    const service = new ReviewTriggerService();
    const result = await service.triggerForRepository(repository as any, 42, {
      source: 'watch',
      force: false,
      pullRequest: pullRequest as any,
      reviewMode: 'normal',
    });

    expect(result.created).toBe(true);
    expect(result.jobId).toBe(301);
    expect(queueServiceMock.createJob).toHaveBeenCalledWith(
      'pr_analysis',
      expect.objectContaining({
        analysis_id: '14',
        analysis_job_id: '22',
        head_commit: 'head-sha',
        trigger_source: 'watch',
        review_mode: 'normal',
      }),
      3
    );
    expect(reviewLockModelMock.attach).toHaveBeenNthCalledWith(1, 91, { analysisId: 14 });
    expect(reviewLockModelMock.attach).toHaveBeenNthCalledWith(2, 91, { analysisId: 14, jobId: 301 });
  });

  it('dedupes watch requests when the latest head commit is already completed', async () => {
    analysisModelMock.findByPR.mockReturnValue({
      id: 14,
      head_commit: 'head-sha',
      status: 'completed',
    });
    analysisJobModelMock.findByAnalysisId.mockReturnValue([{ id: 22, analysis_id: 14 }]);
    jobModelMock.findLatestByAnalysisId.mockReturnValue({ id: 301, status: 'completed' });

    const service = new ReviewTriggerService();
    const result = await service.triggerForRepository(repository as any, 42, {
      source: 'watch',
      force: false,
      pullRequest: pullRequest as any,
    });

    expect(result.created).toBe(false);
    expect(result.reason).toBe('already_reviewed');
    expect(analysisModelMock.create).not.toHaveBeenCalled();
    expect(queueServiceMock.createJob).not.toHaveBeenCalled();
  });

  it('allows manual force rerun for the same head commit when no active lock exists', async () => {
    analysisModelMock.findByPR.mockReturnValue({
      id: 14,
      head_commit: 'head-sha',
      status: 'completed',
    });
    reviewLockModelMock.acquire.mockReturnValue({ id: 99 });
    analysisModelMock.create.mockReturnValue({ id: 15, head_commit: 'head-sha' });
    analysisJobModelMock.create.mockReturnValue({ id: 23, analysis_id: 15 });
    queueServiceMock.createJob.mockResolvedValue({ id: 302 });

    const service = new ReviewTriggerService();
    const result = await service.triggerForRepository(repository as any, 42, {
      source: 'manual',
      force: true,
      pullRequest: pullRequest as any,
      reviewMode: 'improve',
    });

    expect(result.created).toBe(true);
    expect(result.jobId).toBe(302);
    expect(queueServiceMock.createJob).toHaveBeenCalledWith(
      'pr_analysis',
      expect.objectContaining({
        analysis_id: '15',
        trigger_source: 'manual',
        review_mode: 'improve',
      }),
      2
    );
  });

  it('throws a 404 ReviewTriggerError when the repository does not exist', async () => {
    repositoryModelMock.findById.mockReturnValue(null);

    const service = new ReviewTriggerService();

    await expect(service.triggerByRepositoryId(999, 42, {
      source: 'manual',
      force: true,
    } as any)).rejects.toMatchObject<Partial<ReviewTriggerError>>({
      name: 'ReviewTriggerError',
      message: '仓库不存在',
      statusCode: 404,
    });
  });

  it('throws a 400 ReviewTriggerError when the repository installation is unavailable', async () => {
    repositoryModelMock.findById.mockReturnValue(repository);
    oauthInstallationModelMock.findById.mockReturnValue(null);

    const service = new ReviewTriggerService();

    await expect(service.triggerByRepositoryId(7, 42, {
      source: 'manual',
      force: true,
    } as any)).rejects.toMatchObject<Partial<ReviewTriggerError>>({
      name: 'ReviewTriggerError',
      message: '仓库关联的 OAuth 安装不可用',
      statusCode: 400,
    });
  });

  it('uses canonical repository coordinates derived from full_name', async () => {
    const misalignedRepository = {
      id: 7,
      platform: 'gitee' as const,
      owner: 'mars167',
      name: 'API REIVEW  PRO1',
      full_name: 'api-review-test-group/api-reivew-pro1',
      installation_id: 11,
    };

    repositoryModelMock.findById.mockReturnValue(misalignedRepository);
    reviewLockModelMock.acquire.mockReturnValue({ id: 92 });
    analysisModelMock.findByPR.mockReturnValue(null);
    analysisModelMock.create.mockReturnValue({ id: 16, head_commit: 'head-sha' });
    analysisJobModelMock.create.mockReturnValue({ id: 24, analysis_id: 16 });
    queueServiceMock.createJob.mockResolvedValue({ id: 303 });

    const service = new ReviewTriggerService();

    const result = await service.triggerByRepositoryId(7, 42, {
      source: 'manual',
      force: true,
      reviewMode: 'normal',
    });

    expect(result.created).toBe(true);
    expect(getPullRequestMock).toHaveBeenCalledWith(
      'api-review-test-group',
      'api-reivew-pro1',
      42
    );
    expect(analysisModelMock.create).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'api-review-test-group',
      repo_name: 'api-reivew-pro1',
    }));
    expect(queueServiceMock.createJob).toHaveBeenCalledWith(
      'pr_analysis',
      expect.objectContaining({
        repo_name: 'api-review-test-group/api-reivew-pro1',
      }),
      2
    );
  });
});
