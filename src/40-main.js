// ============================================================================
// Renderer, camera, collision and input
// ============================================================================
const $ = (id) => document.getElementById(id);
const canvas = $('c'), info = $('i'), body = document.body;
// loading bar: each stage glides it to `to` over about `ms` on the compositor, so it moves while this thread is busy
let loaded = 0, dead;
const say = (m, to, ms) => {
  if (!dead) $('s').textContent = m;
  const a = $('b').animate({ transform: [`scaleX(${loaded})`, `scaleX(${to})`] }, { duration: ms, fill: 'forwards', easing: 'cubic-bezier(.3,.5,.5,1)' });
  loaded = to;
  return new Promise((r) => { a.ready.then(() => setTimeout(r)); setTimeout(r, document.hidden ? 0 : 1e3); });
};
const fail = (m) => { throw new Error(m, { cause: 1 }); };
if (!navigator.gpu) fail('This scene needs WebGPU. Try a current Chrome or Edge.');
if (!adapter) fail('No WebGPU adapter found.');
const hasTS = adapter.features.has('timestamp-query');
const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
device.addEventListener('uncapturederror', (e) => console.error('GPU: ' + e.error.message));
// out of memory or a GPU timeout: reload one level lower, or on Low say what happened
device.lost.then((l) => {
  if (l.reason === 'destroyed') return;
  if (LV < 2 && !forced) { keep('lantern', LV + 1); location.reload(); }
  dead = body.className = 'l e'; $('s').textContent = 'The graphics device was lost. Reload the page to try again.';
});
const ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth32float';
const TU = GPUTextureUsage, BU = GPUBufferUsage, SS = GPUShaderStage;

const mod = (code, label) => {
  const m = device.createShaderModule({ code, label });
  m.getCompilationInfo().then((i) => { for (const x of i.messages) if (x.type === 'error') console.error(`WGSL ${label} ${x.lineNum}:${x.linePos} ${x.message}`); });
  return m;
};
const buf = (data, usage) => { const b = device.createBuffer({ size: (data.byteLength + 3) & ~3, usage: usage | BU.COPY_DST }); Q.writeBuffer(b, 0, data.buffer || data, data.byteOffset || 0, data.byteLength); return b; };
const tex = (w, h, format, usage, o = {}) => device.createTexture({ size: [w, h, o.d || 1], format, usage, mipLevelCount: o.mips || 1, sampleCount: o.samples || 1, dimension: o.d ? '3d' : '2d' });

// ---------------------------------------------------------------- static resources
const sRep = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: LV > 1 ? 1 : 8 });
const sClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const sCmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
const tShadow = tex(SHADOW, SHADOW, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tShadow2 = tex(SHADOW, SHADOW, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tLand = tex(1024, 1024, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);
const tDummy = tex(1, 1, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tWater = tex(WATER, WATER, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 5 });
const tDetail = tex(1024, 1024, 'rgba8unorm', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 11 });
const tVol = tex(NX / 2, NY / 2, 'rg8unorm', TU.TEXTURE_BINDING | TU.COPY_DST, { d: NZ / 2 });
const tMap = tex(512, 512, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);

const UB = new Float32Array(80), UBS = new Float32Array(80);
const ubo = device.createBuffer({ size: 320, usage: BU.UNIFORM | BU.COPY_DST }), uboS = device.createBuffer({ size: 320, usage: BU.UNIFORM | BU.COPY_DST }), uboS2 = device.createBuffer({ size: 320, usage: BU.UNIFORM | BU.COPY_DST });
const WT = new Float32Array(4), uboW = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST });

const VF = SS.VERTEX | SS.FRAGMENT;
const bgl0 = device.createBindGroupLayout({ entries: [
  { binding: 0, visibility: VF, buffer: {} },
  { binding: 1, visibility: VF, sampler: {} }, { binding: 2, visibility: VF, sampler: {} }, { binding: 3, visibility: VF, sampler: { type: 'comparison' } },
  { binding: 4, visibility: VF, texture: { sampleType: 'depth' } },
  { binding: 5, visibility: VF, texture: {} }, { binding: 6, visibility: VF, texture: {} },
  { binding: 7, visibility: VF, texture: { viewDimension: '3d' } }, { binding: 8, visibility: VF, texture: {} },
  { binding: 9, visibility: VF, texture: { sampleType: 'depth' } }, { binding: 10, visibility: VF, texture: {} }] });
const mkBG0 = (u, sh, sh2) => device.createBindGroup({ layout: bgl0, entries: [
  { binding: 9, resource: sh2.createView() }, { binding: 10, resource: tLand.createView() },
  { binding: 0, resource: { buffer: u } }, { binding: 1, resource: sRep }, { binding: 2, resource: sClamp }, { binding: 3, resource: sCmp },
  { binding: 4, resource: sh.createView() }, { binding: 5, resource: tWater.createView() }, { binding: 6, resource: tDetail.createView() },
  { binding: 7, resource: tVol.createView() }, { binding: 8, resource: tMap.createView() }] });
const bg0 = mkBG0(ubo, tShadow, tShadow2), bg0s = mkBG0(uboS, tDummy, tDummy), bg0s2 = mkBG0(uboS2, tDummy, tDummy);
const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });

const bglBlit = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.FRAGMENT, texture: {} }, { binding: 1, visibility: SS.FRAGMENT, sampler: {} }] });
const plBlit = device.createPipelineLayout({ bindGroupLayouts: [bglBlit] });
const mBlit = mod(W_BLIT, 'blit');
const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const OVER = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
const blitPipe = (entry, format, add) => device.createRenderPipeline({ layout: plBlit, vertex: { module: mBlit, entryPoint: 'vs' },
  fragment: { module: mBlit, entryPoint: entry, targets: [{ format, blend: add ? ADD : undefined }] } });
const pMip8 = blitPipe('fsMip', 'rgba8unorm'), pMip16 = blitPipe('fsMip', HDR), pDown0 = blitPipe('fsDown0', HDR), pDown = blitPipe('fsDown', HDR), pUp = blitPipe('fsUp', HDR, true);
const blitBG = (view) => device.createBindGroup({ layout: bglBlit, entries: [{ binding: 0, resource: view }, { binding: 1, resource: sClamp }] });
const colorAtt = (view, clear) => ({ view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] });

// vertex layouts
const A = (shaderLocation, offset, format) => ({ shaderLocation, offset, format });
const vbSolid = { arrayStride: 16, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'snorm8x4')] };
const ibSolid = { arrayStride: 48, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4'), A(4, 32, 'float32x4')] };
const ibLeaf = { arrayStride: 36, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4'), A(2, 32, 'unorm8x4')] };
const ibAnim = { arrayStride: 32, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4')] };
const ibBub = { arrayStride: 32, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4')] };
const ibSnow = { arrayStride: 16, stepMode: 'instance', attributes: [A(0, 0, 'float32x4')] };

// the scene uses reverse-Z: depth 1 at the near plane, 0 at infinity
const scenePipe = (m, vsE, fsE, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
  fragment: { module: m, entryPoint: fsE, targets: [{ format: HDR, blend: o.blend }], constants: o.fconstants },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: !o.blend, depthCompare: 'greater' }, multisample: { count: AA } });
const shadowPipe = (m, vsE, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 1.5 } });

await say('Compiling shaders…', 0.05, 300);
const mSolid = mod(W_SOLID, 'solid'), mLeaf = mod(W_LEAF, 'leaf'), mAnim = mod(W_ANIM, 'anim'), mSurf = mod(W_SURF, 'surface'), mSpr = mod(W_SPR, 'sprites');
const pTerrain = scenePipe(mSolid, 'vs', 'fs', [vbSolid, ibSolid], { cull: 'back' });
const pSolid = scenePipe(mSolid, 'vs', 'fs', [vbSolid, ibSolid]);
const pLeaf = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 9 } });
const pLeaf5 = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 5 } });
const pLeafS = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 3, FAR: 70 } });
const pLeafF = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 3 } });
const pFish = scenePipe(mAnim, 'vsFish', 'fsFish', [vbSolid, ibAnim]);
const flap = (k) => scenePipe(mAnim, k === 3 ? 'vsWhale' : 'vsFlap', 'fsBody', [vbSolid, ibAnim], { constants: { KIND: k }, fconstants: { KIND: k } });
const pManta = flap(0), pTurtle = flap(1), pGull = flap(2), pWhale = flap(3);
const pJelly = scenePipe(mAnim, 'vsJelly', 'fsJelly', [vbSolid, ibAnim], { blend: ADD });
const pSurf = scenePipe(mSurf, 'vs', 'fs', [], { strip: true, blend: OVER }), pBack = scenePipe(mSurf, 'vsB', 'fsB', [], { strip: true });
const pBub = scenePipe(mSpr, 'vsBub', 'fsBub', [ibBub], { strip: true, blend: OVER }), pSmoke = scenePipe(mSpr, 'vsSmoke', 'fsSmoke', [ibBub], { strip: true, blend: OVER });
const pSnow = scenePipe(mSpr, 'vsSnow', 'fsSnow', [ibSnow], { strip: true, blend: ADD });
const pGl = scenePipe(mLeaf, 'vsGl', 'fsGl', [ibBub], { strip: true, blend: ADD, constants: { ROWS: 7 } });
const pSolidSh = shadowPipe(mSolid, 'vs', [vbSolid, ibSolid]), pTerrSh = shadowPipe(mSolid, 'vs', [vbSolid, ibSolid], { cull: 'front' });
const pLeafSh = shadowPipe(mLeaf, 'vs', [ibLeaf], { strip: true, constants: { ROWS: 3 } });

const mWater = mod(W_WATER, 'water');
const pWater = device.createRenderPipeline({ layout: 'auto', vertex: { module: mWater, entryPoint: 'vs' }, fragment: { module: mWater, entryPoint: 'fs', targets: [{ format: HDR }] } });
const bgWater = device.createBindGroup({ layout: pWater.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uboW } }] });
const waterViews = [0, 1, 2, 3, 4].map((m) => tWater.createView({ baseMipLevel: m, mipLevelCount: 1 }));
const waterBG = waterViews.map((v) => blitBG(v));
const waterPass = waterViews.map((v) => ({ colorAttachments: [colorAtt(v, true)] }));

const mRays = mod(W_RAYS, 'rays'), mPost = mod(W_POST, 'post'), mRB = mod(W_RBLUR, 'rayblur');
const fsPipe = (m, format) => device.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format }] } });
const pRB = fsPipe(mRB, HDR), pRays = fsPipe(mRays, HDR), pPost = fsPipe(mPost, FMT);

// ---------------------------------------------------------------- sun and its shadow matrices (orthographic)
// One map covers the atoll, a second the island. Each is the view-projection of its own bake pass.
{
  const L = SUN, lr = [L[1], -L[0], 0], ll = hypot(...lr); lr[0] /= ll; lr[1] /= ll;
  const lu = [L[1] * lr[2] - L[2] * lr[1], L[2] * lr[0] - L[0] * lr[2], L[0] * lr[1] - L[1] * lr[0]];
  // centre c, half width R, depth range d0..d1 along the light
  const sunM = (c, R, d0, d1, o) => {
    const m = UBS, dot3 = (a) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    m[0] = lr[0] / R; m[4] = lr[1] / R; m[8] = lr[2] / R; m[12] = -dot3(lr) / R;
    m[1] = lu[0] / R; m[5] = lu[1] / R; m[9] = lu[2] / R; m[13] = -dot3(lu) / R;
    m[2] = -L[0] / (d1 - d0); m[6] = -L[1] / (d1 - d0); m[10] = -L[2] / (d1 - d0); m[14] = (d1 + dot3(L)) / (d1 - d0);
    m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
    for (let i = 0; i < 16; i++) UB[o + i] = m[i];
  };
  for (let i = 0; i < 3; i++) { UB[48 + i] = UBS[48 + i] = SUN[i]; }
  UBS[32] = 0; UBS[33] = -20; UBS[34] = 0; UBS[35] = 0; UBS[58] = 1; UBS[60] = 1;
  sunM([ISLE[0], 20, ISLE[1]], 232, -260, 260, 64); Q.writeBuffer(uboS2, 0, UBS);
  sunM([0, 0, 0], 226, -190, 150, 16); Q.writeBuffer(uboS, 0, UBS);
}

// ---------------------------------------------------------------- world generation
await say('Sculpting the seabed…', 0.25, 1200);
keep('lanternLoad', 1);                                        // a load in progress; leaving the page first is not a crash
addEventListener('pagehide', () => keep('lanternLoad', ''));
let D;
{
  const prims = primBuffer();
  const p = device.createComputePipeline({ layout: 'auto', compute: { module: mod(W_DENS, 'density'), entryPoint: 'main' } });
  const size = NX * NY * NZ * 4;
  const u = new ArrayBuffer(64), uu = new Uint32Array(u), uf = new Float32Array(u);
  uu[0] = NX; uu[1] = NY; uu[2] = NZ; uf[4] = OX; uf[5] = OY; uf[6] = OZ; uf[7] = VS;
  uu[8] = MESAS.length; uu[9] = ARCHES.length; uu[10] = HOLES.length; uu[11] = CLEARS.length; uu[12] = CAVES.length; uu[13] = RIFTS.length;
  const bu = buf(new Uint8Array(u), BU.UNIFORM), bp = buf(prims, BU.STORAGE);
  const bd = device.createBuffer({ size, usage: BU.STORAGE | BU.COPY_SRC }), br = device.createBuffer({ size, usage: BU.MAP_READ | BU.COPY_DST });
  const bg = device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bu } }, { binding: 1, resource: { buffer: bd } }, { binding: 2, resource: { buffer: bp } }] });
  const e = device.createCommandEncoder(), c = e.beginComputePass();
  c.setPipeline(p); c.setBindGroup(0, bg); c.dispatchWorkgroups(NX / 4, NY / 4, NZ / 4); c.end();
  e.copyBufferToBuffer(bd, 0, br, 0, size);
  Q.submit([e.finish()]);
  await br.mapAsync(GPUMapMode.READ);
  D = new Float32Array(br.getMappedRange().slice(0));
  br.unmap(); br.destroy(); bd.destroy();
  // Keep only rock that is connected to the seabed: each column's unbroken run up from the bottom is, and rock above a
  // gap is when it touches rock that is. A speck of noise hanging in the water would mesh as a small floating box.
  const S = NX * NY, Rk = new Uint8Array(D.length), O = [1, -1, NX, -NX, S, -S], b = new Uint8Array(NX), L = [];
  for (let i = 0; i < D.length;) { b.fill(1); for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++, i++) if (D[i] <= 0) b[x] = 0; else if (b[x]) Rk[i] = 1; else L.push(i); }
  for (let k = 1; k; L.reverse()) { k = 0; for (const i of L) if (!Rk[i] && O.some((o) => Rk[i + o])) Rk[i] = k = 1; }
  for (const i of L) if (!Rk[i]) D[i] = -D[i];
}
// Collision field: distance to rock at half resolution, in 1/50 m (> 0 inside rock, clamped to +-2.5 m). About 3 MB.
const HX = NX / 2, HY = NY / 2, HZ = NZ / 2, CG = new Int8Array(HX * HY * HZ);
{
  const S = NX * NY, at = (x, y, z) => D[x + NX * (y + NY * z)];
  for (let z = 1; z < HZ - 1; z++) for (let y = 1; y < HY - 1; y++) for (let x = 1; x < HX - 1; x++) {
    const i = x * 2 + NX * (y * 2 + NY * z * 2), d = D[i];
    const gx = at(x * 2 + 1, y * 2, z * 2) - at(x * 2 - 1, y * 2, z * 2), g = D[i + NX] - D[i - NX], gz = D[i + S] - D[i - S];
    CG[x + HX * (y + HY * z)] = round(clamp(d / max(sqrt(gx * gx + g * g + gz * gz) / 1.5, 0.05), -2.5, 2.5) * 50);
  }
}
await say('Carving canyons…', 0.32, 400);
const T = buildTerrain(D);
T.loA = T.lo.map((v, c) => T.hi[c] > 0.5 ? v : 1e9); T.loB = T.lo.map((v, c) => T.hi[c] > 0.5 ? 1e9 : v);   // cells that break the surface, and the rest
await say('Growing kelp…', 0.73, 2500);
const Wd = makeWorld(D, T);
D = T.smp = null;                                              // the generator's working memory goes with it
await say('Raising the island…', 0.86, 900);
const Ld = makeLand();

await say('Building set pieces…', 0.94, 1200);
const meshes = [meshChunk(1, 3), meshChunk(7, 3), meshChunk(13, 3), meshChunk(22, 3),
  meshLathe([[0, 0, 0.5], [0.34, 0, 0.6], [0.5, 0.2, 0.85], [0.6, 0.6, 1], [0.55, 0.95, 1], [0.47, 1.08, 1], [0.38, 1.1, 0.9], [0.3, 1.0, 0.45], [0.26, 0.6, 0.15], [0, 0.35, 0.05]], 18, 0.3, 9),
  meshLathe([[0, 0, 0.5], [0.2, 0, 0.6], [0.26, 0.5, 0.85], [0.4, 1.25, 1], [0.4, 1.42, 1], [0.33, 1.48, 0.9], [0.26, 1.38, 0.4], [0.18, 0.8, 0.12], [0, 0.5, 0.05]], 16, 0.35, 8),
  meshLathe([[0, 0, 0.5], [0.5, 0, 0.7], [0.72, 0.18, 1], [0.74, 0.38, 1], [0.62, 0.5, 0.9], [0.48, 0.42, 0.45], [0.4, 0.2, 0.15], [0, 0.14, 0.06]], 18, 0.25, 10),
  meshCoral(0), meshCoral(1), meshTubes()].map((m) => m.build());
meshes.push(meshFluke(), meshWreck().build(), meshManta().build(), meshFish().build(),
  meshChunk(3).build(), meshChunk(11).build(), meshChunk(29).build(), meshChunk(5, 3).build(), meshChunk(17, 3).build(), meshChunk(41, 3).build(), meshChunk(9, 1).build(),
  meshCoral(0, 1).build(), meshCoral(1, 1).build(), meshChunk(5, 2, 1).build(), meshChunk(17, 2, 1).build(), meshChunk(41, 2, 1).build(),
  meshCrystal(1).build(), meshCrystal(2).build(), meshColumn().build(), meshDrum().build(), meshBlock().build(), meshAmphora().build(), meshStarfish().build(), meshUrchin().build(),
  meshBoat(7, 1.9, 1.0, 1.0, { bow: 0.7, stern: 0.35, keel: 1 }).build(), meshRig(7, 1.0).build(), meshSails(7, 1.0).build(), meshBoat(1.7, 0.7, 0.2, 0.36, { open: true, bow: 0.22, stern: 0.1 }).build(),
  meshBuoy().build(), meshLighthouse().build(), meshAnchor().build(), Wd.chains[0].build(), Wd.chains[1].build(),
  meshTurtle().build(), meshGull().build(), meshWhale().build(), meshJelly().build(), ...Ld.meshes);
let nV = 0, nI = 0;
for (const m of meshes) { m.v0 = nV; m.i0 = nI; nV += m.nv; nI += m.ib.length; }
const allV = new Uint8Array(nV * 16), allI = new Uint32Array(nI);
for (const m of meshes) { allV.set(new Uint8Array(m.vb), m.v0 * 16); allI.set(m.ib, m.i0); }
const vbMesh = buf(allV, BU.VERTEX), ibMesh = buf(allI, BU.INDEX);
const vbTerrain = buf(new Uint8Array(T.vb), BU.VERTEX), ibTerrain = buf(T.ib, BU.INDEX);
const nSolid = Wd.solids.data.length / 12;
const solidData = new Float32Array((nSolid + 2) * 12); solidData.set(Wd.solids.data); solidData.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 14, 0, 1, 0], nSolid * 12);   // last two instances: identity, for the seabed and for the island's ground
const vbLand = buf(new Uint8Array(Ld.vb), BU.VERTEX), ibLand = buf(Ld.ib, BU.INDEX), nLandI = Ld.ib.length;
for (const q of Ld.groups) { q.buf = buf(q.data, BU.VERTEX); q.data = 0; }
const ibSmoke = buf(Ld.smoke, BU.VERTEX), nSmoke = Ld.smoke.length / 8;
Q.writeTexture({ texture: tLand }, Ld.map, { bytesPerRow: 4096 }, [1024, 1024]);
const ibSolids = buf(solidData, BU.VERTEX);
const ibChunk = Wd.chunks.map((c) => buf(c.data, BU.VERTEX)), ibProp = Wd.props.map((c) => buf(c.data, BU.VERTEX));
const ibBig = buf(new Uint8Array(Wd.big.buf), BU.VERTEX), ibBigF = buf(new Uint8Array(Wd.bigF.buf), BU.VERTEX), ibSmall = buf(new Uint8Array(Wd.small.buf), BU.VERTEX);
const ibFish = buf(Wd.fish, BU.VERTEX), ibBubbles = buf(Wd.bubbles, BU.VERTEX), ibSnowB = buf(Wd.snow, BU.VERTEX);
const ibGl = buf(Wd.glints, BU.VERTEX), nGl = Wd.glints.length / 8;
const nFish = Wd.fish.length / 8, nBub = Wd.bubbles.length / 8, nSnow = Wd.snow.length / 4;
// animals drawn one mesh at a time: [pipeline, mesh, instance buffer, count, in air]
const herd = [[pManta, 12, Wd.mantas, 0], [pTurtle, 43, Wd.turtles, 0], [pWhale, 45, Wd.whale, 0], [pGull, 44, Wd.gulls, 1]].map(([p, m, d, air]) => ({ p, m: meshes[m], b: buf(d, BU.VERTEX), n: d.length / 8, air }));
const JELLY = meshes[46], ibJelly = buf(Wd.jelly, BU.VERTEX), nJelly = Wd.jelly.length / 8, FISH = meshes[13];
Q.writeTexture({ texture: tVol }, Wd.volD, { bytesPerRow: NX, rowsPerImage: NY / 2 }, [NX / 2, NY / 2, NZ / 2]);
Q.writeTexture({ texture: tMap }, Wd.gm, { bytesPerRow: 2048 }, [512, 512]);
const STATS = { land: nLandI / 3, landThings: Ld.groups.reduce((s, c) => s + c.n, 0), tris: T.ib.length / 3, leaves: Wd.big.n + Wd.small.n, chunks: Wd.chunks.reduce((s, c) => s + c.n, 0), props: Wd.props.reduce((s, c) => s + c.n, 0), solids: nSolid, fish: nFish, bubbles: nBub, glints: nGl };

// ---------------------------------------------------------------- one-time bakes: detail texture with mips, the shadow map
{
  const p = fsPipe(mod(W_DETAIL, 'detail'), 'rgba8unorm');
  const e = device.createCommandEncoder();
  let r = e.beginRenderPass({ colorAttachments: [colorAtt(tDetail.createView({ baseMipLevel: 0, mipLevelCount: 1 }), true)] });
  r.setPipeline(p); r.draw(3); r.end();
  for (let i = 1; i < 11; i++) {
    r = e.beginRenderPass({ colorAttachments: [colorAtt(tDetail.createView({ baseMipLevel: i, mipLevelCount: 1 }), true)] });
    r.setPipeline(pMip8); r.setBindGroup(0, blitBG(tDetail.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }))); r.draw(3); r.end();
  }
  r = e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
  r.setBindGroup(0, bg0s);
  r.setPipeline(pTerrSh);
  r.setVertexBuffer(0, vbTerrain); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibTerrain, 'uint32');
  r.drawIndexed(T.ib.length, 1, 0, 0, nSolid);
  r.setPipeline(pSolidSh); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  for (let i = 0; i < Wd.solids.ranges.length; i++) { const g = Wd.solids.ranges[i]; if (g[1]) r.drawIndexed(meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]); }
  // small rocks, sponges and corals only on High: tens of millions of triangles in one pass
  if (!LV) for (let i = 0; i < NCHUNK; i++) { r.setVertexBuffer(1, ibChunk[i]); r.drawIndexed(meshes[14 + i].ib.length, Wd.chunks[i].n, meshes[14 + i].i0, meshes[14 + i].v0, 0); }
  if (!LV) for (let i = 0; i < 6; i++) if (Wd.props[i].n) { const m = meshes[PROPS[i]]; r.setVertexBuffer(1, ibProp[i]); r.drawIndexed(m.ib.length, Wd.props[i].n, m.i0, m.v0, 0); }
  r.setPipeline(pLeafSh); r.setVertexBuffer(0, ibBig); r.draw(6, Wd.big.n);
  r.end();
  // the island's own shadow map: its ground and everything standing on it
  r = e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tShadow2.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
  r.setBindGroup(0, bg0s2); r.setPipeline(pSolidSh);
  r.setVertexBuffer(0, vbLand); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibLand, 'uint32'); r.drawIndexed(nLandI, 1, 0, 0, nSolid + 1);
  r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  for (const q of Ld.groups) { const m = meshes[q.id]; r.setVertexBuffer(1, q.buf); r.drawIndexed(m.ib.length, q.n, m.i0, m.v0, 0); }
  r.end();
  Q.submit([e.finish()]);
}
for (const o of [Wd.big, Wd.bigF, Wd.small, ...Wd.chunks, ...Wd.props]) o.buf = o.data = 0;   // the GPU has its own copies now
Wd.glints = Wd.volD = Wd.gm = T.vb = T.ib = T.wp = T.wn = Ld.vb = Ld.ib = Ld.map = 0;

// ---------------------------------------------------------------- render targets (rebuilt on resize)
// The scene is drawn at `pix` pixels and scaled up to the window. frame() tunes `pix` and the draw-distance scale `det`
// toward 60 fps; both start where the last visit left them.
const PIXMAX = 2560 * 1440, PIXMIN = mob ? 25e4 : 45e4, DETMIN = 0.4;
let W = 0, H = 0, DW = 0, DH = 0, pix = max(+SV[1] || (LV > 1 ? 41e4 : mob ? 1280 * 720 : 17e5), PIXMIN), det = clamp(+SV[2] || 1, DETMIN, 1), dynN = 0, dynT = 0, dynG = 0, dynGN = 0, dynBad = 0, dynOk = 0, dynWait = 3, pin = false;
let passScene, passRays, passBlur, bgBlur, passPost, bgRays, bgPost, bloomPass = [], bloomBG = [], targets = [];
const NB = 6;
function resize() {
  DW = max(2, round(canvas.clientWidth * devicePixelRatio)); DH = max(2, round(canvas.clientHeight * devicePixelRatio));
  const s = min(1, sqrt(pix / (DW * DH)));
  const w = max(2, round(DW * s) & ~1), h = max(2, round(DH * s) & ~1);
  if (w === W && h === H) return;
  dynN = dynG = dynGN = 0; dynT = -300;                       // let the new size settle before measuring again
  W = w; H = h; canvas.width = W; canvas.height = H;
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  for (const t of targets) t.destroy();
  const tMS = tex(AA > 1 ? W : 1, H, HDR, TU.RENDER_ATTACHMENT, { samples: AA }), tDp = tex(W, H, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { samples: AA });
  const tRes = tex(W, H, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay = tex(W / 2, H / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay2 = tex(W / 2, H / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
  targets = [tMS, tDp, tRes, tRay, tRay2];
  const bl = [];
  for (let i = 0; i < NB; i++) { const t = tex(max(1, W >> (i + 1)), max(1, H >> (i + 1)), HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING); bl.push(t); targets.push(t); }
  const vDp = tDp.createView(), vRes = tRes.createView(), vRay = tRay.createView(), vRay2 = tRay2.createView(), vBl = bl.map((t) => t.createView());
  passScene = { colorAttachments: [{ view: AA > 1 ? tMS.createView() : vRes, resolveTarget: AA > 1 ? vRes : undefined, loadOp: 'clear', storeOp: AA > 1 ? 'discard' : 'store', clearValue: [0, 0, 0, 1] }],
    depthStencilAttachment: { view: vDp, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' } };
  passRays = { colorAttachments: [colorAtt(vRay, true)] };
  passBlur = { colorAttachments: [colorAtt(vRay2, true)] };
  bgBlur = device.createBindGroup({ layout: pRB.getBindGroupLayout(0), entries: [{ binding: 0, resource: vRay }] });
  passPost = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
  bgRays = device.createBindGroup({ layout: pRays.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sRep }, { binding: 2, resource: sCmp },
    { binding: 3, resource: tShadow.createView() }, { binding: 4, resource: tWater.createView() }, { binding: 5, resource: vDp }, { binding: 6, resource: tVol.createView() }, { binding: 7, resource: sClamp }] });
  bgPost = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sClamp }, { binding: 2, resource: vRes },
    { binding: 3, resource: vRay2 }, { binding: 4, resource: vBl[0] }, { binding: 5, resource: vDp }] });
  bloomPass = []; bloomBG = [];
  for (let i = 0; i < NB; i++) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i], true)] }); bloomBG.push(blitBG(i ? vBl[i - 1] : vRes)); }      // down: scene -> b0 -> ... -> b5
  for (let i = NB - 1; i > 0; i--) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i - 1], false)] }); bloomBG.push(blitBG(vBl[i])); }             // up: b5 -> ... -> b0, additive
  UB[52] = W; UB[53] = H; UB[54] = 1 / W; UB[55] = 1 / H;
}
resize();
addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);                    // also catches a page that was laid out at zero size while loading

// ---------------------------------------------------------------- GPU timing
let qs, qResolve, qRead = [], tsBegin, tsEnd;
// per-frame float state lives in one preallocated array, so the frame loop allocates no heap numbers
const F = new Float64Array(40), P6 = new Float64Array(6);
const CX = 0, CY = 1, CZ = 2, YAW = 3, PIT = 4, FX = 5, FY = 6, FZ = 7, RX = 8, RZ = 9, UX = 10, UY = 11, UZ = 12, VX = 13, VY = 14, VZ = 15, TIME = 16, FLT = 17, LAST = 18, GPU = 19, HUDT = 20, MX = 22, MY = 23, MZ = 24, EXPOS = 25, WET = 26, SIDE = 27, ZONE = 28;
if (hasTS) {
  qs = device.createQuerySet({ type: 'timestamp', count: 2 });
  qResolve = device.createBuffer({ size: 16, usage: BU.QUERY_RESOLVE | BU.COPY_SRC });
  for (let i = 0; i < 6; i++) {
    const b = device.createBuffer({ size: 16, usage: BU.MAP_READ | BU.COPY_DST });
    const o = { b, busy: false, done: null };
    o.done = () => {
      const a = new BigInt64Array(b.getMappedRange());
      const ms = Number(a[1] - a[0]) / 1e6; F[GPU] = ms; b.unmap(); o.busy = false;
      if (dynT > 0 && ms > 0 && ms < 1e3) { dynG += ms; dynGN++; }
    };
    qRead.push(o);
  }
  tsBegin = { querySet: qs, beginningOfPassWriteIndex: 0 }; tsEnd = { querySet: qs, endOfPassWriteIndex: 1 };
}

// ---------------------------------------------------------------- frame
let hud = false;
let kf = 0, kb = 0, kl = 0, kr = 0, ku = 0, kd = 0, ks = 0, mdx = 0, mdy = 0, lkx = 0, lky = 0, l2x = 0, l2y = 0, hN = 0, hMax = 0, hMin = 1e9, hPer = 1e9, hLate = 0, hTot = 0, tId = -1, tN = 0, tx0 = 0, ty0 = 0, tx = 0, ty = 0;
const TANH = 0.6, NEAR = 0.1, EXPO = 0.62, EXPO_AIR = 0.37, RAYS = 0.54;
const submitList = [null];
const rowOrd = new Uint8Array(CELLS), rowOrdL = new Uint8Array(LCELLS);
// the grid drawCells works on: the atoll's by default, the island's while its things are drawn
let gN = CELLS, gW = CELLW, gX = OX, gZ = OZ, gOrd = rowOrd, gInst = nSolid, gFix = false;
const order = (ord, n, c) => { let cr = c | 0; cr = cr < 0 ? 0 : cr > n - 1 ? n - 1 : cr; let k = 0; ord[k++] = cr; for (let d = 1; d < n; d++) { if (cr - d >= 0) ord[k++] = cr - d; if (cr + d < n) ord[k++] = cr + d; } };
// Draws the cells of a cell-sorted buffer that are in view and within [minD, maxD) (scaled by `det`, except for the
// terrain) as merged runs, nearest rows first.
function drawCells(r, start, lo, hi, mar, indexed, verts, minD, maxD) {
  const cx = F[CX], cy = F[CY], cz = F[CZ], fx = F[FX], fy = F[FY], fz = F[FZ], rx = F[RX], rz = F[RZ], ux = F[UX], uy = F[UY], uz = F[UZ];
  const ds = indexed === 1 || gFix ? 1 : det * det;
  const txa = TANH * W / H, hw = gW * 0.5, ex = hw + mar, min2 = minD * minD * ds, max2 = maxD * maxD * ds;
  for (let k = 0; k < gN; k++) {
    const rw = gOrd[k], row = rw * gN, pz = gZ + (rw + 0.5) * gW - cz, hz = max(abs(pz) - hw, 0);
    let run = -1;
    for (let x = 0; x <= gN; x++) {
      const c = row + x; let v = false;
      if (x < gN) {
        const l = lo[c], h = hi[c];
        if (l <= h) {
          const px = gX + (x + 0.5) * gW - cx, py = (l + h) * 0.5 - cy, ey = (h - l) * 0.5 + mar, hx = max(abs(px) - hw, 0), h2 = hx * hx + hz * hz;
          if (h2 < max2 && h2 >= min2) {
            const lim = px * fx + py * fy + pz * fz + ex * abs(fx) + ey * abs(fy) + ex * abs(fz);
            if (lim >= 0 && abs(px * rx + pz * rz) - ex * (abs(rx) + abs(rz)) <= lim * txa) v = abs(px * ux + py * uy + pz * uz) - ex * (abs(ux) + abs(uz)) - ey * abs(uy) <= lim * TANH;
          }
        }
      }
      if (v) { if (run < 0) run = c; } else if (run >= 0) {
        const a = start[run], n = start[c] - a;
        if (n > 0) { if (indexed === 1) r.drawIndexed(n * 6, 1, a * 6, 0, gInst); else if (indexed) r.drawIndexed(indexed.ib.length, n, indexed.i0, indexed.v0, a); else r.draw(verts, n, 0, a); }
        run = -1;
      }
    }
  }
}
function drawHerd(r, air) { for (const h of herd) if (h.air === air) { r.setPipeline(h.p); r.setVertexBuffer(1, h.b); r.drawIndexed(h.m.ib.length, h.n, h.m.i0, h.m.v0, 0); } }
let render = () => {
  // camera basis (the right vector stays horizontal)
  const cx = F[CX], cy = F[CY], cz = F[CZ], pitch = F[PIT], yaw = F[YAW];
  const cp = cos(pitch), fy = sin(pitch), rx = cos(yaw), rz = sin(yaw), fx = cp * rz, fz = -cp * rx;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  F[FX] = fx; F[FY] = fy; F[FZ] = fz; F[RX] = rx; F[RZ] = rz; F[UX] = ux; F[UY] = uy; F[UZ] = uz;
  const asp = W / H, sx = 1 / (TANH * asp), sy = 1 / TANH, m = UB, above = cy > 0;
  m[0] = rx * sx; m[4] = 0; m[8] = rz * sx; m[12] = -(rx * cx + rz * cz) * sx;
  m[1] = ux * sy; m[5] = uy * sy; m[9] = uz * sy; m[13] = -(ux * cx + uy * cy + uz * cz) * sy;
  m[2] = 0; m[6] = 0; m[10] = 0; m[14] = NEAR;
  m[3] = fx; m[7] = fy; m[11] = fz; m[15] = -(fx * cx + fy * cy + fz * cz);
  m[32] = cx; m[33] = cy; m[34] = cz; m[35] = F[TIME];
  m[36] = rx; m[37] = 0; m[38] = rz; m[39] = TANH * asp;
  m[40] = ux; m[41] = uy; m[42] = uz; m[43] = TANH;
  m[44] = fx; m[45] = fy; m[46] = fz; m[47] = NEAR;
  const zx = cx - PURPLE[0], zz = cz - PURPLE[1]; let zt = (46 - sqrt(zx * zx + zz * zz)) / 18; zt = zt < 0 ? 0 : zt > 1 ? 1 : zt;
  m[51] = F[ZONE] = above ? 0 : zt * zt * (3 - 2 * zt);
  m[56] = F[EXPOS]; m[57] = RAYS; m[58] = det; m[59] = F[WET]; m[60] = above ? 0 : 1;
  Q.writeBuffer(ubo, 0, UB);
  WT[0] = F[TIME]; Q.writeBuffer(uboW, 0, WT);

  order(rowOrd, CELLS, floor((cz - OZ) / CELLW)); order(rowOrdL, LCELLS, floor((cz - LO) / LCW));
  const e = device.createCommandEncoder();
  let slot = null;
  if (hasTS) { for (let i = 0; i < qRead.length; i++) if (!qRead[i].busy) { slot = qRead[i]; break; } }
  waterPass[0].timestampWrites = slot ? tsBegin : undefined;
  passPost.timestampWrites = slot ? tsEnd : undefined;
  // animated water texture and its mips
  let r = e.beginRenderPass(waterPass[0]); r.setPipeline(pWater); r.setBindGroup(0, bgWater); r.draw(3); r.end();
  for (let i = 1; i < 5; i++) { r = e.beginRenderPass(waterPass[i]); r.setPipeline(pMip16); r.setBindGroup(0, waterBG[i - 1]); r.draw(3); r.end(); }
  // scene: rock, things, animals, plants, then whatever blends
  r = e.beginRenderPass(passScene);
  r.setBindGroup(0, bg0);
  r.setPipeline(pTerrain); r.setVertexBuffer(0, vbTerrain); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibTerrain, 'uint32');
  // from the air, rock that stands out of the water is drawn at any distance, the drowned reef only while it can be seen through the surface
  if (above) { drawCells(r, T.start, T.loA, T.hi, 1.5, 1, 0, 0, 1200); drawCells(r, T.start, T.loB, T.hi, 1.5, 1, 0, 0, 300); }
  else drawCells(r, T.start, T.lo, T.hi, 1.5, 1, 0, 0, 240);
  r.setPipeline(pSolid); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  const rg = Wd.solids.ranges;
  for (let i = 0; i < rg.length; i++) { const g = rg[i]; if (g[1]) r.drawIndexed(meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]); }
  for (let i = 0; i < NCHUNK; i++) {
    const c = Wd.chunks[i], big = i > 2 && i < 6; r.setVertexBuffer(1, ibChunk[i]);
    drawCells(r, c.start, c.lo, c.hi, 3, meshes[14 + i], 0, 0, i > 5 ? 30 : big ? 40 : 96);
    if (big) drawCells(r, c.start, c.lo, c.hi, 3, meshes[20 + i], 0, 40, 150);
  }
  for (let i = 0; i < PROPS.length; i++) {
    const id = PROPS[i], lod = id === 7 || id === 8, p = Wd.props[i], far = id > 30 ? 46 : 110; r.setVertexBuffer(1, ibProp[i]);
    drawCells(r, p.start, p.lo, p.hi, 3, meshes[id], 0, 0, lod ? 6 : far);
    if (lod) drawCells(r, p.start, p.lo, p.hi, 3, meshes[id + 14], 0, 6, far);
  }
  // the island: its ground, then everything standing on it, trees in three levels of detail
  const ix = cx - ISLE[0], iz = cz - ISLE[1], landOn = above || ix * ix + iz * iz < 96100;
  if (landOn) {
    gN = LCELLS; gW = LCW; gX = gZ = LO; gOrd = rowOrdL; gInst = nSolid + 1; gFix = true;
    r.setPipeline(pTerrain); r.setVertexBuffer(0, vbLand); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibLand, 'uint32');
    drawCells(r, Ld.start, Ld.lo, Ld.hi, 2, 1, 0, 0, above ? 3000 : 260);
    r.setPipeline(pSolid); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    const far = above ? 3000 : 260;
    for (let i = 0; i < Ld.groups.length; i++) {
      const q = Ld.groups[i], lod = LANDLOD[q.id]; r.setVertexBuffer(1, q.buf);
      if (lod) {
        const d1 = LOD1 * det, d2 = LOD2 * det;
        drawCells(r, q.start, q.lo, q.hi, q.mar, meshes[q.id], 0, 0, d1); drawCells(r, q.start, q.lo, q.hi, q.mar, meshes[lod[0]], 0, d1, d2); drawCells(r, q.start, q.lo, q.hi, q.mar, meshes[lod[1]], 0, d2, far);
      } else drawCells(r, q.start, q.lo, q.hi, q.mar, meshes[q.id], 0, 0, q.veg ? min(far, 420 * det) : far);   // bushes and shore rocks are the first to go
    }
    gN = CELLS; gW = CELLW; gX = OX; gZ = OZ; gOrd = rowOrd; gInst = nSolid; gFix = false;
    r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  }
  drawHerd(r, 0); drawHerd(r, 1);
  if (!above || cy < 30) { r.setPipeline(pFish); r.setVertexBuffer(1, ibFish); r.drawIndexed(FISH.ib.length, nFish, FISH.i0, FISH.v0, 0); }
  // kelp and plants: 9-row blades up close, 5 rows mid-range, a decimated wider set far away
  r.setPipeline(pLeaf); r.setVertexBuffer(0, ibBig); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 18, 0, 24);
  r.setPipeline(pLeaf5); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 10, 24, 58);
  r.setPipeline(pLeafF); r.setVertexBuffer(0, ibBigF); drawCells(r, Wd.bigF.start, Wd.bigF.lo, Wd.bigF.hi, 5, false, 6, 58, 150);
  r.setPipeline(pLeafS); r.setVertexBuffer(0, ibSmall); drawCells(r, Wd.small.start, Wd.small.lo, Wd.small.hi, 1.5, false, 6, 0, 70);
  r.setPipeline(pBack); r.draw(4);
  // seen from below the surface is opaque and goes first; seen from above it is glass laid over everything under it
  if (!above) { r.setPipeline(pSurf); r.draw(4); }
  r.setPipeline(pJelly); r.setVertexBuffer(0, vbMesh); r.setVertexBuffer(1, ibJelly); r.setIndexBuffer(ibMesh, 'uint32'); r.drawIndexed(JELLY.ib.length, nJelly, JELLY.i0, JELLY.v0, 0);
  r.setPipeline(pBub); r.setVertexBuffer(0, ibBubbles); r.draw(4, nBub);
  r.setPipeline(pGl); r.setVertexBuffer(0, ibGl); r.draw(4, nGl);
  r.setPipeline(pSnow); r.setVertexBuffer(0, ibSnowB); r.draw(4, nSnow);
  if (above) { r.setPipeline(pSurf); r.draw(4); r.setPipeline(pSmoke); r.setVertexBuffer(0, ibSmoke); r.draw(4, nSmoke); }
  r.end();
  // light shafts, their blur, bloom
  r = e.beginRenderPass(passRays); r.setPipeline(pRays); r.setBindGroup(0, bgRays); r.draw(3); r.end();
  r = e.beginRenderPass(passBlur); r.setPipeline(pRB); r.setBindGroup(0, bgBlur); r.draw(3); r.end();
  for (let i = 0; i < bloomPass.length; i++) {
    r = e.beginRenderPass(bloomPass[i]); r.setPipeline(i === 0 ? pDown0 : i < NB ? pDown : pUp); r.setBindGroup(0, bloomBG[i]); r.draw(3); r.end();
  }
  passPost.colorAttachments[0].view = ctx.getCurrentTexture().createView();
  r = e.beginRenderPass(passPost); r.setPipeline(pPost); r.setBindGroup(0, bgPost); r.draw(3); r.end();
  if (slot) { e.resolveQuerySet(qs, 0, 2, qResolve, 0); e.copyBufferToBuffer(qResolve, 0, slot.b, 0, 16); }
  submitList[0] = e.finish();
  Q.submit(submitList);
  if (slot) { slot.busy = true; slot.b.mapAsync(GPUMapMode.READ).then(slot.done); }
};

// ---------------------------------------------------------------- collision: the camera is a sphere that slides along rock
// CS[j] = distance to rock (metres, > 0 inside) at the camera + CE[3j..3j+2]: the centre, then +-0.75 m on each axis
const CE = new Float64Array([0, 0, 0, .75, 0, 0, -.75, 0, 0, 0, .75, 0, 0, -.75, 0, 0, 0, .75, 0, 0, -.75]), CS = new Float64Array(7);
const cgv = (x, y, z) => CG[x + HX * (y + HY * z)];
function sd(j) {
  let x = (F[CX] + CE[j * 3] - OX) / (VS * 2), y = (F[CY] + CE[j * 3 + 1] - OY) / (VS * 2), z = (F[CZ] + CE[j * 3 + 2] - OZ) / (VS * 2);
  x = x < 0 ? 0 : x > HX - 1.001 ? HX - 1.001 : x; y = y < 0 ? 0 : y > HY - 1.001 ? HY - 1.001 : y; z = z < 0 ? 0 : z > HZ - 1.001 ? HZ - 1.001 : z;
  const ix = x | 0, iy = y | 0, iz = z | 0, u = x - ix, v = y - iy, a = cgv(ix, iy, iz), b = cgv(ix, iy + 1, iz), c = cgv(ix, iy, iz + 1), d = cgv(ix, iy + 1, iz + 1);
  const p = a + (cgv(ix + 1, iy, iz) - a) * u, q = b + (cgv(ix + 1, iy + 1, iz) - b) * u, r = c + (cgv(ix + 1, iy, iz + 1) - c) * u, s = d + (cgv(ix + 1, iy + 1, iz + 1) - d) * u;
  const e = p + (q - p) * v; CS[j] = (e + (r + (s - r) * v - e) * (z - iz)) / 50;
}
// Moves the camera by F[MX..MZ] in steps shorter than its radius (so it cannot pass through thin rock), pushing it back
// out after each step and removing the velocity that points into the rock.
const CR = 0.55;
function collide() {
  const n = floor(sqrt(F[MX] * F[MX] + F[MY] * F[MY] + F[MZ] * F[MZ]) / 0.4) + 1;
  for (let i = 0; i < n; i++) {
    F[CX] += F[MX] / n; F[CY] += F[MY] / n; F[CZ] += F[MZ] / n;
    for (let k = 0; k < 2; k++) {
      sd(0); const s = CS[0] + CR; if (s <= 0) break;
      for (let j = 1; j < 7; j++) sd(j);
      let gx = CS[1] - CS[2], gy = CS[3] - CS[4], gz = CS[5] - CS[6]; const l = sqrt(gx * gx + gy * gy + gz * gz);
      if (l < 0.05) break;                                     // no gradient: deep inside rock
      gx /= l; gy /= l; gz /= l; const vn = F[VX] * gx + F[VY] * gy + F[VZ] * gz;
      F[CX] -= gx * s; F[CY] -= gy * s; F[CZ] -= gz * s;
      if (vn > 0) { F[VX] -= gx * vn; F[VY] -= gy * vn; F[VZ] -= gz * vn; }
    }
  }
}
function aim() {
  const dx = P6[3] - P6[0], dy = P6[4] - P6[1], dz = P6[5] - P6[2];
  F[CX] = P6[0]; F[CY] = P6[1]; F[CZ] = P6[2]; F[VX] = F[VY] = F[VZ] = 0;
  F[YAW] = atan2(dx, -dz); F[PIT] = atan2(dy, sqrt(dx * dx + dz * dz));
}
const lookAt = (x, y, z, tx2, ty2, tz2) => { P6[0] = x; P6[1] = y; P6[2] = z; P6[3] = tx2; P6[4] = ty2; P6[5] = tz2; aim(); };
let nameT = 0;
const goPose = (i, quiet) => {
  const p = POSES[i]; lookAt(p[0], p[1], p[2], p[3], p[4], p[5]);
  F[SIDE] = p[1] > 0 ? 1 : -1; F[EXPOS] = p[1] > 0 ? EXPO_AIR : EXPO; F[WET] = 0;
  if (quiet) return;
  const n = $('n'); n.firstChild.textContent = p[7]; n.lastChild.textContent = p[8]; n.className = 'on';
  clearTimeout(nameT); nameT = setTimeout(() => { n.className = ''; }, 2600);
};

let menu = true, onCross = null;
function frame(now) {
  requestAnimationFrame(frame);
  const dtr = now - F[LAST]; F[LAST] = now;
  let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;
  // Dynamic resolution toward 60 fps: once a second (every 0.4 s behind the menu) scale the load by k
  // (not while the page has no real size yet: a tab laid out at 0 x 0 would tune itself down to nothing)
  if (!pin && DW * DH > 4e4 && dtr < 1e3 && (dynT += dtr) > 0 && (dynN++, dynT > (menu ? 400 : 1000))) {
    const a = dynT / dynN, g = dynGN ? dynG / dynGN : 0; let k = 1;
    // With GPU timing: hold it between 9.8 and 13.6 ms. Frame intervals are not consulted, so a page whose
    // requestAnimationFrame is being throttled (hidden pane, occluded window) is not mistaken for a slow GPU.
    if (g) { if (g > 13.6 || g < 9.8) k = 11.7 / g; }
    // Without: two slow periods in a row mean fewer pixels, and twice as long before trying to go back up
    else if (a > 17.6) { dynOk = 0; if (++dynBad > 1) { k = 15 / a; dynBad = 0; dynWait = min(dynWait * 2, 60); } }
    // at the display's own rate there is no telling whether there is room, so try a little more now and then
    else { dynBad = 0; if (a < 12.5) k = 15 / a; else if (++dynOk > dynWait) { k = 1.17; dynOk = 0; } }
    k = k < 0.5 ? 0.5 : k > 1.7 ? 1.7 : k; const top = min(PIXMAX, DW * DH), mid = max(top / 2, PIXMIN), was = pix + det;
    // too slow: pixels down to `mid` first, then draw distance, then the remaining pixels; faster goes back the same way
    if (k < 1 ? pix > mid || det <= DETMIN : pix < mid || det >= 1) {
      const end = k < 1 ? (det > DETMIN ? mid : PIXMIN) : det < 1 ? mid : top;
      pix *= k; if (k < 1 ? pix < end : pix > end) pix = end;
    } else { det *= sqrt(k); det = det < DETMIN ? DETMIN : det > 1 ? 1 : det; }
    if (was !== pix + det && !forced) keep('lantern', [LV, pix < top ? pix | 0 : '', det]);
    dynN = dynT = dynG = dynGN = 0; resize();
  }
  F[TIME] += dt;
  {
    // touch: holding the finger away from where it went down keeps turning, like a joystick
    if (tId >= 0) {
      const tr = 4 / (innerWidth < innerHeight ? innerWidth : innerHeight); let jx = (tx - tx0) * tr, jy = (ty - ty0) * tr;
      jx = jx > 1 ? 1 : jx < -1 ? -1 : jx; jy = jy > 1 ? 1 : jy < -1 ? -1 : jy;
      lkx += jx * 1.5 * dt; lky += jy * dt;
    }
    // mouse look through two cascaded low-pass stages: smooth without feeling late
    const kq = 1 - exp(-dt * 30); lkx += mdx * 0.0022; lky += mdy * 0.0022; mdx = 0; mdy = 0;
    const ax = lkx * kq, ay = lky * kq; lkx -= ax; lky -= ay; l2x += ax; l2y += ay;
    const dyw = l2x * kq, dpt = l2y * kq; l2x -= dyw; l2y -= dpt;
    const yaw = F[YAW] + dyw; let pitch = F[PIT] - dpt; pitch = pitch < -1.55 ? -1.55 : pitch > 1.55 ? 1.55 : pitch;
    const sp = ks || tN > 1 ? 26 : 7, k = 1 - exp(-dt * 4.5), mf = tId >= 0 ? 0.7 : kf - kb, mr = kr - kl, mu = ku - kd, cp = cos(pitch), sy = sin(yaw), cw = cos(yaw);
    const vx = F[VX] + ((sy * cp * mf + cw * mr) * sp - F[VX]) * k, vy = F[VY] + ((sin(pitch) * mf + mu) * sp - F[VY]) * k, vz = F[VZ] + ((-cw * cp * mf + sy * mr) * sp - F[VZ]) * k;
    let x = F[CX] + vx * dt, y = F[CY] + vy * dt, z = F[CZ] + vz * dt;
    // free to roam the atoll, the island and the strait between: a capsule from one centre to the other
    { let h = (x * ISLE[0] + z * ISLE[1]) / (ISLE[0] * ISLE[0] + ISLE[1] * ISLE[1]); h = h < 0 ? 0 : h > 1 ? 1 : h;
      const qx = x - ISLE[0] * h, qz = z - ISLE[1] * h, R = 168 + 92 * h, rad = sqrt(qx * qx + qz * qz);
      if (rad > R) { x = ISLE[0] * h + qx * R / rad; z = ISLE[1] * h + qz * R / rad; } }
    y = y < -56 ? -56 : y > 150 ? 150 : y;
    F[YAW] = yaw; F[PIT] = pitch; F[VX] = vx; F[VY] = vy; F[VZ] = vz; F[MX] = x - F[CX]; F[MY] = y - F[CY]; F[MZ] = z - F[CZ];
    collide();
    // the island is a height field: stay a little above its ground
    if (F[CX] > 179 || F[CZ] > 179) { const gy = landY(F[CX], F[CZ]) + 1.5; if (F[CY] < gy) { F[CY] = gy; if (F[VY] < 0) F[VY] = 0; } }
    // breaking the surface: the lens runs with water for a moment, the eye adapts, the sound changes
    const side = F[CY] > 0 ? 1 : -1;
    if (side !== F[SIDE]) { if (side > 0) F[WET] = 1; F[SIDE] = side; if (onCross) onCross(side, sqrt(vx * vx + vy * vy + vz * vz)); }
    F[WET] *= exp(-dt * 1.4);
    let ek = (-F[CY] - 8) / 26; ek = ek < 0 ? 0 : ek > 1 ? 1 : ek;
    F[EXPOS] += ((side > 0 ? EXPO_AIR : EXPO * (0.6 + 0.4 * ek)) - F[EXPOS]) * (1 - exp(-dt * 2.5));
  }
  render();
  if (hud) {
    hN++; if (dtr > hMax) hMax = dtr; if (dtr < hMin) hMin = dtr; if (dtr > hPer * 1.5) { hLate++; hTot++; }
    F[HUDT] += dtr / 1000;
    if (F[HUDT] > 0.5) { info.textContent = `${(hN / F[HUDT]).toFixed(0)} fps  ·  worst frame ${hMax.toFixed(1)} ms  ·  late frames ${hLate} (total ${hTot})  ·  GPU ${F[GPU].toFixed(2)} ms\n${W}x${H} (${W * 100 / DW | 0}%)  ·  draw distance ${(det * 100).toFixed(0)}%  ·  depth ${(-F[CY]).toFixed(1)} m`; F[HUDT] = 0; hPer = hMin; hN = 0; hMax = 0; hMin = 1e9; hLate = 0; }
  }
}

// ---------------------------------------------------------------- input
const key = (e, v) => {
  switch (e.code) {
    case 'KeyW': kf = v; break; case 'KeyS': kb = v; break; case 'KeyA': kl = v; break; case 'KeyD': kr = v; break;
    case 'KeyE': ku = v; break; case 'KeyQ': kd = v; break; case 'ShiftLeft': case 'ShiftRight': ks = v; break;
    default: if (v && !e.repeat) {
      if (e.code === 'KeyH') { hud = !hud; hTot = 0; hPer = 1e9; info.textContent = ''; }
      else if (e.code === 'KeyM') mute();
      else if (e.code === 'Escape') ui(true);
      else if (e.code >= 'Digit0' && e.code <= 'Digit9') goPose((e.code.charCodeAt(5) - 39) % 10);
    }
  }
};
// behind the menu only the stats and mute keys work
addEventListener('keydown', (e) => { if (e.metaKey || e.ctrlKey || (menu && e.code !== 'KeyH' && e.code !== 'KeyM')) return; sound(); key(e, 1); });
addEventListener('keyup', (e) => key(e, 0));
const release = () => { kf = kb = kl = kr = ku = kd = ks = 0; tId = -1; tN = 0; };
const capture = () => { sound(); try { const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => canvas.requestPointerLock()).catch(() => 0); } catch { /* no pointer lock: dragging still looks around */ } };
let drag = false;
canvas.addEventListener('mousedown', () => { drag = true; capture(); });
addEventListener('mouseup', () => { drag = false; });
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas || (drag && !menu)) { mdx += e.movementX; mdy += e.movementY; } });
addEventListener('blur', release);
const touch = (e) => {
  e.preventDefault(); sound(); tN = e.touches.length;
  let f = null, first = false; for (let i = 0; i < tN; i++) if (e.touches[i].identifier === tId) f = e.touches[i];
  if (!f) { tId = -1; if (tN) { f = e.touches[0]; tId = f.identifier; first = true; } }
  if (f) {
    const s = 1100 / min(innerWidth, innerHeight);
    if (first) { tx0 = f.clientX; ty0 = f.clientY; } else { mdx += (f.clientX - tx) * s; mdy += (f.clientY - ty) * s; }
    tx = f.clientX; ty = f.clientY;
  }
};
for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, touch, { passive: false });

// ---------------------------------------------------------------- menu
// The scene keeps rendering, blurred by CSS, behind the menu. Esc, losing the mouse or the corner button open it.
const bDive = $('d');
let dived = false;
const ui = (m) => {
  if (dead) return;
  menu = m; body.className = m ? 'm' : document.pointerLockElement ? 'g p' : 'g';
  if (m) { release(); setTimeout(() => menu && bDive.focus(), 100); } else document.activeElement.blur();
};
const go = () => {
  sound(); ui(false); bDive.textContent = 'Resume';
  if (!dived) { dived = true; goPose(0); }
  if (!mob) capture();
};
bDive.onclick = go; $('o').onclick = () => ui(true);
onPick = (i) => { if (menu && !dead) { go(); goPose(i); } };   // a number on the chart: start the dive there
// detail buttons: the current level is lit, the others reload the page with theirs
$('q').querySelectorAll('button').forEach((b, i) => { if (i === 2 - LV) b.className = 'on'; else b.onclick = () => { keep('lantern', 2 - i); location.href = location.pathname; }; });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && !drag) ui(true); else if (!menu) body.className = document.pointerLockElement ? 'g p' : 'g'; });
