# Lead room (switch)

From `docs/STUDY-LEAD.md`, item 4: real hard rock and metal lead guitars stay out of the singer's way (only 21% / 15% of their notes while the singer sings; funk 35%), and play in the gaps: intros, between verse and chorus, the solo. The app's Guitar 2 played under the singer about as much in every genre (37-63%). A switch in the Guitar 2 row: **Room: Off / On**. Off: exactly as before (checked note for note over 126 songs, 4/4, 6/8, 3/4). Tracks only (an idea alone is unchanged). Kept with the idea and in shared links (`leadRoom`).

## What it does (`makeRoom`, `src/track.ts`)
- After the singer's lines are written, each four-bar run (not solos) keeps out from under them by chance, by genre: hard rock 80%, metal 70%, funk 70%, pop 10%; rock, grunge and alt metal 0% (their real leads play under the singer about as much as the app already did). There, Guitar 2's notes under a sung line go (from just before it starts), and notes ringing into one stop where it starts. What's left plays in the gaps: answers at the ends of lines, the end of a verse into the chorus, fills.
- A band intro (the whole band from bar 1) in those genres now and then (by the same chances) gets a lead line over it (a melody over the riff, or licks answering the band).

## Before → after (280 app songs; Lines, Figures and Room all on vs real songs)
| lead notes while the singer sings | Off | Room on | All three on | Real songs |
|---|---|---|---|---|
| hard rock | 41% | 13% | **18%** | 21% |
| metal | 37% | 14% | **19%** | 15% |
| funk | 63% | 30% | **37%** | 35% |
| pop | 67% | 66% | 72% | 59% |
| rock, grunge, alt metal | 41-47% | (as before) | 45-55% | 43-56% |

- Hard rock: sung bars with a lead note 57% → 31% (real 14%); the lead's answers in the gaps stay (64% of sung lines answered).
- Pop still plays under the singer a bit more than real pop (Figures add to it: a figure plays through the verse).

## Also fixed (`src/audio/multisampler.ts`)
A hammer-on or pull-off right after a note with vibrato could throw "setValueAtTime overlaps setValueCurveAtTime" during playback (seen in the browser console; that note's sound was cut). The quick note's fall-off is now never scheduled before the note itself. No other change to the sound.

## Next
- Paul listens: Room on vs off in hard rock and metal tracks.
- Then item 5 of the study: lead breaks in pop and funk (an intro or instrumental melody instead of a full solo), and some pop songs with no lead line at all.
