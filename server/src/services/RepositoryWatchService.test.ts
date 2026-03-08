const repositoryModelMock = {
  findWatchedActive: jest.fn(),
  updateWatchCheck: jest.fn(),
};

const oauthInstallationModelMock = {
  findById: jest.fn(),
};

const oauthInstallationServiceMock = {
  ensureValidAccessToken: jest.fn(),
};

const reviewTriggerServiceMock = {
  triggerForRepository: jest.fn(),
};

const listPullRequestsMock = jest.fn();
const createPlatformClientMock = jest.fn(() => ({
  listPullRequests: listPullRequestsMock,
}));

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
};

jest.mock('../models/Repository', () => ({
  getRepositoryModel: () => repositoryModelMock,
}));

jest.mock('../models/OAuthInstallation', () => ({
  getOAuthInstallationModel: () => oauthInstallationModelMock,
}));

jest.mock('./OAuthInstallationService', () => ({
  getOAuthInstallationService: () => oauthInstallationServiceMock,
}));

jest.mock('./ReviewTriggerService', () => ({
  getReviewTriggerService: () => reviewTriggerServiceMock,
}));

jest.mock('../platform/client', () => ({
  createPlatformClient: createPlatformClientMock,
}));

jest.mock('../utils/logger', () => ({
  logger: loggerMock,
}));

import { RepositoryWatchService } from './RepositoryWatchService';

describe('RepositoryWatchService', () => {
  const repository = {
    id: 59,
    platform: 'github' as const,
    owner: 'mars167',
    name: 'CodaGraph-lite',
    full_name: 'mars167/CodaGraph-lite',
    installation_id: 1,
  };

  const installation = {
    id: 1,
    is_active: true,
    access_token: 'token',
    auth_type: 'github_app' as const,
    github_app_installation_id: '123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    oauthInstallationModelMock.findById.mockReturnValue(installation);
    oauthInstallationServiceMock.ensureValidAccessToken.mockResolvedValue(installation);
    listPullRequestsMock.mockResolvedValue([
      { number: 1 },
      { number: 2 },
    ]);
  });

  it('continues processing later pull requests after one watch trigger fails', async () => {
    reviewTriggerServiceMock.triggerForRepository
      .mockRejectedValueOnce(new Error('queue rejected'))
      .mockResolvedValueOnce({ created: true });

    const service = new RepositoryWatchService();

    await (service as any).processRepository(repository);

    expect(reviewTriggerServiceMock.triggerForRepository).toHaveBeenCalledTimes(2);
    expect(reviewTriggerServiceMock.triggerForRepository).toHaveBeenNthCalledWith(
      1,
      repository,
      1,
      expect.objectContaining({
        source: 'watch',
        force: false,
        priority: 3,
      })
    );
    expect(reviewTriggerServiceMock.triggerForRepository).toHaveBeenNthCalledWith(
      2,
      repository,
      2,
      expect.objectContaining({
        source: 'watch',
        force: false,
        priority: 3,
      })
    );
    expect(repositoryModelMock.updateWatchCheck).toHaveBeenCalledWith(59, expect.any(Date));
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('Watch 触发 mars167/CodaGraph-lite#1 失败: queue rejected')
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('open PR=2，新入队=1，失败=1')
    );
  });

  it('forces token refresh and retries when listing pull requests returns 401', async () => {
    oauthInstallationServiceMock.ensureValidAccessToken
      .mockResolvedValueOnce({
        ...installation,
        access_token: 'stale-token',
      })
      .mockResolvedValueOnce({
        ...installation,
        access_token: 'fresh-token',
      });

    listPullRequestsMock
      .mockRejectedValueOnce(new Error('GET https://api.github.com/repos/mars167/CodaGraph-lite/pulls?page=1&per_page=50&state=open 失败: 401 Unauthorized'))
      .mockResolvedValueOnce([{ number: 1 }]);
    reviewTriggerServiceMock.triggerForRepository.mockResolvedValue({ created: true });

    const service = new RepositoryWatchService();

    await (service as any).processRepository(repository);

    expect(oauthInstallationServiceMock.ensureValidAccessToken).toHaveBeenNthCalledWith(1, installation);
    expect(oauthInstallationServiceMock.ensureValidAccessToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        access_token: 'stale-token',
      }),
      true
    );
    expect(listPullRequestsMock).toHaveBeenCalledTimes(2);
    expect(createPlatformClientMock).toHaveBeenNthCalledWith(
      1,
      'github',
      'stale-token',
      expect.objectContaining({
        authType: 'github_app',
        githubAppInstallationId: '123',
      })
    );
    expect(createPlatformClientMock).toHaveBeenNthCalledWith(
      2,
      'github',
      'fresh-token',
      expect.objectContaining({
        authType: 'github_app',
        githubAppInstallationId: '123',
      })
    );
    expect(reviewTriggerServiceMock.triggerForRepository).toHaveBeenCalledWith(
      repository,
      1,
      expect.objectContaining({
        source: 'watch',
      })
    );
  });
});
