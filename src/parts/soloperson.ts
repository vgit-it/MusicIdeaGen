// The solo player's personality (docs/SOLO-PLAYER.md, section 4): a style sheet from the five lead players, with a small twist per band so
// no two are the same. What the player likes (a taste per rule), what they never play, how much they decorate, how they lean in feel, and
// (per solo) the two or three pet moves that keep coming back.

import type { Feel } from '../idea';
import type { LeadKind, LeadPlayer } from '../players/lead';
import { Rng } from '../rng';

export interface Person {
  kind: LeadKind;
  /** How much they like each rewrite (a multiplier; 0: never). A rule not listed is 1. */
  taste: Record<string, number>;
  /** The chance a long note is decorated at all, before the energy, the place and the fit are counted. */
  density: number;
  /** Their own lean in feel, added to what the moment wants. */
  lean: Feel;
  /** How hard a rewrite may be pushed: 0 plays safe, 1 takes the wild option too. */
  risk: number;
}

const feel = (agitation = 0, roughness = 0, ornament = 0, weight = 0, looseness = 0): Feel => ({ agitation, roughness, ornament, weight, looseness });

const SHEETS: Record<LeadKind, { taste: Record<string, number>; density: number; lean: Feel; risk: number }> = {
  melodic: {
    taste: {
      'scoop-in': 2, 'wide-vibrato': 2.5, 'late-bend': 1.5, 'bend-in': 1, 'tail-run': 1.2, 'turn-return': 1, shimmer: 0.8, 'triplet-pulse': 0.8,
      'eighth-pulse': 0.6, trill: 0.5, 'tremolo-hold': 0.4, 'stutter-hold': 0.3, gallop: 0.1, 'ghost-pulse': 0.2,
    },
    density: 0.42, lean: feel(-0.1, -0.1, 0, 0, 0.2), risk: 0.2,
  },
  bluesy: {
    taste: {
      'bend-in': 2.5, 'late-bend': 2.5, 'wide-vibrato': 2, 'scoop-in': 1, shimmer: 1.2, 'tail-run': 1, 'triplet-pulse': 1.2, 'stutter-hold': 0.6,
      'tremolo-hold': 0.6, trill: 0.6, 'ghost-pulse': 0.5, 'eighth-pulse': 0.5, 'turn-return': 0.5, gallop: 0.2,
    },
    density: 0.52, lean: feel(0, 0.2, 0, 0.1, 0.2), risk: 0.35,
  },
  shredder: {
    taste: {
      shimmer: 2, trill: 2, 'tremolo-hold': 2, 'tail-run': 1.8, 'stutter-hold': 1.5, 'turn-return': 1.5, gallop: 1.2, 'triplet-pulse': 1.2,
      'wide-vibrato': 0.8, 'bend-in': 0.6, 'late-bend': 0.5, 'eighth-pulse': 0.3, 'scoop-in': 0.3, 'ghost-pulse': 0.3,
    },
    density: 0.68, lean: feel(0.3, 0, 0.3, 0, -0.1), risk: 0.7,
  },
  raw: {
    taste: {
      gallop: 1.8, 'stutter-hold': 2, 'ghost-pulse': 1.5, 'eighth-pulse': 1.5, 'scoop-in': 1.3, 'tremolo-hold': 1, 'bend-in': 1, 'wide-vibrato': 1,
      'triplet-pulse': 0.6, 'late-bend': 0.6, 'tail-run': 0.5, shimmer: 0.3, trill: 0.3, 'turn-return': 0.2,
    },
    density: 0.5, lean: feel(0.1, 0.3, -0.2, 0.2, 0), risk: 0.45,
  },
  funky: {
    taste: {
      'ghost-pulse': 3, 'stutter-hold': 2, 'eighth-pulse': 1.5, shimmer: 1.3, 'tail-run': 1, 'triplet-pulse': 1, 'scoop-in': 0.8, 'turn-return': 0.8,
      gallop: 0.5, 'bend-in': 0.5, 'wide-vibrato': 0.4, trill: 0.4, 'tremolo-hold': 0.3, 'late-bend': 0.3,
    },
    density: 0.58, lean: feel(0.1, 0, 0.1, -0.1, -0.3), risk: 0.4,
  },
};

/** The band's lead player as a person: the sheet of their kind, a twist in every taste, in how much they decorate and in what they lean toward, and one thing they never play. */
export function personOf(bandSeed: string, lead: LeadPlayer): Person {
  const rng = new Rng(`${bandSeed}-person`);
  const s = SHEETS[lead.kind];
  const taste: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.taste)) taste[k] = Math.round(v * (0.8 + rng.next() * 0.45) * 100) / 100;
  // an allergy: one of the moves they like least
  const unloved = Object.entries(taste).filter(([, v]) => v < 1).map(([k]) => k);
  if (unloved.length) taste[rng.pick(unloved)] = 0;
  const twist = (x: number) => Math.max(-1, Math.min(1, x + (rng.next() - 0.5) * 0.2));
  const lean: Feel = { agitation: twist(s.lean.agitation), roughness: twist(s.lean.roughness), ornament: twist(s.lean.ornament), weight: twist(s.lean.weight), looseness: twist(s.lean.looseness) };
  return { kind: lead.kind, taste, density: s.density * (0.85 + rng.next() * 0.3), lean, risk: Math.max(0, Math.min(1, s.risk + (rng.next() - 0.5) * 0.2)) };
}

/** The two or three moves this player comes back to in one solo: drawn from what they like (never one they refuse). */
export function signaturesOf(p: Person, soloSeed: string): string[] {
  const rng = new Rng(`${soloSeed}-signatures`);
  const pool = Object.entries(p.taste).filter(([, v]) => v > 0).map(([k, v]) => [k, v * v] as [string, number]);
  const out: string[] = [];
  const n = Math.min(pool.length, rng.int(2, 3));
  while (out.length < n) {
    const k = rng.weighted(pool.filter(([name]) => !out.includes(name)));
    out.push(k);
  }
  return out;
}
