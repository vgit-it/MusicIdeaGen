# Verse melody writer: sections and variety (experiment)

The verse melody card (`src/verse/`) writes a verse and now a chorus, one rule at a time. Goal: great songs that don't sound alike.

## How it fits together
- `profile.ts`: **dials**, every number the rules roll against (phrase lengths, runs, holds, endings, lift...). `VERSE` is the verse as it always was.
- `personality.ts`: a song's **personality**, drawn once from the song seed, tilted (never forced) by genre and mood. Each trait has its own random stream, so adding a trait later leaves the others alone. `dialsFor(kind, personality)` gives a section its dials.
- `section.ts`: an idea (a verse or chorus of the track) to the writer's input; shared by the card and the check.
- `build.ts`: the rule pipeline per leaf of the form (A A' ...).

## Variety rules (keep these true)
- Nothing is fixed: every trait is a weighted menu, and "none" (plain endings, level choruses) is a real option.
- A chorus ends phrases in one of: held, open (3rd/5th), hang (off the chord), punch (short), sync (early, off the beat), plain. A held ending is never required.
- Hooks: chant, anthem, leap, push. Chorus height: +5, +3, level, -2.
- `npm run verse-variety` writes ~224 real songs and prints how each trait spreads. Anything marked `!!` has one value winning too often: retune the weights in `personality.ts`. Also counts near-duplicate choruses.

## Choruses
- Choruses with the same chords, energy and settings are one hook: the first one's melody and words are used by all.
- The chorus's second half answers the first (how much: drawn per song).

## Next
Pre-chorus (climb / stall / stop / call / none), verse 2 answering verse 1, a lifted last chorus, bridge, outro.
