/**
 * Jest 测试环境设置
 */

// 增加默认超时时间
jest.setTimeout(10000);

// 全局 beforeAll 钩子 - 设置测试环境
beforeAll(() => {
  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.SESSION_SECRET = 'test-session-secret-key';
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'testpassword123';
});

// 全局 afterAll 钩子 - 清理测试环境
afterAll(() => {
  // 清理环境变量
  delete process.env.NODE_ENV;
  delete process.env.DATABASE_PATH;
});

// Mock console.log 在测试中减少噪音（可选）
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
// };

// 导出供测试使用
export {};