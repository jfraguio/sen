/**
 * Espacio: reverb FDN de 8 líneas y eco estéreo, ambos en streaming.
 *
 * Los tiempos de retardo se suavizan muestra a muestra hacia su objetivo, así
 * que se pueden cambiar mientras suena sin cortes (con un ligero efecto de
 * cinta, como en los equipos analógicos).
 */

import { OnePole, clamp, TAU } from './dsp.js';

const FDN_BASE_MS = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.7, 73.1];
const FDN_SIGNS_L = [1, -1, 1, -1, 1, -1, 1, -1];
const FDN_SIGNS_R = [1, 1, -1, -1, 1, 1, -1, -1];
const DIFFUSER_MS = [4.7, 3.6, 12.7, 9.3];

export class Reverb {
  constructor(sr) {
    this.sr = sr;
    const maxScale = 1.6;
    this.lines = FDN_BASE_MS.map((ms) => new Float32Array(Math.ceil((ms * maxScale * sr) / 1000) + 4));
    this.w = new Int32Array(8);
    this.delay = new Float64Array(8);
    this.target = new Float64Array(8);
    this.gain = new Float64Array(8);
    this.lp = new Float64Array(8);
    this.outs = new Float64Array(8);
    this.dampA = 0;
    this.decay = 4;
    this.diff = DIFFUSER_MS.map((ms) => ({ b: new Float32Array(Math.max(1, Math.round((ms * sr) / 1000))), i: 0 }));
    this.pre = new Float32Array(Math.ceil(0.25 * sr) + 2);
    this.preW = 0;
    this.preD = 1;
    this.preTarget = 1;
    this.hpState = 0;
    this.hpA = 1 - Math.exp((-TAU * 110) / sr);
    this.ready = false;
  }
  set({ size = 0.6, decay = 4.5, damping = 6000, predelay = 0.02 } = {}) {
    const scale = 0.5 + clamp(size, 0, 1);
    for (let k = 0; k < 8; k++) {
      this.target[k] = Math.min(this.lines[k].length - 3, (FDN_BASE_MS[k] * scale * this.sr) / 1000);
      if (!this.ready) this.delay[k] = this.target[k];
    }
    this.decay = clamp(decay, 0.1, 30);
    this.dampA = Math.exp((-TAU * clamp(damping, 200, this.sr * 0.45)) / this.sr);
    this.preTarget = clamp(predelay * this.sr, 1, this.pre.length - 2);
    if (!this.ready) this.preD = this.preTarget;
    this.ready = true;
  }
  /** Suma la señal húmeda de `inL/inR` a `outL/outR`. */
  process(inL, inR, outL, outR, n) {
    const sr = this.sr;
    for (let k = 0; k < 8; k++) this.gain[k] = Math.pow(10, (-3 * this.delay[k]) / (this.decay * sr));
    const { lines, w, delay, target, gain, lp, outs, diff, pre } = this;
    const dampA = this.dampA;
    const smooth = 0.0004;
    for (let i = 0; i < n; i++) {
      // Entrada mono, paso alto suave y predelay.
      const x = (inL[i] + inR[i]) * 0.5;
      this.hpState += this.hpA * (x - this.hpState);
      pre[this.preW] = x - this.hpState;
      this.preD += (this.preTarget - this.preD) * smooth;
      let rp = this.preW - this.preD;
      if (rp < 0) rp += pre.length;
      const ri = rp | 0;
      const rf = rp - ri;
      let s = pre[ri] + (pre[ri + 1 === pre.length ? 0 : ri + 1] - pre[ri]) * rf;
      if (++this.preW === pre.length) this.preW = 0;
      for (let d = 0; d < 4; d++) {
        const ap = diff[d];
        const v = ap.b[ap.i];
        const y = -0.62 * s + v;
        ap.b[ap.i] = s + 0.62 * y;
        if (++ap.i === ap.b.length) ap.i = 0;
        s = y;
      }
      let sum = 0;
      for (let k = 0; k < 8; k++) {
        delay[k] += (target[k] - delay[k]) * smooth;
        const line = lines[k];
        let p = w[k] - delay[k];
        if (p < 0) p += line.length;
        const pi = p | 0;
        const pf = p - pi;
        const o = line[pi] + (line[pi + 1 === line.length ? 0 : pi + 1] - line[pi]) * pf;
        lp[k] = o + (lp[k] - o) * dampA;
        outs[k] = lp[k] * gain[k];
        sum += outs[k];
      }
      const h = 0.25 * sum;
      let yl = 0, yr = 0;
      for (let k = 0; k < 8; k++) {
        const line = lines[k];
        line[w[k]] = outs[k] - h + s * 0.35;
        if (++w[k] === line.length) w[k] = 0;
        yl += outs[k] * FDN_SIGNS_L[k];
        yr += outs[k] * FDN_SIGNS_R[k];
      }
      outL[i] += yl * 0.55;
      outR[i] += yr * 0.55;
    }
  }
}

export class Echo {
  constructor(sr) {
    this.sr = sr;
    this.len = Math.ceil(2.2 * sr);
    this.bl = new Float32Array(this.len);
    this.br = new Float32Array(this.len);
    this.w = 0;
    this.d = 0.5 * sr;
    this.dTarget = this.d;
    this.fb = 0.35;
    this.pingPong = true;
    this.lpl = new OnePole();
    this.lpr = new OnePole();
    this.hpl = 0;
    this.hpr = 0;
    this.hpA = 1 - Math.exp((-TAU * 120) / sr);
    this.ready = false;
  }
  set({ time = 0.5, feedback = 0.35, tone = 3000, pingPong = true } = {}) {
    this.dTarget = clamp(time * this.sr, 16, this.len - 3);
    if (!this.ready) this.d = this.dTarget;
    this.fb = clamp(feedback, 0, 0.95);
    this.lpl.set(tone, this.sr);
    this.lpr.set(tone, this.sr);
    this.pingPong = !!pingPong;
    this.ready = true;
  }
  process(inL, inR, outL, outR, n) {
    const { bl, br, len } = this;
    const smooth = 0.0003;
    for (let i = 0; i < n; i++) {
      this.d += (this.dTarget - this.d) * smooth;
      let p = this.w - this.d;
      if (p < 0) p += len;
      const pi = p | 0;
      const pf = p - pi;
      const pn = pi + 1 === len ? 0 : pi + 1;
      const yl = bl[pi] + (bl[pn] - bl[pi]) * pf;
      const yr = br[pi] + (br[pn] - br[pi]) * pf;
      // Realimentación filtrada (paso bajo de tono y paso alto suave).
      let fl = this.lpl.tick(yl);
      let fr = this.lpr.tick(yr);
      this.hpl += this.hpA * (fl - this.hpl);
      this.hpr += this.hpA * (fr - this.hpr);
      fl -= this.hpl;
      fr -= this.hpr;
      if (this.pingPong) {
        bl[this.w] = (inL[i] + inR[i]) * 0.5 + fr * this.fb;
        br[this.w] = fl * this.fb;
      } else {
        bl[this.w] = inL[i] + fl * this.fb;
        br[this.w] = inR[i] + fr * this.fb;
      }
      if (++this.w === len) this.w = 0;
      outL[i] += yl;
      outR[i] += yr;
    }
  }
}

/** Duración aproximada (s) de la cola del eco hasta −70 dB. */
export function echoTail(time, feedback) {
  if (feedback <= 0.001) return time;
  return time * Math.min(60, Math.ceil(-70 / (20 * Math.log10(Math.min(0.95, feedback))))) + time;
}
