/**
 * Notas sostenidas: pad, drone, cuerdas, flauta suave, coro, vidrio, seno y
 * los sintetizadores analógicos de estética ochentera (pad, metales, bajo y
 * lead).
 *
 * Cada nota de un elemento `tone` es una voz con varias subvoces desafinadas
 * (unísono), timbre por tabla de onda o parciales, filtro de estado variable y
 * moduladores (vibrato, deriva, trémolo, barrido y envolvente de filtro).
 */

import {
  CONTROL_STEP, Control, ElementEnvelope, FILTER_MODES, Svf, clamp, makeWavetable, panGains,
  quantizeFreq, sineCycle, smoothRandom, WAVETABLE_SIZE,
} from '../dsp.js';
import { noteFrequency } from '../music.js';
import { createRng, noiseAt, subSeed } from '../rng.js';
import { trackParams } from '../schema.js';

const VOWEL_FORMANTS = [[800, 1150, 2900], [450, 800, 2830], [325, 700, 2530]];
const FORMANT_GAINS = [1, 0.55, 0.3];
/** Armónicos de la flauta suave: casi senoidal. */
const FLUTE_HARMONICS = [1, 0.14, 0.05, 0.015];

/** Voces de unísono de una nota (los instrumentos sin el parámetro tienen una). */
function unison(inst, p) {
  if (inst === 'seno' || inst === 'flauta' || !Number.isFinite(p.voices)) return 1;
  return Math.max(1, Math.round(p.voices));
}

export function compileSustainElement(track, el, ctx) {
  const p = trackParams(track);
  const notes = el.notes.slice(0, 8);
  const noteGain = 1 / Math.sqrt(notes.length);
  return notes.map((note, k) => {
    const f = noteFrequency(note, ctx.a4);
    const seed = subSeed(ctx.elementSeed, k);
    return {
      t: 0,
      d: el.length,
      bed: true,
      voices: unison(track.instrument, p),
      create: (sr, i0, period) => new SustainVoice(track.instrument, p, el, f, noteGain, seed, sr, i0, period),
    };
  });
}

class SustainVoice {
  constructor(inst, p, el, f, noteGain, seed, sr, i0, period) {
    this.sr = sr;
    this.period = period;
    const rng = createRng(seed);
    const V = unison(inst, p);
    this.V = V;
    this.env = new ElementEnvelope(el, sr, period);
    this.inc = new Float64Array(V);
    this.phase = new Float64Array(V);
    this.gl = new Float64Array(V);
    this.gr = new Float64Array(V);
    const norm = 1 / Math.sqrt(V);
    const width = clamp(p.width ?? 0, 0, 1);
    for (let v = 0; v < V; v++) {
      const spread = V > 1 ? (v / (V - 1)) * 2 - 1 : 0;
      const cents = (p.detune || 0) * spread + (V > 1 ? (rng.next() - 0.5) * 0.3 * (p.detune || 0) : 0);
      let fv = f * Math.pow(2, cents / 1200);
      if (inst === 'drone' && V > 1) fv += (p.beat || 0) * spread * 0.5;
      fv = quantizeFreq(fv, period, sr);
      this.inc[v] = fv / sr;
      const ph0 = rng.next();
      const ph = ph0 + this.inc[v] * i0;
      this.phase[v] = ph - Math.floor(ph);
      const [l, r] = panGains(width * spread * 0.9);
      this.gl[v] = l * norm;
      this.gr[v] = r * norm;
    }
    // Timbre
    this.kind = inst === 'seno' ? 'sine' : inst === 'vidrio' ? 'partials' : 'table';
    const maxH = Math.max(1, Math.floor((0.45 * sr) / (f * 1.08)));
    if (this.kind === 'table' && inst === 'flauta') {
      const amps = FLUTE_HARMONICS.slice(0, Math.min(maxH, FLUTE_HARMONICS.length));
      this.table = makeWavetable(amps, amps.map(() => rng.next()));
    } else if (this.kind === 'table') {
      const H = Math.min(maxH, Math.max(1, Math.round(p.partials || 1)));
      const amps = [];
      const phases = [];
      const wave = p.wave || null;
      const pulseWidth = clamp(p.pulseWidth ?? 0.5, 0.05, 0.95);
      for (let h = 1; h <= H; h++) {
        let a = Math.pow(h, -(p.rolloff || 1));
        if (wave === 'pulso') a *= Math.abs(Math.sin(Math.PI * h * pulseWidth));
        else if (wave === 'cuadrada') a *= h % 2 ? 1 : 0;
        else if (wave === 'triangulo') a *= h % 2 ? (h % 4 === 1 ? 1 : -1) : 0;
        else if (inst === 'drone' && h % 2 === 0) a *= 0.7;
        amps.push(a);
        phases.push(wave || inst === 'cuerdas' ? 0 : rng.next());
      }
      this.table = makeWavetable(amps, phases);
    } else if (this.kind === 'partials') {
      const B = (p.inharmonic || 0) * 0.02;
      const ratios = [];
      const amps = [];
      for (let h = 1; h <= Math.round(p.partials || 6); h++) {
        const r = h * Math.sqrt(1 + B * (h * h - 1)) * (1 + (h > 1 ? (rng.next() - 0.5) * 0.02 * (p.inharmonic || 0) : 0));
        if (f * r > 0.45 * sr) break;
        ratios.push(r);
        amps.push(Math.pow(h, -(p.rolloff || 1)));
      }
      const sum = amps.reduce((a, b) => a + b, 0) || 1;
      this.pRatio = Float64Array.from(ratios);
      this.pAmp = Float64Array.from(amps.map((a) => a / sum * 1.6));
      this.pPhase = Float64Array.from(ratios.map(() => rng.next()));
      if (period) {
        for (let k = 0; k < this.pRatio.length; k++) this.pRatio[k] = quantizeFreq(f * this.pRatio[k], period, sr) / f;
      }
      this.pInc = new Float64Array(V * ratios.length);
      this.pPh = new Float64Array(V * ratios.length);
      for (let v = 0; v < V; v++) {
        for (let k = 0; k < ratios.length; k++) {
          const inc = this.inc[v] * this.pRatio[k];
          this.pInc[v * ratios.length + k] = inc;
          const ph = this.pPhase[k] + rng.next() * 0.1 + inc * i0;
          this.pPh[v * ratios.length + k] = ph - Math.floor(ph);
        }
      }
    }
    // Subgrave (drone y sintetizadores analógicos)
    this.sub = (p.sub || 0) * 0.7;
    if (this.sub) {
      this.subInc = quantizeFreq(f / 2, period, sr) / sr;
      const ph = rng.next() + this.subInc * i0;
      this.subPh = ph - Math.floor(ph);
    }
    // Formantes del coro
    this.formants = null;
    if (inst === 'coro') {
      const v = clamp(p.vowel ?? 0.3, 0, 1) * 2;
      const a = Math.min(1, Math.floor(v));
      const u = v - a;
      this.formants = [0, 1].map(() => VOWEL_FORMANTS[0].map((_, k) => {
        const fk = VOWEL_FORMANTS[a][k] + (VOWEL_FORMANTS[Math.min(2, a + 1)][k] - VOWEL_FORMANTS[a][k]) * u;
        return new Svf(2).set(fk, clamp(fk / 90, 2, 12), sr);
      }));
    }
    // Soplo de la flauta: ruido en banda alrededor del tercer armónico.
    this.breath = inst === 'flauta' ? clamp(p.breath ?? 0, 0, 1) * 0.14 : 0;
    if (this.breath) {
      this.breathSeed = subSeed(seed, 7);
      this.bl = new Svf(2).set(Math.min(4000, f * 3), 1.4, sr);
      this.br = new Svf(2).set(Math.min(4000, f * 3.1), 1.4, sr);
    }
    // Filtro
    const mode = FILTER_MODES[p.filterType] ?? 0;
    this.fl = new Svf(mode);
    this.fr = new Svf(mode);
    this.q = p.q ?? 0.7;
    this.useFilter = this.kind !== 'sine' || mode !== 0 || (p.cutoff ?? 18000) < 16000;
    if (inst === 'seno') this.useFilter = false;
    // Moduladores
    const q = (r) => quantizeFreq(r, period, sr);
    const vibRate = q(p.vibratoRate || 4.5);
    const tremRate = q(p.tremoloRate || 0.2);
    const sweepRate = q(p.sweepRate || 0.05);
    const vibDepth = p.vibratoDepth || 0;
    const tremDepth = p.tremoloDepth || 0;
    const sweepDepth = this.kind === 'sine' ? 0 : p.sweepDepth || 0;
    const driftDepth = p.drift || 0;
    const driftKnots = period ? Math.max(1, Math.round((0.12 * period) / sr)) : 0;
    const driftRate = period ? (driftKnots * sr) / period : 0.12;
    const drift = smoothRandom(subSeed(seed, 99), driftKnots);
    const phV = rng.next();
    const phT = rng.next();
    const phS = rng.next();
    const cutoff = p.cutoff ?? 18000;
    const filterEnv = p.filterEnv || 0;
    const filterTime = Math.max(0.01, p.filterTime || 0.2);
    const env = this.env;
    const base = 0.24 * noteGain * (inst === 'flauta' ? 0.6 : 1);
    this.ctl = new Control(3, (i, out) => {
      const t = (period ? i % period : i) / sr;
      const cents = vibDepth * sineCycle(vibRate * t + phV) + driftDepth * drift(t * driftRate);
      out[0] = Math.pow(2, cents / 1200);
      out[1] = env.gainAt(i) * base * (1 - tremDepth * (0.5 + 0.5 * sineCycle(tremRate * t + phT)));
      out[2] = cutoff * Math.pow(2, filterEnv * Math.exp(-t / filterTime) + sweepDepth * sineCycle(sweepRate * t + phS));
    });
  }

  process(L, R, off, n, i) {
    const { V, inc, phase, gl, gr, ctl, fl, fr, sr, q } = this;
    const end = off + n;
    let o = off;
    const table = this.table;
    while (o < end) {
      const a0 = ctl.prepare(i);
      const seg = Math.min(end - o, a0 + CONTROL_STEP - i);
      let fm = ctl.value(0, i);
      const dfm = ctl.step(0);
      let amp = ctl.value(1, i);
      const damp = ctl.step(1);
      if (this.useFilter) {
        const c = ctl.value(2, i);
        fl.set(c, q, sr);
        fr.set(c, q, sr);
      }
      for (let s = 0; s < seg; s++) {
        let l = 0;
        let r = 0;
        if (this.kind === 'table') {
          for (let v = 0; v < V; v++) {
            let ph = phase[v] + inc[v] * fm;
            if (ph >= 1) ph -= 1;
            phase[v] = ph;
            const x = ph * WAVETABLE_SIZE;
            const k = x | 0;
            const val = table[k] + (table[k + 1] - table[k]) * (x - k);
            l += val * gl[v];
            r += val * gr[v];
          }
        } else if (this.kind === 'partials') {
          const P = this.pRatio.length;
          for (let v = 0; v < V; v++) {
            let val = 0;
            for (let k = 0; k < P; k++) {
              const idx = v * P + k;
              let ph = this.pPh[idx] + this.pInc[idx] * fm;
              if (ph >= 1) ph -= 1;
              this.pPh[idx] = ph;
              val += sineCycle(ph) * this.pAmp[k];
            }
            l += val * gl[v];
            r += val * gr[v];
          }
        } else {
          let ph = phase[0] + inc[0] * fm;
          if (ph >= 1) ph -= 1;
          phase[0] = ph;
          const val = sineCycle(ph) * 0.75;
          l = val * gl[0];
          r = val * gr[0];
        }
        if (this.breath) {
          const k = i + s;
          const j = this.period ? k % this.period : k;
          l += this.bl.tick(noiseAt(this.breathSeed, j)) * this.breath;
          r += this.br.tick(noiseAt(this.breathSeed, j + 7919)) * this.breath;
        }
        if (this.sub) {
          let ph = this.subPh + this.subInc * fm;
          if (ph >= 1) ph -= 1;
          this.subPh = ph;
          const sv = sineCycle(ph) * this.sub;
          l += sv;
          r += sv;
        }
        if (this.formants) {
          const [a, b] = this.formants;
          l = (a[0].tick(l) * FORMANT_GAINS[0] + a[1].tick(l) * FORMANT_GAINS[1] + a[2].tick(l) * FORMANT_GAINS[2]) * 5.5;
          r = (b[0].tick(r) * FORMANT_GAINS[0] + b[1].tick(r) * FORMANT_GAINS[1] + b[2].tick(r) * FORMANT_GAINS[2]) * 5.5;
        }
        if (this.useFilter) {
          l = fl.tick(l);
          r = fr.tick(r);
        }
        L[o + s] += l * amp;
        R[o + s] += r * amp;
        amp += damp;
        fm += dfm;
      }
      o += seg;
      i += seg;
    }
  }
}

/** Unísono total de un elemento (para el límite de voces sostenidas). */
export function sustainVoiceCount(track, el) {
  const p = trackParams(track);
  return el.notes.length * unison(track.instrument, p);
}

