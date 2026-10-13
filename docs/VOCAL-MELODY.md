# Vocal melody: Shaped (2026-10-13)

A second way of choosing the vocal's pitches, beside the current one (kept: **Classic**, the default).
Paul: the melodies are "too samey / flat", don't fit the chords, aren't genre-like; approach: "a mix"
(a motif, on a chord-note path, by genre). Chosen in the app: **Melody: Classic / Shaped** (the vocal
row, next to Rhythm; works with either rhythm). Same seeds: switching rewrites only the vocal.

## Decisions (Paul)
| Question | Choice |
|---|---|
| Approach | A mix: chord-note path, a motif on it, genre flavour |
| Motif use | Repeat, then vary: line 1 the idea, line 2 its answer, line 3 the idea again (moved to the new chords), line 4 the answer with a new ending (ABAb) |
| Verse to chorus | Picked per song at random: subtle (chorus 2-3 semitones higher), clear (4-5), dramatic (7-9, the chorus wider) |
| Genre flavour | Clear but not cliché |
| Trying it | A switch in the app |

## How it works (`shapedLine` in `src/parts/melody.ts`)
1. **The path:** the strong notes (stressed, the first, the last, the long ones) on the chord's own notes,
   under the line's arc (its contour): a step or two is the norm, a leap costs more by its size; the same
   note again only as a common tone over a new chord (or in grunge), and never three times running.
2. **The notes between:** by step toward the next path note (passing notes); between two of the same note,
   the note again or one above or below, never the same turn twice running (no zig-zag); never arriving
   early on the next path note.
3. **The motif:** a repeated line keeps its motif, moved so its first strong note sits on the new chord.
4. **One clear high point** per line.
5. **The range:** verses narrow (about 8 semitones), choruses wide (10+), by the song's contrast. A genre's
   voice (written lower) keeps its whole range: its floor moves down a little with it and the centre sits
   high enough for the range to fit (Classic squeezed a grunge verse into two notes against the floor).
6. **By genre:** pop: pentatonic sing-song between the path notes, the chorus hook 5-6-5-3 now and then,
   endings open on the 3rd or 5th; rock, hard rock and grunge: blue 3rds and 7ths in passing; grunge: a
   drone now and then (short lines held on the 5th or 3rd while the chords move); alt metal: one-note
   verses now and then; metal, hard rock and alt metal: roots and 5ths, bigger leaps in choruses; funk:
   chromatic steps into the strong notes.

## Measured (35 songs, all genres, 4/4)
| | Classic | Shaped |
|---|---|---|
| Strong notes on chord notes | 87% | 92% |
| The same note again (consecutive syllables) | 48% | 34% |
| Steps / leaps | 28% / 24% | 32% / 34% |
| Chorus above verse (average) | 5.2 semitones | 6.2 |
| One-note lines | 88 of 708 | 56 of 685 |

Classic unchanged (checked: the same notes as before).

## Fix: repeated notes (2026-10-13)
See docs/VOCAL-RHYTHM.md (the same fix, measured for all four ways).
