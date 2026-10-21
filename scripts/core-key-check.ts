// Core notes in the key: over many songs, counts the steps whose core note (the chord note a bar sits on) is out of the
// section's own key, and how many of those had an in-key chord note to use instead (those are bugs; the rest are chords with none).
//   npm run core-key-check            (N=224 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS } from '../src/tension';
import { QUALITIES, SCALES } from '../src/theory';
import { buildSection, chordsOf } from '../src/verse/section';
import { DEFAULT_RANGE } from '../src/verse/verse';

const N = Number(process.env.N ?? 224);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const OPTS = { range: { ...DEFAULT_RANGE }, bends: 'some' as const, meta: true, variation: 'some' as const, pentatonic: false };
const ivOf = (q: string, t: string) => {
  const iv = QUALITIES[q as keyof typeof QUALITIES] as readonly number[];
  const f = iv.find((i) => i === 6 || i === 7 || i === 8) ?? 7;
  const th = iv.find((i) => i === 3 || i === 4) ?? iv.find((i) => i === 2 || i === 5) ?? 7;
  return t === 'root' ? 0 : t === 'third' ? th : f;
};
let multi = 0, steps = 0, out = 0, avoidable = 0, sections = 0, changed = 0;
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], mood = MOODS[Math.floor(i / 7) % 8], meter = i % 9 === 8 ? '6/8' : '4/4';
  const s = `vv-${i}-${genre}-${mood}`;
  const idea = generate({ genre, meter, weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea), mood } as never).sections;
  if (new Set(list.map((x) => x.song.key)).size > 1) changed++;
  for (const sec of list) {
    if (!sec.section || ['intro', 'solo'].includes(sec.section.kind)) continue;
    let b;
    try { b = buildSection(sec, OPTS); } catch { continue; }
    sections++;
    const { key, mode } = sec.song, scale = new Set(SCALES[mode].map((x) => (key + x) % 12));
    const chordAt = chordsOf(sec);
    b.tones.forEach((t, st) => {
      const c = chordAt[st]; if (!c) return;
      steps++;
      if (!scale.has((key + c.root + ivOf(c.q, t)) % 12)) {
        out++;
        if ((['root', 'third', 'fifth'] as const).some((u) => scale.has((key + c.root + ivOf(c.q, u)) % 12))) { avoidable++; if (process.env.DEBUG && avoidable < 6) console.log(s, sec.section?.kind, 'step', st, 'tone', t, 'chord', JSON.stringify(c), 'key', key, mode, 'bars', b.bars.join(' '), 'phrases', JSON.stringify(b.phrases.slice(0,4)), 'tones', b.tones.slice(0,40).map((x) => x[0]).join(''), 'chords', chordAt.slice(0,40).map((x) => x.root).join(',')); const bs = Math.floor(st / 16) * 16; if (chordAt.slice(bs, bs + 16).some((x) => x.root !== c.root || x.q !== c.q)) multi++; }
      }
    });
  }
}
console.log(`${sections} sections, ${changed} songs with a key change, ${steps} steps`);
console.log(`core note out of key: ${out} (${((out / steps) * 100).toFixed(2)}%); of those with an in-key chord note available: ${avoidable} (${multi} in a bar with a chord change)`);
