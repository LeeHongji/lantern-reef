// The promo film: a shuttle flight through Lantern Reef, rendered frame by frame from dev.html.
//   node film/film.mjs preview            every 12th frame at 640x360 -> film/out/preview/*.png and a contact sheet
//   node film/film.mjs render [from] [to] full frames at 1920x1080 -> film/out/frames/*.png
// Every frame is a pure function of its number: camera, clock and captions all come from t, nothing from wall time.
// Needs Playwright (PLAYWRIGHT_FROM points to a folder that has it) and Chrome with WebGPU.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { SHOTS, FPS, DURATION, camera, captions } from './path.mjs';
const require = createRequire(process.env.PLAYWRIGHT_FROM ? process.env.PLAYWRIGHT_FROM + '/' : import.meta.url);
const { chromium } = require('playwright');

const mode = process.argv[2] || 'preview';
const prev = mode === 'preview';
const [W, H] = prev ? [640, 360] : [1920, 1080];
const out = new URL(prev ? './out/preview/' : './out/frames/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const N = Math.round(DURATION * FPS);
const from = +(process.argv[3] || 0), to = Math.min(+(process.argv[4] || N), N), step = prev ? 12 : 1;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(new URL('../dev.html?lv=' + (prev ? 1 : 0), import.meta.url).href);
await page.waitForFunction(() => /\bm\b|\be\b/.test(document.body.className), null, { timeout: 240000 });
await page.evaluate(([w, h]) => {
  const R = window.__reef; R.enter(); R.setRes(w * h, 1); R.freeze();
  for (const id of ['o', 'n', 'i']) document.getElementById(id).style.display = 'none';
  // the caption layer: hand lettering over the picture, positioned and faded by the recorder
  const c = document.createElement('div'); c.id = 'filmcap';
  c.style.cssText = 'position:absolute;inset:0;pointer-events:none;color:#fffaf0;font-family:"Bradley Hand",cursive;text-shadow:0 .05em .45em #0b2a36cc,0 0 .08em #0b2a36';
  document.body.appendChild(c);
}, [W, H]);
await page.waitForTimeout(1500);

const t0 = Date.now();
for (let f = from; f < to; f += step) {
  const t = f / FPS, c = camera(t), cap = captions(t);
  await page.evaluate(([c, cap, H]) => {
    const el = document.getElementById('filmcap');
    el.innerHTML = cap.map((k) => `<div style="position:absolute;left:0;right:0;top:${k.top}%;text-align:center;opacity:${k.a};transform:translateY(${(1 - k.a) * 0.6}em);font-size:${k.size * H / 1080}px;font-weight:${k.bold ? 700 : 400};line-height:1.1">${k.text}</div>`).join('');
    return window.__reef.shot(c.t, c.x, c.y, c.z, c.yaw, c.pitch, c.roll, c.expo, c.wet);
  }, [c, cap, H]);
  await page.screenshot({ path: `${out}${String(f).padStart(5, '0')}.png` });
  if (!prev && f % 60 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`${prev ? 'preview' : 'render'} done: frames ${from}-${to} in ${((Date.now() - t0) / 1000).toFixed(0)} s; errors: ${errs.length ? errs.slice(0, 5).join(' | ') : 'none'}`);
writeFileSync(new URL('./out/shots.json', import.meta.url), JSON.stringify(SHOTS.map((s) => [s.name, s.t0, s.t1])));
await browser.close();
