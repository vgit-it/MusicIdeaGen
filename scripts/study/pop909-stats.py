"""Studies the melodies in POP909 (MELODY track): scale degrees, intervals, rhythm cells in the bar, phrases, contours,
melody against the chord. Bars come from the dataset's own beat file (the MIDI time signatures are unreliable).
Run: python3 -I scripts/study/pop909-stats.py <pop909 dir> <out.json>
Only numbers are written out; no melody is copied."""
import sys, json, os, math, bisect
from collections import Counter
import mido

KM = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
Km = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
NOTE = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
QUAL = {'maj':[0,4,7],'min':[0,3,7],'dim':[0,3,6],'aug':[0,4,8],'maj7':[0,4,7,11],'min7':[0,3,7,10],'7':[0,4,7,10],
        'sus4':[0,5,7],'sus2':[0,2,7],'hdim7':[0,3,6,10],'dim7':[0,3,6,9],'minmaj7':[0,3,7,11],'maj6':[0,4,7,9],'min6':[0,3,7,9]}
def corr(a, b):
    ma, mb = sum(a)/12, sum(b)/12
    n = sum((x-ma)*(y-mb) for x, y in zip(a, b))
    d = math.sqrt(sum((x-ma)**2 for x in a) * sum((y-mb)**2 for y in b)) or 1
    return n / d
def key_of(pcs):
    best = (-9, 0, 'M')
    for t in range(12):
        rot = [pcs[(t+i) % 12] for i in range(12)]
        for prof, mode in ((KM, 'M'), (Km, 'm')):
            c = corr(rot, prof)
            if c > best[0]: best = (c, t, mode)
    return best
def root_pc(s):
    pc = NOTE[s[0]]
    for ch in s[1:]:
        pc += 1 if ch == '#' else -1 if ch == 'b' else 0
    return pc % 12
def parse_chord(name):
    if name == 'N': return None
    r, _, q = name.partition(':')
    q = q.split('/')[0].split('(')[0] or 'maj'
    return root_pc(r), QUAL.get(q, QUAL['maj'] if not q.startswith('min') else QUAL['min'])

def load_notes(path):
    mid = mido.MidiFile(path)
    # tick -> seconds through the tempo map
    tempos = []; t = 0
    for m in mid.tracks[0]:
        t += m.time
        if m.type == 'set_tempo': tempos.append((t, m.tempo))
    if not tempos or tempos[0][0] != 0: tempos.insert(0, (0, 500000))
    cum = [0.0]
    for (t0, tm), (t1, _) in zip(tempos, tempos[1:]): cum.append(cum[-1] + (t1-t0) * tm / 1e6 / mid.ticks_per_beat)
    tk = [x[0] for x in tempos]
    def sec(tick):
        i = bisect.bisect_right(tk, tick) - 1
        return cum[i] + (tick - tk[i]) * tempos[i][1] / 1e6 / mid.ticks_per_beat
    mel = next((tr for tr in mid.tracks if (tr.name or '').upper() == 'MELODY'), None)
    if mel is None: return None
    t = 0; on = {}; notes = []
    for m in mel:
        t += m.time
        if m.type == 'note_on' and m.velocity > 0: on[m.note] = t
        elif m.type in ('note_off', 'note_on') and m.note in on:
            s = on.pop(m.note); notes.append((sec(s), sec(t), m.note))
    notes.sort()
    return notes

def main(root, out):
    ints = Counter(); degs = {'M': Counter(), 'm': Counter()}; slot = Counter(); durs = Counter()
    cells = Counter(); lens = Counter(); gaps = Counter(); first_deg = Counter(); last_deg = Counter()
    keys = Counter(); nps = []; barrep = []; contour = Counter(); songs = 0; metres = Counter()
    peakpos = []; phr_notes = []; barn = Counter(); runs = Counter(); leap_back = Counter(); ranges = []
    ioi = Counter(); ct_strong = Counter(); ct_weak = Counter(); strong_rel = Counter(); end_ct = Counter(); tempos = []
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d, d + '.mid'); bp = os.path.join(root, d, 'beat_midi.txt'); cp = os.path.join(root, d, 'chord_midi.txt')
        if not (os.path.exists(p) and os.path.exists(bp) and os.path.getsize(p) > 100): continue
        try:
            notes = load_notes(p)
            beats = [tuple(map(float, l.split())) for l in open(bp) if l.strip()]
            chords = []
            for l in open(cp):
                a = l.split()
                if len(a) == 3: chords.append((float(a[0]), float(a[1]), parse_chord(a[2])))
        except Exception: continue
        if not notes or len(notes) < 40 or len(beats) < 8: continue
        bt = [b[0] for b in beats]; down = [i for i, b in enumerate(beats) if b[2] == 1.0]
        if len(down) < 4: continue
        blen = Counter(b - a for a, b in zip(down, down[1:])).most_common(1)[0][0]
        metres[blen] += 1
        if blen != 4: continue
        songs += 1
        tempos.append(60 / (sum(b - a for a, b in zip(bt, bt[1:])) / (len(bt) - 1)))
        pcs = [0]*12
        for s, e, n in notes: pcs[n % 12] += e - s
        _, tonic, mode = key_of(pcs); keys[mode] += 1
        # onsets to 16th slots on the global grid (slot = 4 per beat); bar number from the downbeats
        evs = []; seen = set()
        for s, e, n in notes:
            i = bisect.bisect_right(bt, s) - 1
            if i < 0 or i + 1 >= len(bt): continue
            frac = (s - bt[i]) / (bt[i+1] - bt[i])
            sl = round((i + frac) * 4)
            j = bisect.bisect_right(bt, e) - 1
            if j < 0 or j + 1 >= len(bt): continue
            ef = (j + (e - bt[j]) / (bt[j+1] - bt[j])) * 4
            if sl in seen: continue
            seen.add(sl); evs.append((sl, max(1, round(ef - sl)), n, s))
        if len(evs) < 40: continue
        d0 = down[0] * 4
        ranges.append(max(e[2] for e in evs) - min(e[2] for e in evs))
        def chord_at(t):
            for a, b, c in chords:
                if a <= t < b: return c
            return None
        for k, (sl, dd, n, s) in enumerate(evs):
            deg = (n - tonic) % 12; degs[mode][deg] += 1; durs[min(dd, 16)] += 1
            rel = (sl - d0) % 16; slot[rel] += 1
            if k: ints[max(-12, min(12, n - evs[k-1][2]))] += 1; ioi[min(sl - evs[k-1][0], 16)] += 1
            c = chord_at(s)
            if c:
                inch = (n - c[0]) % 12 in c[1]
                (ct_strong if rel % 4 == 0 else ct_weak)[inch] += 1
                if rel % 8 == 0: strong_rel[(n - c[0]) % 12] += 1
        for k in range(2, len(evs)):
            a, b, c = evs[k-2][2], evs[k-1][2], evs[k][2]
            if abs(b - a) >= 5:
                leap_back['n'] += 1
                if (c - b) * (b - a) < 0 and abs(c - b) <= 2: leap_back['stepback'] += 1
                elif (c - b) * (b - a) < 0: leap_back['back'] += 1
        bars = {}
        for sl, dd, n, s in evs: bars.setdefault((sl - d0) // 16, []).append((sl - d0) % 16)
        prev = []
        for b in sorted(bars):
            mask = tuple(sorted(bars[b])); cells[mask] += 1; barn[len(mask)] += 1
            barrep.append(1 if mask in prev[-4:] else 0); prev.append(mask)
        phrase = [evs[0]]; phrases = []
        for k in range(1, len(evs)):
            gap = evs[k][0] - (evs[k-1][0] + evs[k-1][1])
            if gap >= 6: gaps[min(gap, 32)] += 1; phrases.append(phrase); phrase = []
            phrase.append(evs[k])
        phrases.append(phrase)
        for ph in phrases:
            if len(ph) < 3: continue
            span = ph[-1][0] + ph[-1][1] - ph[0][0]
            lens[min(round(span / 16), 8)] += 1; phr_notes.append(len(ph))
            first_deg[(ph[0][2] - tonic) % 12] += 1; last_deg[(ph[-1][2] - tonic) % 12] += 1
            c = chord_at(ph[-1][3])
            if c: end_ct[(ph[-1][2] - c[0]) % 12 in c[1]] += 1
            ps = [x[2] for x in ph]; pk = ps.index(max(ps)); peakpos.append(pk / (len(ps) - 1))
            dlt = ps[-1] - ps[0]
            contour['rise' if dlt >= 3 else 'fall' if dlt <= -3 else 'level'] += 1
            run = 1
            for k in range(1, len(ps)):
                if ps[k] == ps[k-1]: run += 1
                else:
                    if run > 1: runs[min(run, 8)] += 1
                    run = 1
        nps.append(len(evs) / (((evs[-1][0] - evs[0][0]) / 16) or 1))
    def norm(c):
        t = sum(c.values()) or 1
        return {str(k): round(v / t, 4) for k, v in sorted(c.items(), key=lambda kv: str(kv[0]))}
    def top(c, n=30):
        t = sum(c.values()) or 1
        return [[list(k), round(v / t, 4)] for k, v in c.most_common(n)]
    def rate(c): t = sum(c.values()) or 1; return round(c[True] / t, 3)
    res = {
        'songs_4beat_bars': songs, 'beats_per_bar_all': dict(metres), 'modes': dict(keys),
        'tempo_bpm_mean': round(sum(tempos)/len(tempos), 1),
        'degrees_major': norm(degs['M']), 'degrees_minor': norm(degs['m']),
        'intervals': norm(ints), 'sounding_length_16ths': norm(durs), 'gap_between_onsets_16ths': norm(ioi), 'onset_slot_in_bar_of_16': norm(slot),
        'notes_per_bar_mean': round(sum(nps)/len(nps), 2), 'notes_per_bar_dist': norm(barn),
        'top_bar_rhythms': top(cells), 'bar_rhythm_repeats_one_of_prev4': round(sum(barrep)/len(barrep), 3),
        'phrase_len_bars': norm(lens), 'rest_between_phrases_16ths': norm(gaps),
        'phrase_first_degree': norm(first_deg), 'phrase_last_degree': norm(last_deg),
        'phrase_contour': norm(contour), 'phrase_peak_position_mean': round(sum(peakpos)/len(peakpos), 3),
        'notes_per_phrase_mean': round(sum(phr_notes)/len(phr_notes), 2), 'repeated_note_runs': norm(runs),
        'leap_followed': dict(leap_back), 'melody_range_semitones_mean': round(sum(ranges)/len(ranges), 1),
        'chord_tone_rate_on_beats': rate(ct_strong), 'chord_tone_rate_off_beats': rate(ct_weak),
        'phrase_ends_on_chord_tone': rate(end_ct), 'interval_from_chord_root_on_half_bars': norm(strong_rel),
    }
    json.dump(res, open(out, 'w'), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != 'top_bar_rhythms'}))
main(sys.argv[1], sys.argv[2])
