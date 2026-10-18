# The solo writer

The app's solo writer (since 2026-10-17 the only one: the Solo switch and the classic writer are gone), built from how real guitar solos go (`docs/STUDY-SOLO.md`: 2,938 solos in the Lakh MIDI collection) and from classic solos' habits (reference tabs, techniques only, no licks taken). Applies to solo sections, outro solos and lead breaks. Code: `src/parts/solo2.ts`; the notes are played by the shared hands (`playSolo`, `src/parts/solo.ts`).

Below: the first version, then each round on top of it. Where a later round replaced something, it says so.

## How it writes a solo
- **A shape, drawn as real solos are** (replaced by the energy shapes, below): level 38%, falling 20%, rising 17%, arch 15%, a dip 9%. The shape sets where each quarter of the solo sits; between quarters the line moves position with a jump. No single climb to a late peak: the top note can come early and come back.
- **A chain of licks:** each a note shape real solos share (`src/realism/solo-licks.json`: 1,094 shapes, each played by 10+ songs from 8+ artists, over the key's root; turns inside the pentatonic box, around the b3-4-5 and the root), weighted by how common it is and how much the genre plays it, in a lick rhythm real solos share (`src/realism/licks.json`, `docs/LEAD-LICKS.md`) picked for the solo's speed. Placed in the octave nearest the last note, chord notes on bar lines, chord changes and held notes, nothing clashing with the riff, held notes that don't rub.
- **Worked over:** most licks are played again 1-3 times, a bar on (a short one now and then half a bar), the note before ringing on to it (never across more than half a bar; a repeat that doesn't fit ends it): the same, a new ending (the last one or two notes another way), an answer (another shape in the same rhythm), or an octave away. A lick to be played again starts at a bar line.
- **Busy from the start:** notes a bar by genre (real solos: rock 5.4, hard rock 7.1, metal 8, pop 6.5, funk 4.6) and player (the shredder busier, melodic and raw players sparer), the same all through; a breath now and then.
- **Quick runs that turn:** in solos with runs (real: hard rock and metal 56%, rock 31%; more for the shredder), a 3 or 4 note cell (down-down-up, up-up-down...) moved down (or up) the box a note at a time, landing on a held chord note; 15 cells, moving on a note or two at a time, now and then starting in 8ths. The shredder runs through the whole scale.
- **The trademark, once, anywhere:** most solos have one held note the player's way (a unison bend, a raked overbend, a trill, octaves, a bend), on the solo's high point so far, somewhere from 15% to 90% of the way.
- **Endings:** 6 in 10 run on into the next section (a short last note), 4 in 10 land on the root, held.
- Now and then the hook quoted first (1 in 4), and a held note picked again. Where no lick fits (the riff in the way): a turning run, or a short chord note.

- **Second round** (`docs/STUDY-SOLO.md`, "In detail"):
  - **Bars back later** (taken out again, by ear: too repetitive): at a bar line, now and then a bar played earlier (or two) comes back, two or more bars on most often, the very next bar sometimes; as it was, or with a new ending; moved a note or two along the scale where the chords have changed. Single licks come back too. A repeat that no longer fits the chord is moved along the scale instead of dropped.
  - **More of the scale:** shapes with notes outside the box count more, and now and then a box note becomes the scale note next to it, as real solos use them: over minor keys the 2nd, b6 and 6th; over major keys the 4th, the 7th, and the b7 and b3 (quick only).
  - **Leaning on the chord** (Paul: more of the chord's notes, not just the scale): chord notes count more when choosing a lick (on bar lines, chord changes and held notes, then any beat or held 8th); notes from outside the box only off the beat and quick; and a note on a beat or held an 8th+ that isn't one of the chord's moves to the nearest one (a step at most, the way the line was going), 9 times in 10. (The real songs' figures count every instrument's notes, keys and strings too; the app's export has fewer, so its numbers come out a little low.)
  - **Back to the top:** half the licks lean toward reaching back up to the solo's high point.
  - **Triplets:** about one solo in ten (more for blues players and shredders; fewer than real solos, by ear) plays 8th-note triplets, a beat or two at a time (now and then three quarter triplets over two beats), mostly falling or turning, landing on a held chord note on the next beat; from the shared shapes, else a triplet figure through the box. Guitar 2's notes can now sound between the 16ths (`shift`), in playback, Prepare real sound and the MIDI export.

- **Energy** (Paul: solos with energy in shapes): each solo an energy curve, -1 to 1: one wave (rock, pop), several (metal, funk; 2-4), rising (rock, hard rock), a sawtooth built up and dropped (metal, grunge, alt metal), steps (alt metal, grunge), falling now and then; how deep and how many by genre, each solo its own depth; more waves in a longer solo. The height and the pace each follow it with it (strong: higher, busier), against it (the calm high, or the strong sparse) or not, drawn per solo. Lick rhythms are chosen for the pace at that point; quick runs where it's busy; a held note in the calm; the trademark on a crest; the dynamics swell a little with it.
- **Held bends in the calm:** a long held note (2-3 beats), a chord note on the beat, sung the player's way: bent and held, held then bent (a new move for the guitar: `lateBend`, picked low, held a beat, pushed up), bent and let down, picked bent and let down, bent and picked again, a unison bend, or plain with vibrato; then now and then a two-note answer stepping down.
- **Longer solos above 100 bpm:** half the time 16 bars (metal 70%, hard rock 65%, rock and alt metal 50%, grunge 45%, funk 35%, pop 30%), now and then 24 above 130 bpm; long songs still cut them back.
- **From classic solos** (reference tabs: techniques only): build-ups at the energy's crests (a short cell, bent-let-down-pulled-off, a box shape, or the shredder's pedal note, 4-12 times, now and then a step higher every few times, landing held; one in 8 bars, two in 16+); bend moves (bent, let down and pulled off, then held; the same bend picked 3-5 times; bent, let down, bent again; two-string bends climbing), most for melodic and blues players (bends a 100 notes now rock 22, grunge 24, pop 17, hard rock 15, metal 9); staircase repeats (each ending a chord note higher, slid into, held); a third of solos open on one held or bent note; long hard rock and metal solos lean slow-then-fast.
- **Phrasing** (`docs/STUDY-SOLO.md`, phrasing measures): the solo as phrases. Each starts on a bar line, a beat, off the beat (most) or as a pickup, at real rates; real lengths (from one held note to 8+ beats), longer where the pace is up; a call ends up and open (a chord note, not the root), its answer on the root, and an answer often opens with its call's rhythm; most end held, and about 4 in 10 flow straight on into the next off the held note, else a short breath (longer in the calm). The licks, runs, bends and build-ups fill each phrase; a lick may run a beat past the phrase's plan rather than not be played.

| phrasing | Real | before phrasing | now |
|---|---|---|---|
| rest after a phrase: none / under a beat / 1-2 beats / more | 41 / 41 / 12 / 6% | 34 / 45 / 17 / 4% | 37 / 43 / 12 / 8% |
| phrase length (median beats) | 2.8 | 2.7 | 2.7 |
| an answer opens with its call's rhythm | 38% | 21% | 27% |
| ends on a chord note | 71% | 63% | 65% |

## Measured (first version and second round; `scripts/study/solo-study.ts`, 40 tracks a genre)

| | Real | Classic | New |
|---|---|---|---|
| top note first in the first 30% | 55% | 12% | 45% |
| top note first at 60-85% | 14% | 72% | 21% |
| top note played once only | 26% | 72% | 43% |
| visits back to the top (median) | 4 | | 2 |
| climbs steadily | 17% | 46% | 19% |
| notes a bar | 6.0 | 5.0 | 6.5 |
| notes a bar, by quarter | 7 7 7 7 | 4 5 6 5 | 7 7 6 6 |
| silent beats, by quarter | 7 5 5 4% | 18 9 5 7% | 5 4 5 7% |
| straight scale runs | 6% | 33% | 7% |
| into the top note by a jump | 43% | 14% | 46% |
| bars whose rhythm comes back (anywhere) | 55% | 13% | 15% |
| the next bar | 24% | | 10% |
| 2+ bars later | 53% | | 9% |
| bars played again exactly | 42% | | 5% |
| outside the pentatonic | 24% | 14% | 18% |
| on a note the band is playing: all / on a beat / held half a beat+ | 64 / 67 / 68% | 44 / 53 / 61% | 50 / 61 / 64% |
| triplet notes | 7% | 1% | 3% |
| solos with 8th triplets | 18% | 0% | 8% |
| 8th-triplet groups falling / rising / turning | 36 / 15 / 49% | | 25 / 13 / 63% |
| held notes (a beat+) a bar | 2.5 | 2.3 | 2.3 |
| longest note (beats) | 2.0 | 2.2 | 2.2 |
| 5-note runs heard in 3+ other songs (`lick-variety.ts`) | | 28% | 4% |
| 5-note runs played twice or more in the same song | | 6% | 8% |

Repetition dialled down by ear (Paul: too much at 40% of bars coming back, then at 25%): to about 10%, close to Classic, most of it changed (the real 42% of exact copies is likely raised by copied bars in fan-made files). Still apart: 16th-note triplets in fast runs (real: 4 in 100 notes; Guitar 2 plays one note a step, so six to a beat isn't possible yet).

## Next
- Paul listens: Solo New against Classic, rock, hard rock, metal.
- Then: 16th-note triplets in fast runs; bends where real players put them (a tab collection, `docs/STUDY-SOLO.md`).
