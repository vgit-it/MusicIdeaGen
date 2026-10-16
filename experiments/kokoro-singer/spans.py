"""Tone match, step 1: where each vowel is in a voice's "h_d" words (seconds), its pitch and how clean it is
(HNR) -> out/print/<voice>/spans.json. Run: .venv/Scripts/python -I spans.py <voice>"""
import glob, json, os, sys
import numpy as np, parselmouth
exec(open('print-measure.py').read().split('def measure')[0].split('VOICES =')[0])  # (imports)
src = open('print-measure.py').read()
ns = {}
exec(src[src.index('def vowel_span'):src.index('def measure')], {'np': np, 'parselmouth': parselmouth}, ns)
voice = sys.argv[1]
out = {}
for p in sorted(glob.glob(f'out/print/{voice}/*-*.wav')):
    v = os.path.basename(p)[:-4]
    snd = parselmouth.Sound(p)
    t0, t1, f0 = ns['vowel_span'](snd, v.startswith('AX'))
    h = snd.extract_part(t0 + 0.3 * (t1 - t0), t0 + 0.7 * (t1 - t0)).to_harmonicity_cc(minimum_pitch=70).values[0]
    out[v] = {'t0': t0, 't1': t1, 'f0': f0, 'hnr': float(np.median(h[h > -100]))}
json.dump(out, open(f'out/print/{voice}/spans.json', 'w'), indent=1)
print(voice, 'HNR median', round(float(np.median([x['hnr'] for x in out.values()])), 1), 'dB, pitch', round(float(np.median([x['f0'] for x in out.values()]))))
