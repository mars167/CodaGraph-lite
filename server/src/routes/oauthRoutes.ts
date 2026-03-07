/**
 * OAuth 管理路由
 *
 * 提供 OAuth 管理页面后端 API 端点
 */

import express, { Request, Response } from 'express';
import { getOAuthInstallationModel } from '../models/OAuthInstallation';
import { createPlatformClient } from '../platform/client';
import type { Platform } from '../models/types';

const router = express.Router();

/**
 * 获取 OAuth 管理仪表板数据
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const installationModel = getOAuthInstallationModel();

    // 获取所有安装
    const installations = installationModel.findActive();

    // 按平台分组统计
    const platformStats = {
      github: installationModel.countActiveByPlatform('github'),
      gitee: installationModel.countActiveByPlatform('gitee'),
      gitlab: installationModel.countActiveByPlatform('gitlab'),
    };

    // 获取最近安装的仓库
    const recentInstallations = installations
      .filter((inst) => inst.is_active)
      .slice(0, 10);

    return res.json({
      platforms: platformStats,
      total: installations.length,
      recent: recentInstallations,
      installations,
    });
  } catch (error) {
    console.error('获取 OAuth 管理数据失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 获取平台统计信息
 */
router.get('/stats/:platform', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params as { platform: Platform };

    const installationModel = getOAuthInstallationModel();
    const count = installationModel.countActiveByPlatform(platform);

    // 获取该平台的安装详情
    const installations = installationModel
      .findActive()
      .filter((inst) => inst.platform === platform && inst.is_active);

    // 计算总仓库数（需要从 repository 表获取）
    // 这里简化为安装数作为近似值
    const stats = {
      platform,
      installations: count,
      repositories: 0, // TODO: 从 repository 表统计
      lastSyncAt: installations.length > 0
        ? installations.reduce((latest, inst) => {
            const instDate = new Date(inst.updated_at);
            const latestDate = new Date(latest.updated_at);
            return instDate > latestDate ? inst : latest;
          }).updated_at
        : null,
    };

    return res.json({ stats });
  } catch (error) {
    console.error('获取平台统计失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 测试 OAuth 连接
 */
router.post('/test/:id', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const installationModel = getOAuthInstallationModel();
    const installation = installationModel.findById(id);

    if (!installation) {
      return res.status(404).json({ error: '安装不存在' });
    }

    if (!installation.is_active) {
      return res.status(400).json({
        error: '该安装未激活',
      });
    }

    // 创建客户端并测试连接
    const client = createPlatformClient(installation.platform, installation.access_token, {
      authType: installation.auth_type || 'oauth',
      githubAppInstallationId: installation.github_app_installation_id || null,
    });

    try {
      const isValid = await client.verifyToken();

      if (isValid) {
        // 更新令牌过期时间
        installationModel.update(id, {
          token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        console.log(`✅ OAuth 连接测试成功: ${installation.platform} - ${installation.account_name}`);

        return res.json({
          success: true,
          message: 'OAuth 连接有效',
          installation: {
            id: installation.id,
            platform: installation.platform,
            account_name: installation.account_name,
            account_id: installation.account_id,
            token_expires_at: installation.token_expires_at,
          },
        });
      } else {
        return res.status(400).json({
          error: 'OAuth 令牌无效',
          installation: {
            id: installation.id,
            platform: installation.platform,
            account_name: installation.account_name,
            account_id: installation.account_id,
          },
        });
      }
    } catch (testError) {
      console.error('测试 OAuth 连接失败:', testError);
      return res.status(400).json({
        error: '测试连接失败',
        details: (testError as Error).message,
      });
    }
  } catch (error) {
    console.error('测试 OAuth 连接失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 刷新 OAuth 令牌
 */
router.post('/refresh/:id', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const installationModel = getOAuthInstallationModel();
    const installation = installationModel.findById(id);

    if (!installation) {
      return res.status(404).json({ error: '安装不存在' });
    }

    if (!installation.refresh_token) {
      return res.status(400).json({
        error: '该安装不支持令牌刷新',
      });
    }

    // TODO: 实现令牌刷新逻辑
    // 需要调用平台特定的刷新端点
    // GitHub/Gitee/GitLab 的刷新机制可能不同

    console.log(`🔄 刷新 OAuth 令牌: ${installation.platform} - ${installation.account_name}`);

    return res.json({
      success: true,
      message: '令牌刷新功能待实现',
    });
  } catch (error) {
    console.error('刷新 OAuth 令牌失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 获取平台配置状态
 */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    // 检查环境变量配置
    const configStatus = {
      github: {
        clientId: !!process.env.GITHUB_CLIENT_ID,
        clientSecret: !!process.env.GITHUB_CLIENT_SECRET,
        configured: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      },
      gitee: {
        clientId: !!process.env.GITEE_CLIENT_ID,
        clientSecret: !!process.env.GITEE_CLIENT_SECRET,
        configured: !!(process.env.GITEE_CLIENT_ID && process.env.GITEE_CLIENT_SECRET),
      },
      gitlab: {
        clientId: !!process.env.GITLAB_CLIENT_ID,
        clientSecret: !!process.env.GITLAB_CLIENT_SECRET,
        configured: !!(process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET),
      },
    };

    return res.json({ config: configStatus });
  } catch (error) {
    console.error('获取平台配置状态失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

/**
 * 删除 OAuth 安装
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const installationModel = getOAuthInstallationModel();
    const installation = installationModel.findById(id);

    if (!installation) {
      return res.status(404).json({ error: '安装不存在' });
    }

    // 删除安装
    const success = installationModel.setActive(id, false);

    if (!success) {
      return res.status(404).json({ error: '删除失败' });
    }

    console.log(`🗑 删除 OAuth 安装: ${installation.platform} - ${installation.account_name}`);

    return res.json({
      success: true,
      message: '安装删除成功',
    });
  } catch (error) {
    console.error('删除 OAuth 安装失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

export default router;
