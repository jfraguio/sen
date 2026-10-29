/**
 * Capas de pistas de sen: reproducen en bucle una capa de una pista de la app
 * (lluvia, pájaros, pad, melodía…) que llega ya calculada en `ctx.samples`.
 *
 * La capa es un bucle de `data.length` muestras a `rate` Hz. La voz la lee
 * con interpolación lineal a la frecuencia del motor; a la misma frecuencia y
 * sin desfase fraccionario, la lectura es exacta muestra a muestra.
 */

import { ElementEnvelope } from '../dsp.js';
import { layerKey } from '../schema.js';

/** Busca el audio de una capa en un `Map` o en un objeto `{ clave: { rate, data } }`. */
export function layerSample(samples, source) {
  if (!samples || !source) return null;
  const key = layerKey(source);
  const s = typeof samples.get === 'function' ? samples.get(key) : samples[key];
  return s && s.data && s.data.length && s.rate > 0 ? s : null;
}

export function compileLayerElement(track, el, ctx) {
  const sample = layerSample(ctx.samples, track.source);
  if (!sample) return [];
  return [{
    t: 0,
    d: el.length,
    bed: true,
    create: (sr, i0, period) => new ClipVoice(sample, el, sr, period),
  }];
}

class ClipVoice {
  constructor(sample, el, sr, period) {
    this.data = sample.data;
    this.n = sample.data.length;
    this.step = sample.rate / sr;
    this.offset = (el.offset || 0) * sample.rate;
    this.period = period;
    this.env = new ElementEnvelope(el, sr, period);
    const flatCurve = el.curve === 'plana' || el.curve === undefined;
    this.constGain = flatCurve && (period || (!(el.fadeIn > 0) && !(el.fadeOut > 0))) ? this.env.gainAt(0) : null;
  }
  process(L, R, off, n, i) {
    const { data, n: len, step, offset, period, env } = this;
    let g0 = this.constGain ?? env.gainAt(i);
    const g1 = this.constGain ?? env.gainAt(i + n);
    const dg = (g1 - g0) / n;
    for (let q = 0; q < n; q++) {
      const k = i + q;
      const t = period ? k % period : k;
      let pos = (t * step + offset) % len;
      if (pos < 0) pos += len;
      const a = pos | 0;
      const f = pos - a;
      const x0 = data[a];
      const y = (f === 0 ? x0 : x0 + (data[a + 1 === len ? 0 : a + 1] - x0) * f) * g0;
      L[off + q] += y;
      R[off + q] += y;
      g0 += dg;
    }
  }
}
