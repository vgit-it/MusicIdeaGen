# Study: lead guitar in the Lakh MIDI collection vs what the app generates (2026-10-16)

Goal (Paul): study the lead guitar parts in the song collection and set them beside what the app makes. A study only; nothing in the app has changed.

## How it was measured
- **Real side:** 4,768 songs (one version each, 4/4) from `experiments/MidiCollection` with a singer's line (found as in `docs/STUDY-LAKH.md`). **1,967 have a lead guitar**: a guitar track that isn't the singer's line, plays one note at a time (a few double-stops allowed), sits above the rhythm register (middle note A3 or higher) and uses 7+ pitches. A track named lead or solo is taken first (179 songs), else the busiest such track. Hand-tagged genres: pop 245 songs, rock 409, hard rock 147, grunge 103, metal 60, alt metal 37, funk 80.
- **App side:** 280 songs (40 per genre, default settings, random band) built as tracks, exported with the app's own MIDI export (singer on) and read back by **the same code**. Guitar 2 is found by the same test, so both sides are counted the same way.
- The app's bends, slides and trills aren't in its MIDI export; they're counted straight from Guitar 2's notes.
- Scripts (numbers only, nothing of any song kept): `scripts/study/lead-study.ts`, `scripts/study/lead-report.cjs`. Run:
  ```
  npx rolldown scripts/study/lead-study.ts --platform node --format esm -o node_modules/.cache/lead-study.mjs && node node_modules/.cache/lead-study.mjs
  node scripts/study/lead-report.cjs lead-study.json
  ```
  Options: `N=40` app songs per genre, `REAL=0` app only, `LINES=1` / `FIGURES=1` / `ROOM=1` / `BREAKS=1` / `TWIN=1` the app with those switches on, `OUT=` the file. About 4 minutes.

## What matches real songs (good)
- **How much it plays:** the lead plays in about half the bars (real 50%, app 54%) and about half its notes fall while the singer sings (47% both).
- **Answering the singer:** a gap after a sung line gets a lead note 47% of the time real, 55% app.
- **Solos:** 73% of real songs with a lead have a 4+ bar stretch of lead with no singing, app 70%. Middle of the song most (real 62%, app 79%). Typical length 8 bars (app 6).
- **Where notes start in the beat:** on the "&" 27% real, 31% app; the "e" and "a" about the same.
- **Up and down:** half the moves go up on both sides. The same note again: 21% real, 19% app.
- **Scale:** 91% of real notes are in the key's scale (app 95%), 76% in the key's pentatonic (app 85%). Real leads are a little less "inside".
- **Fast runs** where they belong: hard rock and metal (real 24% / 32% of notes in runs of 4+ 16ths; app 16% / 20%), almost none elsewhere on both sides.

## What's missing or off, by how clear the evidence is
### 1. Real lead lines are longer: the app plays short licks
| | real | app |
|---|---|---|
| notes in a phrase (between rests of a beat) | **9** | **3** |
| phrase length | 7.8 beats | 3.0 beats |
| notes in phrases of 6+ notes | 85% | 51% |
| notes a bar where it plays | 5.4 | 3.3 |
| under the singer | 4.8 | 3.0 |
| in solos | 6.3 | 4.9 |
| bars that are a line (6+ notes) | 31% | 12% |
| bars that are a lick (1-5 notes) | 53% | 86% |
The app's Guitar 2 answers in 3-note licks of about a beat or three. Real leads play whole lines: melodies of two bars, counter-melodies under the verse, picked figures. Same in every genre (grunge real phrases are 21 notes: long picked lines, Pumpkins / Pearl Jam style).

### 2. More steps, fewer leaps
| steps between notes | real | app |
|---|---|---|
| 1-2 semitones | **30%** | **22%** |
| 3-4 | 19% | 20% |
| 5-7 | 17% | **27%** |
| 8+ | 12% | 12% |
Real leads move by step much more; the app jumps a 4th or 5th twice as often as real leads (pop 29% vs 18%, funk 24% vs 10%). The tracks named "lead" or "solo" step even more: 41% steps, 13% leaps.

### 3. Picked arpeggios and repeated figures
- **Arpeggio bars** (6+ notes on 4 or fewer chord notes): 16% of real lead bars (pop 26%, rock 13%, grunge 15%), app 2%. The Edge, Andy Summers, Pumpkins: a picked figure over the chords is a big part of "lead" guitar in real songs.
- **2-bar stretches heard again** in the lead: 45% real (alt metal 68%), app 29%. Real lead parts repeat a figure; the app's licks are new each time.

### 4. Every app song has a lead guitar; most real songs don't
| songs with a lead guitar | real | app |
|---|---|---|
| pop | 29% | 100% |
| funk | 36% | 100% |
| rock | 48% | 100% |
| grunge | 51% | 100% |
| hard rock | 73% | 100% |
| metal | 78% | 100% |
Some of this is the files (a lead may be left out, or merged into another track), but the gap is big for pop and funk: most pop songs have no lead guitar line at all. The app's Guitar 2 always plays a lead-like line.

### 5. Heavy genres stay out of the singer's way
| lead notes while singing | real | app |
|---|---|---|
| hard rock | **21%** | 41% |
| metal | **15%** | 37% |
| funk | 35% | 63% |
| pop | 59% | 67% |
Hard rock and metal leads mostly play between the sung sections (intros, gaps between verses, solos): only 14% of sung hard-rock bars have a lead note (app 57%). The app fills the verses about as much in every genre. The tracks named lead/solo play while singing only 7% of the time.

### 6. Solos at the start of the song, and more of them
- Real songs with a solo have 2.1 lead stretches with no singing (an intro line, the solo, an outro), the app 1.2.
- 22% of those stretches are at the very start (the intro played by the lead guitar: pop 27%, grunge 26%), 16% at the end. App: 9% at the start (only pop, 69% of its few), 12% at the end.
- Pop and funk: 54% / 76% of real songs with a lead have a lead break; app pop 25%, funk 13% (solos are off for pop and funk by design, `docs/LEAD.md`). Real pop and funk leads take an instrumental break, the intro, or a melody between choruses.
- Metal solos are longer (11 bars; app 8) and there are more of them (3.2 a song).

### 7. Two lead parts
- 36% of real songs with a lead have a second lead line (hard rock and metal 55%); 70% of the time it plays in the same bars (a harmony, a double, a call and answer). App: one Guitar 2, 2%.
- Strict twin leads in 3rds/6ths are rare (1%; metal 4%, Iron Maiden / Thin Lizzy).

### 8. Bends, triplets and feel
- **Bends:** 7% of real lead notes have a pitch bend (hard rock 10%, metal 8%, funk 9%; named lead tracks 12%); 41% of songs have some. App: 3% of Guitar 2's notes are bent (slides 6%, legato 3%, vibrato 3%). Most MIDI files don't write bends at all, so real players bend more than this.
- **Triplets:** 7% of real lead notes start on a triplet (hard rock, grunge, metal 8-9%), app 1%. Triplet runs and shuffle licks are missing.
- **Double-stops:** 22% of real lead onsets, app 14%.
- **Short notes:** 17% of real lead notes are a 32nd or shorter (clipped, staccato), app 3%; the app holds more quarter and longer notes (33% vs 22%). Real leads are choppier.
- **Off the grid:** 18% of real notes (hand-played files), app 8%.

### 9. Register
- Middle note: real E4 (64), app B♭4 (70): the app's Guitar 2 sits about half an octave higher. Range per song: real 17 semitones, app 20.
- (The real tracks named lead/solo sit at A4, 69: solos are higher than the fills and lines.)

## What this data can't tell us
- **Which section is which:** real files have no verse/chorus labels; solos are found as stretches with no singing, which also catches intros and instrumental breaks.
- **Bends, slides, hammer-ons, vibrato, tone:** mostly not written in MIDI. Bends only where the file has pitch bend (41% of songs).
- **Chord notes:** how often the lead lands on the band's notes depends on what the band plays (the real files have keys and strings, the app's export guitars and bass), so it can't be compared fairly (real 68% on all band notes, 45% on guitars and bass only; app 55%).
- **Which track is "the lead":** found by how it plays. Some found tracks are a second rhythm part picked high, or a melody on a guitar sound. The 179 tracks named lead/solo are the cleanest: they play 22% of the bars, 7% while singing, 84% have a solo, 41% steps, 12% bent.
- Genres are by artist (hand-tagged); alt metal is 37 songs.

## What to build, in order (a suggestion)
Done: 1 and 2, the Lines switch (`docs/LEAD-LINES.md`); 3, the Figures switch (`docs/LEAD-FIGURES.md`); 4, the Room switch (`docs/LEAD-ROOM.md`); 5 and 6, the Breaks and Twin switches (`docs/LEAD-BREAKS.md`). After: the Licks switch (`docs/LEAD-LICKS.md`), solo licks from real lead parts.

1. **Longer lines:** let Guitar 2 play 1-2 bar melodic lines (6-10 notes, mostly steps) as well as short licks, in verses and between choruses.
2. **Fewer leaps, more steps** in its licks and lines (pop and funk most).
3. **A picked figure part:** an arpeggio or repeated figure over the chords, kept bar to bar (pop, rock, grunge), and lead figures that repeat.
4. **Heavy genres:** the lead quiet under the verses, and loud in the gaps: an intro line, between verse and chorus, the solo.
5. **Lead breaks in pop and funk:** an intro or an instrumental melody instead of a full solo; and some songs (most pop) with no lead line at all.
6. **A second lead:** a harmony or double on the hook and the solo's peak (hard rock, metal).
7. Triplet runs, more double-stops and bends, clipped notes.
