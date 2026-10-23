// Stands in for src/player.js in the Vue components (see vite.config.js): mounts
// with the real player and logs mounts and destroy() calls in window.playerLog.

import { mountDiagram as realMountDiagram } from '../../../src/player.js';

export * from '../../../src/player.js';

window.playerLog = [];

export async function mountDiagram(diagram, root, options) {
  const player = await realMountDiagram(diagram, root, options);
  window.playerLog.push(`mount ${diagram.id}`);
  const destroy = player.destroy;
  return {
    ...player,
    destroy() {
      window.playerLog.push(`destroy ${diagram.id}`);
      destroy();
    },
  };
}
