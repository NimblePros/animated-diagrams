// Package entry point: the model classes for authoring diagrams and the player
// for mounting them. Import narrower entry points (`animated-diagrams/model`, ...)
// when you only need one part.

export { Diagram, Node, Edge, Callout, Caption, Reset } from './diagram-model.js';
export { mountDiagram } from './player.js';
export { renderDiagram, part } from './diagram-renderer.js';
export { buildTimeline } from './diagram-animator.js';
