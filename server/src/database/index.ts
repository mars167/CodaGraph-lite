/**
 * 数据库模块统一导出
 *
 * 导出所有数据库相关的功能模块
 */

// Schema
export * from './schema';

// 连接管理
export {
  DatabaseConnection,
  getConnection,
  resetConnection,
  type DatabaseConfig,
} from './connection';

// 初始化
export { initializeDatabase, resetDatabase } from './initialize';

// 迁移
export {
  runMigrations,
  verifyMigrationIntegrity,
  getMigrationHistory,
  rollbackToVersion,
  createMigrationTemplate,
  type Migration,
} from './migrations';

// 连接池（已禁用 - pool.ts 有待修复的类型问题）
// export {
//   DatabasePool,
//   getPool,
//   closePool,
//   withConnection,
//   type PoolConfig,
// } from './pool';

// 备份/恢复（已禁用 - backup.ts 有类型问题）
// export {
//   BackupManager,
//   getBackupManager,
//   type BackupInfo,
//   type BackupOptions,
// } from './backup';

// 性能优化（已禁用 - optimizer.ts 有类型问题）
// export {
//   DatabaseOptimizer,
//   getOptimizer,
//   startAutoOptimization,
//   type OptimizerConfig,
// } from './optimizer';

// 健康监控（已禁用 - health.ts 有类型问题）
// export {
//   DatabaseHealthMonitor,
//   getHealthMonitor,
//   type HealthCheckResult,
//   type HealthCheck,
//   type HealthMonitorConfig,
// } from './health';
