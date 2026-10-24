// The rules the solo player plays with (docs/SOLO-PLAYER.md). Step 3: the ways to play a long note.

import { LONG_RULES } from './solorules-long';
import { PLAIN, type Rule } from './solorules';

/** Melody + read: the plain rule only (nothing changed). */
export const NO_RULES: Rule[] = [PLAIN];
/** Melody + player. */
export const LIVE_RULES: Rule[] = [PLAIN, ...LONG_RULES];
