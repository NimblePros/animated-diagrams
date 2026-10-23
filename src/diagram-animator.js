// Generic animation engine: walks the model's steps in order and builds one
// anime.js timeline. Elements in the same step start together; the next step
// starts once the slowest element (or the step's caption) has finished.

import { createTimeline, svg as animeSvg, utils } from 'animejs';
import { Diagram, Node, Edge, Callout, Caption, Reset } from './diagram-model.js';
import { part } from './diagram-renderer.js';

const BLACK = '#333333';
const RED = '#c00000';
const STEP_GAP = 250; // pause between steps (ms)
const DRAW_SPEED = 1.2; // px per ms when drawing an edge

const WORD_MS = 253; // ~240 words per minute
const PUNCTUATION_MS = 147; // extra breath after , ; : and sentence ends
const WORD_FADE_MS = 400; // longer than WORD_MS so neighboring fades overlap smoothly
const READ_HOLD_MS = 1600; // keep a finished caption up before moving on

// Whatever a step reveals is emphasized (thicker lines, bold text) until the next step starts.
const EMPHASIS_MS = 200;
const EMPHASIS_LINE_SCALE = 2;
const NORMAL_WEIGHT = 400;
const BOLD_WEIGHT = 700;

// Returns { timeline, steps, captions } where steps[i] = { start, end } in ms.
// `end` is when the step's animation (and caption typing) finishes, before any
// hold. captions[i] = { start, text }, where `start` is when its first word appears.
export function buildTimeline(diagram, svgEl, captionEl, timelineOptions = {}) {
  const tl = createTimeline({ autoplay: false, ...timelineOptions });
  const steps = [];
  const captions = [];
  let cursor = 0;
  let currentCaption = null;
  let emphasized = [];

  for (const [, elements] of diagram.steps) {
    setEmphasis(tl, emphasized, cursor, false);
    emphasized = elements.flatMap((element) => emphasisTargets(element, svgEl));
    setEmphasis(tl, emphasized, cursor, true);

    let stepEnd = cursor;
    for (const element of elements) {
      stepEnd = Math.max(stepEnd, animateElement(tl, element, svgEl, cursor, diagram));
    }

    let holdUntil = stepEnd;
    const text = Diagram.captionFor(elements);
    if (text && captionEl) {
      const typed = showCaption(tl, captionEl, currentCaption, text, cursor);
      currentCaption = typed.paragraph;
      captions.push({ start: typed.start, text });
      stepEnd = Math.max(stepEnd, typed.end);
      holdUntil = Math.max(holdUntil, typed.end + READ_HOLD_MS);
    }

    steps.push({ start: cursor, end: stepEnd });
    cursor = Math.max(stepEnd + STEP_GAP, holdUntil);
  }
  return { timeline: tl, steps, captions };
}

// Adds the element's animation at `start` and returns the time it finishes.
function animateElement(tl, element, svgEl, start, diagram) {
  if (element instanceof Node) return revealNode(tl, part(svgEl, 'node', element.id), start);
  if (element instanceof Edge) return drawEdge(tl, element, svgEl, start);
  if (element instanceof Callout) return revealCycle(tl, element, svgEl, start);
  if (element instanceof Caption) return start;
  if (element instanceof Reset) return clearDrawn(tl, diagram, element, svgEl, start);
  throw new Error(`Don't know how to animate "${element.id}"`);
}

// The properties to emphasize for an element, as { target, prop, normal, emphasized }.
function emphasisTargets(element, svgEl) {
  const thicker = (target) => {
    const width = parseFloat(getComputedStyle(target).strokeWidth);
    return { target, prop: 'strokeWidth', normal: width, emphasized: width * EMPHASIS_LINE_SCALE };
  };
  const bolder = (target) => ({ target, prop: 'fontWeight', normal: NORMAL_WEIGHT, emphasized: BOLD_WEIGHT });

  if (element instanceof Node) {
    const group = part(svgEl, 'node', element.id);
    return [thicker(group.querySelector('rect')), bolder(group.querySelector('text'))];
  }
  if (element instanceof Edge) {
    const targets = [thicker(part(svgEl, 'edge', element.id).querySelector('.edge-line'))];
    const label = part(svgEl, 'label', element.id)?.querySelector('text');
    if (label) targets.push(bolder(label));
    return targets;
  }
  return [];
}

function setEmphasis(tl, targets, at, on) {
  for (const { target, prop, normal, emphasized } of targets) {
    const values = on ? [normal, emphasized] : [emphasized, normal];
    tl.add(target, { [prop]: values, duration: EMPHASIS_MS, ease: 'outQuad' }, at);
  }
}

function revealNode(tl, group, start) {
  const duration = 500;
  tl.add(group, { opacity: [0, 1], scale: [0.8, 1], duration, ease: 'outBack' }, start);
  return start + duration;
}

// Draws the line from source to target, then drops in the arrowhead and label.
function drawEdge(tl, edge, svgEl, start) {
  const group = part(svgEl, 'edge', edge.id);
  // Dashed edges are drawn by animating the solid path in their mask.
  const line = edge.dashed
    ? part(svgEl, 'mask', edge.id).querySelector('.edge-reveal')
    : group.querySelector('.edge-line');
  const arrow = group.querySelector('.edge-arrow');
  const label = part(svgEl, 'label', edge.id);

  const drawDuration = utils.clamp(line.getTotalLength() / DRAW_SPEED, 450, 1600);
  const drawable = animeSvg.createDrawable(line);
  utils.set(drawable, { draw: '0 0' });
  tl.add(drawable, { draw: ['0 0', '0 1'], duration: drawDuration, ease: 'inOutSine' }, start);

  let end = start + drawDuration;
  tl.add(arrow, { opacity: [0, 1], scale: [0.4, 1], duration: 200, ease: 'outBack' }, end - 60);
  if (label) {
    tl.add(label, { opacity: [0, 1], scale: [0.9, 1], duration: 300, ease: 'outQuad' }, end);
    end += 300;
  }
  return end;
}

// Fades out every edge and callout from earlier steps (or just `reset.only`), leaving the nodes.
// It fades the edge groups and the children of labels and callouts, so it never
// fights the tweens that revealed them (those animate the label and callout groups).
function clearDrawn(tl, diagram, reset, svgEl, start) {
  const duration = 600;
  const earlier = reset.only
    ? (el) => reset.only.includes(el.id)
    : (el) => el.step < reset.step;
  const targets = [
    ...diagram.edges.filter(earlier).flatMap((edge) => [
      part(svgEl, 'edge', edge.id),
      ...(part(svgEl, 'label', edge.id)?.children ?? []),
    ]),
    ...diagram.callouts.filter(earlier).flatMap((callout) => [...part(svgEl, 'callout', callout.id).children]),
  ];
  if (targets.length) tl.add(targets, { opacity: [1, 0], duration, ease: 'outQuad' }, start);
  return start + duration;
}

// A cycle has just been closed: turn its edges red one after another (in
// dependency order), then pop the callout bubble.
function revealCycle(tl, callout, svgEl, start) {
  const perEdge = 400;
  const stagger = 180;

  callout.highlights.forEach((edgeId, i) => {
    const group = part(svgEl, 'edge', edgeId);
    const line = group.querySelector('.edge-line');
    const width = parseFloat(getComputedStyle(line).strokeWidth);
    const at = start + i * stagger;
    tl.add(line,
      { stroke: [BLACK, RED], strokeWidth: [width, width * 1.6], duration: perEdge, ease: 'outQuad' }, at);
    tl.add(group.querySelector('.edge-arrow'),
      { fill: [BLACK, RED], scale: [1, 1.25], duration: perEdge, ease: 'outQuad' }, at);
  });

  const popAt = start + (callout.highlights.length - 1) * stagger + perEdge;
  const popDuration = 900;
  tl.add(part(svgEl, 'callout', callout.id), {
    opacity: [0, 1],
    scale: [0, 1],
    rotate: [-12, 0],
    duration: popDuration,
    ease: 'outElastic(1, .55)',
  }, popAt);
  return popAt + popDuration;
}

// Fades out the previous caption and fades the new one in word by word, left to right.
// Every caption is stacked in the same spot, so the box never changes height.
function showCaption(tl, captionEl, previous, text, start) {
  const paragraph = document.createElement('p');
  paragraph.className = 'caption';
  const words = text.split(/\s+/).filter(Boolean);
  const spans = words.map((word, i) => {
    const span = document.createElement('span');
    span.className = 'caption-word';
    span.textContent = word;
    paragraph.append(span, i < words.length - 1 ? ' ' : '');
    return span;
  });
  captionEl.append(paragraph);

  let at = start;
  if (previous) {
    tl.add(previous, { opacity: [1, 0], duration: 200, ease: 'outQuad' }, at);
    at += 200;
  }
  // Each word's start time; punctuation adds a short pause, like a speaker would.
  const delays = [];
  let offset = 0;
  for (const word of words) {
    delays.push(offset);
    offset += WORD_MS + (/[,;:.!?]$/.test(word) ? PUNCTUATION_MS : 0);
  }
  tl.add(spans, {
    opacity: [0, 1],
    duration: WORD_FADE_MS,
    delay: (_, i) => delays[i],
    ease: 'inOutSine',
  }, at);

  return { paragraph, start: at, end: at + delays[delays.length - 1] + WORD_FADE_MS };
}
