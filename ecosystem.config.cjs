// PM2 生态系统配置文件
// 用于管理 CodaGraph 应用的所有进程

module.exports = {
  apps: [
    // ============================================
    // 后端服务
    // ============================================
    {
      name: 'codagraph-server',
      script: './server/dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 7900,
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/codagraph',
        REDIS_HOST: process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
        LOG_LEVEL: 'info',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 7900,
        LOG_LEVEL: 'debug',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 7900,
        LOG_LEVEL: 'info',
      },
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,
    },

    // ============================================
    // 前端服务
    // ============================================
    {
      name: 'codagraph-web',
      script: 'npx',
      args: 'next start',
      cwd: './web',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7900',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,
    },

    // ============================================
    // Redis 客户端监控（可选）
    // ============================================
    {
      name: 'redis-monitor',
      script: './scripts/monitor-redis.js',
      cwd: __dirname,
      instances: 1,
      autorestart: false,
      cron_restart: '0 */6 * * * *', // 每6小时重启一次
      error_file: './logs/redis-monitor-error.log',
      out_file: './logs/redis-monitor-out.log',
    },

    // ============================================
    // 数据库备份任务
    // ============================================
    {
      name: 'db-backup',
      script: './scripts/backup-db.sh',
      cwd: __dirname,
      instances: 1,
      autorestart: false,
      cron_restart: '0 2 * * *', // 每天凌晨2点执行
      error_file: './logs/backup-error.log',
      out_file: './logs/backup-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ============================================
    // 日志轮转任务
    // ============================================
    {
      name: 'log-rotate',
      script: './scripts/rotate-logs.sh',
      cwd: __dirname,
      instances: 1,
      autorestart: false,
      cron_restart: '0 */12 * * * *', // 每12小时执行一次
      error_file: './logs/rotate-error.log',
      out_file: './logs/rotate-out.log',
    },
  ],

  // ============================================
  // 部署配置
  // ============================================
  deploy: {
    production: {
      user: process.env.DEPLOY_USER || 'node',
      host: process.env.DEPLOY_HOST || 'localhost',
      ref: 'origin/main',
      repo: process.env.REPO_URL || 'git@github.com:your-org/codagraph.git',
      path: process.env.DEPLOY_PATH || '/var/www/codagraph',
      'pre-deploy-local': [
        'echo "=== 开始部署前检查 ==="',
        'npm run lint || exit 1',
        'npm test || exit 1',
      ],
      'post-deploy': [
        'echo "=== 部署后任务 ==="',
        'pm2 reload all',
        'npx pm2 save',
      ],
      'pre-setup': 'npm install',
      'post-setup': [
        'cd server && npx prisma generate',
        'npx prisma migrate deploy',
      ],
      env: {
        NODE_ENV: 'production',
      },
    },
    staging: {
      user: process.env.DEPLOY_USER || 'node',
      host: process.env.DEPLOY_HOST || 'localhost',
      ref: 'origin/develop',
      repo: process.env.REPO_URL || 'git@github.com:your-org/codagraph.git',
      path: process.env.DEPLOY_PATH || '/var/www/codagraph-staging',
      'post-deploy': [
        'pm2 reload all',
      ],
    },
  },
};
