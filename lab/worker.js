/**
 * Worker de escucha: compila el proyecto y renderiza bloques por delante del
 * cabezal. Los bloques van directos al AudioWorklet por un MessageChannel.
 */

import { auditionProject, compile, createCompileCache, createRenderer } from './engine/index.js';
import { fadeCurve } from './engine/dsp.js';

const BLOCK = 0.05; // s por bloque
const AHEAD = 0.25; // s en cola como objetivo
const XFADE = 0.03; // s de fundido cruzado en saltos de bucle

let ctxRate = 48000;
let rate = 48000;
let port = null;
let project = null;
let plan = null;
let cache = createCompileCache();
let renderer = null;
let playing = false;
let gen = 0;
let queued = 0;
let time = 0;
let loop = null;
let blockId = 0;
let load = 0;
let slowFor = 0;
let lowQuality = false;
let lastStatus = 0;
let tailQuiet = 0;
let samples = {};

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

function warmup() {
  const decay = project?.master?.reverb?.decay ?? 4.5;
  return Math.min(4, Math.max(2, decay * 0.5));
}

function recompile() {
  if (!project) return;
  if (cache.size > 600) cache = createCompileCache();
  plan = compile(project, { sampleRate: rate, mode: 'preview', cache, samples });
  if (renderer) renderer.update(plan);
  post({ type: 'compiled', warnings: plan.warnings, events: plan.events });
}

function start(from) {
  renderer = createRenderer(plan, { from, warmup: warmup(), meter: true });
  time = from;
  tailQuiet = 0;
}

function loopEnd() {
  if (loop) return loop.end;
  if (project.end?.mode === 'loop') return project.duration;
  return null;
}

/** En «Duración exacta», los últimos segundos se funden como en la exportación. */
function endFade(L, R, t) {
  if (loop || project.end?.mode !== 'cut') return;
  const fade = project.end.fadeOut ?? 0;
  const dur = project.duration;
  const n = L.length;
  if (fade <= 0 || t + n / rate < dur - fade) return;
  for (let i = 0; i < n; i++) {
    const left = dur - (t + i / rate);
    const g = left <= 0 ? 0 : left >= fade ? 1 : fadeCurve(left / fade);
    L[i] *= g;
    R[i] *= g;
  }
}

function send(L, R, t, meters) {
  endFade(L, R, t);
  const id = ++blockId;
  // La longitud hay que leerla antes de transferir los búferes: al transferir,
  // los arrays quedan desacoplados y `length` pasa a 0. Si se cuenta después,
  // `queued` nunca sube y el worker renderiza sin límite por delante del
  // cabezal (los cambios de mezcla tardaban en oírse).
  const seconds = L.length / rate;
  port.postMessage({ type: 'block', gen, id, time: t, rate, L, R, meters }, [L.buffer, R.buffer]);
  queued += seconds;
}

function produce() {
  const n = Math.max(64, Math.round(BLOCK * rate));
  const t0 = performance.now();
  const le = loopEnd();
  const dur = project.duration;
  if (le !== null && time + n / rate >= le) {
    const m = Math.max(0, Math.round((le - time) * rate));
    if (m > 0) {
      const a = renderer.render(m);
      send(a.L, a.R, time, renderer.readMeters());
    }
    const xf = Math.round(XFADE * rate);
    const tail = renderer.render(xf);
    const ls = loop ? loop.start : 0;
    start(ls);
    const head = renderer.render(n);
    for (let i = 0; i < xf; i++) {
      const w = i / xf;
      head.L[i] = head.L[i] * w + tail.L[i] * (1 - w);
      head.R[i] = head.R[i] * w + tail.R[i] * (1 - w);
    }
    send(head.L, head.R, ls, renderer.readMeters());
    time = ls + n / rate;
  } else {
    const out = renderer.render(n);
    const meters = renderer.readMeters();
    send(out.L, out.R, time, meters);
    time += n / rate;
    // Fin: en «cut» se corta con un fundido corto; en «tail» se deja sonar la cola.
    if (le === null && time >= dur) {
      const quiet = Math.max(meters.peakL, meters.peakR) < 1e-4 && renderer.idle;
      tailQuiet = quiet ? tailQuiet + n / rate : 0;
      const mode = project.end?.mode;
      if (mode !== 'tail' || tailQuiet >= 0.3 || time >= dur + 20) {
        playing = false;
        port.postMessage({ type: 'end', gen });
      }
    }
  }
  const spent = performance.now() - t0;
  const ratio = spent / ((n / rate) * 1000);
  load = load * 0.9 + ratio * 0.1;
  if (!lowQuality && load > 1 / 1.5) {
    slowFor += n / rate;
    if (slowFor >= 3) {
      lowQuality = true;
      rate = Math.round(ctxRate / 2);
      cache = createCompileCache();
      plan = compile(project, { sampleRate: rate, mode: 'preview', cache, samples });
      start(time);
    }
  } else slowFor = 0;
  const now = performance.now();
  if (now - lastStatus > 500) {
    lastStatus = now;
    post({ type: 'status', load, quality: lowQuality ? 'low' : 'high' });
  }
}

function pump() {
  if (!playing || !renderer || !port) return;
  let guard = 0;
  while (playing && queued < AHEAD && guard++ < 20) produce();
}

function flush(stop = false) {
  gen++;
  queued = 0;
  port?.postMessage({ type: 'flush', gen, stop });
}

function onPlayer(e) {
  const m = e.data;
  if (m.type === 'played' && m.gen === gen) {
    queued = Math.max(0, queued - m.seconds);
    pump();
  }
}

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      ctxRate = m.sampleRate;
      rate = m.sampleRate;
      port = m.port;
      port.onmessage = onPlayer;
      if (project) recompile();
    } else if (m.type === 'project') {
      project = m.project;
      if (port) recompile();
    } else if (m.type === 'samples') {
      samples = { ...samples, ...m.samples };
      if (project && port) recompile();
    } else if (m.type === 'play') {
      // Cada reproducción vuelve a intentar la calidad completa.
      if (lowQuality) {
        lowQuality = false;
        rate = ctxRate;
        slowFor = 0;
        load = 0;
        cache = createCompileCache();
        plan = null;
        renderer = null;
      }
      if (!plan) recompile();
      loop = m.loop || null;
      flush();
      start(m.from || 0);
      playing = true;
      pump();
    } else if (m.type === 'pause') {
      playing = false;
      renderer = null;
      flush(true);
    } else if (m.type === 'seek') {
      if (playing) {
        flush();
        start(m.time);
        pump();
      }
    } else if (m.type === 'loop') {
      loop = m.loop || null;
    } else if (m.type === 'audition') {
      const aud = auditionProject(m.project, m.track, { note: m.note, seconds: m.seconds });
      const p = compile(aud, { sampleRate: ctxRate, mode: 'preview', end: 'tail', audition: true, samples });
      const r = createRenderer(p, { limiter: true });
      const out = r.render(Math.round((m.seconds + (m.track.family === 'strike' ? 1.5 : 0.6)) * ctxRate));
      post({ type: 'audition', id: m.id, L: out.L, R: out.R, rate: ctxRate }, [out.L.buffer, out.R.buffer]);
    }
  } catch (err) {
    post({ type: 'error', message: err?.message || String(err) });
  }
};
