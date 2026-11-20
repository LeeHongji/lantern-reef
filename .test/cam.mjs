// usage: node cam.mjs <outPrefix> <query|-> "x,y,z,tx,ty,tz" ...   one page load, one render per camera at 1600x900
import { createRequire } from 'module';
// Playwright is resolved from this folder, or from PLAYWRIGHT_FROM (a folder that has it installed)
const require = createRequire(process.env.PLAYWRIGHT_FROM ? process.env.PLAYWRIGHT_FROM + '/' : import.meta.url);
const { chromium } = require('playwright');
const [out, query, ...cams] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(new URL('../dev.html', import.meta.url).href + (query && query !== '-' ? '?' + query : ''));
await page.waitForFunction(() => /\bm\b|\be\b/.test(document.body.className), null, { timeout: 180000 });
await page.evaluate(() => { const R = window.__reef; R.enter(); R.setRes(1600 * 900, 1); document.getElementById('n').style.display = 'none'; document.getElementById('o').style.display = 'none'; });
let k = 0;
for (const c of cams) {
  let a = c.split(',').map(Number);
  if (c.startsWith('whale')) a = await page.evaluate(() => { const t = window.__reef.F[16] + 1.3, ta = t * 0.0125 + 2.4, x = 116 * Math.cos(ta), z = 116 * 0.8 * Math.sin(ta), y = -22 + 4 * Math.sin(2 * ta + 0.3); return [x * 0.78, y - 3, z * 0.78, x, y, z]; });
  await page.evaluate((a) => { const R = window.__reef; R.lookAt(...a); R.F[27] = a[1] > 0 ? 1 : -1; R.F[25] = a[1] > 0 ? 0.40 : 0.62; }, a);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}${++k}.png` });
  console.log(k, c, 'cam now', JSON.stringify(await page.evaluate(() => [...window.__reef.F.slice(0, 3)].map((v) => +v.toFixed(1)))));
}
console.log(logs.slice(0, 12).join('\n').slice(0, 1500) || 'no console errors');
await browser.close();
