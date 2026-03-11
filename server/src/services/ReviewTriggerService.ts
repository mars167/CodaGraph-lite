import { getAnalysisJobModel } from '../models/AnalysisJob';
import { getAnalysisModel } from '../models/Analysis';
import { getJobLogModel } from '../models/JobLog';
import { getJobModel } from '../models/Job';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import { getRepositoryModel } from '../models/Repository';
import { getReviewLockModel } from '../models/ReviewLock';
import type { Repository as CachedRepository, Analysis, AnalysisJob, Job, Platform } from '../models/types';
import type { PullRequest as PlatformPullRequest } from '../platform/client';
import { createPlatformClient } from '../platform/client';
import { getQueueService } from '../jobs/QueueService';
import { getOAuthInstallationService } from './OAuthInstallationService';
import { resolveRepositoryCoordinates } from '../utils/repositoryCoordinates';

export type ReviewTriggerSource = 'manual' | 'watch' | 'webhook';

export class ReviewTriggerError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ReviewTriggerError';
    this.statusCode = statusCode;
  }
}

interface TriggerReviewOptions {
  source: ReviewTriggerSource;
  priority?: number;
  force?: boolean;
  pullRequest?: PlatformPullRequest;
  reviewMode?: 'normal' | 'improve';
}

export interface TriggerReviewResult {
  created: boolean;
  analysis: Analysis | null;
  analysisJob: AnalysisJob | null;
  jobId: number | null;
  message: string;
  reason: 'queued' | 'locked' | 'already_reviewed' | 'in_progress';
}

const ACTIVE_JOB_STATUSES = new Set<Job['status']>(['pending', 'processing']);
const LOCK_GRACE_PERIOD_MS = 90_000;

export class ReviewTriggerService {
  private repositoryModel = getRepositoryModel();
  private oauthInstallationModel = getOAuthInstallationModel();
  private oauthInstallationService = getOAuthInstallationService();
  private analysisModel = getAnalysisModel();
  private analysisJobModel = getAnalysisJobModel();
  private reviewLockModel = getReviewLockModel();
  private queueService = getQueueService();
  private jobModel = getJobModel();
  private jobLogModel = getJobLogModel();

  async triggerByRepositoryId(
    repositoryId: number,
    prNumber: number,
    options: TriggerReviewOptions
  ): Promise<TriggerReviewResult> {
    const repository = this.repositoryModel.findById(repositoryId);
    if (!repository) {
      throw new ReviewTriggerError('仓库不存在', 404);
    }

    return this.triggerForRepository(repository, prNumber, options);
  }

  async triggerForRepository(
    repository: CachedRepository,
    prNumber: number,
    options: TriggerReviewOptions
  ): Promise<TriggerReviewResult> {
    const repositoryCoordinates = resolveRepositoryCoordinates(repository);
    const pullRequest = options.pullRequest ?? await this.fetchPullRequest(repository, prNumber);
    const headCommit = pullRequest.head?.sha || pullRequest.head?.ref || '';

    if (!headCommit) {
      throw new Error(`无法获取 ${repository.full_name}#${prNumber} 的 head commit`);
    }

    const activeLock = this.resolveActiveLock(
      repository.platform,
      repositoryCoordinates.owner,
      repositoryCoordinates.repoName,
      prNumber,
      headCommit
    );
    if (activeLock) {
      return {
        created: false,
        analysis: activeLock.analysis_id ? this.analysisModel.findById(activeLock.analysis_id) : null,
        analysisJob: activeLock.analysis_id
          ? this.analysisJobModel.findByAnalysisId(activeLock.analysis_id).slice(-1)[0] || null
          : null,
        jobId: activeLock.job_id || null,
        message: `PR #${prNumber} 的最新提交已被锁定，跳过重复触发`,
        reason: 'locked',
      };
    }

    const latestAnalysis = this.analysisModel.findByPR(
      repository.platform,
      repositoryCoordinates.owner,
      repositoryCoordinates.repoName,
      prNumber
    );
    const latestJob = latestAnalysis ? this.jobModel.findLatestByAnalysisId(latestAnalysis.id) : null;

    if (!options.force && latestAnalysis?.head_commit === headCommit) {
      if (latestAnalysis.status === 'completed' || latestAnalysis.status === 'failed' || latestAnalysis.status === 'cancelled') {
        return {
          created: false,
          analysis: latestAnalysis,
          analysisJob: this.analysisJobModel.findByAnalysisId(latestAnalysis.id).slice(-1)[0] || null,
          jobId: latestJob?.id || null,
          message: `PR #${prNumber} 的最新提交已审查，无需重复触发`,
          reason: 'already_reviewed',
        };
      }

      if (latestJob && ACTIVE_JOB_STATUSES.has(latestJob.status)) {
        return {
          created: false,
          analysis: latestAnalysis,
          analysisJob: this.analysisJobModel.findByAnalysisId(latestAnalysis.id).slice(-1)[0] || null,
          jobId: latestJob.id,
          message: `PR #${prNumber} 的最新提交正在审查中`,
          reason: 'in_progress',
        };
      }
    }

    const lock = this.reviewLockModel.acquire({
      platform: repository.platform,
      owner: repositoryCoordinates.owner,
      repoName: repositoryCoordinates.repoName,
      prNumber,
      headCommit,
      source: options.source,
    });

    if (!lock) {
      const concurrentLock = this.resolveActiveLock(
        repository.platform,
        repositoryCoordinates.owner,
        repositoryCoordinates.repoName,
        prNumber,
        headCommit
      );
      return {
        created: false,
        analysis: concurrentLock?.analysis_id ? this.analysisModel.findById(concurrentLock.analysis_id) : null,
        analysisJob: concurrentLock?.analysis_id
          ? this.analysisJobModel.findByAnalysisId(concurrentLock.analysis_id).slice(-1)[0] || null
          : null,
        jobId: concurrentLock?.job_id || null,
        message: `PR #${prNumber} 的最新提交已有并发触发，已跳过`,
        reason: 'locked',
      };
    }

    const analysis = this.analysisModel.create({
      platform: repository.platform,
      owner: repositoryCoordinates.owner,
      repo_name: repositoryCoordinates.repoName,
      pr_number: prNumber,
      pr_title: pullRequest.title,
      pr_author: pullRequest.user?.login || 'unknown',
      base_commit: pullRequest.base?.sha || pullRequest.base?.ref || '',
      head_commit: headCommit,
    });
    const analysisJob = this.analysisJobModel.create(analysis.id, 'cloning');
    this.reviewLockModel.attach(lock.id, { analysisId: analysis.id });

    try {
      const queueResult = await this.queueService.createJob(
        'pr_analysis',
        {
          platform: repository.platform,
          repo_name: repositoryCoordinates.fullName,
          pr_number: String(prNumber),
          pr_title: pullRequest.title,
          pr_author: pullRequest.user?.login || 'unknown',
          repository_id: String(repository.id),
          analysis_id: String(analysis.id),
          analysis_job_id: String(analysisJob.id),
          head_commit: headCommit,
          trigger_source: options.source,
          review_mode: options.reviewMode || 'normal',
        },
        options.priority ?? this.defaultPriority(options.source)
      );

      if (queueResult.error) {
        throw new Error(queueResult.error);
      }

      this.reviewLockModel.attach(lock.id, { analysisId: analysis.id, jobId: queueResult.id });
      this.jobLogModel.create(
        queueResult.id,
        'info',
        `${this.describeSource(options.source)}触发 PR Review，关联分析 #${analysis.id}，仓库=${repository.full_name}，PR=#${prNumber}`
      );

      return {
        created: true,
        analysis,
        analysisJob,
        jobId: queueResult.id,
        message: 'PR review 已加入队列',
        reason: 'queued',
      };
    } catch (error) {
      this.analysisJobModel.delete(analysisJob.id);
      this.analysisModel.delete(analysis.id);
      this.reviewLockModel.release(lock.id);
      throw error;
    }
  }

  private async fetchPullRequest(
    repository: CachedRepository,
    prNumber: number
  ): Promise<PlatformPullRequest> {
    const installation = this.oauthInstallationModel.findById(repository.installation_id);
    if (!installation || !installation.is_active) {
      throw new ReviewTriggerError('仓库关联的 OAuth 安装不可用', 400);
    }

    const validInstallation = await this.oauthInstallationService.ensureValidAccessToken(installation);
    const client = createPlatformClient(repository.platform, validInstallation.access_token, {
      authType: validInstallation.auth_type || 'oauth',
      githubAppInstallationId: validInstallation.github_app_installation_id || null,
    });
    const repositoryCoordinates = resolveRepositoryCoordinates(repository);
    return client.getPullRequest(repositoryCoordinates.owner, repositoryCoordinates.repoName, prNumber);
  }

  private resolveActiveLock(
    platform: Platform,
    owner: string,
    repoName: string,
    prNumber: number,
    headCommit: string
  ) {
    const lock = this.reviewLockModel.findActive(platform, owner, repoName, prNumber, headCommit);
    if (!lock) {
      return null;
    }

    if (lock.job_id) {
      const job = this.jobModel.findById(lock.job_id);
      if (job && ACTIVE_JOB_STATUSES.has(job.status)) {
        return lock;
      }
      this.reviewLockModel.release(lock.id);
      return null;
    }

    const createdAt = new Date(lock.created_at).getTime();
    if (!Number.isNaN(createdAt) && Date.now() - createdAt > LOCK_GRACE_PERIOD_MS) {
      this.reviewLockModel.release(lock.id);
      return null;
    }

    return lock;
  }

  private defaultPriority(source: ReviewTriggerSource): number {
    switch (source) {
      case 'manual':
        return 2;
      case 'watch':
        return 3;
      case 'webhook':
      default:
        return 2;
    }
  }

  private describeSource(source: ReviewTriggerSource): string {
    switch (source) {
      case 'manual':
        return '手动';
      case 'watch':
        return 'Watch';
      case 'webhook':
        return 'Webhook';
    }
  }
}

let reviewTriggerService: ReviewTriggerService | null = null;

export function getReviewTriggerService(): ReviewTriggerService {
  if (!reviewTriggerService) {
    reviewTriggerService = new ReviewTriggerService();
  }
  return reviewTriggerService;
}
