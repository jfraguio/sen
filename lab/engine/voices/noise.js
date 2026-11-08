/**
 * Ruidos: ruido de color filtrado con ráfagas u oleaje y decorrelación
 * estéreo.
 */

import {
  CONTROL_STEP, ColoredNoise, Control, ElementEnvelope, FILTER_MODES, Svf, clamp, panGains, quantizeFreq, smoothRandom,
} from '../dsp.js';
import { subSeed, unitAt } from '../rng.js';
import { trackParams } from '../schema.js';

export function compileNoiseElement(track, el, ctx) {
  const p = trackParams(track);
  const palo = track.instrument === 'paloAgua';
  return [{
    t: 0,
    d: el.length,
    bed: true,
    create: (sr, i0, period) => (palo
      ? new PaloAguaVoice(p, el, ctx.elementSeed, sr, period)
      : new NoiseVoice(p, el, ctx.elementSeed, sr, period)),
  }];
}

/**
 * Palo de agua como textura: granos de semillas que caen por un tubo. Cada
 * grano excita uno de cuatro resonadores y deja un chasquido breve; el flujo
 * es continuo y estéreo.
 */
class PaloAguaVoice {
  constructor(p, el, seed, sr, period) {
    this.sr = sr;
    this.period = period;
    this.env = new ElementEnvelope(el, sr, period);
    this.rate = clamp(p.rate ?? 200, 5, 600);
    this.q = 3 + 9 * clamp(p.hardness ?? 0.4, 0, 1);
    const base = 260 + 900 * clamp(p.brightness ?? 0.5, 0, 1);
    this.res = [3, 4.7, 6.9, 10.3].map((ratio) => {
      const fc = clamp(base * ratio, 300, Math.min(9000, sr * 0.42));
      return [
        new Svf(2).set(fc, this.q, sr),
        new Svf(2).set(fc * 1.013, this.q, sr),
        Math.sqrt((this.q * sr) / (Math.PI * fc)),
      ];
    });
    this.seeds = [1, 2, 3, 4, 5].map((k) => subSeed(seed, k));
    this.width = clamp(p.width ?? 0.7, 0, 1);
    this.variation = clamp(p.variation ?? 0.5, 0, 1);
    this.exL = new Float64Array(4);
    this.exR = new Float64Array(4);
    this.ctl = new Control(1, (i, out) => {
      out[0] = this.env.gainAt(i) * 1.2;
    });
  }

  process(L, R, off, n, i) {
    const { sr, res, exL, exR, seeds } = this;
    const end = off + n;
    let o = off;
    while (o < end) {
      const a0 = this.ctl.prepare(i);
      const seg = Math.min(end - o, a0 + CONTROL_STEP - i);
      let amp = this.ctl.value(0, i);
      const damp = this.ctl.step(0);
      for (let s = 0; s < seg; s++) {
        const si = i + s;
        const j = this.period ? si % this.period : si;
        exL.fill(0);
        exR.fill(0);
        if (unitAt(seeds[0], j) < this.rate / sr) {
          const u = unitAt(seeds[1], j);
          const strength = (0.35 + 0.65 * u) * (1 - 0.35 * this.variation + 0.35 * this.variation * unitAt(seeds[2], j));
          const sign = unitAt(seeds[3], j) < 0.5 ? -1 : 1;
          const [gl, gr] = panGains(clamp(this.width * (unitAt(seeds[4], j) * 2 - 1), -1, 1));
          const mode = Math.floor(unitAt(seeds[2], j + 17) * 4) & 3;
          exL[mode] += sign * strength * gl;
          exR[mode] += sign * strength * gr;
        }
        let yl = 0;
        let yr = 0;
        for (let k = 0; k < 4; k++) {
          yl += res[k][0].tick(exL[k]) * res[k][2];
          yr += res[k][1].tick(exR[k]) * res[k][2];
        }
        L[o + s] += yl * amp;
        R[o + s] += yr * amp;
        amp += damp;
      }
      o += seg;
      i += seg;
    }
  }
}

/** Envolvente de oleaje: sube con `a` del ciclo y baja con el resto. */
export function swellShape(phase, a) {
  const ph = phase - Math.floor(phase);
  if (ph < a) {
    const s = Math.sin((Math.PI / 2) * (ph / a));
    return s * s;
  }
  const c = Math.cos((Math.PI / 2) * ((ph - a) / (1 - a)));
  return c * c;
}

class NoiseVoice {
  constructor(p, el, seed, sr, period) {
    this.sr = sr;
    this.env = new ElementEnvelope(el, sr, period);
    this.na = new ColoredNoise(subSeed(seed, 1), p.color, period);
    this.nb = new ColoredNoise(subSeed(seed, 2), p.color, period);
    const th = (clamp(p.stereo ?? 0.8, 0, 1) * Math.PI) / 2;
    this.c1 = Math.cos(th);
    this.c2 = Math.sin(th);
    const mode = FILTER_MODES[p.filterType] ?? 0;
    this.fl = new Svf(mode);
    this.fr = new Svf(mode);
    this.q = p.q ?? 0.7;
    const cutoff = p.cutoff ?? 1400;
    const depth = clamp(p.moveDepth ?? 0.5, 0, 1);
    const target = p.moveTarget || 'ambos';
    const moveLevel = target !== 'filtro';
    const moveFilter = target !== 'nivel';
    const movement = p.movement || 'ninguno';
    let mod = () => 0.5;
    if (movement === 'rafagas') {
      const rate = p.moveRate ?? 0.12;
      const knots = period ? Math.max(1, Math.round((rate * period) / sr)) : 0;
      const r = period ? (knots * sr) / period : rate;
      const rnd = smoothRandom(subSeed(seed, 3), knots);
      const fine = smoothRandom(subSeed(seed, 4), knots ? knots * 4 : 0);
      mod = (t) => clamp(0.5 + 0.55 * rnd(t * r) + 0.15 * fine(t * r * 4), 0, 1);
    } else if (movement === 'oleaje') {
      const wp = period ? period / sr / Math.max(1, Math.round(period / sr / (p.wavePeriod || 9))) : p.wavePeriod || 9;
      const a = clamp(p.waveShape ?? 0.35, 0.1, 0.9);
      mod = (t) => swellShape(t / wp, a);
    }
    const env = this.env;
    const still = movement === 'ninguno';
    this.ctl = new Control(2, (i, out) => {
      const t = (period ? i % period : i) / sr;
      const u = still ? 0.5 : mod(t);
      const lvl = still || !moveLevel ? 1 : 1 - depth + depth * Math.pow(u, 1.3) * 1.25;
      out[0] = env.gainAt(i) * lvl * 0.55;
      out[1] = still || !moveFilter ? cutoff : cutoff * Math.pow(2, depth * 2.4 * (u - 0.5));
    });
  }
  process(L, R, off, n, i) {
    const { ctl, fl, fr, sr, q, na, nb, c1, c2 } = this;
    const end = off + n;
    let o = off;
    while (o < end) {
      const a0 = ctl.prepare(i);
      const seg = Math.min(end - o, a0 + CONTROL_STEP - i);
      let amp = ctl.value(0, i);
      const damp = ctl.step(0);
      const c = ctl.value(1, i);
      fl.set(c, q, sr);
      fr.set(c, q, sr);
      for (let s = 0; s < seg; s++) {
        const a = na.at(i + s);
        const b = nb.at(i + s);
        L[o + s] += fl.tick(a) * amp;
        R[o + s] += fr.tick(c1 * a + c2 * b) * amp;
        amp += damp;
      }
      o += seg;
      i += seg;
    }
  }
}
