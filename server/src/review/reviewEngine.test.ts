import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const prepareRepositoryWorkspaceMock = jest.fn();
const prepareRuntimeMock = jest.fn();
const collectContextMock = jest.fn();
const disposeWorkspaceMock = jest.fn();
const llmIsEnabledMock = jest.fn();
const llmChatMock = jest.fn();
const cleanupWorkspaceMock = jest.fn();

jest.mock('./reviewRuntime', () => ({
  prepareRepositoryWorkspace: (...args: unknown[]) => prepareRepositoryWorkspaceMock(...args),
}));

jest.mock('./codeContextRuntime', () => ({
  CodeContextRuntime: jest.fn().mockImplementation(() => ({
    prepare: prepareRuntimeMock,
    collectContext: collectContextMock,
    disposeWorkspace: disposeWorkspaceMock,
  })),
}));

jest.mock('./llmClient', () => ({
  ReviewLLMClient: jest.fn().mockImplementation(() => ({
    isEnabled: llmIsEnabledMock,
    chat: llmChatMock,
  })),
}));

import { AdvancedReviewEngine, type AdvancedReviewInput } from './reviewEngine';

describe('AdvancedReviewEngine', () => {
  let workspaceRoot: string;
  let worktreePath: string;

  beforeEach(() => {
    jest.clearAllMocks();

    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'advanced-review-engine-'));
    worktreePath = path.join(workspaceRoot, 'worktree');
    fs.mkdirSync(path.join(worktreePath, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(worktreePath, 'src/review.ts'),
      [
        'export const run = () => {',
        '  console.log("debug");',
        '}',
        '',
      ].join('\n'),
      'utf-8'
    );

    cleanupWorkspaceMock.mockResolvedValue(undefined);
    prepareRepositoryWorkspaceMock.mockResolvedValue({
      mirrorPath: path.join(workspaceRoot, 'mirror.git'),
      worktreePath,
      cleanup: cleanupWorkspaceMock,
    });
    prepareRuntimeMock.mockResolvedValue(true);
    collectContextMock.mockResolvedValue({
      changedSymbols: ['run'],
      relatedSnippets: ['src/review.ts:1:run'],
      impactReferences: ['src/consumer.ts:12:run()'],
      relatedTests: [],
      contextEngineAvailable: true,
    });
    llmIsEnabledMock.mockReturnValue(false);
    llmChatMock.mockResolvedValue('');
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function buildInput(overrides: Partial<AdvancedReviewInput> = {}): AdvancedReviewInput {
    return {
      jobId: 'job-1',
      platform: 'github',
      owner: 'mars',
      repo: 'lite',
      prNumber: 42,
      repositoryCloneUrl: 'https://github.com/mars/lite.git',
      accessToken: 'token',
      baseSha: 'base-sha',
      headSha: 'head-sha',
      workspaceRoot,
      prTitle: 'Improve review runtime',
      files: [
        {
          path: 'src/review.ts',
          status: 'modified',
          patch: '@@ -1,2 +1,3 @@\n export const run = () => {\n+  console.log("debug");\n }\n',
          additions: 1,
          deletions: 0,
          changes: 1,
        },
      ],
      ...overrides,
    };
  }

  it('suppresses low-value style findings and marks partial coverage when files are skipped', async () => {
    const engine = new AdvancedReviewEngine();

    const result = await engine.review(buildInput({
      files: [
        ...buildInput().files,
        {
          path: 'assets/logo.png',
          status: 'modified',
          patch: '',
          additions: 0,
          deletions: 0,
          changes: 0,
        },
      ],
    }));

    expect(result.suppressedFindings).toHaveLength(1);
    expect(result.suppressedFindings[0].finding.title).toBe('存在调试语句');
    expect(result.allFindings.some((finding) => finding.title === '存在调试语句')).toBe(false);
    expect(result.coverage.partialReview).toBe(true);
    expect(result.coverage.skippedFiles).toEqual([
      expect.objectContaining({
        path: 'assets/logo.png',
        reason: 'missing_patch',
      }),
    ]);
    expect(result.summary).toContain('partial review');
    expect(cleanupWorkspaceMock).toHaveBeenCalledTimes(1);
  });

  it('records structured trace entries in improve mode and prioritizes security findings', async () => {
    const engine = new AdvancedReviewEngine();

    const result = await engine.review(buildInput({
      reviewMode: 'improve',
      files: [
        {
          path: 'src/review.ts',
          status: 'modified',
          patch: '@@ -1,2 +1,3 @@\n export const run = () => {\n+  return eval(input);\n }\n',
          additions: 1,
          deletions: 0,
          changes: 1,
        },
      ],
    }));

    expect(result.trace).toBeDefined();
    expect(result.trace?.entries.some((entry) => entry.kind === 'stage' && entry.stage === 'workspace_prepare')).toBe(true);
    expect(result.allFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '检测到动态执行代码',
          category: 'security',
          severity: 'critical',
        }),
      ])
    );
    expect(result.nextActions).toEqual(
      expect.arrayContaining(['改为显式分支、白名单映射或安全解释器，避免执行动态字符串。'])
    );
    expect(result.metadata.reviewMode).toBe('improve');
  });
});
