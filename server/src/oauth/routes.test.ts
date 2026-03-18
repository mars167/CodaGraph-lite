import express from 'express';
import request from 'supertest';

const oauthInstallationModelMock = {
  findActive: jest.fn(),
  findByPlatformAndAccount: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
  deactivateByPlatformAndAuthType: jest.fn(),
  setActive: jest.fn(),
};

const oauthAuthorizeModelMock = {
  create: jest.fn(),
  findByState: jest.fn(),
  delete: jest.fn(),
};

const settingsServiceMock = {
  getPlatformAuthMode: jest.fn(),
};

const buildAuthorizationUrlMock = jest.fn();
const getConfigMock = jest.fn();

jest.mock('../models/OAuthInstallation', () => ({
  getOAuthInstallationModel: () => oauthInstallationModelMock,
}));

jest.mock('../models/OAuthAuthorize', () => ({
  getOAuthAuthorizeModel: () => oauthAuthorizeModelMock,
}));

jest.mock('../services/SystemSettingsService', () => ({
  getSystemSettingsService: () => settingsServiceMock,
}));

jest.mock('./handlers', () => ({
  generateState: () => 'mock-state',
  buildAuthorizationUrl: (...args: unknown[]) => buildAuthorizationUrlMock(...args),
  getConfig: (...args: unknown[]) => getConfigMock(...args),
  exchangeCodeForToken: jest.fn(),
}));

jest.mock('./session', () => ({
  createOAuthSession: jest.fn(() => 'session-id'),
}));

jest.mock('../services/GitHubAppService', () => ({
  getGitHubAppService: jest.fn(),
}));

jest.mock('../services/OAuthInstallationService', () => ({
  getOAuthInstallationService: () => ({
    ensureValidAccessToken: jest.fn(),
  }),
}));

import oauthRoutes from './routes';

describe('oauthRoutes', () => {
  let app: express.Application;
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', oauthRoutes);

    global.fetch = fetchMock as typeof fetch;
    settingsServiceMock.getPlatformAuthMode.mockReturnValue('oauth_app');
    buildAuthorizationUrlMock.mockReturnValue('https://example.com/oauth/authorize');
    getConfigMock.mockReturnValue({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:3000/app/gitee/callback',
      authorizationUrl: 'https://example.com/oauth/authorize',
      tokenUrl: 'https://example.com/oauth/token',
      userInfoUrl: 'https://example.com/api/user',
      scope: ['user_info'],
    });
    oauthInstallationModelMock.findActive.mockReturnValue([]);
    oauthInstallationModelMock.findByPlatformAndAccount.mockReturnValue(null);
    oauthInstallationModelMock.create.mockReturnValue({
      id: 18,
      platform: 'gitee',
      auth_type: 'pat',
      account_id: '1001',
      account_name: 'mars',
      access_token: 'pat-token',
      refresh_token: null,
      token_expires_at: null,
      permissions: null,
      is_active: true,
      created_at: '2026-03-12T00:00:00.000Z',
      updated_at: '2026-03-12T00:00:00.000Z',
    });
    oauthInstallationModelMock.findById.mockReturnValue({
      id: 18,
      platform: 'gitee',
      auth_type: 'pat',
      account_id: '1001',
      account_name: 'mars',
      access_token: 'pat-token',
      refresh_token: null,
      token_expires_at: null,
      permissions: null,
      is_active: true,
      created_at: '2026-03-12T00:00:00.000Z',
      updated_at: '2026-03-12T00:00:00.000Z',
    });
    oauthInstallationModelMock.deactivateByPlatformAndAuthType.mockReturnValue(1);
    oauthInstallationModelMock.setActive.mockReturnValue(true);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('rejects OAuth authorization when the platform is in PAT mode', async () => {
    settingsServiceMock.getPlatformAuthMode.mockReturnValue('pat');

    const response = await request(app).get('/authorize/gitee');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('PAT 模式');
    expect(buildAuthorizationUrlMock).not.toHaveBeenCalled();
    expect(oauthAuthorizeModelMock.create).not.toHaveBeenCalled();
  });

  it('returns sanitized installation payloads without token fields', async () => {
    oauthInstallationModelMock.findActive.mockReturnValue([
      {
        id: 7,
        platform: 'github',
        auth_type: 'github_app',
        github_app_installation_id: '109713665',
        account_id: '42',
        account_name: 'mars',
        access_token: 'secret-token',
        refresh_token: 'refresh-token',
        token_expires_at: '2026-03-12T01:00:00.000Z',
        permissions: '{"pull_requests":"write"}',
        is_active: true,
        created_at: '2026-03-12T00:00:00.000Z',
        updated_at: '2026-03-12T00:00:00.000Z',
      },
    ]);

    const response = await request(app).get('/installations');

    expect(response.status).toBe(200);
    expect(response.body.installations).toHaveLength(1);
    expect(response.body.installations[0]).toEqual(expect.objectContaining({
      id: 7,
      platform: 'github',
      auth_type: 'github_app',
      github_app_installation_id: '109713665',
      account_id: '42',
      account_name: 'mars',
      has_refresh_token: true,
    }));
    expect(response.body.installations[0]).not.toHaveProperty('access_token');
    expect(response.body.installations[0]).not.toHaveProperty('refresh_token');
  });

  it('creates a PAT installation and deactivates oauth/app connections for the same platform', async () => {
    settingsServiceMock.getPlatformAuthMode.mockReturnValue('pat');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1001,
        login: 'mars',
        name: 'mars',
      }),
    });

    const response = await request(app)
      .post('/installations/pat')
      .send({
        platform: 'gitee',
        accessToken: 'pat-token',
      });

    expect(response.status).toBe(201);
    expect(getConfigMock).toHaveBeenCalledWith('gitee');
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/user', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer pat-token',
      }),
    }));
    expect(oauthInstallationModelMock.create).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'gitee',
      auth_type: 'pat',
      account_id: '1001',
      account_name: 'mars',
      access_token: 'pat-token',
      refresh_token: null,
    }));
    expect(oauthInstallationModelMock.deactivateByPlatformAndAuthType).toHaveBeenCalledWith(
      'gitee',
      ['oauth', 'github_app'],
      18
    );
    expect(response.body.installation).toEqual(expect.objectContaining({
      id: 18,
      platform: 'gitee',
      auth_type: 'pat',
      account_id: '1001',
      account_name: 'mars',
      has_refresh_token: false,
    }));
    expect(response.body.installation).not.toHaveProperty('access_token');
  });

  it('rejects refresh requests for PAT installations', async () => {
    oauthInstallationModelMock.findById.mockReturnValue({
      id: 18,
      platform: 'gitlab',
      auth_type: 'pat',
      account_id: '1002',
      account_name: 'mars',
      access_token: 'pat-token',
      refresh_token: null,
      token_expires_at: null,
      permissions: null,
      is_active: true,
      created_at: '2026-03-12T00:00:00.000Z',
      updated_at: '2026-03-12T00:00:00.000Z',
    });

    const response = await request(app).post('/installations/18/refresh');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('PAT 连接不支持刷新');
  });
});
