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

## Round 2: feedback after listening (2026-10-23), plan, then built (below)
Paul: connections and phrasing decent; the peak is not always clear; very few long holds; the cut-off endings are a problem (let the last note carry into the next section for a bar, bending to the nearest chord note); few repeating licks (hitting targets causes it: hold the same target across bars, on the same chord or note, and use those as chances to repeat licks); move off-key notes in licks up or down a note into the key. All inside the planned writer (`soloplan.ts`) unless said; the old writer stays note for note (hash check).

Measured first (91 planned solos, `npm run solo-plan-check` plus the new numbers below):
| | now | goal |
|---|---|---|
| climax is the solo's top note (within a semitone) | 16% (the top note is 5.5 semitones higher on average) | 85%+ |
| climax above the next-highest landing | -0.6 semitones | 3+ |
| notes of 2+ beats a solo / of 3+ beats | 4.0 / 0.3 (old writer 4.7 / 0.7) | 5+ / 0.8+ |
| notes off the key's scale | 5.9% (13% of them held a beat+) | under 1.5%, none held or on a beat |
| final landing lost to a transition | 16% of solos | 0 (it carries on) |
| consecutive landings on the same chord / same note name | 44% / 30% | the chances for repeats |
| bars whose rhythm comes back | 1% | about 15-25% (exact copies under 10%) |

**1. A clearer peak.** Cause: the climax is only a landing; the licks between landings, and other landings, go higher than it.
- Choose the climax first. The solo gets a ceiling: the climax is the top, every other landing and path note stays 2+ semitones under it (the window's top is lowered for all other phrases). This works even when the height doesn't follow the energy.
- Build into it: the phrase before ends lower with a longer breath; its path rises (shapes with a net rise, a busier pace); then a long held, bent, loud note; after it, the answer comes down.
- Check: climax is the top note 85%+, 3+ semitones over the next landing.

**2. More long holds.** Cause: a hold is capped at 0.6 of a short phrase and 6-10 steps, the climax 8-12.
- Held phrases (a single long bent note, as the other writer's calm phrases): chance from the calm, more for answers; holds up to 16 steps, the climax 12-20 (the engine caps a note at 4 seconds).
- Check: notes of 2+ beats at least the other writer's 4.7 a solo, of 3+ beats 0.8+, no solo without one.

**3. Repeating licks (echoes).** Cause: every phrase is written fresh to hit its own target. 44% of consecutive landings are on the same chord, so there are plenty of chances.
- When the next landing is on the same chord as the last (or the same note), a chance (about 35%, more for rock, hard rock, metal and blues players; less in the calm) that the phrase is an echo: the last phrase's window (length, hold, breath) placed a bar or two on, its notes copied (the lick as it was, the landing held on the same note).
- The echo is changed most of the time, as in the vocal's repeat shapes: same (15), a new ending (the landing another chord note of that chord, the last path note moved with it) (45), moved along the scale with the chord notes kept on chord notes (30), octave (10). A third time is always changed (A A A'). At most 3 in a group.
- Landing the same note stops being penalised when it is a planned echo (it is a pedal target across the bars).
- Check: bars whose rhythm comes back 15-25%, exact copies under 10% of bars (Paul found 25% exact too many before), echoes always fit (`fits`).

**4. Off-key notes into the key.** Cause: the library shapes carry notes outside the scale (5.9% of notes).
- After a lick is placed, a note off the mode's scale moves a scale step up or down (the way the line is going; never onto the note before or after it). Chord notes (a borrowed chord's) stay. Quick passing notes between two in-key notes stay for the blues and shredder players, 1 time in 3.
- Check: off-scale notes under 1.5%, none held a beat+ or on a beat.

**5. The ending carries on into the next section.** Cause: transitions (band stop, band hits, snare build) cut the last beats or last bar of the section after the solo is written.
- The writer ends its playing at the start of the last bar; its final landing is the last note and rings.
- After the transitions, a pass in `src/track.ts` (planned solos followed by another section only) takes the last note, lets it ring through the rest of the section and the next section's first bar (the engine already lets notes ring past a section end, as the band's ring-out does), and bends it to the nearest chord note of the next section's first chord (a bend up, or a pre-bend let down; up to 3 semitones; none if it already fits). The next section's key counts (key changes).
- One small additive engine change so the bend lands on the bar line, not 0.6-0.9 seconds after the pick: an optional `bendAt` on the hit, used by the late bend and the let-down bend (unset: exactly as now).
- A solo that ends the song (the last section) holds its final landing; the ending is the band's.
- Check: every planned solo that is followed by a section has a carried last note, its length reaches into the next section, its end pitch is a chord note of the next chord, and the other transitions are intact.

**Order, smallest risk first**: off-key notes, the peak, long holds, echoes, then the ending (the only one that touches `track.ts` and the engine). Each is one commit with its own check lines and a constant that switches it off, so each can be heard against the one before.

**Not to break**: the switch off gives the old writer note for note (hash over 679 sections); `solo-tags-check`, `lead-roll-check` (both ways), `neck-check`, `tsc` and the build after each step; the MIDI export and the hands read the carried note (a note longer than its section is already done by the band's ring-out).

### Round 2: built (2026-10-23)
All five are in `src/parts/soloplan.ts` (each behind a flag in `FEATURES`, so it can be switched off to hear it against the one before), with the ending also in `src/track.ts` (`carrySolo`) and the engine (an optional `bendAt`). The other writer is note for note as before (hash over 679 sections); `solo-tags-check`, `lead-roll-check` (both ways), `neck-check`, `tsc`, the build and a MIDI export of planned tracks all pass.
1. **Off-key notes**: a lick note outside the scale and not a chord note moves a scale step to sit nearest its neighbours (`intoKey`); quick passing notes stay 1 time in 3 for blues and shredder players. Off the scale and not a chord note: 3% to 1%, none held.
2. **A clear peak**: the climax is chosen first, its note is the highest chord note in the window and the ceiling; every other phrase, path notes too, stays 3 semitones under it; the phrase before it ends lower with a longer breath. The climax is the solo's top note in 100% of solos (was 16%), 5.5 semitones over the next landing (was -0.6). Cost: the bar-by-bar height follows the energy curve a little less (0.60 to 0.53).
3. **Long holds**: held phrases (one long bent note over the band; more in the calm, for the melodic and bluesy players, and each solo leans its own way), calls and answers now and then held 3-4 beats, the climax 12-16 steps. Notes of 2+ beats a solo 4.0 to 5.5, of 3+ beats 0.3 to 2.5 (the other writer 4.8 and 0.6).
4. **Echoes**: a middle phrase may be played again once or twice, a half bar or a bar on, at the same place in the bar (its window and each echo's stretched to that); the echo is copied and then the same (17), given a new ending (50: the landing another chord note, the note before it a step from it) or moved along the scale (33); a third time is never the same; over another chord only half as likely, and the landing is checked against the chord. The climax is never echoed. Bars whose rhythm comes back 1% to 12-13% (the other writer 4%), bars played again note for note 2-3%. 
5. **The ending carries on**: the writer stops playing at the last bar; its final note comes in a beat before it and rings through it. `carrySolo` (after the transitions have cut the section's end) lets that note ring on through the next section's first bar, drops pickup notes that would run into it, and bends it on the bar line to the nearest note of the next section's first chord (pushed up from below by `lateBend`, or picked bent and let down by `unbend`; up to 3 semitones; none if it already fits; the next key counts). `bendAt` (in 16ths into the note) puts the bend on the bar line; the engine lets such a note ring up to 8 seconds (4 otherwise). 100% of the 80 planned solos followed by a section carry, all ending on a note of the next chord; 52-59 are bent. A solo that ends the song holds its last note; the band's ending is its own.

Notes a bar fell to about 4.6 (the other writer 5.7), partly because the last bar is now the held note's (4.6 over 7 bars is 5.3); the path pace was raised (`PATH_BOOST` 1.5 to 2.1) to meet it. Not listened to yet.
Next, if wanted: the end of the section cut for the other writer too, a hook quoted, full scoring (step 3), the polish rules (step 5).

## Step 4: the moves as connectors (built, 2026-10-23)
The other writer's moves, pulled into `src/parts/soloplan.ts` as ways to connect two landings (`tryMove`, tried before the library lick and the scale walk; `FEATURES.moves` switches them all off, and then the output is note for note as before). Each ends on the landing. The cells and tables are the other writer's (`solo2.ts`, only exported).
- **Quick turning run** (`runMove`): a cell moved down or up the box (the whole scale for the shredder) in 16ths, ending a step from the landing; only in "runny" solos (by genre and player, as the other writer). 0.7 a solo.
- **8th triplets** (`tripletMove`): one beat or two (or three quarter triplets) turning or falling onto a landing that sits on a beat; about 1 solo in 12.
- **Bend moves** (`bendMoveTo`): bent, let down and pulled off to the landing; the same bend picked 3-5 times and held; bent, let down and bent again; two-string bends climbing to the landing. By player (`BEND_RATE`, `BEND_MOVES`), more in the calm. 0.7 a solo.
- **Build-up** (`buildMove`): a short cell (bent and pulled off, a box shape or a pedal note) hammered 4-12 times, now and then a scale note higher every few times, up to the climax, which keeps the ceiling (the cell stays under it). The climax phrase gets the room (a shorter hold and breath, and it takes the plain phrase before it if too short): about 1 solo in 12.
- **Enclosure** (`encloseMove`): the scale notes above and below the landing, then the landing. 0.2 a solo.
Check: `solo-plan-check` prints the moves a solo and fails if a kind never turns up, or if planned solos play under 4.2 notes a bar (now 4.8, was 4.6). All other numbers as before.
Known: build-ups are rare (the climax phrase is mostly short); the trademark note is still the climax landing only. Not listened to yet.
