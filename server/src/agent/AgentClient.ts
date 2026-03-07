/**
 * Agent 客户端模块
 *
 * 统一导出 Context Agent 和 Review Agent 客户端
 * 提供类型定义和健康检查接口
 */

export {
  ContextAgentClient,
  type ContextRequestParams,
  type ContextResponse,
  type HealthCheck as ContextHealthCheck,
} from './ContextAgentClient';

export {
  ReviewAgentClient,
  type ReviewRequestParams,
  type ReviewResult,
  type FileReview,
  type CodeIssue,
  type ReviewOptions,
  type FileChange,
  type HealthCheck as ReviewHealthCheck,
} from './ReviewAgentClient';

/**
 * 统一的 Agent 健康检查结果
 */
export interface AgentHealthCheck {
  contextAgent: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    message?: string;
    version?: string;
  };
  reviewAgent: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    message?: string;
    version?: string;
  };
}
