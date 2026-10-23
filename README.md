# animated-diagrams

[![CI](https://github.com/NimblePros/animated-diagrams/actions/workflows/ci.yml/badge.svg)](https://github.com/NimblePros/animated-diagrams/actions/workflows/ci.yml)

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
fonts/
  fonts.css             @font-face rules for the bundled Open Sans and Bangers
  *.woff2, OFL-*.txt    Font files (Latin and Latin Extended) and their licenses
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
| `animated-diagrams/fonts.css` | `fonts/fonts.css` |
| `animated-diagrams/vue` | `vue/AnimatedDiagram.vue` |
| `animated-diagrams/slidev` | `vue/SlidevAnimatedDiagram.vue` |

## Installing

The package is installed from GitHub, pinned to a release tag:

```sh
npm i github:NimblePros/animated-diagrams#v0.2.0
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
| `fonts` | bundled fonts | A stylesheet URL to load the fonts from instead, such as `GOOGLE_FONTS_CSS`. |
| `captions` | `true` | `false` hides the captions, for a live talk where the presenter narrates. |
| `autoplay` | `true` | With `:clicks="false"`: `false` makes the diagram advance one step per click on it (or Step) instead of playing on slide enter. Ignored in click mode. |

```md
<AnimatedDiagram :diagram="diagram" />                <!-- one click per step -->
<AnimatedDiagram :diagram="diagram" :clicks="false" /> <!-- plays on slide enter -->
<AnimatedDiagram :diagram="diagram" :captions="false" /> <!-- no captions -->
<AnimatedDiagram :diagram="diagram" :clicks="false" :autoplay="false" /> <!-- one step per click on the diagram -->
```

Whichever mode is used, the diagram starts on slide enter, not when Slidev mounts the slide (it keeps neighbouring slides mounted while hidden). `animated-diagrams/vue` is the plain Vue component, for Vue apps that aren't Slidev decks; it autoplays when scrolled into view.

## Using it in Hugo, blogs and plain HTML

`autoload.js` mounts every `<div class="diagram-player" data-diagram="<url>">` on the page. `<url>` is resolved against the page, `data-keyboard="page"` makes Space and Right Arrow work without focusing the player first, `data-captions="false"` turns captions off, and `data-autoplay="false"` makes the diagram advance one step per click or key press.

Because the engine imports anime.js by its bare name (`animejs`), a page without a bundler needs an import map **before** the module script:

```html
<script type="importmap">
  { "imports": { "animejs": "https://cdn.jsdelivr.net/npm/animejs@4/+esm" } }
</script>

<div class="diagram-player" data-diagram="/diagrams/class-libraries-only.js"></div>

<script type="module"
        src="https://cdn.jsdelivr.net/gh/NimblePros/animated-diagrams@v0.2.0/src/autoload.js"></script>
```

Notes:

- **To avoid depending on a CDN**, vendor `src/` (and `fonts/`) into the site at build time instead, for example with a Hugo module or a script that copies a tagged release into `static/`.
- **Diagram files on the site** can use the same `import { Diagram } from 'animated-diagrams/model'` as in a deck if the import map maps that name too, so one diagram file works in both places:

  ```json
  {
    "imports": {
      "animejs": "https://cdn.jsdelivr.net/npm/animejs@4/+esm",
      "animated-diagrams/model": "https://cdn.jsdelivr.net/gh/NimblePros/animated-diagrams@v0.2.0/src/diagram-model.js"
    }
  }
  ```
- A Hugo `animated-diagram` shortcode only needs to output the `<div>` and add the import map and `autoload.js` once per page.

### Running the examples

```sh
npm start      # serves the repo root
```

Then open `http://localhost:3000/examples/`. The examples use the import map above, so they need a network connection for anime.js. The fonts are served from `fonts/`.

## Using it with Vite

The player loads `diagram.css` (and each diagram's `stylesheet`) through `new URL('./diagram.css', import.meta.url)`. During development, Vite pre-bundles dependencies into `node_modules/.vite/deps`, which breaks those relative URLs. The player still renders, but without its styles. Exclude the package from pre-bundling:

```ts
// vite.config.ts (or the theme's vite.config.ts)
export default {
  optimizeDeps: { exclude: ['animated-diagrams'] },
}
```

`AnimatedDiagram.vue` also imports `diagram.css` statically, as a backstop. Vite bundles `animejs` as a normal dependency, and both Vue components import `fonts/fonts.css` statically so Vite bundles the font files too, so a built deck works fully offline.

## Player behavior

- **Controls:** Play, Pause, Step, Replay, a scrubber, and a speaker toggle (off by default) that reads captions aloud with the browser's speech synthesis. When read-aloud is on, the animation waits for the voice to finish before showing the next caption.
- **Keyboard:** Space plays or pauses and Right Arrow steps. Keys work while the player has focus; `{ keyboard: 'page' }` / `data-keyboard="page"` listens page-wide, and `{ keyboard: 'none' }` turns keys off.
- **Autoplay:** by default the diagram plays through its steps by itself, starting the first time the player is at least half on screen. `{ startWhenVisible: false }` leaves starting it to the host. `{ controls: false }` hides the control bar.
- **Step by step:** `{ autoplay: false }` (`data-autoplay="false"` in HTML, `:autoplay="false"` on either Vue component) never advances by itself. It doesn't start when it scrolls into view, and each click on the diagram, Space, Right Arrow or Step plays exactly one step and stops. Play and Pause are hidden, and Replay goes back to the start without playing. The host API's `play()` still plays through.
- **End of the diagram:** after the last step the diagram stays on its final frame. Play starts it again from the beginning. There's no looping yet ([#12](https://github.com/NimblePros/animated-diagrams/issues/12)).
- **Captions:** shown by default. `{ captions: false }` turns them off (`data-captions="false"` in HTML, `:captions="false"` on either Vue component), for example in a live presentation where the speaker narrates the diagram. The caption box and the speaker toggle are hidden, and the timeline is built without captions, so each step takes only as long as its animation instead of waiting for its caption to type and be read.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, the diagram jumps to its final state.
- **Fonts:** the player uses Open Sans and Bangers (the callout font), and waits for them to load before rendering, because the renderer measures text. See [Fonts](#fonts).
- **Host control:** `mountDiagram` resolves to `{ timeline, stepCount, play, pause, showStep, destroy }`. `showStep(n)` shows the diagram as it is after step `n` (`0` is before the first step); `showStep(n, { animate: true })` plays step `n` instead when it's the next one. The Slidev component is built on this.
- **Cleanup:** call `destroy()` before removing the player to stop playback and speech and remove its page-wide listeners. Both Vue components do this on unmount.

## Fonts

The package ships its own copies of Open Sans (variable, weights 300 to 800) and Bangers in [`fonts/`](fonts/), so diagrams render with the right fonts without a network connection. Only the Latin and Latin Extended subsets are included, about 125 KB in all; text in other scripts falls back to the system fonts in `diagram.css`. Both fonts are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/), which allows bundling and redistributing them; the license texts are in `fonts/OFL-OpenSans.txt` and `fonts/OFL-Bangers.txt`.

How the fonts are loaded depends on the host:

- **Plain pages and `autoload.js`:** the player adds a `<link>` to `fonts/fonts.css`, resolved relative to `player.js`, so it works from a CDN, a vendored copy or `node_modules` alike.
- **Vue and Slidev:** the components import `animated-diagrams/fonts.css` statically, so Vite copies the font files into the build alongside the deck.

To load the fonts from somewhere else, pass a stylesheet URL as `fonts` (`data-fonts="<url>"` in HTML, or the `fonts` prop in Vue). `GOOGLE_FONTS_CSS`, exported by the package and by `animated-diagrams/player`, is the Google Fonts stylesheet the player used before it bundled its own. If the page already loads the fonts, pass `fonts: false` (`data-fonts="none"`) to skip the stylesheet. The player still waits for the fonts before rendering.

A page that uses the fonts outside the player, such as `page.css`'s body text, can link `fonts/fonts.css` itself, as [`examples/index.html`](examples/index.html) does.

## Testing

```sh
npm install
npx playwright install chromium   # once, for the browser tests
npm test                          # model tests, then browser tests
```

- **`npm run test:model`** runs [`test/model/`](test/model/) with `node --test`. The model is pure data, so these need no browser.
- **`npm run test:browser`** runs [`test/browser/`](test/browser/) with Playwright in Chromium: the renderer and animator, the player, `autoload.js` and `AnimatedDiagram.vue`. Playwright starts Vite with [`test/browser/vite.config.js`](test/browser/vite.config.js) to serve the repo, so anime.js, Vue and the fonts all come from the repo and `node_modules`, with no network. The test pages and diagrams are in [`test/browser/fixtures/`](test/browser/fixtures/).

[CI](.github/workflows/ci.yml) runs `node --check` on `src/` and then `npm test` on every pull request to `main` and every push to `main`. It also runs weekly against the newest anime.js 4.x, so a release that breaks the engine shows up early. When a run fails, the Playwright report and traces are uploaded as the `playwright-report` artifact.

## License

[MIT](LICENSE). The bundled fonts are under the SIL Open Font License 1.1; see [Fonts](#fonts).
