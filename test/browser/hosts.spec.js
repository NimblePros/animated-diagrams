// Host tests: autoload.js on a plain page, and AnimatedDiagram.vue in a minimal Vue app.

import { test, expect } from '@playwright/test';

test.describe('autoload.js', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('autoload.html');
  });

  test('mounts every .diagram-player[data-diagram], and nothing else', async ({ page }) => {
    await expect(page.locator('#page-keys svg.diagram')).toHaveCount(1);
    await expect(page.locator('#custom-fonts svg.diagram')).toHaveCount(1);
    await expect(page.locator('#no-captions svg.diagram')).toHaveCount(1);
    await expect(page.locator('#step-by-step svg.diagram')).toHaveCount(1);
    await expect(page.locator('#not-a-player')).toBeEmpty();
    await expect(page.locator('#not-a-player')).not.toHaveAttribute('data-mounted');
  });

  test('mounts each player once, even if it runs again', async ({ page }) => {
    await expect(page.locator('#page-keys svg.diagram')).toHaveCount(1);
    await page.evaluate(() => import('/src/autoload.js?again'));
    await page.waitForTimeout(300);
    await expect(page.locator('#page-keys svg.diagram')).toHaveCount(1);
    await expect(page.locator('#page-keys .controls')).toHaveCount(1);
  });

  test('passes data-keyboard through', async ({ page }) => {
    const player = page.locator('#page-keys');
    await expect(player.locator('svg.diagram')).toHaveCount(1);
    await expect(player).toHaveAttribute('aria-label', /Space to play or pause/);
    // Both players autoplay; pause this one, then resume it with a page-wide Space.
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    await expect(player.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  });

  test('passes data-fonts through: a URL, or "none" to skip', async ({ page }) => {
    await expect(page.locator('svg.diagram')).toHaveCount(4);
    const links = await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')]
      .map((link) => new URL(link.href).pathname));
    expect(links).toContain('/test/browser/fixtures/custom-fonts.css');
    expect(links).not.toContain('/fonts/fonts.css');
  });

  test('passes data-captions="false" through', async ({ page }) => {
    await expect(page.locator('#no-captions svg.diagram')).toHaveCount(1);
    await expect(page.locator('#no-captions .captions')).toBeHidden();
    await expect(page.locator('#no-captions .captions')).toBeEmpty();
    await expect(page.locator('#page-keys .captions')).toBeVisible();
  });

  test('passes data-autoplay="false" through', async ({ page }) => {
    const player = page.locator('#step-by-step');
    await expect(player.locator('svg.diagram')).toHaveCount(1);
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeHidden();
    await expect(page.locator('#page-keys').getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('shows an error message for a diagram that fails to load', async ({ page }) => {
    await expect(page.locator('#broken')).toHaveText('This diagram could not be loaded.');
    await expect(page.locator('#missing')).toHaveText('This diagram could not be loaded.');
  });

  test('logs which diagram failed', async ({ page }) => {
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.reload();
    await expect(page.locator('#broken')).toHaveText('This diagram could not be loaded.');
    expect(errors.some((text) => text.includes('Could not load diagram broken-diagram.js'))).toBe(true);
  });
});

test.describe('AnimatedDiagram.vue', () => {
  const log = (page) => page.evaluate(() => window.playerLog);

  test.beforeEach(async ({ page }) => {
    await page.goto('vue.html');
    await page.waitForFunction(() => window.show);
  });

  for (const kind of ['diagram', 'module', 'promise']) {
    test(`accepts a ${kind === 'diagram' ? 'Diagram' : kind === 'module' ? 'module namespace' : 'promise'}`, async ({ page }) => {
      await page.evaluate((k) => window.show(k), kind);
      await expect(page.locator('.diagram-player svg.diagram')).toHaveAttribute('data-diagram', 'sample');
      expect(await log(page)).toEqual(['mount sample']);
    });
  }

  test('passes captions through', async ({ page }) => {
    await page.evaluate(() => window.show('diagram'));
    await expect(page.locator('.diagram-player .captions')).toBeVisible();
    await expect.poll(() => log(page)).toEqual(['mount sample']);
    await page.evaluate(() => window.hide());
    await page.evaluate(() => window.show('diagram', { captions: false }));
    await expect.poll(() => log(page)).toEqual(['mount sample', 'destroy sample', 'mount sample']);
    await expect(page.locator('.diagram-player .captions')).toBeHidden();
    await expect(page.locator('.diagram-player .captions')).toBeEmpty();
  });

  test('passes autoplay through', async ({ page }) => {
    await page.evaluate(() => window.show('diagram'));
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect.poll(() => log(page)).toEqual(['mount sample']);
    await page.evaluate(() => window.hide());
    await page.evaluate(() => window.show('diagram', { autoplay: false }));
    await expect.poll(() => log(page)).toEqual(['mount sample', 'destroy sample', 'mount sample']);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Step', exact: true })).toBeVisible();
  });

  test('calls destroy() on unmount', async ({ page }) => {
    await page.evaluate(() => window.show('diagram'));
    await expect(page.locator('svg.diagram')).toHaveCount(1);
    await page.evaluate(() => window.hide());
    await expect(page.locator('.diagram-player')).toHaveCount(0);
    expect(await log(page)).toEqual(['mount sample', 'destroy sample']);
  });

  test('calls destroy() when unmounted while still mounting', async ({ page }) => {
    // The player waits for stylesheets and fonts, so hiding on the next task unmounts mid-mount.
    const logWhenHidden = await page.evaluate(() => {
      window.show('diagram');
      return new Promise((resolve) => setTimeout(() => {
        window.hide();
        resolve([...window.playerLog]);
      }));
    });
    expect(logWhenHidden).toEqual([]);
    await expect.poll(() => log(page)).toEqual(['mount sample', 'destroy sample']);
    await expect(page.locator('svg.diagram')).toHaveCount(0);
  });
});
