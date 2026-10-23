// Fails validation when imported, for the autoload error test.

import { Diagram } from '../../../src/diagram-model.js';

export default new Diagram({
  id: 'broken',
  title: 'Broken',
  width: 100,
  height: 100,
  nodes: [
    { id: 'a', label: 'A', x: 0, y: 0, step: 1 },
    { id: 'a', label: 'A again', x: 0, y: 0, step: 2 },
  ],
});
