# Words that sound as written (plan, 2026-10-19)

Goal: when the singer sings a word, you hear that word. Today the app sings made-up English-sounding words
(`src/parts/lyrics.ts`), so nothing has been held to "does it sound like what is written". This is the
plan to bring in the missing sounds and to test, with numbers, whether they work.

Test bench: the voice creator's **Words** tab (`voice-creator.html`, `src/lab/words.ts`, dev only).

## 1. What the engine has and lacks
Has: 15 vowels (`Vowel` in `lyrics.ts`), 23 consonants (`CONS` in `sing.ts`: stops, nasals, fricatives, affricates, liquids, h).
Lacks, so a real word is sung as the nearest sound (the Words tab flags each one):
1. **R-coloured vowel (ER)**: "world, bird, never, water, her". DONE (2026-10-19): its own vowel, F1/F2/F3 490/1320/1680 Hz, and F3 (and F4) brought up to F2's level while it sounds, so the r-colour is heard (it was the F3 level, not its position: 17 dB under F2). Paul: better.
2. **Dark l at the end** ("all, cold, fall, little"). DONE (2026-10-19): `DARK_L` in `sing.ts` for every syllable-final l: F1 450, F2 850, F3 2700 (a real voice saying "bell": F2 1350 falling to 800, F3 2700).
3. **Flapped t/d between vowels** ("water, better, city"). DONE (2026-10-19): `DX` in `CONS`, a 30 ms voiced tap with the alveolar formants and no burst; the Words tab writes it for a t/d between a stressed and an unstressed vowel.
4. **Syllabic l/n** ("little, bottle, button"). DONE (2026-10-19): `Syllable.syllabic`: a hint of vowel, then the l or n held to the note's end.
5. **Glottal stop**, "uh-oh", "button" (later).
6. zh ("vision") sung as sh.
Also to check, not yet flagged: how clearly each consonant is told apart (b/p voicing, s/sh, f/th, m/n), the transitions of the vowel into and out of consonants, and final consonants being released.

## 2. How to test (four layers, cheapest first)
**A. By ear, structured (the Words tab, built).** Test sets with one button each:
- Vowels: 15 words that differ only in the vowel (heed hid hayed head had hod hawed hoed hood whod hud heard hide howd hoyd).
- Consonants: each one between two "ah" (aCa).
- Minimal pairs: bat/pat, sheep/cheap, thin/sin/fin/tin, ban/man/van...
- R sounds and endings: the five gaps above.
- Real lines.
For each sound: can you tell which word it is without looking? Mark the ones that blur. Repeat after each change, old against new.

**B. Blind quiz (next to build).** The page plays one word, you pick it from 2-4 minimal-pair choices; the page keeps accuracy per sound. Order is random and the version (old/new) is hidden. Gives a number per sound that you can compare run to run.

**C. A speech recognizer as a second listener (next; needs your OK).** Render each test line, ask a recognizer (Whisper tiny English, run in the browser page) what it hears, and score word error rate against the written line.
- Caveats: recognizers are trained on speech, so singing scores worse than a human would judge. Use it for before/after and for finding the worst sounds, not as an absolute pass mark.
- Add a spoken baseline (the same words with no melody, short flat notes) to separate "the sounds are unclear" from "it is sung".
- Needs a one-time model download (about 40 MB, from a public model host). Ask first.

**D. Regression set.** About 40 fixed lines (all sounds, hard clusters like "strong", "world", "thousands"), rendered per voice, scored by B and C, results kept in a file. Run after any change to the sounds or the voices.

## 3. Build order (each step tested by A-D before the next)
1. Dictionary: add the full CMU pronouncing dictionary (BSD licence; dev-only package for the lab, a trimmed word list later for the app) and a spelling-to-sound fallback for unknown words. Now: about 250 words built into `words.ts`.
2. ER, dark l, flapped t/d, syllabic l/n: all done; Paul to listen to the last two.
3. Consonant clarity: stop bursts and voicing, s/sh/th/f spectra, formant transitions into and out of the vowel, released final consonants. Tuned against the minimal pairs.
4. Bring real words into the app's lyrics: choose real words by mood and stress pattern in place of made-up ones, spelled as sung (the lyric line then shows what is sung).

## 4. Done means
- Quiz: at least 90% per sound, none under 80%, on the main voices (Rock, Pop, Woman, Chester).
- Recognizer: sung lines within about 1.5x the word error rate of the spoken baseline.
- By ear: Paul hears the real lines and agrees they sound as written.

## 5. Tools
- `npm run track-check -- bird` (or `-- --wav file.wav`): F1-F3 and their levels every 40 ms through a word; `experiments/kokoro-singer/speak-words.mjs` makes Kokoro speak words as the real reference.
- `npm run formant-check`: each vowel held on a note; `npm run words-check`: the Words tab's lines rendered with no audio, checked for NaN, clipping, silence.
