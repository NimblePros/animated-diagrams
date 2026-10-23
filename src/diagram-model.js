// Declarative model for an animated box-and-arrow diagram.
// The model knows nothing about anime.js or the DOM; it only describes
// what to draw, where, and in which order (via `step`).

const DEFAULT_ARROW = { length: 16, halfWidth: 8 };

// Any element may carry a `caption`: play-by-play commentary shown while its step plays.
// A step without a caption keeps the previous caption on screen.
export class Node {
  // `variant` becomes a CSS class (e.g. 'module', 'contract') so each diagram can style node kinds.
  constructor({ id, label, x, y, width = 293, height = 119, radius = 22, variant = '', caption, step }) {
    Object.assign(this, { id, label, x, y, width, height, radius, variant, caption, step });
  }

  get center() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }
}

export class Edge {
  // `points` are the orthogonal waypoints from source to target (arrowhead at the last point).
  // `labelAt` is the center of the label, which sits on top of the line.
  // Use "\n" in `label` to break it across lines.
  // `variant` becomes a CSS class. `dashed` edges are revealed through a mask so their dash
  // pattern survives the draw animation. `arrow` ({ length, halfWidth }) comes from the Diagram.
  constructor({ id, from, to, label, points, labelAt, variant = '', dashed = false, arrow = DEFAULT_ARROW, caption, step }) {
    Object.assign(this, { id, from, to, label, points, labelAt, variant, dashed, arrow, caption, step });
  }

  get labelLines() {
    return this.label ? this.label.split('\n') : [];
  }

  // SVG path data with rounded corners at each interior waypoint.
  pathData(radius = 10) {
    const pts = this.points;
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      const r = Math.min(radius, distance(prev, curr) / 2, distance(curr, next) / 2);
      const before = moveToward(curr, prev, r);
      const after = moveToward(curr, next, r);
      d += ` L${before.x} ${before.y} Q${curr.x} ${curr.y} ${after.x} ${after.y}`;
    }
    // Stop the line at the base of the arrowhead so the stroke doesn't poke through the tip.
    const end = moveToward(pts[pts.length - 1], pts[pts.length - 2], this.arrow.length - 2);
    return `${d} L${end.x} ${end.y}`;
  }

  // Triangle points for the arrowhead, aligned with the final segment.
  arrowheadPoints() {
    const { length, halfWidth } = this.arrow;
    const tip = this.points[this.points.length - 1];
    const prev = this.points[this.points.length - 2];
    const len = distance(prev, tip);
    const ux = (tip.x - prev.x) / len;
    const uy = (tip.y - prev.y) / len;
    const baseX = tip.x - ux * length;
    const baseY = tip.y - uy * length;
    return [
      [tip.x, tip.y],
      [baseX - uy * halfWidth, baseY + ux * halfWidth],
      [baseX + uy * halfWidth, baseY - ux * halfWidth],
    ];
  }
}

export class Callout {
  // A comic-style speech bubble. `tail` is the point the bubble's tail points at.
  // `highlights` lists the edge ids that make up the cycle this callout calls out.
  constructor({ id, lines, x, y, width, height, tail, highlights = [], caption, step }) {
    Object.assign(this, { id, lines, x, y, width, height, tail, highlights, caption, step });
  }

  // Rounded rectangle with a tail leaving from the bottom-left area.
  pathData(radius = 16) {
    const { x, y, width: w, height: h, tail } = this;
    const r = radius;
    return [
      `M${x + r} ${y}`,
      `H${x + w - r}`,
      `Q${x + w} ${y} ${x + w} ${y + r}`,
      `V${y + h - r}`,
      `Q${x + w} ${y + h} ${x + w - r} ${y + h}`,
      `H${x + 75}`,
      `L${tail.x} ${tail.y}`,
      `L${x + 40} ${y + h}`,
      `H${x + r}`,
      `Q${x} ${y + h} ${x} ${y + h - r}`,
      `V${y + r}`,
      `Q${x} ${y} ${x + r} ${y}`,
      'Z',
    ].join(' ');
  }
}

// A caption-only step: commentary with nothing drawn.
export class Caption {
  constructor({ id, caption, step }) {
    Object.assign(this, { id, caption, step });
  }
}

// A reset step: fades out every edge and callout drawn in earlier steps, leaving
// only the nodes, so the diagram can tell a second story (e.g. happy path, then failure).
// With `only` (a list of edge/callout ids), it fades just those instead.
export class Reset {
  constructor({ id, caption, step, only }) {
    Object.assign(this, { id, caption, step, only });
  }
}

export class Diagram {
  // Watermark text for diagrams that don't set `watermark.text`. Change it once, before
  // constructing diagrams, to rebrand every diagram in a site or deck.
  static defaultWatermark = 'NimblePros.com';

  // `arrow` sets the arrowhead size for every edge: { length, halfWidth }.
  // `watermark` ({ text, x, y, fontSize }) is centered by default; any field can be overridden,
  // and `watermark: false` turns it off. The default text is Diagram.defaultWatermark.
  // `id` names the diagram (its folder name); its SVG gets data-diagram="<id>" so a
  // diagram's own `stylesheet` (an absolute URL, loaded by the player) can target it.
  constructor({
    id, title, description, width, height, arrow = DEFAULT_ARROW, watermark = {}, stylesheet,
    nodes = [], edges = [], callouts = [], captions = [], resets = [],
  }) {
    Object.assign(this, { id, title, description, width, height, arrow, stylesheet });
    this.watermark = watermark && {
      text: Diagram.defaultWatermark,
      x: width / 2,
      y: height / 2,
      ...watermark,
    };
    this.nodes = nodes.map((n) => new Node(n));
    this.edges = edges.map((e) => new Edge({ ...e, arrow }));
    this.callouts = callouts.map((c) => new Callout(c));
    this.captions = captions.map((c) => new Caption(c));
    this.resets = resets.map((r) => new Reset(r));
    this.#validate();
  }

  node(id) {
    return this.nodes.find((n) => n.id === id);
  }

  edge(id) {
    return this.edges.find((e) => e.id === id);
  }

  get elements() {
    return [...this.nodes, ...this.edges, ...this.callouts, ...this.captions, ...this.resets];
  }

  // The caption for a step, or undefined if the step keeps the previous caption.
  static captionFor(elements) {
    return elements.find((el) => el.caption)?.caption;
  }

  // Elements grouped by step, in order: [[1, [node]], [2, [node, edge]], ...].
  get steps() {
    const groups = new Map();
    for (const el of this.elements) {
      if (!groups.has(el.step)) groups.set(el.step, []);
      groups.get(el.step).push(el);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }

  #validate() {
    const ids = new Set();
    for (const el of this.elements) {
      if (ids.has(el.id)) throw new Error(`Duplicate id "${el.id}"`);
      ids.add(el.id);
      if (typeof el.step !== 'number') throw new Error(`"${el.id}" is missing a numeric step`);
    }
    for (const [step, elements] of this.steps) {
      if (elements.filter((el) => el.caption).length > 1) {
        throw new Error(`Step ${step} has more than one caption`);
      }
    }
    for (const edge of this.edges) {
      for (const end of [edge.from, edge.to]) {
        if (!this.node(end)) throw new Error(`Edge "${edge.id}" references unknown node "${end}"`);
      }
      if (edge.points.length < 2) throw new Error(`Edge "${edge.id}" needs at least two points`);
    }
    for (const callout of this.callouts) {
      for (const id of callout.highlights) {
        if (!this.edge(id)) throw new Error(`Callout "${callout.id}" highlights unknown edge "${id}"`);
      }
    }
    for (const reset of this.resets) {
      for (const id of reset.only ?? []) {
        if (!this.edge(id) && !this.callouts.some((c) => c.id === id)) {
          throw new Error(`Reset "${reset.id}" fades unknown edge or callout "${id}"`);
        }
      }
    }
  }
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function moveToward(from, to, amount) {
  const len = distance(from, to);
  return {
    x: from.x + ((to.x - from.x) / len) * amount,
    y: from.y + ((to.y - from.y) / len) * amount,
  };
}
