/**
 * 仓库管理路由
 *
 * 提供仓库 CRUD API 端点
 */

import express, { Request, Response } from 'express';
import { getRepositoryModel } from '../models/Repository';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import { getAnalysisModel } from '../models/Analysis';
import { getAnalysisJobModel } from '../models/AnalysisJob';
import { getQueueService } from '../jobs/QueueService';
import { createPlatformClient } from '../platform/client';
import { getOAuthInstallationService } from '../services/OAuthInstallationService';
import { getReviewTriggerService } from '../services/ReviewTriggerService';
import type { Platform, CreateRepositoryDTO, Analysis, Job, ReviewReportSummary } from '../models/types';
import type { Repository as PlatformRepository, PullRequest as PlatformPullRequest } from '../platform/client';

const router = express.Router();

type RepositoryQuery = {
  platform?: Platform;
  page?: string;
  limit?: string;
};

type ReviewRiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

type PullRequestReviewSummary = {
  prNumber: number;
  title: string;
  author: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  updatedAt: string;
  reviewStatus: 'not_started' | 'pending' | 'processing' | 'completed' | 'failed';
  reviewProgress: number;
  latestAnalysisId: number | null;
  latestReviewJobId: number | null;
  latestReviewJobStatus: Job['status'] | null;
  latestReviewJobCreatedAt: string | null;
  lastReviewedAt: string | null;
  latestRiskLevel: ReviewRiskLevel;
  latestRiskSummary: string | null;
  commentCount: number;
  issueCount: number;
  fileCount: number;
  analysisJobStage: string | null;
  analysisJobMessage: string | null;
  reports: ReviewReportSummary[];
};

function normalizePullRequestState(state: string, mergedAt?: string | null): 'open' | 'closed' | 'merged' {
  if (mergedAt) {
    return 'merged';
  }
  if (state === 'opened') {
    return 'open';
  }
  return state === 'closed' ? 'closed' : 'open';
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
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

function deriveRiskLevel(analysis: Analysis | null): { level: ReviewRiskLevel; summary: string | null } {
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

function buildReportSummary(analysis: Analysis): ReviewReportSummary {
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

function parseJobPayload(job: Job): { repoName?: string; fullRepoName?: string; prNumber?: number } {
  const payload = parseJsonObject(job.payload);
  const rawRepoName = typeof payload?.repo_name === 'string' ? payload.repo_name : undefined;
  const rawPrNumber = payload?.pr_number;
  const prNumber = typeof rawPrNumber === 'number'
    ? rawPrNumber
    : typeof rawPrNumber === 'string'
      ? parseInt(rawPrNumber, 10)
      : undefined;

  return {
    repoName: rawRepoName?.includes('/') ? rawRepoName.split('/').pop() : rawRepoName,
    fullRepoName: rawRepoName,
    prNumber: Number.isNaN(prNumber) ? undefined : prNumber,
  };
}

function matchesRepositoryJob(job: Job, repository: { owner: string; name: string }, prNumber: number): boolean {
  const payload = parseJobPayload(job);
  if (payload.prNumber !== prNumber) {
    return false;
  }

  return payload.repoName === repository.name
    || payload.fullRepoName === `${repository.owner}/${repository.name}`;
}

function computeReviewProgress(
  analysis: Analysis | null,
  latestJob: Job | null,
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

function getReviewStatus(
  analysis: Analysis | null,
  latestJob: Job | null
): PullRequestReviewSummary['reviewStatus'] {
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

function normalizeRepositoryPayload(
  platform: Platform,
  installationId: number,
  repository: PlatformRepository
): CreateRepositoryDTO {
  return {
    platform,
    remote_id: String(repository.id),
    owner: repository.owner.login,
    name: repository.name,
    full_name: repository.full_name,
    description: repository.description,
    is_private: repository.private,
    language: repository.language,
    stars_count: repository.stargazers_count,
    forks_count: repository.forks_count,
    default_branch: repository.default_branch,
    html_url: repository.html_url,
    installation_id: installationId,
    is_active: true,
  };
}

async function hydrateRepositoryCache(platform?: Platform) {
  const installationModel = getOAuthInstallationModel();
  const repositoryModel = getRepositoryModel();
  const installations = platform
    ? installationModel.findActiveByPlatform(platform)
    : installationModel.findActive();

  if (installations.length === 0) {
    return [];
  }

  const syncedRepositories = await Promise.allSettled(
    installations.map(async (installation) => {
      const validInstallation = await getOAuthInstallationService().ensureValidAccessToken(installation);
      const client = createPlatformClient(validInstallation.platform, validInstallation.access_token, {
        authType: validInstallation.auth_type || 'oauth',
        githubAppInstallationId: validInstallation.github_app_installation_id || null,
      });
      const remoteRepositories = await client.getRepositories({ per_page: 100 });
      const activeFullNames = remoteRepositories.map((repository) => repository.full_name);

      repositoryModel.deactivateMissingForInstallation(
        installation.id,
        activeFullNames
      );

      return remoteRepositories.map((repository) =>
        repositoryModel.upsert(
          normalizeRepositoryPayload(
            validInstallation.platform,
            validInstallation.id,
            repository
          )
        )
      );
    })
  );

  return syncedRepositories.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    const installation = installations[index];
    console.error(
      `同步 ${installation.platform}:${installation.account_name || installation.account_id} 仓库失败:`,
      result.reason
    );
    return [];
  });
}

/**
 * 获取仓库列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { platform, page = '1', limit = '20' } = req.query as RepositoryQuery;

    const installationModel = getOAuthInstallationModel();
    const repositoryModel = getRepositoryModel();
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const safePage = Number.isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const safeLimit = Number.isNaN(limitNum) || limitNum < 1 ? 20 : limitNum;
    const activeInstallations = platform
      ? installationModel.findActiveByPlatform(platform)
      : installationModel.findActive();
    const activeInstallationIds = new Set(activeInstallations.map((installation) => installation.id));

    await hydrateRepositoryCache(platform);

    const allRepositories = (platform
      ? repositoryModel.findActiveByPlatform(platform)
      : repositoryModel.findAll({
          sortOrder: 'DESC',
        }))
      .filter((repository) => activeInstallationIds.has(repository.installation_id));
    const offset = (safePage - 1) * safeLimit;
    const repositories = allRepositories.slice(offset, offset + safeLimit);

    const totalCount = allRepositories.length;

    return res.json({
      repositories,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / safeLimit),
      },
    });
  } catch (error) {
    console.error('获取仓库列表失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 获取指定仓库
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const repositoryModel = getRepositoryModel();
    const repository = repositoryModel.findById(id);

    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    return res.json({ repository });
  } catch (error) {
    console.error('获取仓库失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/:id/pull-requests', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    const state = (Array.isArray(req.query.state) ? req.query.state[0] : req.query.state) as string | undefined;
    const page = parseInt((Array.isArray(req.query.page) ? req.query.page[0] : req.query.page || '1') as string, 10);
    const limit = parseInt((Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit || '20') as string, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const repositoryModel = getRepositoryModel();
    const repository = repositoryModel.findById(id);
    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

      const installation = getOAuthInstallationModel().findById(repository.installation_id);
      if (!installation || !installation.is_active) {
        return res.status(400).json({ error: '仓库关联的 OAuth 安装不可用' });
      }

      const validInstallation = await getOAuthInstallationService().ensureValidAccessToken(installation);
      const client = createPlatformClient(repository.platform, validInstallation.access_token, {
        authType: validInstallation.auth_type || 'oauth',
        githubAppInstallationId: validInstallation.github_app_installation_id || null,
      });
      const remotePullRequests = await client.listPullRequests(
        repository.owner,
        repository.name,
      {
        state: state === 'all' || state === 'closed' || state === 'open' ? state : 'open',
        page: Number.isNaN(page) || page < 1 ? 1 : page,
        per_page: Number.isNaN(limit) || limit < 1 ? 20 : limit,
      }
    );

    const analysisModel = getAnalysisModel();
    const analysisJobModel = getAnalysisJobModel();
    const jobModel = getQueueService().getJobModel();
    const analyses = analysisModel.findByRepository(repository.platform, repository.owner, repository.name, {
      limit: 200,
      sortBy: 'created_at',
      sortOrder: 'DESC',
    });
    const latestAnalysisByPr = new Map<number, Analysis>();
    const analysesByPr = new Map<number, Analysis[]>();

    for (const analysis of analyses) {
      const existing = analysesByPr.get(analysis.pr_number) || [];
      existing.push(analysis);
      analysesByPr.set(analysis.pr_number, existing);
      if (!latestAnalysisByPr.has(analysis.pr_number)) {
        latestAnalysisByPr.set(analysis.pr_number, analysis);
      }
    }

    const recentJobs = jobModel.findByType('pr_analysis', 200);

    const pullRequests: PullRequestReviewSummary[] = remotePullRequests.map((pullRequest: PlatformPullRequest) => {
      const providerAuthor = (pullRequest as PlatformPullRequest & {
        author?: { username?: string };
      }).author?.username;
      const latestAnalysis = latestAnalysisByPr.get(pullRequest.number) || null;
      const reportHistory = (analysesByPr.get(pullRequest.number) || [])
        .filter((analysis) => analysis.status === 'completed' || analysis.status === 'failed' || analysis.status === 'cancelled')
        .slice(0, 5)
        .map(buildReportSummary);
      const latestAnalysisJob = latestAnalysis
        ? analysisJobModel.findByAnalysisId(latestAnalysis.id).slice(-1)[0] || null
        : null;
      const latestJob = recentJobs.find((job) =>
        matchesRepositoryJob(job, repository, pullRequest.number)
      ) || null;
      const risk = deriveRiskLevel(latestAnalysis);

      return {
        prNumber: pullRequest.number,
        title: pullRequest.title,
        author: pullRequest.user?.login || providerAuthor || 'unknown',
        url: pullRequest.html_url,
        state: normalizePullRequestState(pullRequest.state, pullRequest.merged_at),
        createdAt: pullRequest.created_at,
        updatedAt: pullRequest.updated_at,
        reviewStatus: getReviewStatus(latestAnalysis, latestJob),
        reviewProgress: computeReviewProgress(latestAnalysis, latestJob, latestAnalysisJob),
        latestAnalysisId: latestAnalysis?.id || null,
        latestReviewJobId: latestJob?.id || null,
        latestReviewJobStatus: latestJob?.status || null,
        latestReviewJobCreatedAt: latestJob?.created_at ? String(latestJob.created_at) : null,
        lastReviewedAt: latestAnalysis?.completed_at ? String(latestAnalysis.completed_at) : latestAnalysis?.updated_at ? String(latestAnalysis.updated_at) : null,
        latestRiskLevel: risk.level,
        latestRiskSummary: risk.summary,
        commentCount: latestAnalysis?.comment_count || 0,
        issueCount: latestAnalysis?.issue_count || 0,
        fileCount: latestAnalysis?.file_count || 0,
        analysisJobStage: latestAnalysisJob?.stage || null,
        analysisJobMessage: latestAnalysisJob?.message || null,
        reports: reportHistory,
      };
    });

    return res.json({
      repository,
      pullRequests,
      pagination: {
        page: Number.isNaN(page) || page < 1 ? 1 : page,
        limit: Number.isNaN(limit) || limit < 1 ? 20 : limit,
        total: pullRequests.length,
        totalPages: pullRequests.length === 0 ? 0 : 1,
      },
    });
  } catch (error) {
    console.error('获取仓库 PR 列表失败:', error);
    const message = (error as Error).message;
    const statusCode = /重新授权|OAuth token|401 Unauthorized/.test(message) ? 401 : 500;
    return res.status(statusCode).json({
      error: statusCode === 401 ? 'OAuth 授权已失效，请重新授权 GitHub' : '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.post('/:id/pull-requests/:prNumber/review', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const prNumberParam = Array.isArray(req.params.prNumber) ? req.params.prNumber[0] : req.params.prNumber;
    const id = parseInt(idParam, 10);
    const prNumber = parseInt(prNumberParam, 10);

    if (isNaN(id) || isNaN(prNumber)) {
      return res.status(400).json({ error: '无效的参数' });
    }

    const result = await getReviewTriggerService().triggerByRepositoryId(id, prNumber, {
      source: 'manual',
      priority: 2,
      force: true,
    });

    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      analysis: result.analysis,
      analysisJob: result.analysisJob,
      jobId: result.jobId,
      message: result.message,
    });
  } catch (error) {
    console.error('创建手动 review 失败:', error);
    const message = (error as Error).message;
    const statusCode = /重新授权|OAuth token|401 Unauthorized/.test(message) ? 401 : 500;
    return res.status(statusCode).json({
      error: statusCode === 401 ? 'OAuth 授权已失效，请重新授权 GitHub' : '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.patch('/:id/watch', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const repositoryModel = getRepositoryModel();
    const repository = repositoryModel.findById(id);
    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    const requestedEnabled = typeof req.body?.enabled === 'boolean'
      ? req.body.enabled
      : !repository.watch_enabled;

    const updated = repositoryModel.update(id, {
      watch_enabled: requestedEnabled,
    });

    return res.json({
      success: true,
      repository: updated,
      message: `仓库 Watch 已${requestedEnabled ? '开启' : '关闭'}`,
    });
  } catch (error) {
    console.error('切换仓库 Watch 状态失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/:id/pull-requests/:prNumber/reports', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const prNumberParam = Array.isArray(req.params.prNumber) ? req.params.prNumber[0] : req.params.prNumber;
    const id = parseInt(idParam, 10);
    const prNumber = parseInt(prNumberParam, 10);

    if (isNaN(id) || isNaN(prNumber)) {
      return res.status(400).json({ error: '无效的参数' });
    }

    const repository = getRepositoryModel().findById(id);
    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    const reports = getAnalysisModel()
      .findByRepository(repository.platform, repository.owner, repository.name, {
        limit: 200,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      })
      .filter((analysis) => analysis.pr_number === prNumber)
      .map(buildReportSummary);

    return res.json({
      repository,
      prNumber,
      reports,
    });
  } catch (error) {
    console.error('获取 PR 审查报告列表失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const repositoryModel = getRepositoryModel();
    const repository = repositoryModel.findById(id);
    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    const updated = repositoryModel.update(id, {
      is_active: !repository.is_active,
    });

    return res.json({
      success: true,
      repository: updated,
      message: `仓库已${repository.is_active ? '停用' : '激活'}`,
    });
  } catch (error) {
    console.error('切换仓库状态失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 创建仓库
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      platform,
      owner,
      name,
      full_name,
      installation_id,
      is_active = true,
    } = req.body as CreateRepositoryDTO;

    // 验证 OAuth 安装存在
    const installationModel = getOAuthInstallationModel();
    const installation = installationModel.findById(installation_id);

    if (!installation) {
      return res.status(400).json({
        error: 'OAuth 安装不存在',
      });
    }

    // 验证平台匹配
    if (installation.platform !== platform) {
      return res.status(400).json({
        error: '平台与 OAuth 安装不匹配',
      });
    }

    const repositoryModel = getRepositoryModel();

    // 检查仓库是否已存在
    const existing = repositoryModel.findByPlatformOwnerName(platform, owner, name);
    if (existing) {
      return res.status(409).json({
        error: '仓库已存在',
        repository: existing,
      });
    }

    // 创建新仓库
    const createDto: CreateRepositoryDTO = {
      platform,
      owner,
      name,
      full_name,
      installation_id,
      is_active,
    };

    const created = repositoryModel.create(createDto);

    console.log(`📦 创建仓库: ${full_name}`);

    return res.status(201).json({
      success: true,
      message: '仓库创建成功',
      repository: created,
    });
  } catch (error) {
    console.error('创建仓库失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 更新仓库
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const { is_active, webhook_id, webhook_secret } = req.body as Partial<CreateRepositoryDTO>;

    const repositoryModel = getRepositoryModel();
    const existing = repositoryModel.findById(id);

    if (!existing) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    // 更新仓库
    const updated = repositoryModel.update(id, {
      is_active,
      webhook_id,
      webhook_secret,
    });

    console.log(`📦 更新仓库: ${existing.full_name}`);

    return res.json({
      success: true,
      message: '仓库更新成功',
      repository: updated,
    });
  } catch (error) {
    console.error('更新仓库失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 删除仓库
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const repositoryModel = getRepositoryModel();
    const existing = repositoryModel.findById(id);

    if (!existing) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    // 删除 Webhook（如果存在）
    if (existing.webhook_id) {
      try {
        const installationModel = getOAuthInstallationModel();
        const installation = installationModel.findById(existing.installation_id);

        if (installation) {
          const client = createPlatformClient(existing.platform, installation.access_token, {
            authType: installation.auth_type || 'oauth',
            githubAppInstallationId: installation.github_app_installation_id || null,
          });
          await client.deleteWebhook(existing.owner, existing.name, existing.webhook_id);
          console.log(`🪝 删除 Webhook: ${existing.full_name}`);
        }
      } catch (error) {
        console.error('删除 Webhook 失败:', error);
      }
    }

    // 删除仓库
    const success = repositoryModel.delete(id);

    if (!success) {
      return res.status(404).json({ error: '仓库不存在或操作失败' });
    }

    console.log(`🗑 删除仓库: ${existing.full_name}`);

    return res.json({
      success: true,
      message: '仓库删除成功',
    });
  } catch (error) {
    console.error('删除仓库失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 激活仓库
 */
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const repositoryModel = getRepositoryModel();
    const existing = repositoryModel.findById(id);

    if (!existing) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    repositoryModel.activate(id);
    const repository = repositoryModel.findById(id);

    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    console.log(`✅ 激活仓库: ${repository.full_name}`);

    return res.json({
      success: true,
      message: '仓库激活成功',
      repository,
    });
  } catch (error) {
    console.error('激活仓库失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 停用仓库
 */
router.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const repositoryModel = getRepositoryModel();
    const existing = repositoryModel.findById(id);

    if (!existing) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    repositoryModel.deactivate(id);
    const repository = repositoryModel.findById(id);

    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    console.log(`⏸️ 停用仓库: ${repository.full_name}`);

    return res.json({
      success: true,
      message: '仓库停用成功',
      repository,
    });
  } catch (error) {
    console.error('停用仓库失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 配置 Webhook
 */
router.post('/:id/webhook', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const { webhook_url } = req.body as { webhook_url?: string };
    if (!webhook_url) {
      return res.status(400).json({ error: '缺少 webhook_url 参数' });
    }

    const repositoryModel = getRepositoryModel();
    const repository = repositoryModel.findById(id);

    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    // 获取 OAuth 安装
    const installationModel = getOAuthInstallationModel();
    const installation = installationModel.findById(repository.installation_id);

    if (!installation) {
      return res.status(400).json({
        error: 'OAuth 安装不存在',
      });
    }

    // 创建 Webhook
    const client = createPlatformClient(repository.platform, installation.access_token, {
      authType: installation.auth_type || 'oauth',
      githubAppInstallationId: installation.github_app_installation_id || null,
    });
    const webhookResponse = await client.createWebhook(
      repository.owner,
      repository.name,
      {
        url: webhook_url,
        content_type: 'json',
      }
    );

    // 更新仓库记录
    const webhookSecret = generateWebhookSecret();
    const updated = repositoryModel.update(id, {
      webhook_id: webhookResponse.id.toString(),
      webhook_secret: webhookSecret,
      webhook_url,
    });

    console.log(`🪝 配置 Webhook: ${repository.full_name}`);

    return res.json({
      success: true,
      message: 'Webhook 配置成功',
      webhook: webhookResponse,
      repository: updated,
    });
  } catch (error) {
    console.error('配置 Webhook 失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 删除 Webhook
 */
router.delete('/:id/webhook', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const repositoryModel = getRepositoryModel();
    const repository = repositoryModel.findById(id);

    if (!repository) {
      return res.status(404).json({ error: '仓库不存在' });
    }

    if (!repository.webhook_id) {
      return res.status(400).json({
        error: '该仓库没有配置 Webhook',
      });
    }

    // 获取 OAuth 安装
    const installationModel = getOAuthInstallationModel();
    const installation = installationModel.findById(repository.installation_id);

    if (!installation) {
      return res.status(400).json({
        error: 'OAuth 安装不存在',
      });
    }

    // 删除 Webhook
    const client = createPlatformClient(repository.platform, installation.access_token, {
      authType: installation.auth_type || 'oauth',
      githubAppInstallationId: installation.github_app_installation_id || null,
    });
    await client.deleteWebhook(
      repository.owner,
      repository.name,
      repository.webhook_id
    );

    // 更新仓库记录
    const updated = repositoryModel.update(id, {
      webhook_id: null,
      webhook_secret: null,
      webhook_url: null,
    });

    console.log(`🪝 删除 Webhook: ${repository.full_name}`);

    return res.json({
      success: true,
      message: 'Webhook 删除成功',
      repository: updated,
    });
  } catch (error) {
    console.error('删除 Webhook 失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 生成 Webhook 密钥
 */
function generateWebhookSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint32Array(32);
  crypto.getRandomValues(array);

  let secret = '';
  for (let i = 0; i < 32; i++) {
    secret += chars[array[i] % chars.length];
  }

  return secret;
}

export default router;
