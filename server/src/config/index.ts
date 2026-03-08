/**
 * 配置管理模块
 *
 * 2u2g 关键配置：
 * - 从环境变量加载配置
 * - 验证 2u2g 特定要求
 * - 拒绝无效配置
 * - 提供类型安全的配置访问
 */

import { logger } from '../utils/logger';

/**
 * 配置验证错误
 */
export class ConfigurationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * 2u2g 资源限制配置
 */
export interface ResourceLimits {
  /** Node.js 内存限制 (MB) */
  nodeMemoryLimit: number;
  /** SQLite 缓存大小 (KB) */
  sqliteCacheSize: number;
  /** Python 内存限制 (MB) */
  pythonMemoryLimit: number;
  /** Code Context Engine runtime 内存预算 (MB) */
  codeContextRuntimeMemoryLimit: number;
  /** 工作进程数量 */
  workerCount: number;
  /** 是否允许并发作业 */
  enableConcurrentJobs: boolean;
}

/**
 * 服务器配置
 */
export interface ServerConfig {
  frontendPort: number;
  backendPort: number;
  nodeOptions: string;
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  databasePath: string;
  sqliteCacheSize: number;
  walMode: boolean;
}

/**
 * Job Queue 配置
 */
export interface JobQueueConfig {
  workerCount: number;
  enableConcurrentJobs: boolean;
  pollingInterval: number;
}

/**
 * 认证配置
 */
export interface AuthConfig {
  adminUsername: string;
  adminPassword: string;
  sessionSecret: string;
  sessionTimeout: number;
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  contextAgentPort: number;
  contextAgentHost: string;
  contextAgentTimeout: number;
  reviewAgentPort: number;
  reviewAgentHost: string;
  reviewAgentTimeout: number;
  pythonMemoryLimit: string;
  killGracePeriod: number;
}

/**
 * Code Context Engine runtime 配置
 */
export interface CodeContextRuntimeConfig {
  engineRoot: string;
  maxMemory: string;
  workspaceRoot: string;
}

/**
 * 监控配置
 */
export interface MonitoringConfig {
  enableSwapWarning: boolean;
  memoryWarningThreshold: number;
  memoryCriticalThreshold: number;
  healthCheckInterval: number;
  memoryCheckInterval: number;
}

/**
 * 日志配置
 */
export interface LogConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logPath: string;
  enableRequestLogging: boolean;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  sessionSecret: string;
  enableHttps: boolean;
  httpsCertPath: string;
  httpsKeyPath: string;
  webhookSecret: string;
}

/**
 * CORS 配置
 */
export interface CorsConfig {
  corsOrigins: string[];
  corsMethods: string[];
}

/**
 * LLM 配置
 */
export interface LlmConfig {
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  llmApiBaseUrl: string;
  llmMaxRetries: number;
}

/**
 * 备份配置
 */
export interface BackupConfig {
  backupPath: string;
  enableAutoBackup: boolean;
  backupIntervalHours: number;
}

/**
 * 完整应用配置
 */
export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  jobQueue: JobQueueConfig;
  auth: AuthConfig;
  agent: AgentConfig;
  codeContextRuntime: CodeContextRuntimeConfig;
  monitoring: MonitoringConfig;
  logging: LogConfig;
  security: SecurityConfig;
  cors: CorsConfig;
  llm: LlmConfig;
  backup: BackupConfig;
  timezone: string;
  locale: string;
}

/**
 * 获取环境变量，支持默认值
 */
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ConfigurationError(`缺少必需的环境变量: ${key}`, key);
  }
  return value;
}

/**
 * 获取数字类型环境变量
 */
function getEnvNumber(key: string, defaultValue?: number): number {
  const value = getEnv(key, defaultValue?.toString());
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new ConfigurationError(`环境变量 ${key} 必须是数字: ${value}`, key);
  }
  return num;
}

/**
 * 获取布尔类型环境变量
 */
function getEnvBoolean(key: string, defaultValue?: boolean): boolean {
  const value = getEnv(key, defaultValue?.toString());
  return value.toLowerCase() === 'true';
}

/**
 * 获取数组类型环境变量（逗号分隔）
 */
function getEnvArray(key: string, defaultValue?: string[]): string[] {
  const value = getEnv(key, defaultValue?.join(','));
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

function normalizeCorsMethods(methods: string[]): string[] {
  const requiredMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  const normalized = methods.map((method) => method.toUpperCase());

  for (const requiredMethod of requiredMethods) {
    if (!normalized.includes(requiredMethod)) {
      normalized.push(requiredMethod);
    }
  }

  return normalized;
}

/**
 * 验证 2u2g 配置
 * CRITICAL: 拒绝无效的 2u2g 配置
 */
function validate2u2gConfig(config: Partial<AppConfig>): void {
  const errors: string[] = [];

  // CRITICAL: WORKER_COUNT 必须为 1
  if (config.jobQueue?.workerCount !== undefined && config.jobQueue.workerCount !== 1) {
    errors.push(`WORKER_COUNT 必须为 1 (当前: ${config.jobQueue.workerCount})`);
  }

  // CRITICAL: ENABLE_CONCURRENT_JOBS 必须为 false
  if (config.jobQueue?.enableConcurrentJobs !== undefined && config.jobQueue.enableConcurrentJobs !== false) {
    errors.push(`ENABLE_CONCURRENT_JOBS 必须为 false (当前: ${config.jobQueue.enableConcurrentJobs})`);
  }

  // CRITICAL: NODE_OPTIONS 必须包含 --max-old-space-size=200 或 512
  if (config.server?.nodeOptions && !config.server.nodeOptions.includes('--max-old-space-size=200') && !config.server.nodeOptions.includes('--max-old-space-size=512')) {
    errors.push(`NODE_OPTIONS 必须包含 --max-old-space-size=200 或 512 (当前: ${config.server.nodeOptions})`);
  }

  // CRITICAL: SQLITE_CACHE_SIZE 必须为 -2000 (2MB) 或 -4000 (4MB)
  if (config.database?.sqliteCacheSize !== undefined && config.database.sqliteCacheSize !== -2000 && config.database.sqliteCacheSize !== -4000) {
    errors.push(`SQLITE_CACHE_SIZE 必须为 -2000 或 -4000 (当前: ${config.database.sqliteCacheSize})`);
  }

  if (errors.length > 0) {
    const errorMessage = `2u2g 配置验证失败:\n${errors.map(e => `  - ${e}`).join('\n')}`;
    logger.error(`❌ ${errorMessage}`);
    throw new ConfigurationError(errorMessage);
  }
}

/**
 * 验证安全配置
 */
function validateSecurityConfig(config: Partial<AppConfig>): void {
  const warnings: string[] = [];

  // 检查默认密码
  if (config.auth?.adminPassword === 'changeme') {
    warnings.push('ADMIN_PASSWORD 使用默认值，存在安全风险');
  }

  // 检查默认 session secret
  if (config.security?.sessionSecret === 'changeme_to_secure_random_string') {
    warnings.push('SESSION_SECRET 使用默认值，存在安全风险');
  }

  // 检查默认 webhook secret
  if (config.security?.webhookSecret === 'changeme_to_random_webhook_secret') {
    warnings.push('WEBHOOK_SECRET 使用默认值，存在安全风险');
  }

  // 输出警告
  warnings.forEach(warning => logger.warn(`⚠️  ${warning}`));
}

/**
 * 加载完整配置
 */
export function loadConfig(): AppConfig {
  logger.info('📋 加载配置...');

  const config: AppConfig = {
    server: {
      frontendPort: getEnvNumber('FRONTEND_PORT', 3000),
      backendPort: getEnvNumber('BACKEND_PORT', 7900),
      nodeOptions: getEnv('NODE_OPTIONS', '--max-old-space-size=200'),
    },

    database: {
      databasePath: getEnv('DATABASE_PATH', './data/codagraph-lite.db'),
      sqliteCacheSize: getEnvNumber('SQLITE_CACHE_SIZE', -2000),
      walMode: true,
    },

    jobQueue: {
      workerCount: getEnvNumber('WORKER_COUNT', 1),
      enableConcurrentJobs: getEnvBoolean('ENABLE_CONCURRENT_JOBS', false),
      pollingInterval: getEnvNumber('JOB_QUEUE_POLL_INTERVAL', 2) * 1000,
    },

    auth: {
      adminUsername: getEnv('ADMIN_USERNAME', 'admin'),
      adminPassword: getEnv('ADMIN_PASSWORD', 'changeme'),
      sessionSecret: getEnv('SESSION_SECRET', 'changeme_to_secure_random_string'),
      sessionTimeout: getEnvNumber('SESSION_TIMEOUT', 86400),
    },

    agent: {
      contextAgentPort: getEnvNumber('CONTEXT_AGENT_PORT', 50052),
      contextAgentHost: getEnv('CONTEXT_AGENT_HOST', 'localhost'),
      contextAgentTimeout: getEnvNumber('AGENT_TIMEOUT_CONTEXT', 300000),
      reviewAgentPort: getEnvNumber('REVIEW_AGENT_PORT', 50051),
      reviewAgentHost: getEnv('REVIEW_AGENT_HOST', 'localhost'),
      reviewAgentTimeout: getEnvNumber('AGENT_TIMEOUT_REVIEW', 600000),
      pythonMemoryLimit: getEnv('PYTHON_MEMORY_LIMIT', '300m'),
      killGracePeriod: 5000,
    },

    codeContextRuntime: {
      engineRoot: getEnv('CODE_CONTEXT_ENGINE_ROOT', '../CodeContextEngine'),
      maxMemory: getEnv('CODE_CONTEXT_ENGINE_MAX_MEMORY', '512m'),
      workspaceRoot: getEnv('WORKSPACE_ROOT', '/tmp/repos'),
    },

    monitoring: {
      enableSwapWarning: getEnvBoolean('ENABLE_SWAP_WARNING', true),
      memoryWarningThreshold: getEnvNumber('MEMORY_WARNING_THRESHOLD', 80),
      memoryCriticalThreshold: getEnvNumber('MEMORY_CRITICAL_THRESHOLD', 95),
      healthCheckInterval: 30000,
      memoryCheckInterval: 30000,
    },

    logging: {
      logLevel: getEnv('LOG_LEVEL', 'info') as LogConfig['logLevel'],
      logPath: getEnv('LOG_PATH', './logs'),
      enableRequestLogging: getEnvBoolean('ENABLE_REQUEST_LOGGING', true),
    },

    security: {
      sessionSecret: getEnv('SESSION_SECRET', 'changeme_to_secure_random_string'),
      enableHttps: getEnvBoolean('ENABLE_HTTPS', false),
      httpsCertPath: getEnv('HTTPS_CERT_PATH', ''),
      httpsKeyPath: getEnv('HTTPS_KEY_PATH', ''),
      webhookSecret: getEnv('WEBHOOK_SECRET', 'changeme_to_random_webhook_secret'),
    },

    cors: {
      corsOrigins: getEnvArray('CORS_ORIGINS', ['http://localhost:3000']),
      corsMethods: normalizeCorsMethods(
        getEnvArray('CORS_METHODS', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
      ),
    },

    llm: {
      llmProvider: getEnv('LLM_PROVIDER', 'openai'),
      llmApiKey: getEnv('LLM_API_KEY', ''),
      llmModel: getEnv('LLM_MODEL', 'gpt-4'),
      llmApiBaseUrl: getEnv('LLM_API_BASE_URL', ''),
      llmMaxRetries: getEnvNumber('LLM_MAX_RETRIES', 3),
    },

    backup: {
      backupPath: getEnv('BACKUP_PATH', './backups'),
      enableAutoBackup: getEnvBoolean('ENABLE_AUTO_BACKUP', true),
      backupIntervalHours: getEnvNumber('BACKUP_INTERVAL_HOURS', 24),
    },

    timezone: getEnv('TIMEZONE', 'Asia/Shanghai'),
    locale: getEnv('LOCALE', 'zh-CN'),
  };

  // 验证 2u2g 配置
  validate2u2gConfig(config);

  // 验证安全配置
  validateSecurityConfig(config);

  logger.info('✅ 配置加载完成');

  return config;
}

/**
 * 配置单例
 */
let configInstance: AppConfig | null = null;

/**
 * 获取配置单例
 */
export function getConfig(): AppConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * 重置配置（用于测试）
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * 获取 2u2g 资源限制
 */
export function getResourceLimits(): ResourceLimits {
  const config = getConfig();
  return {
    nodeMemoryLimit: 512,
    sqliteCacheSize: config.database.sqliteCacheSize,
    pythonMemoryLimit: parseInt(config.agent.pythonMemoryLimit, 10),
    codeContextRuntimeMemoryLimit: parseInt(config.codeContextRuntime.maxMemory, 10),
    workerCount: config.jobQueue.workerCount,
    enableConcurrentJobs: config.jobQueue.enableConcurrentJobs,
  };
}

/**
 * 打印配置摘要
 */
export function printConfigSummary(): void {
  const config = getConfig();

  console.log('');
  console.log('============================================');
  console.log('  CodaGraph-lite 配置摘要');
  console.log('============================================');
  console.log(`  前端端口: ${config.server.frontendPort}`);
  console.log(`  后端端口: ${config.server.backendPort}`);
  console.log(`  Node.js 内存限制: ${config.server.nodeOptions}`);
  console.log(`  SQLite 缓存: ${config.database.sqliteCacheSize} KB`);
  console.log(`  Worker 数量: ${config.jobQueue.workerCount}`);
  console.log(`  并发作业: ${config.jobQueue.enableConcurrentJobs ? '启用' : '禁用'}`);
  console.log(`  日志级别: ${config.logging.logLevel}`);
  console.log('============================================');
  console.log('');
}

export default {
  loadConfig,
  getConfig,
  resetConfig,
  getResourceLimits,
  printConfigSummary,
  ConfigurationError,
};
