import { APP, ambients, hexToRgb } from './config/ambients.js';
import { iconSvg } from './config/icons.js';
import { AmbientRenderer } from './render/engine.js';
import { Session } from './core/session.js';
import { AmbientAudio } from './core/audio.js';
import { WakeLock } from './core/wake-lock.js';
import { resolveAudioVariants, pickAudioVariant } from './core/variants.js';

const els = {
  grid: document.getElementById('grid'),
  stage: document.getElementById('stage'),
  dim: document.getElementById('dim'),
  note: document.getElementById('note'),
  live: document.getElementById('live'),
  progress: document.getElementById('progress'),
  lines: document.getElementById('constellation-lines'),
  durationTrigger: document.getElementById('duration-trigger'),
  durationPop: document.getElementById('duration-pop'),
  durationOptions: document.getElementById('duration-options'),
  durationClose: document.getElementById('duration-close'),
};

const renderer = new AmbientRenderer(document.getElementById('canvas'));
const menuRenderer = new AmbientRenderer(document.getElementById('menu-canvas'));
const wakeLock = new WakeLock();
const audio = new AmbientAudio({ onError: () => notifyAudioFailure() });

const MENU_BACKDROP = {
  animation: 'constellation',
  palette: {
    void: ['#010107', '#070b20', '#010005'],
    nebula: ['#6f4cff', '#3b6dff', '#d9d1ff'],
    star: '#f0f3ff',
  },
};

/* Posiciones del menú en porcentaje del lienzo de la constelación. */
const NODE_LAYOUT = [
  [18, 10],
  [50, 8],
  [82, 12],
  [30, 27],
  [69, 25],
  [14, 45],
  [47, 43],
  [83, 47],
  [27, 63],
  [59, 61],
  [87, 66],
  [18, 80],
  [50, 82],
  [82, 84],
];

/* Índices en el orden en que se dibuja la línea que une los nodos. */
const NODE_PATH = [0, 1, 2, 4, 3, 5, 6, 7, 10, 9, 8, 11, 12, 13];

let active = null;
let durationMinutes = APP.defaultDurationMin;

/* --------------------------------------------------------------------------
   Cuadrícula
   -------------------------------------------------------------------------- */

function smoothPath(points) {
  if (points.length < 2) return '';
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0]} ${p2[1]}`;
  }
  return path;
}

function drawConstellationLines() {
  const points = NODE_PATH.map((index) => NODE_LAYOUT[index]);
  const path = smoothPath(points);
  els.lines.innerHTML = `
    <defs>
      <linearGradient id="line-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0" stop-color="#9ab9ff" />
        <stop offset="0.5" stop-color="#b59bff" />
        <stop offset="1" stop-color="#8fd9e8" />
      </linearGradient>
    </defs>
    <path class="connection-glow" d="${path}" />
    <path class="connection" d="${path}" />
  `;
}

function buildGrid() {
  ambients.forEach((ambient, index) => {
    const button = document.createElement('button');
    const [x, y] = NODE_LAYOUT[index] || [50, 50];
    const { r, g, b } = hexToRgb(ambient.accent);
    button.type = 'button';
    button.className = 'node';
    button.dataset.ambient = ambient.id;
    button.style.setProperty('--x', String(x));
    button.style.setProperty('--y', String(y));
    button.style.setProperty('--accent', ambient.accent);
    button.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.16)`);
    button.style.setProperty('--accent-line', `rgba(${r}, ${g}, ${b}, 0.42)`);
    button.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.32)`);
    button.style.setProperty('--i', String(index));
    button.title = ambient.hint;
    button.setAttribute('aria-label', `${ambient.name}: ${ambient.hint}. Comenzar una sesión`);
    button.innerHTML = `
      <span class="node__icon" aria-hidden="true">${iconSvg(ambient.icon)}</span>
    `;
    button.addEventListener('click', () => startSession(ambient, button));
    els.grid.append(button);
  });

  drawConstellationLines();
}


/* --------------------------------------------------------------------------
   Duración de la sesión
   -------------------------------------------------------------------------- */

function durationLabel(minutes) {
  return `${minutes} minutos`;
}

function updateDurationUI() {
  els.durationTrigger.textContent = durationLabel(durationMinutes);
  els.durationTrigger.setAttribute(
    'aria-label',
    `Duración de la sesión: ${durationMinutes} ${durationMinutes === 1 ? 'minuto' : 'minutos'}`,
  );
  for (const chip of els.durationOptions.querySelectorAll('.duration-chip')) {
    chip.setAttribute('aria-pressed', String(Number(chip.dataset.minutes) === durationMinutes));
  }
}

function buildDurationOptions() {
  for (const minutes of APP.durationOptions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'duration-chip';
    button.dataset.minutes = String(minutes);
    button.textContent = `${minutes} minutos`;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => setDuration(minutes));
    els.durationOptions.append(button);
  }
  updateDurationUI();
}

function setDuration(value) {
  const minutes = Math.round(Number(value));
  if (!APP.durationOptions.includes(minutes)) {
    updateDurationUI();
    return;
  }
  durationMinutes = minutes;
  updateDurationUI();
  closeDuration();
}

function openDuration() {
  if (active) return;
  els.durationPop.hidden = false;
  els.durationTrigger.setAttribute('aria-expanded', 'true');
  updateDurationUI();
  const selected = els.durationOptions.querySelector('.duration-chip[aria-pressed="true"]');
  (selected || els.durationOptions.querySelector('.duration-chip') || els.durationClose)?.focus();
}

function closeDuration({ returnFocus = true } = {}) {
  if (els.durationPop.hidden) return;
  els.durationPop.hidden = true;
  els.durationTrigger.setAttribute('aria-expanded', 'false');
  if (returnFocus) els.durationTrigger.focus();
}

/* --------------------------------------------------------------------------
   Sesión
   -------------------------------------------------------------------------- */

function startSession(ambient, trigger) {
  if (active) return;

  closeDuration({ returnFocus: false });

  const token = {};
  const durationMs = durationMinutes * 60 * 1000;
  active = {
    token,
    ambient,
    trigger,
    durationMs,
    session: null,
    phase: 'idle',
    ending: false,
    finishing: false,
    audioFailed: false,
    noteTimer: 0,
  };

  menuRenderer.pause();

  document.body.classList.add('is-session');
  els.stage.hidden = false;
  els.stage.classList.remove('is-leaving');
  els.stage.setAttribute('aria-hidden', 'false');
  els.stage.setAttribute('aria-label', `Sesión de ${ambient.name}. Toca para volver al menú.`);
  els.stage.style.setProperty('--accent', ambient.accent);
  els.dim.style.opacity = '0';
  els.progress.style.width = '0%';
  els.note.hidden = true;
  els.live.textContent = `Sesión de ${ambient.name}. ${durationMinutes} ${durationMinutes === 1 ? 'minuto' : 'minutos'}.`;

  els.stage.focus({ preventScroll: true });

  audio.prepare();
  resolveAudioVariants(ambient.audioDir)
    .then((paths) => {
      if (!active || active.token !== token) return;
      const src = pickAudioVariant(paths);
      if (!src) {
        notifyAudioFailure(token);
        return;
      }
      audio.play(src);
    })
    .catch(() => notifyAudioFailure(token));

  renderer.start(ambient);
  wakeLock.request();

  active.session = new Session({
    durationMs: active.durationMs,
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
}

function updateSession(token, snapshot) {
  if (!active || active.token !== token) return;

  const fadeIn = Math.min(1, snapshot.elapsed / (APP.audioFadeInMs / 1000));
  const easedIn = fadeIn * fadeIn * (3 - 2 * fadeIn);
  audio.setGain(snapshot.gain * easedIn * APP.audioVolume);
  els.dim.style.opacity = snapshot.light.toFixed(4);
  els.progress.style.width = `${Math.min(100, (snapshot.elapsed / (active.durationMs / 1000)) * 100).toFixed(2)}%`;

  if (snapshot.phase !== active.phase) {
    active.phase = snapshot.phase;

    if (snapshot.phase === 'hold') {
      active.ending = true;
      audio.stop();
      els.live.textContent = 'La sesión ha terminado.';
    } else if (snapshot.phase === 'manual') {
      active.ending = true;
      els.live.textContent = 'Terminando la sesión.';
    }
  }
}

function requestEnd() {
  if (!active || active.ending || !active.session) return;
  const started = active.session.end();
  if (!started) return;
  active.ending = true;
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
  window.clearTimeout(active.noteTimer);
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
    els.stage.classList.remove('is-leaving');
    els.stage.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-session');
    els.dim.style.opacity = '0';
    els.progress.style.width = '0%';
    renderer.stop();
    menuRenderer.resume();
    active = null;
    trigger?.focus?.({ preventScroll: true });
  }, 440);
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

/* --------------------------------------------------------------------------
   Eventos globales
   -------------------------------------------------------------------------- */

els.durationTrigger.addEventListener('click', () => {
  if (els.durationPop.hidden) openDuration();
  else closeDuration();
});

els.durationClose.addEventListener('click', () => closeDuration());

document.addEventListener('click', (event) => {
  if (els.durationPop.hidden) return;
  if (els.durationPop.contains(event.target) || els.durationTrigger.contains(event.target)) return;
  closeDuration({ returnFocus: false });
});

els.stage.addEventListener('click', () => {
  if (!active || active.ending) return;
  requestEnd();
});

document.addEventListener('keydown', (event) => {
  if (!els.durationPop.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDuration();
    }
    return;
  }
  if (!active) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    requestEnd();
  }
});

window.addEventListener('popstate', () => {
  if (active && !active.ending) requestEnd();
});

buildGrid();
buildDurationOptions();
menuRenderer.start(MENU_BACKDROP);
