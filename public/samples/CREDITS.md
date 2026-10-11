# Sample credits

| Instrument | Source | License |
|---|---|---|
| Piano | [Salamander Grand Piano V3](https://github.com/sfzinstruments/SalamanderGrandPiano) by Alexander Holm | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Acoustic guitar | [Shinyguitar](https://github.com/sfzinstruments/karoryfer.shinyguitar) by Karoryfer Samples (D. Smolken) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Electric guitar | [Emilyguitar](https://github.com/sfzinstruments/karoryfer.emilyguitar) by Karoryfer Samples (D. Smolken) | CC0 1.0 |
| Bass | [Black And Blue Basses](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses) by Karoryfer Samples | CC0 1.0 |
| Drums | [Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums) by Karoryfer Samples | CC0 1.0 |
| Strings (cello, viola and violin sections) and percussion (tambourine, shaker, congas) | [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE) by Versilian Studios | CC0 1.0 |

| Guitar cabinet impulse responses (`ir/crunch.wav`, `ir/dist.wav`) | Dauntless IR pack by resington (Engl Fireball 4x12), via [fnpngn/IR](https://github.com/fnpngn/IR) | "Free to share however you wish but is not for resale" |
| Clean guitar cabinet impulse response (`ir/clean.wav`): Fender Twin Reverb open-back 2x12 (the cabinet of the "TwinReverb (spice)" profile, trimmed to 120 ms) | [Kapitonov Plugins Pack](https://github.com/olegkapitonov/Kapitonov-Plugins-Pack) by Oleg Kapitonov | GNU GPL v3+ |
| Real amps (`../amp/marshall-crunch.nam`, `../amp/marshall-high.nam`, `../amp/fender-clean.nam`, `../amp/bass-drive.nam`): Marshall JCM2000 crunch and high-gain captures ("Tim R JCM2000 Crunch", "Tim R JCM2000 L2 G8"), a Fender Twin Reverb clean capture ("Tim R Fender TwinVerb Norm Bright") and a Tech 21 dUg DP3X bass preamp capture ("Jason Z Tech21 dUg DP3X bass preamp pedal all dimed no shift") | [NAM_models](https://github.com/pelennor2170/NAM_models), Neural Amp Modeler community collection | [GNU GPL v3](../amp/COPYING-models.txt) |
| Real amp engine (`../amp/nam-processor.js`, `../amp/nam.wasm`) | [NeuralAmpModelerCore](https://github.com/sdatkinson/NeuralAmpModelerCore) by Steven Atkinson (with [Eigen](https://eigen.tuxfamily.org), MPL 2.0, and [nlohmann/json](https://github.com/nlohmann/json), MIT), built with `scripts/build-nam.sh` | [MIT](../amp/LICENSE-nam-core.txt) |

Changes: a subset of notes, velocity layers and round robins. Each sample was mixed to mono, normalized, trimmed (leading silence and length) and converted to 80 kbps MP3. The electric guitar is recorded direct, so the amp and speaker sound is simulated in the app.

Hand claps are made in the app from shaped noise.

Regenerate with `npm run samples` (see `scripts/prepare-samples.mjs`); `npm run samples -- strings perc` remakes just those sets. Then `npm run tuning` re-measures the guitar and bass tuning (`scripts/measure-tuning.mjs`).
