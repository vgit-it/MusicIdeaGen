// Checks the melody view's reading of the form (src/verse/variants.ts) on real songs: the leaves cover every bar, each answer's notes
// are all counted, shapes sit inside their phrases, endings are known. Prints how much of an answer repeats its source.
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { autoMood } from '../src/tension';
import { EMO_IDS } from '../src/verse/emotion';
import { songOptions, writeSong } from '../src/verse/sing';
import { compareLeaf, endingOf, leafSpans } from '../src/verse/variants';

const N = Number(process.env.N ?? 80);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const ENDS = new Set(['held', 'open', 'hang', 'punch', 'sync', 'plain']);
let bad = 0;
const fail = (m: string) => { if (bad++ < 20) console.log('FAIL ' + m); };
const tot = { sections: 0, answers: 0, same: 0, pitch: 0, rhythm: 0, new: 0, dropped: 0, notes: 0, shapes: 0, ends: {} as Record<string, number> };
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `vv-${i}-${genre}`;
  const idea = generate({ genre, meter: i % 9 === 8 ? '6/8' : '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  const mood = autoMood(idea.song, idea.seeds.song);
  const song = writeSong(list, songOptions(s + 'v', 0, { mood, on: new Set(EMO_IDS), climax: list[0] } as never));
  for (const sec of list) {
    const v = song.get(sec);
    if (!v) continue;
    const { built } = v, bars = sec.song.bars, total = sec.song.total;
    tot.sections++;
    const spans = leafSpans(built.leaves, (b) => bars[b].start, bars.length, total);
    const L = `${s} ${sec.section?.kind}`;
    if (spans[0].from !== 0) fail(`${L}: first leaf starts at ${spans[0].from}`);
    const lastRight = Math.max(...spans.filter((x) => x.leaf.source === null || true).map((x) => x.to));
    if (lastRight !== total && built.leaves.length) fail(`${L}: leaves end at ${lastRight}, section at ${total}`);
    for (const sp of spans) {
      const src = spans.find((x) => x.leaf.id === sp.leaf.source);
      if (!src) continue;
      const c = compareLeaf(built.notes, src, sp);
      const mine = built.notes.filter((n) => n.step >= sp.from - 1e-6 && n.step < sp.to - 1e-6).length;
      const sum = c.count.same + c.count.pitch + c.count.rhythm + c.count.new;
      if (sum !== mine || c.diffs.size !== mine) fail(`${L}: ${sp.leaf.name} counts ${sum} vs ${mine} notes`);
      tot.answers++; tot.notes += mine;
      for (const k of ['same', 'pitch', 'rhythm', 'new', 'dropped'] as const) tot[k] += c.count[k];
    }
    for (const sh of built.shapes) {
      const ph = built.phrases.find((p) => p.step === sh.phrase);
      if (!ph) { fail(`${L}: shape with no phrase at ${sh.phrase}`); continue; }
      if (!sh.bars && (sh.step < ph.step - 1e-6 || sh.step + sh.n * sh.len > ph.step + ph.len + 1e-6)) fail(`${L}: shape outside its phrase`);
      tot.shapes++;
    }
    for (const ph of built.phrases) {
      const e = endingOf(built.notes, ph);
      if (!ENDS.has(e.style)) fail(`${L}: unknown ending ${e.style}`);
      tot.ends[e.style] = (tot.ends[e.style] ?? 0) + 1;
    }
  }
}
const pct = (n: number) => `${Math.round((100 * n) / Math.max(1, tot.notes))}%`;
console.log(`${tot.sections} sections, ${tot.answers} answering leaves, ${tot.shapes} shapes`);
console.log(`answer notes against their source: same ${pct(tot.same)} · other pitch ${pct(tot.pitch)} · other length ${pct(tot.rhythm)} · new ${pct(tot.new)} · (${tot.dropped} source notes dropped)`);
console.log('phrase endings:', JSON.stringify(tot.ends));
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
