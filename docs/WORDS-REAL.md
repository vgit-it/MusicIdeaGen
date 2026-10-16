# Words: how real singers set them

Option 4 of `docs/STUDY-LAKH.md`. Tunes **Rhythm Words** (`docs/VOCAL-WORDS.md`) when the **Real songs** switch is on.

## How it's measured (`npm run realism-words`, `scripts/study/lakh-words.ts`)
- Lakh songs with timed syllables (karaoke text or lyric events), words and tune in step (most syllables on a note): 342 songs.
- Per song: syllables a second in verse lines, chorus lines against verse lines, syllables over 2+ notes, where syllables start in the beat, lines ending on a word of 2+ syllables (a soft ending), syllables a line, rests. Medians kept in `src/realism/words.json`. Only numbers: the words themselves are never kept.

## Real songs vs Rhythm Words before (`npm run realism-lab`, 6 songs per genre)
| | Real songs | Words | Words + Melody first |
|---|---|---|---|
| Syllables a second (verse lines) | **2.1** | 2.4 | 2.5 |
| Chorus lines vs verse lines | **×0.93** | ×0.79 | ×0.76 |
| Syllables over 2+ notes | 4% | 2% | 3% |
| Syllables starting on a 16th | 11% | 11% | 13% |
| Lines ending on a soft syllable | 35% | 38% | 43% |
| Syllables a line | 7 | 6 | 6 |

Also from real songs: syllables on the beat 44%, on the "&" 38%; 1.2 syllables a word; a beat's rest between lines; a line's last syllable held about a beat and a half; 61% of the beats inside a line have a syllable on them.

- Rhythm Words was already close: its 16ths, line lengths and soft endings are about right.
- It sang about 15% too fast, and its choruses slowed down far more than real ones do (a chorus is barely slower in real songs).
- Hard rock is a little quicker (2.3 a second); the other genres have too few songs with words to tell apart, so they lean on all songs.

## What Real songs does to Rhythm Words now
- Syllables a second as real singers sing them, by genre; each song keeps its own lean (wordier or sparer).
- A chorus's lines only about 7% slower than a verse's (was about 28%).
- Lines ending on a soft syllable as often as real songs (35%; pop 25%).

## After (`REAL=1`)
| | Syllables a second | Chorus vs verse | Soft endings | Realism |
|---|---|---|---|---|
| Words | 2.4 → 2.2 | ×0.79 → ×0.90 | 38 → 33% | 83 → 86 |
| Words + Melody first | 2.5 → 2.3 | ×0.76 → ×0.96 | 43 → 41% | 84 → 85 |

Realism includes the rest of the Real songs switch. With the switch off, nothing changes in the music. The note under the song now says the syllables a second it actually sings.

## Not done
- Syllables over 2+ notes stay at 1-3% against real songs' 4%: Rhythm Words sets one syllable a note, and the melody style's melisma doesn't reach it. A small, separate change if it matters by ear.
- Stresses on beats: real stress can't be read from karaoke text without a dictionary.

## Files
`scripts/study/lakh-words.ts`, `scripts/study/lakh-songs.ts` (reads words and tempo), `src/realism/words.json`, `src/realism/words.ts`, `src/parts/vocal.ts`, `src/parts/melody.ts` (a chorus's own word rate), `scripts/realism-lab.ts` (the words line).
