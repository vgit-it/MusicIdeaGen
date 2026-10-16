# Lead figures (switch)

From `docs/STUDY-LEAD.md`, item 3: real lead guitar parts are often a picked figure over the chords, the same bar after bar (16% of real lead bars, pop 26%; the app 2%), and real lead parts repeat their figures (45% of 2-bar stretches come back; the app 29%). A switch in the Guitar 2 row: **Figures: Off / On**. Off: exactly as before (checked note for note over 126 songs, 4/4, 6/8, 3/4; Lines alone also unchanged). Kept with the idea and in shared links (`leadFigures`).

## What it does
- **A figure song** (`src/track.ts`): with the switch on, some songs (pop 70%, rock and grunge 50%, alt metal 40%, funk 30%, hard rock 25%, metal 20%) have a picked figure through the verses, the same figure in every verse; a first verse that had no Guitar 2 now and then lets it come in halfway; half the bridges that pick a new part take it too. Choruses keep their hook.
- **The figure** (`makeFigure`, `playFigure`, `src/parts/guitar2.ts`), one bar played the same each bar, moved onto each chord by its nearest notes (a fixed window from about B3-E4, lower for grunge, alt metal and metal), by genre:
  - picked through the chord in 8ths (up, up and down, broken), ringing;
  - dotted 8ths with echo (The Edge), ringing;
  - around a ringing pedal note (the key's 5th or root above, the chord's notes moving under it);
  - picked 16ths on two or three of the chord's notes (grunge, alt metal);
  - a short tune: 5-7 notes by step from the chord's 3rd, ending held.
  A four-bar run's last bar now and then turns (its second half a note up) or stops halfway to breathe.
- **Picked arpeggios become the figure** wherever Guitar 2 would play them (ideas too).
- **Lines come back** (with Lines on): after the first line in a section, a later one is often (60%) the same line again, the same rhythm and moves, moved onto the new chords from the last note played.

## Before → after (280 app songs, Lines and Figures on vs Lines on)
| | Lines | Lines + Figures | Real songs |
|---|---|---|---|
| picked figure bars | 2% | **7%** (pop 13%, rock 11%) | 16% (pop 26%, rock 13%) |
| 2-bar stretches repeated | 26% | **34%** (pop 48%, rock 46%) | 45% (pop 46%, rock 40%) |
| notes in phrases of 6+ | 71% | 78% | 85% |
| notes a bar where it plays | 3.9 | 4.3 | 5.4 |
| lead notes while singing | 50% | 55% | 47% |
In pop and rock songs, Guitar 2 now plays a figure in about a fifth of all bars. The study counts the short tune and some turned bars as lines, not arpeggios.

## Next
- Paul listens: Figures on vs off (pop and rock verses most).
- Then item 4 of the study: heavy leads out of the verses (Figures and Lines push the singing overlap up a little).
