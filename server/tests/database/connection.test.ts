/**
 * 数据库连接层单元测试
 */

import { DatabaseConnection } from '../src/database/connection';

describe('DatabaseConnection', () => {
    let db: DatabaseConnection;

    beforeAll(() => {
        db = new DatabaseConnection(':memory:');
    });

    afterAll(async () => {
        await db.close();
    });

    describe('initialization', () => {
        it('should initialize database successfully', async () => {
            const connection = db.getConnection();
            expect(connection).toBeDefined();
        });

        it('should enable WAL mode', async () => {
            const connection = db.getConnection();
            await connection.run('PRAGMA journal_mode');
            const result = await connection.get('SELECT journal_mode FROM pragma_list');
            expect(result).toBe('wal');
        });

        it('should set cache size', async () => {
            const connection = db.getConnection();
            await connection.run('PRAGMA cache_size = -2000');
            const result = await connection.get('PRAGMA cache_size');
            expect(result).toBe('-2000');
        });
    });

    describe('connection pooling', () => {
        it('should acquire connection from pool', () => {
            const conn1 = db.acquire();
            const conn2 = db.acquire();
            expect(conn1).toBeDefined();
            expect(conn2).toBeDefined();
            expect(conn1).not.toBe(conn2);
        });

        it('should release connection back to pool', () => {
            const conn = db.acquire();
            db.release(conn);
            // 连接应该回到池中可用
            const conn2 = db.acquire();
            expect(conn2).toBeDefined();
        });

        it('should timeout if pool exhausted', async () => {
            // 设置小池大小进行测试
            const connection = new DatabaseConnection(':memory:', { max: 1 });

            // 获取连接
            const conn1 = connection.acquire();

            // 等待超时
            await expect(connection.acquire()).rejects.toThrow();
        }, 10000);
    });

    describe('error handling', () => {
        it('should handle invalid database path', async () => {
            const invalidDb = new DatabaseConnection('/invalid/path/db.db');
            await expect(invalidDb.getConnection()).rejects.toThrow();
        });

        it('should handle database locked', async () => {
            const connection = db.getConnection();
            // 模拟数据库锁定
            connection.run.mockRejectedValueOnce(new Error('database is locked'));

            await expect(
                connection.run('SELECT 1')
            ).rejects.toThrow('database is locked');
        });
    });

    describe('connection lifecycle', () => {
        it('should close all connections on shutdown', async () => {
            const conn1 = db.acquire();
            const conn2 = db.acquire();

            await db.close();

            // 所有连接应已关闭
            expect(conn1.isClosed()).toBe(true);
            expect(conn2.isClosed()).toBe(true);
        });
    });
});
