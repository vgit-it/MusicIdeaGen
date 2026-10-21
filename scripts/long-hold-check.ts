// Long holds (rule 28) and the core-note minimum (rule 21): over many songs, checks that holds of 1-2 bars follow their rules and
// counts what the writer made. DUMP=file also writes a hash of every section's notes (to compare two versions of the writer).
//   npm run long-hold-check            (N=224 songs)
import { emoOn } from '../src/verse/emotion';
import { writeFileSync } from 'node:fs';
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS } from '../src/tension';
import { QUALITIES } from '../src/theory';
import { barOf, buildSection, chordsOf } from '../src/verse/section';
import { DEFAULT_RANGE } from '../src/verse/verse';
import { singSong, voiceOf } from '../src/verse/sing';

const N = Number(process.env.N ?? 224);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const OPTS = { range: { ...DEFAULT_RANGE }, bends: 'some' as const, meta: true, variation: 'some' as const, pentatonic: !!process.env.PENT };
const third = (q: string) => { const iv = QUALITIES[q as keyof typeof QUALITIES] as readonly number[]; return iv.find((i) => i === 3 || i === 4) ?? iv.find((i) => i === 2 || i === 5) ?? 7; };
const fifth = (q: string) => { const iv = QUALITIES[q as keyof typeof QUALITIES] as readonly number[]; return iv.find((i) => i === 6 || i === 7 || i === 8) ?? 7; };
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

const dump: Record<string, string> = {};
const bad: string[] = [];
const fail = (m: string) => { bad.push(m); if (bad.length < 12) console.log('FAIL', m); };
let pieces = 0, sung = 0;
let sections = 0, phrasesN = 0, holds = 0, shortRegions = 0;
const byLen = new Map<number, number>(), byMoves = [0, 0, 0], byKind: Record<string, number> = {}, byPlace = { open: 0, end: 0, mid: 0 };
let overrun = 0, overrunMax = 0, over0 = 0, crossChange = 0, forced = 0;

for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], mood = MOODS[Math.floor(i / 7) % 8], meter = i % 9 === 8 ? '6/8' : '4/4';
  const s = `vv-${i}-${genre}-${mood}`;
  Object.assign(OPTS, { emo: process.env.EMO ? { mood, on: emoOn() } : undefined }); // (EMO=1: with the mood notes on)
  const idea = generate({ genre, meter, weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea), mood } as never).sections;
  // (as the singer's notes: a hold is its pieces end to end, one word)
  singSong(list, s);
  for (const sec of list) {
    const v = voiceOf(sec);
    if (!v) continue;
    for (const n of v.built.notes) {
      if (!n.longHold) continue;
      const end = n.step + n.len, moves = n.bendTo === undefined ? [] : [{ to: n.bendTo }, ...(n.more ?? [])];
      const ps = v.vocal.filter((x) => x.step >= n.step - 1e-6 && x.step < end - 1e-6);
      sung++; pieces += ps.length;
      const id = `${s}:${sec.section?.kind}@${n.step}`;
      if (ps.length !== 1 + moves.length) fail(`${id}: ${ps.length} sung pieces for ${moves.length} moves`);
      else if (Math.abs(ps.reduce((a, x) => a + x.len, 0) - n.len) > 1e-6 || ps.some((x, j) => j && Math.abs(x.step - (ps[j - 1].step + ps[j - 1].len)) > 1e-6)) fail(`${id}: sung pieces don't fill the note`);
      else if (ps.some((x, j) => j && (x.syl.text !== '~' || x.midi !== moves[j - 1].to)) || ps[0].midi !== n.midi) fail(`${id}: sung pieces wrong`);
    }
  }
  list.forEach((sec, si) => {
    if (!sec.section || ['intro', 'solo'].includes(sec.section.kind)) return;
    let b;
    try { b = buildSection(sec, OPTS); } catch { return; }
    sections++;
    const id = `${s}#${si}:${sec.section.kind}`;
    dump[id] = hash(JSON.stringify(b.notes.map((n) => [n.step, n.len, n.midi]))) + (b.notes.some((n) => n.longHold) ? '+' : '');
    const bar = barOf(sec), beat = bar / 4, key = sec.song.key, chordAt = chordsOf(sec), ns = b.notes, total = chordAt.length;
    phrasesN += b.phrases.length;
    for (let k = 1; k < ns.length; k++) if (ns[k].step < ns[k - 1].step + ns[k - 1].len - 1e-6) fail(`${id} overlap at ${ns[k].step}`);
    if (ns.some((n) => n.step + n.len > total + 1e-6)) fail(`${id} past the end`);
    // (rule 21: a stretch on one core note that starts at a phrase start and is shorter than an 8th of a bar)
    b.tones.forEach((t, st) => {
      if (st === 0 || t === b.tones[st - 1] || st % bar === 0) return;
      let e = st; while (e < b.tones.length && e % bar !== 0 && b.tones[e] === t) e++;
      if (e - st < bar / 8 - 1e-9 && b.phrases.some((p) => p.step === st)) shortRegions++;
    });
    let prevHeld = false, prevLeaf: number | undefined;
    b.phrases.forEach((ph, pi) => {
      const hs = ns.filter((n) => n.longHold && n.step >= ph.step - 1e-6 && n.step < ph.step + ph.len - 1e-6);
      if (hs.length > 1) fail(`${id} two holds in one phrase`);
      const leaf = b.leaves.find((l) => ph.step >= l.from * bar && ph.step < (l.from + l.bars) * bar)?.id;
      if (hs.length && prevHeld && leaf === prevLeaf) fail(`${id} holds in two phrases running`);
      prevHeld = hs.length > 0; prevLeaf = leaf;
      for (const n of hs) {
        holds++; byKind[sec.section!.kind] = (byKind[sec.section!.kind] ?? 0) + 1;
        const bars = n.len / bar, q = Math.round(bars * 8) / 8;
        byLen.set(q, (byLen.get(q) ?? 0) + 1);
        if (bars < 1 - 1e-6 || bars > 2 + 1e-6) fail(`${id} hold of ${bars} bars`);
        if (Math.abs(n.step / beat - Math.round(n.step / beat)) > 1e-6) fail(`${id} hold off the beat at ${n.step}`);
        const end = n.step + n.len, phEnd = ph.step + ph.len, over = end - phEnd;
        if (over > bar / 2 + 1e-6) fail(`${id} hold runs ${over} past its phrase`);
        if (over > 1e-6) { overrun++; overrunMax = Math.max(overrunMax, over / bar); } else over0++;
        const nx = b.phrases[pi + 1];
        if (nx && nx.step - end < beat - 1e-6) fail(`${id} hold ends ${nx.step - end} before the next phrase`);
        byPlace[n.step <= ph.step + 1e-6 ? 'open' : end >= phEnd - 1e-6 ? 'end' : 'mid']++;
        // (the pitch is a chord note of the chord under it at every step, bar the glides)
        const moves = n.bendTo === undefined ? [] : [{ at: n.bendAt!, to: n.bendTo, len: n.bendLen! }, ...(n.more ?? [])];
        byMoves[Math.min(2, moves.length)]++;
        if (moves.length > 2) fail(`${id} ${moves.length} moves`);
        const pitchAt = (g: number) => { let m = n.midi; for (const mv of moves) if (g >= n.step + mv.at + mv.len) m = mv.to; return m; };
        for (let g = Math.ceil(n.step); g < end - 1e-6; g++) {
          const c = chordAt[Math.min(chordAt.length - 1, g)];
          if (moves.some((mv) => g >= n.step + mv.at - 1e-6 && g < n.step + mv.at + mv.len)) continue;
          const pc = (((pitchAt(g) - key - c.root) % 12) + 12) % 12;
          if (![0, third(c.q), fifth(c.q)].includes(pc)) { fail(`${id} hold at ${n.step}: step ${g} pitch ${pitchAt(g)} not in chord`); break; }
        }
        for (let g = Math.ceil(n.step) + 1; g < end - 1e-6; g++) if (chordAt[g].root !== chordAt[g - 1].root || chordAt[g].q !== chordAt[g - 1].q) { crossChange++; break; }
        forced += moves.filter((m) => /chord/.test(n.inner ?? '')).length;
      }
    });
  });
}
const lens = [...byLen].sort((a, b) => a[0] - b[0]);
console.log(`${sections} sections, ${phrasesN} phrases, ${holds} long holds (${(100 * holds / phrasesN).toFixed(1)}% of phrases)`);
console.log(`by length (bars): ${lens.map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
console.log(`by section: ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`placement: opens the phrase ${byPlace.open}, ends it ${byPlace.end}, middle ${byPlace.mid}; runs past the phrase end ${overrun} (longest ${overrunMax.toFixed(2)} bar), stays inside ${over0}`);
console.log(`pitch moves: none ${byMoves[0]}, one ${byMoves[1]}, two ${byMoves[2]}; holds crossing a chord change ${crossChange}`);
console.log(`sung: ${sung} holds as ${pieces} notes (a word each)`);
console.log(`rule 21: core-note shifts under an 8th of a bar at a phrase start: ${shortRegions}`);
console.log(bad.length ? `${bad.length} FAILURES` : 'all checks passed');
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(dump));
