// Voice prints (experiments/kokoro-singer): a real voice's own vowels, measured from Kokoro-82M's voices
// (Apache 2.0) speaking each vowel ("h_d" words), in place of the textbook's.

import type { VoicePrint } from './fof';

/** Onyx (am_onyx): a dark, low American man. Paul: "Onyx clean is a good voice". */
export const ONYX: VoicePrint = {
  vowels: {
    IY: [[363, 1893, 2486]], IH: [[457, 1536, 2500]], EY: [[514, 1354, 2465], [354, 1859, 2458]], EH: [[555, 1401, 2489]],
    AE: [[567, 1256, 2480]], AA: [[541, 1024, 2505]], AO: [[541, 975, 2495]], OW: [[519, 956, 2516], [402, 1211, 2217]],
    UH: [[442, 967, 2454]], UW: [[360, 1047, 2258]], AH: [[532, 1159, 2486]], AX: [[437, 1304, 2507]],
    AY: [[600, 1161, 2515], [374, 1898, 2378]], AW: [[613, 1258, 2491], [410, 1008, 2431]], OY: [[481, 873, 2506], [384, 1466, 1930]],
  },
  high: [3187, 5090],
  bws: [65, 166, 101, 226, 419],
};
