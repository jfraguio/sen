/**
 * Grillos (llamadas de pulsos con portadora casi pura) y cigarras (zumbido
 * pulsado en tandas).
 */

import { CONTROL_STEP, Control, Svf, panGains, sineCycle } from '../../dsp.js';
import { noiseAt, subSeed } from '../../rng.js';
import { natureKit, syl, syllableEvent } from './kit.js';

export function compileGrillo(track, el, ctx) {
  const k = natureKit(track, el, ctx);
  const { p, rng } = k;
  const n = Math.round(p.individuals);
  const pans = k.pans(n);
  const shared = rng.next();
  const out = [];
  for (let j = 0; j < n && out.length < k.budget; j++) {
    const f = rng.range(p.pitch[0], p.pitch[1]);
    const period = (1 / p.callRate) * rng.range(0.85, 1.15);
    const pulses = Math.max(1, Math.min(8, Math.round(p.pulses) + (rng.chance(k.variation * 0.4) ? rng.int(-1, 1) : 0)));
    const pulseDur = rng.range(0.012, 0.02);
    const pulseGap = rng.range(0.03, 0.042);
    const lvl = rng.range(0.55, 1);
    const seed = subSeed(ctx.elementSeed, j);
    let t = k.audition ? 0.05 + j * 0.09 : (p.sync * shared + (1 - p.sync) * rng.next()) * period;
    let silentUntil = -1;
    const dur = (pulses - 1) * pulseGap + pulseDur;
    while (t < k.len && out.length < k.budget) {
      if (t >= silentUntil) {
        if (!k.audition && rng.next() < 0.012 * k.variation) silentUntil = t + rng.range(1, 4);
        else if (rng.next() < k.densityAt(t)) {
          const g = k.levelAt(t) * lvl * rng.range(0.85, 1) * 0.48;
          const fp = f * (1 + (rng.next() - 0.5) * 0.004);
          if (g > 0.0003) {
            out.push(syllableEvent(t, () => {
              const list = [];
              for (let q = 0; q < pulses; q++) {
                list.push(syl(q * pulseGap, pulseDur, fp * 1.012, fp * 0.988, { h2: 0.05, h3: 0.03, attack: 0.3, curve: 0.55, amp: q === 0 ? 0.75 : 1 }));
              }
              return list;
            }, { pan: pans[j], amp: g, seed, dur }));
          }
        }
      }
      t += period * (1 + (rng.next() - 0.5) * 0.08 * (0.3 + k.variation));
    }
  }
  return out;
}

export function compileCigarra(track, el, ctx) {
  const k = natureKit(track, el, ctx);
  const { p, rng } = k;
  const n = Math.round(p.individuals);
  const pans = k.pans(n);
  const out = [];
  for (let j = 0; j < n; j++) {
    const f = rng.range(p.pitch[0], p.pitch[1]);
    const pulseRate = rng.range(150, 240);
    const echeme = rng.range(5, 7.5);
    const lvl = rng.range(0.6, 1);
    let t = k.audition ? 0.02 : rng.range(0, 3);
    while (t < k.len) {
      const len = k.audition ? 3 : rng.range(p.bout[0], p.bout[1]);
      if (rng.next() < k.densityAt(t)) {
        const g = k.levelAt(Math.min(k.len, t + Math.min(1, len / 3))) * lvl * 1.8;
        const seed = subSeed(ctx.elementSeed, out.length + 100);
        const pan = pans[j];
        out.push({ t, d: len, create: (sr, i0) => new CicadaVoice({ f, pulseRate, echeme, len, amp: g, pan, seed, sr }) });
      }
      t += len + (k.audition ? 10 : rng.range(p.rest[0], p.rest[1]));
    }
  }
  return out;
}

class CicadaVoice {
  constructor({ f, pulseRate, echeme, len, amp, pan, seed, sr }) {
    this.sr = sr;
    this.f = f;
    this.seed = seed;
    this.bp = new Svf(2).set(f, 3, sr);
    this.bp2 = new Svf(2).set(f * 1.12, 2.5, sr);
    [this.gl, this.gr] = panGains(pan);
    this.ctl = new Control(1, (i, out) => {
      const t = i / sr;
      const u = t / len;
      out[0] = amp * Math.min(1, u * 4) * Math.max(0, Math.min(1, (1 - u) * 3));
    });
    this.pulseRate = pulseRate;
    this.echeme = echeme;
  }
  process(L, R, off, n, i) {
    const { sr, ctl } = this;
    const end = off + n;
    let o = off;
    while (o < end) {
      const a0 = ctl.prepare(i);
      const seg = Math.min(end - o, a0 + CONTROL_STEP - i);
      let a = ctl.value(0, i);
      const da = ctl.step(0);
      for (let s = 0; s < seg; s++) {
        const t = (i + s) / sr;
        const am = Math.pow(0.5 + 0.5 * sineCycle(this.pulseRate * t), 3);
        const gate = 0.5 + 0.5 * Math.tanh(5 * sineCycle(this.echeme * t));
        const w = noiseAt(this.seed, i + s);
        const x = (sineCycle(this.f * t) * 0.35 + this.bp.tick(w) * 0.9 + this.bp2.tick(w) * 0.4) * am * gate * a;
        L[o + s] += x * this.gl;
        R[o + s] += x * this.gr;
        a += da;
      }
      o += seg;
      i += seg;
    }
  }
}
