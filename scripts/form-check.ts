// Checks the called form (src/verse/form.ts) on real songs: every verse, chorus and bridge of exactly 8 or 16 bars is cut into 4-bar
// leaves (A A' / A A' A'' A'''), each answer writes its ending again, and no leaf but the last ends by coming home.
//   npm run form-check          (N=168 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { autoMood } from '../src/tension';
import { EMO_IDS } from '../src/verse/emotion';
import { songOptions, writeSong } from '../src/verse/sing';
import { leafSpans } from '../src/verse/variants';

const N = Number(process.env.N ?? 168);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const CALLED = new Set(['verse', 'chorus', 'bridge']);
let bad = 0;
const fail = (m: string) => { if (bad++ < 20) console.log('FAIL ' + m); };
const count = { called: 0, other: 0, otherSplit: 0, mids: 0, midRoles: {} as Record<string, number>, lengths: {} as Record<string, number> };
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `vv-${i}-${genre}`;
  const idea = generate({ genre, meter: i % 9 === 8 ? '6/8' : '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  const mood = autoMood(idea.song, idea.seeds.song);
  const song = writeSong(list, songOptions(s + 'v', 0, { mood, on: new Set(EMO_IDS), climax: list[0] } as never));
  for (const sec of list) {
    const v = song.get(sec);
    if (!v) continue;
    const { built } = v, bars = sec.song.bars, kind = sec.section?.kind ?? 'verse', n = bars.length;
    const L = `${s} ${kind} (${n} bars)`;
    const lk = `${kind} ${n}`;
    count.lengths[lk] = (count.lengths[lk] ?? 0) + 1;
    const leaves = built.leaves;
    if (!(CALLED.has(kind) && (n === 8 || n === 16))) { count.other++; if (leaves.length > 1) count.otherSplit++; continue; }
    count.called++;
    if (leaves.length !== n / 4 || leaves.some((l) => l.bars !== 4)) { fail(`${L}: ${leaves.length} leaves (${leaves.map((l) => l.bars).join('+')})`); continue; }
    const names = leaves.map((l) => l.name).join(' '), want = n === 8 ? "A A'" : "A A' A'' A'''";
    if (names !== want) fail(`${L}: leaves ${names}, want ${want}`);
    for (const l of leaves) if (l.source !== null && !l.varied.includes('endings')) fail(`${L}: ${l.name} keeps its source's ending`);
    if (n === 16 && (leaves[2].source !== leaves[0].id || leaves[3].source !== leaves[1].id)) fail(`${L}: the second 8 doesn't answer the first leaf by leaf`);
    const spans = leafSpans(leaves, (b) => bars[b].start, n, sec.song.total);
    spans.slice(0, -1).forEach((sp) => {
      const ph = built.phrases.filter((p) => p.step >= sp.from - 1e-6 && p.step < sp.to - 1e-6).pop();
      const last = ph && [...built.notes].reverse().find((x) => x.step >= ph.step - 1e-6 && x.step < ph.step + ph.len - 1e-6);
      if (!last) return;
      count.mids++;
      const role = last.endRole ?? 'none';
      count.midRoles[role] = (count.midRoles[role] ?? 0) + 1;
      if (role === 'home') fail(`${L}: ${sp.leaf.name} ends at home mid-section`);
    });
  }
}
console.log(`${count.called} called sections (verse/chorus/bridge of 8 or 16 bars); ${count.other} others, ${count.otherSplit} of those split by chance`);
console.log('mid-section ends by role:', JSON.stringify(count.midRoles), `(${count.mids})`);
console.log('section lengths seen:', JSON.stringify(count.lengths));
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
