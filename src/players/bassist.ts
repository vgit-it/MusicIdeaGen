// The bassist: plays a track's written bass line their own way, after the drummer (they listen to them).
// They read the whole song and keep their habits all the way through:
// - a feel: right with the kick, or sitting back with a laid-back drummer
// - lead-in notes into chord changes (from a half step away, a scale step away, or the next chord's
//   fifth), the same at the same spot every time the block comes round
// - a pop at the end of four-bar phrases (an octave or a fifth)
// - the song grows: the first verse as written, more lead-ins from the second time round, the last
//   chorus busiest
// Riff genres: the bass doubles the riff, so only the feel changes.

import type { Idea, SectionKind } from '../idea';
import { Rng } from '../rng';
import { type Chord, SCALES, chordPc } from '../theory';
import { type Feel, fillSteps } from './drummer';

type LeadIn = 'chromatic' | 'scale' | 'fifth';
type Pop = 'octave' | 'fifth' | 'none';

interface Bassist {
  /** ms behind the kick. */
  late: number;
  leadIn: LeadIn;
  /** How often they lead into a chord change (0..1). */
  busy: number;
  pop: Pop;
}

const LEAD_DESC: Record<LeadIn, string> = { chromatic: 'from a half step away', scale: 'up the scale', fifth: 'from the next chord\'s fifth' };
const POP_DESC: Record<Exclude<Pop, 'none'>, string> = { octave: 'an octave pop', fifth: 'a jump to the fifth' };

/** Bass range: lowest note E1. */
const LOW = 28;

function pickBassist(rng: Rng, funk: boolean, drummer: Feel): Bassist {
  return {
    late: drummer === 'behind' ? 8 : drummer === 'on' && rng.chance(0.4) ? 6 : 0,
    leadIn: rng.weighted<LeadIn>(funk ? [['chromatic', 3], ['scale', 1]] : [['chromatic', 2], ['scale', 2], ['fifth', 1]]),
    busy: rng.pick([0.35, 0.5, 0.7]),
    pop: rng.weighted<Pop>(funk ? [['octave', 3], ['none', 1]] : [['octave', 2], ['fifth', 1], ['none', 2]]),
  };
}

const rootOf = (key: number, c: Chord) => {
  let m = 36 + chordPc(key, c);
  if (m > 43) m -= 12;
  return m;
};

/** The note `n` moved one step along the key's scale. */
function scaleStep(n: number, dir: 1 | -1, idea: Idea): number {
  const pcs = SCALES[idea.song.mode].map((p) => (p + idea.song.key) % 12);
  let m = n + dir;
  while (!pcs.includes(((m % 12) + 12) % 12)) m += dir;
  return m;
}

/** The bassist plays every section of a track (in place), after the drummer. `seed`: who the bassist is. */
export function playBass(sections: Idea[], seed: string, drummer: Feel) {
  const funk = sections[0].song.partGenres.bass === 'funk';
  const bp = pickBassist(new Rng(`${seed}-bassist`), funk, drummer);
  const kinds = sections.map((s) => s.section!.kind);
  const firstChorus = kinds.indexOf('chorus'), lastChorus = kinds.lastIndexOf('chorus');
  const seen: Partial<Record<SectionKind, number>> = {};
  let told = false;

  sections.forEach((idea, i) => {
    const { song, bass, chords } = idea, info = idea.section!;
    const kind = info.kind, e = info.energy;
    const round = seen[kind] ?? 0;
    seen[kind] = round + 1;
    idea.bassFeel = bp.late;
    if (!told) {
      idea.notes.push(`Band feel: the bassist ${bp.late ? 'sits back a little with the drummer' : 'plays right with the kick'}`);
      told = true;
    }
    // riff genres double the riff; quiet sections keep their long notes
    if (idea.guitar || e <= 2 || !bass.some(Boolean)) return;
    const last = i === lastChorus && lastChorus !== firstChorus;
    // the first verse as written; more from the second time round; the last chorus busiest
    const busy = last ? 1 : round === 0 && kind === 'verse' ? 0 : round === 0 ? bp.busy * 0.6 : bp.busy;
    if (!busy) return;
    const lens = idea.bassLen;
    const inFill = fillSteps(idea);
    // the last bar is left alone: the track's walk into the next section and the ending live there
    const lastBar = song.bars[song.bars.length - 1];
    const from = info.bandFrom ?? 0, to = lastBar.start;
    const changes = new Set(chords.timeline.map((t) => t.step));
    const ok = (g: number) => g >= from && g < to && !inFill.has(g);
    // the same choice at the same spot whenever the block comes round
    const at = (g: number, what: string) => new Rng(`${seed}-bass-${kind}-${g}-${what}`);
    const put = (g: number, n: number, len: number) => {
      bass[g] = n;
      if (lens) {
        lens[g] = len;
        // the note before stops in time
        for (let k = g - 1; k >= 0; k--) if (bass[k]) { if (lens[k]) lens[k] = Math.min(lens[k], g - k); break; }
      }
    };
    let leads = 0, pops = 0;
    const led = new Set<number>();

    // lead-ins: the last 8th before a chord change (16th in funk)
    for (const c of changes) {
      const g = c - (funk ? 1 : 2);
      if (c === 0 || !ok(g) || !ok(c) || [...changes].some((x) => x > g && x < c)) continue;
      // (long held roots get fewer)
      if (!bass[c] || !at(c, 'lead').chance(idea.bassLine === 'held' ? busy / 2 : busy)) continue;
      const cur = chords.timeline[chords.chordIdx[g]].chord, next = chords.timeline[chords.chordIdx[c]].chord;
      const t = bass[c];
      if (rootOf(song.key, cur) % 12 === t % 12) continue; // same root: nothing to lead into
      let n: number;
      if (bp.leadIn === 'chromatic') n = t - 1 >= LOW && at(c, 'dir').chance(0.7) ? t - 1 : t + 1;
      else if (bp.leadIn === 'scale') n = scaleStep(t, t - 2 >= LOW ? -1 : 1, idea);
      else { const f = rootOf(song.key, next) + 7; n = f - 12 >= LOW ? f - 12 : f; }
      if (n === bass[g]) continue;
      put(g, n, funk ? 1 : 2);
      led.add(g);
      leads++;
    }

    // a pop at the end of each four-bar phrase (on the last off-beat 8th), unless it leads into a chord there
    if (bp.pop !== 'none') {
      song.bars.forEach((bar, bi) => {
        if (bi % 4 !== 3 || bar === lastBar) return;
        const g = bar.start + bar.len - 2;
        if (!ok(g) || led.has(g) || led.has(g + 1) || !at(bar.start, 'pop').chance(Math.min(1, busy + 0.3))) return;
        const r = rootOf(song.key, chords.timeline[chords.chordIdx[g]].chord);
        put(g, bp.pop === 'octave' ? r + 12 : r + 7, 1);
        pops++;
      });
    }
    const did = [leads && `lead-in notes into the chord changes (${LEAD_DESC[bp.leadIn]})`, pops && POP_DESC[bp.pop as Exclude<Pop, 'none'>] + ' at the end of phrases'].filter(Boolean);
    if (did.length) idea.notes.push(`Bassist: ${did.join(', ')}${last ? ', busiest in the last chorus' : round >= 1 ? ', more this time round' : ''}`);
  });
}
