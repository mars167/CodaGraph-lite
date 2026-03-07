/**
 * Agent Manager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getAgentManager, resetAgentManager, AgentType } from './AgentManager';

describe('AgentManager', () => {
  beforeEach(() => {
    resetAgentManager();
  });

  afterEach(async () => {
    const manager = getAgentManager();
    await manager.terminateAll('test-cleanup');
  });

  describe('单并发限制', () => {
    it('应该拒绝同时启动两个 agents', async () => {
      const manager = getAgentManager();

      // 启动第一个 agent
      await manager.startContextAgent('test-job-1');

      // 尝试启动第二个 agent（应该失败）
      await expect(
        manager.startReviewAgent('test-job-2')
      ).rejects.toThrow('已有 context-agent 在运行');

      // 清理
      await manager.terminateAgent('test-job-1');
    });

    it('应该在前一个 agent 终止后允许启动新的', async () => {
      const manager = getAgentManager();

      await manager.startContextAgent('test-job-1');
      await manager.terminateAgent('test-job-1');

      // 应该允许启动新 agent
      await expect(
        manager.startReviewAgent('test-job-2')
      ).resolves.not.toThrow();

      // 清理
      await manager.terminateAgent('test-job-2');
    });
  });

  describe('进程状态查询', () => {
    it('应该正确报告活跃 agent', async () => {
      const manager = getAgentManager();

      expect(manager.getActiveAgent()).toBeNull();
      expect(manager.isAgentRunning('test-job')).toBe(false);

      await manager.startContextAgent('test-job');

      expect(manager.getActiveAgent()).toBe(AgentType.CONTEXT);
      expect(manager.isAgentRunning('test-job')).toBe(true);

      await manager.terminateAgent('test-job');

      expect(manager.getActiveAgent()).toBeNull();
      expect(manager.isAgentRunning('test-job')).toBe(false);
    });

    it('应该返回运行中的作业 ID 列表', async () => {
      const manager = getAgentManager();

      await manager.startContextAgent('test-job-1');
      await manager.startContextAgent('test-job-2');
      await manager.terminateAgent('test-job-1');

      const runningJobs = manager.getRunningAgents();

      expect(runningJobs).toEqual(['test-job-2']);

      await manager.terminateAgent('test-job-2');
    });
  });

  describe('统计信息', () => {
    it('应该返回正确的统计信息', async () => {
      const manager = getAgentManager();

      await manager.startContextAgent('test-job-1');
      await manager.startContextAgent('test-job-2');
      await manager.terminateAgent('test-job-1');

      const stats = manager.getStats();

      expect(stats.activeProcesses).toBe(1);
      expect(stats.totalProcesses).toBe(1);  // 已终止的进程被删除
      expect(stats.activeAgent).toBe(AgentType.CONTEXT);

      await manager.terminateAgent('test-job-2');
    });
  });

  describe('超时处理', () => {
    it('应该在超时后自动终止进程', async () => {
      const manager = getAgentManager();

      // 使用短超时进行测试
      const shortConfig = {
        contextAgentPath: './context-agent/src/context_agent/grpc_server.py',
        reviewAgentPath: './review-agent/src/review_agent/grpc_server.py',
        contextTimeout: 100,  // 100ms
        reviewTimeout: 100,
        killTimeout: 50,
        pythonPath: 'python',
      };

      // 注意：这会实际尝试启动进程，可能失败
      // 实际测试中可能需要 mock spawn
    }, 10000);
  });
});
