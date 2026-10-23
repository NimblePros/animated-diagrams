// Model tests: diagram-model.js is pure data, so these run in Node with `node --test`.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Diagram, Node, Edge, Callout, Caption, Reset } from '../../src/diagram-model.js';

// A small valid diagram; each test overrides only what it's about.
function spec(overrides = {}) {
  return {
    id: 'sample',
    title: 'Sample',
    width: 1000,
    height: 400,
    nodes: [
      { id: 'a', label: 'A', x: 0, y: 0, step: 1, caption: 'A appears.' },
      { id: 'b', label: 'B', x: 600, y: 0, step: 2 },
    ],
    edges: [
      { id: 'a-b', from: 'a', to: 'b', points: [{ x: 293, y: 60 }, { x: 600, y: 60 }], step: 3 },
    ],
    ...overrides,
  };
}

describe('validation', () => {
  test('accepts a valid diagram', () => {
    assert.doesNotThrow(() => new Diagram(spec()));
  });

  test('rejects duplicate ids, across element kinds too', () => {
    assert.throws(
      () => new Diagram(spec({ captions: [{ id: 'a', caption: 'Again.', step: 4 }] })),
      /Duplicate id "a"/,
    );
  });

  test('rejects a missing step', () => {
    assert.throws(
      () => new Diagram(spec({ captions: [{ id: 'c', caption: 'No step.' }] })),
      /"c" is missing a numeric step/,
    );
  });

  test('rejects a non-numeric step', () => {
    assert.throws(
      () => new Diagram(spec({ captions: [{ id: 'c', caption: 'Text step.', step: '4' }] })),
      /"c" is missing a numeric step/,
    );
  });

  test('rejects an edge to an unknown node', () => {
    const edges = [{ id: 'a-x', from: 'a', to: 'x', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], step: 3 }];
    assert.throws(() => new Diagram(spec({ edges })), /Edge "a-x" references unknown node "x"/);
  });

  test('rejects an edge from an unknown node', () => {
    const edges = [{ id: 'x-a', from: 'x', to: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], step: 3 }];
    assert.throws(() => new Diagram(spec({ edges })), /Edge "x-a" references unknown node "x"/);
  });

  test('rejects an edge with fewer than two points', () => {
    const edges = [{ id: 'a-b', from: 'a', to: 'b', points: [{ x: 0, y: 0 }], step: 3 }];
    assert.throws(() => new Diagram(spec({ edges })), /Edge "a-b" needs at least two points/);
  });

  test('rejects a callout that highlights an unknown edge', () => {
    const callouts = [{
      id: 'bubble', lines: ['Hi'], x: 0, y: 0, width: 100, height: 50, tail: { x: 0, y: 80 },
      highlights: ['a-b', 'nope'], step: 4,
    }];
    assert.throws(() => new Diagram(spec({ callouts })), /Callout "bubble" highlights unknown edge "nope"/);
  });

  test('rejects a reset that fades an unknown id', () => {
    const resets = [{ id: 'clear', step: 4, only: ['a-b', 'nope'] }];
    assert.throws(() => new Diagram(spec({ resets })), /Reset "clear" fades unknown edge or callout "nope"/);
  });

  test('rejects more than one caption in a step', () => {
    const captions = [{ id: 'c', caption: 'Also step 1.', step: 1 }];
    assert.throws(() => new Diagram(spec({ captions })), /Step 1 has more than one caption/);
  });
});

describe('defaults', () => {
  afterEach(() => {
    Diagram.defaultWatermark = 'NimblePros.com';
  });

  test('node size and corner radius', () => {
    const node = new Diagram(spec()).node('a');
    assert.equal(node.width, 293);
    assert.equal(node.height, 119);
    assert.equal(node.radius, 22);
    assert.equal(node.variant, '');
    assert.deepEqual(node.center, { x: 146.5, y: 59.5 });
  });

  test('edges get the default arrow, or the diagram arrow', () => {
    assert.deepEqual(new Diagram(spec()).edge('a-b').arrow, { length: 16, halfWidth: 8 });
    const arrow = { length: 20, halfWidth: 10 };
    assert.deepEqual(new Diagram(spec({ arrow })).edge('a-b').arrow, arrow);
  });

  test('edge defaults: not dashed, no variant', () => {
    const edge = new Diagram(spec()).edge('a-b');
    assert.equal(edge.dashed, false);
    assert.equal(edge.variant, '');
    assert.deepEqual(edge.labelLines, []);
  });

  test('watermark is centered with the default text', () => {
    assert.deepEqual(new Diagram(spec()).watermark, { text: 'NimblePros.com', x: 500, y: 200 });
  });

  test('watermark fields can be overridden one at a time', () => {
    const diagram = new Diagram(spec({ watermark: { y: 350, fontSize: 30 } }));
    assert.deepEqual(diagram.watermark, { text: 'NimblePros.com', x: 500, y: 350, fontSize: 30 });
  });

  test('watermark: false turns it off', () => {
    assert.equal(new Diagram(spec({ watermark: false })).watermark, false);
  });

  test('Diagram.defaultWatermark applies to diagrams constructed afterwards', () => {
    const before = new Diagram(spec());
    Diagram.defaultWatermark = 'Example.com';
    assert.equal(new Diagram(spec()).watermark.text, 'Example.com');
    assert.equal(before.watermark.text, 'NimblePros.com');
    assert.equal(new Diagram(spec({ watermark: { text: 'Mine' } })).watermark.text, 'Mine');
  });

  test('callout highlights default to none', () => {
    const callouts = [{ id: 'bubble', lines: ['Hi'], x: 0, y: 0, width: 100, height: 50, tail: { x: 0, y: 80 }, step: 4 }];
    assert.deepEqual(new Diagram(spec({ callouts })).callouts[0].highlights, []);
  });
});

describe('structure', () => {
  test('wraps each element in its model class', () => {
    const diagram = new Diagram(spec({
      callouts: [{ id: 'bubble', lines: ['Hi'], x: 0, y: 0, width: 100, height: 50, tail: { x: 0, y: 80 }, step: 4 }],
      captions: [{ id: 'note', caption: 'Note.', step: 5 }],
      resets: [{ id: 'clear', step: 6 }],
    }));
    assert.ok(diagram.nodes[0] instanceof Node);
    assert.ok(diagram.edges[0] instanceof Edge);
    assert.ok(diagram.callouts[0] instanceof Callout);
    assert.ok(diagram.captions[0] instanceof Caption);
    assert.ok(diagram.resets[0] instanceof Reset);
  });

  test('steps groups elements by step, in numeric order', () => {
    const diagram = new Diagram(spec({
      captions: [{ id: 'late', caption: 'Late.', step: 10 }, { id: 'also-b', step: 2 }],
    }));
    assert.deepEqual(
      diagram.steps.map(([step, elements]) => [step, elements.map((el) => el.id)]),
      [[1, ['a']], [2, ['b', 'also-b']], [3, ['a-b']], [10, ['late']]],
    );
  });

  test('captionFor returns the step caption, or undefined', () => {
    const [[, first], [, second]] = new Diagram(spec()).steps;
    assert.equal(Diagram.captionFor(first), 'A appears.');
    assert.equal(Diagram.captionFor(second), undefined);
  });

  test('edge labels split on newlines', () => {
    const edges = [{ id: 'a-b', from: 'a', to: 'b', label: 'Two\nlines', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], step: 3 }];
    assert.deepEqual(new Diagram(spec({ edges })).edge('a-b').labelLines, ['Two', 'lines']);
  });

  test('edge path stops at the base of the arrowhead', () => {
    const edge = new Diagram(spec()).edge('a-b');
    assert.equal(edge.pathData(), 'M293 60 L586 60');
    assert.deepEqual(edge.arrowheadPoints(), [[600, 60], [584, 68], [584, 52]]);
  });

  test('edge path rounds interior corners', () => {
    const edges = [{
      id: 'a-b', from: 'a', to: 'b', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], step: 3,
    }];
    assert.equal(new Diagram(spec({ edges })).edge('a-b').pathData(), 'M0 0 L90 0 Q100 0 100 10 L100 86');
  });
});
