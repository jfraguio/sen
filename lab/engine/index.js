/**
 * Motor de síntesis del laboratorio (`sen-synth/1`).
 *
 *   const plan = compile(project, { sampleRate: 48000 });
 *   const r = createRenderer(plan, { from: 0 });
 *   const { L, R } = r.render(12000);
 *   const { parts, stats } = await renderToWav(project, options, { onProgress, signal });
 *
 * Módulos ES puros, sin DOM ni Web Audio: funcionan igual en un Worker del
 * navegador y en Node ≥ 18. El mismo código produce la escucha en directo,
 * el WAV del navegador y el WAV de `scripts/render-lab.mjs`.
 */

import {
  ENGINE_VERSION, EXPORT_DEFAULTS, LIMITS, automationValue, canonicalProject, cloneValue, createElement, createProject,
  masterDefaults, trackParams,
} from './schema.js';
import { seedFrom } from './rng.js';
import { OnePole, Svf, clamp, dbToGain, fadeCurve, gainToDb, panGains } from './dsp.js';
import { Echo, Reverb, echoTail } from './space.js';
import { Limiter, LoudnessMeter, MasterEq, TruePeakMeter } from './master.js';
import { WavWriter } from './wav.js';
import { compileSustainElement } from './voices/sustain.js';
import { compileStrikeElement } from './voices/strike.js';
import { compileNoiseElement } from './voices/noise.js';
import { compileCigarra, compileGrillo } from './voices/nature/insects.js';
import { compilePajaro, compileRana } from './voices/nature/animals.js';
import { compileArroyo, compileGotas, compileLluvia, compileOlas } from './voices/nature/water.js';
import { compileCampanillas, compileFuego, compileViento } from './voices/nature/air.js';

export { ENGINE_VERSION };

/** Orden de dependencias de los módulos del motor (para el script autónomo). */
export const ENGINE_MODULES = [
  'rng.js', 'music.js', 'schema.js', 'dsp.js', 'space.js', 'master.js', 'wav.js',
  'voices/sustain.js', 'voices/strike.js', 'voices/noise.js', 'voices/nature/kit.js',
  'voices/nature/insects.js', 'voices/nature/animals.js', 'voices/nature/water.js', 'voices/nature/air.js',
  'index.js',
];

const NATURE_COMPILERS = {
  grillo: compileGrillo,
  cigarra: compileCigarra,
  pajaro: compilePajaro,
  rana: compileRana,
  gotas: compileGotas,
  lluvia: compileLluvia,
  arroyo: compileArroyo,
  olas: compileOlas,
  viento: compileViento,
  fuego: compileFuego,
  campanillas: compileCampanillas,
};

function elementCompiler(track) {
  if (track.family === 'sustain') return compileSustainElement;
  if (track.family === 'strike') return compileStrikeElement;
  if (track.family === 'noise') return compileNoiseElement;
  return NATURE_COMPILERS[track.instrument] || null;
}

/* ------------------------------------------------------------ compilación */

export function createCompileCache() {
  return new Map();
}

/** Tiempo del eco, sincronizado al tempo si procede. */
export function echoTime(echo, tempo) {
  const sync = echo?.sync || 'libre';
  if (sync === 'libre' || !tempo) return echo?.time ?? 0.5;
  const beat = 60 / tempo.bpm;
  const map = { '1/16': 0.25, '1/8': 0.5, '1/8.': 0.75, '1/4': 1, '1/4.': 1.5, '1/2': 2, 1: 4 };
  return clamp(beat * (map[sync] ?? 1), 0.02, 2);
}

function trackKey(track) {
  const { mix, name, color, collapsed, automation, ...rest } = track;
  return JSON.stringify(rest);
}

/** ¿Cubre el elemento todo el bucle sin fundidos? (voz permanente) */
function isPermanent(el, L) {
  if (!['tone', 'span'].includes(el.type)) return false;
  return el.start <= 0.0005 && el.start + el.length >= L - 0.0005 && !(el.fadeIn > 0) && !(el.fadeOut > 0);
}

function compileSpecs(project, track, opts) {
  const compiler = elementCompiler(track);
  const out = [];
  if (!compiler) return out;
  const L = project.duration;
  for (const el of track.elements) {
    const ctx = {
      a4: project.tuning?.a4 ?? 440,
      key: project.key,
      tempo: project.tempo,
      elementSeed: seedFrom(project.seed ?? 'sen', track.id, el.id, el.seed ?? 1),
      audition: !!opts.audition,
      eventBudget: LIMITS.events,
    };
    const specs = compiler(track, el, ctx);
    out.push({ el, specs, permanent: opts.loop && isPermanent(el, L) });
  }
  return out;
}

/**
 * Compila un proyecto a un plan de render: para cada pista, una lista de voces
 * ordenada con su inicio y fin en muestras.
 */
export function compile(project, { sampleRate = 48000, mode = 'preview', end = null, cache = null, audition = false } = {}) {
  const sr = sampleRate;
  const endMode = end || project.end?.mode || 'tail';
  const loop = endMode === 'loop';
  const L = project.duration;
  const Lf = Math.round(L * sr);
  const warnings = [];
  const ctxKey = JSON.stringify([project.seed, project.tuning, project.key, project.tempo, L, loop, audition]);

  // 1. Especificaciones de voces por elemento (independientes de fs).
  const specsByTrack = project.tracks.map((track) => {
    const key = `s|${ctxKey}|${trackKey(track)}`;
    let specs = cache?.get(key);
    if (!specs) {
      specs = compileSpecs(project, track, { loop, audition });
      cache?.set(key, specs);
    }
    return specs;
  });

  // 2. Ciclos de render en bucle: la cola más larga debe caber.
  let cycles = 1;
  if (loop && mode === 'export') {
    let overhang = 0;
    for (const list of specsByTrack) {
      for (const { el, specs, permanent } of list) {
        if (permanent) continue;
        for (const s of specs) overhang = Math.max(overhang, el.start + s.t + s.d - L);
      }
    }
    const m = project.master || masterDefaults();
    const tail = Math.max(overhang, (m.reverb?.decay ?? 4.5) * 1.3, echoTail(echoTime(m.echo, project.tempo), m.echo?.feedback ?? 0));
    cycles = clamp(1 + Math.ceil(tail / L), 2, 4);
  }

  // 3. Colocación en muestras.
  let events = 0;
  let lastEnd = 0;
  const tracks = project.tracks.map((track, ti) => {
    const list = specsByTrack[ti];
    const key = `p|${sr}|${mode}|${cycles}|${Lf}|${loop}`;
    let placed = list.placed?.get(key);
    if (!placed) {
      const voices = [];
      let trackEvents = 0;
      const copies = loop ? (mode === 'export' ? range(0, cycles) : [-1, 0, 1]) : [0];
      for (const { el, specs, permanent } of list) {
        for (const s of specs) {
          if (!s.bed) trackEvents++;
          if (permanent && s.bed) {
            const start = mode === 'export' ? 0 : -Lf;
            voices.push({ start, end: mode === 'export' ? (cycles + 1) * Lf : 2 * Lf, period: Lf, create: s.create, poly: false });
            continue;
          }
          const s0 = Math.round((el.start + s.t) * sr);
          const len = Math.max(1, Math.round(s.d * sr));
          for (const k of copies) {
            const start = s0 + k * Lf;
            if (start + len <= (mode === 'export' ? 0 : -Lf)) continue;
            voices.push({ start, end: start + len, period: 0, create: s.create, poly: !!s.poly });
          }
        }
      }
      voices.sort((a, b) => a.start - b.start);
      const p = track.family === 'nature' ? trackParams(track) : null;
      placed = {
        id: track.id,
        family: track.family,
        voices,
        events: trackEvents,
        distance: p ? clamp(p.distance ?? 0, 0, 1) : 0,
        lastEnd: voices.reduce((m, v) => Math.max(m, v.end), 0),
      };
      if (!list.placed) list.placed = new Map();
      list.placed.clear();
      list.placed.set(key, placed);
    }
    events += placed.events;
    lastEnd = Math.max(lastEnd, placed.lastEnd);
    return placed;
  });
  if (events > LIMITS.events) warnings.push(`El tema tiene ${events} eventos de simulación (máximo recomendado ${LIMITS.events}).`);

  const mix = new Map(project.tracks.map((t) => [t.id, t.mix]));
  const automation = new Map(project.tracks.filter((t) => t.automation && Object.keys(t.automation).length).map((t) => [t.id, t.automation]));
  return {
    sr, mode, endMode, loop, L, Lf, cycles, tracks, mix, automation, events, lastEnd, warnings,
    master: project.master || masterDefaults(),
    tempo: project.tempo,
    fadeOut: project.end?.fadeOut ?? 4,
  };
}

function range(a, b) {
  const out = [];
  for (let k = a; k <= b; k++) out.push(k);
  return out;
}

/* ------------------------------------------------------------ render */

const CHUNK = 256;

class TrackRuntime {
  constructor(ct, frame, sr) {
    this.id = ct.id;
    this.c = ct;
    this.sr = sr;
    this.L = new Float32Array(CHUNK);
    this.R = new Float32Array(CHUNK);
    this.active = [];
    const v = ct.voices;
    let lo = 0;
    let hi = v.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v[mid].start < frame) lo = mid + 1;
      else hi = mid;
    }
    this.next = lo;
    for (let k = 0; k < lo; k++) if (v[k].end > frame) this.active.push(this.spawn(v[k], frame));
    this.mix = null;
    this.state = null;
    this.fade = null;
    this.peak = 0;
    this.distance = ct.distance || 0;
    if (ct.family === 'nature' && this.distance > 0) {
      const d = this.distance;
      this.dl = new OnePole().set(20000 * (1 - d) * (1 - d) + 1200, sr);
      this.dr = new OnePole().set(20000 * (1 - d) * (1 - d) + 1200, sr);
      this.dg = dbToGain(-12 * d);
    }
  }
  spawn(v, frame) {
    return { v, rt: v.create(this.sr, Math.max(0, frame - v.start), v.period || 0) };
  }
  admit(frame, m) {
    const v = this.c.voices;
    while (this.next < v.length && v[this.next].start < frame + m) {
      const nv = v[this.next++];
      if (nv.end <= frame) continue;
      if (nv.poly) {
        let count = 0;
        let oldest = null;
        for (const a of this.active) {
          if (a.v.poly && !a.stopping) {
            count++;
            if (!oldest) oldest = a;
          }
        }
        if (count >= LIMITS.strikePerTrack && oldest) {
          oldest.stopping = true;
          oldest.rt.stop?.(Math.round(0.01 * this.sr));
        }
      }
      this.active.push(this.spawn(nv, frame));
    }
  }
  render(frame, m) {
    const { L, R } = this;
    L.fill(0, 0, m);
    R.fill(0, 0, m);
    const end = frame + m;
    let w = 0;
    for (let k = 0; k < this.active.length; k++) {
      const a = this.active[k];
      const s = Math.max(frame, a.v.start);
      const e = Math.min(end, a.v.end);
      if (e > s) a.rt.process(L, R, s - frame, e - s, s - a.v.start);
      if (a.v.end > end && !a.rt.done) this.active[w++] = a;
    }
    this.active.length = w;
    if (this.dl) {
      for (let i = 0; i < m; i++) {
        L[i] = this.dl.tick(L[i]) * this.dg;
        R[i] = this.dr.tick(R[i]) * this.dg;
      }
    }
  }
  /** Filtro de pista automatizado (paso bajo). */
  filter(m, cutoff) {
    if (!this.fl) {
      this.fl = new Svf(0);
      this.fr = new Svf(0);
    }
    this.fl.set(cutoff, 0.707, this.sr);
    this.fr.set(cutoff, 0.707, this.sr);
    const { L, R } = this;
    for (let i = 0; i < m; i++) {
      L[i] = this.fl.tick(L[i]);
      R[i] = this.fr.tick(R[i]);
    }
  }
  get idle() {
    return this.active.length === 0 && this.next >= this.c.voices.length;
  }
  get polyCount() {
    let n = 0;
    for (const a of this.active) if (a.v.poly && !a.stopping) n++;
    return n;
  }
}

class Renderer {
  constructor(plan, { from = 0, warmup = 0, limiter = true, meter = false } = {}) {
    const sr = plan.sr;
    this.sr = sr;
    this.plan = plan;
    let frame = Math.round(from * sr) - Math.round(warmup * sr);
    if (!(plan.loop && plan.mode === 'preview')) frame = Math.max(Math.min(0, Math.round(from * sr)), frame);
    this.frame = frame;
    this.runtimes = plan.tracks.map((ct) => new TrackRuntime(ct, frame, sr));
    this.fading = [];
    this.reverb = new Reverb(sr);
    this.echo = new Echo(sr);
    this.eq = new MasterEq(sr);
    this.limiter = limiter ? new Limiter(sr) : null;
    this.meter = meter ? new LoudnessMeter(sr, 2) : null;
    this.dryL = new Float32Array(CHUNK);
    this.dryR = new Float32Array(CHUNK);
    this.revL = new Float32Array(CHUNK);
    this.revR = new Float32Array(CHUNK);
    this.ecL = new Float32Array(CHUNK);
    this.ecR = new Float32Array(CHUNK);
    this.masterGain = null;
    this.peakL = 0;
    this.peakR = 0;
    this.applyMaster(plan);
    const warm = Math.round(from * sr) - frame;
    if (warm > 0) {
      const tl = new Float32Array(CHUNK);
      const tr = new Float32Array(CHUNK);
      let left = warm;
      while (left > 0) {
        const m = Math.min(CHUNK, left);
        this.processChunk(tl, tr, 0, m);
        left -= m;
      }
      this.readMeters();
    }
  }
  applyMaster(plan) {
    const m = plan.master;
    this.reverb.set({ ...m.reverb, decay: Math.min(LIMITS.reverbDecay, m.reverb?.decay ?? 4.5) });
    this.echo.set({ ...m.echo, time: echoTime(m.echo, plan.tempo) });
    this.eq.set(m.eq || {});
    this.limiter?.setCeiling(m.ceiling ?? -1);
    this.masterTarget = dbToGain(m.gain ?? 0);
    if (this.masterGain === null) this.masterGain = this.masterTarget;
  }
  /** Sustituye el plan en caliente: solo cambian las pistas modificadas. */
  update(plan, { crossfade = 0.03 } = {}) {
    const xf = Math.max(1, Math.round(crossfade * this.sr));
    const old = new Map(this.runtimes.map((r) => [r.id, r]));
    const next = [];
    for (const ct of plan.tracks) {
      const r = old.get(ct.id);
      if (r && r.c === ct) {
        next.push(r);
        old.delete(ct.id);
        continue;
      }
      const nr = new TrackRuntime(ct, this.frame, this.sr);
      nr.fade = { from: 0, to: 1, left: xf, total: xf };
      if (r) {
        nr.state = r.state ? { ...r.state } : null;
        r.fade = { from: r.fade ? r.fadeLevel() : 1, to: 0, left: xf, total: xf };
        r.lastMix = plan.mix.get(r.id) || r.lastMix;
        this.fading.push(r);
        old.delete(ct.id);
      }
      next.push(nr);
    }
    for (const r of old.values()) {
      r.fade = { from: 1, to: 0, left: xf, total: xf };
      this.fading.push(r);
    }
    this.runtimes = next;
    this.plan = plan;
    this.applyMaster(plan);
  }
  get idle() {
    return this.runtimes.every((r) => r.idle);
  }
  /** Renderiza `n` muestras en arrays nuevos. */
  render(n) {
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    this.renderInto(L, R, 0, n);
    return { L, R };
  }
  renderInto(L, R, off, n) {
    let done = 0;
    while (done < n) {
      const m = Math.min(CHUNK, n - done);
      this.processChunk(L, R, off + done, m);
      done += m;
    }
  }
  readMeters() {
    const tracks = {};
    for (const r of this.runtimes) {
      tracks[r.id] = r.peak;
      r.peak = 0;
    }
    const out = { tracks, peakL: this.peakL, peakR: this.peakR, short: this.meter ? this.meter.shortTerm() : null };
    this.peakL = 0;
    this.peakR = 0;
    return out;
  }
  processChunk(outL, outR, off, m) {
    const { dryL, dryR, revL, revR, ecL, ecR, sr } = this;
    dryL.fill(0, 0, m); dryR.fill(0, 0, m);
    revL.fill(0, 0, m); revR.fill(0, 0, m);
    ecL.fill(0, 0, m); ecR.fill(0, 0, m);
    const frame = this.frame;
    const mixes = this.plan.mix;
    let anySolo = false;
    for (const r of this.runtimes) if (mixes.get(r.id)?.solo) anySolo = true;
    // Admisión y límite global de golpes.
    for (const r of this.runtimes) r.admit(frame, m);
    let poly = 0;
    for (const r of this.runtimes) poly += r.polyCount;
    while (poly > LIMITS.strikeTotal) {
      let best = null;
      for (const r of this.runtimes) {
        for (const a of r.active) if (a.v.poly && !a.stopping && (!best || a.v.start < best.v.start)) best = a;
      }
      if (!best) break;
      best.stopping = true;
      best.rt.stop?.(Math.round(0.01 * sr));
      poly--;
    }
    for (const r of this.fading) r.admit(frame, m);
    const k = 1 - Math.exp(-m / (0.015 * sr));
    const all = this.fading.length ? [...this.runtimes, ...this.fading] : this.runtimes;
    const P = this.plan;
    const tNow = (P.loop ? (((frame % P.Lf) + P.Lf) % P.Lf) : frame) / sr;
    for (const r of all) {
      r.render(frame, m);
      const mix = mixes.get(r.id) || r.lastMix || { gain: -6, pan: 0, reverb: 0, echo: 0 };
      r.lastMix = mix;
      const auto = P.automation?.get(r.id) || (mixes.has(r.id) ? null : r.lastAuto) || null;
      r.lastAuto = auto;
      const av = (key, base, log = false) => (auto?.[key] ? automationValue(auto[key], tNow, log) : base);
      const cutoff = av('cutoff', null, true);
      if (cutoff !== null && cutoff < 19500) r.filter(m, cutoff);
      const on = !mix.mute && (!anySolo || mix.solo);
      const g = on ? dbToGain(av('gain', mix.gain ?? -6)) : 0;
      const [pl, pr] = panGains(av('pan', mix.pan ?? 0));
      const rv = clamp(av('reverb', mix.reverb ?? 0) + r.distance * 0.35, 0, 1);
      const target = { l: g * pl, r: g * pr, rv, ec: av('echo', mix.echo ?? 0) };
      const st = r.state || { ...target };
      const nx = {
        l: st.l + (target.l - st.l) * k,
        r: st.r + (target.r - st.r) * k,
        rv: st.rv + (target.rv - st.rv) * k,
        ec: st.ec + (target.ec - st.ec) * k,
      };
      r.state = nx;
      const L = r.L;
      const R = r.R;
      let pk = r.peak;
      const fd = r.fade;
      for (let i = 0; i < m; i++) {
        const u = i / m;
        let gl = st.l + (nx.l - st.l) * u;
        let gr = st.r + (nx.r - st.r) * u;
        if (fd) {
          const f = fd.from + (fd.to - fd.from) * (1 - fd.left / fd.total);
          gl *= f;
          gr *= f;
          if (fd.left > 0) fd.left--;
        }
        const l = L[i] * gl;
        const rr = R[i] * gr;
        dryL[i] += l;
        dryR[i] += rr;
        const sv = st.rv + (nx.rv - st.rv) * u;
        const se = st.ec + (nx.ec - st.ec) * u;
        if (sv > 0) {
          revL[i] += l * sv;
          revR[i] += rr * sv;
        }
        if (se > 0) {
          ecL[i] += l * se;
          ecR[i] += rr * se;
        }
        const a = Math.max(Math.abs(l), Math.abs(rr));
        if (a > pk) pk = a;
      }
      r.peak = pk;
      if (fd && fd.left <= 0) r.fade = fd.to === 1 ? null : fd;
    }
    this.fading = this.fading.filter((r) => !(r.fade && r.fade.left <= 0 && r.fade.to === 0));
    this.reverb.process(revL, revR, dryL, dryR, m);
    this.echo.process(ecL, ecR, dryL, dryR, m);
    this.eq.process(dryL, dryR, m);
    const g0 = this.masterGain;
    const g1 = g0 + (this.masterTarget - g0) * k;
    this.masterGain = g1;
    for (let i = 0; i < m; i++) {
      const g = g0 + ((g1 - g0) * i) / m;
      dryL[i] *= g;
      dryR[i] *= g;
    }
    if (this.limiter) this.limiter.process(dryL, dryR, m);
    let pl = this.peakL;
    let pr = this.peakR;
    for (let i = 0; i < m; i++) {
      outL[off + i] = dryL[i];
      outR[off + i] = dryR[i];
      const al = Math.abs(dryL[i]);
      const ar = Math.abs(dryR[i]);
      if (al > pl) pl = al;
      if (ar > pr) pr = ar;
    }
    this.peakL = pl;
    this.peakR = pr;
    if (this.meter) this.meter.push(dryL, dryR, m);
    this.frame += m;
  }
}

TrackRuntime.prototype.fadeLevel = function fadeLevel() {
  const fd = this.fade;
  return fd ? fd.from + (fd.to - fd.from) * (1 - fd.left / fd.total) : 1;
};

export function createRenderer(plan, opts = {}) {
  return new Renderer(plan, opts);
}

/* ------------------------------------------------------------ audición */

/** Proyecto mínimo para escuchar un instrumento unos segundos. */
export function auditionProject(project, track, { note = null, seconds = 3 } = {}) {
  const base = createProject({
    name: 'audición',
    seed: 'audicion',
    duration: 10,
    key: cloneValue(project?.key || { root: 'C', scale: 'mayor' }),
    tuning: cloneValue(project?.tuning || { a4: 440 }),
    master: cloneValue(project?.master || masterDefaults()),
  });
  const t = cloneValue(track);
  t.id = 'audicion';
  t.mix = { ...(t.mix || {}), mute: false, solo: false, pan: 0, gain: t.mix?.gain ?? -6 };
  let el;
  if (t.family === 'sustain') {
    el = createElement(t, base, 0.02, 'tone');
    el.length = seconds;
    el.fadeIn = 0.25;
    el.fadeOut = 0.9;
    if (note) el.notes = [note];
  } else if (t.family === 'strike') {
    if (note) {
      el = createElement(t, base, 0.02, 'hit');
      el.note = note;
    } else {
      el = createElement(t, base, 0.02, 'phrase');
      el.length = Math.min(seconds, 2.6);
      el.pattern = 4;
      el.events = el.events.map((ev, k) => ({ ...ev, t: k * 0.55 }));
    }
  } else {
    el = createElement(t, base, 0.02, 'span');
    el.length = seconds;
    el.fadeIn = t.family === 'nature' ? 0.02 : 0.2;
    el.fadeOut = 0.6;
    el.density = 1;
  }
  el.id = 'audicion';
  t.elements = [el];
  base.tracks = [t];
  return base;
}

/* ------------------------------------------------------------ exportación */

/** Opciones de exportación efectivas (proyecto + preajuste + overrides). */
export function resolveExportOptions(project, options = {}) {
  const o = { ...EXPORT_DEFAULTS, ...(project.export || {}), ...options };
  o.sampleRate = [22050, 44100, 48000].includes(o.sampleRate) ? o.sampleRate : 48000;
  o.bits = [16, 24, 32].includes(o.bits) ? o.bits : 24;
  o.channels = o.channels === 1 ? 1 : 2;
  o.end = ['tail', 'cut', 'loop'].includes(o.end) ? o.end : project.end?.mode || 'tail';
  o.loudness = o.loudness === null || o.loudness === undefined ? null : clamp(Number(o.loudness), -40, -6);
  o.ceiling = clamp(Number.isFinite(o.ceiling) ? o.ceiling : -1, -6, -0.1);
  o.range = o.range === 'region' && project.region ? 'region' : 'all';
  return o;
}

/** Proyecto recortado a la región (para exportar la región en bucle). */
function regionProject(project) {
  const { start: a, end: b } = project.region;
  const p = cloneValue(project);
  p.duration = Math.max(1, b - a);
  for (const t of p.tracks) {
    if (t.automation) {
      for (const key of Object.keys(t.automation)) {
        const pts = t.automation[key];
        const shifted = pts.map(([tt, v]) => [tt - a, v]).filter(([tt]) => tt >= 0 && tt <= b - a);
        const v0 = automationValue(pts, a, key === 'cutoff');
        t.automation[key] = [[0, v0], ...shifted.filter(([tt]) => tt > 0)];
      }
    }
    t.elements = t.elements.filter((e) => {
      const len = e.type === 'hit' ? 0.001 : e.length;
      return e.start < b && e.start + len > a;
    }).map((e) => {
      if (e.start >= a) return { ...e, start: e.start - a };
      const cut = a - e.start;
      return { ...e, start: 0, length: e.length - cut, fadeIn: 0, fadeOut: Math.min(e.fadeOut || 0, e.length - cut) };
    });
  }
  p.region = null;
  return p;
}

const sleep = () => new Promise((r) => setTimeout(r, 0));

/**
 * Exporta el proyecto a WAV en streaming. Devuelve `{ parts, stats }`, donde
 * `parts` son los trozos del archivo (cabecera primero).
 */
export async function renderToWav(project, options = {}, { onProgress = null, signal = null } = {}) {
  const opts = resolveExportOptions(project, options);
  const sr = opts.sampleRate;
  const regionLoop = opts.range === 'region' && opts.end === 'loop';
  const source = regionLoop ? regionProject(project) : project;
  const plan = compile(source, { sampleRate: sr, mode: 'export', end: opts.end });
  const Lf = plan.Lf;
  const fadeFrames = Math.round(clamp(plan.fadeOut, 0, 30) * sr);
  const latencyProbe = new Limiter(sr, { truePeak: true });
  const la = latencyProbe.latency;

  // Ventana de exportación en el tiempo del render.
  let winStart = 0;
  let winLen = Lf;
  let renderFrom = 0;
  if (opts.end === 'loop') {
    winStart = (plan.cycles - 1) * Lf;
  } else if (opts.range === 'region') {
    const a = Math.round(project.region.start * sr);
    winStart = a;
    winLen = Math.round((project.region.end - project.region.start) * sr);
    renderFrom = Math.max(0, a - Math.round(20 * sr));
  }
  const tailMax = Math.round(20 * sr);
  const silence = 3.2e-5;
  const BLOCK = 4096;
  const bufL = new Float32Array(BLOCK);
  const bufR = new Float32Array(BLOCK);
  const mono = new Float32Array(BLOCK);

  const twoPass = opts.loudness !== null;
  const totalWork = (winLen + (opts.end === 'loop' ? winStart : winStart - renderFrom)) * (twoPass ? 2 : 1);
  let work = 0;
  let lastYield = Date.now();

  /** Una pasada completa. `onBlock(L, R, n, absFrame, isWindowEnd)` */
  const pass = async (onBlock, { limiter = null } = {}) => {
    const r = createRenderer(plan, { from: renderFrom / sr, limiter: false });
    let frame = renderFrom;
    let end = opts.end === 'tail' ? winStart + winLen + tailMax : winStart + winLen;
    let silent = 0;
    let finished = false;
    let flush = 0;
    const loopMode = opts.end === 'loop';
    while (!finished) {
      const m = Math.min(BLOCK, Math.max(1, end + (limiter ? la : 0) - frame));
      // En bucle, lo que sigue al final es el principio del ciclo siguiente.
      if (loopMode || frame < end) {
        r.renderInto(bufL, bufR, 0, m);
      } else {
        bufL.fill(0, 0, m);
        bufR.fill(0, 0, m);
      }
      // Fundidos de final.
      for (let i = 0; i < m; i++) {
        const f = frame + i;
        let g = 1;
        if (!loopMode && f >= end) g = 0;
        else if (opts.end === 'cut' && fadeFrames > 0 && f >= winStart + winLen - fadeFrames) g = fadeCurve((winStart + winLen - f) / fadeFrames);
        if (g !== 1) {
          bufL[i] *= g;
          bufR[i] *= g;
        }
      }
      // Fin de la cola: silencio sostenido tras la duración.
      if (opts.end === 'tail' && frame >= winStart + winLen && frame < end) {
        let pk = 0;
        for (let i = 0; i < m; i++) pk = Math.max(pk, Math.abs(bufL[i]), Math.abs(bufR[i]));
        silent = pk < silence && r.idle ? silent + m : 0;
        if (silent >= Math.round(0.25 * sr)) end = frame + m;
      }
      await onBlock(bufL, bufR, m, frame);
      frame += m;
      if (frame >= end) {
        if (!limiter) finished = true;
        else {
          flush += m;
          if (frame >= end + la) finished = true;
        }
      }
      work += m;
      if (Date.now() - lastYield > 40) {
        lastYield = Date.now();
        onProgress?.(Math.min(0.999, work / Math.max(1, totalWork)));
        await sleep();
        if (signal?.aborted) {
          const err = new Error('Exportación cancelada');
          err.name = 'AbortError';
          throw err;
        }
      }
    }
    return end;
  };

  // Pasada 1: medida.
  let measured = null;
  let gain = 1;
  if (twoPass) {
    const meter = new LoudnessMeter(sr, opts.channels);
    await pass((L, R, n, frame) => {
      const a = Math.max(0, winStart - frame);
      if (a >= n) return;
      if (opts.channels === 1) {
        for (let i = a; i < n; i++) mono[i] = (L[i] + R[i]) * 0.5;
        meter.push(mono, mono, n - a, a);
      } else meter.push(L, R, n - a, a);
    });
    measured = meter.integrated();
    if (Number.isFinite(measured)) gain = dbToGain(opts.loudness - measured);
  }

  // Pasada 2: escritura.
  const writer = new WavWriter({ sampleRate: sr, channels: opts.channels, bits: opts.bits });
  const limiter = new Limiter(sr, { truePeak: true });
  limiter.setCeiling(opts.ceiling);
  const finalMeter = new LoudnessMeter(sr, opts.channels);
  const tpL = new TruePeakMeter();
  const tpR = new TruePeakMeter();
  let endFrame = winStart + winLen;
  endFrame = await pass((L, R, n, frame) => {
    if (gain !== 1) {
      for (let i = 0; i < n; i++) {
        L[i] *= gain;
        R[i] *= gain;
      }
    }
    limiter.process(L, R, n);
    // La salida del limitador va retrasada `la` muestras.
    const outStart = frame - la;
    const a = Math.max(0, winStart - outStart);
    if (a >= n) return;
    const b = n;
    writer.write(L, R, b - a, a);
    if (opts.channels === 1) {
      for (let i = a; i < b; i++) mono[i] = (L[i] + R[i]) * 0.5;
      finalMeter.push(mono, mono, b - a, a);
      tpL.push(mono, a, b);
    } else {
      finalMeter.push(L, R, b - a, a);
      tpL.push(L, a, b);
      tpR.push(R, a, b);
    }
  }, { limiter });
  // Recorta lo escrito de más tras el final (latencia del limitador).
  const frames = Math.min(writer.frames, endFrame - winStart);
  writer.frames = frames;
  writer.dataBytes = frames * writer.frameBytes;
  trimWriter(writer);

  const used = { ...opts };
  const senp = JSON.stringify(canonicalProject({ ...project, engine: ENGINE_VERSION, export: { sampleRate: used.sampleRate, bits: used.bits, channels: used.channels, end: options.end ?? project.export?.end ?? null, loudness: used.loudness, ceiling: used.ceiling, range: used.range } }));
  const parts = writer.finish({
    info: { INAM: project.name, ISFT: `sen lab · ${ENGINE_VERSION}`, ICMT: project.notes || '' },
    senp,
  });
  onProgress?.(1);
  const lufs = finalMeter.integrated();
  return {
    parts,
    stats: {
      lufs,
      measured,
      gain: gainToDb(gain),
      peak: gainToDb(finalMeter.peak),
      truePeak: gainToDb(Math.max(tpL.peak, tpR.peak)),
      reduction: -gainToDb(limiter.minGain),
      duration: frames / sr,
      frames,
      sampleRate: sr,
      channels: opts.channels,
      bits: opts.bits,
      end: opts.end,
      cycles: plan.cycles,
      warnings: plan.warnings,
    },
  };
}

/** Ajusta los trozos de un `WavWriter` a `writer.dataBytes`. */
function trimWriter(writer) {
  writer.flushChunk();
  let keep = writer.dataBytes;
  const parts = [];
  for (const p of writer.parts) {
    if (keep <= 0) break;
    if (p.length <= keep) {
      parts.push(p);
      keep -= p.length;
    } else {
      parts.push(p.subarray(0, keep));
      keep = 0;
    }
  }
  writer.parts = parts;
  writer.pos = 0;
}

/** Nombre de archivo a partir del nombre del tema. */
export function slugify(name) {
  return (name || 'tema')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tema';
}
