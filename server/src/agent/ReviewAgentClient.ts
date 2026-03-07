/**
 * Review Agent 客户端
 *
 * 用于与 Python Review Agent gRPC 服务通信
 * 支持分块处理、流式响应、缓存和暂停/恢复
 */

import * as grpc from '@grpc/grpc-js';
import { logger } from '../utils/logger';

/**
 * 文件变更信息
 */
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  content?: string;
  previousContent?: string;
  size?: number;  // 文件大小（字节）
}

/**
 * 代码类型
 */
export enum CodeType {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  JAVA = 'java',
  GO = 'go',
  RUST = 'rust',
  CPP = 'cpp',
  OTHER = 'other',
}

/**
 * 文件深度配置（基于代码类型）
 */
export const CODE_TYPE_DEPTH: Record<CodeType, number> = {
  [CodeType.TYPESCRIPT]: 100,
  [CodeType.JAVASCRIPT]: 100,
  [CodeType.PYTHON]: 150,
  [CodeType.JAVA]: 200,
  [CodeType.GO]: 120,
  [CodeType.RUST]: 150,
  [CodeType.CPP]: 200,
  [CodeType.OTHER]: 80,
};

/**
 * 审查请求参数
 */
export interface ReviewRequestParams {
  jobId: string;
  workspacePath: string;
  files: FileChange[];
  context: any;  // 来自 Context Agent 的上下文
  prInfo?: any;  // PR 信息
  options: ReviewOptions;
  reportOptions?: ReportOptions;
  progress?: ReviewProgress;
}

/**
 * 审查选项
 */
export interface ReviewOptions {
  checkSecurity: boolean;
  checkPerformance: boolean;
  checkStyle: boolean;
  checkBugs: boolean;
  maxFiles?: number;  // 每批最大文件数
  batchSize?: number;  // 批次大小
  enableCache?: boolean;  // 是否使用结果缓存
  streamMode?: boolean;  // 是否使用流式响应
  resumeFrom?: string;  // 恢复点（用于暂停/恢复）
}

/**
 * 报告选项
 */
export interface ReportOptions {
  includeSummary: boolean;
  includeDetails: boolean;
  format: 'markdown' | 'json' | 'html';
  severityFilter?: CodeIssue['severity'][];
}

/**
 * 审查进度回调
 */
export interface ReviewProgress {
  onBatchStart?: (batch: number, total: number) => void;
  onBatchComplete?: (batch: number, total: number) => void;
  onFileComplete?: (file: string, issues: CodeIssue[]) => void;
  onProgress?: (completed: number, total: number) => void;
  onPause?: () => void;
  onResume?: () => void;
}

/**
 * 代码问题
 */
export interface CodeIssue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: 'security' | 'performance' | 'style' | 'bug';
  title: string;
  description: string;
  location?: {
    filePath: string;
    lineNumber: number;
    startColumn?: number;
    endColumn?: number;
  };
  suggestion?: string;
}

/**
 * 文件审查结果
 */
export interface FileReview {
  filePath: string;
  issues: CodeIssue[];
  status: 'completed' | 'partial' | 'pending';
}

/**
 * 审查结果
 */
export interface ReviewResult {
  success: boolean;
  fileReviews: FileReview[];
  summary: string;
  error?: string;
  partial?: boolean;  // 是否为部分结果
  resumePoint?: string;  // 恢复点
  report?: string;  // 生成的报告
}

/**
 * 健康检查结果
 */
export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'unknown';
  message?: string;
  version?: string;
}

/**
 * 缓存条目
 */
export interface ReviewCacheEntry {
  key: string;
  result: FileReview[];
  timestamp: number;
  hits: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  batchSize: 3,         // 每批 3 个文件
  maxBatches: 5,        // 最多 5 个批次
  cacheTtl: 600000,      // 缓存 10 分钟
  maxCacheSize: 50,
  streamChunkSize: 10,    // 流式每块 10 个文件
} as const;

/**
 * 推断代码类型
 */
function inferCodeType(filePath: string): CodeType {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'ts':
    case 'tsx':
      return CodeType.TYPESCRIPT;
    case 'js':
    case 'jsx':
    case 'mjs':
      return CodeType.JAVASCRIPT;
    case 'py':
      return CodeType.PYTHON;
    case 'java':
      return CodeType.JAVA;
    case 'go':
      return CodeType.GO;
    case 'rs':
      return CodeType.RUST;
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'h':
    case 'hpp':
      return CodeType.CPP;
    default:
      return CodeType.OTHER;
  }
}

/**
 * 生成缓存键
 */
function generateCacheKey(
  jobId: string,
  fileHash: string,
  options: ReviewOptions
): string {
  const optionsKey = JSON.stringify({
    security: options.checkSecurity,
    performance: options.checkPerformance,
    style: options.checkStyle,
    bugs: options.checkBugs,
  });
  return `${jobId}:${fileHash}:${optionsKey}`;
}

/**
 * 生成恢复点
 */
function generateResumePoint(
  jobId: string,
  completedBatches: number
): string {
  return `${jobId}:batch:${completedBatches}`;
}

/**
 * Review Agent 客户端
 */
export class ReviewAgentClient {
  private client: any = null;
  private connected: boolean = false;
  private cache: Map<string, ReviewCacheEntry> = new Map();
  private paused: boolean = false;
  private pausePromise: {
    resolve?: () => void;
    reject?: () => void;
  } | null = null;
  private completedBatches: number = 0;
  private totalBatches: number = 0;

  constructor(
    private host: string,
    private port: number,
    private requestTimeout: number = 60000
  ) {
    logger.info(`🔗 Review Agent 客户端初始化: ${host}:${port}`);
  }

  /**
   * 连接到服务
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const protoClient = (global as any).agent_pb2_grpc;

        if (!protoClient || !protoClient.ReviewAgentServiceClient) {
          reject(new Error('gRPC proto 客户端未初始化，请先运行 proto 代码生成'));
          return;
        }

        this.client = new protoClient.ReviewAgentServiceClient(
          `${this.host}:${this.port}`,
          grpc.credentials.createInsecure(),
          {
            'grpc.max_receive_message_length': 50 * 1024 * 1024,  // 50MB
            'grpc.max_send_message_length': 10 * 1024 * 1024,   // 10MB
            'grpc.max_reconnect_backoff_ms': 1000,
            'grpc.initial_reconnect_backoff_ms': 5000,
          }
        );

        // 测试连接
        this.healthCheck().then(() => {
          this.connected = true;
          logger.info(`✅ Review Agent gRPC 客户端已连接到 ${this.host}:${this.port}`);
          resolve();
        }).catch((err) => {
          reject(new Error(`Review Agent 连接失败: ${err.message}`));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 审查代码（增强版 - 支持分块、流式、缓存、暂停/恢复）
   */
  async reviewCode(
    params: ReviewRequestParams
  ): Promise<ReviewResult> {
    if (!this.client || !this.connected) {
      throw new Error('Review Agent 客户端未连接');
    }

    const options = {
      batchSize: DEFAULT_CONFIG.batchSize,
      maxFiles: 10,
      enableCache: true,
      streamMode: false,
      ...params.options,
    };

    // 恢复模式
    const isResume = options.resumeFrom && options.resumeFrom.startsWith(params.jobId);
    const startBatch = isResume
      ? parseInt((options.resumeFrom || '').split(':').pop() || '0', 10)
      : 0;

    logger.info(`🔍 开始代码审查: ${params.jobId}`);
    if (isResume) {
      logger.info(`   从批次 ${startBatch} 恢复`);
    }
    logger.info(`   文件数量: ${params.files.length}`);
    logger.info(`   批次大小: ${options.batchSize}`);
    logger.info(`   使用缓存: ${options.enableCache}`);
    logger.info(`   流式模式: ${options.streamMode}`);

    try {
      // 步骤 1: 排序和分组文件
      const sortedFiles = this.sortFilesByType(params.files);
      const batches = this.createBatches(sortedFiles, options.batchSize || 3);
      this.totalBatches = batches.length;

      logger.info(`   分 ${batches.length} 个批次`);

      // 步骤 2: 分批处理
      const allResults: FileReview[] = [];

      for (let i = 0; i < batches.length; i++) {
        // 检查暂停
        if (this.paused) {
          logger.info(`⏸ 审查已暂停于批次 ${i}/${batches.length}`);
          break;
        }

        // 跳过已完成的批次（恢复模式）
        if (i < startBatch) {
          continue;
        }

        this.completedBatches = i;
        const batch = batches[i];

        logger.info(`   处理批次 ${i + 1}/${batches.length} (${batch.length} 个文件)`);
        params.progress?.onBatchStart?.(i + 1, batches.length);

        // 步骤 3: 检查缓存
        const cached = options.enableCache ? this.checkBatchCache(batch, options) : null;

        if (cached) {
          logger.info(`   ✅ 缓存命中: ${batch.length} 个文件`);
          cached.hits++;
          allResults.push(...cached.results);
          params.progress?.onBatchComplete?.(i + 1, batches.length);
          continue;
        }

        // 步骤 4: 收集批次结果
        const batchResults = await this.collectBatch(
          batch,
          params.workspacePath,
          params.prInfo,
          params.context,
          options,
          i,
          params.progress
        );

        // 步骤 5: 缓存结果
        if (options.enableCache) {
          this.cacheBatch(batch, batchResults, options);
        }

        allResults.push(...batchResults);
        params.progress?.onBatchComplete?.(i + 1, batches.length);

        // 进度更新
        const completed = (i + 1) * (options.batchSize || 3);
        params.progress?.onProgress?.(
          Math.min(completed, params.files.length),
          params.files.length
        );
      }

      // 步骤 6: 生成报告
      const report = params.reportOptions
        ? this.generateReport(allResults, params.reportOptions)
        : undefined;

      logger.info(`✅ 代码审查完成`);
      logger.info(`   处理批次: ${this.completedBatches}/${batches.length}`);
      const totalIssues = allResults.reduce((sum, fr) => sum + fr.issues.length, 0);
      logger.info(`   发现问题数: ${totalIssues}`);

      return {
        success: true,
        fileReviews: allResults,
        summary: this.generateSummary(allResults),
        partial: this.completedBatches < batches.length,
        resumePoint: generateResumePoint(params.jobId, this.completedBatches),
        report,
      };
    } catch (error) {
      logger.error(`代码审查异常: ${error}`);
      throw error;
    }
  }

  /**
   * 按代码类型排序文件
   */
  private sortFilesByType(files: FileChange[]): FileChange[] {
    return [...files].sort((a, b) => {
      // 优先按状态
      const statusOrder = { modified: 0, added: 1, deleted: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }

      // 相同状态按类型优先级
      const typeA = inferCodeType(a.path);
      const typeB = inferCodeType(b.path);
      const priorityA = CODE_TYPE_DEPTH[typeA];
      const priorityB = CODE_TYPE_DEPTH[typeB];

      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      return a.path.localeCompare(b.path);
    });
  }

  /**
   * 创建批次
   */
  private createBatches(files: FileChange[], batchSize: number): FileChange[][] {
    const batches: FileChange[][] = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 检查批次缓存
   */
  private checkBatchCache(
    batch: FileChange[],
    options: ReviewOptions
  ): { results: FileReview[]; timestamp: number; hits: number } | null {
    const batchHash = batch.map(f => `${f.path}:${f.status}:${f.size || 0}`).join('|');
    const cacheKey = generateCacheKey('review', batchHash, options);

    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    // 检查 TTL
    const age = Date.now() - entry.timestamp;
    if (age > DEFAULT_CONFIG.cacheTtl) {
      this.cache.delete(cacheKey);
      return null;
    }

    return {
      results: entry.result.map(r => ({ ...r, status: 'completed' as const })),
      timestamp: entry.timestamp,
      hits: entry.hits,
    };
  }

  /**
   * 缓存批次结果
   */
  private cacheBatch(
    batch: FileChange[],
    results: FileReview[],
    options: ReviewOptions
  ): void {
    const batchHash = batch.map(f => `${f.path}:${f.status}:${f.size || 0}`).join('|');
    const cacheKey = generateCacheKey('review', batchHash, options);

    // 移除旧的缓存条目（LRU 策略）
    if (this.cache.size >= DEFAULT_CONFIG.maxCacheSize) {
      const oldestKey = Array.from(this.cache.keys())[0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(cacheKey, {
      key: cacheKey,
      result: results,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * 收集单个批次
   */
  private async collectBatch(
    batch: FileChange[],
    workspacePath: string,
    prInfo: any,
    context: any,
    options: ReviewOptions,
    batchIndex: number,
    progress?: ReviewProgress
  ): Promise<FileReview[]> {
    try {
      const request = {
        job_id: `${Date.now()}-${batchIndex}`,
        workspace_path: workspacePath,
        files: batch.map(f => ({
          path: f.path,
          status: f.status,
          content: f.content || '',
          previous_content: f.previousContent || '',
        })),
        context,
        options: {
          check_security: options.checkSecurity,
          check_performance: options.checkPerformance,
          check_style: options.checkStyle,
          check_bugs: options.checkBugs,
          max_files: batch.length,
        },
      };

      return new Promise((resolve, reject) => {
        const deadline = this.getRequestDeadline();

        this.client.reviewCode(request, { deadline }, (error: any, response: any) => {
          if (error) {
            logger.error(`批次 ${batchIndex + 1} 失败: ${error.message}`);
            reject(error);
            return;
          }

          if (!response) {
            reject(new Error(`批次 ${batchIndex + 1} 返回空响应`));
            return;
          }

          if (!response.success) {
            reject(new Error(`批次 ${batchIndex + 1} 失败: ${response.error || '未知错误'}`));
            return;
          }

          // 转换结果
          const results = (response.file_reviews || []).map((fr: any) => ({
            filePath: fr.file_path,
            issues: (fr.issues || []).map((issue: any) => ({
              severity: issue.severity,
              category: issue.category,
              title: issue.title,
              description: issue.description,
              location: issue.location ? {
                filePath: issue.location.file_path,
                lineNumber: issue.location.line_number,
                startColumn: issue.location.start_column,
                endColumn: issue.location.end_column,
              } : undefined,
              suggestion: issue.suggestion,
            })),
            status: 'completed' as const,
          }));

          // 单个文件完成回调
          for (const result of results) {
            progress?.onFileComplete?.(result.filePath, result.issues);
          }

          resolve(results);
        });
      });
    } catch (error) {
      logger.error(`批次 ${batchIndex + 1} 异常: ${error}`);
      throw error;
    }
  }

  /**
   * 生成摘要
   */
  private generateSummary(fileReviews: FileReview[]): string {
    const totalIssues = fileReviews.reduce((sum, fr) => sum + fr.issues.length, 0);

    const bySeverity = fileReviews.reduce((acc, fr) => {
      fr.issues.forEach(issue => {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      });
      return acc;
    }, {} as Record<CodeIssue['severity'], number>);

    const byCategory = fileReviews.reduce((acc, fr) => {
      fr.issues.forEach(issue => {
        acc[issue.category] = (acc[issue.category] || 0) + 1;
      });
      return acc;
    }, {} as Record<CodeIssue['category'], number>);

    const lines = [
      `📊 审查摘要`,
      `总计文件: ${fileReviews.length}`,
      `发现问题: ${totalIssues}`,
      ``,
      `按严重性:`,
      `  🚨 Critical: ${bySeverity.critical || 0}`,
      `  ⚠️ Major: ${bySeverity.major || 0}`,
      `  ℹ️ Minor: ${bySeverity.minor || 0}`,
      `  💡 Info: ${bySeverity.info || 0}`,
      ``,
      `按类别:`,
      `  🔒 Security: ${byCategory.security || 0}`,
      `  ⚡ Performance: ${byCategory.performance || 0}`,
      `  🎨 Style: ${byCategory.style || 0}`,
      `  🐛 Bug: ${byCategory.bug || 0}`,
    ];

    return lines.join('\n');
  }

  /**
   * 生成报告
   */
  private generateReport(
    fileReviews: FileReview[],
    options: ReportOptions
  ): string {
    if (options.format === 'json') {
      return this.generateJsonReport(fileReviews);
    } else if (options.format === 'html') {
      return this.generateHtmlReport(fileReviews, options);
    } else {
      return this.generateMarkdownReport(fileReviews, options);
    }
  }

  /**
   * 生成 Markdown 报告
   */
  private generateMarkdownReport(
    fileReviews: FileReview[],
    options: ReportOptions
  ): string {
    const severityFilter = options.severityFilter;
    const filteredReviews = severityFilter
      ? fileReviews.map(fr => ({
          ...fr,
          issues: fr.issues.filter(i => severityFilter.includes(i.severity)),
        }))
      : fileReviews;

    const lines = [
      '# 代码审查报告\n',
      `生成时间: ${new Date().toISOString()}\n`,
      `---\n\n`,
      '## 摘要\n',
      this.generateSummary(filteredReviews),
      '\n---\n\n',
    ];

    if (options.includeDetails) {
      lines.push('## 问题详情\n\n');

      for (const review of filteredReviews) {
        if (review.issues.length === 0) {
          lines.push(`### ${review.filePath}\n✅ 无问题\n`);
          continue;
        }

        lines.push(`### ${review.filePath}\n`);

        for (const issue of review.issues) {
          const emoji = {
            critical: '🚨',
            major: '⚠️',
            minor: 'ℹ️',
            info: '💡',
          }[issue.severity] || '💡';

          lines.push(`**${emoji} ${issue.severity.toUpperCase()}**: ${issue.title}\n\n`);
          lines.push(`**类别**: ${issue.category}\n\n`);
          lines.push(`**位置**: ${issue.location?.filePath || '未知文件'}:${issue.location?.lineNumber || 0}\n\n`);
          lines.push(`**描述**: ${issue.description}\n\n`);

          if (issue.suggestion) {
            lines.push(`**建议**: ${issue.suggestion}\n\n`);
          }

          lines.push('---\n\n');
        }
      }
    }

    return lines.join('');
  }

  /**
   * 生成 JSON 报告
   */
  private generateJsonReport(fileReviews: FileReview[]): string {
    return JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary: this.generateSummary(fileReviews),
      reviews: fileReviews,
    }, null, 2);
  }

  /**
   * 生成 HTML 报告
   */
  private generateHtmlReport(
    fileReviews: FileReview[],
    options: ReportOptions
  ): string {
    const severityFilter = options.severityFilter;
    const filteredReviews = severityFilter
      ? fileReviews.map(fr => ({
          ...fr,
          issues: fr.issues.filter(i => severityFilter.includes(i.severity)),
        }))
      : fileReviews;

    const severityColors: Record<CodeIssue['severity'], string> = {
      critical: '#dc3545',
      major: '#f57c00',
      minor: '#ffc107',
      info: '#17a2b8',
    };

    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>代码审查报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .file-review { margin: 20px 0; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .issue { margin: 10px 0; padding: 15px; border-radius: 4px; }
    .severity-critical { border-left: 4px solid #dc3545; }
    .severity-major { border-left: 4px solid #f57c00; }
    .severity-minor { border-left: 4px solid #ffc107; }
    .severity-info { border-left: 4px solid #17a2b8; }
  </style>
</head>
<body>
  <h1>代码审查报告</h1>
  <p>生成时间: ${new Date().toISOString()}</p>
  <div class="summary">
    <pre>${this.generateSummary(filteredReviews)}</pre>
  </div>
`;

    if (options.includeDetails) {
      for (const review of filteredReviews) {
        html += `<div class="file-review">\n`;
        html += `  <h3>${review.filePath}</h3>\n`;

        if (review.issues.length === 0) {
          html += `  <p>✅ 无问题</p>\n`;
        } else {
          for (const issue of review.issues) {
            const color = severityColors[issue.severity] || '#17a2b8';
            html += `  <div class="issue severity-${issue.severity}" style="border-left-color: ${color};">\n`;
            html += `    <strong>${issue.severity.toUpperCase()}</strong>: ${issue.title}<br>\n`;
            html += `    <em>${issue.category}</em>: ${issue.description}<br>\n`;
            html += `    <code>${issue.location?.filePath || '未知文件'}:${issue.location?.lineNumber || 0}</code><br>\n`;
            if (issue.suggestion) {
              html += `    <strong>建议:</strong> ${issue.suggestion}<br>\n`;
            }
            html += `  </div>\n`;
          }
        }
        html += `</div>\n`;
      }
    }

    html += `
</body>
</html>
`;

    return html;
  }

  /**
   * 暂停审查
   */
  pause(): void {
    if (!this.paused) {
      this.paused = true;
      logger.info('⏸ 审查已暂停');

      if (!this.pausePromise) {
        this.pausePromise = {
          resolve: undefined,
          reject: undefined,
        };
      }
    }
  }

  /**
   * 恢复审查
   */
  resume(): void {
    if (this.paused) {
      this.paused = false;
      logger.info('▶️ 审查已恢复');

      if (this.pausePromise?.resolve) {
        this.pausePromise.resolve();
      }
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<HealthCheck> {
    if (!this.client) {
      return {
        status: 'unhealthy',
        message: '客户端未初始化',
      };
    }

    return new Promise((resolve) => {
      const deadline = this.getRequestDeadline();

      this.client.healthCheck({}, { deadline }, (error: any, response: any) => {
        if (error) {
          resolve({
            status: 'unhealthy',
            message: error.message,
          });
          return;
        }

        resolve({
          status: response.status === 'healthy' ? 'healthy' : 'unhealthy',
          message: response.message,
          version: response.version,
        });
      });
    });
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    totalHits: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);

    return {
      size: this.cache.size,
      hitRate: entries.length > 0 ? totalHits / entries.length : 0,
      totalHits,
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('🗑 审查缓存已清除');
  }

  /**
   * 获取请求截止时间
   */
  private getRequestDeadline(): Date {
    const deadline = new Date();
    deadline.setMilliseconds(deadline.getMilliseconds() + this.requestTimeout);
    return deadline;
  }

  /**
   * 关闭连接
   */
  close(): void {
    if (this.client) {
      try {
        this.client.close();
        this.connected = false;
        this.paused = false;
        logger.info(`🔌 Review Agent 客户端已关闭`);
      } catch (error) {
        logger.error(`关闭客户端失败: ${error}`);
      }
    }
  }
}
