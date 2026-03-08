import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeContextRuntime } from './codeContextRuntime';

describe('CodeContextRuntime', () => {
  let runtimeRoot: string;

  beforeEach(() => {
    runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'code-context-runtime-'));
    const entryPath = path.join(runtimeRoot, 'dist/src/index.js');
    fs.mkdirSync(path.dirname(entryPath), { recursive: true });
    fs.writeFileSync(
      entryPath,
      `
module.exports = {
  createCodeContextEngine({ repoRoot }) {
    return {
      repoRoot,
      tasks: {
        async implementationContext() {
          return { task: 'implementation_context', summary: '', sections: [] };
        },
        async findImpact() {
          return { task: 'find_impact', summary: '', sections: [] };
        },
        async reviewContextForDiff() {
          return { bundle: { task: 'review_pr', summary: '', evidence: [] } };
        }
      }
    };
  }
};
      `.trim(),
      'utf-8'
    );

    process.env.CODE_CONTEXT_ENGINE_ROOT = runtimeRoot;
  });

  afterEach(() => {
    delete process.env.CODE_CONTEXT_ENGINE_ROOT;
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });

  it('evicts cached engines after a workspace is disposed', async () => {
    const runtime = new CodeContextRuntime();

    await runtime.prepare('/tmp/workspace-a');
    await runtime.prepare('/tmp/workspace-b');

    const cache = (runtime as any).engineCache as Map<string, unknown>;
    expect(cache.size).toBe(2);

    runtime.disposeWorkspace('/tmp/workspace-a');

    expect(cache.size).toBe(1);
    expect(cache.has('/tmp/workspace-a')).toBe(false);
    expect(cache.has('/tmp/workspace-b')).toBe(true);
  });
});
