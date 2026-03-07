import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import { getRepositoryModel } from '../models/Repository';
import type { Repository as CachedRepository } from '../models/types';
import type { PullRequest as PlatformPullRequest } from '../platform/client';
import { createPlatformClient } from '../platform/client';
import { logger } from '../utils/logger';
import { getOAuthInstallationService } from './OAuthInstallationService';
import { getReviewTriggerService } from './ReviewTriggerService';

interface RepositoryWatchServiceConfig {
  intervalMs?: number;
  perPage?: number;
}

export class RepositoryWatchService {
  private repositoryModel = getRepositoryModel();
  private oauthInstallationModel = getOAuthInstallationModel();
  private oauthInstallationService = getOAuthInstallationService();
  private reviewTriggerService = getReviewTriggerService();
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isTicking = false;
  private config: Required<RepositoryWatchServiceConfig>;

  constructor(config: RepositoryWatchServiceConfig = {}) {
    this.config = {
      intervalMs: config.intervalMs ?? 60_000,
      perPage: config.perPage ?? 50,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info(`✅ Repository Watcher 已启动，轮询间隔 ${this.config.intervalMs}ms`);
    await this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (!this.isRunning || this.isTicking) {
      return;
    }

    this.isTicking = true;
    try {
      const watchedRepositories = this.repositoryModel.findWatchedActive();
      if (watchedRepositories.length === 0) {
        return;
      }

      for (const repository of watchedRepositories) {
        await this.processRepository(repository);
      }
    } finally {
      this.isTicking = false;
    }
  }

  private async processRepository(repository: CachedRepository): Promise<void> {
    try {
      const installation = this.oauthInstallationModel.findById(repository.installation_id);
      if (!installation || !installation.is_active) {
        logger.warn(`⚠️ Watch 跳过 ${repository.full_name}，OAuth 安装不可用`);
        return;
      }

      const validInstallation = await this.oauthInstallationService.ensureValidAccessToken(installation);
      const client = createPlatformClient(repository.platform, validInstallation.access_token, {
        authType: validInstallation.auth_type || 'oauth',
        githubAppInstallationId: validInstallation.github_app_installation_id || null,
      });
      const pullRequests = await this.listOpenPullRequests(client, repository.owner, repository.name);

      let queuedCount = 0;
      let failedCount = 0;
      for (const pullRequest of pullRequests) {
        try {
          const result = await this.reviewTriggerService.triggerForRepository(repository, pullRequest.number, {
            source: 'watch',
            priority: 3,
            force: false,
            pullRequest,
          });

          if (result.created) {
            queuedCount += 1;
          }
        } catch (error) {
          failedCount += 1;
          logger.warn(
            `⚠️ Watch 触发 ${repository.full_name}#${pullRequest.number} 失败: ${(error as Error).message}`
          );
        }
      }

      this.repositoryModel.updateWatchCheck(repository.id, new Date());
      logger.info(
        `👀 Watch 检查完成 ${repository.full_name}，open PR=${pullRequests.length}，新入队=${queuedCount}，失败=${failedCount}`
      );
    } catch (error) {
      logger.warn(`⚠️ Watch 检查 ${repository.full_name} 失败: ${(error as Error).message}`);
    }
  }

  private async listOpenPullRequests(
    client: ReturnType<typeof createPlatformClient>,
    owner: string,
    repoName: string
  ): Promise<PlatformPullRequest[]> {
    const items: PlatformPullRequest[] = [];
    let page = 1;

    while (true) {
      const batch = await client.listPullRequests(owner, repoName, {
        state: 'open',
        page,
        per_page: this.config.perPage,
      });

      items.push(...batch);
      if (batch.length < this.config.perPage) {
        break;
      }

      page += 1;
      if (page > 5) {
        break;
      }
    }

    return items;
  }
}
