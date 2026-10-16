# Guitar solos: real songs vs the app (study, 2026-10-16)

Paul: one lick keeps coming back in almost every solo. The culprits: the climb into the peak (the shredder's straight scale run, the same 3-4 note cell climbing), one long bent top note at the same spot every time, and the fall to the root at the end. This study asks what real solos actually do, and which licks they share, before a new solo writer.

## How
- **Real:** 2,938 guitar solos (4+ bars with no singing, the lead guitar playing 3+ notes a bar) in 1,967 songs with a lead guitar in the Lakh MIDI collection (the lead guitar study's songs, `docs/STUDY-LEAD.md`).
- **App:** 354 solos from 280 tracks (40 a genre, solos on), exported with the app's MIDI export and read back by the same code. With Real licks on: 369 solos.
- `scripts/study/solo-study.ts`. Numbers only; licks only as shapes many songs and artists share.
- Caveats: these are fan-made MIDI files (good on notes and rhythm, almost no bends or slides: 2% of notes carry a pitch bend); "solo" is found from the music (no labels), so a few are intros or instrumental breaks.

## What real solos do, and what the app does

| | Real | App | App + Real licks |
|---|---|---|---|
| **The top note: first heard in the first 30% of the solo** | **55%** | 12% | 11% |
| at 60-85% (where the app puts its peak) | 14% | **72%** | 78% |
| times the top note is played (median) | 3 | 1 | 1 |
| top note played once only | 26% | 72% | 72% |
| **Overall shape:** level | **38%** | 7% | |
| falling / rising / arch / dip | 20 / 17 / 15 / 9% | 6 / **42 / 35** / 9% | |
| climbs steadily (each quarter higher) | 17% | 46% | 41% |
| **Notes a bar, by quarter of the solo** | 7 7 7 7 | 4 5 6 5 | 4 5 6 5 |
| silent beats, by quarter | 7 5 5 4% | **18** 9 5 7% | 21 12 5 7% |
| notes a bar (hard rock + metal) | 7.4 | 5.0 | |
| **Into the top note: a jump (a 4th+)** | **43%** | 14% | 12% |
| a step up | 37% | 79% | 79% |
| a quick run up | 5% | 5% | 5% |
| **Fast runs (4+ quick notes) that only go one way, straight up or down the scale** | **6%** | 33% | 28% |
| (hard rock + metal) | 6% | 42% | |
| runs that turn (up and down) | 80% | 46% | 57% |
| **Bars whose rhythm comes back later in the solo** | **50%** | 13% | 11% |
| same note played again | 23% | 16% | 18% |
| triplet notes | 7% | 1% | 2% |
| in the key's pentatonic | 75% | 86% | 87% |
| last note held (beats, median) | 0.5 | 1.0 | 1.0 |
| last note on a downbeat | 9% | 12% | 11% |

What this says:
1. **Real solos don't build to one late peak.** Most reach their top note early (a third in the first tenth) and come back to it two or three times. Only 14% first reach it where the app always does. The textbook arc (start low, climb, peak at 70%, come down) is one shape among several, and not the most common: **level** is (38%), then falling, rising, arch.
2. **They're busy from the start.** The same number of notes in every quarter (6-7 a bar), few silences, no quiet opening. The app starts sparse (18% silence) and builds.
3. **They jump to their high notes** more than they climb to them.
4. **Fast runs turn.** Real quick passages go up and down (patterns, turns around a few notes); a straight run up or down the scale is rare (6%). The app's runs are straight a third of the time, 42% in hard rock and metal: the run you hear everywhere.
5. **They repeat themselves.** Half the bars' rhythms come back in the same solo (a lick played again, changed), four times the app. A solo is a few ideas worked over, not a new idea every bar.
6. **They end in passing.** The last note is short (half a beat) and leads into the next section, instead of a long note on the root.
7. Triplets (7%) the app hardly plays; a little less pentatonic than the app (75%).

### In detail (for the second round)
| | Real | Real, minor keys | Real, major keys |
|---|---|---|---|
| bars played again exactly (notes and rhythm) | 42% | 42% | 42% |
| bars whose rhythm comes back: anywhere / the next bar / 2+ bars later | 55 / 24 / 53% | | |
| notes outside the pentatonic | 24% | 22% | 26% |
| which (share of those) | | 2 36%, b6 21%, 6 13% | 4 39%, 7 18%, b7 17%, b3 11% |
| of them quick (a 16th) / on a beat | 33 / 35% | | |
| triplet steps a 100 notes: 8th / 16th / quarter | 5.0 / 3.9 / 1.8 | | |
| solos with 8th triplets | 18% | | |
| 8th-triplet groups: falling / rising / turning | 36 / 15 / 49% | 29 / 17 / 54% | 43 / 13 / 44% |
| times the line comes back to the top (median) | 4 | | |

## The licks real solos share
Note shapes (any rhythm) played by many songs from many artists, in solos. Notes are named from the key's root (1, b3, 4, 5, b7...; ' an octave up, , an octave down). 1,094 shapes are shared by 10+ songs from 8+ artists; the most common:

**Minor keys** (mostly hard rock, metal, rock):
| shape | songs | artists | what it is |
|---|---|---|---|
| 5 4 b3 4 (b3) | 80 | 63 | the turn in the middle of the pentatonic box |
| 2 b3 2 1 | 72 | 48 | a turn into the root (natural minor: metal most) |
| 5 4 b3 1 | 69 | 56 | down the box to the root |
| b3 1 b7, 1 | 67 | 51 | the root, circled from below |
| 4 b3 1 b3 | 65 | 48 | hard rock's favourite |
| 4 5 4 b3 | 63 | 50 | |
| 5 4 b3 2 | 62 | 48 | |
| b3 2 1 b7, | 57 | 45 | down past the root |
| 1 b3 4 5 | 56 | 45 | up the box |
| b3 2 1 2 | 56 | 39 | metal |
| 1 b7, 5, 4, | 49 | 41 | down below the root |
| b7 1' b7 5 | 48 | 36 | the top of the box |

**Major keys** (rock, hard rock, pop):
| shape | songs | artists |
|---|---|---|
| 4 3 2 1 | 74 | 65 |
| 2 3 2 1 | 71 | 61 |
| 2 1 6, 1 | 63 | 53 |
| 3 2 1 2 | 62 | 57 |
| 3 2 1 6, | 56 | 48 |
| 6 5 4 3 | 53 | 47 |
| 6 5 6 1' | 50 | 41 |
| 5 6 1' 1' | 49 | 40 |

Longer ones (5 notes): 5 4 b3 4 b3 (42 songs), b3 2 b3 2 1 (37), 1 2 3 2 1 (36), b3 4 5 4 b3 (32), 4 b3 4 b3 1 (32), b3 2 1 b7, 1 (31).

What the vocabulary is: **short turns inside the pentatonic box, around the b3-4-5 and around the root**, said over the key (not the chord), mostly falling to the root or the b3. With their exact rhythm too, far fewer are shared (102 by 6+ songs): the shapes are common, the rhythms players put them in vary.

## From teachers and research
- The arc (intro, rising tension, climax, falling tension) is taught as one tool, with "always variations"; the falling part is optional. Page's "Stairway" solo climbs in stages with a dip before the final jump. ([London Guitar Academy](https://www.londonguitaracademy.com/how-to-write-guitar-solos), [Premier Guitar](https://www.premierguitar.com/articles/29793-how-to-craft-more-melodic-solos), [MusicRadar](https://www.musicradar.com/news/10-essential-guitar-solos-to-learn))
- **Repetition is the hook:** repeat a short phrase about four times with a small change; restart a hook phrase every few bars; sequences (the same movement at another height). Gary Moore, Van Halen, Clapton: repeated motifs building to a fever pitch. A solo serves the song; great solos don't need scale runs. (same sources)
- Call and response: a phrase, a beat of space, an answer. ([TrueFire](https://blog.truefire.com/guitar-lessons/call-and-response-guitar-the-conversation-of-improvisation/))
- The blues-rock vocabulary is the minor and major pentatonic "boxes" with bends, vibrato, hammer-ons and pull-offs (B.B. King's and Albert King's boxes, minor to major pentatonic over a dominant chord, unison bends). ([Guitar Player](https://www.guitarplayer.com/technique/22-guitar-licks-you-must-know-for-rock-blues-and-more-tab), [MusicRadar](https://www.musicradar.com/news/25-great-blues-rock-guitar-licks))
- Metal: alternate-picked runs, legato, tapping, sweep arpeggios; the harmonic minor / Phrygian dominant (b2 and the major 3rd). ([JTC](https://jtcguitar.com/article/3-phrygian-dominant-metal-licks))
- Jazz solo research (Weimar Jazz Database, 140 solos, 4,939 units): a solo is a chain of units, 46% licks, 32% lines, the rest melodies, rhythmic figures, expressive moments, quotes and gaps; a quarter of units refer back to an earlier one; a unit lasts about 2 seconds. ([Frieler et al. 2016](https://publica.fraunhofer.de/handle/publica/243389)) A Brazilian study built 12-bar blues solos from licks and had them rated by 173 listeners ([UFPB](https://repositorio.ufpb.br/jspui/handle/tede/9279)).
- Better data on technique exists: guitar tab collections (DadaGP: 26,181 Guitar Pro songs; MySongBook: 932 lead guitar tracks, used to model bends) carry bends, slides, hammer-ons and the string and fret. ([DadaGP](https://arxiv.org/abs/2107.14653), [bends](https://api.deepai.org/publication/modeling-bends-in-popular-music-guitar-tablatures)) Research datasets, on request.

## A new solo writer (proposal; built: Solo New, `docs/SOLO-NEW.md`)
A switch (Solo: Classic / New), Classic as now. Built from the numbers above:
1. **A plan per solo, drawn like real ones:** level (38%), falling (20%), rising (17%), arch (15%), dip (9%), instead of always the arc. The top note can come early and come back.
2. **A chain of licks, each worked over:** a lick (a shared shape above, in a real rhythm), played again 2-4 times with a change (another ending, moved to another note, cut short, an octave up), then the next. Half the bars' rhythms coming back. Units of about 2 seconds, as in the jazz research.
3. **The vocabulary is the box:** the shared shapes over the key's pentatonic box (minor; major for major songs), per genre (metal's natural-minor turns, hard rock's 4 b3 1 b3, rock's major 3 2 1 6,), in two or three box positions, moving up a position by a jump.
4. **Busy from the start:** the same density through the solo (by genre: 5-8 notes a bar), few gaps.
5. **Quick runs turn:** patterns in groups of 3 or 4 that move up or down the box (5 4 b3 4, then 4 b3 1 b3...), no straight scale ladders.
6. **Triplets** now and then (7%).
7. **Endings that lead on:** most solos run into the next section with a short note; some land on the root.
8. The player's character stays (bends, unison bends, double-stops, trills, hands) and the drummer keeps following the solo.

Measured against the table above until the app's solos sit near the real ones; the lick-variety check (`scripts/study/lick-variety.ts`) keeps them from repeating across songs.

Later, if wanted: a tab collection (DadaGP) for bends, slides and where on the neck licks are played.
