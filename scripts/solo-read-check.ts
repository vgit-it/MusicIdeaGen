// Checks the solo player's reader (docs/SOLO-PLAYER.md step 2, src/parts/soloread.ts).
//  1. Spans with a known answer: hand-made melodies, drums, energy and chords where the right tags are certain (a held top note, a leap, a
//     note on the kick, one ending on the snare, one under a fill, rising energy, each groove, a call that hangs, a phrase that repeats...).
//  2. Real solos and breaks (Solo writer "player"): every note has its tags and feel in range, exactly one place on the bar and one chord
//     function, the phrases cover the notes in order, the cells and joints point at real notes, the numbers agree with the gap map; and which
//     tags fire how often (a tag that never fires in a hundred solos is a bug or a dead idea).
//   npm run solo-read-check        (N=140 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import type { ChordPart, DrumPart, Song, SoloCurve, SoloGap } from '../src/idea';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { type BaseNote, readBase } from '../src/parts/soloevents';
import { MIN_W, readSolo } from '../src/parts/soloread';
import type { Mood } from '../src/tension';

const N = Number(process.env.N ?? 140);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const MOODS = ['happy', 'melancholic', 'nostalgic', 'tense', 'angry', 'dreamy', 'triumphant', 'dark'] as const;
const METERS = ['4/4', '4/4', '4/4', '3/4', '6/8', '7/8', '5/4', 'mixed'];
let bad = 0;
const fail = (m: string) => { if (bad++ < 30) console.log('FAIL ' + m); };

// ---------------- 1. spans with a known answer
const song = (o: Partial<Song> = {}): Song => {
  const bars = [0, 1, 2, 3].map((i) => ({ start: i * 16, len: 16, groups: [4, 4, 4, 4] }));
  return { bpm: 120, key: 0, mode: 'major', total: 64, bars, swing: 0, partGenres: { strum: 'rock' }, ...o } as unknown as Song;
};
const chords = (steps: [number, number, 'maj' | 'min'][] = [[0, 0, 'maj']]): ChordPart => ({
  timeline: steps.map(([step, root, q]) => ({ step, chord: { root, q } })) as never,
  chordIdx: Array.from({ length: 64 }, (_, g) => steps.reduce((k, s, i) => (s[0] <= g ? i : k), 0)), notes: [],
});
const drums = (set: (d: DrumPart) => void, fills: DrumPart['fills'] = []): DrumPart => {
  const z = () => new Array(64).fill(0);
  const d = { kick: z(), snare: z(), hat: z(), hatOpen: z(), ride: z(), crash: z(), tom: z(), fills } as DrumPart;
  set(d);
  return d;
};
const mk = (list: [number, number, number][]): BaseNote[] => list.map(([t, len, midi], i) => ({ i, t, len, midi, role: '', anchor: 'pitch', frozen: false, ev: i }));
const curve = (o: Partial<SoloCurve>): SoloCurve => ({ shape: 'a test', pitchC: 0, paceC: 0, energy: [], centre: [], pace: [], ...o });
const has = (r: ReturnType<typeof readSolo>, i: number, id: string, min = 0.5) => (r.notes[i].tags.find((t) => t.id === id)?.w ?? 0) >= min;
const must = (what: string, ok: boolean) => { if (!ok) fail(`known answer: ${what}`); };
const ctxOf = (s: Song, o: Record<string, unknown> = {}) => ({ song: s, chords: chords(), mood: 'happy' as Mood, tension: [0.5, 0.5, 0.5, 0.5], ...o });

{
  const s = song();
  // a held top note
  let r = readSolo(mk([[0, 4, 60], [4, 4, 64], [8, 12, 72]]), ctxOf(s));
  must('a long top note is a held peak', has(r, 2, 'held-peak') && has(r, 2, 'long-note') && has(r, 2, 'peak-note') && !has(r, 0, 'peak-note'));
  must('a note of a beat is not long', !has(r, 0, 'long-note') && has(r, 0, 'beat-note'));
  r = readSolo(mk([[0, 2, 60], [2, 2, 64]]), ctxOf(s));
  must('an 8th is short', has(r, 0, 'short-note'));
  // moves
  r = readSolo(mk([[0, 4, 60], [4, 4, 72], [8, 4, 60], [12, 4, 62]]), ctxOf(s));
  must('a leap up, a leap down, a step', has(r, 1, 'leap-up') && has(r, 0, 'before-leap') && has(r, 2, 'leap-down') && has(r, 3, 'step-up'));
  r = readSolo(mk([[0, 4, 60], [4, 4, 64], [8, 4, 67]]), ctxOf(s));
  must('a stair up', r.cells.some((c) => c.id === 'stair-up' && c.from === 0 && c.to === 2) && has(r, 1, 'skip-up'));
  r = readSolo(mk([[0, 4, 67], [4, 4, 64], [8, 4, 60]]), ctxOf(s));
  must('a stair down', r.cells.some((c) => c.id === 'stair-down'));
  r = readSolo(mk([[0, 4, 60], [4, 4, 64], [8, 4, 60]]), ctxOf(s));
  must('an arch up and a valley', !r.cells.some((c) => c.id === 'valley') && r.cells.some((c) => c.id === 'arch'));
  r = readSolo(mk([[0, 4, 64], [4, 4, 60], [8, 4, 64]]), ctxOf(s));
  must('a valley', r.cells.some((c) => c.id === 'valley'));
  r = readSolo(mk([[0, 4, 60], [4, 4, 60], [8, 4, 60]]), ctxOf(s));
  must('a repeated note', has(r, 1, 'static-repeat') && r.cells.some((c) => c.id === 'static-run'));
  r = readSolo(mk([[0, 8, 60], [8, 2, 64], [10, 2, 62], [12, 2, 64]]), ctxOf(s));
  must('long-short-short cells and a dense cluster', r.cells.some((c) => c.id === 'long-short-short') && r.cells.some((c) => c.id === 'dense-cluster'));
  // the bar
  r = readSolo(mk([[0, 4, 60], [4, 4, 64], [10, 2, 67], [13, 3, 64]]), ctxOf(s));
  must('downbeat, beat, off the beat', has(r, 0, 'on-downbeat') && has(r, 1, 'on-beat') && has(r, 2, 'off-beat') && has(r, 3, 'off-beat', 0.9));
  r = readSolo(mk([[0, 4, 60], [4, 4, 64], [8, 4, 67]]), ctxOf(s));
  must('first and last note, the closing bars', has(r, 0, 'first-note') && has(r, 2, 'last-note'));
  r = readSolo(mk([[48, 8, 60], [56, 8, 64]]), ctxOf(s));
  must('the last bar is the closing', has(r, 0, 'closing') && has(r, 1, 'closing'));
  // chords
  r = readSolo(mk([[0, 12, 60], [12, 4, 64]]), ctxOf(s, { chords: chords([[0, 0, 'maj'], [8, 9, 'min']]) }));
  must('a long note over a chord change, with a common tone (C is in A minor)', has(r, 0, 'long-over-chord-change') && has(r, 0, 'common-tone-next') && has(r, 0, 'root-note'));
  r = readSolo(mk([[0, 4, 64], [4, 4, 67], [8, 4, 62]]), ctxOf(s));
  must('third, fifth and a colour note of the chord', has(r, 0, 'third-note') && has(r, 1, 'fifth-note') && has(r, 2, 'colour-note'));
  // room
  const gap: SoloGap = { kind: 'tail', step: 4, len: 6, cut: 2, silence: 0, from: { step: 0, len: 8, midi: 60 }, to: { step: 8, midi: 64 }, interval: 4, onBeat: true, role: 'call', phrase: 0, j: 0, fits: [], picked: false };
  r = readSolo(mk([[0, 8, 60], [8, 4, 64]]), ctxOf(s, { curve: curve({ gaps: [gap] }) }));
  must('a long note with room', has(r, 0, 'long-with-room') && r.joints[0].tags.some((t) => t.id === 'gap-tail') && r.joints[0].tags.some((t) => t.id === 'gap-bare'));
  r = readSolo(mk([[0, 8, 60], [10, 4, 64]]), ctxOf(s));
  must('a long note before a rest', has(r, 0, 'long-before-rest') && r.joints[0].tags.some((t) => t.id === 'rest-between'));
  // drums
  const dr = drums((d) => { d.kick[0] = 0.9; d.snare[8] = 0.9; d.crash[16] = 1; d.snare[24] = 0.9; });
  r = readSolo(mk([[0, 8, 60], [8, 8, 64], [16, 4, 67]]), ctxOf(s, { drums: dr }));
  must('on the kick and into the snare; on the snare and into a crash; on the crash', has(r, 0, 'on-kick') && has(r, 0, 'into-snare') && has(r, 1, 'on-snare') && has(r, 1, 'into-crash') && has(r, 2, 'on-crash'));
  const fd = drums(() => {}, [{ bar: 0, len: 4 }]);
  r = readSolo(mk([[0, 4, 60], [12, 4, 64]]), ctxOf(s, { drums: fd }));
  must('a note under a drum fill', !has(r, 0, 'under-fill') && has(r, 1, 'under-fill'));
  const g8 = drums((d) => { for (let g = 0; g < 64; g += 2) d.hat[g] = 1; });
  const g16 = drums((d) => { for (let g = 0; g < 64; g++) d.hat[g] = 1; });
  const ht = drums((d) => { for (let b = 0; b < 4; b++) d.snare[b * 16 + 8] = 1; });
  must('eighth hats', has(readSolo(mk([[0, 4, 60]]), ctxOf(s, { drums: g8 })), 0, 'eighths-groove'));
  must('sixteenth hats', has(readSolo(mk([[0, 4, 60]]), ctxOf(s, { drums: g16 })), 0, 'sixteenths-groove'));
  must('half-time', has(readSolo(mk([[0, 4, 60]]), ctxOf(s, { drums: ht })), 0, 'half-time-groove'));
  must('a shuffle (swing)', has(readSolo(mk([[0, 4, 60]]), ctxOf(song({ swing: 0.5 }), { drums: g8 })), 0, 'shuffle-groove'));
  const uneven = drums((d) => { for (let g = 0; g < 32; g++) d.hat[g] = 1; for (let g = 32; g < 64; g += 8) d.hat[g] = 1; });
  must('busy against open drums', has(readSolo(mk([[0, 4, 60], [40, 4, 60]]), ctxOf(s, { drums: uneven })), 0, 'busy-drums') && has(readSolo(mk([[0, 4, 60], [40, 4, 60]]), ctxOf(s, { drums: uneven })), 1, 'open-drums'));
  // energy
  const up = Array.from({ length: 64 }, (_, g) => -1 + (2 * g) / 63);
  r = readSolo(mk([[16, 4, 60], [48, 4, 64]]), ctxOf(s, { curve: curve({ energy: up }) }));
  must('rising energy, a high one at the end', has(r, 0, 'rising-energy') && has(r, 1, 'high-energy') && has(r, 0, 'crest', 2) === false);
  r = readSolo(mk([[16, 4, 60], [48, 4, 64]]), ctxOf(s, { curve: curve({ energy: [...up].reverse() }) }));
  must('falling energy', has(r, 0, 'falling-energy') && has(r, 1, 'low-energy'));
  const wave = Array.from({ length: 64 }, (_, g) => Math.sin((g / 63) * Math.PI));
  r = readSolo(mk([[0, 4, 60], [32, 4, 64]]), ctxOf(s, { curve: curve({ energy: wave }) }));
  must('a crest in the middle of a wave', has(r, 1, 'crest') && !has(r, 0, 'crest'));
  // phrases
  const lands = [
    { step: 4, midi: 64, len: 4, role: 'call' }, { step: 12, midi: 64, len: 4, role: 'answer' }, { step: 20, midi: 72, len: 4, role: 'climax' }, { step: 28, midi: 60, len: 4, role: 'end' },
  ];
  r = readSolo(mk([[0, 4, 60], [4, 4, 64], [8, 4, 60], [12, 4, 64], [16, 4, 67], [20, 4, 72], [24, 4, 64], [28, 4, 60]]), ctxOf(s, { curve: curve({ landings: lands }) }));
  must('phrase roles', r.phrases.length === 4 && has(r, 1, 'call-hanging') && has(r, 3, 'answer-landing') && has(r, 5, 'climax-note') && has(r, 7, 'final-landing') && has(r, 0, 'phrase-start') && has(r, 2, 'pre-climax') && has(r, 3, 'pre-climax') && has(r, 6, 'post-climax') && !has(r, 5, 'pre-climax'));
  must('a phrase that plays the one before again', r.phrases[1].copyOf === 0 && r.phrases[1].tags.some((t) => t.id === 'repeat-copy') && r.phrases[0].tags.some((t) => t.id === 'repeat-source'));
  // the feel
  const f = (mood: Mood, e = 0) => readSolo(mk([[0, 4, 60]]), ctxOf(s, { mood, curve: curve({ energy: new Array(64).fill(e) }) })).notes[0].feel;
  must('angry is more agitated, rougher and heavier than dreamy; dreamy is looser', f('angry').agitation > f('dreamy').agitation && f('angry').roughness > f('dreamy').roughness && f('angry').weight > f('dreamy').weight && f('dreamy').looseness > f('angry').looseness);
  must('strong energy is more agitated than calm', f('happy', 0.8).agitation > f('happy', -0.8).agitation);
  // pure
  const pure = () => JSON.stringify(readSolo(mk([[0, 8, 60], [8, 4, 64]]), ctxOf(s, { drums: dr })));
  must('the same input gives the same reading', pure() === pure());
}

// ---------------- 2. real songs
const FIRE: Record<string, number> = {};
const PH: Record<string, number> = {};
let noteCount = 0;
const T = { solos: 0, peakSolos: 0, heldPeakSolos: 0, joined: 0, joinedRead: 0, cells: 0, minTags: 99 };
const MOODF: Record<string, { n: number; a: number; r: number; l: number }> = {};
const MUST_FIRE = ['long-note', 'short-note', 'leap-up', 'leap-down', 'step-up', 'step-down', 'phrase-start', 'phrase-end', 'call-hanging', 'answer-landing', 'climax-note', 'peak-note',
  'on-downbeat', 'on-beat', 'off-beat', 'root-note', 'third-note', 'fifth-note', 'on-kick', 'on-snare', 'into-snare', 'rising-energy', 'falling-energy', 'crest', 'trough',
  'long-with-room', 'long-before-rest', 'long-over-chord-change', 'busy-drums', 'open-drums', 'eighths-groove', 'high-register', 'low-register', 'closing', 'pre-climax', 'repeat-copy'];
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], meter = METERS[i % METERS.length], mood = MOODS[i % MOODS.length], s = `sr-${i}-${genre}`;
  const idea = generate({ genre, meter, weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const secs = buildTrack(idea, { ...defaultTrackOptions(idea), soloPlan: 'player', mood } as never).sections as any[];
  for (const sec of secs) {
    if (!sec.section?.solo && !sec.section?.lead) continue;
    const read = sec.soloCurve?.read;
    if (!read) { fail(`${s}: a solo with no reading`); continue; }
    T.solos++;
    const tag = `${s} (${meter}, ${mood})`;
    const { notes } = readBase(sec.guitar2, sec.soloCurve);
    // (the carry into the next section can drop a pickup note after the reading was made)
    if (read.notes.length < notes.length || read.notes.length > notes.length + 3) fail(`${tag}: ${read.notes.length} read for ${notes.length} notes`);
    if (read.joints.length !== read.notes.length - 1) fail(`${tag}: ${read.joints.length} joints for ${read.notes.length} notes`);
    let prevTo = -1;
    for (const p of read.phrases) {
      if (p.from !== prevTo + 1 || p.to < p.from) fail(`${tag}: the phrases do not follow on (${p.from}-${p.to} after ${prevTo})`);
      prevTo = p.to;
    }
    if (prevTo !== read.notes.length - 1) fail(`${tag}: the phrases end at ${prevTo} of ${read.notes.length}`);
    for (const c of read.cells) if (c.from < 0 || c.to >= read.notes.length || c.from >= c.to || c.w < MIN_W || c.w > 1) fail(`${tag}: a bad cell ${JSON.stringify(c)}`);
    const seen = new Set<string>();
    let peak = false, held = false;
    for (const n of read.notes) {
      noteCount++;
      T.minTags = Math.min(T.minTags, n.tags.length);
      if (n.tags.length < 3) fail(`${tag}: note ${n.i} has ${n.tags.length} tags`);
      for (let k = 0; k < n.tags.length; k++) {
        const t = n.tags[k];
        if (!(t.w >= MIN_W && t.w <= 1)) fail(`${tag}: ${t.id} has weight ${t.w}`);
        if (k && t.w > n.tags[k - 1].w) fail(`${tag}: tags not sorted at note ${n.i}`);
        seen.add(t.id);
        FIRE[t.id] = (FIRE[t.id] ?? 0) + 1;
      }
      const ids = new Set(n.tags.map((t) => t.id));
      const place = ['on-downbeat', 'on-beat', 'off-beat'].filter((x) => ids.has(x)).length;
      if (place !== 1) fail(`${tag}: note ${n.i} has ${place} places in the bar`);
      const fn = ['root-note', 'third-note', 'fifth-note', 'seventh-note', 'colour-note'].filter((x) => ids.has(x)).length;
      if (fn !== 1) fail(`${tag}: note ${n.i} has ${fn} chord functions`);
      for (const k of Object.keys(n.feel) as (keyof typeof n.feel)[]) if (!(n.feel[k] >= -1 && n.feel[k] <= 1)) fail(`${tag}: feel ${k} ${n.feel[k]}`);
      if (ids.has('peak-note')) peak = true;
      if (ids.has('held-peak')) held = true;
      const m = (MOODF[mood] ??= { n: 0, a: 0, r: 0, l: 0 });
      m.n++; m.a += n.feel.agitation; m.r += n.feel.roughness; m.l += n.feel.looseness;
    }
    for (const p of read.phrases) for (const t of p.tags) { seen.add(t.id); PH[t.id] = (PH[t.id] ?? 0) + 1; }
    if (peak) T.peakSolos++; else fail(`${tag}: no peak note read`);
    if (held) T.heldPeakSolos++;
    for (const id of seen) FIRE['solo:' + id] = (FIRE['solo:' + id] ?? 0) + 1;
    const gaps = (sec.soloCurve.gaps ?? []) as SoloGap[];
    for (const g of gaps) if (g.fill) T.joined++;
    for (const j of read.joints) if (j.tags.some((t: any) => t.id.startsWith('joined-'))) T.joinedRead++;
    T.cells += read.cells.length;
    const climaxes = read.notes.filter((n: any) => n.tags.some((t: any) => t.id === 'climax-note')).length;
    if (climaxes > 1) fail(`${tag}: ${climaxes} climax notes`);
  }
}
if (T.joined !== T.joinedRead) fail(`the gap map has ${T.joined} joined joints, the reading ${T.joinedRead}`);
for (const id of MUST_FIRE) if (!FIRE['solo:' + id]) fail(`the tag ${id} never fired in ${T.solos} solos`);
const mf = (m: string) => { const x = MOODF[m]; return x ? `${m} ${(x.a / x.n).toFixed(2)}/${(x.r / x.n).toFixed(2)}/${(x.l / x.n).toFixed(2)}` : m; };
if (MOODF.angry && MOODF.dreamy && !(MOODF.angry.a / MOODF.angry.n > MOODF.dreamy.a / MOODF.dreamy.n)) fail('angry solos are not read as more agitated than dreamy ones');

const all = Object.keys(FIRE).filter((k) => !k.startsWith('solo:')).sort((a, b) => FIRE[b] - FIRE[a]);
console.log(`${T.solos} solos and breaks, ${noteCount} notes read (fewest tags on a note: ${T.minTags}), ${T.cells} cells; peak read in ${T.peakSolos} solos, a held peak in ${T.heldPeakSolos}`);
console.log(`tags by share of notes: ${all.map((k) => `${k} ${Math.round((100 * FIRE[k]) / noteCount)}%`).join(', ')}`);
console.log(`phrase tags (phrases): ${Object.entries(PH).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`never fired: ${MUST_FIRE.filter((k) => !FIRE['solo:' + k]).join(', ') || 'none of those expected'}`);
console.log(`feel by mood (agitation/roughness/looseness): ${['happy', 'melancholic', 'nostalgic', 'tense', 'angry', 'dreamy', 'triumphant', 'dark'].map(mf).join('; ')}`);
console.log(bad ? `${bad} FAIL` : '0 FAIL');
if (bad) process.exitCode = 1;
