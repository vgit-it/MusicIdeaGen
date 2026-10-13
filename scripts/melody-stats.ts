// The melody lab: the vocal's measures over many generated songs, per way of writing it (Classic, Grid,
// Shaped, both): syllables per second, the same note again, strings of even quarter notes, one-note lines,
// the gaps between syllables (docs/VOCAL-RHYTHM.md, docs/VOCAL-MELODY.md). Run: npm run melody-lab
// (N songs per genre, default 6; METER, default 4/4; MODE: just one way)
import { generate } from '../src/generator';
import type { Genre } from '../src/genres';
import { buildTrack, defaultTrackOptions } from '../src/track';

const GENRES: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const N = Number(process.env.N ?? 6);
const ONLY = process.env.MODE;
for (const [label, extra] of [['classic', {}], ['grid', { vocalRhythm: 'grid' }], ['shaped', { vocalMelody: 'shaped' }], ['grid+shaped', { vocalRhythm: 'grid', vocalMelody: 'shaped' }]] as const) {
  if (ONLY && ONLY !== label) continue;
  const lineRates: number[] = [];
  let held = 0, heldTime = 0, voiced = 0, highs = 0, highShort = 0, highFall = 0, odd = 0, qrun = 0, secs = 0, syls = 0, same = 0, run3 = 0, lines = 0, flatLines = 0;
  const lens: Record<number, number> = {};
  let sample = '';
  for (const g of GENRES) for (let i = 0; i < N; i++) {
    const s = `${g}-${i}`;
    const idea = generate({ genre: g, meter: process.env.METER ?? '4/4', weirdness: 0.3, ...extra } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
    const tr = buildTrack(idea, defaultTrackOptions(idea)) as any;
    const all = tr.sections ?? tr;
    for (const sec of all) {
      if ((sec.vocal ?? []).length) secs += sec.song.total * 15 / sec.song.bpm;
      const v = (sec.vocal ?? []).filter((n: any) => !n.role);
      const L: any[][] = [];
      for (const n of v) { if (n.start || !L.length) L.push([]); L[L.length - 1].push(n); }
      for (const l of L) {
        lines++;
        { const top = Math.max(...l.map((n) => n.midi)), bar = 16;
          // (a held note: a syllable sung half a bar or more, its ties included)
          const on3 = l.filter((n, k) => k === 0 || n.syl !== l[k - 1].syl && n.syl.text !== '~');
          on3.forEach((n, k) => { const end = (on3[k + 1]?.step ?? l[l.length - 1].step + l[l.length - 1].len); const d = end - n.step; voiced += d; if (d >= 8) { held++; heldTime += d; }
            const prev = on3[k - 1];
            if (n.peak || n.belt) { highs++; if (d < bar / 2) highShort++; const last = l.filter((x) => x.step < end).pop(); if (last?.fall) highFall++; } }); }
        if (l.length > 2) { const on2 = l.filter((n, k) => k === 0 || n.syl !== l[k - 1].syl); lineRates.push((on2.length - 1) / ((on2[on2.length - 1].step - on2[0].step) * 15 / sec.song.bpm)); }
        if (new Set(l.map((n) => n.midi)).size <= 1) flatLines++;
        // syllable onsets only (notes continuing a syllable have the same syl object)
        const on = l.filter((n, k) => k === 0 || n.syl !== l[k - 1].syl);
        { let r = 0; for (let k = 1; k < on.length; k++) { const g = on[k].step - on[k - 1].step; r = g === 4 ? r + 1 : 0; if (r >= 3) qrun++; } }
        for (let k = 0; k < on.length; k++) {
          syls++;
          if (sec.song.bpm >= 90 && on[k].step % 2 && !on[k].role) odd++;
          const len = k + 1 < on.length ? Math.round((on[k + 1].step - on[k].step) * 2) / 2 : -1; lens[len] = (lens[len] ?? 0) + 1;
          if (k && on[k].midi === on[k - 1].midi) same++;
          if (k > 1 && on[k].midi === on[k - 1].midi && on[k - 1].midi === on[k - 2].midi) run3++;
        }
        if (!sample && sec.section?.kind === 'verse' && g === 'pop' && l.length > 5) sample = l.map((n) => `${n.midi}@${n.step}/${n.len}`).join(' ');
      }
    }
  }
  const pct = (x: number) => `${Math.round((100 * x) / syls)}%`;
  const top = Object.entries(lens).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, c]) => `${k}:${pct(c)}`).join(' ');
  console.log(`${label.padEnd(12)} syl/s ${(syls / secs).toFixed(2)}  off 8ths(fast songs) ${pct(odd)}  in 4+ quarters ${pct(qrun)}  same-as-prev ${pct(same)}  3-in-a-row ${pct(run3)}  one-note lines ${flatLines}/${lines}  gaps between syllables (16ths) ${top}`);
  console.log(`   held (half a bar+): ${(100 * held / syls).toFixed(1)}% of syllables, ${(100 * heldTime / voiced).toFixed(0)}% of sung time; high notes (belts, jumps up to the top, as written) ${highs}: ${highShort} under half a bar, ${highFall} falling off`);
  lineRates.sort((a, b) => a - b); console.log(`   line syl/s: median ${lineRates[lineRates.length >> 1].toFixed(1)}, 90th ${lineRates[Math.floor(lineRates.length * 0.9)].toFixed(1)}, max ${lineRates[lineRates.length - 1].toFixed(1)}`);
  if (sample) console.log('   pop verse line:', sample);
}
