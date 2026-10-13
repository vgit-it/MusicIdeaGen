# Vocal rhythm: the grid (2026-10-13)

A second way of writing the vocal's rhythm, beside the current one (kept: **Classic**, the default).
Paul: "some logic akin to time signature metronome's rhythm ... if there's a word with multiple
syllables then the syllables should fall on 1/8ths (not that there's got to be one syllable every
1/8th but if changing, it should fall on those with a nice sounding rhythm)". Chosen in the app:
**Vocal rhythm: Classic / Grid** (the vocal row), so any song can be heard both ways.

## Decisions (Paul, 2026-10-13)
| Question | Choice |
|---|---|
| Where a word starts | On any 8th; stressed syllables prefer the beats |
| Pushes | Sometimes: a stressed syllable an 8th early (into the next beat, often the "and" of 4 into the bar) |
| Repetition | Pairs: lines 1 and 3 share a rhythm, 2 and 4 another (or A A B A) |
| Slow songs | The grid tightens by tempo: under about 90 bpm it works in 16ths (its "beats" are 8ths) |
| Line starts | By section: verses often a pickup ("and" of 4) or just after 1; choruses on beat 1 |
| Line ends | The last syllable lands on a strong beat (1 or 3) and holds; a breath before the next line |
| Density | Verses busier (they tell the story), choruses open (fewer, longer notes) |
| Trying it | A switch in the app; Classic stays the default |

## How it works
1. **The metronome grid, by the time signature** (Paul: "if the song has a different complex time
   signature, it may have to adapt to that"). The beats are the bar's own groups, as its metronome
   counts them: 4/4 four quarters; 3/4 three; 6/8 two dotted quarters; 5/8 3+2; 7/8 2+2+3 (or 3+2+2,
   2+3+2); 9/8 2+2+2+3 or 3+3+3; 7/4 4+3+4+3 8ths; 11/8 by its groups. Ranked like a metronome's accents:
   beat 1 strongest, the middle beat next, the other beats. Each beat is cut into its 8ths: two in a
   quarter, three in a dotted quarter, four in a half (its middle 8th a beat of its own). Slow songs:
   everything one level finer (16ths).
2. **A pattern per beat:** which of its 8ths are sung. The first nearly always on a strong beat, a
   quarter inside a long group often, the 8ths between by how busy the section is; now and then the
   last 8th before a strong beat sung as a push.
3. **A motif inside the line:** the first half-bar's cells come back in the later half-bars, now and
   then varied, so the line has a rhythm of its own rather than random notes.
4. **Every new syllable on the grid** (8ths; 16ths in slow songs), so a word's syllables always fall on
   8ths. Quick notes on one syllable (runs, turns) are not new syllables and stay as they are.
5. **Stress:** syllables on beats are the stressed ones (the words are chosen to fit: stressed syllables
   of words on beats, the light ones on the "and"s); a push carries its stress an 8th early.
6. **Line start and end:** pickups and starts by section (above); the held last syllable on beat 1 or 3
   of the line's last bar, held to a beat before the next line (the breath).
7. **Pairs:** the verse and chorus forms are ABAB or AABA, so lines answer each other in rhythm (the
   tune's existing motif copying does the rest).

Everything after the rhythm is shared with Classic: the pitches (contours, chord tones, the hook), the
words, fitting to the band, expression and the singer's voice.

## Measured by meter (14 songs each, all genres)
| Meter | Off the grid | On a beat | Third 8th of 3-8th beats used | Syllables/s |
|---|---|---|---|---|
| 4/4 | 0 | 83% | (none) | 1.51 |
| 3/4 | 0 | 80% | (none) | 1.57 |
| 6/8 | 0 | 64% | 494 of 1951 | 1.32 |
| 5/8 | 0 | 73% | 265 of 959 | 1.39 |
| 7/8 | 0 | 70% | 287 of 1017 | 1.46 |
| 9/8 | 0 | 62% | 667 of 2168 | 1.47 |
| 7/4 | 0 | 66% | 300 of 1001 | 1.23 |
| 11/8 | 0 | 72% | 387 of 1586 | 1.47 |

## Measured (28 songs, all genres, 4/4; the first version)
| | Classic | Grid |
|---|---|---|
| New syllables off the grid | 0 | 0 |
| Syllables per second | 1.53 | 1.54 |
| Verse / chorus (syllables per second) | 1.77 / 1.50 | 2.01 / 1.39 |
| Long held notes on beat 1 or 3 | 54% | 75% |

Classic is unchanged (the same notes as before, checked). On the grid, the syllables off the 8ths
(40 of 596 inside words) are all in slow songs, where the grid is 16ths. Pushes with the band only
where they land on the grid.

## Code
`gridRhythm` in `src/parts/melody.ts` (beside the classic `phraseRhythm`), chosen by `vocalRhythm:
'grid'` in the idea's options (`src/idea.ts`); the vocal row's **Rhythm** select (`src/ui/parts.ts`,
`src/main.ts`) rewrites the vocal with the same seeds (the band unchanged) and carries over to new ideas.
