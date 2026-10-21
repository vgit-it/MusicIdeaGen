# Verse vs chorus: what real songs do

Option 3 of `docs/STUDY-LAKH.md`. Behind the **Real songs** switch (vocal row), and in the Guide card when **Song arc** and **Real songs** are both on (Anchor line).

## How it's measured (`npm run realism-arc`, `scripts/study/lakh-sections.ts`)
- Lakh songs with their words (karaoke text or lyric events): 353, of which 308 have enough of both.
- A line of words sung again (2+ times, next to another such line) is the **chorus**. A line sung once is the **verse**. Stricter (runs of 3+) gives the same answers.
- The chorus's notes against the verse's in the same song. Only numbers are kept (`src/realism/arc.json`). The words are compared, never stored.

## What real songs do (308 songs, medians, with the middle half)
| | Chorus vs verse |
|---|---|
| Height (average note) | **+0.7 semitones** (a quarter of songs −0.4 or lower, a quarter +2.1 or higher) |
| Top note | the same (a quarter: +2 or more) |
| Notes a beat | ×0.95 (a quarter ×0.81 or sparser) |
| Note length | ×1.06 (rock ×1.16) |
| Higher at all | 52% of songs; busier 29%, sparser 52% |
| The song's top note in a chorus | 50%; in the **last** chorus 22% (about chance) |
| Last chorus vs first | about the same (+0.1 semitones) |

- Choruses are only a touch higher, sparser and longer than verses, and it varies a lot from song to song. Most of a chorus's lift in real records must come from the band, the voice's power and the production, not from the tune.
- "Choruses bigger each time" and "the top note saved for the last chorus" aren't in the melodies.

## The app before
| | Chorus above the verse | Notes a beat | Note length |
|---|---|---|---|
| Real songs | +0.7 | ×0.94 | ×1.06 |
| Classic | +6.6 | ×0.89 | ×1.16 |
| Shaped | +5.9 | ×0.90 | ×1.14 |
| Melody first | +5.6 | ×0.93 | ×1.12 |
| Words | +6.2 | ×0.81 | ×1.35 |
| Anchor line, all switches | +14.4 | ×0.87 | ×1.19 |

## What the switch does now
- Each song draws its own chorus from the real spread (`src/realism/arc.ts`, by genre; thin genres lean on all songs): how much higher, how busy, how long the notes. The top note is saved for the last chorus in about a fifth of songs.
- **Vocal writers** (Real songs on): the chorus's lift and pace set from the draw; Shaped and Melody first no longer widen the chorus's range.
- **Anchor line** (Song arc + Real songs): the chorus sung from the verse's height, plus the draw; pace and held notes from the draw; the climax only in songs that draw it.

## After (`npm run realism-lab`, `REAL=both`, 6 songs per genre)
| | Chorus above the verse | Notes a beat | Realism |
|---|---|---|---|
| Classic | 6.6 → 2.1 | ×0.89 → ×1.00 | 82 → 86 |
| Shaped | 5.9 → 2.9 | ×0.90 → ×0.96 | 81 → 86 |
| Melody first | 5.6 → 3.5 | ×0.93 → ×1.01 | 80 → 83 |
| Words | 6.2 → 2.4 | ×0.81 → ×0.87 | 83 → 87 |
| Anchor line, all switches | 14.4 → 1.8 | ×0.87 → ×1.00 | 73 → 83 |

Realism includes the rest of the Real songs switch. With the switch off, nothing changes.

## For Paul
- Listen for choruses that sit near the verse, carried by the band, instead of jumping up. If choruses feel flat, this is the dial: the app's own lift is a choice, not a mistake.
- The Guide line's own heights (verses low, choruses lifted) are about 9 semitones apart and unchanged here.

## Files
`scripts/study/lakh-sections.ts` (study), `scripts/study/lakh-songs.ts` (now reads the words), `src/realism/arc.json`, `src/realism/arc.ts`, `src/parts/vocal.ts`, `src/parts/melody.ts` (`planBusy`, chorus range), `src/guide/anchor.ts` (Song arc), `scripts/realism-lab.ts` (chorus vs verse line).
