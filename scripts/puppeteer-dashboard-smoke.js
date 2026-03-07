const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

(async () => {
  execSync('node scripts/seed-e2e-data.js', { stdio: 'inherit' });

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  await page.type('#username', 'admin');
  await page.type('#password', 'changeme');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  const paths = [
    '/dashboard/repositories',
    '/dashboard/jobs',
    '/dashboard/history',
  ];

  for (const path of paths) {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle2' });
    const heading = await page.$eval('h1', (el) => el.textContent?.trim() || '');
    console.log(`Visited ${path}: ${heading}`);
  }

  if (pageErrors.length > 0) {
    throw new Error(`Page errors detected: ${pageErrors.join('; ')}`);
  }

  await browser.close();
})();
