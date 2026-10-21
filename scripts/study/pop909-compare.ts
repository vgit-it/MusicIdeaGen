// The verse writer against POP909 (docs/STUDY-POP909.md): the same measures as scripts/study/pop909-stats.py, taken over the
// writer's verses and choruses, printed next to the real numbers (scripts/study/pop909-stats.json).
//   npm run pop909-compare            (N=224 songs)
//   STUDIED=1 npm run pop909-compare  (with the Studied option on)
import { readFileSync } from 'node:fs';
import { MAIN_GUITARS, generate } from '../../src/generator';
import { buildTrack, defaultTrackOptions } from '../../src/track';
import { MOODS } from '../../src/tension';
import { QUALITIES } from '../../src/theory';
import { buildSection, barOf, chordsOf, isChorus } from '../../src/verse/section';
import { DEFAULT_RANGE } from '../../src/verse/verse';

const N = Number(process.env.N ?? 224);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const OPTS = { range: { ...DEFAULT_RANGE }, bends: 'some' as const, meta: true, variation: 'some' as const, pentatonic: false, studied: !!process.env.STUDIED };
const real = JSON.parse(readFileSync('scripts/study/pop909-stats.json', 'utf8'));

const C = () => new Map<string, number>();
const inc = (m: Map<string, number>, k: string | number) => m.set(String(k), (m.get(String(k)) ?? 0) + 1);
const share = (m: Map<string, number>) => { const t = [...m.values()].reduce((a, b) => a + b, 0) || 1; return (k: string) => (m.get(k) ?? 0) / t; };
const ints = C(), degs = C(), ioi = C(), slot = C(), perBar = C(), startDeg = C(), endDeg = C(), runs = C(), plen = C();
let ctOn = [0, 0], ctOff = [0, 0], endCt = [0, 0], leaps = 0, back = 0, stepBack = 0, rest = 0, nbarsTot = 0, repBars = 0, barsTot = 0, notesTot = 0, ph = 0, phNotes = 0;
for (let i = 0; i < N; i++) {
  const genre = GENRES[i % 7], mood = MOODS[Math.floor(i / 7) % 8];
  const s = `pc-${i}-${genre}-${mood}`;
  const idea = generate({ genre, meter: '4/4', weirdness: 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const list = buildTrack(idea, { ...defaultTrackOptions(idea), mood } as never).sections;
  for (const sec of [list.find((x) => x.section?.kind === 'verse'), [...list].reverse().find(isChorus)]) {
    if (!sec) continue;
    const b = buildSection(sec, OPTS), bar = barOf(sec), chords = chordsOf(sec), key = sec.song.key;
    if (bar !== 16) continue;
    const ns = [...b.notes].sort((x, y) => x.step - y.step);
    const bars = new Map<number, number[]>();
    ns.forEach((n, k) => {
      const deg = (((n.midi - key) % 12) + 12) % 12;
      inc(degs, deg); notesTot++;
      const r = Math.round(n.step) % 16; inc(slot, r);
      (bars.get(Math.floor(n.step / 16)) ?? bars.set(Math.floor(n.step / 16), []).get(Math.floor(n.step / 16))!).push(r);
      const c = chords[Math.min(chords.length - 1, Math.floor(n.step))];
      const inCh = (QUALITIES[c.q] as readonly number[]).includes((((n.midi - key - c.root) % 12) + 12) % 12);
      (r % 4 === 0 ? ctOn : ctOff)[inCh ? 0 : 1]++;
      if (k) { inc(ints, Math.max(-12, Math.min(12, n.midi - ns[k - 1].midi))); inc(ioi, Math.min(16, Math.round(n.step - ns[k - 1].step))); }
      if (k >= 2) {
        const a = ns[k - 2].midi, m = ns[k - 1].midi, z = n.midi;
        if (Math.abs(m - a) >= 5) { leaps++; if ((z - m) * (m - a) < 0) { back++; if (Math.abs(z - m) <= 2) stepBack++; } }
      }
    });
    for (const [, v] of bars) { inc(perBar, Math.min(16, v.length)); }
    for (const p of b.phrases) {
      const inside = ns.filter((n) => n.step >= p.step - 1e-6 && n.step < p.step + p.len - 1e-6);
      if (inside.length < 3) continue;
      ph++; phNotes += inside.length;
      inc(plen, Math.min(8, Math.round(p.len / 16)));
      inc(startDeg, (((inside[0].midi - key) % 12) + 12) % 12);
      const last = inside[inside.length - 1];
      inc(endDeg, (((last.midi - key) % 12) + 12) % 12);
      const c = chords[Math.min(chords.length - 1, Math.floor(last.step))];
      endCt[(QUALITIES[c.q] as readonly number[]).includes((((last.midi - key - c.root) % 12) + 12) % 12) ? 0 : 1]++;
    }
  }
}
const f = (x: number) => (100 * x).toFixed(1).padStart(5);
const row = (label: string, r: number, a: number) => console.log(`${label.padEnd(26)} real ${f(r)}%   app ${f(a)}%   ${Math.abs(a - r) > 0.05 ? '!!' : Math.abs(a - r) > 0.025 ? '! ' : '  '}`);
const si = share(ints), sd = share(degs), so = share(ioi), ss = share(slot), se = share(endDeg), st = share(startDeg), sp = share(plen), sb = share(perBar);
console.log(`${N} songs, ${notesTot} notes${process.env.STUDIED ? '  (Studied ON)' : ''}`);
console.log('-- steps between notes');
row('same note', real.intervals['0'], si('0'));
row('step (1-2 semitones)', ['-1', '1', '-2', '2'].reduce((t, k) => t + real.intervals[k], 0), ['-1', '1', '-2', '2'].reduce((t, k) => t + si(k), 0));
row('third (3-4)', ['-3', '3', '-4', '4'].reduce((t, k) => t + real.intervals[k], 0), ['-3', '3', '-4', '4'].reduce((t, k) => t + si(k), 0));
row('4th/5th (5-7)', ['-5', '5', '-7', '7', '-6', '6'].reduce((t, k) => t + real.intervals[k], 0), ['-5', '5', '-7', '7', '-6', '6'].reduce((t, k) => t + si(k), 0));
row('bigger', ['-8', '8', '-9', '9', '-10', '10', '-11', '11', '-12', '12'].reduce((t, k) => t + real.intervals[k], 0), ['-8', '8', '-9', '9', '-10', '10', '-11', '11', '-12', '12'].reduce((t, k) => t + si(k), 0));
row('turn back after a leap', (real.leap_followed.back + real.leap_followed.stepback) / real.leap_followed.n, leaps ? back / leaps : 0);
console.log('-- note spacing (start to start)');
row('16th', real.gap_between_onsets_16ths['1'], so('1')); row('8th', real.gap_between_onsets_16ths['2'], so('2'));
row('dotted 8th', real.gap_between_onsets_16ths['3'], so('3')); row('quarter', real.gap_between_onsets_16ths['4'], so('4'));
row('longer than a quarter', 1 - ['1', '2', '3', '4'].reduce((t, k) => t + real.gap_between_onsets_16ths[k], 0), 1 - ['1', '2', '3', '4'].reduce((t, k) => t + so(k), 0));
console.log('-- where notes start in the bar');
row('beat 1', real.onset_slot_in_bar_of_16['0'], ss('0'));
row('beats 2-4', [4, 8, 12].reduce((t, k) => t + real.onset_slot_in_bar_of_16[k], 0), [4, 8, 12].reduce((t, k) => t + ss(String(k)), 0));
row('8th offbeats', [2, 6, 10, 14].reduce((t, k) => t + real.onset_slot_in_bar_of_16[k], 0), [2, 6, 10, 14].reduce((t, k) => t + ss(String(k)), 0));
row('16th slots', [1, 3, 5, 7, 9, 11, 13, 15].reduce((t, k) => t + real.onset_slot_in_bar_of_16[k], 0), [1, 3, 5, 7, 9, 11, 13, 15].reduce((t, k) => t + ss(String(k)), 0));
console.log('-- notes per bar');
const mean = (m: Map<string, number>) => { let t = 0, c = 0; for (const [k, v] of m) { t += +k * v; c += v; } return t / (c || 1); };
console.log(`mean notes per bar         real ${real.notes_per_bar_mean}   app ${mean(perBar).toFixed(2)}`);
row('1-3 notes', ['1', '2', '3'].reduce((t, k) => t + real.notes_per_bar_dist[k], 0), ['1', '2', '3'].reduce((t, k) => t + sb(k), 0));
row('8+ notes', ['8', '9', '10', '11', '12', '13', '14', '15', '16'].reduce((t, k) => t + (real.notes_per_bar_dist[k] ?? 0), 0), ['8', '9', '10', '11', '12', '13', '14', '15', '16'].reduce((t, k) => t + sb(k), 0));
console.log('-- scale degrees (all keys; major songs use the major table, others the minor table)');
const names = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
for (let k = 0; k < 12; k++) row(`degree ${names[k]}`, (real.degrees_major[k] + real.degrees_minor[k]) / 2, sd(String(k)));
console.log('-- chords');
row('chord note on a beat', real.chord_tone_rate_on_beats, ctOn[0] / (ctOn[0] + ctOn[1] || 1));
row('chord note off the beat', real.chord_tone_rate_off_beats, ctOff[0] / (ctOff[0] + ctOff[1] || 1));
row('phrase ends on chord note', real.phrase_ends_on_chord_tone, endCt[0] / (endCt[0] + endCt[1] || 1));
console.log('-- phrases');
row('starts on 1', real.phrase_first_degree['0'], st('0')); row('starts on 5', real.phrase_first_degree['7'], st('7'));
row('ends on 1', real.phrase_last_degree['0'], se('0')); row('ends on 5', real.phrase_last_degree['7'], se('7')); row('ends on 2', real.phrase_last_degree['2'], se('2'));
row('1-2 bar phrases', real.phrase_len_bars['1'] + real.phrase_len_bars['2'], sp('1') + sp('2'));
