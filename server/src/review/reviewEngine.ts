import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Platform } from '../models/types';
import { logger } from '../utils/logger';
import { formatCommandForLog, sanitizeSensitiveText } from '../utils/redactSensitive';
import { annotateDiffWithLineNumbers, getChangedHeadLines, mapLineToInlineComment, type InlineCommentPosition } from './diffMapper';
import { CodeContextRuntime } from './codeContextRuntime';
import { ReviewLLMClient } from './llmClient';
import { buildFileReviewPrompt, buildOverallReviewPrompt, buildSystemPrompt, REVIEW_PROMPT_VERSION } from './prompts';
import { prioritizeFindings, deriveConfidence, buildCoverageSummary, type ReviewCoverageSummary, type ReviewConfidence, type SuppressedFinding } from './reviewPrioritization';
import { prepareRepositoryWorkspace, type PreparedWorkspace } from './reviewRuntime';
import { ReviewTraceCollector, type ReviewMode, type ReviewTracePayload } from './reviewTrace';
import { parseFileReview } from './reviewParser';

const execFileAsync = promisify(execFile);

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ReviewCategory = 'security' | 'bug' | 'logic' | 'impact' | 'performance' | 'maintainability';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export interface ReviewFileInput {
  path: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  patch: string;
  additions: number;
  deletions: number;
  changes: number;
  previousPath?: string;
}

export interface ReviewFinding {
  filePath: string;
  title: string;
  description: string;
  severity: ReviewSeverity;
  category: ReviewCategory;
  lineNumber?: number;
  suggestion?: string;
  codeSnippet?: string;
  source: 'rule' | 'llm' | 'summary';
}

export interface FileSemanticContext {
  changedSymbols: string[];
  relatedSnippets: string[];
  impactReferences: string[];
  relatedTests: string[];
  contextEngineAvailable: boolean;
}

export interface FileReviewResult {
  filePath: string;
  status: ReviewFileInput['status'];
  language: string;
  fileSummary: string;
  findings: ReviewFinding[];
  semanticContext: FileSemanticContext;
  patch: string;
  usedFallback: boolean;
}

export interface InlineCommentPlan {
  finding: ReviewFinding;
  position: InlineCommentPosition;
}

export interface AdvancedReviewResult {
  fileReviews: FileReviewResult[];
  allFindings: ReviewFinding[];
  summaryFindings: ReviewFinding[];
  inlineComments: InlineCommentPlan[];
  fallbackFindings: ReviewFinding[];
  suppressedFindings: SuppressedFinding[];
  summary: string;
  riskLevel: RiskLevel;
  confidence: ReviewConfidence;
  coverage: ReviewCoverageSummary;
  nextActions: string[];
  trace?: ReviewTracePayload;
  mode: 'rule-only' | 'hybrid';
  metadata: {
    llmEnabled: boolean;
    llmUsed: boolean;
    contextEngineAvailable: boolean;
    reviewedFiles: number;
    inlineCommentLimit: number;
    reviewMode: ReviewMode;
    promptVersion: string;
  };
}

export interface AdvancedReviewInput {
  jobId: string;
  platform: Platform;
  owner: string;
  repo: string;
  prNumber: number;
  repositoryCloneUrl: string;
  accessToken: string;
  baseSha: string;
  headSha: string;
  defaultBranch?: string | null;
  files: ReviewFileInput[];
  workspaceRoot: string;
  maxInlineComments?: number;
  prTitle: string;
  reviewMode?: ReviewMode;
  isCancellationRequested?: () => boolean;
  onProgress?: (message: string, completedFiles?: number, totalFiles?: number) => void;
}

type ShellResult = {
  stdout: string;
  stderr: string;
};

type StageBudgets = {
  gitMs: number;
  contextMs: number;
  llmMs: number;
  summaryMs: number;
  searchMs: number;
};

const STAGE_BUDGETS: StageBudgets = {
  gitMs: parseInt(process.env.REVIEW_GIT_TIMEOUT_MS || '45000', 10),
  contextMs: parseInt(process.env.REVIEW_CONTEXT_TIMEOUT_MS || '12000', 10),
  llmMs: parseInt(process.env.REVIEW_LLM_TIMEOUT_MS || '45000', 10),
  summaryMs: parseInt(process.env.REVIEW_SUMMARY_TIMEOUT_MS || '25000', 10),
  searchMs: parseInt(process.env.REVIEW_SEARCH_TIMEOUT_MS || '5000', 10),
};

const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.java',
  '.rs',
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.h',
  '.hpp',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.sql',
  '.sh',
]);

function truncate(value: string, maxLength = 180): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function severityWeight(severity: ReviewSeverity): number {
  return {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[severity];
}

function deriveRiskLevel(findings: ReviewFinding[]): RiskLevel {
  const critical = findings.filter((item) => item.severity === 'critical').length;
  const high = findings.filter((item) => item.severity === 'high').length;
  const medium = findings.filter((item) => item.severity === 'medium').length;

  if (critical > 0) {
    return 'critical';
  }
  if (high >= 2) {
    return 'high';
  }
  if (high === 1 || medium >= 3) {
    return 'high';
  }
  if (medium > 0) {
    return 'medium';
  }
  if (findings.length > 0) {
    return 'low';
  }
  return 'low';
}

function inferLanguage(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.java':
      return 'java';
    case '.rs':
      return 'rust';
    case '.json':
      return 'json';
    case '.yml':
    case '.yaml':
      return 'yaml';
    case '.md':
      return 'markdown';
    case '.sql':
      return 'sql';
    case '.sh':
      return 'bash';
    default:
      return extension.replace(/^\./, '') || 'text';
  }
}

function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function extractLineNumber(patch: string, needle: RegExp): number | undefined {
  const lines = patch.split('\n');
  let nextLine = 0;
  const matcher = new RegExp(needle.source, needle.flags.replace(/g/g, ''));

  for (const line of lines) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      nextLine = parseInt(hunk[1], 10);
      continue;
    }

    if (line.startsWith('+')) {
      matcher.lastIndex = 0;
      if (matcher.test(line.slice(1))) {
        return nextLine;
      }
      nextLine += 1;
      continue;
    }

    if (!line.startsWith('-')) {
      nextLine += 1;
    }
  }

  return undefined;
}

function extractChangedSymbolsFromDiff(diffContent: string): string[] {
  const symbols = new Set<string>();
  const patterns = [
    /^[+\s]*def\s+(\w+)/,
    /^[+\s]*class\s+(\w+)/,
    /^[+\s]*(?:export\s+)?type\s+(\w+)/,
    /^[+\s]*(?:export\s+)?interface\s+(\w+)/,
    /^[+\s]*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^[+\s]*(?:export\s+)?class\s+(\w+)/,
    /^[+\s]*(?:const|let|var)\s+(\w+)\s*=/,
    /^[+\s]*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?:=>\s*\{|:)/,
    /^[+\s]*func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/,
  ];

  for (const line of diffContent.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }

    for (const pattern of patterns) {
      const match = line.match(pattern);
      const symbol = match?.[1];
      if (symbol && symbol.length > 1) {
        symbols.add(symbol);
      }
    }
  }

  return Array.from(symbols).slice(0, 5);
}

function mapParsedSeverity(value: string): ReviewSeverity {
  switch (value) {
    case 'CRITICAL':
      return 'critical';
    case 'WARNING':
      return 'high';
    case 'SUGGESTION':
      return 'medium';
    default:
      return 'low';
  }
}

function isCodeOrConfigFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return extension !== '.md' && extension !== '.txt';
}

function isTestFile(filePath: string): boolean {
  const lowered = filePath.toLowerCase();
  return lowered.includes('test') || lowered.includes('spec') || lowered.includes('__tests__');
}

function dedupeFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const seen = new Map<string, ReviewFinding>();

  for (const finding of findings) {
    const key = [
      finding.filePath,
      finding.lineNumber ?? 0,
      finding.category,
      finding.title.toLowerCase(),
    ].join('|');
    const existing = seen.get(key);
    if (!existing || severityWeight(finding.severity) > severityWeight(existing.severity)) {
      seen.set(key, finding);
    }
  }

  return Array.from(seen.values()).sort((left, right) => {
    const weight = severityWeight(right.severity) - severityWeight(left.severity);
    if (weight !== 0) {
      return weight;
    }

    return left.filePath.localeCompare(right.filePath) || (left.lineNumber ?? 0) - (right.lineNumber ?? 0);
  });
}

function collectFileContentContext(content: string | undefined, diff: string): string | undefined {
  if (!content) {
    return undefined;
  }

  const lines = content.split('\n');
  if (lines.length <= 400) {
    return content;
  }

  const changedLines = getChangedHeadLines(diff);
  if (changedLines.length === 0) {
    return lines.slice(0, 200).join('\n');
  }

  const targetLines = new Set<number>();
  for (const line of changedLines) {
    for (let cursor = Math.max(1, line - 20); cursor <= Math.min(lines.length, line + 20); cursor += 1) {
      targetLines.add(cursor);
      if (targetLines.size >= 220) {
        break;
      }
    }
    if (targetLines.size >= 220) {
      break;
    }
  }

  return Array.from(targetLines)
    .sort((left, right) => left - right)
    .map((line) => `${line} | ${lines[line - 1]}`)
    .join('\n');
}

function createFallbackFileSummary(file: ReviewFileInput, findings: ReviewFinding[]): string {
  if (file.status === 'removed') {
    return `${file.path} 被删除，需确认没有遗漏调用方或配置引用。`;
  }

  if (findings.length === 0) {
    return `${file.path} 已完成审查，未发现高价值问题。`;
  }

  return `${file.path} 存在 ${findings.length} 个值得关注的问题，需结合 diff 和上下文处理。`;
}

function buildNextActions(findings: ReviewFinding[], coverage: ReviewCoverageSummary): string[] {
  const actions = new Set<string>();

  for (const finding of findings.slice(0, 5)) {
    if (finding.suggestion) {
      actions.add(finding.suggestion);
      continue;
    }

    switch (finding.category) {
      case 'security':
        actions.add('复核权限边界、秘密管理和不可信输入处理。');
        break;
      case 'impact':
        actions.add('检查受影响调用链、依赖模块和相关测试是否同步更新。');
        break;
      case 'logic':
      case 'bug':
        actions.add('补充失败路径和边界条件测试，验证状态转换与回滚逻辑。');
        break;
      case 'performance':
        actions.add('对关键路径做性能验证，避免把大范围改动直接合入。');
        break;
      default:
        actions.add('根据报告中的问题列表补充说明、测试或重构拆分。');
        break;
    }
  }

  if (coverage.skippedFiles.length > 0) {
    actions.add('补充人工检查被跳过的文件，避免把 partial review 当成完整审查。');
  }

  return Array.from(actions).slice(0, 5);
}

function deriveSkippedReason(file: ReviewFileInput): 'missing_patch' | 'unsupported_type' | 'empty_diff' {
  if (!file.patch) {
    return 'missing_patch';
  }
  if (!file.patch.trim()) {
    return 'empty_diff';
  }
  return 'unsupported_type';
}

class StageTimeoutError extends Error {
  constructor(stage: string, timeoutMs: number) {
    super(`${stage} exceeded ${timeoutMs}ms`);
    this.name = 'StageTimeoutError';
  }
}

export class AdvancedReviewEngine {
  private readonly llmClient = new ReviewLLMClient();
  private readonly codeContextRuntime = new CodeContextRuntime();
  private readonly semanticCache = new Map<string, FileSemanticContext>();
  private contextEngineAvailable = false;
  private budgets = STAGE_BUDGETS;
  private trace: ReviewTraceCollector | null = null;

  async review(input: AdvancedReviewInput): Promise<AdvancedReviewResult> {
    const reviewMode = input.reviewMode || 'normal';
    this.trace = new ReviewTraceCollector(reviewMode, REVIEW_PROMPT_VERSION);
    const llmEnabled = this.llmClient.isEnabled();
    let workspace: PreparedWorkspace | null = null;

    const supportedFiles = input.files.filter((file) => file.patch && file.patch.trim().length > 0 && isSupportedFile(file.path));
    const skippedFiles = input.files
      .filter((file) => !supportedFiles.includes(file))
      .map((file) => ({
        path: file.path,
        status: file.status,
        reason: deriveSkippedReason(file),
      }));
    const coverage = buildCoverageSummary({
      totalFiles: input.files.length,
      reviewedFiles: supportedFiles.length,
      skippedFiles,
    });

    try {
      this.trace.stageStarted('inventory', `total=${input.files.length}, reviewed=${supportedFiles.length}, skipped=${skippedFiles.length}`);
      this.trace.stageFinished('inventory', 'completed', `reviewMode=${reviewMode}`);

      this.ensureNotCancelled(input);

      input.onProgress?.('准备仓库镜像与 worktree');
      this.trace.stageStarted('workspace_prepare');
      workspace = await prepareRepositoryWorkspace({
        workspaceRoot: input.workspaceRoot,
        platform: input.platform,
        owner: input.owner,
        repo: input.repo,
        prNumber: input.prNumber,
        jobId: input.jobId,
        repositoryCloneUrl: input.repositoryCloneUrl,
        accessToken: input.accessToken,
        baseSha: input.baseSha,
        headSha: input.headSha,
        gitTimeoutMs: this.budgets.gitMs,
        trace: this.trace,
      });
      const workspacePath = workspace.worktreePath;
      this.trace.stageFinished('workspace_prepare', 'completed', workspacePath);

      input.onProgress?.('初始化 Code Context Engine runtime');
      this.trace.stageStarted('context_prepare');
      this.contextEngineAvailable = await this.withTimeout(
        'context_prepare',
        this.budgets.contextMs,
        () => this.codeContextRuntime.prepare(workspacePath)
      ).catch((error) => {
        logger.warn(`Code Context Engine runtime 不可用: ${(error as Error).message}`);
        return false;
      });
      this.trace.stageFinished('context_prepare', 'completed', `available=${this.contextEngineAvailable}`);

      const fileReviews: FileReviewResult[] = [];

      for (let index = 0; index < supportedFiles.length; index += 1) {
        this.ensureNotCancelled(input);

        const file = supportedFiles[index];
        input.onProgress?.(`分析 ${file.path}`, index + 1, supportedFiles.length);
        const review = await this.reviewFile(file, workspacePath, input.baseSha, llmEnabled);
        fileReviews.push(review);
      }

      this.ensureNotCancelled(input);

      const summaryFindings = await this.reviewPullRequest(input, fileReviews, llmEnabled, coverage);
      const fileFindings = fileReviews.flatMap((review) => review.findings);
      const rawFindings = dedupeFindings([...fileFindings, ...summaryFindings]);
      const { prioritized, suppressed } = prioritizeFindings(rawFindings);
      const allFindings = dedupeFindings(prioritized);

      for (const suppressedFinding of suppressed) {
        this.trace.decision(
          'synthesis',
          'suppressed',
          suppressedFinding.reason,
          suppressedFinding.finding
        );
      }

      const { inlineComments, fallbackFindings } = this.planCommentPublication(
        input.maxInlineComments ?? 8,
        fileReviews,
        allFindings
      );

      const riskLevel = deriveRiskLevel(allFindings);
      const llmUsed = llmEnabled && fileReviews.some((review) => review.usedFallback === false);
      const confidence = deriveConfidence({
        coverage,
        llmUsed,
        contextEngineAvailable: this.contextEngineAvailable,
        totalFindings: allFindings.length,
      });
      const nextActions = buildNextActions(allFindings, coverage);
      const summary = this.buildSummary({
        fileReviews,
        summaryFindings,
        allFindings,
        riskLevel,
        llmUsed,
        confidence,
        coverage,
      });

      return {
        fileReviews,
        allFindings,
        summaryFindings,
        inlineComments,
        fallbackFindings,
        suppressedFindings: suppressed,
        summary,
        riskLevel,
        confidence,
        coverage,
        nextActions,
        trace: this.trace.finalize(),
        mode: llmUsed ? 'hybrid' : 'rule-only',
        metadata: {
          llmEnabled,
          llmUsed,
          contextEngineAvailable: this.contextEngineAvailable,
          reviewedFiles: fileReviews.length,
          inlineCommentLimit: input.maxInlineComments ?? 8,
          reviewMode,
          promptVersion: REVIEW_PROMPT_VERSION,
        },
      };
    } finally {
      await this.cleanupWorkspace(workspace);
    }
  }

  private ensureNotCancelled(input: AdvancedReviewInput): void {
    if (input.isCancellationRequested?.()) {
      throw new Error('review execution cancelled');
    }
  }

  private async withTimeout<T>(
    stage: string,
    timeoutMs: number,
    task: () => Promise<T>
  ): Promise<T> {
    const startedAt = Date.now();
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      return await Promise.race([
        task(),
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new StageTimeoutError(stage, timeoutMs)), timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof StageTimeoutError) {
        this.trace?.stageFinished(stage, 'timeout', error.message);
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const durationMs = Date.now() - startedAt;
      if (this.trace?.isEnabled() && durationMs > timeoutMs * 0.8) {
        this.trace.tool(stage, 'timer', `${stage} budget`, `duration=${durationMs}ms`, durationMs > timeoutMs ? 'timeout' : 'success', durationMs);
      }
    }
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    stage: string,
    timeoutMs = this.budgets.gitMs
  ): Promise<ShellResult> {
    const startedAt = Date.now();
    const rendered = formatCommandForLog(command, args);

    try {
      const result = await execFileAsync(command, args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeoutMs,
      });
      this.trace?.tool(stage, command, rendered, result.stderr || result.stdout || 'ok', 'success', Date.now() - startedAt);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const execError = error as Error & { stderr?: string; stdout?: string; killed?: boolean; signal?: string };
      const detail = sanitizeSensitiveText(execError.stderr || execError.stdout || execError.message);
      this.trace?.tool(stage, command, rendered, detail, execError.killed ? 'timeout' : 'failed', Date.now() - startedAt);
      throw new Error(`Command failed: ${rendered}${detail ? `\n${detail}` : ''}`);
    }
  }

  private async reviewFile(
    file: ReviewFileInput,
    workspacePath: string,
    baseSha: string,
    llmEnabled: boolean
  ): Promise<FileReviewResult> {
    this.trace?.stageStarted('file_review', file.path);

    const language = inferLanguage(file.path);
    const headContent = file.status === 'removed'
      ? undefined
      : await fs.readFile(path.join(workspacePath, file.path), 'utf-8').catch(() => undefined);
    const semanticContext = await this.gatherSemanticContext(file, workspacePath);
    const ruleFindings = this.runRuleChecks(file, semanticContext);
    const evidenceRefs = [...semanticContext.impactReferences, ...semanticContext.relatedSnippets, ...semanticContext.relatedTests].slice(0, 6);

    let llmFindings: ReviewFinding[] = [];
    let usedFallback = true;
    let fileSummary = createFallbackFileSummary(file, ruleFindings);

    if (llmEnabled && file.patch.trim().length > 0 && file.patch.length < 50000) {
      try {
        const annotatedDiff = annotateDiffWithLineNumbers(file.patch);
        const prompt = buildFileReviewPrompt({
          filePath: file.path,
          language,
          annotatedDiff,
          semanticContext,
          fileContent: collectFileContentContext(headContent, file.patch),
        });

        const response = await this.withTimeout(
          'llm_file_review',
          this.budgets.llmMs,
          () => this.llmClient.chat([
            { role: 'system', content: buildSystemPrompt(language) },
            { role: 'user', content: prompt },
          ], 1400, { timeoutMs: this.budgets.llmMs })
        );

        const parsed = parseFileReview(response);
        llmFindings = parsed.issues.map((issue) => ({
          filePath: file.path,
          title: issue.title,
          description: issue.description,
          severity: mapParsedSeverity(issue.severity),
          category: this.inferCategory(issue.title, issue.description),
          lineNumber: issue.line,
          suggestion: issue.suggestion,
          codeSnippet: issue.codeSnippet,
          source: 'llm' as const,
        }));
        fileSummary = parsed.fileSummary || fileSummary;
        usedFallback = parsed.parseError === true;
      } catch (error) {
        logger.warn(`LLM 文件审查失败 ${file.path}: ${(error as Error).message}`);
        this.trace?.decision('llm_file_review', 'fallback', `LLM 文件审查失败: ${(error as Error).message}`, {
          filePath: file.path,
          title: 'LLM 文件审查回退',
        }, evidenceRefs);
      }
    }

    const findings = dedupeFindings([...ruleFindings, ...llmFindings]);

    for (const finding of findings) {
      this.trace?.decision(
        'file_review',
        'produced',
        `基于 ${finding.source === 'llm' ? 'LLM + 上下文' : '规则'} 生成的问题`,
        finding,
        evidenceRefs
      );
    }

    const result = {
      filePath: file.path,
      status: file.status,
      language,
      fileSummary: fileSummary || createFallbackFileSummary(file, findings),
      findings,
      semanticContext,
      patch: file.patch,
      usedFallback,
    };
    this.trace?.stageFinished('file_review', 'completed', `${file.path} findings=${findings.length}`);
    return result;
  }

  private async readBaseFile(workspacePath: string, baseSha: string, filePath: string): Promise<string | undefined> {
    try {
      const result = await this.runCommand('git', ['show', `${baseSha}:${filePath}`], workspacePath, 'base_file_read');
      return result.stdout;
    } catch {
      return undefined;
    }
  }

  private async gatherSemanticContext(
    file: ReviewFileInput,
    workspacePath: string
  ): Promise<FileSemanticContext> {
    const cacheKey = `${file.path}:${file.patch}`;
    const cached = this.semanticCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const changedSymbols = extractChangedSymbolsFromDiff(file.patch);
    const context: FileSemanticContext = {
      changedSymbols,
      relatedSnippets: [],
      impactReferences: [],
      relatedTests: [],
      contextEngineAvailable: false,
    };

    const symbols = changedSymbols.length > 0
      ? changedSymbols
      : [path.basename(file.path, path.extname(file.path))].filter((value) => value.length > 1);

    if (this.contextEngineAvailable) {
      try {
        const collected = await this.withTimeout(
          'semantic_context',
          this.budgets.contextMs,
          () => this.codeContextRuntime.collectContext(
            workspacePath,
            file.path,
            file.patch,
            symbols
          )
        );
        context.relatedSnippets = collected.relatedSnippets;
        context.impactReferences = collected.impactReferences;
        context.relatedTests = collected.relatedTests;
        context.contextEngineAvailable = collected.contextEngineAvailable;
      } catch (error) {
        logger.warn(`CodeContextEngine 上下文收集失败 ${file.path}: ${(error as Error).message}`);
      }
    }

    if (context.relatedSnippets.length === 0 && symbols.length > 0) {
      context.relatedSnippets = await this.searchRepositoryText(workspacePath, symbols[0]);
    }

    this.semanticCache.set(cacheKey, context);
    return context;
  }

  private async searchRepositoryText(workspacePath: string, symbol: string): Promise<string[]> {
    try {
      const result = await this.runCommand(
        'rg',
        [
          '-n',
          '-F',
          '--glob',
          '!node_modules',
          '--glob',
          '!.git',
          symbol,
          '.',
        ],
        workspacePath,
        'text_search',
        this.budgets.searchMs
      );
      return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 5)
        .map((line) => truncate(line));
    } catch {
      return [];
    }
  }

  private runRuleChecks(
    file: ReviewFileInput,
    semanticContext: FileSemanticContext
  ): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    const patch = file.patch;
    const maybeAdd = (
      patchPattern: RegExp,
      linePattern: RegExp,
      finding: Omit<ReviewFinding, 'filePath' | 'lineNumber' | 'source'>
    ) => {
      if (!patchPattern.test(patch)) {
        return;
      }

      findings.push({
        filePath: file.path,
        lineNumber: extractLineNumber(patch, linePattern),
        source: 'rule',
        ...finding,
      });
    };

    maybeAdd(/(^|\n)\+.*\b(eval|new Function)\s*\(/, /\b(eval|new Function)\s*\(/, {
      severity: 'critical',
      category: 'security',
      title: '检测到动态执行代码',
      description: '新增代码使用了 eval 或 new Function，存在明显注入风险。',
      suggestion: '改为显式分支、白名单映射或安全解释器，避免执行动态字符串。',
    });

    maybeAdd(
      /(^|\n)\+.*\b(password|secret|token|api[_-]?key)\b[^\n]*(?:[:=])[^\n]*(?:["'`][^"'`\s]{6,}["'`]|[A-Za-z0-9_\-]{16,})/i,
      /\b(password|secret|token|api[_-]?key)\b[^\n]*(?:[:=])[^\n]*(?:["'`][^"'`\s]{6,}["'`]|[A-Za-z0-9_\-]{16,})/i,
      {
        severity: 'high',
        category: 'security',
        title: '疑似引入敏感信息',
        description: '变更中出现了密码、token 或 API key 相关字段，需要确认没有把秘密写进仓库。',
        suggestion: '将密钥迁移到环境变量或密钥管理系统，并避免在源码中硬编码。',
      }
    );

    maybeAdd(/(^|\n)\+.*\b(innerHTML|dangerouslySetInnerHTML)\b/, /\b(innerHTML|dangerouslySetInnerHTML)\b/, {
      severity: 'high',
      category: 'security',
      title: '存在直接注入 HTML 的变更',
      description: '直接写入 HTML 会扩大 XSS 攻击面，尤其在内容来源不可信时。',
      suggestion: '优先使用安全模板渲染，必要时先做严格 sanitization。',
    });

    maybeAdd(/(^|\n)\+.*catch\s*\([^)]*\)\s*\{\s*\}/, /catch\s*\([^)]*\)\s*\{\s*\}/, {
      severity: 'high',
      category: 'logic',
      title: '异常被静默吞掉',
      description: '新增代码里出现空的 catch 块，错误可能被悄悄忽略，导致状态不一致或故障难以定位。',
      suggestion: '至少记录上下文并显式返回/抛出可处理的错误，避免默默吞掉异常。',
    });

    maybeAdd(/(^|\n)\+.*catch\s*\([^)]*\)\s*\{\s*(?:console\.log|console\.error)/, /catch\s*\([^)]*\)\s*\{/, {
      severity: 'medium',
      category: 'logic',
      title: '异常处理只有日志没有控制流修复',
      description: '仅记录日志但不做返回、补偿或抛错，容易让调用链误以为流程仍然成功。',
      suggestion: '明确失败返回值、补偿逻辑或抛出错误，让上游能够正确处理异常。',
    });

    maybeAdd(/(^|\n)\+.*\b(console\.log|debugger)\b/, /\b(console\.log|debugger)\b/, {
      severity: 'low',
      category: 'maintainability',
      title: '存在调试语句',
      description: '调试语句可能污染生产日志或影响运行流程。',
      suggestion: '在合并前移除调试语句，或替换为受控日志设施。',
    });

    maybeAdd(/(^|\n)\+.*\b(TODO|FIXME|HACK)\b/i, /\b(TODO|FIXME|HACK)\b/i, {
      severity: 'low',
      category: 'maintainability',
      title: '留下了待办标记',
      description: '变更里包含 TODO/FIXME/HACK，后续容易形成技术债。',
      suggestion: '补充 issue 链接或在合并前完成相关处理。',
    });

    if (file.changes >= 180 && semanticContext.relatedTests.length === 0 && !isTestFile(file.path)) {
      findings.push({
        filePath: file.path,
        severity: 'medium',
        category: 'impact',
        title: '关键变更缺少关联测试证据',
        description: `当前文件改动约 ${file.changes} 行，但没有找到明显的关联测试证据，调用链影响可能被低估。`,
        suggestion: '补充覆盖关键调用路径、失败路径和边界条件的测试，或在 PR 说明里解释风险隔离方式。',
        source: 'rule',
      });
    }

    if (file.changes >= 400) {
      findings.push({
        filePath: file.path,
        severity: 'medium',
        category: 'impact',
        title: '单文件改动过大',
        description: `当前文件改动约 ${file.changes} 行，人工 review 容易遗漏边界情况和依赖影响。`,
        suggestion: '拆分提交，或为该文件补充更有针对性的测试和调用链说明。',
        source: 'rule',
      });
    }

    return findings;
  }

  private inferCategory(title: string, description: string): ReviewCategory {
    const haystack = `${title} ${description}`.toLowerCase();
    if (haystack.includes('xss') || haystack.includes('secret') || haystack.includes('token') || haystack.includes('auth') || haystack.includes('权限')) {
      return 'security';
    }
    if (haystack.includes('调用链') || haystack.includes('依赖') || haystack.includes('下游') || haystack.includes('兼容') || haystack.includes('api') || haystack.includes('影响范围')) {
      return 'impact';
    }
    if (haystack.includes('逻辑') || haystack.includes('状态') || haystack.includes('并发') || haystack.includes('重试') || haystack.includes('回滚') || haystack.includes('异常路径') || haystack.includes('边界')) {
      return 'logic';
    }
    if (haystack.includes('性能') || haystack.includes('performance') || haystack.includes('复杂度')) {
      return 'performance';
    }
    if (haystack.includes('bug') || haystack.includes('空指针') || haystack.includes('越界') || haystack.includes('异常')) {
      return 'bug';
    }
    return 'maintainability';
  }

  private async reviewPullRequest(
    input: AdvancedReviewInput,
    fileReviews: FileReviewResult[],
    llmEnabled: boolean,
    coverage: ReviewCoverageSummary
  ): Promise<ReviewFinding[]> {
    const findings: ReviewFinding[] = [];
    const hasCodeChanges = input.files.some((file) => isCodeOrConfigFile(file.path));
    const hasTests = input.files.some((file) => isTestFile(file.path));

    if (hasCodeChanges && !hasTests) {
      findings.push({
        filePath: 'PR_OVERALL',
        severity: 'medium',
        category: 'impact',
        title: '本次变更缺少测试变更',
        description: 'PR 修改了代码或配置，但没有看到对应的测试改动，回归风险较高。',
        suggestion: '为新增逻辑、边界条件或修复路径补充测试，至少覆盖主要成功/失败分支。',
        source: 'summary',
      });
    }

    if (coverage.skippedFiles.length > 0) {
      findings.push({
        filePath: 'PR_OVERALL',
        severity: 'medium',
        category: 'impact',
        title: '本次 review 不是完整覆盖',
        description: `有 ${coverage.skippedFiles.length} 个文件因为缺少 patch 或类型不受支持而被跳过，当前结论应按 partial review 理解。`,
        suggestion: '对被跳过的文件补充人工检查，必要时重新触发 improve 模式审查。',
        source: 'summary',
      });
    }

    if (!llmEnabled || fileReviews.length < 2) {
      return findings;
    }

    try {
      const response = await this.withTimeout(
        'llm_pr_summary',
        this.budgets.summaryMs,
        () => this.llmClient.chat([
          { role: 'system', content: buildSystemPrompt('pull request') },
          {
            role: 'user',
            content: buildOverallReviewPrompt({
              prTitle: input.prTitle,
              fileSummaries: fileReviews.map((review) => ({
                filePath: review.filePath,
                language: review.language,
                summary: review.fileSummary,
                findingCount: review.findings.length,
              })),
              topFindings: fileReviews
                .flatMap((review) => review.findings.slice(0, 2))
                .slice(0, 6)
                .map((finding) => ({
                  filePath: finding.filePath,
                  severity: finding.severity,
                  title: finding.title,
                })),
              hasTests,
            }),
          },
        ], 1200, { timeoutMs: this.budgets.summaryMs })
      );

      const parsed = parseFileReview(response);
      for (const issue of parsed.issues) {
        findings.push({
          filePath: 'PR_OVERALL',
          severity: mapParsedSeverity(issue.severity),
          category: this.inferCategory(issue.title, issue.description),
          title: issue.title,
          description: issue.description,
          suggestion: issue.suggestion,
          codeSnippet: issue.codeSnippet,
          source: 'summary',
        });
      }
    } catch (error) {
      logger.warn(`PR 级别 LLM 总结失败: ${(error as Error).message}`);
      this.trace?.decision('llm_pr_summary', 'fallback', `PR 总结回退: ${(error as Error).message}`);
    }

    return findings;
  }

  private planCommentPublication(
    maxInlineComments: number,
    fileReviews: FileReviewResult[],
    findings: ReviewFinding[]
  ): {
    inlineComments: InlineCommentPlan[];
    fallbackFindings: ReviewFinding[];
  } {
    const patchByFile = new Map(fileReviews.map((review) => [review.filePath, review.patch]));
    const inlineComments: InlineCommentPlan[] = [];
    const fallbackFindings: ReviewFinding[] = [];

    for (const finding of findings) {
      if (finding.filePath === 'PR_OVERALL') {
        fallbackFindings.push(finding);
        continue;
      }

      const patch = patchByFile.get(finding.filePath);
      const targetLine = finding.lineNumber || (patch ? getChangedHeadLines(patch)[0] : undefined);
      if (!targetLine) {
        fallbackFindings.push(finding);
        this.trace?.decision('publication', 'fallback', '找不到可映射的目标行号', finding);
        continue;
      }

      const position = patch ? mapLineToInlineComment(patch, targetLine) : null;

      if (!position || inlineComments.length >= maxInlineComments) {
        fallbackFindings.push(finding);
        this.trace?.decision('publication', 'fallback', !position ? 'diff 行无法映射为行级评论' : '超过 inline comment 上限', finding);
        continue;
      }

      inlineComments.push({
        finding: {
          ...finding,
          lineNumber: targetLine,
        },
        position,
      });
    }

    return {
      inlineComments,
      fallbackFindings,
    };
  }

  private buildSummary(params: {
    fileReviews: FileReviewResult[];
    summaryFindings: ReviewFinding[];
    allFindings: ReviewFinding[];
    riskLevel: RiskLevel;
    llmUsed: boolean;
    confidence: ReviewConfidence;
    coverage: ReviewCoverageSummary;
  }): string {
    const bySeverity = params.allFindings.reduce<Record<ReviewSeverity, number>>(
      (accumulator, finding) => {
        accumulator[finding.severity] += 1;
        return accumulator;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );

    const mode = params.llmUsed ? 'LLM + 规则' : '规则回退';
    const summaryHeadline = params.summaryFindings[0]?.description ?? '已完成仓库上下文驱动的 PR review。';

    return [
      summaryHeadline,
      `模式：${mode}；风险等级：${params.riskLevel}；置信度：${params.confidence}。`,
      `共审查 ${params.fileReviews.length}/${params.coverage.totalFiles} 个文件，发现 ${params.allFindings.length} 个高价值问题（critical ${bySeverity.critical} / high ${bySeverity.high} / medium ${bySeverity.medium} / low ${bySeverity.low}）。`,
      params.coverage.skippedFiles.length > 0
        ? `另外有 ${params.coverage.skippedFiles.length} 个文件未被完整审查，当前结果应按 partial review 理解。`
        : '本次变更没有检测到跳过文件。',
    ].join(' ');
  }

  private async cleanupWorkspace(workspace: PreparedWorkspace | null): Promise<void> {
    if (workspace) {
      this.codeContextRuntime.disposeWorkspace(workspace.worktreePath);
    }
    this.semanticCache.clear();
    this.contextEngineAvailable = false;

    try {
      await workspace?.cleanup();
    } catch (error) {
      logger.warn(`清理审查工作区失败 ${workspace?.worktreePath || 'unknown'}: ${(error as Error).message}`);
    }
  }
}
