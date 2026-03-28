import express from 'express';
import request from 'supertest';

const adminModelMock = {
  findByUsername: jest.fn(),
  verifyPassword: jest.fn(),
  updateLastLogin: jest.fn(),
};

const activityLogModelMock = {
  logFailedLogin: jest.fn(),
  logLogin: jest.fn(),
  logLogout: jest.fn(),
  logPasswordChange: jest.fn(),
};

const sessionManagerMock = {
  create: jest.fn(),
  get: jest.fn(),
  destroy: jest.fn(),
};

jest.mock('../models/Admin', () => ({
  getAdminModel: () => adminModelMock,
}));

jest.mock('../models/ActivityLog', () => ({
  getActivityLogModel: () => activityLogModelMock,
}));

jest.mock('./SessionManager', () => ({
  getSessionManager: () => sessionManagerMock,
}));

import authRoutes from './routes';

describe('authRoutes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', authRoutes);
  });

  it('returns 401 for wrong passwords and logs failed login against the existing admin', async () => {
    adminModelMock.findByUsername.mockReturnValue({
      id: 7,
      username: 'admin',
      password_hash: 'hashed',
      created_at: '2026-03-28T00:00:00.000Z',
      updated_at: '2026-03-28T00:00:00.000Z',
    });
    adminModelMock.verifyPassword.mockReturnValue(false);

    const response = await request(app)
      .post('/login')
      .send({
        username: 'admin',
        password: 'wrong-password',
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: '用户名或密码错误',
    });
    expect(activityLogModelMock.logFailedLogin).toHaveBeenCalledWith(
      7,
      'admin',
      expect.any(String),
      undefined
    );
  });

  it('returns 401 for unknown users without trying to write an invalid activity log row', async () => {
    adminModelMock.findByUsername.mockReturnValue(null);
    adminModelMock.verifyPassword.mockReturnValue(false);

    const response = await request(app)
      .post('/login')
      .send({
        username: 'ghost',
        password: 'wrong-password',
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: '用户名或密码错误',
    });
    expect(activityLogModelMock.logFailedLogin).not.toHaveBeenCalled();
  });
});
