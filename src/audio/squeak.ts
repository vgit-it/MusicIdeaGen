// Finger squeaks: the sound of fingers sliding along wound strings as the hand moves to a new
// position. Made here rather than sampled: a short brushed "zip" (rough noise as the finger sticks
// and slips) with a faint rising (or falling) buzz under it, the winding ridges passing under the
// finger. An earlier version was mostly the buzz and lasted up to 0.17 s: it came out long and
// whistly, more a squeak toy than a hand.

/** A few different squeaks for a sample rate (made once). */
const made = new Map<number, AudioBuffer[]>();

export function squeaks(sampleRate: number): AudioBuffer[] {
  let out = made.get(sampleRate);
  if (!out) made.set(sampleRate, (out = Array.from({ length: 6 }, (_, i) => squeak(sampleRate, i))));
  return out;
}

function squeak(sr: number, n: number): AudioBuffer {
  // a fixed little random sequence per squeak, so they're the same every time the app loads
  let s = 0x9e3779b9 ^ (n * 7919);
  const rnd = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
  const dur = 0.035 + rnd() * 0.03;
  const len = Math.round(dur * sr);
  const buf = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: sr });
  const x = buf.getChannelData(0);
  // up the neck the ridges pass faster (the pitch rises), down it falls
  const up = n % 2 === 0;
  const f0 = 380 + rnd() * 320, f1 = f0 * (up ? 1.2 + rnd() * 0.3 : 1 / (1.2 + rnd() * 0.3));
  const amps = Array.from({ length: 4 }, (_, k) => (1 / (k + 1)) * (0.6 + rnd() * 0.4));
  const ph = amps.map(() => rnd() * Math.PI * 2);
  let phase = 0, wob = 0, rough = 1, hiss = 0, lp = 0, hp = 0, prev = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    wob += (rnd() - 0.5 - wob) * 0.002;
    const f = f0 * (f1 / f0) ** t * (1 + wob * 0.3);
    phase += (2 * Math.PI * f) / sr;
    let v = 0;
    for (let k = 0; k < amps.length; k++) v += amps[k] * Math.sin((k + 1) * phase + ph[k]);
    // stick and slip
    rough += (0.55 + rnd() * 0.9 - rough) * 0.01;
    hiss = rnd() * 2 - 1;
    // mostly the brushed noise, a little of the buzz
    v = v * rough * 0.3 + hiss * rough;
    // a quick start, a quick fade
    const env = t < 0.15 ? Math.sin((t / 0.15) * Math.PI / 2) ** 2 : Math.cos(((t - 0.15) / 0.85) * Math.PI / 2) ** 2;
    v *= env;
    // keep it in the squeak's range (above the note's body, well below the fizz)
    lp += (v - lp) * 0.3;
    hp = 0.97 * (hp + lp - prev);
    prev = lp;
    x[i] = hp;
    peak = Math.max(peak, Math.abs(hp));
  }
  for (let i = 0; i < len; i++) x[i] /= peak || 1;
  return buf;
}
