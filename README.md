# animated-diagrams

Declarative, step-by-step animated box-and-arrow diagrams rendered as SVG, with typed captions, play/pause/step/replay controls, a scrubber and optional read-aloud. One engine runs in three kinds of hosts:

- **Slidev decks**, through the `<AnimatedDiagram>` Vue component (meant to be re-exported by the [NimblePros Slidev theme](https://github.com/NimblePros/slidev-theme-nimblepros))
- **Blogs and static sites** such as Hugo, through `autoload.js` and a `<div class="diagram-player">`
- **Standalone HTML pages**, like the ones in [`examples/`](examples/)

The engine is plain ES modules with no build step, about 1,000 lines in total. Its only runtime dependency is [anime.js](https://animejs.com/) v4.

## Why this is its own repo

- **Engine (this repo):** `diagram-model.js`, `diagram-renderer.js`, `diagram-animator.js`, `player.js`, `diagram.css`, `autoload.js` and `page.css`. It loads its own CSS relative to `import.meta.url`.
- **Content (stays in each consuming repo):** individual diagram files (`class-libraries-only.js`, ...) and per-topic "kits" such as `cap-kit.js` and `saga-kit.js` that build diagrams from a shorter description. Content files only need `Diagram` from the model.

Keeping the engine in its own versioned package lets every deck, docs site, workshop repo, and blog use it without copying and pasting. An update to the engine is then just a tag bump in each consumer: `npm i github:...#<tag>`.

The intended setup:

```text
animated-diagrams (this repo, tagged releases)
  ├─ slidev-theme-nimblepros   depends on it, exposes <AnimatedDiagram> to every deck
  │    └─ any deck using `theme: nimblepros`   just writes diagrams and uses the component
  ├─ other repos / decks       depend on it directly, import from 'animated-diagrams/model'
  └─ Hugo blog / static pages  load src/autoload.js (CDN or vendored) + an import map for animejs
```

## Layout

```text
src/
  index.js              Package entry: re-exports the model, player, renderer and animator
  diagram-model.js      Diagram, Node, Edge, Callout, Caption, Reset (pure data, no DOM)
  diagram-renderer.js   Turns a Diagram into SVG (everything in its final position)
  diagram-animator.js   Builds one anime.js timeline from the diagram's steps
  player.js             mountDiagram(): controls, captions, keyboard, read-aloud
  autoload.js           Mounts every <div class="diagram-player" data-diagram="..."> on a page
  diagram.css           Player and diagram styles, scoped to .diagram-player
  page.css              Optional page chrome for standalone pages
vue/
  AnimatedDiagram.vue   Vue 3 wrapper around mountDiagram()
  SlidevAnimatedDiagram.vue  Slidev wrapper whose steps follow Slidev clicks
examples/
  index.html
  class-libraries-only/ A complete standalone example
```

### Package entry points

| Import | File |
| --- | --- |
| `animated-diagrams` | `src/index.js` |
| `animated-diagrams/model` | `src/diagram-model.js` |
| `animated-diagrams/player` | `src/player.js` |
| `animated-diagrams/autoload` | `src/autoload.js` |
| `animated-diagrams/renderer` | `src/diagram-renderer.js` |
| `animated-diagrams/animator` | `src/diagram-animator.js` |
| `animated-diagrams/diagram.css` | `src/diagram.css` |
| `animated-diagrams/page.css` | `src/page.css` |
| `animated-diagrams/vue` | `vue/AnimatedDiagram.vue` |
| `animated-diagrams/slidev` | `vue/SlidevAnimatedDiagram.vue` |

## Installing

The package is installed from GitHub, pinned to a release tag:

```sh
npm i github:NimblePros/animated-diagrams#v0.1.0
```

To upgrade, run the same command with the newer tag. If the repo is private, `npm install` needs GitHub access to it, just like the theme.

## Writing a diagram

A diagram is a module whose **default export** is a `Diagram`. Coordinates are in the diagram's own canvas units (`width` × `height`, used as the SVG `viewBox`). Every element has an `id` and a numeric `step`. Elements with the same step animate together, and the next step starts once the slowest one (or its caption) finishes.

```js
import { Diagram } from 'animated-diagrams/model';

export default new Diagram({
  id: 'orders-and-billing',          // also set as data-diagram on the <svg>, for per-diagram CSS
  title: 'Orders call Billing',
  description: 'Orders sends a charge request to Billing.',  // used as the SVG <desc>
  width: 1200,
  height: 400,
  watermark: { text: 'NimblePros.com' }, // or false; defaults to centered Diagram.defaultWatermark
  // stylesheet: new URL('./my-diagram.css', import.meta.url).href,

  nodes: [
    { id: 'orders', label: 'Orders', x: 100, y: 140, step: 1, caption: 'Orders takes the request.' },
    { id: 'billing', label: 'Billing', x: 800, y: 140, step: 2 },
  ],
  edges: [
    {
      id: 'charge', from: 'orders', to: 'billing', label: 'Charge',
      points: [{ x: 393, y: 200 }, { x: 800, y: 200 }],  // orthogonal waypoints, arrowhead at the last
      labelAt: { x: 596, y: 200 },
      step: 2, caption: 'Orders asks Billing to charge the card.',
    },
  ],
});
```

Element types (see the comments in [`src/diagram-model.js`](src/diagram-model.js) for every option):

- **Node:** a rounded box. `variant` becomes a CSS class for styling different kinds of node.
- **Edge:** an orthogonal arrow with rounded corners, drawn along its `points`. `dashed: true` keeps the dash pattern while it draws. Use `\n` in `label` for line breaks.
- **Callout:** a comic-style speech bubble with a `tail` point. `highlights` lists edge ids to turn red (for example, a dependency cycle).
- **Caption:** a step that only shows commentary.
- **Reset:** fades out edges and callouts from earlier steps (or only the ids in `only`), so one diagram can show a happy path and then a failure.

To change the default watermark for every diagram in a site or deck, set `Diagram.defaultWatermark = 'Example.com'` once, before the diagrams are constructed.

Any element can have a `caption`. Captions type in word by word, and a step without one keeps the previous caption on screen. A step can't have more than one caption. The model validates ids, steps and references when it's constructed and throws a descriptive error if anything is wrong.

### Styling

`diagram.css` scopes everything to `.diagram-player` and exposes CSS variables (`--ink`, `--red`, `--node-fill`, `--node-stroke-width`, `--node-font-size`, `--edge-dash`, `--label-font-size`, `--watermark-opacity`, ...). A diagram's own `stylesheet` (an absolute URL, loaded by the player) can override them, and style node and edge `variant` classes, by targeting `svg[data-diagram="<id>"]`.

## Using it in Slidev

### Through the NimblePros theme (recommended)

The theme adds the dependency and a component that wraps the Slidev one in this package. In `slidev-theme-nimblepros`:

1. `npm i github:NimblePros/animated-diagrams#<tag>`
2. Add `components/AnimatedDiagram.vue`:

   ```vue
   <script setup>
   // Animated, captioned SVG diagram. See the animated-diagrams README for authoring diagrams.
   import AnimatedDiagram from 'animated-diagrams/slidev'
   </script>

   <template>
     <AnimatedDiagram v-bind="$attrs" />
   </template>
   ```

3. Exclude the package from Vite's dependency pre-bundling in the theme's `vite.config.ts` (see [Using it with Vite](#using-it-with-vite)):

   ```ts
   export default {
     optimizeDeps: { exclude: ['animated-diagrams'] },
     // ...existing options
   }
   ```

Slidev merges the theme's `vite.config.ts` into every deck's config, so each deck that uses `theme: nimblepros` gets the component with no setup of its own.

### Directly in a deck

Without the theme, install the package in the deck folder, add the same `optimizeDeps.exclude` to the deck's own `vite.config.ts`, and import the component in the slide.

### On a slide

Put diagram files anywhere in the deck (for example `diagrams/`) and import them in the slide's `<script setup>`:

```md
---
layout: default
---

# Circular dependencies

<script setup>
import diagram from '../diagrams/class-libraries-only.js'
</script>

<AnimatedDiagram :diagram="diagram" />
```

`diagram` can be a `Diagram` or a module namespace (its `default` is used). Dynamic `import()` isn't allowed inside Vue template expressions, so import in `<script setup>` instead.

### Clicks and presenter clickers

`animated-diagrams/slidev` registers one Slidev click per diagram step, so Right Arrow, Space, a presenter clicker or the navigation buttons play the diagram one step at a time, and the next click after the last step moves on to the next slide. Going back a click jumps back a step. The diagram's clicks count with the slide's other `v-click`s, so the slide's click total and the presenter view's click counter include them.

In this mode the player's control bar is hidden and it doesn't handle keys itself, because Slidev's navigation drives it. Thumbnails (overview, presenter's next-slide preview) show the matching state without animating.

| Prop | Default | |
| --- | --- | --- |
| `diagram` | (required) | A `Diagram` or a module whose default export is one. A promise of either works only with `steps`. |
| `clicks` | `true` | `false` turns click mode off: the diagram plays by itself when the slide is entered and pauses when it's left. |
| `at` | `'+1'` | Where the diagram's clicks start, like `v-click`'s `at`: `'+1'` is the next click, a number is absolute. |
| `steps` | | The diagram's step count, needed only when `diagram` is a promise, because Slidev counts clicks before it resolves. |
| `controls` | hidden in click mode | Show the Play / Pause / Step / Replay bar. |
| `keyboard` | `'player'` | Passed to the player when `clicks` is `false`. Don't use `'page'` in a deck: it would take Space and Right Arrow from slide navigation. |
| `fonts` | Google Fonts | A stylesheet URL, or `false` to skip loading fonts. |

```md
<AnimatedDiagram :diagram="diagram" />                <!-- one click per step -->
<AnimatedDiagram :diagram="diagram" :clicks="false" /> <!-- plays on slide enter -->
```

Whichever mode is used, the diagram starts on slide enter, not when Slidev mounts the slide (it keeps neighbouring slides mounted while hidden). `animated-diagrams/vue` is the plain Vue component, for Vue apps that aren't Slidev decks; it autoplays when scrolled into view.

## Using it in Hugo, blogs and plain HTML

`autoload.js` mounts every `<div class="diagram-player" data-diagram="<url>">` on the page. `<url>` is resolved against the page, and `data-keyboard="page"` makes Space and Right Arrow work without focusing the player first.

Because the engine imports anime.js by its bare name (`animejs`), a page without a bundler needs an import map **before** the module script:

```html
<script type="importmap">
  { "imports": { "animejs": "https://cdn.jsdelivr.net/npm/animejs@4/+esm" } }
</script>

<div class="diagram-player" data-diagram="/diagrams/class-libraries-only.js"></div>

<script type="module"
        src="https://cdn.jsdelivr.net/gh/NimblePros/animated-diagrams@v0.1.0/src/autoload.js"></script>
```

Notes:

- **The jsDelivr `gh/` URL only works if this repo is public.** If it stays private, vendor `src/` into the site at build time instead (for example, a Hugo module or a script that copies a tagged release into `static/`).
- **Diagram files on the site** can use the same `import { Diagram } from 'animated-diagrams/model'` as in a deck if the import map maps that name too, so one diagram file works in both places:

  ```json
  {
    "imports": {
      "animejs": "https://cdn.jsdelivr.net/npm/animejs@4/+esm",
      "animated-diagrams/model": "https://cdn.jsdelivr.net/gh/NimblePros/animated-diagrams@v0.1.0/src/diagram-model.js"
    }
  }
  ```
- A Hugo `animated-diagram` shortcode only needs to output the `<div>` and add the import map and `autoload.js` once per page.

### Running the examples

```sh
npm start      # serves the repo root
```

Then open `http://localhost:3000/examples/`. The examples use the import map above, so they need a network connection for anime.js and the Google fonts.

## Using it with Vite

The player loads `diagram.css` (and each diagram's `stylesheet`) through `new URL('./diagram.css', import.meta.url)`. During development, Vite pre-bundles dependencies into `node_modules/.vite/deps`, which breaks those relative URLs. The player still renders, but without its styles. Exclude the package from pre-bundling:

```ts
// vite.config.ts (or the theme's vite.config.ts)
export default {
  optimizeDeps: { exclude: ['animated-diagrams'] },
}
```

`AnimatedDiagram.vue` also imports `diagram.css` statically, as a backstop. Vite bundles `animejs` as a normal dependency, so a built deck works offline (apart from the Google fonts the player requests).

## Player behavior

- **Controls:** Play, Pause, Step, Replay, a scrubber, and a speaker toggle (off by default) that reads captions aloud with the browser's speech synthesis. When read-aloud is on, the animation waits for the voice to finish before showing the next caption.
- **Keyboard:** Space plays or pauses and Right Arrow steps. Keys work while the player has focus; `{ keyboard: 'page' }` / `data-keyboard="page"` listens page-wide, and `{ keyboard: 'none' }` turns keys off.
- **Autoplay:** playback starts the first time the player is at least half on screen. `{ autoplay: false }` leaves starting it to the host, and `{ controls: false }` hides the control bar.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, the diagram jumps to its final state.
- **Fonts:** the player loads Open Sans and Bangers (the callout font) from Google Fonts and waits for them before rendering, because the renderer measures text. Pass `{ fonts: '<stylesheet url>' }` (`data-fonts="<url>"`, or the `fonts` prop in Vue) to load them from somewhere else, or `fonts: false` (`data-fonts="none"`) if the page already loads them.
- **Host control:** `mountDiagram` resolves to `{ timeline, stepCount, play, pause, showStep, destroy }`. `showStep(n)` shows the diagram as it is after step `n` (`0` is before the first step); `showStep(n, { animate: true })` plays step `n` instead when it's the next one. The Slidev component is built on this.
- **Cleanup:** call `destroy()` before removing the player to stop playback and speech and remove its page-wide listeners. Both Vue components do this on unmount.
