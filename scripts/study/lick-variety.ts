// (study) How often the app's solos play the same thing: each solo bar's notes (rhythm and steps) as a fingerprint;
// heard again in the same song, and heard in other songs of the genre. LICKS=1: with Real licks.
import { generate } from '../../src/generator';
import type { Genre } from '../../src/genres';
import { buildTrack, defaultTrackOptions } from '../../src/track';
const GENRES: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const N = Number(process.env.N ?? 40);
const out: Record<string, number[]> = {};
let all = [0, 0, 0, 0, 0];
for (const g of GENRES) {
  const songs: string[][] = [];
  for (let i = 0; i < N; i++) {
    const s = `${g}-lead-${i}`;
    const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3, ...(process.env.LICKS ? { leadLicks: true } : {}), ...(process.env.SOLO ? { leadSolo: true } : {}) } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
    const tr = buildTrack(idea, { ...defaultTrackOptions(idea), solo: 'on' });
    // every 5 notes in a row in the solos (their gaps and steps), wherever they fall
    const fps: string[] = [];
    for (const x of tr.sections) {
      if (!x.section?.solo) continue;
      const ns = x.guitar2.filter((h) => !h.swell && h.mute !== 'dead').sort((p, q) => p.step - q.step);
      const top = ns.map((h) => h.notes[h.notes.length - 1]);
      for (let k = 0; k + 5 <= ns.length; k++) {
        const w = [];
        for (let j = k + 1; j < k + 5; j++) w.push(`${ns[j].step - ns[j - 1].step}:${top[j] - top[j - 1]}`);
        if (ns[k + 4].step - ns[k].step <= 16) fps.push(w.join(','));
      }
    }
    songs.push(fps);
  }
  // heard again in the song; heard in 3+ other songs of the genre
  const where = new Map<string, Set<number>>();
  songs.forEach((f, i) => f.forEach((x) => (where.get(x) ?? where.set(x, new Set()).get(x)!).add(i)));
  let bars = 0, again = 0, common = 0;
  const distinct = new Set<string>();
  songs.forEach((f, i) => {
    const c = new Map<string, number>(); f.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
    for (const x of f) { bars++; distinct.add(x); if (c.get(x)! > 1) again++; if (where.get(x)!.size >= 4) common++; }
  });
  out[g] = [bars, again / bars, common / bars, distinct.size / bars, songs.filter((f) => f.length).length];
  all = all.map((v, k) => v + [bars, again, common, distinct.size, 0][k]);
}
for (const [g, v] of Object.entries(out)) console.log(g.padEnd(9), '5-note runs', v[0], 'played twice+ in the song', (100 * v[1]).toFixed(0) + '%', 'in 3+ other songs', (100 * v[2]).toFixed(0) + '%', 'distinct', (100 * v[3]).toFixed(0) + '%', 'songs with a solo', v[4]);
console.log('all      ', '5-note runs', all[0], 'played twice+ in the song', (100 * all[1] / all[0]).toFixed(0) + '%', 'in 3+ other songs', (100 * all[2] / all[0]).toFixed(0) + '%');
if (process.env.TOP) {
  // (the runs most songs share, for one genre)
  const g = process.env.TOP as Genre, where = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const s = `${g}-lead-${i}`;
    const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3, ...(process.env.LICKS ? { leadLicks: true } : {}), ...(process.env.SOLO ? { leadSolo: true } : {}) } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
    const tr = buildTrack(idea, { ...defaultTrackOptions(idea), solo: 'on' });
    const seen = new Set<string>();
    for (const x of tr.sections) {
      if (!x.section?.solo) continue;
      const ns = x.guitar2.filter((h) => !h.swell && h.mute !== 'dead').sort((p, q) => p.step - q.step);
      for (let k = 0; k + 5 <= ns.length; k++) {
        const w = []; for (let j = k + 1; j < k + 5; j++) w.push(`${ns[j].step - ns[j - 1].step}:${ns[j].notes[ns[j].notes.length - 1] - ns[j - 1].notes[ns[j - 1].notes.length - 1]}`);
        seen.add(w.join(','));
      }
    }
    for (const x of seen) where.set(x, (where.get(x) ?? 0) + 1);
  }
  console.log([...where].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${n} ${k}`).join('\n'));
}
