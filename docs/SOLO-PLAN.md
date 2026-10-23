# The solo plan (landings first, then the paths between them)

Status: design (2026-10-23); step 1 (tags) and step 2 (the plan layer with simple connectors) built. Why: the solo writer (`docs/SOLO-NEW.md`, `src/parts/solo2.ts`) builds a solo lick by lick, each lick placed nearest the note before. Listening and measuring (91 solos):
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
2. Plan layer with simple connectors (scale walk, licks ending on the landing), behind a switch. **Done** (below).
3. Full scoring (library, motif, mood, busyness).
4. The existing moves as connector kinds.
5. Polish rules; the plan on the neck view (landings as dots).
Each behind its own switch with a check script, as with the vocal; Paul listens between steps.

## Risks
- Robotic: landing ranges, free phrases, weighted picks.
- Repetition (Paul found exact repeats too many): the motif bonus keeps rhythm and shape but moves the pitches.
- Thin matches: about 7 library shapes per start-and-end pair (estimate, even spread), so the adapters above are needed.

## Step 2: what is built (`src/parts/soloplan.ts`, `npm run solo-plan-check`)
The **Solo writer** menu in the Track options: As before (default) or Planned. Stored as `soloPlan` in the track options, so share links carry it. Off: every section is note for note as before (hash over 679 sections).
- **Plan**: units of two bars, a call (ends up, off the root) then an answer (comes down, home); the last unit ends the solo (4 in 10 land on the root, held; 6 in 10 run on). Each unit is cut into phrases of real lengths (longer where the pace is up). Each phrase has a landing (a chord note), a hold (a short phrase keeps room for a path) and a breath after it (real rests: none 41%, under a beat 41%, 1-2 beats 12%, more 6%, times the mood, genre, pace and tension). The phrase on the energy's highest crest is the climax: highest, longest, the player's trademark note.
- **Landing pitch**: a chord note in the window, by weighted chance on the vocal's `intervalCost` from the landing before (the mood's liking of the move, with the tension moving it), pulled to the height the role wants (call up, answer down, climax high), never the same note as the one before.
- **Connect**: a library lick whose shape ends on the landing (shapes ending a step or two off have the last note moved onto it), in a real rhythm that fits the time and the pace, scored by the mood's liking of its intervals (`moodFit`), the chord notes on beats and starting off the note just played; else a stepwise walk through the scale (note lengths varied, a bend of the line the way the mood leans, a leap now and then). A path of more than 3 beats is cut at a waypoint on a beat (a weaker landing, short).
- The track's Mood and the section's tension now reach the solo (`PlanOpts`); the energy shapes, height and pace are the other writer's (`pickEnergy`).
- Not in yet: bend moves, build-ups, triplets, quick turning runs, the hook quoted, the motif coming back (steps 3-4), the polish rules (step 5).

Measured (90 solos, 140 songs, `solo-plan-check`; the same songs, only the solo differs):

| | other | planned |
|---|---|---|
| notes a bar / held notes a bar | 5.7 / 1.1 | 5.4 / 1.1 |
| same note as the one before | 28% | 6% |
| same note, same length, touching (a solo) | 6.5 | 0.4 |
| runs of 3+ the same note (a solo) | 3.9 | 0.4 |
| 4+ touching notes of one length (a solo) | 1.6 | 0.7 |
| moves of a 5th or more / of a tone or less | 11% / 55% | 7% / 53% |
| bar-mean pitch vs the planned height (solos where it follows) | 0.60 | 0.57 |
| calls off the root / answers on the root | | 89% / 66% |
| an answer lower than the landing before it | | 70% |
| the climax the highest for its place | | 81% |
| bars whose rhythm comes back | 4% | 1% (the motif is step 3) |

Known, to look at next:
- **Transitions cut the end.** A band stop, band hits or a snare build into the next section (and the last section's ending) remove the solo's last beats or last bar afterwards (`src/track.ts`, `bandStop`, `bandHits`, `makeEnding`), so the final landing is sometimes lost (the other writer has this too). The check ignores landings in the cut. Fix: tell the writer where the tail starts, or pick the transition first.
- **Repeated notes may be too few** (real solos repeat a note about a quarter of the time; 6% here). Tune by ear.
- The bar-mean height follows the energy as before; what is new is the structure on top of it (call up, answer down, a climax that is the peak).
- Not listened to yet.
