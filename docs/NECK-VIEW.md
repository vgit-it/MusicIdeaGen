# Solo on the neck

A card under the Melody view, for solos and lead breaks only (`idea.soloCurve` exists). Shows what the solo writer followed, over where the hands play it.

## What it shows
- **Curves** (top): energy (-1 calm to 1 strong), the height the writer aimed at (orange), the pace (blue dashed). Height and pace follow the energy, go against it or ignore it, per solo; the stats line says which.
- **Frets** (middle): every note at its fret, coloured by string, on the same time line. A faint box per bar shows the frets the hand uses, a line its middle. Marks: bend arrow, slide run-in, h / p / s / tr / tm.
- **Fretboard** (bottom): the notes' places, faint by how often they're used. Playing: the bar's notes strong, the sounding note lit.
- Stats: shape, couplings, frets used, strings, hand moves between bars (3 frets or more), technique counts.

## Code
- `src/parts/solo2.ts`: `generateSolo2` returns `curve` (per 16th: energy, centre, pace); `src/track.ts` stores it as `idea.soloCurve` (solo and lead break).
- `src/ui/necknotes.ts`: pure. Idea's Guitar 2 hits to string and fret (the hands' `touch` for single notes, the written strings for double-stops, else the lowest fret on the highest string), bars, shifts, counts.
- `src/ui/neck.ts`: the card; `src/main.ts` feeds it like the roll (show, step, stopped).
- `npm run neck-check`: every solo has curves of the right length and range; every note on a real string and fret (0-24) that sounds its pitch.

## Not yet
- Verse fills and licks (no curve there), a Twin layer, tapping a note to hear it, the bass and rhythm guitar on the same neck.
