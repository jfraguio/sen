/**
 * Primitivas DSP del motor del laboratorio: tablas de onda, filtros, ruido,
 * moduladores, envolventes y control a ritmo de bloque.
 *
 * Todo trabaja muestra a muestra con estado propio, a cualquier frecuencia de
 * muestreo, y no depende del tamaño del bloque de render.
 */

import { noiseAt } from './rng.js';
import { curveFunction } from './schema.js';

export const TAU = Math.PI * 2;
/** Paso de control: los parámetros se recalculan cada 32 muestras. */
export const CONTROL_STEP = 32;

export const dbToGain = (d) => Math.pow(10, d / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-12));
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ---------------------------------------------------------------- tablas */

const SINE_SIZE = 4096;
export const SINE_TABLE = (() => {
  const t = new Float32Array(SINE_SIZE + 1);
  for (let i = 0; i <= SINE_SIZE; i++) t[i] = Math.sin((TAU * i) / SINE_SIZE);
  return t;
})();

/** Seno de una fase expresada en ciclos (cualquier valor real). */
export function sineCycle(phase) {
  const p = phase - Math.floor(phase);
  const x = p * SINE_SIZE;
  const i = x | 0;
  return SINE_TABLE[i] + (SINE_TABLE[i + 1] - SINE_TABLE[i]) * (x - i);
}

export const WAVETABLE_SIZE = 2048;

/** Tabla de un ciclo a partir de amplitudes armónicas (`amps[h-1]`). */
export function makeWavetable(amps, phases = null) {
  const t = new Float32Array(WAVETABLE_SIZE + 1);
  for (let h = 1; h <= amps.length; h++) {
    const a = amps[h - 1];
    if (!a) continue;
    const ph = phases ? phases[h - 1] : 0;
    for (let i = 0; i < WAVETABLE_SIZE; i++) t[i] += a * Math.sin(TAU * (h * i / WAVETABLE_SIZE + ph));
  }
  let peak = 0;
  for (let i = 0; i < WAVETABLE_SIZE; i++) peak = Math.max(peak, Math.abs(t[i]));
  if (peak > 0) for (let i = 0; i < WAVETABLE_SIZE; i++) t[i] /= peak;
  t[WAVETABLE_SIZE] = t[0];
  return t;
}

/** Ajusta una frecuencia a un número entero de ciclos por periodo (bucle). */
export function quantizeFreq(f, period, sr) {
  if (!period) return f;
  return (Math.max(1, Math.round((f * period) / sr)) * sr) / period;
}

/* ---------------------------------------------------------------- filtros */

/** Filtro de estado variable (TPT). Modos: 0 paso bajo, 1 paso alto, 2 banda (pico 1). */
export class Svf {
  constructor(mode = 0) {
    this.mode = mode;
    this.ic1 = 0;
    this.ic2 = 0;
    this.a1 = 1;
    this.a2 = 0;
    this.a3 = 0;
    this.k = 1.414;
  }
  set(f, q, sr) {
    const fc = clamp(f, 5, sr * 0.49);
    const g = Math.tan((Math.PI * fc) / sr);
    this.k = 1 / Math.max(0.05, q);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (this.mode === 0) return v2;
    if (this.mode === 1) return x - this.k * v1 - v2;
    return this.k * v1;
  }
}

export const FILTER_MODES = { lp: 0, hp: 1, bp: 2 };

/** Paso bajo de un polo. */
export class OnePole {
  constructor() {
    this.y = 0;
    this.a = 1;
  }
  set(f, sr) {
    this.a = 1 - Math.exp((-TAU * clamp(f, 1, sr * 0.49)) / sr);
    return this;
  }
  tick(x) {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

/** Biquad RBJ: `lowpass`, `highpass`, `lowshelf`, `highshelf`, `peak`. */
export class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }
  set(type, f, q, gainDb, sr) {
    const A = Math.pow(10, gainDb / 40);
    const w = (TAU * clamp(f, 5, sr * 0.49)) / sr;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowpass') {
      b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    } else if (type === 'highpass') {
      b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    } else if (type === 'peak') {
      b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
    } else {
      const s = 2 * Math.sqrt(A) * al;
      if (type === 'lowshelf') {
        b0 = A * (A + 1 - (A - 1) * cs + s); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - s);
        a0 = A + 1 + (A - 1) * cs + s; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - s;
      } else {
        b0 = A * (A + 1 + (A - 1) * cs + s); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - s);
        a0 = A + 1 - (A - 1) * cs + s; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - s;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/* ---------------------------------------------------------------- ruido */

/** Ruido rosa (filtro de Paul Kellet) a partir de ruido blanco. */
export class PinkFilter {
  constructor() {
    this.b = new Float64Array(7);
  }
  tick(w) {
    const b = this.b;
    b[0] = 0.99886 * b[0] + w * 0.0555179;
    b[1] = 0.99332 * b[1] + w * 0.0750759;
    b[2] = 0.969 * b[2] + w * 0.153852;
    b[3] = 0.8665 * b[3] + w * 0.3104856;
    b[4] = 0.55 * b[4] + w * 0.5329522;
    b[5] = -0.7616 * b[5] - w * 0.016898;
    const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362;
    b[6] = w * 0.115926;
    return out * 0.11;
  }
}

/** Ruido marrón: integrador con fuga. */
export class BrownFilter {
  constructor() {
    this.y = 0;
  }
  tick(w) {
    this.y = this.y * 0.996 + w * 0.06;
    return this.y;
  }
}

/** Generador de color: `blanco`, `rosa` o `marron` desde el RNG por contador. */
export class ColoredNoise {
  constructor(seed, color = 'rosa', period = 0) {
    this.seed = seed;
    this.period = period;
    this.kind = color === 'blanco' ? 0 : color === 'marron' ? 2 : 1;
    this.pink = new PinkFilter();
    this.brown = new BrownFilter();
  }
  at(i) {
    const w = noiseAt(this.seed, this.period ? i % this.period : i);
    if (this.kind === 0) return w * 0.5;
    if (this.kind === 1) return this.pink.tick(w);
    return this.brown.tick(w);
  }
}

/**
 * Ruido de valor suavizado: nudos aleatorios con interpolación coseno.
 * `knots` > 0 lo hace periódico con ese número de nudos (media cero).
 */
export function smoothRandom(seed, knots = 0) {
  let mean = 0;
  if (knots > 0) {
    for (let k = 0; k < knots; k++) mean += noiseAt(seed, k);
    mean /= knots;
  }
  return (x) => {
    const k = Math.floor(x);
    const f = x - k;
    const ka = knots ? ((k % knots) + knots) % knots : k;
    const kb = knots ? (ka + 1) % knots : k + 1;
    const a = noiseAt(seed, ka) - mean;
    const b = noiseAt(seed, kb) - mean;
    const s = (1 - Math.cos(Math.PI * f)) / 2;
    return a + (b - a) * s;
  };
}

/* ---------------------------------------------------------------- envolventes */

/** Curva de fundido exponencial (lineal en dB desde −60 dB). */
export function fadeCurve(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return (Math.pow(1000, x - 1) - 0.001) / 0.999;
}

/** Ganancias de panorama de potencia constante, normalizadas a 1 en el centro. */
export function panGains(pan) {
  const th = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.min(1, Math.SQRT2 * Math.cos(th)), Math.min(1, Math.SQRT2 * Math.sin(th))];
}

/**
 * Envolvente de un elemento con duración: nivel, fundidos y curva de
 * intensidad. Con `period` > 0 el tiempo se pliega (voz permanente de bucle).
 */
export class ElementEnvelope {
  constructor(el, sr, period = 0) {
    this.sr = sr;
    this.period = period;
    this.len = period ? period / sr : el.length;
    this.fadeIn = period ? 0 : el.fadeIn || 0;
    this.fadeOut = period ? 0 : el.fadeOut || 0;
    this.level = dbToGain(el.level || 0);
    this.curve = curveFunction(el.curve);
  }
  timeAt(i) {
    return (this.period ? i % this.period : i) / this.sr;
  }
  curveAt(i) {
    return this.curve(clamp(this.timeAt(i) / this.len, 0, 1));
  }
  gainAt(i) {
    const t = this.timeAt(i);
    if (!this.period && (t < 0 || t >= this.len)) return 0;
    let g = this.level * this.curve(clamp(t / this.len, 0, 1));
    if (this.fadeIn > 0 && t < this.fadeIn) g *= fadeCurve(t / this.fadeIn);
    if (this.fadeOut > 0 && t > this.len - this.fadeOut) g *= fadeCurve((this.len - t) / this.fadeOut);
    return g;
  }
}

/** Ganancia de un evento puntual dentro de un elemento (sin curva periódica). */
export function elementGainAt(el, t) {
  const len = el.length || 0;
  if (!len) return dbToGain(el.level || 0);
  if (t < 0 || t > len) return 0;
  let g = dbToGain(el.level || 0) * curveFunction(el.curve)(clamp(t / len, 0, 1));
  if (el.fadeIn > 0 && t < el.fadeIn) g *= fadeCurve(t / el.fadeIn);
  if (el.fadeOut > 0 && t > len - el.fadeOut) g *= fadeCurve((len - t) / el.fadeOut);
  return g;
}

/* ---------------------------------------------------------------- control */

/**
 * Parámetros de control interpolados linealmente entre puntos alineados a
 * múltiplos de `CONTROL_STEP` en el índice local de la voz. Así el resultado
 * no depende de cómo se troceen los bloques.
 */
export class Control {
  constructor(size, fn) {
    this.fn = fn;
    this.size = size;
    this.v0 = new Float64Array(size);
    this.v1 = new Float64Array(size);
    this.at = -1;
  }
  /** Prepara el segmento que contiene `i`; devuelve su inicio. */
  prepare(i) {
    const a0 = i - (i % CONTROL_STEP);
    if (a0 !== this.at) {
      if (this.at >= 0 && a0 === this.at + CONTROL_STEP) {
        const t = this.v0;
        this.v0 = this.v1;
        this.v1 = t;
      } else this.fn(a0, this.v0);
      this.fn(a0 + CONTROL_STEP, this.v1);
      this.at = a0;
    }
    return a0;
  }
  /** Valor del parámetro `k` en la muestra `i` (tras `prepare`). */
  value(k, i) {
    return this.v0[k] + ((this.v1[k] - this.v0[k]) * (i - this.at)) / CONTROL_STEP;
  }
  step(k) {
    return (this.v1[k] - this.v0[k]) / CONTROL_STEP;
  }
}
