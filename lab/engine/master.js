/**
 * Bus maestro: ecualización, limitador con anticipación y medida de
 * sonoridad (ITU-R BS.1770-4), todo en streaming.
 */

import { Biquad, clamp, dbToGain } from './dsp.js';

export class MasterEq {
  constructor(sr) {
    this.sr = sr;
    this.f = [0, 1].map(() => ({ hp: new Biquad(), lp: new Biquad(), lo: new Biquad(), hi: new Biquad() }));
    this.key = '';
  }
  set({ on = true, lowCut = 30, highCut = 18000, tilt = 0 } = {}) {
    this.on = on !== false;
    const key = `${lowCut}/${highCut}/${tilt}`;
    if (key === this.key) return;
    this.key = key;
    for (const c of this.f) {
      c.hp.set('highpass', lowCut, 0.707, 0, this.sr);
      c.lp.set('lowpass', Math.min(highCut, this.sr * 0.45), 0.707, 0, this.sr);
      c.lo.set('lowshelf', 300, 0.707, -tilt / 2, this.sr);
      c.hi.set('highshelf', 3000, 0.707, tilt / 2, this.sr);
    }
    this.tilt = tilt;
  }
  process(L, R, n) {
    if (this.on === false) return;
    const [a, b] = this.f;
    const tilt = this.tilt !== 0;
    for (let i = 0; i < n; i++) {
      let l = a.lp.tick(a.hp.tick(L[i]));
      let r = b.lp.tick(b.hp.tick(R[i]));
      if (tilt) {
        l = a.hi.tick(a.lo.tick(l));
        r = b.hi.tick(b.lo.tick(r));
      }
      L[i] = l;
      R[i] = r;
    }
  }
}

/* ------------------------------------------------------------ pico real */

/** Coeficientes de interpolación 4× (sinc enventanado de 8 tomas por fase). */
const TP_PHASES = [0.25, 0.5, 0.75].map((f) => {
  const taps = [];
  let sum = 0;
  for (let t = -3; t <= 4; t++) {
    const x = t - f;
    const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / 4.5);
    taps.push(sinc * w);
    sum += sinc * w;
  }
  return taps.map((c) => c / sum);
});

/** Pico entre muestras (estimación 4×) de la posición `k-4` del historial. */
function interSamplePeak(hist, k) {
  // hist: anillo de 8 muestras; la más reciente está en k & 7.
  let peak = Math.abs(hist[(k - 4) & 7]);
  for (const c of TP_PHASES) {
    let y = 0;
    for (let t = 0; t < 8; t++) y += hist[(k - 7 + t) & 7] * c[t];
    const a = Math.abs(y);
    if (a > peak) peak = a;
  }
  return peak;
}

/** Medidor de pico real (sobremuestreo 4×). */
export class TruePeakMeter {
  constructor() {
    this.hist = new Float64Array(8);
    this.k = 0;
    this.peak = 0;
  }
  push(x, from, to) {
    for (let i = from; i < to; i++) {
      this.hist[this.k & 7] = x[i];
      const p = interSamplePeak(this.hist, this.k);
      if (p > this.peak) this.peak = p;
      this.k++;
    }
  }
}

/**
 * Limitador estéreo con anticipación. La salida va retrasada `lookahead`
 * muestras y ninguna muestra supera el techo:
 *   req[n] = min(1, techo / |x[n]|)
 *   m[n]   = min(req[n … n+La])
 *   g[n]   = media(m[n−La … n])   (≤ req[n])
 * con una recuperación exponencial lenta.
 */
export class Limiter {
  constructor(sr, { lookahead = 0.005, release = 0.15, truePeak = false } = {}) {
    this.la = Math.max(1, Math.round(lookahead * sr));
    this.tp = truePeak;
    this.hl = new Float64Array(8);
    this.hr = new Float64Array(8);
    this.hk = 0;
    const cap = this.la + 2;
    this.dl = new Float32Array(this.la + 1);
    this.dr = new Float32Array(this.la + 1);
    this.dw = 0;
    this.qi = new Float64Array(cap);
    this.qv = new Float64Array(cap);
    this.qh = 0;
    this.qt = 0;
    this.qn = 0;
    this.cap = cap;
    this.mr = new Float64Array(this.la + 1).fill(1);
    this.mw = 0;
    this.sum = this.la + 1;
    this.g = 1;
    this.rel = 1 - Math.exp(-1 / (release * sr));
    this.k = 0;
    this.ceiling = dbToGain(-1);
    this.minGain = 1;
  }
  setCeiling(db) {
    this.ceiling = dbToGain(clamp(db, -24, 0));
  }
  /** Retardo total en muestras: la línea de anticipación (la + 1) más 4 del pico real. */
  get latency() {
    return this.la + 1 + (this.tp ? 4 : 0);
  }
  process(L, R, n) {
    const la = this.la;
    const c = this.ceiling;
    for (let i = 0; i < n; i++) {
      let xl = L[i];
      let xr = R[i];
      let a;
      if (this.tp) {
        // Detección de pico real: la señal se retrasa 4 muestras para tener contexto.
        const hk = this.hk++;
        this.hl[hk & 7] = xl;
        this.hr[hk & 7] = xr;
        xl = this.hl[(hk - 4) & 7];
        xr = this.hr[(hk - 4) & 7];
        a = Math.max(interSamplePeak(this.hl, hk), interSamplePeak(this.hr, hk));
      } else a = Math.max(Math.abs(xl), Math.abs(xr));
      const req = a > c ? c / a : 1;
      const k = this.k++;
      // Mínimo deslizante (deque monótona).
      while (this.qn > 0) {
        const back = (this.qt - 1 + this.cap) % this.cap;
        if (this.qv[back] >= req) {
          this.qt = back;
          this.qn--;
        } else break;
      }
      this.qi[this.qt] = k;
      this.qv[this.qt] = req;
      this.qt = (this.qt + 1) % this.cap;
      this.qn++;
      while (this.qi[this.qh] <= k - la - 1) {
        this.qh = (this.qh + 1) % this.cap;
        this.qn--;
      }
      const m = this.qv[this.qh];
      this.sum += m - this.mr[this.mw];
      this.mr[this.mw] = m;
      if (++this.mw === la + 1) this.mw = 0;
      const avg = this.sum / (la + 1);
      this.g = Math.min(avg, this.g + (1 - this.g) * this.rel);
      if (this.g < this.minGain) this.minGain = this.g;
      // Retardo de anticipación.
      const ol = this.dl[this.dw];
      const or = this.dr[this.dw];
      this.dl[this.dw] = xl;
      this.dr[this.dw] = xr;
      if (++this.dw === la + 1) this.dw = 0;
      L[i] = ol * this.g;
      R[i] = or * this.g;
    }
  }
}

/** Coeficientes de la ponderación K a cualquier frecuencia de muestreo. */
function kCoefficients(sr) {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sr);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / sr);
  a0 = 1 + K / Q + K * K;
  const hp = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, hp];
}

class KFilter {
  constructor(sr) {
    this.c = kCoefficients(sr);
    this.s = new Float64Array(8);
  }
  tick(x) {
    const s = this.s;
    const [a, b] = this.c;
    const y1 = a.b0 * x + a.b1 * s[0] + a.b2 * s[1] - a.a1 * s[2] - a.a2 * s[3];
    s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y1;
    const y2 = b.b0 * y1 + b.b1 * s[4] + b.b2 * s[5] - b.a1 * s[6] - b.a2 * s[7];
    s[5] = s[4]; s[4] = y1; s[7] = s[6]; s[6] = y2;
    return y2;
  }
}

export const lufsOf = (power) => -0.691 + 10 * Math.log10(Math.max(power, 1e-20));

/**
 * Sonoridad por subbloques de 100 ms: integrada (bloques de 400 ms con
 * solape del 75 %, puertas de −70 LUFS y −10 LU) y a corto plazo (3 s).
 */
export class LoudnessMeter {
  constructor(sr, channels = 2) {
    this.channels = channels;
    this.kl = new KFilter(sr);
    this.kr = new KFilter(sr);
    this.sub = Math.round(0.1 * sr);
    this.acc = 0;
    this.count = 0;
    this.subs = [];
    this.recent = new Float64Array(30);
    this.recentN = 0;
    this.recentW = 0;
    this.peak = 0;
  }
  push(L, R, n, from = 0) {
    for (let i = from; i < from + n; i++) {
      const l = L[i];
      const yl = this.kl.tick(l);
      let e = yl * yl;
      const al = Math.abs(l);
      if (al > this.peak) this.peak = al;
      if (this.channels === 2) {
        const r = R[i];
        const yr = this.kr.tick(r);
        e += yr * yr;
        const ar = Math.abs(r);
        if (ar > this.peak) this.peak = ar;
      }
      this.acc += e;
      if (++this.count === this.sub) {
        const p = this.acc / this.sub;
        this.subs.push(p);
        this.recent[this.recentW] = p;
        this.recentW = (this.recentW + 1) % 30;
        if (this.recentN < 30) this.recentN++;
        this.acc = 0;
        this.count = 0;
      }
    }
  }
  shortTerm() {
    if (!this.recentN) return -Infinity;
    let s = 0;
    for (let k = 0; k < this.recentN; k++) s += this.recent[k];
    return lufsOf(s / this.recentN);
  }
  integrated() {
    const blocks = [];
    for (let k = 3; k < this.subs.length; k++) {
      blocks.push((this.subs[k] + this.subs[k - 1] + this.subs[k - 2] + this.subs[k - 3]) / 4);
    }
    const gated = blocks.filter((p) => lufsOf(p) > -70);
    if (!gated.length) return -Infinity;
    const mean = gated.reduce((a, b) => a + b, 0) / gated.length;
    const rel = gated.filter((p) => lufsOf(p) > lufsOf(mean) - 10);
    return lufsOf(rel.reduce((a, b) => a + b, 0) / Math.max(1, rel.length));
  }
}
