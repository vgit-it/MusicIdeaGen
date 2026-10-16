# Quick checks of the sung takes: pitch on the notes (cents off, at each note's middle), voiced share.
import json, sys, numpy as np, parselmouth
lines = json.load(open('out/lines.json'))
for f in sys.argv[1:]:
    snd = parselmouth.Sound(f)
    p = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=900)
    lift = 12 if 'af_' in f else 0
    off, at, errs, miss = 0.3, 0.0, [], 0
    for L in lines:
        dur = L[-1]['end'] + 0.3 + 1.0
        for n in L:
            if n['end'] - n['t'] < 0.15: continue
            t = at + off + (n['t'] + n['end']) / 2
            hz = p.get_value_at_time(t)
            if not hz or np.isnan(hz): miss += 1; continue
            errs.append(abs(1200 * np.log2(hz / (440 * 2 ** ((n['midi'] + lift - 69) / 12)))))
        at += dur + 0.3
    e = np.array(errs)
    print(f, f'notes {len(e)}, unvoiced {miss}, median {np.median(e):.0f} cents, over 50: {np.mean(e > 50) * 100:.0f}%')
