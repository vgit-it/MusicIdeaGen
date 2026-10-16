# Real songs: the vocal writers against real vocal lines

Option 1 from `docs/STUDY-LAKH.md`. Three parts:

1. **A realism lab** that scores the app's vocal lines against real songs of the same genre.
2. **A "Real songs" switch** in the vocal row that leans the writers toward those numbers. Off by default; with it off, the output is exactly as before.
3. **The same switch for the Guide line and the Anchor line** (Guide line card, Both writers). See below.

## The targets
- `src/realism/targets.json`: 5,353 real vocal lines (2,548 before the vocal tracks with odd names were found, `docs/STUDY-LAKH.md`) from the Lakh MIDI collection, measured per genre and per genre + major/minor (artists tagged by hand), with the middle half of songs (p25-p75) for the per-song figures. 28 KB, **numbers only**: no notes, phrases or lyrics. It ships with the app now (the Guide card scores against it).
- Rebuild: `npm run realism-targets` (needs `experiments/MidiCollection`, git-ignored; about 40 seconds).
- Thin genres: alt metal 16 songs, funk 51 (with funk-leaning pop). Treat those two as rough.

## The lab
`npm run realism-lab`. Options: `N=8` songs per genre, `MODE=shaped` one writer, `REAL=both` before and after, `DETAIL=1` every spread.

- Measures, the same code for real and app lines (`src/realism/measure.ts`): same note / steps / thirds / leaps, after a leap, where notes start in the beat, phrase lengths and spans, where the phrase peaks, phrase end notes, notes on the band's notes (all, and on beats 1 and 3), range, 2-bar repeats.
- **Realism score:** 100 minus the average gap across those measures. 100 = the same spreads as real songs.
- App "band notes" = the chord's notes plus the bass. Real songs count every note the band plays, which makes the real share a little high.

## What the switch does (`src/parts/realism.ts`, per genre)
- The same note again more often. Now and then the note after a leap repeats instead of stepping back.
- Strong notes sometimes off the chord, on a note that doesn't clash: the note before held over the new chord, or the note next to it. More in metal, grunge and alt metal, less in pop.
- Open lines now and then end on a 2nd, 4th or 6th. More lines end on the root.
- Lines peak early more often. Wails sometimes on the line's first held note.
- A slightly narrower range and chorus lift (metal most).

## Before → after (8 songs per genre, all 4/4)
| Writer | Realism | Same note | Strong beats on chord | Peak early |
|---|---|---|---|---|
| Classic | 82 → 85 | 28 → 32% | 86 → 70% | 42 → 49% |
| Grid | 80 → 84 | 28 → 31% | 85 → 72% | 45 → 47% |
| Words | 83 → 87 | 31 → 35% | 86 → 69% | 46 → 49% |
| Shaped | 82 → 87 | 25 → 29% | 89 → 66% | 48 → 53% |
| Grid + Shaped | 80 → 85 | 29 → 32% | 89 → 69% | 48 → 54% |
| Words + Shaped | 83 → 88 | 29 → 31% | 89 → 70% | 50 → 53% |
| Melody first | 81 → 84 | 18 → 21% | 72 → 65% | 47 → 47% |
| Grid + Melody first | 81 → 83 | 18 → 22% | 75 → 67% | 47 → 52% |
| Words + Melody first | 85 → 86 | 22 → 25% | 73 → 68% | 52 → 53% |
| **Real songs** | | **30%** | **67%** | **59%** |

Heavy genres, strong beats on chord notes (Shaped): metal 93 → 54%, grunge 76 → 51%, alt metal 86 → 54%, hard rock 92 → 60% (real 44–56%).

## Still off
- **Range:** the app spans about 14 semitones a song, real songs 12 (metal 8). The climax note, wails and the chorus lift keep it wide. Would need changes to the song shape, not just weights.
- **Melody first** still repeats notes less (21% vs 30%). Something later in its chain moves repeats away.
- **Peaks** still late-ish (about 50% early vs 59%).
- **Rhythm** isn't touched: the app almost never starts a note on the "e" or "a" of a beat (real: 20%). That's for the pattern library (option 2).

## Guide line and Anchor line (`src/guide/real.ts`)
Their gaps differ from the melody writers', some in the other direction (they already sit on chord notes about as often as real songs), so a fixed push doesn't work. Instead:

- **8 tries, the nearest to real songs kept.** Scored on the words as sung, against real songs of the genre (major or minor where there are 20+ songs). A per-song figure inside the middle half of real songs costs nothing, so songs still differ. With Best of several on too, its score is weighed in.
- **Guide line:** a repeated verse or chorus keeps the first one's quick notes, pushes and pulls (they were rolled fresh each time, so nothing ever repeated); no notes changed in repeats; phrases at most 2 bars, pauses at phrase ends more likely; the same note a little more often.
- **Anchor line, pulled all the way (Paul):** the words on the main note walk around it by step (the same note again about a third of the time, a chord note on the beats where a move allows); a rest in a rhythm pattern now and then held on instead.
- Off: exactly as before. `npm run guide-check`: all 168 songs the same, and the rules kept with the switch on (5 combinations added).

| Guide card | Realism | Same note | Strong beats on chord | 2-bar repeats | Range |
|---|---|---|---|---|---|
| Guide line (quick notes Some) | 76 → 81 | 17 → 21% | 60 → 63% | 1 → 54% | 16 → 14 |
| Guide line, all ideas on | 75 → 82 | 17 → 19% | 60 → 62% | 2 → 51% | 15 → 14 |
| Anchor line | 75 → 83 | 69 → 33% | 59 → 65% | 59 → 55% | 12 → 12 |
| Anchor line, everything on | 74 → 79 | 40 → 35% | 52 → 56% | 22 → 25% | 19 → 17 |
| **Real songs** | | **30%** | **67%** | **48%** | **12** |

Still off: the Guide line's same note (its quick notes step away and back), the Anchor line with Song arc on is too wide (its climax note).

## 16ths with the Classic rhythm (`realSixteenths` in `src/parts/vocal.ts`)
- Paul: does Classic + Learned + Real songs + Patterns stop notes landing on 16ths? It did: the Classic rhythm's 8th rule (Paul's "at the 1/8th at most") moved nearly every 16th onto an 8th, about 1% of syllables left on one (none in fast songs); Learned only picks pitches, Real songs didn't touch the rhythm. Real singers: about 17% (the 16th before a beat or an 8th about 11-15%, the one after a beat 6-11%, by genre, `targets.json`).
- Now, with Real songs on and the Classic rhythm, each section's tune gets its genre's real share: light syllables on the & are moved a 16th the way singers phrase it:
  - a dotted pickup: an 8th pair into a beat sung dotted 8th + 16th (the light one just before the beat);
  - a push: a stressed word on the & ahead of an empty beat sung a 16th later, just ahead of it;
  - a snap: the beat's syllable a quick 16th, the light one after it longer.
- Never two 16ths in a row (no quick runs: Paul's 8th rule kept for those), never a held high note or a real shape's note, never a line's first note.
- Grid (metronome grid by design) and Words (its own 16ths) are unchanged; Real songs off: unchanged.

| Classic rhythm, Real songs on (112 songs each) | Before | After |
|---|---|---|
| Classic melody | 1.0% | 18.1% |
| Learned | 1.1% | 17.1% |
| Learned + Patterns | 3.5% | 12.9% (Patterns' own real bars are kept as they are) |
| Shaped / Melody first | about 1% | 18.0% / 17.4% |

- No syllables added or left out (only moved); quick runs (two 16ths in a row) no more than before.

## Next
- Paul listens: switch on vs off, per genre.
- Then option 2 (pattern library), scored with this lab.
