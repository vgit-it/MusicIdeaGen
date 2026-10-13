# Vocal melody: Melody first (2026-10-13; steps 1 and 2 built)

A third way of choosing the vocal's pitches, beside **Classic** and **Shaped** (both kept).
Paul: the melody "seems generic and not really saying anything on its own"; it outlines the chords (it
should) but needs "its own flow", nice to hear, and still by genre and mood. Rhythm and pacing are set
aside (they work); this is only about the notes.

## Why it sounds generic
- Both writers start from the chords: a path of chord notes, then the notes between filled in.
- 92% of strong notes (Shaped) sit on the chord's own notes: always safe, never a pull or an ache.
- The tune has no line of its own: it goes where the chord goes, chord to chord, so every song sounds
  alike under the same chords.
- Real tunes lean on the chord, against it now and then, and resolve: the feeling is in that pull.

## What the research says (and what we take from it)
| Source | Finding | What we use |
|---|---|---|
| Sloboda (1991), Huron, *Sweet Anticipation* (2006) | Chills and tears come with notes against the chord on the beat that then resolve (appoggiaturas), and with expectations delayed then met | Planned clashes on strong beats that step into the chord, by mood |
| Temperley, *The Musical Language of Rock* (2018) | In rock the tune often runs on its own (a pentatonic loop) while the chords change under it: the "melodic-harmonic divorce" | Rock, grunge and metal tunes that loop their own idea over the chords |
| Schenker (simplified), Salzer | A good tune has a slow line underneath (a "spine", e.g. 3-2-1 down to the home note) that its notes decorate | Each section gets a spine first; the surface decorates it |
| Narmour, *Implication-Realization* (1990); Huron | Listeners expect: a big leap then a step back the other way (gap-fill); small steps keep going; lines arch and drift down at the end | Rules for the notes between, and a score for each line |
| Caplin, *Classical Form* (1998) | The "sentence": an idea, the idea again, then broken into pieces getting quicker, then the cadence | A second line form beside ABAb, for forward movement |
| Burgoyne, Van Balen, Honing ("Hooked", 2013-); Jakubowski et al. (2016, earworms) | Catchy tunes: a familiar overall shape with an unusual interval or two; repetition | A hook with one signature interval, repeated |
| Pearce, IDyOM (2005-) | How surprising each note is can be measured; liked tunes are mostly expected, with a few surprises | A surprise score: keep the best of several tries |
| Fux, counterpoint | The tune moving against the bass (one up, one down) stands apart from it | Prefer contrary motion to the bass on strong beats |

## How it would work (Melody first)
1. **The spine first, by mood and section** (no chords yet):
   - verse: a slow fall (e.g. 5-4-3 or 3-2-1 over the section), or a drone around one note
   - pre-chorus: a climb (3-4-5, or 5-6-7) to set up the chorus
   - chorus: up to the section's high point early, then down to home (an arch), or a held top
   - mood picks the spine's shape and its target (sad: falls; hopeful: rises; dark: a narrow drone)
2. **The idea (motif):** a short shape with its own rhythm (taken from the vocal rhythm as now) and one
   signature interval (e.g. a 6th up, a 4th down), chosen per song by genre.
3. **Lines by a form:** ABAb as now, or the sentence (idea, idea again, broken up and quicker, the
   cadence), picked per section.
4. **Fit to the chords, last:**
   - the spine's notes and the line endings sit on chord notes (or the 9th/sus4 where the genre allows)
   - planned clashes: on some strong beats a note against the chord that steps into it (a sigh down, a
     held-over note, a note leaning up), how many by mood (sad and tender most; happy few; tense: the
     harshest ones, a half step)
   - rock, grunge, metal: the idea may loop over changing chords on the pentatonic scale (it only has to
     avoid real clashes, e.g. a held note a half step off the chord)
5. **The notes between, by Narmour and Huron:** after a leap, step back; steps keep their direction;
   one high point per line; lines drift down at the end (except a question line that ends up).
6. **Against the bass:** on strong beats, prefer the tune moving the other way from the bass.
7. **Best of several tries, scored:** chord fit (with the planned clashes counted as good), the spine
   reached, gap-fill, one high point, surprise in the middle (not too flat, not random), the hook repeated,
   contrary motion to the bass. `fit.ts` already keeps the best of several; this adds the musical score.

## By genre and mood (first pass, to tune by ear)
| Genre | Spine | Idea | Against the chord |
|---|---|---|---|
| Pop | arches, a chorus that peaks early | sing-song, a 6th up hook | 9ths and sus4 sighs |
| Rock, hard rock | falls in verses, high held chorus | pentatonic loop | blue 3rds over major chords |
| Grunge | narrow drone, sudden lifts | a short loop, 4ths | the loop held over moving chords |
| Metal, alt metal | roots and 5ths, a climb to the chorus | a riff-like idea | half-step leans in dark moods |
| Funk | narrow, repeated | short cells | chromatic leans into the beat |

| Mood | Spine | Clashes |
|---|---|---|
| Happy | rises, ends up or on the home note | few, light (9ths) |
| Sad | falls, sighs | many sighs down (4 to 3, 9 to 8) |
| Dark / tense | narrow, low, a slow climb | half steps, late resolutions |
| Dreamy | slow, wide arches | held-over notes, 9ths and sus |
| Angry | high, flat, then a drop | short, harsh, quickly resolved |

## Measuring it (`npm run melody-lab`, 35 songs, all genres)
Beside Classic and Shaped:
- strong notes on chord notes (target: lower than now, about 75-85%, the rest planned clashes that resolve)
- clashes that resolve by step (target: nearly all)
- the spine reached (each section ends on its target)
- gap-fill after leaps, one high point per line
- how alike two songs on the same chords sound (target: less alike than now)
- the surprise score (in the middle band)
Numbers are only a check: Paul judges by ear.

## Trying it
- **Melody: Melody first** in the vocal row's Melody menu, next to Classic and Shaped.
- Same seeds: switching rewrites only the vocal. Classic and Shaped unchanged (checked: the same notes).
- Moves (`docs/VOCAL-MOVES.md`) and Energy (`docs/VOCAL-ENERGY.md`) keep working on top.

## Steps
1. Spine and idea, with the chord fit last (no clashes yet). Listen.
2. Planned clashes by mood; the rock loop over the chords. Listen.
3. The sentence form; contrary motion to the bass.
4. The score and best of several tries; the lab numbers.

## Decisions (Paul)
| Question | Choice |
|---|---|
| How often against the chord | By mood |
| Rock loop over the chords | Now and then |
| Replace Shaped later if better? | Decide once it's ready |
| Start with | Steps 1 and 2 together |

## Built (steps 1 and 2: `src/parts/first.ts`, `firstLine` and `planClashes` in `src/parts/melody.ts`)
- **Menu:** Melody: Melody first. Uses Shaped's range, verse-to-chorus contrast and ABAb form, with two
  more notes of range (room for the idea's leap and the spine's travel).
- **Spine** per kind of section, by mood (genre leans: grunge drones verses, metal holds choruses high,
  pop arches); verse and chorus never on the same one. Each line starts and ends on it.
- **Idea** per song: a step or repeat into one signature leap (genre: pop a 6th, rock a 4th, metal a 5th,
  funk a 3rd; up in brighter moods, down in sadder ones), then a step or two back (gap-fill). Answer
  lines sing it inverted (or its own way round when that won't fit the range); repeated lines move it
  to where the spine now is.
- **The rest of the line:** by step toward the spine's next note; a neighbour and back when there;
  away from the range's edge, not stuck on it.
- **Fitted to the chords last:** strong notes to the nearest chord note that isn't the last note again
  (else a passing note that doesn't grind stays); over power chords any scale note that doesn't grind;
  now and then a 9th or 4th left as a colour (pop, dreamy); endings closed on the root or open.
- **Planned clashes, by mood** (per two-bar line: sad 1.4, nostalgic and dreamy 1.1, dark and tense 1,
  angry 0.8, triumphant 0.6, happy 0.5; at most 2): a sigh from a step above, a note held over the chord
  change, a lean from a half step below, a hanging 9th. A long note holds the clash a quarter, then
  resolves on its vowel (quicker turns get merged away); a short one leans and the next note resolves
  it. The flat 9th (a half step over the root) only in dark and tense songs.
- **Rock loop, now and then** (rock and hard rock 25%, grunge 35%, alt metal 30%, metal 20% of verses
  and choruses): the idea on the pentatonic, the same notes every bar whatever the chord; only real
  clashes on held or strong notes move.
- **Moves:** Auto keeps the colour moves, drops the ones that reshape the tune (one note, pedal, sequence,
  up-up-down, flip); a move chosen in the menu still applies.
- Classic and Shaped unchanged (checked: the same notes as before).

## Measured (`npm run melody-lab`: 42 songs, all genres, 4/4)
| | Classic | Shaped | Melody first |
|---|---|---|---|
| Strong notes on chord notes | 85% | 87% | 72% |
| Off-chord strong notes resolving by step | 45% | 46% | 49% |
| The same note again | 24% | 22% | 18% |
| One-note lines | 17 of 885 | 43 of 911 | 10 of 854 |
| Gap-fill after leaps | 63% | 60% | 67% |
| Different 4-note shapes across songs | 1038 | 1054 | 1409 |

6/8, 7/8 and 3/4 checked too (strong on chord notes 72-74%, resolving 63-66%).
Below the 75-85% target on chord notes: loops and signature moves sit off the chord on purpose; to judge
by ear.

## Next
- Step 3: the sentence form; contrary motion to the bass.
- Step 4: a musical score for each try (spine reached, gap-fill, one high point, surprise in the middle).
