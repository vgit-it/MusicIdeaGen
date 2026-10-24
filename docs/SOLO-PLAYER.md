# Solo player: the melody handed to a guitarist (scope)

Paul (2026-10-24): take everything built up to Melody + joins and treat it as if it were handed to a guitarist: work out how to play it well, and add flourishes like a pro. Build it from a set of **single skills** (a rake, a sweep up, a hammer-on, a pull-off...), not whole sequences, and **arrange** them in meaningful ways to make the flourishes.

Status: scope only. Nothing built.

## 1. The idea in one picture

```
 melody + gap map + joins        (what we have: the "score")
            |
   [ player: reads the score like a guitarist ]
            |
   per spot: pick skills from a catalogue (atoms)
   arrange them into gestures (a few atoms in order)
            |
   check: can the hands play it? (fingering, speed)
            |
 the same melody, performed: techniques on its notes + flourishes in its gaps
```

Three layers, each small:
1. **Skills** (atoms): one technique, with its rules for when it can be used.
2. **Gestures** (arrangements): a few skills in an order, filling a job (arrive, decorate, leave, join, build).
3. **The player** (director): reads the score, picks gestures by chance, mood, energy and who the player is, within a budget.

## 2. The contract (what the player may and may not do)

- **Skeleton kept**: every melody note keeps its start, its pitch (the pitch it lands on) and the chord-note rule. The melody step stays the melody.
- The player may: change **how** a note is reached, held and left; and add notes **only** inside the gaps the gap map found (tails, rests, joints) or just before a note (a pickup, up to 2 steps).
- Never more than a beat of silence, never a note out of the key (except a marked passing blue/chromatic note on a weak spot, as the library licks do).
- Everything must be **playable**: the hands (`src/players/hands.ts`) say yes or no; a "no" falls back to the plain note. The player never forces a fingering.
- Same seed, same performance (seeded; no hidden state).

## 3. Layer 1: the skills

Each skill is data: a name, what it needs, what it does, and how it feels. Grouped by **where on a note it happens**.

### A. Arrive (how a note starts)
| Skill | What | Needs | Engine today |
|---|---|---|---|
| pick | plain pick | - | yes |
| hammer-on | land by hammering from below | same string, up to 2 frets (up to 4 for a stretch), lower start note | yes (`art: legato`) |
| pull-off | land by pulling off from above | same string, down to 2 frets | yes |
| slide-in | slide up/down into it | any, 1 to 5 semitones | yes (`slide`) |
| scoop | slide in from under, short (a half to whole step) | long enough note | yes (`slide` 1-2) |
| bend-in | bend up into it | string/fret that allows k semitones | yes (`bend`) |
| pre-bend | already bent, picked, then released | string allows | yes (`unbend` w/o bend) |
| grace note | very short note 1-2 semitones away, hammered into the main one | 1 step of room before | build from hammer-on |
| rake-in | drag across muted strings into the note | note on a higher string | yes (`rake`) |
| ghost-in | muted scratch one step before | 1 step of room | yes (`dead`) |

### B. Hold (what happens while it rings)
| Skill | What | Needs | Engine today |
|---|---|---|---|
| plain hold | nothing | - | yes |
| vibrato (narrow / wide / late) | wrist shake, fading in | 4+ steps | yes (`vib` depth) |
| late bend | hold, then push up | note 6+ steps | yes (`lateBend`) |
| bend-release | bent up, let down | 4+ steps | yes (`bend` + `unbend`) |
| swell | fade the note in | 4+ steps | yes (`swell`) |
| trill | hammer on/off 1-2 semitones above, fast | 4+ steps | yes (`trill`) |
| tremolo | pick again and again | 2+ steps | yes (`tremolo`) |
| unison bend / double-stop | second note under it | 2 strings fit | yes (`dyad`/`twin`) |
| pinch harmonic | squeal on the pick | strong notes | **needs a sound** |
| natural harmonic | chime on the 5th/7th/12th fret | those frets | **needs a sound** |

### C. Leave (how a note ends)
| Skill | What | Needs | Engine today |
|---|---|---|---|
| let ring / cut | full length / clipped short | - | yes |
| fall-off | slide down off the end | 4+ steps | yes |
| slide-out | slide away and up | 4+ steps | yes |
| release | bend let down at the end | - | yes |
| palm-mute tail | note choked | - | yes (`mute`) |
| whammy dive | pitch dips at the end | - | **needs a sound** |

### D. Move (single moves between two notes, one or two steps long)
| Skill | What | Engine today |
|---|---|---|
| passing note | a note of the key between two far-apart notes | yes |
| neighbour | note above/below, back | yes |
| chromatic approach | half step below/above into the target | yes |
| enclosure | above then below (or reverse) the target | yes |
| turn / mordent | 3-4 quick notes around a note | yes |
| bend-and-slide | bend in then slide | yes |
| double-stop slide | two strings sliding together | yes |

### E. Runs (3 to 8 quick notes; the "flourish bodies")
| Skill | What | Needs | Engine today |
|---|---|---|---|
| legato run | hammer/pull chain on 1-2 strings | scale box | yes |
| picked run | alternate-picked scale run | speed ok at bpm | yes |
| pull-off flurry | falling chain from a high note | - | yes |
| pentatonic burst | 3 or 4 notes of the box in 16ths or triplets | - | yes (`shift` for triplets) |
| sweep | arpeggio across adjacent strings, one note per string | string set free | hands need a "one note per string" rule |
| string skip | jumps over a string | - | hands rule |
| tapping | a right-hand tap from far above, then pull-offs | high position | hands rule + position |
| tremolo run | tremolo, then slide | - | yes |
| rake run | muted rake then a run | - | yes |
| wide leap | octave/10th jump with a slide | - | yes |

### F. Rhythm colours (not pitch)
| Skill | What | Engine today |
|---|---|---|
| ghost notes | muted scratches on the off-16ths | yes |
| triplet push | a group in triplets | yes |
| dead stop | short silence made by muting | yes |
| pickup | 1 or 2 quick notes before a strong beat | yes |

Today's engine plays everything in A to F except pinch harmonics, natural harmonics and the whammy (marked above). Sweeps and tapping need a small rule in the hands, not a new sound.

### What a skill is as data (`src/parts/soloskills.ts`)
- `needs`: time room (steps before / on / after), interval range, direction, note length, chord/key rule, string and fret limits.
- `speed`: the quickest it can be played, in milliseconds per note (so it is checked against the tempo; no 8-note run at 60 steps a second).
- `makes`: what it changes on the note(s): `GuitarHit` fields (`bend`, `art`, `slide`, `vib`, `lateBend`, `unbend`, `trill`, `tremolo`, `rake`, `mute`, `shift`, `swell`) and any notes it adds.
- `feel`: how much attack, tension and flourish it carries (a number each), plus `mood` and `genre` leanings, and which players like it.
- `cost`: how busy it is (the density budget).

## 4. Layer 2: gestures (the arrangements)

A gesture is a **recipe made of slots**. Each slot takes one skill from a short list. A gesture has one job.

| Gesture | Job | Slots (in time order) | Where it goes |
|---|---|---|---|
| **Arrival** | land a note with character | [A: bend-in / slide-in / scoop / grace / hammer / rake-in] then [B: vibrato (late) / late bend] | start of a long note |
| **Sustain** | make a held note alive | [B: vibrato / swell / late bend / trill] then [C: fall-off / release / slide-out] | long note body and tail |
| **Joint** | connect two notes (the picked joints) | [D: passing / neighbour / chromatic / grace] or [bend-in] or [slide] | joints |
| **Lick-in** | decorate a picked tail or rest | [pickup] + [E: run (short)] + [land: arrival] | tails of 6+ steps |
| **Fill** | a bigger flourish in a picked rest | [F: ghost] + [E: run] + [B: tremolo/trill on the last note] | rests |
| **Climb** | run up to the climax | [E: legato or sweep up] + [A: bend-in or slide-in to the peak] + [B: wide vibrato] | the beat(s) before the climax |
| **Turnaround** | end a phrase / tie it back | [D: enclosure or turn] + [C: fall-off] | last note of a call |
| **Closing** | end the solo | [E: falling run or pull-off flurry] + [C: fall-off / let ring] | the last bars |
| **Build** | rising busyness across several phrases | skills move from B (vibrato) to D (moves) to E (runs) as energy rises | phrases on a rising energy |
| **Echo** | answer plays the call's gesture again, changed | copy the call's gesture; swap one slot | answer phrases |

Rules on arranging (what makes it musical, not random):
- **Strong notes get little, weak places get more**: the climax note and the home note are clean (arrival + vibrato). Flourishes sit in the weak places (tails, joints, rests).
- **One idea per phrase**: a phrase picks one "gesture of the phrase" and may use it twice; not four different things.
- **Echo/callback**: an answer repeats its call's gestures, 85% of the time with one change (as the gap map and the vocal's repeat shapes do). Across the solo a few "signature" moves return.
- **Density follows the energy**: busy where the energy is high, bare where it is low. A hard budget: at most N skill uses a bar (N by energy and player).
- **Graded loudness and attack**: harder picking on arrivals of strong notes (the velocity already follows energy).
- **No two heavy gestures in a row**; a heavy one (run, sweep, tapping) needs a quiet note or rest before and after.
- **Stay in position**: a gesture starts where the hand already is (the neck diagonal) and ends where the next melody note is. The hands check the path.
- **Beat discipline**: a run lands on a beat or a chord note; it never ends on a weak off-note.

## 5. Layer 3: the player (who decides)

For each **spot** in the score (note start, note body, note end, gap) the player knows:
- the note: length, pitch, interval in and out, chord note or not, role (call / answer / climax / end), where it falls in the energy curve;
- the gap map: kind, size, picked or bare, what would fit;
- the song: mood (tension curve), genre, tempo, meter;
- the **lead player** (`pickLead`: melodic, bluesy, shredder, raw, funky), whose habits weight the skills.

Weights, by chance (the same way the gap map picks):
- **Player persona** (the main lever):
  | Player | likes | rarely |
  |---|---|---|
  | melodic | slow vibrato, late bends, scoops, swells, slides, harmonics | runs, tapping |
  | bluesy | bends (full, release, unison), vibrato wide, double-stops, bend-and-slide, pentatonic bursts | sweeps, tapping |
  | shredder | legato and picked runs, sweeps, tapping, trills, tremolo, pull-off flurries | long vibrato holds |
  | raw | rakes, slides, ghost notes, tremolo, dead stops, pinch harmonics | runs, passing notes |
  | funky | ghost notes, dead stops, pickups, double-stop slides, short 16th licks | long bends |
- **Mood** (from the tension curve): sad / dreamy lean slow vibrato, long slides, swells; angry rakes, tremolo, dead notes, pinch; happy hammer-ons, slides, trills, bright runs; tense quarter-tone bends, tremolo, enclosures; triumphant wide vibrato, big bends, runs up.
- **Genre**: metal runs/tremolo/pinch; blues-rock bends; funk ghosts; pop restraint (few, clean).
- **Energy**: low = restraint (one skill a phrase), high = gesture chains.
- **Role**: calls restrained; answers fuller; climax: arrival + wide vibrato, a climb before it; end: fall-off / release.
- A **solo "style"** drawn once (like the gap appetite): restrained, singing, fiery, wild. Decides the budget.

Then **play it** (the hands pass): each chosen gesture is turned into `GuitarHit` fields and notes, offered to `playGuitar2`. If the fingering fails, the next candidate, then the plain note.

## 6. How it sits in the code

- `src/parts/soloskills.ts`: the catalogue (data: needs, makes, feel, speed).
- `src/parts/solofigures.ts`: the gestures (recipes of slots).
- `src/parts/soloplayer.ts`: `performSolo(rng, song, melodyPart, gaps, joins, persona, o)`; returns the performed `Guitar2Part` and a list of what it used (`idea.soloCurve.moves`, for the roll view and the checks).
- Hooked into `track.ts` as a new Solo writer entry: **Melody + player** (after joins). The earlier modes stay for comparison.
- Roll view: each skill used is a small label on its note or gap (V vibrato, B bend, S slide, H hammer, R rake, run...) so Paul can see what was chosen.
- A **skill lab** (a page like the lick lab): pick a key, a chord and a skill, hear the skill alone over the band. This lets Paul judge each atom by ear before the arranging.
- `npm run solo-player-check`: skeleton unchanged (start steps, pitches, melody notes), every added note in the key and in a gap, no silence over a beat, speed ok at bpm, fingerings found, density within the budget, techniques per player / mood / genre as targeted, echoes copy their call.
- The old-writer hash and the earlier modes (`on`, `off`, `melody`, `marks`, `joins`) stay identical.

## 7. Build order (each step heard before the next)

1. **Skill lab + catalogue** (atoms only): every skill in A to D that the engine already plays, each tappable alone. Paul checks each by ear and says which are bad. No arranging yet.
2. **Note-level player** (A, B, C on the melody's own notes, no new notes): arrival / sustain / leave by player, mood, energy, role. Heard as Melody + player (notes only).
3. **Gap fills** (D, E, F in the picked tails, rests and joints, the fills left from step 0b): moves and runs by persona. Gestures: Joint, Lick-in, Fill.
4. **Phrase gestures**: Climb, Turnaround, Closing, Build, Echo, signatures and the budget.
5. **New sounds / hands rules**: sweep, tapping, pinch harmonics, whammy, natural harmonics (each only when it sounds right).
6. **Tune by ear**: Paul's notes; weights per player.

Estimates: 1 and 2 are small (the engine already plays them). 3 and 4 are the real work. 5 is optional and independent.

## 8. Decisions I am making unless Paul says otherwise
- The player works **on top of** Melody + joins; it does not replace the library licks (they can be reused as ready-made runs later).
- Reuse the **five lead players** that already exist (melodic, bluesy, shredder, raw, funky) as personas.
- Sweeps, tapping, pinch harmonics, whammy are **later** (step 5): the first versions use only what the engine already plays.
- The skill lab comes **first**, so the atoms are heard before the arranging is built.

## 9. Open questions for Paul
1. Skill lab first (hear each atom), or straight to the player on the melody? (Recommended: lab first.)
2. Must-haves in the first version? Anything missing from the lists above you would want (e.g. whammy, feedback, harmonics)?
3. Reuse the five lead players as the personas?
