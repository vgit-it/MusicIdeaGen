# Anchor line (Guide line switch; 2026-10-14)

Paul's idea: a melody built the way many real vocal lines are, mostly one note, sung in a steady rhythm,
broken now and then by a small accent. **Anchor line: Off / On** in the Guide line card. It is a writer of its
own (`src/guide/anchor.ts`), giving the same kind of line as the guide line, so the drawing, the synth, the
words, the singer and MIDI all work as before. Off: the guide line exactly as before.

## Decisions (Paul)
| Question | Choice |
|---|---|
| The main note | One per 4 bars, **moving every 4 bars** (a step or two) |
| Rhythm patterns | **By genre** |
| Where | **Its own switch** |
| Words | A word on each note of the rhythm; now and then more than one in a beat (less often) |
| Accent endings | The last note strong, sometimes held into the next bar or two; the verse planned around it |
| Bends | Into the accents, now and then, by chance |

## How it writes
- **The anchor:** for each 4 bars, one main note, near the section's height (verses low, pre-choruses
  climbing, choruses lifted, by the tension), on a note the chords there share (leaning in), a step or two
  from the last one.
- **The plan of each 4 bars:** one 4-bar phrase, two 2-bar phrases, or 1+1+2 / 2+1+1 (6/8 and 7/8: 4, or
  2+2). Never more than 4 bars sung without a pause (Paul: no phrase longer than 8 bars).
- **Each phrase:**
  1. **The pattern:** a rhythm cell of 3-6 beats, by genre, repeated on the anchor (at least about half the
     phrase). Each beat of a cell: one note, two notes, a push on the offbeat, three quick notes (rare), the
     note held on, or a rest.
  2. **The break:** the rhythm changes for the accent: a note a beat each, two to a beat, or the last note
     pushed an 8th early.
  3. **The accent**, in scale steps from the anchor (in the key): two up and one down (+2, +1); a step up and
     back (+1, 0); up, up, one down; a dip (-1, 0); a turn (+1, 0, -1, 0); a reach up two (+1, +2); a fall
     (-1 or -2); up then down past it; two up, stepping home; now and then a leap up a 5th after a breath
     (choruses, pre-choruses, bridges).
  4. **The last note:** on a strong beat, on a chord note (leaning in); a beat or two, or held a bar or two
     (more in choruses and by mood: dreamy, melancholic and triumphant the most).
  5. **A rest** of a beat or more (verses longer: sparse).
- **The mood picks the accents:** happy and triumphant reach up, melancholic and dark fall and dip, tense
  turns, angry steps and falls.
- **Phrases that end a 4-bar block settle** (back to the anchor or below); earlier ones stay open (up).
- **Bends**, by chance: into an accent note a half or whole step from the note before, straight on, over an
  8th, a quarter or half a bar (more likely on the last note; melancholic and dreamy most).
- **Kept from the guide line:** where it sits out, verses and choruses sung alike, the song ending on home,
  at most 4 new sounds in any second (in busy spots anchor notes are tied together, the accents kept), the
  range and Key & scale, Hard & soft.
- **Not used:** quick notes, pushes and pulls, and the other switches.

## Measured (168 songs: 8 moods, 7 genres, 4/4, 6/8, 7/8)
| | 4/4 | 6/8 | 7/8 |
|---|---|---|---|
| Notes on the 4 bars' main note | 78% | 81% | 81% |
| Notes a beat | 0.58 | 0.73 | 0.65 |
| Time sung | 75% | 71% | 75% |
| Notes held a bar or more, a song | 8.5 | 11 | 9.6 |
| Bends, a song | 8.5 | 6 | 6.3 |

`npm run guide-check` checks it too (alone, with Hard & soft, two ranges, a key and scale of its own): the
words on the tune, at most 4 changes in a second, the range, never two notes at once, a note held at most
2 bars (the guide line's own limit, a bar, stays for the guide line).

## Fewer long notes, moving ones, energy, more patterns (2026-10-15)
Paul: too many long runs held across two bars; long ones could bend to the next note or start on the accent
and bend down; more dynamic, by the song's energy and mood (following the song); more word patterns.

- **Fewer long notes:** at most 2 long holds a section (3 in a chorus), fewer as the energy rises; half a bar
  to a bar; two bars only to close a chorus or the song. Notes held a bar or more: 9.7 → 2.7 a song (over a
  bar: 6.5 → 0.8).
- **Long notes move**, by chance (mood and energy pick):
  - bent away to the next step near its end (toward the next note)
  - started a step above (the accent's note) and bent down onto it
  - scooped up from a step below
  - falling off a step at the very end
  - sung again as new words on the same note
  - or simply held
  - Melancholic and dark fall off and start above; happy and triumphant scoop; angry and tense sing again;
    dreamy bends away. High energy scoops and sings again; low energy falls off and bends away.
- **Energy follows the song:** each section's energy level and tension, with the mood's lean (angry, tense,
  triumphant push; dreamy, melancholic hold back). Low: fewer words a beat, longer rests, small accents (a
  step, a dip, a fall). High: more words, shorter rests, bigger accents (a reach, a climb, a leap).
  Words a beat by section energy: low 0.66, mid 0.77, high 0.86 (before: 0.64 everywhere).
- **More rhythm patterns:** new beats: long-short (a dotted 8th and a 16th), short-long (a 16th and a
  dotted 8th), two quick ones on the offbeat, a 16th late. 2-4 more cells per genre, and 8 classic vocal
  rhythms any genre can use (a pickup into the beat, a call that breathes, long-short swing, a dotted push).
  The cell is picked to suit the energy.
- Still: about 80% of notes on the anchor; `npm run guide-check` passes (the guide line itself unchanged).

## Slow line, Breaths, Lead-ins with it (2026-10-15)
Paul: make these three switches work with the Anchor line. (The others still don't apply to it: Repeat idea,
Pitch by words, Question & answer, Section change, Carry over, Quick notes, Voice, Avoid clashes.)

- **Slow line:** each section's shape (by mood: verses falling, pre-choruses climbing, choruses arching...)
  moves where each 4-bar anchor sits, from the section's start to its end. Sections whose anchors go the
  way their shape does (first 4 bars vs last 4): 53% off → 93% on.
- **Breaths:**
  - before a big section (a chorus, or one sung higher) or after a tiring one: a silence of 1-4 beats
    before it (the last note cut short)
  - inside a section, after a tiring stretch (long, or high): the rest before the next phrase a beat or
    two longer
  - about 2 a song; time silent 30% → 31%
- **Lead-ins:** now and then (about a third of sections) the first note comes in early, an 8th, a beat or
  two before the section, held into it, with a beat's breath before it. Also after a section the line sits
  out. About 2 a song.
- Each has its own dice: switching one on doesn't reshuffle the rest. `npm run guide-check` checks each,
  and all three together with Hard & soft and a narrow range.

## Next
- Paul listens per genre and mood.
- Maybe: the pattern changing with the section (a chorus busier), a pickup into a phrase, the anchor
  following the slow line.
