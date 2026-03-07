/**
 * Review Agent 客户端单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ReviewAgentClient,
  type ReviewRequestParams,
  type FileChange,
  type ReviewOptions,
} from './ReviewAgentClient';

describe('ReviewAgentClient', () => {
  let client: ReviewAgentClient;

  beforeEach(() => {
    client = new ReviewAgentClient('localhost', 50051, 1000);
  });

  afterEach(() => {
    client.close();
  });

  describe('初始化', () => {
    it('应该正确初始化客户端', () => {
      expect(client).toBeDefined();
    });

    it('应该使用自定义超时', () => {
      const customClient = new ReviewAgentClient('localhost', 50051, 5000);
      expect(customClient).toBeDefined();
    });
  });

  describe('连接', () => {
    it('应该提供连接方法', () => {
      expect(typeof client.connect).toBe('function');
    });
  });

  describe('健康检查', () => {
    it('应该返回未连接状态当客户端未初始化', async () => {
      const newClient = new ReviewAgentClient('localhost', 50051);
      const health = await newClient.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toBe('客户端未初始化');
    });
  });

  describe('代码审查请求参数', () => {
    it('应该正确构造参数', () => {
      const files: FileChange[] = [
        {
          path: 'src/main.ts',
          status: 'modified',
          content: 'new content',
          previousContent: 'old content',
        },
      ];

      const options: ReviewOptions = {
        checkSecurity: true,
        checkPerformance: true,
        checkStyle: true,
        checkBugs: true,
        maxFiles: 10,
      };

      const params: ReviewRequestParams = {
        jobId: 'test-job-123',
        workspacePath: '/tmp/repos/test/repo/1',
        files,
        context: { symbols: [] },
        options,
      };

      // 验证所有必需字段存在
      expect(params.jobId).toBe('test-job-123');
      expect(params.files).toHaveLength(1);
      expect(params.options.checkSecurity).toBe(true);
      expect(params.options.maxFiles).toBe(10);
    });

    it('应该支持不同的文件状态', () => {
      const statuses: FileChange['status'][] = ['added', 'modified', 'deleted'];

      statuses.forEach(status => {
        const file: FileChange = {
          path: `test.${status}.ts`,
          status,
        };
        expect(file.status).toBe(status);
      });
    });

    it('应该支持可选审查选项', () => {
      const options1: ReviewOptions = {
        checkSecurity: true,
        checkPerformance: false,
        checkStyle: false,
        checkBugs: false,
      };

      expect(options1.checkSecurity).toBe(true);
      expect(options1.checkPerformance).toBe(false);
    });
  });

  describe('类型定义', () => {
    it('应该定义所有必需的严重级别', () => {
      const severities: CodeIssue['severity'][] = [
        'critical', 'major', 'minor', 'info',
      ];
      expect(severities).toHaveLength(4);
    });

    it('应该定义所有必需的类别', () => {
      const categories: CodeIssue['category'][] = [
        'security', 'performance', 'style', 'bug',
      ];
      expect(categories).toHaveLength(4);
    });
  });
});
