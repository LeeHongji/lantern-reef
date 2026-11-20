// usage: node fly.mjs <query|-> <pixels> [detail]   scripted 60 s fly-through as a benchmark at a fixed resolution
import { createRequire } from 'module';
// Playwright is resolved from this folder, or from PLAYWRIGHT_FROM (a folder that has it installed)
const require = createRequire(process.env.PLAYWRIGHT_FROM ? process.env.PLAYWRIGHT_FROM + '/' : import.meta.url);
const { chromium } = require('playwright');
const [query = '-', pixels = '921600', detail = '1', vw = '1600', vh = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: +vw, height: +vh }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error] ' + m.text().slice(0, 300)); });
const t0 = Date.now();
await page.goto(new URL('../dev.html', import.meta.url).href + (query !== '-' ? '?' + query : ''));
await page.waitForFunction(() => /\bm\b|\be\b/.test(document.body.className), null, { timeout: 240000 });
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(await page.evaluate(() => window.__reef.STATS)));
await page.evaluate(([p, d]) => { const R = window.__reef; R.enter(); R.setRes(p, d); }, [+pixels, +detail]);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__reef.start(true));
await page.waitForFunction(() => window.__reef.result, null, { timeout: 120000 });
const r = await page.evaluate(() => window.__reef.result);
const f = (o) => o ? `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms (${o.n} samples)` : 'n/a';
console.log(`${r.w}x${r.h} detail ${detail}\n  frame ${f(r.frame)}\n  GPU   ${f(r.gpu)}`);
await browser.close();
