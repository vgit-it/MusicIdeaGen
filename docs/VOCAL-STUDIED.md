# Studied: the verse writer moved toward real pop melodies (switch)

Paul: use what the POP909 study found (`docs/STUDY-POP909.md`) on the main vocal, as an optional toggle to test, confirm later.

## What it is
- A checkbox on the Vocal melody card: **Studied (real pop)**. Off by default. Off = the writer exactly as before (checked: 96 songs, 22,208 sung notes, same hash as main).
- Switching it rewrites only the lead vocal (same song, band unchanged). Carries over to new ideas. Needs the New writer.
- Nothing was removed. Roll back: untick it, or revert the Studied commit. Git tag `before-studied-melody` marks main before this work.

## What it changes (when on)
- **Rule 29, studied pitches** (`studiedPitches`, `verse.ts`). Pitches only; rhythm, words and silence are untouched.
  - On off-beats only (beats keep their chord notes): a note that repeats the one before moves, 80% of the time.
  - Where it goes: 40% a scale step, 45% a chord note a 3rd away, 15% a chord note a 4th to a 5th away. Away from the way the line came, 65% of the time.
  - After a leap of a 4th or more: 90% turn back (off-beat notes), by a step.
- **Dials** (`studiedDials`, `profile.ts`): 16th runs 2.6x as likely, pushes (a note a 16th early) 20%, held endings sit on the key's tonic half the time when the chord holds it (`endTonic`).

## Measured: `npm run pop909-compare` (224 songs) against the real numbers
| Measure | Real (POP909) | Writer | Studied |
|---|---|---|---|
| same note again | 23% | 49% | 29% |
| step (1-2 semitones) | 44% | 36% | 48% |
| third (3-4) | 18% | 4% | 10% |
| turn back after a leap | 59% | 20% | 52% |
| 16th spacing | 25% | 11% | 21% |
| 16th slots in the bar | 21% | 6% | 12% |
| chord note off the beat | 60% | 71% | 57% |
| mean notes per bar | 5.1 | 4.6 | 5.1 |
- Not moved much: chord notes on the beat (70% real, 87% app), phrase ends on the tonic (43% real, 25% app), phrase length (the writer's phrases are shorter than real ones by the 1.5-beat-rest measure).
- `STUDIED=1 npm run pop909-compare` for the Studied numbers.

## Caveats
- POP909 is mostly Mandarin pop ballads (about 80 BPM), not rock. Studied leans every genre toward it.
- Quantised from human performances; slot counts are approximate.

## Next (Paul listens)
- Does it sound more like a real song, or lose the hook? Try per genre and mood.
- If good: lean the beats' chord-note share down (more 2nds and 6ths on beats), tonic endings, phrase lengths.
- A rock set would give genre-specific numbers.
