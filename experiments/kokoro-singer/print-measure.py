"""Voice prints, step 2: each voice's vowels measured (Praat, Burg LPC): F1-F3 per vowel (a diphthong's
start and end), F4-F5 and the formant widths over the voice -> out/print/<voice>.json, in the shape of
the app's VOWELS table. Run: .venv/Scripts/python -I print-measure.py"""
import glob, json, os, sys
import numpy as np, parselmouth

VOICES = ['am_michael', 'am_fenrir', 'bm_george', 'af_heart']
DIPH = {'EY', 'OW', 'AY', 'AW', 'OY'}
TEXTBOOK = {
    'IY': [[280, 2100, 2900]], 'IH': [[400, 1850, 2550]], 'EY': [[470, 1950, 2600], [400, 1850, 2550]], 'EH': [[540, 1720, 2500]],
    'AE': [[650, 1650, 2450]], 'AA': [[700, 1100, 2550]], 'AO': [[580, 880, 2500]], 'OW': [[490, 920, 2450], [450, 1050, 2350]],
    'UH': [[450, 1050, 2350]], 'UW': [[330, 880, 2300]], 'AH': [[620, 1200, 2500]], 'AX': [[500, 1400, 2500]],
    'AY': [[700, 1150, 2550], [420, 1800, 2550]], 'AW': [[700, 1150, 2550], [450, 1050, 2350]], 'OY': [[580, 880, 2500], [420, 1800, 2550]],
}


def vowel_span(snd, schwa):
    pitch = snd.to_pitch(time_step=0.005, pitch_floor=60, pitch_ceiling=500)
    inten = snd.to_intensity(minimum_pitch=80, time_step=0.005)
    ts = pitch.xs(); f0 = pitch.selected_array['frequency']
    db = np.nan_to_num(np.array([inten.get_value(t) or -100 for t in ts]), nan=-100)
    ok = (f0 > 0) & (db > db.max() - 10)
    idx = np.where(ok)[0]
    # (the longest run: the vowel; "h" before it is voiceless, the "d" after it short)
    best, s = (0, 0), None
    for i in range(len(ok) + 1):
        if i < len(ok) and ok[i]:
            s = i if s is None else s
        elif s is not None:
            if i - s > best[1] - best[0]: best = (s, i)
            s = None
    t0, t1 = ts[best[0]], ts[best[1] - 1]
    if schwa:  # "hədɑ": the schwa is the start of the voiced stretch
        t1 = t0 + 0.3 * (t1 - t0)
    return t0, t1, float(np.median(f0[best[0]:best[1]]))


def measure(voice):
    female = voice.startswith('af') or voice.startswith('bf')
    out, F4, F5, B, agree = {}, [], [], [[] for _ in range(5)], {}
    f0s = []
    for v in TEXTBOOK:
        starts, ends, starts_d, ends_d = [], [], [], []
        for p in sorted(glob.glob(f'out/print/{voice}/{v}-*.wav')):
            snd = parselmouth.Sound(p)
            t0, t1, f0 = vowel_span(snd, v == 'AX')
            f0s.append(f0)
            # (the analysis ceiling that tracks this token most steadily: Escudero et al. 2009)
            def at_ceiling(c):
                fm = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=c, window_length=0.025)
                def at(a, b):
                    ts = np.linspace(t0 + a * (t1 - t0), t0 + b * (t1 - t0), 12)
                    F = np.array([[fm.get_value_at_time(k, t) for t in ts] for k in range(1, 6)])
                    W = np.array([[fm.get_bandwidth_at_time(k, t) for t in ts] for k in range(1, 6)])
                    return F, W
                return at
            best = None
            for c in (range(4500, 5700, 100) if not female else range(5000, 6600, 100)):
                at0 = at_ceiling(c)
                F, _ = at0(0.15, 0.35) if v in DIPH else at0(0.3, 0.7)
                sc = float(np.nansum(np.nanstd(F[:3], axis=1) / np.nanmean(F[:3], axis=1)))
                if best is None or sc < best[0]:
                    best = (sc, at0)
            raw = best[1]
            def at(a, b):
                F, W = raw(a, b)
                return [float(np.nanmedian(x)) for x in F], [float(np.nanmedian(x)) for x in W]
            # (and at the usual ceiling, in case the steadiest one differs from take to take)
            d = at_ceiling(5500 if female else 5000)
            med = lambda a, b: [float(np.nanmedian(x)) for x in d(a, b)[0]]
            if v in DIPH:
                starts_d.append(med(0.15, 0.35)); ends_d.append(med(0.78, 0.92))
            else:
                starts_d.append(med(0.3, 0.7))
            if v in DIPH:
                (fa, wa), (fb, _) = at(0.15, 0.35), at(0.78, 0.92)
                starts.append(fa); ends.append(fb)
            else:
                fa, wa = at(0.3, 0.7)
                starts.append(fa)
                F4.append(fa[3]); F5.append(fa[4])
                for k in range(5): B[k].append(wa[k])
        dis = lambda xs: max(abs(xs[0][k] - xs[1][k]) / ((xs[0][k] + xs[1][k]) / 2) for k in range(2))
        if dis(starts) > 0.15 and dis(starts_d) <= 0.15: starts = starts_d
        if ends and dis(ends) > 0.15 and dis(ends_d) <= 0.15: ends = ends_d
        a = np.median(starts, axis=0)
        out[v] = [[round(x) for x in a[:3]]] + ([[round(x) for x in np.median(ends, axis=0)[:3]]] if ends else [])
        # (how far the two takes disagree, F1 and F2, per part)
        agree[v] = [max(abs(x[0][k] - x[1][k]) / ((x[0][k] + x[1][k]) / 2) for k in range(2)) for x in ([starts] + ([ends] if ends else []))]
    # (a misread vowel: the two takes disagreeing (over 15% in F1 or F2), or outside what a vowel can be
    # (F1 200-1000 Hz, F2 at least 200 over F1, F2 within 80% of the textbook's for this voice's size):
    # the textbook's, scaled to this voice. A voice's own way with a vowel (a fronted "oh" or "oo", as in
    # modern American speech) is kept: the first check, against the textbook by a third, threw those out)
    ratios = [m[0][k] / TEXTBOOK[v][0][k] for v, m in out.items() for k in range(3)]
    r = float(np.median(ratios))
    flagged, raw = [], json.loads(json.dumps(out))
    for v, m in out.items():
        for j, f in enumerate(m):
            t = TEXTBOOK[v][min(j, len(TEXTBOOK[v]) - 1)]
            bad = agree[v][j] > 0.15 or not (200 <= f[0] <= 1000) or f[1] < f[0] + 200 or abs(f[1] / (t[1] * r) - 1) > 0.8
            if bad:
                m[j] = [round(x * r) for x in t]
                flagged.append(f'{v}{"-end" if j else ""}')
    return {
        'flagged': flagged, 'scale': round(r, 3), 'raw': raw,
        'vowels': out,
        'high': [round(float(np.nanmedian(F4))), round(float(np.nanmedian(F5)))],
        'bws': [round(float(np.nanmedian(b))) for b in B],
        'f0': round(float(np.median(f0s))),
    }


for voice in sys.argv[1:] or VOICES:
    p = measure(voice)
    json.dump(p, open(f'out/print/{voice}.json', 'w'), indent=1)
    print(f"\n{voice}: speaking pitch {p['f0']} Hz, F4 {p['high'][0]}, F5 {p['high'][1]}, widths {p['bws']}")
    for v, f in p['vowels'].items():
        print(f"  {v}: {f}   textbook {TEXTBOOK[v]}")
