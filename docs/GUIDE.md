# Guide line (experiment, 2026-10-14)

A first step toward a new way of writing the vocal melody. Paul's idea: start from a system of notes
mapped to the whole track, so you can steer what kind of music it makes and its mood. Step one is a
single note line from the song's start to its end, in the song's key, shaped by the mood. It's a
separate section of the page (the **Guide line** card, under Parts) and separate code (`src/guide/`),
so it can be worked on without touching the vocals. Once it sounds right, it can feed the vocals.

## Decisions (Paul)
| Question | Choice |
|---|---|
| Mood | The existing Mood (the track's; an idea on its own: Auto, from its genre and key) |
| Chords | An option: **Lean in** (strong beats on the chord's notes) or **Lean out** (the key only) |
| Sound | A soft synth |
| Hand controls (how busy) | None |
| Where | Its own section and its own code |

## How it moves
- **The first note** is picked for the mood: home for strong moods, the 3rd for warm ones, the 5th for
  open ones, an unsettled note for tense ones.
- **Mostly small moves:** a step, sometimes a 3rd, sometimes the same note again.
- **Big leaps (a 4th or more) only after a pause.** After a leap, it steps back the other way. Real
  melodies do this (the leap's "gap" gets filled).
- **How often it moves** comes from the mood: dreamy holds notes for about a bar, angry and tense move
  every beat. It moves quicker as the tension rises.
- **Pauses** come at phrase ends (every 2 bars; every 4 when dreamy).
- **Height** follows the song's tension curve: up into choruses and the climax, down in quiet parts.
  It ends the song on home.
- **Resting notes:** each mood likes to land on certain scale notes, more so on long notes and strong
  beats. Section ends settle on the 1st, 3rd or 5th.
- **Out of key:** only a mood's known colour note, and only now and then:
  - tense and triumphant: the raised 7th, pulling up home (minor keys)
  - melancholic and nostalgic: the flat 6th, sighing down to the 5th (major keys)
  - dark and angry: the flat 2nd, just above home
  - dreamy: the raised 4th, floating (major keys)
- **Key changes** (a last chorus up a key, a jam outro): the line keeps its place in the scale and
  moves with the key.

## How each scale note feels (what the moods are built on)
Tendencies for Western listeners, not laws. Tempo and loudness matter more than which notes.
- 1st (home): at rest. 5th: strong, open. 3rd: warm; it makes the line major or minor.
- 2nd, 4th, 6th: unsettled, they want to move. 7th: yearning, pulls up home.
- Higher and rising: brighter, building. Lower and falling: darker, letting go.
- Small steps: calm, smooth. Big leaps: drama. Long notes: calm. Quick ones: restless.
- Sources: David Huron, *Sweet Anticipation* (how each scale note feels, gap-fill after leaps);
  research on music and emotion (major/minor, pitch height, interval size).

| Mood | Starts on | Rests on | Pace | Leans | Leaps after a pause |
|---|---|---|---|---|---|
| Happy | 3rd, 5th, home | 3rd, home, 5th | lively | up | often, up to a 5th |
| Melancholic | 5th, 3rd | 3rd, home | slow | down | sometimes, up to a 6th |
| Nostalgic | 3rd, 5th | 3rd, 6th, home | medium | a little down | often, up to a 6th |
| Tense | 2nd, 5th, 7th | 7th, 2nd, 4th | quick, repeats | a little up | sometimes, small |
| Angry | home, 5th | home, 5th | quick, repeats | level | often |
| Dreamy | 5th, 3rd | 3rd, 5th, 6th | a note a bar | level | rarely |
| Triumphant | home, 5th | home, 5th | lively | up | very often |
| Dark | home, 3rd | home, 3rd | slow | down | sometimes |

## On the page
- **+ Add guide line**, then:
  - **Chords:** Lean in or Lean out.
  - **Hear:** With band, or Line only (the band muted).
  - **Volume**, **Reroll** (another line, same mood), **MIDI** (the line as a file), **Remove**.
- A drawing of the line over the whole song, with the sections. Leaps are orange, out-of-key notes
  yellow, and the dashed lines are home.
- What it did, in plain words: mood, start, range, moves (steps, 3rds, same note, leaps), pace,
  pauses, how often strong beats land on a chord note, and the colour notes.
- It plays live only. It isn't in MP3/WAV exports, the main MIDI file or share links yet.

## Measured (40 tracks per mood: 5 genres, 4/4, 6/8 and 7/8)
| Mood | Notes a song | Strong beats on a chord note: lean in / out |
|---|---|---|
| Happy | 162 | 75% / 44% |
| Melancholic | 100 | 67% / 43% |
| Nostalgic | 116 | 71% / 42% |
| Tense | 216 | 72% / 35% |
| Angry | 213 | 81% / 44% |
| Dreamy | 80 | 69% / 36% |
| Triumphant | 169 | 74% / 46% |
| Dark | 122 | 72% / 44% |

Every song ends on home, and no leap of a 4th or more comes without a pause before it. Moves are
mostly steps (52-70%), then 3rds (12-40%), with leaps 1-7%.

## Next
- Paul listens: does each mood sound like its name? Lean in vs Lean out.
- Then: a mood per section, phrases that come back (motifs), and the vocals singing on it.
