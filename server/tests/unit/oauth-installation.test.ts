import fs from 'fs';
import os from 'os';
import path from 'path';

describe('OAuthInstallationModel', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-installation-test-'));
  const dbPath = path.join(tempDir, 'test.db');

  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_PATH = dbPath;
  });

  afterEach(() => {
    const { getConnection, resetConnection } = require('../../src/database/connection');
    const connection = getConnection();
    if (connection.isReady()) {
      connection.close();
    }
    resetConnection();

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serializes Date values when creating a new OAuth installation', async () => {
    const { getConnection } = require('../../src/database/connection');
    const { OAUTH_INSTALLATIONS_TABLE } = require('../../src/database/oauthSchema');
    const { getOAuthInstallationModel } = require('../../src/models/OAuthInstallation');

    const connection = getConnection({ databasePath: dbPath });
    await connection.initialize();
    const db = connection.getDb();
    db.exec(OAUTH_INSTALLATIONS_TABLE);

    const model = getOAuthInstallationModel();
    const expiresAt = new Date('2026-03-07T12:34:56.000Z');

    const created = model.create({
      platform: 'github',
      auth_type: 'github_app',
      github_app_installation_id: '987654',
      account_id: '12345',
      account_name: 'octocat',
      access_token: 'token',
      refresh_token: 'refresh',
      token_expires_at: expiresAt,
      permissions: JSON.stringify({ repo: 'write' }),
    });

    expect(created).toBeTruthy();
    expect(created.account_id).toBe('12345');

    const stored = connection.get(
      'SELECT token_expires_at FROM oauth_installations WHERE id = ?',
      [created.id]
    ) as { token_expires_at: string } | null;

    expect(stored?.token_expires_at).toBe(expiresAt.toISOString());
  });
});
