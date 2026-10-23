// Serves the repo root for the browser tests, so fixtures load the engine from src/,
// anime.js and Vue from node_modules, and the fonts from fonts/, with no network.

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = fileURLToPath(new URL('../..', import.meta.url));
const playerSpy = fileURLToPath(new URL('./fixtures/player-spy.js', import.meta.url));

export default defineConfig({
  root,
  plugins: [vue()],
  resolve: {
    // The Vue components import '../src/player.js'; give them a copy that records
    // destroy() calls. Nothing else imports the player by that path.
    alias: [{ find: /^\.\.\/src\/player\.js$/, replacement: playerSpy }],
  },
  // Pre-bundle up front, so Vite doesn't reload the page mid-test when it finds them.
  optimizeDeps: { include: ['animejs', 'vue'] },
  // Tests expect console errors (e.g. autoload's failed diagrams), so don't echo them here.
  server: { port: 5179, strictPort: true, forwardConsole: false },
  // 'error' also hides the warning that autoload's dynamic import can't be analyzed, which is intended.
  logLevel: 'error',
});
