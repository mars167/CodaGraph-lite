import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const seededRepositoryName = 'codagraph-lite-e2e-fixture';

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
  await page.getByRole('textbox', { name: 'Search' }).fill(`mars167/${seededRepositoryName}`);
  await expect(page.getByText('搜索命中 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: seededRepositoryName, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '开启 Watch' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('jobs page renders seeded job stats and row', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/dashboard/jobs');
  await expect(page.getByRole('heading', { name: '作业状态' })).toBeVisible();
  await expect(page.getByRole('link', { name: `Job #9301 · ${seededRepositoryName} · PR #42` })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('history page renders seeded analysis entry', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/dashboard/history');
  await expect(page.getByRole('heading', { name: '按 PR 维度回看 Review 历史' })).toBeVisible();
  await expect(page.getByRole('link', { name: `mars167/${seededRepositoryName}` })).toBeVisible();
  await expect(page.getByText('E2E validation PR')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
