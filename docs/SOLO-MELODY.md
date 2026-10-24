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
