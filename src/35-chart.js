// ============================================================================
// The chart on the menu page: the reef and the island drawn as a pen sketch from the world's own data
// ============================================================================
// Map x is world x, map y is world -z (north up). Every line is jittered and drawn twice, a little apart, so it
// reads as pen on paper; strokes carry pathLength 1 so CSS can ink them in, one after another, while the world loads.
let onPick = null;                                   // set by the menu code: start the dive at viewpoint i
{
  const svg = document.getElementById('chart'), NS = 'http://www.w3.org/2000/svg';
  svg.setAttribute('viewBox', '-200 -525 725 725');
  const jit = (k) => { const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - floor(v) - 0.5; };
  let seq = 0;
  const el = (tag, at, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); parent.appendChild(e); return e; };
  // a smooth path through the points (x, z pairs in world units), with hand wobble of amplitude w
  const pathD = (pts, w, closed, salt) => {
    const P = pts.map((p, i) => [p[0] + jit(i * 3.1 + salt) * w, -p[1] + jit(i * 7.7 + salt) * w]);
    if (closed) P.push(P[0], P[1]);
    let d = `M${((P[0][0] + P[1][0]) / 2).toFixed(1)} ${((P[0][1] + P[1][1]) / 2).toFixed(1)}`;
    for (let i = 1; i < P.length - 1; i++) d += `Q${P[i][0].toFixed(1)} ${P[i][1].toFixed(1)} ${((P[i][0] + P[i + 1][0]) / 2).toFixed(1)} ${((P[i][1] + P[i + 1][1]) / 2).toFixed(1)}`;
    if (!closed) d += `L${P[P.length - 1][0].toFixed(1)} ${P[P.length - 1][1].toFixed(1)}`;
    return d;
  };
  // ink a line (twice, slightly apart), optionally with a watercolour fill underneath
  const pen = (pts, o = {}) => {
    const d = o.d ?? (seq += 0.05);
    if (o.fill) el('path', { d: pathD(pts, (o.w ?? 2) * 2.5, o.closed, seq * 31), fill: o.fill, class: 'fill', filter: 'url(#wash)', style: `--d:${d}` });
    for (let k = 0; k < (o.once ? 1 : 2); k++) el('path', { d: pathD(pts, o.w ?? 2, o.closed, seq * 17 + k * 5), class: 'ink', pathLength: 1,
      style: `--d:${d + k * 0.25};stroke-width:${(o.sw ?? 1.6) * (k ? 0.6 : 1)};opacity:${k ? 0.45 : 0.9}${o.dash ? ';stroke-dasharray:' + o.dash : ''}` });
  };
  const circ = (cx, cz, r, n = 48) => Array.from({ length: n }, (_, i) => [cx + cos(i / n * TAU) * r, cz + sin(i / n * TAU) * r]);
  const label = (x, z, t, size, d, rot = 0, anchor = 'middle') => { const e = el('text', { x, y: -z, 'font-size': size, 'text-anchor': anchor, transform: `rotate(${rot} ${x} ${-z})`, style: `--d:${d}` }); e.textContent = t; };

  // the sea and the lagoon: washes first, then the reef ring as a broken, hatched line
  el('circle', { cx: 0, cy: 0, r: 182, fill: '#5fb3bd', 'fill-opacity': 0.32, class: 'fill', filter: 'url(#wash)', style: '--d:0' });
  el('circle', { cx: 0, cy: 0, r: 148, fill: '#9fd8d2', 'fill-opacity': 0.45, class: 'fill', filter: 'url(#wash)', style: '--d:.1' });
  pen(circ(0, 0, 162, 72), { w: 3, closed: true, sw: 1.3, dash: '.012 .008', d: 0.15 });
  pen(circ(0, 0, 172, 72), { w: 4, closed: true, sw: 0.8, dash: '.004 .01', d: 0.3, once: true });
  // rock that stands out of the water: the islet and the sea stacks
  for (const m of MESAS) if (m[5] > 0) {
    const r = m[4] * (m[5] > 6 ? 1.2 : 1.6), cx = (m[0] + m[2]) / 2, cz = (m[1] + m[3]) / 2;
    pen(circ(cx, cz, r + hypot(m[2] - m[0], m[3] - m[1]) / 2, 10), { w: 2.5, closed: true, fill: '#b8a88c', sw: 1.4 });
  }
  // the island: its shoreline found by walking out from its middle until the land function says sea
  const shore = [];
  for (let i = 0; i < 120; i++) {
    const a = i / 120 * TAU; let r = 20;
    while (r < 280 && landF(ISLE[0] + cos(a) * r, ISLE[1] + sin(a) * r) > 0) r += 2;
    shore.push([ISLE[0] + cos(a) * r, ISLE[1] + sin(a) * r]);
  }
  pen(shore, { w: 2.5, closed: true, fill: '#9cba6a', sw: 2, d: 0.6 });
  el('path', { d: pathD(shore, 6, true, 3), fill: 'none', stroke: '#5fb3bd', 'stroke-width': 9, 'stroke-opacity': 0.35, class: 'fill', filter: 'url(#wash)', style: '--d:.6' });
  // the hill: three contour rings and a few hachures, darker wash on the woods
  el('circle', { cx: SUMMIT[0], cy: -SUMMIT[1], r: 70, fill: '#4f7f45', 'fill-opacity': 0.45, class: 'fill', filter: 'url(#wash)', style: '--d:.9' });
  for (const r of [16, 34, 54]) pen(circ(SUMMIT[0], SUMMIT[1], r, 26), { w: 3, closed: true, sw: 0.9, d: 0.95 + r / 200, once: true });
  // woods as dabs of green round the hill, farmland as rows of pencil hatching
  let dabs = '';
  for (let i = 0; i < 140; i++) {
    const a = jit(i * 1.7) * TAU + PI, r = 18 + (jit(i * 5.3) + 0.5) * 70, x = SUMMIT[0] + cos(a) * r, z = SUMMIT[1] + sin(a) * r * 1.1, q = 4 + (jit(i * 9.1) + 0.5) * 3;
    if (landF(x, z) < 12 || hypot(x - BAY[0], z - BAY[1]) < 150) continue;
    dabs += `M${(x - q).toFixed(1)} ${(-z).toFixed(1)}a${q.toFixed(1)} ${(q * 0.85).toFixed(1)} 0 1 0 ${(2 * q).toFixed(1)} 0a${q.toFixed(1)} ${(q * 0.85).toFixed(1)} 0 1 0 ${(-2 * q).toFixed(1)} 0`;
  }
  el('path', { d: dabs, fill: '#4f7f45', 'fill-opacity': 0.7, stroke: '#2b3442', 'stroke-width': 0.7, 'stroke-opacity': 0.6, class: 'fill', style: '--d:1.05' });
  for (let k = 0; k < 4; k++) for (let j = 0; j < 5; j++) {
    const a = -0.38 + k * 0.17, r = 70 + j * 13, x0 = ISLE[0] + cos(a) * r, z0 = ISLE[1] + sin(a) * r, t = [-sin(a), cos(a)];
    if (landF(x0, z0) < 20) continue;
    pen([[x0 - t[0] * 9, z0 - t[1] * 9], [x0 + t[0] * 9, z0 + t[1] * 9]], { w: 0.4, sw: 0.9, d: 1.1 + k * 0.03, once: true });
  }
  // the town: rows of roofs along its streets, the harbor wall and breakwaters
  let roofs = '';
  for (let k = 0; k < RINGS.length; k++) for (let a = -0.85; a <= 0.86; a += 0.11 + 0.02 * k) {
    if (LANES.some((l) => abs(a - l) < 0.04)) continue;
    const [x, z] = bayPt(RINGS[k][0] + 4, a + jit(k * 9 + a * 40) * 0.03), s = 4.2 + jit(a * 77 + k) * 1.2;
    roofs += `M${(x - s / 2).toFixed(1)} ${(-z - s / 2).toFixed(1)}h${s.toFixed(1)}v${s.toFixed(1)}h${(-s).toFixed(1)}z`;
  }
  el('path', { d: roofs, fill: '#c8613c', 'fill-opacity': 0.85, stroke: '#2b3442', 'stroke-width': 0.6, class: 'fill', style: '--d:1.3' });
  const arc = (r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => bayPt(r, mix(a0, a1, i / n)));
  pen(arc(57, -1.3, 1.3), { w: 1, sw: 2.2, d: 1.2 });
  const mouth = (t, o) => [255.5 - t * 76.4 - o * 0.707, 178.7 + t * 76.4 - o * 0.707];   // as laid out in 17-land.js
  pen([[0, -3], [0.15, 7], [0.3, 10], [0.4, 10]].map(([t, o]) => mouth(t, o)), { w: 1, sw: 2.6, d: 1.25 });
  pen([[1.03, -3], [0.88, 5], [0.78, 7]].map(([t, o]) => mouth(t, o)), { w: 1, sw: 2.6, d: 1.25 });
  // landmarks: the clock tower, the windmill, the lighthouse; a few cypress dabs along the roads
  { const [x, z] = bayPt(TOWER, 0); el('rect', { x: x - 3, y: -z - 3, width: 6, height: 6, fill: '#6fa596', stroke: '#2b3442', 'stroke-width': 1, class: 'fill', style: '--d:1.4' }); }
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + 0.4; pen([[KNOLL[0], KNOLL[1]], [KNOLL[0] + cos(a) * 9, KNOLL[1] + sin(a) * 9]], { w: 0.4, sw: 1.4, d: 1.5, once: true }); }
  el('rect', { x: LAMP[0] - 3, y: -LAMP[1] - 7, width: 6, height: 14, rx: 1.5, fill: '#fffaf0', stroke: '#c8613c', 'stroke-width': 1.6, class: 'fill', style: '--d:.5' });
  // wave marks in the open sea, and a sail far out
  for (const [x, z] of [[-170, 330], [-60, 280], [40, 400], [150, -150], [260, -60], [420, 60], [-180, -60], [480, 180], [-40, 470], [100, 250], [380, -150]]) pen([[x - 12, z], [x - 6, z + 4], [x, z], [x + 6, z + 4], [x + 12, z]], { w: 0.6, sw: 1.1, d: 0.3 + jit(x) * 0.4 + 0.2, once: true });
  { const x = 450, z = 20; pen([[x - 10, z], [x + 10, z], [x + 6, z - 4], [x - 7, z - 4], [x - 10, z]], { w: 0.4, sw: 1.2, d: 1.7, once: true }); pen([[x, z], [x, z + 18], [x + 9, z + 1]], { w: 0.3, sw: 1, d: 1.75, once: true }); }
  // the anchored ketch, a passing whale's tail and a compass rose
  { const [x, z] = KETCH; pen([[x - 9, z - 1], [x + 9, z - 1], [x + 6, z - 4], [x - 7, z - 4], [x - 9, z - 1]], { w: 0.5, sw: 1.3, d: 0.7, once: true }); pen([[x, z - 1], [x, z + 13], [x + 7, z]], { w: 0.4, sw: 1.1, d: 0.75, once: true }); }
  pen([[-128, 222], [-122, 214], [-116, 222]], { w: 0.6, sw: 1.5, d: 1.6, once: true });
  pen([[-122, 214], [-122, 206]], { w: 0.4, sw: 1.5, d: 1.65, once: true });
  for (let i = 0; i < 3; i++) pen([[-140 + i * 9, 200], [-136 + i * 9, 202], [-132 + i * 9, 200]], { w: 0.3, sw: 1, d: 1.7, once: true });
  { const cx = -150, cz = 470; pen(circ(cx, cz, 26, 20), { w: 1.2, closed: true, sw: 1, d: 1.8, once: true });
    pen([[cx, cz - 34], [cx, cz + 38]], { w: 0.4, sw: 1.2, d: 1.85, once: true }); pen([[cx - 34, cz], [cx + 34, cz]], { w: 0.4, sw: 1.2, d: 1.9, once: true });
    label(cx, cz + 50, 'N', 22, 1.95); }
  label(330, 120, 'Port Amaro', 30, 1.5, -8);
  label(70, -95, 'the lagoon', 22, 0.5, -6);
  label(70, 140, 'Lantern Rock', 18, 0.6, -14);
  label(-150, -150, 'reef', 18, 0.4, 40);
  // the viewpoints, numbered as on the keyboard; pick one to start there
  // Several viewpoints lie close together in the lagoon: the pins push each other apart and keep a leader line to their spot
  const cap = document.getElementById('cap'), cap0 = cap.textContent, R = 19;
  const at = POSES.map((p) => [p[0], -p[2]]), pos = at.map((q) => q.slice());
  for (let it = 0; it < 120; it++) for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) if (i !== j) {
      let dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1]; const d = hypot(dx, dy) || 1, o = 2.3 * R - d;
      if (o > 0) { pos[i][0] += dx / d * o * 0.4; pos[i][1] += dy / d * o * 0.4; }
    }
    if (it < 60) { pos[i][0] += (at[i][0] - pos[i][0]) * 0.01; pos[i][1] += (at[i][1] - pos[i][1]) * 0.01; }
  }
  POSES.forEach((p, i) => {
    if (hypot(pos[i][0] - at[i][0], pos[i][1] - at[i][1]) > R * 0.8) {
      el('path', { d: `M${at[i][0].toFixed(1)} ${at[i][1].toFixed(1)}L${pos[i][0].toFixed(1)} ${pos[i][1].toFixed(1)}`, class: 'ink', pathLength: 1, style: `--d:${1.9 + i * 0.08};stroke:#c8613c;stroke-width:1.2` });
      el('circle', { cx: at[i][0], cy: at[i][1], r: 2.6, fill: '#c8613c', class: 'fill', style: `--d:${1.9 + i * 0.08}` });
    }
    const g = el('g', { class: 'pin', tabindex: 0, role: 'button', 'aria-label': `${(i + 1) % 10} ${p[7]}`, style: `--d:${2 + i * 0.08}` });
    el('circle', { cx: pos[i][0], cy: pos[i][1], r: R }, g);
    const t = el('text', { x: pos[i][0], y: pos[i][1] + 1.5, 'font-size': 24 }, g); t.textContent = (i + 1) % 10;
    const show = () => { cap.textContent = `${(i + 1) % 10} · ${p[7]} — ${p[8]}`; }, hide = () => { cap.textContent = cap0; };
    g.addEventListener('pointerenter', show); g.addEventListener('pointerleave', hide); g.addEventListener('focus', show); g.addEventListener('blur', hide);
    g.addEventListener('click', () => onPick && onPick(i));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick && onPick(i); } });
  });
}
