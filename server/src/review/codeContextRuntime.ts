import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);
const MAX_CONTEXT_ITEMS = 5;

interface RuntimeSearchMatch {
  path: string;
  preview: string;
  symbol?: string;
  range: {
    start: {
      line: number;
      column: number;
    };
  };
}

interface RuntimeContextSection {
  title: string;
  evidence: RuntimeSearchMatch[];
}

interface RuntimeContextBundle {
  task: string;
  summary: string;
  sections: RuntimeContextSection[];
  diagnostics?: string[];
}

interface RuntimeEvidenceBundle {
  task: string;
  summary: string;
  evidence: RuntimeSearchMatch[];
  related_paths?: string[];
  diagnostics?: string[];
}

interface RuntimeTaskResult {
  bundle?: RuntimeContextBundle | RuntimeEvidenceBundle;
  diagnostics?: string[];
}

interface RuntimeEngine {
  tasks: {
    implementationContext(request: {
      task: string;
      query?: string;
      pathHints?: string[];
      symbolHints?: string[];
    }): Promise<RuntimeContextBundle>;
    findImpact(request: {
      task: string;
      query?: string;
      pathHints?: string[];
      symbolHints?: string[];
    }): Promise<RuntimeContextBundle>;
    reviewContextForDiff(request: {
      task: string;
      query?: string;
      pathHints?: string[];
      symbolHints?: string[];
      diffText: string;
    }): Promise<RuntimeTaskResult>;
  };
}

interface RuntimeModule {
  createCodeContextEngine(options: { repoRoot: string }): RuntimeEngine;
}

export interface CodeContextSemanticContext {
  relatedSnippets: string[];
  impactReferences: string[];
  relatedTests: string[];
  contextEngineAvailable: boolean;
}

function truncate(value: string, maxLength = 220): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean))).slice(0, MAX_CONTEXT_ITEMS);
}

function isTestPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return normalized.includes('test') || normalized.includes('spec') || normalized.includes('__tests__');
}

function formatMatch(match: RuntimeSearchMatch): string {
  const symbol = match.symbol ? ` [${match.symbol}]` : '';
  return truncate(`${match.path}:${match.range.start.line}${symbol} ${match.preview}`.trim());
}

function toEvidenceList(bundle?: RuntimeContextBundle | RuntimeEvidenceBundle): RuntimeSearchMatch[] {
  if (!bundle) {
    return [];
  }

  if ('evidence' in bundle) {
    return bundle.evidence ?? [];
  }

  return bundle.sections.flatMap((section) => section.evidence ?? []);
}

function findSectionEvidence(
  bundle: RuntimeContextBundle | undefined,
  titles: string[]
): RuntimeSearchMatch[] {
  if (!bundle) {
    return [];
  }

  const lookup = new Set(titles.map((title) => title.toLowerCase()));
  return bundle.sections
    .filter((section) => lookup.has(section.title.toLowerCase()))
    .flatMap((section) => section.evidence ?? []);
}

function resolveCodeContextEngineRoot(): string {
  return process.env.CODE_CONTEXT_ENGINE_ROOT
    ? path.resolve(process.env.CODE_CONTEXT_ENGINE_ROOT)
    : path.resolve(__dirname, '../../../../CodeContextEngine');
}

export class CodeContextRuntime {
  private readonly engineRoot = resolveCodeContextEngineRoot();
  private readonly engineEntry = path.join(this.engineRoot, 'dist/src/index.js');
  private readonly engineCache = new Map<string, RuntimeEngine>();
  private modulePromise: Promise<RuntimeModule> | null = null;
  private buildPromise: Promise<void> | null = null;

  async prepare(workspacePath: string): Promise<boolean> {
    try {
      await this.getEngine(workspacePath);
      return true;
    } catch (error) {
      logger.warn(`CodeContextEngine runtime 不可用，回退到文本搜索: ${(error as Error).message}`);
      return false;
    }
  }

  async collectContext(
    workspacePath: string,
    filePath: string,
    patch: string,
    changedSymbols: string[]
  ): Promise<CodeContextSemanticContext> {
    const engine = await this.getEngine(workspacePath);
    const primarySymbol = changedSymbols[0] ?? path.basename(filePath, path.extname(filePath));
    const pathHints = this.buildPathHints(filePath);
    const symbolHints = changedSymbols.slice(0, 3);

    const reviewResult = await engine.tasks.reviewContextForDiff({
      task: 'review_pr',
      query: filePath,
      pathHints,
      symbolHints,
      diffText: patch,
    });

    const implementationBundle = primarySymbol
      ? await engine.tasks.implementationContext({
          task: 'implementation_context',
          query: primarySymbol,
          pathHints,
          symbolHints: symbolHints.length > 0 ? symbolHints : [primarySymbol],
        }).catch(() => undefined)
      : undefined;

    const impactBundle = primarySymbol
      ? await engine.tasks.findImpact({
          task: 'find_impact',
          query: primarySymbol,
          pathHints,
          symbolHints: symbolHints.length > 0 ? symbolHints : [primarySymbol],
        }).catch(() => undefined)
      : undefined;

    const reviewEvidence = toEvidenceList(reviewResult.bundle);
    const implementationEvidence = toEvidenceList(implementationBundle);
    const impactEvidence = toEvidenceList(impactBundle);

    const relatedSnippets = dedupe(
      [...reviewEvidence, ...implementationEvidence]
        .filter((match) => !isTestPath(match.path))
        .map(formatMatch)
    );

    const impactReferences = dedupe(
      [
        ...findSectionEvidence(impactBundle, ['Candidate References', 'Graph References', 'Importers']),
        ...impactEvidence,
      ]
        .filter((match) => !isTestPath(match.path))
        .map(formatMatch)
    );

    const relatedTests = dedupe(
      [...reviewEvidence, ...findSectionEvidence(implementationBundle, ['Related Tests'])]
        .filter((match) => isTestPath(match.path))
        .map(formatMatch)
    );

    return {
      relatedSnippets,
      impactReferences,
      relatedTests,
      contextEngineAvailable: true,
    };
  }

  disposeWorkspace(workspacePath: string): void {
    this.engineCache.delete(workspacePath);
  }

  private buildPathHints(filePath: string): string[] {
    const directory = path.posix.dirname(filePath);
    if (!directory || directory === '.') {
      return [];
    }
    return [directory];
  }

  private async getEngine(workspacePath: string): Promise<RuntimeEngine> {
    const cached = this.engineCache.get(workspacePath);
    if (cached) {
      return cached;
    }

    const runtimeModule = await this.loadModule();
    const engine = runtimeModule.createCodeContextEngine({ repoRoot: workspacePath });
    this.engineCache.set(workspacePath, engine);
    return engine;
  }

  private async loadModule(): Promise<RuntimeModule> {
    if (!this.modulePromise) {
      this.modulePromise = this.loadModuleInternal();
    }
    return this.modulePromise;
  }

  private async loadModuleInternal(): Promise<RuntimeModule> {
    await this.ensureRuntimeBuild();
    const loaded = require(this.engineEntry) as Partial<RuntimeModule>;

    if (typeof loaded.createCodeContextEngine !== 'function') {
      throw new Error(`CodeContextEngine 模块缺少 createCodeContextEngine 导出: ${this.engineEntry}`);
    }

    return loaded as RuntimeModule;
  }

  private async ensureRuntimeBuild(): Promise<void> {
    if (fs.existsSync(this.engineEntry)) {
      return;
    }

    if (!fs.existsSync(this.engineRoot)) {
      throw new Error(`CodeContextEngine 根目录不存在: ${this.engineRoot}`);
    }

    if (!this.buildPromise) {
      this.buildPromise = this.buildRuntime();
    }

    await this.buildPromise;
  }

  private async buildRuntime(): Promise<void> {
    logger.info(`构建 CodeContextEngine runtime: ${this.engineRoot}`);
    await execFileAsync('npm', ['run', 'build'], {
      cwd: this.engineRoot,
      maxBuffer: 20 * 1024 * 1024,
    });

    if (!fs.existsSync(this.engineEntry)) {
      throw new Error(`CodeContextEngine 构建后仍缺少入口文件: ${this.engineEntry}`);
    }
  }
}
