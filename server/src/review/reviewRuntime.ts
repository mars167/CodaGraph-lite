import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Platform } from '../models/types';
import { formatCommandForLog, sanitizeSensitiveText } from '../utils/redactSensitive';
import type { ReviewTraceCollector } from './reviewTrace';

const execFileAsync = promisify(execFile);

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  trace?: ReviewTraceCollector;
  stage: string;
};

export interface PreparedWorkspace {
  mirrorPath: string;
  worktreePath: string;
  cleanup(): Promise<void>;
}

export interface PrepareWorkspaceParams {
  workspaceRoot: string;
  platform: Platform;
  owner: string;
  repo: string;
  prNumber: number;
  jobId: string;
  repositoryCloneUrl: string;
  accessToken: string;
  baseSha: string;
  headSha: string;
  gitTimeoutMs: number;
  trace?: ReviewTraceCollector;
}

function ownerSegments(owner: string): string[] {
  return owner.split('/').filter(Boolean);
}

function resolveGitUsername(platform: Platform): string {
  return platform === 'github' ? 'x-access-token' : 'oauth2';
}

async function createAskPassBundle(platform: Platform, accessToken: string): Promise<{
  env: NodeJS.ProcessEnv;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codagraph-git-auth-'));
  const scriptPath = path.join(tempDir, 'git-askpass.sh');
  const script = [
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf "%s\\n" "$CODAGRAPH_GIT_USERNAME" ;;',
    '  *Password*) printf "%s\\n" "$CODAGRAPH_GIT_PASSWORD" ;;',
    '  *) printf "\\n" ;;',
    'esac',
  ].join('\n');

  await fs.writeFile(scriptPath, script, { encoding: 'utf-8', mode: 0o700 });
  await fs.chmod(scriptPath, 0o700);

  return {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: scriptPath,
      CODAGRAPH_GIT_USERNAME: resolveGitUsername(platform),
      CODAGRAPH_GIT_PASSWORD: accessToken,
    },
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions
): Promise<{ stdout: string; stderr: string }> {
  const startedAt = Date.now();
  const rendered = formatCommandForLog(command, args);

  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    options.trace?.tool(
      options.stage,
      command,
      rendered,
      sanitizeSensitiveText(result.stderr || result.stdout || 'ok'),
      'success',
      Date.now() - startedAt
    );

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const detail = error as Error & { stderr?: string; stdout?: string; killed?: boolean; signal?: string };
    const timedOut = detail.killed || detail.signal === 'SIGTERM';

    options.trace?.tool(
      options.stage,
      command,
      rendered,
      sanitizeSensitiveText(detail.stderr || detail.stdout || detail.message),
      timedOut ? 'timeout' : 'failed',
      Date.now() - startedAt
    );

    throw new Error(
      `Command failed: ${rendered}${detail.stderr || detail.message ? `\n${sanitizeSensitiveText(detail.stderr || detail.message)}` : ''}`
    );
  }
}

async function mirrorExists(mirrorPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(mirrorPath, 'HEAD'));
    return true;
  } catch {
    return false;
  }
}

export async function prepareRepositoryWorkspace(
  params: PrepareWorkspaceParams
): Promise<PreparedWorkspace> {
  const mirrorPath = path.join(
    params.workspaceRoot,
    '.review-mirrors',
    params.platform,
    ...ownerSegments(params.owner),
    `${params.repo}.git`
  );
  const worktreePath = path.join(
    params.workspaceRoot,
    '.review-worktrees',
    params.platform,
    ...ownerSegments(params.owner),
    params.repo,
    String(params.prNumber),
    params.jobId
  );

  await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  const auth = await createAskPassBundle(params.platform, params.accessToken);

  try {
    if (!(await mirrorExists(mirrorPath))) {
      await runCommand(
        'git',
        ['clone', '--mirror', params.repositoryCloneUrl, mirrorPath],
        {
          env: auth.env,
          timeoutMs: params.gitTimeoutMs,
          trace: params.trace,
          stage: 'workspace_prepare',
        }
      );
    } else {
      await runCommand(
        'git',
        ['--git-dir', mirrorPath, 'remote', 'set-url', 'origin', params.repositoryCloneUrl],
        {
          env: auth.env,
          timeoutMs: params.gitTimeoutMs,
          trace: params.trace,
          stage: 'workspace_prepare',
        }
      );
    }

    await runCommand(
      'git',
      ['--git-dir', mirrorPath, 'fetch', '--prune', '--no-tags', '--depth', '100', 'origin', params.baseSha, params.headSha],
      {
        env: auth.env,
        timeoutMs: params.gitTimeoutMs,
        trace: params.trace,
        stage: 'workspace_prepare',
      }
    );

    await fs.rm(worktreePath, { recursive: true, force: true });
    await runCommand(
      'git',
      ['--git-dir', mirrorPath, 'worktree', 'prune'],
      {
        env: auth.env,
        timeoutMs: params.gitTimeoutMs,
        trace: params.trace,
        stage: 'workspace_prepare',
      }
    );
    await runCommand(
      'git',
      ['--git-dir', mirrorPath, 'worktree', 'add', '--force', '--detach', worktreePath, params.headSha],
      {
        env: auth.env,
        timeoutMs: params.gitTimeoutMs,
        trace: params.trace,
        stage: 'workspace_prepare',
      }
    );
  } finally {
    await auth.cleanup();
  }

  return {
    mirrorPath,
    worktreePath,
    cleanup: async () => {
      try {
        await runCommand(
          'git',
          ['--git-dir', mirrorPath, 'worktree', 'remove', '--force', worktreePath],
          {
            timeoutMs: params.gitTimeoutMs,
            trace: params.trace,
            stage: 'cleanup',
          }
        );
      } catch {
        await fs.rm(worktreePath, { recursive: true, force: true });
      }

      try {
        await runCommand(
          'git',
          ['--git-dir', mirrorPath, 'worktree', 'prune'],
          {
            timeoutMs: params.gitTimeoutMs,
            trace: params.trace,
            stage: 'cleanup',
          }
        );
      } catch {
        // Ignore prune failures after the workspace has already been removed.
      }
    },
  };
}
