// ============================================================================
// The island and its harbor town, Port Amaro (load time only, except landY)
// ============================================================================
// North-east of the atoll, outside the voxel grid. The ground is a height field; the town is laid out as level streets
// that ring the bay and step up the hill, like the seats of a theatre. Everything a designer would move is at the top.

const LO = 65, LS = 540, LN = 360, LC = LS / LN;        // height field: origin (x and z), size in metres, cells, cell size
const LCELLS = 9, LCW = LS / LCELLS;                    // culling grid over the island
const ISLE = [335, 335], ISLER = 175, BAY = [211, 211], BAYR = 55;
// streets: radius from the bay centre, level
const RINGS = [[66, 2.2], [86, 8.6], [106, 15.2], [126, 22], [146, 29], [166, 36]];
// stair lanes that climb through the rings, as angles off the town's axis
const LANES = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75];
const SUMMIT = [388, 388], KNOLL = [182, 322], TOWER = 77, CHURCH = [141, -0.38];
// country roads: polylines of [x, z]
const ROADS = [
  [[211 + 126 * cos(1.585), 211 + 126 * sin(1.585)], [196, 326], [185, 322]],
  [[211 + 166 * cos(0.885), 211 + 166 * sin(0.885)], [340, 352], [362, 356], [374, 368], [366, 382], [380, 390]],
  [[317, 209], [352, 222], [398, 240], [428, 218], [434, 196]],
  [[398, 240], [444, 288], [456, 338], [440, 388], [400, 428]],
];
// sRGB hex to a linear WGSL colour
const SRGB = (h) => `vec3f(${[1, 3, 5].map((i) => pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2).toFixed(4)).join(', ')})`;

const wrapA = (a) => a - TAU * round(a / TAU);
const bayPolar = (x, z) => { const dx = x - BAY[0], dz = z - BAY[1]; return [hypot(dx, dz), wrapA(atan2(dz, dx) - PI / 4)]; };
const bayPt = (r, a) => [BAY[0] + r * cos(a + PI / 4), BAY[1] + r * sin(a + PI / 4)];
// > 0 inland, roughly metres from the shore: a rough disc with the bay bitten out of it
const landF = (x, z) => {
  const dx = x - ISLE[0], dz = z - ISLE[1], th = atan2(dz, dx), cx = cos(th), sx = sin(th);
  const f = ISLER + 30 * (fbm(cx * 1.3 + 3, sx * 1.3 + 7, 1.5, 3) - 0.5) + 10 * (fbm(cx * 5, sx * 5, 4.4, 2) - 0.5) - hypot(dx, dz);
  const db = hypot(x - BAY[0], z - BAY[1]) - BAYR, k = 14, h = max(k - abs(f - db), 0) / k;
  return min(f, db) - h * h * k * 0.25;
};
const townW = (db, a) => sstep(0.95, 0.78, abs(a)) * sstep(216, 168, db);
const townLevel = (db) => {
  if (db <= RINGS[0][0] + 3) return RINGS[0][1];
  for (let k = 0; k < RINGS.length - 1; k++) {
    const a = RINGS[k], b = RINGS[k + 1];
    if (db < b[0] + 3) return db < b[0] - 3 ? a[1] + (b[1] - a[1]) * sstep(a[0] + 3, b[0] - 3, db) : b[1];
  }
  const l = RINGS[RINGS.length - 1]; return l[1] + (db - l[0] - 3) * 0.72;                 // beyond the last street the ground climbs to meet the hill
};
const fieldK = (f, th) => sstep(0.72, 0.5, abs(wrapA(th + 0.2))) * sstep(18, 36, f) * sstep(158, 96, f);
// farmland sits where that sector's ground is low anyway; fieldY is the level it is graded to
const fieldY = (x, z, f) => 3.4 + 0.17 * f + (fbm(x * 0.03, 6, z * 0.03, 3) - 0.5) * 5;
const inField = (x, z, f, th, h) => fieldK(f, th) > 0.75 && abs(h - fieldY(x, z, f)) < 4;
const landH0 = (x, z) => {
  const f = landF(x, z), [db, a] = bayPolar(x, z), th = atan2(z - ISLE[1], x - ISLE[0]);
  const bw = sstep(0.42, 0.25, abs(wrapA(th + 0.96))), cw = sstep(1.0, 0.8, abs(wrapA(th - 1.87)));   // beach, cliffs
  if (f <= 0) {
    const d = -f, inBay = sstep(BAYR + 24, BAYR - 8, db);
    return -(mix(0.34, 0.16, bw) * min(d, 16) + mix(40, 7, inBay) * sstep(mix(10, 26, bw), 80, d)) - 0.2 + (fbm(x * 0.05, 2, z * 0.05, 3) - 0.5) * 1.5 * sstep(6, 40, d);
  }
  let h = -0.2 + mix(2.6, 2.2, bw) * sstep(0, mix(5, 14, bw), f);
  h += cw * (15 + 12 * fbm(th * 2.2, 3.1, 0.7, 2)) * sstep(1.5, 9, f);
  h += 11 * sstep(0, 90, f);
  const hill = (px, pz, H, s, flat = 0) => H * exp(-(max(hypot(x - px, z - pz) - flat, 0) ** 2) / (2 * s * s));   // flat: radius of a level top
  h += (hill(SUMMIT[0], SUMMIT[1], 58, 56, 14) + hill(330, 440, 34, 42) + hill(355, 220, 16, 26)) * sstep(4, 46, f);
  h += hill(KNOLL[0], KNOLL[1], 22, 17) * sstep(0, 10, f);
  h += ((fbm(x * 0.018, 3, z * 0.018, 4) - 0.5) * 9 + (fbm(x * 0.07, 9, z * 0.07, 3) - 0.5) * 2.2) * sstep(8, 60, f) * sstep(12, 40, hypot(x - SUMMIT[0], z - SUMMIT[1]));
  // farmland: a broad apron that climbs gently, so crops can be laid out along its contours
  h = mix(h, fieldY(x, z, f), fieldK(f, th) * sstep(31, 19, h));
  return mix(h, townLevel(db), townW(db, a) * sstep(0, 5, f));
};
// distance from p to a polyline of [x, z]
const polyD = (x, z, P) => {
  let d = 1e9;
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0], az = P[i][1], bx = P[i + 1][0] - ax, bz = P[i + 1][1] - az, h = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1);
    d = min(d, hypot(x - ax - bx * h, z - az - bz * h));
  }
  return d;
};
// the height field, kept for the camera: ground level under (x, z), or -1e9 outside the island's square. No allocation.
let LH = null;
function landY(x, z) {
  const u = (x - LO) / LC, v = (z - LO) / LC;
  if (!LH || u < 0 || v < 0 || u >= LN || v >= LN) return -1e9;
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = i + (LN + 1) * j;
  const a = LH[k] + (LH[k + 1] - LH[k]) * fu, b = LH[k + LN + 1] + (LH[k + LN + 2] - LH[k + LN + 1]) * fu;
  return a + (b - a) * fv;
}

// ---------------------------------------------------------------- mesh pieces with hard edges
// a box with its own vertices on every face; yaw turns it about its centre
function mBox(m, cx, cy, cz, sx, sy, sz, aux = 1, yaw = 0) {
  const c = cos(yaw), s = sin(yaw), hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const P = (x, y, z) => m.v(cx + x * hx * c + z * hz * s, cy + y * hy, cz - x * hx * s + z * hz * c, aux);
  for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ax === 0 ? P(sg, u, v) : ax === 1 ? P(u, sg, v) : P(u, v, sg));
    m.quad(q[0], q[1], q[2], q[3]);
  }
}
// a flat rectangle: centre p, half-extent vectors a and b
const mRect = (m, p, a, b, aux) => m.quad(m.v(p[0] - a[0] - b[0], p[1] - a[1] - b[1], p[2] - a[2] - b[2], aux), m.v(p[0] + a[0] - b[0], p[1] + a[1] - b[1], p[2] + a[2] - b[2], aux),
  m.v(p[0] + a[0] + b[0], p[1] + a[1] + b[1], p[2] + a[2] + b[2], aux), m.v(p[0] - a[0] + b[0], p[1] - a[1] + b[1], p[2] - a[2] + b[2], aux));
const mTri = (m, a, b, c, aux) => m.tri(m.v(...a, aux), m.v(...b, aux), m.v(...c, aux));

// ---------------------------------------------------------------- houses
// Front faces +z, y = 0 is the street. Vertex aux tags the part (times 4): 4 wall, 3 roof, 2 glass, 1 shutters and
// doors, 0 white trim, -1 dark wood, -2 stone, -3 flower boxes, -4 awning.
// W along the street, D deep, ridgeX: ridge parallel to the street (else the gable faces it).
function meshHouse(sd, W, D, floors, ridgeX, pitch, o = {}) {
  rseed(400 + sd);
  const m = new Mesh(), FH = 2.85, y0 = 0.25, wallH = y0 + floors * FH + (o.tall || 0), hw = W / 2, hd = D / 2;
  mBox(m, 0, -2.3, 0, W + 0.3, 5.1, D + 0.3, -0.5);                                  // stone footing, sunk into the slope
  mBox(m, 0, (y0 + wallH) / 2, 0, W, wallH - y0, D, 1);
  // roof: two slabs with eaves; P(along the ridge, across it, y)
  const span = ridgeX ? hd : hw, rl = (ridgeX ? W : D) / 2, tp = Math.tan(pitch), rh = span * tp, ov = 0.5, P = (a, c, y) => ridgeX ? [a, y, c] : [c, y, a];
  const sub = (p, q) => [q[0] - p[0], q[1] - p[1], q[2] - p[2]].map((v) => v / 2), mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  for (const s of [-1, 1]) {
    const e = P(0, s * (span + ov), wallH - ov * tp), r = P(0, 0, wallH + rh), al = P(rl + 0.35, 0, 0);
    mRect(m, mid(e, r), al, sub(e, r), 0.75);
    mRect(m, [mid(e, r)[0], mid(e, r)[1] - 0.16, mid(e, r)[2]], al, sub(e, r), 0);
    mRect(m, [e[0], e[1] - 0.08, e[2]], al, [0, 0.08, 0], 0);
    for (const g of [-1, 1]) { const o2 = P(g * (rl + 0.35), 0, 0), c2 = mid(e, r); mRect(m, [c2[0] + o2[0], c2[1] - 0.08 + o2[1], c2[2] + o2[2]], sub(e, r), [0, 0.08, 0], 0); }
  }
  for (const g of [-1, 1]) mTri(m, P(g * rl, -span, wallH), P(g * rl, span, wallH), P(g * rl, 0, wallH + rh), 1);
  { const c = P(0, 0, wallH + rh + 0.03), s = P(rl * 2 + 0.7, 0.3, 0.14); mBox(m, c[0], c[1], c[2], s[0] || 0.3, 0.14, s[2] || 0.3, 0.75); }   // ridge cap
  for (let i = 0; i < (o.chim ?? 1); i++) {
    const c = P((i ? -1 : 1) * rl * rr(0.35, 0.7), span * rr(-0.35, 0.35), 0), top = wallH + rh + rr(0.7, 1.1);
    mBox(m, c[0], (wallH + top) / 2, c[2], 0.72, top - wallH, 0.72, -0.5);
    mBox(m, c[0], top + 0.06, c[2], 0.86, 0.12, 0.86, 0);
    mBox(m, c[0], top + 0.3, c[2], 0.3, 0.4, 0.3, -0.25);
  }
  // the four walls: centre, tangent, normal, width
  const walls = [[[0, 0, hd], [1, 0, 0], [0, 0, 1], W], [[0, 0, -hd], [-1, 0, 0], [0, 0, -1], W], [[hw, 0, 0], [0, 0, -1], [1, 0, 0], D], [[-hw, 0, 0], [0, 0, 1], [-1, 0, 0], D]];
  const at = (w, u, y, off) => [w[0][0] + w[1][0] * u + w[2][0] * off, y, w[0][2] + w[1][2] * u + w[2][2] * off];
  const rect = (w, u, y, uw, yh, off, aux) => mRect(m, at(w, u, y, off), [w[1][0] * uw / 2, 0, w[1][2] * uw / 2], [0, yh / 2, 0], aux);
  const wbox = (w, u, y, ul, yl, nl, aux) => { const p = at(w, u, y, nl / 2); mBox(m, p[0], p[1], p[2], w[1][0] ? ul : nl, yl, w[1][0] ? nl : ul, aux); };
  const win = (w, u, y, ww = 0.86, wh = 1.22, sh = true, fb = false) => {
    rect(w, u, y, ww + 0.18, wh + 0.18, 0.025, 0); rect(w, u, y, ww, wh, 0.045, 0.5);
    rect(w, u, y, 0.05, wh, 0.055, 0); rect(w, u, y + wh * 0.12, ww, 0.05, 0.055, 0);
    if (sh) for (const s of [-1, 1]) rect(w, u + s * (ww / 2 + 0.3), y, 0.44, wh + 0.1, 0.04, 0.25);
    wbox(w, u, y - wh / 2 - 0.1, ww + 0.3, 0.08, 0.16, 0);
    if (fb) wbox(w, u, y - wh / 2 - 0.02, ww + 0.1, 0.24, 0.3, -0.75);
  };
  const shut = o.shut ?? true;
  for (let k = 0; k < 4; k++) {
    if (o.doors && !k) continue;
    const w = walls[k], n = k < 2 ? max(1, floor((w[3] - 0.9) / (shut ? 2.25 : 1.75))) : (o.sides ?? 2);
    for (let fl = 0; fl < floors; fl++) {
      const door = k === 0 && fl === 0 ? (o.shop ? -1 : (n / 2) | 0) : -2;
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n - 0.5) * (w[3] - 0.5), y = y0 + fl * FH + 1.55;
        if (door === -1) continue;
        if (i === door) {
          rect(w, u, y0 + 1.1, 1.3, 2.3, 0.03, 0); rect(w, u, y0 + 1.05, 1.06, 2.1, 0.05, rnd() < 0.5 ? 0.25 : -0.25);
          wbox(w, u, y0 - 0.05, 1.6, 0.18, 0.6, -0.5);
        } else win(w, u, y, 0.86, fl ? 1.22 : 1.3, shut, k === 0 && rnd() < 0.45);
      }
    }
  }
  if (o.shop) {   // a shop front under a striped awning
    const w = walls[0];
    rect(w, -0.9, y0 + 1.2, W - 3.2, 1.9, 0.04, 0); rect(w, -0.9, y0 + 1.25, W - 3.5, 1.6, 0.06, 0.5);
    rect(w, hw - 1.1, y0 + 1.1, 1.2, 2.3, 0.03, 0); rect(w, hw - 1.1, y0 + 1.05, 0.98, 2.1, 0.05, 0.25);
    mRect(m, [-0.9, y0 + 2.38, hd + 0.6], [(W - 2.8) / 2, 0, 0], [0, -0.2, 0.6], -1);
    mRect(m, [-0.9, y0 + 2.1, hd + 1.2], [(W - 2.8) / 2, 0, 0], [0, 0.09, 0], -1);
  }
  if (!ridgeX && rh > 2.2) for (const k of [0, 1]) win(walls[k], 0, wallH + rh * 0.32, 0.7, 0.95, false);   // attic window in the gable
  if (o.dormers && ridgeX) for (let i = 0; i < o.dormers; i++) {
    const a = ((i + 0.5) / o.dormers - 0.5) * W * 0.8, c0 = span * 0.5, yb = wallH + (span - c0) * tp;
    mBox(m, a, yb + 0.45, c0 + 0.1, 1.3, 1.5, 1.5, 1);
    for (const s of [-1, 1]) mRect(m, [a + s * 0.4, yb + 1.5, c0 - 0.2], [0.44, -s * 0.34, 0], [0, 0, 1.25], 0.75);
    mTri(m, [a - 0.65, yb + 1.2, c0 + 0.85], [a + 0.65, yb + 1.2, c0 + 0.85], [a, yb + 1.74, c0 + 0.85], 1);
    rect(walls[0], a, yb + 0.65, 0.8, 0.9, c0 + 0.88 - hd, 0); rect(walls[0], a, yb + 0.65, 0.64, 0.74, c0 + 0.9 - hd, 0.5);
  }
  if (o.doors) for (const u of [-W * 0.26, W * 0.26]) { rect(walls[0], u, y0 + 1.5, 3.0, 3.1, 0.03, 0); rect(walls[0], u, y0 + 1.45, 2.7, 2.9, 0.05, -0.25); }   // warehouse doors
  return m;
}

// ---------------------------------------------------------------- landmarks
// Tags (aux times 4): 4 stone, 3 roof, 2 clock face, 1 white plaster, 0 dark opening, -1 wood, -2 sailcloth, -3 gold,
// -4 coloured glass.
function meshClockTower() {
  const m = new Mesh();
  mBox(m, 0, -1.5, 0, 8.4, 5, 8.4, 1);
  mBox(m, 0, 12, 0, 6.4, 24, 6.4, 1);
  for (const y of [1.6, 15.6, 24]) mBox(m, 0, y, 0, 7.0, 0.5, 7.0, 0.25);
  mBox(m, 0, 26.2, 0, 5.6, 4.4, 5.6, 1);
  mBox(m, 0, 28.6, 0, 6.6, 0.4, 6.6, 0.25);
  for (let k = 0; k < 4; k++) {
    const a = k * PI / 2, n = [sin(a), 0, cos(a)], u = [cos(a), 0, -sin(a)], F = (off, y, uw, yh, aux, d = 3.2) => mRect(m, [n[0] * (d + off), y, n[2] * (d + off)], [u[0] * uw / 2, 0, u[2] * uw / 2], [0, yh / 2, 0], aux);
    F(0.06, 19.8, 4.6, 4.6, 0.25); F(0.1, 19.8, 4.1, 4.1, 0.5);                       // the clock
    for (const s of [-0.75, 0.75]) mRect(m, [n[0] * 2.86 + u[0] * s, 26.3, n[2] * 2.86 + u[2] * s], [u[0] * 0.5, 0, u[2] * 0.5], [0, 1.4, 0], 0);   // belfry openings
    for (const y of [6, 11]) F(0.05, y, 0.7, 1.8, 0);
    if (!k) { F(0.05, 1.9, 2.4, 3.6, 0.25); F(0.08, 1.7, 2.0, 3.2, -0.25); }
    // the copper roof: steep below, a spike above
    const c = (s, t, y) => [n[0] * t + u[0] * s, y, n[2] * t + u[2] * s];
    m.quad(m.v(...c(-3.3, 3.3, 28.8), 0.75), m.v(...c(3.3, 3.3, 28.8), 0.75), m.v(...c(1.1, 1.1, 33.4), 0.75), m.v(...c(-1.1, 1.1, 33.4), 0.75));
    mTri(m, c(-1.1, 1.1, 33.4), c(1.1, 1.1, 33.4), [0, 39.5, 0], 0.75);
  }
  mBox(m, 0, 40.2, 0, 0.12, 1.6, 0.12, -0.75); mBox(m, 0, 40.7, 0, 0.9, 0.1, 0.1, -0.75);
  return m;
}
// the church lies along its street: nave on x, tower at the +x end, doors facing +z
function meshChurch() {
  const m = new Mesh();
  mBox(m, 0, -2, 0, 22.5, 4.6, 9.6, 1);
  mBox(m, -2.5, 4.1, 0, 16, 7.8, 9, 0.25);
  for (const s of [-1, 1]) mRect(m, [-2.5, 10.6, s * 2.5], [8.4, 0, 0], [0, -2.9, s * 2.5], 0.75);
  for (const g of [-1, 1]) mTri(m, [-2.5 + g * 8, 8, -4.5], [-2.5 + g * 8, 8, 4.5], [-2.5 + g * 8, 13.2, 0], 0.25);
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const x = -8.5 + i * 3; mRect(m, [x, 4.6, s * 4.53], [0.55, 0, 0], [0, 1.9, 0], -1); mRect(m, [x, 6.6, s * 4.54], [0.4, 0, 0], [0, 0.4, 0], -1); }
  mBox(m, -11.2, 3.1, 0, 2.6, 5.8, 6, 0.25);                                          // apse
  mBox(m, 8.2, 9, 0, 5.6, 18, 5.6, 0.25);                                             // tower
  mBox(m, 8.2, 18.2, 0, 6.2, 0.5, 6.2, 1);
  for (let k = 0; k < 4; k++) {
    const a = k * PI / 2, n = [sin(a), 0, cos(a)], u = [cos(a), 0, -sin(a)];
    mRect(m, [8.2 + n[0] * 2.83, 15, n[2] * 2.83], [u[0] * 0.7, 0, u[2] * 0.7], [0, 1.5, 0], 0);
    const c = (s, t, y) => [8.2 + n[0] * t + u[0] * s, y, n[2] * t + u[2] * s];
    mTri(m, c(-3.0, 3.0, 18.4), c(3.0, 3.0, 18.4), [8.2, 29, 0], 0.75);
  }
  mRect(m, [8.2, 2.1, 2.83], [1.2, 0, 0], [0, 1.9, 0], 0); mRect(m, [8.2, 1.9, 2.86], [1.0, 0, 0], [0, 1.7, 0], -0.25);
  mRect(m, [8.2, 8.6, 2.83], [1.2, 0, 0], [0, 1.2, 0], -1);                           // rose window
  mBox(m, 8.2, 29.8, 0, 0.12, 1.8, 0.12, -0.75); mBox(m, 8.2, 30.2, 0, 0.8, 0.12, 0.12, -0.75);
  return m;
}
function meshMill() {
  const m = meshLathe([[3.6, -2, 0.25], [3.3, 0, 0.25], [2.5, 9.2, 0.25], [2.65, 9.4, -0.25], [2.75, 9.8, -0.25], [1.9, 11.4, -0.25], [0.5, 12.6, -0.25], [0, 12.7, -0.25]], 20, 0, 0);
  mRect(m, [0, 1.1, 3.22], [0.6, 0, 0], [0, 1.1, -0.1], -0.25);
  for (const [y, a] of [[4.6, 0.6], [7.2, -0.9], [5.5, 2.6]]) { const r = mix(3.3, 2.5, y / 9.2) + 0.03; mRect(m, [sin(a) * r, y, cos(a) * r], [cos(a) * 0.35, 0, -sin(a) * 0.35], [0, 0.55, 0], 0); }
  m.tube([[0, 10.4, 1.6], [0, 10.4, 3.1]], 0.22, 6, true, () => -0.25);
  return m;
}
// four lattice sails in the xy plane, hub at the origin; the vertex shader turns them about z
function meshSailsMill() {
  const m = new Mesh();
  for (let k = 0; k < 4; k++) {
    const a = k * PI / 2, c = cos(a), s = sin(a), P = (r, w, z = 0) => [c * r - s * w, s * r + c * w, z];
    m.sweep([P(0, 0), P(8.6, 0)], 0.16, 0.16, () => [0, 0, 1]);
    for (const w of [0.55, 1.75]) m.sweep([P(1.6, w, -0.03), P(8.4, w, -0.12)], 0.05, 0.05, () => [0, 0, 1]);
    for (let r = 1.6; r <= 8.45; r += 0.85) m.sweep([P(r, 0, 0), P(r, 1.75, -0.1)], 0.045, 0.045, () => [0, 0, 1]);
    m.quad(m.v(...P(1.7, 0.12, -0.05), -0.5), m.v(...P(8.3, 0.12, -0.1), -0.5), m.v(...P(8.3, 1.7, -0.16), -0.5), m.v(...P(1.7, 1.7, -0.1), -0.5));
  }
  for (let i = 0; i < m.aux.length; i++) if (m.aux[i] === 1) m.aux[i] = -0.25;
  return m;
}

// ---------------------------------------------------------------- trees
// Painted-background trees: a few lumpy masses on a trunk. Normals are pulled toward the direction from the middle of
// the crown, so each tree shades as one soft volume. aux: -1 trunk, otherwise 0..1 from the shaded underside up.
function meshTree(sd, sub, o = {}) {
  rseed(500 + sd);
  const m = new Mesh(), H = o.h ?? 3.7, R = o.r ?? 3.0, sq = o.sq ?? 0.88, nb = o.n ?? 8;
  if (H > 1) {
    m.tube([[0, -1.2, 0], [0.12, H * 0.42, 0.06], [0, H * 0.82, 0]], (k) => [0.44, 0.3, 0.18][k] * (o.tr ?? 1), 7, true, () => -1);
    for (let i = 0; i < 3; i++) { const a = rnd() * TAU; m.tube([[0, H * rr(0.4, 0.55), 0], [cos(a) * R * 0.5, H * 0.78, sin(a) * R * 0.5]], (k) => 0.16 - 0.06 * k, 5, true, () => -1); }
  }
  const blobs = [[0, H + R * 0.2, 0, R]];
  for (let i = 1; i < nb; i++) { const a = i / (nb - 1) * TAU + rr(-0.4, 0.4), d = R * rr(0.55, 0.95); blobs.push([cos(a) * d, H + R * rr(-0.5, 0.45) * (o.flat ? 0.4 : 1), sin(a) * d, R * rr(0.5, 0.8)]); }
  const lo = H - R * sq * 0.9, hi = H + R * (0.2 + sq);
  for (const b of blobs) {
    const s = rnd() * 50, bm = icosphere(sub, (x, y, z) => { const r = b[3] * (0.74 + 0.6 * fbm(x * 1.5 + s, y * 1.5, z * 1.5, 2)); return [b[0] + x * r, b[1] + y * r * sq, b[2] + z * r]; });
    for (let k = 0; k < bm.aux.length; k++) bm.aux[k] = clamp((bm.p[k * 3 + 1] - lo) / (hi - lo), 0.02, 1);
    meshAdd(m, bm);
  }
  const cy = H + R * 0.1;
  return m.build((x, y, z, nx, ny, nz) => {
    const l = hypot(nx, ny, nz) || 1; if (y < lo - 0.1 && hypot(x, z) < 0.7) return [nx, ny, nz];
    const rx = x, ry = (y - cy) / sq + R * 0.25, rz = z, rl = hypot(rx, ry, rz) || 1;
    return [nx / l * 0.4 + rx / rl * 0.6, ny / l * 0.4 + ry / rl * 0.6, nz / l * 0.4 + rz / rl * 0.6];
  });
}
// a tall narrow cypress
function meshCypress(seg = 9) {
  const m = meshLathe([[0, 0.5, 0.05], [0.55, 1.2, 0.2], [0.82, 3.2, 0.5], [0.76, 6, 0.75], [0.5, 8.8, 0.9], [0.18, 10.6, 1], [0, 11.3, 1]], seg, 0.5, 0);
  m.tube([[0, -1, 0], [0, 1.4, 0]], 0.2, 5, false, () => -1);
  return m;
}

// ---------------------------------------------------------------- harbor furniture
// a market stall: posts, a striped awning, a counter with crates. Tags (times 4): 4 planks, 2 awning, 1 cloth, 0 dark.
function meshStall() {
  const m = new Mesh();
  for (const x of [-1.3, 1.3]) for (const z of [-0.8, 0.8]) mBox(m, x, 1.15, z, 0.09, 2.3, 0.09, 1);
  mRect(m, [0, 2.45, 0.1], [1.6, 0, 0], [0, -0.22, 1.1], 0.5);
  mRect(m, [0, 2.12, 1.2], [1.6, 0, 0], [0, 0.11, 0], 0.5);
  mBox(m, 0, 0.5, 0.2, 2.5, 1.0, 1.1, 1);
  for (let i = 0; i < 4; i++) mBox(m, -0.9 + i * 0.6, 1.14, 0.2, 0.5, 0.26, 0.6, 0.25, 0.1 * i);
  return m;
}
function meshBarrels() {
  rseed(610);
  const m = new Mesh();
  for (const [x, z] of [[0, 0], [0.85, 0.15], [0.4, 0.8]]) {
    const b = meshLathe([[0, 0, 1], [0.3, 0, 1], [0.37, 0.25, 1], [0.39, 0.5, 1], [0.37, 0.75, 1], [0.3, 1.0, 1], [0, 1.0, 1]], 10, 0, 0);
    for (let k = 0; k < b.p.length; k += 3) { b.p[k] += x; b.p[k + 2] += z; }
    meshAdd(m, b, 1);
  }
  mBox(m, -0.9, 0.35, 0.3, 0.7, 0.7, 0.7, 1, 0.3); mBox(m, -0.8, 0.95, 0.35, 0.55, 0.5, 0.55, 1, -0.2);
  return m;
}
// a washing line 7 m long, hung with cloths
function meshLaundry() {
  rseed(620);
  const m = new Mesh(), sag = (x) => 0.35 * (x * x / 12.25 - 1);
  const pts = []; for (let i = 0; i <= 10; i++) { const x = -3.5 + i * 0.7; pts.push([x, sag(x), 0]); }
  m.tube(pts, 0.015, 3, false, () => 0);
  for (let x = -2.9; x < 2.7;) { const w = rr(0.4, 0.9), h = rr(0.5, 1.1); mRect(m, [x + w / 2, sag(x + w / 2) - h / 2, 0], [w / 2, 0, 0], [0, h / 2, 0.04], 0.25); x += w + rr(0.12, 0.4); }
  return m;
}
// a street lamp: post, bracket and lantern, all iron
function meshLamp() {
  const m = new Mesh();
  m.tube([[0, 0, 0], [0, 3.3, 0], [0, 3.6, 0.25], [0, 3.6, 0.55]], (k) => [0.07, 0.05, 0.04, 0.04][k], 6, false, () => 1);
  mBox(m, 0, 0.12, 0, 0.26, 0.24, 0.26, 1); mBox(m, 0, 3.32, 0.55, 0.26, 0.4, 0.26, 1); mBox(m, 0, 3.56, 0.55, 0.36, 0.06, 0.36, 1);
  return m;
}
// the fountain on the square: basin, stem and bowl; the water surfaces are tagged -1
function meshFountain() {
  const m = meshLathe([[0, 0, 1], [2.3, 0, 1], [2.3, 0.6, 1], [2.05, 0.65, 1], [2.0, 0.3, 1], [0.4, 0.3, 1], [0.3, 1.5, 1], [1.0, 1.75, 1], [1.05, 1.9, 1], [0.3, 1.85, 1], [0.18, 2.5, 1], [0, 2.6, 1]], 20, 0, 0);
  meshAdd(m, meshLathe([[0, 0.5, -1], [2.02, 0.5, -1]], 20, 0, 0)); meshAdd(m, meshLathe([[0.2, 1.84, -1], [1.0, 1.84, -1]], 16, 0, 0));
  return m;
}
// a small harbor light, 7.5 m: uses the lighthouse material (aux 1 masonry, 0 iron, -1 lamp)
function meshBeacon() {
  const m = meshLathe([[0, 0, 1], [1.5, 0, 1], [1.5, 0.5, 1], [1.05, 0.7, 1], [0.8, 5.2, 1], [1.2, 5.4, 0], [1.2, 5.55, 0], [0.55, 5.6, 0], [0.5, 5.7, -1], [0.5, 6.5, -1], [0.62, 6.6, 0], [0, 7.3, 0]], 14, 0, 0);
  return m;
}

// ---------------------------------------------------------------- the island itself
function makeLand() {
  const N1 = LN + 1, H = LH = new Float32Array(N1 * N1);
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) H[i + N1 * j] = landH0(LO + i * LC, LO + j * LC);
  const hAt = landY;
  const nAt = (x, z) => { const e = 1.6, nx = hAt(x - e, z) - hAt(x + e, z), nz = hAt(x, z - e) - hAt(x, z + e), l = hypot(nx, 2 * e, nz); return [nx / l, 2 * e / l, nz / l]; };
  // ---- ground mesh, quads grouped by culling cell
  const vb = new ArrayBuffer(N1 * N1 * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    const k = i + N1 * j, x = LO + i * LC, z = LO + j * LC, i0 = max(i - 1, 0), i1 = min(i + 1, LN), j0 = max(j - 1, 0), j1 = min(j + 1, LN);
    const nx = (H[i0 + N1 * j] - H[i1 + N1 * j]) / (i1 - i0), nz = (H[i + N1 * j0] - H[i + N1 * j1]) / (j1 - j0), l = hypot(nx, LC, nz);
    vf[k * 4] = x; vf[k * 4 + 1] = H[k]; vf[k * 4 + 2] = z;
    v8[k * 16 + 12] = round(nx / l * 127); v8[k * 16 + 13] = round(LC / l * 127); v8[k * 16 + 14] = round(nz / l * 127); v8[k * 16 + 15] = 127;
  }
  const nC = LCELLS * LCELLS, per = LN / LCELLS, start = new Uint32Array(nC + 1), lo = new Float32Array(nC).fill(1e9), hi = new Float32Array(nC).fill(-1e9), idx = [];
  for (let c = 0; c < nC; c++) {
    start[c] = idx.length / 6;
    const ci = c % LCELLS, cj = (c / LCELLS) | 0;
    for (let j = cj * per; j < (cj + 1) * per; j++) for (let i = ci * per; i < (ci + 1) * per; i++) {
      if (LO + (i + 1) * LC < 179 && LO + (j + 1) * LC < 179) continue;              // the voxel world has its own floor there
      const a = i + N1 * j, b = a + 1, d = a + N1, e = d + 1;
      idx.push(a, d, e, a, e, b);
      for (const k of [a, b, d, e]) { if (H[k] < lo[c]) lo[c] = H[k]; if (H[k] > hi[c]) hi[c] = H[k]; }
    }
  }
  start[nC] = idx.length / 6;

  // ---- the land map: r paving (1 cobbles, 0.5 dirt track), g crops, b surf at the shore, a height
  const MS = 1024, map = new Uint8Array(MS * MS * 4);
  const lane = (db, a) => { let d = 1e9; for (const l of LANES) d = min(d, abs(wrapA(a - l)) * db); return d; };
  const paved = (x, z) => {
    const [db, a] = bayPolar(x, z), tw = townW(db, a);
    let r = 0;
    if (tw > 0.3) {
      for (const k of RINGS) r = max(r, sstep(3.3, 2.5, abs(db - k[0])));
      if (db > 66 && db < 169) r = max(r, sstep(1.9, 1.3, lane(db, a)));
      r = max(r, sstep(72, 69, db));
      if (abs(a) < 0.2 && db < 88) r = 1;
      if (db < 172) r = max(r, sstep(0.47, 0.40, fbm(x * 0.07, 1, z * 0.07, 2)));   // paved yards between the houses, gardens where the noise leaves room
      r *= sstep(0.3, 0.6, tw);
    }
    if (db < 70 && abs(a) < 1.3) r = max(r, sstep(72, 69, db));
    let rd = 0; for (const P of ROADS) rd = max(rd, 0.5 * sstep(2.3, 1.2, polyD(x, z, P)));
    if (rd > 0) rd *= sstep(0.74, 0.88, nAt(x, z)[1]);                              // a track fades out where the ground is too steep to hold one
    return max(r, rd);
  };
  for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
    const x = LO + (i + 0.5) / MS * LS, z = LO + (j + 0.5) / MS * LS, h = hAt(x, z), o = (i + MS * j) * 4;
    let r = 0, g = 0;
    if (h > 0.2) {
      r = paved(x, z);
      const f = landF(x, z), th = atan2(z - ISLE[1], x - ISLE[0]);
      if (r < 0.2 && inField(x, z, f, th, h)) g = 1;
    }
    const [db] = bayPolar(x, z);
    map[o] = r * 255; map[o + 1] = g * 255;
    map[o + 2] = (h < 1 && h > -9 ? 0.85 * clamp(1 - abs(landF(x, z) - 0.3) / 1.7, 0, 1) : 0) * (1 - 0.85 * sstep(BAYR + 10, BAYR - 4, db)) * 255;   // surf: a band a few metres wide along the waterline
    map[o + 3] = clamp((h + 16) / 48, 0, 1) * 255;
  }

  // ---- everything standing on it
  const cells = new Map();   // mesh id -> per-cell instance arrays
  const cellOf = (x, z) => clamp(floor((x - LO) / LCW), 0, LCELLS - 1) + LCELLS * clamp(floor((z - LO) / LCW), 0, LCELLS - 1);
  const put = (mesh, x, y, z, sc, q, mat, seed, ts = 1, bob = 0) => {
    let L = cells.get(mesh); if (!L) cells.set(mesh, L = Array.from({ length: nC }, () => []));
    L[cellOf(x, z)].push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, ts, bob);
  };
  const yq = (a) => qAxis(0, 1, 0, a), face = (x, z, tx, tz) => atan2(tx - x, tz - z);
  const taken = [];   // footprints: x, z, radius
  const free = (x, z, r) => { for (const t of taken) if (hypot(x - t[0], z - t[1]) < r + t[2]) return false; return true; };
  const smoke = [];

  // houses: id, width, depth
  const HV = [[47, 6.5, 6.4], [48, 8.6, 7], [49, 5.4, 7.6], [50, 7, 7.4], [51, 10.5, 7.2], [52, 13, 8]];
  rseed(40);
  const house = (v, x, z, y, yaw, sc = 1) => {
    put(HV[v][0], x, y, z, sc, yq(yaw), 15, rnd()); taken.push([x, z, max(HV[v][1], HV[v][2]) * 0.55 * sc]);
    if (rnd() < 0.16) { const b = [rr(0.7, 1.1), rnd(), rr(0.4, 0.7), rr(5, 8), rr(0.4, 0.9)], top = [9.2, 10.6, 14.5, 12.5, 10.8, 9][v] * sc; for (let j = 0; j < 16; j++) smoke.push(x, y + top, z, b[0], b[1] + j / 16, b[2], b[3], b[4]); }
  };
  for (let k = 0; k < RINGS.length; k++) for (const side of k ? [1, -1] : [1]) {
    const R = RINGS[k][0], y = RINGS[k][1], sparse = k === RINGS.length - 1;
    for (let a = -1.0; a < 1.0;) {
      const u = rnd(), v = k === 0 ? (abs(a) > 0.66 ? 5 : u < 0.5 ? 2 : u < 0.85 ? 3 : 1) : k > 3 ? (u < 0.45 ? 0 : u < 0.8 ? 1 : 4) : (u < 0.3 ? 1 : u < 0.6 ? 2 : u < 0.75 ? 0 : u < 0.9 ? 3 : 4);
      const sc = rr(0.94, 1.1), W = HV[v][1] * sc, D = HV[v][2] * sc, rc = R + side * (3.4 + D / 2), wa = (W + rr(0.15, 1.2)) / rc, ac = a + wa / 2;
      const [x, z] = bayPt(rc, ac);
      let ok = townW(rc, ac) > 0.55 && landF(x, z) > 9 && !(sparse && (side < 0 || rnd() < 0.5));
      for (const l of LANES) if (abs(ac - l) * rc < W / 2 + 1.7) ok = false;
      if (k === 0 && abs(ac) < 0.21) ok = false;
      if (k === 1 && side < 0 && abs(ac) < 0.2) ok = false;
      if ((k === 3 && side > 0 || k === 4 && side < 0) && abs(ac - CHURCH[1]) < 0.11) ok = false;
      if (ok) for (const [u, w] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = bayPt(rc + w * D / 2, ac + u * W / 2 / rc); if (hAt(p[0], p[1]) < y - 4.6 || landF(p[0], p[1]) < 6) ok = false; }   // no house hangs over the shore
      if (!ok) { a += 0.03; continue; }
      house(v, x, z, y, face(x, z, BAY[0], BAY[1]) + (side < 0 ? PI : 0) + rr(-0.04, 0.04), sc);
      a += wa;
    }
  }
  // farmhouses among the fields and along the roads
  for (let i = 0; i < 400; i++) {
    const x = rr(250, 480), z = rr(190, 470), f = landF(x, z), [db, a] = bayPolar(x, z);
    if (f < 22 || townW(db, a) > 0.05 || hAt(x, z) > 46 || nAt(x, z)[1] < 0.972 || !free(x, z, 9)) continue;
    let near = 1e9; for (const P of ROADS) near = min(near, polyD(x, z, P));
    if (near > 16 || near < 5) continue;
    house(rnd() < 0.6 ? 0 : rnd() < 0.5 ? 1 : 4, x, z, hAt(x, z) - 0.25, rnd() * TAU, rr(0.95, 1.1));
  }
  // landmarks
  { const [x, z] = bayPt(TOWER, 0); put(53, x, RINGS[0][1], z, 1, yq(face(x, z, BAY[0], BAY[1])), 19, 0.2); taken.push([x, z, 6]); }
  { const [x, z] = bayPt(CHURCH[0], CHURCH[1]); put(54, x, RINGS[3][1], z, 1, yq(face(x, z, BAY[0], BAY[1])), 19, 0.8); taken.push([x, z, 12]); }
  const millY = hAt(KNOLL[0], KNOLL[1]), millA = face(KNOLL[0], KNOLL[1], 60, 60);
  put(55, KNOLL[0], millY, KNOLL[1], 1, yq(millA), 19, 0.2); taken.push([KNOLL[0], KNOLL[1], 12]);
  put(56, KNOLL[0] + sin(millA) * 3.15, millY + 10.4, KNOLL[1] + cos(millA) * 3.15, 1, yq(millA), 19, 0.2, 1, 1);

  // the harbor: quay wall with a flight of steps down to the water, two breakwaters, jetties
  const quay = new Mesh(), arc = (r, a0, a1, y, n = 40) => { const p = []; for (let i = 0; i <= n; i++) { const q = bayPt(r, mix(a0, a1, i / n)); p.push([q[0], y, q[1]]); } return p; };
  quay.sweep(arc(57.5, -1.32, 1.32, -2.9, 70), 5, 10.3, () => [0, 1, 0]);
  for (let j = 1; j <= 6; j++) quay.sweep(arc(55.3 - j * 0.55, -0.17, 0.17, (2.25 - j * 0.38 - 8) / 2, 12), 0.62, 2.25 - j * 0.38 + 8, () => [0, 1, 0]);
  const mouth = (t, o) => [255.5 - t * 76.4 - o * 0.707, 178.7 + t * 76.4 - o * 0.707];
  const BW = [[[0, -3], [0.15, 7], [0.3, 10], [0.4, 10]], [[1.03, -3], [0.88, 5], [0.78, 7]]].map((b) => b.map(([t, o]) => mouth(t, o)));
  for (const b of BW) {
    const pts = []; for (let i = 0; i < b.length - 1; i++) for (let s = 0; s < 6; s++) pts.push([mix(b[i][0], b[i + 1][0], s / 6), -5.6, mix(b[i][1], b[i + 1][1], s / 6)]);
    pts.push([b[b.length - 1][0], -5.6, b[b.length - 1][1]]);
    quay.sweep(pts, 4.6, 16, () => [0, 1, 0]);
    quay.sweep(pts.map((p) => [p[0] - 1.2, 2.75, p[2] - 1.2]), 0.7, 0.9, () => [0, 1, 0]);    // parapet on the seaward side
  }
  // garden walls: where no house fronts a street, a wall holds the bank above it and a parapet edges the drop below
  for (let k = 0; k < RINGS.length - 1; k++) for (const side of k ? [1, -1] : [1]) {
    const R = RINGS[k][0] + side * 3.15, y = RINGS[k][1]; let run = [];
    const flush = () => { if (run.length > 2) quay.sweep(run, 0.42, side > 0 ? 2.1 : 4.4, () => [0, 1, 0]); run = []; };
    for (let a = -1; a <= 1.001; a += 0.012) {
      const [x, z] = bayPt(R, a); let ok = townW(R, a) > 0.55 && landF(x, z) > 8 && !(k === 0 && abs(a) < 0.21);
      for (const l of LANES) if (abs(a - l) * R < 2.1) ok = false;
      for (const t of taken) if (hypot(x - t[0], z - t[1]) < t[2] * 1.05) ok = false;
      if (ok) run.push([x, side > 0 ? y + 0.05 : y - 1.3, z]); else flush();
    }
    flush();
  }
  for (let a = -1.25; a < 1.26; a += 0.11) if (abs(a) > 0.2) { const [x, z] = bayPt(55.6, a); mBox(quay, x, 2.5, z, 0.34, 0.55, 0.34, 1, a); }
  const piers = new Mesh(), boats = [];
  for (const [a, L] of [[-1.0, 15], [-0.55, 25], [0.55, 25], [1.0, 16]]) {
    const p0 = bayPt(55, a), p1 = bayPt(55 - L, a), dx = (p1[0] - p0[0]) / L, dz = (p1[1] - p0[1]) / L;
    piers.sweep([[p0[0], 1.42, p0[1]], [p1[0], 1.42, p1[1]]], 2.6, 0.22, () => [0, 1, 0]);
    for (let d = 2; d < L; d += 3.2) for (const s of [-1, 1]) piers.tube([[p0[0] + dx * d - dz * s * 1.2, -7, p0[1] + dz * d + dx * s * 1.2], [p0[0] + dx * d - dz * s * 1.2, 1.9, p0[1] + dz * d + dx * s * 1.2]], 0.15, 6, true, () => -0.25);
    for (let d = 5; d < L - 1; d += 8.5) for (const s of [-1, 1]) if (rnd() < 0.85) boats.push([p0[0] + dx * d - dz * s * 3.1, p0[1] + dz * d + dx * s * 3.1, atan2(-dz, dx) + (rnd() < 0.5 ? PI : 0) + rr(-0.08, 0.08)]);
  }
  for (const q of [quay, piers]) for (let k = 0; k < q.p.length; k += 3) { q.p[k] -= BAY[0]; q.p[k + 2] -= BAY[1]; }   // both are built in world coordinates and placed at the bay
  put(63, BAY[0], 0, BAY[1], 1, [0, 0, 0, 1], 16, 0.3); put(64, BAY[0], 0, BAY[1], 1, [0, 0, 0, 1], 18, 0.4);
  for (const b of boats) put(65, b[0], 0, b[1], rr(0.85, 1.15), yq(b[2]), 8, rnd(), 2, 0.05);
  for (const a of [-0.3, 0.32, 0.26]) { const [x, z] = bayPt(rr(46, 50), a); put(37, x, 0, z, 1, yq(rnd() * 6), 8, rnd(), 2, 0.06); }
  { const e = BW[0][3]; put(66, e[0], 2.4, e[1], 1, yq(0), 10, 0.5); const g = BW[1][2]; put(66, g[0], 2.4, g[1], 0.8, yq(1), 10, 0.5); }
  // rubble against the breakwaters, and boulders along the wild shore
  rseed(41);
  for (const b of BW) for (let i = 0; i < 70; i++) { const s = rnd() * (b.length - 1), k = floor(s), u = s - k, k1 = min(k + 1, b.length - 1), x = mix(b[k][0], b[k1][0], u) - rr(2.2, 5), z = mix(b[k][1], b[k1][1], u) - rr(2.2, 5), sc = rr(0.7, 1.9); put(rnd() * 4 | 0, x, rr(-3, 0.9) - sc * 0.3, z, sc, qRand(), 1, rnd()); }
  for (let i = 0; i < 9000; i++) {
    const a = rnd() * TAU, r = rr(120, 200), x = ISLE[0] + cos(a) * r, z = ISLE[1] + sin(a) * r, f = landF(x, z), [db, ba] = bayPolar(x, z);
    if (f < -5 || f > 3.5 || (db < 75 && abs(ba) < 1.5) || rnd() < 0.55 + 0.4 * sstep(0.42, 0.25, abs(wrapA(a + 0.96)))) continue;
    const sc = rr(0.5, 1.6) * (rnd() < 0.12 ? 2.2 : 1);
    put(rnd() * 4 | 0, x, hAt(x, z) + sc * 0.15, z, sc, qRand(), 1, rnd());
  }
  // the market on the square, barrels on the quay, washing over the lanes
  { const [x, z] = bayPt(66.5, 0); put(76, x, 2.25, z, 1, yq(0), 16, 0.5); taken.push([x, z, 3]); }
  for (let a = -1.2; a < 1.21; a += 0.2) if (abs(a) > 0.1) { const [x, z] = bayPt(61.2, a); put(75, x, 2.25, z, 1, yq(face(x, z, BAY[0], BAY[1])), 11, rnd()); }
  for (const l of LANES) for (let k = 1; k < 5; k++) { const [x, z] = bayPt(RINGS[k][0] - 2.4, l + 2.6 / RINGS[k][0]); put(75, x, RINGS[k][1], z, 1, yq(face(x, z, BAY[0], BAY[1])), 11, rnd()); }
  for (let i = 0; i < 8; i++) { const a = (i % 4 < 2 ? -1 : 1) * (0.085 + (i % 2) * 0.075), [x, z] = bayPt(i > 3 ? 69.8 : 63.2, a); put(67, x, 2.25, z, rr(0.9, 1.1), yq(face(x, z, BAY[0], BAY[1]) + (i > 3 ? PI : 0) + rr(-0.2, 0.2)), 18, rnd()); taken.push([x, z, 2]); }
  for (let i = 0; i < 26; i++) { const a = rr(-1.2, 1.2), [x, z] = bayPt(rr(60.5, 63), a); if (abs(a) > 0.22) put(68, x, 2.25, z, rr(0.9, 1.2), yq(rnd() * 6), 18, rnd()); }
  for (let k = 0; k < RINGS.length - 2; k++) for (const l of LANES) for (const off of [6, 13]) {
    if (rnd() < 0.45 || (l === 0 && k === 0)) continue;
    const r = RINGS[k][0] + off, [x, z] = bayPt(r, l);
    put(69, x, townLevel(r) + rr(4.6, 6.4), z, 1, yq(face(x, z, BAY[0], BAY[1])), 18, rnd());
  }

  // trees: broadleaf masses on the hills, pines on the headlands, cypress as accents, bushes everywhere
  rseed(42);
  const onRoad = (x, z) => { for (const P of ROADS) if (polyD(x, z, P) < 3.2) return true; return false; };
  const tree = (id, x, z, sc, ty, r) => { put(id, x, hAt(x, z) - 0.2, z, sc, yq(rnd() * TAU), 17, rnd(), ty); taken.push([x, z, r]); };
  tree(57, SUMMIT[0], SUMMIT[1], 4.2, 1, 6);                                          // the great camphor on the summit
  const NT = LV > 1 ? 1700 : 3200;
  for (let i = 0, made = 0; i < 150000 && made < NT; i++) {
    const x = rr(LO + 70, LO + LS - 70), z = rr(LO + 70, LO + LS - 70), f = landF(x, z);
    if (f < 7) continue;
    const [db, a] = bayPolar(x, z), tw = townW(db, a), th = atan2(z - ISLE[1], x - ISLE[0]), n = nAt(x, z), h = hAt(x, z);
    if (n[1] < 0.55 || inField(x, z, f, th, h) || onRoad(x, z) || hypot(x - SUMMIT[0], z - SUMMIT[1]) < 30) continue;
    const forest = sstep(0.36, 0.5, fbm(x * 0.013, 5, z * 0.013, 3)) * 0.8 + 0.2 + 0.6 * sstep(24, 50, h);
    if (tw > 0.3 ? rnd() > 0.012 : rnd() > forest) continue;
    const u = rnd(), sc = 0.55 + 1.35 * pow(rnd(), 1.6);
    if (f < 24 && tw < 0.3 && u < 0.5) { if (free(x, z, 3)) { tree(61, x, z, rr(0.8, 1.3), 2, 2.4); made++; } }
    else if (u < 0.1 || tw > 0.3) { if (free(x, z, 3.2)) { tree(59, x, z, tw > 0.3 ? rr(0.5, 0.8) : rr(0.7, 1.2), 3, 1.2); made++; } }
    else if (free(x, z, 1.9 * sc)) { tree(u < 0.55 ? 57 : 70, x, z, sc, 1, 1.9 * sc); made++; }
  }
  for (const P of ROADS.slice(1)) for (let i = 0; i < P.length - 1; i++) for (let t = 0.1; t < 1; t += 0.22) {   // cypresses along the roads
    const x = mix(P[i][0], P[i + 1][0], t) + rr(3.4, 4.4) * (rnd() < 0.5 ? 1 : -1), z = mix(P[i][1], P[i + 1][1], t) + rr(-1, 1);
    if (landF(x, z) > 8 && nAt(x, z)[1] > 0.86 && free(x, z, 2.6)) tree(59, x, z, rr(0.8, 1.3), 3, 1.1);
  }
  for (let i = 0; i < 40000; i++) {
    const x = rr(LO + 70, LO + LS - 70), z = rr(LO + 70, LO + LS - 70), f = landF(x, z);
    if (f < 3) continue;
    const [db, a] = bayPolar(x, z), n = nAt(x, z);
    if (townW(db, a) > 0.2 || n[1] < 0.7 || hAt(x, z) < 3.4 || onRoad(x, z) || rnd() > 0.09 || !free(x, z, 0.4)) continue;
    put(60, x, hAt(x, z) - 0.25, z, rr(0.5, 1.5), yq(rnd() * TAU), 17, rnd(), rnd() < 0.07 ? 4 : 1);
  }

  // ---- pack per mesh, sorted by culling cell
  const groups = [];
  for (const [id, L] of cells) {
    let n = 0; const st = new Uint32Array(nC + 1);
    for (let c = 0; c < nC; c++) { st[c] = n; n += L[c].length / 12; }
    st[nC] = n;
    const data = new Float32Array(n * 12), glo = new Float32Array(nC).fill(1e9), ghi = new Float32Array(nC).fill(-1e9);
    let k = 0;
    for (let c = 0; c < nC; c++) { const a = L[c]; for (let i = 0; i < a.length; i += 12) { for (let j = 0; j < 12; j++) data[k++] = a[i + j]; glo[c] = min(glo[c], a[i + 1] - 8); ghi[c] = max(ghi[c], a[i + 1] + 45); } }
    groups.push({ id, data, n, start: st, lo: glo, hi: ghi, mar: id === 63 || id === 64 ? 80 : 14, veg: id < 4 || id === 60 });
  }
  const tr = (sd, o) => [meshTree(sd, LV > 1 ? 1 : 2, o), meshTree(sd, 1, o), meshTree(sd, 0, o)];   // three levels of detail
  const t1 = tr(1, {}), t2 = tr(2, { h: 4.6, r: 3.5, n: 10 }), pine = tr(3, { h: 7.6, r: 3.2, sq: 0.42, flat: 1, n: 7, tr: 0.8 });
  const meshes = [
    meshHouse(1, 6.5, 6.4, 1, true, 0.84, { tall: 0.5, chim: 1 }).build(), meshHouse(2, 8.6, 7, 2, true, 0.74, { chim: 2, dormers: 2 }).build(),
    meshHouse(3, 5.4, 7.6, 3, false, 0.98, { chim: 1, sides: 2 }).build(), meshHouse(4, 7, 7.4, 2, false, 0.82, { chim: 1, shop: 1, sides: 2 }).build(),
    meshHouse(5, 10.5, 7.2, 2, true, 0.78, { chim: 2, dormers: 3 }).build(), meshHouse(6, 13, 8, 1, true, 0.56, { tall: 1.6, chim: 0, doors: 1, shut: false, sides: 0 }).build(),
    meshClockTower().build(), meshChurch().build(), meshMill().build(), meshSailsMill().build(),
    t1[0], t1[1], meshCypress().build(), meshTree(9, LV > 1 ? 0 : 1, { h: 0.5, r: 1.3, n: 4, sq: 0.7 }), pine[0], pine[1],
    quay.build(), piers.build(), meshBoat(3.3, 1.25, 0.45, 0.6, { bow: 0.5, stern: 0.2, keel: 0.3 }).build(), meshBeacon().build(),
    meshStall().build(), meshBarrels().build(), meshLaundry().build(), t2[0], t2[1], t1[2], pine[2], t2[2], meshLamp().build(), meshFountain().build(),
  ];
  return { vb, ib: new Uint32Array(idx), start, lo, hi, map, groups, meshes, smoke: new Float32Array(smoke), mill: [KNOLL[0], millY + 10, KNOLL[1]] };
}
// trees: near mesh -> [the mesh drawn beyond LOD1 metres, the one beyond LOD2]; both distances shrink with the draw-distance scale
const LANDLOD = { 57: [58, 72], 61: [62, 73], 70: [71, 74] }, LOD1 = 75, LOD2 = 230;
