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
  createPlatformClient: jest.fn(),
}));

import { ReviewTriggerService } from './ReviewTriggerService';

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
    });

    expect(result.created).toBe(true);
    expect(result.jobId).toBe(302);
    expect(queueServiceMock.createJob).toHaveBeenCalledWith(
      'pr_analysis',
      expect.objectContaining({
        analysis_id: '15',
        trigger_source: 'manual',
      }),
      2
    );
  });
});
