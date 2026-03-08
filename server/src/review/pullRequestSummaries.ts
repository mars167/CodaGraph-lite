import type { Analysis, Job, ReviewReportSummary, JobPayload, Platform } from '../models/types';

export type ReviewRiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export type ParsedJobPayload = {
  repoName?: string;
  fullRepoName?: string;
  prNumber?: number;
  analysisId?: number;
  headCommit?: string;
  triggerSource?: JobPayload['trigger_source'];
};

export type PullRequestJobSummary = {
  id: number;
  status: Job['status'];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  triggerSource: JobPayload['trigger_source'] | 'unknown';
  headCommit: string | null;
  shortHeadCommit: string | null;
  analysisId: number | null;
  errorMessage: string | null;
  report: ReviewReportSummary | null;
};

function normalizeString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return typeof value === 'string' ? value : new Date(value).toISOString();
}

export function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function buildPullRequestUrl(
  platform: Platform,
  owner: string,
  repoName: string,
  prNumber: number
): string {
  switch (platform) {
    case 'github':
      return `https://github.com/${owner}/${repoName}/pull/${prNumber}`;
    case 'gitee':
      return `https://gitee.com/${owner}/${repoName}/pulls/${prNumber}`;
    case 'gitlab':
      return `https://gitlab.com/${owner}/${repoName}/-/merge_requests/${prNumber}`;
  }
}

export function normalizePullRequestState(
  state: string,
  mergedAt?: string | null
): 'open' | 'closed' | 'merged' {
  if (mergedAt) {
    return 'merged';
  }
  if (state === 'opened') {
    return 'open';
  }
  return state === 'closed' ? 'closed' : 'open';
}

export function deriveRiskLevel(analysis: Analysis | null): {
  level: ReviewRiskLevel;
  summary: string | null;
} {
  if (!analysis) {
    return { level: 'unknown', summary: null };
  }

  const payload = parseJsonObject(analysis.analysis_result);
  const candidate = payload?.riskLevel ?? payload?.risk_level ?? payload?.risk ?? null;
  if (typeof candidate === 'string') {
    const normalized = candidate.toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
      return {
        level: normalized,
        summary: typeof payload?.summary === 'string' ? payload.summary : null,
      };
    }
  }

  if (analysis.status === 'failed') {
    return { level: 'unknown', summary: analysis.error_message || null };
  }
  if (analysis.issue_count >= 10) {
    return { level: 'critical', summary: `发现 ${analysis.issue_count} 个问题` };
  }
  if (analysis.issue_count >= 5) {
    return { level: 'high', summary: `发现 ${analysis.issue_count} 个问题` };
  }
  if (analysis.issue_count > 0) {
    return { level: 'medium', summary: `发现 ${analysis.issue_count} 个问题` };
  }
  if (analysis.comment_count > 0) {
    return { level: 'low', summary: `生成 ${analysis.comment_count} 条审查评论` };
  }

  return {
    level: analysis.status === 'completed' ? 'low' : 'unknown',
    summary: analysis.status === 'completed' ? '最近一次审查未发现明显风险' : null,
  };
}

export function buildReportSummary(analysis: Analysis): ReviewReportSummary {
  const payload = parseJsonObject(analysis.analysis_result);
  const risk = deriveRiskLevel(analysis);
  const rawJobId = payload?.jobId;
  const jobId = typeof rawJobId === 'number'
    ? rawJobId
    : typeof rawJobId === 'string'
      ? parseInt(rawJobId, 10)
      : null;

  return {
    analysisId: analysis.id,
    jobId: Number.isNaN(jobId) ? null : jobId,
    status: analysis.status,
    riskLevel: risk.level,
    summary: typeof payload?.summary === 'string' ? payload.summary : risk.summary,
    issueCount: analysis.issue_count,
    commentCount: analysis.comment_count,
    fileCount: analysis.file_count,
    createdAt: analysis.created_at,
    completedAt: analysis.completed_at || null,
  };
}

export function parseJobPayload(job: Job): ParsedJobPayload {
  const payload = parseJsonObject(job.payload);
  const rawRepoName = typeof payload?.repo_name === 'string' ? payload.repo_name : undefined;
  const rawPrNumber = payload?.pr_number;
  const rawAnalysisId = payload?.analysis_id;
  const analysisId = typeof rawAnalysisId === 'number'
    ? rawAnalysisId
    : typeof rawAnalysisId === 'string'
      ? parseInt(rawAnalysisId, 10)
      : undefined;
  const prNumber = typeof rawPrNumber === 'number'
    ? rawPrNumber
    : typeof rawPrNumber === 'string'
      ? parseInt(rawPrNumber, 10)
      : undefined;

  return {
    repoName: rawRepoName?.includes('/') ? rawRepoName.split('/').pop() : rawRepoName,
    fullRepoName: rawRepoName,
    prNumber: Number.isNaN(prNumber) ? undefined : prNumber,
    analysisId: Number.isNaN(analysisId) ? undefined : analysisId,
    headCommit: typeof payload?.head_commit === 'string' ? payload.head_commit : undefined,
    triggerSource: payload?.trigger_source === 'manual' || payload?.trigger_source === 'watch' || payload?.trigger_source === 'webhook'
      ? payload.trigger_source
      : undefined,
  };
}

export function matchesPullRequestJob(
  job: Job,
  target: { platform: Platform; owner: string; repoName: string; prNumber: number },
  analysisById?: Map<number, Analysis>
): boolean {
  const payload = parseJobPayload(job);

  if (analysisById && payload.analysisId) {
    const linkedAnalysis = analysisById.get(payload.analysisId);
    if (linkedAnalysis) {
      return linkedAnalysis.platform === target.platform
        && linkedAnalysis.owner === target.owner
        && linkedAnalysis.repo_name === target.repoName
        && linkedAnalysis.pr_number === target.prNumber;
    }
  }

  if (payload.prNumber !== target.prNumber) {
    return false;
  }

  return payload.fullRepoName === `${target.owner}/${target.repoName}`
    || payload.repoName === target.repoName;
}

export function computeReviewProgress(
  analysis: Analysis | null,
  latestJob: Pick<Job, 'status'> | null,
  latestAnalysisJob: { progress?: number | null } | null
): number {
  if (analysis?.status === 'completed') {
    return 100;
  }
  if (analysis?.status === 'failed' || analysis?.status === 'cancelled') {
    return 100;
  }
  if (typeof latestAnalysisJob?.progress === 'number' && latestAnalysisJob.progress > 0) {
    return Math.round(latestAnalysisJob.progress * 100);
  }
  if (latestJob?.status === 'processing' || analysis?.status === 'processing') {
    return 60;
  }
  if (latestJob?.status === 'pending' || analysis?.status === 'pending') {
    return 15;
  }
  return 0;
}

export function getReviewStatus(
  analysis: Analysis | null,
  latestJob: Pick<Job, 'status'> | null
): 'not_started' | 'pending' | 'processing' | 'completed' | 'failed' {
  if (!analysis && !latestJob) {
    return 'not_started';
  }
  if (analysis?.status === 'completed') {
    return 'completed';
  }
  if (analysis?.status === 'failed' || latestJob?.status === 'failed' || latestJob?.status === 'dead') {
    return 'failed';
  }
  if (analysis?.status === 'processing' || latestJob?.status === 'processing') {
    return 'processing';
  }
  return 'pending';
}

export function buildPullRequestJobSummary(
  job: Job,
  analysisById: Map<number, Analysis>
): PullRequestJobSummary {
  const payload = parseJobPayload(job);
  const linkedAnalysis = payload.analysisId ? analysisById.get(payload.analysisId) || null : null;
  const report = linkedAnalysis ? buildReportSummary(linkedAnalysis) : null;
  const headCommit = payload.headCommit || linkedAnalysis?.head_commit || null;

  return {
    id: job.id,
    status: job.status,
    createdAt: normalizeString(job.created_at) || '',
    startedAt: normalizeString(job.started_at),
    completedAt: normalizeString(job.completed_at),
    updatedAt: normalizeString(job.updated_at) || normalizeString(job.created_at) || '',
    triggerSource: payload.triggerSource || 'unknown',
    headCommit,
    shortHeadCommit: headCommit ? headCommit.slice(0, 8) : null,
    analysisId: linkedAnalysis?.id || payload.analysisId || null,
    errorMessage: typeof job.error_message === 'string' ? job.error_message : null,
    report,
  };
}

export function compareDateDesc(left?: string | null, right?: string | null): number {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return rightTime - leftTime;
}

export function pickMostRecentDate(values: Array<string | null | undefined>): string | null {
  return values
    .filter((value): value is string => Boolean(value))
    .sort(compareDateDesc)[0] || null;
}
