// Player tests: controls, keyboard, autoplay, reduced motion, fonts and read-aloud.
// Each test mounts the sample diagram on the harness page with page.evaluate().

import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => {
  const { timeline } = window.player;
  return { paused: timeline.paused, time: timeline.currentTime, duration: timeline.duration };
});

const mount = (page, options = {}, placement = {}) =>
  page.evaluate(([o, p]) => window.mount(o, p), [options, placement]);

const button = (page, name) => page.getByRole('button', { name, exact: true });

// Opacity of a rendered node, which the timeline animates from 0 to 1.
const nodeOpacity = (page, id) =>
  page.locator(`[data-node="${id}"]`).evaluate((el) => +getComputedStyle(el).opacity);

test.beforeEach(async ({ page }) => {
  await page.goto('harness.html');
  await page.waitForFunction(() => window.harnessReady);
});

test.describe('controls', () => {
  test('Play and Pause, with their enabled states', async ({ page }) => {
    await mount(page, { autoplay: false });
    await expect(button(page, 'Play')).toBeEnabled();
    await expect(button(page, 'Pause')).toBeDisabled();
    await expect(button(page, 'Step')).toBeEnabled();
    expect((await state(page)).time).toBe(0);

    await button(page, 'Play').click();
    await expect(button(page, 'Play')).toBeDisabled();
    await expect(button(page, 'Pause')).toBeEnabled();
    await expect(button(page, 'Step')).toBeDisabled();
    await expect.poll(async () => (await state(page)).time).toBeGreaterThan(0);

    await button(page, 'Pause').click();
    await expect(button(page, 'Play')).toBeEnabled();
    await expect(button(page, 'Pause')).toBeDisabled();
    const paused = await state(page);
    expect(paused.paused).toBe(true);
    await page.waitForTimeout(200);
    expect((await state(page)).time).toBe(paused.time);
  });

  test('Step plays one step and stops', async ({ page }) => {
    await mount(page, { autoplay: false });
    await button(page, 'Step').click();
    await expect(button(page, 'Step')).toBeEnabled();
    expect((await state(page)).paused).toBe(true);
    expect(await nodeOpacity(page, 'a')).toBe(1);
    expect(await nodeOpacity(page, 'b')).toBe(0);
    await expect(page.locator('.captions')).toContainText('Alpha appears.');

    await button(page, 'Step').click();
    await expect(button(page, 'Step')).toBeEnabled();
    expect(await nodeOpacity(page, 'b')).toBe(1);
  });

  test('Step is disabled after the last step', async ({ page }) => {
    const { stepCount } = await mount(page, { autoplay: false });
    await page.evaluate((n) => window.player.showStep(n), stepCount - 1);
    await expect(button(page, 'Step')).toBeEnabled();
    await page.evaluate((n) => window.player.showStep(n), stepCount);
    await expect(button(page, 'Step')).toBeDisabled();
    await expect(button(page, 'Play')).toBeEnabled();
  });

  test('Replay restarts from the beginning', async ({ page }) => {
    const { stepCount } = await mount(page, { autoplay: false });
    await page.evaluate((n) => window.player.showStep(n), stepCount);
    await button(page, 'Replay').click();
    await expect(button(page, 'Pause')).toBeEnabled();
    const { time, paused } = await state(page);
    expect(paused).toBe(false);
    expect(time).toBeLessThan(1000);
  });

  test('the scrubber pauses and seeks', async ({ page }) => {
    await mount(page);
    await expect(button(page, 'Pause')).toBeEnabled();
    await page.getByRole('slider', { name: 'Animation position' }).fill('500');
    const { paused, time, duration } = await state(page);
    expect(paused).toBe(true);
    expect(time).toBeCloseTo(duration / 2, -1);
    await expect(button(page, 'Play')).toBeEnabled();
  });

  test('controls: false hides the control bar', async ({ page }) => {
    await mount(page, { autoplay: false, controls: false });
    await expect(page.locator('.controls')).toBeHidden();
  });
});

test.describe('keyboard', () => {
  test("'player' mode responds only while the player has focus", async ({ page }) => {
    await mount(page, { autoplay: false });
    await page.keyboard.press('Space');
    expect((await state(page)).time).toBe(0);

    await page.locator('.diagram-player').focus();
    await page.keyboard.press('ArrowRight');
    await expect(button(page, 'Step')).toBeDisabled();
    await expect(button(page, 'Step')).toBeEnabled();
    expect(await nodeOpacity(page, 'a')).toBe(1);
    expect(await nodeOpacity(page, 'b')).toBe(0);

    await page.keyboard.press('Space');
    await expect(button(page, 'Pause')).toBeEnabled();
    await page.keyboard.press('Space');
    await expect(button(page, 'Play')).toBeEnabled();
    expect((await state(page)).paused).toBe(true);
  });

  test("'page' mode responds without focus", async ({ page }) => {
    await mount(page, { autoplay: false, keyboard: 'page' });
    await page.keyboard.press('Space');
    await expect(button(page, 'Pause')).toBeEnabled();
    await page.keyboard.press('Space');
    await expect(button(page, 'Play')).toBeEnabled();
  });

  test("'none' mode ignores keys", async ({ page }) => {
    await mount(page, { autoplay: false, keyboard: 'none' });
    await page.locator('.diagram-player').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    expect((await state(page)).time).toBe(0);
  });

  test('keys on the player buttons keep their usual meaning', async ({ page }) => {
    await mount(page, { autoplay: false, keyboard: 'page' });
    await button(page, 'Replay').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    expect((await state(page)).time).toBe(0);
  });
});

test.describe('destroy()', () => {
  test('removes the page-wide key listener', async ({ page }) => {
    await mount(page, { autoplay: false, keyboard: 'page' });
    await page.evaluate(() => window.player.destroy());
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    expect(await state(page)).toMatchObject({ paused: true, time: 0 });
  });

  test('disconnects the autoplay observer', async ({ page }) => {
    await mount(page, {}, { below: true });
    await page.evaluate(() => window.player.destroy());
    await page.locator('.diagram-player').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    expect(await state(page)).toMatchObject({ paused: true, time: 0 });
  });

  test('stops playback', async ({ page }) => {
    await mount(page);
    await expect(button(page, 'Pause')).toBeEnabled();
    await page.evaluate(() => window.player.destroy());
    const { time } = await state(page);
    await page.waitForTimeout(200);
    expect(await state(page)).toMatchObject({ paused: true, time });
  });
});

test.describe('autoplay', () => {
  test('starts once the player is on screen', async ({ page }) => {
    await mount(page, {}, { below: true });
    await page.waitForTimeout(300);
    expect(await state(page)).toMatchObject({ paused: true, time: 0 });
    await page.locator('.diagram-player').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await state(page)).time).toBeGreaterThan(0);
  });

  test('autoplay: false waits for the host', async ({ page }) => {
    await mount(page, { autoplay: false });
    await page.waitForTimeout(300);
    expect(await state(page)).toMatchObject({ paused: true, time: 0 });
  });

  test('prefers-reduced-motion jumps to the final state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mount(page);
    const { paused, time, duration } = await state(page);
    expect(paused).toBe(true);
    expect(time).toBe(duration);
    await expect(button(page, 'Step')).toBeDisabled();
    expect(await nodeOpacity(page, 'c')).toBe(1);
  });
});

test.describe('fonts option', () => {
  const fontLinks = (page) => page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')]
    .map((link) => new URL(link.href).pathname)
    .filter((path) => !path.endsWith('/src/diagram.css')));

  test('loads the bundled fonts by default', async ({ page }) => {
    await mount(page, { autoplay: false });
    expect(await fontLinks(page)).toEqual(['/fonts/fonts.css']);
    expect(await page.evaluate(() => document.fonts.check('16px Bangers'))).toBe(true);
    expect(await page.evaluate(() => document.fonts.check('700 16px "Open Sans"'))).toBe(true);
  });

  test('loads a custom stylesheet instead', async ({ page }) => {
    await mount(page, { autoplay: false, fonts: '/test/browser/fixtures/custom-fonts.css' });
    expect(await fontLinks(page)).toEqual(['/test/browser/fixtures/custom-fonts.css']);
  });

  test('false skips the font stylesheet', async ({ page }) => {
    await mount(page, { autoplay: false, fonts: false });
    expect(await fontLinks(page)).toEqual([]);
  });

  test('never requests Google Fonts by default', async ({ page }) => {
    const external = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://localhost')) external.push(request.url());
    });
    await mount(page, { autoplay: false });
    expect(external).toEqual([]);
  });
});

test.describe('read-aloud', () => {
  // A fake speechSynthesis: speak() records the utterance, and the test ends it with finishSpeech().
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.spoken = [];
      window.SpeechSynthesisUtterance = class {
        constructor(text) {
          this.text = text;
        }
      };
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          speak: (utterance) => window.spoken.push(utterance),
          cancel: () => {},
        },
      });
      window.finishSpeech = () => window.spoken.at(-1).onend();
    });
    await page.reload();
    await page.waitForFunction(() => window.harnessReady);
  });

  const spokenText = (page) => page.evaluate(() => window.spoken.map((u) => u.text));

  test('is off by default', async ({ page }) => {
    await mount(page);
    const speak = page.getByRole('button', { name: 'Read captions aloud' });
    await expect(speak).toBeVisible();
    await expect(speak).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => window.player.timeline.currentTime)).toBeGreaterThan(500);
    expect(await spokenText(page)).toEqual([]);
  });

  test('reads each caption and waits for the voice before the next one', async ({ page }) => {
    await mount(page, { autoplay: false });
    const speak = page.getByRole('button', { name: 'Read captions aloud' });
    await speak.click();
    await expect(speak).toHaveAttribute('aria-pressed', 'true');
    await button(page, 'Play').click();
    await expect.poll(() => spokenText(page)).toEqual(['Alpha appears.']);

    // The voice is still "talking", so the timeline holds at the second caption...
    await expect.poll(async () => (await state(page)).paused, { timeout: 10_000 }).toBe(true);
    const held = (await state(page)).time;
    await page.waitForTimeout(300);
    expect((await state(page)).time).toBe(held);
    // ...while the player still counts as playing.
    await expect(button(page, 'Pause')).toBeEnabled();
    expect(await spokenText(page)).toEqual(['Alpha appears.']);

    // Once it finishes, playback resumes and the next caption is read.
    await page.evaluate(() => window.finishSpeech());
    await expect.poll(() => spokenText(page)).toEqual(['Alpha appears.', 'Alpha calls Beta.']);
    expect((await state(page)).paused).toBe(false);
  });

  test('turning it off while waiting resumes playback', async ({ page }) => {
    await mount(page, { autoplay: false });
    await page.getByRole('button', { name: 'Read captions aloud' }).click();
    await button(page, 'Play').click();
    await expect.poll(async () => (await state(page)).paused, { timeout: 10_000 }).toBe(true);
    await page.getByRole('button', { name: 'Read captions aloud' }).click();
    await expect.poll(async () => (await state(page)).paused).toBe(false);
  });
});
