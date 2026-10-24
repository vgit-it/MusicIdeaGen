// Checks the melody step of the planned solo writer (docs/SOLO-MELODY.md, src/parts/solomelody.ts) on real songs:
// every note a chord note (over every chord it is held across), no silence over a beat, no note shorter than an 8th or longer than a bar,
// no overlaps, one highest note (the climax), the last bar one held note, and the mood in the intervals (the stats per mood).
//   npm run solo-melody-check        (N=140 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { chordTones } from '../src/parts/guitar2';
import { QUALITIES, SCALES, chordPc } from '../src/theory';
import { buildTrack, defaultTrackOptions } from '../src/track';

const N = Number(process.env.N ?? 140);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const MOODS = ['happy', 'melancholic', 'nostalgic', 'tense', 'angry', 'dreamy', 'triumphant', 'dark'] as const;
const METERS = ['4/4', '4/4', '4/4', '3/4', '6/8', '7/8', '5/4', 'mixed'];
let bad = 0;
const fail = (m: string) => { if (bad++ < 25) console.log('FAIL ' + m); };
const mod = (n: number, m: number) => ((n % m) + m) % m;
/** A chord note, or over a two-note chord (a power chord) the key's own 3rd. */
const isCore = (key: number, mode: string, chord: any, m: number) => {
  if (chordTones(key, chord).includes(mod(m, 12))) return true;
  if (new Set((QUALITIES[chord.q] as readonly number[]).map((x) => x % 12)).size > 2) return false;
  const d = mod(m - chordPc(key, chord), 12);
  return (d === 3 || d === 4) && (SCALES[mode as never] as readonly number[]).includes(mod(m - key, 12));
};
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const T = { solos: 0, notes: 0, longN: 0, shortN: 0, maxGap: 0, overBeat: 0, tooShort: 0, tooLong: 0, notTone: 0, overlap: 0, peakOk: 0, peaks: 0, endRoot: 0, ends: 0, callOff: 0, calls: 0, cutEnd: 0, ansRoot: 0, answers: 0, echoes: 0, phrases: 0, sixteenths: 0, sameRun3: 0 };
const M: Record<string, { moves: number[]; up: number; rough: number; same: number; leaps: number }> = {};
for (const m of MOODS) M[m] = { moves: [], up: 0, rough: 0, same: 0, leaps: 0 };

for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], meter = METERS[i % METERS.length], mood = MOODS[i % MOODS.length], s = `sm-${i}-${genre}`;
  const idea = generate({ genre, meter, weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const sections = buildTrack(idea, { ...defaultTrackOptions(idea), soloPlan: 'melody', mood } as never).sections as any[];
  for (const sec of sections) {
    if (!sec.section?.solo) continue;
    const total = sec.song.total, bars = sec.song.bars;
    const hits = sec.guitar2.filter((h: any) => !h.mute && h.notes.length).sort((x: any, y: any) => x.step - y.step);
    if (!hits.length) { fail(`${s}: no notes`); continue; }
    T.solos++;
    const lastBar = bars[bars.length - 1];
    const barAt = (g: number) => bars.find((b: any) => g >= b.start && g < b.start + b.len) ?? lastBar;
    const beat = (g: number) => Math.min(...barAt(g).groups);
    const chordAt = (g: number) => sec.chords.timeline[sec.chords.chordIdx[Math.min(total - 1, g)]].chord;
    const cSteps: number[] = sec.chords.timeline.map((e: any) => e.step);
    let run = 1;
    hits.forEach((h: any, k: number) => {
      const p = hits[k - 1], final = k === hits.length - 1;
      T.notes++;
      if (h.notes.length !== 1) fail(`${s}: a double-stop at ${h.step}`);
      if (!(final && h.bendAt !== undefined) && (h.bend || h.unbend || h.lateBend || h.trill || h.tremolo || h.rake)) fail(`${s}: a technique at ${h.step}`);
      const bs = beat(h.step);
      if (h.len > bs) T.longN++; else T.shortN++;
      if (h.len < 2) { T.tooShort++; fail(`${s}: note at ${h.step} shorter than an 8th`); }
      if (h.len === 1) T.sixteenths++;
      if (!final && h.len > barAt(h.step).len) { T.tooLong++; fail(`${s}: note at ${h.step} len ${h.len} over a bar`); }
      // (a chord note of every chord it sounds over; the last note is carried into the next section)
      const end = final && h.step === lastBar.start ? Math.min(total, h.step + lastBar.len) : h.step + h.len;
      const pts = [h.step, ...cSteps.filter((c) => c > h.step && c < end)];
      if (!(final && h.bendAt !== undefined) && !pts.every((g) => isCore(sec.song.key, sec.song.mode, chordAt(g), h.notes[0]))) { T.notTone++; fail(`${s}: note ${h.notes[0]} at ${h.step} len ${h.len} is not a chord note`); }
      if (p) {
        const gap = h.step - (p.step + p.len);
        if (gap < 0) { T.overlap++; fail(`${s}: note at ${p.step} len ${p.len} runs into ${h.step}`); }
        T.maxGap = Math.max(T.maxGap, gap);
        if (gap > beat(p.step + p.len)) { T.overBeat++; fail(`${s}: a silence of ${gap} steps at ${p.step + p.len}`); }
        const d = h.notes[0] - p.notes[0], a = Math.abs(d), m = M[mood];
        if (d === 0) { m.same++; run++; if (run === 3) T.sameRun3++; } else { run = 1; m.moves.push(a); if (d > 0) m.up++; if ([1, 6, 11].includes(a % 12)) m.rough++; if (a >= 5) m.leaps++; }
      }
    });
    if (hits[0].step > beat(0)) fail(`${s}: first note at ${hits[0].step}`);
    // the last bar: one held note on a chord note of the home chord, from the last bar's start
    const fin = hits[hits.length - 1];
    // (the last bar is cut by the song's ending, or by the band stopping before the next section)
    if (fin.step !== lastBar.start) { if (sec.section.kind === 'outro' || (sec.section.tail?.stop ?? Infinity) <= lastBar.start) T.cutEnd++; else fail(`${s}: the last note starts at ${fin.step}, not the last bar (${lastBar.start})`); }
    // (the planned last note, before it is carried into the next section's chord)
    const endLand = [...(sec.soloCurve?.landings ?? [])].reverse().find((l: any) => l.role === 'end');
    if (endLand) { T.ends++; if (mod(endLand.midi, 12) === mod(chordTones(sec.song.key, chordAt(endLand.step))[0], 12)) T.endRoot++; }
    // the climax is the highest note, alone at the top (or tied by its own repeat)
    const lands = sec.soloCurve?.landings ?? [];
    const cl = lands.find((l: any) => l.role === 'climax');
    if (cl) {
      T.peaks++;
      const top = Math.max(...hits.map((h: any) => h.notes[0]));
      const above = hits.filter((h: any) => h.notes[0] >= cl.midi && h.step !== cl.step).length;
      if (cl.midi >= top && above === 0) T.peakOk++;
      else if (cl.midi >= top) T.peakOk += 0.5;
    }
    for (const l of lands) {
      if (l.role === 'call') { T.calls++; if (mod(l.midi, 12) !== mod(chordTones(sec.song.key, chordAt(l.step))[0], 12)) T.callOff++; }
      if (l.role === 'answer') { T.answers++; if (mod(l.midi, 12) === mod(chordTones(sec.song.key, chordAt(l.step))[0], 12)) T.ansRoot++; }
    }
    const note = (sec.notes as string[]).find((n) => /melody only/.test(n)) ?? '';
    const e = /(\d+) answers on the call/.exec(note); if (e) T.echoes += Number(e[1]);
    T.phrases += lands.length;
  }
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + '%' : '-');
console.log(`${T.solos} solos, ${T.notes} notes (${pct(T.longN, T.notes)} long), ${(T.notes / Math.max(1, T.solos)).toFixed(1)} notes a solo`);
console.log(`silences: longest ${T.maxGap} steps, over a beat ${T.overBeat}; notes under an 8th ${T.sixteenths}; over a bar ${T.tooLong}; overlaps ${T.overlap}; not a chord note ${T.notTone}; 3 of one pitch in a row ${T.sameRun3}`);
console.log(`peak is the top note ${pct(T.peakOk, T.peaks)}; the last note on the root ${pct(T.endRoot, T.ends)}; calls off the root ${pct(T.callOff, T.calls)}; answers on the root ${pct(T.ansRoot, T.answers)}; the last bar cut ${T.cutEnd}; ${T.echoes} answers on the call's rhythm of ${T.phrases} phrases`);
console.log('mood            moves  step  up   rough  leaps  repeats');
const row: Record<string, { step: number; up: number; leaps: number; same: number }> = {};
for (const mo of MOODS) {
  const m = M[mo], n = m.moves.length;
  row[mo] = { step: avg(m.moves), up: n ? m.up / n : 0, leaps: n ? m.leaps / n : 0, same: m.same / Math.max(1, n + m.same) };
  console.log(`${mo.padEnd(14)} ${String(n).padStart(6)} ${avg(m.moves).toFixed(1).padStart(5)} ${pct(m.up, n).padStart(4)} ${pct(m.rough, n).padStart(5)} ${pct(m.leaps, n).padStart(6)} ${pct(m.same, n + m.same).padStart(7)}`);
}
// the mood is heard: the wide, rising moods move further and leap more than the small, falling ones
const wide = avg(['triumphant', 'angry'].map((m) => row[m].step)), small = avg(['melancholic', 'dark'].map((m) => row[m].step));
if (!(wide > small + 0.2)) fail(`moods: wide ${wide.toFixed(2)} not above small ${small.toFixed(2)}`);
const leapHi = avg(['triumphant', 'angry'].map((m) => row[m].leaps)), leapLo = avg(['melancholic', 'dark'].map((m) => row[m].leaps));
if (!(leapHi > leapLo + 0.1)) fail(`moods: leaps ${leapHi.toFixed(2)} not above ${leapLo.toFixed(2)}`);
const upHi = avg(['happy', 'triumphant'].map((m) => row[m].up)), upLo = avg(['melancholic', 'dark'].map((m) => row[m].up));
if (!(upHi > upLo + 0.05)) fail(`moods: rising ${upHi.toFixed(2)} not above falling ${upLo.toFixed(2)}`);
if (T.sixteenths) fail('notes under an 8th');
console.log(bad ? `${bad} FAIL` : '0 FAIL');
if (bad) process.exitCode = 1;
