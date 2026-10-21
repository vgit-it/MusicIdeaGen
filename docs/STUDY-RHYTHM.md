# Study: rhythm guitar in the Lakh MIDI collection vs what the app generates (2026-10-16)

Goal (Paul): study the rhythm guitar parts in the song collection and set them beside what the app makes: what's there, what's missing. A study only; nothing in the app has changed.

## How it was measured
- **Real side:** 10,265 songs (one version each, 4/4) from `experiments/MidiCollection`. 5,346 have a guitar part with 20+ chords/notes (guitar sounds, or a track named guitar/rhythm/strum...). Per song the **main rhythm part** is the guitar track with the most chord hits (lead-named tracks skipped); the other guitar tracks are the "second guitars". Hand-tagged genres: pop 220, rock 554, hard rock 196, grunge 124, metal 129, funk 29 (too few to trust); 4,094 untagged songs are in "all" only.
- **App side:** 420 songs (60 per genre, 7 genres, default settings, random band) built as tracks and exported with the app's own MIDI export, so the guitar's timing, spread and loudness are included. **Measured by the same code**, so both sides are counted the same way.
- A "hit" = notes struck together (a strum's 10-15 ms spread counts as one). Bars are counted from the file's start, in 16ths.
- Scripts (numbers only, no song content kept except which of the 16 slots in a bar are struck): `scripts/study/rhythm-measure.cjs`, `rhythm-report.cjs`, `rhythm-report2.cjs`, `rhythm-app.ts` (`npm run rhythm-study`). Run: see the top of each file.

## What the app already has (from `docs/RHYTHM.md`)
Five strumming players (strummer, rocker, punk, funky, indie) and four riff players (chugger, heavy, grunge, groove): accents, voicings (open, power, small triads up the neck, sus/add9, capo, drones), developing strum bar to bar, picked quiet parts, licks between chords, pushes, palm mutes, chucks, strum spread, timing drift, band lock, softer under the singer and solos.

## What matches real songs (good)
- **Hits per bar:** median 5.7 real, 6.0 app; pop/rock/hard rock within 0.5.
- **The common 1-bar rhythms:** the 46 rhythms found in 40+ real songs hold 66% of real bars; the app plays 89% of those bars' worth. The top ones (one hit a bar, straight 8ths, 8ths with a push, backbeat, quarters-and-8ths) all appear.
- **Hits on the "&" of a beat:** 33% real, 38% app. **Bars with a hit on the "and" of 4 (a push into the next bar):** 52% real, 60% app.
- **Strum spread** where real files have it: 15 ms real, 16 ms app. Down/up on the 8th slots: 73% down real, 81-96% app (close).
- **Density moving between 8-bar sections:** 45% real, 52% app.
- **Rests in a bar where the hand stops** ("stop bars"): 11% real, 6% app (a little low).

## What's missing or off, by how clear the evidence is
### 1. The guitar always plays (clearest gap)
| | real | app |
|---|---|---|
| silent bars inside the part | 16% (pop 23%, funk 24%) | 2% |
| guitar silent for the first 4 bars | 42% (pop 55%, funk 48%, rock 31%) | 0% |
| songs that sit out 4+ bars somewhere in the middle | 44% (pop 60%, funk 62%, metal 47%) | 0% |
Real songs let the guitar enter late, drop out of a verse or a bridge, and come back. The app's rhythm guitar plays every bar of every section from bar 1 (only the layers piano/pad/strings/perc have an in/out plan, `layerplan.ts`).

### 2. One kind of strum: 8ths
Main part by kind:
| | real | app pop | app rock | app funk |
|---|---|---|---|---|
| sustained chords (1-2 hits a bar) | 9% | 0% | 0% | 0% |
| quarters (3-5 hits) | 17% | 30% | 17% | 2% |
| 8ths strum | 26% | **70%** | **83%** | **87%** |
| 16ths strum (8+ hits, 20%+ on 16ths) | 12% | 0% | 0% | 12% |
| picked | 8% | 0% | 0% | 0% |
| chug/riff | 11% | 0% | 0% | 0% |
- Pop and rock strummers are almost always an 8th-note strum. Real songs also have held chords, quarter-note strums, 16th strums (10-13% in pop, rock, hard rock, grunge), picked parts.
- Hits on the 16th "e/a" slots: pop 21% real vs 9% app, rock 14% vs 3%.
- Rhythms real songs have often that the app almost never plays: 16th pushes before every beat (`x..x x..x x..x x..x`, 102 songs, the biggest single one), `xx.x xx.x...`, dense 16ths with a rest (`.xxx xxxx...`), a single stab on beat 2 or "and of 3" (`.... x... ..x. ....`), quarters with a 16th push (`x... x... x... x..x`).

### 3. A second guitar that doubles or complements, not only a lead line
- Real: 63% of songs have 2+ guitar parts, 34% have 3+ (hard rock 65%, metal 59%). Of the extra parts: **29% are a second chord part** (same register, 30% of those hit exactly with the main one: a double), 21% picked/arpeggio, 24% chug/riff doubles, 14% a single-note line, 11% named lead (a full octave above). 27% of songs have acoustic and electric together.
- App: Guitar 2 is a lead/octave/arpeggio part, always about 17-19 semitones above the rhythm guitar, a second chord part only 3% of the time. Always exactly two parts. No acoustic + electric together (a track keeps one sound for the rhythm part).

### 4. Chord changes land on the bar line too much
- First hit of a new chord on beat 1: **31% real, 63% app** (rock 36% vs 85%, hard rock 25% vs 78%). Mid-bar changes on beats 2-4: 26% vs 16%. Pushed an 8th early: 21% vs 16%.
- Chord changes per bar the guitar plays: hard rock 1.2, grunge 1.4, metal 1.3 real, but 0.5, 0.9, 0.4 in the app. Real heavy guitar moves on the chords more (partly passing chords and riff movement in the files).

### 5. Hard rock and metal: chords more than riffs
- Main part is chords (not single notes): hard rock 57% real vs 13% app; metal 51% vs 25%. Single-note hits: 43%/49% real vs 66%/67% app.
- App metal is busier: 9.4 hits a bar vs 6.3, 28% of bars with 13+ hits vs 9%, 34% of hits on 16th e/a slots vs 20%.

### 6. Shuffle and triplet feel
10% of real songs have 25%+ of their hits on triplet slots (grunge 19%, rock 9%, funk 7%): shuffles and 12/8 ballads. App: 0% (triplet hits 1%). No shuffle strum.

### 7. Licks between chords almost never happen
- Real: 20% of songs have bars of single-note licks inside a chord part (5% of bars). They're spread evenly across the four bars of a phrase (bar 4: 24%), **not** saved for the phrase end.
- App: 0% of pop songs, 2% of rock, hard rock and grunge (funk 77%, metal 35%, where the riff players' fills are). The doc says "at the end of a four-bar phrase, only where the lead and drums leave room": it's too tight, and the placement isn't what real parts do.

### 8. Less bar-to-bar variation than the app has (care: sequenced data)
- Bar identical to the one before: real **36-38%** at every place in the 4-bar phrase; app 9% (bar 1) and 12% (bar 4), 29-31% (bars 2, 3). The most common pattern covers 43% of real bars, 27% of app bars.
- Real transcriptions are mostly loops, and real players vary more than a sequenced file shows (this data can't see small changes). But the app's "bar 4 turns the phrase round" isn't in the data at all: real bar 4 repeats bar 3 as often as bar 2 repeats bar 1. Worth a "locked loop" player that repeats exactly, and more repeats overall.

### 9. Other, smaller
- **Chord length:** real chords are cut short more: staccato 20%, half-length 27%, ringing 53%. App: ringing 78%, half-length 8% (pop and funk 0%). Only palm mutes and chucks are short today. (MIDI note lengths are notation, but a "lift off the chord" or half-length strum looks missing.)
- **Two-note chords** (thirds, sixths, octaves: not just fifths): 14% of real hits, 3% app (pop 15% vs 10% is close; rock 13% vs 4%).
- **Power chords:** rock 13% of real hits vs 61% app (rocker/punk). Hard rock 22% vs 30%, grunge 42% vs 56%, metal 27% vs 33% (close). The app's rock is too power-chord heavy compared to the tagged rock songs (Beatles, Queen, U2, Green Day...), which mostly play triads and dyads.
- **Instrument of the main part:** real rock 46% acoustic, pop 49% acoustic, funk 28% GM "muted guitar" (a damped clean tone, also 12% of pop); hard rock 42% distortion; metal 54%. App Auto: rock = crunch (acoustic in soft sections only), pop = acoustic, funk = clean. No "muted/damped clean" funk tone.
- **Tempo** (the band, not the guitar): grunge 120 real vs 78 app; rock 120 vs 136; metal 120 vs 137.

## What this data can't tell us (caveats)
- **Dynamics:** real velocities are flat (23% of songs constant; accented beats 1.0x off-beats). The files are mostly sequenced, so accents, ghost strokes, and the strum feel can't be checked. The app's accents (1.2-1.4x) rest on the guitar-teaching research in `RHYTHM.md`.
- **Voicing:** MIDI guitars are simplified (median 3 notes, 5-7 semitone span); real strums hit 4-6 strings. Chord size, span and register are not compared (the app is fuller and lower).
- **Strings, fingerings, hammer-ons, slides, palm mutes, capo, up/down strokes:** not in the files. Strum direction only where a file has spread (40% of chord hits).
- **Timing feel:** 80% of real hits are on the 16th grid; the rest are hand-played. A swing/lilt can't be told from snapping.
- **Genre tags** are by artist (hand-picked), funk is 29 songs. App genres: altmetal has no real equivalent here.
- **Bar counting** starts at the file's first tick; songs with a pickup bar shift the phrase position (the lick-position and "bar of 4" figures).
- The app side is default settings with a random band, so every player kind and genre is mixed in as the app picks them.

## Built (2026-10-16): steps 1 and 2, each behind a switch in the Rhythm row (off by default)
- **Guitar plan** (`src/players/presence.ts`, track option `guitarPlan`, Rhythm row: "Guitar plan: Real songs"): each song gives its rhythm guitarist a role: plays all the way through, held back at the start (in from the chorus), sits out the first verse, or drops out for the bridge and the quiet parts. By genre (pop leans to the held-back roles, rock to steady). Each section then plays in full, sits out, comes in halfway (on a strum) or drops out halfway (the chord choked). Never out where Guitar 2 isn't playing, never out of a chorus, pre-chorus, solo or outro; a riff genre's long intro can have the riff come in halfway.
- **Strum mix** (`MIX` in `src/parts/strum.ts`, idea option `strumMix`, Rhythm row: "Strum mix: Real"): the pattern library widened with the real rhythms (held chords, quarters with a 16th push, backbeat chops, stabs, 8ths in 8 shapes, 16th pushes before every beat, steady and ghosted 16ths), weighted by the real shares per genre. A second-half lift picks a pattern of about the same busyness.
- **Measured the same way** (420 songs, both switches on; `GUITAR_PLAN=1 STRUM_MIX=1 npm run rhythm-study`):
| | real | app before | app now |
|---|---|---|---|
| guitar silent in the first 4 bars (pop / rock / hard rock / metal) | 55 / 31 / 34 / 33% | 0 / 0 / 0 / 0% | 55 / 32 / 7 / 10% |
| songs that sit out 4+ bars in the middle (all) | 44% | 0% | 42% |
| silent bars inside the part (all / pop) | 16 / 23% | 2 / 1% | 7 / 8% |
| pop: bars with 9+ hits | 17% | 5% | 16% |
| pop: hits on 16th e/a slots | 21% | 8% | 12% |
| rock: bars with 13+ hits | 4% | 0% | 6% |
- Still short: held-chord bars (1-2 hits: real 19% in pop, app now 13%; the biggest sections still strike every beat), silent bars inside the part (7% vs 16%: the plan only silences where Guitar 2 plays), hard rock, grunge and metal intros (7-10% vs 27-34%). Next: listen, then tune.

## What plays when the guitar doesn't (`scripts/study/rhythm-cover.cjs`, 5,232 songs, 16% of bars have no guitar)
A chord instrument (piano, organ, strings, pad, synth, brass) plays in those bars: **pop 85%, funk 67%, rock 60%, hard rock 29%, grunge 24%, metal 6%** (intros 57% overall). By instrument, in the silent bars in the middle: pop piano 43%, strings 53%, pad 19%; rock piano 32%, strings 23%, organ 13%; funk strings 43%, piano 20%; hard rock piano 11%. Of songs that sit out 4+ bars: pop 84% are covered, rock 51%, hard rock 28%, grunge 15%, metal 2%. So in pop and rock the guitar sitting out means another instrument takes the chords; in heavy music it's often real silence (drums, bass and vocal).
**Built (Guitar plan, 2026-10-16):** the plan decides once per song if a cover plays (pop 85%, funk 65%, rock 60%, hard rock 30%, grunge 25%, metal 5%) and which: a piano, strings or a pad, by genre. Where the guitar sits out, that layer plays the chords, only there, even if you haven't added it (`idea.cover`, `idea.guitarOut`; `writeLayer` cover mode, the engine creates the instrument; MIDI export includes it). A layer you added also covers there, whatever its own plan says. With a cover playing, a section can be out even where Guitar 2 isn't.

## Suggested next steps, by size of gain
1. **Guitar presence plan** (like `layerplan.ts`): the rhythm guitar sits out the first verse or intro bars, drops out for a bridge or breakdown, enters in the pre-chorus or chorus; by genre (pop and funk most). Biggest gap, clear in the numbers.
2. **A wider strum mix by genre:** quarter-note strums, sustained/held chords, a 16th strum for pop/rock, more picked parts; add the missing rhythms (16th pushes before beats, single stabs, sparse hits). Real shares per genre are in `rhythm-report.cjs`'s output.
3. **A doubling player:** a second chord part (same register, same or complementary rhythm), acoustic + electric together, picked part under strummed, as Guitar 2's other role (alongside the lead).
4. **Shuffle / 12/8 strum feel** (triplet 8ths).
5. **Chord-change timing:** more mid-bar and anticipated changes; riff genres: chord movement.
6. **Loop-repeat player** and fewer bar-4 turnarounds; real licks anywhere in the phrase, not only at the end; wider conditions for a lick.
7. Hard rock / metal: more chordal parts (power-chord strums) and fewer riff chugs; metal less busy.
8. Smaller: half-length and cut chords, more dyad/double-stop parts, fewer power chords in rock, a damped clean tone for funk.

## Run it (the app's side: `GUITAR_PLAN=1 STRUM_MIX=1` turn the two switches on)
```
node scripts/study/rhythm-measure.cjs experiments/MidiCollection real.json     # ~20 s
OUT=app-midi N=60 npm run rhythm-study                                          # the app's songs as MIDI
node scripts/study/rhythm-measure.cjs app-midi app.json app
node scripts/study/rhythm-report.cjs real.json app.json                         # tables by genre
node scripts/study/rhythm-report2.cjs real.json app.json                        # parts, presence, second guitar, patterns
```
