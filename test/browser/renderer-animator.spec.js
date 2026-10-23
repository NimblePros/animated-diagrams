// The renderer and animator measure text and read computed styles, so they're
// tested in a real browser against the harness page.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('harness.html');
  await page.waitForFunction(() => window.harnessReady);
  // Render inside a styled .diagram-player, as the player does.
  await page.evaluate(async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/diagram.css';
    await new Promise((resolve) => {
      link.onload = resolve;
      document.head.append(link);
    });
    window.render = (diagram = window.sample) => {
      const container = document.createElement('div');
      container.className = 'diagram-player';
      document.body.append(container);
      return window.engine.renderDiagram(diagram, container);
    };
  });
});

test.describe('renderDiagram', () => {
  test('builds the layers in back-to-front order', async ({ page }) => {
    const children = await page.evaluate(() => [...window.render().children].map(
      (child) => `${child.tagName}${child.getAttribute('class') ? `.${child.getAttribute('class')}` : ''}`,
    ));
    expect(children).toEqual([
      'title', 'desc', 'defs', 'text.watermark',
      'g.layer-edges', 'g.layer-nodes', 'g.layer-labels', 'g.layer-callouts',
    ]);
  });

  test('sets data-diagram, viewBox, and an accessible title and description', async ({ page }) => {
    await page.evaluate(() => window.render());
    const svg = page.locator('svg.diagram');
    await expect(svg).toHaveAttribute('data-diagram', 'sample');
    await expect(svg).toHaveAttribute('viewBox', '0 0 1200 500');
    await expect(svg).toHaveAttribute('role', 'img');
    await expect(svg.locator('title')).toHaveText('Sample diagram');
    await expect(svg.locator('desc')).toHaveText('Three nodes and two edges.');
    // aria-labelledby names both, so screen readers announce the description with the title.
    await expect(svg).toHaveAccessibleName('Sample diagram Three nodes and two edges.');
  });

  test('gives each render its own DOM ids', async ({ page }) => {
    const ids = await page.evaluate(() => {
      window.render();
      window.render();
      return [...document.querySelectorAll('[id]')].map((el) => el.id);
    });
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('adds variant classes to nodes and edges', async ({ page }) => {
    await page.evaluate(() => window.render());
    await expect(page.locator('[data-node="b"]')).toHaveAttribute('class', 'node module');
    await expect(page.locator('[data-node="a"]')).toHaveAttribute('class', 'node');
    await expect(page.locator('[data-edge="a-b"]')).toHaveAttribute('class', 'edge sync dashed');
    await expect(page.locator('[data-label="a-b"]')).toHaveAttribute('class', 'edge-label sync');
    await expect(page.locator('[data-edge="b-c"]')).toHaveAttribute('class', 'edge');
  });

  test('reveals dashed edges through a mask', async ({ page }) => {
    await page.evaluate(() => window.render());
    const mask = page.locator('mask[data-mask="a-b"]');
    await expect(mask.locator('path.edge-reveal')).toHaveCount(1);
    const maskId = await mask.getAttribute('id');
    await expect(page.locator('[data-edge="a-b"] .edge-line')).toHaveAttribute('mask', `url(#${maskId})`);
    await expect(page.locator('[data-edge="b-c"] .edge-line')).not.toHaveAttribute('mask', /.*/);
  });

  test('splits multi-line labels into tspans', async ({ page }) => {
    await page.evaluate(() => window.render());
    await expect(page.locator('[data-node="b"] tspan')).toHaveText(['Beta', 'Service']);
    await expect(page.locator('[data-label="a-b"] tspan')).toHaveText(['Calls', 'Beta']);
    await expect(page.locator('[data-callout="bubble"] tspan')).toHaveText(['Look!']);
  });

  test('sizes edge label backgrounds to their text', async ({ page }) => {
    const sizes = await page.evaluate(() => {
      window.render();
      const label = document.querySelector('[data-label="a-b"]');
      const bg = label.querySelector('.label-bg');
      const text = label.querySelector('text').getBBox();
      return { bg: [+bg.getAttribute('width'), +bg.getAttribute('height')], text: [text.width, text.height] };
    });
    expect(sizes.bg[0]).toBeGreaterThan(sizes.text[0]);
    expect(sizes.bg[1]).toBeGreaterThan(sizes.text[1]);
  });

  test('omits the watermark when it is false', async ({ page }) => {
    const watermarks = await page.evaluate(() => {
      const { Diagram } = window.engine;
      window.render(new Diagram({ id: 'plain', title: 'Plain', width: 100, height: 100, watermark: false }));
      return document.querySelectorAll('.watermark').length;
    });
    expect(watermarks).toBe(0);
  });
});

test.describe('buildTimeline', () => {
  test('returns one entry per step, separated by the step gap or the caption hold', async ({ page }) => {
    const { steps, stepCount } = await page.evaluate(() => {
      const svg = window.render();
      const { steps } = window.engine.buildTimeline(window.sample, svg, document.createElement('div'));
      return { steps, stepCount: window.sample.steps.length };
    });
    expect(steps).toHaveLength(stepCount);
    expect(steps[0].start).toBe(0);
    for (const [i, step] of steps.entries()) {
      expect(step.end).toBeGreaterThanOrEqual(step.start);
      if (i > 0) expect(step.start).toBeGreaterThanOrEqual(steps[i - 1].end + 250);
    }
    // Step 2 has no caption, so it follows step 1's caption hold (1600 ms after typing ends).
    expect(steps[1].start).toBeGreaterThanOrEqual(steps[0].end + 1600);
  });

  test('starts each caption in its step, after the previous caption fades', async ({ page }) => {
    const { steps, captions, paragraphs } = await page.evaluate(() => {
      const svg = window.render();
      const captionEl = document.createElement('div');
      const result = window.engine.buildTimeline(window.sample, svg, captionEl);
      return { ...result, timeline: undefined, paragraphs: captionEl.querySelectorAll('p.caption').length };
    });
    expect(captions.map((c) => c.text)).toEqual([
      'Alpha appears.', 'Alpha calls Beta.', 'Look at that.', 'Beta stops calling Gamma.',
    ]);
    expect(paragraphs).toBe(4);
    // Captioned steps are 1, 3, 5 and 6; later captions wait 200 ms for the previous one to fade.
    expect(captions[0].start).toBe(steps[0].start);
    expect(captions[1].start).toBe(steps[2].start + 200);
    expect(captions[2].start).toBe(steps[4].start + 200);
    expect(captions[3].start).toBe(steps[5].start + 200);
  });

  test('works without a caption element', async ({ page }) => {
    const captions = await page.evaluate(() => {
      const svg = window.render();
      return window.engine.buildTimeline(window.sample, svg, null).captions;
    });
    expect(captions).toEqual([]);
  });

  test('Reset with `only` fades just those ids; a full Reset fades every earlier edge and callout', async ({ page }) => {
    const opacities = await page.evaluate(() => {
      const svg = window.render();
      const { timeline, steps } = window.engine.buildTimeline(window.sample, svg, null);
      const opacity = (selector) => +getComputedStyle(svg.querySelector(selector)).opacity;
      const snapshot = () => ({
        nodes: ['a', 'b', 'c'].map((id) => opacity(`[data-node="${id}"]`)),
        edgeAB: opacity('[data-edge="a-b"]'),
        edgeBC: opacity('[data-edge="b-c"]'),
        labelAB: opacity('[data-label="a-b"] text'),
        callout: opacity('[data-callout="bubble"] path'),
      });
      const at = (n) => {
        timeline.seek(steps[n - 1].end);
        return snapshot();
      };
      return { before: at(5), onlyReset: at(6), fullReset: at(7) };
    });
    expect(opacities.before).toEqual({ nodes: [1, 1, 1], edgeAB: 1, edgeBC: 1, labelAB: 1, callout: 1 });
    expect(opacities.onlyReset).toEqual({ nodes: [1, 1, 1], edgeAB: 1, edgeBC: 0, labelAB: 1, callout: 1 });
    expect(opacities.fullReset).toEqual({ nodes: [1, 1, 1], edgeAB: 0, edgeBC: 0, labelAB: 0, callout: 0 });
  });

  test('hides everything at the start', async ({ page }) => {
    const opacities = await page.evaluate(() => {
      const svg = window.render();
      const { timeline } = window.engine.buildTimeline(window.sample, svg, null);
      timeline.seek(0);
      return ['[data-node="a"]', '[data-label="a-b"]', '[data-callout="bubble"]']
        .map((selector) => +getComputedStyle(svg.querySelector(selector)).opacity);
    });
    expect(opacities).toEqual([0, 0, 0]);
  });
});
