// The diagram most browser tests use. Steps:
// 1 node a (caption)   2 nodes b, c   3 edge a-b (caption)   4 edge b-c
// 5 callout on a-b (caption)   6 reset only b-c (caption)   7 reset everything

import { Diagram } from '../../../src/diagram-model.js';

export default new Diagram({
  id: 'sample',
  title: 'Sample diagram',
  description: 'Three nodes and two edges.',
  width: 1200,
  height: 500,
  nodes: [
    { id: 'a', label: 'Alpha', x: 50, y: 300, step: 1, caption: 'Alpha appears.' },
    { id: 'b', label: 'Beta\nService', x: 450, y: 300, variant: 'module', step: 2 },
    { id: 'c', label: 'Gamma', x: 850, y: 300, step: 2 },
  ],
  edges: [
    {
      id: 'a-b', from: 'a', to: 'b', label: 'Calls\nBeta', variant: 'sync', dashed: true,
      points: [{ x: 343, y: 360 }, { x: 450, y: 360 }], labelAt: { x: 396, y: 360 },
      step: 3, caption: 'Alpha calls Beta.',
    },
    { id: 'b-c', from: 'b', to: 'c', points: [{ x: 743, y: 360 }, { x: 850, y: 360 }], step: 4 },
  ],
  callouts: [{
    id: 'bubble', lines: ['Look!'], x: 300, y: 60, width: 200, height: 100, tail: { x: 396, y: 340 },
    highlights: ['a-b'], step: 5, caption: 'Look at that.',
  }],
  resets: [
    { id: 'clear-b-c', only: ['b-c'], step: 6, caption: 'Beta stops calling Gamma.' },
    { id: 'clear-all', step: 7 },
  ],
});
