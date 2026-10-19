import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under any repo name.
// Two pages: the generator and the band view (opened from its Band link).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), band: resolve(__dirname, 'band.html') },
    },
  },
});
