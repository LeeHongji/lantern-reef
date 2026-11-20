// ============================================================================
// Procedural meshes (load time only)
// ============================================================================
// Vertex aux (the w of the normal, -1..1) carries a per-vertex value the shaders use as ambient occlusion, a material
// tag or an animation weight, depending on the mesh.
//
// meshChunk, meshLathe, meshCoral, meshTubes, meshManta and meshFish are ported from Abyssal Garden
// (Copyright (c) 2026 Maksymilian Dendura, MIT License; full notice in 10-math.js). Everything after them is new.

// faceted rock: a noisy icosphere with a few flat cuts
function meshChunk(sd, sub = 2, det = sub > 2) {
  if (LV > 1 && sub > 1) sub--; // Low: a quarter of the triangles
  rseed(100 + sd);
  const pl = []; for (let i = 0; i < 4; i++) { const q = qRand(); pl.push([q[0], q[1], q[2], rr(0.8, 0.98)]); const l = hypot(q[0], q[1], q[2]) || 1; pl[i][0] /= l; pl[i][1] /= l; pl[i][2] /= l; }
  return icosphere(sub, (x, y, z) => {
    let r = 1 + (fbm(x * 1.6 + sd, y * 1.6, z * 1.6, 2) - 0.5) * 0.9 + (det ? (fbm(x * 4 + sd, y * 4, z * 4, 2) - 0.5) * 0.25 : 0);
    let px = x * r, py = y * r * 0.8, pz = z * r;
    for (const p of pl) { const d = px * p[0] + py * p[1] + pz * p[2] - p[3]; if (d > 0) { px -= p[0] * d; py -= p[1] * d; pz -= p[2] * d; } }
    return [px, py, pz];
  });
}
// surface of revolution: prof = [radius, height, aux] rings; lump adds noise, ribs adds flutes
function meshLathe(prof, seg, lump, ribs = 0) {
  const m = new Mesh(), rings = [];
  for (const [r, h, ao = 1] of prof) { const ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU, rl = r * (1 + lump * (fbm(cos(a) * 1.5 + h * 2, h * 3, sin(a) * 1.5, 2) - 0.5) + 0.07 * cos(ribs * a + h * 1.5)); ring.push(m.v(cos(a) * rl, h, sin(a) * rl, ao)); } rings.push(ring); }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) { const s2 = (s + 1) % seg; m.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]); }
  return m;
}
// branching coral (fan = flattened into a sea fan)
function meshCoral(fan, lo = LV > 1) {
  rseed(200 + fan);
  const m = new Mesh();
  const nrm = (v) => { const l = hypot(...v) || 1; return v.map((c) => c / l); };
  const br = (p, d, r, len, depth) => {
    const pts = [p]; let q = p;
    for (let i = 0; i < 3; i++) { d = nrm([d[0] + rr(-0.3, 0.3), d[1] + rr(-0.1, 0.3), d[2] + (fan ? rr(-0.05, 0.05) : rr(-0.3, 0.3))]); q = [q[0] + d[0] * len / 3, q[1] + d[1] * len / 3, q[2] + d[2] * len / 3]; pts.push(q); }
    if (!depth) pts.push([q[0] + d[0] * r * 1.6, q[1] + d[1] * r * 1.6, q[2] + d[2] * r * 1.6]);
    if (lo) m.tube(depth ? [pts[0], pts[3]] : [pts[0], pts[3], pts[4]], (k) => (k > 1 ? r * 0.36 : r * (1 - 0.22 * k)) * 1.25, 3, true, (k) => clamp(1 - (depth + 1 - k) / 5, 0, 1));
    else m.tube(pts, (k) => k > 3 ? r * 0.36 : r * (1 - 0.22 * k / 3), fan ? 5 : 6, true, (k) => clamp(1 - (depth + 1 - k / 3) / 5, 0, 1));
    if (depth > 0) { const n = 2 + (rnd() < 0.5); for (let i = 0; i < n; i++) br(q, nrm([d[0] + rr(-0.8, 0.8), d[1] + rr(-0.1, 0.5), d[2] + (fan ? rr(-0.08, 0.08) : rr(-0.8, 0.8))]), r * 0.78, len * 0.8, depth - 1); }
  };
  const n0 = fan ? 1 : 2 + (rnd() * 2 | 0);
  for (let i = 0; i < n0; i++) br([rr(-0.08, 0.08), 0, rr(-0.08, 0.08)], nrm([rr(-0.5, 0.5), 1, fan ? 0 : rr(-0.5, 0.5)]), fan ? 0.06 : 0.08, fan ? 0.5 : 0.45, 3);
  return m;
}
// a cluster of tube sponges with dark throats
function meshTubes() {
  rseed(210);
  const m = new Mesh();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r0 = rr(0, 0.28), h = rr(0.45, 1.1), rad = rr(0.07, 0.12), lean = rr(0.05, 0.3), pts = [];
    for (let k = 0; k <= 4; k++) pts.push([cos(a) * (r0 + lean * k / 4 * h), h * k / 4, sin(a) * (r0 + lean * k / 4 * h)]);
    m.tube(pts, (k) => rad * (0.8 + 0.25 * k / 4), 12, false, (k) => 0.35 + 0.65 * k / 4);
    // rim + dark throat
    const e = pts[4], n = m.p.length / 3, c = m.v(e[0], e[1] - rad * 1.2, e[2], 0.05);
    for (let s2 = 0; s2 < 12; s2++) m.tri(n - 12 + s2, n - 12 + (s2 + 1) % 12, c);
  }
  return m;
}
// manta ray: span along x (half span = 1), nose +z; aux = span coordinate for the wing beat
function meshManta() {
  const m = new Mesh(), NU = 72, M = 22, rings = [];
  for (let j = 0; j <= NU; j++) {
    const u = j / NU * 2 - 1, au = abs(u);
    let zl = 0.52 - 0.74 * pow(au, 1.35) + 0.07 * exp(-pow((au - 0.13) / 0.05, 2)) - 0.05 * exp(-pow(au / 0.05, 2)) - 0.08 * pow(au, 5);
    const zt = -0.5 + 0.3 * pow(au, 0.8) + 0.02 - 0.08 * pow(au, 5);
    if (zl < zt + 0.004) zl = zt + 0.004;
    const th = 0.08 * pow(1 - au, 1.15) + 0.004 + 0.12 * exp(-pow(u / 0.2, 2)), ring = [];
    for (let k = 0; k < M; k++) { const a = k / M * TAU; ring.push(m.v(u, th * sin(a) * (0.62 + 0.38 * cos(a)), mix(zt, zl, 0.5 + 0.5 * cos(a)), u)); }
    rings.push(ring);
  }
  for (let j = 0; j < NU; j++) for (let k = 0; k < M; k++) { const k2 = (k + 1) % M; m.quad(rings[j][k], rings[j + 1][k], rings[j + 1][k2], rings[j][k2]); }
  const tail = []; for (let i = 0; i <= 8; i++) tail.push([0, 0, -0.42 - i * 0.19]);
  const n0 = m.p.length / 3;
  m.tube(tail, (k) => 0.016 * (1 - k / 9), 4, true);
  for (let k = n0; k < m.aux.length; k++) m.aux[k] = 0;
  for (const sx of [-1, 1]) { // cephalic fins
    const n1 = m.p.length / 3;
    m.tube([[sx * 0.12, -0.02, 0.48], [sx * 0.135, -0.05, 0.6], [sx * 0.115, -0.09, 0.69], [sx * 0.085, -0.125, 0.74]], (k) => 0.045 * (1 - k / 4.4), 6, true);
    for (let k = n1; k < m.aux.length; k++) m.aux[k] = sx * 0.1;
  }
  return m;
}
function meshFish() {
  const m = new Mesh();
  const X = [0.5, 0.3, 0.05, -0.22, -0.34], H = [0.01, 0.13, 0.17, 0.09, 0.035], Wd = [0.01, 0.05, 0.065, 0.03, 0.012], rings = [];
  for (let i = 0; i < 5; i++) { const r = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; r.push(m.v(X[i], sin(a) * H[i], cos(a) * Wd[i])); } rings.push(r); }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
  const a = m.v(-0.33, 0, 0), b = m.v(-0.56, 0.2, 0), c = m.v(-0.47, 0, 0), d = m.v(-0.56, -0.2, 0);
  m.tri(a, b, c); m.tri(a, c, d);
  return m;
}

// ---------------------------------------------------------------- shapes meshed from a signed distance function
// Chains of tapered capsules, smooth-unioned and run through surface nets: good for organic stone.
// C = [ax, ay, az, ar, bx, by, bz, br, zSquash]; box = [ox, oy, oz, nx, ny, nz], voxel size vs.
function meshCapsules(C, box, vs, k = 0.45) {
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const c of C) {
      const zs = c[8], pz = z / zs, az = c[2] / zs, bz = c[6] / zs;
      const bax = c[4] - c[0], bay = c[5] - c[1], baz = bz - az, pax = x - c[0], pay = y - c[1], paz = pz - az;
      const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
      const e = (hypot(pax - bax * h, pay - bay * h, paz - baz * h) - mix(c[3], c[7], h)) * zs;
      const hh = max(k - abs(d - e), 0) / k;
      d = min(d, e) - hh * hh * k * 0.25;
    }
    return d;
  };
  const [ox, oy, oz, nx, ny, nz] = box, D = new Float32Array(nx * ny * nz);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) D[x + nx * (y + ny * z)] = -sdf(ox + x * vs, oy + y * vs, oz + z * vs);
  const sn = surfaceNets(D, nx, ny, nz), smp = sampler3(D, nx, ny, nz);
  const vb = new ArrayBuffer(sn.nv * 16), f = new Float32Array(vb), s = new Int8Array(vb);
  for (let i = 0; i < sn.nv; i++) {
    const x = sn.pos[i * 3], y = sn.pos[i * 3 + 1], z = sn.pos[i * 3 + 2], e = 0.7;
    const ax = smp(x - e, y, z) - smp(x + e, y, z), ay = smp(x, y - e, z) - smp(x, y + e, z), az = smp(x, y, z - e) - smp(x, y, z + e), l = hypot(ax, ay, az) || 1;
    f[i * 4] = ox + x * vs; f[i * 4 + 1] = oy + y * vs; f[i * 4 + 2] = oz + z * vs;
    s[i * 16 + 12] = round(ax / l * 127); s[i * 16 + 13] = round(ay / l * 127); s[i * 16 + 14] = round(az / l * 127); s[i * 16 + 15] = 127;
  }
  return { vb, ib: new Uint32Array(sn.idx), nv: sn.nv };
}
const chain = (C, pts, zs) => { for (let i = 0; i < pts.length - 1; i++) C.push([...pts[i], ...pts[i + 1], zs]); };
// The monolith: a humpback's tail stock rising from the seabed into two swept flukes with a notch between them.
function meshFluke() {
  const C = [];
  chain(C, [[0, -1.8, 4.0, 1.3], [0, 1.6, 2.6, 1.05], [0, 4.6, 1.2, 0.8], [0, 7.2, 0.15, 0.62]], 0.8);
  chain(C, [[0, 6.9, 0.15, 0.74], [2.0, 8.1, 0.05, 1.0], [4.1, 8.9, -0.1, 0.94], [6.0, 9.9, -0.25, 0.68], [7.4, 11.3, -0.4, 0.4], [8.2, 12.9, -0.55, 0.22], [8.5, 14.3, -0.68, 0.1]], 0.18);
  chain(C, [[0, 6.9, 0.15, 0.74], [-1.8, 8.5, 0.1, 0.98], [-3.5, 9.9, 0, 0.9], [-5.0, 11.4, -0.18, 0.66], [-6.0, 13.1, -0.38, 0.4], [-6.5, 14.8, -0.5, 0.22], [-6.5, 16.2, -0.6, 0.1]], 0.18);
  return meshCapsules(C, [-8.0, -2.8, -2.3, 196, 226, 80], 0.09);
}

// ---------------------------------------------------------------- hulls
// One section model for every boat: half-beam hb(x), depth dp(x), sheer(x); pt(x, ph) walks a section from the keel
// (ph = 0) up to either gunwale (ph = +-PI/2). Bow at +x.
function hullShape(Lh, B, Dp, free, bow, stern, sp = 3.6, bp = 2.6) {
  const hb = (x) => B * pow(max(1 - pow(abs(x / Lh), x < 0 ? sp : bp), 0), 0.5);
  const dp = (x) => Dp * (1 - 0.36 * pow(abs(x / Lh), 2.5));
  const sheer = (x) => free + (x > 0 ? bow : stern) * pow(abs(x / Lh), 2.2);
  const pt = (x, ph, off = 0) => { const b = hb(x) + off, d = dp(x) + off, s = sheer(x); return [x, s - (d + s) * pow(max(cos(ph), 0), 0.66), b * Math.sign(ph) * pow(abs(sin(ph)), 0.8)]; };
  return { Lh, hb, dp, sheer, pt };
}
// The wreck: a galleon with its ribs showing. Keel with stem and stern posts, frames, planking torn open in places,
// a stern castle with transom, deck beams and a few surviving planks, one mast still crossed by its yards, one snapped.
function meshWreck() {
  rseed(220);
  const m = new Mesh(), Lh = 18, B = 5.8, Dp = 7.8, H = hullShape(Lh, B, Dp, 0.5, 3.2, 4.2), { hb, dp, sheer, pt } = H;
  const out = (p) => { const l = hypot(p[1] + 0.5, p[2] * 1.3) || 1; return [0, (p[1] + 0.5) / l, p[2] * 1.3 / l]; };
  const up = () => [0, 1, 0];
  const keel = [];
  for (let i = 0; i <= 44; i++) { const x = mix(-Lh - 1.0, Lh + 2.4, i / 44), e = max(abs(x) / Lh - 0.78, 0) * 4.2; keel.push([x, -dp(clamp(x, -Lh, Lh)) - 0.3 + e * e * e * 4.2, 0]); }
  m.sweep(keel, 0.55, 0.95, up);
  for (let x = -Lh + 0.7; x < Lh - 0.3; x += 0.8) {                          // frames; one in ten is broken short
    const a0 = rnd() < 0.12 ? rr(-0.9, -0.2) : -PI / 2, a1 = rnd() < 0.12 ? rr(0.2, 0.9) : PI / 2, pts = [];
    for (let i = 0; i <= 16; i++) pts.push(pt(x, mix(a0, a1, i / 16)));
    m.sweep(pts, 0.24, 0.3, out);
  }
  const hs2 = rnd() < 0.5 ? 1 : -1;
  const BR = [[rr(-6, 2), hs2 * 0.8, 3.4, 0.44], [7.5, -hs2 * 0.95, 2.6, 0.34], [13, hs2 * 0.5, 1.8, 0.28], [-12, -hs2 * 0.55, 2.2, 0.3], [2, -hs2 * 0.2, 1.6, 0.2]];
  const holed = (x, ph) => { for (const h of BR) { const a = (x - h[0]) / h[2], b = (ph - h[1]) / h[3]; if (a * a + b * b < 1 + 0.45 * sin(x * 3.1 + ph * 9)) return true; } return false; };
  const NS = 14, xs = []; for (let x = -Lh + 0.35; x <= Lh - 0.3; x += 0.85) xs.push(x);
  for (let j = 0; j < NS; j++) {                                              // strakes, each a thin lapped board
    const p0 = mix(-1.5, 1.5, j / NS), p1 = mix(-1.5, 1.5, (j + 1) / NS), sg = p0 + p1 < 0 ? -1 : 1, lo = sg < 0 ? p1 : p0, hi = sg < 0 ? p0 : p1;
    let pv = null;
    for (const x of xs) {
      const cu = [m.v(...pt(x, lo, 0.27)), m.v(...pt(x, hi, 0.14)), m.v(...pt(x, lo, 0.1)), m.v(...pt(x, hi, 0.1))];
      if (pv && !holed(x - 0.42, (p0 + p1) / 2)) {
        if (sg > 0) { m.quad(pv[0], pv[1], cu[1], cu[0]); m.quad(pv[2], cu[2], cu[3], pv[3]); }
        else { m.quad(pv[0], cu[0], cu[1], pv[1]); m.quad(pv[2], pv[3], cu[3], cu[2]); }
      }
      pv = cu;
    }
  }
  for (const sgn of [-1, 1]) {
    let pts = []; for (let x = -Lh + 0.6; x <= Lh - 0.6; x += 1) pts.push(pt(x, sgn * PI / 2, 0.2)); m.sweep(pts, 0.3, 0.28, up);          // gunwale
    for (let j = 0; j < 4; j++) { pts = []; for (let x = -Lh + 0.4; x <= -Lh + 9.5 - j * 1.2; x += 0.9) pts.push([x, sheer(x) + 0.55 + j * 0.86, sgn * (max(hb(x), 2.7) + 0.15)]); m.sweep(pts, 0.82, 0.09, () => [0, 0, sgn]); }   // stern castle
    for (let j = 0; j < 2; j++) { pts = []; for (let x = Lh - 6 + j; x <= Lh - 0.8; x += 0.9) pts.push([x, sheer(x) + 0.5 + j * 0.8, sgn * (hb(x) + 0.12)]); if (pts.length > 1) m.sweep(pts, 0.76, 0.09, () => [0, 0, sgn]); }   // forecastle
  }
  for (let y = -3; y < sheer(-Lh) + 3.8; y += 0.86) { const w = max(1.2, 3.0 * sstep(-4.5, 1.5, y)); if (rnd() < 0.88) m.sweep([[-Lh + 0.35, y, -w], [-Lh + 0.35, y, w]], 0.82, 0.1, () => [1, 0, 0]); }      // transom
  for (let x = -Lh + 2; x < Lh - 2; x += rr(1.8, 3.2)) m.sweep([[x, sheer(x) - 0.25, -hb(x)], [x, sheer(x) - 0.2, 0], [x, sheer(x) - 0.25, hb(x)]], 0.26, 0.26, up);                                     // deck beams
  for (let z = -4.0; z <= 4.0; z += 0.62) { let x = -Lh + rr(1, 5); while (x < Lh - 4) { const x1 = min(x + rr(3, 9), Lh - 3.5); if (rnd() < 0.6) { const pts = []; for (let xx = x; xx <= x1; xx += 1) if (hb(xx) > abs(z) + 0.3) pts.push([xx, sheer(xx) - 0.05, z]); if (pts.length > 1) m.sweep(pts, 0.56, 0.07, up); } x = x1 + rr(0.5, 3); } }
  const round4 = () => [1, 0, 0];
  m.sweep([[7, -Dp + 0.6, 0], [7.1, 1, 0], [7.4, 9, 0.3], [7.9, 17, 0.9]], (k) => 0.66 - k * 0.1, (k) => 0.66 - k * 0.1, round4);          // foremast
  m.sweep([[7.5, 10, -5.6], [7.5, 10.1, 0.3], [7.5, 9.6, 6]], 0.26, 0.26, up); m.sweep([[7.8, 14.4, -3.4], [7.8, 14.5, 3.8]], 0.2, 0.2, up);  // its yards
  m.sweep([[7.2, 11.6, -1], [7.2, 11.6, 1.2], [8.6, 11.6, 1.2], [8.6, 11.6, -1], [7.2, 11.6, -1]], 0.16, 0.5, up, false);                  // fighting top
  m.sweep([[-3, -Dp + 0.6, 0], [-3.2, 1, 0.2], [-3.9, 6, 1.0], [-5.4, 10, 2.8]], (k) => 0.78 - k * 0.1, (k) => 0.78 - k * 0.1, round4);    // main mast, snapped
  m.sweep([[-9, sheer(-9) + 0.3, 3.4], [-2, sheer(-2) + 1.6, 6.5], [4, sheer(4) + 0.4, 5.2]], 0.3, 0.3, up);                                  // its top, fallen across the rail
  m.sweep([[-12.5, -Dp + 2, 0], [-12.6, 6, 0], [-12.9, 11, -0.3]], (k) => 0.5 - k * 0.1, (k) => 0.5 - k * 0.1, round4);                    // mizzen stump
  m.sweep([[Lh + 1.4, 2.8, 0], [Lh + 9, 5.6, 0.2]], 0.34, 0.34, up);                                                                       // bowsprit
  return m;
}
// A small boat that still floats. y = 0 is the waterline. wood: spars and trim are tagged aux 0, paint is aux 1.
function meshBoat(Lh, B, draft, free, o = {}) {
  const m = new Mesh(), H = hullShape(Lh, B, draft, free, o.bow ?? 0.5, o.stern ?? 0.25, 2.6, 1.35), { hb, sheer, pt } = H;
  const NS = 12, NX2 = 30, rows = [];
  for (let i = 0; i <= NX2; i++) { const x = mix(-Lh * 0.985, Lh * 0.985, i / NX2), r = []; for (let j = 0; j <= NS; j++) r.push(m.v(...pt(x, mix(-PI / 2, PI / 2, j / NS)), 1)); rows.push(r); }
  for (let i = 0; i < NX2; i++) for (let j = 0; j < NS; j++) m.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  const up = () => [0, 1, 0];
  if (o.open) { // open boat: thwarts and a pair of shipped oars
    for (const x of [-Lh * 0.45, 0.05 * Lh, Lh * 0.5]) m.sweep([[x, sheer(x) - 0.12, -hb(x) * 0.95], [x, sheer(x) - 0.12, hb(x) * 0.95]], 0.22, 0.04, up);
    for (const s of [-1, 1]) { m.sweep([[-Lh * 0.7, sheer(0) - 0.05, s * hb(0) * 0.5], [Lh * 0.75, sheer(0) + 0.02, s * hb(0) * 0.62]], 0.045, 0.045, up); }
    for (let k = m.aux.length - 1; k >= rows.length * (NS + 1); k--) m.aux[k] = 0;
  } else {
    const dk = [], n0 = m.aux.length;
    for (let i = 0; i <= NX2; i++) { const x = mix(-Lh * 0.985, Lh * 0.985, i / NX2); dk.push([m.v(x, sheer(x) - 0.04, -hb(x), 1), m.v(x, sheer(x) + 0.03, 0, 1), m.v(x, sheer(x) - 0.04, hb(x), 1)]); }
    for (let i = 0; i < NX2; i++) { m.quad(dk[i][0], dk[i][1], dk[i + 1][1], dk[i + 1][0]); m.quad(dk[i][1], dk[i][2], dk[i + 1][2], dk[i + 1][1]); }
    const n1 = m.aux.length;
    m.sweep([[-Lh * 0.28, free + 0.38, 0], [Lh * 0.3, free + 0.42, 0]], B * 1.05, 0.72, up);          // cabin trunk
    m.sweep([[-Lh * 0.62, free + 0.12, 0], [-Lh * 0.32, free + 0.12, 0]], B * 0.9, 0.2, up);          // cockpit coaming
    for (let k = n1; k < m.aux.length; k++) m.aux[k] = 1;
    const fin = []; for (let i = 0; i <= 8; i++) { const x = mix(-Lh * 0.42, Lh * 0.32, i / 8); fin.push([x, -draft - (o.keel ?? 1) * sin(PI * i / 8) * 0.5 - (o.keel ?? 1) * 0.25, 0]); }
    m.sweep(fin, 0.16, (o.keel ?? 1) * 1.1, () => [0, 0, 1]);                                          // ballast keel
    m.sweep([[-Lh * 0.93, 0.2, 0], [-Lh * 0.9, -draft - 0.5, 0]], 0.07, 0.55, () => [0, 0, 1]);        // rudder
    for (const sg of [-1, 1]) { const pts = []; for (let i = 0; i <= 20; i++) { const x = mix(-Lh * 0.97, Lh * 0.97, i / 20); pts.push([x, sheer(x) + 0.05, sg * (hb(x) - 0.03)]); } const k0 = m.aux.length; m.sweep(pts, 0.09, 0.11, () => [0, 1, 0]); for (let k = k0; k < m.aux.length; k++) m.aux[k] = 0; }   // varnished toe rail
    void n0;
  }
  return m;
}
// The ketch's rig: two masts, booms, bowsprit and the wire that holds them up. All aux 0 (wood and dark metal).
function meshRig(Lh, free) {
  const m = new Mesh(), up = () => [1, 0, 0], y0 = free + 0.1;
  const mast = (x, h) => m.sweep([[x, y0 - 1, 0], [x, y0 + h * 0.5, 0], [x - 0.12, y0 + h, 0]], (k) => 0.2 - k * 0.04, (k) => 0.2 - k * 0.04, up);
  mast(Lh * 0.22, 15); mast(-Lh * 0.62, 10);
  m.sweep([[Lh * 0.2, y0 + 1.5, 0], [-Lh * 0.5, y0 + 1.7, 0.15]], 0.13, 0.13, () => [0, 1, 0]);       // main boom
  m.sweep([[-Lh * 0.64, y0 + 1.4, 0], [-Lh * 1.12, y0 + 1.5, 0.1]], 0.1, 0.1, () => [0, 1, 0]);       // mizzen boom
  m.sweep([[Lh * 0.9, y0 + 0.1, 0], [Lh * 1.3, y0 + 0.5, 0]], 0.12, 0.12, () => [0, 1, 0]);           // bowsprit
  m.sweep([[Lh * 0.18, y0 + 10.2, -1.5], [Lh * 0.18, y0 + 10.2, 1.5]], 0.07, 0.07, () => [0, 1, 0]);  // spreaders
  const wire = (a, b) => m.tube([a, b], 0.018, 4, false);
  const mh = [Lh * 0.1, y0 + 15, 0], zh = [-Lh * 0.74, y0 + 10, 0];
  wire([Lh * 1.3, y0 + 0.5, 0], mh); wire(mh, zh); wire(zh, [-Lh * 1.1, y0 - 0.1, 0]);
  for (const s of [-1, 1]) { wire([Lh * 0.18, y0 - 0.05, s * 1.75], [Lh * 0.18, y0 + 10.2, s * 1.5]); wire([Lh * 0.18, y0 + 10.2, s * 1.5], mh); wire([-Lh * 0.62, y0 - 0.05, s * 1.3], zh); }
  for (let k = 0; k < m.aux.length; k++) m.aux[k] = 0;
  return m;
}
// Sails as bellied triangles: tack, clew, head; depth is how far the cloth is blown out to leeward.
function meshSails(Lh, free) {
  const m = new Mesh(), y0 = free + 0.1;
  const sail = (A, Bp, C, depth) => {
    const N = 10, r = [];
    for (let i = 0; i <= N; i++) { r.push([]); for (let j = 0; j <= N - i; j++) {
      const u = i / N, w = j / N, t = 1 - u - w, k = 27 * u * w * t + 2.2 * u * (1 - u) * t;
      r[i].push(m.v(A[0] * t + Bp[0] * w + C[0] * u, A[1] * t + Bp[1] * w + C[1] * u, A[2] * t + Bp[2] * w + C[2] * u + depth * k * 0.25, 1));
    } }
    for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) { m.tri(r[i][j], r[i][j + 1], r[i + 1][j]); if (j < N - i - 1) m.tri(r[i][j + 1], r[i + 1][j + 1], r[i + 1][j]); }
  };
  sail([Lh * 0.2, y0 + 1.7, 0.05], [-Lh * 0.48, y0 + 1.9, 0.2], [Lh * 0.1, y0 + 14.6, 0.05], 2.2);       // main
  sail([-Lh * 0.64, y0 + 1.6, 0.04], [-Lh * 1.08, y0 + 1.7, 0.12], [-Lh * 0.73, y0 + 9.6, 0.04], 1.3);   // mizzen
  sail([Lh * 1.24, y0 + 0.7, 0.03], [Lh * 0.3, y0 + 1.3, 0.9], [Lh * 0.16, y0 + 13.6, 0.03], 2.4);       // jib
  return m;
}
// An anchor lying on its side: shank, stock, curved arms, flukes and a ring. About 2.4 m long.
function meshAnchor() {
  const m = new Mesh(), up = () => [0, 0, 1];
  m.sweep([[0, 0, 0], [0, 2.3, 0]], 0.13, 0.11, up);
  m.sweep([[-0.85, 2.05, 0], [0.85, 2.05, 0]], 0.1, 0.1, up);
  const arm = []; for (let i = 0; i <= 10; i++) { const a = mix(-1.15, 1.15, i / 10); arm.push([sin(a) * 0.95, 0.42 - cos(a) * 0.5, 0]); }
  m.sweep(arm, 0.12, 0.12, up);
  for (const s of [-1, 1]) { const tx = s * 0.87, ty = 0.22, a = m.v(tx, ty, 0), b = m.v(tx - s * 0.1, ty + 0.5, 0.24), c = m.v(tx - s * 0.1, ty + 0.5, -0.24), d = m.v(tx + s * 0.16, ty + 0.36, 0); m.tri(a, b, d); m.tri(a, d, c); m.tri(b, c, d); m.tri(a, c, b); }
  const ring = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU; ring.push([cos(a) * 0.2, 2.5 + sin(a) * 0.2, 0]); }
  m.tube(ring, 0.035, 5, false);
  return m;
}
// Anchor chain: a tube along the given points, beaded so it reads as links at a distance.
function meshChain(pts) {
  const m = new Mesh();
  m.tube(pts, (k) => 0.045 + 0.022 * (k & 1), 5, true, () => 1);
  return m;
}
// A mooring buoy: float, tripod cage, bell and lamp. aux 1 paint, 0 frame, -1 lamp.
function meshBuoy() {
  const m = meshLathe([[0, -0.9, 1], [0.55, -0.75, 1], [1.05, -0.2, 1], [1.1, 0.25, 1], [0.8, 0.55, 1], [0.3, 0.62, 1], [0, 0.62, 1]], 16, 0, 0);
  const n0 = m.aux.length;
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; m.tube([[cos(a) * 0.8, 0.5, sin(a) * 0.8], [cos(a) * 0.22, 2.5, sin(a) * 0.22]], 0.045, 5, false); }
  const hoop = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU; hoop.push([cos(a) * 0.5, 1.55, sin(a) * 0.5]); }
  m.tube(hoop, 0.035, 5, false);
  const bell = meshLathe([[0, 1.5, 0], [0.08, 1.5, 0], [0.14, 1.3, 0], [0.24, 1.08, 0], [0.3, 1.0, 0], [0, 1.02, 0]], 10, 0, 0);
  const b0 = m.p.length / 3; m.p.push(...bell.p); m.aux.push(...bell.aux); for (const k of bell.i) m.i.push(k + b0);
  for (let k = n0; k < m.aux.length; k++) m.aux[k] = 0;
  const lamp = icosphere(1, (x, y, z) => [x * 0.16, 2.62 + y * 0.16, z * 0.16]), l0 = m.p.length / 3;
  m.p.push(...lamp.p); for (let k = 0; k < lamp.aux.length; k++) m.aux.push(-1); for (const k of lamp.i) m.i.push(k + l0);
  return m;
}
// merge mesh b into a, optionally forcing its aux
const meshAdd = (a, b, aux) => { const o = a.p.length / 3; a.p.push(...b.p); for (const v of b.aux) a.aux.push(aux === undefined ? v : aux); for (const k of b.i) a.i.push(k + o); return a; };
// The lighthouse: plinth, tapering banded tower, gallery with railing, lantern room and cupola. About 30 m.
// aux 1 masonry, 0 ironwork and openings, -1 the lamp.
function meshLighthouse() {
  const m = meshLathe([[0, 0, 1], [5.4, 0, 1], [5.4, 1.3, 1], [4.3, 1.5, 1], [4.1, 3, 1], [3.5, 12, 1], [2.95, 21, 1], [2.9, 22.2, 1], [3.7, 22.5, 0], [3.7, 22.8, 0], [0, 22.8, 0]], 28, 0, 0);
  meshAdd(m, meshLathe([[1.9, 22.8, 0], [1.9, 23.5, 0], [1.75, 23.55, -1], [1.75, 25.6, -1], [1.95, 25.7, 0], [2.1, 26.0, 0], [1.2, 27.2, 0], [0.25, 27.9, 0], [0.22, 28.3, 0], [0, 28.35, 0]], 16, 0, 0));
  const rail = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; rail.push([cos(a) * 3.55, 23.9, sin(a) * 3.55]); }
  const iron = new Mesh();
  iron.tube(rail, 0.05, 5, false);
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; iron.tube([[cos(a) * 3.55, 22.8, sin(a) * 3.55], [cos(a) * 3.55, 23.9, sin(a) * 3.55]], 0.035, 4, false); }
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; iron.tube([[cos(a) * 1.8, 23.5, sin(a) * 1.8], [cos(a) * 1.8, 25.7, sin(a) * 1.8]], 0.06, 4, false); }   // lantern glazing bars
  iron.tube([[0, 28.3, 0], [0, 29.6, 0]], 0.03, 4, true);
  iron.sweep([[4.05, 1.4, 0], [4.25, 1.4, 0]], 1.3, 2.9, () => [0, 1, 0]);                                // door
  for (const [h, a] of [[7, 1.2], [12, 3.0], [17, 4.9]]) { const r = mix(4.1, 2.95, (h - 3) / 18) - 0.05; iron.sweep([[cos(a) * r, h, sin(a) * r], [cos(a) * (r + 0.16), h, sin(a) * (r + 0.16)]], 0.7, 1.2, () => [0, 1, 0]); }   // windows
  return meshAdd(m, iron, 0);
}

// ---------------------------------------------------------------- ruins and small things
// A fluted column: base, shaft with entasis, capital. Height 1 unit of shaft radius ~0.09; scaled when placed.
function meshColumn() {
  const sh = meshLathe([[0.58, 0, 1], [0.62, 0.12, 1], [0.5, 0.22, 1], [0.5, 0.3, 1]], 20, 0, 0);
  meshAdd(sh, meshLathe([[0.46, 0.3, 1], [0.465, 2.4, 1], [0.44, 4.6, 1], [0.39, 6.4, 1]], 20, 0.03, 20));
  meshAdd(sh, meshLathe([[0.39, 6.4, 1], [0.44, 6.5, 1], [0.6, 6.72, 1], [0.66, 6.78, 1], [0.66, 7.0, 1], [0, 7.0, 1]], 20, 0, 0));
  return sh;
}
function meshDrum() { return meshLathe([[0, 0, 1], [0.45, 0, 1], [0.46, 0.05, 1], [0.455, 1.1, 1], [0.44, 1.16, 1], [0, 1.16, 1]], 20, 0.06, 20); }
// a squared stone beam, 5.2 x 0.8 x 0.95: lintels, steps and fallen blocks
function meshBlock() { const m = new Mesh(); m.sweep([[-2.6, 0, 0], [2.6, 0, 0]], 0.95, 0.8, () => [0, 1, 0]); return m; }
function meshAmphora() {
  const m = meshLathe([[0, 0, 0.6], [0.06, 0.02, 0.7], [0.2, 0.3, 0.9], [0.3, 0.62, 1], [0.27, 0.9, 1], [0.13, 1.1, 1], [0.1, 1.28, 1], [0.15, 1.34, 1], [0.12, 1.36, 0.6], [0.08, 1.2, 0.2], [0, 1.0, 0.05]], 14, 0.12, 0);
  for (const s of [-1, 1]) m.tube([[s * 0.11, 1.28, 0], [s * 0.26, 1.22, 0], [s * 0.3, 1.0, 0], [s * 0.26, 0.86, 0]], 0.03, 5, false);
  return m;
}
// A cluster of hexagonal crystals with hard edges. aux runs from 0 at the root to 1 at the tip (the glow follows it).
function meshCrystal(sd) {
  rseed(300 + sd);
  const m = new Mesh(), n = 5 + (rnd() * 4 | 0);
  for (let c = 0; c < n; c++) {
    const big = c === 0, h = big ? rr(1.6, 2.4) : rr(0.5, 1.5), r = h * rr(0.1, 0.16) + 0.04, a = rnd() * TAU, tl = big ? rr(0, 0.15) : rr(0.2, 0.75);
    const ax = [sin(tl) * cos(a), cos(tl), sin(tl) * sin(a)], bx = big ? 0 : cos(a) * rr(0.12, 0.4), bz = big ? 0 : sin(a) * rr(0.12, 0.4);
    let u = [ax[1], -ax[0], 0]; const ul = hypot(...u) || 1; u = u.map((v) => v / ul);
    const w = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
    const P = (k, t, rad) => { const an = k / 6 * TAU + sd; return [bx + ax[0] * t + (u[0] * cos(an) + w[0] * sin(an)) * rad, -0.15 + ax[1] * t + (u[1] * cos(an) + w[1] * sin(an)) * rad, bz + ax[2] * t + (u[2] * cos(an) + w[2] * sin(an)) * rad]; };
    const tip = [bx + ax[0] * h * 1.18, -0.15 + ax[1] * h * 1.18, bz + ax[2] * h * 1.18];
    for (let k = 0; k < 6; k++) {
      m.quad(m.v(...P(k, 0, r), 0), m.v(...P(k + 1, 0, r), 0), m.v(...P(k + 1, h, r * 0.86), 0.8), m.v(...P(k, h, r * 0.86), 0.8));
      m.tri(m.v(...P(k, h, r * 0.86), 0.8), m.v(...P(k + 1, h, r * 0.86), 0.8), m.v(...tip, 1));
    }
  }
  return m;
}
function meshStarfish() {
  const m = new Mesh();
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; m.tube([[0, 0.05, 0], [cos(a) * 0.3, 0.07, sin(a) * 0.3], [cos(a) * 0.62, 0.035, sin(a) * 0.62], [cos(a + 0.12) * 0.9, 0.012, sin(a + 0.12) * 0.9]], (k) => [0.19, 0.14, 0.08, 0.025][k], 6, true, (k) => 1 - k * 0.12); }
  for (let k = 0; k < m.p.length; k += 3) m.p[k + 1] = max(m.p[k + 1] * 0.55, 0);
  return m;
}
function meshUrchin() {
  const core = icosphere(1, (x, y, z) => [x * 0.3, y * 0.24 + 0.2, z * 0.3]), m = new Mesh();
  meshAdd(m, core, 0.35);
  for (let k = 0; k < core.p.length; k += 3) { const x = core.p[k], y = core.p[k + 1] - 0.2, z = core.p[k + 2], l = hypot(x, y, z) || 1; if (y > -0.15) m.tube([[x, y + 0.2, z], [x + x / l * 0.55, y + 0.2 + y / l * 0.55, z + z / l * 0.55]], (j) => 0.022 * (1 - j * 0.8), 3, true, (j) => 0.5 + 0.5 * j); }
  return m;
}

// ---------------------------------------------------------------- more animals
// Sea turtle: nose +z, about 1 unit long. aux is the paddle weight of each flipper vertex (signed by side), 0 on the body.
function meshTurtle() {
  const m = icosphere(2, (x, y, z) => [x * 0.36, (y > 0 ? y * 0.17 : y * 0.07) + 0.01 * cos(z * 7) * (1 - abs(x)), z * 0.46]);
  for (let k = 0; k < m.aux.length; k++) m.aux[k] = 0;
  meshAdd(m, icosphere(1, (x, y, z) => [x * 0.085, y * 0.075 + 0.01, 0.52 + z * 0.13]), 0);                                     // head
  meshAdd(m, icosphere(0, (x, y, z) => [x * 0.03, y * 0.03 - 0.01, -0.5 + z * 0.08]), 0);                                       // tail
  for (const s of [-1, 1]) {
    const f = new Mesh();
    f.tube([[s * 0.24, 0, 0.3], [s * 0.5, 0.01, 0.34], [s * 0.78, 0.0, 0.2], [s * 0.98, -0.01, -0.04]], (k) => [0.075, 0.1, 0.085, 0.03][k], 6, true, (k) => s * k / 3);   // front flipper
    for (let k = 1; k < f.p.length; k += 3) f.p[k] *= 0.3;
    meshAdd(m, f);
    const r = new Mesh();
    r.tube([[s * 0.2, -0.01, -0.34], [s * 0.34, -0.01, -0.5], [s * 0.38, -0.02, -0.64]], (k) => [0.06, 0.07, 0.025][k], 5, true, (k) => s * 0.12 * k);                      // hind flipper
    for (let k = 1; k < r.p.length; k += 3) r.p[k] *= 0.3;
    meshAdd(m, r);
  }
  return m;
}
// Gull: nose +z, half wing span = 1. aux is the span coordinate.
function meshGull() {
  const m = icosphere(1, (x, y, z) => [x * 0.085, y * 0.08, z * 0.3 + (z > 0.7 ? 0.2 * (z - 0.7) : 0)]);
  for (let k = 0; k < m.aux.length; k++) m.aux[k] = 0;
  const NU = 14, rows = [];
  for (let j = 0; j <= NU; j++) {
    const u = j / NU * 2 - 1, au = abs(u), lead = 0.12 - 0.1 * au * au + 0.07 * sin(au * PI) - (au > 0.5 ? (au - 0.5) * 0.36 : 0), ch = 0.2 * (1 - 0.72 * pow(au, 1.5)) + 0.012;
    rows.push([m.v(u, 0.012 + 0.03 * sin(au * PI), lead, u), m.v(u, 0.02 * sin(au * PI), lead - ch, u)]);
  }
  for (let j = 0; j < NU; j++) m.quad(rows[j][0], rows[j + 1][0], rows[j + 1][1], rows[j][1]);
  const a = m.v(0, 0.01, -0.25, 0), b = m.v(-0.07, 0.0, -0.46, 0), c = m.v(0.07, 0.0, -0.46, 0); m.tri(a, b, c);
  return m;
}
// Humpback: nose +z, body length 1. aux marks the pectoral fins and fluke tips (+-1 at the tips), 0 on the body.
function meshWhale() {
  const m = new Mesh(), NZ2 = 30, NR = 16, rings = [];
  for (let i = 0; i <= NZ2; i++) {
    const s = i / NZ2, z = 0.5 - s * 0.93;
    const r = 0.012 + 0.108 * pow(sin(PI * pow(s, 0.62)), 0.72) * (1 - 0.72 * sstep(0.55, 1, s));
    const ring = [];
    for (let k = 0; k < NR; k++) { const a = k / NR * TAU, cy = sin(a), cx = cos(a); ring.push(m.v(cx * r * (1 - 0.35 * sstep(0.6, 1, s)), cy * r * (cy < 0 ? 0.92 : 1.05) + 0.012 * sstep(0.0, 0.25, s) * (s < 0.25 ? -1 : 0), z, 0)); }
    rings.push(ring);
  }
  for (let i = 0; i < NZ2; i++) for (let k = 0; k < NR; k++) { const k2 = (k + 1) % NR; m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
  const nose = m.v(0, 0, 0.515, 0); for (let k = 0; k < NR; k++) m.tri(nose, rings[0][k], rings[0][(k + 1) % NR]);
  const flat = (t, th) => { for (let k = 1; k < t.p.length; k += 3) t.p[k] = t.p[k] * th; return t; };
  for (const s of [-1, 1]) {
    const pec = new Mesh();   // long knobbly pectoral fin, a third of the body length
    pec.tube([[s * 0.085, -0.03, 0.2], [s * 0.2, -0.05, 0.16], [s * 0.3, -0.06, 0.07], [s * 0.37, -0.065, -0.04], [s * 0.4, -0.065, -0.12]], (k) => [0.05, 0.055, 0.048, 0.035, 0.012][k], 6, true, (k) => s * k / 4);
    for (let k = 0; k < pec.p.length; k += 3) pec.p[k + 1] = -0.03 + (pec.p[k + 1] + 0.03) * 0.3 - abs(pec.p[k]) * 0.1;
    meshAdd(m, pec);
    const fl = new Mesh();    // one side of the fluke
    fl.tube([[0, 0, -0.42], [s * 0.07, 0, -0.47], [s * 0.15, 0, -0.5], [s * 0.2, 0, -0.52]], (k) => [0.035, 0.055, 0.04, 0.008][k], 6, true, (k) => s * k / 3);
    meshAdd(m, flat(fl, 0.22));
  }
  const dor = new Mesh(); dor.tube([[0, 0.085, -0.17], [0, 0.11, -0.2], [0, 0.118, -0.235]], (k) => [0.022, 0.014, 0.003][k], 5, true, () => 0); meshAdd(m, dor);
  return m;
}
// Jellyfish: bell opening downward at y = 0, top at y = 0.5. Bell aux 0; arms and tentacles carry -depth (0..-1).
function meshJelly() {
  const prof = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * PI / 2; prof.push([cos(a) * 0.5 * (1 + 0.06 * sin(a * 4)), sin(a) * 0.48, 0]); }
  const m = meshLathe(prof, 20, 0, 8);
  meshAdd(m, meshLathe([[0.46, 0.02, 0], [0.3, 0.2, 0], [0, 0.3, 0]], 12, 0, 0));          // inner bell
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4, pts = []; for (let k = 0; k <= 6; k++) pts.push([cos(a + k * 0.5) * 0.09, 0.18 - k * 0.14, sin(a + k * 0.5) * 0.09]); m.tube(pts, (k) => 0.045 * (1 - k / 7.5), 4, true, (k) => -k / 6 * 0.6 - 0.001); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, pts = []; for (let k = 0; k <= 8; k++) pts.push([cos(a) * (0.47 - k * 0.012), 0.02 - k * 0.2, sin(a) * (0.47 - k * 0.012)]); m.tube(pts, (k) => 0.012 * (1 - k / 10), 3, true, (k) => -k / 8 - 0.001); }
  return m;
}
