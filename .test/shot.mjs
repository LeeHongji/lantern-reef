// usage: node shot.mjs <outDir> [poses e.g. 0,1,7] [settle ms] [query e.g. lv=1] [extra js]
// Loads dev.html in headless Chrome with the real GPU, renders the preset viewpoints at 1600x900 and prints errors.
import { createRequire } from 'module';
// Playwright is resolved from this folder, or from PLAYWRIGHT_FROM (a folder that has it installed)
const require = createRequire(process.env.PLAYWRIGHT_FROM ? process.env.PLAYWRIGHT_FROM + '/' : import.meta.url);
const { chromium } = require('playwright');
const [out = '/tmp/reef', poses = '0,1,2,3,4,5,6,7,8,9', settle = '1200', query = '', extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const t0 = Date.now();
await page.goto(new URL('../dev.html', import.meta.url).href + (query ? '?' + query : ''));
await page.waitForFunction(() => /\bm\b|\be\b/.test(document.body.className), null, { timeout: 180000 }).catch(() => logs.push('timeout waiting for the menu'));
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s, state "${await page.evaluate(() => document.body.className)}", status "${await page.evaluate(() => document.getElementById('s').textContent)}"`);
if (await page.evaluate(() => document.body.className === 'm')) {
  console.log('stats', JSON.stringify(await page.evaluate(() => window.__reef.STATS)));
  await page.evaluate((extra) => { const R = window.__reef; R.enter(); R.setRes(1600 * 900, 1); document.getElementById('n').style.display = 'none'; if (extra) eval(extra); }, extra);
  for (const i of poses.split(',').map(Number)) {
    await page.evaluate((i) => window.__reef.goPose(i, true), i);
    await page.waitForTimeout(+settle);
    await page.screenshot({ path: `${out}/p${i + 1}.png` });
  }
  console.log('size', JSON.stringify(await page.evaluate(() => window.__reef.size)), 'gpu ms', await page.evaluate(() => window.__reef.F[19].toFixed(2)));
}
console.log(logs.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
