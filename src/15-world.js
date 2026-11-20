// ============================================================================
// World layout and procedural content (load time only)
// ============================================================================
// Units are metres, y up, sea level y = 0. Everything a designer would move lives in the lists at the top.

const SUN = (() => { const v = [-0.15, 1, -0.5], l = hypot(...v); return v.map((c) => c / l); })();   // from the south, a little west: it lights the town's sea front

// rock masses: ax, az, bx, bz, radius, top, overhang, waist
const MESAS = [
  [-40, -16, -36, 2, 9, -9, 3.5, 2], [-32, 12, -36, 26, 10, -15, 3, 2], [-22, 34, -4, 40, 9, -7, 4, 2],     // rim of the Monolith Basin
  [24, 34, 34, 22, 8, -12, 3, 2], [36, -26, 30, -40, 9, -8, 4, 2],
  [20, -16, 20, -16, 4.4, -6, 2, 1.5],                                                                      // pillar with a window
  [46, 25, 72, 27, 9, -13, 4, 1], [86, 10, 88, -8, 9, -15, 3, 1],                                           // Wreck Gorge: a wall behind the hull, open to the south
  [44, 8, 44, 8, 5, -37, 0, 0], [68, 8, 68, 8, 4.5, -35, 0, 0],                                             // what the hull rests on
  [6, -92, 6, -92, 10, -35, 0, 0], [-8, -118, -8, -118, 7, 4, 2, 2],                                        // Kelp Cathedral: mound, and a pillar through the surface
  [-22, -52, -30, -62, 7, -13, 4, 2], [-64, -40, -74, -50, 7, -12, 4, 2],                                   // Arch Row flanks
  [-82, 48, -108, 12, 7, -13, 5, 2], [-111, 2, -105, -42, 7, -11, 5, 2],                                    // the Rift: west wall
  [-61, 32, -87, -4, 7, -17, 4, 2], [-85, 6, -79, -38, 7, -15, 4, 2],                                       //           east wall
  [-8, 84, 22, 104, 22, -7, 6, 3], [36, 72, 42, 86, 9, -11, 5, 2], [-26, 70, -30, 84, 9, -9, 6, 2],         // Amethyst Grotto massif
  [108, 108, 114, 114, 9, 5.5, -1.5, 0],                                                                    // Lantern Rock
  [131, 91, 131, 91, 4.2, 12, 1, 1], [95, 131, 95, 131, 3.6, 9, 1, 1], [143, 73, 143, 73, 3.2, 7, 1, 0.5],  // sea stacks
  [-118, 104, -118, 104, 5, 14, 1.5, 1], [-150, -40, -150, -40, 4.5, 10, 1, 1], [60, -146, 60, -146, 4, 11, 1, 1],
];
// vertical ring arches: cx, cy, cz, yaw, major radius, minor radius, y squash
const ARCHES = [
  [-38, -5.5, -8, 0.3, 4.2, 1.4, 1.2],                                    // a stone ring on top of the basin wall
  [0, -45, -42, 0, 14, 2.7, 1.2],                                         // gateway from the basin to the kelp
  [-40, -45, -44, -0.785, 12, 2.4, 1.2], [-54, -45, -58, -0.785, 9.5, 2.0, 1.25], [-68, -45, -72, -0.785, 14, 2.8, 1.15],   // Arch Row
  [134, -1, 64, 0.4, 9.5, 2.6, 1.15],                                     // a sea arch standing in the surf
];
// carved tunnels: ax, ay, az, radius, bx, by, bz
const HOLES = [
  [20, -22, -24, 2.5, 20, -22, -8],
  [6, -39, 58, 5.0, 8, -37, 84],                                          // into the grotto
  [20, -38, 100, 3.6, 48, -36, 114],                                      // its back door
  [4, -29, 95, 3.4, 4 + SUN[0] * 36, -29 + SUN[1] * 36, 95 + SUN[2] * 36], // skylight, bored along the sun's direction
];
// hollowed chambers: cx, cy, cz, rx, ry, rz
const CAVES = [[6, -36, 94, 17, 9.5, 14]];
// floor cut deeper along a line: ax, az, bx, bz, half width, depth
const RIFTS = [[-72, 40, -98, 4, 8, 11], [-98, 4, -92, -40, 8, 11]];
// regions kept free of random plateaus: ax, az, bx, bz, radius, softness
const CLEARS = [
  [0, 0, 0, 0, 24, 10], [0, -92, 0, -92, 46, 12], [44, 8, 86, 8, 22, 10], [-36, -40, -74, -78, 14, 8], [-94, -92, -94, -92, 18, 8],
  [-72, 40, -98, 4, 10, 6], [-98, 4, -92, -40, 10, 6], [6, 48, 6, 66, 14, 8], [0, 24, 6, 48, 12, 8], [22, 4, 44, 8, 10, 8],
  [0, -24, 0, -60, 12, 8], [92, 92, 92, 92, 16, 8], [-24, -22, -36, -38, 9, 8], [34, -14, 72, -16, 16, 8],
];
const PURPLE = [6, 90];
const zoneP = (x, z) => sstep(46, 28, hypot(x - PURPLE[0], z - PURPLE[1]));
// magenta ground cover: x, z, radius
const MAGENTA = [[14, 6, 13], [-6, 20, 9], [6, 90, 30], [-80, -6, 9], [56, 30, 12], [8, -72, 10], [-14, -100, 9], [-40, 46, 9], [-48, -56, 9], [26, 44, 8], [-96, -84, 11], [-12, 46, 8], [12, 26, 8], [70, -30, 9]];
const magAt = (x, z) => {
  let m = sstep(0.54, 0.66, fbm(x * 0.03, 7, z * 0.03, 3)) * 0.9;
  for (const p of MAGENTA) m = max(m, sstep(p[2], p[2] * 0.45, hypot(x - p[0], z - p[1])));
  return m * sstep(0.3, 0.55, fbm(x * 0.17, 1, z * 0.17, 2) + m * 0.25);
};
// set pieces and moorings
const FLUKE = [-5, -7], WRECK = [56, -30, 8], KETCH = [10, -4, 0.6], LAMP = [111, 111], RUINS = [-94, -92], BUOY = [90, 99], DINGHY = [96, 94];

// Viewpoints: position, look-at, flag (0: y is height above the local floor, 1: y is absolute), name, caption.
const POSES = [
  [13, 1.4, 10, -5, -30, -7, 0, 'Monolith Basin', 'The stone fluke'],
  [8, 1.3, -60, 4, -20, -92, 0, 'Kelp Cathedral', 'Forty metres of forest'],
  [39, -38.5, -11, 57, -28, 9, 1, 'Wreck Gorge', 'A galleon against the wall'],
  [-30, -36.5, -30, -62, -42, -66, 1, 'Arch Row', 'Three gates and a colonnade'],
  [7, -39.5, 72, 4, -33, 97, 1, 'Amethyst Grotto', 'Light from the skylight'],
  [-71, -40, 43, -97, -55, 4, 1, 'The Rift', 'Where the glow lives'],
  [-12, 1.7, -16, 30, 5, 30, 1, 'The Anchorage', 'Above the reef'],
  [78, 16, 70, 111, 12, 111, 1, 'Lantern Rock', 'The light on the rim'],
  [196, 4.5, 198, 262, 15, 262, 1, 'Port Amaro', 'The harbor and its clock'],
  [304, 50, 310, 222, 6, 222, 1, 'The Overlook', 'Roofs, the bay and the reef beyond'],
];
// The scripted flight (position + look-at, Catmull-Rom). The generator keeps it clear; dev.html flies it.
const FLY = new Float32Array([
  13, -42.5, 10, -5, -30, -7,   9, -41.5, 2, -6, -28, -8,   6, -40, -22, 0, -36, -60,   6, -38, -48, 4, -24, -92,
  8, -36, -76, -30, -34, -70,   -18, -40, -40, -56, -38, -60,   -44, -41, -50, -80, -40, -84,   -70, -40, -64, -94, -40, -92,
  -84, -36, -50, -96, -50, -10,   -92, -50, -20, -98, -54, 10,   -90, -48, 16, -72, -40, 44,   -56, -38, 44, -10, -38, 50,
  -16, -40, 50, 6, -38, 70,   6, -39, 64, 4, -33, 98,   10, -36, 88, 30, -36, 106,   34, -37, 104, 60, -34, 70,
  60, -34, 50, 56, -28, 8,   40, -38, -14, 57, -27, 9,   28, -34, 2, 14, -4, -2,   20, -14, 6, 10, 0, -4,
  14, -3, 2, 60, 6, 60,   16, 4, 6, 111, 14, 111,   60, 14, 56, 111, 14, 111,
  126, 20, 112, 211, 4, 211,   186, 5, 190, 262, 14, 262,   232, 6, 238, 268, 18, 270,   252, 14, 286, 300, 26, 320,
  290, 36, 300, 388, 76, 388,   352, 78, 330, 290, 30, 280,   330, 62, 320, 211, 0, 211,
]);
const FLYN = FLY.length / 6;

function primBuffer() {
  const a = [];
  for (const m of MESAS) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]);
  for (const m of ARCHES) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], 0);
  for (const m of HOLES) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], 0);
  for (const m of CLEARS) a.push(m[0], m[1], m[2], m[3], m[4], m[5], 0, 0);
  for (const m of CAVES) a.push(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0);
  for (const m of RIFTS) a.push(m[0], m[1], m[2], m[3], m[4], m[5], 0, 0);
  return new Float32Array(a);
}

// ---------------------------------------------------------------- terrain mesh from the density grid
// (ported from Abyssal Garden, MIT: surface nets, gradient normals, quads bucketed into the XZ culling grid)
function buildTerrain(D) {
  const sn = surfaceNets(D, NX, NY, NZ), nv = sn.nv, gp = sn.pos;
  const smp = sampler3(D, NX, NY, NZ);
  const vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  const wp = new Float32Array(nv * 3), wn = new Float32Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    const x = gp[k * 3], y = gp[k * 3 + 1], z = gp[k * 3 + 2], e = 0.8;
    let nx = smp(x - e, y, z) - smp(x + e, y, z), ny = smp(x, y - e, z) - smp(x, y + e, z), nz = smp(x, y, z - e) - smp(x, y, z + e);
    const l = hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const X = OX + x * VS, Y = OY + y * VS, Z = OZ + z * VS;
    wp[k * 3] = vf[k * 4] = X; wp[k * 3 + 1] = vf[k * 4 + 1] = Y; wp[k * 3 + 2] = vf[k * 4 + 2] = Z;
    wn[k * 3] = nx; wn[k * 3 + 1] = ny; wn[k * 3 + 2] = nz;
    v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = 127;
  }
  // bucket quads into the XZ culling grid
  const nq = sn.ni / 6, key = new Uint8Array(nq), cnt = new Uint32Array(CELLS * CELLS + 1);
  const lo = new Float32Array(CELLS * CELLS).fill(1e9), hi = new Float32Array(CELLS * CELLS).fill(-1e9);
  for (let q = 0; q < nq; q++) {
    const a = sn.idx[q * 6] * 3;
    const c = clamp(floor((wp[a] - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((wp[a + 2] - OZ) / CELLW), 0, CELLS - 1);
    key[q] = c; cnt[c + 1]++;
    for (let j = 0; j < 6; j++) { const y = wp[sn.idx[q * 6 + j] * 3 + 1]; if (y < lo[c]) lo[c] = y; if (y > hi[c]) hi[c] = y; }
  }
  for (let c = 0; c < CELLS * CELLS; c++) cnt[c + 1] += cnt[c];
  const ib = new Uint32Array(sn.ni), fill = cnt.slice();
  for (let q = 0; q < nq; q++) { const o = fill[key[q]]++ * 6; for (let j = 0; j < 6; j++) ib[o + j] = sn.idx[q * 6 + j]; }
  return { vb, ib, nv, wp, wn, smp, start: cnt, lo, hi };
}

// camera spline over FLY at parameter s in [0, FLYN - 1], written into out[0..5] (no allocation: dev.html calls it per frame)
function flySpline(s, out) {
  let i = floor(s) | 0; if (i > FLYN - 2) i = FLYN - 2; if (i < 0) i = 0;
  const u = s - i, i0 = (i > 0 ? i - 1 : 0) * 6, i1 = i * 6, i2 = (i + 1) * 6, i3 = (i + 2 < FLYN ? i + 2 : FLYN - 1) * 6;
  for (let o = 0; o < 6; o++) {
    const a = FLY[i0 + o], b = FLY[i1 + o], c = FLY[i2 + o], d = FLY[i3 + o];
    out[o] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  }
}

// Mesh ids (47 and up belong to the island, see 17-land.js). 0-3 boulders, 4-6 sponges, 7-8 coral, 9 tube sponges, 10 fluke, 11 wreck, 12 manta, 13 fish,
// 14-19 rock chunks, 20 pebble, 21-22 coral LOD, 23-25 far LOD of the large chunks, 26-27 crystals, 28 column, 29 drum,
// 30 beam, 31 amphora, 32 starfish, 33 urchin, 34 ketch hull, 35 rig, 36 sails, 37 dinghy, 38 buoy, 39 lighthouse,
// 40 anchor, 41-42 chains, 43 turtle, 44 gull, 45 whale, 46 jellyfish.
const PROPS = [4, 5, 6, 7, 8, 9, 32, 33]; // small things, sorted into the culling grid

// ---------------------------------------------------------------- everything placed in the world
function makeWorld(D, T) {
  const gi = (x, y, z) => x + NX * (y + NY * z);
  const smp = T.smp;
  const Dw = (x, y, z) => smp((x - OX) / VS, (y - OY) / VS, (z - OZ) / VS);
  const nCells = CELLS * CELLS;
  const cellOf = (x, z) => clamp(floor((x - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((z - OZ) / CELLW), 0, CELLS - 1);
  const big = Array.from({ length: nCells }, () => []), small = Array.from({ length: nCells }, () => []);
  // Medium and Low keep every 2nd / 4th leaf (but every kelp stem), made wider; the random stream stays the same
  let nth = 0;
  const leaf = (L, x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) => { if (type === 1 || !(nth++ % THIN)) L[cellOf(x, z)].push(x, y, z, len, yaw, tilt, type === 1 ? wid : wid * (1 + LV / 4), hA, type, s1, s2, bend); };
  const glints = [], glint = (...a) => { nth++ % THIN || glints.push(...a); };
  const solids = [], props = PROPS.map(() => Array.from({ length: nCells }, () => []));
  const solid = (mesh, x, y, z, sc, q, mat, seed, ts = 1, bob = 0) => { const pi = PROPS.indexOf(mesh); (pi >= 0 ? props[pi][cellOf(x, z)] : (solids[mesh] ||= [])).push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, ts, bob); };
  const chunks = Array.from({ length: NCHUNK }, () => Array.from({ length: nCells }, () => []));
  const bubbles = [], vents = [], kelpAbs = new Float32Array((NX / 2) * (NY / 2) * (NZ / 2));
  // points the camera is expected to pass: the scripted flight and the viewpoints
  const flyPts = [], sp = new Float64Array(6);
  for (let k = 0; k <= 600; k++) { flySpline(k / 600 * (FLYN - 1), sp); flyPts.push([sp[0], sp[1], sp[2]]); }

  // --- surface queries
  const fl = [];
  // every floor in the column at (x, z), top first: [y, head room up to the ceiling or the sea surface, ...]
  const floorsAt = (x, z) => {
    const ix = clamp(round((x - OX) / VS), 1, NX - 2), iz = clamp(round((z - OZ) / VS), 1, NZ - 2);
    fl.length = 0; let ceil = 99;
    for (let gy = NY - 2; gy >= 0; gy--) {
      const d = D[gi(ix, gy, iz)], da = D[gi(ix, gy + 1, iz)];
      if (da <= 0 && d > 0) { const y = OY + (gy + d / (d - da)) * VS; fl.push(y, min(ceil, 0) - y); } else if (da > 0 && d <= 0) ceil = OY + (gy + 0.5) * VS;
    }
    return fl;
  };
  const gy = (x, z) => { const f = floorsAt(x, z); return f.length ? f[f.length - 2] : -45; };   // the sea floor
  const gTop = (x, z) => { const f = floorsAt(x, z); return f.length ? f[0] : 0; };              // the highest ground
  for (const p of POSES) { if (!p[6]) { p[1] += gy(p[0], p[2]); p[6] = 1; } flyPts.push([p[0], p[1], p[2]]); }
  const grad = (x, y, z) => {
    const e = 0.6; const nx = Dw(x - e, y, z) - Dw(x + e, y, z), ny = Dw(x, y - e, z) - Dw(x, y + e, z), nz = Dw(x, y, z - e) - Dw(x, y, z + e);
    const l = hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
  };
  // march from outside along -n down to the surface
  const snap = (x, y, z, n) => {
    let px = x + n[0] * 2.5, py = y + n[1] * 2.5, pz = z + n[2] * 2.5, prev = Dw(px, py, pz);
    if (prev > 0) return null;
    for (let i = 0; i < 24; i++) {
      const qx = px - n[0] * 0.25, qy = py - n[1] * 0.25, qz = pz - n[2] * 0.25, d = Dw(qx, qy, qz);
      if (d > 0) { const t = prev / (prev - d); const p = [mix(px, qx, t), mix(py, qy, t), mix(pz, qz, t)]; return p.concat(grad(p[0], p[1], p[2])); }
      px = qx; py = qy; pz = qz; prev = d;
    }
    return null;
  };
  const pickV = () => ((rnd() * T.nv) | 0) * 3;
  const tangent = (n) => { let t = abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [1, 0, 0]; const l = hypot(...t); t = t.map((v) => v / l); return [t, [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]]; };
  const nearFly = (x, y, z, r) => { for (const p of flyPts) if (hypot(x - p[0], z - p[2]) < r && y < p[1] + 3 && y > p[1] - 13) return true; return false; };
  const nearPose = (x, z, r = 3) => { for (const p of POSES) if (hypot(x - p[0], z - p[2]) < r) return true; return false; };
  // a point f metres ahead of viewpoint i and r metres to its right
  const rel = (i, f, r) => { const p = POSES[i]; let fx = p[3] - p[0], fz = p[5] - p[2]; const l = hypot(fx, fz); fx /= l; fz /= l; return [p[0] + fx * f - fz * r, p[2] + fz * f + fx * r]; };
  const inR = (x, z, r = 170) => hypot(x, z) < r;

  // --- kelp columns: a few stipes twisting round each other, hung with blades, glints drifting among them
  const column = (x, y, z, H, kind, dens = 1) => {
    const strands = 2 + (rnd() < 0.6) + (rnd() < 0.3), ph = rnd() * TAU, tw = rr(0.1, 0.28), sr = rr(0.2, 0.55), sc = rr(0.75, 1.25);
    const la = rnd() * TAU, lm = rr(0, 0.11), full = rr(0.55, 1.3) * dens;
    const stem = (s, h) => { const a = ph + s * TAU / strands + h * tw, r = sr * (1 - 0.6 * h / H), ln = lm * h * h / H; return [x + cos(a) * r + cos(la) * ln, z + sin(a) * r + sin(la) * ln, a]; };
    for (let s = 0; s < strands; s++) for (let h = 0; h < H - 1; h += 1.7) { const p = stem(s, h); leaf(big, p[0], y + h, p[1], 2.1, p[2] + PI / 2, 0.1, 0.17, h, 1, rnd(), rnd(), 0.3); }
    const n = floor(H * 30 * full);
    for (let i = 0; i < n; i++) {
      const t = pow(rnd(), 0.9), h = t * H, p = stem((rnd() * strands) | 0, h);
      const L = ((0.55 + 0.75 * rnd() * rnd()) * (1 - 0.5 * t * t) * sc + 0.25) * (kind === 1 ? 1.25 : 1.15);
      const tilt = mix(rr(0.4, 1.0), rr(0.15, 0.45), t);
      const type = kind === 1 ? (rnd() < 0.8 ? 3 : 4) : kind === 2 ? (rnd() < 0.5 ? 4 : 0) : 0;
      leaf(big, p[0], y + h, p[1], L * (type === 0 ? 1.25 : 1), rnd() * TAU, tilt, L * (kind === 1 ? rr(0.09, 0.13) : rr(0.13, 0.18)) + 0.03, h, type, rnd(), rnd(), rr(0.38, 0.95));
    }
    for (let i = floor(H * (kind === 1 ? 16 : 13)); i > 0; i--) { const h = rnd() * H, a = rnd() * TAU, r = rr(0.15, 0.8) * (1 - 0.5 * h / H), ln = lm * h * h / H; glint(x + cos(a) * r + cos(la) * ln, y + h, z + sin(a) * r + sin(la) * ln, h, rnd(), kind === 1 ? rnd() : rnd() * 0.6, rr(0.018, 0.05), 0); }
    // what the column takes out of the skylight
    const hx = round((x - OX) / VS / 2), hz = round((z - OZ) / VS / 2);
    for (let hy = floor((y - OY) / VS / 2); hy <= floor((y + H - OY) / VS / 2); hy++) {
      if (hy >= 0 && hy < NY / 2 && hx > 0 && hx < NX / 2 - 1 && hz > 0 && hz < NZ / 2 - 1) kelpAbs[hx + NX / 2 * (hy + NY / 2 * hz)] += 0.17;
    }
  };
  // where kelp grows: x, z, radius, density
  const KELPZ = [[0, -92, 46, 1], [-30, -4, 12, 0.8], [26, 30, 10, 0.7], [74, -30, 26, 0.9], [-58, -58, 14, 0.5], [0, -34, 12, 0.5], [-20, -6, 6, 0.8], [16, -10, 6, 0.8],
    [-44, 56, 16, 0.8], [40, 52, 14, 0.7], [-104, 70, 28, 0.8], [100, 40, 22, 0.7], [-96, -110, 26, 0.7], [100, -86, 30, 0.8], [30, -126, 20, 0.8], [-130, -10, 16, 0.6]];
  const NOKELP = [[FLUKE[0], FLUKE[1], 9], [WRECK[0], WRECK[2], 15], [RUINS[0], RUINS[1], 15], [6, 92, 26], [0, -42, 9], [46, -6, 14], [58, -10, 12], [-40, -44, 9], [-54, -58, 8], [-68, -72, 10], [18, 4, 8], [-85, 20, 12], [-95, -18, 12], [8, -70, 8]];
  const kelpDens = (x, z) => {
    for (const p of NOKELP) if (hypot(x - p[0], z - p[1]) < p[2]) return 0;
    let d = sstep(0.52, 0.64, fbm(x * 0.022, 4, z * 0.022, 3)) * 0.5;
    for (const p of KELPZ) d = max(d, p[3] * sstep(p[2], p[2] * 0.75, hypot(x - p[0], z - p[1])));
    return d;
  };
  const occ = new Set();
  rseed(1);
  const tryColumn = (x, z, kind, force, dens = 1) => {
    const key = floor(x / 2.3) * 4096 + floor(z / 2.3);
    if (occ.has(key)) return;
    const f = floorsAt(x, z), c = [];
    for (let i = 0; i < f.length; i += 2) if (f[i + 1] > 9) c.push(i);
    if (!c.length) return;
    const i = c[(rnd() * c.length) | 0], y = f[i];
    if (grad(x, y, z)[1] < 0.55) return;
    if (!force && flyPts.some((p) => hypot(x - p[0], z - p[2]) < 5 && p[1] < y + 44)) return;
    occ.add(key);
    column(x, y - 0.3, z, min(f[i + 1] - rr(0.2, 4), force ? rr(30, 44) : rr(15, 44)), kind, dens);
  };
  // columns placed by hand to frame the viewpoints: forward, right, kind, density
  const FRAME = [
    [0, 11, -8.5, 0, 1.2], [0, 16, -10.5, 0, 1.2], [0, 21, -9, 0, 1.2], [0, 9, 7.5, 0, 1.3], [0, 14, 9.5, 0, 1.2], [0, 20, 8.5, 0, 1.2], [0, 27, 6.5, 0, 1.2], [0, 6, -6, 2, 1.3],
    [1, 6.5, -5.5, 0, 1.5], [1, 9.5, -8, 0, 1.3], [1, 8, 6, 0, 1.4], [1, 12, 3.8, 0, 1.3], [1, 17, -2.6, 0, 1.2], [1, 21, 4, 0, 1.2], [1, 12, -4.6, 2, 1.2], [1, 27, -9, 0, 1.2], [1, 30, 8.5, 0, 1.2], [1, 37, -3, 0, 1.1],
    [1, 13.5, 6.6, 0, 1.3], [1, 14.5, -7, 0, 1.3], [1, 6.5, 6.6, 0, 1.3], [1, 9, -8.2, 2, 1.3],
    [2, 12, -6, 0, 1], [2, 17, 6, 0, 1], [2, 8, 7.5, 0, 1.2], [2, 24, -8, 0, 1],
    [3, 9, -7, 0, 1.2], [3, 13, 7, 0, 1.2], [3, 20, -9, 0, 1.1], [3, 26, 8.5, 0, 1.1],
  ];
  for (const p of FRAME) { const q = rel(p[0], p[1], p[2]); tryColumn(q[0], q[1], p[3], true, p[4]); }
  for (const p of [[-8, 66, 1], [20, 62, 1], [-12, 108, 1], [26, 110, 2], [-2, 52, 1], [16, 50, 1]]) tryColumn(p[0], p[1], p[2], true, 1);
  rseed(2);
  for (let i = 0; i < 15000; i++) {
    const a = rnd() * TAU, r = sqrt(rnd()) * 168, x = cos(a) * r, z = sin(a) * r;
    if (rnd() < kelpDens(x, z)) tryColumn(x, z, zoneP(x, z) > 0.5 && rnd() < 0.5 ? 1 : rnd() < 0.03 ? 2 : 0);
  }

  // --- tufts of ribbon leaves
  const cluster = (x, y, z, n, type, lmin, lmax, wmin, wmax, tmax, sway) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rnd() * 0.5, L = rr(lmin, lmax);
      leaf(big, x + cos(a) * r, y - 0.15, z + sin(a) * r, L, a, rr(0.05, tmax), rr(wmin, wmax), sway, type, rnd(), rnd(), rr(0.3, 0.8));
    }
  };
  // where the planting is thickest: x, z, radius
  const HOT = [[0, 4, 30], [56, 20, 26], [6, 88, 36], [-52, -56, 24], [4, -90, 30], [-90, -88, 20], [-86, 4, 22], [-40, 48, 18]];
  const hot = (x, z) => { let h = 0.4; for (const p of HOT) h = max(h, sstep(p[2], p[2] * 0.4, hypot(x - p[0], z - p[1]))); return h; };
  rseed(3);
  for (let i = 0; i < 44000; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], ny = T.wn[k + 1];
    if (!inR(x, z, 172) || y > -4) continue;
    const h = hot(x, z), zp = zoneP(x, z), u = rnd();
    if (nearFly(x, y, z, 4) || hypot(x - FLUKE[0], z - FLUKE[1]) < 8 || nearPose(x, z, 8)) continue;
    if (ny > 0.75 && u < 0.10 * h) cluster(x, y, z, 8 + rnd() * 14 | 0, 2, 1.0, 3.0, 0.13, 0.26, 0.6, 2.5);
    else if (ny > 0.6 && u < 0.10 * h + 0.07 * max(zp, h * 0.4)) cluster(x, y, z, 10 + rnd() * 18 | 0, rnd() < 0.8 ? 3 : 4, 0.9, 2.6, 0.14, 0.28, 0.9, 1.5);
    else if (ny < -0.35 && u < 0.5 * max(zp, 0.2)) { // fronds hanging under overhangs and arches
      const n = 12 + rnd() * 20 | 0;
      for (let j = 0; j < n; j++) leaf(big, x + rr(-0.6, 0.6), y + 0.2, z + rr(-0.6, 0.6), rr(0.8, 3.2), rnd() * TAU, PI - rr(0, 0.4), rr(0.08, 0.18), 0, zp > 0.3 || rnd() < 0.5 ? 6 : 0, rnd(), rnd(), rr(0.3, 0.6));
    } else if (ny > -0.2 && ny < 0.8 && u < 0.07) { // tufts growing out of walls
      const yaw = atan2(T.wn[k + 2], T.wn[k]), n = 5 + rnd() * 7 | 0;
      for (let j = 0; j < n; j++) leaf(big, x, y, z, rr(0.5, 1.4), yaw + rr(-0.9, 0.9), rr(0.3, 1.1), rr(0.06, 0.12), 0.5, zp > 0.4 && rnd() < 0.6 ? 3 : 0, rnd(), rnd(), rr(0.2, 0.6));
    }
  }
  // --- ground cover: carpets of small tufts in the magenta patches, turf elsewhere
  rseed(4);
  for (const p of MAGENTA) for (let i = p[2] * p[2] * PI * 45; i > 0; i--) {
    const a = rnd() * TAU, r = sqrt(rnd()) * p[2], x = p[0] + cos(a) * r, z = p[1] + sin(a) * r;
    if (rnd() > magAt(x, z) + 0.12 || nearPose(x, z)) continue;
    const f = floorsAt(x, z); if (!f.length) continue;
    const y = f[f.length - 2]; if (y > -6 || grad(x, y, z)[1] < 0.7) continue;
    const nl = 2 + (rnd() * 3 | 0), yw = rnd() * TAU;
    for (let j = 0; j < nl; j++) leaf(small, x, y - 0.03, z, rr(0.08, 0.26), yw + j * TAU / nl + rr(-0.4, 0.4), rr(0.15, 0.85), rr(0.035, 0.07), 0, 5, rnd(), rnd(), rr(0.3, 0.7));
    if (rnd() < 0.3) for (let j = 0; j < 2; j++) leaf(small, x + rr(-0.2, 0.2), y - 0.04, z + rr(-0.2, 0.2), rr(0.2, 0.55), rnd() * TAU, rr(0.05, 0.6), rr(0.03, 0.06), 0, 7, rnd(), rnd(), rr(0.3, 0.8));
    if (rnd() < 0.3) glint(x, y + rr(0.08, 0.22), z, 0, rnd(), 0.82 + rnd() * 0.18, rr(0.01, 0.02), 0);
  }
  rseed(5);
  for (let i = 0; i < 620000; i++) {
    const k = pickV(), ny = T.wn[k + 1];
    if (ny < 0.72 || T.wp[k + 1] > -6) continue;
    const x = T.wp[k] + rr(-0.45, 0.45), z = T.wp[k + 2] + rr(-0.45, 0.45), y = T.wp[k + 1];
    if (!inR(x, z) || nearPose(x, z)) continue;
    const m = magAt(x, z), zp = zoneP(x, z), u = rnd();
    if (m > 0.3 && u < m * 0.9) for (let j = 0; j < 4; j++) leaf(small, x + rr(-0.1, 0.1), y - 0.05, z + rr(-0.1, 0.1), rr(0.12, 0.34), rnd() * TAU, rr(0.05, 0.75), rr(0.04, 0.08), 0, 5, rnd(), rnd(), rr(0.3, 0.7));
    else if (u < m * 0.9 + 0.5 * max(zp, hot(x, z)) * sstep(0.42, 0.6, fbm(x * 0.09, 9, z * 0.09, 2))) for (let j = 0; j < 3; j++) leaf(small, x + rr(-0.1, 0.1), y - 0.05, z + rr(-0.1, 0.1), rr(0.25, 0.7), rnd() * TAU, rr(0.1, 0.8), rr(0.05, 0.1), 0, 7, rnd(), rnd(), rr(0.3, 0.8));
  }

  // --- sponges and coral, in clusters on rock; starfish and urchins among them
  const spots = [];
  const ZS = [[-52, -56, 26, 1], [0, 0, 30, 0.7], [6, 88, 38, 0.9], [4, -90, 22, 0.6], [58, 14, 26, 0.6], [-90, -88, 20, 0.8], [-86, 4, 20, 0.5]];
  const zw = (x, z) => { let h = 0.45; for (const p of ZS) h = max(h, p[3] * sstep(p[2], p[2] * 0.4, hypot(x - p[0], z - p[1]))); return h; };
  const upQ = (nx, ny, nz, lift) => { const l = hypot(nx, ny + lift, nz); return [nx / l, (ny + lift) / l, nz / l]; };
  rseed(6);
  for (let i = 0; i < 14000; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2];
    if (!inR(x, z) || y > -8 || T.wn[k + 1] < -0.15 || rnd() > zw(x, z) || nearFly(x, y, z, 3)) continue;
    const n0 = [T.wn[k], T.wn[k + 1], T.wn[k + 2]], [t1, t2] = tangent(n0), coral = T.wn[k + 1] > 0.85 || rnd() < 0.35, cnt = coral ? 2 + rnd() * 5 | 0 : 3 + rnd() * 9 | 0, sd = rnd();
    for (let j = 0; j < cnt; j++) {
      const a = rr(-1, 1) * (0.5 + cnt * 0.13), b = rr(-1, 1) * (0.5 + cnt * 0.13);
      const s = snap(x + t1[0] * a + t2[0] * b, y + t1[1] * a + t2[1] * b, z + t1[2] * a + t2[2] * b, n0);
      if (!s) continue;
      const u = upQ(s[3], s[4], s[5], coral ? 0.9 : 1.1), sc = coral ? rr(0.5, 1.5) : rr(0.35, 0.9) * (rnd() < 0.1 ? 1.6 : 1);
      solid(coral ? 7 + (rnd() * 2 | 0) : rnd() < 0.25 ? 9 : 4 + (rnd() * 3 | 0), s[0] - u[0] * 0.12 * sc, s[1] - u[1] * 0.12 * sc, s[2] - u[2] * 0.12 * sc, sc, qMul(qFromY(...u), qAxis(0, 1, 0, rnd() * TAU)), coral ? 5 : 4, fract(sd + rr(-0.03, 0.03)), 1, 0);
    }
    if (!coral && rnd() < 0.3) spots.push([x + n0[0], y + n0[1] + 0.5, z + n0[2]]);
  }
  // dense gardens: x, z, radius, count
  rseed(7);
  for (const g of [[-48, -52, 8, 240], [-60, -66, 7, 160], [14, 76, 7, 200], [-4, 78, 6, 120], [-12, -2, 6, 80], [8, -90, 8, 160], [54, 16, 7, 140], [-90, -86, 8, 200], [-46, 46, 6, 140], [-30, 50, 6, 120],
    [-12, 50, 5, 100], [14, 28, 6, 140], [30, 46, 6, 120], [-82, 8, 6, 130], [-94, -22, 6, 130], [70, -22, 6, 120], [30, -64, 6, 120]]) {
    let made = 0;
    for (let i = 0; i < 400000 && made < g[3]; i++) {
      const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2];
      if (hypot(x - g[0], z - g[1]) > g[2] || y > -14 || T.wn[k + 1] < -0.1 || nearFly(x, y, z, 2.2)) continue;
      made++;
      const coral = T.wn[k + 1] > 0.85 || rnd() < 0.3, u = upQ(T.wn[k], T.wn[k + 1], T.wn[k + 2], coral ? 0.9 : 1.1);
      const sc = coral ? rr(0.5, 1.4) : rr(0.35, 0.9) * (rnd() < 0.15 ? 1.7 : 1);
      solid(coral ? 7 + (rnd() * 2 | 0) : rnd() < 0.25 ? 9 : 4 + (rnd() * 3 | 0), x - u[0] * 0.1 * sc, y - u[1] * 0.1 * sc, z - u[2] * 0.1 * sc, sc, qMul(qFromY(...u), qAxis(0, 1, 0, rnd() * TAU)), coral ? 5 : 4, rnd(), 1, 0);
    }
  }
  rseed(17);
  for (let i = 0; i < 26000; i++) { // starfish flat on the rock, urchins wherever there is a ledge
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], ny = T.wn[k + 1];
    if (!inR(x, z) || y > -5 || ny < 0.55 || rnd() > 0.2 + 0.5 * zw(x, z) || nearFly(x, y, z, 1.6)) continue;
    const star = rnd() < 0.55, q = qMul(qFromY(T.wn[k], ny, T.wn[k + 2]), qAxis(0, 1, 0, rnd() * TAU));
    solid(star ? 32 : 33, x, y + (star ? 0.02 : -0.05), z, star ? rr(0.18, 0.4) : rr(0.25, 0.6), q, 12, rnd(), 2.5, 0);
  }

  // --- rocks: boulders hanging in the water, rocks on the floor, chunks studding every face, pebbles
  const BOULD = [[-58, -19, -20, 18, 6], [-20, -14, 8, 14, 6], [-96, -26, -20, 14, 5], [20, -13, 112, 18, 6], [-70, -16, -84, 16, 6], [88, -16, -60, 16, 6]];
  rseed(8);
  for (let i = 0; i < 7; i++) { const a = rnd() * TAU, r = rr(96, 146); BOULD.push([cos(a) * r, rr(-24, -12), sin(a) * r, 10 + rnd() * 12 | 0, rr(5, 9)]); }
  for (const b of BOULD) for (let i = 0; i < b[3]; i++) {
    const sc = rnd() < 0.12 ? rr(1.8, 3.2) : rr(0.35, 1.5);
    const x = b[0] + rr(-1, 1) * b[4], y = b[1] + rr(-1, 1) * b[4] * 0.6, z = b[2] + rr(-1, 1) * b[4];
    if (Dw(x, y, z) > -sc) continue;
    const bob = rr(0.12, 0.4), sd = rnd();
    solid(rnd() * 4 | 0, x, min(y, -2 - sc), z, sc, qRand(), 1, sd, 1, bob);
    if (sc > 1.1) for (let j = 0; j < 7; j++) solid(rnd() * 4 | 0, x + rr(-1.6, 1.6) * sc, min(y, -2 - sc) + rr(-1.4, 1) * sc, z + rr(-1.6, 1.6) * sc, rr(0.1, 0.35), qRand(), 1, sd, 1, bob);
  }
  rseed(9);
  for (let i = 0; i < 2800; i++) {
    const k = pickV(); if (T.wn[k + 1] < 0.7 || !inR(T.wp[k], T.wp[k + 2]) || nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], 6)) continue;
    const sc = rr(0.25, 1.3) * (rnd() < 0.1 ? 2 : 1);
    solid(rnd() * 4 | 0, T.wp[k], T.wp[k + 1] + sc * 0.2, T.wp[k + 2], sc, qRand(), 1, rnd(), 1, 0);
  }
  rseed(10);
  for (let i = 0; i < 66000; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], ny = T.wn[k + 1];
    if (!inR(x, z, 176) || (ny > 0.8 && rnd() < 0.6) || nearFly(x, y, z, 3.5)) continue;
    const sc = (0.35 + 2.1 * pow(rnd(), 2.6)) * (ny > 0.8 ? 0.5 : 1), q = qRand();
    chunks[(sc > 1.15 ? 3 : 0) + (rnd() * 3 | 0)][cellOf(x, z)].push(x - T.wn[k] * sc * 0.3, y - ny * sc * 0.3, z - T.wn[k + 2] * sc * 0.3, sc, q[0], q[1], q[2], q[3], 1, rnd(), sc > 1.15 ? 0 : 96, 0);
  }
  rseed(11);
  for (let i = 0; i < 170000; i++) {
    const k = pickV(), x = T.wp[k] + rr(-0.4, 0.4), z = T.wp[k + 2] + rr(-0.4, 0.4), y = T.wp[k + 1];
    if (T.wn[k + 1] < 0.8 || !inR(x, z) || nearFly(x, y, z, 1.3)) continue;
    const sc = 0.05 + 0.3 * pow(rnd(), 2), q = qRand();
    nth++ % THIN || chunks[6][cellOf(x, z)].push(x, y - sc * 0.25, z, sc, q[0], q[1], q[2], q[3], 1, rnd(), 44, 0);
  }

  // --- set pieces under water
  const yq = (a) => qAxis(0, 1, 0, a);
  solid(10, FLUKE[0], gy(FLUKE[0], FLUKE[1]) - 0.6, FLUKE[1], 1, qMul(yq(1.15), qMul(qAxis(0, 0, 1, 0.14), qAxis(1, 0, 0, -0.28))), 2, 0.3, 1, 0);
  solid(11, WRECK[0], WRECK[1], WRECK[2], 1, qMul(yq(0.06), qMul(qAxis(0, 0, 1, -0.1), qAxis(1, 0, 0, 0.3))), 3, 0.5, 1, 0);
  rseed(12);
  for (let i = 0; i < 9; i++) { const a = rnd() * TAU, x = FLUKE[0] + cos(a) * rr(1.4, 3), z = FLUKE[1] + sin(a) * rr(1.6, 4.2); solid(6, x, gy(x, z) + 0.05, z, rr(0.4, 0.9), yq(rnd() * 6), 4, rnd(), 1, 0); }
  // the drowned colonnade: two rows of columns, some standing, some reduced to drums, a gate, steps, amphorae
  {
    const [cx, cz] = RUINS, ax = cos(0.6), az = sin(0.6), put = (f, r) => [cx + ax * f - az * r, cz + az * f + ax * r];
    for (let i = 0; i < 6; i++) for (const r of [-4.2, 4.2]) {
      const [x, z] = put((i - 2.5) * 5.4, r), y = gy(x, z) - 0.25, st = rnd();
      if (st < 0.5) { solid(28, x, y, z, 1.2, qMul(qAxis(rr(-1, 1), 0, rr(-1, 1), rr(0, 0.05)), yq(rnd() * 6)), 7, rnd(), 0.7, 0); if (i < 5 && rnd() < 0.6) { const [x2, z2] = put((i - 2) * 5.4, r); solid(30, x2, y + 8.75, z2, 1.05, yq(-0.6), 7, rnd(), 0.5, 0); } }
      else { const n = 1 + (rnd() * 3 | 0); for (let j = 0; j < n; j++) solid(29, x + rr(-0.05, 0.05), y + j * 1.38, z + rr(-0.05, 0.05), 1.2, yq(rnd() * 6), 7, rnd(), 0.7, 0);
        for (let j = 0; j < 2; j++) { const a = rnd() * TAU, d = rr(1.6, 4), fx = x + cos(a) * d, fz = z + sin(a) * d; solid(29, fx, gy(fx, fz) + 0.5, fz, 1.2, qMul(yq(rnd() * 6), qAxis(1, 0, 0, PI / 2 + rr(-0.2, 0.2))), 7, rnd(), 0.7, 0); } }
    }
    for (let s = 0; s < 3; s++) for (const r of [-2.6, 2.6]) { const [x, z] = put(-18.5 - s * 1.0, r); solid(30, x, gy(x, z) + 0.25 + (2 - s) * 0.5, z, 1, yq(-0.6 + PI / 2), 7, rnd(), 0.5, 0); }
    for (let i = 0; i < 4; i++) { const [x, z] = put(rr(-14, 14), rr(-9, 9)); solid(30, x, gy(x, z) + 0.2, z, rr(0.6, 1), qMul(yq(rnd() * 6), qAxis(0, 0, 1, rr(-0.3, 0.3))), 7, rnd(), 0.5, 0); }
    for (let i = 0; i < 14; i++) { const [x, z] = put(rr(-15, 15), rr(-8, 8)), lie = rnd() < 0.6; solid(31, x, gy(x, z) + (lie ? 0.28 : -0.05), z, rr(0.8, 1.3), lie ? qMul(yq(rnd() * 6), qAxis(1, 0, 0, PI / 2 + rr(-0.15, 0.15))) : qAxis(rr(-1, 1), 0, rr(-1, 1), rr(0, 0.25)), 7, rnd(), 2, 0); }
  }
  for (let i = 0; i < 12; i++) { const x = WRECK[0] + rr(-16, 16), z = WRECK[2] + rr(-5, 5), f = gy(x, z); if (f < -38) solid(31, x, f + 0.28, z, rr(0.8, 1.2), qMul(yq(rnd() * 6), qAxis(1, 0, 0, PI / 2 + rr(-0.2, 0.2))), 7, rnd(), 2, 0); }
  // crystals: on the floor, walls and roof of the grotto chamber
  rseed(15);
  { const c = CAVES[0]; let made = 0;
    for (let i = 0; i < 900000 && made < 190; i++) {
      const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2];
      if (hypot((x - c[0]) / (c[3] + 3), (y - c[1]) / (c[4] + 3), (z - c[2]) / (c[5] + 3)) > 1 || nearFly(x, y, z, 2.5) || rnd() > 0.5) continue;
      made++;
      const u = upQ(T.wn[k], T.wn[k + 1], T.wn[k + 2], 0.25), sc = rr(0.5, 1.5) * (rnd() < 0.12 ? 2.2 : 1);
      solid(26 + (rnd() * 2 | 0), x - u[0] * 0.3 * sc, y - u[1] * 0.3 * sc, z - u[2] * 0.3 * sc, sc, qMul(qFromY(...u), yq(rnd() * 6)), 6, rnd(), 1, 0);
      if (rnd() < 0.5) glint(x + u[0] * sc, y + u[1] * sc, z + u[2] * sc, 0, rnd(), 0.82 + rnd() * 0.18, rr(0.02, 0.05), 0);
    }
    for (const p of [[13, 67, 1.2], [-1, 62, 1.0], [13, 55, 0.8]]) { const y = gy(p[0], p[1]); solid(26, p[0], y, p[1], p[2], yq(rnd() * 6), 6, rnd(), 1, 0); }   // a trail of them leading in
  }

  // --- afloat and ashore
  const [kx, kz, ka] = KETCH, bow = [kx + cos(ka) * 7.2, 0.75, kz - sin(ka) * 7.2];
  const anc = [bow[0] + cos(ka) * 13, 0, bow[2] - sin(ka) * 13]; anc[1] = gy(anc[0], anc[2]);
  for (const id of [34, 35]) solid(id, kx, 0, kz, 1, yq(ka), 8, 0.3, 1, 0.1);
  solid(36, kx, 0, kz, 1, yq(ka), 9, 0.3, 1, 0.1);
  solid(40, anc[0], anc[1] + 0.3, anc[2], 1.3, qMul(yq(ka + 0.4), qAxis(1, 0, 0, PI / 2 - 0.25)), 11, 0.6, 1.5, 0);
  const cable = (a, b, sag) => { const pts = []; for (let i = 0; i <= 56; i++) { const t = i / 56; pts.push([mix(a[0], b[0], t), mix(a[1], b[1], 1 - pow(1 - t, sag)), mix(a[2], b[2], t)]); } return pts; };
  const chains = [meshChain(cable(bow, [anc[0], anc[1] + 0.45, anc[2]], 2.6))];
  solid(41, 0, 0, 0, 1, [0, 0, 0, 1], 11, 0.2, 3, 0);
  solid(37, DINGHY[0], 0, DINGHY[1], 1, yq(2.2), 8, 0.8, 1, 0.08);
  for (const [x, z, a, sd] of [[-150, 262, 0.4, 0.75], [292, 44, 2.6, 0.2], [455, 128, 1.2, 0.6]]) { for (const id of [34, 35]) solid(id, x, 0, z, 1, yq(a), 8, sd, 1, 0.1); solid(36, x, 0, z, 1, yq(a), 9, sd, 1, 0.1); }   // sails out at sea
  solid(38, BUOY[0], 0.08, BUOY[1], 0.7, yq(0), 13, 0.5, 1, 0.14);
  const sink = [BUOY[0] + 3, gy(BUOY[0] + 3, BUOY[1] - 2) + 0.3, BUOY[1] - 2];
  chains.push(meshChain(cable([BUOY[0], -0.8, BUOY[1]], sink, 1.4)));
  solid(42, 0, 0, 0, 1, [0, 0, 0, 1], 11, 0.4, 3, 0);
  solid(1, sink[0], sink[1] - 0.2, sink[2], 0.9, qRand(), 1, 0.3, 1, 0);
  const lampY = gTop(LAMP[0], LAMP[1]) - 0.25;
  solid(39, LAMP[0], lampY, LAMP[1], 1, yq(2.25), 10, 0.5, 0.35, 0);   // door toward the lagoon

  // --- bubble vents: a few by hand near the viewpoints, the rest scattered on the floor and under sponges
  rseed(13);
  for (const v of [[4, -3], [4.6, -3.6], [-1, 2], [2, -1], [5.5, -8], [3, -10], [6, -90], [8, -84], [4, -94], [-9, 4], [56, 18], [62, 2], [-48, -50], [-90, -84], [10, 80], [-2, 30], [0, -30], [12, 2],
    [-88, 10], [-96, -20], [4, 70], [9, -74], [14, 26], [26, 42], [-45, -64], [-40, 44], [-14, 46], [-1, -9], [-7, -6], [70, -28], [30, -60], [-100, 60], [96, 60]]) vents.push([v[0], gy(v[0], v[1]), v[1]]);
  for (const s of spots) if (rnd() < 0.28) vents.push(s);
  for (const v of vents) {
    const n = 90 + rnd() * 70 | 0;
    for (let i = 0; i < n; i++) {
      const sz = rnd() < 0.24 ? rr(0.1, 0.3) : rr(0.025, 0.08);
      bubbles.push(v[0] + rr(-0.3, 0.3), v[1], v[2] + rr(-0.3, 0.3), sz, rnd(), rr(1.1, 2.4) * (0.6 + sz * 3), -v[1] - 0.2, rr(0.05, 0.16));
    }
  }

  // --- pack leaves (36 bytes: 8 floats + 4 unorm8), sorted by culling cell
  const pack = (L, step = 1, wm = 1) => {
    let n = 0; const start = new Uint32Array(nCells + 1);
    for (let c = 0; c < nCells; c++) { start[c] = n; n += Math.ceil(L[c].length / 12 / step); }
    start[nCells] = n;
    const buf = new ArrayBuffer(n * 36), f = new Float32Array(buf), u8 = new Uint8Array(buf), lo = new Float32Array(nCells).fill(1e9), hi = new Float32Array(nCells).fill(-1e9);
    let k = 0;
    for (let c = 0; c < nCells; c++) { const a = L[c]; for (let i = 0; i < a.length; i += 12 * step, k++) {
      for (let j = 0; j < 8; j++) f[k * 9 + j] = a[i + j];
      f[k * 9 + 6] *= wm;
      u8[k * 36 + 32] = a[i + 8]; u8[k * 36 + 33] = a[i + 9] * 255; u8[k * 36 + 34] = a[i + 10] * 255; u8[k * 36 + 35] = a[i + 11] * 255;
      const y = a[i + 1], l = a[i + 3]; if (y - l < lo[c]) lo[c] = y - l; if (y + l > hi[c]) hi[c] = y + l;
    } }
    return { buf, n, start, lo, hi };
  };

  // --- half-resolution volume: r = openness, g = skylight (propagated downward, blurred, absorbed by rock and kelp)
  const hx = NX / 2, hy = NY / 2, hz = NZ / 2, volD = new Uint8Array(hx * hy * hz * 2);
  let Lp = new Float32Array(hx * hz).fill(1), Ln = new Float32Array(hx * hz); const tmp = new Float32Array(hx * hz);
  for (let y = hy - 1; y >= 0; y--) {
    for (let z = 0; z < hz; z++) for (let x = 0; x < hx; x++) { const i = x + hx * z; tmp[i] = (Lp[x > 0 ? i - 1 : i] + 2 * Lp[i] + Lp[x < hx - 1 ? i + 1 : i]) * 0.25; }
    for (let z = 0; z < hz; z++) for (let x = 0; x < hx; x++) {
      const i = x + hx * z, b = (tmp[z > 0 ? i - hx : i] + 2 * tmp[i] + tmp[z < hz - 1 ? i + hx : i]) * 0.25;
      const g0 = gi(x * 2, y * 2, z * 2);
      const d = (D[g0] + D[g0 + 1] + D[g0 + NX] + D[g0 + NX + 1] + D[g0 + NX * NY] + D[g0 + NX * NY + 1] + D[g0 + NX * NY + NX] + D[g0 + NX * NY + NX + 1]) * 0.125;
      const o = x + hx * (y + hy * z);
      Ln[i] = b * clamp(0.5 - d / 1.5, 0, 1) * (1 - min(kelpAbs[o], 0.5));
      volD[o * 2] = clamp(0.5 - d / 12, 0, 1) * 255; volD[o * 2 + 1] = min(1, b) * 255;
    }
    const t = Lp; Lp = Ln; Ln = t;
  }

  // --- ground map: r magenta cover, g how close rock is at the waterline (foam), b grotto zone, a sand
  const GM = 512, gm = new Uint8Array(GM * GM * 4), shore = new Float32Array(GM * GM), sh2 = new Float32Array(GM * GM);
  const wy = round((-0.2 - OY) / VS);
  for (let j = 0; j < GM; j++) for (let i = 0; i < GM; i++) {
    const x = (i + 0.5) / GM * WX + OX, z = (j + 0.5) / GM * WX + OZ, o = (i + GM * j) * 4;
    gm[o] = magAt(x, z) * 255; gm[o + 2] = zoneP(x, z) * 255; gm[o + 3] = sstep(0.42, 0.6, fbm(x * 0.04, 3, z * 0.04, 3)) * 255;
    const ix = clamp(round((x - OX) / VS), 1, NX - 2), iz = clamp(round((z - OZ) / VS), 1, NZ - 2);
    shore[i + GM * j] = D[gi(ix, wy, iz)] > 0 || D[gi(ix, wy + 1, iz)] > 0 ? 1 : 0;
  }
  const R = 6;
  for (let j = 0; j < GM; j++) { let s = 0; for (let i = -R; i < GM + R; i++) { if (i + R < GM) s += shore[i + R + GM * j]; if (i - R - 1 >= 0) s -= shore[i - R - 1 + GM * j]; if (i >= 0 && i < GM) sh2[i + GM * j] = s; } }
  for (let i = 0; i < GM; i++) { let s = 0; for (let j = -R; j < GM + R; j++) { if (j + R < GM) s += sh2[i + GM * (j + R)]; if (j - R - 1 >= 0) s -= sh2[i + GM * (j - R - 1)]; if (j >= 0 && j < GM) gm[(i + GM * j) * 4 + 1] = min(255, s / ((2 * R + 1) * (2 * R + 1)) * 2.4 * 255); } }

  // --- animals. Schools: x, y, z, orbit radius, count, size, direction, livery seed
  const fish = [];
  rseed(14);
  const SCH = [[-3, -36, -10, 15, 520, 0.3, 1, 0.945], [6, -30, -74, 22, 440, 0.32, -1, 0.1], [58, -30, 14, 18, 380, 0.3, 1, 0.38], [-52, -36, -56, 12, 360, 0.28, -1, 0.62], [8, -36, 90, 13, 300, 0.26, 1, 0.88],
    [-92, -30, -88, 14, 300, 0.28, 1, 0.38], [96, -28, 60, 24, 300, 0.3, -1, 0.1], [0, -20, 22, 30, 400, 0.34, -1, 0.1], [-30, -30, -104, 18, 300, 0.3, 1, 0.62], [18, -36, 30, 12, 300, 0.3, 1, 0.88],
    [-88, -44, 8, 9, 220, 0.24, -1, 0.88], [-44, -35, 44, 14, 320, 0.3, 1, 0.38], [10, -8, -4, 12, 260, 0.28, 1, 0.1], [84, -34, -30, 16, 280, 0.3, -1, 0.62]];
  for (const s of SCH) for (let i = 0; i < s[4]; i++) fish.push(s[0], s[1], s[2], s[3], rnd(), s[6] * 1.9 / s[3], s[5], s[7]);
  // gliders: x, y, z, orbit radius, phase, angular speed, size, seed
  const mantas = [[2, -27, 2, 15, 3.0, 0.085, 3.6, 0.1], [58, -30, 22, 7, 0.03, -0.08, 3.7, 0.4], [0, -14, -86, 34, 0.3, 0.06, 5.2, 0.7], [-50, -18, 20, 26, 5, -0.075, 3.8, 0.55], [10, -17, 70, 24, 2.2, 0.07, 4.4, 0.85], [20, -11, -20, 46, 4.2, -0.045, 5.6, 0.25], [-84, -24, -70, 22, 1.1, 0.07, 4.2, 0.6]].flat();
  const turtles = [[-10, -34, -6, 20, 1.4, 0.05, 1.5, 0.2], [20, -30, -84, 26, 4.0, -0.04, 1.3, 0.6], [56, -26, 26, 16, 2.2, 0.055, 1.6, 0.8], [-60, -36, -60, 18, 0.5, -0.05, 1.2, 0.4]].flat();
  const gulls = []; for (let i = 0; i < 26; i++) { const home = i < 8 ? LAMP : i < 12 ? [KETCH[0], KETCH[1]] : i < 20 ? BAY : bayPt(TOWER, 0); gulls.push(home[0] + rr(-8, 8), rr(14, 34), home[1] + rr(-8, 8), rr(14, 42), rnd() * TAU, (rnd() < 0.5 ? -1 : 1) * rr(0.16, 0.3), rr(0.55, 0.75), rnd()); }
  const whale = [0, -10, 0, 128, 2.4, 0.011, 15, 0.3];   // high in the water, clear of the plateaus, close under the swell
  const jelly = [];   // x, y, z, size, seed, drift, hue, -
  for (let i = 0; i < 150; i++) { const t = rnd() * 2, a = t < 1 ? [-72, 40, -98, 4] : [-98, 4, -92, -40], u = t % 1, x = mix(a[0], a[2], u) + rr(-7, 7), z = mix(a[1], a[3], u) + rr(-7, 7); jelly.push(x, rr(-55, -22), z, rr(0.5, 1.6), rnd(), rr(0.6, 1.4), rnd(), 0); }
  for (let i = 0; i < 50; i++) { const a = rnd() * TAU, r = rr(20, 130); jelly.push(cos(a) * r, rr(-30, -8), sin(a) * r, rr(0.6, 2.2), rnd(), rr(0.6, 1.4), rnd(), 0); }

  const snow = new Float32Array(9000 * 4);
  for (let i = 0; i < snow.length; i++) snow[i] = rnd();

  const sol = { data: [], ranges: [] }; let si = 0;
  for (let m = 0; m < 47; m++) { const a = solids[m] || []; sol.ranges.push([si, a.length / 12]); si += a.length / 12; for (let i = 0; i < a.length; i++) sol.data.push(a[i]); }
  const packC = (L) => {
    let n = 0; const start = new Uint32Array(nCells + 1);
    for (let c = 0; c < nCells; c++) { start[c] = n; n += L[c].length / 12; }
    start[nCells] = n;
    const data = new Float32Array(n * 12), lo = new Float32Array(nCells).fill(1e9), hi = new Float32Array(nCells).fill(-1e9);
    let k = 0;
    for (let c = 0; c < nCells; c++) { const a = L[c]; for (let i = 0; i < a.length; i += 12) { for (let j = 0; j < 12; j++) data[k++] = a[i + j]; lo[c] = min(lo[c], a[i + 1] - 3); hi[c] = max(hi[c], a[i + 1] + 3); } }
    return { data, n, start, lo, hi };
  };
  return { glints: new Float32Array(glints), chunks: chunks.map(packC), props: props.map(packC), big: pack(big), bigF: pack(big, 2, 1.5), small: pack(small),
    solids: { data: new Float32Array(sol.data), ranges: sol.ranges }, bubbles: new Float32Array(bubbles), vents, volD, gm, chains,
    fish: new Float32Array(fish), mantas: new Float32Array(mantas), turtles: new Float32Array(turtles), gulls: new Float32Array(gulls), whale: new Float32Array(whale), jelly: new Float32Array(jelly), snow };
}
