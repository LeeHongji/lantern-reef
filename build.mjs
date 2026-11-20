// Bundles src/*.js into one self-contained HTML file. No dependencies.
//   node build.mjs          -> index.html (WGSL whitespace-minified)
//   node build.mjs --dev    -> dev.html   (readable, plus src/60-dev.js: fly-through, benchmark, test hooks)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const files = readdirSync(path.join(here, 'src')).filter((f) => f.endsWith('.js') && (dev || !f.includes('-dev'))).sort();
let js = files.map((f) => readFileSync(path.join(here, 'src', f), 'utf8')).join('\n');
if (!dev) {
  // shrink the WGSL inside /*wgsl*/`...` literals; ${...} placeholders are left alone
  const min = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').replace(/ ?([{}()\[\];,:=+\-*\/<>&|!%@]) ?/g, '$1').trim();
  js = js.replace(/\/\*wgsl\*\/`([^`]*)`/g, (_, w) => '`' + w.split(/(\$\{[^}]*\})/).map((part, i) => (i % 2 ? part : min(' ' + part + ' ').replace(/^(?=\S)/, ''))).join('') + '`');
  js = js.split('\n').filter((l) => !/^\s*\/\/(?!\/)/.test(l)).join('\n');
}
// everything runs inside one async function; a failure to start is shown on the page
const body = `(async()=>{\n${js}\n})().catch(e=>{console.error(e);document.body.className='l e';document.getElementById('s').textContent=(e.cause?'':'Failed to start: ')+e.message});`;
const out = dev ? 'dev.html' : 'index.html';
const html = readFileSync(path.join(here, 'template.html'), 'utf8').replace('/*SCRIPT*/', () => body);
writeFileSync(path.join(here, out), html);
console.log(`${out}: ${(html.length / 1024).toFixed(1)} kB, ${(gzipSync(Buffer.from(html), { level: 9 }).length / 1024).toFixed(1)} kB gzipped, from ${files.length} files`);
