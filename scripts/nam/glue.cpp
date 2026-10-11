// Minimal C ABI over NeuralAmpModelerCore for the browser (one handle per loaded model).
#include <memory>
#include <string>
#include "NAM/dsp.h"
#include "NAM/get_dsp.h"
#include "json.hpp"

extern "C" {
void* nam_create(const char* json) {
  try {
    auto j = nlohmann::json::parse(json);
    return nam::get_dsp(j).release();
  } catch (...) { return nullptr; }
}
double nam_expected_sample_rate(void* h) { return static_cast<nam::DSP*>(h)->GetExpectedSampleRate(); }
double nam_loudness(void* h) { auto d = static_cast<nam::DSP*>(h); return d->HasLoudness() ? d->GetLoudness() : 0; }
void nam_reset(void* h, double sr, int maxBuf) { static_cast<nam::DSP*>(h)->Reset(sr, maxBuf); }
void nam_process(void* h, float* in, float* out, int n) {
  float* i[1] = {in}; float* o[1] = {out};
  static_cast<nam::DSP*>(h)->process(i, o, n);
}
void nam_destroy(void* h) { delete static_cast<nam::DSP*>(h); }
}
