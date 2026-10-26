/**
 * Aire y fuego: viento con aullido y hojas, fuego con rugido, chasquidos en
 * racimos y estallidos, y campanillas movidas por el viento.
 */

import { BrownFilter, Control, OnePole, Svf, clamp, smoothRandom } from '../../dsp.js';
import { scaleMidis, midiFrequency, rootIndex } from '../../music.js';
import { noiseAt, subSeed, unitAt } from '../../rng.js';
import { trackParams } from '../../schema.js';
import { BedEnvelope, Particles, natureKit, segments } from './kit.js';
import { MODAL_SETS, createModalVoice } from '../strike.js';

const fold = (i, period) => (period ? i % period : i);

/** Ruido suave periódico a una velocidad dada (se ajusta al bucle). */
function slowRandom(seed, rate, period, sr) {
  const knots = period ? Math.max(1, Math.round((rate * period) / sr)) : 0;
  const r = period ? (knots * sr) / period : rate;
  const f = smoothRandom(seed, knots);
  return (t) => f(t * r);
}

/* ------------------------------------------------------------ viento */

class WindVoice {
  constructor(p, el, ctx, sr, period) {
    this.sr = sr;
    this.period = period;
    const env = new BedEnvelope(el, sr, period);
    const seed = ctx.elementSeed;
    this.s = [1, 2, 3, 4, 5, 6, 7].map((k) => subSeed(seed, k));
    this.strength = clamp(p.strength ?? 0.5, 0, 1);
    this.howl = clamp(p.howl ?? 0, 0, 1);
    this.leaves = clamp(p.leaves ?? 0, 0, 1);
    this.howlPitch = p.howlPitch ?? 420;
    this.bodyL = new Svf(2).set(500, 0.7, sr);
    this.bodyR = new Svf(2).set(520, 0.7, sr);
    this.howlL = new Svf(2).set(this.howlPitch, 22, sr);
    this.howlR = new Svf(2).set(this.howlPitch * 1.01, 22, sr);
    this.hissL = new Svf(1).set(4000, 0.7, sr);
    this.hissR = new Svf(1).set(4000, 0.7, sr);
    this.leafL = new Svf(1).set(2000, 0.7, sr);
    this.leafR = new Svf(1).set(2000, 0.7, sr);
    this.bL = new BrownFilter();
    this.bR = new BrownFilter();
    this.lowL = new OnePole().set(160, sr);
    this.lowR = new OnePole().set(160, sr);
    this.parts = new Particles(sr, subSeed(seed, 30), 64);
    this.tmpL = new Float32Array(1024);
    this.tmpR = new Float32Array(1024);
    this.dumpL = new Float32Array(1024);
    this.dumpR = new Float32Array(1024);
    this.pan = p.pan || 0;
    this.spread = p.spread ?? 1;
    const gust = clamp(p.gustiness ?? 0.5, 0, 1);
    const g1 = slowRandom(subSeed(seed, 40), 0.04 + 0.2 * gust, period, sr);
    const g2 = slowRandom(subSeed(seed, 41), 0.3 + 0.8 * gust, period, sr);
    this.ctl = new Control(3, (i, out) => {
      const t = env.time(i);
      const raw = clamp(0.5 + 0.6 * g1(t) + 0.25 * g2(t), 0, 1);
      const g = (1 - gust) * 0.55 + gust * Math.pow(raw, 1.4);
      out[0] = env.levelAt(i) * (0.5 + 0.5 * env.densityAt(i) / Math.max(0.01, env.density || 0.6));
      out[1] = g;
      out[2] = 250 + 900 * g;
    });
  }
  process(L, R, off, n, i) {
    const { sr, s, parts, period } = this;
    const tl = this.tmpL.subarray(0, n);
    const tr = this.tmpR.subarray(0, n);
    tl.fill(0);
    tr.fill(0);
    segments(this.ctl, off, n, i, (o, seg, ii) => {
      const lvl = this.ctl.value(0, ii);
      let g = this.ctl.value(1, ii);
      const dg = this.ctl.step(1);
      const c = this.ctl.value(2, ii);
      this.bodyL.set(c, 0.7, sr);
      this.bodyR.set(c * 1.04, 0.7, sr);
      const hp = this.howlPitch * (0.8 + 0.5 * g);
      this.howlL.set(hp, 22, sr);
      this.howlR.set(hp * 1.01, 22, sr);
      const leafP = (this.leaves * 500 * g * g) / sr;
      const base = o - off;
      let start = 0;
      const st = this.strength;
      for (let q = 0; q < seg; q++) {
        const j = fold(ii + q, period);
        const wl = noiseAt(s[0], j);
        const wr = noiseAt(s[1], j);
        const body = (0.25 + 0.75 * g) * st * 0.5;
        const low = g * st * 0.9;
        const how = this.howl * g * g * 2.2;
        const hiss = 0.05 * g * st;
        const W = 2.2;
        L[o + q] += W * (this.bodyL.tick(wl) * body + this.lowL.tick(this.bL.tick(wl)) * low + this.howlL.tick(wl) * how + this.hissL.tick(wl) * hiss) * lvl;
        R[o + q] += W * (this.bodyR.tick(wr) * body + this.lowR.tick(this.bR.tick(wr)) * low + this.howlR.tick(wr) * how + this.hissR.tick(wr) * hiss) * lvl;
        g += dg;
        if (leafP > 0 && unitAt(s[2], j) < leafP) {
          parts.process(this.dumpL, this.dumpR, base + start, q - start, tl, tr);
          start = q;
          parts.spawn({ f: 0, clickAmp: lvl * 0.35 * (0.3 + 0.7 * unitAt(s[3], j)), clickTau: 0.0008 + 0.002 * unitAt(s[4], j), pan: clamp(this.pan + this.spread * (unitAt(s[5], j) * 2 - 1), -1, 1) });
        }
      }
      parts.process(this.dumpL, this.dumpR, base + start, seg - start, tl, tr);
    });
    if (this.leaves > 0) {
      for (let q = 0; q < n; q++) {
        L[off + q] += this.leafL.tick(tl[q]);
        R[off + q] += this.leafR.tick(tr[q]);
      }
    }
  }
}

export function compileViento(track, el, ctx) {
  const p = trackParams(track);
  return [{ t: 0, d: el.length, bed: true, create: (sr, i0, period) => new WindVoice(p, el, ctx, sr, period) }];
}

/* ------------------------------------------------------------ fuego */

class FireVoice {
  constructor(p, el, ctx, sr, period) {
    this.sr = sr;
    this.period = period;
    const env = new BedEnvelope(el, sr, period);
    env.audition = !!ctx.audition;
    const seed = ctx.elementSeed;
    this.s = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => subSeed(seed, k));
    this.size = clamp(p.size ?? 0.6, 0, 1);
    this.crackle = p.crackle ?? 4;
    this.pops = p.pops ?? 0.15;
    this.hiss = p.hiss ?? 0.3;
    this.rL = new OnePole().set(220, sr);
    this.rR = new OnePole().set(220, sr);
    this.bL = new BrownFilter();
    this.bR = new BrownFilter();
    this.mL = new Svf(2).set(800, 0.7, sr);
    this.mR = new Svf(2).set(850, 0.7, sr);
    this.hL = new Svf(1).set(3500, 0.7, sr);
    this.hR = new Svf(1).set(3500, 0.7, sr);
    this.cL = new Svf(2).set(3200, 0.6, sr);
    this.cR = new Svf(2).set(3400, 0.6, sr);
    this.parts = new Particles(sr, subSeed(seed, 30), 64);
    this.pops2 = new Particles(sr, subSeed(seed, 31), 8);
    this.tmpL = new Float32Array(1024);
    this.tmpR = new Float32Array(1024);
    this.dumpL = new Float32Array(1024);
    this.dumpR = new Float32Array(1024);
    this.cluster = 0;
    this.clusterDec = Math.exp(-1 / (0.08 * sr));
    this.pan = p.pan || 0;
    this.spread = p.spread ?? 0.5;
    const flick = slowRandom(subSeed(seed, 40), 3, period, sr);
    this.ctl = new Control(3, (i, out) => {
      const t = env.time(i);
      out[0] = env.levelAt(i);
      out[1] = 0.6 + 0.4 * flick(t);
      out[2] = env.densityAt(i) / Math.max(0.01, env.density || 0.6);
    });
    this.first = !!ctx.audition;
  }
  process(L, R, off, n, i) {
    const { sr, s, parts, period } = this;
    const tl = this.tmpL.subarray(0, n);
    const tr = this.tmpR.subarray(0, n);
    tl.fill(0);
    tr.fill(0);
    segments(this.ctl, off, n, i, (o, seg, ii) => {
      const lvl = this.ctl.value(0, ii);
      let fl = this.ctl.value(1, ii);
      const dfl = this.ctl.step(1);
      const act = this.ctl.value(2, ii);
      const roar = this.size * 0.8 * lvl;
      const mid = 0.12 * this.size * lvl;
      const hiss = this.hiss * 0.06 * lvl;
      const clusterP = (this.crackle / 4) * act / sr;
      const popP = this.pops * act / sr;
      const base = o - off;
      let start = 0;
      let pstart = 0;
      for (let q = 0; q < seg; q++) {
        const j = fold(ii + q, period);
        const wl = noiseAt(s[0], j);
        const wr = noiseAt(s[1], j);
        L[o + q] += this.rL.tick(this.bL.tick(wl)) * roar * fl * 2 + this.mL.tick(wl) * mid * fl + this.hL.tick(wl) * hiss;
        R[o + q] += this.rR.tick(this.bR.tick(wr)) * roar * fl * 2 + this.mR.tick(wr) * mid * fl + this.hR.tick(wr) * hiss;
        fl += dfl;
        if (unitAt(s[2], j) < clusterP) this.cluster = 1;
        this.cluster *= this.clusterDec;
        const cp = (this.crackle * 0.3 + this.crackle * 6 * this.cluster) * act / sr;
        if (unitAt(s[3], j) < cp || (this.first && ii + q === 300)) {
          parts.process(this.dumpL, this.dumpR, base + start, q - start, tl, tr);
          start = q;
          parts.spawn({ f: 0, clickAmp: lvl * (0.25 + 0.75 * unitAt(s[4], j)) * 0.7, clickTau: 0.0003 + 0.0012 * unitAt(s[5], j), pan: clamp(this.pan + this.spread * (unitAt(s[6], j) * 2 - 1), -1, 1) });
        }
        if (unitAt(s[7], j) < popP) {
          this.pops2.process(L, R, o + pstart, q - pstart);
          pstart = q;
          this.pops2.spawn({ f: 150 + 250 * unitAt(s[8], j), tau: 0.03, amp: lvl * 0.35, clickAmp: lvl * 0.5, clickTau: 0.002, pan: clamp(this.pan + this.spread * (unitAt(s[6], j + 3) * 2 - 1), -1, 1) });
        }
      }
      parts.process(this.dumpL, this.dumpR, base + start, seg - start, tl, tr);
      this.pops2.process(L, R, o + pstart, seg - pstart);
    });
    for (let q = 0; q < n; q++) {
      L[off + q] += this.cL.tick(tl[q]) * 1.4;
      R[off + q] += this.cR.tick(tr[q]) * 1.4;
    }
  }
}

export function compileFuego(track, el, ctx) {
  const p = trackParams(track);
  return [{ t: 0, d: el.length, bed: true, create: (sr, i0, period) => new FireVoice(p, el, ctx, sr, period) }];
}

/* ------------------------------------------------------------ campanillas */

const CHIME_OCTAVE = { metal: 5, bambu: 4, vidrio: 6 };
const CHIME_DECAY = { metal: 4.5, bambu: 0.35, vidrio: 1.6 };
const CHIME_HARD = { metal: 0.3, bambu: 0.85, vidrio: 0.4 };

export function compileCampanillas(track, el, ctx) {
  const k = natureKit(track, el, ctx);
  const { p, rng } = k;
  const material = p.material || 'metal';
  const oct = CHIME_OCTAVE[material] ?? 5;
  const root = rootIndex(ctx.key.root);
  const start = (oct + 1) * 12 + root;
  const midis = scaleMidis(ctx.key.root, ctx.key.scale, start, start + 30).slice(0, Math.round(p.tubes ?? 5));
  const freqs = midis.map((m) => midiFrequency(m, ctx.a4));
  const pans = k.pans(freqs.length);
  const wind = clamp(p.wind ?? 0.4, 0, 1);
  const out = [];
  let t = k.audition ? 0.05 : rng.exp(1 / (0.08 + 0.5 * wind));
  let last = -1;
  let idx = 0;
  while (t < k.len && out.length < k.budget) {
    if (rng.next() < k.densityAt(t)) {
      const strikes = 2 + Math.round(6 * wind * rng.next());
      const span = rng.range(0.3, 1.8);
      for (let s = 0; s < strikes; s++) {
        const ts = t + (span * s) / strikes + rng.range(0, 0.08);
        if (ts >= k.len) break;
        let tube = rng.int(0, freqs.length - 1);
        if (tube === last && freqs.length > 1) tube = (tube + 1) % freqs.length;
        last = tube;
        const vel = rng.range(0.3, 1);
        const amp = k.levelAt(ts) * vel * 0.36;
        const seed = subSeed(ctx.elementSeed, 1000 + idx++);
        const f = freqs[tube];
        const pan = pans[tube];
        const decay = CHIME_DECAY[material];
        out.push({
          t: ts,
          d: Math.min(30, (decay / 6.91) * 8.1 + 0.05),
          poly: true,
          create: (sr, i0) => createModalVoice({
            modes: MODAL_SETS[material], freq: f, amp, vel, decay, brightness: material === 'bambu' ? 0.3 : 0.6,
            hardness: CHIME_HARD[material], inharmonic: 0, beat: material === 'metal' ? 0.5 : 0, attack: 0.0005, pan, seed, sr, i0,
          }),
        });
      }
    }
    t += k.audition ? 10 : rng.exp(1 / (0.08 + 0.5 * wind));
  }
  return out;
}
