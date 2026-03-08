import express, { Request, Response } from 'express';
import { authenticate } from '../auth/middleware';
import { ReviewLLMClient } from '../review/llmClient';
import { getSystemSettingsService, type SystemSettingsRecord } from '../services/SystemSettingsService';
import { logger } from '../utils/logger';

const router = express.Router();
const settingsService = getSystemSettingsService();

type LlmTestPayload = Partial<Pick<
  SystemSettingsRecord,
  'llmProvider' | 'llmApiKey' | 'llmApiBaseUrl' | 'llmModel' | 'llmMaxRetries'
>>;

router.use(authenticate);

router.get('/', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: settingsService.getSettings(),
  });
});

router.put('/', (req: Request, res: Response) => {
  try {
    const settings = settingsService.saveSettings(req.body as Partial<SystemSettingsRecord>);
    return res.json({
      success: true,
      data: settings,
      message: '设置已保存',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存设置失败';
    logger.error('保存系统设置失败:', error instanceof Error ? error : new Error(String(error)));
    return res.status(400).json({
      success: false,
      error: message,
    });
  }
});

router.post('/llm/test', async (req: Request, res: Response) => {
  try {
    const payload = (req.body ?? {}) as LlmTestPayload;
    const llmConfig = settingsService.getLlmConfig(payload);
    const client = new ReviewLLMClient(llmConfig);

    if (!client.isEnabled()) {
      return res.status(400).json({
        success: false,
        error: '请先填写可用的 API Key',
      });
    }

    let availableModels: string[] = [];
    try {
      availableModels = await client.listModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`拉取模型列表失败: ${message}`);
    }

    const startedAt = Date.now();
    const result = await client.chatWithMetadata(
      [
        {
          role: 'system',
          content: 'You are a connectivity probe. Respond with a short confirmation.',
        },
        {
          role: 'user',
          content: 'Reply with one short sentence confirming the model is available.',
        },
      ],
      48,
      { trackUsage: false }
    );

    return res.json({
      success: true,
      data: {
        available: true,
        latencyMs: Date.now() - startedAt,
        provider: result.provider,
        model: result.model,
        availableModels,
        responsePreview: result.content.slice(0, 160),
        usage: result.usage,
        message: 'API 调用成功，当前配置可用',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LLM API 测试失败';
    logger.warn(`LLM API 测试失败: ${message}`);
    return res.status(400).json({
      success: false,
      error: message,
    });
  }
});

export default router;
