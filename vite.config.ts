import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under any repo name.
// Pages: the generator, the band view (opened from its Band link) and the lick lab (/lick-lab.html, not linked).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), band: resolve(__dirname, 'band.html'), lickLab: resolve(__dirname, 'lick-lab.html') },
    },
  },
});
