// The LF pulse's own spectrum per Rd: H1-H2 and the harmonics' fall (a check on fof.ts's lfPulse)
import { lfPulse } from '../../src/audio/fof';
for (const rd of [0.4, 0.6, 0.9, 1.2, 1.6, 2.2]) {
  const x = lfPulse(rd), L = x.length;
  const H = (h: number) => { let re = 0, im = 0; for (let i = 0; i < L; i++) { re += x[i] * Math.cos((2 * Math.PI * h * i) / L); im += x[i] * Math.sin((2 * Math.PI * h * i) / L); } return 10 * Math.log10(re * re + im * im); };
  const h1 = H(1), mean = x.reduce((a, b) => a + b, 0) / L;
  console.log(`rd ${rd}: H1-H2 ${(h1 - H(2)).toFixed(1)}  H1-H4 ${(h1 - H(4)).toFixed(1)}  H1-H10 ${(h1 - H(10)).toFixed(1)}  H1-H30 ${(h1 - H(30)).toFixed(1)}  mean ${mean.toFixed(4)}`);
}
