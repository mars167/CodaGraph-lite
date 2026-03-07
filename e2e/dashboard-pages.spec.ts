import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.beforeAll(() => {
  execSync('node scripts/seed-e2e-data.js', { stdio: 'inherit' });
});

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'changeme');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
});

test('repositories page renders seeded repository', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/dashboard/repositories');
  await expect(page.getByRole('heading', { name: '仓库管理' })).toBeVisible();
  await expect(page.getByText('mars167')).toBeVisible();
  await expect(page.getByText('codagraph-lite')).toBeVisible();
  await expect(page.getByText('已连接', { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('jobs page renders seeded job stats and row', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/dashboard/jobs');
  await expect(page.getByRole('heading', { name: '作业状态' })).toBeVisible();
  await expect(page.getByText('analyze_pr')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('history page renders seeded analysis entry', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/dashboard/history');
  await expect(page.getByRole('heading', { name: '分析历史' })).toBeVisible();
  await expect(page.getByText('E2E validation PR')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
