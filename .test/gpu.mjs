// usage: node gpu.mjs <query|-> <pixels> [detail]   GPU time and frame rate at each viewpoint, at a fixed resolution
import { createRequire } from 'module';
// Playwright is resolved from this folder, or from PLAYWRIGHT_FROM (a folder that has it installed)
const require = createRequire(process.env.PLAYWRIGHT_FROM ? process.env.PLAYWRIGHT_FROM + '/' : import.meta.url);
const { chromium } = require('playwright');
const [query = '-', pixels = '921600', detail = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto(new URL('../dev.html', import.meta.url).href + (query !== '-' ? '?' + query : ''));
await page.waitForFunction(() => /\bm\b|\be\b/.test(document.body.className), null, { timeout: 240000 });
await page.evaluate(([p, d]) => { const R = window.__reef; R.enter(); R.setRes(p, d); }, [+pixels, +detail]);
const n = await page.evaluate(() => window.__reef.POSES.length);
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => window.__reef.goPose(i, true), i);
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => new Promise((res) => { const R = window.__reef; let k = 0, g = 0, t0 = performance.now(); const f = () => { g += R.F[19]; if (++k < 90) requestAnimationFrame(f); else res([g / k, (performance.now() - t0) / k]); }; requestAnimationFrame(f); }));
  console.log(`${String(i + 1).padStart(2)} ${(await page.evaluate((i) => window.__reef.POSES[i][7], i)).padEnd(16)} GPU ${r[0].toFixed(1)} ms   frame ${r[1].toFixed(1)} ms`);
}
await browser.close();
