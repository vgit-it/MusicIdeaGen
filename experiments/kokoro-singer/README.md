# Kokoro singer test

Can a sampled singer, built from voice pieces that Kokoro (an Apache 2.0 speech model) speaks once on
this PC, beat the FOF singer? Separate from the app; nothing here ships.

1. `lines.ts`: 8 sung lines from two generated rock songs -> `out/lines.json`; the same lines by the
   app's FOF singer -> `out/fof.wav` (run from the repo root, see the file's header).
2. `render.mjs`: Kokoro speaks the pieces those lines need (onset into a long vowel, vowel into coda,
   and whole syllables) in 3 voices -> `out/pieces/` (`npm install`, `node render.mjs`).
3. `sing.py`: joins the pieces, stretches the vowels to the notes, puts them on the melody with
   Praat's PSOLA -> `out/A-pieces-<voice>.wav` (joined pieces, the real plan) and
   `out/B-syllables-<voice>.wav` (whole spoken syllables, to hear what the joins cost)
   (`python -m venv .venv`, `pip install praat-parselmouth numpy soundfile`, `.venv/Scripts/python sing.py`).
4. `check.py`: pitch on the notes.

## Round 2 (`sing2.py`, `joins.py`)
Paul on round 1: B better than A, the joins not working, sounds like talking through autotune.
- D (VCV pieces, as UTAU banks): Kokoro says one vowel through the consonants into the next vowel;
  pieces are joined only in the held middles of vowels. A phrase is joined first, then sung in one
  pass (one pitch line, one PSOLA), each piece first brought to one steady pitch so the joins line up.
- Pitch like a singer: a spring from note to note, scoops and falls, vibrato on long notes, a slow drift.
- Fixed: Kokoro's breath and silence before each piece (joins were landing in it).
- Measured (dip between notes over smooth consonants, median): A 20 dB, B 17 dB, D 3-7 dB.
- C (whole syllables sung phrase by phrase) was no better than B: dropped.

## Round 3: voice prints (`print-render.mjs`, `print-measure.py`, `print-sing.ts`)
Paul: not good enough as samples; use Kokoro only for a starting timbre, and our FOF singer for the rest.
- Kokoro says every vowel in an "h_d" word (4 voices); Praat measures F1-F3 per vowel (diphthongs: start
  and end), F4-F5 and formant widths, at the steadiest analysis ceiling per token; a misread vowel
  (off the textbook by a third, after the voice's size) falls back to the textbook's, scaled.
- The FOF singer takes an optional `print` (`src/audio/fof.ts`; `layout` in `sing.ts` takes a vowel
  table); left out, every voice is as before.
- Takes: P1 rock textbook, P2 rock + Michael's print, P3 rock + Fenrir's, P4 woman textbook, P5 woman +
  Heart's. bm_george measured unreliably (many vowels misread): left out.
- Paul: Michael's print sounds decent; wants grungier voices. All 13 Kokoro men measured; the deepest and
  most reliably measured (Onyx, Daniel, Lewis, Puck) and Michael sung on grunge lines (`GENRE=grunge`
  lines.ts, `SET=grunge` print-sing.ts) with the grunge voice: G0 textbook, G1-G5 prints; G6/G7 the
  Cornell character, textbook vs Michael's print.
- Paul: Onyx clean is a good voice; wants a new, Vedder-deep voice from scratch (not Onyx changed).
  `blend.mjs`: new men from Kokoro's style vectors (the voice half only): the deep men (Lewis, Daniel,
  Adam) averaged, then grown along the direction in which the 13 men's measured size grows. Pushing
  away from the light men instead blurred the vowels. new_size84 measured 10% bigger than the
  textbook (Onyx 2%), 2 vowels misread. Sung on the Big & dark character, clean: W1; with grain: W2;
  3 semitones lower: W3 (the key moves: in the app the tune would be written for him in key).
- Paul: the new man is great; match the speaking clip. `spans.py` + `match.ts`: both say the same held
  vowels at his pitch; tone in third-octave bands; the singer's settings searched one at a time, then an
  octave tone-match EQ (`print.eq`, optional in `fof.ts`). 27.6 dB off -> 6.9 dB. The match needs a much
  brighter voice (our singer is far darker than his speech) and wider formants; the brightness also lifts
  the breath noise to his level (HNR about 8 dB). M0 = W1, M1 matched, M2 matched with the breath down;
  each also says his sentence (`*-speech.wav`) next to Kokoro's.
- Paul: his "go" vs ours. The misread check (off the textbook by a third) had thrown out his forward
  "o" and "oo" (modern American: F2 about 1250 and 1290, the textbook's 920 and 880) for the textbook's,
  so ours was dark, near "aw". Now a vowel is misread only if the two takes disagree or it's impossible
  (`print-measure.py`); when the steadiest analysis setting differs between takes, the usual one is
  used. New `print.glide` (`fof.ts`): diphthongs glide through more of the vowel (capped at 0.25 s for
  long sung notes). O1: his "o"; O2: his "o" and glide 0.6. Measured in "go": F2 about 1210 (his 1245),
  was 800.

## Round: what's missing for deep textures (diag.ts, lfcheck.ts, SET=tex)
- Measured harmonic by harmonic against the new man (Kokoro) at his pitch (128 Hz), held vowels:
  - FOF as the app has it (deep, his print): 2.7-5 kHz harmonics ~50 dB too quiet, 250-500 Hz 10-14 dB short on ee/oo, valleys between F1 and F2 18 dB (his 11), pulses blunt (crest 4.5 dB, his 7.2). 34.6 dB off.
  - The tone match only hid it: formants 2.4x too wide, brightness +12.5. 5.0 dB off with EQ.
  - Sharper grain attacks help the valleys a bit (29 dB off); alternating grain signs make them worse.
- The cause: no real fold pulse. Lab option `lab.cascade` in fof.ts: an LF pulse (Fant's Rd: one dial from pressed to breathy) through F1-F6 in series (Klatt resonators); the breath, rasp and h made at the folds and shaped by the same tract.
  - Untuned: 6.8 dB off (Rd 0.9-1.2). Valleys 5-7, crest 8-10. Searched (Rd, bw, tract) + EQ: 4.1.
  - Same grit 0.3 / breath -38: FOF HNR 2.8 dB (mostly noise), pulse 14.5 (grain inside the voice).
  - Left: above 5 kHz ~5 dB brighter than him; H1 a little weak at low Rd; widening F4-F6 kills 3-5 kHz (tried, reverted).
- Clips: T0 FOF clean, T1 pulse clean, T2 FOF grain, T3 pulse grain, T4 pulse breathy (+ -speech).

## Round: Paul's pick, Y1 (the new man on the pulse)
- Recipe: the new man's print (new_size84), Big & dark character with covering off, clean (grit 0, breath -54),
  `lab.cascade` (Rd 1.1, 0.75 when loud), jaw open 2.5 (`lab.open`), lips spread 2 (`lab.lips`), throat 0.95.
- Steps by ear: the clean pulse (T1) "interesting" -> open the mouth (U) -> further, no rounding (X; covering was
  the rounding) -> X4 -> a bigger throat, same notes (Y1 over Y2 and pitch down).

## Round: the app's voices retuned on the pulse (retune.ts -> out/retune/)
- 15 voices: the 7 genre voices, the rock tenor, the characters (deep, nasal, cornell, chester, woman), Michael and Onyx clean prints.
- Every dial kept; the tone dials mapped onto the pulse (`lab.cascade.dials`: bright/edge/pushed -> lower Rd,
  soft -> higher, falsetto breathy and belt/scream pressed past the break, twang/edge -> F3-F4 narrower, body -> a low shelf under 300 Hz).
- Balance to 2.5 kHz matched to the old voice (Rd searched within 0.6-1.4: all landed on 1.4; then an EQ, mostly
  more low end at 125-250 Hz); above 5 kHz 6 dB down; the noise (`lab.cascade.noise`) set to the old voice's cleanness, then 3 dB cleaner.
- Sung lines: cleanness within about 1-2.5 dB of the old voices; above 5 kHz -18..-26 dB (old -27..-42, a real voice about -22).
- Paul listens A (old) vs B (pulse), in batches.

## Outcome (Paul): no pulse; Onyx clean added to the app
- Paul: "the old voices are better". The pulse code taken out of fof.ts (the clips and scripts here need it back to run).
- Onyx clean is the app's 'onyx' character (Voice menu "Onyx (clean) voice"; src/audio/prints.ts); identical to H-onyx-clean.
