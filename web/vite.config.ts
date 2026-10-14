import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Relative base: the bundle is served from Flutter's InAppLocalhostServer.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    reportCompressedSize: true,
  },
  plugins: [
    {
      // local test models (public/dev-models) must never ship in the app
      name: 'strip-dev-models',
      closeBundle() {
        rmSync(resolve(__dirname, 'dist/dev-models'), { recursive: true, force: true });
      },
    },
  ],
});
