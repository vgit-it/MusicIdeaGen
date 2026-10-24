# Solo melody: the melody step (Step 0 of the planned solo writer)

Paul (2026-10-24): the solos don't sound melodic. Add a first step that writes a melody from the chords' core notes with the vocal's interval theory, long notes (up to a bar) and short ones (up to a quarter bar), never more than a beat of silence. He wants to hear this step alone.

## What it is (`src/parts/solomelody.ts`, `npm run solo-melody-check`)
- Switch: Track options → Solo writer → **Melody only (chord notes, plain)** (`soloPlan: 'melody'`; old links unchanged).
- The solo section plays only this melody on Guitar 2: a pick on every note, no bends, slides or vibrato. (The band's own habits still apply: the lead's feel follows the drummer, the last note is carried into the next section.)

## Notes
- **Core notes**: chord notes only. A note held across a chord change must be a note of both chords. Over a two-note chord (a power chord) the key's own 3rd counts too, or the melody would have two notes to choose from.
- **Pitch**: the vocal's interval theory (`profileFor`, `intervalCost` in `src/verse/intervals.ts`). Each note is picked by the mood's liking of the move from the note before (size, up or down, a step back after a leap, rough or warm intervals), pulled to the height of the energy and the phrase's contour, with the tension curve moving the profile bar by bar. The mood's part is multiplied (`MOOD_K` 1.6): chord notes are few, so it needs the push to be heard.
- **No same note twice** in a row, except in the moods that like repeats (angry, tense).
- **Height**: the energy shape, height and pace as the planned writer (`pickEnergy`). One climax on the energy's crest: the top note, the end of its phrase, a long note. Every other phrase stays 3 semitones under it.

## Time
- **Short notes**: an 8th up to a beat (a quarter of a 4/4 bar; the smallest beat group in other meters: 7/8 as 2+2+3 gives 4). **Long notes**: longer than a beat, up to a bar. No 16ths.
- **Gaps**: only between phrases (and before the first note), 0, an 8th or a beat at most. Inside a phrase the notes touch.
- **Phrases**: one or two bars, a call that ends off the root and an answer that ends on it. The answer plays the call's rhythm again when it is as long (55% of the chances). A long note ends each phrase.
- **Rhythm**: notes end on beats, a long note starts on a beat (an off-beat start is rare, more in funk and with tension), no 4 equal lengths in a row, not across a bar line unless it starts there.
- **Last bar**: one held note on the home chord, from the bar's start (carried and bent into the next section's first chord, as the planned writer's).

## Numbers (140 songs, 89 solos; 4/4, 3/4, 6/8, 7/8, 5/4 and mixed)
- 26.6 notes a solo, 44% long. Longest silence one beat, over a beat 0. All notes core notes. No note under an 8th or over a bar.
- Climax is the top note 99%. Calls end off the root 90%, answers on it 57%, the last note on the root 58%.
- Mood: leaps of 5+ semitones triumphant 54%, angry 62% against melancholic 39%, dark 37%; going up triumphant 57%, happy 54% against dark 42%, melancholic 45%; rough half steps and tritones tense 14%, dark 8%.
- Limit: chord notes are 3rds and more apart, so the small-step moods (melancholic, dark) still move by 3rds and 4ths. True steps need passing notes (not in this step).

## Next (after Paul listens)
- Stage 2: the melody's long notes and phrase ends become the planner's landings; its short notes the skeleton. Licks, runs and bends only decorate between them, and the drums' lock applies.
- Passing notes between core notes (steps), the hook quoted, notes played again as a motif (not only the rhythm), a motif A A' by pitch.

## Step 0b: the gap map (built 2026-10-24: `src/parts/solomelody-gaps.ts`, `npm run solo-gaps-check`)
Paul: the solo never has more than a beat of silence; the fills can come later; first, find the gaps properly.

**What it is**: a list of every place in the melody where something could go (a joint, a fill, a lick), found from the melody alone, with no chance in the finding. A second pass picks, by chance, which of them will be used, so many stay bare. Nothing is filled in this step.

### 1. The gaps (`src/parts/solomelody-gaps.ts`, stored as `idea.soloCurve.gaps`)
Each gap: kind, where it starts (step) and how many steps it has, the note before and after (pitch, length, phrase role), the interval and its direction, the chord(s), whether it sits on a beat, what would fit it, and `picked`.
- **Rest**: a real silence (between phrases, or before the first note). Already a beat or less. It is the room as it is.
- **Tail**: the end of a long note. The note keeps a beat or half its length, whichever is more; the rest of it is room (4, 6 or 8 steps). A rest after a long note joins its tail into one bigger zone (a lick can use it all; the silence left bare is still only the rest).
- **Joint**: the junction of two touching notes. Room 2 steps, from the end of the first note, which must be 4+ steps (it keeps 2). Needs an interval of 3 or more, or a repeated note (a grace or neighbour note).
- One gap per junction: a tail of 2 steps is a joint; a tail of 4+ is a tail.
- **Never**: the last bar's held note, the climax note's hold, the first note, a note under 4 steps, a run of 8ths (no gap inside it).
- **What would fit** (advice for the fill step, from the size and the interval): 2 steps: passing note(s), slide, hammer-on or pull-off, grace note, bend into the next note; 3-6 steps: a short run, a turn, a triplet, an enclosure; 8+ steps: a library lick, or the end of the phrase played again.

### 2. The one-beat rule
- The silence of any gap is never more than a beat (the melody guarantees it).
- A tail or a joint is only cut if its fill lands. If no fill fits, the note keeps its full length. So the finished solo never has a new silence.

### 3. Which gaps are used (chance)
- About a third of the gaps are picked, by an appetite drawn for each solo (mostly bare to chatty), and a multiplier like the other dials.
- Calm moods less, angry and triumphant more; busy parts of the energy curve more; run players more, sung players less; answers more than calls (calls stay bare, so the guitar answers); a repeated answer repeats its call's picks.
- No two picked gaps in a row, except at the busiest parts.

### 4. Seeing and hearing it
- The melody roll marks each gap: rests grey, tails hatched, joints a small tick; picked ones in colour, with a label (kind and size).
- A third Solo writer entry, **Melody + gap marks**: the melody as now, with a muted scratch on each picked gap, so the places can be heard. If the scratch sounds bad it goes; the roll is the main view.

### 5. The check (`npm run solo-gaps-check`)
- Every gap inside its bar, sized right, no overlaps, none on the protected notes; the silence of each gap at most a beat.
- Counts by kind and size; the share picked by mood, genre and player; no two picked in a row (outside the busy parts); calls bare more than answers.
- The melody itself is note for note as before.

### 6. After it
- The fill step: joints, fills and licks for the picked gaps, from the planner's connectors (walks, licks, moves, bends), ending a step from the next melody note.

### What was built (differences and numbers)
- `findGaps` and `pickGaps` in `src/parts/solomelody-gaps.ts`; the map is stored in `idea.soloCurve.gaps` (type `SoloGap` in `src/idea.ts`). A key change moves the gaps' notes with the section (`transpose`, which now moves the landings too).
- Entries in Track options → Solo writer: **Melody only** (the map is made, nothing sounds for it) and **Melody + gap marks (scratches)**: a muted scratch at the start of each used gap, so the places can be heard. The notes are the same note for note (checked).
- The melody roll marks the gaps in a lead section: rest grey, tail teal, joint orange; used ones filled with a label (R, T or J and the steps), bare ones dashed; a Gaps line in the stats.
- Used share: `FILL_P` 0.6 gives 30% of the gaps on average (140 songs, 94 solos): 16 gaps and 4.8 used a solo, from none (a bare solo) to 22. Rests 29% used, tails 33%, joints 28%. Calls 15%, answers 45%, climax 23%, the end 38%. Triumphant 44%, angry 35%, melancholic 28%, dreamy 20%.
- The one-beat rule holds: the longest silence is a beat; every note with 4+ steps of room to spare has its gap; no gap on the climax note or the first note.
- Two used in a row 23% of the chances (a repeated answer copies its call's picks, which are not spaced).
- Limits: the scratch marks are untested by ear (a dead note may cut the note it sits on, which is also what a cut would do). The neck view does not show the gaps.

## Step 0c: rests very rare, and the joints joined (2026-10-24)
Paul: rests should be very rare; for now join the parts identified as joints with a bend if it can be played, else with notes in between.
- **Rests**: between phrases 95% none, 3% an 8th, 2% a beat (was 30 / 40 / 30 before the mood's breath); before the first note 90% none. Rest gaps fell from 4.3 a solo to 0.5. Phrases now touch, so a phrase end is a tail or a joint.
- **Joins** (Track options → Solo writer → **Melody + joins (bends, notes between)**; `joinOf` in `src/parts/solomelody.ts`). Only the picked joints (about 30% of them; the rest stay as they were), and only the joints. A bend wins when it can be played:
  - **Up** (the next note is higher): the note is bent up into the next note's pitch when that is a whole tone or a minor 3rd (`bend`, picked low and pushed up late: `lateBend`), else a whole tone or semitone toward it, as long as the note it ends on is in the key. The bend starts as late as it can and still be up by the note's end (`bendAt`). The note keeps its length.
  - **Down**: a pre-bend let down toward the next note (`unbend`), a whole tone or a semitone, ending in the key.
  - **Same note again**: a neighbour note (a step above or below, in the key) of an 8th, between the two.
  - **Notes in between**: only when no bend can be played (a note too short or too quick for the tempo, or the bent note out of the key): one or two scale notes between the two, nearest the next note, an 8th or two 16ths in the last 2 steps of the note (which is cut by 2).
  - Joints that cannot be joined keep a scratch (as the picked rests and tails do).
- The roll labels each joined joint: bend, let down, between or neighbour. The gap marks entry is as before (a scratch on every picked gap).
- Numbers (94 solos, 211 picked joints): 90 bends (24 right up to the next note), 74 let down, 25 neighbour notes, 11 notes in between, 11 not joined. No silence over a beat. Checked: the notes and pitches as the map says, every joint on the key.
- Not done: tails and rests are not filled (scratches only); the same joint kind is not varied by player.

## Step 0d: the notes follow the energy across the neck (2026-10-24)
Paul: by the energy, the notes go from the bottom left of the neck (low strings, low frets) to the top right (high strings, high frets).
- **Pitch**: in the melody the height always goes with the energy (`pitchC` 1, was 1, 0 or -1 by chance) and sweeps further: 7 to 10 semitones either side of the middle (more for a stronger solo), from the same register whatever the key (the middle is E4 and up with the intensity, was the key's tonic): the calm parts about G3 to D4, the peak up to B5. A note is pulled harder to the height wanted (`HEIGHT_K`), the root rules are stronger to match.
- **Fingering** (`src/players/hands.ts`, `want`): a melody sets `soloCurve.neck`; the hands then put each note near a fret and a string that rise with the energy there (frets 1 to 16, strings from just under the D to the high E), the low E string costing extra. Other solos are fingered as before.
- Numbers (140 songs, 89 solos): pitch against the energy 0.73, fret 0.74, string 0.41 (correlations per solo, was 0.69 / 0.42 / 0.52 with the old frets); lowest note on average G#3 (56), highest G5 (79). The strings follow less than the frets: a note's pitch fixes its string once the fret is set, and the pitch wanders a little around the height wanted.
- The neck view shows it: a rising solo climbs the frets and strings from the D and G strings to the B and high E.
