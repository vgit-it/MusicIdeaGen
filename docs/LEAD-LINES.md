# Lead lines (switch)

From `docs/STUDY-LEAD.md`, items 1 and 2 (Paul: "longer lines with more steps"). A switch in the Guitar 2 row: **Lines: Off / On**. Off: exactly as before (checked: the same Guitar 2 and vocal note for note over 126 songs, 4/4, 6/8, 3/4). Kept with the idea and in shared links (`leadLines`).

## What it does (`src/parts/guitar2.ts`)
- **Whole lines in place of short answers.** Where the lead player answers the singer, it now often plays a line instead of a 3-note lick: about two bars at a phrase's end (6-9 beats), a bar and a bit halfway (4-6), by player (melodic and shredder 80%, raw 65%, bluesy 60%, funky 50%; the rest still play their licks). Short "licks answering the band" become lines half the time.
- **How a line goes** (`stepLine`): 8ths with some 16ths and the odd quarter, beat by beat (a shredder busier, a funk player choppier; funk notes stay clipped), ending on a held chord note (the root at the end of a section). The notes walk the key's full scale: a step about 60% of the time, back a step 9%, the same note 13%, a third 11%, a leap 5% (always stepped back from). Falling, arching, rising or waving; turning at the edges of the range; starting near the last note played. Strong beats and held notes move a step onto a chord note where they can; no held note rubs against the chord, nothing against the riff.
- **More steps in the melodies too:** Guitar 2's melodies, hooks and answers use the key's full scale (a step is a step, not a pentatonic gap), their shapes leaping rarely; the long two-bar phrase is picked three times as often, the short one-bar hook less.

## Before → after (280 app songs, same code as the study)
| | Off | On | Real songs |
|---|---|---|---|
| steps of 1-2 semitones | 22% | **33%** | 30% |
| leaps of a 4th-5th | 27% | **19%** | 17% |
| leaps of 6+ (octave-ish) | 12% | 7% | 12% |
| notes in phrases of 6+ notes | 51% | **71%** | 85% |
| bars that are a line (6+ notes) | 12% | 21% | 31% |
| notes a bar where it plays | 3.3 | 3.9 | 5.4 |
| lead notes while singing | 47% | 50% | 47% |
| in the key's pentatonic | 85% | 79% | 76% |

- Still short of real songs on line length: choruses' hooks and the solo are unchanged, and real leads play busier overall (5.4 notes a bar).
- Repeats went down a little (2-bar repeats 29% → 26%, real 45%): lines are new each time. Repeated figures are item 3 of the study.

## Measure
`LINES=1 REAL=0` with the study script (`docs/STUDY-LEAD.md`, Run) gives the app side with the switch on.

## Next
- Paul listens: Lines on vs off, per genre (rock and pop answers most).
- Then items 3-6 of the study (picked figures, heavy leads out of the verses, lead breaks in pop and funk, a second lead).
