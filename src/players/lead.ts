// The lead guitarist (Guitar 2): who they are decides what they play around the song (how often
// they answer the singer in the verses, what their licks sound like, whether they build up the
// pre-chorus) and how their hands play it (see hands.ts). One player for the whole track, picked
// with the band, so rerolling the band can bring a different lead player.
// (Solos, later, follow the same player.)

import type { Genre } from '../genres';
import { Rng } from '../rng';

export type LeadKind = 'melodic' | 'bluesy' | 'shredder' | 'raw' | 'funky';

/** What their verse licks sound like (see guitar2.ts, answerRhythm). */
export type LickKind = 'sung' | 'blues' | 'run' | 'simple' | 'muted';

export interface LeadPlayer {
  kind: LeadKind;
  /** Words for the band notes. */
  desc: string;
  /** Chance they take the verses as the lead (answering the singer); otherwise they play other parts there. */
  verses: number;
  /** In a later verse, chance each four bars goes to another part for a change (arpeggios, a melody...). */
  other: number;
  /** Chance of a build-up line through the pre-chorus. */
  climb: number;
  lick: LickKind;
  /** Their hands (hands.ts): how they bend, slide and hammer. */
  hands: ['legato' | 'slider' | 'picker' | 'bluesy', number][];
}

const PLAYERS: Record<LeadKind, LeadPlayer> = {
  melodic: {
    kind: 'melodic', desc: 'a melodic lead player: few notes, sung, with room around them',
    verses: 0.8, other: 0.3, climb: 0.6, lick: 'sung', hands: [['legato', 2], ['slider', 2]],
  },
  bluesy: {
    kind: 'bluesy', desc: 'a bluesy lead player: short licks, bent notes, answering every line',
    verses: 0.85, other: 0.2, climb: 0.4, lick: 'blues', hands: [['bluesy', 1]],
  },
  shredder: {
    kind: 'shredder', desc: 'a shredder: quick runs at the ends of phrases',
    verses: 0.7, other: 0.3, climb: 0.6, lick: 'run', hands: [['legato', 2], ['picker', 1]],
  },
  raw: {
    kind: 'raw', desc: 'a raw, simple lead player: a couple of loud notes, now and then',
    verses: 0.6, other: 0.4, climb: 0.3, lick: 'simple', hands: [['slider', 2], ['picker', 1]],
  },
  funky: {
    kind: 'funky', desc: 'a funky lead player: short muted licks in the gaps',
    verses: 0.7, other: 0.3, climb: 0.2, lick: 'muted', hands: [['picker', 1]],
  },
};

const BY_GENRE: Record<Genre, [LeadKind, number][]> = {
  rock: [['melodic', 2], ['bluesy', 3], ['shredder', 0.5], ['raw', 1]],
  hardrock: [['melodic', 1], ['bluesy', 3], ['shredder', 2]],
  metal: [['shredder', 3], ['melodic', 1]],
  altmetal: [['melodic', 2], ['raw', 1], ['shredder', 1]],
  grunge: [['raw', 3], ['melodic', 1], ['bluesy', 1]],
  pop: [['melodic', 3], ['funky', 1]],
  funk: [['funky', 3], ['bluesy', 1]],
};

/** The track's lead player (`seed`: the band's). */
export function pickLead(seed: string, genre: Genre): LeadPlayer {
  return PLAYERS[new Rng(`${seed}-lead`).weighted(BY_GENRE[genre])];
}
