import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    headless: true,
  },
  webServer: [
    {
      command: 'SKIP_REMOTE_REPOSITORY_SYNC=1 BACKEND_PORT=7901 FRONTEND_PORT=3001 CORS_ORIGINS=http://127.0.0.1:3001 npm run start:server',
      url: 'http://127.0.0.1:7901/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'cd web && mkdir -p .next/standalone/.next && if [ -d .next/static ]; then ln -sfn ../../static .next/standalone/.next/static; fi && PORT=3001 HOSTNAME=127.0.0.1 NEXT_PUBLIC_API_URL=http://127.0.0.1:7901 node .next/standalone/server.js',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
