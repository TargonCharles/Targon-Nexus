import { chromium } from 'playwright';

console.log('1. Loading Playwright...');
const browser = await chromium.launch({ headless: true });
console.log('2. Browser launched');

const page = await browser.newPage();
console.log('3. Navigating to Stanford faculty page...');

await page.goto('https://physics.stanford.edu/people/faculty', {
  waitUntil: 'domcontentloaded',
  timeout: 30000
});

const title = await page.title();
console.log('4. Page title:', title);

const text = await page.evaluate(() => document.body?.innerText?.trim()?.substring(0, 300));
console.log('5. Content preview:', text);

await browser.close();
console.log('6. Crawler test COMPLETE!');
