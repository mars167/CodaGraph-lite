const settingsServiceMock = {
  getLlmConfig: jest.fn(),
};

const usageMetricModelMock = {
  create: jest.fn(),
};

jest.mock('../services/SystemSettingsService', () => ({
  getSystemSettingsService: () => settingsServiceMock,
}));

jest.mock('../models/UsageMetric', () => ({
  getUsageMetricModel: () => usageMetricModelMock,
}));

import { ReviewLLMClient } from './llmClient';

describe('ReviewLLMClient', () => {
  const originalApiKey = process.env.LLM_API_KEY;
  const originalModel = process.env.LLM_MODEL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LLM_API_KEY = 'env-api-key';
    process.env.LLM_MODEL = 'env-model';
    settingsServiceMock.getLlmConfig.mockReturnValue({
      provider: 'openai-compatible',
      apiKey: '',
      model: '',
      baseUrl: '',
      maxRetries: 0,
    });
  });

  afterAll(() => {
    process.env.LLM_API_KEY = originalApiKey;
    process.env.LLM_MODEL = originalModel;
  });

  it('does not fall back to env api key when stored settings explicitly clear it', () => {
    const client = new ReviewLLMClient();

    expect(client.isEnabled()).toBe(false);
  });

  it('preserves an explicitly empty model override instead of falling back to env', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-type': 'application/json',
      }),
      json: async () => ({
        id: 'chatcmpl-test',
        choices: [
          {
            message: {
              content: 'ready',
            },
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
    } as Response);

    const client = new ReviewLLMClient({
      apiKey: 'override-api-key',
      model: '',
    });

    await client.chatWithMetadata([
      {
        role: 'user',
        content: 'ping',
      },
    ], 32);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.model).toBe('');

    fetchMock.mockRestore();
  });
});
