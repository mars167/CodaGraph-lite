import { logger } from '../utils/logger';

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

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveBaseUrl(provider: string, baseUrl: string): string {
  if (baseUrl) {
    return `${trimTrailingSlash(baseUrl)}/chat/completions`;
  }

  if (provider === 'openrouter') {
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  return 'https://api.openai.com/v1/chat/completions';
}

function extractContent(payload: ChatCompletionResponse): string {
  const message = payload.choices?.[0]?.message?.content;
  if (typeof message === 'string') {
    return message;
  }

  if (Array.isArray(message)) {
    return message
      .map((item) => item?.text ?? '')
      .join('')
      .trim();
  }

  return '';
}

export class ReviewLLMClient {
  private readonly config: ReviewLLMConfig;

  constructor(config: Partial<ReviewLLMConfig> = {}) {
    const provider = config.provider || process.env.LLM_PROVIDER || 'openai';
    const apiKey = config.apiKey || process.env.LLM_API_KEY || '';
    const model = config.model || process.env.LLM_MODEL || 'gpt-4';
    const baseUrl = config.baseUrl ?? process.env.LLM_API_BASE_URL ?? '';
    const maxRetries = config.maxRetries ?? parseInt(process.env.LLM_MAX_RETRIES || '2', 10);

    this.config = {
      provider,
      apiKey,
      model,
      baseUrl,
      maxRetries,
    };
  }

  isEnabled(): boolean {
    return this.config.apiKey.trim().length > 0;
  }

  async chat(messages: ChatMessage[], maxTokens = 1600): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('LLM is not configured');
    }

    const url = resolveBaseUrl(this.config.provider, this.config.baseUrl);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            messages,
            temperature: 0.1,
            max_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
        }

        const payload = await response.json() as ChatCompletionResponse;
        const content = extractContent(payload);
        if (!content) {
          throw new Error('LLM returned empty content');
        }

        return content;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`LLM 调用失败 (attempt ${attempt}): ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('LLM request failed');
  }
}
