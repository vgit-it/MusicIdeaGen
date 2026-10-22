# The bass-led vocal

The Writer menu on the Vocal melody card has a third entry, **New · bass-led** (`vocalWriter: 'bass'`), and a **Bass share** slider next to it (0-100%, default 70%, stored as `vocalBassShare`; it only works with the bass-led writer, and 0% is the New writer exactly). It is not a new engine: it is the verse writer (`src/verse/`, `docs/VERSE-SECTIONS.md`) with the bass line as the start of the line instead of a plain 8th-note grid. Code: `src/verse/bassline.ts`, hooked into `build.ts`; check: `npm run bass-vocal-check`.

## What the bass gives
- **Rhythm.** The line's first notes start where the bass starts a note (a bass note on a 16th snaps down to its 8th). Between them, an 8th starts a note with the chance the bass doesn't own the line (1 - share): at 0% every 8th does (the plain grid), at 100% only the bass's do. A note lasts until the next note starts, at most half a bar, never across a chord change or into a break, run or long note. A phrase's first note and a long note's first note always exist.
- **Pitch.** The chord note a bar (or a phrase start) sits on leans toward the one the bass is playing, root, 3rd or 5th: its weight is e^(2.2 x share) times (9x at 100%, 5x at 70%). A bass note that is none of the three (an approach note, a riff's chromatic note) says nothing. The octave is still the voice's own (`voiceLead`): only the note name comes from the bass.
- **Accents.** A bass note counts 0.45 among the band's hits (0.15 usually), so runs, long notes and phrase starts lean toward it too.

## How it avoids contradicting the other rules
The bass is the start of the line, never its last word. Every rule runs on top as before and wins where they disagree:
- Phrases, breaks and call and response are planned first: bass notes inside a break are dropped.
- Longer notes, Use the space, Sets of notes and the "no lone short unit" rule thin and join a busy bass (driving 8ths, funk 16ths), so the vocal echoes the bass rather than copying it.
- Phrase endings (home / open / hanging), mood notes (colour, surprise, contour), long holds and bends rewrite pitch and length where they apply; the bass only leans the chord note mid-phrase.
- Choruses stay one melody per song: a chorus built like its master takes the master's bass (rhythm and chord notes against the master's chords), over its own chords.
- A section with no bass notes (quiet or empty) is written as New.
- The New writer is untouched: nothing changes unless the Writer is bass-led and the share is above 0 (hash-checked, 70 songs).

## Measured (`npm run bass-vocal-check`, 70 songs, inside phrases)
| | New | Bass 70% | Bass 100% |
|---|---|---|---|
| vocal note starts where the bass starts a note / where it doesn't | 45% / 33% | 49% / 24% | 50% / 18% |
| chord note a step sits on = the bass's | 35% | 55% | 64% |
| sung time / short notes | 74% / 37% | 73% / 35% | 73% / 33% |

The other checks (sets, longer, form, meter, emotion, space, shape, long-hold, bend, core-key, variants) pass with the bass-led writer at 70% and 100%.

## Later
- Follow the bass's up and down contour as well as its notes.
- Keep 16th bass notes on the 16th (now snapped to the 8th) in busy songs.
- A bass-share per section kind (lean harder in verses than choruses).
