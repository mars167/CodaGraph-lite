/**
 * 日志工具
 * 提供结构化日志记录功能
 */

import { sanitizeSensitiveText, sanitizeUnknown } from './redactSensitive';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string = 'App') {
    this.prefix = prefix;
    // 从环境变量读取日志级别
    const levelEnv = process.env.LOG_LEVEL?.toLowerCase();
    this.level = this.parseLogLevel(levelEnv);
  }

  private parseLogLevel(level?: string): LogLevel {
    switch (level) {
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

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.prefix}] [${level}] ${sanitizeSensitiveText(message)}`;
  }

  debug(message: string): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message));
    }
  }

  info(message: string): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message));
    }
  }

  warn(message: string): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message));
    }
  }

  error(message: string, error?: Error): void {
    if (this.level <= LogLevel.ERROR) {
      const errorMsg = error
        ? `${message}\n${sanitizeUnknown(error)}`
        : message;
      console.error(this.formatMessage('ERROR', errorMsg));
    }
  }
}

// 导出默认日志实例
export const logger = new Logger('CodaGraph');

// 导出类供其他模块创建自己的 logger
export { Logger };
