/**
 * Agent Process Service
 *
 * 整合 Python agent 子进程管理和 gRPC 客户端通信
 * 实现 2u2g 关键要求：
 * - Agent 作为临时子进程启动，而非守护进程
 * - 严格超时控制（context: 5min, review: 10min）
 * - SIGTERM/SIGKILL 强制终止
 * - 内存限制执行（300MB）
 * - 作业完成后立即终止
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import { logger } from '../utils/logger';
import { getResourceAllocator, AgentType, RESOURCE_CONFIG } from '../config/resource';
import {
  ContextAgentClient,
  type ContextRequestParams,
  type ContextResponse,
} from './ContextAgentClient';
import {
  ReviewAgentClient,
  type ReviewRequestParams,
  type ReviewResult,
} from './ReviewAgentClient';

/**
 * Agent 进程状态
 */
export enum AgentProcessStatus {
  IDLE = 'idle',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
}

/**
 * Agent 进程信息
 */
interface AgentProcessInfo {
  process: ChildProcess | null;
  status: AgentProcessStatus;
  type: AgentType;
  jobId: string;
  startTime: number;
  pid: number | null;
  port: number;
  memoryLimitMB: number;
  timeoutMs: number;
  timeoutTimer: NodeJS.Timeout | null;
  killTimer: NodeJS.Timeout | null;
}

/**
 * Agent Process Service 配置
 */
export interface AgentProcessConfig {
  contextAgentPath: string;
  reviewAgentPath: string;
  contextAgentPort: number;
  reviewAgentPort: number;
  contextTimeout: number;
  reviewTimeout: number;
  killTimeout: number;
  pythonPath: string;
  pythonMemoryLimit: number; // MB
  workspaceRoot: string;
  gitAiPath: string;
}

/**
 * 默认配置（基于 2u2g 优化）
 */
export const DEFAULT_AGENT_PROCESS_CONFIG: AgentProcessConfig = {
  contextAgentPath: process.env.CONTEXT_AGENT_PATH || './context-agent/src/context_agent/grpc_server.py',
  reviewAgentPath: process.env.REVIEW_AGENT_PATH || './review-agent/src/review_agent/grpc_server.py',
  contextAgentPort: parseInt(process.env.CONTEXT_AGENT_PORT || '50052', 10),
  reviewAgentPort: parseInt(process.env.REVIEW_AGENT_PORT || '50051', 10),
  contextTimeout: parseInt(process.env.AGENT_TIMEOUT_CONTEXT || '300000', 10), // 5 minutes
  reviewTimeout: parseInt(process.env.AGENT_TIMEOUT_REVIEW || '600000', 10),   // 10 minutes
  killTimeout: parseInt(process.env.AGENT_KILL_TIMEOUT || '5000', 10),         // 5 seconds
  pythonPath: process.env.PYTHON_PATH || 'python3',
  pythonMemoryLimit: parseInt(process.env.PYTHON_MEMORY_LIMIT || '300', 10),
  workspaceRoot: process.env.WORKSPACE_ROOT || '/tmp/repos',
  gitAiPath: process.env.GIT_AI_BIN || '/usr/local/bin/git-ai',
};

/**
 * Agent Process Service
 *
 * 管理 Python agent 子进程的完整生命周期，整合 gRPC 客户端通信
 */
export class AgentProcessService {
  private config: AgentProcessConfig;
  private resourceAllocator = getResourceAllocator();
  private activeProcess: AgentProcessInfo | null = null;
  private contextClient: ContextAgentClient | null = null;
  private reviewClient: ReviewAgentClient | null = null;

  constructor(config: Partial<AgentProcessConfig> = {}) {
    this.config = { ...DEFAULT_AGENT_PROCESS_CONFIG, ...config };
    this.validateConfig();
    this.setupShutdownHandlers();

    logger.info('Agent Process Service initialized');
    logger.info(`  Context Agent: ${this.config.contextAgentPath}:${this.config.contextAgentPort}`);
    logger.info(`  Review Agent: ${this.config.reviewAgentPath}:${this.config.reviewAgentPort}`);
    logger.info(`  Context timeout: ${this.config.contextTimeout}ms`);
    logger.info(`  Review timeout: ${this.config.reviewTimeout}ms`);
    logger.info(`  Python memory limit: ${this.config.pythonMemoryLimit}MB`);
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (this.config.contextTimeout < 60000) {
      logger.warn('Context Agent timeout too short, recommend at least 60000ms');
    }
    if (this.config.reviewTimeout < 120000) {
      logger.warn('Review Agent timeout too short, recommend at least 120000ms');
    }
    if (this.config.killTimeout < 1000) {
      logger.warn('Kill timeout too short, recommend at least 1000ms');
    }
  }

  /**
   * 设置关闭处理器
   */
  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      logger.info('Shutting down Agent Process Service...');
      await this.terminateActiveProcess('shutdown');
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('beforeExit', shutdown);
  }

  /**
   * 启动 Context Agent 并执行上下文收集
   * 完成后自动终止进程
   */
  async runContextAgent(
    jobId: string,
    params: ContextRequestParams
  ): Promise<ContextResponse> {
    // 检查资源可用性
    if (!this.resourceAllocator.canStartAgent(AgentType.CONTEXT)) {
      throw new Error('Insufficient resources to start Context Agent');
    }

    // 启动进程
    await this.startAgent(AgentType.CONTEXT, jobId);

    try {
      // 创建 gRPC 客户端
      this.contextClient = new ContextAgentClient(
        'localhost',
        this.config.contextAgentPort,
        this.config.contextTimeout
      );

      await this.contextClient.connect();

      // 执行上下文收集
      const response = await this.contextClient.collectContext(params);

      return response;
    } finally {
      // 确保进程终止
      await this.terminateActiveProcess('completed');
      this.contextClient?.close();
      this.contextClient = null;
    }
  }

  /**
   * 启动 Review Agent 并执行代码审查
   * 完成后自动终止进程
   */
  async runReviewAgent(
    jobId: string,
    params: ReviewRequestParams
  ): Promise<ReviewResult> {
    // 检查资源可用性
    if (!this.resourceAllocator.canStartAgent(AgentType.REVIEW)) {
      throw new Error('Insufficient resources to start Review Agent');
    }

    // 启动进程
    await this.startAgent(AgentType.REVIEW, jobId);

    try {
      // 创建 gRPC 客户端
      this.reviewClient = new ReviewAgentClient(
        'localhost',
        this.config.reviewAgentPort,
        this.config.reviewTimeout
      );

      await this.reviewClient.connect();

      // 执行代码审查
      const result = await this.reviewClient.reviewCode(params);

      return result;
    } finally {
      // 确保进程终止
      await this.terminateActiveProcess('completed');
      this.reviewClient?.close();
      this.reviewClient = null;
    }
  }

  /**
   * 启动 Agent 子进程
   */
  private async startAgent(type: AgentType, jobId: string): Promise<void> {
    // 检查是否已有进程在运行
    if (this.activeProcess && this.activeProcess.status === AgentProcessStatus.RUNNING) {
      throw new Error(
        `Cannot start ${type}: ${this.activeProcess.type} already running (job: ${this.activeProcess.jobId})`
      );
    }

    const agentPath = type === AgentType.CONTEXT
      ? this.config.contextAgentPath
      : this.config.reviewAgentPath;

    const port = type === AgentType.CONTEXT
      ? this.config.contextAgentPort
      : this.config.reviewAgentPort;

    const timeout = type === AgentType.CONTEXT
      ? this.config.contextTimeout
      : this.config.reviewTimeout;

    logger.info(`Starting ${type} (job: ${jobId})`);
    logger.info(`  Path: ${agentPath}`);
    logger.info(`  Port: ${port}`);
    logger.info(`  Timeout: ${timeout}ms`);
    logger.info(`  Memory limit: ${this.config.pythonMemoryLimit}MB`);

    // 保留资源
    this.resourceAllocator.reserveResources(type, jobId);

    // 创建进程信息
    const processInfo: AgentProcessInfo = {
      process: null,
      status: AgentProcessStatus.STARTING,
      type,
      jobId,
      startTime: Date.now(),
      pid: null,
      port,
      memoryLimitMB: this.config.pythonMemoryLimit,
      timeoutMs: timeout,
      timeoutTimer: null,
      killTimer: null,
    };

    this.activeProcess = processInfo;

    try {
      // 启动 Python 子进程
      const childProcess = this.spawnPythonProcess(agentPath, port, processInfo);
      processInfo.process = childProcess;
      processInfo.pid = childProcess.pid || null;

      // 等待进程就绪
      await this.waitForAgentReady(port, 30000); // 30秒启动超时

      processInfo.status = AgentProcessStatus.RUNNING;

      // 启动超时监控
      this.startTimeoutMonitor(processInfo);

      logger.info(`${type} started (PID: ${processInfo.pid})`);

    } catch (error) {
      processInfo.status = AgentProcessStatus.ERROR;
      this.resourceAllocator.releaseResources(type);
      this.activeProcess = null;

      throw new Error(`Failed to start ${type}: ${(error as Error).message}`);
    }
  }

  /**
   * 启动 Python 子进程
   */
  private spawnPythonProcess(
    agentPath: string,
    port: number,
    processInfo: AgentProcessInfo
  ): ChildProcess {
    // 构造环境变量
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHON_MEMORY_LIMIT: `${this.config.pythonMemoryLimit}m`,
      // 根据类型设置端口
      CONTEXT_AGENT_PORT: this.config.contextAgentPort.toString(),
      REVIEW_AGENT_PORT: this.config.reviewAgentPort.toString(),
    };

    // 启动进程（不使用 shell）
    const childProcess = spawn(
      this.config.pythonPath,
      [agentPath],
      {
        env,
        cwd: path.dirname(agentPath),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false, // 确保子进程随父进程终止
        shell: false,    // 安全：不使用 shell
      }
    );

    // 捕获输出
    childProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        logger.debug(`[${processInfo.type} stdout] ${output}`);
      }
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        logger.error(`[${processInfo.type} stderr] ${output}`);
      }
    });

    // 处理进程退出
    childProcess.on('exit', (code, signal) => {
      this.handleProcessExit(processInfo, code, signal);
    });

    childProcess.on('error', (error) => {
      this.handleProcessError(processInfo, error);
    });

    return childProcess;
  }

  /**
   * 等待 Agent 就绪（使用 TCP 连接检查）
   */
  private async waitForAgentReady(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500; // 500ms

    while (Date.now() - startTime < timeoutMs) {
      try {
        const ready = await this.checkPortOpen(port, 1000);
        if (ready) {
          return;
        }
      } catch (error) {
        // 忽略连接错误，继续等待
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error(`Agent not ready within ${timeoutMs}ms`);
  }

  /**
   * 检查端口是否打开
   */
  private checkPortOpen(port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, 'localhost');
    });
  }

  /**
   * 启动超时监控
   */
  private startTimeoutMonitor(processInfo: AgentProcessInfo): void {
    processInfo.timeoutTimer = setTimeout(() => {
      if (this.activeProcess === processInfo &&
          processInfo.status === AgentProcessStatus.RUNNING) {
        logger.warn(`${processInfo.type} timeout (${processInfo.timeoutMs}ms)`);
        logger.warn(`  Job: ${processInfo.jobId}`);
        logger.warn(`  PID: ${processInfo.pid}`);

        this.terminateActiveProcess('timeout');
      }
    }, processInfo.timeoutMs);
  }

  /**
   * 处理进程退出
   */
  private handleProcessExit(
    processInfo: AgentProcessInfo,
    code: number | null,
    signal: string | null
  ): void {
    const duration = Date.now() - processInfo.startTime;

    logger.info(`${processInfo.type} process exited`);
    logger.info(`  PID: ${processInfo.pid}`);
    logger.info(`  Exit code: ${code}`);
    logger.info(`  Signal: ${signal}`);
    logger.info(`  Duration: ${duration}ms`);

    // 清理定时器
    this.clearProcessTimers(processInfo);

    // 更新状态
    if (processInfo.status !== AgentProcessStatus.STOPPING) {
      processInfo.status = code === 0 ? AgentProcessStatus.STOPPED : AgentProcessStatus.ERROR;
    }

    // 释放资源
    this.resourceAllocator.releaseResources(processInfo.type);

    // 清理引用
    if (this.activeProcess === processInfo) {
      this.activeProcess = null;
    }
  }

  /**
   * 处理进程错误
   */
  private handleProcessError(processInfo: AgentProcessInfo, error: Error): void {
    logger.error(`${processInfo.type} process error: ${error.message}`);

    processInfo.status = AgentProcessStatus.ERROR;

    this.clearProcessTimers(processInfo);
    this.resourceAllocator.releaseResources(processInfo.type);

    if (this.activeProcess === processInfo) {
      this.activeProcess = null;
    }
  }

  /**
   * 清理进程定时器
   */
  private clearProcessTimers(processInfo: AgentProcessInfo): void {
    if (processInfo.timeoutTimer) {
      clearTimeout(processInfo.timeoutTimer);
      processInfo.timeoutTimer = null;
    }
    if (processInfo.killTimer) {
      clearTimeout(processInfo.killTimer);
      processInfo.killTimer = null;
    }
  }

  /**
   * 终止活跃进程
   */
  async terminateActiveProcess(reason: string = 'manual'): Promise<void> {
    if (!this.activeProcess) {
      return;
    }

    const processInfo = this.activeProcess;

    if (processInfo.status === AgentProcessStatus.STOPPED ||
        processInfo.status === AgentProcessStatus.STOPPING) {
      return;
    }

    logger.info(`Terminating ${processInfo.type} (reason: ${reason})`);
    logger.info(`  PID: ${processInfo.pid}`);
    logger.info(`  Job: ${processInfo.jobId}`);

    processInfo.status = AgentProcessStatus.STOPPING;

    // 清理定时器
    this.clearProcessTimers(processInfo);

    const childProcess = processInfo.process;
    if (!childProcess || !processInfo.pid) {
      this.activeProcess = null;
      return;
    }

    try {
      // 步骤 1: 发送 SIGTERM（优雅关闭）
      logger.debug(`  Sending SIGTERM to PID ${processInfo.pid}`);
      childProcess.kill('SIGTERM');

      // 步骤 2: 等待进程退出
      await this.waitForProcessExit(processInfo, this.config.killTimeout);

      logger.info(`${processInfo.type} terminated gracefully`);

    } catch (error) {
      // 步骤 3: 发送 SIGKILL（强制终止）
      logger.warn(`Graceful termination failed, sending SIGKILL`);

      try {
        childProcess.kill('SIGKILL');
        await this.waitForProcessExit(processInfo, 1000);
        logger.info(`${processInfo.type} force-killed`);
      } catch (killError) {
        logger.error(`Failed to terminate process: ${killError}`);
      }
    }

    processInfo.status = AgentProcessStatus.STOPPED;
    this.activeProcess = null;
  }

  /**
   * 等待进程退出
   */
  private waitForProcessExit(
    processInfo: AgentProcessInfo,
    timeoutMs: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Process did not exit within ${timeoutMs}ms`));
      }, timeoutMs);

      processInfo.process?.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * 获取进程状态
   */
  getStatus(): {
    hasActiveProcess: boolean;
    processType: AgentType | null;
    processStatus: AgentProcessStatus;
    jobId: string | null;
    pid: number | null;
    uptime: number;
  } {
    if (!this.activeProcess) {
      return {
        hasActiveProcess: false,
        processType: null,
        processStatus: AgentProcessStatus.IDLE,
        jobId: null,
        pid: null,
        uptime: 0,
      };
    }

    return {
      hasActiveProcess: true,
      processType: this.activeProcess.type,
      processStatus: this.activeProcess.status,
      jobId: this.activeProcess.jobId,
      pid: this.activeProcess.pid,
      uptime: Date.now() - this.activeProcess.startTime,
    };
  }

  /**
   * 检查 Agent 是否正在运行
   */
  isAgentRunning(type?: AgentType): boolean {
    if (!this.activeProcess) {
      return false;
    }
    if (type && this.activeProcess.type !== type) {
      return false;
    }
    return this.activeProcess.status === AgentProcessStatus.RUNNING;
  }

  /**
   * 清理僵尸进程（使用安全的 spawn 方式）
   */
  async cleanupZombieProcesses(): Promise<void> {
    logger.debug('Checking for zombie processes...');

    const pids = await this.findPythonAgentProcesses();

    for (const pid of pids) {
      // 检查是否是我们管理的进程
      if (this.activeProcess && this.activeProcess.pid === pid) {
        continue; // 这是我们管理的进程，跳过
      }

      // 杀死僵尸进程
      logger.warn(`Zombie process found PID ${pid}, cleaning up...`);
      try {
        process.kill(pid, 'SIGKILL');
        logger.info(`Cleaned up zombie process ${pid}`);
      } catch (error) {
        logger.error(`Failed to clean up process ${pid}: ${error}`);
      }
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
        logger.error(`Failed to execute ps command: ${error}`);
        resolve([]);
      });
    });
  }
}

/**
 * 单例实例
 */
let agentProcessServiceInstance: AgentProcessService | null = null;

/**
 * 获取 Agent Process Service 实例
 */
export function getAgentProcessService(
  config?: Partial<AgentProcessConfig>
): AgentProcessService {
  if (!agentProcessServiceInstance) {
    agentProcessServiceInstance = new AgentProcessService(config);
  }
  return agentProcessServiceInstance;
}

/**
 * 重置实例（用于测试）
 */
export function resetAgentProcessService(): void {
  if (agentProcessServiceInstance) {
    agentProcessServiceInstance.terminateActiveProcess('reset');
    agentProcessServiceInstance = null;
  }
}