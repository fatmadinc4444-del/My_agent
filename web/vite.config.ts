import { defineConfig } from 'vite';

// Relative base: the bundle is served from Flutter's InAppLocalhostServer.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    reportCompressedSize: true,
  },
});
