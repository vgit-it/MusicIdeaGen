# Human feel (Guide line switch; 2026-10-15)

Paul: "immediate jumps between notes ... not very human like"; a split-second bend into a sound; words
fading out at their end; a singer not hitting the note or full energy at once; by the energy and the singer.
**Human feel: Off / On** in the Guide line card (`src/guide/feel.ts`). Only how the line is played and sung:
the written line, its drawing, words and MIDI stay the same (so `npm run guide-check` is untouched).
Works with the guide line and the Anchor line, with the synth and every sung voice.

## What it does
| Move | What | About | Quiet sections | Loud sections |
|---|---|---|---|---|
| Glide | slides from note to note, no jump | 40-120 ms | slower | quicker |
| Scoop | a fresh word starts under the note, slides up | 30-80 ms, up to a semitone | gentle | deeper, quicker |
| Swell | the level rises into a word | 20-120 ms | slow, soft | fast, punchy |
| Fade | a word's end fades out | 40-170 ms (longer in slow songs) | long | short |
| Fall | now and then a phrase's last note drops off | 1-2.5 semitones | more often | less |
| Vibrato | on held notes, in late (the synth; the voices have their own) | 18-40 cents | | |
| Sharp | pushed top notes a hair sharp | 2-14 cents | barely | more |
| Breath in | before a phrase after a rest of half a second | a quarter second | | |
| Late end | a phrase's last word a touch late and softer | 10-30 ms | | |

Each by chance (scoops, falls), so it never becomes a pattern.

## By the singer
Each voice has its own amounts (the synth uses the song's genre):
- **Pop:** clean and quick, small scoops, few falls
- **Rock:** scoops, medium everything
- **Hard rock, Metal, Alt metal:** hard starts (short swells), short ends, sharper pushed notes
- **Grunge, Big & dark:** slow glides, deep scoops, long fades, many falls, last words late
- **Funk:** tight: quick glides, swells and fades
- **Cornell:** slides and scoops, wide vibrato, sharp pushed notes
- **Woman, Dark & nasal, Clean & scream, Clear:** in between

## How
- Sung voices: each note told how to start and end (scoop, swell, fade, fall, sharp, its glide time); the
  FOF singer and the clear voice do it (`src/audio/fof.ts`, `src/audio/sing.ts`; notes without these as
  before). The breath in is mixed into the line's lead-in.
- Synth: each note glides from the one before (when joined) or scoops in, swells in and fades out, vibrato and
  sharpness and the fall in cents, a breath of filtered noise before a phrase.

## Next
- Paul listens, per singer; numbers tuned by ear.
