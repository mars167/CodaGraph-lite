/**
 * SQLite 数据库连接管理
 *
 * 2u2g 优化：
 * - WAL mode 启用
 * - cache_size 限制为 2MB (cache_size=-2000)
 * - 单连接实例（避免连接池开销）
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  databasePath?: string;
  walMode?: boolean;
  cacheSize?: number; // KB，负数表示禁用自动调整
  readOnly?: boolean;
}

/**
 * 数据库连接类
 */
export class DatabaseConnection {
  private db: Database.Database | null = null;
  private config: Required<DatabaseConfig>;
  private isInitialized = false;

  constructor(config: DatabaseConfig = {}) {
    this.config = {
      databasePath: config.databasePath || path.join(process.cwd(), 'data', 'codagraph-lite.db'),
      walMode: config.walMode !== false,
      cacheSize: config.cacheSize ?? -2000, // 2MB
      readOnly: config.readOnly ?? false,
    };
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<Database.Database> {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    try {
      // 确保数据目录存在
      const dbDir = path.dirname(this.config.databasePath);
      await fs.mkdir(dbDir, { recursive: true });

      // 打开数据库连接
      this.db = new Database(this.config.databasePath, {
        readonly: this.config.readOnly,
        fileMustExist: false,
      });

      // 2u2g 优化：启用 WAL mode
      if (this.config.walMode) {
        this.db.pragma('journal_mode = WAL');
      }

      // 2u2g 优化：设置 cache size
      this.db.pragma(`cache_size = ${this.config.cacheSize}`);

      // 优化 SQLite 性能
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('mmap_size = 268435456');

      this.isInitialized = true;

      console.log('✅ 数据库连接已建立');
      console.log(`   路径: ${this.config.databasePath}`);
      console.log(`   WAL mode: ${this.config.walMode}`);
      console.log(`   Cache size: ${this.config.cacheSize} KB`);

      return this.db;
    } catch (error) {
      console.error('❌ 数据库初始化失败:', error);
      throw new Error(`数据库初始化失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): Database.Database {
    if (!this.db || !this.isInitialized) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 获取数据库连接实例
   */
  getDb(): Database.Database {
    if (!this.db || !this.isInitialized) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log('🔌 数据库连接已关闭');
    }
  }

  /**
   * 检查数据库是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * 获取单个值
   */
  get<T>(sql: string, params: any[] = []): T | null {
    if (!this.db || !this.isInitialized) {
      throw new Error('数据库未初始化');
    }
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params);
    return result as T | null || null;
  }

  /**
   * 获取多个值
   */
  all<T>(sql: string, params: any[] = []): T[] {
    if (!this.db || !this.isInitialized) {
      throw new Error('数据库未初始化');
    }
    const stmt = this.db.prepare(sql);
    const result = stmt.all(...params);
    return result as T[] || [];
  }

  /**
   * 执行 SQL 命令
   */
  execute(sql: string, params: any[] = []): Database.RunResult {
    if (!this.db || !this.isInitialized) {
      throw new Error('数据库未初始化');
    }
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  /**
   * 执行事务
   */
  transaction<T>(fn: (db: Database.Database) => T): T {
    if (!this.db || !this.isInitialized) {
      throw new Error('数据库未初始化');
    }
    return this.db.transaction(fn) as T;
  }

  /**
   * 备份数据库到指定路径
   */
  async backup(backupPath: string): Promise<void> {
    if (!this.db || !this.isInitialized) {
      throw new Error('数据库未初始化');
    }

    try {
      // 确保备份目录存在
      const backupDir = path.dirname(backupPath);
      await fs.mkdir(backupDir, { recursive: true });

      // 执行备份
      this.db.backup(backupPath);
      console.log(`✅ 数据库已备份到: ${backupPath}`);
    } catch (error) {
      console.error('❌ 数据库备份失败:', error);
      throw new Error(`数据库备份失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取数据库文件大小
   */
  async getDatabaseSize(): Promise<number> {
    try {
      const stats = await fs.stat(this.config.databasePath);
      return stats.size;
    } catch (error) {
      console.error('❌ 获取数据库大小失败:', error);
      return 0;
    }
  }
}

// 单例实例
let connectionInstance: DatabaseConnection | null = null;

/**
 * 获取数据库连接单例
 */
export function getConnection(config?: DatabaseConfig): DatabaseConnection {
  if (!connectionInstance) {
    connectionInstance = new DatabaseConnection(config);
  }
  return connectionInstance;
}

/**
 * 重置连接单例（用于测试）
 */
export function resetConnection(): void {
  connectionInstance = null;
}
