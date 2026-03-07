/**
 * PR Webhook 路由
 *
 * 处理来自 GitHub/Gitee/GitLab 的 Pull Request 事件
 * 创建 PR 分析作业并提交到队列
 */

import express, { Request, Response } from 'express';
import { getQueueService } from '../jobs/QueueService';
import { getInstallationModel } from '../models/Installation';
import { logger } from '../utils/logger';
import type { Platform } from '../models/types';
import crypto from 'crypto';

const router = express.Router();

/**
 * GitHub Webhook 密钥（从环境变量获取）
 */
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const GITEE_WEBHOOK_SECRET = process.env.GITEE_WEBHOOK_SECRET || '';
const GITLAB_WEBHOOK_SECRET = process.env.GITLAB_WEBHOOK_SECRET || '';

/**
 * 验证 Webhook 签名
 */
function verifyWebhookSignature(
  body: any,
  signature: string,
  secret: string
): boolean {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(bodyString);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  // 使用 constant-time 比较防止时序攻击
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

/**
 * 验证 GitLab Webhook 令牌
 */
function verifyGitLabToken(token: string, secret: string): boolean {
  return token === secret;
}

/**
 * 处理 PR Webhook
 */
router.post('/:platform', async (req: Request, res: Response) => {
  try {
    const platform = req.params.platform as Platform;

    // 验证平台
    if (!['github', 'gitee', 'gitlab'].includes(platform)) {
      return res.status(400).json({ error: '无效的平台' });
    }

    logger.info(`🔔 收到 ${platform} Webhook 请求`);

    // 验证签名
    const signature = req.headers['x-hub-signature'] ||
                      req.headers['x-gitee-token'] ||
                      req.headers['x-gitlab-token'];

    if (signature) {
      const secret = platform === 'github' ? GITHUB_WEBHOOK_SECRET :
                   platform === 'gitee' ? GITEE_WEBHOOK_SECRET :
                   GITLAB_WEBHOOK_SECRET;

      if (!secret) {
        logger.warn(`⚠️ 未配置 ${platform} Webhook 密钥`);
        return res.status(400).json({ error: 'Webhook 密钥未配置' });
      }

      const bodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      if (platform === 'gitlab') {
        if (!verifyGitLabToken(signature as string, secret)) {
          logger.warn(`⚠️ ${platform} Webhook 令牌验证失败`);
          return res.status(401).json({ error: '令牌验证失败' });
        }
      } else {
        if (!verifyWebhookSignature(bodyString, signature as string, secret)) {
          logger.warn(`⚠️ ${platform} Webhook 签名验证失败`);
          return res.status(401).json({ error: '签名验证失败' });
        }
      }
    }

    // 解析事件
    const eventHeader = req.headers['x-github-event'] ||
                 req.headers['x-gitee-event'] ||
                 req.headers['x-gitlab-event'];
    const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader;

    logger.info(`📨 事件类型: ${event}`);

    // 只处理 PR 相关事件
    if (!event || (
      platform === 'github' && !['pull_request', 'ping'].includes(event) ||
      platform === 'gitee' && !['Pull Request'].includes(event) ||
      platform === 'gitlab' && !['Merge Request Hook'].includes(event)
    )) {
      logger.info(`ℹ️ 忽略非 PR 事件: ${event}`);
      return res.status(200).json({ message: '已接收' });
    }

    // 解析 PR 信息
    const prInfo = parsePREvent(req.body, platform, event);

    if (!prInfo) {
      logger.warn('⚠️ 无法解析 PR 事件');
      return res.status(400).json({ error: '无法解析 PR 事件' });
    }

    // 只处理 opened、synchronize、reopened 事件
    if (!['opened', 'synchronize', 'reopened', 'open'].includes(prInfo.action)) {
      logger.info(`ℹ️ 忽略非分析事件: ${prInfo.action}`);
      return res.status(200).json({ message: '已接收' });
    }

    logger.info(`📋 PR #${prInfo.prNumber}: ${prInfo.action}`);
    logger.info(`   仓库: ${prInfo.owner}/${prInfo.repo}`);
    logger.info(`   标题: ${prInfo.title || 'N/A'}`);

    // 验证 OAuth 安装是否存在
    const installationModel = getInstallationModel();
    const installation = installationModel.findByPlatformAndAccount(
      prInfo.platform,
      prInfo.owner
    );

    if (!installation) {
      logger.warn(`⚠️ 未找到 OAuth 安装: ${prInfo.platform}/${prInfo.owner}`);
      return res.status(400).json({ error: 'OAuth 安装不存在' });
    }

    if (!installation.is_active) {
      logger.warn(`⚠️ OAuth 安装未激活: ${prInfo.platform}/${prInfo.owner}`);
      return res.status(400).json({ error: 'OAuth 安装未激活' });
    }

    // 创建 PR 分析作业
    const queueService = getQueueService();
    const jobPayload = {
      platform: prInfo.platform,
      repo_name: `${prInfo.owner}/${prInfo.repo}`,
      pr_number: prInfo.prNumber,
    };

    const result = await queueService.createJob(
      'pr_analysis',
      jobPayload,
      8 // 高优先级
    );

    if (result.error) {
      logger.error(`创建作业失败: ${result.error}`);
      return res.status(500).json({ error: result.error });
    }

    logger.info(`✅ 作业已创建: #${result.id}`);
    return res.status(201).json({
      success: true,
      jobId: result.id,
      message: 'PR 分析作业已创建',
    });
  } catch (error) {
    logger.error(`Webhook 处理失败: ${error}`);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 解析 PR 事件
 */
function parsePREvent(
  body: any,
  platform: Platform,
  event: string
): { platform: Platform; owner: string; repo: string; prNumber: string; action: string; title?: string; description?: string; files?: any[] } | null {
  try {
    if (platform === 'github') {
      // GitHub Pull Request 事件
      if (event === 'ping') {
        return {
          platform: 'github',
          owner: body.repository?.owner?.login || '',
          repo: body.repository?.name || '',
          prNumber: '0',
          action: 'ping',
        };
      }

      const pr = body.pull_request;
      if (!pr) {
        return null;
      }

      return {
        platform: 'github',
        owner: body.repository?.owner?.login || '',
        repo: body.repository?.name || '',
        prNumber: String(pr.number),
        action: body.action || 'opened',
        title: pr.title,
        description: pr.body,
        files: [], // GitHub 文件需要单独 API 获取
      };
    } else if (platform === 'gitee') {
      // Gitee Pull Request 事件
      const pr = body.pull_request || body;
      if (!pr) {
        return null;
      }

      return {
        platform: 'gitee',
        owner: body.repository?.owner?.login || body?.repository?.owner || '',
        repo: body.repository?.name || body?.repository?.path || '',
        prNumber: String(pr.number || pr?.number),
        action: body.action || pr?.action || 'opened',
        title: pr.title,
        description: pr.body,
        files: [],
      };
    } else if (platform === 'gitlab') {
      // GitLab Merge Request 事件
      const mr = body.object_attributes || body;
      if (!mr) {
        return null;
      }

      return {
        platform: 'gitlab',
        owner: body.project?.namespace || '',
        repo: body.project?.name || '',
        prNumber: String(mr.iid),
        action: mr.action || 'opened',
        title: mr.title,
        description: mr.description,
        files: [],
      };
    }

    return null;
  } catch (error) {
    logger.error(`解析 PR 事件失败: ${error}`);
    return null;
  }
}

export default router;
