// ============================================================================
// Development tools: only in dev.html (node build.mjs --dev), never in index.html
// ============================================================================
//   F  fly the camera along the scripted path (FLY in 15-world.js), one minute through the whole world
//   B  the same flight as a benchmark: resolution held, every frame timed, the result shown at the end
//   window.__reef  hooks for the headless test scripts in .test/
{
  const FLYT = 60, LOGN = 1 << 16, logFrame = new Float32Array(LOGN), logGpu = new Float32Array(LOGN);
  let flying = false, bench = false, last = 0, nFrame = 0, nGpu = 0, result = null;
  const stop = () => { flying = bench = false; pin = false; dynT = 0; };
  const report = () => {
    const st = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of s) sum += v; return { n, avg: sum / n, p99: s[min(n - 1, floor(n * 0.99))], max: s[n - 1] }; };
    const fm = (o) => `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms`;
    const f = st(logFrame, nFrame), g = nGpu ? st(logGpu, nGpu) : null;
    result = { w: W, h: H, frame: f, gpu: g };
    info.textContent = `Fly-through ${W}x${H}, ${f.n} frames\nframe  ${fm(f)}\nGPU    ${g ? fm(g) : 'timestamp-query unavailable'}`;
  };
  // frame() moves the free camera and then calls render(): step in between and put the camera on the path instead
  const draw = render;
  render = () => {
    if (flying) {
      const dtr = F[LAST] - last; last = F[LAST];
      F[FLT] += min(dtr / 1000, 0.1);
      flySpline(clamp(F[FLT] / FLYT, 0, 1) * (FLYN - 1), P6); aim();
      F[SIDE] = F[CY] > 0 ? 1 : -1;
      if (bench) { if (nFrame < LOGN) logFrame[nFrame++] = dtr; if (F[GPU] > 0 && nGpu < LOGN) logGpu[nGpu++] = F[GPU]; }
      if (F[FLT] >= FLYT) { if (bench) report(); stop(); }
    }
    draw();
  };
  const start = (b) => { flying = true; bench = b; F[FLT] = 0; last = F[LAST]; nFrame = nGpu = 0; result = null; if (b) { hud = false; info.textContent = ''; pin = true; } };
  addEventListener('keydown', (e) => {
    if (menu || e.repeat) return;
    if (e.code === 'KeyF' || e.code === 'KeyB') { if (flying) stop(); else start(e.code === 'KeyB'); }
    else if (/Digit\d/.test(e.code)) stop();
  });
  window.__reef = {
    F, POSES, STATS, goPose, lookAt, start, stop, landY,
    get result() { return result; }, get flying() { return flying; },
    get size() { return [W, H, DW, DH, pix, det]; },
    setRes(p, d = 1) { pin = true; pix = p; det = d; resize(); },
    unpin() { pin = false; },
    enter() { ui(false); },
    sound() { sound(); return AC; },
    // film recorder: stop the frame loop, then set the camera and the clock and draw one frame at a time
    freeze(v = true) { frozen = v; },
    shot(t, x, y, z, yaw, pitch, roll, expo, wet) { F[TIME] = t; F[CX] = x; F[CY] = y; F[CZ] = z; F[YAW] = yaw; F[PIT] = pitch; F[ROLL] = roll; F[EXPOS] = expo; F[WET] = wet; F[SIDE] = y > 0 ? 1 : -1; draw(); return Q.onSubmittedWorkDone(); },
  };
}
