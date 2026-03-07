/**
 * 数据库初始化
 *
 * 首次启动时创建默认管理员账户
 */

import { getConnection, runMigrations } from './index';
import type { CreateAdminDTO } from '../models/types';
import { getConfig } from '../config';

/**
 * 初始化数据库
 */
export async function initializeDatabase(): Promise<void> {
  const config = getConfig();
  const db = getConnection({
    databasePath: config.database.databasePath,
    walMode: config.database.walMode,
    cacheSize: config.database.sqliteCacheSize,
  });

  try {
    await db.initialize();

    // 运行数据库迁移（创建所有表）
    await runMigrations();
    console.log('📋 数据库迁移已完成');

    // 检查是否已存在管理员账户（检查 admin 表中是否有记录）
    const adminCount = db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM admin'
    );

    if (adminCount && adminCount.count > 0) {
      console.log('📋 管理员账户已存在，跳过创建默认管理员');
      return;
    }

    const username = config.auth.adminUsername;
    const password = config.auth.adminPassword;

    const crypto = await import('crypto');
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    const defaultAdmin: CreateAdminDTO = {
      username,
      password: passwordHash,
    };

    db.execute(
      `INSERT INTO admin (username, password_hash)
       VALUES (?, ?)`,
      [defaultAdmin.username, defaultAdmin.password]
    );

    console.log('✅ 数据库初始化完成');
    console.log('   默认管理员账户已创建');
    console.log(`   用户名：${username}`);
    console.log(`   密码：${password}`);
    console.log('   ⚠️  请首次登录后立即修改密码！');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw new Error(`数据库初始化失败：${(error as Error).message}`);
  }
}

/**
 * 重置数据库（用于测试）
 */
export async function resetDatabase(): Promise<void> {
  const config = getConfig();
  const db = getConnection({
    databasePath: config.database.databasePath,
    walMode: config.database.walMode,
    cacheSize: config.database.sqliteCacheSize,
  });

  try {
    await db.initialize();

    // 删除所有表
    db.execute('DROP TABLE IF EXISTS admin');
    db.execute('DROP TABLE IF EXISTS installation');
    db.execute('DROP TABLE IF EXISTS repository');
    db.execute('DROP TABLE IF EXISTS analysis');
    db.execute('DROP TABLE IF EXISTS analysis_job');
    db.execute('DROP TABLE IF EXISTS webhook_event');
    db.execute('DROP TABLE IF EXISTS usage_metric');
    db.execute('DROP TABLE IF EXISTS jobs');

    console.log('🧹 数据库已重置');
  } catch (error) {
    console.error('❌ 数据库重置失败:', error);
    throw new Error(`数据库重置失败：${(error as Error).message}`);
  }
}
