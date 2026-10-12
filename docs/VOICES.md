# Voices and registers: a study (2026-10-12)

This study came from Paul's feedback:
- Keep the clear voice as it is.
- Build the raspy and deep voices from a different sound source.
- Find out how one voice sings both low and high. Today it sounds weird, as if only the frequency changes.

## 1. What the singer does today
- **The low voice:**
  - One fixed vocal tract (the same formants at every pitch) and one fixed pulse shape from the vocal folds.
  - Only the pitch moves. Loudness changes the brightness and the breath a little.
  - A high note is the low voice's sound pushed up, not a singer changing gear.
  - The one adjustment is crude: F1 is kept above the pitch so the note doesn't vanish.
- **The high voice:** the low voice's melody an octave up, with every formant raised 17%. It's another, smaller person singing at double the pitch. That combination gives the "pitched-up" effect.
- **The current raspy and deep voices** use the same engine with tweaks, so they inherit both problems.

## 2. How a real singer goes low and high
**The person stays; the vocal folds change gear.**
- A singer's vocal tract barely changes with pitch, so the resonances that make them sound like *them* stay put.
- What changes is the vocal-fold vibration, the register:
  - **Chest (M1):** the folds are closed for more than half of each cycle, so the sound is rich in overtones.
  - **Head and mix:** the folds stay open longer, so the overtones are weaker.
  - **Falsetto (M2):** the folds are open for over 70% of each cycle, and almost all the energy sits in the fundamental.
  - Contact time drops by about 0.27 of a cycle going from chest to falsetto ([NCVS](https://ncvs.org/tutorials/voluntary-register-changes/), [Henrich et al.](https://www.phys.unsw.edu.au/jw/reprints/m1m2.pdf)).
- In falsetto the resonances drop a little: R1 by about 65 Hz and R2 by about 90 Hz. Singers differ in how they do it ([UNSW](https://www.phys.unsw.edu.au/jw/reprints/m1m2.pdf)).
- Registers aren't switches. They blend over a few notes, and singers vary. A synth should treat it as a continuous dial, not three modes ([Stuttgart EGG notes](https://www2.ims.uni-stuttgart.de/EGG/page11.htm)).

**One dial for the vocal folds: the LF model's Rd.**
- The standard model of the glottal pulse is the Liljencrants-Fant (LF) model. It can be run from a single value, Rd, which follows vocal effort:
  - **Low Rd:** tense or pressed (belting, shouting).
  - **High Rd:** lax and breathy (soft, falsetto).
- Pink Trombone uses exactly this, adding breath noise as the voice gets laxer ([arXiv 2307.04702](https://arxiv.org/pdf/2307.04702)).
- Listeners hear the tense end as angry and the lax end as sad ([Murphy et al. 2017](https://www.isca-archive.org/interspeech_2017/murphy17_interspeech.html)).
- A falsetto study found that the right settings depend on pitch: opening the folds longer helps in the middle range but sounds unnatural if overdone ([IEICE 2024](https://ken.ieice.org/ken/paper/20240301McCv/eng/)).

**High notes change the vowels (formant tuning).**
- **Belters (pop and rock):** they open the vowel so F1 sits on the 2nd harmonic. For men on G4-C5, F1 rises toward about 1 kHz: "ee" opens toward "ih", "oo" toward "oh".
- **Classical singers:** they tune F1 to the fundamental instead.
- That belt colour only holds over about a fifth without modifying the vowel ([Titze 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2757425), [Titze on belt vowels](https://vocology.utah.edu/_resources/documents/formant_frequency_shifts_titze.pdf)).
- Singers who reach higher modify their vowels more ([Chládková 2009](https://www.isca-archive.org/interspeech_2009/chladkova09_interspeech.html)).

**Rasp and growl come from structures above the vocal folds.**
- The false (ventricular) folds or the aryepiglottic folds vibrate along with the vocal folds.
- This modulates the sound and adds subharmonics, for example half the pitch, or a 3:1 lock (filmed in a rock singer imitating Freddie Mercury).
- Subharmonics give the impression "of a sound production system driven to its limits" ([Herbst et al.](https://pubmed.ncbi.nlm.nih.gov/27079680/), [DAFx 2004 growl synthesis](https://dafx.de/paper-archive/2004/P_049.PDF), [vocal distortion types](https://kyushu-u.elsevierpure.com/en/publications/analysis-and-categorization-of-various-types-of-vocal-distortion-/)).
- More false-fold closure means more distortion. The harshest sounds are aperiodic ([Voice Foundation 2025](https://voicefoundation.org/view/2025-abstracts/entry/2856/)).

## 3. What a singer should do, by where the note sits in *their* range
Each voice gets its own range and its own break points (passaggio). Notes are placed relative to those points, not by absolute pitch.

| Where in the range | Vocal folds (Rd, open time) | Vowel | Colour | Extras |
|---|---|---|---|---|
| Bottom | lax chest, long closed phase | as spoken | dark, warm | a little fry at the ends of lines |
| Middle | chest, tension follows loudness | as spoken | the voice's own | |
| Around the break | mix: blending over 3-4 notes | starts opening | | an occasional flip or crack, as expression |
| Top, loud (wails) | pressed and tense (low Rd) | opened: F1 onto the 2nd harmonic | bright, "twang" at 2-4 kHz, larynx up (formants +3-5%) | rasp grows here |
| Top, soft (dreamy) | head or falsetto (high Rd, open > 70%) | slightly darker (R1, R2 lower) | steep tilt, airy | more breath noise |

Every voice then shares the same formants (the same tract) from bottom to top. Only these source and vowel rules move.

## 4. A different sound source: three options
**A. Our own glottal source, LF/Rd (recommended first).**
- A new voice engine:
  - An LF glottal pulse with a continuous Rd.
  - The register rules above.
  - Vowel tuning on high notes.
  - False-fold modulation for rasp (subharmonics that lock to the pitch, coming and going with effort).
  - Breath noise shaped by the pulse.
- It would keep today's consonants, sent through the new source.
- **Pros:** no download, as fast as today, every rule measurable.
- **Cons:** still a synthesizer. It will sound like a much better-behaved synth singer, not a recording.

**B. Measured real voices (step 2, builds on A).**
- **The data:** [VocalSet](https://zenodo.org/records/1442513) (CC BY 4.0, credit required) has 20 professional singers on all five vowels, sung as scales, arpeggios and long tones. It includes belt, breathy, vocal fry, straight and vibrato ([technique labels](https://arxiv.org/pdf/2206.12230)).
- **The plan:**
  - Analyse it once, offline (with a WORLD-style analysis: pitch, spectral envelope, noisiness; [WORLD](https://www.isc.meiji.ac.jp/~mmorise/world/english/introductions.html), modified-BSD).
  - From that, build a small table per singer: what each vowel looks like at each pitch.
  - Drive engine A's filter from those tables.
- The register changes then come from a real singer's own data at every pitch, and "deep" can be a real low male voice.
- **Caveats:**
  - These are trained, mostly classical singers with no rock grit, so the rasp still comes from A.
  - Consonants stay synthetic.
  - The analysis needs an 8 GB download once on the dev machine (not in the app). The app ships tables of a few hundred KB.

**C. An AI singing voice (later, as the roadmap says).**
- DiffSinger and DDSP-style models give the most real sound.
- But no ready browser version turned up ([DDSP in the browser: Tone Transfer](https://magenta.tensorflow.org/tone-transfer)), and the models are large.
- Voicebank licences vary; some forbid redistribution ([NoLyui terms](https://nolyui.carrd.co/)).

## 5. Done so far
- Step 1 (2026-10-12), option A only (no VocalSet download, Paul): the voice box
  (`src/audio/voicebox.ts`: the LF pulse with Rd, period by period, jitter, shimmer, false folds, breath
  on each pulse; Klatt's vocal tract ported from klatt-syn) and the register rules in
  `src/audio/sing.ts` (`PEOPLE`: raspy and deep, each with a break, chest, belt and head pulses, rasp,
  fry). Clear stays on klatt-syn. Measurements: docs/VOCAL.md, section 7, "Voices".
- Checked: the LF pulse's H1-H2 follows Rd as published (Rd 0.4: about -4 dB, 1.0: +3, 2.2: +14).

## 6. The plan
1. **Engine A for raspy and deep, each its own person with its own range:**
   - **Deep:** a bass-baritone; break around C4-D4; its wails are belts near the top of its range.
   - **Raspy:** a rock tenor-baritone; break around E4-F4; belts above; rasp tied to effort and to the top of the range.
   - Clear stays on today's engine, untouched.
2. **Rethink "high voice" as its own person, not the low voice shifted.** An alto (or tenor) with its own break points, singing the melody where it sits well for them.
3. **Measure it silently, as before:**
   - Brightness and noise per register.
   - That a note just above the break sounds closer to one just below than it does today, with no jumps.
   - Levels against the clear voice.
4. **If A isn't real enough, add B:** a measured VocalSet singer for deep first.
