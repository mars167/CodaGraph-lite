/**
 * 分析历史路由
 */

import express, { Request, Response } from 'express';
import { getAnalysisModel } from '../models/Analysis';
import { getAnalysisJobModel } from '../models/AnalysisJob';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import { getRepositoryModel } from '../models/Repository';
import { getQueueService } from '../jobs/QueueService';
import type { Analysis, AnalysisStatus, Platform } from '../models/types';
import { createPlatformClient } from '../platform/client';
import type { ReviewFinding } from '../review/reviewEngine';
import {
  buildPullRequestKey,
  buildPullRequestJobSummary,
  buildRepositoryKey,
  buildPullRequestUrl,
  buildReportSummary,
  compareDateDesc,
  computeReviewProgress,
  deriveRiskLevel,
  getReviewStatus,
  indexJobsByPullRequest,
  pickMostRecentDate,
} from '../review/pullRequestSummaries';
import { normalizeApiTimestamp } from '../utils/time';
import {
  buildReviewReportFileContexts,
  type ReviewReportPatchFile,
  type ReviewReportFileContext,
  type StoredReviewReportFileReview,
} from '../review/reportPresentation';
import { getOAuthInstallationService } from '../services/OAuthInstallationService';
import type { ReviewTracePayload } from '../review/reviewTrace';
import type { ReviewCoverageSummary, ReviewConfidence, SuppressedFinding } from '../review/reviewPrioritization';

const router = express.Router();

interface StoredReviewReportPayload {
  summary?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  confidence?: ReviewConfidence;
  reviewMode?: 'normal' | 'improve';
  reportMarkdown?: string;
  findings?: ReviewFinding[];
  files?: ReviewReportPatchFile[];
  fileReviews?: StoredReviewReportFileReview[];
  fileContexts?: ReviewReportFileContext[];
  coverage?: ReviewCoverageSummary;
  nextActions?: string[];
  suppressedFindings?: SuppressedFinding[];
  trace?: ReviewTracePayload;
  postedCommentCount?: number;
  jobId?: string | number;
  generatedAt?: string;
}

interface PlatformPullRequestFile {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  previous_filename?: string;
  patch?: string;
}

function serializeAnalysis(analysis: Analysis | null) {
  if (!analysis) {
    return null;
  }

  return {
    ...analysis,
    created_at: normalizeApiTimestamp(analysis.created_at) || '',
    started_at: normalizeApiTimestamp(analysis.started_at),
    completed_at: normalizeApiTimestamp(analysis.completed_at),
    failed_at: normalizeApiTimestamp(analysis.failed_at),
    updated_at: normalizeApiTimestamp(analysis.updated_at) || normalizeApiTimestamp(analysis.created_at) || '',
  };
}

router.get('/pull-requests', async (req: Request, res: Response) => {
  try {
    const {
      status,
      platform,
      page = '1',
      limit = '20',
    } = req.query as {
      status?: AnalysisStatus;
      platform?: Platform;
      page?: string;
      limit?: string;
    };

    const analysisModel = getAnalysisModel();
    const repositoryModel = getRepositoryModel();
    const jobModel = getQueueService().getJobModel();
    const analyses = analysisModel.findAll({
      limit: 1000,
      sortBy: 'updated_at',
      sortOrder: 'DESC',
    });
    const recentJobs = jobModel.findByType('pr_analysis', 1000);
    const repositories = repositoryModel.findAll({
      limit: 1000,
      sortBy: 'updated_at',
      sortOrder: 'DESC',
    });

    const analysisById = new Map(analyses.map((analysis) => [analysis.id, analysis]));
    const repositoryByKey = new Map(
      repositories.map((repository) => [
        buildRepositoryKey(repository.platform, repository.owner, repository.name),
        repository,
      ])
    );
    const jobsByPr = indexJobsByPullRequest(recentJobs, analysisById);
    const analysesByPr = new Map<string, {
      target: {
        platform: Platform;
        owner: string;
        repoName: string;
        prNumber: number;
      };
      analyses: typeof analyses;
    }>();

    for (const analysis of analyses) {
      const target = {
        platform: analysis.platform,
        owner: analysis.owner,
        repoName: analysis.repo_name,
        prNumber: analysis.pr_number,
      };
      const key = buildPullRequestKey(target);
      const existing = analysesByPr.get(key);
      if (existing) {
        existing.analyses.push(analysis);
        continue;
      }

      analysesByPr.set(key, { target, analyses: [analysis] });
    }

    const groups = Array.from(analysesByPr.values()).map(({ target, analyses: prAnalyses }) => {
      const latestAnalysis = prAnalyses[0] || null;
      const repository = repositoryByKey.get(
        buildRepositoryKey(target.platform, target.owner, target.repoName)
      ) || null;
      const jobs = (jobsByPr.get(buildPullRequestKey(target)) || [])
        .map((job) => buildPullRequestJobSummary(job, analysisById))
        .sort((left, right) => compareDateDesc(left.updatedAt, right.updatedAt));
      const latestJob = jobs[0] || null;
      const risk = deriveRiskLevel(latestAnalysis);
      const reports = prAnalyses
        .filter((analysis) => analysis.status === 'completed' || analysis.status === 'failed' || analysis.status === 'cancelled')
        .slice(0, 5)
        .map(buildReportSummary);
      const lastActivityAt = pickMostRecentDate([
        latestJob?.updatedAt,
        latestAnalysis?.updated_at ? String(latestAnalysis.updated_at) : null,
        latestAnalysis?.completed_at ? String(latestAnalysis.completed_at) : null,
        reports[0]?.completedAt ? String(reports[0].completedAt) : null,
        reports[0]?.createdAt ? String(reports[0].createdAt) : null,
      ]) || new Date(0).toISOString();

      return {
        repositoryId: repository?.id || null,
        repositoryFullName: repository?.full_name || `${target.owner}/${target.repoName}`,
        repositoryUrl: repository?.html_url || null,
        repositoryWatchEnabled: Boolean(repository?.watch_enabled),
        platform: target.platform,
        owner: target.owner,
        repoName: target.repoName,
        prNumber: target.prNumber,
        title: latestAnalysis?.pr_title || `PR #${target.prNumber}`,
        author: latestAnalysis?.pr_author || 'unknown',
        url: buildPullRequestUrl(target.platform, target.owner, target.repoName, target.prNumber),
        reviewStatus: getReviewStatus(latestAnalysis, latestJob),
        reviewProgress: computeReviewProgress(latestAnalysis, latestJob, null),
        latestAnalysisId: latestAnalysis?.id || null,
        latestReviewJobId: latestJob?.id || null,
        latestReviewJobStatus: latestJob?.status || null,
        latestReviewJobCreatedAt: latestJob?.createdAt || null,
        lastReviewedAt: latestAnalysis?.completed_at ? String(latestAnalysis.completed_at) : latestAnalysis?.updated_at ? String(latestAnalysis.updated_at) : null,
        latestRiskLevel: risk.level,
        latestRiskSummary: risk.summary,
        commentCount: latestAnalysis?.comment_count || 0,
        issueCount: latestAnalysis?.issue_count || 0,
        fileCount: latestAnalysis?.file_count || 0,
        latestHeadCommit: latestJob?.headCommit || latestAnalysis?.head_commit || null,
        lastActivityAt,
        jobCount: jobs.length,
        jobs,
        reports,
      };
    });

    const filtered = groups
      .filter((group) => (platform ? group.platform === platform : true))
      .filter((group) => (status ? group.reviewStatus === status : true))
      .sort((left, right) => compareDateDesc(left.lastActivityAt, right.lastActivityAt));

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const safePage = Number.isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const safeLimit = Math.min(Number.isNaN(limitNum) || limitNum < 1 ? 20 : limitNum, 100);
    const offset = (safePage - 1) * safeLimit;

    return res.json({
      pullRequests: filtered.slice(offset, offset + safeLimit),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / safeLimit),
      },
    });
  } catch (error) {
    console.error('获取 PR 维度分析历史失败:', error);
    const response: { error: string; details?: string } = {
      error: '内部服务器错误',
    };
    if (process.env.NODE_ENV === 'development') {
      response.details = (error as Error).message;
    }
    return res.status(500).json(response);
  }
});

function parseReportPayload(raw: string): StoredReviewReportPayload | null {
  try {
    return JSON.parse(raw) as StoredReviewReportPayload;
  } catch {
    return null;
  }
}

async function loadLivePatchFiles(params: {
  platform: Platform;
  owner: string;
  repoName: string;
  prNumber: number;
}): Promise<ReviewReportPatchFile[]> {
  const repository = getRepositoryModel().findByPlatformOwnerName(
    params.platform,
    params.owner,
    params.repoName
  );

  if (!repository) {
    return [];
  }

  const installation = getOAuthInstallationModel().findById(repository.installation_id);
  if (!installation || !installation.is_active) {
    return [];
  }

  try {
    const validInstallation = await getOAuthInstallationService().ensureValidAccessToken(installation);
    const client = createPlatformClient(
      params.platform,
      validInstallation.access_token,
      {
        authType: validInstallation.auth_type || 'oauth',
        githubAppInstallationId: validInstallation.github_app_installation_id || null,
      }
    );

    const files = await client.getPullRequestFiles(params.owner, params.repoName, params.prNumber) as PlatformPullRequestFile[];
    return files.map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      changes: file.changes ?? ((file.additions ?? 0) + (file.deletions ?? 0)),
      previousPath: file.previous_filename,
      patch: file.patch,
    }));
  } catch (error) {
    console.warn(
      `获取 PR 实时 patch 失败: ${params.owner}/${params.repoName}#${params.prNumber} - ${(error as Error).message}`
    );
    return [];
  }
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      platform,
      page = '1',
      limit = '20',
    } = req.query as {
      status?: AnalysisStatus;
      platform?: Platform;
      page?: string;
      limit?: string;
    };

    const analysisModel = getAnalysisModel();
    const allAnalyses = analysisModel.findAll({
      sortBy: 'created_at',
      sortOrder: 'DESC',
    });
    const filtered = allAnalyses.filter((item) => {
      const matchesStatus = status ? item.status === status : true;
      const matchesPlatform = platform ? item.platform === platform : true;
      return matchesStatus && matchesPlatform;
    });

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    return res.json({
      analyses: filtered.slice(offset, offset + limitNum).map((analysis) => serializeAnalysis(analysis)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limitNum),
      },
    });
  } catch (error) {
    console.error('获取分析列表失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const analysis = getAnalysisModel().findById(id);
    if (!analysis) {
      return res.status(404).json({ error: '分析记录不存在' });
    }

    return res.json({ analysis: serializeAnalysis(analysis) });
  } catch (error) {
    console.error('获取分析详情失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/:id/report', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const analysis = getAnalysisModel().findById(id);
    if (!analysis) {
      return res.status(404).json({ error: '分析记录不存在' });
    }

    const storedReport = parseReportPayload(analysis.analysis_result);
    let report: StoredReviewReportPayload | null = storedReport;

    if (storedReport) {
      const livePatchFiles = await loadLivePatchFiles({
        platform: analysis.platform,
        owner: analysis.owner,
        repoName: analysis.repo_name,
        prNumber: analysis.pr_number,
      });

      report = {
        ...storedReport,
        fileContexts: buildReviewReportFileContexts({
          findings: Array.isArray(storedReport.findings) ? storedReport.findings : [],
          files: Array.isArray(storedReport.files) ? storedReport.files : [],
          fileReviews: Array.isArray(storedReport.fileReviews) ? storedReport.fileReviews : [],
          patchFiles: livePatchFiles,
        }),
      };
    }

    return res.json({
      analysis: serializeAnalysis(analysis),
      report: report
        ? {
            ...report,
            generatedAt: normalizeApiTimestamp(report.generatedAt) || report.generatedAt,
          }
        : report,
    });
  } catch (error) {
    console.error('获取分析报告失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const analysisModel = getAnalysisModel();
    const analysis = analysisModel.findById(id);
    if (!analysis) {
      return res.status(404).json({ error: '分析记录不存在' });
    }

    const cloned = analysisModel.create({
      platform: analysis.platform,
      owner: analysis.owner,
      repo_name: analysis.repo_name,
      pr_number: analysis.pr_number,
      pr_title: analysis.pr_title,
      pr_author: analysis.pr_author,
      base_commit: analysis.base_commit,
      head_commit: analysis.head_commit,
    });
    const analysisJob = getAnalysisJobModel().create(cloned.id, 'cloning');

    const queueService = getQueueService();
    const reviewMode = req.body?.mode === 'improve' ? 'improve' : 'normal';
    const queueResult = await queueService.createJob(
      'pr_analysis',
      {
        platform: analysis.platform,
        repo_name: `${analysis.owner}/${analysis.repo_name}`,
        pr_number: String(analysis.pr_number),
        analysis_id: String(cloned.id),
        analysis_job_id: String(analysisJob.id),
        review_mode: reviewMode,
      },
      3
    );

    if (queueResult.error) {
      return res.status(400).json({ error: queueResult.error });
    }

    return res.json({
      success: true,
      analysis: serializeAnalysis(analysisModel.findById(cloned.id)),
      jobId: queueResult.id,
      reviewMode,
      message: '分析已重新加入队列',
    });
  } catch (error) {
    console.error('重试分析失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

export default router;
