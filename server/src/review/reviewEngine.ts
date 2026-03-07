import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Platform } from '../models/types';
import { logger } from '../utils/logger';
import { annotateDiffWithLineNumbers, getChangedHeadLines, mapLineToInlineComment, type InlineCommentPosition } from './diffMapper';
import { ReviewLLMClient } from './llmClient';
import { buildFileReviewPrompt, buildOverallReviewPrompt, buildSystemPrompt } from './prompts';
import { parseFileReview } from './reviewParser';

const execFileAsync = promisify(execFile);

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ReviewCategory = 'security' | 'bug' | 'performance' | 'maintainability';
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
  callers: string[];
  callees: string[];
  usedGitAi: boolean;
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
  summary: string;
  riskLevel: RiskLevel;
  mode: 'rule-only' | 'hybrid';
  metadata: {
    llmEnabled: boolean;
    llmUsed: boolean;
    gitAiAvailable: boolean;
    reviewedFiles: number;
    inlineCommentLimit: number;
  };
}

export interface AdvancedReviewInput {
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
  onProgress?: (message: string, completedFiles?: number, totalFiles?: number) => void;
}

type ShellResult = {
  stdout: string;
  stderr: string;
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

function createWorkspacePath(input: AdvancedReviewInput): string {
  return path.join(
    input.workspaceRoot,
    input.platform,
    input.owner,
    input.repo,
    String(input.prNumber),
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function injectTokenIntoCloneUrl(platform: Platform, cloneUrl: string, accessToken: string): string {
  const parsed = new URL(cloneUrl);
  parsed.username = platform === 'github' ? 'oauth2' : 'oauth2';
  parsed.password = accessToken;
  return parsed.toString();
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

function formatSearchOutput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => truncate(typeof item === 'string' ? item : JSON.stringify(item)))
      .filter((item) => item.length > 0)
      .slice(0, 5);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 5)
      .map(([key, item]) => `${key}: ${truncate(typeof item === 'string' ? item : JSON.stringify(item))}`);
    return entries;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.split('\n').slice(0, 5).map((line) => truncate(line));
  }

  return [];
}

export class AdvancedReviewEngine {
  private readonly llmClient = new ReviewLLMClient();
  private readonly semanticCache = new Map<string, FileSemanticContext>();
  private gitAiAvailable = false;

  async review(input: AdvancedReviewInput): Promise<AdvancedReviewResult> {
    const workspacePath = createWorkspacePath(input);
    const llmEnabled = this.llmClient.isEnabled();

    await fs.mkdir(path.dirname(workspacePath), { recursive: true });

    try {
      input.onProgress?.('创建审查工作区');
      await this.cloneAndCheckout(input, workspacePath);

      input.onProgress?.('尝试构建 git-ai 索引');
      this.gitAiAvailable = await this.tryIndexWorkspace(workspacePath);

      const supportedFiles = input.files.filter((file) => file.patch && isSupportedFile(file.path));
      const fileReviews: FileReviewResult[] = [];

      for (let index = 0; index < supportedFiles.length; index += 1) {
        const file = supportedFiles[index];
        input.onProgress?.(`分析 ${file.path}`, index + 1, supportedFiles.length);
        const review = await this.reviewFile(file, workspacePath, input.baseSha, llmEnabled);
        fileReviews.push(review);
      }

      const summaryFindings = await this.reviewPullRequest(input, fileReviews, llmEnabled);
      const fileFindings = fileReviews.flatMap((review) => review.findings);
      const allFindings = dedupeFindings([...fileFindings, ...summaryFindings]);
      const { inlineComments, fallbackFindings } = this.planCommentPublication(
        input.maxInlineComments ?? 8,
        fileReviews,
        allFindings
      );

      const riskLevel = deriveRiskLevel(allFindings);
      const llmUsed = llmEnabled && fileReviews.some((review) => review.usedFallback === false);
      const summary = this.buildSummary(fileReviews, summaryFindings, allFindings, riskLevel, llmUsed);

      return {
        fileReviews,
        allFindings,
        summaryFindings,
        inlineComments,
        fallbackFindings,
        summary,
        riskLevel,
        mode: llmUsed ? 'hybrid' : 'rule-only',
        metadata: {
          llmEnabled,
          llmUsed,
          gitAiAvailable: this.gitAiAvailable,
          reviewedFiles: fileReviews.length,
          inlineCommentLimit: input.maxInlineComments ?? 8,
        },
      };
    } finally {
      await this.cleanupWorkspace(workspacePath);
    }
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd?: string
  ): Promise<ShellResult> {
    const result = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  private async cloneAndCheckout(input: AdvancedReviewInput, workspacePath: string): Promise<void> {
    const authenticatedCloneUrl = injectTokenIntoCloneUrl(
      input.platform,
      input.repositoryCloneUrl,
      input.accessToken
    );

    await this.runCommand('git', ['clone', '--filter=blob:none', '--no-checkout', authenticatedCloneUrl, workspacePath]);
    await this.runCommand('git', ['fetch', '--depth', '100', 'origin', input.baseSha], workspacePath);

    let fetchedHead = false;
    try {
      await this.runCommand('git', ['fetch', '--depth', '100', 'origin', input.headSha], workspacePath);
      fetchedHead = true;
    } catch (error) {
      logger.warn(`直接获取 head SHA 失败，将尝试 PR ref: ${(error as Error).message}`);
    }

    if (!fetchedHead && input.platform === 'github') {
      await this.runCommand(
        'git',
        ['fetch', '--depth', '100', 'origin', `pull/${input.prNumber}/head:refs/remotes/origin/pr/${input.prNumber}`],
        workspacePath
      );
      fetchedHead = true;
    }

    if (!fetchedHead) {
      throw new Error('无法拉取 PR head commit');
    }

    try {
      await this.runCommand('git', ['checkout', input.headSha], workspacePath);
    } catch {
      await this.runCommand('git', ['checkout', `refs/remotes/origin/pr/${input.prNumber}`], workspacePath);
    }
  }

  private async tryIndexWorkspace(workspacePath: string): Promise<boolean> {
    const gitAiBinary = process.env.GIT_AI_BIN || 'git-ai';

    try {
      await this.runCommand(gitAiBinary, ['--version']);
      await this.runCommand(gitAiBinary, ['index'], workspacePath);
      return true;
    } catch (error) {
      logger.warn(`git-ai 不可用，切换到文本搜索回退: ${(error as Error).message}`);
      return false;
    }
  }

  private async reviewFile(
    file: ReviewFileInput,
    workspacePath: string,
    baseSha: string,
    llmEnabled: boolean
  ): Promise<FileReviewResult> {
    const language = inferLanguage(file.path);
    const headContent = file.status === 'removed'
      ? undefined
      : await fs.readFile(path.join(workspacePath, file.path), 'utf-8').catch(() => undefined);
    const baseContentPath = file.previousPath || file.path;
    const baseContent = file.status === 'added'
      ? undefined
      : await this.readBaseFile(workspacePath, baseSha, baseContentPath);

    const semanticContext = await this.gatherSemanticContext(file, workspacePath);
    const ruleFindings = this.runRuleChecks(file);

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

        const response = await this.llmClient.chat([
          { role: 'system', content: buildSystemPrompt(language) },
          { role: 'user', content: prompt },
        ]);

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
      }
    }

    const findings = dedupeFindings([...ruleFindings, ...llmFindings]);

    return {
      filePath: file.path,
      status: file.status,
      language,
      fileSummary: fileSummary || createFallbackFileSummary(file, findings),
      findings,
      semanticContext,
      patch: file.patch,
      usedFallback,
    };
  }

  private async readBaseFile(workspacePath: string, baseSha: string, filePath: string): Promise<string | undefined> {
    try {
      const result = await this.runCommand('git', ['show', `${baseSha}:${filePath}`], workspacePath);
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
      callers: [],
      callees: [],
      usedGitAi: false,
    };

    const symbols = changedSymbols.length > 0
      ? changedSymbols
      : [path.basename(file.path, path.extname(file.path))].filter((value) => value.length > 1);

    if (this.gitAiAvailable) {
      const gitAiBinary = process.env.GIT_AI_BIN || 'git-ai';
      const primarySymbol = symbols[0];

      try {
        const searchResult = await this.runCommand(
          gitAiBinary,
          ['search', '--query', primarySymbol, '--limit', '5', '--output', 'json'],
          workspacePath
        );
        context.relatedSnippets = formatSearchOutput(JSON.parse(searchResult.stdout));
        context.usedGitAi = true;
      } catch {
        context.usedGitAi = false;
      }

      if (primarySymbol && context.usedGitAi) {
        try {
          const callersResult = await this.runCommand(
            gitAiBinary,
            ['graph', 'callers', primarySymbol, '--depth', '1', '--output', 'json'],
            workspacePath
          );
          context.callers = formatSearchOutput(JSON.parse(callersResult.stdout));
        } catch {
          context.callers = [];
        }

        try {
          const calleesResult = await this.runCommand(
            gitAiBinary,
            ['graph', 'callees', primarySymbol, '--depth', '1', '--output', 'json'],
            workspacePath
          );
          context.callees = formatSearchOutput(JSON.parse(calleesResult.stdout));
        } catch {
          context.callees = [];
        }
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
        workspacePath
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

  private runRuleChecks(file: ReviewFileInput): ReviewFinding[] {
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

    maybeAdd(/(^|\n)\+.*\b(console\.log|debugger)\b/, /\b(console\.log|debugger)\b/, {
      severity: 'medium',
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

    if (file.changes >= 400) {
      findings.push({
        filePath: file.path,
        severity: 'medium',
        category: 'performance',
        title: '单文件改动过大',
        description: `当前文件改动约 ${file.changes} 行，人工 review 容易遗漏边界情况。`,
        suggestion: '拆分提交，或为该文件补充更有针对性的测试和说明。',
        source: 'rule',
      });
    }

    return findings;
  }

  private inferCategory(title: string, description: string): ReviewCategory {
    const haystack = `${title} ${description}`.toLowerCase();
    if (haystack.includes('xss') || haystack.includes('secret') || haystack.includes('token') || haystack.includes('auth')) {
      return 'security';
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
    llmEnabled: boolean
  ): Promise<ReviewFinding[]> {
    const findings: ReviewFinding[] = [];
    const hasCodeChanges = input.files.some((file) => isCodeOrConfigFile(file.path));
    const hasTests = input.files.some((file) => isTestFile(file.path));

    if (hasCodeChanges && !hasTests) {
      findings.push({
        filePath: 'PR_OVERALL',
        severity: 'medium',
        category: 'maintainability',
        title: '本次变更缺少测试变更',
        description: 'PR 修改了代码或配置，但没有看到对应的测试改动，回归风险较高。',
        suggestion: '为新增逻辑、边界条件或修复路径补充测试，至少覆盖主要成功/失败分支。',
        source: 'summary',
      });
    }

    if (!llmEnabled || fileReviews.length < 2) {
      return findings;
    }

    try {
      const response = await this.llmClient.chat([
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
      ], 1200);

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
        continue;
      }

      const position = patch ? mapLineToInlineComment(patch, targetLine) : null;

      if (!position || inlineComments.length >= maxInlineComments) {
        fallbackFindings.push(finding);
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

  private buildSummary(
    fileReviews: FileReviewResult[],
    summaryFindings: ReviewFinding[],
    allFindings: ReviewFinding[],
    riskLevel: RiskLevel,
    llmUsed: boolean
  ): string {
    const bySeverity = allFindings.reduce<Record<ReviewSeverity, number>>(
      (accumulator, finding) => {
        accumulator[finding.severity] += 1;
        return accumulator;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );

    const mode = llmUsed ? 'LLM + 规则' : '规则回退';
    const summaryHeadline = summaryFindings[0]?.description ?? '已完成仓库上下文驱动的 PR review。';

    return [
      summaryHeadline,
      `模式：${mode}；风险等级：${riskLevel}。`,
      `共审查 ${fileReviews.length} 个文件，发现 ${allFindings.length} 个问题（critical ${bySeverity.critical} / high ${bySeverity.high} / medium ${bySeverity.medium} / low ${bySeverity.low}）。`,
    ].join(' ');
  }

  private async cleanupWorkspace(workspacePath: string): Promise<void> {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`清理审查工作区失败 ${workspacePath}: ${(error as Error).message}`);
    }
  }
}
