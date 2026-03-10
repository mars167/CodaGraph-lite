import type { ReviewFinding } from './reviewEngine';

export interface SuppressedFinding {
  finding: ReviewFinding;
  reason: string;
}

export interface ReviewCoverageSummary {
  totalFiles: number;
  reviewedFiles: number;
  skippedFiles: Array<{
    path: string;
    status: string;
    reason: 'missing_patch' | 'unsupported_type' | 'empty_diff';
  }>;
  partialReview: boolean;
}

export type ReviewConfidence = 'high' | 'medium' | 'low';

function severityWeight(severity: ReviewFinding['severity']): number {
  return {
    critical: 100,
    high: 75,
    medium: 45,
    low: 20,
  }[severity];
}

function categoryWeight(category: ReviewFinding['category']): number {
  return {
    security: 30,
    logic: 26,
    bug: 24,
    impact: 22,
    performance: 16,
    maintainability: 6,
  }[category];
}

function sourceWeight(source?: ReviewFinding['source']): number {
  return source === 'summary' ? 6 : source === 'llm' ? 4 : 2;
}

function titleSuggestsStyleNoise(title: string): boolean {
  const normalized = title.toLowerCase();
  return normalized.includes('调试语句')
    || normalized.includes('todo')
    || normalized.includes('fixme')
    || normalized.includes('hack')
    || normalized.includes('missing semicolon')
    || normalized.includes('格式');
}

export function scoreFinding(finding: ReviewFinding): number {
  return severityWeight(finding.severity) + categoryWeight(finding.category) + sourceWeight(finding.source);
}

export function prioritizeFindings(findings: ReviewFinding[]): {
  prioritized: ReviewFinding[];
  suppressed: SuppressedFinding[];
} {
  const prioritized: ReviewFinding[] = [];
  const suppressed: SuppressedFinding[] = [];

  for (const finding of findings) {
    const styleLikeNoise = finding.category === 'maintainability'
      && finding.severity === 'low'
      && titleSuggestsStyleNoise(finding.title);

    if (styleLikeNoise) {
      suppressed.push({
        finding,
        reason: '低价值样式/清理类提示默认不参与发布，避免 review 噪音',
      });
      continue;
    }

    prioritized.push(finding);
  }

  prioritized.sort((left, right) => {
    const scoreDelta = scoreFinding(right) - scoreFinding(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.filePath.localeCompare(right.filePath) || (left.lineNumber ?? 0) - (right.lineNumber ?? 0);
  });

  return {
    prioritized,
    suppressed,
  };
}

export function deriveConfidence(params: {
  coverage: ReviewCoverageSummary;
  llmUsed: boolean;
  contextEngineAvailable: boolean;
  totalFindings: number;
}): ReviewConfidence {
  const skippedRatio = params.coverage.totalFiles > 0
    ? params.coverage.skippedFiles.length / params.coverage.totalFiles
    : 1;

  if (params.contextEngineAvailable && params.llmUsed && skippedRatio <= 0.15) {
    return 'high';
  }

  if (skippedRatio <= 0.35 && (params.llmUsed || params.totalFindings > 0)) {
    return 'medium';
  }

  return 'low';
}

export function buildCoverageSummary(params: {
  totalFiles: number;
  reviewedFiles: number;
  skippedFiles: ReviewCoverageSummary['skippedFiles'];
}): ReviewCoverageSummary {
  return {
    totalFiles: params.totalFiles,
    reviewedFiles: params.reviewedFiles,
    skippedFiles: params.skippedFiles,
    partialReview: params.skippedFiles.length > 0 || params.reviewedFiles < params.totalFiles,
  };
}
