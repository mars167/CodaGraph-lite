/**
 * 结构化日志模块
 *
 * 特性：
 * - 多级别日志 (debug, info, warn, error)
 * - JSON 结构化输出
 * - 文件日志轮转
 * - 请求日志中间件
 * - Agent 进程日志
 */

import fs from 'fs';
import path from 'path';
import { getConfig } from './index';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志条目结构
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  requestId?: string;
  jobId?: string;
  agentType?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 日志配置
 */
export interface StructuredLoggerConfig {
  level: LogLevel;
  context: string;
  logPath: string;
  enableFileLogging: boolean;
  enableConsoleLogging: boolean;
  maxFileSize: number; // bytes
  maxFiles: number;
}

/**
 * 结构化日志器
 */
export class StructuredLogger {
  private config: StructuredLoggerConfig;
  private currentLogFile: string;
  private currentLogSize: number = 0;
  private fileStream: fs.WriteStream | null = null;

  constructor(config: Partial<StructuredLoggerConfig> = {}) {
    const appConfig = getConfig();

    this.config = {
      level: config.level ?? this.parseLogLevel(appConfig.logging.logLevel),
      context: config.context ?? 'App',
      logPath: config.logPath ?? appConfig.logging.logPath,
      enableFileLogging: config.enableFileLogging ?? true,
      enableConsoleLogging: config.enableConsoleLogging ?? true,
      maxFileSize: config.maxFileSize ?? 10 * 1024 * 1024, // 10MB
      maxFiles: config.maxFiles ?? 5,
    };

    this.currentLogFile = this.getLogFilePath();

    if (this.config.enableFileLogging) {
      this.ensureLogDirectory();
      this.openLogFile();
    }
  }

  /**
   * 解析日志级别
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
      case 'warning':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * 获取日志文件路径
   */
  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.config.logPath, `codagraph-${date}.log`);
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logPath)) {
      fs.mkdirSync(this.config.logPath, { recursive: true });
    }
  }

  /**
   * 打开日志文件
   */
  private openLogFile(): void {
    try {
      // 检查文件大小
      if (fs.existsSync(this.currentLogFile)) {
        const stats = fs.statSync(this.currentLogFile);
        this.currentLogSize = stats.size;
      }

      this.fileStream = fs.createWriteStream(this.currentLogFile, {
        flags: 'a',
        encoding: 'utf-8',
      });
    } catch (error) {
      console.error('无法打开日志文件:', error);
    }
  }

  /**
   * 检查并轮转日志
   */
  private checkRotation(): void {
    if (this.currentLogSize >= this.config.maxFileSize) {
      this.rotateLog();
    }
  }

  /**
   * 轮转日志文件
   */
  private rotateLog(): void {
    // 关闭当前文件
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }

    // 重命名旧文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`);

    try {
      fs.renameSync(this.currentLogFile, rotatedFile);
    } catch (error) {
      console.error('日志轮转失败:', error);
    }

    // 清理旧日志
    this.cleanOldLogs();

    // 打开新文件
    this.currentLogFile = this.getLogFilePath();
    this.currentLogSize = 0;
    this.openLogFile();
  }

  /**
   * 清理旧日志文件
   */
  private cleanOldLogs(): void {
    try {
      const files = fs.readdirSync(this.config.logPath)
        .filter(f => f.startsWith('codagraph-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logPath, f),
          time: fs.statSync(path.join(this.config.logPath, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      // 删除超过 maxFiles 的文件
      if (files.length > this.config.maxFiles) {
        files.slice(this.config.maxFiles).forEach(f => {
          try {
            fs.unlinkSync(f.path);
          } catch {
            // 忽略删除错误
          }
        });
      }
    } catch (error) {
      console.error('清理旧日志失败:', error);
    }
  }

  /**
   * 格式化日志条目
   */
  private formatEntry(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  /**
   * 写入日志
   */
  private write(level: LogLevel, entry: LogEntry): void {
    if (level < this.config.level) {
      return;
    }

    const formatted = this.formatEntry(entry);

    // 控制台输出
    if (this.config.enableConsoleLogging) {
      const colorMap = {
        [LogLevel.DEBUG]: '\x1b[36m', // cyan
        [LogLevel.INFO]: '\x1b[32m',  // green
        [LogLevel.WARN]: '\x1b[33m',  // yellow
        [LogLevel.ERROR]: '\x1b[31m', // red
      };
      const reset = '\x1b[0m';
      const color = colorMap[level] || reset;

      console.log(`${color}[${entry.level}]${reset} ${entry.message}`);
    }

    // 文件输出
    if (this.config.enableFileLogging && this.fileStream) {
      this.checkRotation();
      this.fileStream.write(formatted + '\n');
      this.currentLogSize += formatted.length + 1;
    }
  }

  /**
   * Debug 级别日志
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.write(LogLevel.DEBUG, {
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      context: this.config.context,
      message,
      data,
    });
  }

  /**
   * Info 级别日志
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.write(LogLevel.INFO, {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context: this.config.context,
      message,
      data,
    });
  }

  /**
   * Warn 级别日志
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.write(LogLevel.WARN, {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      context: this.config.context,
      message,
      data,
    });
  }

  /**
   * Error 级别日志
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context: this.config.context,
      message,
      data,
    };

    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      entry.data = { ...entry.data, error: String(error) };
    }

    this.write(LogLevel.ERROR, entry);
  }

  /**
   * 创建子日志器
   */
  child(context: string): StructuredLogger {
    return new StructuredLogger({
      ...this.config,
      context: `${this.config.context}:${context}`,
    });
  }

  /**
   * 记录请求日志
   */
  logRequest(req: { method: string; url: string; headers: Record<string, string> }, requestId: string): void {
    this.info(`HTTP ${req.method} ${req.url}`, {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
    });
  }

  /**
   * 记录响应日志
   */
  logResponse(requestId: string, statusCode: number, duration: number): void {
    this.info(`Response ${statusCode}`, {
      requestId,
      statusCode,
      duration,
    });
  }

  /**
   * 记录 Agent 日志
   */
  logAgent(agentType: string, action: string, jobId: string, data?: Record<string, unknown>): void {
    this.info(`Agent ${agentType}: ${action}`, {
      agentType,
      action,
      jobId,
      ...data,
    });
  }

  /**
   * 记录作业日志
   */
  logJob(jobId: string, action: string, data?: Record<string, unknown>): void {
    this.info(`Job ${jobId}: ${action}`, {
      jobId,
      action,
      ...data,
    });
  }

  /**
   * 关闭日志器
   */
  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}

// 默认日志器实例
let defaultLogger: StructuredLogger | null = null;

/**
 * 获取默认日志器
 */
export function getLogger(): StructuredLogger {
  if (!defaultLogger) {
    defaultLogger = new StructuredLogger({ context: 'CodaGraph' });
  }
  return defaultLogger;
}

/**
 * 重置日志器（用于测试）
 */
export function resetLogger(): void {
  if (defaultLogger) {
    defaultLogger.close();
    defaultLogger = null;
  }
}

/**
 * 创建子日志器
 */
export function createLogger(context: string): StructuredLogger {
  return getLogger().child(context);
}

export default {
  StructuredLogger,
  getLogger,
  createLogger,
  resetLogger,
  LogLevel,
};