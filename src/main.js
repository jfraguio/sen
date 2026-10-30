import { APP, ambients, hexToRgb } from './config/ambients.js';
import { iconSvg, ringSvg } from './config/icons.js';
import { AmbientRenderer } from './render/engine.js';
import { Session } from './core/session.js';
import { AmbientAudio } from './core/audio.js';
import { WakeLock } from './core/wake-lock.js';
import { resolveAudioVariants } from './core/variants.js';

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
  trackLabel: document.getElementById('track-label'),
  sessionClose: document.getElementById('session-close'),
  app: document.getElementById('app'),
  portal: document.getElementById('portal'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Aviso del escenario cuando el navegador bloquea el audio sin gesto. */
const AUDIO_HINT = 'Toca para activar el sonido';

const renderer = new AmbientRenderer(document.getElementById('canvas'));
const menuRenderer = new AmbientRenderer(document.getElementById('menu-canvas'));
const wakeLock = new WakeLock();
const audio = new AmbientAudio({ onError: () => notifyAudioFailure() });

const MENU_BACKDROP = {
  animation: 'constellation',
  palette: {
    void: ['#14063a', '#0c0f3e', '#04222c'],
    nebula: ['#8b3dff', '#e0399a', '#1fb6ff', '#1ad6b0', '#f2a24b'],
    star: '#f4f1ff',
  },
  /* Posición del puntero en -1..1; el fondo la usa para el paralaje. */
  pointer: { x: 0, y: 0 },
};

/* Cuadrícula del menú: tres columnas en vertical y cinco en horizontal.
   Las posiciones se calculan en píxeles y se convierten a porcentaje para que
   los nodos queden alineados y la constelación pase por sus centros. */
let NODE_LAYOUT = [];
/** Orden de la línea, en serpentina por filas. */
let NODE_PATH = [];

let active = null;
/** Pista pendiente al cambiar de hash mientras hay una sesión en marcha. */
let pendingRoute = null;
let durationMinutes = APP.defaultDurationMin;

/* --------------------------------------------------------------------------
   Cuadrícula
   -------------------------------------------------------------------------- */

/**
 * Centros de los nodos en % del contenedor. En vertical caben tres columnas
 * (la última fila queda centrada a media columna); en horizontal, cinco.
 */
function gridLayout(width, height) {
  const count = ambients.length;
  const portrait = height > width;
  const cols = portrait ? 3 : 5;
  const rows = Math.ceil(count / cols);
  const step = Math.min(width / cols, height / rows);
  const left = (width - step * cols) / 2;
  // En vertical la cuadrícula se pega arriba (deja aire para la duración);
  // en horizontal se centra.
  const top = (height - step * rows) * (portrait ? 0.06 : 0.5);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = Math.min(cols, count - row * cols);
    const x = inRow < cols
      ? width / 2 + (col - (inRow - 1) / 2) * step
      : left + step * (col + 0.5);
    const y = top + step * (row + 0.5);
    positions.push([(x / width) * 100, (y / height) * 100]);
  }
  return { positions, cols };
}

/** Recorrido en serpentina por filas: 0,1,2, 5,4,3, 6,7,8… */
function serpentinePath(count, cols) {
  const order = [];
  for (let start = 0; start < count; start += cols) {
    const row = [];
    for (let i = start; i < Math.min(count, start + cols); i++) row.push(i);
    if ((start / cols) % 2) row.reverse();
    order.push(...row);
  }
  return order;
}

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
  if (!NODE_LAYOUT.length) return;
  const points = NODE_PATH.map((index) => NODE_LAYOUT[index]);
  const path = smoothPath(points);
  els.lines.innerHTML = `
    <defs>
      <linearGradient id="line-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0" stop-color="#7fb4ff" />
        <stop offset="0.35" stop-color="#c58bff" />
        <stop offset="0.7" stop-color="#ff8fc8" />
        <stop offset="1" stop-color="#6fe8d6" />
      </linearGradient>
    </defs>
    <path class="connection-glow" d="${path}" />
    <path class="connection" d="${path}" />
    <path class="connection-flow" d="${path}" pathLength="100" />
  `;
}

function layoutConstellation() {
  const rect = els.grid.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const { positions, cols } = gridLayout(rect.width, rect.height);
  NODE_LAYOUT = positions;
  NODE_PATH = serpentinePath(ambients.length, cols);
  [...els.grid.children].forEach((node, index) => {
    const [x, y] = positions[index];
    node.style.setProperty('--x', x.toFixed(3));
    node.style.setProperty('--y', y.toFixed(3));
  });
  drawConstellationLines();
}

function buildGrid() {
  const rect = els.grid.getBoundingClientRect();
  if (rect.width && rect.height) {
    const { positions, cols } = gridLayout(rect.width, rect.height);
    NODE_LAYOUT = positions;
    NODE_PATH = serpentinePath(ambients.length, cols);
  }

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
    button.style.setProperty('--spin', `${70 + ((index * 37) % 50)}s`);
    button.style.setProperty('--dir', index % 2 ? 'reverse' : 'normal');
    button.innerHTML = `
      <span class="node__halo" aria-hidden="true"></span>
      <span class="node__ring" aria-hidden="true">${ringSvg()}</span>
      <span class="node__icon" aria-hidden="true">${iconSvg(ambient.icon)}</span>
    `;
    // Longitud normalizada para que los trazos del sigilo puedan «dibujarse».
    for (const shape of button.querySelectorAll('.node__icon svg :is(path, circle, ellipse)')) {
      shape.setAttribute('pathLength', '1');
    }
    button.addEventListener('click', () => invoke(ambient, button));
    els.grid.append(button);
  });

  drawConstellationLines();
  new ResizeObserver(() => layoutConstellation()).observe(els.grid);
}

/* --------------------------------------------------------------------------
   Invocación: animación al elegir un nodo
   -------------------------------------------------------------------------- */

let invoking = false;

function invoke(ambient, button) {
  if (active || invoking) return;
  if (reducedMotion.matches) {
    startSession(ambient, button);
    return;
  }
  invoking = true;
  const rect = button.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const reach = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
  const portal = els.portal;
  portal.style.setProperty('--ox', `${cx}px`);
  portal.style.setProperty('--oy', `${cy}px`);
  portal.style.setProperty('--accent', ambient.accent);
  portal.style.setProperty('--cover', String(reach * 0.26));
  portal.innerHTML = `
    <span class="portal__ring"></span>
    <span class="portal__ring"></span>
    <span class="portal__ring"></span>
    <span class="portal__light"></span>
  `;
  portal.hidden = false;
  portal.classList.remove('is-fading');

  // Los demás nodos se pliegan hacia el elegido.
  const crect = els.grid.getBoundingClientRect();
  els.app.style.setProperty('--ox', String(((cx - crect.left) / crect.width) * 100));
  els.app.style.setProperty('--oy', String(((cy - crect.top) / crect.height) * 100));
  els.app.classList.add('is-invoking');
  button.classList.add('is-chosen');

  // La sesión empieza ya (el audio necesita el gesto), pero el escenario
  // espera oculto a que termine la invocación.
  els.stage.classList.add('is-awaiting');
  startSession(ambient, button);

  window.setTimeout(() => {
    els.stage.classList.remove('is-awaiting');
    portal.classList.add('is-fading');
  }, 1050);
  window.setTimeout(() => {
    portal.hidden = true;
    portal.innerHTML = '';
    els.app.classList.remove('is-invoking');
    button.classList.remove('is-chosen');
    invoking = false;
  }, 2000);
}

/* --------------------------------------------------------------------------
   Paralaje del puntero
   -------------------------------------------------------------------------- */

window.addEventListener('pointermove', (event) => {
  if (active || reducedMotion.matches) return;
  const x = (event.clientX / innerWidth) * 2 - 1;
  const y = (event.clientY / innerHeight) * 2 - 1;
  MENU_BACKDROP.pointer.x = x;
  MENU_BACKDROP.pointer.y = y;
  document.documentElement.style.setProperty('--px', x.toFixed(3));
  document.documentElement.style.setProperty('--py', y.toFixed(3));
}, { passive: true });

/* --------------------------------------------------------------------------
   Duración de la sesión
   -------------------------------------------------------------------------- */

function durationLabel(minutes) {
  return `${minutes} MIN`;
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
    button.textContent = durationLabel(minutes);
    button.setAttribute('aria-label', `${minutes} minutos`);
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
  (selected || els.durationOptions.querySelector('.duration-chip'))?.focus();
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

function startSession(ambient, trigger, { track = null, gesture = true } = {}) {
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
    awaitingAudio: false,
    wantedIndex: 0,
    noteTimer: 0,
    tracks: [],
    trackIndex: -1,
    trackRequest: 0,
  };

  menuRenderer.pause();

  document.body.classList.add('is-session');
  els.stage.hidden = false;
  els.stage.classList.remove('is-leaving', 'is-ending');
  els.trackLabel.hidden = true;
  els.trackLabel.disabled = true;
  els.trackLabel.textContent = '';
  els.stage.setAttribute('aria-hidden', 'false');
  els.stage.setAttribute('aria-label', `Sesión de ${ambient.name}. Toca para volver al menú.`);
  els.stage.style.setProperty('--accent', ambient.accent);
  els.dim.style.opacity = '0';
  els.progress.style.width = '0%';
  els.note.hidden = true;
  els.live.textContent = `Sesión de ${ambient.name}. ${durationMinutes} ${durationMinutes === 1 ? 'minuto' : 'minutos'}.`;

  els.stage.focus({ preventScroll: true });

  audio.prepare();
  // Si la sesión se abre desde una URL (sin gesto), el navegador puede dejar
  // el audio en pausa: el primer toque lo activa en vez de cerrar la sesión.
  if (!gesture && !audio.running) {
    active.awaitingAudio = true;
    showAudioHint();
  }
  resolveAudioVariants(ambient.audioDir)
    .then((paths) => {
      if (!active || active.token !== token) return;
      if (!paths.length) {
        notifyAudioFailure(token);
        return;
      }
      active.tracks = paths;
      const wanted = track ? paths.findIndex((path, index) => trackNumber(path, index) === track) : 0;
      active.wantedIndex = wanted >= 0 ? wanted : 0;
      playTrack(active.wantedIndex, token, { initial: true });
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

  setSessionUrl(ambient, track || '01', { replace: !gesture });
}

/** «Audio no disponible» y «toca para activar» comparten el aviso del escenario. */
function showAudioHint() {
  els.note.textContent = AUDIO_HINT;
  els.note.hidden = false;
  els.live.textContent = `${AUDIO_HINT}.`;
  els.stage.setAttribute('aria-label', AUDIO_HINT);
}

function hideAudioHint() {
  els.note.textContent = 'Audio no disponible';
  els.note.hidden = true;
}

function trackNumber(path, index) {
  const match = /(\d{2})\.wav$/i.exec(path);
  return match ? match[1] : String(index + 1).padStart(2, '0');
}

function setSessionUrl(ambient, number, { replace = false } = {}) {
  if (history.state && history.state.sen === ambient.id && history.state.track === number) return;
  const state = { sen: ambient.id, track: number };
  const url = `#${ambient.id}/${number}`;
  try {
    if (replace) history.replaceState(state, '', url);
    else history.pushState(state, '', url);
  } catch {
    /* sites embebidos o file:// pueden bloquear el historial */
  }
}

/** «#bosque/02» → `{ ambient, track: '02' }`; si no es una pista válida, `null`. */
function routeFromHash(hash = location.hash) {
  const match = /^#([a-z]{2,20})\/(\d{1,2})\/?$/i.exec(hash.trim());
  if (!match) return null;
  const ambient = ambients.find((item) => item.id === match[1].toLowerCase());
  return ambient ? { ambient, track: String(Number(match[2])).padStart(2, '0') } : null;
}

/** Pista que suena ahora mismo, con su número de archivo (`01`…). */
function currentTrackNumber() {
  if (!active || active.trackIndex < 0 || !active.tracks.length) return null;
  return trackNumber(active.tracks[active.trackIndex], active.trackIndex);
}

/** Cambia a la sesión de `#ambiente/NN`, cerrando la actual si es otra. */
function switchRoute(route) {
  if (!route) return;
  if (active) {
    if (active.ambient.id === route.ambient.id && currentTrackNumber() === route.track) return;
    pendingRoute = route;
    if (!active.ending) {
      active.ending = true;
      finishSession(active.token, 'manual');
    }
    return;
  }
  startSession(route.ambient, null, { track: route.track, gesture: false });
}

function updateTrackUI() {
  if (!active || active.trackIndex < 0 || !active.tracks.length) {
    els.trackLabel.hidden = true;
    els.trackLabel.disabled = true;
    return;
  }

  const total = active.tracks.length;
  const position = active.trackIndex + 1;
  els.trackLabel.hidden = false;
  els.trackLabel.disabled = total < 2;
  els.trackLabel.textContent = `${position}/${total}`;
  els.trackLabel.setAttribute(
    'aria-label',
    total < 2
      ? `Pista ${position} de ${total}`
      : `Pista ${position} de ${total}. Pulsar para oír la siguiente`,
  );
}

async function playTrack(index, token, { initial = false } = {}) {
  if (!active || active.token !== token || active.ending) return;

  const total = active.tracks.length;
  if (!total) return;
  const next = ((index % total) + total) % total;
  const request = ++active.trackRequest;
  const fade = active.trackIndex >= 0 ? 0.3 : 0.15;

  const ok = await audio.play(active.tracks[next], {
    fade,
    onError: initial ? () => notifyAudioFailure(token) : () => {},
  });

  if (!active || active.token !== token || active.trackRequest !== request || active.ending) return;
  if (!ok) {
    if (initial) notifyAudioFailure(token);
    return;
  }

  active.trackIndex = next;
  if (active.awaitingAudio) active.awaitingAudio = false;
  if (els.note.textContent === AUDIO_HINT) {
    hideAudioHint();
    els.stage.setAttribute('aria-label', `Sesión de ${active.ambient.name}. Toca para volver al menú.`);
  }
  updateTrackUI();
  setSessionUrl(active.ambient, trackNumber(active.tracks[next], next), { replace: true });
  if (!initial) els.live.textContent = `Pista ${next + 1} de ${total}.`;
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
      els.stage.classList.add('is-ending');
      audio.stop();
      els.live.textContent = 'La sesión ha terminado.';
    } else if (snapshot.phase === 'manual') {
      active.ending = true;
      els.stage.classList.add('is-ending');
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

  if (!pendingRoute && history.state && history.state.sen) {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* sin historial disponible */
    }
  }

  els.live.textContent = reason === 'manual' ? 'Sesión terminada.' : 'Sesión completada.';
  els.trackLabel.hidden = true;
  els.trackLabel.disabled = true;
  els.trackLabel.textContent = '';
  els.stage.classList.add('is-leaving');

  window.setTimeout(() => {
    if (!active || active.token !== token) return;
    els.stage.hidden = true;
    els.stage.classList.remove('is-leaving', 'is-ending');
    els.stage.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-session');
    els.dim.style.opacity = '0';
    els.progress.style.width = '0%';
    renderer.stop();
    menuRenderer.resume();
    active = null;
    const next = pendingRoute;
    pendingRoute = null;
    if (next) {
      startSession(next.ambient, null, { track: next.track, gesture: false });
      return;
    }
    trigger?.focus?.({ preventScroll: true });
  }, 440);
}

function notifyAudioFailure(token) {
  if (!active || active.ending) return;
  if (token && active.token !== token) return;
  if (active.audioFailed) return;
  active.audioFailed = true;
  els.note.textContent = 'Audio no disponible';
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

document.addEventListener('click', (event) => {
  if (els.durationPop.hidden) return;
  if (els.durationPop.contains(event.target) || els.durationTrigger.contains(event.target)) return;
  closeDuration({ returnFocus: false });
});

els.trackLabel.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!active || active.ending || active.tracks.length < 2) return;
  playTrack(active.trackIndex + 1, active.token);
});

els.sessionClose.addEventListener('click', (event) => {
  event.stopPropagation();
  requestEnd();
});

els.stage.addEventListener('click', () => {
  if (!active || active.ending) return;
  if (active.awaitingAudio) {
    active.awaitingAudio = false;
    audio.prepare();
    if (active.tracks.length) playTrack(active.wantedIndex, active.token, { initial: true });
    return;
  }
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
  const route = routeFromHash();
  if (route) switchRoute(route);
  else if (active && !active.ending) requestEnd();
});

// Cambiar el hash a mano (sin recargar) abre esa pista.
window.addEventListener('hashchange', () => {
  const route = routeFromHash();
  if (route) switchRoute(route);
});

buildGrid();
buildDurationOptions();
menuRenderer.start(MENU_BACKDROP);

// Una URL con `#ambiente/NN` entra directamente en esa pista.
const route = routeFromHash();
if (route) startSession(route.ambient, null, { track: route.track, gesture: false });
