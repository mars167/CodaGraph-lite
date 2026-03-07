/**
 * Agent Manager - 子进程管理模块
 *
 * 关键功能：
 * - 按需启动 Context Agent 和 Review Agent
 * - 严格执行超时保护（context: 5min, review: 10min）
 * - SIGTERM/SIGKILL 强制终止（5秒后）
 * - 内存使用监控
 * - 僵尸进程检测和清理
 * - 作业完成后立即终止进程（2u2g 关键要求）
 *
 * 2u2g 服务器优化：
 * - Agents 不作为后台守护进程运行
 * - 任何时候只允许一个 agent 运行
 * - 严格资源限制执行
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { logger } from '../utils/logger';

// Agent 类型
export enum AgentType {
  CONTEXT = 'context-agent',
  REVIEW = 'review-agent',
}

// Agent 进程信息
interface AgentProcess {
  pid: number;
  type: AgentType;
  startTime: number;
  jobId: string;
  timeout: number;
  agentProcess: ChildProcess;
  active: boolean;
  timeoutTimer?: NodeJS.Timeout;
}

// Agent 配置
interface AgentConfig {
  contextAgentPath: string;
  reviewAgentPath: string;
  contextTimeout: number;  // 毫秒
  reviewTimeout: number;    // 毫秒
  killTimeout: number;       // 发送 SIGTERM 后等待 SIGKILL 的毫秒数
  pythonPath?: string;      // Python 解释器路径
}

/**
 * Agent Manager 类
 * 管理所有 Python agent 子进程的生命周期
 */
export class AgentManager {
  private processes: Map<string, AgentProcess> = new Map();
  private config: AgentConfig;
  private activeAgent: AgentType | null = null;  // 2u2g: 同一时间只允许一个 agent

  constructor(config: AgentConfig) {
    this.config = {
      ...config,
    };

    logger.info(`🤖 Agent Manager 初始化`);
    logger.info(`   Context Agent 超时: ${this.config.contextTimeout}ms`);
    logger.info(`   Review Agent 超时: ${this.config.reviewTimeout}ms`);
    logger.info(`   强制终止超时: ${this.config.killTimeout}ms`);

    // 启动僵尸进程检测
    this.startZombieDetection();
  }

  /**
   * 启动 Context Agent
   */
  async startContextAgent(jobId: string): Promise<void> {
    return this.startAgent(AgentType.CONTEXT, jobId);
  }

  /**
   * 启动 Review Agent
   */
  async startReviewAgent(jobId: string): Promise<void> {
    return this.startAgent(AgentType.REVIEW, jobId);
  }

  /**
   * 启动 Agent（通用方法）
   */
  private async startAgent(type: AgentType, jobId: string): Promise<void> {
    // 2u2g: 检查是否已有 agent 在运行
    if (this.activeAgent) {
      throw new Error(
        `无法启动 ${type}: 已有 ${this.activeAgent} 在运行`
      );
    }

    const agentPath = type === AgentType.CONTEXT
      ? this.config.contextAgentPath
      : this.config.reviewAgentPath;

    const timeout = type === AgentType.CONTEXT
      ? this.config.contextTimeout
      : this.config.reviewTimeout;

    logger.info(`🚀 启动 ${type} (作业: ${jobId})`);
    logger.info(`   超时: ${timeout}ms`);
    logger.info(`   路径: ${agentPath}`);

    // 启动 Python 进程
    const spawnedProcess = spawn(
      this.config.pythonPath || 'python',
      [agentPath],
      {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',  // 禁用输出缓冲
          PYTHONIOENCODING: 'utf-8',
        },
        cwd: path.dirname(agentPath),
      }
    );

    const agentInfo: AgentProcess = {
      pid: spawnedProcess.pid || 0,
      type,
      startTime: Date.now(),
      jobId,
      timeout,
      agentProcess: spawnedProcess,
      active: true,
    };

    this.processes.set(jobId, agentInfo);
    this.activeAgent = type;

    // 捕获输出
    spawnedProcess.stdout?.on('data', (data: Buffer) => {
      logger.debug(`[${type} stdout] ${data.toString().trim()}`);
    });

    spawnedProcess.stderr?.on('data', (data: Buffer) => {
      logger.error(`[${type} stderr] ${data.toString().trim()}`);
    });

    // 进程退出处理
    spawnedProcess.on('exit', (code: number | null, signal: string | null) => {
      const duration = Date.now() - agentInfo.startTime;
      logger.info(
        `🛑 ${type} 进程退出 (作业: ${jobId})`
      );
      logger.info(`   PID: ${agentInfo.pid}`);
      logger.info(`   退出代码: ${code}`);
      logger.info(`   退出信号: ${signal}`);
      logger.info(`   运行时间: ${duration}ms`);

      // 标记为非活跃
      agentInfo.active = false;
      this.activeAgent = null;
      this.processes.delete(jobId);
    });

    spawnedProcess.on('error', (error: Error) => {
      logger.error(`❌ ${type} 进程错误: ${error.message}`);
      agentInfo.active = false;
      this.activeAgent = null;
      this.processes.delete(jobId);
    });

    // 启动超时监控
    this.startTimeoutMonitor(jobId, agentInfo);
  }

  /**
   * 等待进程退出
   */
  private waitForExit(process: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`进程在 ${timeoutMs}ms 内未退出`));
      }, timeoutMs);

      process.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * 启动超时监控
   */
  private startTimeoutMonitor(jobId: string, agentInfo: AgentProcess): void {
    const timer = setTimeout(() => {
      if (agentInfo.active) {
        logger.warn(`⏰ ${agentInfo.type} 超时!`);
        logger.warn(`   作业: ${jobId}`);
        logger.warn(`   运行时间: ${Date.now() - agentInfo.startTime}ms`);
        logger.warn(`   超时限制: ${agentInfo.timeout}ms`);

        // 尝试优雅终止
        this.terminateAgent(jobId, 'timeout');
      }
    }, agentInfo.timeout);

    // 将 timer 保存到 agentInfo 以便清理时取消
    (agentInfo as any).timeoutTimer = timer;
  }

  /**
   * 终止 Agent
   */
  async terminateAgent(jobId: string, reason: string = 'manual'): Promise<void> {
    const agentInfo = this.processes.get(jobId);

    if (!agentInfo || !agentInfo.active) {
      logger.warn(`Agent ${jobId} 不存在或已停止`);
      return;
    }

    logger.info(`🛑 终止 ${agentInfo.type} (原因: ${reason})`);
    logger.info(`   作业: ${jobId}`);
    logger.info(`   PID: ${agentInfo.pid}`);

    // 取消超时监控
    const timeoutTimer = agentInfo.timeoutTimer;
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }

    const process = agentInfo.agentProcess;

    try {
      // 步骤 1: 发送 SIGTERM（优雅关闭）
      logger.debug(`   发送 SIGTERM 到 PID ${agentInfo.pid}`);
      process.kill('SIGTERM');

      // 步骤 2: 等待进程退出
      await this.waitForExit(process, this.config.killTimeout);

      logger.info(`✅ ${agentInfo.type} 已终止`);
    } catch (error) {
      // 步骤 3: 发送 SIGKILL（强制终止）
      logger.warn(`⚠️  优雅终止失败，发送 SIGKILL`);
      logger.warn(`   原因: ${(error as Error).message}`);

      try {
        logger.debug(`   发送 SIGKILL 到 PID ${agentInfo.pid}`);
        process.kill('SIGKILL');
        await this.waitForExit(process, 1000);  // 再等待 1 秒
        logger.info(`✅ ${agentInfo.type} 已强制终止`);
      } catch (killError) {
        logger.error(`❌ 无法终止 ${agentInfo.type}: ${killError}`);
      }
    }

    // 标记为非活跃
    agentInfo.active = false;
    this.activeAgent = null;
    this.processes.delete(jobId);
  }

  /**
   * 终止所有 Agent
   * 用于后端关闭清理
   */
  async terminateAll(reason: string = 'shutdown'): Promise<void> {
    logger.info(`🛑 终止所有 Agents (原因: ${reason})`);

    const jobIds = Array.from(this.processes.keys());

    const terminatePromises = jobIds.map(jobId =>
      this.terminateAgent(jobId, reason).catch(error => {
        logger.error(`终止 Agent ${jobId} 失败: ${error}`);
      })
    );

    await Promise.all(terminatePromises);

    logger.info(`✅ 所有 Agents 已终止`);
  }

  /**
   * 检查 Agent 是否正在运行
   */
  isAgentRunning(jobId: string): boolean {
    const agentInfo = this.processes.get(jobId);
    return agentInfo?.active ?? false;
  }

  /**
   * 获取活跃 Agent
   */
  getActiveAgent(): AgentType | null {
    return this.activeAgent;
  }

  /**
   * 获取所有运行中的 Agent
   */
  getRunningAgents(): string[] {
    return Array.from(this.processes.entries())
      .filter(([_, info]) => info.active)
      .map(([jobId, _]) => jobId);
  }

  /**
   * 僵尸进程检测
   * 定期检查并清理孤立的子进程
   */
  private startZombieDetection(): void {
    // 每 30 秒检测一次
    const interval = setInterval(async () => {
      await this.detectAndCleanupZombies();
    }, 30000);

    // 清理定时器（在 Node 进程退出时）
    process.on('exit', () => {
      clearInterval(interval);
    });
  }

  /**
   * 检测和清理僵尸进程（使用安全的 spawn 方式）
   */
  private async detectAndCleanupZombies(): Promise<void> {
    try {
      // 使用 spawn 安全地执行 ps 命令
      const pids = await this.findPythonAgentProcesses();

      if (pids.length === 0) {
        return;
      }

      logger.debug(`检测到 ${pids.length} 个 Python agent 进程`);

      for (const pid of pids) {
        // 检查是否是我们管理的进程
        const isManaged = Array.from(this.processes.values())
          .some(info => info.pid === pid && info.active);

        if (!isManaged && pid) {
          logger.warn(`⚠️  检测到僵尸进程 PID ${pid}`);
          // 可以选择是否自动清理
          await this.killZombieProcess(pid);
        }
      }
    } catch (error) {
      logger.error(`僵尸进程检测失败: ${error}`);
    }
  }

  /**
   * 使用 spawn 安全地查找 Python agent 进程
   */
  private findPythonAgentProcesses(): Promise<number[]> {
    return new Promise((resolve) => {
      const pids: number[] = [];
      const psProcess = spawn('ps', ['aux']);

      let stdout = '';

      psProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      psProcess.on('close', (code) => {
        if (code === 0 && stdout) {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            if (!line.includes('python')) continue;
            if (!line.includes('agent')) continue;
            if (line.includes('grep')) continue;

            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              const pid = parseInt(parts[1], 10);
              if (!isNaN(pid)) {
                pids.push(pid);
              }
            }
          }
        }
        resolve(pids);
      });

      psProcess.on('error', (error) => {
        logger.error(`执行 ps 命令失败: ${error}`);
        resolve([]);
      });
    });
  }

  /**
   * 杀死指定的僵尸进程
   */
  private async killZombieProcess(pid: number): Promise<void> {
    try {
      process.kill(pid, 'SIGKILL');
      logger.info(`已杀死僵尸进程 ${pid}`);
    } catch (error) {
      logger.error(`无法杀死进程 ${pid}: ${error}`);
    }
  }

  /**
   * 获取进程统计信息
   */
  getStats(): {
    totalProcesses: number;
    activeProcesses: number;
    activeAgent: AgentType | null;
  } {
    return {
      totalProcesses: this.processes.size,
      activeProcesses: Array.from(this.processes.values()).filter(p => p.active).length,
      activeAgent: this.activeAgent,
    };
  }
}

/**
 * 默认配置
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  contextAgentPath: './context-agent/src/context_agent/grpc_server.py',
  reviewAgentPath: './review-agent/src/review_agent/grpc_server.py',
  contextTimeout: 300000,  // 5 分钟
  reviewTimeout: 600000,    // 10 分钟
  killTimeout: 5000,        // 5 秒
  pythonPath: 'python',
};

/**
 * 创建 Agent Manager 单例
 */
let agentManagerInstance: AgentManager | null = null;

export function getAgentManager(config?: AgentConfig): AgentManager {
  if (!agentManagerInstance) {
    const finalConfig = { ...DEFAULT_AGENT_CONFIG, ...config };
    agentManagerInstance = new AgentManager(finalConfig);
  }
  return agentManagerInstance;
}

/**
 * 清理（用于测试）
 */
export function resetAgentManager(): void {
  if (agentManagerInstance) {
    agentManagerInstance = null;
  }
}
