# Study: vocal melodies in the Lakh MIDI collection

Goal (Paul): can the MIDI collection in `experiments/MidiCollection` help make a better vocal melody writer for the app? This is a scoping study. Nothing in the app has changed.

Follows on from `docs/STUDY-POP909.md`, whose "Next" step asked for Western rock/pop MIDI. This is that data.

## The data
- **Lakh MIDI Dataset, "clean" set**: 17,227 files, 2,198 artist folders. Western pop/rock, mostly 1960s–2000s. Git-ignored (`.gitignore`), so it isn't in the repo.
- 17,146 files open. 88% are 4/4.
- **5,049 files have a track named as a vocal or melody.** That's 3,878 different songs by 1,200 artists. Names like "Melody" (2,493), "Vocals", "Lead vocal", "Vox".
- 1,883 are karaoke files (named Melody track plus a Words track, each syllable timed). 817 have both a vocal track and lyrics.
- Good genre spread for the app. For example: Beatles 781 files, Queen 219, Madonna 214, Metallica 155, Nirvana 154, Led Zeppelin 148, U2 111, Green Day 97. Funk is thin: James Brown 1 file, Stevie Wonder 4.
- No genre labels. I tagged about 640 songs by artist by hand for the genre table below. Tagging all 1,200 artists is a small job.
- **Quality:** of 3,038 songs (one version each, 4/4) with a lead track, 2,534 are usable as a single melody line. 411 were dropped as chords and 54 as out of voice range. 901 are very clean (on the grid, in key, key clear). The rest are played in by hand and need snapping to the grid.

## What real vocal lines do (2,534 songs)
- **Steps between notes:** same note 30%, step 44%, third 17%, 4th–5th 7%, bigger 2%. Down 38%, up 32%.
- **After a leap:** turns back 57%, repeats the note 28%, keeps going 15%.
- **Where notes start in the beat:** on the beat 43%, the "&" 37%, the "a" (16th before the next beat) 13%, the "e" 7%.
- **Phrases** (split by a rest of a beat or more): 1–2 bars 37%, 2–4 bars 22%, ½–1 bar 20%, 4+ bars 12%.
- **Phrase span:** within a 3rd 31%, a 4th–5th 33%, an octave 29%, wider 7%. Most phrases are narrow.
- **Phrase top note:** in the first third of the phrase 61%. Phrases start high and fall.
- **Phrase ends on:** 1 31%, 5 18%, 3 14%, 2 11%, 6 9%, 4 7%, 7 4%, off-key 7%.
- **Against the band:** 63% of notes are a note the band is playing at that moment, 67% on beats 1 and 3. Clashes with the bass (semitone or tritone) 5%.
- **Range per song:** median an octave (p10–p90: 7–17 semitones).
- **Repetition:** about half of the 2-bar stretches come back exactly (same rhythm and steps) somewhere in the song.
- **Mode:** 73% major.

### By genre (hand-tagged artists)
| Genre | Songs | On band notes | On beats 1 & 3 | Range | 2-bar repeats | Minor |
|---|---|---|---|---|---|---|
| Pop | 164 | 68% | 74% | 12 | 49% | 23% |
| Rock | 297 | 59% | 64% | 11 | 41% | 24% |
| Hard rock | 85 | 55% | 56% | 12 | 36% | 32% |
| Grunge | 38 | 46% | 44% | 11 | 54% | 45% |
| Metal | 45 | 47% | 47% | 9 | 46% | 78% |
| Funk | 10 | 47% | 53% | 12 | 45% | 20% |

- Heavier genres sit on the band's notes far less: grunge and metal under half the time, pop three quarters. Some of that is power chords (no 3rd to land on), but the gap is big.
- Metal lines are narrow (9 semitones) and mostly minor. Grunge repeats most.

## The app vs real songs (Melody first, `npm run melody-lab`)
- **Same note again:** app 16%, real 30%. Real singers repeat notes about twice as often.
- **Strong notes on chord notes:** app 75% across all genres, real 67% overall and 44–56% in heavy genres. The app is too "correct" for rock, grunge and metal.
- **Turning back after a leap:** app 68%, real 57% (plus 28% repeating the note).
- Real phrases peak early (61%). Worth checking against the app's contours, which lean to arches and rises.

These are the easiest wins. They're also measurable, so a change can be checked by the numbers before Paul listens.

## Options, cheapest first
1. **Real numbers as targets.** Set the existing writers' weights per genre from these tables, and add a "realism" lab that scores the app's lines against the real spreads (like `guide-check`, but a distance to real songs per genre). Low risk, one or two sessions. Fixes the gaps above.
2. **A pattern library.** Mine common 1-bar vocal rhythms and short 4–6 note shapes per genre. Keep only patterns found in many songs by many artists, so no single song is recognisable. Writers pick from it, and the app's fit to the band (`src/parts/fit.ts`) does the rest. Probably the biggest gain you can hear. Two or three sessions.
3. **Verse vs chorus.** The karaoke files' lyric lines show which parts repeat (the chorus). That lets us measure how choruses differ from verses (higher, denser, longer notes?) and feed Song arc and the tension curve. Medium effort.
4. **Words.** 1,500 files have timed syllables. Use them for syllables per note, stretched syllables, and stresses on beats, to tune Rhythm Words. Only numbers come out. The lyrics themselves are never used.
5. **A learned writer.** A fourth writer that picks each next note by the odds learnt from the data (scale step against the chord, length, place in the bar, by genre and energy), with the app's forms on top for repeats and shape. A table of a few hundred KB, no AI runtime. Three to five sessions. Risk: lines that wander without the app's forms. **Done:** `docs/VOCAL-LEARNED.md` (Melody: Learned, an experiment).
6. **A neural model** (trained offline, run in the browser). Not recommended for now. It's bigger and harder to steer, it risks copying tunes, and it doesn't fit the app's "rules you can name" approach.

## Recommendation
- Option 1 is done: `docs/REALISM.md` (the realism lab and the Real songs switch).
- Option 2 is done: `docs/PATTERNS.md` (the pattern library, the Patterns switch and the copy guard).
- Option 3 is done: `docs/ARC.md` (verse vs chorus, with Real songs and Song arc).
- Option 4 is done: `docs/WORDS-REAL.md` (Rhythm Words' pace, with Real songs).
- Option 5 is done: `docs/VOCAL-LEARNED.md` (Melody: Learned, a fourth melody writer by the learnt odds; an experiment, Paul listens).
- Start with **1** (targets plus a realism score), then **2** (pattern library) as a switch in the vocal row. Do **3** alongside 1 if Song arc is a priority.
- Decide on **5** only after hearing 2.

## Copyright
- Lakh is published under CC-BY 4.0 (credit Colin Raffel). The folder's own LICENSE file is GPL, from whoever repackaged it.
- The songs are still copyrighted. The app is public, so **never ship melodies, phrases or lyrics from the data.** Only counts and short patterns that many songs share.
- Guard: check generated lines against every real 2-bar stretch and reject exact matches.

## Run it
```
node scripts/study/lakh-scan.cjs experiments/MidiCollection scan.json
node scripts/study/lakh-measure.cjs experiments/MidiCollection scan.json   # writes songs.json
node scripts/study/lakh-genres.cjs                                         # after measure, same folder
```
Uses `midi-file` from the repo. The full scan takes about 15 seconds. `experiments/midi-vocal-player/` plays any file's vocal line, to listen alongside.

## Caveats
- Key is guessed from all the notes, and songs that change key are counted as one key.
- "Band notes" means notes sounding at that moment, not the labelled chord.
- About a quarter of the files are played in by hand, so beat positions are rounded to the nearest 16th.
- The genre table only covers hand-picked artists. Funk has too few songs to trust.
