/**
 * Agua: gotas sueltas, lluvia, arroyo y olas.
 */

import {
  BrownFilter, ColoredNoise, Control, OnePole, Svf, clamp, smoothRandom,
} from '../../dsp.js';
import { noiseAt, subSeed, unitAt } from '../../rng.js';
import { trackParams } from '../../schema.js';
import { BedEnvelope, Particles, natureKit, segments } from './kit.js';
import { swellShape } from '../noise.js';

const bed = (create) => (track, el, ctx) => {
  const p = trackParams(track);
  return [{ t: 0, d: el.length, bed: true, create: (sr, i0, period) => create(p, el, ctx, sr, period) }];
};

/** Índice para el azar por contador (plegado en voces permanentes). */
const fold = (i, period) => (period ? i % period : i);

/* ------------------------------------------------------------ gotas */

const DROP_SURFACES = {
  agua: (u, lo, hi) => {
    const f = lo * Math.pow(hi / lo, u[0]);
    return { f, tau: clamp(28 / f, 0.006, 0.05), rise: 0.15 + 0.35 * u[1], amp: 0.3 + 0.7 * u[2], clickAmp: 0.04, clickTau: 0.0005 };
  },
  hoja: (u, lo, hi) => {
    const a = Math.max(lo, 1300);
    const b = Math.max(hi, a * 1.5);
    return { f: a * Math.pow(b / a, u[0]), tau: 0.005 + 0.006 * u[1], rise: 0, amp: 0.15 + 0.2 * u[2], clickAmp: 0.4 * (0.5 + 0.5 * u[2]), clickTau: 0.0012 };
  },
  cristal: (u, lo, hi) => {
    const a = Math.max(lo, 2500);
    const b = Math.max(hi, a * 1.4);
    return { f: a * Math.pow(b / a, u[0]), tau: 0.02 + 0.02 * u[1], rise: 0, amp: 0.15 + 0.15 * u[2], clickAmp: 0.25, clickTau: 0.0004 };
  },
  piedra: (u) => ({ f: 150 + 170 * u[0], tau: 0.012 + 0.01 * u[1], rise: 0, amp: 0.3 + 0.2 * u[2], clickAmp: 0.5 * (0.5 + 0.5 * u[2]), clickTau: 0.0018 }),
};

class DropsVoice {
  constructor(p, el, ctx, sr, period) {
    this.sr = sr;
    this.period = period;
    const env = new BedEnvelope(el, sr, period);
    env.audition = !!ctx.audition;
    const seed = ctx.elementSeed;
    this.seeds = [1, 2, 3, 4, 5].map((k) => subSeed(seed, k));
    this.parts = new Particles(sr, subSeed(seed, 9), 64);
    this.make = DROP_SURFACES[p.surface] || DROP_SURFACES.agua;
    this.lo = p.pitch?.[0] ?? 900;
    this.hi = p.pitch?.[1] ?? 3200;
    this.pan = p.pan || 0;
    this.spread = p.spread ?? 0.7;
    const rate = p.rate ?? 4;
    this.ctl = new Control(2, (i, out) => {
      out[0] = env.levelAt(i);
      out[1] = rate * env.densityAt(i);
    });
    this.first = !!ctx.audition;
  }
  process(L, R, off, n, i) {
    const { sr, seeds, parts, period } = this;
    segments(this.ctl, off, n, i, (o, seg, ii) => {
      const lvl = this.ctl.value(0, ii);
      const prob = this.ctl.value(1, ii) / sr;
      let start = 0;
      for (let s = 0; s < seg; s++) {
        const j = fold(ii + s, period);
        if (unitAt(seeds[0], j) < prob || (this.first && ii + s === 200)) {
          parts.process(L, R, o + start, s - start);
          start = s;
          const u = [unitAt(seeds[1], j), unitAt(seeds[2], j), unitAt(seeds[3], j)];
          const d = this.make(u, this.lo, this.hi);
          parts.spawn({ ...d, amp: d.amp * lvl * 1.1, clickAmp: d.clickAmp * lvl * 1.1, pan: clamp(this.pan + this.spread * (unitAt(seeds[4], j) * 2 - 1), -1, 1) });
        }
      }
      parts.process(L, R, o + start, seg - start);
    });
  }
}

export const compileGotas = bed((p, el, ctx, sr, period) => new DropsVoice(p, el, ctx, sr, period));

/* ------------------------------------------------------------ lluvia */

const RAIN_SURFACES = {
  hojas: { f: 2600, q: 0.9, hiss: 1, ping: 0.012, kind: 'hoja', gain: 1 },
  tejado: { f: 1100, q: 0.8, hiss: 0.6, ping: 0, lp: 3500, gain: 1.2 },
  cristal: { f: 3400, q: 2.2, hiss: 0.8, ping: 0.03, kind: 'cristal', gain: 0.8 },
  agua: { f: 1800, q: 0.6, hiss: 0.9, ping: 0.05, kind: 'agua', gain: 0.9 },
  lona: { f: 260, q: 2.2, hiss: 0.3, ping: 0, lp: 1200, gain: 2.2 },
};

class RainVoice {
  constructor(p, el, ctx, sr, period) {
    this.sr = sr;
    this.period = period;
    const env = new BedEnvelope(el, sr, period);
    env.audition = !!ctx.audition;
    const seed = ctx.elementSeed;
    this.s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => subSeed(seed, k));
    this.surf = RAIN_SURFACES[p.surface] || RAIN_SURFACES.hojas;
    this.hissL = new ColoredNoise(subSeed(seed, 20), 'rosa', period);
    this.hissR = new ColoredNoise(subSeed(seed, 21), 'rosa', period);
    this.hpL = new Svf(1).set(500, 0.7, sr);
    this.hpR = new Svf(1).set(500, 0.7, sr);
    this.lpL = new Svf(0).set(7500, 0.7, sr);
    this.lpR = new Svf(0).set(7500, 0.7, sr);
    this.fL = new Svf(2).set(this.surf.f, this.surf.q, sr);
    this.fR = new Svf(2).set(this.surf.f * 1.07, this.surf.q, sr);
    this.oL = this.surf.lp ? new OnePole().set(this.surf.lp, sr) : null;
    this.oR = this.surf.lp ? new OnePole().set(this.surf.lp, sr) : null;
    this.parts = new Particles(sr, subSeed(seed, 30), 48);
    this.pingMake = DROP_SURFACES[this.surf.kind] || null;
    this.pan = p.pan || 0;
    this.spread = p.spread ?? 1;
    const knots = period ? Math.max(1, Math.round((0.05 * period) / sr)) : 0;
    const rate = period ? (knots * sr) / period : 0.05;
    const mod = smoothRandom(subSeed(seed, 40), knots);
    const vari = p.variation ?? 0.5;
    const I = p.intensity ?? 600;
    this.ctl = new Control(2, (i, out) => {
      out[0] = env.levelAt(i);
      out[1] = I * env.densityAt(i) * (1 + 0.35 * vari * mod(env.time(i) * rate));
    });
  }
  process(L, R, off, n, i) {
    const { sr, s, surf, parts, period } = this;
    segments(this.ctl, off, n, i, (o, seg, ii) => {
      const lvl = this.ctl.value(0, ii);
      const rate = Math.max(0, this.ctl.value(1, ii));
      const p1 = rate / (2 * sr);
      const hissAmp = 0.33 * Math.sqrt(rate / 600) * surf.hiss * lvl;
      const impAmp = 2.7 * surf.gain * lvl;
      const pingP = Math.min(80, rate * surf.ping) / sr;
      let start = 0;
      for (let q = 0; q < seg; q++) {
        const j = fold(ii + q, period);
        let il = 0;
        let ir = 0;
        if (unitAt(s[0], j) < p1) {
          const v = noiseAt(s[1], j);
          il = v * Math.abs(v) + 0.3 * v;
        }
        if (unitAt(s[2], j) < p1) {
          const v = noiseAt(s[3], j);
          ir = v * Math.abs(v) + 0.3 * v;
        }
        let xl = this.fL.tick(il) * impAmp;
        let xr = this.fR.tick(ir) * impAmp;
        if (this.oL) {
          xl = this.oL.tick(xl);
          xr = this.oR.tick(xr);
        }
        xl += this.lpL.tick(this.hpL.tick(this.hissL.at(ii + q))) * hissAmp;
        xr += this.lpR.tick(this.hpR.tick(this.hissR.at(ii + q))) * hissAmp;
        L[o + q] += xl;
        R[o + q] += xr;
        if (this.pingMake && unitAt(s[4], j) < pingP) {
          parts.process(L, R, o + start, q - start);
          start = q;
          const d = this.pingMake([unitAt(s[5], j), unitAt(s[6], j), unitAt(s[7], j)], 900, 4200);
          parts.spawn({ ...d, amp: d.amp * lvl * 1, clickAmp: d.clickAmp * lvl * 1, pan: clamp(this.pan + this.spread * (unitAt(s[8], j) * 2 - 1), -1, 1) });
        }
      }
      parts.process(L, R, o + start, seg - start);
    });
  }
}

export const compileLluvia = bed((p, el, ctx, sr, period) => new RainVoice(p, el, ctx, sr, period));

/* ------------------------------------------------------------ arroyo */

class StreamVoice {
  constructor(p, el, ctx, sr, period) {
    this.sr = sr;
    this.period = period;
    const env = new BedEnvelope(el, sr, period);
    env.audition = !!ctx.audition;
    const seed = ctx.elementSeed;
    this.s = [1, 2, 3, 4, 5, 6].map((k) => subSeed(seed, k));
    this.nL = new ColoredNoise(subSeed(seed, 10), 'rosa', period);
    this.nR = new ColoredNoise(subSeed(seed, 11), 'rosa', period);
    this.hpL = new Svf(1).set(300, 0.7, sr);
    this.hpR = new Svf(1).set(300, 0.7, sr);
    this.lpL = new Svf(0).set(4500, 0.7, sr);
    this.lpR = new Svf(0).set(4500, 0.7, sr);
    this.bL = new BrownFilter();
    this.bR = new BrownFilter();
    this.rl = new OnePole().set(180, sr);
    this.rr = new OnePole().set(180, sr);
    this.parts = new Particles(sr, subSeed(seed, 30), 64);
    const N = Math.round(p.sources ?? 10);
    const [lo, hi] = p.register || [450, 2200];
    this.centers = Array.from({ length: N }, (_, k) => lo * Math.pow(hi / lo, unitAt(subSeed(seed, 50), k)));
    this.pans = Array.from({ length: N }, (_, k) => clamp((p.pan || 0) + (p.spread ?? 0.8) * (unitAt(subSeed(seed, 51), k) * 2 - 1), -1, 1));
    this.flow = clamp(p.flow ?? 0.55, 0, 1);
    const knots = period ? Math.max(1, Math.round((11 * period) / sr)) : 0;
    const tr = period ? (knots * sr) / period : 11;
    const turb = smoothRandom(subSeed(seed, 40), knots);
    const flow = this.flow;
    this.ctl = new Control(3, (i, out) => {
      out[0] = env.levelAt(i);
      out[1] = N * (2 + 10 * flow) * env.densityAt(i);
      out[2] = 1 - 0.45 * (0.5 + 0.5 * turb(env.time(i) * tr));
    });
  }
  process(L, R, off, n, i) {
    const { sr, s, parts, period, flow } = this;
    segments(this.ctl, off, n, i, (o, seg, ii) => {
      const lvl = this.ctl.value(0, ii);
      const prob = this.ctl.value(1, ii) / sr;
      let am = this.ctl.value(2, ii);
      const dam = this.ctl.step(2);
      const flowAmp = (0.05 + 0.18 * flow) * lvl;
      const rumble = 0.15 * flow * lvl;
      let start = 0;
      for (let q = 0; q < seg; q++) {
        const j = fold(ii + q, period);
        const wl = this.nL.at(ii + q);
        const wr = this.nR.at(ii + q);
        L[o + q] += this.lpL.tick(this.hpL.tick(wl)) * flowAmp * am + this.rl.tick(this.bL.tick(noiseAt(s[4], j))) * rumble;
        R[o + q] += this.lpR.tick(this.hpR.tick(wr)) * flowAmp * am + this.rr.tick(this.bR.tick(noiseAt(s[5], j))) * rumble;
        am += dam;
        if (unitAt(s[0], j) < prob) {
          parts.process(L, R, o + start, q - start);
          start = q;
          const src = Math.min(this.centers.length - 1, Math.floor(unitAt(s[1], j) * this.centers.length));
          const f = this.centers[src] * (0.85 + 0.3 * unitAt(s[2], j));
          parts.spawn({ f, tau: clamp(30 / f, 0.008, 0.06), rise: 0.1 + 0.3 * unitAt(s[3], j), amp: (0.2 + 0.35 * unitAt(s[2], j + 7)) * lvl * 0.42, pan: this.pans[src] });
        }
      }
      parts.process(L, R, o + start, seg - start);
    });
  }
}

export const compileArroyo = bed((p, el, ctx, sr, period) => new StreamVoice(p, el, ctx, sr, period));

/* ------------------------------------------------------------ olas */

class SurfVoice {
  constructor(p, el, ctx, sr, period) {
    this.period = period;
    const env = new BedEnvelope(el, sr, period);
    const seed = ctx.elementSeed;
    this.bl = new ColoredNoise(subSeed(seed, 1), 'marron', period);
    this.br = new ColoredNoise(subSeed(seed, 2), 'marron', period);
    this.pl = new ColoredNoise(subSeed(seed, 3), 'rosa', period);
    this.pr = new ColoredNoise(subSeed(seed, 4), 'rosa', period);
    this.ll = new Svf(0).set(350, 0.7, sr);
    this.lr = new Svf(0).set(350, 0.7, sr);
    this.ml = new Svf(0).set(1200, 0.7, sr);
    this.mr = new Svf(0).set(1200, 0.7, sr);
    const size = p.size ?? 0.6;
    const wp = period ? period / sr / Math.max(1, Math.round(period / sr / (p.period || 9))) : p.period || 9;
    this.ctl = new Control(1, (i, out) => {
      out[0] = env.levelAt(i) * (0.2 + 0.3 * size) * (0.75 + 0.25 * swellShape(env.time(i) / wp, 0.4));
    });
  }
  process(L, R, off, n, i) {
    segments(this.ctl, off, n, i, (o, seg, ii) => {
      let a = this.ctl.value(0, ii);
      const da = this.ctl.step(0);
      for (let q = 0; q < seg; q++) {
        const k = ii + q;
        L[o + q] += (this.ll.tick(this.bl.at(k)) * 1.6 + this.ml.tick(this.pl.at(k)) * 0.3) * a;
        R[o + q] += (this.lr.tick(this.br.at(k)) * 1.6 + this.mr.tick(this.pr.at(k)) * 0.3) * a;
        a += da;
      }
    });
  }
}

class WaveVoice {
  constructor({ size, foam, pebbles, crash, wash, amp, pan, spread, seed, sr }) {
    this.sr = sr;
    this.seed = seed;
    this.sl = subSeed(seed, 1);
    this.sr2 = subSeed(seed, 2);
    this.swL = new Svf(0).set(240 + 360 * size, 0.7, sr);
    this.swR = new Svf(0).set(240 + 360 * size, 0.7, sr);
    this.crL = new Svf(0).set(1500 + 3500 * size, 0.6, sr);
    this.crR = new Svf(0).set(1500 + 3500 * size, 0.6, sr);
    this.foL = new Svf(1).set(1800, 0.7, sr);
    this.foR = new Svf(1).set(1800, 0.7, sr);
    this.peL = new Svf(2).set(3500, 1, sr);
    this.peR = new Svf(2).set(3500, 1, sr);
    this.bL = new BrownFilter();
    this.bR = new BrownFilter();
    this.parts = new Particles(sr, subSeed(seed, 3), 32);
    this.tmpL = new Float32Array(1024);
    this.tmpR = new Float32Array(1024);
    this.dumpL = new Float32Array(1024);
    this.dumpR = new Float32Array(1024);
    this.pebbles = pebbles;
    this.pan = pan;
    this.spread = spread;
    const tc = crash;
    this.ctl = new Control(4, (i, out) => {
      const t = i / sr;
      const after = t - tc;
      out[0] = amp * (after < 0 ? Math.pow(Math.max(0, t / tc), 2) : Math.exp(-after / (0.9 + size))) * (0.5 + 0.6 * size);
      out[1] = after < 0 ? 0 : amp * (1 - Math.exp(-after / 0.06)) * Math.exp(-after / (0.6 + 0.7 * size)) * (0.5 + 0.5 * size);
      const fe = after < 0 ? 0 : Math.min(1, after / 0.3) * Math.exp(-after / (wash * 0.45));
      out[2] = amp * fe * foam * 0.5;
      out[3] = after > wash * 0.25 && after < wash ? fe * pebbles : 0;
    });
  }
  process(L, R, off, n, i) {
    const { sr, parts } = this;
    const tl = this.tmpL.subarray(0, n);
    const tr = this.tmpR.subarray(0, n);
    tl.fill(0);
    tr.fill(0);
    segments(this.ctl, off, n, i, (o, seg, ii) => {
      let sw = this.ctl.value(0, ii);
      const dsw = this.ctl.step(0);
      let cr = this.ctl.value(1, ii);
      const dcr = this.ctl.step(1);
      let fo = this.ctl.value(2, ii);
      const dfo = this.ctl.step(2);
      const pe = this.ctl.value(3, ii);
      const p = (400 * pe) / sr;
      let start = 0;
      const base = o - off;
      for (let q = 0; q < seg; q++) {
        const k = ii + q;
        const a = noiseAt(this.sl, k);
        const b = noiseAt(this.sr2, k) * 0.8 + a * 0.6;
        const crk = 0.4 + 0.6 * Math.abs(noiseAt(this.seed, k));
        L[o + q] += this.swL.tick(this.bL.tick(a)) * sw * 2 + this.crL.tick(a) * cr + this.foL.tick(a) * crk * fo;
        R[o + q] += this.swR.tick(this.bR.tick(b)) * sw * 2 + this.crR.tick(b) * cr + this.foR.tick(b) * crk * fo;
        sw += dsw;
        cr += dcr;
        fo += dfo;
        if (p > 0 && unitAt(this.seed + 17, k) < p) {
          parts.process(this.dumpL, this.dumpR, base + start, q - start, tl, tr);
          start = q;
          parts.spawn({ f: 0, clickAmp: 0.6 * this.ctl.value(3, ii) * (0.3 + 0.7 * unitAt(this.seed + 19, k)), clickTau: 0.0006, pan: clamp(this.pan + this.spread * (unitAt(this.seed + 23, k) * 2 - 1), -1, 1) });
        }
      }
      parts.process(this.dumpL, this.dumpR, base + start, seg - start, tl, tr);
    });
    if (this.pebbles > 0) {
      for (let q = 0; q < n; q++) {
        L[off + q] += this.peL.tick(tl[q]) * 0.8;
        R[off + q] += this.peR.tick(tr[q]) * 0.8;
      }
    }
  }
}

export function compileOlas(track, el, ctx) {
  const k = natureKit(track, el, ctx);
  const { p, rng } = k;
  const out = [{ t: 0, d: el.length, bed: true, create: (sr, i0, period) => new SurfVoice(p, el, ctx, sr, period) }];
  const per = p.period || 9;
  let t = k.audition ? 0 : rng.range(0, per);
  let idx = 0;
  while (t < k.len) {
    const size = clamp((p.size ?? 0.6) * rng.range(1 - 0.4 * k.variation, 1 + 0.25 * k.variation), 0.05, 1);
    const crash = k.audition ? 1.2 : per * rng.range(0.3, 0.45) * (0.7 + 0.3 * size);
    const wash = per * 0.55 * (0.7 + 0.5 * size);
    const amp = k.levelAt(Math.min(k.len, t + 1)) * (k.audition ? 1 : Math.min(1, 0.4 + k.densityAt(t))) * 0.75;
    const pan = clamp((p.pan || 0) + (p.spread ?? 0.9) * 0.3 * (rng.next() * 2 - 1), -1, 1);
    const seed = subSeed(ctx.elementSeed, 100 + idx++);
    const d = Math.min(30, crash + wash * 2.2);
    if (amp > 0.0003 && rng.next() < 0.3 + 0.7 * k.densityAt(t)) {
      out.push({ t, d, create: (sr) => new WaveVoice({ size, foam: p.foam ?? 0.5, pebbles: p.pebbles ?? 0, crash, wash, amp, pan, spread: (p.spread ?? 0.9) * 0.6, seed, sr }) });
    }
    t += per * rng.range(1 - 0.15 * k.variation, 1 + 0.15 * k.variation);
  }
  return out;
}

