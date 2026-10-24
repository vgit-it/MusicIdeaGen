# Solo player: the melody handed to a guitarist (scope, version 2)

Paul (2026-10-24): take everything built up to Melody + joins and treat it as if it were handed to a guitarist: work out how to play it well and add flourishes like a pro. Built from single **skills**, arranged in meaningful ways.

Version 2 (same day) after Paul's answers: the **core is substitution**. The player replaces a note, or a stretch of notes, with a different way of playing it, **without losing the note itself** (one long note becomes a triplet pulse on that same note and then a hold). It must be very robust, have the **personality of the player**, find **several ways** for each spot, and decide the options by **recognising the arrangement** of the input, with mood, energy and drums counted in.

Status: step 1 (the foundation) built 2026-10-24, see section 12; no rule changes a note yet. (The skill lab is parked: not needed. Reuse the five lead players as personas. No must-have skills added.)

## 1. The idea in one picture

```
 base score (melody + gap map + joins)  +  context (chords, drums, energy, mood, tempo, meter, neck position)
        |
  1 READ      split into spans; recognise each span's situation (tags + numbers)
        |
  2 INTEND    the player decides the solo's story: where it is quiet, where it builds, what is featured
        |
  3 PROPOSE   every rewrite rule that fits a span offers itself (with its settings), "keep it plain" always among them
        |
  4 CHOOSE    score by fit + the player's taste + chance; resolve clashes; keep the budget
        |
  5 REALISE   turn the choice into timed notes and techniques; VERIFY (anchors, key, time, hands); fall back if it fails
        |
 the performed solo + a report (what was recognised, what was chosen, what was left out)
```

## 2. The core: rewrite rules (substitution)

A **rewrite rule** says: *for a span that looks like this, you may play it like that.* It is the unit that replaces "skill" and "gesture" of version 1: a skill is a rule on one note; a gesture is a rule on a larger span, built from smaller rules.

### 2.1 Spans (what gets rewritten), at four scales
| Scale | Span | Examples of what is seen |
|---|---|---|
| Note | one note with its room (tail up to the next note) | long note, short note, repeated pitch, the climax, the first, the last |
| Joint | two notes and the space between | leap up, leap down, step, same note, a picked gap |
| Cell | 2 to 5 notes in a row | a stair up, a stair down, an arch, long-short-short, a run of 8ths |
| Phrase | a call, an answer, the end, a repeated phrase | a call that hangs, an answer that lands, the phrase before the climax |
Rewrites are tried **top-down** (phrase, then cell, then note) so a big gesture is not broken by small ones. Spans nest; a chosen rewrite **claims** its time, and smaller rewrites inside it are only allowed if the rule says so.

### 2.2 The identity contract: "without losing the note"
Every note in the base has an **identity**. A rewrite must say which parts of it it keeps, and the checker enforces it. The parts:
- **Pitch**: the note's pitch is heard (the most, or the longest, or on the strongest beat) in the span.
- **Onset**: the span starts on that pitch at the note's start step (or the rewrite says it borrows a few steps from before: a pickup into it).
- **Landing**: the span ends on that pitch (so the next note is reached from it).
- **Length**: the span's total time is the note's time (or the rewrite says how much it borrows from the tail / the rest / the previous note).
Each note carries an **anchor level** by role: the climax and the home note keep all four; a plain long note keeps pitch and onset; a short passing note keeps pitch only. A rewrite may only be offered where the anchors it keeps cover the note's level.

### 2.3 A rewrite rule, as data
- **name**, **scale**, **kind** (re-articulate, decorate, approach, elaborate, connect, fill, shape).
- **matches**: situation tags it suits, with weights, and **vetoes** (where it must never go).
- **keeps**: which identity parts it keeps (above).
- **layers**: what it changes, so rules can combine: *rhythm* (re-divides the time), *pitch* (adds notes), *articulation* (picked, legato, slide, bend, vibrato, rake, mute...), *dynamics* (loudness shape).
- **needs**: room (steps), tempo (milliseconds per note), interval, string and fret limits (asked of the hands).
- **feel**: a few numbers (section 3.3) so mood, energy and the player can be matched without a table for every pair.
- **settings**: what it can vary (how many repeats, which division, which approach, which side).
- **realise(span, settings, rng) -> events**: pure and seeded.

### 2.4 Examples: what one long note can become (several ways, same note)
Base: a long note, one bar, high, mid-solo, energy rising; hats in 8ths, snare on 2 and 4.

| Way | What is played | Keeps | Suits |
|---|---|---|---|
| Stay plain | the note, vibrato | all | any; the default; always offered |
| Triplet pulse | the same note picked in triplets for a beat or two, crescendo, then held with vibrato | pitch, onset, landing, length | a shuffle or triplet groove, a building energy |
| Stutter then hold | the note 2 or 3 times on the 16ths, then held | all | high energy, a drum fill nearby |
| Gallop | 8th + 16th + 16th, repeated, then a hold | all | angry, driving, metal / hard rock |
| Tremolo | picked as fast as the hand goes for a beat, then eased out | all | tense, big climax |
| Neighbour shimmer | the note, a half or whole step above, the note... (pull-off / hammer-on) then held | all | happy, bright, a shred player |
| Pedal cell | the note, a run up and back down, the note again to hold | pitch, onset, landing | a long note over a chord change, a lot of room |
| Scoop and swell | slide in from below, swell, wide vibrato | pitch, landing | sad, dreamy, a melodic player |
| Bend and hold | pre-bend or late bend to the note, vibrato | pitch, landing | blues, a bluesy player |
| Ghosted pulse | the note with muted scratches between | pitch, onset | funk, a tight pocket |
| Echo-fall | held, then falling run at the end | pitch, onset | a call's end, a phrase before a rest |
Short note: 8th into two 16ths (note + neighbour), triplet fragment, grace in. Joint: connector run, bend, slide, octave jump, arpeggio over a leap (a sweep later). Rest zone: ghosts, a quick lick, a pickup into the next note, a stab with a drum hit. Phrase end: turnaround, falling run, tremolo + dive. The full vocabulary is in section 6.

## 3. Reading the arrangement (the recogniser)

The rewrite choice is only as good as the **reading** of the input. The recogniser is its own module, with its own check, and its output is **shown** on the melody roll before any rewriting exists (the way to check it by eye and ear).

### 3.1 What it measures per span
- **The notes**: length (steps and milliseconds at the tempo), interval in and out (size, direction), chord note or not, same pitch as the last, the climax or not, first or last.
- **Place**: phrase role (call, answer, climax, end), position in the phrase, in a repeat or the source of one, on a beat / off the beat / on the downbeat, bars from the end of the section.
- **The room**: the gap map (kind, size, picked or bare), silence before and after.
- **Neighbourhood**: how dense the notes are around (a run of shorts, long-short patterns), a stair, an arch, a leap and step back.
- **The chords**: a chord change inside the note, the next chord's notes.
- **Energy**: value, slope (rising, falling), crest, trough, how it compares with the solo's average. **Mood and tension** (the tension curve at that bar, the mood's profile).
- **Drums** (`idea.drums`: kick, snare, hats, ride, crash, toms, fills): the hits inside the span and just after it, the groove's feel (straight 8ths, 16ths, shuffle or triplet, half-time), where the snare backbeat is, a fill or crash coming, how busy the drums are (busy drums leave less room; open drums leave more), whether the span's end lands on a hit.
- **The hands**: where on the neck the player is now (the energy diagonal), which strings and frets are near.
- **The player**: what was just played, the recent budget used, the moves it has already used (for echoes and signatures).

### 3.2 Archetypes (named situations)
Predicates over the numbers, each with a strength from 0 to 1; a span can have several. Examples:
`held-peak`, `long-before-rest`, `long-over-chord-change`, `long-with-room`, `static-repeat`, `leap-up`, `leap-down`, `stair-up`, `stair-down`, `arch`, `call-hanging`, `answer-landing`, `phrase-end`, `phrase-start`, `pre-climax`, `post-climax`, `lone-short`, `dense-cluster`, `into-snare`, `into-crash`, `drum-fill-window`, `locked-to-kick`, `open-drums`, `busy-drums`, `triplet-groove`, `shuffle-groove`, `half-time`, `rising-energy`, `falling-energy`, `crest`, `trough`, `bar-before-section-end`, `repeat-source`, `repeat-copy`.

### 3.3 Feel axes (how mood, energy, drums and the player meet the rules)
Instead of a table for every pair, five numbers describe a rewrite, a mood, a player and the moment alike:
- **Agitation**: calm to frantic.
- **Roughness**: smooth to edgy (rakes, dead notes, tremolo).
- **Ornament**: plain to ornate (more notes and decoration).
- **Weight**: light to big.
- **Looseness**: locked to the grid to floating (rubato, scoops, late bends).
The moment's **wanted feel** = mood + energy + section + drums (open drums lift Ornament and Looseness, busy tight drums lower them and raise Lock) + the player's own lean. A rule's **fit** is how close its feel is to the wanted feel. A new rule needs only its feel numbers, not a hand-made table. (Mood leanings: sad / dreamy: calm, smooth, loose; angry: frantic, rough, heavy; happy: light, ornate; tense: agitated, rough, tight; triumphant: heavy, ornate.)

## 4. The player's personality

A **style sheet** (from the five lead players, with a small random twist per song so no two are identical):
- **Vocabulary**: a taste weight per rewrite (likes, neutral, rare, never). Melodic: scoops, swells, slow vibrato, late bends. Bluesy: bends, wide vibrato, double-stops, pentatonic bursts. Shredder: runs, tremolo, trills, legato, later sweeps and tapping. Raw: rakes, slides, ghosts, pulses, dead stops. Funky: ghosts, 16th cells, pickups, dead stops, double-stop slides.
- **Signatures**: 2 or 3 pet rewrites drawn per solo that come back (a callback is how a player sounds like a person).
- **Allergies**: 1 or 2 rewrites this player never plays.
- **Density**: how many rewrites per bar; **restraint**: how often "stay plain" is chosen on purpose.
- **Risk**: how often a wild, ambitious option is taken; a shredder takes more.
- **Rhythmic language**: straight, swung, triplet-leaning, gallops, 16ths.
- **Pitch language**: pentatonic and blue notes, diatonic, chromatic approaches.
- **Attitude to the drums**: locks to the kick, floats above, or answers the gaps.
- **Story arc** per solo (drawn): statement, development, climax, resolution; each stage allows a different part of the vocabulary and density, so the solo *builds* rather than being even.
- **Consistency**: a rewrite chosen in a call is repeated in its answer 85% of the time with one setting changed (the gap map and the vocal's repeat shapes do the same); signatures return.

## 5. Choosing: several ways, one performance

- For every span, collect **all** rewrites that match and pass the cheap checks. Each gets a score:
  `fit(tags) x feel fit x taste x energy / budget x novelty (not the last used, not overused) x drum fit x chance`
- "Stay plain" always has a base weight (a pro is mostly restraint).
- Pick by weighted chance (not the best one: the variety is the point). Settings are drawn too (how many repeats, which division, which side).
- **Several ways**: the report keeps the runners-up for each span, so a later "play this note another way" is possible without writing anything new.
- **Drum fit** in particular: re-articulations take the groove's own division (8ths hats: 8ths; 16ths: 16ths; shuffle: triplets), a flourish ends on a snare or crash where it can, simple holds under a drum fill, a stab with a kick in a tight pocket.
- **Budget and pacing**: a limit of rewrites a bar by energy and the player; no two heavy rewrites in a row; heavy ones need a plain note or a rest on each side; the climax and the home note get a prepared arrival, not a flurry.
- **Clash resolution**: higher scales claim first; a claim blocks overlapping ones unless the rule allows nesting; the layers (rhythm, pitch, articulation, dynamics) let compatible rules combine on one span (a triplet pulse with a crescendo with vibrato on the end).

## 6. The vocabulary (the single skills the rules are built from)

Each is a building block the rules use; a rule is a short arrangement of these.

- **Arrive**: pick, hammer-on, pull-off, slide-in, scoop, bend-in, pre-bend, grace note, rake-in, ghost-in.
- **Hold**: vibrato (narrow, wide, late), late bend, bend-release, swell, trill, tremolo, unison bend, double-stop, (pinch / natural harmonic later).
- **Leave**: let ring, cut, fall-off, slide-out, release, palm-mute tail, (whammy dive later).
- **Move** (one or two notes between others): passing note, neighbour, chromatic approach, enclosure, turn, mordent, bend-and-slide, double-stop slide.
- **Re-divide** (the new part, the time inside a note): same-note repeats in 8ths, triplets, 16ths, 32nds, gallop (8th + 2 x 16th), reverse gallop, stutter (a few repeats then a hold), pulse with crescendo, ghosted repeats.
- **Runs**: legato run, picked run, pull-off flurry, pentatonic burst, tremolo run, rake run, wide leap, (sweep, string skip, tapping later).
- **Rhythm colours**: ghost notes, triplet push, dead stop, pickup.
Almost all are played by the engine today (`GuitarHit`: `bend`, `art`, `slide`, `vib`, `lateBend`, `unbend`, `trill`, `tremolo`, `rake`, `mute`, `shift`, `swell`, `dyad`). Not yet: pinch and natural harmonics, whammy (new sounds); sweep and tapping (a hands rule).

## 7. Robustness (how it stays safe)

1. **Contract, then checker**: every rewrite declares what it keeps; an independent checker (not the rewrite's own code) verifies: anchors kept, total time, in key (except marked passing notes), no overlaps, no silence over a beat, speed possible at the tempo, a fingering found by the hands, techniques allowed together.
2. **Transactions**: a rewrite is tried on a copy and kept only if it passes; a failure goes to the next candidate, then to the plain note. The performed solo is never worse than the base.
3. **Fuzz check** (`npm run solo-player-check`): every rule against thousands of random spans (lengths, pitches, chords, tempos 60-200, meters 4/4, 3/4, 6/8, 7/8, 5/4, mixed, odd drums): any rule that says "I apply" must produce a valid result.
4. **Determinism**: same seed, same performance; every rule seeded from the span, not shared state.
5. **Old modes untouched**: the old-writer hash and the five earlier Solo writer modes stay identical; the player is its own entry (**Melody + player**).
6. **Meters and tempo**: all timing in the song's own beat groups and milliseconds at the tempo; triplets in 6/8 and 12/8 are the natural division there.
7. **Reading checks**: the recogniser has its own check (archetypes against hand-made spans with known answers; no span with no tags; strengths in range).
8. **A report** (`idea.soloCurve.moves`): for every span, the tags, the options, the pick and why; shown on the roll; used by the check.

### Known technical points to check first (a small spike, before the rules)
- Timing finer than a 16th: the engine has `shift` (a third of a step for triplets) and `tremolo`; repeated same-note events, 32nds and note lengths in fractions of a step need a check; if they do not fit, a small extension to the hit's timing is needed (a list of sub-events inside one hit).
- The hands: a rewrite sends several notes on one string / across strings; the hands' fingering must accept or refuse each chain.
- The engine's late bend rule (a late bend fails if it has no time to arrive) applies to any rewrite that bends.

## 8. Where it sits in the code

- `src/parts/soloread.ts`: the recogniser (spans, numbers, archetypes, the feel axes).
- `src/parts/soloplayer.ts`: the director (intention, proposal, choice, budget, clash, verification, report).
- `src/parts/solorules.ts` (and `solorules-*.ts` by family): the rewrite rules and the vocabulary they use.
- `src/parts/soloperson.ts`: the style sheet from the lead player.
- Hooked into `track.ts` after the joins step: Track options -> Solo writer -> **Melody + player**; also **Melody + read** (the tags drawn on the roll, nothing changed).
- Roll view: tags under each note; chosen rewrites as labels on notes and gaps; the runners-up in a hover text.
- Docs and checks: `npm run solo-read-check`, `npm run solo-player-check`.

## 9. Build order (each step heard or seen)

1. **Foundation spike**: the finer timing (sub-events), the checker (anchors and playability), the rule interface, "plain pass-through"; the fuzz harness. Nothing changes in the sound.
2. **The recogniser** + **Melody + read**: spans and archetypes shown on the roll. Paul checks the reading by eye ("is this really a held peak? a leap up? into the snare?") before any rewriting.
3. **Note rewrites for long notes** (re-divide, shapes, bends, scoops, trills) with the player's taste, the feel axes, the drum fit and the budget. Heard.
4. **Joints, rests and short notes** (connectors, pickups, ghosts, grace), which finish the fills left from step 0b.
5. **Phrase level**: intention (story arc, featured spans), signatures, echoes, turnarounds, climbs, closings.
6. **Extras**: sweeps, tapping, harmonics, whammy (each only when it sounds right).
7. **Tune by ear** with Paul's notes.

## 10. Decisions taken (change on request)
- The base is Melody + joins; the picked joins stay as the fallback and one of the candidates for a joint.
- The five lead players are the personas, each with a small twist per song.
- First version uses only what the engine already plays; new sounds later.
- The recogniser is shown before the rewriting is heard.
- "Stay plain" is always an option and often chosen.

## 11. Open
- How wild may a rewrite be on short notes? (Proposal: short notes only get pickups, graces and two-note splits; the big rewrites are on long notes and rests.)
- Should rewrites be allowed to shift a note's onset by up to a 16th for feel (push or drag)? (Proposal: yes, only for loose players, never on a beat that a drum hit lands on.)

## 12. Step 1 built: the foundation (2026-10-24)

What it is: the frame every later rule sits in. **Nothing changes in the sound yet**: the Solo writer entry `player` (code only, not in the menu) plays Melody + joins note for note, through the frame.

### Files
- `src/parts/soloevents.ts`: the performance as events (`PEvent`: a time in 16ths with fractions, a length, the hit with its techniques, the melody note it belongs to). Events sit on a grid of 1/12 of a 16th: thirds (triplets), halves (32nds) and quarters land exactly. `readBase` reads the melody into notes with their **anchor** (`all` for the climax, the end of a phrase and the last note; `main` for a note of a beat or more; `pitch` for the rest). `eventsToHits` writes events back as hits (the step, the part of a step it is late by, the length); an untouched hit comes back as the same hit.
- `src/parts/soloverify.ts`: the checker, independent of the rules. Per melody note: still there, the pitch heard most, nothing sounding outside its own time, and by anchor its start and its landing. Over the line: nothing added outside a gap, every note in the key or a note of the chord under it, in the guitar's range, no overlaps, no silence over a beat (also before the first note), a speed the hand can play (60 ms between picks, 40 ms for a hammer-on, pull-off or slide; tremolo and trills exempt), techniques that can be played together, a bend that has time to land (the engine drops one silently, leaving the lower pitch), and **a fingering from the hands' own placement** (`unplayable`).
- `src/parts/solorules.ts`: the rule interface (`weight`, `realise`, what it `keeps`), `covers` (a rule is only offered notes whose anchor it keeps), the plain rule, `LIVE_RULES` (only the plain rule so far).
- `src/parts/soloplayer.ts`: `performSolo`: reads the melody, offers each note to every rule that fits, tries them in a chance order (the plain rule takes its place in the draw by weight), keeps one only if the checker finds nothing new, tries the next if it does, and in the end plays the note as it was; then the hands have the last word (a note with no place on the neck goes back). Writes the report (`idea.soloCurve.moves`: a note, the rule played, the rules offered).
- `src/parts/solorules-spike.ts`: three rules written only to prove the frame (a triplet pulse, a gallop, a stutter, each then holding the note). Used by the check only.
- `scripts/solo-player-check.ts` (`npm run solo-player-check`): described below.

### Small changes elsewhere (all off unless asked for)
- `GuitarHit.exact`: played as written, not held on through a short rest into the next note (engine `held`, hands). A pulse on one note needs it.
- `SoloCurve.fine`: the hands read each hit at its real time (step + shift) and length, not at its step (`playGuitar2`, now exported; `leadHands` pulled out of `playHands`). Without it nothing changes (the old writer's hash is the same).
- The engine already played a hit late by a part of a step (`shift`), any number of hits in one step and fractional lengths; nothing was needed there.
- `track.ts`: the `player` entry writes the melody with the joins, then `performSolo`. The last note is **frozen** (played as written): `carrySolo` carries it into the next section and bends it to the next chord, and knows one hit only. Later: the carry learns about events.

### Found on the way
- A melody note may be outside the key: the chord under it can be (a chord from outside the key). The key check allows the key and the notes of the chord.
- A real bug of the joins (step 0c): a late bend in a note too short to land it was started at 1 step anyway (`Math.max(1, at)`), so the engine dropped the bend and the note stayed at the lower pitch (2 of 742 notes). Now no bend is used there (another join is).
- The carried last note ends in the next section, and its pitch is the bent pitch, which may be outside this key: the check leaves that one note alone.

### Numbers (140 songs, 100 solos and breaks, 2,684 notes)
- Pass-through: identical to Melody + joins, note for note.
- The melody passes the checker: 0 violations, 0 notes without a place on the neck.
- 12 kinds of damage are each refused (a note lost, out of the key, out of range, a silence over a beat, an overlap, notes too quick to pick, a bend with no time to land, a trill with tremolo, a note added outside every gap, the last note cut short, a long note starting late, the last note on another pitch).
- Spike rules forced on every note they fit: used 942 (triplet pulse, 2,138 hits between the 16ths), 968 (gallop) and 968 (stutter) times; every result passes the checker as read again from the hits alone, every note has a place on the neck, the same seed gives the same performance.
- Fuzz: 300 random melodies in 4/4, 3/4, 6/8, 7/8, 5/4 and 12/8 at 60 to 200 bpm, 897 performances: 0 bad.

### Next (step 2)
- The recogniser and **Melody + read** (the tags on the roll). The roll, the neck view and the band view will read a hit at `step + shift` (they read the step only now); `hitTime` is in `src/idea.ts`.
