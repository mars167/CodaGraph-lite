import { jest } from '@jest/globals';
import { db as mockDb } from './mocks/database';

// 全局测试设置
beforeAll(async () => {
    // 设置测试数据库
    mockDb.init(':memory:');
});

// 每个测试后清理
afterEach(() => {
    // 清理测试数据
    mockDb.clear();
});

// 测试完成后
afterAll(async () => {
    // 关闭测试数据库
    await mockDb.close();
});
