import express from 'express';
import request from 'supertest';

const repositoryModelMock = {
  findById: jest.fn(),
  update: jest.fn(),
};

const oauthInstallationModelMock = {
  findById: jest.fn(),
};

const oauthInstallationServiceMock = {
  ensureValidAccessToken: jest.fn(),
};

const analysisModelMock = {
  findByRepository: jest.fn(),
};

const analysisJobModelMock = {
  findByAnalysisId: jest.fn(),
};

const jobModelMock = {
  findByType: jest.fn(),
};

const queueServiceMock = {
  getJobModel: jest.fn(() => jobModelMock),
};

const reviewTriggerServiceMock = {
  triggerByRepositoryId: jest.fn(),
};

const platformClientMock = {
  listPullRequests: jest.fn(),
};

const createPlatformClientMock = jest.fn(() => platformClientMock);

jest.mock('../models/Repository', () => ({
  getRepositoryModel: () => repositoryModelMock,
}));

jest.mock('../models/OAuthInstallation', () => ({
  getOAuthInstallationModel: () => oauthInstallationModelMock,
}));

jest.mock('../models/Analysis', () => ({
  getAnalysisModel: () => analysisModelMock,
}));

jest.mock('../models/AnalysisJob', () => ({
  getAnalysisJobModel: () => analysisJobModelMock,
}));

jest.mock('../jobs/QueueService', () => ({
  getQueueService: () => queueServiceMock,
}));

jest.mock('../platform/client', () => ({
  createPlatformClient: createPlatformClientMock,
}));

jest.mock('../services/OAuthInstallationService', () => ({
  getOAuthInstallationService: () => oauthInstallationServiceMock,
}));

jest.mock('../services/ReviewTriggerService', () => ({
  getReviewTriggerService: () => reviewTriggerServiceMock,
}));

import repositoryRoutes from './repositoryRoutes';

describe('repositoryRoutes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', repositoryRoutes);

    oauthInstallationModelMock.findById.mockReturnValue({
      id: 3,
      platform: 'gitee',
      is_active: true,
      access_token: 'token',
      auth_type: 'oauth',
    });
    oauthInstallationServiceMock.ensureValidAccessToken.mockResolvedValue({
      id: 3,
      platform: 'gitee',
      is_active: true,
      access_token: 'token',
      auth_type: 'oauth',
    });
    platformClientMock.listPullRequests.mockResolvedValue([]);
    analysisModelMock.findByRepository.mockReturnValue([]);
    analysisJobModelMock.findByAnalysisId.mockReturnValue([]);
    jobModelMock.findByType.mockReturnValue([]);
  });

  it('uses canonical coordinates from full_name for pull request listing', async () => {
    repositoryModelMock.findById.mockReturnValue({
      id: 9163,
      platform: 'gitee',
      owner: 'mars167',
      name: 'API REIVEW  PRO1',
      full_name: 'api-review-test-group/api-reivew-pro1',
      installation_id: 3,
      is_active: true,
    });
    repositoryModelMock.update.mockReturnValue({
      id: 9163,
      platform: 'gitee',
      owner: 'api-review-test-group',
      name: 'api-reivew-pro1',
      full_name: 'api-review-test-group/api-reivew-pro1',
      installation_id: 3,
      is_active: true,
    });

    const response = await request(app)
      .get('/9163/pull-requests')
      .query({ state: 'open', page: '1', limit: '20' });

    expect(response.status).toBe(200);
    expect(repositoryModelMock.update).toHaveBeenCalledWith(9163, {
      owner: 'api-review-test-group',
      name: 'api-reivew-pro1',
      full_name: 'api-review-test-group/api-reivew-pro1',
    });
    expect(platformClientMock.listPullRequests).toHaveBeenCalledWith(
      'api-review-test-group',
      'api-reivew-pro1',
      expect.objectContaining({
        state: 'open',
        page: 1,
        per_page: 20,
      })
    );
    expect(response.body.repository).toEqual(expect.objectContaining({
      owner: 'api-review-test-group',
      name: 'api-reivew-pro1',
      full_name: 'api-review-test-group/api-reivew-pro1',
    }));
  });
});
