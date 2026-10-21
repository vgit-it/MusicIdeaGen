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
