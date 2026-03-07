/**
 * 内存监控模块
 *
 * 2u2g 关键功能：
 * - 实时内存使用监控
 * - Swap 检测和警告
 * - 内存压力检测
 * - 内存清理建议
 * - 资源使用报告
 */

import os from 'os';
import { execFileSync } from 'child_process';
import { logger } from '../utils/logger';
import { getConfig, getResourceLimits } from './index';

/**
 * 内存使用信息
 */
export interface MemoryUsage {
  /** 总内存 (MB) */
  totalMB: number;
  /** 已用内存 (MB) */
  usedMB: number;
  /** 可用内存 (MB) */
  freeMB: number;
  /** 使用百分比 */
  usedPercent: number;
  /** Node.js 堆内存 (MB) */
  nodeHeapUsedMB: number;
  /** Node.js 堆总量 (MB) */
  nodeHeapTotalMB: number;
  /** Node.js 外部内存 (MB) */
  nodeExternalMB: number;
  /** Node.js RSS (MB) */
  nodeRssMB: number;
}

/**
 * Swap 使用信息
 */
export interface SwapUsage {
  /** Swap 总量 (MB) */
  totalMB: number;
  /** Swap 已用 (MB) */
  usedMB: number;
  /** Swap 可用 (MB) */
  freeMB: number;
  /** 使用百分比 */
  usedPercent: number;
  /** 是否存在 Swap */
  exists: boolean;
}

/**
 * 内存压力级别
 */
export enum MemoryPressure {
  /** 正常 */
  NORMAL = 'normal',
  /** 警告 */
  WARNING = 'warning',
  /** 危急 */
  CRITICAL = 'critical',
}

/**
 * 资源状态报告
 */
export interface ResourceStatus {
  memory: MemoryUsage;
  swap: SwapUsage;
  pressure: MemoryPressure;
  recommendations: string[];
  timestamp: string;
}

/**
 * 安全执行命令获取输出
 */
function safeExecFile(command: string, args: string[] = [], timeout: number = 1000): string {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return output;
  } catch {
    return '';
  }
}

/**
 * 内存监控器
 */
export class MemoryMonitor {
  private config = getConfig();
  private lastCheck: ResourceStatus | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * 获取系统内存使用
   */
  getSystemMemory(): MemoryUsage {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const nodeMemory = process.memoryUsage();

    return {
      totalMB: Math.round(totalMem / 1024 / 1024),
      usedMB: Math.round(usedMem / 1024 / 1024),
      freeMB: Math.round(freeMem / 1024 / 1024),
      usedPercent: Math.round((usedMem / totalMem) * 100),
      nodeHeapUsedMB: Math.round(nodeMemory.heapUsed / 1024 / 1024),
      nodeHeapTotalMB: Math.round(nodeMemory.heapTotal / 1024 / 1024),
      nodeExternalMB: Math.round(nodeMemory.external / 1024 / 1024),
      nodeRssMB: Math.round(nodeMemory.rss / 1024 / 1024),
    };
  }

  /**
   * 获取 Swap 使用情况
   */
  getSwapUsage(): SwapUsage {
    // Linux: 使用 free 命令
    if (process.platform === 'linux') {
      const output = safeExecFile('free', ['-m']);
      if (output) {
        const lines = output.split('\n');
        const swapLine = lines.find(l => l.startsWith('Swap:'));
        if (swapLine) {
          const parts = swapLine.split(/\s+/);
          const total = parseInt(parts[1], 10) || 0;
          const used = parseInt(parts[2], 10) || 0;
          const free = parseInt(parts[3], 10) || 0;

          return {
            totalMB: total,
            usedMB: used,
            freeMB: free,
            usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
            exists: total > 0,
          };
        }
      }
    }

    // macOS: 使用 vm_stat
    if (process.platform === 'darwin') {
      const output = safeExecFile('vm_stat');
      if (output) {
        const pageSize = 4096; // 通常 4KB
        let swapUsed = 0;

        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('Pageouts')) {
            const match = line.match(/(\d+)/);
            if (match) {
              swapUsed = parseInt(match[1], 10) * pageSize / 1024 / 1024;
              break;
            }
          }
        }

        return {
          totalMB: 0, // macOS 不容易获取 swap 总量
          usedMB: Math.round(swapUsed),
          freeMB: 0,
          usedPercent: 0,
          exists: swapUsed > 0,
        };
      }
    }

    return {
      totalMB: 0,
      usedMB: 0,
      freeMB: 0,
      usedPercent: 0,
      exists: false,
    };
  }

  /**
   * 判断内存压力级别
   */
  getMemoryPressure(memory: MemoryUsage): MemoryPressure {
    const warningThreshold = this.config.monitoring.memoryWarningThreshold;
    const criticalThreshold = this.config.monitoring.memoryCriticalThreshold;

    if (memory.usedPercent >= criticalThreshold) {
      return MemoryPressure.CRITICAL;
    }

    if (memory.usedPercent >= warningThreshold) {
      return MemoryPressure.WARNING;
    }

    return MemoryPressure.NORMAL;
  }

  /**
   * 生成内存优化建议
   */
  generateRecommendations(status: ResourceStatus): string[] {
    const recommendations: string[] = [];
    const limits = getResourceLimits();
    const memoryLimit = limits.nodeMemoryLimit;

    // 内存压力建议
    if (status.pressure === MemoryPressure.CRITICAL) {
      recommendations.push('内存使用率超过 95%，建议立即重启服务或增加内存');
    } else if (status.pressure === MemoryPressure.WARNING) {
      recommendations.push('内存使用率超过 80%，建议监控并考虑优化');
    }

    // Node.js 堆内存建议
    const heapUsedPercent = (status.memory.nodeHeapUsedMB / memoryLimit) * 100;
    if (heapUsedPercent > 90) {
      recommendations.push(`Node.js 堆内存使用率 ${Math.round(heapUsedPercent)}%，接近限制`);
    }

    // Swap 建议
    if (status.swap.exists && status.swap.usedPercent > 50) {
      recommendations.push(`Swap 使用率 ${status.swap.usedPercent}%，可能影响性能`);
    }

    if (!status.swap.exists) {
      recommendations.push('未检测到 Swap，建议为 2u2g 服务器配置 2GB Swap');
    }

    // RSS 建议
    if (status.memory.nodeRssMB > (memoryLimit * 0.9)) {
      recommendations.push(`Node.js RSS ${status.memory.nodeRssMB}MB，接近 ${memoryLimit}MB 限制`);
    }

    return recommendations;
  }

  /**
   * 获取完整的资源状态
   */
  getResourceStatus(): ResourceStatus {
    const memory = this.getSystemMemory();
    const swap = this.getSwapUsage();
    const pressure = this.getMemoryPressure(memory);

    const status: ResourceStatus = {
      memory,
      swap,
      pressure,
      recommendations: [],
      timestamp: new Date().toISOString(),
    };

    status.recommendations = this.generateRecommendations(status);

    // 保存最后检查结果
    this.lastCheck = status;

    return status;
  }

  /**
   * 检查是否可以启动新任务
   */
  canStartJob(): { canStart: boolean; reason?: string } {
    const status = this.getResourceStatus();
    const limits = getResourceLimits();
    const memoryLimit = limits.nodeMemoryLimit;

    // 检查内存压力
    if (status.pressure === MemoryPressure.CRITICAL) {
      return {
        canStart: false,
        reason: `内存压力危急 (${status.memory.usedPercent}%)，无法启动新任务`,
      };
    }

    // 检查 Node.js 堆内存
    if (status.memory.nodeHeapUsedMB > (memoryLimit * 0.9)) {
      return {
        canStart: false,
        reason: `Node.js 堆内存过高 (${status.memory.nodeHeapUsedMB}MB)`,
      };
    }

    // 检查 Swap 使用
    if (status.swap.exists && status.swap.usedPercent > 80) {
      return {
        canStart: false,
        reason: `Swap 使用率过高 (${status.swap.usedPercent}%)`,
      };
    }

    return { canStart: true };
  }

  /**
   * 记录内存使用
   */
  logMemoryUsage(context: string = ''): void {
    const status = this.getResourceStatus();
    const prefix = context ? `[${context}] ` : '';

    logger.info(`${prefix}内存使用:`);
    logger.info(`  系统: ${status.memory.usedMB}/${status.memory.totalMB}MB (${status.memory.usedPercent}%)`);
    logger.info(`  Node.js: 堆=${status.memory.nodeHeapUsedMB}MB, RSS=${status.memory.nodeRssMB}MB`);

    if (status.swap.exists) {
      logger.info(`  Swap: ${status.swap.usedMB}/${status.swap.totalMB}MB (${status.swap.usedPercent}%)`);
    }

    if (status.recommendations.length > 0) {
      status.recommendations.forEach(r => logger.warn(`  ⚠️  ${r}`));
    }
  }

  /**
   * 执行内存清理
   */
  async performMemoryCleanup(): Promise<{ beforeMB: number; afterMB: number; freedMB: number }> {
    const before = process.memoryUsage().heapUsed / 1024 / 1024;

    logger.info('开始内存清理...');

    // 1. 强制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
      logger.debug('执行垃圾回收');
    }

    // 2. 等待一小段时间让 GC 完成
    await new Promise(resolve => setTimeout(resolve, 100));

    const after = process.memoryUsage().heapUsed / 1024 / 1024;
    const freed = before - after;

    logger.info(`内存清理完成: ${before.toFixed(1)}MB -> ${after.toFixed(1)}MB (释放 ${freed.toFixed(1)}MB)`);

    return {
      beforeMB: Math.round(before * 10) / 10,
      afterMB: Math.round(after * 10) / 10,
      freedMB: Math.round(freed * 10) / 10,
    };
  }

  /**
   * 启动定期监控
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      logger.warn('内存监控已在运行');
      return;
    }

    logger.info(`启动内存监控 (间隔: ${intervalMs}ms)`);

    this.monitoringInterval = setInterval(() => {
      const status = this.getResourceStatus();

      // 记录警告和危急状态
      if (status.pressure === MemoryPressure.CRITICAL) {
        logger.error(`🚨 内存危急: ${status.memory.usedPercent}%`);
      } else if (status.pressure === MemoryPressure.WARNING) {
        logger.warn(`⚠️  内存警告: ${status.memory.usedPercent}%`);
      }

      // Swap 警告
      if (this.config.monitoring.enableSwapWarning && status.swap.exists && status.swap.usedPercent > 50) {
        logger.warn(`⚠️  Swap 使用率: ${status.swap.usedPercent}%`);
      }
    }, intervalMs);
  }

  /**
   * 停止定期监控
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('内存监控已停止');
    }
  }

  /**
   * 获取最后一次检查结果
   */
  getLastCheck(): ResourceStatus | null {
    return this.lastCheck;
  }

  /**
   * 格式化资源状态为 JSON（用于 API）
   */
  toJSON(): object {
    const status = this.getResourceStatus();
    return {
      memory: {
        system: {
          total: status.memory.totalMB,
          used: status.memory.usedMB,
          free: status.memory.freeMB,
          percent: status.memory.usedPercent,
        },
        node: {
          heapUsed: status.memory.nodeHeapUsedMB,
          heapTotal: status.memory.nodeHeapTotalMB,
          external: status.memory.nodeExternalMB,
          rss: status.memory.nodeRssMB,
        },
      },
      swap: {
        total: status.swap.totalMB,
        used: status.swap.usedMB,
        free: status.swap.freeMB,
        percent: status.swap.usedPercent,
        exists: status.swap.exists,
      },
      pressure: status.pressure,
      recommendations: status.recommendations,
      timestamp: status.timestamp,
    };
  }
}

// 单例实例
let memoryMonitorInstance: MemoryMonitor | null = null;

/**
 * 获取内存监控器单例
 */
export function getMemoryMonitor(): MemoryMonitor {
  if (!memoryMonitorInstance) {
    memoryMonitorInstance = new MemoryMonitor();
  }
  return memoryMonitorInstance;
}

/**
 * 重置内存监控器（用于测试）
 */
export function resetMemoryMonitor(): void {
  if (memoryMonitorInstance) {
    memoryMonitorInstance.stopMonitoring();
    memoryMonitorInstance = null;
  }
}

export default {
  MemoryMonitor,
  getMemoryMonitor,
  resetMemoryMonitor,
  MemoryPressure,
};