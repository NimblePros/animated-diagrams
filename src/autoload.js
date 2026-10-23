// Mounts every <div class="diagram-player" data-diagram="<url>"> on the page.
// <url> is a diagram module whose default export is a Diagram. Optional
// data-keyboard="page" makes Space / Right Arrow work without focusing the player.
//
// Used by standalone pages and by the `animated-diagram` Hugo shortcode. The host page
// needs an import map for `animejs` (see README.md).

import { mountDiagram } from './player.js';

for (const root of document.querySelectorAll('.diagram-player[data-diagram]')) {
  if (root.dataset.mounted) continue;
  root.dataset.mounted = 'true';
  import(new URL(root.dataset.diagram, document.baseURI).href)
    .then(({ default: diagram }) => mountDiagram(diagram, root, { keyboard: root.dataset.keyboard }))
    .catch((error) => {
      console.error(`Could not load diagram ${root.dataset.diagram}`, error);
      root.textContent = 'This diagram could not be loaded.';
    });
}
