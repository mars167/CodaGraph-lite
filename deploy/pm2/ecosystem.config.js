/**
 * CodaGraph-lite PM2 配置文件
 * 适用于 2u2g 服务器优化
 *
 * 使用方法:
 *   pm2 start deploy/pm2/ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'codagraph-lite-frontend',
      script: './web/node_modules/.bin/next',
      args: 'start',
      cwd: '/opt/codagraph-lite',
      interpreter: '/usr/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=200',
        PORT: 3000
      },
      // 2u2g 优化：内存限制
      max_memory_restart: '1G',
      // 自动重启配置
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // 日志配置
      error_file: '/opt/codagraph-lite/logs/frontend-error.log',
      out_file: '/opt/codagraph-lite/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 进程管理
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      // 优雅关闭
      shutdown_with_message: true
    },
    {
      name: 'codagraph-lite-backend',
      script: './server/dist/index.js',
      cwd: '/opt/codagraph-lite',
      interpreter: '/usr/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/opt/codagraph-lite/.env',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=200'
      },
      // 2u2g 优化：内存限制
      max_memory_restart: '1G',
      // 自动重启配置
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // 日志配置
      error_file: '/opt/codagraph-lite/logs/backend-error.log',
      out_file: '/opt/codagraph-lite/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 进程管理
      kill_timeout: 30000,  // 30秒超时，确保 Python agents 正确终止
      wait_ready: true,
      listen_timeout: 10000,
      // 优雅关闭
      shutdown_with_message: true
    }
  ],
  // 部署配置（可选）
  deploy: {
    production: {
      user: 'node',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:codagraph/codagraph-lite.git',
      path: '/opt/codagraph-lite',
      'pre-deploy-local': [
        'echo "Starting deployment..."'
      ],
      'post-deploy': [
        'npm install',
        'cd web && npm install && npm run build',
        'cd ../server && npm run build',
        'pm2 reload ecosystem.config.js --env production'
      ],
      'pre-setup': [
        'apt-get install git'
      ]
    }
  }
};
