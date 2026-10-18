// Who the players are (docs/BAND-VIEW.md): each one a character (cool, energetic, emo, angry), picked
// for the song from its genre and mood and from the part they play (a shredder or a bluesy lead, a riff
// player, a busy bassist, a brooding singer...). The character decides how they move and how they dress
// (each has its own sprite sheet: the same frames, other clothes).

import type { Genre } from '../genres';
import type { Idea } from '../idea';
import { pickLead } from '../players/lead';
import { Rng } from '../rng';
import type { Mood } from '../tension';
import type { Score } from './score';

export type Persona = 'cool' | 'energetic' | 'emo' | 'angry';
export type Player = 'singer' | 'rhythm' | 'lead' | 'bassist' | 'drummer';
export const PERSONAS: Persona[] = ['cool', 'energetic', 'emo', 'angry'];
export const PLAYERS: Player[] = ['singer', 'rhythm', 'lead', 'bassist', 'drummer'];
export const PERSONA_LABEL: Record<Persona, string> = { cool: 'Cool', energetic: 'Energetic', emo: 'Emo', angry: 'Angry' };
export const PLAYER_LABEL: Record<Player, string> = { singer: 'Singer', rhythm: 'Rhythm', lead: 'Lead', bassist: 'Bass', drummer: 'Drums' };

/** How a character moves and looks, as dials the players read. */
export interface Style {
  /** How big the bounce on the beat is (1 = as usual). */
  bounce: number;
  /** Nods on every beat, only on the bar's downbeat (cool), or head-bangs when it's loud (whatever the genre). */
  nod: 'beat' | 'bar' | 'bang';
  /** Slumps, head down, when it's quiet (emo). */
  slump: boolean;
  /** Joins the band's jumps; and jumps more on their own in the loudest parts (energetic). */
  jumps: boolean;
  extraJumps: boolean;
  /** Strikes poses on chords left ringing (share of them). */
  pose: number;
  /** Sways with the beat (pixels), steps in toward the drummer when it's loud. */
  sway: number;
  stepIn: boolean;
  /** Faces: eyes, brows and mouth by section energy (1-5). */
  eyes: (e: number) => string;
  brows: (e: number) => string;
  mouth: (e: number) => string;
  /** The face on a big hit (a jump, the end, a crash). */
  shout: string;
}

export const STYLES: Record<Persona, Style> = {
  cool: {
    bounce: 0.5, nod: 'bar', slump: false, jumps: false, extraJumps: false, pose: 1, sway: 0, stepIn: true,
    eyes: () => 'half', brows: () => 'neutral', mouth: () => 'smile', shout: 'smile',
  },
  energetic: {
    bounce: 1.6, nod: 'beat', slump: false, jumps: true, extraJumps: true, pose: 1, sway: 2, stepIn: true,
    eyes: (e) => (e >= 4 ? 'wide' : 'open'), brows: (e) => (e >= 4 ? 'raised' : 'neutral'), mouth: (e) => (e >= 4 ? 'E' : 'smile'), shout: 'A+',
  },
  emo: {
    bounce: 0.6, nod: 'bang', slump: true, jumps: true, extraJumps: false, pose: 0.5, sway: 0, stepIn: false,
    eyes: (e) => (e <= 2 ? 'closed' : 'half'), brows: () => 'sad', mouth: () => 'rest', shout: 'O',
  },
  angry: {
    bounce: 1.1, nod: 'bang', slump: false, jumps: true, extraJumps: false, pose: 1, sway: 1, stepIn: true,
    eyes: (e) => (e >= 4 ? 'squeeze' : 'half'), brows: () => 'furrow', mouth: (e) => (e >= 4 ? 'S' : 'rest'), shout: 'A+',
  },
};

/** Who plays in each genre, before the part and the mood have their say. */
const BY_GENRE: Record<Genre, Record<Persona, number>> = {
  rock: { cool: 2, energetic: 3, emo: 1, angry: 1 },
  pop: { cool: 2, energetic: 4, emo: 1, angry: 0.2 },
  funk: { cool: 4, energetic: 3, emo: 0.2, angry: 0.2 },
  hardrock: { cool: 2, energetic: 3, emo: 0.3, angry: 3 },
  metal: { cool: 1, energetic: 2, emo: 0.3, angry: 5 },
  grunge: { cool: 2, energetic: 1, emo: 3, angry: 3 },
  altmetal: { cool: 1, energetic: 2, emo: 3, angry: 4 },
};

const BY_MOOD: Partial<Record<Mood, Partial<Record<Persona, number>>>> = {
  melancholic: { emo: 2 }, dark: { emo: 1.5, angry: 1 }, nostalgic: { emo: 1, cool: 1 }, angry: { angry: 2.5 }, tense: { angry: 1.5 },
  happy: { energetic: 2 }, triumphant: { energetic: 2 }, dreamy: { cool: 1.5, emo: 1 },
};

export interface Lineup { who: Record<Player, Persona>; why: Record<Player, string> }

/** Each player's character for this track (`seed`: the track's band seed, so the same song keeps its band). */
export function pickCast(sections: Idea[], score: Score, mood: Mood, seed: string): Lineup {
  const song = sections[0].song;
  const genre = song.genre;
  const why = {} as Record<Player, string>;
  const weights = () => {
    const w = { ...BY_GENRE[genre] };
    for (const [p, v] of Object.entries(BY_MOOD[mood] ?? {})) w[p as Persona] += v;
    return w;
  };
  const add = (w: Record<Persona, number>, p: Partial<Record<Persona, number>>) => { for (const [k, v] of Object.entries(p)) w[k as Persona] += v; };
  const minutes = (score.steps * score.six) / 60;
  const all = {} as Record<Player, Record<Persona, number>>;

  // the singer: how they carry the energy (energy.ts)
  {
    const w = weights();
    const style = sections.find((x) => x.vocalEnergy)?.vocalEnergy;
    const lean: Record<string, Partial<Record<Persona, number>>> = {
      brooder: { emo: 4 }, puncher: { angry: 4 }, driver: { energetic: 4 }, drifter: { cool: 4 }, climber: { energetic: 2, emo: 1 }, switcher: { energetic: 1.5, angry: 1.5 },
    };
    if (style) { add(w, lean[style]); why.singer = `sings as a ${style}`; } else why.singer = `a ${genre} singer, ${mood}`;
    all.singer = w;
  }
  // the lead: the kind of lead player they are, and whether they get a solo
  {
    const w = weights();
    const kind = pickLead(seed, song.partGenres.strum).kind;
    const lean: Record<string, Partial<Record<Persona, number>>> = {
      shredder: { energetic: 3, angry: 1 }, melodic: { cool: 2, emo: 2 }, bluesy: { cool: 4 }, raw: { angry: 4 }, funky: { cool: 3, energetic: 1 },
    };
    add(w, lean[kind] ?? {});
    const solo = score.sections.some((x) => x.solo);
    if (solo) add(w, { energetic: 1, cool: 1 });
    why.lead = `a ${kind} lead${solo ? ' with a solo' : ''}`;
    all.lead = w;
  }
  // the rhythm guitarist: riffs and palm mutes, or strummed chords (busy or held)
  {
    const w = weights();
    const riffShare = score.sections.filter((x) => x.riff).length / score.sections.length;
    const strums = score.rhythm.strums;
    const muted = strums.filter((x) => x.kind === 'p').length / Math.max(1, strums.length);
    const perMin = strums.length / minutes;
    if (riffShare > 0.5) add(w, { angry: 2.5 });
    if (muted > 0.3) add(w, { angry: 1.5 });
    if (perMin > 180) add(w, { energetic: 2 });
    else if (riffShare <= 0.5 && perMin < 90) add(w, { cool: 1.5, emo: 1 });
    why.rhythm = riffShare > 0.5 ? 'plays the riffs' : muted > 0.3 ? 'chugs palm-muted chords' : perMin > 180 ? 'strums hard and busy' : 'lets the chords ring';
    all.rhythm = w;
  }
  // the bassist: busy or sparse, sliding around
  {
    const w = weights();
    const perBar = score.bass.length / Math.max(1, score.bars.length);
    const slides = score.bass.filter((x) => x.from || x.fall).length / Math.max(1, score.bass.length);
    if (perBar > 7) add(w, { energetic: 2.5 });
    else if (perBar < 4) add(w, { cool: 2 });
    if (slides > 0.08) add(w, { cool: 1.5 });
    why.bassist = perBar > 7 ? 'a busy bassline' : perBar < 4 ? 'a sparse bassline' : 'locks in with the kick';
    if (slides > 0.08) why.bassist += ', slides around';
    all.bassist = w;
  }
  // the drummer: fills, how hard they hit
  {
    const w = weights();
    const fills = sections.reduce((n, x) => n + x.drums.fills.length, 0) / minutes;
    const rides = score.drums.pieces.ride.length > score.drums.pieces.hat.length;
    if (fills > 6) add(w, { energetic: 2 });
    if (rides) add(w, { cool: 1 });
    if (['metal', 'hardrock', 'altmetal'].includes(genre)) add(w, { angry: 1.5 });
    why.drummer = `${fills > 6 ? 'lots of fills' : 'keeps it steady'}${rides ? ', rides the cymbal' : ''}`;
    all.drummer = w;
  }

  const rng = new Rng(`${seed}-cast`);
  const pick = (w: Record<Persona, number>) => rng.weighted(PERSONAS.map((p) => [p, Math.max(0, w[p])] as [Persona, number]));
  const who = Object.fromEntries(PLAYERS.map((p) => [p, pick(all[p])])) as Record<Player, Persona>;
  // a band of five the same is a costume party: one of them goes their own way
  if (PLAYERS.every((p) => who[p] === who.singer)) {
    const odd = PLAYERS[1 + Math.floor(rng.next() * 4)];
    who[odd] = pick({ ...all[odd], [who.singer]: 0 });
  }
  return { who, why };
}
