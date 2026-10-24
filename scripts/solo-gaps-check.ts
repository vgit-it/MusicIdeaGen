// Checks the gap map of the solo melody (docs/SOLO-MELODY.md step 0b, src/parts/solomelody-gaps.ts) on real songs: every gap sized right,
// touching the notes it sits between, none on the protected notes, no two on one junction, the silence of every gap at most a beat,
// nothing else changed by the gap marks; then the numbers: kinds and sizes, the share used by mood, role and kind.
//   npm run solo-gaps-check        (N=140 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { SCALES } from '../src/theory';
import { buildTrack, defaultTrackOptions } from '../src/track';

const N = Number(process.env.N ?? 140);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const MOODS = ['happy', 'melancholic', 'nostalgic', 'tense', 'angry', 'dreamy', 'triumphant', 'dark'] as const;
const METERS = ['4/4', '4/4', '4/4', '3/4', '6/8', '7/8', '5/4', 'mixed'];
let bad = 0;
const fail = (m: string) => { if (bad++ < 25) console.log('FAIL ' + m); };
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + '%' : '-');

const J = { joints: 0, bend: 0, release: 0, passing: 0, neighbour: 0, unjoined: 0, bad: 0, upJoints: 0, upBend: 0 };
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
  const plain = run('melody'), marked = run('marks'), joined = run('joins');
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

    // the joins: every picked joint is joined if it can be; the bend or the notes in between are as the map says
    const jn = joined[si], jg = jn.soloCurve.gaps as any[];
    const jh = jn.guitar2.filter((h: any) => !h.mute && h.notes.length).sort((x: any, y: any) => x.step - y.step);
    const jat = new Map<number, any[]>(); for (const h of jn.guitar2) if (!h.mute) (jat.get(h.step) ?? jat.set(h.step, []).get(h.step)!).push(h);
    const scale = SCALES[sec.song.mode] as readonly number[];
    const inScale = (mm: number) => scale.includes((((mm - sec.song.key) % 12) + 12) % 12);
    jg.forEach((g: any, k: number) => {
      if (g.picked !== gaps[k].picked || g.kind !== gaps[k].kind) fail(`${s}: the joins changed the gap map`);
      if (g.kind !== 'joint' || !g.picked) { if (g.fill) fail(`${s}: a fill on a ${g.kind}${g.picked ? '' : ' that is bare'}`); return; }
      J.joints++;
      if (g.interval > 0) J.upJoints++;
      if (!g.fill) { J.unjoined++; return; }
      J[g.fill.how as 'bend']++;
      const a = jat.get(g.from.step)?.[0], tag = `${s} join at ${g.step}`;
      if (!a) { fail(`${tag}: the note is gone`); return; }
      if (g.fill.how === 'bend') {
        if (a.lateBend !== g.fill.semis || a.notes[0] !== g.from.midi + g.fill.semis || a.len !== g.from.len || !(g.fill.semis <= g.interval) || !inScale(a.notes[0])) fail(`${tag}: a bend of ${g.fill.semis} on ${a.notes[0]} (was ${g.from.midi}, next ${g.to.midi})`);
        if (g.fill.semis === g.interval) J.upBend++;
      } else if (g.fill.how === 'release') {
        if (a.unbend !== g.fill.semis || a.notes[0] !== g.from.midi || a.len !== g.from.len || !(g.fill.semis <= -g.interval) || !inScale(a.notes[0] - g.fill.semis)) fail(`${tag}: a let-down of ${g.fill.semis} on ${a.notes[0]} (next ${g.to.midi})`);
      } else {
        if (a.len !== g.from.len - 2 || a.lateBend || a.unbend) fail(`${tag}: the note is ${a.len} long, was ${g.from.len}`);
        const ns: number[] = g.fill.notes, per = 2 / ns.length;
        ns.forEach((mm, q) => {
          const h = jat.get(g.step + q * per)?.[0];
          if (!h || h.notes[0] !== mm || h.len !== per) fail(`${tag}: the note in between ${mm} is not at ${g.step + q * per}`);
          if (!inScale(mm)) fail(`${tag}: ${mm} is not in the key`);
          if (g.interval !== 0 && !(mm > Math.min(g.from.midi, g.to.midi) && mm < Math.max(g.from.midi, g.to.midi))) fail(`${tag}: ${mm} is not between ${g.from.midi} and ${g.to.midi}`);
        });
        if (a.step + a.len !== g.step) fail(`${tag}: the note ends at ${a.step + a.len}, the join starts ${g.step}`);
      }
    });
    // (no silence over a beat in what is played: the joins leave no new gap)
    for (let q = 0; q + 1 < jh.length; q++) {
      const gp = jh[q + 1].step - (jh[q].step + jh[q].len);
      if (gp > Math.min(...bars.find((b: any) => jh[q].step >= b.start && jh[q].step < b.start + b.len)?.groups ?? [4])) fail(`${s}: a silence of ${gp} at ${jh[q].step + jh[q].len} with the joins`);
    }
  });
}

console.log(`${T.solos} solos, ${T.gaps} gaps (${(T.gaps / Math.max(1, T.solos)).toFixed(1)} a solo), ${T.picked} used (${pct(T.picked, T.gaps)}), ${(T.picked / Math.max(1, T.solos)).toFixed(1)} a solo; used a solo min ${Math.min(...per)} max ${Math.max(...per)}`);
console.log(`kinds: ${Object.entries(KIND).map(([k, v]) => `${k} ${v.n} (${pct(v.used, v.n)} used)`).join(', ')}; sizes: ${Object.entries(SIZE).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
console.log(`roles used: ${Object.entries(ROLE).map(([k, v]) => `${k} ${pct(v.used, v.n)} of ${v.n}`).join(', ')}`);
console.log(`moods used: ${Object.entries(MOOD).map(([k, v]) => `${k} ${pct(v.used, v.n)}`).join(', ')}`);
console.log(`longest silence ${T.silenceMax} steps; gaps with a cut ${T.withCut}; two used in a row ${pct(T.pickedPairs, T.pairs)} of the chances; notes with 4+ steps of room that have a gap ${T.tail4Gap}/${T.tail4}`);
console.log(`joins: ${J.joints} picked joints, ${J.bend} bends (${J.upBend} to the exact note), ${J.release} let down, ${J.passing} with notes in between, ${J.neighbour} neighbour notes, ${J.unjoined} that could not be joined`);
console.log(`rests: ${T.rests} in ${T.solos} solos (${(T.rests / Math.max(1, T.solos)).toFixed(2)} a solo)`);
console.log(bad ? `${bad} FAIL` : '0 FAIL');
if (bad) process.exitCode = 1;
