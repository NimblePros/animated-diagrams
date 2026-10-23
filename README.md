# animated-diagrams

Declarative, step-by-step animated box-and-arrow diagrams rendered as SVG, with typed captions, play/pause/step/replay controls, a scrubber and optional read-aloud. One engine runs in three kinds of hosts:

- **Slidev decks**, through the `<AnimatedDiagram>` Vue component (meant to be re-exported by the [NimblePros Slidev theme](https://github.com/NimblePros/slidev-theme-nimblepros))
- **Blogs and static sites** such as Hugo, through `autoload.js` and a `<div class="diagram-player">`
- **Standalone HTML pages**, like the ones in [`examples/`](examples/)

The engine is plain ES modules with no build step, about 1,000 lines in total. Its only runtime dependency is [anime.js](https://animejs.com/) v4.

## Why this is its own repo

The engine started in [`SoftArchFunPrep/diagrams/lib`](https://github.com/ardalis/SoftArchFunPrep/tree/main/diagrams/lib). It was already cleanly split:

- **Engine (this repo):** `diagram-model.js`, `diagram-renderer.js`, `diagram-animator.js`, `player.js`, `diagram.css`, `autoload.js` and `page.css`. It loads its own CSS relative to `import.meta.url`.
- **Content (stays in each consuming repo):** individual diagram files (`class-libraries-only.js`, ...) and per-topic "kits" such as `cap-kit.js` and `saga-kit.js` that build diagrams from a shorter description. Content files only need `Diagram` from the model.

Keeping the engine in its own versioned package lets every deck, workshop repo and blog use it without copying and pasting. An update to the engine is then just a tag bump in each consumer, the same `npm i github:...#<tag>` workflow the decks already use for the NimblePros theme.

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
  AnimatedDiagram.vue   Vue 3 / Slidev wrapper around mountDiagram()
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
  watermark: { text: 'NimblePros.com' }, // or false; defaults to centered "ModularMonoliths.com"
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

Any element can have a `caption`. Captions type in word by word, and a step without one keeps the previous caption on screen. A step can't have more than one caption. The model validates ids, steps and references when it's constructed and throws a descriptive error if anything is wrong.

### Styling

`diagram.css` scopes everything to `.diagram-player` and exposes CSS variables (`--ink`, `--red`, `--node-fill`, `--node-stroke-width`, `--node-font-size`, `--edge-dash`, `--label-font-size`, `--watermark-opacity`, ...). A diagram's own `stylesheet` (an absolute URL, loaded by the player) can override them, and style node and edge `variant` classes, by targeting `svg[data-diagram="<id>"]`.

## Using it in Slidev

### Through the NimblePros theme (recommended)

The theme adds the dependency and a component that wraps the one in this package. In `slidev-theme-nimblepros`:

1. `npm i github:NimblePros/animated-diagrams#<tag>`
2. Add `components/AnimatedDiagram.vue`:

   ```vue
   <script setup>
   // Animated, captioned SVG diagram. See the animated-diagrams README for authoring diagrams.
   import AnimatedDiagram from 'animated-diagrams/vue'
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

`diagram` can be a `Diagram`, a module namespace (its `default` is used), or a promise of either. Dynamic `import()` isn't allowed inside Vue template expressions, so import in `<script setup>` instead.

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
- **Keyboard:** Space plays or pauses and Right Arrow steps. Keys work while the player has focus; `{ keyboard: 'page' }` / `data-keyboard="page"` listens page-wide.
- **Autoplay:** playback starts the first time the player is at least half on screen.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, the diagram jumps to its final state.
- **Fonts:** the player loads Open Sans and Bangers (the callout font) from Google Fonts and waits for them before rendering, because the renderer measures text.

## Known issues and roadmap

These were identified while extracting the engine and haven't been done yet:

- [ ] **Slidev keyboard and clicker integration.** Space and Right Arrow are also Slidev's navigation keys. Inside a deck, keep `keyboard: 'player'`. Better still, add a mode where the diagram's steps follow Slidev clicks (watch `$clicks` / `useSlideContext()`, or register `v-click` steps), so a presenter clicker steps through the diagram before moving to the next slide. Autoplay through `IntersectionObserver` may also start diagrams on slides that Slidev keeps mounted but hidden; a Slidev mode should start on slide enter instead.
- [ ] **Configurable branding.** The Google Fonts URL (`player.js`) and the default watermark text `ModularMonoliths.com` (`diagram-model.js`) are hardcoded. Make them options, with the current values as defaults. Today, kits set `watermark.text` per diagram (`NimblePros.com`).
- [ ] **Clean up on unmount.** With `keyboard: 'page'`, `mountDiagram` adds a `keydown` listener to `document` that is never removed, and the `IntersectionObserver` isn't disconnected if the player is removed before it plays. Return a `destroy()` from `mountDiagram` and call it from `AnimatedDiagram.vue`.
- [ ] **Self-hosted fonts** so decks work fully offline.
- [ ] Choose a license, decide whether the repo is public (needed for jsDelivr), and tag `v0.1.0`.

## Migrating SoftArchFunPrep to this package

In the SoftArchFunPrep repo, which this was extracted from:

1. Install the package (or get it through the theme) in `1day/slides` and `2day/slides`.
2. Change `import { Diagram } from '../lib/diagram-model.js'` in the diagram and kit files to `'animated-diagrams/model'` (for Slidev), or keep the standalone pages working with an import map.
3. Delete `diagrams/lib/`, and the temporary `root/` folder this repo was staged in.
