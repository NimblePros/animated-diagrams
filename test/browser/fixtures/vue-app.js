// Mounts AnimatedDiagram.vue with a diagram given as a Diagram, a module namespace
// or a promise. Tests call window.show(kind, props) and window.hide() to mount and unmount it.

import { createApp, h, shallowRef } from 'vue';
import AnimatedDiagram from '../../../vue/AnimatedDiagram.vue';
import * as sampleModule from './sample-diagram.js';

const current = shallowRef(null);
let extraProps = {};
let key = 0;

const sources = {
  diagram: () => sampleModule.default,
  module: () => sampleModule,
  promise: () => import('./sample-diagram.js'),
};

createApp({
  render: () => current.value && h(AnimatedDiagram, { key, diagram: current.value, keyboard: 'page', ...extraProps }),
}).mount('#app');

window.show = (kind, props = {}) => {
  key++;
  extraProps = props;
  current.value = sources[kind]();
};
window.hide = () => {
  current.value = null;
};
