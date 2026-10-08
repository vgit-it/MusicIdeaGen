// Track dynamics, shared by playback and MIDI export (so an export matches what you hear).

/** How hard the rhythm guitar and bass are played at each energy level (index = energy). */
export const DYNAMICS = [1, 0.8, 0.87, 0.94, 1, 1];

/** Overall level (dB) of a track section at each energy level. */
export const SECTION_DB = [0, -5.5, -4, -3.5, 0, 0];
