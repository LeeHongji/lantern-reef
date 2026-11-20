// ============================================================================
// Audio: a procedural soundscape, below and above the surface (no sample files)
// ============================================================================
// One fixed Web Audio graph, built on the first click, key or touch and driven by a 10 Hz timer rather than the
// frame loop. Two buses cross-fade as the camera breaks the surface:
//   sea: rumble, wash, a rush that follows swimming speed, a slow drone, bubbles near vents, chimes (more of them
//        in the grotto), whale song that comes from where the whale is, and a groan down in the rift
//   air: wind with gusts, water lapping, gulls, the mooring buoy's bell, rigging creaking near the ketch; and on the
//        island cicadas in the trees, halyards tapping in the harbor, the windmill working, the clock tower's bell
// A splash marks each crossing. Everything is oscillators, filtered noise and one synthesized reverb.
let AC, OUT, muted = false;
const VOL = 0.8;
function mkSound(ac) {
  const sr = ac.sampleRate, R = Math.random, rnr = (a, b) => a + (b - a) * R();
  // node of class C with options o, connected to every node or param in `to`; sources start at once
  const N = (C, o, ...to) => { const n = new C(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q2, ...to) => N(BiquadFilterNode, { type, frequency, Q: Q2 }, ...to);
  const lfo = (frequency, depth, to) => N(OscillatorNode, { frequency }, G(depth, to));
  const noise = (secs, f) => { const n = sr * secs | 0, b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); f(b.getChannelData(0), n); f(b.getChannelData(1), n); return b; };
  // seamless brown noise (the end cross-fades into the start) and plain white noise
  const brown = noise(11, (d, n) => { for (let i = 0, b = 0; i < n + 4096; i++) { b = (b + 0.02 * (R() * 2 - 1)) / 1.02; if (i < n) d[i] = b * 3.5; else { const k = (i - n) / 4096; d[i - n] = d[i - n] * k + b * 3.5 * (1 - k); } } });
  const white = noise(3, (d, n) => { for (let i = 0; i < n; i++) d[i] = R() * 2 - 1; });
  // reverb impulse: 5 s of noise that fades out and darkens
  const ir = noise(5, (d, n) => { for (let i = 0, b = 0; i < n; i++) { const t = i / sr; b += (R() * 2 - 1 - b) * (0.04 + 0.5 * exp(-t * 2)); d[i] = b * (1 - exp(-t * 30)) * exp(-t * 1.5) * (1 - i / n); } });

  const lim = N(DynamicsCompressorNode, { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.3 }, ac.destination);
  const out = OUT = G(0, lim), wet = N(ConvolverNode, { buffer: ir }, out);
  // sea bus: everything under water passes one low-pass that closes further with depth
  const muffle = BQ('lowpass', 3200, 0.4, out), sea = G(1, muffle), seaWet = G(1, wet), air = G(0, out), airWet = G(0.25, wet);
  const src = (buffer, playbackRate, ...to) => N(AudioBufferSourceNode, { buffer, loop: true, playbackRate }, ...to);

  // ---- sea
  const rum = G(0.34, sea); src(brown, 1, BQ('lowpass', 150, 0.7, rum)); lfo(0.07, 0.11, rum.gain); lfo(0.113, 0.08, rum.gain);
  // wash and rush share one noise source played at another speed, so the loops never line up
  const wash = G(0.25, sea), wave = G(1, wash), rush = G(0, sea), rushF = BQ('bandpass', 300, 0.9, rush);
  src(brown, 0.63, BQ('bandpass', 420, 0.5, wave), rushF); lfo(0.09, 0.3, wave.gain); lfo(0.151, 0.25, wave.gain);
  // drone: stacked fifths on D, each note a pair of slightly detuned sines that slowly beat
  const pad = G(1, sea, G(1.5, seaWet));
  [73.42, 110, 164.81, 246.94, 369.99].forEach((f, i) => { const g = G(0.022 - i * 0.003, pad); N(OscillatorNode, { frequency: f }, g); N(OscillatorNode, { frequency: f + rnr(0.03, 0.11) }, g); });
  // the rift: a low groan a tritone off the drone, heard only down there
  const groan = G(0, sea, G(0.8, seaWet));
  [51.9, 52.4, 77.8].forEach((f) => N(OscillatorNode, { frequency: f, type: 'triangle' }, BQ('lowpass', 160, 2, groan)));
  lfo(0.05, 6, groan.gain);
  // pooled voices: oscillator -> envelope -> pan -> dry + reverb
  const pool = (n, bus, busWet, send, type) => Array.from({ length: n }, () => { const p = N(StereoPannerNode, {}, bus, G(send, busWet)), g = G(0, p); return { p, g, o: N(OscillatorNode, { type }, g) }; });
  const bub = pool(5, sea, seaWet, 0.12), chime = pool(4, sea, seaWet, 1.2), whale = pool(3, sea, seaWet, 2, 'triangle'), gull = pool(3, air, airWet, 0.5, 'sawtooth');
  // one note: pitch glides f0 -> f1 over dur, level rises to vol in att, then dies away
  const play = (vs, t, f0, f1, dur, vol, att, pan) => {
    const v = vs.shift(), f = v.o.frequency, g = v.g.gain; vs.push(v);
    v.p.pan.setValueAtTime(pan === undefined ? rnr(-0.7, 0.7) : clamp(pan, -1, 1), t);
    f.cancelScheduledValues(t); f.setValueAtTime(f0, t); f.exponentialRampToValueAtTime(f1, t + dur);
    g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(vol, t + att); g.setTargetAtTime(0, t + att, (dur - att) / 5);
  };

  // ---- air
  const wind = G(0.16, air), windF = BQ('bandpass', 520, 0.6, wind); src(white, 0.71, BQ('lowpass', 1800, 0.5, windF));
  lfo(0.06, 0.07, wind.gain); lfo(0.17, 0.05, wind.gain); lfo(0.043, 160, windF.frequency);
  const lap = G(0, air), lapF = BQ('bandpass', 900, 0.7, lap); src(white, 1, lapF);                 // each lapping wave is an envelope on this
  const creak = G(0, air), creakO = N(OscillatorNode, { frequency: 96, type: 'sawtooth' }, BQ('bandpass', 620, 7, creak));
  // the bell: four inharmonic partials struck together, each with its own decay
  const bellPan = N(StereoPannerNode, {}, air, G(0.9, airWet), G(0.06, sea));                       // faintly audible under water too
  const bell = [[1, 1, 2.6], [2.76, 0.5, 1.7], [5.4, 0.3, 1.0], [8.93, 0.14, 0.6]].map(([m, a, d]) => { const g = G(0, bellPan); N(OscillatorNode, { frequency: 392 * m }, g); return { g, a, d }; });
  // the island: cicadas are two narrow bands of hiss, each chopped at its own rate
  const cic = G(0, air);
  for (const [f, rate, lv] of [[5300, 13, 0.5], [4300, 8.5, 0.35], [6400, 17, 0.25]]) { const g = G(lv, cic); src(white, 1.31, BQ('bandpass', f, 16, g)); lfo(rate, lv, g.gain); }
  lfo(0.11, 0.004, cic.gain);
  const clink = pool(3, air, airWet, 0.3, 'triangle');
  const towerPan = N(StereoPannerNode, {}, air, G(1.4, airWet));
  const tower = [[1, 1, 5], [2.0, 0.6, 3.6], [2.4, 0.35, 2.8], [3.0, 0.3, 2], [4.5, 0.12, 1.2]].map(([m, a, d]) => { const g = G(0, towerPan); N(OscillatorNode, { frequency: 174.6 * m }, g); return { g, a, d }; });
  const splash = G(0, out, G(0.3, wet)), splashF = BQ('bandpass', 900, 0.8, splash); src(white, 0.9, splashF);

  const NOTES = [0, 2, 5, 7, 9, 12, 14, 17, 19]; // D major pentatonic, in semitones above A4
  let lt = ac.currentTime, tB = lt + 1.5, tC = lt + 5, tW = lt + 9, tG = lt + 3, tL = lt + 1, tK = lt + 4, tBell = lt + 2, tT = lt + 12, tH = lt + 3, nT = 0, lx = F[CX], ly = F[CY], lz = F[CZ], side = 0;
  out.gain.setTargetAtTime(VOL, lt, 1);
  // crossing the surface: called by the frame loop with the new side and the speed
  onCross = (s, v) => {
    const t = ac.currentTime + 0.02, k = clamp(v / 12, 0.25, 1);
    splashF.frequency.setValueAtTime(s > 0 ? 1500 : 500, t); splashF.frequency.exponentialRampToValueAtTime(s > 0 ? 700 : 180, t + 0.6);
    splash.gain.cancelScheduledValues(t); splash.gain.setValueAtTime(0, t); splash.gain.linearRampToValueAtTime(0.5 * k, t + 0.03); splash.gain.setTargetAtTime(0, t + 0.05, 0.22);
    if (s < 0) { let tt = t + 0.1; for (let n = 8; n--;) { const f = rnr(300, 1100); play(bub, tt, f, f * rnr(1.4, 2.2), 0.05 + 40 / f, rnr(0.05, 0.1) * k, 0.006); tt += rnr(0.04, 0.12); } }
  };
  return () => {
    const now = ac.currentTime, t = now + 0.05, dt = now - lt;
    if (dt <= 0) return;
    const cx = F[CX], cy = F[CY], cz = F[CZ], rx = F[RX], rz = F[RZ];
    let v = hypot(cx - lx, cy - ly, cz - lz) / dt; if (v > 60) v = 0;                               // ignore jumps to a viewpoint
    lt = now; lx = cx; ly = cy; lz = cz;
    const pan = (x, z) => { const dx = x - cx, dz = z - cz, d = hypot(dx, dz) + 1e-3; return (dx * rx + dz * rz) / d; };
    // which bus is heard
    const s = cy > 0 ? 1 : -1;
    if (s !== side) { side = s; sea.gain.setTargetAtTime(s < 0 ? 1 : 0.07, t, 0.12); air.gain.setTargetAtTime(s > 0 ? 1 : 0.05, t, 0.12); }
    const deep = clamp(-cy / 50, 0, 1);
    muffle.frequency.setTargetAtTime(s > 0 ? 900 : 3400 - 2100 * deep + 1200 * F[ZONE], t, 0.4);
    // sea layers
    rush.gain.setTargetAtTime(0.5 * pow(min(v / 26, 1), 1.2), t, 0.3); rushF.frequency.setTargetAtTime(220 + v * 14, t, 0.3);
    const near = clamp(1 + cy / 30, 0, 1); wash.gain.setTargetAtTime(0.25 + 0.55 * near * near, t, 0.5);
    let rift = 0; for (const r of RIFTS) { const ax = r[2] - r[0], az = r[3] - r[1], h = clamp(((cx - r[0]) * ax + (cz - r[1]) * az) / (ax * ax + az * az), 0, 1); rift = max(rift, sstep(26, 6, hypot(cx - r[0] - ax * h, cz - r[1] - az * h))); }
    groan.gain.setTargetAtTime(22 * rift * clamp((-cy - 30) / 20, 0, 1), t, 1.5);
    if (t > tB) { // bubbles: bursts of short rising blips, smaller bubbles higher and shorter; busier and louder beside a vent
      let best = 1e9, bx = 0, bz = 0;
      for (const p of Wd.vents) { const d = hypot(p[0] - cx, p[2] - cz) + abs(p[1] - cy) * 0.3; if (d < best) { best = d; bx = p[0]; bz = p[2]; } }
      const k = 1 / (1 + best * best / 120); let tt = t;
      for (let n = 1 + R() * R() * (5 + 9 * k) | 0; n--;) { const f = rnr(380, 1300); play(bub, tt, f, f * rnr(1.4, 2.2), 0.05 + 40 / f, rnr(0.03, 0.08) * (1 + 1.6 * k), 0.006, pan(bx, bz) * k + rnr(-0.6, 0.6) * (1 - k)); tt += rnr(0.07, 0.2); }
      tB = tt + rnr(0.4, 5 - 3.6 * k);
    }
    if (t > tC) { // chimes: sparse in open water, a slow glittering melody inside the grotto
      const z = F[ZONE], f = 440 * pow(2, (NOTES[R() * 9 | 0] + (z > 0.5 && R() < 0.4 ? 12 : 0)) / 12);
      play(chime, t, f, f, 5, rnr(0.02, 0.04) * (1 + z), 0.03); tC = t + rnr(2.5, 9) * (1 - 0.72 * z);
    }
    if (t > tW) { // whale song: a phrase of slow glides, panned to where the whale swims and quieter with distance
      const w = Wd.whale, ta = F[TIME] * w[5] + w[4], wx = w[0] + w[3] * cos(ta), wz = w[2] + w[3] * 0.8 * sin(ta), d = hypot(wx - cx, wz - cz), lv = 0.09 / (1 + d / 90), p = pan(wx, wz) * 0.8;
      let tt = t;
      for (let n = 2 + R() * 3 | 0; n--;) { const f = rnr(150, 420), dur = rnr(1.4, 3.6); play(whale, tt, f, f * rnr(0.55, 1.8), dur, lv, dur * 0.4, p); tt += dur * 0.8; }
      tW = tt + rnr(16, 40);
    }
    // air layers
    const dIsle = hypot(ISLE[0] - cx, ISLE[1] - cz), dBay = hypot(BAY[0] - cx, BAY[1] - cz);
    wind.gain.setTargetAtTime(0.14 + 0.16 * clamp(cy / 70, 0, 1), t, 1);
    cic.gain.setTargetAtTime(0.02 * sstep(230, 150, dIsle) * sstep(120, 30, cy), t, 1.5);
    if (t > tT) { // the clock tower strikes: one to three slow strokes, heard right across the lagoon
      const tp = bayPt(TOWER, 0), d = hypot(tp[0] - cx, tp[1] - cz), lv = 0.2 / (1 + d * d / 30000);
      towerPan.pan.setTargetAtTime(clamp(pan(tp[0], tp[1]) * 0.8, -1, 1), t, 0.05);
      for (const b of tower) { const g = b.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(b.a * lv, t + 0.006); g.setTargetAtTime(0, t + 0.02, b.d / 3); }
      if (++nT % 3) tT = t + 2.4; else { tT = t + rnr(40, 75); nT = R() * 3 | 0; }
    }
    if (t > tH) { // halyards tapping against masts in the harbor
      const lv = 0.022 / (1 + dBay * dBay / 2500), f = rnr(1900, 3100); let tt = t;
      for (let n = 2 + R() * 5 | 0; n--;) { play(clink, tt, f, f * 0.98, 0.09, lv * rnr(0.5, 1), 0.002, pan(BAY[0], BAY[1]) * 0.7 + rnr(-0.3, 0.3)); tt += rnr(0.16, 0.34); }
      tH = tt + rnr(0.6, 5);
    }
    if (t > tL) { // a wave laps: a swell of hiss that rises fast and drains slowly
      const g = lap.gain, a = rnr(0.03, 0.09) * clamp(1.4 - cy / 14, 0.25, 1);
      lapF.frequency.setValueAtTime(rnr(600, 1400), t);
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(a, t + rnr(0.25, 0.6)); g.setTargetAtTime(0, t + 0.6, rnr(0.4, 0.9));
      tL = t + rnr(1.6, 4.2);
    }
    if (t > tG) { // a gull: three to six downward cries
      const f = rnr(1900, 2700), lv = 0.03 * clamp(1.2 - min(hypot(LAMP[0] - cx, LAMP[1] - cz), dBay) / 220, 0.3, 1), p = rnr(-0.8, 0.8); let tt = t;
      for (let n = 3 + R() * 4 | 0; n--;) { play(gull, tt, f * rnr(0.95, 1.05), f * 0.62, rnr(0.16, 0.3), lv, 0.03, p); tt += rnr(0.22, 0.36); }
      tG = tt + rnr(2.5, 11);
    }
    if (t > tBell) { // the buoy rocks and its bell strikes, louder the closer you are
      const d = hypot(BUOY[0] - cx, BUOY[1] - cz), lv = rnr(0.5, 1) * 0.11 / (1 + d * d / 2500);
      bellPan.pan.setTargetAtTime(clamp(pan(BUOY[0], BUOY[1]), -1, 1), t, 0.05);
      for (const b of bell) { const g = b.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(b.a * lv, t + 0.004); g.setTargetAtTime(0, t + 0.01, b.d / 3); }
      tBell = t + (R() < 0.35 ? rnr(0.5, 0.9) : rnr(2.4, 7));
    }
    if (t > tK) { // rigging and timber working near the ketch; the windmill's gear near the mill
      const d = min(hypot(KETCH[0] - cx, KETCH[1] - cz), hypot(KNOLL[0] - cx, KNOLL[1] - cz)), lv = 0.05 / (1 + d * d / 300), f = rnr(70, 130), g = creak.gain;
      creakO.frequency.setValueAtTime(f, t); creakO.frequency.linearRampToValueAtTime(f * rnr(0.8, 1.3), t + 0.5);
      g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(lv, t + 0.12); g.setTargetAtTime(0, t + 0.3, 0.12);
      tK = t + rnr(1.5, 6);
    }
  };
}
// called on every click, key or touch: builds the graph once and resumes it when the browser allows
function sound() {
  if (!AC) { AC = new AudioContext({ latencyHint: 'playback' }); setInterval(mkSound(AC), 100); }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
}
const mute = () => { if (!AC) return; muted = !muted; OUT.gain.setTargetAtTime(muted ? 0 : VOL, AC.currentTime, 0.08); };
document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });
