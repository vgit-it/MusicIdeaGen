// Checks the melody view for the lead guitar on real songs: every section nobody sings but Guitar 2 plays (solos, lead breaks, jam
// outros, hook intros and interludes) turns into notes to draw, in range, none lost, and a section flagged as a solo or a lead
// break always shows. Sections with a vocal stay vocal.
//   npm run lead-roll-check        (N=168 songs)
import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { leadOnly, leadView } from '../src/ui/leadnotes';

const N = Number(process.env.N ?? 168);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
let bad = 0;
const fail = (m: string) => { if (bad++ < 20) console.log('FAIL ' + m); };
const by: Record<string, { n: number; notes: number; extras: number; runs: number; tech: Record<string, number> }> = {};
let vocalSections = 0;
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], s = `lr-${i}-${genre}`;
  const idea = generate({ genre, meter: i % 9 === 8 ? '6/8' : '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const sections = buildTrack(idea, { ...defaultTrackOptions(idea), soloPlan: process.env.SOLO_PLAN === '1' ? 'on' : 'off' } as never).sections;
  for (const sec of sections) {
    const k = sec.section?.kind ?? 'verse', flagged = !!(sec.section?.solo || sec.section?.lead);
    const sung = !!sec.sung?.some((l) => l.notes.length);
    if (sung) vocalSections++;
    if (!leadOnly(sec)) {
      if (flagged && sec.guitar2.length) fail(`${s} ${k}: flagged solo/lead with Guitar 2 notes but the view would not show it`);
      continue;
    }
    if (sung) fail(`${s} ${k}: has a vocal yet counted as lead only`);
    const v = leadView(sec), notes = v.lines.flat();
    if (!notes.length) { fail(`${s} ${k}: lead only but nothing to draw`); continue; }
    const a = (by[k] ??= { n: 0, notes: 0, extras: 0, runs: 0, tech: {} });
    a.n++; a.notes += notes.length; a.extras += v.extras.length; a.runs += v.lines.length;
    for (const [t, c] of Object.entries(v.counts)) a.tech[t] = (a.tech[t] ?? 0) + c;
    const total = sec.song.total;
    for (const n of [...notes, ...v.extras]) {
      if (!Number.isFinite(n.midi) || n.midi < 28 || n.midi > 100) fail(`${s} ${k}: note ${n.midi} out of range`);
      if (n.len <= 0 || n.step < 0 || n.step >= total) fail(`${s} ${k}: note at ${n.step} len ${n.len} outside the section (${total})`);
    }
    const hits = sec.guitar2.filter((h) => !h.mute && h.notes.length).reduce((x, h) => x + h.notes.length, 0);
    if (notes.length + v.extras.length !== hits) fail(`${s} ${k}: ${hits} notes played, ${notes.length + v.extras.length} drawn`);
  }
}
for (const [k, a] of Object.entries(by)) {
  console.log(`${k.padEnd(10)} ${String(a.n).padStart(3)} sections · ${(a.notes / a.n).toFixed(1)} notes · ${(a.extras / a.n).toFixed(1)} double-stop notes · ${(a.runs / a.n).toFixed(1)} runs · ${Object.entries(a.tech).map(([t, c]) => `${c} ${t}`).join(', ') || 'no techniques'}`);
}
console.log(`${vocalSections} sections with a vocal stay vocal`);
for (const k of ['solo']) if (!by[k]) fail(`no ${k} section shown in ${N} songs`);
if (bad) { console.log(`${bad} FAILURES`); process.exit(1); }
console.log('OK');
