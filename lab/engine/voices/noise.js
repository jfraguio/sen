/**
 * Ruidos: ruido de color filtrado con ráfagas u oleaje y decorrelación
 * estéreo.
 */

import {
  CONTROL_STEP, ColoredNoise, Control, ElementEnvelope, FILTER_MODES, Svf, clamp, quantizeFreq, smoothRandom,
} from '../dsp.js';
import { subSeed } from '../rng.js';
import { trackParams } from '../schema.js';

export function compileNoiseElement(track, el, ctx) {
  const p = trackParams(track);
  return [{
    t: 0,
    d: el.length,
    bed: true,
    create: (sr, i0, period) => new NoiseVoice(p, el, ctx.elementSeed, sr, period),
  }];
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
