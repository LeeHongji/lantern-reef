"""The film's soundtrack, synthesized from scratch (no samples): python3 film/score.py -> film/out/score.wav

A bright D-major piece at 100 bpm that follows the flight. Under water (4.42 s to 27.98 s) everything passes a low-pass
filter and the drums drop to a heartbeat; breaking the surface opens the filter on a big swell. Sound effects sit on
the cuts and on the events in the picture: whooshes, the splash in and the burst out, bubbles, gulls, the clock bell.
"""
import numpy as np
from scipy.signal import butter, sosfilt
import wave, os

SR, DUR = 48000, 50.0
N = int(SR * DUR)
T = np.arange(N) / SR
rng = np.random.default_rng(7)
DOWN, UP = 4.42, 27.98
CUTS = [12.0, 17.5, 22.5]
BPM = 100.0
BEAT = 60 / BPM

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def env(n, a, d):  # attack then exponential decay, n samples
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1) * np.exp(-np.maximum(t - a, 0) / d)
def add(buf, start, sig, pan=0.0):
    i = int(start * SR)
    if i >= N: return
    sig = sig[: N - i].copy()
    k = min(len(sig), int(0.015 * SR)); sig[-k:] *= np.linspace(1, 0, k)   # no voice ends on a click
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + len(sig)] += sig * l * 1.414
    buf[1, i:i + len(sig)] += sig * r * 1.414
def lp(x, f, order=2): return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def ramp(points):  # piecewise-linear automation over the whole film
    ts, vs = zip(*points); return np.interp(T, ts, vs)

music = np.zeros((2, N))
# chords, one per bar of four beats: I  V/vi  vi  IV  (D, A, Bm, G), the progression of a summer afternoon
CH = [[50, 57, 62, 66, 69], [45, 57, 61, 64, 69], [47, 54, 59, 62, 66], [43, 55, 59, 62, 67]]
BAR = 4 * BEAT
nbars = int(DUR / BAR) + 1

# pad: detuned saws, softened, swelling into each bar
for b in range(nbars):
    t0 = b * BAR; n = int(BAR * SR * 1.15); t = np.arange(n) / SR
    sig = np.zeros(n)
    for m in CH[b % 4][1:]:
        for d in (-0.08, 0.08):
            ph = 2 * np.pi * hz(m + d) * t
            sig += (2 * ((ph / (2 * np.pi)) % 1) - 1) * 0.5 + np.sin(ph) * 0.5
    sig = lp(sig, 2200) * np.minimum(t / 0.6, 1) * np.minimum((BAR * 1.15 - t) / 0.4, 1)
    add(music, t0, sig * 0.018, 0)
# bass: root on beats 1 and 3, a soft sine with a little drive
for b in range(nbars):
    r = CH[b % 4][0] - 12
    for k, beat in enumerate((0, 2, 2.5)):
        n = int(BEAT * SR * 1.6); t = np.arange(n) / SR
        s = np.tanh(2.2 * np.sin(2 * np.pi * hz(r + (12 if k == 2 else 0)) * t)) * env(n, 0.01, 0.35)
        add(music, b * BAR + beat * BEAT, s * 0.11)
# arpeggio: plucked 16ths over the chord tones, panned back and forth, from the first beat after the title
pent = [0, 2, 4, 7, 9]
for i in range(int(DUR / (BEAT / 4))):
    t0 = i * BEAT / 4
    if t0 < 2.4: continue
    b = int(t0 / BAR); tones = CH[b % 4][1:]
    m = tones[(i * 3 + (i // 8)) % len(tones)] + 12 * (1 if (i % 16) in (6, 7, 14) else 0)
    n = int(0.5 * SR); t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * hz(m) * t) + 0.35 * np.sin(4 * np.pi * hz(m) * t) + 0.12 * np.sin(6 * np.pi * hz(m) * t)) * env(n, 0.003, 0.16)
    add(music, t0, s * (0.05 if i % 4 == 0 else 0.032), np.sin(i * 0.7) * 0.6)
# bells on top, a pentatonic melody that enters above water
mel = [74, 76, 78, 81, 78, 76, 74, 71, 74, 76, 81, 83, 81, 78, 76, 74]
for i, m in enumerate(mel * 4):
    t0 = 28.4 + i * BEAT
    if t0 > 46: break
    n = int(2.2 * SR); t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * hz(m) * r * t) * np.exp(-t / dd) for r, a, dd in ((1, 1, 1.2), (2.76, 0.4, 0.5), (5.4, 0.15, 0.25)))
    add(music, t0, s * 0.03 * min(1, (t0 - 28.4) / 2), 0.3 * np.sin(i))
# drums: soft kick and shaker; under water only a muffled heartbeat
for i in range(int(DUR / BEAT)):
    t0 = i * BEAT
    if t0 < 2.4 or t0 > 47: continue
    n = int(0.4 * SR); t = np.arange(n) / SR
    kick = np.sin(2 * np.pi * (48 + 90 * np.exp(-t * 30)) * t) * env(n, 0.002, 0.18)
    add(music, t0, kick * (0.22 if UP < t0 or t0 < DOWN else 0.16))
    if UP < t0 < 46.5:
        for h in (0.5,):
            nn = int(0.12 * SR); sh = hp(rng.standard_normal(nn), 6000) * env(nn, 0.004, 0.035)
            add(music, t0 + h * BEAT, sh * 0.05, 0.4)
        if i % 2 == 1:
            nn = int(0.3 * SR); sn = bp(rng.standard_normal(nn), 900, 5000) * env(nn, 0.002, 0.08) + np.sin(2 * np.pi * 190 * np.arange(nn) / SR) * env(nn, 0.002, 0.06)
            add(music, t0, sn * 0.07, -0.1)
# final chord on D, held under the end card
n = int(4.2 * SR); t = np.arange(n) / SR
fin = sum(np.sin(2 * np.pi * hz(m) * t) for m in (50, 57, 62, 66, 69, 74)) * np.minimum(t / 0.05, 1) * np.exp(-t / 2.2)
add(music, 46.2, lp(fin, 3000) * 0.05)

# under water the music is heard through the water
uw = ramp([(0, 0), (DOWN - 0.05, 0), (DOWN + 0.25, 1), (UP - 0.15, 1), (UP + 0.1, 0), (DUR, 0)])
muff = np.stack([lp(music[c], 700, 4) for c in range(2)])
music = music * (1 - uw) + muff * uw * 1.25

fx = np.zeros((2, N))
def noise(n): return rng.standard_normal(n)
# whooshes on the cuts: a noise band sweeping up and fading, plus a low thump
for c in CUTS:
    n = int(0.9 * SR); t = np.arange(n) / SR
    s = noise(n); out = np.zeros(n)
    for k in range(0, n, 2048):  # sweep the band in blocks
        f = 300 + 2600 * (k / n) ** 1.5
        out[k:k + 2048] = bp(s[k:k + 2048], f * 0.7, f * 1.4)
    shape = np.sin(np.pi * np.minimum(t / 0.9, 1)) ** 2
    add(fx, c - 0.55, out * shape * 0.22, -0.5)
    add(fx, c - 0.55, out[::-1] * shape * 0.15, 0.5)
# the splash into the water and the burst out of it
for tc, up in ((DOWN, False), (UP, True)):
    n = int(1.6 * SR); t = np.arange(n) / SR
    s = bp(noise(n), 300 if not up else 900, 6000) * env(n, 0.01, 0.25 if up else 0.4)
    add(fx, tc - 0.03, s * 0.35)
    add(fx, tc, lp(noise(n), 200) * env(n, 0.01, 0.5) * 0.4)
# bubbles under water: short rising sines, denser right after the plunge and in the grotto
tb = DOWN + 0.1
while tb < UP - 0.2:
    f = rng.uniform(400, 1400); n = int((0.04 + 40 / f) * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * (1 + 0.8 * t / t[-1]) * t) * env(n, 0.004, 0.03)
    add(fx, tb, s * rng.uniform(0.04, 0.09), rng.uniform(-0.8, 0.8))
    tb += rng.exponential(0.05 if tb < DOWN + 1.2 or 22.5 < tb < 26.5 else 0.25)
# a sea rumble under water, wind and surf above
rum = lp(noise(N), 140, 2) * 0.9
wind = bp(noise(N), 300, 1400) * (0.5 + 0.5 * np.sin(2 * np.pi * T / 7.3))
amb = rum * uw * 0.5 + wind * (1 - uw) * ramp([(0, 0.05), (4, 0.05), (28, 0.05), (40, 0.06), (44, 0.1), (DUR, 0.06)])
fx += np.stack([amb, np.roll(amb, 911)])
# gulls over the sea and the harbor
for tg in (1.2, 2.3, 30.6, 31.3, 34.2, 35.0, 41.5):
    f0 = rng.uniform(1900, 2600)
    for k in range(rng.integers(3, 6)):
        n = int(0.24 * SR); t = np.arange(n) / SR
        ph = 2 * np.pi * np.cumsum(f0 * (1 - 0.38 * t / t[-1])) / SR
        s = bp(np.sign(np.sin(ph)) * 0.6 + np.sin(ph), 900, 4000) * env(n, 0.02, 0.07)
        add(fx, tg + k * 0.3, s * 0.03, rng.uniform(-0.7, 0.7))
# the clock tower strikes as the camera passes it
for k in range(3):
    n = int(4 * SR); t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * 174.6 * r * t) * np.exp(-t / dd) for r, a, dd in ((1, 1, 2.2), (2, 0.6, 1.6), (2.4, 0.35, 1.1), (3, 0.3, 0.8), (4.5, 0.12, 0.5)))
    add(fx, 37.6 + k * 1.6, s * 0.09 * np.minimum(t / 0.004, 1), 0.2)

mix = music + fx
mix = np.stack([hp(mix[c], 25) for c in range(2)])
fade = ramp([(0, 0), (0.6, 1), (DUR - 1.6, 1), (DUR, 0)])
mix *= fade
# level: integrated loudness near -16 LUFS (an RMS estimate), peaks held below -1 dBFS by a soft clip
rms = np.sqrt(np.mean(mix ** 2)); mix *= 10 ** (-14.6 / 20) / rms
# look-ahead peak limiter: the gain follows the loudest sample in the next 5 ms down, and recovers over 120 ms
from scipy.ndimage import maximum_filter1d
pk = maximum_filter1d(np.abs(mix).max(0), int(0.01 * SR), origin=-int(0.005 * SR) + 1)
need = np.minimum(1, 0.89 / np.maximum(pk, 1e-9)); g = np.empty(N); cur = 1.0; rel = np.exp(-1 / (0.12 * SR))
for i in range(N):
    cur = need[i] if need[i] < cur else need[i] + (cur - need[i]) * rel
    g[i] = cur
mix *= g
mix *= 10 ** (-1 / 20) / max(1.0, np.abs(mix).max())
out = os.path.join(os.path.dirname(__file__), 'out', 'score.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes())
print('wrote', out, 'peak dBFS %.1f' % (20 * np.log10(np.abs(mix).max())), 'rms dBFS %.1f' % (20 * np.log10(np.sqrt(np.mean(mix ** 2)))))
