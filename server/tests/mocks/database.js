/**
 * Mock 数据库实例
 */
export const db = {
    _db: null,

    init(path: string) {
        this._db = {
            prepare: jest.fn(),
            run: jest.fn(),
            get: jest.fn(),
            all: jest.fn(),
            exec: jest.fn(),
            close: jest.fn()
        };
        return this._db;
    },

    get db() {
        return this._db;
    },

    clear() {
        // 清理所有 mock 数据
    },

    close() {
        return Promise.resolve();
    }
};

/**
 * Mock 环境变量
 */
export const mockEnv = {
    get(key: string): string | undefined {
        const mockEnvs: Record<string, string> = {
            NODE_ENV: 'test',
            FRONTEND_PORT: '3000',
            BACKEND_PORT: '7900',
            DATABASE_PATH: ':memory:',
            LOG_LEVEL: 'debug'
        };
        return mockEnvs[key];
    }
};
