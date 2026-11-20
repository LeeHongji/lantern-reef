// ============================================================================
// WGSL: everything drawn into the scene target
// ============================================================================
// Rule for every fragment shader here: take all textureSample() calls (the ones that need derivatives) at the top,
// before any branch on a varying. WGSL rejects them in non-uniform control flow.

// ---------------------------------------------------------------- shared: uniforms, water optics, sky
const S_G = /*wgsl*/`
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f, ex: vec4f, sm2: mat4x4f };
// cam.w time | right.w, up.w tan of the half field of view | fwd.w near | sun.w zone at the camera (0 open sea, 1 grotto)
// res w, h, 1/w, 1/h | mis exposure, shaft strength, draw-distance scale, wet lens | ex.x 1 while the camera is under water
// sm is the shadow matrix of the atoll, sm2 of the island
const SIG = vec3f(.058, .0235, .0195);  // extinction per metre: red dies first, so distance turns everything blue-green
const KD = vec3f(.056, .0245, .0170);   // how fast daylight fades with depth
const WCOL = vec3f(.16, .58, .90);      // colour of open water
const KDZ = vec3f(.034, .023, .018);
const PCOL = vec3f(.58, .66, .98);      // colour of the water in the grotto
const SUNC = vec3f(1.7, 1.6, 1.45);
const HAZE = vec3f(.74, .90, 1.06);     // air between the camera and distant cliffs
const AIRK = vec3f(.00024, .00031, .00042);
const TAU = 6.2831853;
const WORLD = ${WX}.;
const LOW = ${LV > 1};
const MED = ${LV > 0};
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn hs(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn kd(z: f32) -> vec3f { return mix(KD, KDZ, z); }
fn sg(z: f32) -> vec3f { return mix(SIG, vec3f(.034, .026, .022), z); }
fn fin(c: vec3f) -> vec4f { return vec4f(min(max(c, vec3f(0.)), vec3f(40.)), 1.); }
const KDF = vec3f(.043, .045, .042);
// Light scattered into a ray of length d through water whose ambient light falls off with depth, in closed form:
// the integral of exp(-sigma t) * exp(k (ro.y + rd.y t)) dt.
fn fogIn(ro: vec3f, rd: vec3f, d: f32, z: f32, sun: vec3f) -> vec3f {
  let k = mix(KD, KDF, z);
  let a = sg(z) - k * rd.y;
  let I = (1. - exp(-a * d)) / a;
  let mu = max(dot(rd, sun), 0.);
  let m2 = mu * mu;
  return mix(WCOL, PCOL, z) * sg(z) * exp(k * min(ro.y, 0.)) * I * (1.22 + .3 * m2 * m2);
}
fn air(c: vec3f, d: f32) -> vec3f { let T = exp(-d * AIRK); return c * T + HAZE * (1. - T); }
`;

const S_B = S_G + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sC: sampler;
@group(0) @binding(3) var sS: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tW: texture_2d<f32>;
@group(0) @binding(6) var tD: texture_2d<f32>;
@group(0) @binding(7) var tV: texture_3d<f32>;
@group(0) @binding(8) var tM: texture_2d<f32>;
@group(0) @binding(9) var tSh2: texture_depth_2d;
@group(0) @binding(10) var tL: texture_2d<f32>;
// Two shadow maps: one over the atoll, one over the island. A point north or east of the voxel grid belongs to the island.
fn shUV(p: vec3f) -> vec4f {
  if (max(p.x, p.z) > 180.) { let s = g.sm2 * vec4f(p, 1.); return vec4f(s.x * .5 + .5, .5 - s.y * .5, s.z - .0005, 1.); }
  let s = g.sm * vec4f(p, 1.); return vec4f(s.x * .5 + .5, .5 - s.y * .5, s.z - .0007, 0.);
}
fn shT(s: vec4f, o: vec2f) -> f32 {
  if (max(abs(s.x - .5), abs(s.y - .5)) > .499) { return 1.; }                 // beyond either map: open sky
  if (s.w > .5) { return textureSampleCompareLevel(tSh2, sS, s.xy + o, s.z); }
  return textureSampleCompareLevel(tSh, sS, s.xy + o, s.z);
}
fn shadow1(p: vec3f) -> f32 { return shT(shUV(p), vec2f(0.)); }
fn shadow4(p: vec3f) -> f32 {
  let s = shUV(p); let e = 1.8 / ${SHADOW}.;
  return (shT(s, vec2f(-e, -e)) + shT(s, vec2f(e, -e)) + shT(s, vec2f(-e, e)) + shT(s, vec2f(e, e))) * .25;
}
fn shadow9(p: vec3f) -> f32 {
  if (LOW) { return shadow1(p); }
  if (MED) { return shadow4(p); }
  let s = shUV(p); let e = 2.1 / ${SHADOW}.; var a = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { a += shT(s, vec2f(f32(x), f32(y)) * e); } }
  return a / 9.;
}
// the island's land map: r paving, g crops, b surf at the shore, a height (-16..32 m); nothing outside its square
fn lmap(p: vec3f) -> vec4f {
  let q = (p.xz - ${LO}.) / ${LS}.;
  return textureSampleLevel(tL, sC, q, 0.) * step(max(abs(q.x - .5), abs(q.y - .5)), .5);
}
// caustics: the water texture projected down the sun direction, with a little colour fringing; washed out with distance
fn cuv(p: vec3f) -> vec2f { return p.xz - g.sun.xz * (p.y / g.sun.y); }
fn caus(p: vec3f, d: f32) -> vec3f {
  let q = cuv(p);
  let o = vec2f(.004, .0025);
  let a = vec3f(textureSample(tW, sR, q / 3.3 + o).r, textureSample(tW, sR, q / 3.3).r, textureSample(tW, sR, q / 3.3 - o).r);
  let b = textureSample(tW, sR, q.yx / 6.9 + .37).r;
  let c = min(pow(a, vec3f(2.3)) * 5. * (.45 + b * 1.3), vec3f(4.));
  let sharp = 1. - ss(-18., -52., p.y) * .55;                       // softer in deep water
  return mix(mix(vec3f(.33), c, sharp), vec3f(.33), ss(35., 100., d));
}
fn caus2(p: vec3f, d: f32) -> f32 {
  let q = cuv(p);
  let c = min(pow(textureSample(tW, sR, q / 4.1).r, 1.4) * 2.6 * (.45 + textureSample(tW, sR, q.yx / 6.9 + .37).r * 1.3), 2.6);
  return mix(c, .33, ss(35., 100., d));
}
// sunlight reaching height y: full in air, absorbed along its slanted path under water
fn sunE(y: f32, z: f32) -> vec3f {
  if (y > 0.) { return SUNC * 1.25; }
  return SUNC * exp(kd(z) * (y / g.sun.y)) * (.5 + .5 * sat(-y / 30.));
}
// r openness (0.5 at the rock surface, 1 in open water), g skylight reaching the point
fn vol(p: vec3f) -> vec4f {
  let q = (p - vec3f(${OX}., ${OY}., ${OZ}.)) / vec3f(${WX}., ${WY}., ${WX}.);
  return mix(textureSampleLevel(tV, sC, q, 0.), vec4f(1.), max(step(.5, max(abs(q.x - .5), abs(q.z - .5))), ss(.97, 1.02, q.y)));   // beyond the voxel grid: open air or open water
}
fn amb(p: vec3f, n: vec3f, sky: f32, z: f32) -> vec3f {
  let up = n.y * .5 + .5;
  if (p.y > 0.) { return mix(vec3f(.36, .33, .36), vec3f(.60, .74, 1.16), up * up) * (.35 + .65 * sky); }   // shade is never grey: sky blue from above, warm bounce from below
  return mix(vec3f(.22, .60, .80), vec3f(.34, .56, .82), z) * exp(kd(z) * p.y * 1.2) * (.3 + .7 * sky) * (.24 + .76 * up * up) * 1.3 * (.55 + .45 * sat(-p.y / 30.)) + vec3f(.003, .010, .016);
}
fn zone(p: vec3f) -> f32 { return mix(g.sun.w, textureSampleLevel(tM, sC, p.xz / WORLD + .5, 0.).b, .2); }
// light arriving sideways through open water
fn side(p: vec3f, n: vec3f, open: f32, z: f32) -> vec3f {
  if (p.y > 0.) { return vec3f(0.); }
  return mix(WCOL, PCOL, z) * exp(kd(z) * p.y) * open * (1. - abs(n.y)) * .7;
}
fn seaFog(c: vec3f, ro: vec3f, rd: vec3f, d: f32, z: f32) -> vec3f {
  // in open water the haze is nearly uniform; inside the grotto it follows the skylight, so the cave stays dark away from its openings
  let fl = mix(.58, .10, z);
  return c * exp(-sg(z) * d) * ss(230., 185., d) + fogIn(ro, rd, d, z, g.sun.xyz) * (fl + (1. - fl) * vol(ro + rd * min(d, 150.)).g);
}
// Everything between the camera and wp: water, air, or both when the ray crosses the surface.
fn fog(c: vec3f, wp: vec3f, z: f32) -> vec3f {
  let v = wp - g.cam.xyz; let d = length(v); let rd = v / d; let cy = g.cam.y;
  if (cy <= 0. && wp.y <= 0.) { return seaFog(c, g.cam.xyz, rd, d, z); }
  if (cy > 0. && wp.y > 0.) { return air(c, d); }
  let ts = cy / (cy - wp.y) * d;
  if (cy > 0.) { return air(seaFog(c, g.cam.xyz + rd * ts, rd, d - ts, z), ts); }
  return seaFog(air(c, d - ts), g.cam.xyz, rd, ts, z);
}
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
// the sky: gradient, sun glow and disc, one drifting cloud layer
fn sq2(x: f32) -> f32 { return x * x; }
fn skyCol(rd: vec3f) -> vec3f { return skyC(rd, 1.); }
// Summer cumulus standing on the horizon, shaped the way a background painter would: a level base, a crown of
// rounded heaps, a hard sunlit edge and blue-violet shade. Built from azimuth and elevation, so it never moves closer.
fn cumulus(rd: vec3f, mu: f32) -> vec4f {
  let az = atan2(rd.z, rd.x) / TAU; let el = rd.y; let t = g.cam.w * .0005;
  let p1 = textureSampleLevel(tD, sR, vec2f(az * 2. + t, .21), 0.).a; let p2 = textureSampleLevel(tD, sR, vec2f(az * 5. - t * 1.6, .63), 0.).a;
  let top = .026 + .23 * ss(.36, .74, p1) * (.35 + 1.3 * p2) + .04 * p2;              // a few tall towers, lower heaps between them
  // heaps: rounded cells with creases between them, at two sizes
  let b1 = abs(textureSampleLevel(tD, sR, vec2f(az * 9. + t * 2., el * 1.7 + .1), 2.).a * 2. - 1.);
  let b2 = abs(textureSampleLevel(tD, sR, vec2f(az * 27. + t * 3., el * 5. + .4), 1.).a * 2. - 1.);
  let lump = (b1 - .3) * .11 + (b2 - .3) * .035;
  let f = top - el + lump * ss(.0, .05, el);
  let a = ss(0., .008, f) * ss(.004, .02, el);
  let hg = sat(el / max(top, .02));
  let lit = .10 + .50 * hg + b1 * .75 + b2 * .28 + ss(.035, .0, f) * .30;              // tops and the crowns of the heaps catch the sun
  var c = mix(vec3f(.52, .58, .86), vec3f(.84, .88, 1.02), ss(.30, .50, lit));
  c = mix(c, vec3f(1.22, 1.19, 1.10), ss(.58, .72, lit));
  c = mix(vec3f(.62, .80, .95) * 1.3, c * (1.08 + .25 * mu), ss(.0, .06, el));         // their feet dissolve into the haze
  return vec4f(c, a);
}
// cl scales the cloud layer: reflections in the sea use a faint one, or every cloud becomes a white smear on the water
fn skyC(rd: vec3f, cl: f32) -> vec3f {
  let y = max(rd.y, 0.);
  var c = mix(vec3f(.60, .82, .94), mix(vec3f(.22, .54, .88), vec3f(.065, .25, .70), ss(.12, .8, y)), ss(.0, .22, y)) * 1.35;
  let mu = max(dot(rd, g.sun.xyz), 0.);
  c += vec3f(1., .82, .58) * (pow(mu, 6.) * .22 + pow(mu, 60.) * .6);
  let uv = rd.xz / (y + .16); let t = g.cam.w;
  let a = textureSampleLevel(tD, sR, uv * .055 + vec2f(t * .0011, t * .0005), 0.).a;
  let b = textureSampleLevel(tD, sR, uv.yx * .16 + vec2f(-t * .0017, t * .0009) + .3, 0.).a;
  let e = textureSampleLevel(tD, sR, uv * .47 + vec2f(t * .0026, -t * .0012) + .7, 0.);
  let e2 = textureSampleLevel(tD, sR, uv.yx * 1.31 + vec2f(t * .004, t * .002), 0.).a;
  let nz = a * .52 + b * .28 + e.a * .14 + e2 * .06;
  // cumulus: a firm edge, bright where the sun reaches, grey-blue in the thick middle and on the side away from it
  // fair-weather cumulus: few, firm-edged, white where the sun reaches and blue-violet underneath
  let hp = abs(e.a * 2. - 1.) * .05 + abs(e2 * 2. - 1.) * .02;
  var dn = ss(.556, .574, a * .62 + b * .30 + hp + .012) * ss(.10, .30, y) * cl;
  let shade = ss(.59, .69, a * .62 + b * .30 + hp * .4) * (1. - .4 * mu) + (.5 - e.a) * .5;
  var cc = mix(vec3f(1.22, 1.19, 1.10), vec3f(.84, .88, 1.02), ss(.15, .40, shade));
  cc = mix(cc, vec3f(.52, .58, .86), ss(.50, .75, shade));
  c = mix(c, cc * (1.1 + .4 * mu), dn * .97);
  let cu = cumulus(rd, mu);
  c = mix(c, cu.rgb, cu.a * cl * cl); dn = max(dn, cu.a * cl);        // squared: the sea mirrors the blue between the towers, not white blots
  return c + vec3f(1., .96, .88) * ss(.9996, .99985, mu) * 30. * (1. - dn) * cl * cl;   // the sea gets a soft glint, not the disc itself
}
`;

// ---------------------------------------------------------------- solid meshes: terrain, rocks, set pieces, reef life
// Instance: a = position + scale, b = rotation quaternion, c = material, seed, texture scale / fade distance, bob.
// Materials: 0 terrain, 1 loose rock, 2 fluke stone, 3 wreck timber, 4 sponge, 5 coral, 6 crystal, 7 marble,
// 8 painted hull, 9 sailcloth, 10 lighthouse, 11 iron, 12 starfish and urchins, 13 buoy, 14 the island's ground,
// 15 houses, 16 harbor masonry, 17 trees, 18 timber and cloth, 19 landmarks (clock tower, church, windmill).
// Houses, timber and landmarks carry a part tag in the vertex aux (see 17-land.js); the palette is in sRGB hex, as
// read off painted backgrounds, converted when the shader is built.
const W_SOLID = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) on: vec3f,
  @location(4) @interpolate(flat) m: vec4f, @location(5) @interpolate(flat) q: vec4f, @location(6) ao: f32, @location(7) lp: vec3f };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  var sc = i.a.w;
  // loose rock shrinks away at its draw distance instead of popping (never in the shadow pass, where res.x is 0)
  if (i.c.x < 1.5 && i.c.z > 1.5 && g.res.x > 0.) { sc *= 1. - ss(i.c.z * .7, i.c.z, distance(i.a.xyz, g.cam.xyz) / g.mis.z); }
  var l = i.p * sc;
  let t = g.cam.w;
  let mt = i32(i.c.x + .5);
  let afloat = mt == 8 || mt == 9 || mt == 13;
  var nl = i.n.xyz;
  if (mt == 19 && i.c.w > .5) {                              // windmill sails turn about their axle
    let a = t * .5; let cs = cos(a); let sn = sin(a);
    l = vec3f(l.x * cs - l.y * sn, l.x * sn + l.y * cs, l.z); nl = vec3f(nl.x * cs - nl.y * sn, nl.x * sn + nl.y * cs, nl.z);
  }
  if (mt == 17) { let k = max(l.y - 1.5, 0.) * .012; l.x += sin(t * 1.2 + i.a.x * .31 + l.y * .2) * k; l.z += cos(t * .9 + i.a.z * .27 + l.y * .17) * k; }   // crowns sway
  if (mt == 18 && i.c.w > .5) { l.z += sin(t * 2.1 + l.x * 1.3 + i.c.y * 30.) * .16 * max(-l.y, 0.); }   // washing on the line
  if (afloat) { // boats and buoys roll and pitch a little on the swell
    let ro = sin(t * .8 + i.c.y * 9.) * .045; let pi = sin(t * .63 + i.c.y * 5.) * .03;
    l = vec3f(l.x - l.y * ro, l.y + l.x * ro + l.z * pi, l.z - l.y * pi);
  }
  var w = i.a.xyz + qrot(i.b, l);
  w.y += sin(t * select(.3, .9, afloat) + i.c.y * 40.) * select(i.c.w, 0., mt > 13);
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = qrot(i.b, nl); o.op = i.p * i.a.w + i.c.y * 37.; o.on = nl;
  o.m = i.c; o.q = i.b; o.ao = i.n.w; o.lp = i.p;
  return o;
}
struct TP { h: f32, c: f32, n: vec3f };
// a clock hand: q on the dial, a the angle from twelve
fn hand(q: vec2f, a: f32, len: f32, w: f32) -> f32 {
  let d = vec2f(sin(a), cos(a)); let al = dot(q, d);
  return ss(w, w * .6, abs(q.x * d.y - q.y * d.x)) * step(-.15, al) * step(al, len);
}
fn tri(p: vec3f, n: vec3f, s: f32) -> TP {
  var w = pow(abs(n), vec3f(4.)); w /= (w.x + w.y + w.z);
  let x = textureSample(tD, sR, p.zy * s); let y = textureSample(tD, sR, p.xz * s); let z = textureSample(tD, sR, p.xy * s);
  var o: TP;
  o.h = x.b * w.x + y.b * w.y + z.b * w.z;
  o.c = x.a * w.x + y.a * w.y + z.a * w.z;
  let a = x.rg * 2. - 1.; let b = y.rg * 2. - 1.; let c = z.rg * 2. - 1.;
  o.n = vec3f(0., a.y, a.x) * w.x + vec3f(b.x, 0., b.y) * w.y + vec3f(c.x, c.y, 0.) * w.z;
  return o;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let mat = i32(i.m.x + .5); let sd = i.m.y; let fl_ = select(-1., 1., ff);
  let on = normalize(i.on) * fl_; let n0 = normalize(i.n) * fl_;
  let dist = length(i.wp - g.cam.xyz);
  let ts = select(1., i.m.z, mat >= 2 && mat < 14);
  let A = tri(i.op, on, .1 * ts); let B = tri(i.op, on, .43 * ts); let C = tri(i.op, on, 1.9 * ts);
  var F = C; if (!LOW) { F = tri(i.op, on, 6.7 * ts); }                // the finest layer everywhere but Low
  let Wd = textureSample(tD, sR, vec2f(i.lp.x * .06, (i.lp.y + i.lp.z) * .7));
  let big = textureSample(tD, sR, i.op.xz * .013 + i.op.y * .021).a;
  let big2 = textureSample(tD, sR, i.op.zx * .031 + i.op.y * .043 + .37).a;
  let sk = textureSample(tD, sR, vec2f((i.op.x + i.op.z) * .33, i.op.y * .035));
  let sk2 = textureSample(tD, sR, vec2f((i.op.x - i.op.z) * 1.1, i.op.y * .11));
  let gm = textureSample(tM, sC, i.wp.xz / WORLD + .5);
  let cau = caus(i.wp, dist);
  var lm = vec4f(0.); if (mat == 14) { lm = lmap(i.wp); }
  // ---- no derivative-based sampling below this line
  let fk = ss(10., 1.5, dist) * f32(mat <= 1);
  let wetK = 1. - ss(-.1, .5, i.wp.y);                 // 1 under water
  let dry = ss(.3, 1.8, i.wp.y);                       // 1 well above the waterline
  var ca = mix(vec3f(.36), cau, wetK);
  if (mat == 14) { ca = mix(vec3f(.36), min(cau, vec3f(1.5)) * .42 + .5, wetK); }   // in the island's shallows the light net is soft: its dark cells must not read as spots on the sand
  let hgt = A.h * .5 + B.h * .35 + C.h * .15;
  var bump = 1.7; var gloss = .1; var alb = vec3f(0.); var emi = vec3f(0.); var vao = 1.; var flu = 0.; var thru = 0.;
  var sgro = 0.; var lumpK = 0.; var toon = 0.;
  let flt = ss(.72, .93, n0.y);
  let t = g.cam.w;
  if (mat <= 1) {
    // layered rock: beds keyed on height, warm encrustation, pale lichen, algae on what faces up
    let st = i.op.y * .55 + A.h * 1.6 + big * 5. + big2 * 3.;
    let bed = hs(floor(st)); let sf = fract(st);
    alb = mix(vec3f(.11, .12, .13), vec3f(.33, .30, .25), sat(A.c * 1.5 - .25));
    alb = mix(alb, mix(vec3f(.26, .19, .10), vec3f(.20, .22, .14), bed), ss(.42, .66, big) * .7);
    alb *= mix(.72, 1.15, bed) * (1. - .45 * ss(.12, .0, sf) * (1. - abs(on.y)));
    let enc = ss(.46, .6, big2 * .6 + B.c * .5) * ss(.3, .6, hgt) * wetK;
    alb = mix(alb, mix(vec3f(.34, .07, .10), vec3f(.40, .25, .07), ss(.45, .6, A.c)) * (.5 + .8 * B.h), enc * .75);
    alb = mix(alb, vec3f(.50, .50, .46) * (.5 + .7 * C.h), ss(.60, .70, B.c * .6 + C.c * .5) * .5);
    let alg = ss(-.1, .6, n0.y) * ss(.3, .52, B.c * .55 + big * .5) * wetK;
    alb = mix(alb, vec3f(.035, .14, .07), alg * .8);
    alb *= (.22 + 1.3 * hgt) * mix(1., .62 + .76 * F.h, fk);
    sgro = -ss(.14, .0, sf) * (1. - abs(on.y)) * 1.2;
    if (mat == 0) {
      // sea floor only: sand on the flats, magenta mats, a violet cast inside the grotto
      alb = mix(alb, vec3f(.13, .15, .14) * (.55 + .6 * B.h), flt * gm.a * .7 * wetK);
      let mg = flt * sat(gm.r * 1.5 - .45 + (B.c - .5) * 1.6) * ss(.35, .6, A.h) * ss(-34., -40., i.wp.y);
      alb = mix(alb, vec3f(.20, .02, .12) * (.4 + .9 * B.h), mg * .8);
      flu = mg * .35;
      alb = mix(alb, alb * vec3f(.85, .8, 1.4) + vec3f(.015, .0, .05), gm.b * .8 * wetK);
    }
    // out of the water: sun-bleached stone, a dark wet band with a barnacle line at the tide mark, turf on the tops
    // down in the rift the rock itself carries specks of living light that come and go
    let spk = ss(.80, .86, C.c * .55 + F.h * .5) * ss(-47.5, -52., i.wp.y);
    emi += mix(vec3f(.05, .9, .75), vec3f(.25, .5, 1.), step(.5, fract(big2 * 9.))) * spk * (.25 + .75 * pow(.5 + .5 * sin(t * (.6 + big * 2.) + big2 * 60. + i.wp.x), 3.)) * 1.3;
    alb = mix(alb, alb * 1.5 + vec3f(.085, .075, .055), dry * .75);
    let band = ss(-1.4, -.1, i.wp.y) * (1. - ss(.3, 1.5, i.wp.y));
    alb *= 1. - .5 * band;
    alb = mix(alb, vec3f(.40, .40, .34) * (.5 + .8 * C.h), band * ss(.5, .6, B.c * .6 + C.c * .45) * .6);
    alb = mix(alb, vec3f(.11, .19, .045) * (.55 + .9 * B.h), dry * ss(.6, .92, n0.y) * ss(.34, .5, big * .55 + B.c * .5) * .9);
    gloss = .1 + .22 * band;
    // in the air rock is painted like the island's cliffs: warm, broad, without glitter
    alb = mix(alb, ${SRGB('#b8a88c')} * .62 * (.62 + .6 * hgt), dry * .62 * (1. - ss(.6, .92, n0.y) * .6)); bump = mix(1.7, .75, dry); gloss *= 1. - .8 * dry;
  } else if (mat == 2) {
    // fluke monolith: smooth pale stone, dark streaks running along its length
    alb = mix(vec3f(.42, .47, .48), vec3f(.10, .13, .15), ss(.40, .62, sk.a * .6 + sk2.b * .5)) * (.75 + .3 * B.h);
    alb = mix(alb, vec3f(.60, .64, .62), ss(.62, .75, sk2.a) * .5);
    alb = mix(alb, vec3f(.07, .17, .10), ss(4., -1., i.lp.y) * ss(.4, .6, B.c) * .7);
    gloss = .7; bump = .5;
  } else if (mat == 3) {
    // wreck timber: plank seams, soaked dark, algae creeping over it
    alb = mix(vec3f(.22, .13, .06), vec3f(.60, .40, .20), Wd.b) * (.7 + .4 * B.h);
    let pk = fract(atan2(i.lp.z, 2. - i.lp.y) * 7.);
    alb *= .25 + .75 * ss(0., .14, min(pk, 1. - pk));
    alb = mix(alb, vec3f(.08, .22, .16), ss(.6, .78, A.c) * .35);
    gloss = .2; bump = 1.1;
  } else if (mat == 4) {
    let hue = fract(sd * 7.31);
    alb = mix(vec3f(.60, .17, .08), vec3f(.64, .35, .10), fract(hue * 3.));
    if (hue > .75) { alb = vec3f(.44, .18, .42); }
    alb *= (.45 + .75 * B.h) * (.7 + .3 * C.h);
    vao = i.ao * i.ao; gloss = .2; bump = 1.4; flu = .55;
  } else if (mat == 5) {
    let hue = fract(sd * 5.73);
    alb = mix(vec3f(.80, .08, .10), vec3f(.90, .22, .40), fract(hue * 4.));
    if (hue > .7) { alb = vec3f(.88, .42, .10); }
    if (hue > .9) { alb = vec3f(.55, .22, .75); }
    alb *= (.4 + .8 * B.h) * (.5 + .9 * i.ao * i.ao);
    alb = mix(alb, vec3f(1., .75, .6), ss(.8, 1., i.ao) * .35);
    emi = alb * .01; flu = .75; gloss = .25; bump = 1.5;
  } else if (mat == 6) {
    // amethyst: dark at the root, lit from within toward the tip, breathing slowly
    let k = sat(i.ao);
    let facet = .45 + .85 * abs(dot(n0, vec3f(.37, .52, .77)));                 // each face catches the glow differently
    alb = vec3f(.10, .035, .20);
    let glow = mix(vec3f(.50, .08, 1.15), vec3f(1.05, .18, .85), step(.6, fract(sd * 5.3)));
    let Vc = normalize(g.cam.xyz - i.wp); let rf = refract(-Vc, n0, .62);
    let inner = textureSampleLevel(tD, sR, rf.xy * 1.1 + i.lp.xz * .45 + rf.z * .3, 0.);       // what the eye reads as depth: structure that slides as the view moves
    emi = (mix(vec3f(.02, .002, .07), glow * .75, k * k) * (.35 + 1.5 * inner.b * inner.a * 2.) + glow * 3.2 * pow(k, 7.)) * facet * (.7 + .3 * sin(t * 1.3 + sd * 40.));   // the tips burn bright enough to bloom
    gloss = 1.; bump = .04;
  } else if (mat == 7) {
    // drowned marble: veined, pitted, green where silt settles
    alb = mix(vec3f(.56, .55, .50), vec3f(.27, .30, .29), ss(.45, .7, sk.a * .55 + sk2.b * .5)) * (.6 + .5 * B.h);
    alb = mix(alb, vec3f(.07, .16, .09), ss(.2, .9, n0.y) * ss(.35, .55, B.c * .6 + big2 * .5) * .8);
    alb = mix(alb, vec3f(.42, .16, .12), ss(.62, .7, C.c) * .3);
    gloss = .35; bump = 1.;
  } else if (mat == 8) {
    // painted hull: antifouling below the waterline, a boot stripe, colour above, teak where it faces up
    let navy = step(fract(sd * 3.7), .5);
    var top = mix(vec3f(.90, .90, .86), vec3f(.035, .075, .17), navy);
    if (i.m.z > 1.5) { let hb = fract(sd * 11.3); top = ${SRGB('#2f8f9a')}; if (hb > .2) { top = ${SRGB('#c8402e')}; } if (hb > .4) { top = ${SRGB('#f2ead6')}; } if (hb > .6) { top = ${SRGB('#e0b030')}; } if (hb > .8) { top = ${SRGB('#2a5a9a')}; } }   // fishing boats come in every colour
    alb = mix(vec3f(.36, .06, .04) * (.7 + .5 * B.c), top, ss(-.02, .03, i.lp.y));
    alb = mix(alb, vec3f(.93, .93, .90), ss(.0, .03, i.lp.y) * (1. - ss(.14, .17, i.lp.y)));                // boot stripe
    alb = mix(alb, vec3f(.80, .62, .16), navy * ss(.02, .0, abs(i.lp.y - 1.02 - .0145 * i.lp.x * i.lp.x * step(0., i.lp.x) - .007 * i.lp.x * i.lp.x * step(i.lp.x, 0.)) - .035) * step(abs(on.y), .6));   // cove line
    // the cabin trunk: white sides with a row of dark portholes
    let cab = step(1.06, i.lp.y) * step(abs(on.y), .5) * step(abs(i.lp.z), 1.2);
    alb = mix(alb, vec3f(.90, .89, .85), cab);
    alb = mix(alb, vec3f(.015, .03, .045), cab * ss(.15, .12, length(vec2f(fract(i.lp.x * .85) - .5, (i.lp.y - 1.44) * 1.1))) * step(.7, abs(on.z)));
    alb = mix(alb, mix(vec3f(.30, .18, .08), vec3f(.52, .35, .17), Wd.b) * (.75 + .25 * ss(.0, .1, abs(fract(i.lp.z * 6.) - .5))), ss(.6, .9, on.y) * ss(.3, .5, i.lp.y));
    alb = mix(alb, vec3f(.10, .20, .12), ss(-.2, -1.2, i.lp.y) * ss(.4, .6, B.c) * .5);
    gloss = .7; bump = .05;
    if (i.ao < .25) { alb = mix(vec3f(.22, .13, .055), vec3f(.46, .30, .14), Wd.b) * (.7 + .4 * B.h); gloss = .35; }   // spars and trim: varnished wood
  } else if (mat == 9) {
    // sailcloth: seams across the panels, glows when the sun is behind it
    alb = vec3f(.90, .87, .76) * (.86 + .14 * ss(.0, .06, abs(fract(i.lp.y * .9) - .5))) * (.95 + .08 * B.h);
    thru = .55; gloss = .05; bump = 0.;
  } else if (mat == 10) {
    // lighthouse: banded daymark, dark ironwork, and the lamp
    let bf = fract(i.lp.y / 7. + .12);
    let wall = mix(vec3f(.84, .83, .78), vec3f(.60, .08, .06), ss(.49, .51, bf) * (1. - ss(.985, 1., bf)) + (1. - ss(.0, .015, bf)) * step(.5, fract(i.lp.y / 7. + .12 - .5)));
    alb = wall * (.8 + .25 * B.h) * (1. - .25 * ss(.5, .75, sk.a));
    if (i.ao < .25) { alb = vec3f(.05, .06, .07); gloss = .6; }
    if (i.ao < -.5) {
      let bd = vec2f(cos(t * .8), sin(t * .8));
      let fl2 = pow(max(dot(normalize((g.cam.xyz - i.wp).xz), bd), 0.), 240.);
      alb = vec3f(.3, .28, .2); emi = vec3f(1., .82, .5) * (1.2 + 60. * fl2);
    }
    bump = .35;
  } else if (mat == 11) {
    alb = mix(vec3f(.085, .08, .075), vec3f(.30, .12, .045), ss(.4, .65, C.c * .6 + B.c * .5)) * (.6 + .6 * B.h);
    alb = mix(alb, vec3f(.07, .16, .10), wetK * ss(.5, .7, A.c) * .5);
    gloss = .45; bump = .9;
  } else if (mat == 12) {
    let hue = fract(sd * 9.17);
    alb = mix(vec3f(.86, .30, .07), vec3f(.42, .13, .52), step(.5, hue));
    if (hue > .82) { alb = vec3f(.06, .04, .09); }
    alb *= (.45 + .8 * C.h) * (.45 + .75 * sat(i.ao));
    vao = .6 + .4 * sat(i.ao); gloss = .3; bump = 1.2; flu = .4;
  } else if (mat == 14) {
    // the island's ground: meadow, crops, sand, cliff, cobbles and dirt, chosen by slope, height and the land map
    let steep = 1. - ss(.45, .66, n0.y);
    let gn = big * .55 + A.c * .45;
    var gr = mix(${SRGB('#3f7448')}, ${SRGB('#739c54')}, ss(.34, .46, gn));
    gr = mix(gr, ${SRGB('#a4b962')}, ss(.50, .62, gn));
    let wv = ss(.55, 1., sin(dot(i.wp.xz, vec2f(.13, .09)) - t * 1.3 + big2 * 9.)) * ss(.3, .6, A.c);   // wind crossing the grass in pale waves
    gr = mix(gr, ${SRGB('#c0cf80')}, wv * .35) * (.72 + .5 * B.h);
    let fw = ss(.80, .84, C.c * .55 + F.h * .5) * ss(.46, .6, gn) * ss(40., 14., dist);                  // flowers where the meadow is brightest
    gr = mix(gr, mix(vec3f(.9, .88, .8), mix(vec3f(.9, .7, .1), vec3f(.85, .3, .45), step(.5, fract(big2 * 13.))), step(.4, fract(big * 17.))), fw);
    // terraces: rows across each patch, a different crop per patch, a hedge round it
    // Patches are cut by terrace level and by bearing from the middle of the island, so their edges are exact at any distance.
    let iv = i.wp.xz - vec2f(${ISLE[0]}., ${ISLE[1]}.); let sa = (atan2(iv.y, iv.x) + 4.) * 9. + (big - .5) * 1.1 + (A.c - .5) * .3; let lv = i.wp.y / 2.4 + .02 + (big2 - .5) * .5;   // no boundary runs straight
    let pid = hs(floor(sa) * 7.31 + floor(lv) * 3.17); let fk = ss(.1, .25, lm.g) * ss(.80, .90, n0.y);
    let ra = pid * 6.283; let rows = .5 + .5 * sin(dot(i.wp.xz, vec2f(cos(ra), sin(ra))) * 5.5);
    var crop = mix(${SRGB('#c4aa52')}, ${SRGB('#86b04c')}, step(.30, pid));                               // wheat, greens, darker greens, tilled earth
    crop = mix(crop, ${SRGB('#5f9a4a')}, step(.58, pid)); crop = mix(crop, ${SRGB('#a5825a')}, step(.84, pid));
    crop *= (.80 + .26 * rows * ss(60., 15., dist)) * (.8 + .35 * B.h);
    crop = mix(crop, ${SRGB('#3a6a42')}, ss(.7, .3, min(fract(sa), 1. - fract(sa)) * length(iv) / 9.) * .8);   // a hedge between neighbours
    alb = mix(gr, crop, fk);
    alb = mix(alb, ${SRGB('#a39c8c')} * (.55 + .7 * C.h), fk * ss(.07, .03, min(fract(lv), 1. - fract(lv))));   // a dry-stone wall along each contour
    let snd = ${SRGB('#ead9ae')} * (.8 + .3 * B.h) * mix(.62, 1., ss(.15, .9, i.wp.y));
    alb = mix(alb, snd, ss(2.6, 1.5, i.wp.y + (B.c - .5) * 1.4));
    let st = i.wp.y * .45 + A.h * 1.4 + big * 4.; let bed = hs(floor(st));
    var rock = mix(${SRGB('#9a8e7a')}, ${SRGB('#c2b294')}, bed) * (.72 + .4 * hgt);                    // broad pale beds, a few ochre ones
    rock = mix(rock, ${SRGB('#b89a6a')}, ss(.55, .75, big2) * .3) * (1. - .2 * ss(.10, .0, fract(st)));
    alb = mix(alb, rock, steep);
    alb = mix(alb, ${SRGB('#d2b98a')} * (.75 + .35 * B.h), ss(.2, .45, lm.r));
    alb = mix(alb, ${SRGB('#a79c8c')} * (.62 + .6 * C.h) * (.85 + .3 * B.c) * mix(1., .55 + .9 * ss(.3, .62, F.h), ss(26., 6., dist)), ss(.6, .85, lm.r));   // cobbles show up close
    // under water the sand is seen through sunlit shallows: aqua, not white, with weed further down
    alb = mix(alb, mix(vec3f(.115, .20, .165), vec3f(.05, .13, .085), ss(.45, .65, B.c * .5 + big * .5) * ss(-2., -9., i.wp.y)) * (.7 + .5 * B.h) * mix(.7, 1.5, ss(-1.5, -10., i.wp.y)), wetK);
    gloss = .04; bump = mix(.35, 1.0, steep); lumpK = steep * .45;
  } else if (mat == 15) {
    // houses: plaster, tile, glass, shutters, trim, timber, stone, flower boxes, awnings
    let tg = i32(round(i.ao * 4.));
    let uH = select(i.lp.z, i.lp.x, abs(on.z) > abs(on.x));
    let h1 = hs(sd * 17.3 + .1); let h2 = hs(sd * 5.9 + .3); let h3 = hs(sd * 29.1 + .7);
    bump = .25; gloss = .05;
    if (tg >= 4) {
      alb = ${SRGB('#f6f0e2')};
      if (h1 > .30) { alb = ${SRGB('#f0deb4')}; }
      if (h1 > .52) { alb = ${SRGB('#e3b96a')}; }
      if (h1 > .68) { alb = ${SRGB('#e9b9a6')}; }
      if (h1 > .82) { alb = ${SRGB('#c9d9dd')}; }
      if (h1 > .93) { alb = ${SRGB('#d99a7a')}; }
      if (h3 > .72 && i.lp.y > 3.15) {                                            // half-timbering on some upper floors
        let bm = max(ss(.42, .46, abs(fract(uH / 1.3) - .5)), ss(.455, .48, abs(fract((i.lp.y - .25) / 2.85) - .5)));
        alb = mix(${SRGB('#f4eedd')}, ${SRGB('#4a3526')}, bm);
      }
      alb *= (.86 + .2 * B.h) * (1. - .22 * ss(.55, .8, sk.a)) * (1. - .3 * ss(1.2, .2, i.lp.y));   // rain streaks, grime rising from the street
    } else if (tg == 3) {
      var rc = mix(${SRGB('#d9713c')}, ${SRGB('#c85a32')}, fract(h2 * 3.));
      if (h2 > .45) { rc = ${SRGB('#d58a58')}; }
      if (h2 > .62) { rc = ${SRGB('#b9634a')}; }
      if (h2 > .76) { rc = ${SRGB('#9a4f48')}; }
      if (h2 > .88) { rc = ${SRGB('#66788a')}; }
      rc = mix(rc, vec3f(dot(rc, vec3f(.3, .5, .2))) * vec3f(1.1, 1., .9), .12 + .4 * h3 * h3) * (.82 + .3 * h1);   // each roof faded and sun-bleached by its own amount
      let row = i.lp.y * 4.4; let col = uH * 3.6 + step(.5, fract(row * .5)) * .5;
      let tl = hs(floor(row) * 7.13 + floor(col) * 3.71 + sd * 40.);
      alb = rc * mix(1., (.72 + .5 * tl) * (.78 + .22 * ss(.0, .3, fract(row))), ss(90., 25., dist)) * (.85 + .25 * B.h);
      alb = mix(alb, vec3f(.20, .24, .12), ss(.55, .78, A.c * .6 + sk.a * .5) * .5);
      bump = .5;
    } else if (tg == 2) {
      alb = mix(vec3f(.03, .05, .08), vec3f(.55, .5, .4), step(.7, hs(floor(uH * 1.1) + floor(i.lp.y) * 7. + sd * 9.)) * .6);   // dark glass, here and there a curtain
      gloss = 1.; bump = 0.;
    } else if (tg == 1) {
      alb = ${SRGB('#2f6f73')};
      if (h3 > .25) { alb = ${SRGB('#8a2f2a')}; }
      if (h3 > .45) { alb = ${SRGB('#2f5a3a')}; }
      if (h3 > .62) { alb = ${SRGB('#28466e')}; }
      if (h3 > .80) { alb = ${SRGB('#c98a2e')}; }
      alb *= .8 + .25 * ss(.0, .08, abs(fract(i.lp.y * 9.) - .5));
    } else if (tg == 0) { alb = ${SRGB('#efe9da')} * (.85 + .2 * B.h);
    } else if (tg == -1) { alb = mix(${SRGB('#3a2a1e')}, ${SRGB('#6a4a30')}, Wd.b);
    } else if (tg == -2) { alb = ${SRGB('#a39c8c')} * (.6 + .6 * C.h) * (.8 + .3 * B.c); bump = .35;
    } else if (tg == -3) {
      let fd = hs(floor(uH * 4.5) * 3.1 + sd * 9.);                                 // a row of plants, each in bloom or in leaf
      alb = mix(mix(vec3f(.80, .14, .16), vec3f(.90, .48, .62), step(.5, h3)), ${SRGB('#3f7448')}, max(step(.72, fd), step(on.y, -.5)));
    } else { alb = mix(${SRGB('#f4eedd')}, mix(${SRGB('#b8332e')}, ${SRGB('#2f6f73')}, step(.5, h3)), step(.5, fract(i.lp.x * 1.6))); thru = .3; }
  } else if (mat == 16) {
    // harbor masonry: coursed blocks, weed and a dark band at the waterline; iron fittings
    if (i.ao < -.5) { alb = vec3f(.07, .30, .40); gloss = 1.; bump = 0.; }       // water in the fountain
    else if (i.ao < .5) { alb = vec3f(.05, .055, .06); gloss = .5; bump = .2; } else {
      let vert = 1. - ss(.5, .8, abs(n0.y));
      let uu = mix(i.wp.x * .9 + i.wp.z * .43, dot(i.wp.xz, vec2f(-n0.z, n0.x)), vert);
      let vv = mix(i.wp.z * .9 - i.wp.x * .43, i.wp.y * 2., vert);
      let r2 = floor(vv / .9); let cu = uu / 1.3 + hs(r2);
      let mort = ss(.455, .49, max(abs(fract(vv / .9) - .5), abs(fract(cu) - .5)));
      alb = ${SRGB('#c9bea6')} * (.74 + .34 * hs(floor(cu) * 3.7 + r2 * 9.1)) * (.7 + .5 * hgt);
      alb = mix(alb, alb * .55, mort * ss(80., 20., dist));
      let wl = ss(.9, -.2, i.wp.y);
      alb = mix(alb, vec3f(.06, .11, .07) * (.6 + .8 * B.h), wl * .8 * vert);
      bump = .8; gloss = .08 + .3 * wl;
    }
  } else if (mat == 17) {
    if (i.ao < -.5) { alb = mix(${SRGB('#3a2a1e')}, ${SRGB('#8a6a4a')}, Wd.b * .8 + .1); bump = .9; } else {
      // foliage: one mid tone per tree; the banded lighting below supplies its light and shade tones
      let ty = i32(i.m.z + .5); let hv = hs(sd * 13.7);
      alb = mix(${SRGB('#3f7f52')}, ${SRGB('#4f8a45')}, ss(.0, .4, hv));
      alb = mix(alb, ${SRGB('#6f9a40')}, ss(.6, .95, hv));
      if (ty == 2) { alb = mix(${SRGB('#2f6a4a')}, ${SRGB('#3f7a48')}, hv); }
      if (ty == 3) { alb = mix(${SRGB('#1f4a3c')}, ${SRGB('#2c5a40')}, hv); }
      alb *= .78 + .44 * ss(.3, .7, B.c * .6 + C.h * .5);                          // leaf masses: lighter flecks, darker pockets
      if (ty == 4) { alb = mix(alb, mix(${SRGB('#d98fb4')}, ${SRGB('#8a90d8')}, step(.5, hv)) * (.85 + .3 * C.h), ss(.12, .3, i.ao)); }   // hydrangea: massed bloom over a skirt of leaves
      toon = 1.; vao = .45 + .55 * sat(i.ao); bump = .6; thru = .2;
    }
  } else if (mat == 18) {
    // timber and cloth: planks, awnings, washing, piles
    let tg = i32(round(i.ao * 4.));
    alb = mix(${SRGB('#6b5a48')}, ${SRGB('#a8947a')}, Wd.b) * (.75 + .35 * B.h) * (.7 + .3 * ss(.0, .12, abs(fract((i.wp.x + i.wp.z) * 2.2) - .5)));
    if (tg == 2) { let hh = hs(sd * 7.7); alb = mix(${SRGB('#f4eedd')}, mix(${SRGB('#b8332e')}, mix(${SRGB('#2f6f73')}, ${SRGB('#d9a23a')}, step(.66, hh)), step(.33, hh)), step(.5, fract(i.lp.x * 1.9))); thru = .35; }
    if (tg == 1) { let ch = hs(floor(i.lp.x * 1.4 + sd * 20.) * 3.3 + sd); alb = mix(vec3f(.92, .9, .84), .55 + .4 * cos(TAU * (vec3f(0., .33, .67) + ch)), step(.45, ch)); thru = .4; }
    if (tg == 0) { alb = vec3f(.04, .035, .03); }
    if (tg == -1) { alb = mix(mix(${SRGB('#3a2a1e')}, ${SRGB('#5a4634')}, Wd.b), vec3f(.05, .10, .06), ss(.8, -.3, i.wp.y) * .8); }
    bump = .7; gloss = .08;
  } else if (mat == 19) {
    // landmarks: coursed stone, copper or tile roofs, the clock, plaster, timber, sailcloth, gilding, coloured glass
    let tg = i32(round(i.ao * 4.));
    let uH = select(i.lp.z, i.lp.x, abs(on.z) > abs(on.x));
    bump = .4; gloss = .06;
    if (tg >= 4) {
      let r2 = floor(i.lp.y / .5); let cu = uH + hs(r2);
      let mort = ss(.45, .49, max(abs(fract(i.lp.y / .5) - .5), abs(fract(cu) - .5)));
      alb = ${SRGB('#c9bea6')} * (.76 + .3 * hs(floor(cu) * 3.7 + r2 * 9.1)) * (.75 + .4 * B.h) * (1. - .2 * ss(.5, .8, sk.a));
      alb = mix(alb, alb * .6, mort * ss(90., 25., dist)); bump = .8;
    } else if (tg == 3) {
      alb = mix(${SRGB('#6fa596')}, ${SRGB('#4f8578')}, sk.a) * (.8 + .3 * B.h); gloss = .25;
      if (sd > .5) { alb = mix(${SRGB('#c85a32')}, ${SRGB('#d9713c')}, sk.a) * (.8 + .3 * hs(floor(i.lp.y * 4.))); }
    } else if (tg == 2) {
      // the clock: a pale dial, hour marks, and hands that keep time at sixty times the usual rate
      let q = vec2f(uH, i.lp.y - 19.8); let r = length(q); let hm = t / 60.;
      alb = mix(${SRGB('#f3ecd8')}, ${SRGB('#2a2a30')}, ss(1.78, 1.83, r));
      let tick = ss(.07, .03, abs(fract(atan2(q.x, q.y) / TAU * 12. + .5) - .5)) * ss(1.3, 1.36, r) * ss(1.7, 1.64, r);
      alb = mix(alb, vec3f(.03), max(tick, max(hand(q, hm * TAU, 1.5, .08), hand(q, hm / 12. * TAU, 1.0, .12))));
      bump = 0.; gloss = .3;
    } else if (tg == 1) { alb = ${SRGB('#f6f0e2')} * (.86 + .2 * B.h) * (1. - .2 * ss(.5, .8, sk.a)) * (1. - .25 * ss(1.5, .2, i.lp.y));
    } else if (tg == 0) { alb = vec3f(.02, .025, .03);
    } else if (tg == -1) { alb = mix(${SRGB('#3a2a1e')}, ${SRGB('#7a5a3a')}, Wd.b);
    } else if (tg == -2) { alb = ${SRGB('#efe6cc')} * (.9 + .1 * B.h); thru = .5;
    } else if (tg == -3) { alb = vec3f(.9, .62, .12); gloss = .9;
    } else { let gq = hs(floor(uH * 3.) * 3.3 + floor(i.lp.y * 3.) * 7.1); alb = .15 + .5 * (.5 + .5 * cos(TAU * (vec3f(0., .33, .67) + gq))); emi = alb * .25; gloss = .8; }
  } else {
    alb = mix(vec3f(.72, .09, .06), vec3f(.88, .88, .84), step(.5, fract(i.lp.y * 1.1 + .25))) * (.8 + .3 * B.h);
    if (i.ao < .25) { alb = vec3f(.07, .08, .08); }
    if (i.ao < -.5) { alb = vec3f(.1); emi = vec3f(.3, 1., .5) * (.4 + 5. * step(.86, fract(t * .4))); }
    gloss = .5; bump = .1;
  }
  if (mat > 13) { alb *= .62; }                                // the island's palette is written as it should look in sunlight
  let rip = select(0., flt * gm.a * cos((i.wp.x * .8 + i.wp.z * .35) * 5. + A.c * 9.) * .65 * wetK, mat == 0);
  // rock gets every layer; made things (timber, paint, masonry, carved stone) only the fine grain, or they all look like crumpled paper
  let lumps = (A.n * .85 + B.n * .65) * max(lumpK, f32(mat <= 1 || (mat >= 4 && mat <= 5) || mat == 12));
  let N = normalize(qrot(i.q, normalize(on + (lumps + C.n * .45 * ss(60., 12., dist) + F.n * .5 * max(fk, f32(mat >= 2) * ss(14., 3., dist))) * bump + vec3f(.8, sgro, .35) * vec3f(rip, 1., rip))));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let v1 = vol(i.wp + n0 * 1.5); let v2 = vol(i.wp + n0 * 4.5);
  let ao = (sat((v1.r - .5) * 8.) * .55 + sat((v2.r - .5) * 2.7) * .45) * vao * mix(1., ss(.12, .6, hgt), f32(mat <= 7));
  let z = zone(i.wp);
  let E = sunE(i.wp.y, z) * mix(shadow9(i.wp + n0 * .35), 1., .85 * wetK * f32(mat == 14));   // water scatters a shadow before it reaches the harbor floor
  var ndl = sat(dot(N, L));
  if (toon > 0.) {
    // foliage is lit in three flat tones with soft joins; shade leans blue-green, light leans yellow
    let w = dot(N, L) * (.55 + .45 * sat(i.ao)); ndl = ss(-.12, .08, w) * .42 + ss(.56, .72, w) * .58;
    alb *= mix(vec3f(.50, .84, 1.14), vec3f(1.24, 1.20, .80), ndl);
  }
  let am = (amb(i.wp, N, v1.g, z) + side(i.wp, N, sat((v2.r - .5) * 2.7), z)) * ao * (1. + .7 * toon);   // light filters down through a crown: its shade stays green
  let dl = E * ndl * (.10 + mix(vec3f(.33), ca, ss(.1, .45, dot(n0, L))) * 2.5);
  var c = alb * (dl + am) + emi + alb * flu * dot(dl + am, vec3f(.1, .5, .5));
  c += alb * E * thru * sat(-dot(N, L)) * 1.2;
  c += alb * vec3f(.42, .13, .78) * (z * z * .8 * (.3 + .7 * ao) * (1. - v1.g * .6));                 // the crystals' light on the grotto walls
  if (mat == 6) { c += vec3f(.95, .55, 1.3) * pow(1. - sat(dot(N, V)), 4.) * .6 * sat(i.ao + .3); }
  c += alb * vec3f(.07, .34, .40) * (ss(-45., -52., i.wp.y) * (.35 + .65 * ao) * (1. - z));              // the rift's own glow, from the jellies and the specks on its walls
  let H = normalize(V + L);
  c += E * (.25 + ca) * pow(sat(dot(N, H)), mix(10., 70., gloss)) * gloss * ndl * 1.8;
  let Rv = reflect(-V, N);
  c += (amb(i.wp, Rv, v1.g, z) + side(i.wp, Rv, sat((v2.r - .5) * 2.7), z)) * ao * (.08 + gloss) * .6 * pow(1. - sat(dot(N, V)), 2.5);
  return fin(fog(c, i.wp, z));
}
`;

// ---------------------------------------------------------------- leaves: kelp, grasses, fronds, ground cover
// One instance is one blade: a = base + length, b = yaw, tilt, width, height on its stem, c = type, two seeds, bend.
// The strip is bent, twisted, ruffled and swayed entirely here, so two million blades cost 36 bytes each.
const W_LEAF = S_B + /*wgsl*/`
override ROWS: f32 = 7.;
override FAR: f32 = 150.;
struct LI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f };
struct LO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) col: vec3f, @location(4) @interpolate(flat) pr: vec4f,
  @location(5) @interpolate(flat) sd: vec2f, @location(6) @interpolate(flat) spc: vec3f };
// the current: a slow wave that travels across the reef, stronger the higher a blade sits on its stem
fn sway(p: vec2f, h: f32, t: f32) -> vec2f {
  let ph = dot(p, vec2f(.031, .017));
  let a = .024 * pow(max(h, 0.), 1.25);
  return a * (vec2f(sin(t * .5 + ph + h * .09), cos(t * .37 + ph * 1.3 + h * .07)) + .35 * vec2f(sin(t * 1.3 + ph * 3. + h * .3), cos(t * 1.1 + ph * 2. + h * .23)));
}
fn sq(x: f32) -> f32 { return x * x; }
fn pal(h: f32) -> vec3f {
  if (h < .3) { return vec3f(1., .62, .08); }
  if (h < .6) { return vec3f(.12, 1., .22); }
  if (h < .8) { return vec3f(.2, .85, 1.); }
  return vec3f(1., .3, .8);
}
@vertex fn vs(@builtin(vertex_index) vi: u32, i: LI) -> LO {
  var o: LO;
  let u = f32(vi & 1u) * 2. - 1.; let v = sin(f32(vi >> 1u) / (ROWS - 1.) * 1.5708);
  let ty = i32(i.c.x * 255. + .5); let s1 = i.c.y; let s2 = i.c.z;
  let t = g.cam.w;
  let len = i.a.w; let hA = i.b.w;
  let cy = cos(i.b.x); let sy = sin(i.b.x); let ct = cos(i.b.y); let st = sin(i.b.y);
  let d = vec3f(st * cy, ct, st * sy); let pe = vec3f(ct * cy, -st, ct * sy); let sd = vec3f(-sy, 0., cy);
  // per type: colour, (sparkle chance, translucency, iridescence, glow), sparkle colour, outline, waviness, flutter
  var col = vec3f(0.); var pr = vec4f(0.); var spc = vec3f(0.); var shp = vec2f(.75, .7); var wav = 1.; var fls = 1.;
  let hsel = hs(s1 * 13.7 + s2 * 71.3);
  switch ty {
    case 0 { col = mix(vec3f(.11, .125, .022), vec3f(.04, .10, .04), s1); col = mix(col, vec3f(.25, .17, .025), step(.72, s2)); pr = vec4f(.24, .9, 0., 0.); spc = pal(hsel * .72); shp = vec2f(.5, .32); wav = 1.9; }
    case 1 { col = vec3f(.10, .11, .035); pr = vec4f(0., .2, 0., 0.); shp = vec2f(.05, .1); wav = .3; fls = .3; }
    case 2 { col = mix(vec3f(.05, .20, .16), vec3f(.12, .26, .22), s1); col = mix(col, vec3f(.30, .14, .24), step(.85, s2)); pr = vec4f(.05, 1., .25, 0.); spc = vec3f(.6, 1., .9); shp = vec2f(.45, .35); wav = 2.2; }
    case 3 { col = mix(vec3f(.02, .05, .065), vec3f(.05, .03, .08), s1); col = mix(col, vec3f(.09, .03, .09), step(.8, s2)); pr = vec4f(.2, .85, .55, .02); spc = mix(vec3f(.5, .35, 1.), vec3f(.2, 1., .7), step(.6, hsel)); shp = vec2f(.7, .6); wav = 2.4; }
    case 4 { col = mix(vec3f(.30, .15, .02), vec3f(.42, .25, .04), s1); pr = vec4f(.2, 1., .1, 0.); spc = vec3f(1., .85, .5); shp = vec2f(.5, .4); wav = 1.8; }
    case 5 { col = mix(vec3f(.85, .05, .40), vec3f(.60, .10, .80), step(.7, s1)); col = mix(col, vec3f(.95, .25, .55), step(.75, s2)); pr = vec4f(.22, .8, 0., .30); spc = vec3f(1., .35, .8); shp = vec2f(.6, .6); fls = 2.; }
    case 6 { col = mix(vec3f(.80, .16, .16), vec3f(.92, .36, .42), s1); pr = vec4f(.06, 1., 0., .10); spc = vec3f(1., .5, .5); shp = vec2f(.4, .3); wav = 2.; }
    default { col = mix(vec3f(.05, .40, .36), vec3f(.10, .52, .58), s1); pr = vec4f(.1, .9, .2, .04); spc = vec3f(.3, 1., .9); shp = vec2f(.6, .5); }
  }
  pr.x = step(hs(s1 * 91.7 + s2 * 37.1 + i.b.x), pr.x);
  // bend: a circular arc of total angle ka, with a travelling wave across it
  let k = (i.c.w - .3) * 2. + sin(t * (.8 + s1) * fls + s2 * 40. + hA * .25) * .10 * fls;
  let wph = v * (3. + 5. * s2) + s1 * 30. + t * 1.1;
  let wv = sin(wph) * .12 * wav;
  let kq = k * 1.7; let ka = select(kq, .06, abs(kq) < .06);
  let sK = sin(ka * v); let cK = cos(ka * v);
  let c = i.a.xyz + len * (d * (sK / ka) + pe * ((1. - cK) / ka + wv * v));
  let sl = sK + wv + cos(wph) * .10 * wav * v * (3. + 5. * s2);
  let N = normalize(pe * cK - d * sl); let T0 = normalize(d * cK + pe * sl);
  let tw = (s1 - .5) * 2.4 * v + sin(t * .9 + s2 * 20.) * .25 * v;
  let S = sd * cos(tw) + N * sin(tw); let N2 = N * cos(tw) - sd * sin(tw);
  var shape = pow(max(sin(3.14159 * pow(v, shp.x)), 0.), shp.y);
  if (ty == 0) { shape = shape * (.62 + .38 * ss(.1, .5, v)) + .55 * exp(-sq((v - .075) / .04)); }   // kelp: a narrow blade swelling into a float where it joins the stipe
  let shp_ = g.res.x == 0.;                                                        // shadow pass
  let cd = distance(i.a.xyz, g.cam.xyz); let far = FAR * g.mis.z;
  let nearK = select(1. - ss(26., 40., cd), 0., shp_);
  // width fades out at the draw distance, right at the lens, and where a blade would fill the screen
  let farK = select((1. - ss(far * .8, far, cd)) * ss(.6, 2.2, distance(c, g.cam.xyz)) * ss(len * 1.1 + .5, len * 2.2 + 1.2, distance(i.a.xyz + d * (len * .5), g.cam.xyz)), 1., shp_);
  let ruf = sin(v * 10. + s2 * 30. + t * .6) * i.b.z * .36 * u * sin(3.14159 * sat(v)) * nearK;
  var p = c + S * (u * farK * select(i.b.z * .5 * shape, select(max(i.b.z * .5, .09) * shape, 0., ty == 1), shp_));
  p += N2 * ruf;
  let sw = sway(i.a.xz, hA + (p.y - i.a.y), t);
  p.x += sw.x; p.z += sw.y;
  p.y = min(p.y, -.1 + .06 * sin(p.x * 1.7 + p.z * 1.3 + t));                      // the canopy lies along the surface
  o.cp = g.vp * vec4f(p, 1.); o.wp = p; o.n = normalize(N2 + S * u * .55 - T0 * cos(v * 10. + s2 * 30. + t * .6) * u * .7 * nearK); o.uv = vec2f(u, v);
  o.col = col; o.pr = pr; o.sd = vec2f(s1, s2); o.spc = spc;
  return o;
}
// glints: tiny additive sparks drifting among the blades
struct GO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) col: vec3f };
@vertex fn vsGl(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> GO {
  var o: GO; let q = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.; let t = g.cam.w;
  var p = a.xyz; let sw = sway(a.xz, a.w, t); p.x += sw.x; p.z += sw.y;
  p += .1 * vec3f(sin(t * .7 + b.x * 50.), sin(t * .9 + b.x * 70.), cos(t * .8 + b.x * 90.));
  let d = length(p - g.cam.xyz);
  if (d > 120. || dot(p - g.cam.xyz, g.fwd.xyz) < -1.) { o.cp = vec4f(0., 0., 2., 1.); return o; }
  let tw = pow(.5 + .5 * sin(t * (.35 + .9 * hs(b.x)) + b.x * 100.), 4.);
  let sz = min(max(b.z, d * .0026), d * .0045);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.uv = q;
  let z = zone(p);
  let lit = .3 + 1.8 * shadow1(p) * sunE(p.y, z).g;
  let e = b.z / sz;
  o.col = pal(b.y) * (.12 + tw * 1.7) * lit * e * e * exp(-SIG.g * d) * ss(.4, 1.5, d) * 17. * g.ex.x;
  return o;
}
@fragment fn fsGl(i: GO) -> @location(0) vec4f {
  let r = dot(i.uv, i.uv);
  return vec4f(min(i.col * exp(-r * 7.) * (1. - ss(.7, 1., r)), vec3f(10.)), 0.);
}
@fragment fn fs(i: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus2(i.wp, dist);
  let lt = textureSample(tD, sR, vec2f(i.uv.x * .13 + i.sd.x * 3.7, i.uv.y * .8 + i.sd.y * 5.3));
  var n = normalize(i.n); if (!ff) { n = -n; }
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let z = zone(i.wp);
  let vv = vol(i.wp + vec3f(0., .8, 0.));
  let E = sunE(i.wp.y, z) * shadow1(i.wp + L * .3);
  let ndl = dot(n, L);
  // midrib, cross veins up close, darker toward the base, mottled by the detail texture
  var alb = i.col * (.72 + .28 * ss(0., .25, abs(i.uv.x))) * mix(.5, 1.12, i.uv.y) * (1. - .45 * ss(30., 8., dist) * ss(.6, 1., sin(i.uv.y * 40. - abs(i.uv.x) * 7. + i.sd.x * 40.))) * (.58 + .42 * ss(0., .13, abs(i.uv.x))) * (.5 + 1. * lt.b) * (.65 + .7 * lt.a);
  let ndv = sat(dot(n, V));
  let ir = .5 + .5 * cos(TAU * (vec3f(0., .33, .67) + ndv * 1.1 + i.sd.x * .22 + i.uv.y * .5 + .55));
  alb = mix(alb, alb * .5 + ir * vec3f(.15, .13, .30), i.pr.z * (1. - ndv) * .8);
  let tr = (max(-ndl, 0.) * .85 + .15) * i.pr.y;
  let trc = alb * mix(vec3f(1.), vec3f(1.5, 1.4, .75), sat(i.pr.y) * (1. - i.pr.z));
  let aov = sat((vv.r - .5) * 6.) * mix(.4, 1., i.uv.y);
  let am = (amb(i.wp, n, vv.g, z) + amb(i.wp, -n, vv.g, z) * i.pr.y * .55 * vec3f(1.1, 1.15, .7) + side(i.wp, n, sat((vv.r - .5) * 4.), z) * .6) * (.3 + .7 * aov);
  var c = E * (.06 + ca * 1.5) * (alb * max(ndl, 0.) + trc * tr) + alb * am;
  let H = normalize(V + L);
  c += E * (pow(sat(dot(n, H)), 40.) * (.45 + ir * i.pr.z * 2.) + pow(sat(dot(n, H)), 9.) * .07) + am * ir * i.pr.z * pow(1. - ndv, 3.) * 1.5;
  c += E * trc * i.pr.y * pow(sat(dot(-V, L)), 3.) * 1.2;                             // sun shining through the blade
  c += alb * i.pr.w * (.5 + 3. * dot(am + E * .3, vec3f(.1, .5, .5)));
  let tw = pow(.5 + .5 * sin(g.cam.w * (.5 + i.sd.y * 1.4) + i.sd.x * 90.), 5.);      // whole-blade glints that twinkle slowly
  let m = ss(.2, .0, abs(i.uv.y - (.35 + .45 * i.sd.y))) * (1. - i.uv.x * i.uv.x);
  c += i.spc * i.pr.x * (.1 + tw) * m * (.35 + E.g * 1.2) * .6;
  return fin(fog(c, i.wp, z));
}
`;

// ---------------------------------------------------------------- animals
// Instance: a = orbit centre + radius, b = phase or seed, angular speed (signed), size, a second seed.
// Nothing is simulated: each animal's position is a function of time, and its heading is that function's derivative.
const W_ANIM = S_B + /*wgsl*/`
override KIND: f32 = 0.;    // 0 manta, 1 turtle, 2 gull, 3 whale
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) @interpolate(flat) sd: f32,
  @location(4) lt: f32, @location(5) aux: f32 };
@vertex fn vsFish(i: VI) -> VO {
  var o: VO;
  let s = i.b.x; let h = vec3f(hs(s), hs(s + .37), hs(s + .71));
  let R = i.a.w; let t = g.cam.w;
  let ta = t * i.b.y + i.b.w * 6.3 + (h.x - .5) * (26. / R);
  let ph = i.b.w * 17.;
  let P = i.a.xyz + vec3f(R * cos(ta), 2.2 * sin(3. * ta + ph), R * .6 * sin(ta));
  let T = normalize(vec3f(-R * sin(ta), 6.6 * cos(3. * ta + ph), R * .6 * cos(ta))) * sign(i.b.y);
  let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
  let off = S * ((h.y - .5) * 5. + sin(t * .6 + s * 40.) * .5) + Up * ((h.z - .5) * 3.2 + cos(t * .5 + s * 31.) * .4);
  var l = i.p * i.b.z * (.75 + .5 * h.z);
  l.z += sin(t * 9. + s * 50. + l.x * 5.) * .22 * (.25 * i.b.z - l.x);                 // the tail leads the wiggle
  let w = P + off + T * l.x + Up * l.y + S * l.z;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = T * i.n.x + Up * i.n.y + S * i.n.z; o.op = i.p; o.sd = s;
  o.lt = shadow1(w); o.aux = i.b.w;
  return o;
}
@fragment fn fsFish(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let z = zone(i.wp); let vv = vol(i.wp);
  // four liveries, one per school: silver, yellow, coral pink, electric blue
  let lv = fract(i.aux * 3.97) * 4.;
  var back = vec3f(.10, .22, .40); var belly = vec3f(.50, .68, .80);
  if (lv > 3.) { back = vec3f(.02, .16, .62); belly = vec3f(.20, .62, .98); }
  else if (lv > 2.) { back = vec3f(.72, .16, .22); belly = vec3f(.98, .52, .42); }
  else if (lv > 1.) { back = vec3f(.72, .50, .04); belly = vec3f(.98, .86, .28); }
  var alb = mix(belly, back, ss(-.05, .2, i.op.y));
  alb = mix(alb, vec3f(.95, .8, .3), step(.86, fract(i.sd * 7.7)) * .5);
  alb *= 1. - .5 * ss(.02, .0, abs(i.op.y - .02)) * ss(.3, -.2, i.op.x);               // lateral line
  let E = sunE(i.wp.y, z) * i.lt;
  var c = alb * (E * (.25 + .75 * sat(dot(n, L))) + amb(i.wp, n, vv.g, z) * 1.3);
  c += E * pow(sat(dot(n, normalize(V + L))), 24.) * 1.6 + vec3f(.3, .6, .7) * pow(1. - sat(dot(n, V)), 3.) * .25 * vv.g;
  return fin(fog(c, i.wp, z));
}
// anything that flies on wings: mantas, turtles (flippers) and gulls. The vertex aux is the span coordinate.
@vertex fn vsFlap(i: VI) -> VO {
  var o: VO;
  let t = g.cam.w; let R = i.a.w; let sz = i.b.z;
  let ta = t * i.b.y + i.b.x;
  let vy = select(2.5, .9, KIND > .5);
  let P = i.a.xyz + vec3f(R * cos(ta), vy * sin(2. * ta + i.b.w), R * .75 * sin(ta));
  let T = normalize(vec3f(-R * sin(ta), 2. * vy * cos(2. * ta + i.b.w), R * .75 * cos(ta))) * sign(i.b.y);
  var S = normalize(cross(vec3f(0., 1., 0.), T)); var Up = cross(T, S);
  let bank = -.28 * sign(i.b.y);
  let S2 = S * cos(bank) + Up * sin(bank); Up = Up * cos(bank) - S * sin(bank); S = S2;
  let u = i.n.w; let au = abs(u);
  var fq = 1.25; var am = .36; var lag = 1.2;
  if (KIND > 1.5) { fq = 7.5; am = .5 * (.12 + .88 * ss(-.3, .4, sin(t * .37 + i.b.w * 9.))); lag = .7; }   // gulls flap, then glide
  else if (KIND > .5) { fq = 2.1; am = .55; lag = .9; }
  let fp = t * fq + i.b.w * 5. - au * lag;
  var l = i.p;
  l.y += am * pow(au, 1.6) * sin(fp) - select(0., .1 * sin(t * fq + i.b.w * 5.), KIND < .5);
  let tail = ss(-.5, -1.9, l.z) * step(au, .001) * select(0., 1., KIND < .5);
  l.x += tail * sin(t * .8 + l.z * 2.) * .12;
  let sl = (am * 1.6 * pow(au, .6) * sin(fp) - am * lag * pow(au, 1.6) * cos(fp)) * sign(u);
  let ln = normalize(vec3f(i.n.x - sl * i.n.y, i.n.y + sl * i.n.x, i.n.z));
  let w = P + (S * l.x + Up * l.y + T * l.z) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * ln.x + Up * ln.y + T * ln.z; o.op = i.p; o.sd = i.b.w;
  o.lt = 1.; o.aux = u;
  return o;
}
// the humpback: a slow vertical wave runs down the body into the fluke; the long pectoral fins scull
@vertex fn vsWhale(i: VI) -> VO {
  var o: VO;
  let t = g.cam.w; let R = i.a.w; let sz = i.b.z;
  let ta = t * i.b.y + i.b.x;
  let P = i.a.xyz + vec3f(R * cos(ta), 3. * sin(2. * ta + i.b.w), R * .8 * sin(ta));
  let T = normalize(vec3f(-R * sin(ta), 6. * cos(2. * ta + i.b.w), R * .8 * cos(ta))) * sign(i.b.y);
  let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
  var l = i.p;
  let wt = ss(.1, -.5, l.z);
  let ph = t * 1.05 + i.b.w - l.z * 3.4;
  l.y += wt * wt * .09 * sin(ph) + abs(i.n.w) * .05 * sin(t * .6 + i.b.w);
  let sl = wt * wt * .09 * 3.4 * cos(ph);
  let ln = normalize(vec3f(i.n.x, i.n.y - sl * i.n.z, i.n.z + sl * i.n.y));
  let w = P + (S * l.x + Up * l.y + T * l.z) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * ln.x + Up * ln.y + T * ln.z; o.op = i.p; o.sd = i.b.w;
  o.lt = 1.; o.aux = i.n.w;
  return o;
}
@fragment fn fsBody(i: VO) -> @location(0) vec4f {
  let dist = length(i.wp - g.cam.xyz);
  let cau = caus(i.wp, dist);
  let tx = textureSample(tD, sR, i.op.xz * .9 + i.sd);
  let tx2 = textureSample(tD, sR, i.op.xz * 4.3 + i.sd * 3.);
  let wetK = 1. - ss(-.1, .4, i.wp.y);
  let ca = mix(vec3f(.4), cau, wetK);
  let n = normalize(i.n + (vec3f(tx.r, 0., tx.g) - vec3f(.5, 0., .5)) * .5); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let z = zone(i.wp); let vv = vol(i.wp);
  let top = ss(-.2, .25, normalize(i.n).y);
  let au = abs(i.op.x);
  var alb = vec3f(.1); var sheen = .5; var irid = 1.;
  if (KIND < .5) {
    // manta: charcoal back with pale shoulder flashes, grey belly with gill slits
    let gill = ss(.25, .0, abs(au - .13) * 8.) * ss(.04, .12, i.op.z) * ss(.34, .26, i.op.z) * ss(.2, .8, sin(i.op.z * 110.));
    var belly = vec3f(.13, .17, .21) * (.6 + .6 * tx.b) * (1. - .7 * gill);
    belly = mix(belly, vec3f(.05, .08, .11), sat(ss(.45, .9, au + tx.a * .35) + ss(-.1, -.4, i.op.z + tx.b * .2) * .7));
    var back = vec3f(.04, .065, .10) + vec3f(.10, .16, .2) * ss(.5, .75, tx.a);
    back = mix(back, vec3f(.36, .46, .52), ss(.25, .0, abs(au - .26) * 3.5 + abs(i.op.z - .12) * 5.) * .8);
    alb = mix(belly, back, top);
  } else if (KIND < 1.5) {
    // green turtle: scutes on the shell, pale plastron, mottled skin on head and flippers
    let limb = sat(abs(i.aux) * 4. + ss(.42, .5, i.op.z));
    let sc2 = ss(.0, .08, abs(fract(i.op.x * 3.2 + .5) - .5)) * ss(.0, .08, abs(fract(i.op.z * 3.6 + abs(i.op.x) * 1.2) - .5));
    let shell = mix(vec3f(.05, .045, .02), mix(vec3f(.22, .17, .06), vec3f(.30, .26, .10), tx.b), sc2);
    let skin = mix(vec3f(.07, .10, .06), vec3f(.36, .38, .24), ss(.42, .58, tx2.a));
    alb = mix(mix(vec3f(.52, .48, .28), shell, top), skin, limb);
    sheen = .35; irid = 0.;
  } else if (KIND < 2.5) {
    // gull: white, grey mantle, black wing tips, yellow bill
    alb = mix(vec3f(.90, .90, .88), vec3f(.42, .45, .50), top * ss(.06, .14, au));
    alb = mix(alb, vec3f(.03), ss(.74, .86, au));
    alb = mix(alb, vec3f(.9, .62, .08), ss(.44, .5, i.op.z));
    sheen = .1; irid = 0.;
  } else {
    // humpback: slate back, white throat with long pleats, white-edged pectoral fins and fluke, barnacle mottling
    let pleat = ss(.2, .8, sin(i.op.x * 130.)) * ss(.02, .2, i.op.z) * (1. - top);
    var belly = mix(vec3f(.62, .64, .62), vec3f(.30, .33, .34), pleat * .7) * (.7 + .4 * tx.b);
    belly = mix(belly, vec3f(.06, .08, .10), ss(.0, -.3, i.op.z));
    let back = mix(vec3f(.035, .05, .07), vec3f(.10, .13, .16), tx.a) + vec3f(.3) * ss(.72, .8, tx2.a) * .5;
    alb = mix(belly, back, top);
    alb = mix(alb, vec3f(.62, .64, .62), ss(.3, 1., abs(i.aux)) * .8);
    sheen = .6; irid = .3;
  }
  let E = sunE(i.wp.y, z) * shadow4(i.wp + n * .3);
  let ndv = sat(dot(n, V));
  let ir = .5 + .5 * cos(TAU * (vec3f(0., .33, .67) + ndv * 1.1 + tx.a * 1.5 + .55));
  let fillN = vec3f(n.x, abs(n.y) * .55 + .25, n.z);
  var c = alb * (E * sat(dot(n, L)) * (.3 + ca) + amb(i.wp, fillN, vv.g, z) * 1.1 + side(i.wp, n, 1., z) * .8);
  c += ir * vec3f(.35, .16, .6) * (.07 + .22 * tx.b) * (.4 + E.g * .2 * ca.g) * (1. - top * .3) * irid * wetK;
  c += E * pow(sat(dot(n, normalize(V + L))), 30.) * sheen * (.3 + ca);
  let sky = amb(i.wp, vec3f(0., 1., 0.), vv.g, z);
  c += (alb * sky * ca * .45 * (1. - top) + sky * pow(1. - ndv, 3.) * .35) * wetK;   // caustic light bouncing up onto the belly
  return fin(fog(c, i.wp, z));
}
// jellyfish: a = position + size, b = seed, drift, hue. The bell contracts quickly and relaxes slowly; additive glow.
@vertex fn vsJelly(i: VI) -> VO {
  var o: VO;
  let t = g.cam.w; let s = i.b.x;
  let ph = t * (.8 + .5 * hs(s)) + s * 40.;
  let pulse = pow(max(sin(ph), 0.), 2.5);
  let dep = max(-i.n.w, 0.);                                  // 0 on the bell, growing down each tentacle
  let rim = ss(.5, .0, i.p.y) * step(dep, 0.);
  var l = i.p;
  let sq = 1. - .30 * pulse * rim;
  l = vec3f(l.x * sq, l.y + .07 * pulse * rim, l.z * sq);
  let lg = ph - dep * 3.;
  l = vec3f(l.x * (1. - .25 * dep * max(sin(lg), 0.)) + dep * dep * sin(t * 1.3 + s * 30. + dep * 6.) * .30, l.y + dep * .10 * sin(lg),
            l.z * (1. - .25 * dep * max(sin(lg), 0.)) + dep * dep * cos(t * 1.1 + s * 17. + dep * 5.) * .30);
  var c = i.a.xyz;
  c += vec3f(sin(t * .05 + s * 9.) * 2.5, sin(t * .11 * i.b.y + s * 20.) * 3. + .5 * sin(ph - 1.), cos(t * .043 + s * 7.) * 2.5);
  let w = c + l * i.a.w;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = i.n.xyz; o.op = i.p; o.sd = i.b.z;
  o.lt = pulse; o.aux = dep;
  return o;
}
@fragment fn fsJelly(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n); let v = i.wp - g.cam.xyz; let d = length(v);
  let fr = pow(1. - abs(dot(n, v / d)), 2.);
  var col = mix(vec3f(.15, .75, 1.), vec3f(.95, .28, 1.), step(.5, i.sd));
  if (i.sd > .8) { col = vec3f(.35, 1., .55); }
  let ribs = .5 + .5 * sin(atan2(i.op.z, i.op.x) * 16.);
  let bell = (.10 + 1.5 * fr + .25 * ribs * ss(.5, .1, i.op.y)) * step(i.aux, 0.);
  let arms = .55 * (1. - .7 * sat(i.aux)) * step(.0001, i.aux);
  let c = col * (bell + arms) * (.55 + .6 * i.lt) * exp(-SIG.g * d) * ss(.5, 2., d) * g.ex.x;
  return vec4f(min(c, vec3f(8.)), 0.);
}
`;

// ---------------------------------------------------------------- the sea surface (both sides) and the sky
const W_SURF = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.wp = vec3f(g.cam.x + p.x * 9000., 0., g.cam.z + p.y * 9000.);
  o.cp = g.vp * vec4f(o.wp, 1.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  // the hit point comes from the pixel's own ray: interpolating across an 18 km quad would lose precision
  let nd = vec2f(i.cp.x * g.res.z * 2. - 1., 1. - i.cp.y * g.res.w * 2.);
  let V = normalize(g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w));
  let d = min(abs(g.cam.y / min(-abs(V.y), -1e-5)), 12000.);
  let wp = vec3f(g.cam.x + V.x * d, 0., g.cam.z + V.z * d);
  // three wave layers, each turned by a different angle so their tiles never line up into rows toward the horizon
  let q1 = vec2f(wp.x * .8253 - wp.z * .5646, wp.x * .5646 + wp.z * .8253); let q2 = vec2f(-wp.x * .3233 - wp.z * .9463, wp.x * .9463 - wp.z * .3233);
  let s1 = textureSample(tW, sR, q1 / 4.7 + .2).ba; let s2 = textureSample(tW, sR, q2 / 37. + .6).ba;
  // a slow, large noise warps the main layer and makes calm and ruffled patches, as wind does: no straight rows of highlights
  let wn = textureSample(tD, sR, wp.xz / 97. + g.cam.w * .0012);
  let s = textureSample(tW, sR, wp.xz / 13. + s2 * .35 + (wn.rg - .5) * 1.8).ba * (.35 + 1.3 * wn.a) + vec2f(.8253 * s1.x + .5646 * s1.y, -.5646 * s1.x + .8253 * s1.y) * .7 * (1.4 - wn.a) + vec2f(-.3233 * s2.x + .9463 * s2.y, -.9463 * s2.x - .3233 * s2.y) * .8;
  let fo = min(textureSample(tW, sR, wp.xz / 7.3 + .13).g, 1.) + min(textureSample(tW, sR, wp.zx / 2.9).g, 1.) * .7;   // foam breakup (the raw pattern peaks far above 1)
  let gm = textureSampleLevel(tM, sC, wp.xz / WORLD + .5, 0.);
  let z = zone(wp);
  if (g.cam.y < 0.) {
    // from below: Snell's window onto a bright sky, and outside it a mirror of the dim water beneath
    let sf = s * ss(260., 60., d);
    let n = normalize(vec3f(-sf.x * .8, -1., -sf.y * .8));
    let ci = sat(dot(V, -n));
    let k = 1. - 1.769 * (1. - ci * ci);
    let win = ss(0., .22, k);
    let sd = max(dot(refract(V, n, 1.33), g.sun.xyz), 0.);
    let fr = pow(1. - sqrt(max(k, 0.)), 5.);
    let sky = (vec3f(.30, .78, 1.) * 1.3 * clamp(1. + 3.8 * (sf.x * .6 - sf.y * .8), .25, 3.) + vec3f(1., .95, .85) * (pow(sd, 60.) * 1.3 + pow(sd, 500.) * 12.)) * (1. - fr);
    let refl = fogIn(wp, reflect(V, n), 300., z, g.sun.xyz) * 1.15;
    return vec4f(fin(fog(mix(refl, sky, win), wp, z)).rgb, 1.);
  }
  // from above: sky mirrored by Fresnel, sun glitter, foam where rock meets the sea; the reef shows through the rest
  let fine = textureSample(tW, sR, wp.xz / 1.7 + .4).ba;                                  // ripples that only matter close up
  let sf = s * ss(300., 20., d) + fine * ss(50., 6., d) * .7;                    // far water goes smooth: no visible tiling toward the horizon
  let n = normalize(vec3f(-sf.x * .9, 1., -sf.y * .9));
  let F = max(.02 + .98 * pow(1. - sat(dot(-V, n)), 5.), ss(12., 150., d) * .64);   // beyond a few boat lengths the surface is mostly sky
  var R = reflect(V, n); R = normalize(vec3f(R.x, abs(R.y) + .03 + .10 * ss(40., 200., d), R.z));   // far water mirrors the deeper blue higher up, not the pale horizon
  let refl = min(skyC(R, .3), vec3f(mix(3.5, 1.3, ss(6., 50., d))));                 // sparkle only at arm's length; further out it is noise             // glitter belongs to the near water; far out it would only alias
  let rr = length(wp.xz);
  let lm = lmap(wp);
  let shoreA = gm.g * (1. - ss(176., 180., max(abs(wp.x), abs(wp.z))));
  let shore = max(shoreA, lm.b * (.72 + .56 * wn.a));                              // the island's surf wanders: no stripe runs parallel to its beaches
  // foam: lace that thickens toward the rock, a swash line that breathes in and out, and a wash round the ketch's hull
  let kq = wp.xz - vec2f(${KETCH[0]}., ${KETCH[1]}.); let kc = vec2f(${Math.cos(KETCH[2]).toFixed(4)}, ${(-Math.sin(KETCH[2])).toFixed(4)});
  let ka = dot(kq, kc); let kb = dot(kq, vec2f(-kc.y, kc.x));
  let hull = ss(1.35, 1.0, length(vec2f(ka / 7.4, kb / 2.15))) * ss(.86, 1.0, length(vec2f(ka / 7.4, kb / 2.15)));
  let swash = ss(.07, .0, abs(shoreA - .34 - .07 * sin(g.cam.w * .7 + wp.x * .21 + wp.z * .17))) * .7;
  let lace = ss(.25, 1.1, fo);
  let foam = sat(sq2(ss(.26, .85, shore)) * (.03 + 1.3 * lace * lace) * (.35 + 1.3 * wn.a) + swash * .5 * lace + hull * ss(.2, .8, fo));   // broken by the lace, fading outward, none on open water
  let lit = SUNC * .75 + vec3f(.28, .36, .46);
  // The body colour of open water is exactly what the background pass draws where there is no seabed, so no edge shows
  // where one takes over from the other. Over the island's shelf it turns turquoise; off the shelf the surface is opaque.
  let hl = lm.a * 48. - 16.; let onl = step(.004, lm.a);
  var deep = fogIn(wp, V, 300., z, g.sun.xyz) * (.58 + .42 * vol(wp + V * 4.).g);
  deep *= mix(vec3f(1.), vec3f(1.5, 2.4, 1.7), sq2(ss(-16., -1., hl)) * onl);
  let far = ss(150., 185., rr) * (1. - onl * ss(-8., -3., hl)) * ss(40., 160., d) + ss(600., 2500., d);   // glass over the lagoon and over the island's shelf, opaque elsewhere
  var al = sat(F + foam + .06);
  var c = refl * F + vec3f(.95, .97, 1.) * lit * foam * (1. - F);
  c += deep * sat(far) * (1. - al); al = max(al, sat(far));
  let T = exp(-d * AIRK);
  return vec4f(min(c * T + HAZE * (1. - T) * al, vec3f(40.)), al);
}
// behind everything: sky above the horizon, and where no terrain was drawn the water as it looks at that distance
@vertex fn vsB(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.wp = g.cam.xyz + g.fwd.xyz + g.right.xyz * (p.x * g.right.w) + g.up.xyz * (p.y * g.up.w);
  o.cp = vec4f(p, 1e-7, 1.);
  return o;
}
@fragment fn fsB(i: VO) -> @location(0) vec4f {
  let rd = normalize(i.wp - g.cam.xyz);
  if (g.cam.y > 0.) {
    if (rd.y > 0.) { return fin(skyCol(rd)); }
    // open water from the air: the same body colour the surface shader uses where it is opaque
    let ts = g.cam.y / max(-rd.y, 1e-4); let sp = g.cam.xyz + rd * ts;
    return fin(air(fogIn(sp, rd, 300., zone(sp), g.sun.xyz) * (.58 + .42 * vol(sp + rd * 4.).g), ts));
  }
  let p = g.cam.xyz + rd * 240.;
  return fin(fog(vec3f(0.), p, zone(p)));
}
`;

// ---------------------------------------------------------------- sprites: bubbles (alpha) and drifting particles (additive)
const W_SPR = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) pr: vec4f, @location(2) wp: vec3f };
fn quad(i: u32) -> vec2f { return vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.; }
// a = vent position + size, b = seed, rise speed, column height, wobble
@vertex fn vsBub(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> VO {
  var o: VO; let q = quad(vi); let t = g.cam.w;
  let life = fract(t * b.y / b.z + b.x);
  let h = life * b.z;
  var p = a.xyz + vec3f(0., h, 0.);
  let wob = b.w * (.3 + h * .035);
  p.x += sin(t * 1.7 + b.x * 50. + h * .6) * wob + sin(h * .13 + b.x * 9.) * b.w * 2.;
  p.z += cos(t * 1.3 + b.x * 33. + h * .5) * wob + cos(h * .11 + b.x * 7.) * b.w * 2.;
  let sz = a.w * (.55 + .7 * life) * ss(0., .03, life) * ss(0., -1.2, p.y);            // bubbles swell as they rise, and end at the surface
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.uv = q; o.wp = p;
  o.pr = vec4f(b.x, sz, shadow1(p), 0.);
  return o;
}
@fragment fn fsBub(i: VO) -> @location(0) vec4f {
  let t = g.cam.w;
  let an = atan2(i.uv.y, i.uv.x + 1e-4);
  let big = ss(.04, .22, i.pr.y);
  let r = length(i.uv) / (.9 + big * .05 * sin(an * 3. + t * 5. + i.pr.x * 40.) + big * .02 * sin(an * 5. - t * 7.));   // big bubbles wobble
  let aa = fwidth(r) * 1.5;
  let disc = 1. - ss(1. - aa, 1., r);
  let rim = ss(.55, .98, r);
  let hl = ss(.34, .0, length(i.uv - vec2f(-.36, .42))) + .5 * ss(.2, .0, length(i.uv - vec2f(.4, -.42)));
  let z = zone(i.wp);
  let E = sunE(i.wp.y, z) * (.25 + .75 * i.pr.z);
  let hi = fogIn(i.wp, vec3f(0., 1., 0.), 80., z, g.sun.xyz) * 1.5;
  let lo = fogIn(i.wp, vec3f(0., -1., 0.), 80., z, g.sun.xyz);
  var c = mix(lo, hi, ss(-.5, .8, i.uv.y + rim * .4)) * (.5 + 1.2 * rim) + E * hl * 1.6;   // a bubble mirrors bright water above, dark below
  var al = disc * sat(.03 + rim * rim * rim * .9 + hl);
  let v = i.wp - g.cam.xyz; let d = length(v);
  let T = exp(-SIG.g * d) * ss(1.2, 3., d);
  c = c * T + fogIn(g.cam.xyz, v / d, d, z, g.sun.xyz) * (1. - T);
  al *= mix(.35, 1., T) * g.ex.x;
  return vec4f(min(max(c * al, vec3f(0.)), vec3f(20.)), al);
}
// chimney smoke: a = chimney top + puff size, b = phase, rise speed, column height, drift
@vertex fn vsSmoke(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> VO {
  var o: VO; let q = quad(vi); let t = g.cam.w;
  let life = fract(t * b.y / b.z + b.x);
  let h = life * b.z;
  // straight up at first, then leaning with the breeze and wandering; every chimney leans its own way
  let ln = life * life * b.z * b.w * .7; let da = hs(a.x * .37 + a.z * .71) * TAU; let dr = vec2f(cos(da), sin(da)) * .4 - vec2f(.75, -.4);
  let p = a.xyz + vec3f(dr.x * ln + sin(t * .6 + b.x * 40. + h * .5) * .7 * life, h, dr.y * ln + cos(t * .45 + b.x * 31. + h * .4) * .7 * life);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * a.w * (.8 + 5. * life);
  o.cp = g.vp * vec4f(w, 1.); o.uv = q; o.wp = p; o.pr = vec4f(b.x, life, 0., 0.);
  return o;
}
@fragment fn fsSmoke(i: VO) -> @location(0) vec4f {
  let n = textureSampleLevel(tD, sR, i.uv * .2 + i.pr.x * 7.3, 0.).a;
  let al = ss(1., .05, length(i.uv) + (n - .5) * .8) * ss(0., .12, i.pr.y) * (1. - i.pr.y) * (1. - i.pr.y) * .3;
  return vec4f(air(SUNC * .5 + vec3f(.30, .38, .52), length(i.wp - g.cam.xyz)) * al, al);
}
// marine snow: a box of particles that wraps around the camera
@vertex fn vsSnow(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> VO {
  var o: VO; let q = quad(vi); let t = g.cam.w;
  let B = 44.;
  var p = a.xyz * B + vec3f(t * .22, t * .05, t * .13) + .5 * vec3f(sin(t * .3 + a.x * 60.), sin(t * .23 + a.y * 50.), cos(t * .27 + a.z * 70.));
  p = g.cam.xyz + (fract((p - g.cam.xyz) / B + .5) - .5) * B;
  let d = length(p - g.cam.xyz);
  let sz = (.012 + .045 * a.w * a.w * a.w);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * max(sz, d * .0011);
  o.cp = g.vp * vec4f(w, 1.); o.uv = q; o.wp = p;
  let fade = ss(B * .5, B * .32, d) * ss(.6, 2.5, d) * min(1., sz / (d * .0011)) * ss(-.3, -1.5, p.y) * g.ex.x;
  let tw = .6 + .4 * sin(t * (1. + a.w * 2.) + a.x * 100.);
  o.pr = vec4f(fade * tw, shadow1(p), a.w, d);
  return o;
}
@fragment fn fsSnow(i: VO) -> @location(0) vec4f {
  let r = length(i.uv);
  let m = ss(1., .2, r);
  let z = zone(i.wp);
  let c = (sunE(i.wp.y, z) * i.pr.y * .8 + amb(i.wp, vec3f(0., 1., 0.), 1., z) * .3) * mix(vec3f(1.), vec3f(.7, 1., .9), i.pr.z);
  return vec4f(min(max(c * m * m * i.pr.x * exp(-SIG.g * i.pr.w), vec3f(0.)), vec3f(8.)), 0.);
}
`;
