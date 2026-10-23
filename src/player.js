// Renders a diagram into a container and wires up the standard controls
// (Play, Pause, Step, Replay, scrubber) plus the caption box. Loads the player
// stylesheet, fonts and the diagram's own stylesheet itself, so the only thing a
// host page needs is the container (see autoload.js).
//
// Keyboard: Space plays/pauses, Right Arrow steps. By default keys work while
// the player has focus; pass { keyboard: 'page' } to listen page-wide.
//
// Fonts: `fonts` is the URL of a stylesheet that loads the diagram fonts (Open Sans
// and Bangers from Google Fonts by default); pass false to skip it, e.g. when the
// host page already loads its own.
//
// Returns { timeline, destroy }. Call destroy() when removing the player: it stops
// playback and speech and removes the page-wide listener and the autoplay observer.
//
// The speaker button (off by default) reads each caption aloud with the
// browser's built-in speech synthesis as it appears. If the voice is still
// talking when the next caption is due, the animation waits for it.

import { renderDiagram } from './diagram-renderer.js';
import { buildTimeline } from './diagram-animator.js';

const PLAYER_CSS = new URL('./diagram.css', import.meta.url).href;
export const DEFAULT_FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=Bangers&family=Open+Sans:wght@300..800&display=swap';
const SPEECH_RATE = 1.2; // a little faster than default, closer to the caption pace

const SPEAKER_ICON = `
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
       stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/>
    <path class="speaker-waves" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>
    <path class="speaker-muted" d="m16 9 6 6m0-6-6 6"/>
  </svg>`;

export async function mountDiagram(diagram, root, { keyboard = 'player', fonts = DEFAULT_FONTS_CSS } = {}) {
  root.classList.add('diagram-player');
  root.tabIndex = 0;
  root.setAttribute('aria-label', `${diagram.title} (animated diagram; Space to play or pause, Right Arrow to step)`);
  root.innerHTML = `
    <div class="stage"></div>
    <div class="captions"></div>
    <div class="controls">
      <button type="button" data-action="play">Play</button>
      <button type="button" data-action="pause">Pause</button>
      <button type="button" data-action="step" title="Right Arrow">Step</button>
      <button type="button" data-action="replay">Replay</button>
      <input type="range" min="0" max="1000" value="0" aria-label="Animation position">
      <button type="button" data-action="speak" class="speak-toggle" aria-pressed="false"
              aria-label="Read captions aloud" title="Read captions aloud">${SPEAKER_ICON}</button>
    </div>`;
  const buttons = Object.fromEntries(
    [...root.querySelectorAll('button[data-action]')].map((b) => [b.dataset.action, b]),
  );
  const scrub = root.querySelector('input[type=range]');
  const captionEl = root.querySelector('.captions');
  captionEl.hidden = !diagram.elements.some((el) => el.caption);
  const speech = window.speechSynthesis;
  buttons.speak.hidden = captionEl.hidden || !speech;

  // Rendering reads computed styles and measures text, so styles and fonts must be ready.
  await Promise.all([PLAYER_CSS, fonts, diagram.stylesheet].filter(Boolean).map(loadStylesheet));
  await document.fonts.ready;
  const svg = renderDiagram(diagram, root.querySelector('.stage'));

  // When stepping, the time at which to stop; null while playing normally.
  let stopAt = null;

  // Read-aloud state: whether it's on, the index of the last caption that
  // appeared (spoken or not), the utterance in progress, and whether the
  // timeline is paused only to let that utterance finish.
  let speaking = false;
  let shownCaption = -1;
  let utterance = null;
  let waitingForSpeech = false;

  const { timeline, steps, captions } = buildTimeline(diagram, svg, captionEl, {
    onUpdate: (tl) => {
      scrub.value = Math.round(tl.progress * 1000);
      if (stopAt !== null && tl.currentTime >= stopAt) {
        const target = stopAt;
        stopAt = null;
        tl.pause();
        tl.seek(target);
      }
      syncSpeech(tl);
    },
    onPause: syncButtons,
    onBegin: syncButtons,
    onComplete: syncButtons,
  });

  function isPlaying() {
    return waitingForSpeech || (!timeline.paused && !timeline.completed);
  }

  function captionIndexAt(time) {
    return captions.findLastIndex((c) => c.start <= time);
  }

  // Called on every frame: when playback reaches a new caption, read it aloud,
  // or hold the timeline at that caption until the previous one is finished.
  function syncSpeech(tl) {
    if (tl.paused) return;
    const index = captionIndexAt(tl.currentTime);
    if (index === shownCaption) return;
    if (speaking && utterance && index > shownCaption) {
      waitingForSpeech = true;
      tl.pause();
      tl.seek(captions[index].start);
      return;
    }
    shownCaption = index;
    if (speaking && index >= 0) speak(captions[index].text);
  }

  function speak(text) {
    const current = new SpeechSynthesisUtterance(text);
    current.lang = document.documentElement.lang || 'en-US';
    current.rate = SPEECH_RATE;
    current.onend = current.onerror = () => {
      if (utterance !== current) return;
      utterance = null;
      if (waitingForSpeech) {
        waitingForSpeech = false;
        timeline.play();
      }
    };
    utterance = current;
    speech.speak(current);
  }

  function stopSpeech() {
    waitingForSpeech = false;
    utterance = null;
    speech?.cancel();
  }

  function toggleSpeech() {
    speaking = !speaking;
    buttons.speak.setAttribute('aria-pressed', String(speaking));
    if (!speaking) {
      const wasWaiting = waitingForSpeech;
      stopSpeech();
      if (wasWaiting) timeline.play();
    }
    syncButtons();
  }

  function syncButtons() {
    const playing = isPlaying();
    buttons.play.disabled = playing;
    buttons.pause.disabled = !playing;
    buttons.step.disabled = playing || timeline.currentTime >= steps[steps.length - 1].end;
  }

  function play() {
    stopAt = null;
    if (timeline.completed) {
      stopSpeech();
      timeline.restart();
    } else timeline.play();
    syncButtons();
  }

  function pause() {
    stopAt = null;
    stopSpeech();
    timeline.pause();
    syncButtons();
  }

  // Plays the next step and stops when its animation (and caption) finish,
  // skipping the hold/gap that normally follows so manual stepping stays snappy.
  function step() {
    const now = timeline.currentTime;
    const next = steps.find((s) => s.end > now + 1);
    if (!next) return;
    if (now < next.start) timeline.seek(next.start);
    stopAt = next.end;
    timeline.play();
    syncButtons();
  }

  function replay() {
    stopAt = null;
    stopSpeech();
    shownCaption = -1;
    timeline.restart();
    syncButtons();
  }

  buttons.play.addEventListener('click', play);
  buttons.pause.addEventListener('click', pause);
  buttons.step.addEventListener('click', step);
  buttons.replay.addEventListener('click', replay);
  buttons.speak.addEventListener('click', toggleSpeech);

  scrub.addEventListener('input', () => {
    pause();
    timeline.seek((scrub.value / 1000) * timeline.duration);
    shownCaption = captionIndexAt(timeline.currentTime);
    syncButtons();
  });

  const keyTarget = keyboard === 'page' ? document : root;
  function onKeydown(event) {
    if (event.target.closest('input, button, textarea, select, a')) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (isPlaying()) pause();
      else play();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!isPlaying()) step();
    }
  }
  keyTarget.addEventListener('keydown', onKeydown);
  let observer = null;

  syncButtons();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    timeline.seek(timeline.duration);
    shownCaption = captions.length - 1;
    syncButtons();
  } else {
    // Start once the player is mostly on screen, so embedded diagrams further
    // down a page don't play unseen.
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        if (timeline.currentTime === 0 && timeline.paused) play();
      }
    }, { threshold: 0.5 });
    observer.observe(root);
  }

  function destroy() {
    keyTarget.removeEventListener('keydown', onKeydown);
    observer?.disconnect();
    stopAt = null;
    stopSpeech();
    timeline.pause();
  }

  return { timeline, destroy };
}

// Adds a stylesheet to <head> once per page and resolves when it has loaded.
const stylesheets = new Map();
function loadStylesheet(href) {
  if (!stylesheets.has(href)) {
    stylesheets.set(href, new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      // A failed stylesheet (e.g. fonts offline) shouldn't stop the diagram.
      link.onload = link.onerror = resolve;
      document.head.append(link);
    }));
  }
  return stylesheets.get(href);
}
