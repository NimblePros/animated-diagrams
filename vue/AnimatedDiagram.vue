<script setup>
// Vue wrapper around mountDiagram. `diagram` is a Diagram, a module whose
// default export is a Diagram, or a promise of either (e.g. `import('./x.js')`).
//
//   import diagram from './diagrams/class-libraries-only.js'   (in a <script setup> block)
//   <AnimatedDiagram :diagram="diagram" />
//
// In a Slidev deck, use SlidevAnimatedDiagram.vue ('animated-diagrams/slidev') instead:
// its steps follow Slidev clicks and it starts on slide enter.
//
// `keyboard` is passed through to the player. `fonts` is a stylesheet URL to load
// fonts from (e.g. GOOGLE_FONTS_CSS); by default the bundled fonts are used.
// `captions` (true by default) shows the caption box; false turns captions off.
// `autoplay` (true by default) plays the diagram by itself once it's scrolled into
// view; false makes it advance one step per click or key press.

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { mountDiagram } from '../src/player.js';
// Imported statically too, so Vite bundles the styles even if the player's own
// <link> to diagram.css can't be resolved (see "Using it with Vite" in README.md).
import '../src/diagram.css';
// Vite bundles the font files through this import, so the player doesn't load its
// own copy of fonts.css unless `fonts` names a stylesheet.
import '../fonts/fonts.css';

const props = defineProps({
  diagram: { required: true },
  keyboard: { type: String, default: 'player' },
  fonts: { type: [String, Boolean], default: false },
  captions: { type: Boolean, default: true },
  autoplay: { type: Boolean, default: true },
});

const root = ref();
let player;
let unmounted = false;

onMounted(async () => {
  const resolved = await props.diagram;
  const diagram = resolved?.default ?? resolved;
  if (unmounted) return;
  player = await mountDiagram(diagram, root.value, {
    keyboard: props.keyboard,
    fonts: props.fonts,
    captions: props.captions,
    autoplay: props.autoplay,
  });
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
