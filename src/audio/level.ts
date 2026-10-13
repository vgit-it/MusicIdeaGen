// The vocal rider (Paul: "i want the max volume of vocals to remain more or less similar throughout the
// song and not jump around wildly"). A sung line comes out of the synth with notes far apart in level: a
// note up past the break or belted up to 15 dB over the rest, and each line was set by its loudest
// moment, so a line with one big note had a quiet body (choruses sounded quieter, then spiked). As an
// engineer rides a vocal fader: each moment's level against the line's body (its typical sung level),
// the loud ones brought most of the way down (by `ratio`), the quiet sung ones lifted a little (`lift`),
// breaths, consonants and fade-outs left alone; the fader moving smoothly, ahead of the peaks.

/** Ride a line's level, in place (before it's brought to its set level). */
export function ride(a: Float32Array, rate: number, ratio = 4, lift = 0.4) {
  const hop = Math.round(0.01 * rate), win = Math.round(0.03 * rate);
  const n = Math.ceil(a.length / hop);
  if (n < 4) return;
  const env = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    const c = f * hop, s0 = Math.max(0, c - (win >> 1)), s1 = Math.min(a.length, c + (win >> 1));
    let e = 0;
    for (let i = s0; i < s1; i++) e += a[i] * a[i];
    env[f] = 10 * Math.log10(e / Math.max(1, s1 - s0) + 1e-12);
  }
  // (the body: the typical level of the sung moments, those within 30 dB of the loudest)
  const top = Math.max(...env);
  const sung = [...env].filter((x) => x > top - 30).sort((x, y) => x - y);
  if (!sung.length) return;
  const ref = sung[Math.floor(sung.length * 0.6)];
  const want = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    const d = env[f] - ref;
    want[f] = d > 0 ? -d * (1 - 1 / ratio) : d > -8 ? -d * lift : d > -16 ? 8 * lift * ((16 + d) / 8) : 0;
    want[f] = Math.max(-14, Math.min(4, want[f]));
  }
  // (ahead of the peaks: the fader starts down 30 ms before a loud moment; then eased both ways, no lag)
  const look = 3, g = new Float64Array(n);
  for (let f = 0; f < n; f++) { let m = want[f]; for (let k = Math.max(0, f - look); k <= Math.min(n - 1, f + look); k++) m = Math.min(m, want[k]); g[f] = m; }
  const k = 1 - Math.exp(-1 / 5);
  for (let f = 1; f < n; f++) g[f] = g[f - 1] + (g[f] - g[f - 1]) * k;
  for (let f = n - 2; f >= 0; f--) g[f] = g[f + 1] + (g[f] - g[f + 1]) * k;
  for (let i = 0; i < a.length; i++) {
    const x = i / hop, f = Math.min(n - 2, Math.floor(x)), t = x - f;
    a[i] *= 10 ** ((g[f] * (1 - t) + g[f + 1] * t) / 20);
  }
}
