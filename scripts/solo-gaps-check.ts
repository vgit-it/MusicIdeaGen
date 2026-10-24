// Checks the gap map of the solo melody (docs/SOLO-MELODY.md step 0b, src/parts/solomelody-gaps.ts) on real songs: every gap sized right,
// touching the notes it sits between, none on the protected notes, no two on one junction, the silence of every gap at most a beat,
// nothing else changed by the gap marks; then the numbers: kinds and sizes, the share used by mood, role and kind.
//   npm run solo-gaps-check        (N=140 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';

const N = Number(process.env.N ?? 140);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const MOODS = ['happy', 'melancholic', 'nostalgic', 'tense', 'angry', 'dreamy', 'triumphant', 'dark'] as const;
const METERS = ['4/4', '4/4', '4/4', '3/4', '6/8', '7/8', '5/4', 'mixed'];
let bad = 0;
const fail = (m: string) => { if (bad++ < 25) console.log('FAIL ' + m); };
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + '%' : '-');

const T = { solos: 0, gaps: 0, picked: 0, pairs: 0, pickedPairs: 0, tail4: 0, tail4Gap: 0, rests: 0, silenceMax: 0, withCut: 0 };
const KIND: Record<string, { n: number; used: number }> = { rest: { n: 0, used: 0 }, tail: { n: 0, used: 0 }, joint: { n: 0, used: 0 } };
const ROLE: Record<string, { n: number; used: number }> = {};
const MOOD: Record<string, { n: number; used: number }> = {};
const SIZE: Record<string, number> = {};
const per: number[] = [];

for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], meter = METERS[i % METERS.length], mood = MOODS[i % MOODS.length], s = `sg-${i}-${genre}`;
  const idea = generate({ genre, meter, weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const run = (soloPlan: string) => buildTrack(idea, { ...defaultTrackOptions(idea), soloPlan, mood } as never).sections as any[];
  const plain = run('melody'), marked = run('marks');
  plain.forEach((sec, si) => {
    if (!sec.section?.solo) return;
    const gaps = sec.soloCurve?.gaps as any[] | undefined;
    if (!gaps) { fail(`${s}: no gap map`); return; }
    T.solos++;
    const total = sec.song.total, bars = sec.song.bars;
    const hits = sec.guitar2.filter((h: any) => !h.mute && h.notes.length).sort((x: any, y: any) => x.step - y.step);
    const barAt = (g: number) => bars.find((b: any) => g >= b.start && g < b.start + b.len) ?? bars[bars.length - 1];
    const beat = (g: number) => Math.min(...barAt(g).groups);
    const at = new Map<number, any>(hits.map((h: any) => [h.step, h]));
    let prevEnd = -1, prevFrom = -1, used = 0;
    gaps.forEach((g, k) => {
      const tag = `${s} gap ${k} ${g.kind} at ${g.step}`;
      if (g.len < 2 || g.len % 2) fail(`${tag}: size ${g.len}`);
      if (g.step < 0 || g.step + g.len > total) fail(`${tag}: outside the section`);
      if (g.step < prevEnd) fail(`${tag}: overlaps the one before`);
      prevEnd = g.step + g.len;
      const to = g.to && at.get(g.to.step);
      // (the last note is carried into the next section and bent, or cut by the song's ending or the band stopping)
      const last = g.to.step >= bars[bars.length - 1].start;
      if (!last && (!to || to.notes[0] !== g.to.midi)) fail(`${tag}: the next note is not there`);
      if (g.step + g.len !== g.to.step) fail(`${tag}: does not reach the next note (${g.step + g.len} vs ${g.to.step})`);
      if (g.from) {
        const f = at.get(g.from.step);
        if (!f || f.notes[0] !== g.from.midi) fail(`${tag}: the note before is not there`);
        if (g.from.step === prevFrom) fail(`${tag}: two gaps on one junction`);
        prevFrom = g.from.step;
        const end = g.from.step + g.from.len;
        if (g.step !== end - g.cut) fail(`${tag}: starts at ${g.step}, the note ends ${end}, cut ${g.cut}`);
        if (g.cut && g.from.len - g.cut < 2) fail(`${tag}: cuts the note to ${g.from.len - g.cut}`);
        if (g.kind === 'tail' && g.from.len - g.cut < beat(g.from.step)) fail(`${tag}: the note keeps less than a beat`);
        if (g.kind === 'joint' && (g.cut !== 2 || g.from.len < 4 || !(Math.abs(g.interval) >= 3 || g.interval === 0))) fail(`${tag}: a joint of cut ${g.cut} on a note of ${g.from.len}, interval ${g.interval}`);
        if (g.from.step === hits[0].step && g.cut) fail(`${tag}: cuts the first note`);
        if (g.role === 'climax' && g.cut && g.from.len >= 8 && g.from.step === (sec.soloCurve.landings.find((l: any) => l.role === 'climax')?.step)) fail(`${tag}: cuts the climax note`);
      } else if (g.step !== 0) fail(`${tag}: a gap with no note before that is not at the start`);
      if (g.kind === 'rest') {
        T.rests++;
        if (g.silence !== g.len - g.cut || g.silence <= 0) fail(`${tag}: silence ${g.silence} of ${g.len} cut ${g.cut}`);
        if (g.silence > beat(g.step)) fail(`${tag}: a silence of ${g.silence}, over a beat`);
        T.silenceMax = Math.max(T.silenceMax, g.silence);
      } else if (g.silence !== 0) fail(`${tag}: a silence in a ${g.kind}`);
      if (g.cut) T.withCut++;
      T.gaps++;
      const bucket = g.len <= 2 ? '2' : g.len <= 4 ? '4' : g.len <= 6 ? '6' : '8+';
      SIZE[bucket] = (SIZE[bucket] ?? 0) + 1;
      for (const [m, k2] of [[KIND, g.kind], [ROLE, g.role], [MOOD, mood]] as const) { (m[k2] ??= { n: 0, used: 0 }).n++; if (g.picked) m[k2].used++; }
      if (k && gaps[k - 1].picked) { T.pairs++; if (g.picked) T.pickedPairs++; }
      if (g.picked) { T.picked++; used++; }
    });
    per.push(used);
    // (every long note that touches the next, not frozen, has a gap)
    for (let h = 1; h + 1 < hits.length; h++) {
      const a = hits[h], b = hits[h + 1];
      const bt = Math.min(...barAt(a.step).groups);
      if (a.step + a.len === b.step && a.len - Math.max(bt, 2 * Math.ceil(a.len / 4)) >= 4) {
        T.tail4++;
        const peak = sec.soloCurve.landings.some((l: any) => l.role === 'climax' && l.step === a.step);
        if (peak || gaps.some((g: any) => g.from?.step === a.step)) T.tail4Gap++;
        else fail(`${s}: a note of ${a.len} at ${a.step} has 4+ steps of room and no gap`);
      }
    }
    // the marks change nothing else: the same notes, and a scratch on each used gap
    const m = marked[si];
    const mh = m.guitar2.filter((h: any) => !h.mute && h.notes.length).sort((x: any, y: any) => x.step - y.step);
    if (mh.length !== hits.length || mh.some((h: any, q: number) => h.step !== hits[q].step || h.notes[0] !== hits[q].notes[0] || h.len !== hits[q].len)) fail(`${s}: the marks changed the melody`);
    const scratches = m.guitar2.filter((h: any) => h.mute === 'dead').length;
    if (scratches !== used) fail(`${s}: ${scratches} scratches for ${used} used gaps`);
  });
}

console.log(`${T.solos} solos, ${T.gaps} gaps (${(T.gaps / Math.max(1, T.solos)).toFixed(1)} a solo), ${T.picked} used (${pct(T.picked, T.gaps)}), ${(T.picked / Math.max(1, T.solos)).toFixed(1)} a solo; used a solo min ${Math.min(...per)} max ${Math.max(...per)}`);
console.log(`kinds: ${Object.entries(KIND).map(([k, v]) => `${k} ${v.n} (${pct(v.used, v.n)} used)`).join(', ')}; sizes: ${Object.entries(SIZE).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
console.log(`roles used: ${Object.entries(ROLE).map(([k, v]) => `${k} ${pct(v.used, v.n)} of ${v.n}`).join(', ')}`);
console.log(`moods used: ${Object.entries(MOOD).map(([k, v]) => `${k} ${pct(v.used, v.n)}`).join(', ')}`);
console.log(`longest silence ${T.silenceMax} steps; gaps with a cut ${T.withCut}; two used in a row ${pct(T.pickedPairs, T.pairs)} of the chances; notes with 4+ steps of room that have a gap ${T.tail4Gap}/${T.tail4}`);
console.log(bad ? `${bad} FAIL` : '0 FAIL');
if (bad) process.exitCode = 1;
