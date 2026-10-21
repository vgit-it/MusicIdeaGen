# Join checks: clicks (sample jumps far over the usual), how deep the level dips between notes inside a
# phrase (a choppy join dips; legato barely does), and how fast the tone jumps (spectral flux spikes).
import json, sys, numpy as np, soundfile as sf
lines = json.load(open('out/lines.json'))
for f in sys.argv[1:]:
    if 'fof' in f: continue
    a, r = sf.read(f)
    d = np.abs(np.diff(a, 2)); clicks = int(np.sum(d > 40 * np.median(d) + 0.05))
    hop = int(0.005 * r); env = np.sqrt(np.convolve(a ** 2, np.ones(4 * hop) / (4 * hop), 'same'))[::hop]
    # spectral flux on 20 ms frames
    n = int(0.02 * r); fr = np.array([np.abs(np.fft.rfft(a[i:i + n] * np.hanning(n))) for i in range(0, len(a) - n, n // 2)])
    fl = np.sqrt(np.sum(np.diff(np.log(fr + 1e-4), axis=0).clip(0) ** 2, axis=1)); loud = fr.sum(1)[1:] > 0.05 * fr.sum(1).max()
    dips, at = [], 0.0
    for L in lines:
        for x, y in zip(L, L[1:]):
            if y['t'] - x['end'] > 0.12: continue
            if any(c not in 'L R M N NG W Y'.split() for c in x['syl']['coda'] + y['syl']['onset']): continue
            def lv(t): return env[min(len(env) - 1, int((at + 0.3 + t) / 0.005))]
            mid = lambda n: (n['t'] + n['end']) / 2
            seg = env[int((at + 0.3 + mid(x)) / 0.005): int((at + 0.3 + mid(y)) / 0.005)]
            if not len(seg): continue
            lo = min(seg)
            dips.append(20 * np.log10(min(lv(mid(x)), lv(mid(y))) / (lo + 1e-6)))
        at += L[-1]['end'] + 0.3 + 1.0 + 0.3
    print(f'{f:36} dip median {np.median(dips):4.1f} dB, >15 dB: {np.mean(np.array(dips) > 15) * 100:3.0f}%  (n={len(dips)})')
