/**
 * Agent 日志和调试工具
 *
 * 用于捕获、存储和分析 Agent 进程的输出
 * 支持实时日志流和历史查询
 */

import { mkdir, readFile, writeFile, rm } from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  agentType: 'context-agent' | 'review-agent';
  jobId: string;
  message: string;
  data?: any;
}

/**
 * Agent 调试快照
 */
export interface AgentDebugSnapshot {
  jobId: string;
  agentType: 'context-agent' | 'review-agent';
  startTime: number;
  endTime?: number;
  pid?: number;
  exitCode?: number | null;
  exitSignal?: string | null;
  logs: LogEntry[];
  stats: {
    totalLogs: number;
    errorCount: number;
    warnCount: number;
    infoCount: number;
    debugCount: number;
  };
}

/**
 * 日志目录结构
 */
const LOG_DIR = '/tmp/codagraph-logs';
const LOG_RETENTION_DAYS = 7;

/**
 * Agent Logger 类
 */
export class AgentLogger {
  private activeStreams: Map<string, NodeJS.WritableStream> = new Map();
  private buffers: Map<string, LogEntry[]> = new Map();

  constructor() {
    this.ensureLogDirectory();
    this.cleanupOldLogs();
  }

  /**
   * 确保日志目录存在
   */
  private async ensureLogDirectory(): Promise<void> {
    try {
      await mkdir(LOG_DIR, { recursive: true });
    } catch (error) {
      logger.error(`创建日志目录失败: ${error}`);
    }
  }

  /**
   * 启动 Agent 日志捕获
   */
  async startLogging(
    jobId: string,
    agentType: 'context-agent' | 'review-agent',
    stdout: NodeJS.ReadableStream,
    stderr: NodeJS.ReadableStream
  ): Promise<void> {
    const logFile = this.getLogFilePath(jobId, agentType);

    // 创建写入流
    const writeStream = (await import('fs')).createWriteStream(logFile, { flags: 'a' });

    // 捕获 stdout
    stdout.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        this.log(LogLevel.INFO, agentType, jobId, message);
        writeStream.write(
          `${this.formatTimestamp()} [${agentType} STDOUT] ${message}\n`
        );
      }
    });

    // 捕获 stderr
    stderr.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        this.log(LogLevel.ERROR, agentType, jobId, message);
        writeStream.write(
          `${this.formatTimestamp()} [${agentType} STDERR] ${message}\n`
        );
      }
    });

    this.activeStreams.set(jobId, writeStream);

    logger.info(`📝 开始捕获 Agent 日志: ${agentType} (${jobId})`);
    logger.info(`   日志文件: ${logFile}`);
  }

  /**
   * 停止 Agent 日志捕获
   */
  async stopLogging(jobId: string): Promise<void> {
    const writeStream = this.activeStreams.get(jobId);
    if (writeStream) {
      writeStream.end();
      this.activeStreams.delete(jobId);

      logger.info(`📝 停止捕获 Agent 日志: ${jobId}`);

      // 保存内存缓冲区
      const buffer = this.buffers.get(jobId);
      if (buffer && buffer.length > 0) {
        await this.saveBuffer(jobId, buffer);
        this.buffers.delete(jobId);
      }
    }
  }

  /**
   * 记录日志条目
   */
  log(
    level: LogLevel,
    agentType: 'context-agent' | 'review-agent',
    jobId: string,
    message: string,
    data?: any
  ): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      agentType,
      jobId,
      message,
      data,
    };

    // 添加到内存缓冲区
    const buffer = this.buffers.get(jobId) || [];
    buffer.push(entry);
    this.buffers.set(jobId, buffer);

    // 限制缓冲区大小（避免内存泄漏）
    if (buffer.length > 1000) {
      this.saveBuffer(jobId, buffer).catch(err => {
        logger.error(`保存日志缓冲区失败: ${err}`);
      });
      buffer.length = 0;
    }
  }

  /**
   * 保存缓冲区到文件
   */
  private async saveBuffer(jobId: string, buffer: LogEntry[]): Promise<void> {
    const bufferFile = path.join(LOG_DIR, `${jobId}.buffer.json`);
    await writeFile(bufferFile, JSON.stringify(buffer, null, 2));
  }

  /**
   * 获取日志文件路径
   */
  private getLogFilePath(
    jobId: string,
    agentType: 'context-agent' | 'review-agent'
  ): string {
    return path.join(LOG_DIR, `${jobId}-${agentType}.log`);
  }

  /**
   * 格式化时间戳
   */
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 获取 Agent 调试快照
   */
  async getDebugSnapshot(
    jobId: string,
    agentType: 'context-agent' | 'review-agent'
  ): Promise<AgentDebugSnapshot | null> {
    try {
      const logFile = this.getLogFilePath(jobId, agentType);
      const logContent = await readFile(logFile, 'utf-8');

      // 解析日志
      const logs: LogEntry[] = [];
      const lines = logContent.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        const parsed = this.parseLogLine(line);
        if (parsed) {
          logs.push(parsed);
        }
      }

      // 统计
      const stats = this.calculateLogStats(logs);

      return {
        jobId,
        agentType,
        startTime: logs[0]?.timestamp || Date.now(),
        endTime: logs[logs.length - 1]?.timestamp,
        logs,
        stats,
      };
    } catch (error) {
      logger.error(`获取调试快照失败: ${error}`);
      return null;
    }
  }

  /**
   * 解析日志行
   */
  private parseLogLine(line: string): LogEntry | null {
    // 简化解析，实际可根据日志格式增强
    return {
      timestamp: Date.now(),
      level: line.includes('ERROR') ? LogLevel.ERROR :
               line.includes('WARN') ? LogLevel.WARN :
               line.includes('DEBUG') ? LogLevel.DEBUG : LogLevel.INFO,
      agentType: line.includes('context-agent') ? 'context-agent' : 'review-agent',
      jobId: 'unknown',  // 从日志名推断
      message: line,
    };
  }

  /**
   * 计算日志统计
   */
  private calculateLogStats(logs: LogEntry[]): {
    totalLogs: number;
    errorCount: number;
    warnCount: number;
    infoCount: number;
    debugCount: number;
  } {
    return {
      totalLogs: logs.length,
      errorCount: logs.filter(l => l.level === LogLevel.ERROR).length,
      warnCount: logs.filter(l => l.level === LogLevel.WARN).length,
      infoCount: logs.filter(l => l.level === LogLevel.INFO).length,
      debugCount: logs.filter(l => l.level === LogLevel.DEBUG).length,
    };
  }

  /**
   * 获取所有活动的日志文件
   */
  async getActiveLogFiles(): Promise<string[]> {
    const { readdir } = await import('fs/promises');
    const files = await readdir(LOG_DIR);
    return files.filter(f => f.endsWith('.log'));
  }

  /**
   * 清理旧日志
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const { readdir, stat } = await import('fs/promises');
      const files = await readdir(LOG_DIR);
      const now = Date.now();
      const retentionMs = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(LOG_DIR, file);
        try {
          const stats = await stat(filePath);
          if (now - stats.mtimeMs > retentionMs) {
            await rm(filePath);
            logger.debug(`清理旧日志: ${file}`);
          }
        } catch (error) {
          // 忽略单个文件错误
        }
      }
    } catch (error) {
      logger.error(`清理旧日志失败: ${error}`);
    }
  }

  /**
   * 获取日志摘要
   */
  async getLogSummary(): Promise<{
    totalFiles: number;
    totalSizeBytes: number;
    oldestLog: string | null;
    newestLog: string | null;
  }> {
    const { readdir, stat } = await import('fs/promises');
    const files = await readdir(LOG_DIR);

    const logFiles = [];
    let totalSize = 0;
    let oldestTime = Date.now();
    let newestTime = 0;
    let oldestLog: string | null = null;
    let newestLog: string | null = null;

    for (const file of files) {
      if (!file.endsWith('.log')) continue;

      const filePath = path.join(LOG_DIR, file);
      const stats = await stat(filePath);
      logFiles.push(file);
      totalSize += stats.size;

      if (stats.mtimeMs < oldestTime) {
        oldestTime = stats.mtimeMs;
        oldestLog = file;
      }
      if (stats.mtimeMs > newestTime) {
        newestTime = stats.mtimeMs;
        newestLog = file;
      }
    }

    return {
      totalFiles: logFiles.length,
      totalSizeBytes: totalSize,
      oldestLog,
      newestLog,
    };
  }

  /**
   * 清理所有日志
   */
  async clearAllLogs(): Promise<void> {
    const { readdir, rm } = await import('fs/promises');
    const files = await readdir(LOG_DIR);

    for (const file of files) {
      try {
        await rm(path.join(LOG_DIR, file));
      } catch (error) {
        logger.error(`删除日志文件失败 ${file}: ${error}`);
      }
    }

    logger.info(`已清理所有日志文件`);
  }
}

/**
 * 创建 Agent Logger 单例
 */
let agentLoggerInstance: AgentLogger | null = null;

export function getAgentLogger(): AgentLogger {
  if (!agentLoggerInstance) {
    agentLoggerInstance = new AgentLogger();
  }
  return agentLoggerInstance;
}
