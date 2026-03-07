import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- Checking Frontend ---');
  try {
    await page.goto('http://localhost:3001');
    const title = await page.title();
    console.log(`Frontend Title: ${title}`);
  } catch (e) {
    console.error('Frontend check failed:', e);
  }

  console.log('\n--- Checking Backend Resources ---');
  try {
    const response = await page.goto('http://localhost:7900/api/status/resources');
    if (response) {
        const data = await response.json();
        console.log('Backend Resource Status:');
        console.log(`  System Memory Used: ${data.memory.system.percent}%`);
        console.log(`  Node.js RSS: ${data.memory.node.rss} MB`);
        
        // 检查是否有关于 RSS 的警告
        const rssWarning = data.recommendations.find((r: string) => r.includes('Node.js RSS'));
        if (rssWarning) {
            console.log(`  WARNING: ${rssWarning}`);
        } else {
            console.log('  OK: No Node.js RSS warnings found (Limit increased to 512MB)');
        }
    }
  } catch (e) {
    console.error('Backend check failed:', e);
  }

  await browser.close();
})();
