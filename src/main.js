import { APP, ambients, hexToRgb } from './config/ambients.js';
import { AmbientRenderer } from './render/engine.js';
import { Session } from './core/session.js';
import { AmbientAudio } from './core/audio.js';
import { WakeLock } from './core/wake-lock.js';

const els = {
  grid: document.getElementById('grid'),
  stage: document.getElementById('stage'),
  dim: document.getElementById('dim'),
  controls: document.getElementById('controls'),
  time: document.getElementById('time'),
  pause: document.getElementById('pause'),
  end: document.getElementById('end'),
  note: document.getElementById('note'),
  live: document.getElementById('live'),
};

const renderer = new AmbientRenderer(document.getElementById('canvas'));
const wakeLock = new WakeLock();
const audio = new AmbientAudio({ onError: () => notifyAudioFailure() });

let active = null;
let hideTimer = 0;

/* --------------------------------------------------------------------------
   Cuadrícula
   -------------------------------------------------------------------------- */

function iconMarkup(paths) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths
    .map((d) => `<path d="${d}"></path>`)
    .join('')}</svg>`;
}

function buildGrid() {
  ambients.forEach((ambient, index) => {
    const button = document.createElement('button');
    const { r, g, b } = hexToRgb(ambient.accent);
    button.type = 'button';
    button.className = 'tile';
    button.dataset.ambient = ambient.id;
    button.style.setProperty('--accent', ambient.accent);
    button.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.13)`);
    button.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.34)`);
    button.style.setProperty('--i', String(index));
    button.setAttribute('aria-label', `${ambient.name}: comenzar una sesión de diez minutos`);
    button.innerHTML = `
      <span class="tile__icon" aria-hidden="true">${iconMarkup(ambient.icon)}</span>
      <span class="tile__name">${ambient.name}</span>
    `;
    button.addEventListener('click', () => startSession(ambient, button));
    els.grid.append(button);
  });
}

/* --------------------------------------------------------------------------
   Sesión
   -------------------------------------------------------------------------- */

function startSession(ambient, trigger) {
  if (active) return;

  const token = {};
  active = {
    token,
    ambient,
    trigger,
    session: null,
    phase: 'idle',
    paused: false,
    ending: false,
    finishing: false,
    audioFailed: false,
    lastTime: '',
    noteTimer: 0,
  };

  document.body.classList.add('is-session');
  els.stage.hidden = false;
  els.stage.classList.remove('is-leaving', 'is-clean', 'is-paused');
  els.stage.setAttribute('aria-hidden', 'false');
  els.dim.style.opacity = '0';
  els.time.textContent = formatTime(APP.durationMs);
  els.note.hidden = true;
  els.pause.disabled = false;
  els.end.disabled = false;
  els.pause.setAttribute('aria-label', 'Pausar');
  els.live.textContent = `Sesión de ${ambient.name}. Diez minutos.`;

  els.stage.focus({ preventScroll: true });

  audio.play(ambient.audio);
  renderer.start(ambient);
  wakeLock.request();

  active.session = new Session({
    durationMs: APP.durationMs,
    fadeOutMs: APP.fadeOutMs,
    holdMs: APP.holdAfterEndMs,
    manualFadeMs: APP.manualFadeMs,
    onUpdate: (snapshot) => updateSession(token, snapshot),
    onComplete: ({ reason }) => finishSession(token, reason),
  });
  active.session.start();

  try {
    history.pushState({ sen: ambient.id }, '', `#${ambient.id}`);
  } catch {
    /* sites embebidos o file:// pueden bloquear el historial */
  }

  showControls();
}

function updateSession(token, snapshot) {
  if (!active || active.token !== token) return;

  const fadeIn = Math.min(1, snapshot.elapsed / (APP.audioFadeInMs / 1000));
  const easedIn = fadeIn * fadeIn * (3 - 2 * fadeIn);
  audio.setGain(snapshot.gain * easedIn * APP.audioVolume);
  els.dim.style.opacity = snapshot.light.toFixed(4);

  const label = formatTime(snapshot.remainingMs);
  if (label !== active.lastTime) {
    active.lastTime = label;
    els.time.textContent = label;
  }

  if (snapshot.paused !== active.paused) {
    active.paused = snapshot.paused;
    els.stage.classList.toggle('is-paused', snapshot.paused);
    if (snapshot.paused) {
      audio.pause();
      renderer.pause();
      els.pause.setAttribute('aria-label', 'Reanudar');
      els.live.textContent = 'Sesión en pausa.';
      showControls();
    } else {
      audio.resume();
      renderer.resume();
      els.pause.setAttribute('aria-label', 'Pausar');
      els.live.textContent = 'Sesión reanudada.';
      showControls();
    }
  }

  if (snapshot.phase !== active.phase) {
    active.phase = snapshot.phase;

    if (snapshot.phase === 'hold') {
      active.ending = true;
      audio.stop();
      hideControls();
      els.pause.disabled = true;
      els.end.disabled = true;
      els.live.textContent = 'La sesión ha terminado.';
    } else if (snapshot.phase === 'manual') {
      active.ending = true;
      hideControls();
      els.pause.disabled = true;
      els.end.disabled = true;
      els.live.textContent = 'Terminando la sesión.';
    }
  }
}

function requestEnd() {
  if (!active || active.ending || !active.session) return;
  const started = active.session.end();
  if (!started) return;
  active.ending = true;
  els.pause.disabled = true;
  els.end.disabled = true;
  hideControls();
  els.live.textContent = 'Terminando la sesión.';
}

function finishSession(token, reason) {
  if (!active || active.token !== token || active.finishing) return;
  active.finishing = true;

  const { trigger } = active;
  audio.stop();
  wakeLock.release();
  active.session?.dispose();
  active.session = null;
  window.clearTimeout(hideTimer);
  window.clearTimeout(active.noteTimer);
  hideControls();
  els.note.hidden = true;

  if (history.state && history.state.sen) {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* sin historial disponible */
    }
  }

  els.live.textContent = reason === 'manual' ? 'Sesión terminada.' : 'Sesión completada.';
  els.stage.classList.add('is-leaving');

  window.setTimeout(() => {
    if (!active || active.token !== token) return;
    els.stage.hidden = true;
    els.stage.classList.remove('is-leaving', 'is-paused');
    els.stage.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-session');
    els.dim.style.opacity = '0';
    renderer.stop();
    active = null;
    trigger?.focus?.({ preventScroll: true });
  }, 440);
}

/* --------------------------------------------------------------------------
   Controles
   -------------------------------------------------------------------------- */

function showControls({ autoHide = true } = {}) {
  if (!active || active.ending) return;
  window.clearTimeout(hideTimer);
  els.controls.classList.add('is-visible');
  els.controls.removeAttribute('inert');
  els.controls.setAttribute('aria-hidden', 'false');
  els.stage.classList.remove('is-clean');
  if (autoHide && !active.paused) {
    hideTimer = window.setTimeout(() => hideControls(), APP.controlsHideMs);
  }
}

function hideControls() {
  window.clearTimeout(hideTimer);
  els.controls.classList.remove('is-visible');
  els.controls.setAttribute('aria-hidden', 'true');
  els.controls.setAttribute('inert', '');
  if (els.controls.contains(document.activeElement)) {
    els.stage.focus({ preventScroll: true });
  }
  els.stage.classList.add('is-clean');
}

function notifyAudioFailure(token) {
  if (!active || active.ending) return;
  if (token && active.token !== token) return;
  if (active.audioFailed) return;
  active.audioFailed = true;
  els.note.hidden = false;
  els.live.textContent = 'Audio no disponible. La sesión continúa solo con luz.';
  window.clearTimeout(active.noteTimer);
  active.noteTimer = window.setTimeout(() => {
    if (active && active.token === token) els.note.hidden = true;
  }, 8000);
}

function formatTime(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/* --------------------------------------------------------------------------
   Eventos globales
   -------------------------------------------------------------------------- */

els.stage.addEventListener('click', (event) => {
  if (!active || active.ending) return;
  if (event.target.closest('.controls')) return;
  if (els.controls.classList.contains('is-visible')) hideControls();
  else showControls();
});

els.controls.addEventListener('click', (event) => event.stopPropagation());

els.pause.addEventListener('click', () => {
  if (!active || active.ending || !active.session) return;
  if (active.paused) active.session.resume();
  else active.session.pause();
  showControls();
});

els.end.addEventListener('click', () => requestEnd());

document.addEventListener('keydown', (event) => {
  if (!active) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    requestEnd();
    return;
  }
  if (event.code === 'Space') {
    const focused = document.activeElement;
    if (focused && (focused.tagName === 'BUTTON' || focused.tagName === 'A')) return;
    event.preventDefault();
    if (!active.ending) els.pause.click();
  }
});

window.addEventListener('popstate', () => {
  if (active && !active.ending) requestEnd();
});

buildGrid();
