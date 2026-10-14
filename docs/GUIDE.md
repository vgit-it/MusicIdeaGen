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

## Steadier, with bends (2026-10-14)
Paul: "too many shifts, almost every beat; more steady for now", and bends as one of the ways it moves
from note to note, over an 8th, a quarter or half a bar.
- **Steadier:** notes last 2.5 times as long as before, change only on strong beats (a bar's first or
  its middle), and tension speeds them up less. The same note again is held on, not struck again.
  Now about a note every 3-8 beats (was 1-2.4).
- **Bends:** a step up or down (a half or whole step, like a guitar bend) can be bent into instead of
  played: no new attack, the pitch glides from the note before over an 8th, a quarter or half a bar
  (never more than half the note). Only straight on (no pause before).
  - How often, by mood: melancholic and dreamy 35% of steps, nostalgic and dark 30%, tense and
    triumphant 25%, happy and angry 20%.
  - Which length: angry likes quick 8th bends, dreamy and melancholic slow half-bar ones.
  - Drawn as green slopes. In the MIDI file as pitch bends (the standard whole-step range).

| 40 tracks per mood | Notes a song (lean in) | Beats a note | Bends a song |
|---|---|---|---|
| Happy | 54 | 4.2 | 3 |
| Melancholic | 40 | 5.7 | 4 |
| Nostalgic | 48 | 4.8 | 5 |
| Tense | 67 | 3.4 | 9 |
| Angry | 61 | 3.8 | 5 |
| Dreamy | 27 | 8.4 | 2 |
| Triumphant | 54 | 4.2 | 5 |
| Dark | 46 | 4.9 | 4 |

Still: every song ends on home, no leap without a pause before it.

## Quick notes (2026-10-14)
Paul: on the long stretches, now and then one quick note up or down (a step or two at most), on the
beat grid, lasting just that small unit like a drum hit, then straight back to the line; a control from
sparse to a lot; at the end of a note, a bend to it instead.
- **Where:** on held notes of 2 beats or more, on the 8th-note grid, at least a beat into the note,
  at least a beat apart. Not on notes in a bend.
- **What:** one note up (55%) or down, a step (75%) or two, in the key.
- **How long:** a 16th or an 8th, by mood (angry and tense quicker, dreamy and melancholic slower).
  Struck with a little accent, then straight back to the line's note.
- **At a note's very end:** bent to instead, and the line moves on from there (never on the song's
  last note).
- **Control:** Quick notes: Off / Sparse / Some / Lots (Some by default). The line itself stays the
  same whatever the setting; only the quick notes change.
- Drawn as pink dashes (pink slopes for the bends). In the MIDI file the held note is cut around them.

| 120 tracks, all moods | Quick notes a song | Per 8 bars |
|---|---|---|
| Sparse | 11 | 1.1 |
| Some | 24 | 2.5 |
| Lots | 51 | 5.3 |

About 40% are 16ths, the rest 8ths; about 6% land at a note's end and are bent to.

## Quick notes: 8ths, pauses, clusters (2026-10-14)
Paul: quick notes an 8th at least; in some cases a split-second pause before the held note comes back;
and they come in clusters of about 2 bars: frequent, then moderate, then sparse.
- **Length:** always an 8th now (no 16ths).
- **Pause:** about a third of them go silent for a split second (a 32nd) after the quick note, then
  the held note is struck again. Never on the bent-to ones at a note's end.
- **Clusters:** the song is cut into 2-bar clusters that cycle frequent, moderate, sparse (the cycle
  starts at a random place per song). The Quick notes setting scales all three. In a frequent cluster
  they can come an 8th apart (else a beat).

| 120 tracks, all moods | Quick notes a song | In frequent / moderate / sparse clusters |
|---|---|---|
| Sparse | 13 | 64% / 27% / 9% |
| Some | 28 | 62% / 29% / 9% |
| Lots | 56 | 60% / 29% / 11% |

About 30% come back after a pause; about 10% are bent to at a note's end. The readout lists the
count per cluster type.

## Quick notes: more on Lots, 16th pauses (2026-10-14)
Paul: Lots much more frequent; the ones with a pause a 16th long, then a 16th's pause, so the line
comes back in time.
- **Lots:** about 2.2 times as many (13 per 8 bars, was 6). They may start an 8th into a note (else a
  beat) and come an 8th apart in every cluster. In a frequent cluster nearly every other 8th.
- **With a pause:** the quick note is a 16th, then a 16th of silence, then the held note again on the
  next 8th (was an 8th and a 32nd). About a third of them.
- Sparse and Some unchanged (1.3 and 2.9 per 8 bars).

## Voice range, repeats, quick notes lower (2026-10-14)
Paul: the mid voice range (a high voice can have some high parts); verses alike and choruses alike
within a song; quick notes leaning lower, whatever the mood.
- **Range:** the mid voice, C3 to G4. Home sits between F3 and E4, so there's room above and below.
- **High voice:** Voice: Auto follows the singer (high if they sing high), or pick Mid or High (High
  with no high singer uses the rock tenor's range). Where the song is high (tension 0.6 and up:
  choruses, the climax) the line may go up to that voice's top (tenor A4, woman C5) and reaches for
  it. On the way back down it steps down, never jumps.
- **Repeats:** the 2nd and later verses, pre-choruses and choruses sing the first one's notes (in
  their own key, so a last chorus up a key moves up), with about 15% of notes a step away, never
  making a leap. The song's last note is still home. A leap into a repeat gets a pause before it.
- **Quick notes:** 65% go down (was 45%).
- Still: every note in range, every song ends on home, no leap without a pause (360 tracks: mid,
  tenor, woman).

| 120 tracks each | Notes above G4 | Repeats: same note at the same place |
|---|---|---|
| Mid | 0% | 73% |
| Tenor | 5% | 72% |
| Woman | 13% | 73% |

## More room up (2026-10-14)
Paul: "the limiting of range has made it very stale. Open up more of the higher range."
- **Range:** C3 to C5 (was G4). Home stays F3 to E4, so the extra room is all above.
- **Each mood reaches 3 scale notes higher**, so high parts (choruses, the climax) climb further.
- **High voice:** up to 2 semitones past its belted top in the high parts (tenor D5, woman F5).
- **Fixed:** two changed notes side by side in a repeat could make a leap without a pause.
- Still: every note in range, every song ends home, no leap without a pause (360 tracks).

| 50 tracks each | Song's top note (avg) | Average note | Notes G4 and up |
|---|---|---|---|
| Mid, before | F4 | B3/C4 | 5% |
| Mid, now | A4 | D#4 | 38% |
| Tenor, now | A#4 | E4 | 46% |
| Woman, now | B4/C5 | E4 | 48% |

## Next
- Paul listens: does each mood sound like its name? Lean in vs Lean out.
- Then: a mood per section, phrases that come back (motifs), and the vocals singing on it.
