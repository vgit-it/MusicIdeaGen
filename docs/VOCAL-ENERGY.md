# Vocal energy styles (2026-10-13)

Paul: the vocal should gel with the band and match the song's energy (not always: exceptions are fine).
Energy isn't only "faster": it can show in different ways. References: high energy, "Sweet Child o'
Mine", "Back in Black", Green Day "Holiday"; low energy, "Rooster", "Nutshell"; dynamic, Audioslave
"Like a Stone".

## Decisions (Paul)
| Question | Choice |
|---|---|
| How a song gets its style | Auto (by genre and mood) plus an Energy menu in the vocal row |
| Going against the band | Now and then: about 1 sung section in 6, said in the notes |
| Trying it | On by default; Energy: Off gives the vocal as before (checked: identical) |
| Scope | All in one go |

## What the references do
| Song | How energy shows | Style |
|---|---|---|
| Sweet Child o' Mine | Height and holding: high, long held notes, leaps, belts | Climber |
| Back in Black | Attack: short punchy words on few notes, in the riff's gaps | Puncher |
| Holiday | Drive: a steady stream of words on the beat, doubled | Driver |
| Rooster | Weight: low, long notes, a dark harmony under, laid back | Brooder |
| Nutshell | Space: few words, lines starting late, long rests, falls | Drifter |
| Like a Stone | Contrast: quiet verses low and narrow, choruses leap up and hold | Switcher |

## How it works (`src/parts/energy.ts`)
1. **A level per section:** half its energy (1-5), half where it sits between the song's quietest and
   loudest sung sections, so a verse at 3 under choruses at 5 counts as quiet.
2. **The style turns dials by that level** when the section's tune is written: height (applied after
   the verse-to-chorus lift, so a low voice near its floor still moves), range, words per bar, joined or
   detached notes, held notes, line length (one-bar punches or four bars on a breath), where lines start,
   syncopation, leaps, sighs, falls, belts.
3. **Gelling with the band:**
   - stressed words with the kick and snare, weighted by style (Puncher and Driver lock tight; Brooder
     and Drifter float)
   - Puncher: words in the riff's gaps (call and response), not on its hits
   - fewer words over busy guitars, more over sparse ones
4. **As sung, per section:**
   - accents: Puncher and Driver hit the stressed words harder; Brooder and Drifter even out
   - timing: Brooder and Drifter sit further behind the beat; Puncher and Driver a touch ahead when loud
   - how much the tune reaches up with the tension curve, by style (Climber most, Brooder and Drifter
     least)
5. **Stacking:** Brooder sings with a lower harmony; Driver doubles every loud section (verses too);
   Drifter and Switcher leave quieter choruses single.
6. **Against the band** (about 1 in 6, never the first sung section): holding back while the band
   pushes (softer, held notes settle lower, no belts), or breaking out over a quiet band (held notes
   reach up, each line's top belted).

## Measured (`npm run energy-lab`: 35 songs, all genres, 4/4)
Quiet → loud sections:

| | Pitch (MIDI) | Words/s | Held | Rest | Notes |
|---|---|---|---|---|---|
| Off (before) | 54.7 → 58.3 | 1.53 → 1.39 | 22 → 23% | 19 → 32% | |
| Climber | 53.5 → 59.5 | 1.48 → 1.30 | 21 → 27% | | higher and held when loud |
| Puncher | 54.3 → 59.2 | 1.60 → 1.68 | 19 → 16% | | more words in the riff's gaps (+6%) |
| Driver | 53.9 → 59.0 | 1.60 → 1.57 | 18% | | every loud section doubled |
| Brooder | 53.1 → 55.8 | about 1.2 | about 29% | | low, heavier not higher |
| Drifter | 53.7 → 57.3 | about 1.15 | about 31% | 28 → 39% | fewest words, most space |
| Switcher | 52.6 → 60.0 | 1.48 → 1.23 | 19 → 28% | | the widest jump (7.4 vs 3.6) |

Auto picks, over 35 songs: Puncher and Climber most, then Brooder and Driver, then Drifter and Switcher
(grunge and alt metal lean Brooder, Drifter, Switcher; hard rock and funk Puncher).

## Later
- Drag the level per section (with tension phase 3)
- A gang on the Driver's hooks; screams on a Puncher's loudest words
