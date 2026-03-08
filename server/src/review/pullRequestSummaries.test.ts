import type { Analysis, Job } from '../models/types';
import {
  buildPullRequestJobSummary,
  compareDateDesc,
  deriveRiskLevel,
  indexJobsByPullRequest,
  matchesPullRequestJob,
  parseJobPayload,
} from './pullRequestSummaries';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    type: 'pr_analysis',
    payload: JSON.stringify({
      platform: 'github',
      repo_name: 'mars167/CodaGraph-lite',
      pr_number: '42',
      analysis_id: '7',
      head_commit: 'abcdef1234567890',
      trigger_source: 'watch',
    }),
    status: 'completed',
    priority: 3,
    attempts: 1,
    max_attempts: 3,
    error_message: null,
    started_at: '2026-03-08T10:00:00.000Z',
    completed_at: '2026-03-08T10:10:00.000Z',
    failed_at: null,
    created_at: '2026-03-08T09:59:00.000Z',
    updated_at: '2026-03-08T10:10:00.000Z',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: 7,
    platform: 'github',
    owner: 'mars167',
    repo_name: 'CodaGraph-lite',
    pr_number: 42,
    pr_title: 'Improve history view',
    pr_author: 'mars167',
    base_commit: 'base',
    head_commit: 'abcdef1234567890',
    status: 'completed',
    analysis_result: JSON.stringify({ summary: 'ok', riskLevel: 'low', jobId: 1 }),
    comment_count: 1,
    file_count: 2,
    issue_count: 0,
    started_at: '2026-03-08T10:00:00.000Z',
    completed_at: '2026-03-08T10:05:00.000Z',
    failed_at: null,
    error_message: null,
    created_at: '2026-03-08T09:58:00.000Z',
    updated_at: '2026-03-08T10:05:00.000Z',
    ...overrides,
  };
}

describe('pullRequestSummaries', () => {
  it('parses job payload and normalizes invalid numeric fields to undefined', () => {
    const job = makeJob({
      payload: JSON.stringify({
        platform: 'github',
        repo_name: 'mars167/CodaGraph-lite',
        pr_number: 'NaN',
        analysis_id: 'oops',
      }),
    });

    expect(parseJobPayload(job)).toEqual({
      platform: 'github',
      repoName: 'CodaGraph-lite',
      fullRepoName: 'mars167/CodaGraph-lite',
      prNumber: undefined,
      analysisId: undefined,
      headCommit: undefined,
      triggerSource: undefined,
    });
  });

  it('does not match jobs from repositories with the same name under a different owner', () => {
    const job = makeJob({
      payload: JSON.stringify({
        platform: 'github',
        repo_name: 'other-owner/CodaGraph-lite',
        pr_number: '42',
      }),
    });

    expect(matchesPullRequestJob(job, {
      platform: 'github',
      owner: 'mars167',
      repoName: 'CodaGraph-lite',
      prNumber: 42,
    })).toBe(false);
  });

  it('groups jobs by exact pull request target', () => {
    const analysis = makeAnalysis();
    const analysisById = new Map([[analysis.id, analysis]]);
    const grouped = indexJobsByPullRequest(
      [
        makeJob({ id: 1, payload: JSON.stringify({ platform: 'github', repo_name: 'mars167/CodaGraph-lite', pr_number: '42', analysis_id: '7' }) }),
        makeJob({ id: 2, payload: JSON.stringify({ platform: 'github', repo_name: 'mars167/CodaGraph-lite', pr_number: '43' }) }),
      ],
      analysisById
    );

    expect(grouped.size).toBe(2);
    expect(Array.from(grouped.values()).map((jobs) => jobs.length)).toEqual([1, 1]);
  });

  it('returns stable ordering when invalid date strings are present', () => {
    expect(compareDateDesc('invalid-date', '2026-03-08T10:00:00.000Z')).toBeGreaterThan(0);
    expect(compareDateDesc('2026-03-08T10:00:00.000Z', 'invalid-date')).toBeLessThan(0);
    expect(compareDateDesc('invalid-left', 'invalid-right')).toBe(0);
  });

  it('builds job summaries with camelCase fields and linked report info', () => {
    const analysis = makeAnalysis();
    const summary = buildPullRequestJobSummary(
      makeJob(),
      new Map([[analysis.id, analysis]])
    );

    expect(summary.createdAt).toBe('2026-03-08T09:59:00.000Z');
    expect(summary.updatedAt).toBe('2026-03-08T10:10:00.000Z');
    expect(summary.report?.analysisId).toBe(7);
  });

  it('derives a fallback high risk summary from issue count', () => {
    const risk = deriveRiskLevel(makeAnalysis({
      analysis_result: '{}',
      issue_count: 6,
      comment_count: 0,
    }));

    expect(risk).toEqual({
      level: 'high',
      summary: '发现 6 个问题',
    });
  });
});
