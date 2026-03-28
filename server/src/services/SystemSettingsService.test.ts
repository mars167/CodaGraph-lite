const getAllMock = jest.fn();
const setManyMock = jest.fn();

jest.mock('../config', () => ({
  getConfig: () => ({
    server: {
      backendPort: 7900,
      frontendPort: 3000,
      nodeOptions: '--max-old-space-size=512',
    },
    logging: {
      logLevel: 'info',
    },
    jobQueue: {
      workerCount: 1,
    },
    auth: {
      sessionTimeout: 86400,
    },
    backup: {
      enableAutoBackup: true,
    },
    llm: {
      llmProvider: 'openai-compatible',
      llmApiKey: '',
      llmApiBaseUrl: '',
      llmModel: '',
      llmMaxRetries: 2,
    },
  }),
}));

jest.mock('../models/AppSetting', () => ({
  getAppSettingModel: () => ({
    getAll: getAllMock,
    setMany: setManyMock,
  }),
}));

import { SystemSettingsService } from './SystemSettingsService';

describe('SystemSettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes legacy single llm settings into one active profile', () => {
    getAllMock.mockReturnValue({
      llmProvider: 'openrouter',
      llmApiKey: 'legacy-key',
      llmApiBaseUrl: 'https://openrouter.ai/api/v1/',
      llmModel: 'openrouter/auto',
      llmMaxRetries: 4,
    });

    const service = new SystemSettingsService();
    const settings = service.getSettings();

    expect(settings.llmProfiles).toHaveLength(1);
    expect(settings.activeLlmProfileId).toBe('default-llm-profile');
    expect(settings.llmProfiles[0]).toMatchObject({
      id: 'default-llm-profile',
      provider: 'openrouter',
      apiKey: 'legacy-key',
      apiBaseUrl: 'https://openrouter.ai/api/v1/',
      model: 'openrouter/auto',
      maxRetries: 4,
    });
    expect(service.getLlmConfig()).toEqual({
      provider: 'openrouter',
      apiKey: 'legacy-key',
      baseUrl: 'https://openrouter.ai/api/v1/',
      model: 'openrouter/auto',
      maxRetries: 4,
    });
  });

  it('mirrors the selected llm profile back to the legacy flat fields', () => {
    getAllMock.mockReturnValue({
      llmProfiles: [
        {
          id: 'primary',
          name: '主配置',
          provider: 'openai',
          apiKey: 'primary-key',
          apiBaseUrl: '',
          model: 'gpt-4.1-mini',
          maxRetries: 2,
        },
        {
          id: 'backup',
          name: '备用配置',
          provider: 'openrouter',
          apiKey: 'backup-key',
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          model: 'openrouter/auto',
          maxRetries: 5,
        },
      ],
      activeLlmProfileId: 'backup',
    });

    const service = new SystemSettingsService();
    const settings = service.getSettings();

    expect(settings.llmProvider).toBe('openrouter');
    expect(settings.llmApiKey).toBe('backup-key');
    expect(settings.llmApiBaseUrl).toBe('https://openrouter.ai/api/v1');
    expect(settings.llmModel).toBe('openrouter/auto');
    expect(settings.llmMaxRetries).toBe(5);
    expect(service.getLlmConfig()).toEqual({
      provider: 'openrouter',
      apiKey: 'backup-key',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/auto',
      maxRetries: 5,
    });
  });

  it('persists llm profiles together with the active selection', () => {
    getAllMock.mockReturnValue({});

    const service = new SystemSettingsService();
    const result = service.saveSettings({
      llmProfiles: [
        {
          id: 'primary',
          name: '主配置',
          provider: 'openai',
          apiKey: 'primary-key',
          apiBaseUrl: '',
          model: 'gpt-4.1-mini',
          maxRetries: 2,
        },
        {
          id: 'backup',
          name: '备用配置',
          provider: 'openrouter',
          apiKey: 'backup-key',
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          model: 'openrouter/auto',
          maxRetries: 5,
        },
      ],
      activeLlmProfileId: 'backup',
    });

    expect(setManyMock).toHaveBeenCalledWith(expect.objectContaining({
      activeLlmProfileId: 'backup',
      llmProvider: 'openrouter',
      llmApiKey: 'backup-key',
      llmApiBaseUrl: 'https://openrouter.ai/api/v1',
      llmModel: 'openrouter/auto',
      llmMaxRetries: 5,
      llmProfiles: expect.arrayContaining([
        expect.objectContaining({ id: 'primary', name: '主配置' }),
        expect.objectContaining({ id: 'backup', name: '备用配置' }),
      ]),
    }));
    expect(result.activeLlmProfileId).toBe('backup');
    expect(result.llmProfiles).toHaveLength(2);
  });
});
