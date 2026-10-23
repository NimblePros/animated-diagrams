// Turns a Diagram model into SVG elements. Everything is rendered in its final
// position; the animator controls visibility. Call after fonts have loaded so
// label backgrounds are sized to the real text.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Several diagrams can share a page, so DOM ids get a per-render prefix. Parts are
// found with data attributes instead (see `part`).
let renderCount = 0;

// Finds a rendered part: part(svg, 'node', 'customers'), part(svg, 'edge', 'cart-orders'), ...
export function part(svg, kind, id) {
  return svg.querySelector(`[data-${kind}="${id}"]`);
}

export function renderDiagram(diagram, container) {
  const prefix = `diagram${++renderCount}-`;
  const svg = el('svg', {
    viewBox: `0 0 ${diagram.width} ${diagram.height}`,
    role: 'img',
    'aria-labelledby': `${prefix}title ${prefix}desc`,
    class: 'diagram',
    'data-diagram': diagram.id ?? '',
  });
  svg.append(
    el('title', { id: `${prefix}title` }, diagram.title),
    el('desc', { id: `${prefix}desc` }, diagram.description ?? ''),
  );

  // Layers: watermark at the back, lines under nodes, labels and callouts on top.
  const defs = el('defs');
  const edgeLayer = el('g', { class: 'layer-edges' });
  const nodeLayer = el('g', { class: 'layer-nodes' });
  const labelLayer = el('g', { class: 'layer-labels' });
  const calloutLayer = el('g', { class: 'layer-callouts' });
  svg.append(defs, edgeLayer, nodeLayer, labelLayer, calloutLayer);
  container.replaceChildren(svg);

  // The watermark sits behind everything and is visible for the whole animation.
  if (diagram.watermark) {
    const { text, x, y, fontSize } = diagram.watermark;
    const watermark = el('text', { class: 'watermark', x, y, 'aria-hidden': 'true' }, text);
    if (fontSize) watermark.style.fontSize = `${fontSize}px`;
    svg.insertBefore(watermark, edgeLayer);
  }

  for (const node of diagram.nodes) {
    const group = el('g', { 'data-node': node.id, class: classes('node', node.variant), 'data-step': node.step });
    group.append(el('rect', {
      x: node.x, y: node.y, width: node.width, height: node.height, rx: node.radius,
    }));
    nodeLayer.append(group);
    multilineText(group, node.label.split('\n'), node.center);
  }

  for (const edge of diagram.edges) {
    const group = el('g', {
      'data-edge': edge.id,
      class: classes('edge', edge.variant, edge.dashed && 'dashed'),
      'data-step': edge.step,
    });
    const line = el('path', { class: 'edge-line', d: edge.pathData() });
    if (edge.dashed) {
      // Dashes and the draw animation both use stroke-dasharray, so a dashed line is
      // revealed by drawing a solid copy of it inside a mask instead.
      const maskId = `${prefix}mask-${edge.id}`;
      defs.append(el('mask', { id: maskId, 'data-mask': edge.id, maskUnits: 'userSpaceOnUse' }, [
        el('path', { class: 'edge-reveal', d: edge.pathData(), fill: 'none', stroke: '#fff', 'stroke-width': 12 }),
      ]));
      line.setAttribute('mask', `url(#${maskId})`);
    }
    group.append(line, el('polygon', { class: 'edge-arrow', points: edge.arrowheadPoints().join(' ') }));
    edgeLayer.append(group);

    if (edge.labelLines.length) {
      const label = el('g', { 'data-label': edge.id, class: classes('edge-label', edge.variant) });
      const bg = el('rect', { class: 'label-bg' });
      label.append(bg);
      labelLayer.append(label);
      const text = multilineText(label, edge.labelLines, edge.labelAt);
      fitBackground(bg, text, 5, 1);
    }
  }

  for (const callout of diagram.callouts) {
    const group = el('g', { 'data-callout': callout.id, class: 'callout', 'data-step': callout.step }, [
      el('path', { d: callout.pathData() }),
    ]);
    calloutLayer.append(group);
    multilineText(group, callout.lines, {
      x: callout.x + callout.width / 2,
      y: callout.y + callout.height / 2,
    });
  }

  return svg;
}

function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (typeof children === 'string') node.textContent = children;
  else node.append(...children);
  return node;
}

function classes(...names) {
  return names.filter(Boolean).join(' ');
}

// Appends a <text> to `parent` whose lines are vertically centered on `at`.
// Line spacing follows the font size the stylesheet gives the text.
function multilineText(parent, lines, at) {
  const text = el('text', { x: at.x, y: at.y });
  parent.append(text);
  const lineHeight = parseFloat(getComputedStyle(text).fontSize) * 1.25;
  const firstOffset = (-(lines.length - 1) / 2) * lineHeight;
  lines.forEach((line, i) => {
    text.append(el('tspan', { x: at.x, dy: i === 0 ? firstOffset : lineHeight }, line));
  });
  return text;
}

// Sizes the label's background rect so the label "cuts" the line it sits on.
// Measured in bold, since labels are bold while their step is emphasized.
function fitBackground(bg, text, padX, padY) {
  text.style.fontWeight = '700';
  const box = text.getBBox();
  text.style.fontWeight = '';
  bg.setAttribute('x', box.x - padX);
  bg.setAttribute('y', box.y - padY);
  bg.setAttribute('width', box.width + padX * 2);
  bg.setAttribute('height', box.height + padY * 2);
}
