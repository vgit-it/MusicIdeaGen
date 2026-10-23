# The solo plan (landings first, then the paths between them)

Status: design (2026-10-23); every step built (1 to 6), step 7 (repeat shapes) after Paul's ask, and round 3 (no Twin on solos, the gaps filled) after the next one. Why: the solo writer (`docs/SOLO-NEW.md`, `src/parts/solo2.ts`) builds a solo lick by lick, each lick placed nearest the note before. Listening and measuring (91 solos):
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
3. Full scoring (library, motif, mood, busyness). **Done** (below).
4. The existing moves as connector kinds.
5. Polish rules; the plan on the neck view (landings as dots). **Done** (below).
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

## Step 3: full scoring of the library licks (built, 2026-10-23)
Each library lick a connector tries (24 tries, the cheapest by weighted chance) is now scored on all of the plan's list (`lickPath`, `FEATURES.score` switches the new parts off, and then the output is note for note as before):
- fit at both ends, the time and the pace, the mood's liking of its intervals, chord notes on the beats and changes (as before);
- **not the lick just played:** the same shape twice in a row +1.5, the same rhythm +0.8, a shape from the last four +0.5;
- **never a copy:** the same notes as a lick already played +3;
- **the motif:** the solo's first lick of 4+ notes. Later tries come back to it (a solo leans 50-90%): its rhythm with a shape of that many notes (-1.5), or its shape on other pitches (-0.6).
Check: `solo-plan-check` prints `motif` in the moves line (licks that came back to the motif: 1.5 a solo) and fails if it never turns up. Other numbers as before: bars played again note for note 2% (was 4%).
Known: the bar-level "rhythm comes back" stays 14%, since runs and bend moves sit between the licks. Not listened to yet. Next: the hook quoted, the polish rules (step 5).

## Step 5: polish, and the landings on the neck view (built, 2026-10-23)
The vocal's rules on the finished line, before the hands (`FEATURES.polish`; off = note for note as before). Only plain notes are touched: landings, notes a move wrote (runs, bends, build-ups, triplets, enclosures) and notes with a technique stay as they are.
- no more than 2 of the same pitch in a row (the third goes a scale step toward the note after it);
- no 4 touching notes of one length (the 3rd takes the 4th's time: one longer note);
- a lone 16th (rests either side) is stretched to an 8th;
- a short note before a gap of 3+ steps is held on to the next beat.
The set cap (the vocal's "sets of notes per 4 bars") is not needed: planned solos have 3.0 sets per 4 bars, 1% over 6. `solo-plan-check` now prints sets, lone 16ths and short notes before a gap.
Result: plain notes have none of these left. What the check still counts is the plan's own: a landing is a short note before its planned breath, and a move's repeats (a hammered or bent note) are on purpose. Same-note runs 0.6 to 0.5 a solo, four equal lengths 0.6 to 0.4. Little changes by ear; it is a safety net.
Neck view: each landing has a white ring round its note on the fret picture, the climax's heavier (legend: landing). Not looked at in a browser.
Next: the hook quoted.

## Step 6: the hook quoted (built, 2026-10-23)
As the other writer does, now and then the planned solo opens on the track's hook (`FEATURES.hook`; off = note for note as before). The hook's first bar (3+ notes) is played at the solo's start, in the octave that sits in the window (never over the ceiling), and the first landing is reached from its last note. Those notes stay as they are (no polish), and an echo of that phrase plays the hook again. Chance 1 in 2 when a hook is given.
Rare by design: the track gives the solo its hook only when the solo plays over the chorus chords (2 in 5 tracks), so about 1 solo in 30 quotes it. The notes line says `1 hook`. `solo-plan-check` counts it (not a failure if none turns up).
Done: every step of the plan. Left: Paul listens; tuning (density, echoes, `ECHO_P`); the trademark note beyond the climax; making Planned the default.

## Step 7: repeat shapes (built, 2026-10-23)
Paul: the vocal has A A A', A A A A', A A' A A' and so on; the solo should too, over 2, 4, 8 or 16 bars, each with a chance (`FEATURES.repeat`; off = note for note as before). Before this the solo only had echoes (a phrase played again a half bar or bar on).
- **Stretches**: walking the bars, a stretch starts with a chance (`REP_P` 0.28, times the genre, the player and a lean per solo of 0.5-1.5). Its size is drawn from 2, 4, 8 and 16 bars (weights 25, 35, 28, 12; 16 only in a 16-bar solo, 8 in 8+). A size whose cells sit over other chords (less than half match the first cell) is dropped 2 times in 3 and another size tried. The stretch can't start the carried ending: its last cell starts a bar or more before the last bar.
- **Cells**: the stretch is cut into 2 cells (A A') or 4 cells (A A A A', A A' A A', A A A' and a free cell; 30, 30, 40). A 2-bar stretch in 4 cells is half-bar cells. The cells are units of the plan, so a cell's phrases are written like any other (calls and answers by cell, old echoes off inside).
- **Played again**: cell 0 is written; the others copy its phrases a cell on. `same` = as it was (the notes shifted in time only). `changed` = A': every phrase but the last as it was, the last with a new ending (the landing another chord note, 55) or moved along the scale (45), as the vocal's A' is the shape up to its own ending. If a copy doesn't fit (another chord there, the window, the ceiling), `same` falls back to a new ending or a move, and a `changed` that can't change is written fresh. The last cell of the solo keeps 8 steps for its own ending.
- **The peak**: the climax is said once. A phrase others repeat counts a bar farther from the crest when the climax is chosen; if it still ends up in a cell 0, its copies are written fresh.
- **Numbers (90 solos)**: about 3 in 4 solos have a stretch (1.1 a solo), 83% of the copies fit (2.2 copied phrases a solo); the notes line says `N rep` and `(repeats: 4 bars A A', ...)`. Bars played again note for note go from 2% to about 10% (on purpose: A A A A', A A' A A'; the check allows 18%). Bars whose rhythm comes back 14% to 27%.
- **Two small fixes found on the way**: the bend-let-down-bend move (`brb`) now keeps its top note in the key or a chord note; a short note held on by the polish must still fit the chord at the longer length.
Not listened to yet. Tune by ear: `REP_P` (how many stretches), the `same` share (exact repeats), the size weights.

## Round 3: no stray notes, no long silences, and no Twin on solos (plan, 2026-10-23)
Paul: remove the Twin from the solo completely. Many stray notes with nothing around them; no more than a beat of silence at a time inside the solo. Add a step that finds the stray notes and inserts notes that lead up to and/or away from them until the next one: a single note starting on the last note and bending to the stray note (and the same going out), or licks that fit and join the pieces. Licks may be played 2x as fast to fit a small space, as long as the tempo isn't high.

**Goal**: the solo is one line. Every note is joined to its neighbours; the longest gap is one beat (a breath, not a hole).

### Measured first (90 planned solos, `scratchpad/gaps.ts`)
- 78 of 90 solos have a silence over a beat; 230 of them (2.6 a solo), the average 7 steps (nearly 2 beats), 29 over 2 beats.
- 32 are stray notes: a short note with a silence over a beat after it as well.
- Cause: the breath after a phrase is drawn up to 10 steps (times the mood's breathing), and the polish and the echoes leave what they leave. The breath was a plan feature (calm solos breathe more); now it is capped.

### A. Twin off the solo (`src/track.ts` only)
- The second lead guitar is no longer added to a `solo` section (both writers). The hook and lead line keep it; its switch stays.
- Tidy: the Twin comment (says "solo's peak"), the notes line text, CLAUDE.md and docs that say the solo has a twin.
- Check: no solo section has a `twin`. The old-writer hash is taken without the `twin` field (the only thing that changes).

### B. The rule
- A silence is the time from the end of one note (its length counts, a held note is sound) to the start of the next. Maximum: 4 steps (one beat), from the solo's first note to the last. The carried last note rings on as now.
- The solo's first note comes within a beat of its start (the lead-in).
- Breath still exists: a short rest of 1-4 steps stays after phrases; the long rests become held notes or links.

### C. Prevention in the plan (small)
- The breath after a phrase is capped at 4 steps (the 6 and 10 draws become 4 or a longer hold). The phrase takes the room: a longer hold or path. Keeps the calm solos calm through holds, not holes.

### D. The new step: fill the gaps (`FEATURES.fill`, after connect, before polish)
1. **Find**: every silence over 4 steps. Mark a **stray** note: a note or a group of up to 3 notes inside one beat, with a silence over a beat on each side. A gap's two ends are the last note before (A) and the first note after (B).
2. **Cover** (need = gap - 4 steps at least; aim to leave a real breath of 1-4 steps). In order of cost, a weighted pick by what fits:
   - **Hold on**: A is held longer (need up to about 3 steps).
   - **Bend in**: A is held and bent (late bend, up to 3 semitones) onto B's pitch, or a slide for a bigger move; B is then picked again or not (no same pitch twice). The stray's lead-in: "start from the last note and bend to the stray note".
   - **Bend out**: after a stray, the note is held and bent away (bend, fall, slide) towards the next note's pitch.
   - **A lick**: a library lick ending on B (a lead-up) or starting on A (a lead-out); for a long gap a lead-out and a lead-up either side of a short breath. It is the normal connect with A and B as the two landings and the gap as the window, scored the same (mood fit, chord notes on beats, not the lick just played, in the key), and the waypoint cut for a long gap.
   - **A lick at 2x**: if no lick fits the time, the same lick with every start and length halved (half steps are a `shift` of 0.5, as the triplets do). Allowed only when the lick's shortest note after halving is at least about 60 ms (7500 / bpm ms for a 16th halved): at 100 bpm any lick, at 125 bpm a 16th still works, over about 125 bpm only licks whose shortest note is an 8th or more. So the tempo gate is automatic. Not for the calm slow-hand players more than a third of the time; the shredder, blues and metal players use it most.
   - **Last resort**: move the stray note next to its neighbour (never dropping a landing; a lone 16th may drop).
3. **Keep**: no more than 2 of a pitch in a row, no 4 equal lengths, the climax untouched, the carried ending and echo/repeat copies untouched (a copy's gap is filled where it stands, so a `same` copy can differ a little from its source, and the exact repeats go down a bit).
4. **Then the polish** runs as now (it can make a gap: dropping a lone 16th), then **verify**: any silence left over 4 steps gets a hold-on. The check fails the build if one remains.

### E. Faster licks also in the normal connect (second, optional)
- The same 2x helper is offered to the normal connect when no 1x lick fits a short window, so a tight spot gets a quick lick, not a plain walk. Same tempo gate. Behind its own flag.

### F. Order and checks
1. A (Twin off), its own commit.
2. Gaps in the check script (count, strays, longest) so the numbers show before/after.
3. C (the breath cap) with D's hold-on and bend steps, then D's licks, then D's 2x, then E.
- `solo-plan-check` new lines: silences over a beat (must be 0), strays (must be 0), fills a solo by kind (hold, bend in, bend out, lick, 2x), 2x licks only where the tempo gate allows, longest silence; the climax, carry, off-scale lines as before.
- Old writer note for note (hash without `twin`), `solo-tags-check`, `lead-roll-check` (both ways), `neck-check`, tsc, build.
- Check half steps (`shift`) and the new bends show right on the Melody view, the neck view and the MIDI export (triplets already use `shift`).

### G. Risks
- Too busy: a solo with no air. Keep the 1-4 step breath, prefer holds and bends over licks, cap fills a solo.
- Calm solos lose their long rests: holds and bends carry them instead. Tune by ear.
- 2x licks at 32nd speed sound like flurries: only where the pace there is already up, and sparingly.
- The hands: a bend onto a pitch more than 3 semitones away is a slide, not a bend.

### Round 3: built (2026-10-23)
A, B and D are in; C (the breath cap) was left out because the fill step already ends every silence at a beat, so the plan's rests stay as drawn; E (2x licks in the normal connect) is not built.
- **A. Twin off the solo**: `src/track.ts` no longer adds the second lead guitar to a solo (both writers). The hook and lead lines keep it. The old-writer hash is taken without the solo's `twin` field (`8eaa9620...`, was `d9686e3b...`); nothing else changed.
- **B/D. Fill the gaps** (`FEATURES.fill`, `fillGaps` in `soloplan.ts`, run after the polish so nothing moves the gaps afterwards):
  - A silence is the end of one note to the start of the next; the most allowed is 4 steps (`MAX_GAP`), from the first note (the opening too) to the last. A note alone (`STRAY_GAP`): a set of 1-2 notes inside a beat with a beat of silence either side; around it the most is 2 steps.
  - For each gap a short rest is kept (0, 2 or 4 steps, mostly 2) and the rest is covered, by weighted chance: **hold on** (the note before is held longer; if the note after is a scale step or two off, the hold is bent onto it: pushed up from below, or picked bent and let down, landing as the next note is picked: `bendAt`, `lateBend`, `unbend`); **hold then a path**; or **a path** from the last note to the next one: a library lick that ends on it, else a scale walk, with a waypoint for a long way (`pathInto`, the connect step's own `lickPath` and `walkPath`). A path into the climax stays under it.
  - **Licks at 2x** (`FEATURES.fast`): a path's lick is now and then played at double speed (every gap halved; a half step is a note a 32nd late, `shift`, as the triplets). A rhythm may only be halved if no two notes land in one step and its shortest gap stays at least `FAST_MIN_MS` (70 ms): at 100 bpm most licks, at 175 only licks that were 8ths or slower. Chance `FAST_P` 0.3 by player (`FAST_LEAN`: the shredder most, the sung player least), less in the calm, only for a gap of 10 steps or less.
- **Numbers (90 planned solos)**: silences over a beat 230 to 0 (78 solos to none); notes alone 32 to 0; longest silence 4 steps; 2.9 gaps filled a solo, 0.38 quick licks, 0.33 bend links; time silent 19% to 12%; notes a bar 5.2. The check (`solo-plan-check`) fails on any silence over a beat, a note alone, a Twin on a planned solo, or a quick note faster than the tempo allows. Also: the off-scale check no longer skips every note with a timed bend, only the carried last note.
- A repeat shape's copies are filled where they stand, so a `same` copy can differ a little from its source (exact repeats 10% to 8%).
Not listened to yet. Tune by ear: `MAX_GAP`, the rest kept (`leave` weights), the hold / path weights, `FAST_P`.

## Round 4: sit with the drums (2026-10-23)

Paul: the guitar and drums don't sync well in the solo, though the notes are on time. Measured on 44 planned solos: only half the notes
land with a kick or snare, a third land one 16th away from one, planned holds started on a beat 57% of the time (the old writer 70%),
a held bend sounded its right pitch late, and the lead's feel (0 or 10 ms behind) ignored the drummer's.

Built (`FEATURES.lock`, `lockToGroove` in `src/parts/soloplan.ts`, the drums passed in `PlanOpts.drums`):
- **Lock to the groove**: a long note or landing off the beat and off every kick and snare moves a 16th (an 8th, 6 times in 10) onto the nearest beat or hit. Same chord, still fits the key. Holds on a beat: 57% -> 77%; on a kick or snare: 75% -> 85%; long notes off both: 26.6% -> 11.9%.
- **Lead follows the drummer** (`LEAD_MS` in `src/players/guitarists.ts`): a planned solo plays -4 / 0 / +8 ms for a drummer who is ahead / on / behind (was 0 or 10 ms at random).
- **Held bends start sooner**: a landing held then bent pushes after 1 step (on a beat) or 2, so the right pitch is there with the drums (median 514 ms -> 208 ms). The solo's last note keeps the bar-line bend of the carry.
- Fixes found on the way: a lick that started late or stopped early could leave a silence over a beat (now rejected, and a held note or an early next note is the last resort); a cell played again takes its place's job (call or answer) in the neighbours' counts.
- **Repeat shapes 1.5x** (`REP_P` 0.28 -> 0.42): more stretches played as patterns (A A', A A A A', ...).

Not built: quick notes and 2x licks following the lilt (their half steps use plain positions).
