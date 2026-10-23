// Checks the neck view on real songs: every solo and lead break carries the curves the solo writer followed (one value per
// 16th, in range), and every note of it sits on a real string and fret (0-24) that sounds its pitch (or a bend's start).
//   npm run neck-check        (N=168 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { hasNeck, neckView } from '../src/ui/necknotes';
import { TUNINGS } from '../src/theory/fretboard';

const N = Number(process.env.N ?? 168);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
let bad = 0;
const fail = (m: string) => { if (bad++ < 20) console.log('FAIL ' + m); };
let solos = 0, notes = 0, off = 0, withTouch = 0, noTouch = 0, shifts = 0, bars = 0;
const shapes = new Map<string, number>();
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `nk-${i}-${genre}`;
  const idea = generate({ genre, meter: i % 9 === 8 ? '6/8' : '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const sections = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
  for (const sec of sections) {
    const k = sec.section?.kind ?? 'verse', flagged = !!(sec.section?.solo || sec.section?.lead);
    if (flagged && sec.guitar2.length && !sec.soloCurve) fail(`${s} ${k}: a solo with no curve`);
    if (!sec.soloCurve) continue;
    if (!hasNeck(sec)) continue;
    solos++;
    const c = sec.soloCurve, total = sec.song.total;
    for (const a of ['energy', 'centre', 'pace'] as const) if (c[a].length !== total) fail(`${s} ${k}: curve ${a} has ${c[a].length} values, the section ${total}`);
    if (c.energy.some((e) => !(e >= -1 && e <= 1))) fail(`${s} ${k}: energy out of -1..1`);
    if (c.centre.some((m) => !(m >= 36 && m <= 100))) fail(`${s} ${k}: height out of range`);
    if (c.pace.some((p) => !(p > 0 && p < 3))) fail(`${s} ${k}: pace out of range`);
    shapes.set(c.shape.replace(/\d+/, 'N'), (shapes.get(c.shape.replace(/\d+/, 'N')) ?? 0) + 1);
    const v = neckView(sec), open = (sec.song.tuning ?? TUNINGS.standard).strings;
    if (v.notes.length !== sec.guitar2.filter((h) => !h.mute).reduce((x, h) => x + h.notes.length, 0)) fail(`${s} ${k}: notes lost on the way to the neck`);
    for (const n of v.notes) {
      notes++;
      if (n.string < 0 || n.string >= open.length || n.fret < 0 || n.fret > 24) { fail(`${s} ${k}: string ${n.string} fret ${n.fret} is not on the neck`); continue; }
      if (open[n.string] + n.fret !== n.midi) off++;
    }
    for (const h of sec.guitar2) if (!h.mute && h.notes.length) h.touch ? withTouch++ : noTouch++;
    shifts += v.shifts; bars += v.bars.length;
  }
}
console.log(`${solos} solos and lead breaks · ${notes} notes · ${off} not at open+fret (bends and the like) · hits with the hands' touch ${withTouch}, without ${noTouch} · ${(shifts / Math.max(1, bars) * 100).toFixed(0)}% of bars move the hand`);
console.log([...shapes].map(([k, n]) => `${n} ${k}`).join(' · '));
if (!solos) fail('no solo with a neck view in ' + N + ' songs');
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
