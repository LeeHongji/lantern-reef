// Drives the real controls in headless Chrome: dive, swim, viewpoints, surface crossing, mute, stats, menu, audio graph.
import { createRequire } from 'module';
import { tmpdir } from 'os';
// Playwright is resolved from this folder, or from PLAYWRIGHT_FROM (a folder that has it installed)
const require = createRequire(process.env.PLAYWRIGHT_FROM ? process.env.PLAYWRIGHT_FROM + '/' : import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(new URL('../dev.html?lv=2', import.meta.url).href);
await page.waitForFunction(() => /\bm\b|\be\b/.test(document.body.className), null, { timeout: 180000 });
await page.screenshot({ path: tmpdir() + '/reef-menu.png' });
const st = () => page.evaluate(() => { const R = window.__reef; return { cls: document.body.className, pos: [...R.F.slice(0, 3)].map((v) => +v.toFixed(1)), side: R.F[27], wet: +R.F[26].toFixed(2), expo: +R.F[25].toFixed(2), name: document.querySelector('#n b').textContent, hud: document.getElementById('i').textContent.split('\n')[0].slice(0, 60) }; });
console.log('menu     ', JSON.stringify(await st()));
await page.click('#d');
await page.waitForTimeout(600);
console.log('dive     ', JSON.stringify(await st()));
const audio = () => page.evaluate(() => { const a = window.__reef.sound(); return a ? { state: a.state, rate: a.sampleRate, t: +a.currentTime.toFixed(1) } : null; });
console.log('audio    ', JSON.stringify(await audio()));
await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW');
console.log('W 1 s    ', JSON.stringify((await st()).pos));
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyE'); await page.waitForTimeout(2600); await page.keyboard.up('KeyE'); await page.keyboard.up('ShiftLeft');
let s = await st(); console.log('Shift+E  ', JSON.stringify(s.pos), 'side', s.side, 'wet', s.wet, 'expo', s.expo, '(should have surfaced)');
await page.keyboard.down('KeyQ'); await page.waitForTimeout(1500); await page.keyboard.up('KeyQ');
s = await st(); console.log('Q        ', JSON.stringify(s.pos), 'side', s.side, 'expo', s.expo);
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyQ'); await page.waitForTimeout(4000); await page.keyboard.up('KeyQ'); await page.keyboard.up('ShiftLeft');
console.log('Shift+Q 4s', JSON.stringify((await st()).pos), '(should rest on the seabed, not pass through)');
for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) { await page.keyboard.press('Digit' + i); await page.waitForTimeout(250); s = await st(); console.log('key ' + i + '    ', s.name.padEnd(16), JSON.stringify(s.pos), 'side', s.side); }
// on the island: fly from the overlook down into a street; the ground must stop the camera
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyQ'); await page.waitForTimeout(4000); await page.keyboard.up('KeyQ'); await page.keyboard.up('ShiftLeft');
s = await st(); console.log('land Q 4s', JSON.stringify(s.pos), 'ground', await page.evaluate(() => { const R = window.__reef; return +R.landY(R.F[0], R.F[2]).toFixed(1); }), '(should stand 1.5 m above the ground)');
await page.keyboard.press('Digit9'); await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyQ'); await page.waitForTimeout(3000); await page.keyboard.up('KeyQ'); await page.keyboard.up('ShiftLeft');
s = await st(); console.log('harbor Q ', JSON.stringify(s.pos), 'side', s.side, 'ground', await page.evaluate(() => { const R = window.__reef; return +R.landY(R.F[0], R.F[2]).toFixed(1); }), '(under water, resting on the harbor floor)');
await page.screenshot({ path: tmpdir() + '/reef-harbor-floor.png' });
await page.keyboard.press('KeyH'); await page.waitForTimeout(900); console.log('H        ', (await st()).hud);
await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(760, 320, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(3500);
console.log('audio    ', JSON.stringify(await audio()));
await page.keyboard.press('Escape'); await page.waitForTimeout(300); console.log('Esc      ', (await st()).cls);
console.log('errors:', logs.length ? logs.join('\n') : 'none');
await browser.close();
