import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { prepareRepositoryWorkspace } from './reviewRuntime';

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'CodaGraph',
      GIT_AUTHOR_EMAIL: 'codagraph@example.com',
      GIT_COMMITTER_NAME: 'CodaGraph',
      GIT_COMMITTER_EMAIL: 'codagraph@example.com',
    },
  }).trim();
}

describe('prepareRepositoryWorkspace', () => {
  let tempRoot: string;
  let originPath: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'review-runtime-'));
    originPath = path.join(tempRoot, 'origin');
    workspaceRoot = path.join(tempRoot, 'workspace');

    fs.mkdirSync(originPath, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });

    runGit(['init', '--initial-branch=main'], originPath);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function commitFile(relativePath: string, content: string, message: string): string {
    const absolutePath = path.join(originPath, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf-8');
    runGit(['add', relativePath], originPath);
    runGit(['commit', '-m', message], originPath);
    return runGit(['rev-parse', 'HEAD'], originPath);
  }

  it('creates a mirror/worktree and cleanup is idempotent', async () => {
    const baseSha = commitFile('src/app.ts', 'export const version = 1;\n', 'base');
    const headSha = commitFile('src/app.ts', 'export const version = 2;\n', 'head');

    const prepared = await prepareRepositoryWorkspace({
      workspaceRoot,
      platform: 'github',
      owner: 'mars',
      repo: 'lite',
      prNumber: 6,
      jobId: 'job-1',
      repositoryCloneUrl: originPath,
      accessToken: 'token',
      baseSha,
      headSha,
      gitTimeoutMs: 5000,
    });

    expect(fs.existsSync(path.join(prepared.mirrorPath, 'HEAD'))).toBe(true);
    expect(fs.readFileSync(path.join(prepared.worktreePath, 'src/app.ts'), 'utf-8')).toContain('version = 2');

    await prepared.cleanup();
    await prepared.cleanup();

    expect(fs.existsSync(prepared.worktreePath)).toBe(false);
    expect(fs.existsSync(path.join(prepared.mirrorPath, 'HEAD'))).toBe(true);
  });

  it('reuses the mirror and fetches later commits into a fresh worktree', async () => {
    const baseSha = commitFile('src/app.ts', 'export const version = 1;\n', 'base');
    const firstHeadSha = commitFile('src/app.ts', 'export const version = 2;\n', 'head-1');

    const first = await prepareRepositoryWorkspace({
      workspaceRoot,
      platform: 'github',
      owner: 'mars/team',
      repo: 'lite',
      prNumber: 6,
      jobId: 'job-1',
      repositoryCloneUrl: originPath,
      accessToken: 'token',
      baseSha,
      headSha: firstHeadSha,
      gitTimeoutMs: 5000,
    });

    const mirrorPath = first.mirrorPath;
    await first.cleanup();

    const secondHeadSha = commitFile('src/app.ts', 'export const version = 3;\n', 'head-2');

    const second = await prepareRepositoryWorkspace({
      workspaceRoot,
      platform: 'github',
      owner: 'mars/team',
      repo: 'lite',
      prNumber: 6,
      jobId: 'job-2',
      repositoryCloneUrl: originPath,
      accessToken: 'token',
      baseSha,
      headSha: secondHeadSha,
      gitTimeoutMs: 5000,
    });

    expect(second.mirrorPath).toBe(mirrorPath);
    expect(fs.readFileSync(path.join(second.worktreePath, 'src/app.ts'), 'utf-8')).toContain('version = 3');

    await second.cleanup();
  });
});
