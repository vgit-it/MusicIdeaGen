// Bends inside notes (rule 15): over many songs, checks the holds around them and counts the kinds.
//   npm run bend-check            (N=224 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS } from '../src/tension';
import { SCALES } from '../src/theory';
import { barOf, buildSection } from '../src/verse/section';
import { DEFAULT_RANGE } from '../src/verse/verse';

const N = Number(process.env.N ?? 224);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const OPTS = { range: { ...DEFAULT_RANGE }, bends: 'some' as const, meta: true, variation: 'some' as const, pentatonic: !!process.env.PENT };
const bad: string[] = [];
const fail = (m: string) => { bad.push(m); if (bad.length < 12) console.log('FAIL', m); };
const kinds: Record<string, number> = {}, sizes: Record<string, number> = {};
let shortNotes = 0, capable = 0, capableBent = 0, notes = 0, bends = 0, singles = 0, singleBent = 0, longHoldBends = 0, back = 0, slowBack = 0, shortBefore = 0, shortAfter = 0;
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], mood = MOODS[Math.floor(i / 7) % 8], meter = i % 9 === 8 ? '6/8' : '4/4';
  const s = `vv-${i}-${genre}-${mood}`;
  const idea = generate({ genre, meter, weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  for (const sec of buildTrack(idea, { ...defaultTrackOptions(idea), mood } as never).sections) {
    if (!sec.section || ['intro', 'solo'].includes(sec.section.kind)) continue;
    let b; try { b = buildSection(sec, OPTS); } catch { continue; }
    const bar = barOf(sec), beat = bar / 4, eighth = bar / 8, scale = new Set(SCALES[sec.song.mode].map((x) => (sec.song.key + x) % 12));
    for (const n of b.notes) {
      notes++;
      const single = n.len >= 1.5 * beat - 1e-6 && !n.longHold && !n.third && !n.walk && !n.nb;
      if (single) singles++;
      const can = single && n.len >= eighth + beat + 1 - 1e-6;
      if (can) { capable++; if (n.bendTo !== undefined) capableBent++; }
      if (n.bendTo === undefined) continue;
      if (n.longHold) { longHoldBends++; continue; }
      bends++; if (single) singleBent++;
      const id = `${s}:${sec.section.kind}@${n.step}`;
      kinds[n.inner ?? '?'] = (kinds[n.inner ?? '?'] ?? 0) + 1;
      const moves = [{ at: n.bendAt!, len: n.bendLen!, to: n.bendTo }, ...(n.more ?? [])];
      const last = moves[moves.length - 1];
      if (!single) { shortNotes++; continue; }
      if (n.bendAt! < eighth - 1e-6) { shortBefore++; fail(`${id} ${n.inner}: held ${n.bendAt} before the bend`); }
      if (n.len - (last.at + last.len) < beat - 1e-6) { shortAfter++; fail(`${id} ${n.inner}: held ${n.len - (last.at + last.len)} after the bend`); }
      const d = n.bendTo - n.midi; sizes[d] = (sizes[d] ?? 0) + 1;
      if (/ step /.test(n.inner ?? '')) {
        const want = /^half/.test(n.inner!) ? 1 : 2;
        if (Math.abs(d) !== want) fail(`${id} ${n.inner}: moved ${d}`);
        if (!scale.has(((n.bendTo % 12) + 12) % 12)) fail(`${id} ${n.inner}: target not in the scale`);
        if (/and back/.test(n.inner!)) {
          back++;
          if (moves.length !== 2 || moves[1].to !== n.midi) fail(`${id} ${n.inner}: doesn't return`);
          else if (moves[1].at - (moves[0].at + moves[0].len) < eighth - 1e-6) fail(`${id} ${n.inner}: stays only ${moves[1].at - moves[0].at - moves[0].len}`);
          if (/^half/.test(n.inner!)) { slowBack++; if (moves[0].len < 2) fail(`${id} ${n.inner}: glide ${moves[0].len} isn't slower`); }
        }
      }
    }
  }
}
console.log(`${notes} notes; inner bends ${bends} (+${longHoldBends} in long holds); single long notes ${singles}, bent ${singleBent} (${(100 * singleBent / singles).toFixed(1)}%)`);
console.log(`long enough to bend with a quarter bar left after (${capable} notes): ${(100 * capableBent / capable).toFixed(1)}% bend`);
console.log(`kinds: ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`sizes: ${Object.entries(sizes).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
console.log(`bends on notes under a beat and a half (as before, no hold rule): ${shortNotes}`);
console.log(`and back: ${back} (${slowBack} with a half-step glide, slower); held under an 8th before: ${shortBefore}, under a quarter bar after: ${shortAfter}`);
console.log(bad.length ? `${bad.length} FAILURES` : 'all checks passed');
