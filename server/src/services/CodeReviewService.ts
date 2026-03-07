/**
 * 代码审查服务
 * 完整的 PR 审查流程，集成 Context Agent 和 Review Agent
 *
 * 2u2g 优化：
 * - Agent 作为临时子进程启动，完成后立即终止
 * - 使用 AgentProcessService 管理进程生命周期
 * - 严格执行超时和内存限制
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { getGitService, GitService } from '../git/GitService';
import {
  getAgentProcessService,
  AgentProcessService,
  AgentProcessStatus,
} from '../agent/AgentProcessService';
import { getResourceAllocator, AgentType } from '../config/resource';
import {
  ContextAgentClient,
  type ContextRequestParams,
  type ContextResponse,
} from '../agent/ContextAgentClient';
import {
  ReviewAgentClient,
  type ReviewRequestParams,
  type ReviewResult,
  type FileChange,
} from '../agent/ReviewAgentClient';
import {
  GitHubClient,
  type PRInfo,
  type CommentContent,
} from '../platform/GitHubClient';

// PR 信息接口
export interface PRDetails {
  platform: 'github' | 'gitee' | 'gitlab';
  owner: string;
  repo: string;
  prNumber: string;
  branch: string;
  baseBranch: string;
  title: string;
  description: string;
}

// 文件变更信息
export interface FileChangeDetail {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  newContent?: string;
  previousContent?: string;
  diff?: string;
}

// 审查结果接口
export interface ReviewJobResult {
  jobId: string;
  success: boolean;
  error?: string;
  fileReviews: number;
  totalIssues: number;
  summary: string;
  reportPath?: string;
  duration: number;
}

// 作业进度
export interface JobProgress {
  jobId: string;
  stage: 'pending' | 'cloning' | 'indexing' | 'collecting' | 'reviewing' | 'posting' | 'cleaning' | 'completed' | 'failed';
  progress: number;
  message: string;
  timestamp: number;
}

/**
 * Git 命令白名单（安全限制）
 */
const GIT_WHITELIST = [
  'clone',
  'checkout',
  'fetch',
  'pull',
  'diff',
  'log',
  'show',
  'branch',
  'status',
  'ls-file',
  'read-tree',
  'rev-parse',
];

/**
 * 验证 git 命令是否安全
 */
function isSafeGitCommand(command: string): boolean {
  const commandLower = command.toLowerCase();
  return GIT_WHITELIST.includes(commandLower.split(' ')[0]);
}

/**
 * 代码审查服务类
 */
export class CodeReviewService {
  private gitService: GitService;
  private agentProcessService = getAgentProcessService();
  private resourceAllocator = getResourceAllocator();
  private platformClients: Map<string, any> = new Map();

  // 工作区根目录
  private workspaceRoot: string;
  private jobStore: Map<string, ReviewJobResult> = new Map();

  constructor(
    private db: any,
    private platformClientsMap: Map<'github' | 'gitee' | 'gitlab', GitHubClient>
  ) {
    this.workspaceRoot = process.env.WORKSPACE_ROOT || '/tmp/repos';
    this.gitService = getGitService();
    this.platformClients = platformClientsMap;

    logger.info('🔗 代码审查服务初始化');
    logger.info(`   工作区: ${this.workspaceRoot}`);
  }

  /**
   * 处理 Webhook 事件
   */
  async handleWebhookEvent(event: any, signature: string): Promise<void> {
    logger.info('📥 收到 webhook 事件');

    // TODO: 实现真正的签名验证
    // if (!this.verifySignature(event, signature)) {
    //   throw new Error('Invalid webhook signature');
    // }

    const prDetails = this.parsePRInfo(event);

    if (!prDetails) {
      logger.info('Webhook 事件不是 PR 事件，跳过');
      return;
    }

    logger.info(`PR: ${prDetails.owner}/${prDetails.repo}#${prDetails.prNumber}`);

    // 创建审查作业
    const jobId = await this.createReviewJob(prDetails);

    // 将作业添加到队列（TODO: 集成作业队列）
    logger.info(`✅ 作业 ${jobId} 已创建`);

    // 返回成功响应
    // 注意：实际审查在 worker 中进行
  }

  /**
   * 解析 PR 信息
   */
  private parsePRInfo(event: any): PRDetails | null {
    // GitHub webhook
    if (event.action === 'opened' || event.action === 'synchronize') {
      return {
        platform: 'github',
        owner: event.repository.owner.login,
        repo: event.repository.name,
        prNumber: String(event.pull_request.number),
        branch: event.pull_request.head.ref,
        baseBranch: event.pull_request.base.ref,
        title: event.pull_request.title,
        description: event.pull_request.body,
      };
    }

    return null;
  }

  /**
   * 创建审查作业
   */
  private async createReviewJob(prDetails: PRDetails): Promise<string> {
    const jobId = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(`创建作业: ${jobId}`);
    logger.info(`   PR: ${prDetails.owner}/${prDetails.repo}#${prDetails.prNumber}`);

    // TODO: 存储到数据库
    // await this.db.jobs.create({ jobId, ... });

    return jobId;
  }

  /**
   * 处理审查作业（由 Worker 调用）
   */
  async processReviewJob(jobId: string, prDetails: PRDetails): Promise<void> {
    const startTime = Date.now();
    let workspacePath = '';
    let contextAgent: ContextAgentClient | null = null;
    let reviewAgent: ReviewAgentClient | null = null;

    try {
      // 检查资源可用性
      if (!this.resourceAllocator.canStartAgent('context-agent' as AgentType)) {
        throw new Error('资源不足，无法启动 Context Agent');
      }

      // 步骤 1: 创建工作区
      workspacePath = await this.createWorkspace(prDetails, jobId);
      await this.updateJobProgress(jobId, 'cloning', 10, '创建工作区');

      // 步骤 2: 克隆仓库
      await this.cloneRepository(prDetails, workspacePath);
      await this.updateJobProgress(jobId, 'cloning', 30, '克隆仓库完成');

      // 步骤 3: git-ai 索引
      await this.indexRepository(workspacePath);
      await this.updateJobProgress(jobId, 'indexing', 20, 'git-ai 索引完成');

      // 步骤 4: 获取 PR 文件变更
      const fileChanges = await this.getFileChanges(prDetails, workspacePath);
      await this.updateJobProgress(jobId, 'collecting', 10, `获取到 ${fileChanges.length} 个文件变更`);

      // 步骤 5: 收集上下文
      contextAgent = new ContextAgentClient('localhost', 50052);
      await contextAgent.connect();

      const context = await contextAgent.collectContext({
        jobId,
        workspacePath,
        files: fileChanges.map(f => f.path),
        prInfo: {
          platform: prDetails.platform,
          owner: prDetails.owner,
          repo: prDetails.repo,
          prNumber: prDetails.prNumber,
        },
        options: {
          batchSize: 5,
          useCache: true,
          sortByPriority: true,
          parallelFiles: 3,
        },
      });

      await this.updateJobProgress(jobId, 'collecting', 40, '上下文收集完成');
      await contextAgent.close();

      // 步骤 6: 执行代码审查
      reviewAgent = new ReviewAgentClient('localhost', 50051);
      await reviewAgent.connect();

      const fileChangeList = await this.prepareFileChanges(fileChanges, workspacePath);
      const reviewResult = await reviewAgent.reviewCode({
        jobId,
        workspacePath,
        files: fileChangeList,
        context,
        options: {
          checkSecurity: true,
          checkPerformance: true,
          checkStyle: true,
          checkBugs: true,
          batchSize: 3,
        },
        progress: {
          onBatchComplete: (batch, total) => {
            const progress = 40 + (batch / total) * 30; // 40-70%
            this.updateJobProgress(jobId, 'reviewing', Math.round(progress), `审查批次 ${batch}/${total}`);
          },
          onFileComplete: (file, issues) => {
            logger.debug(`文件 ${file} 完成，发现 ${issues.length} 个问题`);
          },
        },
      });

      await this.updateJobProgress(jobId, 'reviewing', 70, '代码审查完成');
      await reviewAgent.close();

      // 步骤 7: 发布审查评论
      await this.postReviewComments(prDetails, reviewResult);
      await this.updateJobProgress(jobId, 'posting', 10, '发布评论');

      // 步骤 8: 生成审查报告
      const reportPath = await this.generateReport(jobId, prDetails, reviewResult);

      // 步骤 9: 清理工作区
      await this.cleanupWorkspace(workspacePath);
      await this.updateJobProgress(jobId, 'cleaning', 100, '清理完成');

      // 步骤 10: 标记作业完成
      const duration = Date.now() - startTime;
      await this.markJobCompleted(jobId, prDetails, reviewResult, reportPath, duration);

      logger.info(`✅ 作业 ${jobId} 处理完成 (${duration}ms)`);

    } catch (error) {
      logger.error(`❌ 作业 ${jobId} 处理失败: ${error}`);

      try {
        await this.cleanupWorkspace(workspacePath);
      } catch (cleanupError) {
        logger.error(`清理失败: ${cleanupError}`);
      }

      await this.markJobFailed(jobId, (error as Error).message);

      throw error;
    } finally {
      // 确保连接关闭
      if (contextAgent) {
        try {
          await contextAgent.close();
        } catch (e) {
          logger.error(`关闭 Context Agent 失败: ${e}`);
        }
      }
      if (reviewAgent) {
        try {
          await reviewAgent.close();
        } catch (e) {
          logger.error(`关闭 Review Agent 失败: ${e}`);
        }
      }
    }
  }

  /**
   * 创建工作区
   */
  private async createWorkspace(prDetails: PRDetails, jobId: string): Promise<string> {
    const workspacePath = path.join(
      this.workspaceRoot,
      prDetails.platform,
      prDetails.owner,
      prDetails.repo,
      prDetails.prNumber,
      jobId
    );

    await fs.mkdir(workspacePath, { recursive: true });

    logger.info(`📁 创建工作区: ${workspacePath}`);

    return workspacePath;
  }

  /**
   * 克隆仓库
   */
  private async cloneRepository(prDetails: PRDetails, workspacePath: string): Promise<void> {
    logger.info('🔄 克隆仓库...');

    const platformClient = this.platformClients.get(prDetails.platform);
    if (!platformClient) {
      throw new Error(`平台客户端未配置: ${prDetails.platform}`);
    }

    // TODO: 获取 access token
    // const installation = await platformClient.getRepositoryInstallation(prDetails);
    const accessToken = 'TODO_TOKEN';

    try {
      // 使用 GitService 克隆
      await this.gitService.cloneRepository(
        prDetails.platform,
        prDetails.owner,
        prDetails.repo,
        prDetails.branch,
        accessToken,
        workspacePath
      );

      logger.info('✅ 仓库克隆成功');
    } catch (error) {
      throw new Error(`克隆仓库失败: ${(error as Error).message}`);
    }
  }

  /**
   * 索引仓库（git-ai）
   */
  private async indexRepository(workspacePath: string): Promise<void> {
    logger.info('📊 索引仓库（git-ai）...');

    try {
      await this.gitService.indexRepository(workspacePath);
      logger.info('✅ 仓库索引完成');
    } catch (error) {
      throw new Error(`索引仓库失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取 PR 文件变更
   */
  private async getFileChanges(prDetails: PRDetails, workspacePath: string): Promise<FileChangeDetail[]> {
    logger.info('📋 获取 PR 文件变更...');

    try {
      // TODO: 从平台 API 获取文件列表
      // 这里使用占位符返回一些测试数据

      const testFiles: FileChangeDetail[] = [
        { path: 'src/index.ts', status: 'modified', diff: '+ new line' },
        { path: 'src/utils.ts', status: 'added', newContent: 'export function' },
        { path: 'src/app.tsx', status: 'modified', diff: '- old line' },
        { path: 'src/deleted.ts', status: 'deleted' }
      ];

      logger.info(`✅ 获取到 ${testFiles.length} 个文件变更`);

      return testFiles;
    } catch (error) {
      throw new Error(`获取文件变更失败: ${(error as Error).message}`);
    }
  }

  /**
   * 准备文件变更（读取内容）
   */
  private async prepareFileChanges(
    fileChanges: FileChangeDetail[],
    workspacePath: string
  ): Promise<FileChange[]> {
    const prepared: FileChange[] = [];

    for (const change of fileChanges) {
      const filePath = path.join(workspacePath, change.path);

      if (change.status === 'deleted') {
        prepared.push({
          path: change.path,
          status: 'deleted',
          content: undefined,
          previousContent: undefined,
        });
        continue;
      }

      // TODO: 实现实际的文件内容读取
      // 这里使用占位符
      if (change.status === 'added') {
        prepared.push({
          path: change.path,
          status: 'added',
          content: '// TODO: actual content',
          previousContent: undefined,
        });
      } else {
        prepared.push({
          path: change.path,
          status: change.status as 'modified' | 'deleted',
          content: '// TODO: actual content',
          previousContent: '// TODO: actual content',
        });
      }
    }

    return prepared;
  }

  /**
   * 发布审查评论
   */
  private async postReviewComments(
    prDetails: PRDetails,
    reviewResult: ReviewResult
  ): Promise<void> {
    logger.info('💬 发布审查评论...');

    const platformClient = this.platformClients.get(prDetails.platform);
    if (!platformClient) {
      throw new Error(`平台客户端未配置: ${prDetails.platform}`);
    }

    const prInfo: PRInfo = {
      platform: prDetails.platform,
      owner: prDetails.owner,
      repo: prDetails.repo,
      prNumber: prDetails.prNumber,
    };

    let posted = 0;

    for (const fileReview of reviewResult.fileReviews) {
      for (const issue of fileReview.issues) {
        const comment: CommentContent = {
          body: this.formatIssueComment(issue),
          filePath: issue.location?.filePath,
          lineNumber: issue.location?.lineNumber,
        };

        await platformClient.postComment(prInfo, comment);

        posted++;

        // TODO: 实现批量发布
        if (posted % 10 === 0) {
          logger.info(`已发布 ${posted} 个评论`);
        }
      }
    }

    // 发布摘要
    if (reviewResult.summary) {
      await platformClient.postComment(prInfo, {
        body: reviewResult.summary,
      });
    }

    logger.info(`✅ 发布了 ${posted} 个评论`);
  }

  /**
   * 格式化问题评论
   */
  private formatIssueComment(issue: any): string {
    const severityEmoji: Record<string, string> = {
      critical: '🚨',
      major: '⚠️',
      minor: 'ℹ️',
      info: '💡',
    };

    const categoryEmoji: Record<string, string> = {
      security: '🔒',
      performance: '⚡',
      style: '🎨',
      bug: '🐛',
    };

    let comment = `${severityEmoji[issue.severity] || '💡'} **${issue.severity.toUpperCase()}**: ${issue.title}\n\n`;
    comment += `${categoryEmoji[issue.category] || '📝'} **${issue.category}**: ${issue.description}\n\n`;

    if (issue.suggestion) {
      comment += `**建议**: ${issue.suggestion}\n\n`;
    }

    return comment;
  }

  /**
   * 生成审查报告
   */
  private async generateReport(
    jobId: string,
    prDetails: PRDetails,
    reviewResult: ReviewResult
  ): Promise<string> {
    logger.info('📄 生成审查报告...');

    const reportDir = path.join(this.workspaceRoot, 'reports');
    await fs.mkdir(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `${jobId}.md`);

    const reportContent = this.generateMarkdownReport(
      prDetails,
      reviewResult,
      Date.now()
    );

    await fs.writeFile(reportPath, reportContent, 'utf-8');

    logger.info(`✅ 报告已生成: ${reportPath}`);

    return reportPath;
  }

  /**
   * 生成 Markdown 报告
   */
  private generateMarkdownReport(
    prDetails: PRDetails,
    reviewResult: ReviewResult,
    timestamp: number
  ): string {
    const totalIssues = reviewResult.fileReviews.reduce((sum, fr) => sum + fr.issues.length, 0);

    const lines = [
      `# 代码审查报告`,
      ``,
      `**PR**: ${prDetails.owner}/${prDetails.repo}#${prDetails.prNumber}`,
      `**标题**: ${prDetails.title}`,
      `**分支**: ${prDetails.branch} → ${prDetails.baseBranch}`,
      ``,
      `## 执行摘要`,
      `- 文件数: ${reviewResult.fileReviews.length}`,
      `- 发现问题: ${totalIssues}`,
      ``,
      `## 文件审查详情`,
    ];

    for (const fileReview of reviewResult.fileReviews) {
      if (fileReview.issues.length === 0) {
        lines.push(`\n### ${fileReview.filePath}\n✅ 无问题\n`);
        continue;
      }

      lines.push(`\n### ${fileReview.filePath}\n`);

      for (const issue of fileReview.issues) {
        const emoji = {
          critical: '🚨',
          major: '⚠️',
          minor: 'ℹ️',
          info: '💡',
        }[issue.severity] || '💡';

        lines.push(`${emoji} **${issue.severity}**: ${issue.title}\n`);
        lines.push(`- **类别**: ${issue.category}\n`);
        lines.push(`- **描述**: ${issue.description}\n\n`);

        if (issue.suggestion) {
          lines.push(`**建议**:\n\`\`\`${issue.suggestion}\n`);
        }
      }
    }

    lines.push(`\n---\n`);
    lines.push(`## 问题统计`);
    lines.push(reviewResult.summary || '无问题');

    return lines.join('\n');
  }

  /**
   * 清理工作区
   */
  private async cleanupWorkspace(workspacePath: string): Promise<void> {
    logger.info(`🧹 清理工作区: ${workspacePath}`);

    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
      logger.info('✅ 工作区已清理');
    } catch (error) {
      logger.error(`清理失败: ${error}`);
    }
  }

  /**
   * 更新作业进度
   */
  private async updateJobProgress(
    jobId: string,
    stage: JobProgress['stage'],
    progress: number,
    message: string
  ): Promise<void> {
    // TODO: 存储到数据库
    logger.info(`[${jobId}] ${progress}% - ${stage}: ${message}`);
  }

  /**
   * 标记作业完成
   */
  private async markJobCompleted(
    jobId: string,
    prDetails: PRDetails,
    reviewResult: ReviewResult,
    reportPath: string,
    duration: number
  ): Promise<void> {
    const totalIssues = reviewResult.fileReviews.reduce((sum, fr) => sum + fr.issues.length, 0);

    // TODO: 存储到数据库
    logger.info(`✅ 作业 ${jobId} 完成`);
    logger.info(`   文件数: ${reviewResult.fileReviews.length}`);
    logger.info(`   问题数: ${totalIssues}`);
    logger.info(`   耗时: ${duration}ms`);
    logger.info(`   报告: ${reportPath}`);
  }

  /**
   * 标记作业失败
   */
  private async markJobFailed(jobId: string, errorMessage: string): Promise<void> {
    // TODO: 存储到数据库
    logger.error(`❌ 作业 ${jobId} 失败: ${errorMessage}`);
  }

  /**
   * 获取作业状态
   */
  async getJobStatus(jobId: string): Promise<ReviewJobResult | null> {
    return this.jobStore.get(jobId) || null;
  }

  /**
   * 获取所有作业
   */
  async getAllJobs(): Promise<ReviewJobResult[]> {
    return Array.from(this.jobStore.values());
  }
}

/**
 * 工厂函数
 */
export function createCodeReviewService(
  db: any,
  platformClientsMap: Map<'github' | 'gitee' | 'gitlab', GitHubClient>
): CodeReviewService {
  return new CodeReviewService(db, platformClientsMap);
}
