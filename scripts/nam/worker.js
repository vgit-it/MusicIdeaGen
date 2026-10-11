
// ---- The real-amp worker (appended to the Emscripten glue above by scripts/build-nam.sh).
// Runs a dry guitar track through an amp model, off the main thread. Several run side by side.
//   { init: { wasm, models: { name: json } } }                → loads the engine and models
//   { id, model, input: Float32Array, rate }                  → { id, output: Float32Array } (both transferred)
// The engine is compiled synchronously (AudioWorklet-style glue: no fetch, no import.meta).

let nam = null;
const handles = {};
const B = 2048;
/** Blocks of silence after which the amp stops computing (its output has died away by then). */
const QUIET = 8;

self.onmessage = (e) => {
  const d = e.data;
  try {
    if (d.init) {
      const m = { wasmBinary: d.init.wasm };
      createNam(m);
      nam = m;
      for (const [name, json] of Object.entries(d.init.models)) {
        const len = nam.lengthBytesUTF8(json) + 1, p = nam._malloc(len);
        nam.stringToUTF8(json, p, len);
        handles[name] = nam._nam_create(p);
        nam._free(p);
        if (!handles[name]) throw new Error(`model ${name} did not load`);
      }
      self.postMessage({ ready: true });
      return;
    }
    const h = handles[d.model];
    const x = d.input, y = new Float32Array(x.length);
    nam._nam_reset(h, d.rate, B);
    const ip = nam._malloc(B * 4), op = nam._malloc(B * 4);
    let quiet = QUIET + 1;
    for (let i = 0; i < x.length; i += B) {
      const n = Math.min(B, x.length - i);
      let loud = false;
      for (let k = i; k < i + n; k++) if (x[k] !== 0) { loud = true; break; }
      if (!loud) {
        // silence in: once the amp's own ring has died away, skip the work
        if (++quiet > QUIET) continue;
      } else {
        // back from a skip: start from a clean, settled amp
        if (quiet > QUIET) nam._nam_reset(h, d.rate, B);
        quiet = 0;
      }
      const a = ip >> 2;
      nam.HEAPF32.fill(0, a, a + B);
      nam.HEAPF32.set(x.subarray(i, i + n), a);
      nam._nam_process(h, ip, op, B);
      y.set(nam.HEAPF32.subarray(op >> 2, (op >> 2) + n), i);
    }
    nam._free(ip);
    nam._free(op);
    self.postMessage({ id: d.id, output: y }, [y.buffer]);
  } catch (err) {
    self.postMessage({ id: d.id, error: String((err && err.message) || err) });
  }
};
