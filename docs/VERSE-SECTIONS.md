# Verse melody writer: sections and variety

The verse melody writer (`src/verse/`) writes the song's lead vocal, one rule at a time (the main voice since 2026-10-19, `docs/VOCAL.md`; `sing.ts` hooks it into the song builder, the card is now a report). Goal: great songs that don't sound alike.

## How it fits together
- `profile.ts`: **dials**, every number the rules roll against (phrase lengths, runs, holds, endings, lift...). `VERSE` is the verse as it always was.
- `personality.ts`: a song's **personality**, drawn once from the song seed, tilted (never forced) by genre and mood. Each trait has its own random stream, so adding a trait later leaves the others alone. `dialsFor(kind, personality)` gives a section its dials.
- `section.ts`: an idea (a verse or chorus of the track) to the writer's input; shared by the card and the check.
- `build.ts`: the rule pipeline per leaf of the form (A A' ...).

## Variety rules (keep these true)
- Nothing is fixed: every trait is a weighted menu, and "none" (plain endings, level choruses) is a real option.
- A chorus ends phrases in one of: held, open (3rd/5th), hang (off the chord), punch (short), sync (early, off the beat), plain. A held ending is never required.
- Hooks: chant, anthem, leap, push. Chorus height: +5, +3, level, -2.
- `npm run verse-variety` writes ~224 real songs and prints how each trait spreads. Anything marked `!!` has one value winning too often: retune the weights in `personality.ts`. Also counts near-duplicate choruses.

## Choruses
- **One melody per song's chorus.** The song's last chorus (the fullest) is the master: every other chorus of the same length is written with the master's seed, energy and band hits, over its own chords. The rhythm and shape are the same; pitches follow each chorus's chords. Words are shared where the rhythm matches. (Before: each chorus was written from its own energy and chords, so 9 songs in 10 had choruses that differed.) No stripping of the vocal in earlier choruses: the build-up is the band's.
- **Silence.** Each song draws how much of its chorus has no vocals: 25-45%, a squared draw so 25% is common and 45% rare (`chorusSilence`). Rule 18 (`fitSilence`) fits every chorus to it, within 3 points: too full, the weakest notes drop out (short, off the band's hits, off the beat; never a phrase's first or last note, a walk or a long note), then long notes let go of their last 8th; too empty, notes are held into the gaps, then phrase endings are held on into the break. The verse is untouched.
- **Longer notes, fewer notes, more bends.** Rule 17 (`withStretch`): a plain 8th is held through the next on the same chord note (a beat, now and then a beat and a half), by hook. Fewer 16th runs; more long notes; bends about 3x the verse's chances (about 6 a chorus).
- **Openers.** Rule 19 (`withOpeners`): a phrase opens on one long note (a beat to three beats, on the first beat of the phrase) that takes the 8ths under it, then the shorter notes follow; it stops at a chord change or an existing long note. Openers are scooped into and bent more often. About 8 phrases in 10 of a chorus now open on a beat-or-longer note; the average chorus note is 3.7 sixteenths (was 3.3) and 67% of the sung time is in notes a beat or longer (was 59%). The verse is untouched.
- The chorus's second half answers the first (how much: drawn per song).

## Constraint: no lone short units (rule 20)
- A **unit** is one note or several touching notes. No unit shorter than a quarter bar may have silence on both sides; a phrase's start and end count as silence. It is a constraint, not a chance, and applies to verses and choruses.
- A short unit is first held out to a beat when the phrase has room (never across a chord change); one that reaches the next note joins it. If it can't be fixed that way, the whole leaf is written again with new dice until it passes (up to 40 tries; the last try drops the unit, so the rule always holds). An answering leaf starts on its source's try; a chorus built like its master starts on the master's.
- Side effects: held notes get longer; a chorus's silence lands a little under its draw (mean 2 points); in 2 songs in 224 a chorus over different chords needed another try than its master, so it differs from it.

## Pre-chorus (rules 22 and 23)
- The card now sings the song's pre-chorus too. It is the same engine with its own dials (`dialsFor('prechorus')`): tighter phrases (mostly 1-2 bars, short breaks), a few more 16th runs than the verse, a few long notes (less than the chorus), bends 1.5x. Verse and chorus are note for note as before (checked by hash over 486 sections).
- **Shared melody.** Like choruses, the pre-choruses of a song are one melody: the last one is the master, the others are written like it over their own chords. `hookSig` now includes the section kind.
- **Borrowed from the verse.** Its phrasing and small breaks use the verse's dice (`borrow` in `build.ts`), so the two feel related (about 70% of pre-chorus phrase starts land where the verse's do). Its chord notes, long notes, endings and bends are its own.
- **Silence.** 15-30% per song (`preSilence`, mostly nearer 15), fitted by rule 18 like the chorus.
- **Rule 22 - climb** (`d.climb`, 3-7 semitones drawn per song). The core note leans from the root toward the 5th bar by bar (`randomTones`), and `voiceLead` is pulled toward a register that rises across the section (starts a little above the range's bottom; the band is lifted 2 semitones). Mild: 55% of pre-choruses end their second half higher than the first by a semitone or more, 21% fall (chords decide the pitch classes).
- **Rule 23 - lead-in** (`withLeadIn`, `d.leadIn` 45-90% per song). The last phrase ends on one long open (3rd or 5th) or hanging note, 2-4 beats, held on into the break (up to half a bar more, never to the section's last 16th), sung stronger (more velocity) and without the ending fade. About 70% of pre-choruses do it.
- Rules 20 and 21 apply as everywhere. The card shows PRE-CHORUS between VERSE and CHORUS, with its words.
- To add a section the same way: a kind in `section.ts` (`kindOf`), a `dialsFor` branch, its personality traits on new random streams (so other sections don't change), and a rule or two.

## Bridge (rule 24)
- The card now sings the bridge too (`dialsFor('bridge')`), after the chorus on the card. Its own material: nothing is borrowed from the verse or chorus (its seed is its own). A song's bridges are one melody (the last one is the master), like choruses.
- **Dials.** Phrases mostly 2-4 bars, longer breaks (2-4 beats), half the 16th runs, more and longer long notes, more stretched 8ths, openers 40%, fewer bar moves, small breaks 0.6x, endings mostly held / open / hang (60-90% of phrases), bends 1.2x.
- **Register.** `bridgeLift` per song: -3 (lower, intimate moods), 0, +2, +4 (higher, tense/triumphant/angry moods), applied like the chorus lift.
- **Silence.** 30-50% per song (`bridgeSilence`, mostly nearer 30), a loose aim: rule 18 only steps in when the line is more than 7 points off (`silenceTol`); it lands about 7 points under its draw on average.
- **Rule 24 - dwell** (`d.dwell`, low / middle / high of the range, drawn per song). Like rule 22 but a constant target: `voiceLead` is pulled toward one home pitch, so the line circles it. A mild tendency (chords still decide the pitch classes): 73% of bridge notes sit within 4 semitones of the home pitch, against 59% of verse notes.
- **Lead-in** (rule 23) reuses `leadIn`: 30-85% per song (`bridgeLeadIn`); about 55% of bridges end on a long open or hanging note held into the next section.
- Checked: 144 bridges in 168 songs, none empty, no overlaps, 0 short units, Pentatonic gives 0 off-scale notes; silence mean 3.7 points under its draw (worst 14) before the looser fit. Verse, pre-chorus and chorus are note for note the same as before (948 sections by hash).

## Interlude (an echo of the chorus)
- Sings only the 4-bar hook interlude. The 8-bar lead break is the guitar's: it carries a `lead` flag (`idea.section.lead`) and stays silent.
- Takes the song's last chorus's phrasing, chord-note and long-note dice (`echoedFrom` in `section.ts`), so it is the chorus heard again, shorter. The rest is its own dials: 1–2 bar phrases, long gaps, few 16ths, long notes, phrases often ending held or open, no lead-in.
- One melody per song (the interludes share it, like choruses), over each one's own chords.
- Drawn per song: silence 50–70% as a loose aim (the fit only steps in when it is more than 10 points off; `silenceTol`; it lands about 11 points under on average) and a lift of -2, 0 or +2 semitones from the verse.
- Words are sparse (density 0.4), shown as INTERLUDE on the card.
- Checked on 168 songs (121 interludes with the interlude switched on, 15 lead breaks left silent): none empty, no overlaps, 0 short units; verse, pre-chorus, bridge and chorus notes identical to before.

## Outro (the chorus's tail)
- Sings the chorus-based outros (the long outro with its repeated tag, and the short one). A jam outro (new key) and a guitar-solo outro are the guitar's: they carry the `lead` flag (`idea.section.lead`) and stay silent, like the lead break.
- Takes the song's last chorus's phrasing, chord-note and long-note dice (`echoedFrom`, as the interlude does), so it is the chorus heard again. One melody per song, over each outro's own chords.
- Drawn per song: silence 35-55% as a loose aim (+8 points when the song fades; `silenceTol` 0.1; lands about 7 points under on average) and a lift of -2, 0 or +2 semitones, never above the chorus's.
- **Fades or holds**, from the mood's outro (`tension.ts`). Fading moods (melancholic, nostalgic, dreamy, dark): sparser, nearly every phrase ends held, open or hanging (70-100%), and a held ending already fades in volume. Holding moods: fuller, 50-85% of phrases end in a treatment, a short punched ending now and then, bends 1.5x.
- Words density 0.5; shown as OUTRO on the card.
- Checked on 168 songs (151 sung, 17 jam/solo outros left silent): none empty, no overlaps, 0 short units, Pentatonic 0 off-scale. Verse, pre-chorus, bridge and chorus notes identical to before (1092 sections by hash).

## Rule 15: bends inside a held note (first half, quick glide, second half)
- **Changed 2026-10-20 (rule 3):** 16th runs are shorter. Run lengths (⅛, ¼, ½ bar) were 62/30/8% in the verse; now 90/10/0%. The chorus push hook 80/20/0 (was 50/35/15) and the chant hook and one other profile 90/10/0 (were 80/20/0). How often runs happen is unchanged.
- **Changed 2026-10-20:** a held note that bends is two pitches: the first for its first half, the second for its second half, with one quick glide (a 16th at most) across the middle. The old long glides (up to half the note, a bar on a 2-bar note) are gone. No phrase ends while moving (a held ending that bends holds its end note, then fades as before).
- **Changed 2026-10-21:** a bend inside a note goes at most 4 semitones (was 5, and the 5th-to-root / root-to-5th jump was 59% of all of them). The target is drawn from the chord notes within 4 semitones either way (3rds and 4ths-of-a-step weighted most) and from the scale steps 1-2 semitones away (weighted lightly), up 60% / down 40%, instead of always the nearest chord note up (75%). Over 112 songs: sizes +-5 went from 1,174 to 4 (long holds' forced moves), +-1/2 from 174 to ~1,200, 3/4 from 648 to ~780; about 40% of bends are to a chord note, 60% to a scale step (where no chord note is in reach). Bends to the next bar's core note are limited to 4 too.
- **Single long notes (2026-10-21).** A note of a beat and a half or more bends 2.2x as often, and its bend is held at least an 8th of a bar before and a quarter bar after (a note too short for that doesn't bend; rule 20 only covered whole units, so this is new). The target is read off the key's scale (the pentatonic, if that option is on):
  - a scale note a **semitone** above or below (up 60%): mostly a bend there (from-to), 30% there and back, the glide twice as slow (a half beat);
  - else a scale note a **whole tone** away: 70% there and back (the new pitch held an 8th of a bar to a beat in the middle, then back to the first note and held a quarter bar), and from-to at half the chance;
  - neither within 2 semitones: the chord-note / scale-step pick above. Notes shorter than a beat and a half keep that pick and the old timing.
  A bend and back is the first move plus `more` (the same pieces a long hold uses). Checked with `npm run bend-check` (224 songs): 0 bends held under an 8th before or a quarter bar after, targets in the scale, every "and back" returns to its first pitch, every half-step "and back" glides over 2 steps; of the single notes long enough to bend, 42% bent before and 49% do now (363 bend and back).
- **Changed 2026-10-21 (no big bends on 8ths):** an 8th note is never scooped into (rule 13: phrase start, walk arrival, glide) and bends inside at most 3 semitones (rule 15). A glide scoop is at most 3 semitones: a leap of 4 or 5 is just sung, no scoop. Checked over 224 songs: 0 scoops on 8ths (were 31 from 4–5 below), 0 inner bends over 3 on 8ths (were 63 of 4 down, 90 of 4 up); no scoop anywhere is over 3.
- Older notes below describe the old shapes (glide over the first half; hold a quarter, glide, hold two).
- The "next bar" bend (landing as the bar turns) only stays when the next bar's core note is also a note of the chord sounding now, since the end note is held before the bar turns: 450 of them became 76 over 168 songs. The chord-note bends are as before.
- Checked on 168 songs: every inner bend ends by the half (2,710 of them), every note's step, length and pitch before bending is the same as before.

## Rule 21: a fresh core note at every phrase start
- `rerollTones` (`verse.ts`), right after rule 4's bar picks and before holds and notes. At each phrase start the chord note to sit on (1, 3 or 5) is drawn again with the same weights as rule 4 (the hook's, in a chorus), and holds to the next change in the bar's picks or the bar's end. The part of the bar before it (the last phrase's end, or the break) keeps its pick.
- **Minimum (2026-10-21):** a shift has to last at least an 8th of a bar (until the bar's end or the next change in the picks). A phrase starting closer than that to the bar's end keeps the note it is on. Over 224 songs no melody changed because of it (it is a guard).
- Drawn by step, so a leaf repeating a seed repeats it. Pentatonic still applies when the note is chosen. Bar labels on the card ("1→3") show the result.
- Checked on 168 songs: 67% of phrases starting part-way through a bar sit on a different core note than before the break (a fresh draw out of 3); no overlaps.

## Pentatonic option
- The card's **Notes** menu: All (default) or Pentatonic only. On, every note is chosen from the key's pentatonic scale (major pentatonic 1 2 3 5 6 for a mode with a major 3rd, else minor 1 b3 4 5 b7), at every step of the writer, not filtered afterwards: the chord note a bar sits on gives way to the chord's other notes in the scale, else the nearest scale note; neighbours and walks step along the pentatonic (2-3 semitones); open and hang endings and bends to a chord note pick scale notes only. Scoops (a slide into a note) still start below the note.
- Checked on 168 songs: 0 of 29,845 notes outside the scale; with the menu on All, notes are as before.

## Range
- The line lives in A2-G4 (widened from D3-D4 on 2026-10-20) and dips out of it, down to F#2 or up to D6, only when that saves a big leap (a note in the extended zone costs 4 semitones extra). About 3% of verse notes and 4% of chorus notes do. Bends to a chord note and open/hang endings stay in the main range where they can.
- A chorus lift moves the A2-G4 band, not the extended limits: it stops at them (so a lift down never takes the band's bottom below F#2).

## Singing
- A held phrase ending fades out in volume (10, 16 or 24 dB over its last half), never in pitch; half as far if that note bends.
- The card's **Human feel** switch (on by default) runs the experiment line through the main vocal's human feel (`guide/feel.ts`): glides, scoops, swells, a short fade at every word end, a softer last word, a breath before lines after a rest. The ending fade above stays when it is the longer one.
- **Scoops only go up (2026-10-20).** Rule 13 no longer starts a note above and bends down onto it: phrase-start and chord-change scoops always come from below; a walk's arrival and a glide only scoop when the melody climbs (a step down is just sung).

## Next
Verse 2 answering verse 1, a lifted last chorus, breakdown (same recipe as above).

## Rule 25: octave choice (2026-10-20)
- At every core note (the first note of a bar, or where the chord note or the chord changes part way through) there is a chance it is sung in the other octave of the main range instead of the nearest one (`voiceLead` in `verse.ts`, dials `octave` and `octaveUp`). Never the extended zone. The rest of that core note's notes stay in the new octave; the next core note then takes the nearest octave to it.
- Chances: verse, pre-chorus, interlude and outro 25% (60% of jumps go up when both ways are open); chorus 30% (50/50); bridge 25% (50/50). Each song scales them 0.5-1.5x (`octaves` in the personality).
- Measured on 224 songs: the share of core notes in the upper third of the range went verse 19% to 28%, pre-chorus 4% to 22%, chorus 37% to 41%, bridge 31% to 36%.

## Rule 26: energy (2026-10-20)
- A section's energy (1-5) now shapes four things (`energyEdge`, `energyCalm`, `energyVolume`, `phraseLenFor` in `src/verse/profile.ts`). Pitch height is not affected.
- 16th runs: most at energy 3 (50% per try), 33% at 2 and 4, 17% at 1 and 5 (`randomRuns`).
- Bends: fewest at energy 3, most at 1 and 5, between at 2 and 4 (range 0.7x-1.3x; `addBends`, `addNoteBends`).
- Phrase length: the 1-4 bar weights are leaned by up to 60%: calm sections toward longer phrases, driving ones toward shorter (`buildVerse`). Energy 3 is as before.
- Volume: the singer's note strength x0.85 at energy 1, x1 at 3, x1.15 at 5, capped at 1 (`vocalOf`). A chorus is written with its master's energy but sung at its own.
- Same seeds now give different melodies than before this rule.

## Rule 27: core notes stay in the key (2026-10-20)
- A core note (rule 4's bar picks, rule 21's phrase-start draws) is checked against the section's own key and mode (`KeyFit` in `verse.ts`; `buildVerse` passes the section's `idea.song.key` / `mode`, so after a last-chorus key change, or in a jam outro, it is the new key). If the chord note drawn is out of the key on any step it covers, it is drawn again from the chord notes that are in it, by the same weights.
- A bar that moves (1→5) checks both halves; a second half with no other chord note in the key leaves the bar on the first, if that one is in.
- A chord with no note in the key keeps what was drawn (`pickPc` and the pentatonic option still apply after).
- Draws already in the key are untouched; the redraws use their own dice (`seed|tones-key`, `reroll-key`).
- `npm run core-key-check` (224 songs, 1,804 sections): core notes out of key with an in-key chord note available went from 6,533 to 2 (a bar with a chord change in the span). The rest, 1.05% of steps, are chords with no note in the key.

## Rule 28: long holds, 1 to 2 bars (2026-10-21)
- `withLongHolds` (`verse.ts`), after the phrase endings and lead-in, before the silence fit. A phrase now and then (`holdLong`) holds one note for 1 to 2 bars, in half-beat steps (1, 1⅛, 1¼... 2 bars), rarer the longer: weight e^(-0.4) per half beat over a bar, so a 1-bar note is about a third of the draws and a 2-bar one under 1 in 100 (measured: 190 of 580 are a bar, 4 are two bars).
- **Where.** On a beat; it opens the phrase, ends it, or sits in the middle (nothing, or at least a beat of phrase, either side). It takes the notes under it. It may run past the phrase end by up to half a bar, but never into the beat before the next phrase starts (a 1-beat break leaves no overrun). Not in a phrase a lead-in ends, not in two phrases running within a leaf. If a length doesn't fit, a shorter one is tried.
- **How often (`holdLong`).** Verse 8% of phrases (times the song's `verseHold` / 0.4), pre-chorus 5%, bridge, interlude and outro 20%, chorus by hook: anthem 30%, leap 12%, chant 10%, push 4%. Faster songs more, slower songs fewer (`paced`). Measured: 10.9% of phrases overall.
- **Pitch.** A chord note of the chord it starts on. Where the chord changes under it and the pitch isn't in the new chord, it moves to the nearest chord note there (a 16th glide across the change); where it fits, it stays. It may also move on its own at a beat, to the next chord note up (70%) or down; a longer note moves more often. At most 2 moves (the first is rule 15's bend inside the note, the second `more`); a hold that can't fit is left out. Rule 15 leaves long holds alone.
- **Singing.** A hold with moves is one word sung in pieces (`~`), a glide across each move. A hold that ends a phrase is a held ending (`end`, style held): it falls off in volume like other long endings.
- Silence fit (rule 18) leaves holds as they are. The card lists them ("Long holds").
- Checked with `npm run long-hold-check` (224 songs, 1,804 sections, 580 holds): no overlaps, 1-2 bars, on a beat, overrun at most half a bar (142 run past, longest 0.5), a beat before the next phrase, pitch a chord note at every step, 0 or 1 or 2 moves (219 / 276 / 85), 564 sung holds all end to end. Sections without a hold are note for note as before (the 10 changed ones were written again after a hold failed rule 20). `PENT=1` passes too.

## Mood notes: rules 29 to 36 (2026-10-21; `src/verse/emotion.ts`, `docs/VOCAL-EMOTION.md` section 7)
Eight rules from the music-and-emotion research, each its own switch on the card (all on by default; stored as `vocalMoodOff`, the list switched off). They read the song's mood (the one picked on the track, or Auto's: the writer used to work out Auto's again and ignore the pick), the mode, the tempo, the section's energy and its tension curve. With a switch off its notes are exactly as before; with all off the line is note for note what it was (hash-checked over 120 songs).
- **29 Colour notes** (`withColour`): the mood's scale degree as a neighbour between two of the same note (♭6, #4, raised 7, ♭2, natural 6), resolving at once; after the bends, on notes no bend moves.
- **30 Ending degrees** (`withEndDegrees`): home, open or hanging by the phrase's job (last of a chorus home, of a pre-chorus or bridge hanging; inside, question then answer); after rule 11. A home or hanging end is not bent away by rule 15.
- **31 Delayed resolution** (`withSuspensions`): a long note starts a step off the chord note and glides onto it (reuses rule 15's bend inside a note); after the bends.
- **32 Contour & leaps** (`toneBias`, `pullTo`, `emoDials`): which chord note a bar sits on and the octave lean along a rising, falling, arching or level phrase; the octave jumps and neighbours by mood. Where the pre-chorus climb or the bridge dwell pulls, they win.
- **33 Arousal** (`emoDials`): register, runs, long notes, stretch and pushes from mood, tempo and energy.
- **34 Tension curve**: the section's per-bar tension leans rules 29, 30, 31, 32 (a drift in the register).
- **35 Mood over mode** (`tiltOf`): chord notes and colour notes lean bright or dark when the mood is brighter or darker than the mode.
- **36 Surprise** (`withSurprise`): 0 to 2 a section, late in it: a push, a note off the scale, a deceptive ending.
- Check: `npm run emotion-check` (per mood, per switch), and `EMO=1` on `bend-check`, `long-hold-check`, `core-key-check`, `verse-variety`.

## Meters and mixed meters (2026-10-22; `src/verse/grid.ts`, `npm run meter-check`)
The writer used to read "a bar" as one number: equal bars, a beat a quarter of it. A song that changes meter (7/8 then 4/4) had bar lines in the wrong places, and 7/8 was felt as four quarters of 3.5 steps. Now it reads the song's real bars.
- **The grid** (`BarGrid`): each bar's start, length and beat groups (7/8 as 4+4+6, 6/8 as 6+6), from `idea.song.bars` (`songGrid` in `section.ts`). `bar` stays the nominal length (the mean) for sizes: a beat of silence, a hold of a bar and a half.
- **What follows the real bars:** the form's leaves (bar to bar), phrase lengths (whole bars on from the phrase's start), blocks of 16th runs, the chord note per bar (and its half-bar or third-beat move, on a beat of that bar), where long notes start (the bar's own beats), neighbours and walks (the bar line), third-bar shapes (a bar at a time), the octave choice at a bar's first note, bends to the next bar, the tension per bar.
- **Strong places** are the first quarter-bar of the 1st, 3rd, 5th... beat group of a bar (both groups in 6/8 and 5/8). In 4/4 that is the old 1st and 3rd beat. Pushes and the words' stresses use the same beats.
- **A grid from a plain number is the old picture**: 4/4 comes out note for note as before (checked by hash over 120 songs). Songs in other meters change, on purpose.
- Fixed on the way: a phrase gap in 7/8, 5/8, 9/8, 11/8 could land on a half step (a beat is 3.5 steps); it is rounded now.
- Check: `npm run meter-check` writes every meter and a mixed one: no crashes, no overlaps, the grid has every real bar, one chord-note label per real bar, and how the notes sit (over a bar line, on a beat group). Mixed meters: notes crossing a bar line 5% → 3%, on a beat group 46% → 50%.
- **Phrasing by beat groups** (same day): a phrase starts and ends on a beat of the real bar, in every meter (before: 64-92% of starts, 68-83% of ends outside 4/4). A phrase of k bars ends on the same beat k bars on (the 3rd beat of a 7/8 bar to the 3rd beat of the 4/4 bar after it); the break before the next phrase is the usual length, then on to the nearest beat; a held ending is a beat, a beat and a half, two... counted back along the real beats from the phrase's end (`backLen`); the beat of silence at the end of a leaf is its last beat group. Held endings that start on a beat: 17-43% -> 72-84% outside 4/4 (the rest are the beat-and-a-half and early "sync" endings, as in 4/4: 87%). 4/4 is still note for note as before.
- Not done: the other durations (a beat of silence in a hold, bends, the minimum unit) are still bar ÷ 4, a half step in 7/8; a tab view.
