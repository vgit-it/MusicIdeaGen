# Lick lab

Page (`lick-lab.html`, `src/lab/lickLab.ts`; `npm run dev`, then `/lick-lab.html`; built and deployed with the app, not linked from it). Pick a key and a jam, tap a lick, hear it over the band.

## What it does
- **Jam:** a real 8-bar idea from the generator (`buildIdea`) with the key, mode and chords set (`GenOptions.key`, `.mode`, `.chords`; `planSong` is exported for it). One chord, or the verse lab's progressions for the mode. Rock, pop or funk feel; tempo; "New band take" for other drums, strumming and bass. Guitar 2 is replaced by the lick.
- **Placing:** one lick per chord (every 2 bars), over 1 or 2 bars of it. Named licks are fitted to the chord by `placeLibLick` as Guitar 2 does; the real kinds are fitted by `realLick` / placed on the key.
- **Lists:**
  - Named licks (`LIBRARY`, `src/parts/licks.ts`), by player, with their techniques. Minor or major licks only for a matching mode (switch off to see all; a lick the chord doesn't suit is skipped and said so).
  - Real shapes (`src/realism/solo-licks.json`, most common first), in a real lick rhythm you choose (`licks.json`, rhythms with the same note count).
  - Real rhythms (`licks.json`), notes walked by the real odds (`realLick`); "New take" for other notes.
- **Sound:** the app's own engine and hands; lead Clean / Crunch / Distortion, backing guitar or piano, levels, and Prepare real sound (the real amps; redo after changing the lick).
- A roll shows the lead's notes over the chords (a line marks a bend), with a playhead.

- **Tags** (`docs/SOLO-PLAN.md`, `src/parts/solotags.ts`): each real shape shows its contour, mean move, biggest leap, half steps, repeats and whether it ends strong; each rhythm its busyness, notes a beat and shortest note. The Mood fit menu sorts the shapes by how well that mood's intervals (the vocal's table) suit them.

## Not yet (phase 3)
The moves (bend moves, held notes, build-ups, trademark notes, staircases, triplets) are closures inside `generateSolo2` (`src/parts/solo2.ts`): to audition them they have to be pulled out into functions first, keeping the solo writer's output note for note.
