<script setup>
// Slidev wrapper around mountDiagram. Like AnimatedDiagram.vue, but the diagram's
// steps follow Slidev clicks: each click (keyboard, presenter clicker, or the
// navigation buttons) plays the next step, and the deck moves to the next slide
// once the diagram has finished. Going back a click jumps back a step.
//
//   import diagram from './diagrams/class-libraries-only.js'   (in a <script setup> block)
//   <AnimatedDiagram :diagram="diagram" />
//
// Props:
//   diagram   A Diagram or a module whose default export is a Diagram. A promise of
//             either also works, but then `steps` must say how many steps it has,
//             because Slidev counts a slide's clicks before the promise resolves.
//   clicks    true (default): steps follow clicks. false: the diagram plays by
//             itself when the slide is entered and pauses when it's left.
//   at        Where the diagram's clicks start, like v-click's `at`: '+1' (default)
//             is the next click after the elements before it, a number is absolute.
//   controls  Show the player's control bar. Defaults to hidden in clicks mode,
//             where Slidev's navigation is the control.
//   keyboard  Passed to the player when `clicks` is false ('player' by default;
//             'page' would steal Space / Right Arrow from slide navigation).
//   fonts     A stylesheet URL to load fonts from (e.g. GOOGLE_FONTS_CSS). By default
//             the bundled fonts are used.
//   captions  Show captions (true by default). false hides them, for decks where the
//             presenter narrates, and steps then take only as long as their animation.
//   autoplay  With `clicks` false: true (default) plays the diagram on slide enter;
//             false makes it advance one step per click on the diagram (or Step).
//             Ignored in clicks mode, where each Slidev click already plays one step.
//
// Requires @slidev/client, so import it only inside a Slidev deck or theme.

import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, useId, watch } from 'vue';
import { useIsSlideActive, useSlideContext } from '@slidev/client';
import { mountDiagram } from '../src/player.js';
// Imported statically too, so Vite bundles the styles even if the player's own
// <link> to diagram.css can't be resolved (see "Using it with Vite" in README.md).
import '../src/diagram.css';
// Vite bundles the font files through this import, so the player doesn't load its
// own copy of fonts.css unless `fonts` names a stylesheet.
import '../fonts/fonts.css';

const props = defineProps({
  diagram: { required: true },
  clicks: { type: Boolean, default: true },
  at: { type: [String, Number], default: '+1' },
  steps: { type: Number, default: undefined },
  // No `type`, so an absent prop stays undefined (and the default below applies).
  controls: { default: undefined },
  keyboard: { type: String, default: 'player' },
  fonts: { type: [String, Boolean], default: false },
  captions: { type: Boolean, default: true },
  autoplay: { type: Boolean, default: true },
});

const { $clicksContext, $clicks, $renderContext } = useSlideContext();
const isSlideActive = useIsSlideActive();
// Animate in the slide itself and the presenter's main view; thumbnails and the
// presenter's next-slide preview just show the right state.
const isLive = computed(() => ['slide', 'presenter'].includes($renderContext.value));

const stepCount = props.steps ?? countSteps(props.diagram);

if (props.clicks && stepCount == null) {
  console.warn('[animated-diagrams] Pass `steps` when `diagram` is a promise; falling back to clicks: false.');
}
const clickId = props.clicks && stepCount > 0 ? `animated-diagram-${useId()}` : null;
let clickInfo = null;
if (clickId) onUnmounted(() => $clicksContext.unregister(clickId));

// How many of the diagram's steps the current click count shows.
const clickedSteps = computed(() =>
  clickInfo ? Math.max(0, Math.min($clicks.value - clickInfo.start + 1, stepCount)) : 0,
);

const root = ref();
let player;
let stopWatching;
let unmounted = false;

onMounted(async () => {
  // Register clicks when mounted, like v-click does, so a relative `at` counts the
  // v-clicks before the diagram. This still runs before the slide itself is mounted
  // and Slidev totals its clicks.
  if (clickId) {
    clickInfo = $clicksContext.calculateSince(props.at, stepCount);
    $clicksContext.register(clickId, clickInfo);
  }

  const resolved = await props.diagram;
  const diagram = resolved?.default ?? resolved;
  if (unmounted) return;
  player = await mountDiagram(diagram, root.value, {
    keyboard: clickInfo ? 'none' : props.keyboard,
    fonts: props.fonts,
    autoplay: !!clickInfo || props.autoplay,
    startWhenVisible: false,
    controls: props.controls ?? !clickInfo,
    captions: props.captions,
  });
  if (unmounted) {
    player.destroy();
    return;
  }

  if (clickInfo) {
    player.showStep(clickedSteps.value);
    stopWatching = watch(clickedSteps, (n) => player.showStep(n, { animate: isLive.value }));
  } else if (!isLive.value) {
    player.showStep(player.stepCount);
  } else if (props.autoplay) {
    // Slidev keeps nearby slides mounted, so start on slide enter, not when mounted.
    stopWatching = watch(isSlideActive, (active) => {
      if (!active) player.pause();
      else if (player.timeline.currentTime === 0) player.play();
    }, { immediate: true });
  }
});

onBeforeUnmount(() => {
  unmounted = true;
  // Watchers created after an await aren't stopped with the component.
  stopWatching?.();
  player?.destroy();
});

// The number of steps in a Diagram or module, or undefined for a promise.
function countSteps(value) {
  if (typeof value?.then === 'function') return undefined;
  return (value?.default ?? value)?.steps.length;
}
</script>

<template>
  <div ref="root" class="diagram-player" />
</template>
