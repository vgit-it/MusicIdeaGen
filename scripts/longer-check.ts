// Checks rule 37 (longer notes) by kind of section on real songs: the share of notes an 8th or shorter, the mean note, the share of
// sung time in notes a beat or longer, and the silence. A bridge and an interlude keep far fewer short notes (about 20%), the other
// sections stay near 35-50%. With the switch off the bridge and the interlude are written as before.
//   npm run longer-check          (N=168 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { autoMood } from '../src/tension';
import { EMO_IDS } from '../src/verse/emotion';
import { songOptions, writeSong } from '../src/verse/sing';
import { shortLen } from '../src/verse/longer';
import { barOf } from '../src/verse/section';

const N = Number(process.env.N ?? 168);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
type Acc = { secs: number; n: number; short: number; time: number; beat: number; sil: number };
const T: Record<'on' | 'off', Record<string, Acc>> = { on: {}, off: {} };
let bad = 0;
const fail = (m: string) => { if (bad++ < 20) console.log('FAIL ' + m); };
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `vv-${i}-${genre}`;
  const idea = generate({ genre, meter: i % 9 === 8 ? '6/8' : '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  const mood = autoMood(idea.song, idea.seeds.song);
  for (const mode of ['on', 'off'] as const) {
    const song = writeSong(list, songOptions(s + 'v', 0, { mood, on: new Set(EMO_IDS.filter((x) => mode === 'on' || x !== 'longer')), climax: list[0] } as never));
    for (const sec of list) {
      const v = song.get(sec); if (!v?.built.notes.length) continue;
      const k = sec.section?.kind ?? 'verse', bar = barOf(sec), lim = shortLen(bar) + 1e-9, ns = v.built.notes;
      ns.forEach((n, j) => { if (j && ns[j - 1].step + ns[j - 1].len > n.step + 1e-6) fail(`${s} ${k}: overlap at ${n.step} (${mode})`); });
      const a = (T[mode][k] ??= { secs: 0, n: 0, short: 0, time: 0, beat: 0, sil: 0 });
      const time = ns.reduce((x, n) => x + n.len, 0);
      a.secs++; a.n += ns.length; a.short += ns.filter((n) => n.len <= lim).length; a.time += time;
      a.beat += ns.filter((n) => n.len >= bar / 4 - 1e-9).reduce((x, n) => x + n.len, 0); a.sil += 1 - time / sec.chords.chordIdx.length;
    }
  }
}
const show = (a: Acc) => `${String(a.secs).padStart(3)} sections · ${(a.n / a.secs).toFixed(1)} notes · short ${Math.round((100 * a.short) / a.n)}% · mean note ${(a.time / a.n).toFixed(1)} steps · beat+ ${Math.round((100 * a.beat) / a.time)}% of the time · silence ${Math.round((100 * a.sil) / a.secs)}%`;
for (const mode of ['off', 'on'] as const) {
  console.log(`Longer notes ${mode}:`);
  for (const [k, a] of Object.entries(T[mode])) console.log(`  ${k.padEnd(10)} ${show(a)}`);
}
const pct = (m: 'on' | 'off', k: string) => (100 * T[m][k].short) / T[m][k].n;
if (pct('on', 'bridge') > 27 || pct('on', 'bridge') < 15) fail(`bridge short share ${pct('on', 'bridge').toFixed(0)}% (want 15-27)`);
if (pct('on', 'interlude') > 25 || pct('on', 'interlude') < 12) fail(`interlude short share ${pct('on', 'interlude').toFixed(0)}% (want 12-25)`);
for (const k of ['verse', 'chorus', 'prechorus', 'outro']) if (T.on[k] && Math.abs(pct('on', k) - pct('off', k)) > 25 && pct('on', k) > 55) fail(`${k} short share ${pct('on', k).toFixed(0)}%`);
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
