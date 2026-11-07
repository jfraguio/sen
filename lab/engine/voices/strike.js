/**
 * Notas puntuales: campana, cuenco tibetano, kalimba, caja de música,
 * celesta, marimba, vibráfono, piano de fieltro, handpan, tambor de
 * lengüeta, steel drum, arpa,
 * guitarra de nailon, ukelele y slide hawaiana (síntesis modal, con cuerpo de
 * madera en las cuerdas y deslizamiento de tono en la slide), cuerda pulsada
 * (Karplus-Strong), gota tonal (burbuja de Minnaert afinada), palo de lluvia
 * (granos que caen por un tubo) y los FM de estética ochentera (piano y
 * campana).
 *
 * Los elementos `hit`, `phrase` y `cloud` se planifican como golpes; cada
 * golpe es una voz con su propio decaimiento.
 */

import {
  CONTROL_STEP, Control, OnePole, Svf, clamp, dbToGain, elementGainAt, fadeCurve, panGains, sineCycle,
} from '../dsp.js';
import { degreeWeight, noteFrequency, noteToMidi, scaleMidis, midiFrequency } from '../music.js';
import { createRng, noiseAt, subSeed } from '../rng.js';
import { curveFunction, trackParams } from '../schema.js';

/** Amplitudes `sen(π·h·p)/h` de una cuerda pulsada en el punto `p` (normalizadas a h=1). */
function plucked(p, decays) {
  const a1 = Math.sin(Math.PI * p);
  return decays.map((ts, k) => [k + 1, Math.abs(Math.sin(Math.PI * (k + 1) * p)) / (k + 1) / a1, ts]);
}

/** Modos `[relación, amplitud, escala de decaimiento]` por instrumento. */
export const MODAL_SETS = {
  campana: [[0.5, 0.32, 1.5], [1, 1, 1], [1.2, 0.42, 0.62], [1.5, 0.28, 0.5], [2, 0.55, 0.42], [2.52, 0.18, 0.3], [3.01, 0.22, 0.24], [4.07, 0.1, 0.18], [5.33, 0.05, 0.13]],
  // Cuenco tibetano (himalayo): parciales inarmónicos medidos en cuencos de
  // bronce; cada uno se desdobla en un par que bate (ver `doublet`).
  cuenco: [[1, 1, 1], [2.72, 0.55, 0.6], [5.18, 0.24, 0.36], [8.48, 0.1, 0.2], [12.4, 0.04, 0.12]],
  kalimba: [[1, 1, 1], [2.01, 0.06, 0.4], [5.4, 0.16, 0.05], [0.5, 0.04, 0.08]],
  cajaMusica: [[1, 1, 1], [2, 0.1, 0.45], [3, 0.04, 0.3], [5.93, 0.12, 0.05], [9.4, 0.04, 0.03]],
  celesta: [[1, 1, 1], [2, 0.22, 0.5], [3, 0.06, 0.3], [4.01, 0.08, 0.25]],
  marimba: [[1, 1, 1], [3.93, 0.22, 0.2], [9.2, 0.05, 0.08]],
  vibrafono: [[1, 1, 1], [4, 0.16, 0.3], [10, 0.04, 0.1]],
  // Piano de fieltro: cada armónico con una parte que se apaga pronto (golpe) y otra larga.
  piano: [[1, 0.75, 1], [1, 0.3, 0.12], [2, 0.3, 0.62], [2, 0.1, 0.1], [3, 0.17, 0.45], [4, 0.09, 0.36], [5, 0.06, 0.3], [6, 0.035, 0.25], [7, 0.02, 0.2]],
  // Handpan: cada campo se afina con su octava y su quinta compuesta (3f).
  handpan: [[1, 1, 1], [2, 0.5, 0.72], [3, 0.24, 0.48], [4.02, 0.06, 0.3], [5.1, 0.025, 0.2]],
  // Tambor de lengüeta: nota casi pura, con una octava y un parcial alto débiles.
  lengueta: [[1, 1, 1], [2, 0.08, 0.55], [4.1, 0.07, 0.3], [6.6, 0.025, 0.15]],
  // Steel drum: armónicos afinados hasta el sexto, brillantes y más cortos.
  steelpan: [[1, 1, 1], [2, 0.85, 0.66], [3, 0.45, 0.46], [4, 0.3, 0.36], [5, 0.12, 0.27], [6, 0.08, 0.21]],
  // Cuerdas pulsadas modales: amplitud sen(π·h·p)/h según el punto de pulsación p.
  arpa: [[1, 1, 1], [2, 0.81, 0.74], [3, 0.54, 0.54], [4, 0.25, 0.41], [6, 0.17, 0.26], [7, 0.23, 0.22], [8, 0.2, 0.19], [9, 0.11, 0.16]],
  guitarra: [[1, 1, 1], [2, 0.9, 0.67], [3, 0.75, 0.45], [4, 0.57, 0.33], [5, 0.36, 0.25], [6, 0.19, 0.2], [8, 0.07, 0.13]],
  ukelele: plucked(0.22, [1, 0.68, 0.48, 0.37, 0.3, 0.24, 0.2, 0.17]),
  // Cuerdas de acero de la guitarra hawaiana: más armónicos y más largos.
  slide: plucked(0.18, [1, 0.78, 0.6, 0.48, 0.4, 0.34, 0.29, 0.25, 0.22]),
  metal: [[1, 1, 1], [2.76, 0.45, 0.47], [5.4, 0.2, 0.24], [8.93, 0.06, 0.1]],
  bambu: [[1, 1, 1], [2.6, 0.32, 0.4], [4.9, 0.08, 0.2]],
  vidrio: [[1, 1, 1], [2.32, 0.3, 0.5], [4.25, 0.15, 0.3], [6.63, 0.05, 0.2]],
};

/**
 * Resonancias del cuerpo `[Hz, amplitud, segundos]`: no siguen a la nota y se
 * apagan pronto; dan el «toc» de la caja de madera al pulsar.
 */
const BODIES = {
  guitarra: [[98, 0.12, 0.07], [204, 0.1, 0.05], [392, 0.05, 0.035]],
  arpa: [[150, 0.06, 0.09], [340, 0.04, 0.05]],
  ukelele: [[285, 0.12, 0.04], [540, 0.07, 0.03], [910, 0.03, 0.02]],
  slide: [[118, 0.06, 0.08], [255, 0.05, 0.05]],
  handpan: [[90, 0.05, 0.12]],
  lengueta: [[95, 0.07, 0.18]],
};

/** Instrumentos cuyos modos son pares que baten de verdad (y giran en estéreo). */
const DOUBLETS = new Set(['cuenco', 'handpan', 'lengueta', 'steelpan']);

const STRIKE_GAIN = {
  campana: 1, cuenco: 1.15, kalimba: 1.3, cajaMusica: 1.5, celesta: 1.2, marimba: 1.8, vibrafono: 1, piano: 1.1, arpa: 0.9, guitarra: 1,
  ukelele: 1.05, slide: 0.95, handpan: 1.1, lengueta: 1.05, steelpan: 1.15, pulsada: 3.2, gotaTonal: 2, paloLluvia: 1, fmPiano: 1.1, fmBell: 1.15,
};
const ATTACKS = {
  kalimba: 0.003, celesta: 0.004, cuenco: 0.006, marimba: 0.0015, vibrafono: 0.003, piano: 0.005, arpa: 0.002, guitarra: 0.002,
  ukelele: 0.0015, slide: 0.003, handpan: 0.005, lengueta: 0.006, steelpan: 0.0015,
};
const TAIL_DB = 8.06; // ln(10^(70/20)): de 0 a −70 dB

/* ------------------------------------------------------------ planificación */

/** Golpes de un elemento: `{ t, freq, vel, gain }` con `t` relativo al elemento. */
export function planStrikeHits(track, el, ctx) {
  const a4 = ctx.a4;
  if (el.type === 'hit') {
    return [{ t: 0, freq: noteFrequency(el.note, a4), vel: el.velocity ?? 0.7, gain: dbToGain(el.level || 0) }];
  }
  if (el.type === 'phrase') {
    const hits = [];
    const events = [...(el.events || [])].sort((a, b) => a.t - b.t);
    const pattern = Math.max(0.25, el.pattern || 4);
    if (!events.length) return hits;
    for (let r = 0; r * pattern < el.length; r++) {
      for (const ev of events) {
        const t = r * pattern + ev.t;
        if (t >= el.length) break;
        hits.push({ t, freq: noteFrequency(ev.note, a4), vel: ev.v ?? 0.6, gain: elementGainAt(el, t) });
      }
    }
    return hits;
  }
  if (el.type === 'cloud') {
    return el.mode === 'mine' || (el.mode === undefined && Array.isArray(el.events))
      ? planCloudEvents(el, ctx)
      : planCloud(el, ctx);
  }
  return [];
}

/** Nube con notas propias: cada entrada suena en su tiempo, sin bucle. */
function planCloudEvents(el, ctx) {
  const a4 = ctx.a4;
  return (Array.isArray(el.events) ? el.events : [])
    .filter((ev) => ev && Number.isFinite(ev.t) && ev.t >= 0 && ev.t < el.length && ev.note)
    .sort((a, b) => a.t - b.t)
    .map((ev) => ({
      t: ev.t,
      freq: noteFrequency(ev.note, a4),
      vel: ev.v ?? 0.7,
      gain: elementGainAt(el, ev.t),
    }));
}

function planCloud(el, ctx) {
  const rng = createRng(ctx.elementSeed);
  const key = ctx.key;
  let pool;
  if (el.pitches && el.pitches.length) {
    pool = el.pitches.map((n) => ({ freq: noteFrequency(n, ctx.a4), w: 1 + (el.gravity || 0) * 2 * degreeWeight(key.root, noteToMidi(n) ?? 0) }));
  } else {
    const lo = noteToMidi(el.range?.[0]) ?? 60;
    const hi = noteToMidi(el.range?.[1]) ?? 84;
    const midis = scaleMidis(key.root, key.scale, Math.min(lo, hi), Math.max(lo, hi));
    if (!midis.length) midis.push(Math.min(lo, hi));
    pool = midis.map((m) => ({ freq: midiFrequency(m, ctx.a4), w: 1 + (el.gravity || 0) * 2 * degreeWeight(key.root, m) }));
  }
  pool.sort((a, b) => a.freq - b.freq);
  const total = pool.reduce((s, x) => s + x.w, 0);
  const weighted = () => {
    let u = rng.next() * total;
    for (let k = 0; k < pool.length; k++) {
      u -= pool[k].w;
      if (u <= 0) return k;
    }
    return pool.length - 1;
  };
  const curve = curveFunction(el.curve);
  const mean = 60 / clamp(el.density || 8, 1, 120);
  const timing = clamp(el.timing ?? 0.6, 0, 1);
  const [vLo, vHi] = el.velocity || [0.35, 0.8];
  const levelGain = dbToGain(el.level || 0);
  const fadeAt = (t) => {
    let g = 1;
    if (el.fadeIn > 0 && t < el.fadeIn) g *= fadeCurve(t / el.fadeIn);
    if (el.fadeOut > 0 && t > el.length - el.fadeOut) g *= fadeCurve((el.length - t) / el.fadeOut);
    return g;
  };
  const hits = [];
  let idx = weighted();
  let t = ctx.audition ? 0.05 : timing * rng.range(0, mean);
  const limit = ctx.eventBudget ?? 200000;
  while (t < el.length && hits.length < limit) {
    const c = curve(clamp(t / el.length, 0, 1));
    if (rng.next() < c) {
      if (rng.next() < (el.motion ?? 0.5)) {
        const step = rng.pick([-2, -1, -1, 1, 1, 2]);
        idx += step;
        if (idx < 0) idx = -idx;
        if (idx >= pool.length) idx = Math.max(0, 2 * (pool.length - 1) - idx);
        idx = clamp(idx, 0, pool.length - 1);
      } else idx = weighted();
      const gain = levelGain * fadeAt(t) * (0.6 + 0.4 * c);
      const vel = rng.range(vLo, vHi);
      hits.push({ t, freq: pool[idx].freq, vel, gain });
      if (rng.next() < (el.chord || 0)) {
        const extra = rng.chance(0.5) ? [2, 4] : [2];
        let strum = 0;
        for (const d of extra) {
          if (idx + d < pool.length) {
            strum += rng.range(0.012, 0.045);
            if (t + strum < el.length) hits.push({ t: t + strum, freq: pool[idx + d].freq, vel: vel * 0.8, gain });
          }
        }
      }
    }
    const gap = mean * ((1 - timing) * (1 + (rng.next() - 0.5) * 0.04) + timing * rng.exp(1));
    t += Math.max(0.02, gap);
  }
  return hits;
}

export function compileStrikeElement(track, el, ctx) {
  const p = trackParams(track);
  const hits = planStrikeHits(track, el, ctx);
  const gamma = 0.6 + (p.velocityCurve ?? 0.5) * 1.6;
  const width = p.width ?? 0.5;
  return hits.filter((h) => h.gain > 0.0001).map((h, k) => {
    const seed = subSeed(ctx.elementSeed, 1000 + k);
    const amp = Math.pow(clamp(h.vel, 0, 1), gamma) * h.gain * 0.32 * (STRIKE_GAIN[track.instrument] ?? 1);
    const pan = width * (noiseAt(seed, 7) * 0.8);
    const d = strikeLength(track.instrument, p, h.freq);
    return {
      t: h.t,
      d,
      poly: true,
      create: (sr, i0) => createStrikeVoice(track.instrument, p, h.freq, amp, h.vel, pan, seed, sr, i0),
    };
  });
}

/** Duración de la voz de un golpe (hasta −70 dB). */
export function strikeLength(inst, p, freq) {
  if (inst === 'gotaTonal') return Math.min(6, (p.decay / 6.91) * TAIL_DB + 0.01);
  if (inst === 'paloLluvia') return Math.min(32, p.decay * 1.15 + 0.4);
  if (inst === 'pulsada') return Math.min(40, (p.decay / 6.91) * TAIL_DB * 1.1 + 0.02);
  if (inst === 'fmPiano' || inst === 'fmBell') return Math.min(45, (p.decay / 6.91) * TAIL_DB + 0.02);
  const modes = MODAL_SETS[inst] || MODAL_SETS.campana;
  const maxScale = Math.max(...modes.map((m) => m[2]));
  const bright = p.brightness ?? 0.5;
  return Math.min(45, (p.decay / 6.91) * Math.pow(maxScale, 1 + (1 - bright) * 0.6) * TAIL_DB + 0.02 + (freq > 0 ? 0 : 0));
}

/**
 * Tono de la slide: entra desde `slide` semitonos por debajo y llega a la
 * nota en `slideTime` (curva que frena al llegar); después, vibrato de barra
 * que crece poco a poco.
 */
function slidePitch(p) {
  const from = clamp(p.slide ?? 2, 0, 12);
  const time = Math.max(0.01, p.slideTime ?? 0.2);
  const depth = clamp(p.vibratoDepth ?? 12, 0, 50);
  const rate = clamp(p.vibratoRate ?? 5, 0.05, 8);
  return (t) => {
    let semis = 0;
    if (t < time) {
      const u = t / time;
      semis = -from * (1 - u) * (1 - u);
    }
    const v = t > time ? Math.min(1, (t - time) / 0.6) : 0;
    const cents = depth * v * Math.sin(2 * Math.PI * rate * (t - time));
    return Math.pow(2, semis / 12 + cents / 1200);
  };
}

export function createStrikeVoice(inst, p, freq, amp, vel, pan, seed, sr, i0) {
  if (inst === 'pulsada') return new KarplusVoice({ freq, amp, decay: p.decay, brightness: p.brightness, hardness: p.hardness, pan, seed, sr, i0 });
  if (inst === 'gotaTonal') return new BubbleVoice({ freq, amp, decay: p.decay, brightness: p.brightness, pan, seed, sr, i0 });
  if (inst === 'paloLluvia') {
    return new RainstickVoice({
      freq, amp, vel, duration: p.decay, brightness: p.brightness ?? 0.5, hardness: p.hardness ?? 0.4, width: p.width ?? 0.7, seed, sr, i0,
    });
  }
  if (inst === 'fmPiano' || inst === 'fmBell') {
    return new FMVoice({
      freq, amp, vel,
      decay: p.decay, brightness: p.brightness ?? 0.5, hardness: p.hardness ?? 0.3,
      ratio: p.fmRatio ?? 2, index: p.fmIndex ?? 3, time: p.fmTime ?? 1.2,
      pan, seed, sr, i0,
    });
  }
  const width = clamp(p.width ?? 0.5, 0, 1);
  return createModalVoice({
    modes: MODAL_SETS[inst] || MODAL_SETS.campana,
    freq, amp, vel,
    decay: p.decay,
    brightness: p.brightness ?? 0.5,
    hardness: p.hardness ?? 0.4,
    inharmonic: p.inharmonic ?? 0,
    beat: p.beat ?? 0,
    attack: ATTACKS[inst] ?? 0.0008,
    tremolo: inst === 'vibrafono' ? { depth: p.tremoloDepth ?? 0, rate: p.tremoloRate ?? 4 } : null,
    body: BODIES[inst] || null,
    doublet: DOUBLETS.has(inst),
    pitch: inst === 'slide' ? slidePitch(p) : null,
    spread: width * 0.35,
    pan, seed, sr, i0,
  });
}

export function createModalVoice(opts) {
  return new ModalVoice(opts);
}

/* ------------------------------------------------------------ modal */

class ModalVoice {
  /**
   * Banco de resonadores que decaen. Opciones además de los modos:
   * - `spread`: dispersión estéreo de los modos superiores (0–1).
   * - `doublet`: cada modo es un par a ±`beat`/2 Hz con panoramas opuestos
   *   (batido real que gira en estéreo); si no, `beat` es un trémolo por modo.
   * - `body`: resonancias fijas del cuerpo `[Hz, amplitud, s]`.
   * - `pitch(t)`: multiplicador de frecuencia en el tiempo (deslizamiento).
   */
  constructor({
    modes, freq, amp, vel = 0.7, decay, brightness, hardness, inharmonic, beat, attack, tremolo = null,
    spread = 0, doublet = false, body = null, pitch = null, pan, seed, sr, i0,
  }) {
    this.sr = sr;
    const rng = createRng(seed);
    const list = [];
    const tau0 = Math.max(0.01, decay / 6.91);
    const [pl, pr] = panGains(pan);
    const side = (q) => {
      const [l, r] = panGains(clamp(pan + q, -1, 1));
      return [l, r];
    };
    for (const [ratio, a, ts] of modes) {
      const r = ratio * (1 + inharmonic * 0.035 * (ratio - 1) * (ratio > 1 ? 1 : 0)) * (1 + (rng.next() - 0.5) * 0.002 * inharmonic);
      const f = freq * r;
      if (f >= 0.45 * sr || f < 15) continue;
      const tau = tau0 * Math.pow(ts, 1 + (1 - brightness) * 0.6);
      const tilt = ratio > 1 ? Math.pow(ratio, -(1 - brightness) * 1.3) * Math.pow(Math.max(0.05, vel), (ratio - 1) * 0.12 * hardness) : 1;
      const m = amp * a * tilt;
      if (doublet && beat > 0) {
        // Par que bate: la asimetría del metal separa cada modo en dos.
        const b = beat * (0.7 + 0.25 * list.length) * (0.85 + rng.next() * 0.3);
        const q = 0.2 + spread;
        const [l1, r1] = side(-q);
        const [l2, r2] = side(q);
        list.push({ f: f - b / 2, tau, gl: m * 0.55 * l1, gr: m * 0.55 * r1, glide: true });
        list.push({ f: f + b / 2, tau: tau * 0.92, gl: m * 0.5 * l2, gr: m * 0.5 * r2, glide: true });
      } else {
        const [l, r] = ratio > 1 && spread > 0 ? side(spread * (rng.next() * 2 - 1)) : [pl, pr];
        list.push({ f, tau, gl: m * l, gr: m * r, glide: true });
      }
    }
    if (body) {
      const bodyAmp = amp * (0.6 + 0.8 * clamp(hardness, 0, 1));
      for (const [hz, a, t] of body) {
        if (hz >= 0.45 * sr) continue;
        list.push({ f: hz, tau: t, gl: bodyAmp * a * pl, gr: bodyAmp * a * pr, glide: false });
      }
    }
    const n = list.length;
    this.n = n;
    this.gl = Float64Array.from(list.map((m) => m.gl));
    this.gr = Float64Array.from(list.map((m) => m.gr));
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.c = new Float64Array(n);
    this.s = new Float64Array(n);
    this.w = new Float64Array(n);
    this.r = new Float64Array(n);
    this.glide = list.map((m) => m.glide);
    for (let k = 0; k < n; k++) {
      const w = (2 * Math.PI * list[k].f) / sr;
      const r = Math.exp(-1 / (list[k].tau * sr));
      this.w[k] = w;
      this.r[k] = r;
      this.c[k] = Math.cos(w) * r;
      this.s[k] = Math.sin(w) * r;
      const g = Math.pow(r, i0);
      this.re[k] = Math.cos(w * i0) * g;
      this.im[k] = Math.sin(w * i0) * g;
    }
    this.pitch = pitch;
    this.pitchAt = -1;
    // Golpe: ráfaga de ruido filtrada.
    this.seed = seed;
    this.pl = pl;
    this.pr = pr;
    this.strikeAmp = amp * hardness * 0.6;
    this.strikeTau = (0.0015 + hardness * 0.004) * sr;
    this.strikeLen = Math.round(this.strikeTau * 7);
    this.bp = new Svf(2).set(clamp(freq * (2 + brightness * 4), 300, sr * 0.4), 0.9, sr);
    // Batido (como trémolo por modo) y ataque a ritmo de control.
    const am = !doublet && beat > 0;
    const beatRates = list.map(() => beat * (0.6 + rng.next() * 0.8));
    const beatPh = list.map(() => rng.next());
    const att = Math.max(0.0003, attack);
    // Trémolo común a todos los modos (motor del vibráfono). Fase por contador: no altera el azar.
    const tremDepth = tremolo ? clamp(tremolo.depth, 0, 1) : 0;
    const tremRate = tremolo ? tremolo.rate : 0;
    const tremPh = tremDepth > 0 ? noiseAt(seed, 11) * 0.5 + 0.5 : 0;
    this.ctl = new Control(n + 1, (i, out) => {
      const t = i / sr;
      for (let k = 0; k < n; k++) out[k] = am ? 1 - 0.45 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (beatRates[k] * t + beatPh[k]))) : 1;
      out[n] = 1 - Math.exp(-t / att);
      if (tremDepth > 0) out[n] *= 1 - tremDepth * (0.5 - 0.5 * Math.cos(2 * Math.PI * (tremRate * t + tremPh)));
    });
    this.kill = 0;
    this.killLeft = 0;
    this.done = false;
  }
  stop(frames) {
    if (!this.kill) {
      this.kill = Math.max(1, frames);
      this.killLeft = this.kill;
    }
  }
  /** Con deslizamiento, gira cada resonador a la frecuencia del momento. */
  retune(a0) {
    if (!this.pitch || a0 === this.pitchAt) return;
    this.pitchAt = a0;
    const m = this.pitch((a0 + CONTROL_STEP / 2) / this.sr);
    const { w, r, c, s, glide } = this;
    for (let k = 0; k < this.n; k++) {
      if (!glide[k]) continue;
      const wk = Math.min(Math.PI * 0.9, w[k] * m);
      c[k] = Math.cos(wk) * r[k];
      s[k] = Math.sin(wk) * r[k];
    }
  }
  process(L, R, off, n, i) {
    const end = off + n;
    let o = off;
    const N = this.n;
    const { re, im, c, s, gl, gr, ctl } = this;
    while (o < end) {
      const a0 = ctl.prepare(i);
      this.retune(a0);
      const seg = Math.min(end - o, a0 + CONTROL_STEP - i);
      let att = ctl.value(N, i);
      const datt = ctl.step(N);
      for (let q = 0; q < seg; q++) {
        let yl = 0;
        let yr = 0;
        const frac = (i + q - a0) / CONTROL_STEP;
        for (let k = 0; k < N; k++) {
          const r2 = re[k] * c[k] - im[k] * s[k];
          im[k] = re[k] * s[k] + im[k] * c[k];
          re[k] = r2;
          const v = im[k] * (ctl.v0[k] + (ctl.v1[k] - ctl.v0[k]) * frac);
          yl += v * gl[k];
          yr += v * gr[k];
        }
        yl *= att;
        yr *= att;
        const si = i + q;
        if (si < this.strikeLen) {
          const x = this.bp.tick(noiseAt(this.seed, si) * Math.exp(-si / this.strikeTau)) * this.strikeAmp;
          yl += x * this.pl;
          yr += x * this.pr;
        }
        if (this.kill) {
          const k = this.killLeft / this.kill;
          yl *= k;
          yr *= k;
          if (this.killLeft > 0) this.killLeft--;
          else this.done = true;
        }
        L[o + q] += yl;
        R[o + q] += yr;
        att += datt;
      }
      o += seg;
      i += seg;
    }
  }
}

/* ------------------------------------------------------------ Karplus-Strong */

class KarplusVoice {
  constructor({ freq, amp, decay, brightness = 0.5, hardness = 0.4, pan, seed, sr, i0 }) {
    const f = clamp(freq, 30, sr * 0.2);
    this.blend = 0.5 - 0.42 * brightness;
    const N = sr / f - this.blend;
    this.N = N;
    this.len = Math.ceil(N) + 4;
    this.buf = new Float32Array(this.len);
    this.w = 0;
    this.g = Math.pow(10, -3 / (f * Math.max(0.1, decay)));
    // Excitación: ruido filtrado dos veces (más blando con menos brillo y
    // dureza), sin media, con el peine del punto de pulsación (quita los
    // armónicos que no suenan ahí) y nivel normalizado: la púa no chasca.
    const cut = 500 + 7000 * brightness * (0.35 + 0.65 * hardness);
    const lp1 = new OnePole().set(cut, sr);
    const lp2 = new OnePole().set(Math.min(sr * 0.45, cut * 1.6), sr);
    const ex = new Float32Array(this.len);
    let mean = 0;
    for (let k = 0; k < this.len; k++) {
      ex[k] = lp2.tick(lp1.tick(noiseAt(seed, k)));
      mean += ex[k];
    }
    mean /= this.len;
    const pos = Math.max(1, Math.round(Math.ceil(N) * (0.12 + 0.14 * (1 - hardness))));
    const shaped = new Float32Array(this.len);
    let pw = 0;
    for (let k = 0; k < this.len; k++) {
      shaped[k] = (ex[k] - mean) - (k >= pos ? ex[k - pos] - mean : 0);
      pw += shaped[k] * shaped[k];
    }
    const norm = 0.3 / Math.sqrt(Math.max(1e-12, pw / this.len));
    const start = Math.pow(this.g, i0 / N);
    for (let k = 0; k < this.len; k++) this.buf[k] = shaped[k] * norm * amp * start;
    this.w = Math.ceil(N);
    this.prev = 0;
    [this.gl, this.gr] = panGains(pan);
    this.kill = 0;
    this.killLeft = 0;
    this.done = false;
    this.dc = 0;
    // Ataque de 0,7 ms: la cuerda arranca sin clic.
    this.t = i0;
    this.ramp = Math.max(1, Math.round(0.0007 * sr));
  }
  stop(frames) {
    if (!this.kill) {
      this.kill = Math.max(1, frames);
      this.killLeft = this.kill;
    }
  }
  process(L, R, off, n) {
    const { buf, len, N } = this;
    for (let q = 0; q < n; q++) {
      let p = this.w - N;
      if (p < 0) p += len;
      const pi = p | 0;
      const pf = p - pi;
      const x = buf[pi] + (buf[pi + 1 === len ? 0 : pi + 1] - buf[pi]) * pf;
      const y = this.g * ((1 - this.blend) * x + this.blend * this.prev);
      this.prev = x;
      buf[this.w] = y;
      if (++this.w === len) this.w = 0;
      this.dc += 0.001 * (y - this.dc);
      let out = y - this.dc;
      if (this.t < this.ramp) out *= this.t / this.ramp;
      this.t++;
      if (this.kill) {
        out *= this.killLeft / this.kill;
        if (this.killLeft > 0) this.killLeft--;
        else this.done = true;
      }
      L[off + q] += out * this.gl;
      R[off + q] += out * this.gr;
    }
  }
}

/* ------------------------------------------------------------ FM (2 operadores) */

class FMVoice {
  constructor({ freq, amp, vel = 0.7, decay, brightness = 0.5, hardness = 0.3, ratio = 2, index = 3, time = 1.2, pan, seed, sr, i0 }) {
    this.sr = sr;
    this.f = clamp(freq, 20, sr * 0.42);
    this.ratio = clamp(ratio, 0.25, 12);
    this.tau = Math.max(0.02, decay / 6.91);
    this.modTau = Math.max(0.01, time);
    this.attack = 0.0015 + (1 - clamp(hardness, 0, 1)) * 0.006;
    this.amp = amp * 0.95;
    // Índice de modulación en radianes, como en un FM clásico. Las notas
    // agudas llevan menos índice y las bandas laterales no pasan de Nyquist
    // (sin aliasing).
    const idx = index * (0.35 + 0.65 * clamp(vel, 0, 1)) * (0.45 + 0.55 * clamp(brightness, 0, 1));
    const keyTrack = Math.min(1, Math.pow(262 / this.f, 0.3));
    const maxIdx = Math.max(0, (0.45 * sr - this.f) / (this.f * this.ratio) - 1.5);
    this.index = Math.min(idx * keyTrack, maxIdx) / (2 * Math.PI);
    const phC = noiseAt(seed, 3) * 0.5 + 0.5;
    const phM = noiseAt(seed, 5) * 0.5 + 0.5;
    this.phaseC = (phC + (this.f * i0) / sr) % 1;
    this.phaseM = (phM + (this.f * this.ratio * i0) / sr) % 1;
    this.incC = this.f / sr;
    this.incM = (this.f * this.ratio) / sr;
    [this.gl, this.gr] = panGains(pan);
    // Golpe de púa: un soplo metálico muy breve.
    this.seed = seed;
    this.strikeAmp = amp * clamp(hardness, 0, 1) * 0.35;
    this.strikeTau = (0.001 + clamp(hardness, 0, 1) * 0.003) * sr;
    this.strikeLen = Math.round(this.strikeTau * 7);
    this.bp = new Svf(2).set(clamp(freq * (2 + brightness * 4), 300, sr * 0.4), 0.9, sr);
    this.kill = 0;
    this.killLeft = 0;
    this.done = false;
  }

  stop(frames) {
    if (!this.kill) {
      this.kill = Math.max(1, frames);
      this.killLeft = this.kill;
    }
  }

  process(L, R, off, n, i) {
    const sr = this.sr;
    for (let q = 0; q < n; q++) {
      const t = (i + q) / sr;
      const ampEnv = (1 - Math.exp(-t / this.attack)) * Math.exp(-t / this.tau);
      const modEnv = Math.exp(-t / this.modTau);
      const mod = sineCycle(this.phaseM) * this.index * modEnv;
      let y = sineCycle(this.phaseC + mod) * ampEnv * this.amp;
      const si = i + q;
      if (si < this.strikeLen) {
        y += this.bp.tick(noiseAt(this.seed, si) * Math.exp(-si / this.strikeTau)) * this.strikeAmp;
      }
      if (this.kill) {
        y *= this.killLeft / this.kill;
        if (this.killLeft > 0) this.killLeft--;
        else this.done = true;
      }
      L[off + q] += y * this.gl;
      R[off + q] += y * this.gr;
      this.phaseC += this.incC;
      if (this.phaseC >= 1) this.phaseC -= 1;
      this.phaseM += this.incM;
      if (this.phaseM >= 1) this.phaseM -= 1;
    }
  }
}

/* ------------------------------------------------------------ gota tonal */

class BubbleVoice {
  constructor({ freq, amp, decay, brightness = 0.5, pan, seed, sr, i0 }) {
    this.sr = sr;
    this.f = freq;
    this.tau = Math.max(0.005, decay / 6.91);
    this.rise = 0.15 + 0.45 * brightness;
    this.amp = amp * 1.3;
    this.i0 = i0;
    this.ph = noiseAt(seed, 3) * 0.5 + 0.5;
    [this.gl, this.gr] = panGains(pan);
    this.kill = 0;
    this.killLeft = 0;
    this.done = false;
  }
  stop(frames) {
    if (!this.kill) {
      this.kill = Math.max(1, frames);
      this.killLeft = this.kill;
    }
  }
  process(L, R, off, n, i) {
    const sr = this.sr;
    for (let q = 0; q < n; q++) {
      const t = (i + q) / sr;
      const u = t / this.tau;
      this.ph += (this.f * (1 + this.rise * Math.min(u, 4) * 0.25)) / sr;
      let y = sineCycle(this.ph) * Math.exp(-u) * Math.min(1, t / 0.0015) * this.amp;
      if (this.kill) {
        y *= this.killLeft / this.kill;
        if (this.killLeft > 0) this.killLeft--;
        else this.done = true;
      }
      L[off + q] += y * this.gl;
      R[off + q] += y * this.gr;
    }
  }
}

/* ------------------------------------------------------------ palo de lluvia */

/**
 * Palo de lluvia: cada golpe es un vuelco del tubo. Las semillas caen en un
 * flujo que crece deprisa y se va apagando; cada grano excita uno de cuatro
 * resonadores (el tubo y las semillas) cuyo color fija la nota.
 */
class RainstickVoice {
  constructor({ freq, amp, vel = 0.7, duration = 4, brightness = 0.5, hardness = 0.4, width = 0.7, seed, sr, i0 }) {
    this.sr = sr;
    const D = clamp(duration, 0.2, 30);
    const rng = createRng(seed);
    const base = clamp(freq, 60, 4000);
    const q = 3 + 9 * clamp(hardness, 0, 1);
    // Cada resonador se normaliza por su ancho de banda: todos los granos
    // tienen la misma energía, sea cual sea su color.
    this.res = [3, 4.7, 6.9, 10.3].map((r) => {
      const fc = clamp(base * r * (0.6 + 0.8 * brightness), 400, Math.min(9000, sr * 0.42));
      return [new Svf(2).set(fc, q, sr), new Svf(2).set(fc * 1.013, q, sr), Math.sqrt((q * sr) / (Math.PI * fc))];
    });
    const rate = 70 + 230 * clamp(vel, 0, 1);
    const grains = [];
    let t = rng.exp(1 / rate);
    while (t < D && grains.length < 12000) {
      const u = t / D;
      const env = Math.min(1, u / 0.07) * Math.pow(1 - u, 1.3);
      if (rng.next() < env) {
        const a = env * (0.3 + 0.7 * rng.next() * rng.next());
        const [l, r] = panGains(clamp(width * (rng.next() * 2 - 1), -1, 1));
        const sign = rng.next() < 0.5 ? -1 : 1;
        grains.push([Math.round(t * sr), a * sign, Math.floor(rng.next() * 4), l, r]);
      }
      t += rng.exp(1 / rate);
    }
    this.grains = grains;
    this.next = 0;
    while (this.next < grains.length && grains[this.next][0] < i0) this.next++;
    this.amp = amp * 12;
    this.exL = new Float64Array(4);
    this.exR = new Float64Array(4);
    this.kill = 0;
    this.killLeft = 0;
    this.done = false;
  }
  stop(frames) {
    if (!this.kill) {
      this.kill = Math.max(1, frames);
      this.killLeft = this.kill;
    }
  }
  process(L, R, off, n, i) {
    const { grains, res, exL, exR } = this;
    for (let q = 0; q < n; q++) {
      const si = i + q;
      exL.fill(0);
      exR.fill(0);
      while (this.next < grains.length && grains[this.next][0] <= si) {
        const [, a, j, l, r] = grains[this.next++];
        exL[j] += a * l;
        exR[j] += a * r;
      }
      let yl = 0;
      let yr = 0;
      for (let j = 0; j < 4; j++) {
        yl += res[j][0].tick(exL[j]) * res[j][2];
        yr += res[j][1].tick(exR[j]) * res[j][2];
      }
      yl *= this.amp;
      yr *= this.amp;
      if (this.kill) {
        const k = this.killLeft / this.kill;
        yl *= k;
        yr *= k;
        if (this.killLeft > 0) this.killLeft--;
        else this.done = true;
      }
      L[off + q] += yl;
      R[off + q] += yr;
    }
  }
}
