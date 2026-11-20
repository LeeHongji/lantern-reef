// ============================================================================
// Detail level, chosen before anything is built
// ============================================================================
// LV: 0 High, 1 Medium, 2 Low. Medium and Low keep every 2nd / 4th leaf, glint and pebble, bake a smaller shadow map
// and use cheaper shadow filtering and one less layer of rock detail; Low also drops anti-aliasing.
// localStorage.lantern = "level,pixels,detail". lanternLoad is set while the world is built: finding it still set on
// the next visit means that load crashed the tab, so this visit runs one level lower. `?lv=N` in the URL overrides.
const mob = matchMedia('(pointer:coarse)').matches, mem = navigator.deviceMemory;
const keep = (k, v) => { try { localStorage[k] = v; } catch {} };
let SV = [], LV, bad;
try { SV = (localStorage.lantern || '').split(','); bad = localStorage.lanternLoad; } catch {}
const forced = /[?&]lv=([012])/.exec(location.search);
// The adapter is asked for here because the level depends on it: integrated Apple GPUs start on Medium (the menu
// still offers High), other computers on High, phones on Medium or Low by memory.
const adapter = navigator.gpu ? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }) : null;
const soft = adapter && adapter.info && adapter.info.vendor === 'apple';
LV = forced ? +forced[1] : SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : soft ? 1 : 0;
if (forced) SV = [LV];
else if (bad && LV < 2) { SV = [++LV]; keep('lantern', LV); }
const THIN = 1 << LV, SHADOW = LV ? 2048 : 4096, AA = LV > 1 ? 1 : 4, WATER = LV > 1 ? 256 : 512, RAYN = LV > 1 ? 12 : LV ? 22 : 32;
