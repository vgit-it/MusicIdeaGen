# Vocal rhythm: Words first (2026-10-14)

A third way of writing the vocal's rhythm, beside **Classic** and **Grid** (both kept). Paul: building
the melody and the grid rhythm "into a proper system"; does anything stop it sounding like a natural
English song? The main thing: the rhythm was written first and the words poured into its slots, so word
stress, where breaths fall and how long lines are had nothing to do with the words. Words first turns it
round: the words, then a rhythm set to them on the grid, then the pitches, then the fit to the band.
Chosen in the app: **Rhythm: Words** (the vocal row).

## Decisions (Paul)
| Question | Choice |
|---|---|
| Density | A bit random per song, leaning by genre |
| Quick weak words on 16ths at normal tempo | Yes |
| Triplets | In |
| Menu | A new option (Classic and Grid stay) |

## What was against natural English (before)
- The rhythm set the slots (stressed or not), the words were made to fit: no word groups, breaths
  wherever the bars said.
- Syllables only on 8ths (16ths only in slow songs): no quick "in the", "I'm a", "and the".
- Every line ended on a held stressed syllable: no soft endings ("BA-by", "NE-ver").
- Line pairs copied rhythm exactly: lines all the same syllable count.
- About 1.5 syllables a second (real rock verses: about 3).

## How it works
1. **A line of words first** (`wordLine` in `src/parts/lyrics.ts`): word groups the way English is
   said, a light word or two then a content word ("the NIGHT", "in the NIGHT", "my BA-by",
   "a-WAY"), now and then two stresses side by side ("COLD NIGHT"). Word shapes: one syllable, BA-by,
   a-WAY, BEAU-ti-ful, to-MOR-row. Each syllable gets a weight (light, lightly stressed, stressed, the
   line's key word), and each word group and clause its end (where a breath may go). The line ends on
   its key word (strong) or with a soft syllable after it (about a third of lines). Chorus lines 1 and
   3 open with the hook.
2. **How many syllables:** a rate per song (by genre: funk most, then pop, rock, hard rock and alt
   metal, metal, grunge least; then a random lean per song), by section (verses most, choruses fewer),
   by the singer and the energy style, times how long the line has to sing.
3. **Set to the grid** (`wordRhythm` in `src/parts/melody.ts`): every placement tried, the best kept.
   Rewarded: the key word on beat 1 or the bar's middle beat, held; stresses on beats; light syllables
   between, short. Penalised: a stress on a weak 8th (a push just before a strong beat is fine, by the
   singer's syncopation), a rest inside a word, a breath inside a word group, long strings of even
   quarters. Light syllables may come on 16ths (a quick pair) where the tempo allows; a beat of three
   quick syllables is sometimes sung as a triplet. Pickups of up to three light syllables.
4. **Loose repetition:** a line that comes back (the form's letters) gets new words of about the same
   length and stress, set close to the first line's rhythm (sometimes exactly, sometimes a syllable
   more or less), so lines rhyme in rhythm without being clones. Later verses: new words to the first
   verse's rhythm, as lyricists write second verses.
5. **The words stay with their notes** through the pitches, the ornaments and the fit to the band (no
   syllable dropped to make room); long and high notes open their vowels (ee to ay, oo to oh) once the
   pitches are known.

Everything after the rhythm is shared: Classic, Shaped and Melody first pitches, moves, energy, the
fit to the band, expression and the voice.

## Measured (`npm run melody-lab`: 42 songs, all genres, 4/4)
| | Classic | Grid | Words | Words + Shaped | Words + Melody first |
|---|---|---|---|---|---|
| Stresses on a beat | 75% | 89% | 91% | 89% | 90% |
| Stresses pushed an 8th ahead of a strong beat | 15% | 10% | 5% | 7% | 7% |
| Soft line endings (BA-by) | 2% | 2% | 30% | 29% | 28% |
| Syllables a second in a line: verse / chorus | 2.2 / 1.9 | 2.4 / 1.7 | 2.7 / 2.0 | 2.6 / 2.0 | 2.6 / 2.0 |
| Syllables on 16ths (songs at 90 bpm and up) | 1% | 1% | 12% | 12% | 12% |
| Triplet syllables | 0 | 0 | 140 | 110 | 108 |
| Rests inside words / long gaps inside word groups | | | 2% / 2% | 2% / 2% | 1% / 2% |
| Held notes (half a bar or more, of syllables) | 13% | 16% | 8% | 7% | 7% |

Other meters (Words): 6/8, 7/8, 3/4 and 5/8 all work: stresses on beats 86-95%, soft endings 27-36%, no
rests inside words beyond 2%. Classic, Grid, Shaped and Melody first unchanged (checked: the same
notes as before).

Fewer long held notes than Grid: more words fill the lines. A jump up to a line's top that can't be held
half a bar (a word comes next) is sung a step up instead (Paul's rule on held high notes kept).

## Pitch by speech (2026-10-14; `speechPitch` in `src/parts/melody.ts`)
The tune follows how the words are said, on top of whichever melody writer (Classic, Shaped, Melody
first); colour notes from the moves are left be:
- Light syllables (the, a, in, the "-by" of BA-by) by a step or a repeat, never a leap, heading for the
  next stress (a neighbour rather than the same note again: no more repeated notes than before).
- A pickup sits a step under the stress it leads into.
- The line's highest note on a stressed word, not a light one.
- A soft ending falls after its key word (BA-by: high, then low).
- The light syllable just before the key word rises into it (not above it).

| 42 songs, 4/4 | Words before / after | Words + Shaped | Words + Melody first |
|---|---|---|---|
| Leaps (over a minor 3rd) onto light syllables | 14% / 9% | 14% / 9% | 16% / 11% |
| The line's top on a stressed word | 72% / 88% | 68% / 86% | 66% / 77% |
| Soft endings falling (or level) | 63% / 91% | 62% / 85% | 62% / 75% |
| A light syllable above the key word after it | 33% / 9% | 34% / 14% | 32% / 21% |
| The same note again | 26% / 27% | 23% / 25% | 19% / 19% |

What's left over comes from later steps that move notes for the band (clashes, the tension curve);
Melody first's planned clashes and loops keep more of their own shape. Classic, Grid, Shaped and Melody
first with Classic or Grid rhythm unchanged (checked: the same notes as before).

## Question and answer (2026-10-14)
Pairs of lines sung as a question and its answer, the way English is said: now and then a 1st or 3rd
line (never a section's last) rises at its end and the line after it falls home.
- A question with a soft ending rises on it (BA-by? up on the "by"); with a strong ending, its key word
  goes up to a chord note above the stress before it.
- Its answer falls: its last word down to a chord note under the stress before it (a soft ending
  steps down, not level).
- How often, by mood: happy and dreamy 60% of pairs, nostalgic and tense 50%, triumphant 45%,
  melancholic 40%, dark 30%, angry 25% (open, hopeful moods ask; angry and dark ones state).

| 42 songs, 4/4 | Words before / after | Words + Shaped | Words + Melody first |
|---|---|---|---|
| 1st and 3rd lines ending up | 24% / 36% | 31% | 45% |
| 2nd and 4th lines ending down | 32% / 46% | 48% | 46% |
| One-note lines | 67 / 45 | 75 | 27 |

Not every question survives to the end: later steps still move notes for the band and the tension
curve. Other rhythms unchanged (checked: the same notes as before).

## Next
- Paul listens: Words vs Grid.
