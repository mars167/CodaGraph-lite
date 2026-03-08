import { getAnalysisModel } from '../models/Analysis';
import { getAnalysisJobModel } from '../models/AnalysisJob';
import { getJobLogModel } from '../models/JobLog';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import { getReviewLockModel } from '../models/ReviewLock';
import { getRepositoryModel } from '../models/Repository';
import type { Analysis, JobPayload, OAuthInstallation, Platform } from '../models/types';
import { createPlatformClient } from '../platform/client';
import type { PullRequest as PlatformPullRequest, Repository as PlatformRepository } from '../platform/client';
import {
  GitHubClient,
  GiteeClient,
  GitLabClient,
  type PlatformClient,
  type PRInfo,
} from '../platform/GitHubClient';
import { getQueueService } from '../jobs/QueueService';
import { getOAuthInstallationService } from './OAuthInstallationService';
import {
  AdvancedReviewEngine,
  type ReviewFileInput,
  type ReviewFinding,
  type RiskLevel,
} from '../review/reviewEngine';

type ReviewExecutionResult = {
  analysis: Analysis;
  postedCommentCount: number;
  findings: ReviewFinding[];
  riskLevel: RiskLevel;
  summary: string;
};

class ReviewCancelledError extends Error {
  constructor(message = '作业已手动终止') {
    super(message);
    this.name = 'ReviewCancelledError';
  }
}

function truncate(value: string, maxLength = 220): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeLogText(value: string): string {
  return truncate(
    value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/("?(token|secret|password|authorization|api[_-]?key)"?\s*[:=]\s*"?)[^",\s]+/gi, '$1[REDACTED]')
      .replace(/[A-Fa-f0-9]{32,}/g, '[REDACTED_HASH]')
  );
}

function severityWeight(severity: ReviewFinding['severity']): number {
  return {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[severity];
}

function summarizeFindings(findings: ReviewFinding[], fileCount: number): string {
  if (findings.length === 0) {
    return `已完成 ${fileCount} 个文件的仓库上下文 review，未发现明显风险。`;
  }

  const bySeverity = findings.reduce<Record<ReviewFinding['severity'], number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );

  return [
    `已完成 ${fileCount} 个文件的自动 review，共识别 ${findings.length} 个问题。`,
    `严重 ${bySeverity.critical} 个，高风险 ${bySeverity.high} 个，中风险 ${bySeverity.medium} 个，低风险 ${bySeverity.low} 个。`,
  ].join(' ');
}

function buildMarkdownReport(
  pullRequest: PlatformPullRequest,
  findings: ReviewFinding[],
  riskLevel: RiskLevel,
  summary: string,
  options: {
    mode: string;
    inlineCommentCount: number;
    fallbackCommentCount: number;
  }
): string {
  const sortedFindings = [...findings].sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
  const lines = [
    '# PR Review 报告',
    '',
    `- PR: #${pullRequest.number} ${pullRequest.title}`,
    `- 风险等级: ${riskLevel}`,
    `- 审查模式: ${options.mode}`,
    `- 行级评论: ${options.inlineCommentCount}`,
    `- 摘要回退项: ${options.fallbackCommentCount}`,
    `- 生成时间: ${new Date().toISOString()}`,
    '',
    '## 摘要',
    summary,
    '',
    '## 发现的问题',
  ];

  if (sortedFindings.length === 0) {
    lines.push('- 未发现需要阻断合并的明显问题。');
  } else {
    for (const finding of sortedFindings) {
      lines.push(`### ${finding.filePath}${finding.lineNumber ? `:${finding.lineNumber}` : ''}`);
      lines.push(`- 严重性: ${finding.severity}`);
      lines.push(`- 类别: ${finding.category}`);
      lines.push(`- 标题: ${finding.title}`);
      lines.push(`- 描述: ${finding.description}`);
      if (finding.suggestion) {
        lines.push(`- 建议: ${finding.suggestion}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function createCommentClient(platform: Platform, accessToken: string): PlatformClient {
  if (platform === 'github') {
    return new GitHubClient(accessToken);
  }
  if (platform === 'gitee') {
    return new GiteeClient(accessToken);
  }
  return new GitLabClient(accessToken);
}

function normalizeReviewFile(rawFile: Record<string, unknown>): ReviewFileInput {
  const patch = typeof rawFile.patch === 'string'
    ? rawFile.patch
    : typeof rawFile.diff === 'string'
      ? rawFile.diff
      : '';
  const path = typeof rawFile.filename === 'string'
    ? rawFile.filename
    : typeof rawFile.new_path === 'string'
      ? rawFile.new_path
      : typeof rawFile.old_path === 'string'
        ? rawFile.old_path
        : 'unknown';
  const rawStatus = typeof rawFile.status === 'string'
    ? rawFile.status
    : rawFile.deleted_file
      ? 'removed'
      : rawFile.renamed_file
        ? 'renamed'
        : rawFile.new_file
      ? 'added'
        : 'modified';
  const previousPath = typeof rawFile.previous_filename === 'string'
    ? rawFile.previous_filename
    : typeof rawFile.old_path === 'string'
      ? rawFile.old_path
      : undefined;

  const normalizedStatus = rawStatus === 'removed' || rawStatus === 'deleted'
    ? 'removed'
    : rawStatus === 'renamed'
      ? 'renamed'
      : rawStatus === 'added'
        ? 'added'
        : 'modified';

  return {
    path,
    status: normalizedStatus,
    patch,
    additions: typeof rawFile.additions === 'number' ? rawFile.additions : 0,
    deletions: typeof rawFile.deletions === 'number' ? rawFile.deletions : 0,
    changes: typeof rawFile.changes === 'number' ? rawFile.changes : 0,
    previousPath,
  };
}

function normalizePlatformFiles(rawFiles: unknown): ReviewFileInput[] {
  if (Array.isArray(rawFiles)) {
    return rawFiles
      .map((item) => normalizeReviewFile(item as Record<string, unknown>))
      .filter((item) => item.path !== 'unknown');
  }

  if (rawFiles && typeof rawFiles === 'object' && Array.isArray((rawFiles as { changes?: unknown[] }).changes)) {
    return ((rawFiles as { changes: unknown[] }).changes)
      .map((item) => normalizeReviewFile(item as Record<string, unknown>))
      .filter((item) => item.path !== 'unknown');
  }

  return [];
}

function formatFindingBody(finding: ReviewFinding): string {
  const lines = [
    `**${finding.severity.toUpperCase()}** · ${finding.title}`,
    '',
    finding.description,
  ];

  if (finding.suggestion) {
    lines.push('', `建议：${finding.suggestion}`);
  }

  if (finding.codeSnippet) {
    lines.push('', '```suggestion', finding.codeSnippet, '```');
  }

  return lines.join('\n');
}

function buildSummaryCommentBody(
  pullRequest: PlatformPullRequest,
  reportId: number,
  riskLevel: RiskLevel,
  summary: string,
  inlineCommentCount: number,
  fallbackFindings: ReviewFinding[]
): string {
  const lines = [
    '## CodaGraph Review 摘要',
    '',
    `- PR: #${pullRequest.number} ${pullRequest.title}`,
    `- 风险等级: **${riskLevel}**`,
    `- 报告 ID: **${reportId}**`,
    `- 已发布行级评论: **${inlineCommentCount}**`,
    '',
    summary,
  ];

  if (fallbackFindings.length > 0) {
    lines.push('', '### 摘要中的补充问题');
    for (const finding of fallbackFindings.slice(0, 8)) {
      lines.push(
        '',
        `- **${finding.title}** (${finding.filePath}${finding.lineNumber ? `:${finding.lineNumber}` : ''})`,
        `  - 严重性: ${finding.severity}`,
        `  - 描述: ${finding.description}`,
        ...(finding.suggestion ? [`  - 建议: ${finding.suggestion}`] : [])
      );
    }
  }

  return lines.join('\n');
}

function dedupeFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return [...new Map(
    findings.map((finding) => [
      `${finding.filePath}:${finding.lineNumber ?? 0}:${finding.title.toLowerCase()}`,
      finding,
    ])
  ).values()];
}

function isAuthenticationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(^|[^0-9])401([^0-9]|$)/.test(message)
    || /bad credentials/i.test(message)
    || /unauthorized/i.test(message);
}

export class ReviewExecutionService {
  private analysisModel = getAnalysisModel();
  private analysisJobModel = getAnalysisJobModel();
  private repositoryModel = getRepositoryModel();
  private oauthInstallationModel = getOAuthInstallationModel();
  private oauthInstallationService = getOAuthInstallationService();
  private jobLogModel = getJobLogModel();
  private queueService = getQueueService();
  private reviewLockModel = getReviewLockModel();
  private reviewEngine = new AdvancedReviewEngine();

  private log(jobId: number, level: 'info' | 'warn' | 'error', message: string): void {
    this.jobLogModel.create(jobId, level, sanitizeLogText(message));
  }

  private logTool(jobId: number, toolName: string, input: string, output: string): void {
    this.log(jobId, 'info', `[tool] ${toolName} | input=${input} | output=${output}`);
  }

  private ensureNotCancelled(jobId: number): void {
    if (this.queueService.isCancellationRequested(jobId)) {
      throw new ReviewCancelledError();
    }
  }

  private parsePayload(payload: string): JobPayload {
    const parsed = JSON.parse(payload) as JobPayload;
    if (!parsed.platform || !parsed.repo_name || !parsed.pr_number) {
      throw new Error('作业 payload 缺少必要字段');
    }
    return parsed;
  }

  private buildPlatformClient(installation: OAuthInstallation, platform: Platform) {
    return createPlatformClient(platform, installation.access_token, {
      authType: installation.auth_type || 'oauth',
      githubAppInstallationId: installation.github_app_installation_id || null,
    });
  }

  private buildCommentClient(installation: OAuthInstallation, platform: Platform): PlatformClient {
    return createCommentClient(platform, installation.access_token);
  }

  async execute(jobId: number, rawPayload: string): Promise<ReviewExecutionResult> {
    const payload = this.parsePayload(rawPayload);
    const [owner, repoName] = payload.repo_name.split('/', 2);
    const prNumber = parseInt(payload.pr_number, 10);

    if (!owner || !repoName || Number.isNaN(prNumber)) {
      throw new Error('作业 payload 中的仓库或 PR 信息无效');
    }

    const repository = payload.repository_id
      ? this.repositoryModel.findById(parseInt(payload.repository_id, 10))
      : this.repositoryModel.findByPlatformOwnerName(payload.platform as Platform, owner, repoName);
    if (!repository) {
      throw new Error(`未找到仓库缓存: ${payload.repo_name}`);
    }

    const installation = this.oauthInstallationModel.findById(repository.installation_id);
    if (!installation || !installation.is_active) {
      throw new Error('仓库关联的 OAuth 集成不可用');
    }

    const analysis = payload.analysis_id
      ? this.analysisModel.findById(parseInt(payload.analysis_id, 10))
      : this.analysisModel.findByPR(repository.platform, repository.owner, repository.name, prNumber);
    if (!analysis) {
      throw new Error('未找到关联的 analysis 记录');
    }

    const analysisJob = payload.analysis_job_id
      ? this.analysisJobModel.findById(parseInt(payload.analysis_job_id, 10))
      : this.analysisJobModel.findByAnalysisId(analysis.id).slice(-1)[0] || null;
    if (!analysisJob) {
      throw new Error('未找到关联的 analysis_job 记录');
    }

    this.analysisModel.markProcessing(analysis.id);
    this.analysisJobModel.markProcessing(analysisJob.id);
    this.analysisJobModel.updateProgress(analysisJob.id, 0.05, '准备读取 PR 信息');
    this.log(jobId, 'info', 'review-agent 已启动');
    this.log(jobId, 'info', 'review-agent 推理开始，已进入实时日志模式');

    let activeInstallation = await this.oauthInstallationService.ensureValidAccessToken(installation);
    let platformClient = this.buildPlatformClient(activeInstallation, repository.platform);
    let commentClient = this.buildCommentClient(activeInstallation, repository.platform);

    const refreshClients = async (context: string, error: unknown): Promise<void> => {
      this.log(
        jobId,
        'warn',
        `${context} 遇到鉴权失败，正在强制刷新 token 并重试: ${error instanceof Error ? error.message : String(error)}`
      );
      activeInstallation = await this.oauthInstallationService.ensureValidAccessToken(activeInstallation, true);
      platformClient = this.buildPlatformClient(activeInstallation, repository.platform);
      commentClient = this.buildCommentClient(activeInstallation, repository.platform);
    };

    const withAuthRefresh = async <T>(context: string, operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        if (!isAuthenticationFailure(error)) {
          throw error;
        }

        await refreshClients(context, error);
        return operation();
      }
    };

    this.ensureNotCancelled(jobId);
    this.logTool(jobId, 'platform.getPullRequest', `repo=${repository.full_name},pr=${prNumber}`, '读取 PR 元数据');
    const pullRequest = await withAuthRefresh(
      '读取 PR 元数据',
      () => platformClient.getPullRequest(repository.owner, repository.name, prNumber)
    );
    this.analysisJobModel.updateProgress(analysisJob.id, 0.15, `已读取 PR #${prNumber} 元数据`);
    this.log(jobId, 'info', `review-agent 判断：PR 标题为 "${pullRequest.title}"，准备抓取变更文件`);

    this.ensureNotCancelled(jobId);
    this.logTool(jobId, 'platform.getRepository', `repo=${repository.full_name}`, '读取仓库克隆信息');
    const platformRepository: PlatformRepository = await withAuthRefresh(
      '读取仓库克隆信息',
      () => platformClient.getRepository(repository.owner, repository.name)
    );

    this.ensureNotCancelled(jobId);
    this.logTool(jobId, 'platform.getPullRequestFiles', `repo=${repository.full_name},pr=${prNumber}`, '拉取 PR diff 文件列表');
    const files = normalizePlatformFiles(
      await withAuthRefresh(
        '拉取 PR diff 文件列表',
        () => platformClient.getPullRequestFiles(repository.owner, repository.name, prNumber)
      )
    );
    this.analysisJobModel.updateProgress(analysisJob.id, 0.25, `检测到 ${files.length} 个变更文件`);
    this.log(jobId, 'info', `review-agent 判断：本次需要分析 ${files.length} 个文件`);

    this.ensureNotCancelled(jobId);
    const advancedReview = await this.reviewEngine.review({
      platform: repository.platform,
      owner: repository.owner,
      repo: repository.name,
      prNumber,
      repositoryCloneUrl: platformRepository.clone_url,
      accessToken: activeInstallation.access_token,
      baseSha: pullRequest.base.sha,
      headSha: pullRequest.head.sha,
      defaultBranch: platformRepository.default_branch,
      files,
      workspaceRoot: process.env.WORKSPACE_ROOT || '/tmp/repos',
      prTitle: pullRequest.title,
      onProgress: (message, completedFiles, totalFiles) => {
        this.ensureNotCancelled(jobId);
        this.log(jobId, 'info', message);

        if (typeof completedFiles === 'number' && typeof totalFiles === 'number' && totalFiles > 0) {
          const progress = 0.3 + (completedFiles / totalFiles) * 0.45;
          this.analysisJobModel.updateProgress(analysisJob.id, progress, message);
          return;
        }

        this.analysisJobModel.updateProgress(analysisJob.id, 0.3, message);
      },
    });

    const findings = advancedReview.allFindings;
    const riskLevel = advancedReview.riskLevel;
    const summary = advancedReview.summary || summarizeFindings(findings, advancedReview.fileReviews.length);
    let fallbackFindings = dedupeFindings([...advancedReview.fallbackFindings]);

    this.analysisJobModel.updateProgress(analysisJob.id, 0.8, '正在发布 PR 评论');
    let postedCommentCount = 0;
    let inlineCommentCount = 0;
    const prInfo: PRInfo = {
      platform: repository.platform,
      owner: repository.owner,
      repo: repository.name,
      prNumber: String(prNumber),
    };

    const canSubmitBatchReview = repository.platform === 'github'
      && typeof commentClient.submitReview === 'function';

    if (canSubmitBatchReview) {
      this.ensureNotCancelled(jobId);
      try {
        const batchSummaryCommentBody = buildSummaryCommentBody(
          pullRequest,
          analysis.id,
          riskLevel,
          summary,
          advancedReview.inlineComments.length,
          fallbackFindings
        );
        this.logTool(
          jobId,
          'platform.submitReview',
          `repo=${repository.full_name},pr=${prNumber},comments=${advancedReview.inlineComments.length}`,
          `fallback=${fallbackFindings.length}`
        );
        await withAuthRefresh(
          '发布 GitHub 批量 review',
          () => commentClient.submitReview!(prInfo, {
            body: batchSummaryCommentBody,
            commitId: pullRequest.head.sha,
            comments: advancedReview.inlineComments.map((inlineComment) => ({
              body: formatFindingBody(inlineComment.finding),
              position: {
                path: inlineComment.finding.filePath,
                line: inlineComment.position.line,
              },
            })),
          })
        );
        inlineCommentCount = advancedReview.inlineComments.length;
        postedCommentCount = inlineCommentCount + 1;
      } catch (error) {
        this.log(
          jobId,
          'warn',
          `批量 review 发布失败，将回退到单条评论模式: ${(error as Error).message}`
        );
      }
    }

    if (postedCommentCount === 0) {
      for (const inlineComment of advancedReview.inlineComments) {
        this.ensureNotCancelled(jobId);
        try {
          this.logTool(
            jobId,
            'platform.postReviewComment',
            `repo=${repository.full_name},pr=${prNumber},file=${inlineComment.finding.filePath},line=${inlineComment.position.line}`,
            `severity=${inlineComment.finding.severity}`
          );
          await withAuthRefresh(
            `发布行级评论 ${inlineComment.finding.filePath}:${inlineComment.position.line}`,
            () => commentClient.postReviewComment(
              prInfo,
              {
                body: formatFindingBody(inlineComment.finding),
                filePath: inlineComment.finding.filePath,
                lineNumber: inlineComment.position.line,
                commitId: pullRequest.head.sha,
              },
              {
                path: inlineComment.finding.filePath,
                line: inlineComment.position.line,
              }
            )
          );
          postedCommentCount += 1;
          inlineCommentCount += 1;
        } catch (error) {
          this.log(
            jobId,
            'warn',
            `行级评论发布失败，将回退到摘要评论: ${(error as Error).message}`
          );
          fallbackFindings.push(inlineComment.finding);
        }
      }

      const fallbackSummaryCommentBody = buildSummaryCommentBody(
        pullRequest,
        analysis.id,
        riskLevel,
        summary,
        inlineCommentCount,
        fallbackFindings
      );

      this.logTool(
        jobId,
        'platform.postComment',
        `repo=${repository.full_name},pr=${prNumber}`,
        `comment_length=${fallbackSummaryCommentBody.length}`
      );
      await withAuthRefresh(
        '发布摘要评论',
        () => commentClient.postComment(prInfo, { body: fallbackSummaryCommentBody })
      );
      postedCommentCount += 1;
    }

    fallbackFindings = dedupeFindings(fallbackFindings);

    const reportMarkdown = buildMarkdownReport(pullRequest, findings, riskLevel, summary, {
      mode: advancedReview.mode,
      inlineCommentCount,
      fallbackCommentCount: fallbackFindings.length,
    });
    const reportPayload = {
      generatedAt: new Date().toISOString(),
      jobId,
      repositoryId: repository.id,
      analysisId: analysis.id,
      prNumber,
      riskLevel,
      summary,
      reportMarkdown,
      files: files.map((file) => ({
        path: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
      })),
      fileReviews: advancedReview.fileReviews.map((review) => ({
        filePath: review.filePath,
        status: review.status,
        language: review.language,
        fileSummary: review.fileSummary,
        findings: review.findings,
        patch: review.patch,
        semanticContext: review.semanticContext,
        usedFallback: review.usedFallback,
      })),
      findings,
      summaryFindings: advancedReview.summaryFindings,
      inlineComments: {
        planned: advancedReview.inlineComments.length,
        posted: inlineCommentCount,
      },
      fallbackFindings,
      mode: advancedReview.mode,
      metadata: advancedReview.metadata,
    };

    this.analysisJobModel.updateProgress(analysisJob.id, 0.95, '正在写入审查报告');
    this.analysisModel.markComplete(
      analysis.id,
      JSON.stringify({
        ...reportPayload,
        postedCommentCount,
      }),
      postedCommentCount,
      advancedReview.fileReviews.length,
      findings.length
    );
    this.analysisJobModel.markComplete(analysisJob.id, 1, 'Review 完成，报告已生成');
    this.repositoryModel.updateLastAnalyzed(repository.id, new Date());
    this.reviewLockModel.releaseByAnalysisId(analysis.id);
    this.log(jobId, 'info', `review-agent 推理完成，风险等级=${riskLevel}`);

    const completedAnalysis = this.analysisModel.findById(analysis.id);
    if (!completedAnalysis) {
      throw new Error('analysis 写入完成后无法重新读取');
    }

    return {
      analysis: completedAnalysis,
      postedCommentCount,
      findings,
      riskLevel,
      summary,
    };
  }

  async markCancelled(jobId: number, rawPayload: string, reason: string): Promise<void> {
    await this.markAnalysisTerminalState(jobId, rawPayload, 'cancelled', reason);
  }

  async markFailed(jobId: number, rawPayload: string, reason: string): Promise<void> {
    await this.markAnalysisTerminalState(jobId, rawPayload, 'failed', reason);
  }

  private async markAnalysisTerminalState(
    jobId: number,
    rawPayload: string,
    mode: 'failed' | 'cancelled',
    reason: string
  ): Promise<void> {
    try {
      const payload = this.parsePayload(rawPayload);
      const analysisId = payload.analysis_id ? parseInt(payload.analysis_id, 10) : NaN;
      const analysisJobId = payload.analysis_job_id ? parseInt(payload.analysis_job_id, 10) : NaN;

      if (!Number.isNaN(analysisId)) {
        if (mode === 'cancelled') {
          this.analysisModel.cancel(analysisId);
        } else {
          this.analysisModel.markFailed(analysisId, reason);
        }
        this.reviewLockModel.releaseByAnalysisId(analysisId);
      }
      if (!Number.isNaN(analysisJobId)) {
        this.analysisJobModel.markFailed(analysisJobId, reason);
      }
    } finally {
      this.log(jobId, 'warn', reason);
    }
  }
}

let reviewExecutionService: ReviewExecutionService | null = null;

export function getReviewExecutionService(): ReviewExecutionService {
  if (!reviewExecutionService) {
    reviewExecutionService = new ReviewExecutionService();
  }
  return reviewExecutionService;
}
