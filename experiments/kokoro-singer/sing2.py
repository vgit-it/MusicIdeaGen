"""The Kokoro singer test, round 2: better joins, less "talking through autotune".

What changed from sing.py:
- A phrase (the notes between rests) is joined first and sung in one go: one pitch line through it and
  one pass of Praat's PSOLA, not syllable by syllable cut together (the old hard cuts and pitch steps).
- Every piece is first brought to one steady pitch, so pieces meet at the same pitch and line up wave
  for wave in the crossfade.
- D (VCV, as UTAU's banks): pieces from the middle of one vowel through the consonants into the middle
  of the next, joined only in the held middles of vowels; the consonants between syllables are as
  Kokoro said them together. C: the whole spoken syllables of take B, joined at the phrase level.
- The pitch moves like a singer's: notes reached with a little spring and overshoot (Saitou et al.,
  as the app's singer), scoops and falls from the tune, vibrato coming in on long notes, a slow drift
  of a few cents (perfectly flat notes are the "autotune" sound).

Run: .venv/Scripts/python sing2.py [voice ...]  ->  out/C-syllables-<voice>.wav, out/D-vcv-<voice>.wav
"""
import functools
import json
import math
import sys

import numpy as np
import parselmouth
import soundfile as sf
from parselmouth.praat import call

RATE = 24000
LIFT = {'af_heart': 12}
VOICES = ['am_michael', 'am_fenrir', 'af_heart']
PRE = 0.3
FADE = 0.04  # crossfade inside a vowel


@functools.lru_cache(maxsize=None)
def voice_pitch(voice):
    """The voice's own speaking pitch (median over a few pieces): every piece is brought to it."""
    import glob
    f = []
    for p in sorted(glob.glob(f'out/pieces/{voice}/cv-*.wav'))[:20]:
        snd = parselmouth.Sound(*sf.read(p))
        x = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=500).selected_array['frequency']
        f += list(x[x > 0])
    return float(np.median(f))


@functools.lru_cache(maxsize=None)
def piece(voice, name):
    """A piece, trimmed, level-matched and at the voice's one steady pitch."""
    a, r = sf.read(f'out/pieces/{voice}/{name}.wav', dtype='float64')
    env = np.convolve(np.abs(a), np.ones(240) / 240, 'same')
    on = np.where(env > 0.01 * env.max())[0]
    a = a[max(0, on[0] - 120): on[-1] + 120]
    # (Kokoro starts with a little breath, then a silence: cut to the end of the last silence before the
    # loudest part)
    hop = 120
    e = np.sqrt(np.convolve(a ** 2, np.ones(hop) / hop, 'same'))[::hop]
    db = 20 * np.log10(e / e.max() + 1e-9)
    top = int(np.argmax(db))
    quiet = 0
    for k in range(top, -1, -1):
        quiet = quiet + 1 if db[k] < -35 else 0
        if quiet >= 8:  # 40 ms
            a = a[(k + quiet) * hop:]
            break
    a = a / (np.sqrt(np.mean(a ** 2)) + 1e-9) * 0.1
    snd = parselmouth.Sound(a, RATE)
    man = call(snd, 'To Manipulation', 0.005, 60, 500)
    pt = call('Create PitchTier', 'p', 0, snd.duration)
    call(pt, 'Add point', snd.duration / 2, voice_pitch(voice))
    call([pt, man], 'Replace pitch tier')
    return call(man, 'Get resynthesis (overlap-add)').values[0][: len(a)]


def runs(a):
    """The vowel-like runs (voiced, within 12 dB of the loudest), each as (start, end, start refined to
    where it is within 4 dB of the run's own peak: past a voiced consonant into the vowel)."""
    snd = parselmouth.Sound(a, RATE)
    pitch = snd.to_pitch(time_step=0.005, pitch_floor=60, pitch_ceiling=500)
    inten = snd.to_intensity(minimum_pitch=80, time_step=0.005)
    ts = pitch.xs()
    f0 = pitch.selected_array['frequency']
    db = np.array([inten.get_value(t) or -100 for t in ts])
    db = np.nan_to_num(db, nan=-100)
    ok = (f0 > 0) & (db > db.max() - 12)
    out, i = [], 0
    while i < len(ok):
        if ok[i]:
            j = i
            while j < len(ok) and ok[j]:
                j += 1
            if j - i >= 6:
                peak = db[i:j].max()
                k = i + int(np.argmax(db[i:j] > peak - 4))
                out.append((ts[i], ts[j - 1], ts[k], i, j))
            i = j
        else:
            i += 1
    return [r[:3] for r in out]


def two_vowels(a):
    """A VCV piece's two vowels: (first start, second start, second end). Where a voiced consonant
    joins them into one run, the second starts after the deepest dip in its middle."""
    snd = parselmouth.Sound(a, RATE)
    pitch = snd.to_pitch(time_step=0.005, pitch_floor=60, pitch_ceiling=500)
    inten = snd.to_intensity(minimum_pitch=80, time_step=0.005)
    ts = pitch.xs()
    f0 = pitch.selected_array['frequency']
    db = np.nan_to_num(np.array([inten.get_value(t) or -100 for t in ts]), nan=-100)
    db = np.convolve(db, np.ones(4) / 4, 'same')
    ok = (f0 > 0) & (db > db.max() - 12)
    idx = np.where(ok)[0]
    s, e = idx[0], idx[-1]
    # the deepest dip between the two vowels (in the middle of the voiced stretch), or the unvoiced gap
    lo, hi = s + int(0.3 * (e - s)), s + int(0.8 * (e - s))
    gaps = [k for k in range(lo, hi) if not ok[k]]
    d = gaps[len(gaps) // 2] if gaps else lo + int(np.argmin(db[lo:hi]))
    rest = db[d:e + 1]
    v2 = d + int(np.argmax(rest > rest.max() - 3))
    return ts[s], ts[v2], ts[e], ts[d]


def xfade(a, cut_a, b, cut_b):
    """a up to cut_a then b from cut_b, crossfaded, b slid by up to a pitch period to line up.
    Returns the joined sound and how far b's time is shifted in it (b time + shift = joined time)."""
    i, j, n = int(cut_a * RATE), int(cut_b * RATE), int(FADE * RATE)
    i, j = max(i, n // 2), max(j, n // 2)
    w = int(RATE / 80)
    ref = a[i - n // 2: i + n // 2]
    def score(k):
        seg = b[j + k - n // 2: j + k + n // 2]
        return float(np.dot(ref, seg)) if len(seg) == len(ref) and j + k - n // 2 >= 0 else -1e9
    j += max(range(-w, w + 1), key=score)
    fade = np.linspace(0, 1, n)
    mid = a[i - n // 2: i + n // 2] * (1 - fade) + b[j - n // 2: j + n // 2] * fade
    return np.concatenate([a[: i - n // 2], mid, b[j + n // 2:]]), (i - j) / RATE


def build_vcv(voice, P):
    """D: a phrase from VCV pieces. Returns the sound and, per syllable, (vowel start, stretch start, stretch end).
    A vowel lies across two pieces (the end of one, the start of the next) and is joined in its middle;
    the part stretched for a long note runs from just after its start to halfway through its second
    piece's share, so a long note uses as much of Kokoro's own vowel as there is."""
    s0 = P[0][0]['syl']
    a = piece(voice, f'cv-{"_".join(s0["onset"])}-{s0["vowel"]}')
    r = runs(a)[-1]
    vs, ve = r[2], r[1]
    cut = vs + max(0.06, 0.4 * (ve - vs))
    marks = [[vs, vs + 0.03, None]]
    for i in range(len(P) - 1):
        A, ca, B = P[i][0]['syl'], P[i][-1]['syl']['coda'], P[i + 1][0]['syl']
        p = piece(voice, f'vcv-{A["vowel"]}-{"_".join(ca)}-{"_".join(B["onset"])}-{B["vowel"]}')
        v1s, v2s, v2e, dip = two_vowels(p)
        a, shift = xfade(a, cut, p, v1s + 0.07)
        # (the vowel before: stretched on to halfway between the join and the consonants)
        marks[-1][2] = max(marks[-1][1] + 0.03, cut + 0.5 * (dip + shift - 0.04 - cut))
        v2s, v2e = v2s + shift, v2e + shift
        cut = v2s + max(0.06, 0.45 * (v2e - v2s))
        marks.append([v2s, v2s + 0.03, None])
    sn = P[-1]
    coda = sn[-1]['syl']['coda']
    if coda:
        p = piece(voice, f'vc-{sn[0]["syl"]["vowel"]}-{"_".join(coda)}')
        rr = runs(p)[0]
        a, shift = xfade(a, cut, p, rr[2] + 0.25 * (rr[1] - rr[2]))
        marks[-1][2] = max(marks[-1][1] + 0.03, cut + 0.6 * (rr[1] + shift - cut))
    else:
        marks[-1][2] = max(marks[-1][1] + 0.03, marks[-1][0] + 0.6 * (len(a) / RATE - marks[-1][0]))
    return a, marks


def build_syllables(voice, P):
    """C: a phrase from whole spoken syllables, end to start with a short overlap."""
    out, marks = np.zeros(0), []
    for g in P:
        s, coda = g[0]['syl'], g[-1]['syl']['coda']
        p = piece(voice, f'syl-{"_".join(s["onset"])}-{s["vowel"]}-{"_".join(coda)}')
        r = max(runs(p), key=lambda x: x[1] - x[0])
        vs, ve = r[2], r[1]
        n = min(int(0.025 * RATE), len(out))
        off = (len(out) - n) / RATE
        if n:
            f = np.linspace(0, 1, n)
            out = np.concatenate([out[:-n], out[-n:] * (1 - f) + p[:n] * f, p[n:]])
        else:
            out = p.copy()
        marks.append([off + vs, off + vs + 0.2 * (ve - vs), off + vs + 0.7 * (ve - vs)])
    return out, marks


def warp(total, marks, P):
    """Segments (source start, end, factor) putting each vowel's start on its note."""
    t = [g[0]['t'] for g in P] + [P[-1][-1]['end']]
    for i, m in enumerate(marks):
        nxt = marks[i + 1][0] if i + 1 < len(marks) else total
        m[2] = min(m[2], nxt - 0.01)
        m[1] = min(m[1], m[2] - 0.01)
    segs = []
    a0 = marks[0][0]
    segs.append((0, a0, min(1.0, 0.11 / max(a0, 1e-3))))
    for i, (A, rs, re) in enumerate(marks):
        nxt = marks[i + 1][0] if i + 1 < len(marks) else total
        T = t[i + 1] - t[i]
        a, r, c = rs - A, re - rs, nxt - re
        last = i + 1 == len(marks)
        a2 = min(a, 0.2 * T)
        c2 = min(c, max(0.07, (0.5 if last else 0.4) * T))
        r2 = T - a2 - c2 + (c2 * 0.6 if last else 0)  # (a phrase's last coda may run a little past the note)
        if r2 < 0.03:
            k = (T - 0.03) / max(a2 + c2, 1e-3)
            a2, c2, r2 = a2 * k, c2 * k, 0.03
        for s0, s1, new in [(A, rs, a2), (rs, re, r2), (re, nxt, c2)]:
            if s1 - s0 > 0.002:
                segs.append((s0, s1, new / (s1 - s0)))
    return segs


def out_time(segs, x):
    o = 0.0
    for s0, s1, f in segs:
        if x <= s1:
            return o + (x - s0) * f
        o += (s1 - s0) * f
    return o


def back(segs, u):
    o = 0.0
    for s0, s1, f in segs:
        if u < o + (s1 - s0) * f:
            return s0 + (u - o) / f
        o += (s1 - s0) * f
    return segs[-1][1]


def melody(P, lift, t_from, t_to, seed):
    """The sung pitch (semitones, MIDI) every 5 ms over line time t_from..t_to: a singer's line."""
    notes = [n for g in P for n in g]
    dt = 0.005
    ts = np.arange(t_from, t_to, dt)
    target = np.empty(len(ts))
    for k, tn in enumerate(ts):
        cur = notes[0]
        for n in notes:
            if tn >= n['t'] - 0.03:  # (a singer heads for the next note a little early)
                cur = n
        m = cur['midi'] + lift
        x = tn - cur['t']
        if cur.get('slide') and 0 <= x < 0.14:  # a scoop up into it
            m -= cur['slide'] * (1 - x / 0.14)
        if cur.get('fall') and cur['end'] - tn < 0.2 and cur is notes[-1]:  # falling off a phrase's end
            m -= cur['fall'] * ((0.2 - (cur['end'] - tn)) / 0.2) ** 2
        target[k] = m
    # the spring (2nd order, a little overshoot) from note to note
    w, z = 2 * math.pi * 9, 0.6
    y, v = target[0], 0.0
    out = np.empty(len(ts))
    for k in range(len(ts)):
        v += (w * w * (target[k] - y) - 2 * z * w * v) * dt
        y += v * dt
        out[k] = y
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, 2 * math.pi, 3)
    for k, tn in enumerate(ts):
        cur = notes[0]
        for n in notes:
            if tn >= n['t']:
                cur = n
        held = tn - cur['t']
        if cur['end'] - cur['t'] > 0.45 and held > 0.22:
            depth = 0.28 * min(1, (held - 0.22) / 0.35)
            out[k] += depth * math.sin(2 * math.pi * (5.4 * held + 0.15 * math.sin(1.1 * tn)))
        out[k] += 0.06 * math.sin(2 * math.pi * 0.7 * tn + ph[0]) + 0.04 * math.sin(2 * math.pi * 1.9 * tn + ph[1]) + 0.025 * math.sin(2 * math.pi * 4.1 * tn + ph[2])
    return ts, out


def sing_phrase(voice, P, kind, seed):
    a, marks = (build_vcv if kind == 'D' else build_syllables)(voice, P)
    total = len(a) / RATE
    segs = warp(total, marks, P)
    start = P[0][0]['t'] - out_time(segs, marks[0][0])  # line time of the phrase's first sound
    out_len = out_time(segs, total)
    snd = parselmouth.Sound(a, RATE)
    man = call(snd, 'To Manipulation', 0.005, 60, 500)
    dur = call('Create DurationTier', 'd', 0, total)
    for s0, s1, f in segs:
        call(dur, 'Add point', s0 + 0.0005, f)
        call(dur, 'Add point', s1 - 0.0005, f)
    call([dur, man], 'Replace duration tier')
    ts, m = melody(P, LIFT.get(voice, 0), start, start + out_len, seed)
    pt = call('Create PitchTier', 'p', 0, total)
    for tn, x in zip(ts[::2], m[::2]):
        call(pt, 'Add point', back(segs, tn - start), 440 * 2 ** ((x - 69) / 12))
    call([pt, man], 'Replace pitch tier')
    y = call(man, 'Get resynthesis (overlap-add)').values[0]
    # (loudness by note, smoothed)
    notes = [n for g in P for n in g]
    g = np.ones(len(y))
    for k in range(0, len(y), 120):
        tn = start + k / RATE
        cur = notes[0]
        for n in notes:
            if tn >= n['t'] - 0.05:
                cur = n
        g[k: k + 120] = 0.6 + 0.5 * cur['vel']
    g = np.convolve(g, np.ones(1200) / 1200, 'same')
    y = y * g
    fi, fo = int(0.005 * RATE), int(0.03 * RATE)
    y[:fi] *= np.linspace(0, 1, fi)
    y[-fo:] *= np.linspace(1, 0, fo)
    return y, start


def phrases(L):
    groups = []
    for n in L:
        if n['syl']['text'] == '~' and groups:
            groups[-1].append(n)
        else:
            groups.append([n])
    out = [[groups[0]]]
    for i in range(1, len(groups)):
        if groups[i][0]['t'] - groups[i - 1][-1]['end'] > 0.12:
            out.append([])
        out[-1].append(groups[i])
    return out


def main():
    lines = json.load(open('out/lines.json'))
    for voice in sys.argv[1:] or VOICES:
        for kind, name in [('C', 'C-syllables'), ('D', 'D-vcv')]:
            parts = []
            for li, L in enumerate(lines):
                buf = np.zeros(int((L[-1]['end'] + PRE + 1.0) * RATE))
                for pi, P in enumerate(phrases(L)):
                    y, st = sing_phrase(voice, P, kind, li * 31 + pi)
                    i = max(0, int((st + PRE) * RATE))
                    e = min(len(buf), i + len(y))
                    buf[i:e] += y[: e - i]
                parts.append(buf)
            gap = np.zeros(int(0.3 * RATE))
            out = np.concatenate([x for p in parts for x in (p, gap)])
            out = out / np.abs(out).max() * 0.8
            sf.write(f'out/{name}-{voice}.wav', out, RATE, subtype='PCM_16')
            print(f'out/{name}-{voice}.wav', f'{len(out) / RATE:.1f} s')


main()
