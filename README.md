# Music Idea Generator

Browser app that generates 8-bar musical ideas (chords, strumming, drums, bass) and plays them with sampled instruments. Any idea can grow into a full track (intro, verses, choruses, bridge, outro), with instruments that suit each section. Lock the parts you like and reroll the rest, share an idea by link, and export it as a mastered MP3 or WAV, stems, or MIDI for your DAW. Static site, no server.

## Run it

```bash
npm install
npm run dev
```

Then open the URL it prints. `npm run build` makes a static build in `dist/`.

## Project layout

- `src/generator.ts`: builds an idea from options + seeds (pure and deterministic)
- `src/track.ts`: grows an idea into a track of sections (see `docs/TRACKS.md`)
- `src/sounds.ts`: which instrument plays each part (by genre, and per track section)
- `src/parts/`: chords, strum, riff, drums, bass and guitar 2 generators
- `src/rhythm/`: meters, beat groupings, phrase plans
- `src/theory/`: chords, scales, piano and guitar voicings
- `src/audio/`: instruments, mixer, playback engine
- `src/export/midi.ts`: MIDI export
- `src/ui/`: page rendering and the per-part controls
- `spike/`: the original single-file prototype (reference only)
- `scripts/prepare-samples.mjs`: downloads and compresses the samples into `public/samples/` (`npm run samples`)

## Sample credits

- Piano: [Salamander Grand Piano V3](https://github.com/sfzinstruments/SalamanderGrandPiano) by Alexander Holm, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Acoustic guitar (Shinyguitar), electric guitar (Emilyguitar), bass (Black And Blue Basses) and drums (Big Rusty Drums): [Karoryfer Samples](https://github.com/sfzinstruments), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- Electric guitar speaker cabinets: Dauntless IR pack by resington (via github.com/fnpngn/IR), "free to share however you wish but is not for resale".

Samples were trimmed, mixed to mono and re-encoded. Details are in `public/samples/CREDITS.md`.

## Libraries

- [Tone.js](https://github.com/Tonejs/Tone.js) (MIT): audio engine.
- [@tonejs/midi](https://github.com/Tonejs/Midi) (MIT): MIDI export.
- [@breezystack/lamejs](https://github.com/breezystack/lamejs) (LGPL-3.0): MP3 encoding, a JavaScript port of [LAME](https://lame.sourceforge.io/). It's loaded unmodified as its own file (only when you export an MP3), so it can be swapped for another build.
- [fflate](https://github.com/101arrowz/fflate) (MIT): zipping stems.
