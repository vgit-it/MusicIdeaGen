// The drummer: plays a track's written drum part their own way. They read the whole song first, so
// they know what's coming, and they keep their habits all the way through:
// - a feel: ahead of the beat, on it, or laid back (the kick is the anchor; snare and cymbals move)
// - a touch on the hi-hat (light, even, or digging into the beat)
// - their own two fills: a big one into choruses and lifts (and where the drums come in), a smaller
//   one everywhere else. Same fill every time, so the song hangs together (a fill the guitar plays
//   along with stays as written)
// - the song grows: first verse and chorus a little held back, ghost notes from the second time round,
//   the last chorus played hardest (riding the cymbal or crashing every bar)
// The writing stays as it is: only how it's played changes (where fills go, the groove, the hits).

import type { Genre } from '../genres';
import type { DrumPart, Idea, SectionKind } from '../idea';
import { type DrumBar, type FillType, addFill } from '../parts/drums';
import { Rng } from '../rng';
import type { Bar } from '../rhythm';

export type Feel = 'ahead' | 'on' | 'behind';
type Touch = 'light' | 'even' | 'dig';

interface Drummer {
  feel: Feel;
  touch: Touch;
  /** 0: never plays ghost notes … 1: lots. */
  ghosts: number;
  small: FillType;
  big: FillType;
  /** The big fill takes half a bar (otherwise the written length). */
  bigLong: boolean;
  lastChorus: 'ride' | 'crash';
}

/** ms against the grid (+ late), for the snare and the cymbals. */
const FEEL_MS: Record<Feel, { snare: number; cym: number }> = {
  ahead: { snare: -5, cym: -7 },
  on: { snare: 0, cym: 0 },
  behind: { snare: 12, cym: 5 },
};
const FEEL_DESC: Record<Feel, string> = { ahead: 'pushes a little ahead of the beat', on: 'sits right on the beat', behind: 'lays back behind the beat' };
const TOUCH_DESC: Record<Touch, string> = { light: 'a light hi-hat', even: 'an even hi-hat', dig: 'a hi-hat that digs into each beat' };
const FILL_NAME: Record<FillType, string> = {
  roll: 'a snare roll', ghostroll: 'a ghost-note roll', toms: 'a run down the toms', sync: 'a syncopated snare-and-tom fill', eighths: 'eighth notes down the kit',
};

const GHOSTS: Record<Genre, number> = { funk: 1, pop: 0.5, rock: 0.6, grunge: 0.4, hardrock: 0.4, altmetal: 0.3, metal: 0 };

function pickDrummer(rng: Rng, genre: Genre): Drummer {
  const heavy = genre === 'metal' || genre === 'altmetal' || genre === 'hardrock';
  const feel = rng.weighted<Feel>(genre === 'funk' ? [['ahead', 1], ['on', 2], ['behind', 3]]
    : heavy ? [['ahead', 2], ['on', 3], ['behind', 1]] : [['ahead', 1], ['on', 3], ['behind', 2]]);
  const touch = rng.weighted<Touch>(heavy ? [['even', 1], ['dig', 3]] : [['light', 2], ['even', 2], ['dig', 2]]);
  const ghosts = rng.chance(GHOSTS[genre]) ? GHOSTS[genre] : 0;
  const big = rng.weighted<FillType>(genre === 'funk' ? [['toms', 2], ['sync', 1]] : [['toms', 3], ['roll', 2]]);
  const small = rng.weighted<FillType>((genre === 'funk' ? [['ghostroll', 2], ['sync', 2]] as [FillType, number][]
    : [['sync', 2], ['eighths', 2], ['roll', 1]] as [FillType, number][]).filter(([t]) => t !== big));
  return { feel, touch, ghosts, small, big, bigLong: rng.chance(0.5), lastChorus: rng.chance(0.5) ? 'ride' : 'crash' };
}

const LANES = ['kick', 'snare', 'hat', 'hatOpen', 'ride', 'crash', 'tom'] as const;

function barOf(d: DrumPart, bar: Bar): DrumBar {
  const s = (a: number[]) => a.slice(bar.start, bar.start + bar.len);
  return { K: s(d.kick), S: s(d.snare), H: s(d.hat), O: s(d.hatOpen), R: s(d.ride), T: s(d.tom) };
}

function putBar(d: DrumPart, bar: Bar, b: DrumBar) {
  for (let j = 0; j < bar.len; j++) {
    const g = bar.start + j;
    d.kick[g] = b.K[j]; d.snare[g] = b.S[j]; d.hat[g] = b.H[j]; d.hatOpen[g] = b.O[j]; d.ride[g] = b.R[j]; d.tom[g] = b.T[j];
  }
}

/** The rhythm guitar plays a fill's rhythm with the drums: it strikes only with the fill's hits, and rests between. */
function followsFill(idea: Idea, a: number, b: number): boolean {
  const d = idea.drums;
  let hits = 0, rests = 0;
  for (let g = a; g < b; g++) {
    const st = idea.strum[g];
    if (st === 'D' || st === 'U') {
      if (!(d.snare[g] >= 0.5 || d.tom[g] || d.kick[g])) return false;
      hits++;
    } else if (g % 2 === 0) rests++;
  }
  return hits >= 3 && rests > 0;
}

/** Steps inside a fill (left alone by everything but the fill itself). */
export function fillSteps(idea: Idea): Set<number> {
  const out = new Set<number>();
  for (const f of idea.drums.fills) {
    const bar = idea.song.bars[f.bar];
    if (bar) for (let g = bar.start + bar.len - f.len; g < bar.start + bar.len; g++) out.add(g);
  }
  return out;
}

/** The drummer plays every section of a track (in place). `seed`: who the drummer is. Returns their feel (the bassist listens to it). */
export function playDrums(sections: Idea[], seed: string): Feel {
  const genre = sections[0].song.partGenres.drums;
  const dr = pickDrummer(new Rng(`${seed}-drummer`), genre);
  const kinds = sections.map((s) => s.section!.kind);
  const firstChorus = kinds.indexOf('chorus'), lastChorus = kinds.lastIndexOf('chorus');
  const seen: Partial<Record<SectionKind, number>> = {};
  // (fills don't use chance once their length and kind are set)
  const fixed = new Rng(seed);

  sections.forEach((idea, i) => {
    const d = idea.drums, { song } = idea, info = idea.section!;
    const kind = info.kind, e = info.energy;
    const round = seen[kind] ?? 0;
    seen[kind] = round + 1;
    d.feel = FEEL_MS[dr.feel];
    if (i === 0) idea.notes.push(`Band feel: the drummer ${FEEL_DESC[dr.feel]}, with ${TOUCH_DESC[dr.touch]}`);
    if (!LANES.some((l) => d[l].some(Boolean))) return;
    const notes: string[] = [];
    const final = i === sections.length - 1;
    const endAt = final ? song.bars[song.bars.length - 1].start : song.total;
    const from = info.bandFrom ?? 0;

    // their own fills, where the track puts a fill
    const next = sections[i + 1]?.section;
    for (const f of d.fills) {
      const bar = song.bars[f.bar];
      if (f.build) continue;
      // a fill the band plays along with stays as written (the guitar strikes its rhythm)
      if (!f.seam && !idea.guitar && followsFill(idea, bar.start + bar.len - f.len, bar.start + bar.len)) continue;
      const last = f.bar === song.bars.length - 1;
      const big = (f.seam && !last) || (last && !!next && ((next.kind === 'chorus' && kind !== 'chorus') || next.energy - e >= 2));
      const groups = bar.groups;
      const half = groups.length > 1 ? groups[groups.length - 1] + groups[groups.length - 2] : f.len;
      // the drummer's own length (big fills: half a bar, or the last beat group); one the band holds a
      // chord under can't get shorter
      const own = big ? Math.min(bar.len, dr.bigLong ? half : groups[groups.length - 1]) : f.len;
      const len = f.seam || idea.guitar ? own : Math.max(f.len, own);
      const b = barOf(d, bar);
      f.len = addFill(fixed, b, bar.len, groups, song.w, song.partGenres.drums, { len, type: big ? dr.big : dr.small });
      putBar(d, bar, b);
      if (last && next) notes.push(`Drummer: ${big ? 'their big fill' : 'their usual fill'} (${FILL_NAME[big ? dr.big : dr.small]})`);
    }
    const inFill = fillSteps(idea);

    // ghost notes around the backbeat: from the second time round (always, for a ghost-note player)
    if (dr.ghosts && e >= 3 && (round >= 1 || dr.ghosts >= 0.8)) {
      let n = 0;
      const free = (g: number) => g >= from && g < endAt && !inFill.has(g) && !d.snare[g] && !d.kick[g] && !d.tom[g];
      for (let g = from; g < endAt; g++) {
        if (d.snare[g] < 0.7 || inFill.has(g)) continue;
        if (free(g - 1) && (g - 1) % 2) { d.snare[g - 1] = 0.18; n++; }
        if (dr.ghosts >= 0.6 && free(g + 3) && (g + 3) % 2) { d.snare[g + 3] = 0.16; n++; }
      }
      if (n) notes.push(round >= 1 && dr.ghosts < 0.8 ? 'Drummer: adds ghost notes this time round' : 'Drummer: ghost notes on the snare');
    }

    // the hi-hat hand
    for (let g = 0; g < song.total; g++) {
      for (const l of ['hat', 'ride'] as const) {
        if (!d[l][g]) continue;
        const k = dr.touch === 'light' ? 0.88 : dr.touch === 'dig' ? (g % 4 === 0 ? 1.08 : 0.94) : g % 4 === 2 ? 1.1 : 1;
        d[l][g] = Math.min(1, d[l][g] * k);
      }
    }

    // the song grows: held back the first time, hardest in the last chorus
    const last = i === lastChorus && lastChorus !== firstChorus;
    const scale = last ? 1.06 : round === 0 && (kind === 'verse' || kind === 'chorus') ? 0.94 : 1;
    if (scale !== 1) {
      for (const l of ['kick', 'hat', 'hatOpen', 'ride', 'crash'] as const) for (let g = 0; g < song.total; g++) if (d[l][g]) d[l][g] = Math.min(1, d[l][g] * scale);
      for (let g = 0; g < song.total; g++) if (d.snare[g] >= 0.3) d.snare[g] = Math.min(1, d.snare[g] * scale);
    }
    if (last && e >= 4) {
      const hats = d.hat.some(Boolean), offbeat = d.hatOpen.filter(Boolean).length > song.bars.length * 2;
      if (dr.lastChorus === 'ride' && hats && !d.ride.some(Boolean) && !offbeat) {
        for (let g = from; g < endAt; g++) {
          if (inFill.has(g) || !d.hat[g]) continue;
          if (g % 2 === 0) d.ride[g] = Math.min(0.85, d.hat[g] + 0.08);
          d.hat[g] = 0;
        }
        notes.push('Drummer: moves to the ride for the last chorus, playing it hardest');
      } else {
        for (const bar of song.bars) {
          const g = bar.start;
          if (g < from || g >= endAt || inFill.has(g) || d.crash[g]) continue;
          d.crash[g] = 0.8;
          d.kick[g] = Math.max(d.kick[g], 0.9);
          d.hat[g] = 0; d.ride[g] = 0; d.hatOpen[g] = 0;
        }
        notes.push('Drummer: crashes every bar of the last chorus, playing it hardest');
      }
    } else if (scale < 1) notes.push('Drummer: holds back a little the first time round');

    idea.notes.push(...notes);
  });
  return dr.feel;
}
