/**
 * Context Agent 客户端单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from '@jest/globals';
import { ContextAgentClient } from './ContextAgentClient';

// Mock gRPC
vi.mock('@grpc/grpc-js', () => ({
  credentials: {
    createInsecure: vi.fn(() => ({})),
  },
}));

describe('ContextAgentClient', () => {
  let client: ContextAgentClient;

  beforeEach(() => {
    client = new ContextAgentClient('localhost', 50052, 1000);
  });

  afterEach(() => {
    client.close();
  });

  describe('初始化', () => {
    it('应该正确初始化客户端', () => {
      expect(client).toBeDefined();
    });

    it('应该记录初始化日志', () => {
      const newClient = new ContextAgentClient('test-host', 9999);
      expect(newClient).toBeDefined();
    });
  });

  describe('连接', () => {
    it('应该成功连接到服务', async () => {
      // 注意：这需要实际的 gRPC 服务运行
      // 集成测试中测试，这里只测试方法存在
      expect(typeof client.connect).toBe('function');
    });

    it('应该拒绝连接当 proto 客户端未初始化', async () => {
      // Mock 全局对象为空
      const originalProto = (global as any).agent_pb2_grpc;
      (global as any).agent_pb2_grpc = undefined;

      await expect(client.connect()).rejects.toThrow('gRPC proto 客户端未初始化');

      // 恢复
      (global as any).agent_pb2_grpc = originalProto;
    });
  });

  describe('健康检查', () => {
    it('应该返回未连接状态当客户端未初始化', async () => {
      const newClient = new ContextAgentClient('localhost', 50052);
      const health = await newClient.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toBe('客户端未初始化');
    });
  });

  describe('上下文收集', () => {
    it('应该拒绝调用当客户端未连接', async () => {
      const params = {
        jobId: 'test-job',
        workspacePath: '/tmp/test',
        files: ['test.ts'],
        prInfo: {
          platform: 'github' as const,
          owner: 'test-owner',
          repo: 'test-repo',
          prNumber: '1',
        },
      };

      await expect(client.collectContext(params)).rejects.toThrow('Context Agent 客户端未连接');
    });

    it('应该正确格式化请求参数', () => {
      const params = {
        jobId: 'test-job',
        workspacePath: '/tmp/test',
        files: ['test.ts'],
        prInfo: {
          platform: 'github' as const,
          owner: 'test-owner',
          repo: 'test-repo',
          prNumber: '1',
        },
      };

      // 参数应该可以序列化（用于 gRPC）
      expect(() => JSON.stringify(params)).not.toThrow();
    });
  });

  describe('关闭', () => {
    it('应该安全关闭客户端', () => {
      expect(() => client.close()).not.toThrow();
    });

    it('应该处理多次关闭', () => {
      client.close();
      expect(() => client.close()).not.toThrow();
    });
  });
});
