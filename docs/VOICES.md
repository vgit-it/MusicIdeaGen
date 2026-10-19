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

## 5. Step 1
- Step 1 (2026-10-12), option A only (no VocalSet download, Paul): the voice box
  (`src/audio/voicebox.ts`: the LF pulse with Rd, period by period, jitter, shimmer, false folds, breath
  on each pulse; Klatt's vocal tract ported from klatt-syn) and the register rules in
  `src/audio/sing.ts` (`PEOPLE`: raspy and deep, each with a break, chest, belt and head pulses, rasp,
  fry). Clear stays on klatt-syn. Measurements: docs/VOCAL.md, section 7, "Voices".
- Checked: the LF pulse's H1-H2 follows Rd as published (Rd 0.4: about -4 dB, 1.0: +3, 2.2: +14).

## 6. Round by round with Paul (clips, 2026-10-12)
What he heard, what it turned out to be, what changed (clips made by `npm run voice-lab`):
1. Everything muffled: Klatt's design stops at 5 kHz, and the voice rendered at 22 kHz. Rendered at
   44.1 kHz, Klatt's output low-pass off, formants added above 5 kHz.
2. All of it sounded like an opera singer: a lowered larynx (dark), covered vowels, wide steady vibrato
   (classical, per the research). A rock recipe: vowels as spoken, little uneven vibrato, harder starts.
3. Nasal, clicks, deeper: too much 2-4 kHz; filters switched off and on between sounds (clicks); sung
   lower. Less twang, filters never reset, levels gliding over 3 ms, nasal resonance eased in and out.
4. More low end and breath all through; crackle on "s": the hiss was chopped by the folds' cycles.
   A low shelf, breath on every vowel, voiceless hiss left unchopped.
5. Still nasal: a wide F1 and a bump near 250 Hz are what nasal vowels have. Removed; picked clip 73
   (relaxed folds, the voice-box source).
6. Genre versions of 73, then the same person singing higher: a power belt, a squeal, a scream,
   falsetto. The middle sounded falsetto-like: F1 sitting on the note (a hoot); then like Mickey Mouse
   when the vowel was opened too far.
7. Paul asked for three registers (deep, mid, high) mixed by pitch: three vocal tracts, each with its
   own pulse, sounding in step.

## 7. The voice lab (`voice-lab.html`, dev only)
Pick a voice, a pitch (a note at a time), a vowel, how hard; mix the three registers with sliders;
solo each; save mixes at a few pitches and hear a scale or the phrase move between them; copy the
settings back. What Paul's mixes showed:
- The mid register is the backbone (a third to a half), except on "ah", where it sounds hollow.
- Deep and high share the rest, and their balance is the voice's brightness: grunge darker (deep
  never leaves), rock brighter (high leads, deep kept in around the break).
- The vowel moves the mid share far more than loudness does; louder wants more grit, breath and drive.
- "Ah" sounded hollow: almost nothing at 1.5-4 kHz. Edge (the folds closing faster, less tilt)
  filled it: "excellent". Half as much on the front vowels, which have a resonance up there already.

## 8. A singer, not a fixed tone (2026-10-13, the timbre lab: `npm run timbre-lab`)
Paul: "make it more Alice in Chains, or a voice like Eddie Vedder"; "the real singer aspect"; "reduce
some of that opera voice"; "remove the noise". Tried and dropped first: more rasp and creak (vocal
fry) at five amounts ("acting weird at different places": the base was better).
- **Expression** (`expr`, every voice): the tone moves with the moment. By the section's energy
  (verses closer, breathier, darker; choruses open, brighter, edgier), a little different each line,
  soft breathy or hard punchy starts, the tone thinning into breath at a line's end, strain up high
  (edge, a little grit; now and then a small crack on a long pushed note), rounder down low, weight on
  stressed long words. The singer gets each section's energy.
- **Plain** (`plain` 0.6, every voice): less operatic. Vibrato only on the longer notes, later and
  narrower, about a fifth of them straight; the 3-5 kHz ring wider and 2 dB quieter; no swell.
- **Less noise**: breath 7 dB down on every voice, the rasp's noise 3 dB down, expression's breath
  smaller (breath noise about -30 dB under the voice, was about -23).
- **Characters** (the Voice menu, on top of the song's voice): Big & dark (Vedder-like: a longer
  throat, round covered vowels, a fuller low end, a slow wobble, scoops into notes, sags at their
  ends, chest voice higher) and Dark & nasal (Staley-like: nasal, a metallic edge, a tight narrow
  vibrato, bends into notes).

- **Raw** (`raw` 1, every voice; Paul: "in the mid-high range it's sounding like an opera singer, not
  because of vibrato but timbre"; with raw: "much better"): a trained singer keeps the throat low and
  the vowels round all the way up; a rock singer's throat rises with the pitch. From an octave under
  the break: formants up to 7%, no covering, formants up to 1.5x wider, more edge, brighter.
- **The high voice** nearer the low one ("a bit too different", then "even closer"): nearly the same
  person (formants x1.04, was 1.17), and its break 10 semitones up with it (it was an octave up and singing past its break most of the time).
- Dark & nasal breathier (breath -30); Big & dark less operatic in its normal range (a less low
  throat, little covering, brighter, wider formants, less vibrato); rounder low notes from expression
  smaller.

- **Spread** (`spread` 0.5, Paul: "medium is ok"; the low voice only; Paul: "reduce the roundedness of the normal voices"):
  lips spread, not rounded: no covering, F2 up 3-9% (most on the front vowels), F3 up 3%, the throat
  no longer than 0.97. The high voice is left for its own round of work.

- **Soft** (every voice; Paul: "no softness ... it feels like someone shouting at you"): less push
  (a steeper tilt, less edge), softer-edged pulses, a little breath through the formants (not the
  hiss). Medium (0.5) on the normal notes, strong (1) on pushed notes (loud or reaching up) and low
  ones (Paul's pick from the clips); most in quiet sections, about half in the loudest.

- **Softer across the board** (soft 0.75 on normal notes, 1 on pushed and low ones).
- **Distortion** (`distort`, on trial for a Chester Bennington-like voice): a scream on pushed notes:
  the voice into a soft clip against its own level, darkened (two low-passes at 5 kHz), with the
  folds' turbulence in time with the pulses and every other pulse weaker; more in loud sections.

- **Chester (clean & scream)** (a third character, Chester Bennington-like; Paul: medium distortion): bright,
  forward, little vibrato, breathy when quiet, the scream (distort 0.65) on pushed notes, and a nasal
  twang (`twang` 1, Paul's pick: the 2.5-4 kHz ring up 7 dB, F1 down 3 dB, a little of the nose; `nasal` alone
  mostly muffles); less breathy than the others (breath -39).
  Then (Paul: "a bunch of cracks and noise in the pushed parts"; "lift his natural voice higher"): no
  expression cracks on a screaming voice, the scream over a belt (not the rough 'scream' register),
  half the turbulence, less period-to-period roughness from it; his break 3 semitones up (a tenor's).
  He sang 3 semitones up at first: out of the song's key (Paul: "out of tune"). A pitch shift on the
  rendered voice can't lift a singer's range; only writing the tune higher can (in key).
  Now picking the Chester voice rewrites the vocal tunes 3 semitones higher (`vocalLift` in the idea's
  options: the melody's register, floor, ceiling and wail all up 3; same seeds, so only the vocal
  changes; in key). Measured on 20 alt metal songs: 3.0 semitones higher on average, the band
  unchanged in all 20.

## 9. Polish: prepared with the real amps (2026-10-13)
Paul: one-time processing like the real amps, "start with 1 and 2" (a vocal chain; a clean-up pass), "one
button instead of separate for amps and voice". `src/audio/polish.ts`, run once over each rendered line:
- **Clean-up:** single-sample spikes (clicks, crackle) put back on the line their neighbours draw; the fizz
  above 7 kHz down 1.4 dB always and more when it flares over -14 dB of the voice; esses (5-9 kHz) brought
  down where they're over -8 dB of the voice.
- **Vocal chain:** a tube preamp (gentle, uneven saturation: warmth) and an opto compressor (LA-2A-like:
  -7 dB under the line's loudest, 3:1, quick to let go after short peaks, slow after long ones).
  No studio vocal-chain capture in the NAM collection the amps come from (guitar gear only): our own.
- The line back at its level. Sharp jumps in the sample (second differences over 4000): Chester 448 → 0,
  rock 40 → 0.
- **One button: Prepare real sound** (was Prepare real amps): polishes the singer's lines (quick; on any
  device), then runs the guitars through the real amps. Exports made with it on are polished too.

- **By genre** (Paul: "compressor vocals, or telephone vocals for specific genre like pop"): each genre's
  compression: rock natural (the opto), pop radio (the opto, then a fast peak compressor, air on top),
  hard rock / metal / alt metal heavy (6:1, quick), funk tight (quick and dry), grunge dark (tape-like
  saturation, top rolled off). And an effect sprinkled on the first verse's lead lines in about 6
  songs in 10 (the full voice comes in after it): pop a telephone (400 Hz-3.2 kHz), grunge a megaphone
  (a horn: narrow, a 1.8 kHz resonance, driven), alt metal an old radio (wider, gritty). The band is
  applied again after the drive, so the grit stays inside it. Part of the Prepare real sound pass.

- **Funk** (Paul: "the funk voice breaks at the pushed parts"): its pushed notes sat right on its break
  (E4), flipping into falsetto and back note to note (a high A dropping 11 dB). Now chest voice up to G4
  and a mix (belt) past it, not falsetto.

## 9b. Life: the last touches of a performance (2026-10-13)
Paul asked for humanization (pitch drift, vibrato that grows, timing jitter, formants with pitch,
smoothing, breath, swells). Most was already in (sections 8 and earlier: drift, jitter, vibrato fading
in, the laid-back feel, F1 above the pitch, glides, breath with the pulses, phrase arcs). New, in the
singer before any post (`life` in `src/audio/fof.ts`, on every sung voice; `rush` in `src/audio/feel.ts`):
- **Vibrato speeding up as it comes in:** about 75% of its rate at first, up to speed as it deepens; it deepens more slowly too.
- **Rushing:** in loud sections the singer is less laid back, some lines ahead of the beat, the climb to a line's top note hurried (a chorus: about 16-28 ms earlier on average, some notes 10-20 ms ahead of the beat). Quiet sections as before.
- **Vowels toward a neutral "uh" up high** (from a few semitones under the break; up to about a third of the way): as real singers' do; less of the metallic edge.
- **Held notes shaped, each its own way:** growing, fading, or growing then fading (2-4.5 dB); growing more in loud sections, fading more in quiet ones.
- **Each phrase building toward its top note** (about 3 dB), easing after it.

Clips: `npm run timbre-lab` (life-normal / -vedder / -staley, before and after).

## 10. Next
- The high voice (an octave up) is still the low voice's recipe shifted: make it its own person.
- Render in a worker, if phones stutter (three registers cost about 2.5 times the clear voice).
- More of Paul's lab mixes (other voices, vowels) to refine REGISTER_MIX and MID_FIT.

## 11. Scale check: low notes, "ee" and falsetto (2026-10-19)
Paul heard whistling up high, and low notes with no volume. Measured by the voice creator's **Scale check** tab (`src/lab/scaleCheck.ts`,
`src/lab/measure.ts`; the same numbers on the command line: `npm run fof-scale`, `-- --brief`, `-- --wav`):
- Low notes: 80-98% of the sound was the bare fundamental (a hum that a phone speaker drops), and as heard (A-weighted) 6-14 dB under the
  middle of the range. Fix: `lowBuzz` (+ `lowTop`): the fundamental's hump shrunk, a little more of the tone's slope, the loss won back in
  the voiced sound only (not the breath and rasp), jitter and the creak eased on those notes. Now about 25-60%.
- "ee" (and "oo") at low and middle pitch: 90-98% bare tone (F1 sat right on the pitch). Fix: `closeFill`: F1 let up toward the 2nd
  harmonic and widened, the hump smaller, the upper formants a little lower, the level won back. Now about 10-70%.
- Falsetto (Pop's way up): 70-93% bare tone, dips of 5-14 dB at some notes, noisy. Fix: `falFill`: F1 up toward the 2nd harmonic, a
  gentler tilt, a smaller hump, less breath. Now 0-11%, no dips, 18-40 dB clean. Lower values (0.6) brought the dips back.
- All three are on for every voice (the `SUNG` base in `voices.ts`); Chester and the Woman have a stronger `closeFill` (1.8) and their own `lowTop`.
- Not done: the very top of the high voices (above about E-flat 6, nothing in the app sings there), "ee" below about E3, and the high voice as its own person.
