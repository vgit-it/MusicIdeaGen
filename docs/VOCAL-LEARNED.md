# Melody: Learned

Option 5 from `docs/STUDY-LAKH.md`. A fourth melody writer in the vocal row: **Melody: Learned**. An experiment. Off unless chosen; with any other choice, everything is exactly as before.

## What it is
- It picks each next note by the **odds of real singers**. They were counted from about 1,200 real vocal lines in the Lakh MIDI collection (372,000 note-to-note steps).
- For each note it asks: "In real songs, after a note like this, how far do singers move?" It looks at:
  - the step just before (up a step, a leap down, the same note...)
  - where the new note starts in the bar (on 1 or 3, on 2 or 4, an offbeat 8th, a 16th)
  - what the note before was against the chord (root, 3rd, 5th, another chord note, none)
  - where it is in the line (first note, middle, last)
  - the genre (rock and pop have enough songs of their own; the other genres use all songs)
- It also learnt which kinds of notes real singers put on beats 1 and 3, and where real lines end (which scale note).
- **Pitches only.** The rhythm still comes from the Rhythm menu (Classic, Grid or Words).

## The app's forms on top (so lines don't wander)
- A line that comes back sings its notes again (moved to fit the new chord).
- Each line leans softly toward the section's shape. Most peak early and fall, as real lines do.
- Range and the chorus lift are the same as Shaped.
- Lines end on a chord note: closed on the root, or open.
- Several tries per line; the one that fits the band and sounds most musical is kept.
- Fitting to the band, Real songs, Patterns and the Moves apply as for the other writers.

## Numbers (`npm run realism-lab`, 8 songs per genre, 4/4)
Realism: 100 means the same spreads as real songs of the genre.

| Rhythm | Classic | Shaped | Melody first | **Learned** |
|---|---|---|---|---|
| Classic | 82 | 82 | 81 | **85** |
| Grid | 80 | 80 | 81 | **83** |
| Words | 83 | 83 | 85 | **87** |

- Highest in every column. Closest to real songs on: the same note again (28%, real 30%), strong beats on the chord (69%, real 67%).
- Still off: range (14 semitones; real about 12, the same for all writers) and lines peaking early (45-49%; real 59%).
- Copy guard: with Patterns on, **0** finished lines copy a real 2-bar stretch (405 sections each for Learned, Grid + Learned, Words + Learned). With Patterns off, Grid + Learned had 1 (as Grid and Words alone do).

## Copyright
- `src/realism/learned.json` (45 KB) holds only counts of steps in contexts that **25+ songs by 15+ artists** share. Rare counts are dropped. No melodies, no lyrics, nothing that can be played back as a song.
- Rebuild: `npm run realism-learned` (needs `experiments/MidiCollection`, kept out of git).

## Lines land somewhere strong
Paul: make sure the starting note is a strong one.
- **The landing:** a line's first note on a beat. A pickup before it (a quick "and I...") sings free.
- **Always a chord note.** The writer picks it so, leaning to what real singers land on (root, 3rd, 5th).
- **Kept to the end:** later steps (rhythm, tension, fitting, Real songs' notes off the chord) could move it off. A last pass moves it back to the nearest chord note, 2 semitones at most (4 if none nearer). Real songs' "off the chord on purpose" notes skip landings.
- Signature moves' colour notes stay (a 9th held on purpose).
- **Real starts:** `npm run realism-learned` now also counts how real lines land and which scale note they start on. Until it is run again (needs the MIDI collection), the landing leans like any real note on beat 1 or 3, and the start note has no lean by scale note.

| Setting | First note on a beat a chord note: before | after |
|---|---|---|
| Learned | 77% | 98% |
| + Real songs | 67% | 96% |
| + Patterns | 78% | 97% |
| + Real songs + Patterns | 64% | 95% |
| Grid + Learned | 83% | 98% |
| Words + Learned | 74% | 99% |

(42 songs each, all genres. The rest: colour notes kept on purpose.)

## What to listen for
- Choose **Melody: Learned** and compare with Shaped and Melody first on the same idea (the band stays the same).
- It should sound **more like a real singer, less like a pattern**: more repeated notes, small steps, notes now and then just off the chord on a strong beat, lines that fall at the end.
- The risk: it may sound **aimless** (no clear idea or hook). If so, tell me: the forms on top can be made stronger (a hook to come back to, as Melody first does).
- Try it with **Rhythm: Words**: the best score of all.

## Files
`scripts/study/lakh-learned.ts` (counts), `src/realism/learned.ts` + `learned.json` (the odds), `src/parts/learned.ts` (the writer), `src/parts/melody.ts` (`learnedTuneLine`), `src/parts/vocal.ts`, `scripts/realism-lab.ts` (the learned rows).
