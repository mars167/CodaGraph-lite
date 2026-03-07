/**
 * 分析历史路由
 */

import express, { Request, Response } from 'express';
import { getAnalysisModel } from '../models/Analysis';
import { getAnalysisJobModel } from '../models/AnalysisJob';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import { getRepositoryModel } from '../models/Repository';
import { getQueueService } from '../jobs/QueueService';
import type { AnalysisStatus, Platform } from '../models/types';
import { createPlatformClient } from '../platform/client';
import type { ReviewFinding } from '../review/reviewEngine';
import {
  buildReviewReportFileContexts,
  type ReviewReportPatchFile,
  type ReviewReportFileContext,
  type StoredReviewReportFileReview,
} from '../review/reportPresentation';
import { getOAuthInstallationService } from '../services/OAuthInstallationService';

const router = express.Router();

interface StoredReviewReportPayload {
  summary?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  reportMarkdown?: string;
  findings?: ReviewFinding[];
  files?: ReviewReportPatchFile[];
  fileReviews?: StoredReviewReportFileReview[];
  fileContexts?: ReviewReportFileContext[];
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
      analyses: filtered.slice(offset, offset + limitNum),
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

    return res.json({ analysis });
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

    return res.json({ analysis, report });
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
    const queueResult = await queueService.createJob(
      'pr_analysis',
      {
        platform: analysis.platform,
        repo_name: `${analysis.owner}/${analysis.repo_name}`,
        pr_number: String(analysis.pr_number),
        analysis_id: String(cloned.id),
        analysis_job_id: String(analysisJob.id),
      },
      3
    );

    if (queueResult.error) {
      return res.status(400).json({ error: queueResult.error });
    }

    return res.json({
      success: true,
      analysis: analysisModel.findById(cloned.id),
      jobId: queueResult.id,
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
