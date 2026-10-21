# How clean the voice is: harmonics over noise (dB, Praat's cc HNR) on the voiced parts, and the share
# of energy above 5 kHz (hiss).
import sys, numpy as np, parselmouth, soundfile as sf
for f in sys.argv[1:]:
    snd = parselmouth.Sound(f)
    h = snd.to_harmonicity_cc(time_step=0.01, minimum_pitch=70).values[0]
    h = h[h > -100]
    a, r = sf.read(f); S = np.abs(np.fft.rfft(a)) ** 2; fr = np.fft.rfftfreq(len(a), 1 / r)
    print(f'{f:28} HNR median {np.median(h):5.1f} dB   above 5 kHz {10 * np.log10(S[fr > 5000].sum() / S.sum()):6.1f} dB')
