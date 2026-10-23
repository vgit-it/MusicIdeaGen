# Intervals: melodies that carry the mood (plan)

Goal: the lead vocal (the verse melody writer, `src/verse/`) conveys the song's Mood through **which intervals it sings**, not only through hooks, endings and register.
Rule of thumb from the research: **choose the scale for colour, choose the intervals for energy and feeling.**

Status: plan only (2026-10-23). Nothing built yet.

## 1. Why (what the writer does today)
- **The vocal ignores the chosen Mood.** `personalityOf` (`src/verse/section.ts`) and the words (`src/verse/sing.ts`) call `autoMood(...)`, so the vocal always gets the mood Auto would pick from genre, key and tempo. Pick Melancholic and the vocal may be written as Happy.
- **Mood never touches intervals.** It tilts the hook, phrase endings, chorus and bridge lift, silence (`personality.ts`). That's all.
- **Intervals are side effects.** How a pitch is chosen now:
  1. Each bar's core note is a chord note (root, 3rd, 5th) by weights (rule 4 `randomTones`, rule 21 `rerollTones`), kept in the key (rule 27).
  2. `voiceLead` puts it in the octave nearest the last note (smallest leap), with a flat 25-30% chance of the other octave (rule 25).
  3. Neighbour notes one scale step up or down (rule 8 `addNeighbours`), walks by scale step into the next bar (rule 9 `walkToNext`), open / hang endings (`phraseEndings`), bends (rules 15, 28).
- So every mood gets about the same mix of steps, leaps, ups and downs. That's why it doesn't sound emotional.

## 2. The research (rough notes, kept for reference)
**Each interval's feeling (melodic, note to note):**

| Semitones | Interval | Feeling |
|---|---|---|
| 0 | unison / repeat | static, insistent, tension if held |
| 1 | minor 2nd | anxious, tense, pain (Jaws) |
| 2 | major 2nd | neutral, calm, stepwise |
| 3 | minor 3rd | sad, tender |
| 4 | major 3rd | happy, bright, stable |
| 5 | perfect 4th | open, strong, call-like |
| 6 | tritone | unstable, ominous |
| 7 | perfect 5th | powerful, empty, heroic |
| 8 | minor 6th | yearning, bittersweet |
| 9 | major 6th | warm, hopeful, nostalgic |
| 10 | minor 7th | bluesy, wanting |
| 11 | major 7th | longing, dreamy, ache |
| 12 | octave | completion, grand leap |

**Theories:**
- Size = energy (Huron, Juslin): small steps calm, sad, intimate; big leaps excited, dramatic, joyful or angry.
- Direction: up = effort, hope, tension; down = relaxing, sorrow, resolution.
- Gap-fill (Meyer, Narmour): a big leap makes you expect a step back the other way. Breaking it surprises.
- Implication-realization (Narmour): a small interval implies going on the same way; a large one implies turning back.
- Sad = small, falling, minor (like sad speech: narrow and falling). Excited speech = big jumps.
- Consonance: simple ratios (octave, 5th) stable; complex ones (minor 2nd, tritone) rough, tense.
- Cooke's degree pairs (e.g. 1→♭6→5): intuitive, weak evidence.

**Caveats:** one interval alone is ambiguous: the key, rhythm and chords shape what it means. Melodic ≠ harmonic. Part of it is learned. So the plan keeps the chord grounding and only **leans** the choices.

## 3. What we take, and where it goes
| From the research | Use | Where |
|---|---|---|
| Interval feelings (table above) | **Core.** A weight per interval per mood | Scoring the next note (step 3) |
| Size = energy (arousal) | **Yes.** A target average step size per mood | Replaces the flat octave chance (rule 25) |
| Direction | **Yes.** An up-share per mood, and phrase shapes | Scoring + phrase endings (step 4) |
| Gap-fill / implication-realization | **Yes.** After a leap, a step back; some moods break it | Scoring (step 4) |
| Warm vs harsh (valence) | **Yes.** Neighbour and passing notes: half step vs whole step | Rules 8, 9 (step 5) |
| Tension → more rough intervals | **Yes.** The song's tension curve per bar (`idea.tension`) scales it | Step 5 |
| Repeated notes = insistent | **Yes.** How many repeats in a row by mood | `limitSame` (step 5) |
| Cooke degree pairs | **Later, small.** A "sigh" (♭6→5, 4→3) for Melancholic / Nostalgic only | Optional step 7 |
| Ratios / roughness theory | No. Background; the weights already cover it | — |

**Replaced:** `voiceLead`'s "nearest octave" placement and rule 25's flat octave chance (when the switch is on).
**Added on top:** the interval profile, gap-fill, direction lean, neighbour colour, tension link.
**Kept as is:** rhythm, phrasing, hooks, endings' kinds, holds, bends, silence fit, chord grounding, rule 20, rule 27, pentatonic option, range, one melody per chorus.

## 4. The interval profile (a mood's 5 dials)
A new `src/verse/intervals.ts`: one profile per mood, `profileFor(mood, kind, tension)`.
- **weights[0..12]**: how much the mood likes each interval size (feelings table).
- **size**: target average interval in semitones (arousal).
- **up**: share of moves that go up (direction).
- **fill**: chance a leap of 5+ semitones is followed by a step back the other way (low = more surprise).
- **strength** (0-1): how hard the profile leans against today's smooth voice leading. Start at 0.6; Paul tunes by ear.

First guesses (tune by ear and by the check in step 2):

| Mood | size | up | fill | Liked most (weight > 1.2) | Avoided (< 0.5) |
|---|---|---|---|---|---|
| Happy | 3.5 | 0.60 | 0.80 | maj 3rd, 4th, 5th, maj 6th | min 2nd, tritone, min 6th, 7ths |
| Melancholic | 2.2 | 0.40 | 0.90 | min 2nd, maj 2nd, min 3rd, min 6th | tritone, maj 6th, 7ths, octave |
| Nostalgic | 3.0 | 0.45 | 0.90 | maj 2nd, min 6th, maj 6th | tritone, min 7th, maj 7th |
| Tense | 2.5 | 0.60 | 0.50 | repeat, min 2nd, tritone | maj 6th |
| Angry | 4.5 | 0.50 | 0.60 | repeat, 4th, 5th, octave | maj 6th |
| Dreamy | 3.2 | 0.50 | 0.50 | maj 2nd, maj 6th, maj 7th | min 2nd, tritone |
| Triumphant | 4.8 | 0.65 | 0.75 | maj 3rd, 4th, 5th, octave | min 2nd, tritone, maj 7th |
| Dark | 2.6 | 0.35 | 0.80 | min 2nd, min 3rd, tritone, min 6th | maj 3rd, maj 6th |

Weights per semitone (0-12), first guess:
```
happy       1.0 0.4 1.2 0.8 1.6 1.4 0.1 1.3 0.4 1.3 0.3 0.1 0.8
melancholic 1.0 1.5 1.4 1.6 0.6 0.7 0.2 0.4 1.2 0.4 0.3 0.2 0.2
nostalgic   0.8 0.8 1.3 1.1 1.0 1.0 0.1 0.7 1.2 1.5 0.4 0.3 0.4
tense       1.6 1.8 0.9 1.0 0.5 0.7 1.2 0.5 0.6 0.3 0.5 0.6 0.3
angry       1.8 1.2 0.8 1.0 0.6 1.5 0.8 1.5 0.5 0.3 0.7 0.3 1.2
dreamy      0.6 0.4 1.5 0.9 1.1 1.0 0.2 0.9 0.7 1.4 0.6 1.2 0.6
triumphant  0.9 0.3 1.1 0.6 1.4 1.6 0.1 1.7 0.4 1.0 0.3 0.1 1.3
dark        1.3 1.7 1.0 1.3 0.4 0.8 1.1 0.7 1.3 0.2 0.6 0.4 0.4
```

**By section:** chorus size +20% and up +0.05; verse size -10%; bridge keeps its dwell (rule 24) and uses the profile only for leaps; pre-chorus up +0.1 (it climbs, rule 22).
**By tension** (per bar, `idea.tension`, 0-1): rough intervals (1, 6, 11) × (0.6 + 0.8·t); size × (0.85 + 0.3·t); up + 0.1·(t - 0.5).

## 5. Steps

### Step 1: the vocal follows the chosen Mood (fix, always on)
- Pass the song's mood into the vocal writer: `singSong(list, seed, lift, mood)` from `buildTrack` (`src/track.ts`, the `mood` already worked out there) and from `generate()` (`src/generator.ts`, `opts.mood`, Auto → `autoMood`).
- `personalityOf` and the words take that mood instead of `autoMood`.
- Songs on Auto: unchanged note for note. Songs with a picked mood: hooks, endings, lifts now follow it (expected change).
- Check: `npm run verse-variety` still passes; hash check: Auto songs identical.

### Step 2: measure first (`npm run interval-check`)
- `scripts/interval-check.ts`: the same 224 songs written once per mood (mood forced), sections as sung.
- Prints per mood and section kind: average interval size, steps (≤2) / leaps (≥5) share, up share, repeats, warm (3, 4, 8, 9) vs rough (1, 6, 11) share, gap-fill rate (leap then a step back), the full 0-12 histogram.
- Run it **before** any change: the baseline that shows today's moods are alike.
- Optional: the same numbers for real vocal lines (Lakh data already used by `src/realism/`) as a sanity band, so no mood drifts far from how real singers move (real lines are mostly steps and repeats).

### Step 3: interval-scored pitch choice (the main change)
- New `src/verse/intervals.ts` (profiles, scoring), used by `voiceLead` (`src/verse/verse.ts`) when the switch is on.
- At each core note, candidates = the bar's chord notes that are in the key (rule 27) × every octave in the main range. Score each by:
  - today's cost (closeness to the last note, range, climb / dwell pull), times (1 - strength), plus
  - the mood's liking of the interval from the last sung note: `-log(weight)`, times strength,
  - a pull of the running average size toward the mood's `size`,
  - the direction lean (`up`).
- Pick by weighted chance from the best few (not always the best), on the section's own dice, so a chorus built like its master still matches it.
- Replaces rule 25's flat octave chance when on (the octave is now chosen by the interval).
- Non-core notes (16th runs, holds on the same chord note) follow their core note as today.
- Pentatonic option: candidates from the pentatonic only.

### Step 4: direction and gap-fill
- **Gap-fill:** after a leap of 5+ semitones, the next core note gets a bonus for going back the other way by a step or small interval (chance `fill`). Breaking it (going on the same way) is the mood's "surprise".
- **Direction in phrases:** the last core note of a phrase is reached falling for down moods (Melancholic, Dark, Nostalgic) and rising for up moods (Happy, Triumphant), by `up`. Open / hang endings (`phraseEndings`) pick the chord note that fits that direction.
- **Leading into a chorus:** a pre-chorus lead-in (rule 23) favours rising into the chorus for up moods, a held note for down moods.

### Step 5: colour in the small notes, and tension
- **Neighbour notes** (rule 8): rough moods (Tense, Dark, Melancholic) prefer the half step; warm ones (Happy, Nostalgic, Triumphant, Dreamy) the whole step. Still in the key; a half step outside the key only for Tense and Dark, only on an off-beat 16th or 8th, and never with the pentatonic option.
- **Walks** (rule 9): Tense and Dark now and then walk in by half steps (chromatic passing note).
- **Repeats** (`limitSame`): Tense and Angry allow more repeated notes in a row; Dreamy fewer.
- **Tension link:** each bar's tension scales the rough weights, size and up lean (section 4).
- Optional: bend targets (rules 15, 28) leaning to the mood's liked small intervals (half step for Tense, whole step for Happy).

### Step 6: the switch and the card
- **Intervals** switch on the Vocal melody card (On / Off), off by default, saved in share links like the other switches. Off = melodies note for note as before step 3.
- One line on the card (`describe`): the mood's interval profile, e.g. "Intervals: small, falling, minor 2nds and 3rds, leaps filled".
- Melody view (`src/ui/roll.ts`): later, optionally colour leaps by interval.

### Step 7: Paul listens, then tune
- Same song, each mood, switch off vs on.
- Tune the table (weights, size, up, fill, strength) by ear; re-run `npm run interval-check` after each change.
- When it sounds right: switch on by default (like the lead switches, `ALWAYS`), or keep it as a choice.
- Optional: Cooke "sighs" for Melancholic / Nostalgic (a ♭6→5 or 4→3 fall at phrase ends).

## 6. Checks (each step)
- `npm run interval-check`: the moods separate. First targets:
  - Melancholic and Dark: average ≤ 2.6 semitones, 55%+ of moves down.
  - Triumphant and Angry: average ≥ 4, Triumphant 55%+ up.
  - Tense and Dark: rough share at least 2× Happy's.
  - Happy and Nostalgic: highest warm share.
  - Every mood: steps and repeats still at least half of all moves (singable).
- Existing rules still hold: `npm run verse-variety`, `bend-check`, `core-key-check`, `long-hold-check`; 0 short units (rule 20); pentatonic 0 off-scale notes; no notes out of the range limits.
- Switch off: note for note as before (hash over the sections, as the earlier rules did).
- `npm run build` and the type check pass.

## 7. Risks
- **Chord notes limit the intervals.** Between root, 3rd and 5th, some intervals rarely happen (tritone, 7ths). Rough intervals will mostly come from neighbours, walks, hang endings and bends; that's fine, and true of real songs.
- **Too strong = unsingable.** Strength and the "steps at least half" check keep it in reach.
- **Same seeds, new melodies** when the switch is on (expected).
- Chorus masters: scoring must use only the section's own dice and notes, so every chorus still matches its master.

## 8. Not in scope
- Changing the key, mode or chords by mood (already done by `tension.ts`).
- Rhythm by mood (separate: Energy styles, `docs/VOCAL-ENERGY.md`).
- The classic vocal writer (Writer: Classic) and the guide line.
- Guitar 2 / solos (could reuse `intervals.ts` later).
