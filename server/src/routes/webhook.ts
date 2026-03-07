/**
 * Webhook 路由
 * 处理来自 GitHub、Gitee、GitLab 的 webhook 事件
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { createCodeReviewService } from '../services/CodeReviewService';

const router = Router();
const codeReviewService = createCodeReviewService(
  null,  // 数据库连接（实际实现中会传入）
  new Map()  // 平台客户端（实际实现中会配置）
);

/**
 * GitHub Webhook 端点
 */
router.post('/github', async (req: Request, res: Response) => {
  try {
    logger.info('📥 收到 GitHub webhook');

    // 获取签名
    const signature = (req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'] || '') as string;

    // 解析事件 - 类型断言
    const event = req.body as any;

    // 处理事件
    await codeReviewService.handleWebhookEvent(event, signature);

    // 返回成功
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error(`GitHub webhook 处理失败: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Gitee Webhook 端点
 */
router.post('/gitee', async (req: Request, res: Response) => {
  try {
    logger.info('📥 收到 Gitee webhook');

    // 获取签名
    const signature = (req.headers['x-gitee-token'] || req.headers['x-gitee-signature'] || '') as string;

    // 解析事件 - 类型断言
    const event = req.body as any;

    // 处理事件
    await codeReviewService.handleWebhookEvent(event, signature);

    // 返回成功
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error(`Gitee webhook 处理失败: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GitLab Webhook 端点
 */
router.post('/gitlab', async (req: Request, res: Response) => {
  try {
    logger.info('📥 收到 GitLab webhook');

    // 获取签名
    const signature = (req.headers['x-gitlab-token'] || req.headers['x-gitlab-signature'] || '') as string;

    // 解析事件 - 类型断言
    const event = req.body as any;

    // 处理事件
    await codeReviewService.handleWebhookEvent(event, signature);

    // 返回成功
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error(`GitLab webhook 处理失败: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
