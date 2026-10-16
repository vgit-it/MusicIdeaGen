# Patterns: a library of real vocal rhythms and shapes

Option 2 from `docs/STUDY-LAKH.md`, on top of `docs/REALISM.md`. A **Patterns** switch in the vocal row and in the Guide line card (Both writers). Off by default; off, everything is exactly as before (checked: vocals, backing and notes byte for byte against the last commit, `npm run melody-lab` identical, `npm run guide-check` all 168 songs the same).

## The library (`src/realism/patterns.json`, 32 KB)
- Mined from the Lakh MIDI collection's vocal lines on a tight grid: 1,159 songs.
- **Kept only when found in 25+ songs by 15+ different artists.** So no pattern is any one song's.
- **243 one-bar rhythms:** where the notes start in the bar (16ths), whether a note is held into the bar, whether a phrase ends in it.
- **584 note shapes of 4-6 notes:** scale steps between the notes, where the first note starts (beat 1/3, beat 2/4, offbeat 8th, in-between 16th), and what it is against the band (root, 3rd, 5th, another chord note, none).
- Counts per genre with each. Thin genres borrow a little from all.
- No melodies, no lyrics, nothing longer than 6 notes, no pitches (steps only).
- Rebuild: `npm run realism-patterns` (needs `experiments/MidiCollection`).

## What the switch does
- **Vocal writers (all three, Classic / Shaped / Melody first):**
  - Rhythm (Classic and Grid; 4/4): each line's bars are real common rhythms, by genre, busier or sparer with the line. Words first keeps its own rhythm (its words set it).
  - Shapes: now and then a real 4-6 note shape is laid on the tune, starting where the note starts in the bar and on the same kind of note against the chord. It prefers shapes that land near where the line was heading, so the writer's line stays. Lines that come back get the same shapes. Never the line's last note, a wail or a colour note.
  - Then fitting to the band (`src/parts/fit.ts`) settles clashes, but a shape's short notes are marked and moved only off a real clash (the bass, a borrowed chord), as passing notes are. Before, fitting undid about a quarter of the shapes' steps, and half of them never reached the sung line.
  - **Leaning to what the writers lack** (`src/realism/lean.json`, `npm run realism-lean`): the app's own lines (Patterns off, 336 songs, every writer) measured against the library. A pattern real songs sing more often than the app is picked more (up to 4x), the plain ones the app already sings less (down to 0.2x). Up: late entries (on the "&" of 3), notes held over the bar line, runs of offbeat 8ths, repeated notes off the beat stepping down. Down: plain downbeat bars (1 and 3), zig-zag shapes on the 1. Rebuild it after a writer changes.
- **Anchor line** (`src/guide/anchor.ts`), with its own lean (`anchorRhythm`, `anchorShape` in `lean.json`: the Anchor line measured apart, Patterns off, plain and with its switches on; it lacks notes held over the bar line, offbeat runs, steps down from an offbeat, and has too many one-note bars on the 1):
  - Rhythm cells: about 70% from the library (was half), leaning to what it lacks; bars a note is held into now used too (the last note held over the bar line as the cell repeats).
  - Accents: half the phrases' accents a common real shape from the main note instead of one of the classic figures (not the chorus hook, not the song's last phrase).
  - Words on the main note: now and then a run of them a common real shape (4-6 notes, 4/4), ending back near the main note, so most words still sit on it.
  - Kept: Real songs' walk, Less one-note and a clash settling on the chord leave these notes be; a real shape's long last note isn't restarted a step above or below.
- **Guide line** (the default writer, `src/guide/line.ts`): its main notes timed and shaped by real vocal lines' slow line (below). Its quick notes, pushes and pulls are left as they were.

## The Guide line: a slow-line library (`src/realism/skeleton.json`, 14 KB)
The library above is per syllable; the Guide line moves about a note a bar with quick notes on top. So it gets a library of its own, from the same 1,159 on-grid songs:
- **Each real vocal line reduced to its slow line** (`src/realism/skeleton.ts`): the notes held a beat or longer and the notes on beats 1 and 3; the quick ones between left out (about a third of the notes stay). The same note sung on straight after itself is one note.
- **220 2-bar timings:** where the slow line's notes change, in 8ths: on the beat, on the "&" before it, held over the bar line, a rest.
- **117 shapes of 4-5 notes:** scale steps between the slow line's notes, with what the first is against the chord (root, 3rd, 5th, another chord note, none).
- Kept only when found in 25+ songs by 15+ artists. Counts only, no melodies. Covers 30% of real songs' own 2-bar timings, 40% of their 4-note slow-line shapes. Rebuild: `npm run skeleton-patterns`.
- **The lean** (`src/realism/skeleton-lean.json`, `npm run skeleton-lean`): the Guide line's own slow line (Patterns off, 112 lines, plain and with its switches on) against the library, as for the vocal writers: (real share / the line's share)^0.6, 0.2x-4x. It lacks: notes coming in on the "&" before the bar, pickups, a short note then space, shapes moving by 3rds. It has too many: steady half-bar changes, plain step-step-step shapes.
- **With Patterns on:**
  - Timing (4/4): every 2 bars a real timing, by genre and the lean, near the line's own pace (about as many notes), and not resting much more than the line does (real slow lines leave gaps where the singer has only quick words; the Guide line sings on there). A note on the "&" comes in an 8th early, the note before ending there. Not in the song's last 4 bars (it heads home), not in a repeated verse or chorus (sung like the first).
  - Path: from most notes, a real shape (85%), one starting on the same kind of note against the chord, as long as the notes the timing has before its next rest, its notes in the voice, no clash on a strong beat or a long note, moving by a step or a 3rd (bigger only after a pause, as ever), ending near the section's height, stepping back after a leap.
  - Kept: every Guide line rule (a note held at most a bar, at most 4 bars without a pause, 4 changes a second, the quick-note rules, home at the end); `npm run guide-check` checks them with Patterns on, plain, all on, a range and a key of its own.

## The copy guard (`src/realism/guard.json`)
- Fingerprints (onsets + steps) of every real 2-bar stretch with 5+ notes on 3+ pitches that fewer than 5 songs or 3 artists share: 88,753 of them, stored as a Bloom filter (hashes, about 0.1% false alarms; no notes can be read back).
- With Patterns on: a tune that matches is written again; the finished line is checked once more and a light syllable moved a step if it still matches. The Guide card's lines are rewritten too.
- Result (8 songs per genre, every writer): **0 finished lines copy a real 2-bar stretch** (checked against the exact fingerprints, kept locally). With the switch off, Words + Melody first had 3 in 42 songs.
- Cost: the guard adds about 210 KB to the app (about 160 KB zipped). Could be loaded only when Patterns is on, later.

## Stronger (shape notes protected, the lean): before → after (`PAT=both`, 8 songs per genre)
"Lacking": the patterns the writers sing less than real songs (lean 1.5x or more), share of bars and of 4-note shapes.

| Writer | Realism | Lacking rhythms | Lacking shapes | Shapes in library |
|---|---|---|---|---|
| Classic | 82 → 83 | 8 → 33% | 12 → 24% | 26 → 44% |
| Grid | 80 → 82 | 5 → 31% | 9 → 24% | 22 → 44% |
| Words | 83 → 85 | 4 → 4% | 13 → 29% | 28 → 50% |
| Shaped | 82 → 82 | 7 → 30% | 11 → 21% | 28 → 45% |
| Melody first | 81 → 83 | 9 → 29% | 8 → 18% | 18 → 35% |
| Words + Melody first | 85 → 86 | 6 → 5% | 11 → 23% | 24 → 42% |

- Copy guard: still 0 finished lines copying a real 2-bar stretch. Switch off: unchanged.
- Shapes in the library now a little over real songs' 39%. Words first still keeps its own rhythms.

### Anchor line (`PAT=both`, 8 songs per genre; lacking: by its own lean)
| | Realism | Lacking rhythms | Lacking shapes |
|---|---|---|---|
| Anchor line | 75 → 78 | 2 → 16% | 4 → 17% |
| Anchor line, all switches on | 74 → 75 | 3 → 11% | 9 → 13% |

- Weaker with its switches on: Song arc keeps choruses plainer, Hook repeats a section's phrases.

## First version: before → after (`npm run realism-lab`, `PAT=both`, 8 songs per genre, 4/4)
"Shapes": the app's 4-note shapes that are common real ones. "Rhythms": bars with a common real rhythm. Real songs: 39% and 60%.

| Writer | Realism | Shapes | Rhythms |
|---|---|---|---|
| Classic | 82 → 82 | 26 → 35% | 66 → 76% |
| Grid | 80 → 82 | 22 → 39% | 69 → 84% |
| Words | 83 → 83 | 28 → 43% | 46 → 46% |
| Shaped | 82 → 82 | 28 → 38% | 64 → 77% |
| Grid + Shaped | 80 → 81 | 29 → 38% | 68 → 85% |
| Words + Shaped | 83 → 83 | 32 → 44% | 46 → 46% |
| Melody first | 81 → 83 | 18 → 32% | 62 → 72% |
| Grid + Melody first | 81 → 82 | 17 → 31% | 67 → 78% |
| Words + Melody first | 85 → 86 | 24 → 37% | 43 → 42% |
| Anchor line | 75 → 75 | 77 → 82% | 52 → 66% |

- The realism score (overall spreads, option 1's measure) barely moves: Patterns change which figures and rhythms are sung, not the overall numbers. Real songs' own shape share (39%) is now matched.
- Rhythms overshoot real songs (60%): real singers vary their bars more. If the lines sound too regular, use the library on fewer lines.
- The app keeps sung syllables on 8ths (Paul's rule), so the library's 16th rhythms mostly don't come through.

## The Guide line: before → after (`MODE=guide PAT=both N=8 npm run realism-lab`, 4/4)
"Lacking": the slow-line patterns the Guide line sings less than real songs (lean 1.5x or more), share of its 2-bar timings and 4-note slow-line shapes.

| | Realism | Timings in library | Shapes in library | Lacking timings | Lacking shapes |
|---|---|---|---|---|---|
| Guide line | 76 → 77 | 40 → 60% | 46 → 64% | 0 → 37% | 2 → 6% |
| Guide line, all on | 75 → 76 | 41 → 51% | 46 → 56% | 2 → 32% | 2 → 5% |
| Real songs | | 30% | 40% | about 19% | about 7% |

- Copy guard: 0 lines copying a real 2-bar stretch (checked against the exact fingerprints). Switch off: all 168 guide-check songs note for note the same.
- It sings a little more often (1.19 notes a bar, was 1.10) and rests more: sung 71% of the time, was 91%.
- Timings overshoot real songs (37% against about 19%), as the vocal rhythms did: if it sounds too regular, soften the lean (`POW`, `MAX` in `scripts/study/skeleton-app.ts`).

## For Paul: what to listen for
- **Guide line:** Patterns on in the Guide card (the default writer). Listen for notes coming in a little early (on the "&" before the beat), a short note then a breath, the line moving by real turns (a step down and back up, down by 3rds) instead of wandering a step at a time. It now rests more: tell me if it breathes too much.
- **Patterns: On** in the vocal row (any Melody). Compare the same idea Off/On: the band stays the same.
- Rhythm: lines that sound more like sung phrases you know: common pickups, a note held over the bar line, phrases ending on the 1 or the 3.
- Shapes: short familiar turns, like up-a-step-and-back, a run down to the root, a repeated note then a step, instead of the writer's own wandering.
- Anchor line: Patterns on in the Guide card; listen for notes held over the bar line, offbeat runs, words stepping down off the main note and back.
- Listen for late entries, notes held over the bar line, offbeat runs, repeated notes stepping down. Tell me if it now sounds too off-beat or too samey: the lean (`POW`, `MAX` in `scripts/study/patterns-app.ts`) can be softened.

## Files
`scripts/study/lakh-songs.ts` (song reader, shared with the targets), `scripts/study/lakh-patterns.ts` (miner), `src/realism/patterns.ts` (library, keys, guard), `src/parts/melody.ts` (`patternRhythm`, `applyShapes`), `src/parts/vocal.ts` (guard, `breakCopies`), `src/parts/fit.ts` (shape notes kept), `scripts/study/patterns-app.ts` and `src/realism/lean.json` (the lean), `src/guide/anchor.ts` (library cells), `src/guide/real.ts` (guard for the Guide card), `scripts/study/lakh-skeleton.ts` and `src/realism/skeleton.ts` / `skeleton.json` (the slow-line library), `scripts/study/skeleton-app.ts` and `src/realism/skeleton-lean.json` (its lean), `src/guide/line.ts` (`planAt`, the shapes).
