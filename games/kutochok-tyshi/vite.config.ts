import { defineConfig } from 'vite';

// The production build is published by the kozack.me site at /games/kutochok-tyshi/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/games/kutochok-tyshi/' : '/',
  build: {
    outDir: '../../src/games/kutochok-tyshi',
    emptyOutDir: true,
  },
}));
