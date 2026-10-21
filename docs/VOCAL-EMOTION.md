# Emotion in the vocal's notes and runs (study, 2026-10-21)

Paul's findings (mode as brightness, feeling per scale degree, contour, expectation, four axes) checked
against the current vocal (`src/parts/melody.ts`, `singers.ts`, `first.ts`, `tension.ts`), and how to
build the missing parts. Study only: nothing built yet.

## 1. Already there
| Finding | Where it lives today |
|---|---|
| Tempo + mode → mood | `autoMood` (tension.ts): minor and slow lean sad/dark, fast leans angry/happy |
| Contour: rising hope, falling sorrow | `MOOD_MELODY` contours (melancholic falls, triumphant rises); `followTension` lifts lines as tension grows |
| Leaps = drama, steps = calm | per-mood `leap` / `leaps`; Melody first scores gap-fill |
| Register, density = arousal | per-mood `register`, `busy`; section `PLANS` |
| ♭2 dread | `style.dark`: minor keys only, degree 2 flattened by chance (melody.ts:1408) |
| Blues: gritty | `style.blue` (♭3, ♭7 in passing) and blues runs |
| Expectation (Huron) | open / closed line ends; question & answer; planned clashes resolving (Melody first only); surprise score (Melody first only) |
| Signature degrees by mood | **only in the Guide line** (`colourShift`, guide/line.ts:337): raised 7 (tense, triumphant), ♭6 sigh (melancholic, nostalgic), ♭2 (dark, angry), #4 (dreamy) |

## 2. Gaps
- Main vocal has no mood degrees except ♭2 in minor. No #4, ♭6, raised 7, natural 6 in minor.
- Line endings are two-way (home / open). No "hanging" ending on 7 or 2.
- Delayed or deceptive resolution: only in Melody first's clashes. Not in Classic, Shaped, Words.
- Runs ignore mood: scale picked by minor/blues only; direction by singer only.
- No surprise budget: how much "unexpected" a mood wants isn't set.
- No single valence / arousal / tension / surprise view: each mood is a hand-tuned table.

## 3. Proposals (best value first)

### A. Mood degrees in the vocal (port the Guide's colour notes)
- Table per mood: degree, how it moves, how often.

| Mood | Degree | Moves to | Heard as |
|---|---|---|---|
| Tense | raised 7 (minor) / 7 held | up to 1 | pull, unease |
| Triumphant | 7 | up to 1, on the climb | lift |
| Melancholic | ♭6 (major) | down to 5 | yearning sigh |
| Nostalgic | ♭6 (major); natural 6 (minor) | 5; up to ♭7/1 | longing; warmth |
| Dreamy | #4 | up to 5 | wonder, float |
| Dark, angry | ♭2 | down to 1 | menace (exists, widen) |
| Happy | none (diatonic) | | |

- Placement: weak beats, or as the first half of a held note (reuse the `lean` sigh in `ornament()`).
- Safety: only when the band's chord doesn't hold a note a half step away, or resolves within an 8th.
  Mark `colour: true` so the band-fitting keeps it.
- Bonus: ♭6 lines up with the borrowed iv chord (`MOOD_PLANS`): sing it there first.
- Code: new `MOOD_DEGREES` in melody.ts; a pass after pitches, before `ornament()`.

### B. Three endings: home, open, hanging
- `ends` becomes weights: home (1), open (5 or 3), hang (7 or 2).
- By section: pre-chorus last line hangs (into the chorus); chorus last line home; verse lines open.
- By mood: tense and dreamy hang more; happy and triumphant land home; nostalgic and dreamy end the song open.
- Code: the end-note costs at melody.ts:928, :1148, :1431.

### C. Delayed resolution (Huron)
- The expected home note arrives late: a step around it first (2-7-1), or a suspension (2 or 4, then 1).
- Rare deceptive ending: lands on 6 or 3 when the chord allows.
- More often just before the climax (tension curve high), rarely in calm sections.
- Code: generalise `planClashes` (Melody first) to line ends in all writers.

### D. Runs by mood
- Same run count (Paul: runs sounded Chinese when there were many). Mood changes kind, scale, speed.

| Mood | Run scale | Direction | Speed |
|---|---|---|---|
| Happy | major blues (now) | climb, wave | 16ths |
| Triumphant | major | climb into the note | 16ths, longer at the climax |
| Nostalgic | major with ♭6 passing | cascade down | 8ths |
| Melancholic | natural minor | tail, cascade (falling) | 8ths |
| Dreamy | Lydian bit (#4) | wave | 8ths, few |
| Tense | harmonic minor bit (raised 7) | climb | 16ths, short |
| Angry | blues (now) | short tail | 16ths |
| Dark | Phrygian (♭2) | tail falling | 8ths |

- By the tension curve: rising runs in building bars, falling runs after the peak (release).
- Code: `runScale` / `runNotes` get the mood; `singer.runKinds` leaned by mood.

### E. Surprise budget
- Per section 0-2 planned surprises by mood: a colour note, a late or deceptive ending, a late entry.
- Happy, triumphant: low. Tense, dreamy: higher. Climax section: one extra.
- Code: count in the best-of-tries score (extend `musicScore` to all writers).

### F. Four axes as a thin layer (later)
- Each mood gets coordinates: valence, arousal, tension, surprise. Per bar: tension from the curve, arousal
  from tempo + energy.
- Drives only the new levers (A-E). Keeps the hand-tuned tables Paul already likes.
- Later step: a custom mood (sliders) or "eerie wonder" style mixes.

## 4. Skip or limit
- Key colour: myth (agreed). Height and timbre already handled.
- Major pentatonic as the tune's scale: Paul heard it as East Asian. Keep for runs only, mixed (now).
- Whole tone, diminished: not in these genres as tunes. At most a 3-note run bit (dreamy, tense), behind a switch.
- Phrygian dominant: only metal / altmetal with tense or dark, over a major V in minor.
- Culture caveat: Western pop/rock rules only (as now).

## 5. Plan
- Phase 1: A + B behind one switch ("Mood notes"), Auto off. Paul compares on/off per mood.
- Phase 2: D (runs) + C (late home notes).
- Phase 3: E + F.
- Check: extend `npm run melody-lab` to print per mood: colour-note share, end degrees (1 / 5-3 / 7-2),
  run directions. Proves each mood differs before listening.

## 6. Questions for Paul
- One switch for all, or one per idea (degrees, endings, runs)?
- Colour notes in all three melody writers, or Shaped / Melody first only?
- Should the Guide line and the vocal share one mood-degree table?

## 7. Built in the verse writer (2026-10-21)
The main vocal is now the verse melody writer (`src/verse/`, `docs/VERSE-SECTIONS.md`), so the study above was redone against it. Measured first (448 songs): the writer sang the same degrees, contours, leaps and register in every mood. Its notes are chord notes plus scale-step neighbours, so the feeling of a degree came only from the chords; ♭2, #4, raised 7 and the natural 6 in minor were 0–2% of the notes; phrases ended on the tonic about 20% of the time (real songs, this repo's own data: 31–37%); the tension curve was not read at all; and **the Mood picked on the track never reached the vocal** (the writer worked out the Auto mood again). The last is fixed for good: the track's mood (picked or Auto) now shapes the vocal's personality and words, and with every switch below off the line is note for note what it was (checked by hash over 120 songs).

### The switches (Vocal melody card, "Mood notes": one button each, **all on by default**; stored in the link as `vocalMoodOff`, the list of those switched off)
| Switch | What it does |
|---|---|
| Colour notes | The mood's signature degree as a short neighbour note between two of the same note, so it resolves by step at once: melancholic ♭6 (sigh down to 5), nostalgic ♭6 and the natural 6, tense raised 7 / ♭2 / #4, dreamy #4, dark ♭2 and ♭6, angry ♭2, triumphant raised 7, happy none. No half-step rub against a chord note; about one a bar at most; more when the section builds; not in the pentatonic option |
| Ending degrees | Every phrase end gets a degree by its job. Last phrase: a chorus comes home (the 1), a pre-chorus or bridge hangs (7th, 2nd, 4th), a verse leans open or hanging, the song's last bar comes home (dreamy and nostalgic stay open). Phrases inside go in pairs: a question (open: 5th, 3rd) then an answer (home). Mood and tension lean it (tense hangs, happy and triumphant come home). A phrase the writer already ended open or hanging keeps that |
| Delayed resolution | A long note (two beats or more) starts a scale step off the chord note (2nd over the 1, 4th over the 3rd, the leading tone under the tonic) and glides onto it: the expected note arrives late. More on held endings, in tense, melancholic and nostalgic moods, as tension builds |
| Contour & leaps | Each phrase rises, falls, arches or stays level by mood and section (melancholic and dark fall, tense and triumphant rise, a chorus arches); leaning which chord note a bar sits on and the octave. Angry, tense and triumphant leap more, melancholic and dreamy move by step |
| Arousal | Register (±2 semitones), 16th runs, long notes, stretched 8ths and pushes from the mood, the tempo (against 110 bpm) and the section's energy. Fast and intense sits higher and busier, slow and calm lower and longer |
| Tension curve | Reads the song's tension bar by bar (as the band does): more colour notes and delayed resolutions, hanging ends as it builds, home ends as it eases; the register drifts with it |
| Mood over mode | The mood is compared with the mode (Lydian brightest … Phrygian darkest): when the mood is brighter than the key (a Happy song in minor) the chord notes and colour notes lean bright; darker (Melancholic in major), dark. Off: the mode's own feel only |
| Surprise | 0 to 2 a section by mood (calm moods fewer, tense and dreamy more, the climax one extra), kept for the second half: a note pushed a 16th early, a note off the scale (a semitone out and straight back), a deceptive ending (the tonic becomes the chord's 6th or 3rd) |

### Under the switches: the four axes (`src/verse/emotion.ts`)
- Valence = the mood against the mode (`tiltOf`); arousal = the mood, tempo and energy (`arousalOf`); tension = the section's curve per bar; surprise = the mood's budget (`MOOD` table: one row per mood with all its numbers).
- Each rule rolls its own dice, so a switch changes only its own notes. Rules go in the pipeline at: tone picks (contour, mood over mode), the octave pull (contour, tension), after the phrase endings (ending degrees), after the bends (colour, surprise, then delayed resolution). Choruses are still one melody per song: a chorus built like its master takes the master's mood view (its tension, energy, climax).
- `scripts/emotion-check.ts` (`npm run emotion-check`; `ONLY=colour`, `OFF=1`, `N=`): writes every song in all 8 moods and prints degrees, ends, contour, leaps, colour notes, suspensions and surprises per mood; and the rules that must hold (no overlaps, colour notes resolved, every delayed resolution onto a chord note). `EMO=1 npm run bend-check | long-hold-check | core-key-check | verse-variety` run those checks with the switches on.

### What it measured (56 songs × 8 moods, same songs, only the mood differs; switches on against all off)
- Contour (first note of a phrase to the sounding last note): melancholic -0.3 semitones on average (off: +0.4), dark 0.0, angry +0.2, dreamy +0.8, nostalgic +0.9, tense +1.2, triumphant +1.2, happy +1.5 (off: +0.3 to +0.6 everywhere). Leaps of 5+ semitones: angry, happy, triumphant 21-22%, tense 20%, melancholic and dark 18%, dreamy 17% (17-18% with the switches off).
- Colour notes per 10 sections: tense 4.4, dark 4.6, melancholic 3.0, triumphant 3.0, angry 2.4, dreamy 1.9, nostalgic 1.7, happy none.
- Chorus last phrases end on the tonic 23-36% (triumphant 36%, dreamy 23%); with the switches off 14-20%. Real songs end phrases on it 31-37%.
- Delayed resolutions per 10 sections: melancholic 2.1, dreamy 1.8, nostalgic 1.7, tense 1.3, happy 0.5. Surprises: tense 4.3, dreamy 4.2, angry 3.2, dark 3.1, melancholic 2.2, nostalgic 2.0, happy and triumphant 1.5.
- Held to: no overlaps or notes out of range, every colour note resolves to the note it left, every delayed resolution lands on a chord note; `EMO=1` `bend-check` (224 songs), `long-hold-check`, `core-key-check` and `verse-variety` (no overlaps, no short units; the pre-chorus climb 55%, under the variety cap) pass.
- Two things found on the way: a home ending was bent away from the tonic by rule 15's bend inside a held note (so home and hanging endings are no longer bent), and colour notes ran before the bends and could lose the note they resolve to (now they run after).

### Not built / for later
- A mood per section and a custom mood (sliders): the axes are in place; the card has no sliders.
- Other scales (whole tone, diminished, Phrygian dominant): still out, as in section 4.
- `paced` (the tempo option for the dials, off since the verse writer came in) is left as it is; Arousal reads the tempo itself.
