/**
 * Context Agent 客户端
 *
 * 用于与 Python Context Agent gRPC 服务通信
 * 支持增量收集、缓存和优先级处理
 */

import * as grpc from '@grpc/grpc-js';
import { logger } from '../utils/logger';

/**
 * 上下文请求参数
 */
export interface ContextRequestParams {
  jobId: string;
  workspacePath: string;
  files: string[];
  prInfo: {
    platform: 'github' | 'gitee' | 'gitlab';
    owner: string;
    repo: string;
    prNumber: string;
  };
  options?: ContextCollectionOptions;
}

/**
 * 上下文收集选项
 */
export interface ContextCollectionOptions {
  /** 增量批次大小 */
  batchSize?: number;
  /** 是否使用缓存 */
  useCache?: boolean;
  /** 是否按优先级排序 */
  sortByPriority?: boolean;
  /** 并行文件数（单个 agent 内） */
  parallelFiles?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 缓存有效期（毫秒） */
  cacheTtl?: number;
}

/**
 * 文件优先级信息
 */
export interface FilePriority {
  path: string;
  priority: number;
  reason: string;
}

/**
 * 上下文缓存条目
 */
export interface ContextCacheEntry {
  key: string;
  context: any;
  timestamp: number;
  hits: number;
}

/**
 * 收集进度回调
 */
export interface ProgressCallback {
  onBatchComplete?: (batch: number, total: number) => void;
  onFileComplete?: (file: string, context: any) => void;
  onError?: (error: Error) => void;
}

/**
 * 上下文响应
 */
export interface ContextResponse {
  success: boolean;
  context: any;
  error?: string;
  partial?: boolean;  // 是否为部分结果（增量收集中断）
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
 * 默认配置
 */
const DEFAULT_CONFIG = {
  batchSize: 5,           // 每批最多 5 个文件
  useCache: true,         // 启用缓存
  sortByPriority: true,    // 按优先级排序
  parallelFiles: 3,       // 并行处理 3 个文件
  requestTimeout: 60000,   // 60 秒请求超时
  cacheTtl: 300000,       // 缓存 5 分钟
  maxCacheSize: 100,      // 最多缓存 100 条
} as const;

/**
 * 文件扩展名优先级（更高的优先级）
 */
const FILE_PRIORITY_MAP: Record<string, number> = {
  '.ts': 10,
  '.tsx': 10,
  '.js': 9,
  '.jsx': 9,
  '.py': 8,
  '.rs': 8,
  '.go': 7,
  '.java': 7,
  '.rb': 6,
  '.php': 6,
  '.h': 5,
  '.hpp': 5,
  '.c': 4,
  '.cpp': 4,
  '.json': 3,
  '.yaml': 3,
  '.yml': 2,
  '.md': 2,
  '.txt': 1,
};

/**
 * 计算文件优先级
 */
function calculateFilePriority(filePath: string): FilePriority {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  return {
    path: filePath,
    priority: FILE_PRIORITY_MAP[ext] || 0,
    reason: `文件类型: .${ext}`,
  };
}

/**
 * 生成缓存键
 */
function generateCacheKey(jobId: string, files: string[]): string {
  return `${jobId}:${files.sort().join(',')}`;
}

/**
 * Context Agent 客户端
 */
export class ContextAgentClient {
  private client: any = null;
  private connected: boolean = false;
  private cache: Map<string, ContextCacheEntry> = new Map();
  private activeBatches: Map<string, AbortController[]> = new Map();

  constructor(
    private host: string,
    private port: number,
    private requestTimeout: number = 60000
  ) {
    this.logger.info(`🔗 Context Agent 客户端初始化: ${host}:${port}`);
  }

  private logger = logger;

  /**
   * 连接到服务
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const protoClient = (global as any).agent_pb2_grpc;

        if (!protoClient || !protoClient.ContextAgentServiceClient) {
          reject(new Error('gRPC proto 客户端未初始化，请先运行 proto 代码生成'));
          return;
        }

        this.client = new protoClient.ContextAgentServiceClient(
          `${this.host}:${this.port}`,
          grpc.credentials.createInsecure(),
          {
            'grpc.max_receive_message_length': 10 * 1024 * 1024,  // 10MB
            'grpc.max_send_message_length': 10 * 1024 * 1024,      // 10MB
          }
        );

        // 测试连接
        this.healthCheck().then(() => {
          this.connected = true;
          this.logger.info(`✅ Context Agent gRPC 客户端已连接到 ${this.host}:${this.port}`);
          resolve();
        }).catch((err) => {
          reject(new Error(`Context Agent 连接失败: ${err.message}`));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 收集上下文（增强版）
   */
  async collectContext(
    params: ContextRequestParams,
    progress?: ProgressCallback
  ): Promise<ContextResponse> {
    if (!this.client || !this.connected) {
      throw new Error('Context Agent 客户端未连接');
    }

    const options = { ...DEFAULT_CONFIG, ...params.options };

    this.logger.info(`📊 开始增量上下文收集: ${params.jobId}`);
    this.logger.info(`   文件数量: ${params.files.length}`);
    this.logger.info(`   批次大小: ${options.batchSize}`);
    this.logger.info(`   使用缓存: ${options.useCache}`);

    try {
      // 步骤 1: 排序文件（按优先级）
      const sortedFiles = this.sortFilesByPriority(
        params.files,
        options.sortByPriority
      );

      // 步骤 2: 检查缓存
      const context = await this.collectWithCache(
        params.jobId,
        sortedFiles,
        params.workspacePath,
        params.prInfo,
        options,
        progress
      );

      this.logger.info(`✅ 上下文收集完成`);
      return {
        success: true,
        context,
      };
    } catch (error) {
      this.logger.error(`上下文收集异常: ${error}`);
      throw error;
    }
  }

  /**
   * 收集上下文（增量 + 缓存）
   */
  private async collectWithCache(
    jobId: string,
    files: string[],
    workspacePath: string,
    prInfo: any,
    options: ContextCollectionOptions,
    progress?: ProgressCallback
  ): Promise<any> {
    const batchSize = options.batchSize || DEFAULT_CONFIG.batchSize;
    const totalBatches = Math.ceil(files.length / batchSize);

    this.logger.info(`   将分 ${totalBatches} 批次处理`);

    const combinedContext: any = {
      symbols: [],
      relationships: [],
      fileSummaries: [],
    };

    // 步骤 1: 增量分批处理
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      this.logger.info(`   处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个文件)`);

      // 步骤 2: 检查缓存
      const cacheKey = generateCacheKey(jobId, batch);
      const cached = options.useCache ? this.cache.get(cacheKey) : null;

      if (cached && this.isCacheValid(cached, options.cacheTtl)) {
        this.logger.info(`   ✅ 缓存命中: ${batch.length} 个文件`);
        cached.hits++;
        this.mergeContext(combinedContext, cached.context);
        progress?.onBatchComplete?.(i + batchSize, files.length);
        continue;
      }

      // 步骤 3: 收集批次上下文
      const batchContext = await this.collectBatch(
        batch,
        workspacePath,
        prInfo,
        options,
        batchNumber
      );

      // 步骤 4: 缓存结果
      if (options.useCache) {
        this.cache.set(cacheKey, {
          key: cacheKey,
          context: batchContext,
          timestamp: Date.now(),
          hits: 0,
        });
      }

      this.mergeContext(combinedContext, batchContext);

      // 步骤 5: 进度回调
      progress?.onBatchComplete?.(i + batchSize, files.length);

      // 步骤 6: 清理过期缓存
      this.cleanupCache();
    }

    return combinedContext;
  }

  /**
   * 收集单个批次
   */
  private async collectBatch(
    files: string[],
    workspacePath: string,
    prInfo: any,
    options: ContextCollectionOptions,
    batchNumber: number
  ): Promise<any> {
    const parallelCount = options.parallelFiles || DEFAULT_CONFIG.parallelFiles;

    // 步骤 1: 并行文件处理（如果启用）
    if (parallelCount > 1 && files.length > parallelCount) {
      return await this.collectFilesInParallel(
        files,
        workspacePath,
        prInfo,
        parallelCount,
        batchNumber
      );
    }

    // 步骤 2: 顺序收集
    return await this.collectFilesSequentially(
      files,
      workspacePath,
      prInfo,
      batchNumber
    );
  }

  /**
   * 并行收集文件
   */
  private async collectFilesInParallel(
    files: string[],
    workspacePath: string,
    prInfo: any,
    parallelCount: number,
    batchNumber: number
  ): Promise<any> {
    this.logger.info(`      并行处理: ${parallelCount} 个文件/批次`);

    const results = await Promise.allSettled(
      files.map((file, index) =>
        this.collectSingleFile(file, workspacePath, prInfo, batchNumber, index)
      )
    );

    // 合并成功结果
    const context: any = {
      symbols: [],
      relationships: [],
      fileSummaries: [],
    };

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        this.mergeContext(context, result.value);
      }
    });

    return context;
  }

  /**
   * 顺序收集文件
   */
  private async collectFilesSequentially(
    files: string[],
    workspacePath: string,
    prInfo: any,
    batchNumber: number
  ): Promise<any> {
    const context: any = {
      symbols: [],
      relationships: [],
      fileSummaries: [],
    };

    for (const file of files) {
      const fileContext = await this.collectSingleFile(
        file,
        workspacePath,
        prInfo,
        batchNumber,
        files.indexOf(file)
      );

      if (fileContext) {
        this.mergeContext(context, fileContext);
      }
    }

    return context;
  }

  /**
   * 收集单个文件
   */
  private async collectSingleFile(
    filePath: string,
    workspacePath: string,
    prInfo: any,
    batchNumber: number,
    fileIndex: number
  ): Promise<any> {
    try {
      const request = {
        job_id: `${Date.now()}-${batchNumber}-${fileIndex}`,
        workspace_path: workspacePath,
        files: [filePath],
        pr_info: prInfo,
      };

      return new Promise((resolve, reject) => {
        const deadline = this.getRequestDeadline();

        this.client.collectContext(request, { deadline }, (error: any, response: any) => {
          if (error) {
            this.logger.error(`        文件 ${filePath} 失败: ${error.message}`);
            reject(error);
            return;
          }

          if (!response) {
            reject(new Error(`文件 ${filePath} 返回空响应`));
            return;
          }

          resolve(response.context);
        });
      });
    } catch (error) {
      this.logger.error(`        文件 ${filePath} 异常: ${error}`);
      return null;
    }
  }

  /**
   * 按优先级排序文件
   */
  private sortFilesByPriority(
    files: string[],
    sortByPriority: boolean | undefined
  ): string[] {
    if (!sortByPriority) {
      return [...files];
    }

    return [...files].sort((a, b) => {
      const priorityA = calculateFilePriority(a);
      const priorityB = calculateFilePriority(b);

      // 优先级高的在前
      if (priorityA.priority !== priorityB.priority) {
        return priorityB.priority - priorityA.priority;
      }

      // 同优先级按路径排序
      return a.localeCompare(b);
    });
  }

  /**
   * 合并上下文
   */
  private mergeContext(target: any, source: any): void {
    if (!source) return;

    if (source.symbols) {
      target.symbols = [...(target.symbols || []), ...source.symbols];
    }
    if (source.relationships) {
      target.relationships = [...(target.relationships || []), ...source.relationships];
    }
    if (source.fileSummaries) {
      target.fileSummaries = [...(target.fileSummaries || []), ...source.fileSummaries];
    }
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(
    entry: ContextCacheEntry,
    ttl?: number
  ): boolean {
    const cacheTtl = ttl || DEFAULT_CONFIG.cacheTtl;
    const age = Date.now() - entry.timestamp;
    return age < cacheTtl;
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache(): void {
    const now = Date.now();
    const ttl = DEFAULT_CONFIG.cacheTtl;
    const maxSize = DEFAULT_CONFIG.maxCacheSize;

    // 清理过期条目
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > ttl) {
        this.cache.delete(key);
      }
    }

    // 清理超出大小限制的条目
    const entries = Array.from(this.cache.entries());
    if (entries.length > maxSize) {
      entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, entries.length - maxSize)
        .forEach(([key]) => this.cache.delete(key));
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
   * 清除所有缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('🗑 上下文缓存已清除');
  }

  /**
   * 取消正在进行的收集
   */
  cancelCollection(jobId: string): void {
    const abortControllers = this.activeBatches.get(jobId) || [];
    abortControllers.forEach(controller => controller.abort());
    this.activeBatches.delete(jobId);
    this.logger.info(`🛑 已取消作业 ${jobId} 的收集`);
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
    // 取消所有活跃请求
    for (const [jobId, controllers] of this.activeBatches.entries()) {
      controllers.forEach(controller => controller.abort());
    }
    this.activeBatches.clear();

    // 清除缓存
    this.cache.clear();

    if (this.client) {
      try {
        this.client.close();
        this.connected = false;
        this.logger.info(`🔌 Context Agent 客户端已关闭`);
      } catch (error) {
        this.logger.error(`关闭客户端失败: ${error}`);
      }
    }
  }
}
