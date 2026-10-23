# The solo plan (landings first, then the paths between them)

Status: design (2026-10-23), step 1 (tags) built. Why: the solo writer (`docs/SOLO-NEW.md`, `src/parts/solo2.ts`) builds a solo lick by lick, each lick placed nearest the note before. Listening and measuring (91 solos):
- the planned height follows the energy only loosely (bar-mean pitch vs the planned centre: correlation 0.49), so the direction is hard to see;
- 6.5 pairs a solo of the same note, same length, touching; 3.9 runs of 3+ the same pitch; a stretch of 4+ equal-length notes 1.6 times a solo (nothing limits it, the vocal has rules 7 and 20);
- a bar's rhythm comes back about 3% of the time (real solos 55%), so no motif holds it together;
- the track's Mood and tension curve never reach the solo (`generateSolo2` gets one number, `intensity`).

The vocal writer is skeleton first (a core note per bar, decoration around it, shapes repeated, then clean-up rules). The solo should be too.

## The idea
1. **Plan the landings**: where, in time, the line must be on which note.
2. **Connect them**: for each gap, find a lick or pattern that gets from one landing to the next in the time there is, in the busyness, mood and energy wanted.
3. **Breathe**: rests and held notes are part of the plan, not a clean-up.

## 1. Plan
A **landing** is a note, a time, a role, a hold and a breath after it.
- **Roles, in layers**: the climax (the energy's crest; where the trademark note goes), phrase goals (the end of each phrase), bar anchors (weaker; a long phrase has them on strong beats).
- **Note**: a chord tone of the chord there (now and then a colour note that resolves, by mood). The octave comes from the height curve (energy, mood, tension) and the phrase's contour: a call ends up and open, its answer comes down home.
- **Time**: from the called form (8 bars = A A', 16 = (A A')(A A')') with the real phrase lengths and starts inside it (`docs/STUDY-SOLO.md`, phrasing).
- **Hold and breath**: the hold by role (the climax and phrase ends longest), the breath by mood, energy and genre (a calm or sad solo breathes more, a driving one less). Note lengths come out of this time budget, so the "ring on to the next note" patch goes away.
- Some phrases are free (only their end is planned), and a landing can be a range of acceptable notes, so it doesn't turn mechanical.

## 2. Connect
For a gap (time T, from-note, to-note, the pace wanted, the mood) the candidates are:
- library licks whose shape ends on the target (each shape starts and ends on a fixed scale degree, so this is a filter), shifted along the scale or with the last note swapped for the target when it is close;
- a repeated cell moved along the scale, a turning run, a scale walk, an enclosure or one-note approach;
- the existing moves, as connector kinds: bend moves, held bends, build-ups at a crest, triplets, staircases. The trademark is the climax landing.

A candidate scores on: fit at both ends, fit to the time, busyness against the pace there, the mood's liking of its intervals (the vocal's `intervalCost`), chord notes on strong beats, not the lick just played, and a bonus for the solo's motif (same rhythm and shape moved to new pitches, never a copy). The pick is by weighted chance, not always the best.

## 3. Polish
The vocal's rules on the finished line: no more than 2 of the same pitch in a row, no 4 equal lengths in a row, no lone 16th, a note before a gap held on (snapped to beats), a cap on separate sets of notes in 4 bars. Then the hands (`playSolo`).

## Tags (step 1, built: `src/parts/solotags.ts`, `npm run solo-tags-check`, shown in the lick lab)
Computed from the library, nothing tagged by hand.
- **Shape**: notes, net move, span, mean move, biggest leap, half-step and rough (half step, tritone, 7th) shares, repeats, up share, contour (rise, fall, arch, dip, level), turns, a leap stepped back from, share outside the box, start and end degree, ends strong (root, 3rd, 5th).
- **Rhythm**: notes a beat, busyness (sparse, steady, busy, frantic), shortest note, quick share, off-beat share, ends long, how many different lengths.
- **Mood fit** (`moodFit`): the shape's intervals scored by the vocal's mood table and cost (`src/verse/intervals.ts`, `docs/INTERVALS.md`), with the tension moving it, against the library's average (1 = average, above it suits the mood).

## Steps
1. Tags, in the lick lab. **Done.**
2. Plan layer with simple connectors (scale walk, shifted licks), behind a switch.
3. Full scoring (library, motif, mood, busyness).
4. The existing moves as connector kinds.
5. Polish rules; the plan on the neck view (landings as dots).
Each behind its own switch with a check script, as with the vocal; Paul listens between steps.

## Risks
- Robotic: landing ranges, free phrases, weighted picks.
- Repetition (Paul found exact repeats too many): the motif bonus keeps rhythm and shape but moves the pitches.
- Thin matches: about 7 library shapes per start-and-end pair (estimate, even spread), so the adapters above are needed.
