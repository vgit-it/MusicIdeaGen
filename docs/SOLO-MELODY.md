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

## Step 0b: the gap map (plan, 2026-10-24; not built)
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
