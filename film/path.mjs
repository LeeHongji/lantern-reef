// The film's flight plan. Times in seconds, positions in world metres (y up, sea level 0, north +z).
// A shot is a continuous flight; between shots the film cuts. The camera faces where it is going, turned toward a
// look-at point where one is given, and banks into its turns like a craft.
export const FPS = 60, DURATION = 50;

// keys: [t, x, y, z]; look: [t, x, y, z, weight] (weight 0..1 of the look-at point against the direction of travel)
export const SHOTS = [
  { name: 'descent', t0: 0, t1: 12,
    keys: [[0, -175, 70, -160], [2.4, -100, 34, -92], [4.1, -40, 5, -40], [4.9, -27, -8, -27], [6, -20, -27, -16], [7.1, -7, -31, -28],
      [8.4, 1, -37, -44], [9.4, 3, -36, -58], [10.7, 7, -32, -76], [12, 1, -24, -98]],
    look: [[0, 120, -10, 140, 0.55], [3, 0, -20, 0, 0.3], [5.6, -5, -36, -7, 0.65], [7, -5, -36, -7, 0.5], [8, 0, -38, -42, 0.1], [10.6, 0, -10, -95, 0.15], [12, 0, 0, -100, 0.55]] },
  { name: 'wreck', t0: 12, t1: 17.5,
    keys: [[12, 35, -38, -13], [13.8, 46, -36, -10], [15.7, 61, -33, -10], [17.5, 74, -27, -7]],
    look: [[12, 56, -32, 8, 0.6], [17.5, 60, -30, 8, 0.7]] },
  { name: 'arches', t0: 17.5, t1: 22.5,
    keys: [[17.5, -22, -36.5, -22], [18.7, -40, -38.5, -44], [19.9, -54, -39, -58], [21.1, -68, -38.5, -72], [22.5, -86, -34, -90]],
    look: [] },
  { name: 'grotto to harbor', t0: 22.5, t1: 50,
    keys: [[22.5, 6, -37, 46], [23.7, 6, -38, 62], [24.8, 7, -37, 80], [25.7, 6, -34.5, 92], [26.5, 3.6, -26, 93.6], [27.3, 1.8, -14, 87.6], [28.0, -0.4, 0.5, 80.4],
      [28.9, 2, 10, 80], [31, 32, 20, 104], [33, 130, 11, 152], [35, 186, 5.5, 197], [36.2, 207, 4, 220], [37.3, 232, 5, 236], [38.4, 252, 9, 248],
      [39.5, 270, 22, 253], [40.8, 292, 40, 272], [42.2, 318, 64, 298], [43.6, 350, 102, 338], [45, 392, 150, 384], [47.4, 432, 196, 386], [50, 456, 222, 392]],
    look: [[22.5, 6, -37, 80, 0.2], [25.2, 6, -30, 96, 0.35], [26.2, -0.4, 0, 80.4, 0.55], [27.6, -0.4, 6, 78, 0.3], [28.4, 120, 5, 140, 0.75], [29.8, 200, 10, 210, 0.6], [33, 211, 4, 211, 0.3],
      [36.2, 265, 20, 265, 0.35], [38.4, 265, 30, 265, 0.6], [39.6, 290, 25, 290, 0.6], [41.2, 340, 50, 330, 0.7], [43.4, 388, 80, 388, 0.75], [44.6, 380, 60, 380, 0.6], [46, 240, 0, 240, 0.9], [50, 215, 0, 215, 0.97]] },
];

// hand-lettered captions: [t0, t1, text, top (% of height), size (px at 1080p), bold]
const CAPS = [
  [0.5, 3.9, 'Lantern Reef', 34, 150, true],
  [1.1, 3.9, 'a sea in a single web page', 52, 52],
  [6.2, 9.6, 'Every rock, blade and fish is computed', 76, 50],
  [12.4, 16.6, 'No textures. No models. No downloads.', 76, 50],
  [18, 22, 'WebGPU · WGSL · Web Audio', 76, 50],
  [23.1, 26.6, 'Into the Amethyst Grotto', 76, 50],
  [29.6, 33.8, 'Up through the skylight, out to sea', 76, 50],
  [36, 40, 'Port Amaro', 72, 96, true],
  [36.4, 40, 'the harbor and its clock', 84, 46],
  [46.2, 50, 'Lantern Reef', 36, 140, true],
  [46.8, 50, 'leehongji.github.io/lantern-reef', 53, 50],
];

const shotAt = (t) => SHOTS.find((s) => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
// cubic Hermite through keys with tangents from neighbours (non-uniform times), clamped at the ends
function herm(keys, t, n) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], h = b[0] - a[0], u = Math.min(Math.max((t - a[0]) / h, 0), 1);
  const tan = (j) => { const p = keys[Math.max(j - 1, 0)], q = keys[Math.min(j + 1, keys.length - 1)]; return (k) => (q[k] - p[k]) / (q[0] - p[0]); };
  const ta = tan(i), tb = tan(i + 1), u2 = u * u, u3 = u2 * u, out = [];
  for (let k = 1; k <= n; k++) out.push((2 * u3 - 3 * u2 + 1) * a[k] + (u3 - 2 * u2 + u) * h * ta(k) + (-2 * u3 + 3 * u2) * b[k] + (u3 - u2) * h * tb(k));
  return out;
}
const lerpKeys = (keys, t) => {
  if (!keys.length) return null;
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1][0]) {
    const a = keys[i], b = keys[i + 1], u = (t - a[0]) / (b[0] - a[0]), s = u * u * (3 - 2 * u);
    return a.slice(1).map((v, k) => v + (b[k + 1] - v) * s);
  }
  return keys[keys.length - 1].slice(1);
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = (a) => Math.hypot(...a), norm = (a) => { const l = len(a) || 1; return a.map((v) => v / l); };
const pos = (s, t) => herm(s.keys, Math.min(Math.max(t, s.t0), s.t1), 3);
function heading(s, t) {
  const p = pos(s, t), e = 1 / 120, v = norm(sub(pos(s, t + e), pos(s, t - e))), L = lerpKeys(s.look, t);
  if (!L) return v;
  const d = norm(sub(L.slice(0, 3), p));
  return norm(v.map((c, k) => c * (1 - L[3]) + d[k] * L[3]));
}
const yawOf = (f) => Math.atan2(f[0], -f[2]), wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

export function camera(t) {
  const s = shotAt(t), p = pos(s, t), f = heading(s, t);
  const yaw = yawOf(f), pitch = Math.asin(Math.max(-0.999, Math.min(0.999, f[1])));
  // bank into the turn: roll follows the rate of turn, averaged over a quarter second so it eases in and out
  let rate = 0; for (let k = -4; k <= 4; k++) { const a = t + k / 32; rate += wrap(yawOf(heading(s, a + 0.02)) - yawOf(heading(s, a - 0.02))) / 0.04; }
  const roll = Math.max(-0.42, Math.min(0.42, -0.2 * rate / 9));
  // the eye adapts as it would in the app (a first-order filter run over the last two seconds), and the lens runs
  // with water for a moment after breaking the surface
  const target = (y) => y > 0 ? 0.37 : 0.62 * (0.6 + 0.4 * Math.min(Math.max((-y - 8) / 26, 0), 1));
  let ex = target(pos(s, Math.max(s.t0, t - 2))[1]), wet = 0;
  for (let a = Math.max(s.t0, t - 2); a < t; a += 1 / 60) {
    const y0 = pos(s, a)[1], y1 = pos(s, a + 1 / 60)[1];
    ex += (target(y1) - ex) * (1 - Math.exp(-2.5 / 60));
    if (y0 <= 0 && y1 > 0) wet = 1; else wet *= Math.exp(-1.4 / 60);
  }
  return { t: 40 + t, x: p[0], y: p[1], z: p[2], yaw, pitch, roll, expo: ex, wet };
}

export function captions(t) {
  return CAPS.filter((c) => t > c[0] && t < c[1]).map((c) => ({ text: c[2], top: c[3], size: c[4], bold: !!c[5], a: Math.min(1, (t - c[0]) / 0.5, (c[1] - t) / 0.5) }));
}
