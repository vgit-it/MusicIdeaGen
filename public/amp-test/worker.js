// Runs one guitar track through a Neural Amp Modeler model, off the main thread.
self.onmessage = async (e) => {
  const { glue, wasm, model, x } = e.data;
  try {
    const create = (await import(glue)).default;
    const mod = await create({ wasmBinary: wasm });
    const len = mod.lengthBytesUTF8(model) + 1, jp = mod._malloc(len);
    mod.stringToUTF8(model, jp, len);
    const h = mod._nam_create(jp);
    mod._free(jp);
    if (!h) throw new Error('model did not load');
    const R = 48000, B = 2048;
    mod._nam_reset(h, R, B);
    const ip = mod._malloc(B * 4), op = mod._malloc(B * 4), y = new Float32Array(x.length);
    const t0 = performance.now();
    for (let i = 0; i < x.length; i += B) {
      const n = Math.min(B, x.length - i), H = mod.HEAPF32, a = ip >> 2;
      H.fill(0, a, a + B);
      H.set(x.subarray(i, i + n), a);
      mod._nam_process(h, ip, op, B);
      y.set(mod.HEAPF32.subarray(op >> 2, (op >> 2) + n), i);
    }
    const ms = performance.now() - t0;
    mod._nam_destroy(h);
    self.postMessage({ y, ms }, [y.buffer]);
  } catch (err) {
    self.postMessage({ error: String(err && err.message || err) });
  }
};
