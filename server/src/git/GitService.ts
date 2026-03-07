/**
 * Git 操作服务
 * 用于代码审查管道中的仓库操作
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface GitCloneOptions {
  depth?: number;
  singleBranch?: boolean;
  branch?: string;
  token?: string;
}

export interface GitDiffOptions {
  filePath: string;
  oldPath?: string;
}

/**
 * Git 操作服务类
 */
export class GitService {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * 克隆仓库
   */
  async cloneRepository(
    platform: string,
    owner: string,
    repo: string,
    branch: string,
    token: string,
    workspacePath: string
  ): Promise<void> {
    logger.info(`克隆仓库: ${owner}/${repo}#${branch}`);

    // 构造克隆 URL
    const cloneUrl = this.getCloneUrl(platform, owner, repo, token);
    logger.debug(`克隆 URL: ${cloneUrl}`);

    try {
      // 创建目录
      await fs.mkdir(workspacePath, { recursive: true });

      // 克隆命令
      const args = ['clone'];

      if (platform === 'github') {
        args.push('--depth', '1');
      args.push('--single-branch');
        args.push('--branch', branch);
      }

      args.push(cloneUrl);
      args.push(workspacePath);

      await this.executeGitCommand(args, 'clone');

      logger.info('仓库克隆成功');
    } catch (error) {
      logger.error(`克隆失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取克隆 URL（带 token）
   */
  private getCloneUrl(
    platform: string,
    owner: string,
    repo: string,
    token: string
  ): string {
    switch (platform) {
      case 'github':
        return `https://oauth2:${token}@github.com/${owner}/${repo}.git`;
      case 'gitee':
        return `https://oauth2:${token}@gitee.com/${owner}/${repo}.git`;
      case 'gitlab':
        return `https://oauth2:${token}@gitlab.com/${owner}/${repo}.git`;
      default:
        throw new Error(`不支持的平合: ${platform}`);
    }
  }

  /**
   * 执行 git 命令
   */
  private async executeGitCommand(
    args: string[],
    operation: string,
    cwd?: string,
    env?: NodeJS.ProcessEnv
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess: ChildProcess = spawn('git', args, {
        cwd: cwd || this.workspaceRoot,
        env: {
          ...process.env,
          ...env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`git ${operation} failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * 获取文件差异
   */
  async getFileDiff(
    filePath: string,
    baseBranch?: string
  ): Promise<string> {
    const args = ['diff', baseBranch || 'HEAD', '--', filePath];
    return await this.executeGitCommand(args, 'diff');
  }

  /**
   * 清理工作区
   */
  async cleanupWorkspace(workspacePath: string): Promise<void> {
    logger.info(`清理工作区: ${workspacePath}`);

    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
      logger.info('工作区清理成功');
    } catch (error) {
      logger.warn(`清理失败: ${error}`);
    }
  }
}

/**
 * Git 服务单例
 */
let gitServiceInstance: GitService | null = null;

export function getGitService(
  workspaceRoot?: string
): GitService {
  if (!gitServiceInstance) {
    gitServiceInstance = new GitService(workspaceRoot || process.env.WORKSPACE_ROOT || '/tmp/repos');
  }
  return gitServiceInstance;
}
