// The lead vocal as it's sung (docs/VOCAL.md, "The main vocal"; was the Guide card's Vocal tune, docs/GUIDE-TUNE.md):
// the vocal's own tune (written by the vocal row's fixed writers: Rhythm Words, Melody Learned, Real songs, Patterns),
// sung with new words written onto it (words.ts), more bends (a held note now and then sliding into the next word),
// now and then its last note carried on into a solo; human feel is added as it's sung (src/audio/leadVoice.ts).
// Worked out once for the whole song (a track's sections together) and kept on each section.

import type { Idea } from '../idea';
import type { Mood } from '../tension';
import type { GuideIdeas } from '../guide/line';
import { writeTune } from '../guide/tune';
import { guideWords } from '../guide/words';

/** Paul's settings for the main vocal: the Vocal tune, more bends, carry over, human feel (new words: guideWords). */
export const LEAD_SUNG: GuideIdeas = { tune: true, feel: true, carry: true, bends: 'more' };

/** Each section's sung lines (`list`: an idea, or a track's sections). */
export function singLead(list: Idea[], mood?: Mood) {
  if (!list.some((i) => i.vocal?.length)) { for (const i of list) { i.sung = []; i.sungTop = 0; } return; }
  const line = writeTune(list, mood, 0, LEAD_SUNG, null);
  const words = guideWords(list, line, 0);
  const top = Math.max(0, ...words.flat().flatMap((l) => l.notes.map((n) => n.midi)));
  list.forEach((i, si) => { i.sung = words[si] ?? []; i.sungTop = top; });
}
