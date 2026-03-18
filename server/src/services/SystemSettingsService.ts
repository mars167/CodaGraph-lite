import { getConfig } from '../config';
import { getAppSettingModel } from '../models/AppSetting';

export type PlatformAuthMode = 'oauth_app' | 'pat';

export interface SystemSettingsRecord {
  apiPort: number;
  apiHost: string;
  frontendPort: number;
  frontendUrl: string;
  dbCacheSize: number;
  dbConnectionPoolSize: number;
  dbConnectionTimeout: number;
  githubEnabled: boolean;
  giteeEnabled: boolean;
  gitlabEnabled: boolean;
  githubAuthMode: PlatformAuthMode;
  giteeAuthMode: PlatformAuthMode;
  gitlabAuthMode: PlatformAuthMode;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  jobTimeout: number;
  jobMaxRetries: number;
  jobConcurrency: number;
  twoU2gEnabled: boolean;
  memoryLimit: number;
  sessionTimeout: number;
  passwordMinLength: number;
  requireStrongPassword: boolean;
  autoBackupEnabled: boolean;
  backupSchedule: string;
  backupRetentionDays: number;
  llmProvider: string;
  llmApiKey: string;
  llmApiBaseUrl: string;
  llmModel: string;
  llmMaxRetries: number;
}

const settingKeys = [
  'apiPort',
  'apiHost',
  'frontendPort',
  'frontendUrl',
  'dbCacheSize',
  'dbConnectionPoolSize',
  'dbConnectionTimeout',
  'githubEnabled',
  'giteeEnabled',
  'gitlabEnabled',
  'githubAuthMode',
  'giteeAuthMode',
  'gitlabAuthMode',
  'logLevel',
  'jobTimeout',
  'jobMaxRetries',
  'jobConcurrency',
  'twoU2gEnabled',
  'memoryLimit',
  'sessionTimeout',
  'passwordMinLength',
  'requireStrongPassword',
  'autoBackupEnabled',
  'backupSchedule',
  'backupRetentionDays',
  'llmProvider',
  'llmApiKey',
  'llmApiBaseUrl',
  'llmModel',
  'llmMaxRetries',
] as const satisfies readonly (keyof SystemSettingsRecord)[];

function clampNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  let next = parsed;
  if (min !== undefined) {
    next = Math.max(min, next);
  }
  if (max !== undefined) {
    next = Math.min(max, next);
  }

  return Math.round(next);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
  }
  return fallback;
}

function toStringValue(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim();
}

function toLogLevel(value: unknown, fallback: SystemSettingsRecord['logLevel']): SystemSettingsRecord['logLevel'] {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }
  return fallback;
}

function toPlatformAuthMode(value: unknown, fallback: PlatformAuthMode): PlatformAuthMode {
  if (value === 'oauth_app' || value === 'pat') {
    return value;
  }
  return fallback;
}

function parseNodeMemoryLimit(nodeOptions: string): number {
  const match = nodeOptions.match(/--max-old-space-size=(\d+)/);
  return match ? parseInt(match[1], 10) : 1024;
}

export class SystemSettingsService {
  private model = getAppSettingModel();

  private buildDefaults(): SystemSettingsRecord {
    const config = getConfig();

    return {
      apiPort: config.server.backendPort,
      apiHost: 'localhost',
      frontendPort: config.server.frontendPort,
      frontendUrl: `http://localhost:${config.server.frontendPort}`,
      dbCacheSize: 256,
      dbConnectionPoolSize: 10,
      dbConnectionTimeout: 30,
      githubEnabled: true,
      giteeEnabled: false,
      gitlabEnabled: false,
      githubAuthMode: 'oauth_app',
      giteeAuthMode: 'oauth_app',
      gitlabAuthMode: 'oauth_app',
      logLevel: config.logging.logLevel,
      jobTimeout: 300,
      jobMaxRetries: 3,
      jobConcurrency: config.jobQueue.workerCount,
      twoU2gEnabled: true,
      memoryLimit: parseNodeMemoryLimit(config.server.nodeOptions),
      sessionTimeout: config.auth.sessionTimeout,
      passwordMinLength: 8,
      requireStrongPassword: true,
      autoBackupEnabled: config.backup.enableAutoBackup,
      backupSchedule: 'daily',
      backupRetentionDays: 7,
      llmProvider: config.llm.llmProvider || 'openai-compatible',
      llmApiKey: config.llm.llmApiKey || '',
      llmApiBaseUrl: config.llm.llmApiBaseUrl || '',
      llmModel: config.llm.llmModel || '',
      llmMaxRetries: config.llm.llmMaxRetries,
    };
  }

  private normalize(input: Partial<SystemSettingsRecord>): SystemSettingsRecord {
    const defaults = this.buildDefaults();

    return {
      apiPort: clampNumber(input.apiPort, defaults.apiPort, 1, 65535),
      apiHost: toStringValue(input.apiHost, defaults.apiHost) || defaults.apiHost,
      frontendPort: clampNumber(input.frontendPort, defaults.frontendPort, 1, 65535),
      frontendUrl: toStringValue(input.frontendUrl, defaults.frontendUrl) || defaults.frontendUrl,
      dbCacheSize: clampNumber(input.dbCacheSize, defaults.dbCacheSize, 1, 16384),
      dbConnectionPoolSize: clampNumber(input.dbConnectionPoolSize, defaults.dbConnectionPoolSize, 1, 100),
      dbConnectionTimeout: clampNumber(input.dbConnectionTimeout, defaults.dbConnectionTimeout, 1, 300),
      githubEnabled: toBoolean(input.githubEnabled, defaults.githubEnabled),
      giteeEnabled: toBoolean(input.giteeEnabled, defaults.giteeEnabled),
      gitlabEnabled: toBoolean(input.gitlabEnabled, defaults.gitlabEnabled),
      githubAuthMode: toPlatformAuthMode(input.githubAuthMode, defaults.githubAuthMode),
      giteeAuthMode: toPlatformAuthMode(input.giteeAuthMode, defaults.giteeAuthMode),
      gitlabAuthMode: toPlatformAuthMode(input.gitlabAuthMode, defaults.gitlabAuthMode),
      logLevel: toLogLevel(input.logLevel, defaults.logLevel),
      jobTimeout: clampNumber(input.jobTimeout, defaults.jobTimeout, 30, 86400),
      jobMaxRetries: clampNumber(input.jobMaxRetries, defaults.jobMaxRetries, 0, 20),
      jobConcurrency: clampNumber(input.jobConcurrency, defaults.jobConcurrency, 1, 16),
      twoU2gEnabled: toBoolean(input.twoU2gEnabled, defaults.twoU2gEnabled),
      memoryLimit: clampNumber(input.memoryLimit, defaults.memoryLimit, 128, 16384),
      sessionTimeout: clampNumber(input.sessionTimeout, defaults.sessionTimeout, 300, 2592000),
      passwordMinLength: clampNumber(input.passwordMinLength, defaults.passwordMinLength, 6, 64),
      requireStrongPassword: toBoolean(input.requireStrongPassword, defaults.requireStrongPassword),
      autoBackupEnabled: toBoolean(input.autoBackupEnabled, defaults.autoBackupEnabled),
      backupSchedule: toStringValue(input.backupSchedule, defaults.backupSchedule) || defaults.backupSchedule,
      backupRetentionDays: clampNumber(input.backupRetentionDays, defaults.backupRetentionDays, 1, 365),
      llmProvider: toStringValue(input.llmProvider, defaults.llmProvider) || defaults.llmProvider,
      llmApiKey: toStringValue(input.llmApiKey, defaults.llmApiKey),
      llmApiBaseUrl: toStringValue(input.llmApiBaseUrl, defaults.llmApiBaseUrl),
      llmModel: toStringValue(input.llmModel, defaults.llmModel),
      llmMaxRetries: clampNumber(input.llmMaxRetries, defaults.llmMaxRetries, 0, 10),
    };
  }

  getSettings(): SystemSettingsRecord {
    const stored = this.model.getAll() as Partial<SystemSettingsRecord>;
    return this.normalize({
      ...this.buildDefaults(),
      ...stored,
    });
  }

  saveSettings(input: Partial<SystemSettingsRecord>): SystemSettingsRecord {
    const next = this.normalize({
      ...this.getSettings(),
      ...input,
    });

    const persisted = settingKeys.reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = next[key];
      return acc;
    }, {});

    this.model.setMany(persisted);

    return next;
  }

  getLlmConfig(input?: Partial<SystemSettingsRecord>) {
    const settings = input
      ? this.normalize({
          ...this.getSettings(),
          ...input,
        })
      : this.getSettings();

    return {
      provider: settings.llmProvider,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      baseUrl: settings.llmApiBaseUrl,
      maxRetries: settings.llmMaxRetries,
    };
  }

  getPlatformAuthMode(platform: 'github' | 'gitee' | 'gitlab'): PlatformAuthMode {
    const settings = this.getSettings();
    switch (platform) {
      case 'github':
        return settings.githubAuthMode;
      case 'gitee':
        return settings.giteeAuthMode;
      case 'gitlab':
        return settings.gitlabAuthMode;
    }
  }

}

let systemSettingsServiceInstance: SystemSettingsService | null = null;

export function getSystemSettingsService(): SystemSettingsService {
  if (!systemSettingsServiceInstance) {
    systemSettingsServiceInstance = new SystemSettingsService();
  }

  return systemSettingsServiceInstance;
}
