# Music Idea Generator

Browser app that generates 8-bar musical ideas (chords, strumming, drums, bass) and plays them with sampled instruments. Static site, no server.

## Run it

```bash
npm install
npm run dev
```

Then open the URL it prints. `npm run build` makes a static build in `dist/`.

## Project layout

- `src/generator.ts`: builds an idea from options + seeds (pure and deterministic)
- `src/parts/`: chords, strum, drums, bass generators
- `src/rhythm/`: meters, beat groupings, phrase plans
- `src/theory/`: chords, scales, piano and guitar voicings
- `src/audio/`: instruments, mixer, playback engine
- `src/ui/`: page rendering and the per-part controls
- `spike/`: the original single-file prototype (reference only)
- `scripts/prepare-samples.mjs`: downloads and compresses the samples into `public/samples/` (`npm run samples`)

## Sample credits

- Piano, acoustic guitar, electric guitar, electric bass: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nicholaus P. Brosowsky, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Drums: [Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums) by Karoryfer Samples, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Samples were trimmed, mixed to mono and re-encoded. Details are in `public/samples/CREDITS.md`.
