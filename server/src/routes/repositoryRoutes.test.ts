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
  createWebhook: jest.fn(),
  deleteWebhook: jest.fn(),
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
    platformClientMock.createWebhook.mockResolvedValue({
      id: 101,
      url: 'https://example.com/webhook',
    });
    platformClientMock.deleteWebhook.mockResolvedValue(undefined);
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

  it('uses canonical coordinates from full_name when creating a webhook', async () => {
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
      webhook_id: '101',
      webhook_secret: 'secret',
      webhook_url: 'https://example.com/webhook',
    });

    const response = await request(app)
      .post('/9163/webhook')
      .send({ webhook_url: 'https://example.com/webhook' });

    expect(response.status).toBe(200);
    expect(platformClientMock.createWebhook).toHaveBeenCalledWith(
      'api-review-test-group',
      'api-reivew-pro1',
      expect.objectContaining({
        url: 'https://example.com/webhook',
        content_type: 'json',
      })
    );
  });

  it('uses canonical coordinates from full_name when deleting a webhook', async () => {
    repositoryModelMock.findById.mockReturnValue({
      id: 9163,
      platform: 'gitee',
      owner: 'mars167',
      name: 'API REIVEW  PRO1',
      full_name: 'api-review-test-group/api-reivew-pro1',
      installation_id: 3,
      is_active: true,
      webhook_id: '101',
    });
    repositoryModelMock.update
      .mockReturnValueOnce({
        id: 9163,
        platform: 'gitee',
        owner: 'api-review-test-group',
        name: 'api-reivew-pro1',
        full_name: 'api-review-test-group/api-reivew-pro1',
        installation_id: 3,
        is_active: true,
        webhook_id: '101',
      })
      .mockReturnValueOnce({
        id: 9163,
        platform: 'gitee',
        owner: 'api-review-test-group',
        name: 'api-reivew-pro1',
        full_name: 'api-review-test-group/api-reivew-pro1',
        installation_id: 3,
        is_active: true,
        webhook_id: null,
        webhook_secret: null,
        webhook_url: null,
      });

    const response = await request(app).delete('/9163/webhook');

    expect(response.status).toBe(200);
    expect(platformClientMock.deleteWebhook).toHaveBeenCalledWith(
      'api-review-test-group',
      'api-reivew-pro1',
      '101'
    );
  });
});
