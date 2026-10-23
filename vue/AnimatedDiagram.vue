<script setup>
// Vue / Slidev wrapper around mountDiagram. `diagram` is a Diagram, a module whose
// default export is a Diagram, or a promise of either (e.g. `import('./x.js')`).
//
//   import diagram from './diagrams/class-libraries-only.js'   (in a <script setup> block)
//   <AnimatedDiagram :diagram="diagram" />
//
// `keyboard` is passed through to the player. Keep the default ('player') in Slidev:
// 'page' would steal Space / Right Arrow from slide navigation. `fonts` is passed
// through too: a stylesheet URL, or false to skip loading fonts.

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { mountDiagram } from '../src/player.js';
// Imported statically too, so Vite bundles the styles even if the player's own
// <link> to diagram.css can't be resolved (see "Using it with Vite" in README.md).
import '../src/diagram.css';

const props = defineProps({
  diagram: { required: true },
  keyboard: { type: String, default: 'player' },
  // No `type`, so an absent prop stays undefined (and the player's default applies).
  fonts: { default: undefined },
});

const root = ref();
let player;
let unmounted = false;

onMounted(async () => {
  const resolved = await props.diagram;
  const diagram = resolved?.default ?? resolved;
  if (unmounted) return;
  player = await mountDiagram(diagram, root.value, { keyboard: props.keyboard, fonts: props.fonts });
  if (unmounted) player.destroy();
});

onBeforeUnmount(() => {
  unmounted = true;
  player?.destroy();
});
</script>

<template>
  <div ref="root" class="diagram-player" />
</template>
