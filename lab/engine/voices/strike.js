/**
 * Notas puntuales: campana, cuenco, kalimba, caja de música, celesta,
 * marimba, vibráfono, piano de fieltro, arpa y guitarra de nailon (síntesis
 * modal), cuerda pulsada (Karplus-Strong), gota tonal (burbuja de Minnaert
 * afinada) y los FM de estética ochentera (piano y campana).
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

/** Modos `[relación, amplitud, escala de decaimiento]` por instrumento. */
export const MODAL_SETS = {
  campana: [[0.5, 0.32, 1.5], [1, 1, 1], [1.2, 0.42, 0.62], [1.5, 0.28, 0.5], [2, 0.55, 0.42], [2.52, 0.18, 0.3], [3.01, 0.22, 0.24], [4.07, 0.1, 0.18], [5.33, 0.05, 0.13]],
  cuenco: [[1, 1, 1], [2.76, 0.5, 0.55], [5.4, 0.2, 0.28], [8.93, 0.07, 0.14]],
  kalimba: [[1, 1, 1], [2.01, 0.06, 0.4], [5.4, 0.16, 0.05], [0.5, 0.04, 0.08]],
  cajaMusica: [[1, 1, 1], [2, 0.1, 0.45], [3, 0.04, 0.3], [5.93, 0.12, 0.05], [9.4, 0.04, 0.03]],
  celesta: [[1, 1, 1], [2, 0.22, 0.5], [3, 0.06, 0.3], [4.01, 0.08, 0.25]],
  marimba: [[1, 1, 1], [3.93, 0.22, 0.2], [9.2, 0.05, 0.08]],
  vibrafono: [[1, 1, 1], [4, 0.16, 0.3], [10, 0.04, 0.1]],
  // Piano de fieltro: cada armónico con una parte que se apaga pronto (golpe) y otra larga.
  piano: [[1, 0.75, 1], [1, 0.3, 0.12], [2, 0.3, 0.62], [2, 0.1, 0.1], [3, 0.17, 0.45], [4, 0.09, 0.36], [5, 0.06, 0.3], [6, 0.035, 0.25], [7, 0.02, 0.2]],
  // Cuerdas pulsadas modales: amplitud sen(π·h·p)/h según el punto de pulsación p.
  arpa: [[1, 1, 1], [2, 0.81, 0.74], [3, 0.54, 0.54], [4, 0.25, 0.41], [6, 0.17, 0.26], [7, 0.23, 0.22], [8, 0.2, 0.19], [9, 0.11, 0.16]],
  guitarra: [[1, 1, 1], [2, 0.9, 0.67], [3, 0.75, 0.45], [4, 0.57, 0.33], [5, 0.36, 0.25], [6, 0.19, 0.2], [8, 0.07, 0.13]],
  metal: [[1, 1, 1], [2.76, 0.45, 0.47], [5.4, 0.2, 0.24], [8.93, 0.06, 0.1]],
  bambu: [[1, 1, 1], [2.6, 0.32, 0.4], [4.9, 0.08, 0.2]],
  vidrio: [[1, 1, 1], [2.32, 0.3, 0.5], [4.25, 0.15, 0.3], [6.63, 0.05, 0.2]],
};

const STRIKE_GAIN = { campana: 1, cuenco: 1, kalimba: 1.3, cajaMusica: 1.5, celesta: 1.2, marimba: 1.8, vibrafono: 1, piano: 1.1, arpa: 0.9, guitarra: 1, pulsada: 3.2, gotaTonal: 2, fmPiano: 1.1, fmBell: 1.15 };
const ATTACKS = { kalimba: 0.003, celesta: 0.004, cuenco: 0.006, marimba: 0.0015, vibrafono: 0.003, piano: 0.005, arpa: 0.002, guitarra: 0.002 };
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
  if (el.type === 'cloud') return planCloud(el, ctx);
  return [];
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
  if (inst === 'pulsada') return Math.min(40, (p.decay / 6.91) * TAIL_DB * 1.1 + 0.02);
  if (inst === 'fmPiano' || inst === 'fmBell') return Math.min(45, (p.decay / 6.91) * TAIL_DB + 0.02);
  const modes = MODAL_SETS[inst] || MODAL_SETS.campana;
  const maxScale = Math.max(...modes.map((m) => m[2]));
  const bright = p.brightness ?? 0.5;
  return Math.min(45, (p.decay / 6.91) * Math.pow(maxScale, 1 + (1 - bright) * 0.6) * TAIL_DB + 0.02 + (freq > 0 ? 0 : 0));
}

export function createStrikeVoice(inst, p, freq, amp, vel, pan, seed, sr, i0) {
  if (inst === 'pulsada') return new KarplusVoice({ freq, amp, decay: p.decay, brightness: p.brightness, hardness: p.hardness, pan, seed, sr, i0 });
  if (inst === 'gotaTonal') return new BubbleVoice({ freq, amp, decay: p.decay, brightness: p.brightness, pan, seed, sr, i0 });
  if (inst === 'fmPiano' || inst === 'fmBell') {
    return new FMVoice({
      freq, amp, vel,
      decay: p.decay, brightness: p.brightness ?? 0.5, hardness: p.hardness ?? 0.3,
      ratio: p.fmRatio ?? 2, index: p.fmIndex ?? 3, time: p.fmTime ?? 1.2,
      pan, seed, sr, i0,
    });
  }
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
    pan, seed, sr, i0,
  });
}

export function createModalVoice(opts) {
  return new ModalVoice(opts);
}

/* ------------------------------------------------------------ modal */

class ModalVoice {
  constructor({ modes, freq, amp, vel = 0.7, decay, brightness, hardness, inharmonic, beat, attack, tremolo = null, pan, seed, sr, i0 }) {
    this.sr = sr;
    const rng = createRng(seed);
    const list = [];
    const tau0 = Math.max(0.01, decay / 6.91);
    for (const [ratio, a, ts] of modes) {
      const r = ratio * (1 + inharmonic * 0.035 * (ratio - 1) * (ratio > 1 ? 1 : 0)) * (1 + (rng.next() - 0.5) * 0.002 * inharmonic);
      const f = freq * r;
      if (f >= 0.45 * sr || f < 15) continue;
      const tau = tau0 * Math.pow(ts, 1 + (1 - brightness) * 0.6);
      const tilt = ratio > 1 ? Math.pow(ratio, -(1 - brightness) * 1.3) * Math.pow(Math.max(0.05, vel), (ratio - 1) * 0.12 * hardness) : 1;
      list.push({ f, tau, amp: a * tilt });
    }
    const n = list.length;
    this.n = n;
    this.amp = Float64Array.from(list.map((m) => m.amp * amp));
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.c = new Float64Array(n);
    this.s = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const w = (2 * Math.PI * list[k].f) / sr;
      const r = Math.exp(-1 / (list[k].tau * sr));
      this.c[k] = Math.cos(w) * r;
      this.s[k] = Math.sin(w) * r;
      const g = Math.pow(r, i0);
      this.re[k] = Math.cos(w * i0) * g;
      this.im[k] = Math.sin(w * i0) * g;
    }
    [this.gl, this.gr] = panGains(pan);
    // Golpe: ráfaga de ruido filtrada.
    this.seed = seed;
    this.strikeAmp = amp * hardness * 0.6;
    this.strikeTau = (0.0015 + hardness * 0.004) * sr;
    this.strikeLen = Math.round(this.strikeTau * 7);
    this.bp = new Svf(2).set(clamp(freq * (2 + brightness * 4), 300, sr * 0.4), 0.9, sr);
    // Batido y ataque a ritmo de control.
    const beatRates = list.map(() => beat * (0.6 + rng.next() * 0.8));
    const beatPh = list.map(() => rng.next());
    const att = Math.max(0.0003, attack);
    // Trémolo común a todos los modos (motor del vibráfono). Fase por contador: no altera el azar.
    const tremDepth = tremolo ? clamp(tremolo.depth, 0, 1) : 0;
    const tremRate = tremolo ? tremolo.rate : 0;
    const tremPh = tremDepth > 0 ? noiseAt(seed, 11) * 0.5 + 0.5 : 0;
    this.ctl = new Control(n + 1, (i, out) => {
      const t = i / sr;
      for (let k = 0; k < n; k++) out[k] = beat > 0 ? 1 - 0.45 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (beatRates[k] * t + beatPh[k]))) : 1;
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
  process(L, R, off, n, i) {
    const end = off + n;
    let o = off;
    const N = this.n;
    const { re, im, c, s, amp, ctl } = this;
    while (o < end) {
      const a0 = ctl.prepare(i);
      const seg = Math.min(end - o, a0 + CONTROL_STEP - i);
      let att = ctl.value(N, i);
      const datt = ctl.step(N);
      for (let q = 0; q < seg; q++) {
        let y = 0;
        const frac = (i + q - a0) / CONTROL_STEP;
        for (let k = 0; k < N; k++) {
          const r2 = re[k] * c[k] - im[k] * s[k];
          im[k] = re[k] * s[k] + im[k] * c[k];
          re[k] = r2;
          const b = ctl.v0[k] + (ctl.v1[k] - ctl.v0[k]) * frac;
          y += im[k] * amp[k] * b;
        }
        y *= att;
        const si = i + q;
        if (si < this.strikeLen) {
          y += this.bp.tick(noiseAt(this.seed, si) * Math.exp(-si / this.strikeTau)) * this.strikeAmp;
        }
        if (this.kill) {
          y *= this.killLeft / this.kill;
          if (this.killLeft > 0) this.killLeft--;
          else this.done = true;
        }
        L[o + q] += y * this.gl;
        R[o + q] += y * this.gr;
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
    const lp = new OnePole().set(600 + 9000 * brightness * (0.4 + 0.6 * hardness), sr);
    const start = Math.pow(this.g, i0 / N);
    for (let k = 0; k < this.len; k++) this.buf[k] = lp.tick(noiseAt(seed, k)) * amp * 1.6 * start;
    this.w = Math.ceil(N);
    this.prev = 0;
    [this.gl, this.gr] = panGains(pan);
    this.kill = 0;
    this.killLeft = 0;
    this.done = false;
    this.dc = 0;
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
    this.index = index * (0.35 + 0.65 * clamp(vel, 0, 1)) * (0.45 + 0.55 * clamp(brightness, 0, 1));
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
