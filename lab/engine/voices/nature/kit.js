/**
 * Utilidades comunes de las simulaciones de naturaleza: planificación por
 * individuos, envolventes de tramo, sílabas con contorno de tono y partículas
 * (gotas, burbujas, chasquidos) generadas con azar por contador.
 */

import { CONTROL_STEP, Svf, clamp, dbToGain, fadeCurve, panGains, sineCycle } from '../../dsp.js';
import { createRng, noiseAt, unitAt } from '../../rng.js';
import { curveFunction, trackParams } from '../../schema.js';

/** Contexto de planificación de un tramo de simulación. */
export function natureKit(track, el, ctx) {
  const p = trackParams(track);
  const rng = createRng(ctx.elementSeed);
  const len = el.length;
  const curve = curveFunction(el.curve);
  const levelGain = dbToGain(el.level || 0);
  const fades = (t) => {
    let g = 1;
    if (el.fadeIn > 0 && t < el.fadeIn) g *= fadeCurve(t / el.fadeIn);
    if (el.fadeOut > 0 && t > len - el.fadeOut) g *= fadeCurve((len - t) / el.fadeOut);
    return g;
  };
  const density = clamp(el.density ?? 0.6, 0, 1);
  return {
    p,
    rng,
    len,
    audition: !!ctx.audition,
    budget: ctx.eventBudget ?? 200000,
    densityAt: (t) => (ctx.audition ? 1 : density * curve(clamp(t / len, 0, 1))),
    levelAt: (t) => levelGain * fades(t) * (0.7 + 0.3 * curve(clamp(t / len, 0, 1))),
    pans: (n) => {
      const out = [];
      for (let j = 0; j < n; j++) out.push(clamp((p.pan || 0) + (p.spread ?? 0.7) * (rng.next() * 2 - 1), -1, 1));
      return out;
    },
    variation: p.variation ?? 0.5,
  };
}

/** Envolvente de un tramo para voces continuas (lechos). */
export class BedEnvelope {
  constructor(el, sr, period = 0) {
    this.sr = sr;
    this.period = period;
    this.len = period ? period / sr : el.length;
    this.fadeIn = period ? 0 : el.fadeIn || 0;
    this.fadeOut = period ? 0 : el.fadeOut || 0;
    this.level = dbToGain(el.level || 0);
    this.density = clamp(el.density ?? 0.6, 0, 1);
    this.curve = curveFunction(el.curve);
    this.audition = false;
  }
  time(i) {
    return (this.period ? i % this.period : i) / this.sr;
  }
  levelAt(i) {
    const t = this.time(i);
    if (!this.period && (t < 0 || t >= this.len)) return 0;
    let g = this.level * (0.7 + 0.3 * this.curve(clamp(t / this.len, 0, 1)));
    if (this.fadeIn > 0 && t < this.fadeIn) g *= fadeCurve(t / this.fadeIn);
    if (this.fadeOut > 0 && t > this.len - this.fadeOut) g *= fadeCurve((this.len - t) / this.fadeOut);
    return g;
  }
  densityAt(i) {
    if (this.audition) return 1;
    return this.density * this.curve(clamp(this.time(i) / this.len, 0, 1));
  }
}

/* ------------------------------------------------------------ sílabas */

const CONTOURS = {
  line: (f0, f1, u) => f0 + (f1 - f0) * u,
  exp: (f0, f1, u) => f0 * Math.pow(f1 / f0, u),
  arch: (f0, f1, u) => f0 + (f1 - f0) * Math.sin(Math.PI * u),
  hook: (f0, f1, u) => f0 + (f1 - f0) * (1 - (1 - u) * (1 - u) * (1 - u)),
};

/**
 * Sílaba: `{ at, dur, f0, f1, shape, vib, vibRate, h2, h3, attack, curve, amp,
 * am, amDepth, amSharp, breath }`. Las frecuencias en Hz y los tiempos en s.
 */
export function syl(at, dur, f0, f1 = f0, opts = {}) {
  return { at, dur, f0, f1, shape: 'line', vib: 0, vibRate: 30, h2: 0.06, h3: 0, attack: 0.25, curve: 0.8, amp: 1, am: 0, amDepth: 0, amSharp: 1, breath: 0, ...opts };
}

/** Encadena sílabas `[sílaba sin `at`, pausa tras ella]` y devuelve la lista. */
export function chain(parts, start = 0) {
  const out = [];
  let t = start;
  for (const [s, gap] of parts) {
    out.push({ ...s, at: t });
    t += s.dur + gap;
  }
  return out;
}

export function syllablesLength(list) {
  return list.reduce((m, s) => Math.max(m, s.at + s.dur), 0);
}

/** Evento de sílabas listo para el compilador. `build()` crea la lista. */
export function syllableEvent(t, build, { pan = 0, amp = 1, seed = 1, dur }) {
  return {
    t,
    d: dur + 0.03,
    create: (sr, i0) => new SyllableVoice(build(), pan, amp, seed, sr, i0),
  };
}

class SyllableVoice {
  constructor(list, pan, amp, seed, sr, i0) {
    this.sr = sr;
    this.list = list.map((s) => ({
      ...s,
      a: Math.round(s.at * sr),
      n: Math.max(2, Math.round(s.dur * sr)),
      ph: 0,
      bp: s.breath ? new Svf(2).set((s.f0 + s.f1) / 2, 2.5, sr) : null,
      contour: CONTOURS[s.shape] || CONTOURS.line,
    }));
    [this.gl, this.gr] = panGains(pan);
    this.amp = amp;
    this.seed = seed;
  }
  process(L, R, off, n, i) {
    const sr = this.sr;
    for (const s of this.list) {
      const from = Math.max(i, s.a);
      const to = Math.min(i + n, s.a + s.n);
      if (to <= from) continue;
      for (let k = from; k < to; k++) {
        const u = (k - s.a) / s.n;
        let f = s.contour(s.f0, s.f1, u);
        if (s.vib) f *= 1 + s.vib * sineCycle(s.vibRate * (k - s.a) / sr);
        s.ph += f / sr;
        let x = sineCycle(s.ph);
        if (s.h2) x += s.h2 * sineCycle(2 * s.ph);
        if (s.h3) x += s.h3 * sineCycle(3 * s.ph);
        if (s.bp) x += s.bp.tick(noiseAt(this.seed, k)) * s.breath * 6;
        const a = u < s.attack ? Math.sin((Math.PI / 2) * (u / s.attack)) : 1;
        let env = a * Math.pow(Math.sin(Math.PI * u), s.curve);
        if (s.am) {
          const m = 0.5 + 0.5 * sineCycle(s.am * (k - s.a) / sr - 0.25);
          env *= 1 - s.amDepth + s.amDepth * (s.amSharp === 1 ? m : Math.pow(m, s.amSharp));
        }
        const y = x * env * s.amp * this.amp;
        L[off + k - i] += y * this.gl;
        R[off + k - i] += y * this.gr;
      }
    }
  }
}

/* ------------------------------------------------------------ partículas */

/**
 * Conjunto de partículas: tono amortiguado (con subida opcional, como las
 * burbujas de Minnaert) más un chasquido de ruido. Cada partícula aporta a la
 * salida estéreo con su panorama.
 */
export class Particles {
  constructor(sr, seed, max = 48) {
    this.sr = sr;
    this.seed = seed;
    this.max = max;
    this.n = 0;
    const F = (k) => new Float64Array(k);
    this.ph = F(max); this.f = F(max); this.rise = F(max); this.g = F(max); this.dec = F(max);
    this.cg = F(max); this.cdec = F(max); this.age = F(max); this.tauN = F(max); this.gl = F(max); this.gr = F(max);
    this.id = new Int32Array(max);
    this.count = 0;
  }
  /** Crea una partícula. `tau` y `clickTau` en segundos; `f` 0 = solo chasquido. */
  spawn({ f = 0, tau = 0.02, rise = 0, amp = 0.5, clickAmp = 0, clickTau = 0.001, pan = 0 }) {
    let k = this.n;
    if (k >= this.max) {
      // Sustituye la más débil.
      let w = 0;
      for (let j = 1; j < this.n; j++) if (this.g[j] + this.cg[j] < this.g[w] + this.cg[w]) w = j;
      k = w;
    } else this.n++;
    const sr = this.sr;
    this.ph[k] = 0;
    this.f[k] = f;
    this.rise[k] = rise;
    this.g[k] = f > 0 ? amp : 0;
    this.dec[k] = Math.exp(-1 / (Math.max(0.0005, tau) * sr));
    this.tauN[k] = Math.max(1, tau * sr);
    this.cg[k] = clickAmp;
    this.cdec[k] = Math.exp(-1 / (Math.max(0.00005, clickTau) * sr));
    this.age[k] = 0;
    [this.gl[k], this.gr[k]] = panGains(pan);
    this.id[k] = this.count++;
  }
  /** Suma las partículas en `L/R` (o en `toneL/R` y `clickL/R` por separado). */
  process(L, R, off, n, clickL = L, clickR = R) {
    const sr = this.sr;
    for (let k = 0; k < this.n; k++) {
      let ph = this.ph[k];
      let g = this.g[k];
      let cg = this.cg[k];
      let age = this.age[k];
      const f = this.f[k];
      const rise = this.rise[k];
      const dec = this.dec[k];
      const cdec = this.cdec[k];
      const tauN = this.tauN[k];
      const gl = this.gl[k];
      const gr = this.gr[k];
      const nseed = (this.seed + this.id[k] * 7919) >>> 0;
      for (let q = 0; q < n; q++) {
        let y = 0;
        if (g > 1e-5) {
          ph += (f * (1 + rise * Math.min(age / tauN, 3))) / sr;
          y = sineCycle(ph) * g * Math.min(1, age / (0.0008 * sr));
          g *= dec;
        }
        let c = 0;
        if (cg > 1e-5) {
          c = noiseAt(nseed, age) * cg;
          cg *= cdec;
        }
        age++;
        L[off + q] += y * gl;
        R[off + q] += y * gr;
        clickL[off + q] += c * gl;
        clickR[off + q] += c * gr;
      }
      this.ph[k] = ph;
      this.g[k] = g;
      this.cg[k] = cg;
      this.age[k] = age;
    }
    // Retira las agotadas.
    let w = 0;
    for (let k = 0; k < this.n; k++) {
      if (this.g[k] > 1e-5 || this.cg[k] > 1e-5) {
        if (w !== k) this.copy(k, w);
        w++;
      }
    }
    this.n = w;
  }
  copy(a, b) {
    for (const arr of [this.ph, this.f, this.rise, this.g, this.dec, this.cg, this.cdec, this.age, this.tauN, this.gl, this.gr, this.id]) arr[b] = arr[a];
  }
}

/**
 * Bucle de proceso por segmentos de control para lechos. `ctl` debe estar
 * creado; `body(o, seg, i, a0)` hace el trabajo de cada segmento.
 */
export function segments(ctl, off, n, i, body) {
  const end = off + n;
  let o = off;
  while (o < end) {
    const a0 = ctl.prepare(i);
    const seg = Math.min(end - o, a0 + CONTROL_STEP - i);
    body(o, seg, i);
    o += seg;
    i += seg;
  }
}

/** Decide si nace un evento en la muestra `j` con una tasa (eventos/s). */
export function spawnAt(seed, j, ratePerSecond, sr) {
  return unitAt(seed, j) < ratePerSecond / sr;
}

