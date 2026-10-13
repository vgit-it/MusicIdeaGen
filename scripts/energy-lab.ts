// The energy lab (docs/VOCAL-ENERGY.md): how each energy style sings quiet and loud sections, over many
// generated songs: pitch, words per second, held notes, rests, stressed words on the kick or snare,
// words in the riff's gaps, loudness, doubled sections, against the band. Run: npm run energy-lab
// (N songs per genre, default 5; STYLE: just one)
import { generate } from '../src/generator';
import type { Genre } from '../src/genres';
import { buildTrack, defaultTrackOptions } from '../src/track';

const GENRES: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const N = Number(process.env.N ?? 5);
const STYLES = ['off', 'climber', 'puncher', 'driver', 'brooder', 'drifter', 'switcher', 'auto'];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f = (x: number, d = 1) => (Number.isNaN(x) ? '  -  ' : x.toFixed(d).padStart(5));

const auto: Record<string, number> = {};
for (const style of STYLES) {
  if (process.env.STYLE && process.env.STYLE !== style) continue;
  // by level: quiet (energy 1-2), middle (3), loud (4-5)
  const lv = ['quiet', 'mid', 'loud'].map(() => ({ pitch: [] as number[], sps: [] as number[], held: [] as number[], rest: [] as number[], lock: [] as number[], gaps: [] as number[], vel: [] as number[], dbl: [] as number[] }));
  let against = 0, sung = 0;
  for (const g of GENRES) for (let i = 0; i < N; i++) {
    const s = `${g}-${i}`;
    const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3, ...(style === 'auto' ? {} : { vocalEnergy: style }) } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
    const tr = buildTrack(idea, defaultTrackOptions(idea)) as any;
    for (const sec of tr.sections) {
      const v = (sec.vocal ?? []) as any[];
      if (!v.length) continue;
      sung++;
      if (style === 'auto' && sec.vocalEnergy) auto[sec.vocalEnergy] = (auto[sec.vocalEnergy] ?? 0) + 1;
      if (sec.notes.some((x: string) => x.startsWith('Vocal against'))) against++;
      const e = sec.section.energy, L = lv[e <= 2 ? 0 : e === 3 ? 1 : 2];
      const secs = sec.song.total * 15 / sec.song.bpm;
      const syl = v.filter((n) => n.syl.text !== '~');
      L.pitch.push(avg(syl.map((n) => n.midi)));
      L.sps.push(syl.length / secs);
      const sungSteps = v.reduce((a, n) => a + n.len, 0);
      L.held.push(syl.filter((n, k) => (syl[k + 1]?.step ?? n.step + n.len) - n.step >= 8).length / syl.length);
      L.rest.push(1 - Math.min(1, sungSteps / sec.song.total));
      const stressed = syl.filter((n) => n.syl.stress && Number.isInteger(n.step));
      L.lock.push(stressed.filter((n) => sec.drums.kick[n.step] || sec.drums.snare[n.step]).length / Math.max(1, stressed.length));
      const riff = (sec.guitar ?? []) as any[];
      if (riff.length) { const hits = new Set(riff.map((h) => h.step)); L.gaps.push(syl.filter((n) => !hits.has(n.step)).length / syl.length); }
      L.vel.push(avg(v.map((n) => n.vel)));
      L.dbl.push(sec.vocalDouble ? 1 : 0);
    }
  }
  console.log(`\n${style.toUpperCase()}  (against the band: ${against}/${sung} sung sections)`);
  console.log('         pitch  syl/s  held%  rest%  kick/snare%  riff-gaps%  vel   doubled%');
  ['quiet', 'mid', 'loud'].forEach((name, k) => {
    const L = lv[k];
    console.log(`  ${name.padEnd(6)} ${f(avg(L.pitch))}  ${f(avg(L.sps), 2)}  ${f(100 * avg(L.held), 0)}  ${f(100 * avg(L.rest), 0)}  ${f(100 * avg(L.lock), 0)}        ${f(100 * avg(L.gaps), 0)}       ${f(avg(L.vel), 2)} ${f(100 * avg(L.dbl), 0)}   (${L.pitch.length})`);
  });
}
if (Object.keys(auto).length) console.log('\nAuto picks (sections):', auto);
