# Solo: New (switch)

A new solo writer built from how real guitar solos go (`docs/STUDY-SOLO.md`: 2,938 solos in the Lakh MIDI collection). The Solo switch in the Guitar 2 row (Classic / New, Classic by default). Classic: exactly as before (checked note for note over 126 songs, 4/4, 6/8, 3/4, with and without Real licks). Applies to solo sections, outro solos and lead breaks. Kept with the idea and in shared links (`leadSolo`). Code: `src/parts/solo2.ts`; the notes are played by the same hands as Classic (`playSolo`, `src/parts/solo.ts`).

## How it writes a solo
- **A shape, drawn as real solos are:** level 38%, falling 20%, rising 17%, arch 15%, a dip 9%. The shape sets where each quarter of the solo sits; between quarters the line moves position with a jump. No single climb to a late peak: the top note can come early and come back.
- **A chain of licks:** each a note shape real solos share (`src/realism/solo-licks.json`: 1,094 shapes, each played by 10+ songs from 8+ artists, over the key's root; turns inside the pentatonic box, around the b3-4-5 and the root), weighted by how common it is and how much the genre plays it, in a lick rhythm real solos share (`src/realism/licks.json`, `docs/LEAD-LICKS.md`) picked for the solo's speed. Placed in the octave nearest the last note, chord notes on bar lines, chord changes and held notes, nothing clashing with the riff, held notes that don't rub.
- **Worked over:** most licks are played again 1-3 times, a bar on (a short one now and then half a bar), the note before ringing on to it (never across more than half a bar; a repeat that doesn't fit ends it): the same, a new ending (the last one or two notes another way), an answer (another shape in the same rhythm), or an octave away. A lick to be played again starts at a bar line.
- **Busy from the start:** notes a bar by genre (real solos: rock 5.4, hard rock 7.1, metal 8, pop 6.5, funk 4.6) and player (the shredder busier, melodic and raw players sparer), the same all through; a breath now and then.
- **Quick runs that turn:** in solos with runs (real: hard rock and metal 56%, rock 31%; more for the shredder), a 3 or 4 note cell (down-down-up, up-up-down...) moved down (or up) the box a note at a time, landing on a held chord note; 15 cells, moving on a note or two at a time, now and then starting in 8ths. The shredder runs through the whole scale.
- **The trademark, once, anywhere:** most solos have one held note the player's way (a unison bend, a raked overbend, a trill, octaves, a bend), on the solo's high point so far, somewhere from 15% to 90% of the way.
- **Endings:** 6 in 10 run on into the next section (a short last note), 4 in 10 land on the root, held.
- Now and then the hook quoted first (1 in 4), and a held note picked again. Where no lick fits (the riff in the way): a turning run, or a short chord note.

- **Second round** (`docs/STUDY-SOLO.md`, "In detail"):
  - **Bars back later:** at a bar line, now and then a bar played earlier (or two) comes back, two or more bars on most often, the very next bar sometimes; as it was, or with a new ending; moved a note or two along the scale where the chords have changed. Single licks come back too. A repeat that no longer fits the chord is moved along the scale instead of dropped.
  - **More of the scale:** shapes with notes outside the box count more, and now and then a box note becomes the scale note next to it, as real solos use them: over minor keys the 2nd, b6 and 6th; over major keys the 4th, the 7th, and the b7 and b3 (quick only).
  - **Back to the top:** half the licks lean toward reaching back up to the solo's high point.
  - **Triplets:** about one solo in five (more for blues players and shredders) plays 8th-note triplets, a beat or two at a time (now and then three quarter triplets over two beats), mostly falling or turning, landing on a held chord note on the next beat; from the shared shapes, else a triplet figure through the box. Guitar 2's notes can now sound between the 16ths (`shift`), in playback, Prepare real sound and the MIDI export.

## Measured (`scripts/study/solo-study.ts`, 40 tracks a genre)

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
| outside the pentatonic | 24% | 14% | 20% |
| triplet notes | 7% | 1% | 5% |
| solos with 8th triplets | 18% | 0% | 16% |
| 8th-triplet groups falling / rising / turning | 36 / 15 / 49% | | 38 / 10 / 52% |
| held notes (a beat+) a bar | 2.5 | 2.3 | 2.3 |
| longest note (beats) | 2.0 | 2.2 | 2.2 |
| 5-note runs heard in 3+ other songs (`lick-variety.ts`) | | 28% | 4% |
| 5-note runs played twice or more in the same song | | 6% | 8% |

Repetition dialled down by ear (Paul: too much at 40% of bars coming back, then at 25%): to about 10%, close to Classic, most of it changed (the real 42% of exact copies is likely raised by copied bars in fan-made files). Still apart: 16th-note triplets in fast runs (real: 4 in 100 notes; Guitar 2 plays one note a step, so six to a beat isn't possible yet).

## Next
- Paul listens: Solo New against Classic, rock, hard rock, metal.
- Then: 16th-note triplets in fast runs; bends where real players put them (a tab collection, `docs/STUDY-SOLO.md`).
