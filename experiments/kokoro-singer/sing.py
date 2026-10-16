"""The Kokoro singer test, step 3: sing the test lines from Kokoro's spoken pieces.

Each syllable: the onset-into-vowel piece joined to the vowel-into-coda piece inside the vowel (or the
whole spoken syllable, take B), its vowel stretched to the note's length and the whole syllable put on
the melody by Praat's overlap-add (PSOLA: the pitch moves, the vowel's character stays). The vowel
lands on the note; the onset comes just before it, as singers do.

Run: .venv/Scripts/python sing.py   ->  out/A-pieces-<voice>.wav, out/B-syllables-<voice>.wav
"""
import json
import math
import sys

import numpy as np
import parselmouth
import soundfile as sf
from parselmouth.praat import call

RATE = 24000
LIFT = {'af_heart': 12}  # (the woman sings an octave up, as in the app)
VOICES = ['am_michael', 'am_fenrir', 'af_heart']


def load(path):
    a, r = sf.read(path, dtype='float64')
    assert r == RATE
    # trim the silence around it
    env = np.convolve(np.abs(a), np.ones(240) / 240, 'same')
    on = np.where(env > 0.01 * env.max())[0]
    a = a[max(0, on[0] - 120): on[-1] + 120]
    return a / (np.sqrt(np.mean(a ** 2)) + 1e-9) * 0.1


def vowel_span(a):
    """(start, end) in seconds of the vowel: voiced and within 6 dB of the loudest part, the longest run."""
    snd = parselmouth.Sound(a, RATE)
    pitch = snd.to_pitch(time_step=0.005, pitch_floor=60, pitch_ceiling=500)
    inten = snd.to_intensity(minimum_pitch=80, time_step=0.005)
    ts = pitch.xs()
    f0 = pitch.selected_array['frequency']
    db = np.array([inten.get_value(t) or -100 for t in ts])
    ok = (f0 > 0) & (db > np.nanmax(db) - 12)
    best, run, start = (0, 0), 0, 0
    for i, x in enumerate(ok):
        if x:
            if run == 0:
                start = i
            run += 1
            if run > best[1] - best[0]:
                best = (start, i + 1)
        else:
            run = 0
    return ts[best[0]], ts[best[1] - 1], float(np.median(f0[best[0]:best[1]]))


def join(a, cut_a, b, cut_b, period):
    """a up to cut_a, then b from cut_b, crossfaded over 40 ms, b slid by up to a period to line up."""
    i, j, n = int(cut_a * RATE), int(cut_b * RATE), int(0.04 * RATE)
    w = int(period * RATE)
    ref = a[i - n // 2: i + n // 2]
    best = max(range(-w, w + 1), key=lambda k: float(np.dot(ref, b[j + k - n // 2: j + k + n // 2])) if j + k - n // 2 >= 0 else -1e9)
    j += best
    fade = np.linspace(0, 1, n)
    out = np.concatenate([a[: i - n // 2], a[i - n // 2: i + n // 2] * (1 - fade) + b[j - n // 2: j + n // 2] * fade, b[j + n // 2:]])
    return out, (i - n // 2) / RATE + n / 2 / RATE


def syllable(voice, s, coda, whole):
    """The spoken syllable, and where its vowel starts and the part to stretch (seconds)."""
    on, cd = '_'.join(s['onset']), '_'.join(coda)
    d = f'out/pieces/{voice}'
    if whole:
        a = load(f'{d}/syl-{on}-{s["vowel"]}-{cd}.wav')
        vs, ve, _ = vowel_span(a)
        L = ve - vs
        return a, vs, (vs + 0.2 * L, vs + 0.7 * L)
    cv = load(f'{d}/cv-{on}-{s["vowel"]}.wav')
    vs, ve, f0 = vowel_span(cv)
    L = ve - vs
    if not coda:
        return cv, vs, (vs + 0.15 * L, vs + 0.55 * L)
    vc = load(f'{d}/vc-{s["vowel"]}-{cd}.wav')
    ws, we, _ = vowel_span(vc)
    # (cut the held vowel before a diphthong's glide; keep the vc piece's own way into the coda)
    a, at = join(cv, vs + 0.35 * L, vc, ws + 0.25 * (we - ws), 1 / f0)
    return a, vs, (vs + 0.1 * L, at)


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def sing_syllable(voice, notes, whole):
    """One syllable over its notes (the first, then any held '~' notes), sung; and its vowel's start."""
    s, coda = notes[0]['syl'], notes[-1]['syl']['coda']
    a, vs, (rs, re) = syllable(voice, s, coda, whole)
    total = len(a) / RATE
    want = notes[-1]['end'] - notes[0]['t']  # vowel start to the end of the last note
    region = re - rs
    tail = (total - vs) - region  # the rest of the vowel and the coda
    # (spoken slowly: onsets brought down to a singer's quick consonant; on quick notes the rest
    # shortened too, the held part most)
    fo = min(1.0, 0.11 / vs)
    ft = min(1.0, max(0.55, 0.45 * want / tail))
    f = max(0.25, (want - tail * ft) / region)
    segs = [(0, vs, fo), (vs, rs, ft), (rs, re, f), (re, total, ft)]
    snd = parselmouth.Sound(a, RATE)
    man = call(snd, 'To Manipulation', 0.005, 60, 500)
    dur = call('Create DurationTier', 'd', 0, total)
    for s0, s1, x in segs:
        call(dur, 'Add point', s0 + 0.001, x)
        call(dur, 'Add point', s1 - 0.001, x)
    call([dur, man], 'Replace duration tier')

    # the melody in the sung (stretched) time, mapped back to the spoken time
    def back(u):
        o = 0.0
        for s0, s1, x in segs:
            if u < o + (s1 - s0) * x:
                return s0 + (u - o) / x
            o += (s1 - s0) * x
        return total

    lift = LIFT.get(voice, 0)
    t0 = notes[0]['t']
    vs_out = vs * fo
    pt = call('Create PitchTier', 'p', 0, total)
    out_len = sum((s1 - s0) * x for s0, s1, x in segs)
    for k in range(int(out_len / 0.01) + 1):
        u = k * 0.01
        tn = t0 + (u - vs_out)  # line time
        cur = notes[0]
        for n in notes:
            if tn >= n['t'] - 0.04:
                cur = n
        m = cur['midi'] + lift
        i = notes.index(cur)
        if i > 0 and tn < cur['t'] + 0.06:  # a quick glide into a held syllable's next note
            m = notes[i - 1]['midi'] + lift + (m - notes[i - 1]['midi'] - lift) * max(0, (tn - cur['t'] + 0.04) / 0.1)
        held = tn - cur['t']
        if cur['end'] - cur['t'] > 0.45 and held > 0.25:  # vibrato on long notes, growing in
            m += 0.3 * min(1, (held - 0.25) / 0.3) * math.sin(2 * math.pi * 5.3 * held)
        call(pt, 'Add point', back(u), hz(m))
    call([pt, man], 'Replace pitch tier')
    out = call(man, 'Get resynthesis (overlap-add)').values[0]
    return out * (0.6 + 0.5 * notes[0]['vel']), vs_out


def sing_line(voice, L, whole):
    groups = []
    for n in L:
        if n['syl']['text'] == '~' and groups:
            groups[-1].append(n)
        else:
            groups.append([n])
    pre = 0.3
    buf = np.zeros(int((L[-1]['end'] + pre + 1.0) * RATE))
    sylls = [sing_syllable(voice, g, whole) for g in groups]
    starts = [int((g[0]['t'] + pre - vs) * RATE) for g, (_, vs) in zip(groups, sylls)]
    for k, ((a, vs), st) in enumerate(zip(sylls, starts)):
        st = max(0, st)
        a = a.copy()
        # (a syllable stops where the next one starts, with a short fade)
        # (on quick notes the next onset may come before this vowel: keep at least a bit of the vowel)
        if k + 1 < len(starts) and st + len(a) > starts[k + 1] + int(0.02 * RATE):
            a = a[: max(int((vs + 0.06) * RATE), starts[k + 1] + int(0.02 * RATE) - st)]
        fo = min(len(a) // 2, int(0.02 * RATE))
        a[len(a) - fo:] *= np.linspace(1, 0, fo)
        fi = min(len(a) // 2, int(0.005 * RATE))
        a[:fi] *= np.linspace(0, 1, fi)
        end = min(len(buf), st + len(a))
        buf[st:end] += a[: end - st]
    return buf


def main():
    lines = json.load(open('out/lines.json'))
    voices = sys.argv[1:] or VOICES
    for voice in voices:
        for whole, name in [(False, 'A-pieces'), (True, 'B-syllables')]:
            parts = [sing_line(voice, L, whole) for L in lines]
            gap = np.zeros(int(0.3 * RATE))
            out = np.concatenate([x for p in parts for x in (p, gap)])
            out = out / np.abs(out).max() * 0.8
            sf.write(f'out/{name}-{voice}.wav', out, RATE, subtype='PCM_16')
            print(f'out/{name}-{voice}.wav', f'{len(out) / RATE:.1f} s')


main()
