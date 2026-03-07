import { getUsageMetricModel } from '../models/UsageMetric';
import { logger } from '../utils/logger';
import { getSystemSettingsService } from '../services/SystemSettingsService';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ReviewLLMConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxRetries: number;
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResult {
  id?: string;
  model: string;
  provider: string;
  content: string;
  usage?: ChatCompletionUsage;
}

type ChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type ModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
  error?: {
    message?: string;
  };
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function stripKnownEndpoint(value: string): string {
  return trimTrailingSlash(value)
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '');
}

function resolveBaseRoot(provider: string, baseUrl: string): string {
  if (baseUrl) {
    return stripKnownEndpoint(baseUrl);
  }

  if (provider === 'openrouter') {
    return 'https://openrouter.ai/api/v1';
  }

  return 'https://api.openai.com/v1';
}

function resolveEndpoint(provider: string, baseUrl: string, endpoint: 'chat/completions' | 'models'): string {
  return `${resolveBaseRoot(provider, baseUrl)}/${endpoint}`;
}

function extractContent(payload: ChatCompletionResponse): string {
  const message = payload.choices?.[0]?.message?.content;
  if (typeof message === 'string') {
    return message.trim();
  }

  if (Array.isArray(message)) {
    return message
      .map((item) => item?.text ?? '')
      .join('')
      .trim();
  }

  return '';
}

function extractUsage(payload: ChatCompletionResponse): ChatCompletionUsage | undefined {
  const usage = payload.usage;
  if (!usage) {
    return undefined;
  }

  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

async function extractErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      const payload = await response.json() as { error?: { message?: string } | string; message?: string };
      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        return payload.error;
      }
      if (payload.error && typeof payload.error === 'object' && typeof payload.error.message === 'string') {
        return payload.error.message;
      }
      if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
        return payload.message;
      }
    }

    const text = await response.text();
    if (text.trim().length > 0) {
      return text.trim();
    }
  } catch {
    return response.statusText || 'unknown error';
  }

  return response.statusText || 'unknown error';
}

export class ReviewLLMClient {
  private readonly overrides: Partial<ReviewLLMConfig>;
  private readonly usageMetricModel = getUsageMetricModel();

  constructor(config: Partial<ReviewLLMConfig> = {}) {
    this.overrides = config;
  }

  private resolveConfig(): ReviewLLMConfig {
    const stored = getSystemSettingsService().getLlmConfig();
    const provider = this.overrides.provider || stored.provider || process.env.LLM_PROVIDER || 'openai-compatible';
    const apiKey = this.overrides.apiKey || stored.apiKey || process.env.LLM_API_KEY || '';
    const model = this.overrides.model || stored.model || process.env.LLM_MODEL || 'gpt-4o-mini';
    const baseUrl = this.overrides.baseUrl ?? stored.baseUrl ?? process.env.LLM_API_BASE_URL ?? '';
    const maxRetries = this.overrides.maxRetries ?? stored.maxRetries ?? parseInt(process.env.LLM_MAX_RETRIES || '2', 10);

    return {
      provider,
      apiKey,
      model,
      baseUrl,
      maxRetries,
    };
  }

  private recordUsage(usage?: ChatCompletionUsage): void {
    this.usageMetricModel.create('llm_requests_total', 1);

    if (!usage) {
      return;
    }

    this.usageMetricModel.create('llm_prompt_tokens', usage.promptTokens);
    this.usageMetricModel.create('llm_completion_tokens', usage.completionTokens);
    this.usageMetricModel.create('llm_total_tokens', usage.totalTokens);
  }

  isEnabled(): boolean {
    return this.resolveConfig().apiKey.trim().length > 0;
  }

  async listModels(): Promise<string[]> {
    const config = this.resolveConfig();
    if (!config.apiKey.trim()) {
      throw new Error('LLM is not configured');
    }

    const response = await fetch(resolveEndpoint(config.provider, config.baseUrl, 'models'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`LLM models request failed: ${response.status} ${await extractErrorMessage(response)}`);
    }

    const payload = await response.json() as ModelsResponse;
    return [...new Set((payload.data || []).map((item) => item.id).filter((item): item is string => Boolean(item && item.trim().length > 0)))];
  }

  async chatWithMetadata(
    messages: ChatMessage[],
    maxTokens = 1600,
    options: {
      trackUsage?: boolean;
    } = {}
  ): Promise<ChatCompletionResult> {
    const config = this.resolveConfig();
    if (!config.apiKey.trim()) {
      throw new Error('LLM is not configured');
    }

    const url = resolveEndpoint(config.provider, config.baseUrl, 'chat/completions');
    const shouldTrackUsage = options.trackUsage !== false;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: 0.1,
            max_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          throw new Error(`LLM request failed: ${response.status} ${await extractErrorMessage(response)}`);
        }

        const payload = await response.json() as ChatCompletionResponse;
        const content = extractContent(payload);
        if (!content) {
          throw new Error('LLM returned empty content');
        }

        const usage = extractUsage(payload);
        if (shouldTrackUsage) {
          this.recordUsage(usage);
        }

        return {
          id: payload.id,
          model: payload.model || config.model,
          provider: config.provider,
          content,
          usage,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`LLM 调用失败 (attempt ${attempt}): ${lastError.message}`);
      }
    }

    if (shouldTrackUsage) {
      this.usageMetricModel.create('llm_requests_failed', 1);
    }

    throw lastError ?? new Error('LLM request failed');
  }

  async chat(messages: ChatMessage[], maxTokens = 1600): Promise<string> {
    const result = await this.chatWithMetadata(messages, maxTokens);
    return result.content;
  }
}
