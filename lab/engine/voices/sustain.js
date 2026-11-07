/**
 * Notas sostenidas: pad, drone, cuerdas, arpa eólica, flauta suave, coro,
 * cuenco tibetano frotado, vidrio, seno, theremin y los sintetizadores
 * analógicos (pad, Cinta y Bruma; los antiguos metales, bajo y lead 80 siguen
 * disponibles para proyectos anteriores).
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
import { curveFunction, toneSegments, trackParams } from '../schema.js';

const VOWEL_FORMANTS = [[800, 1150, 2900], [450, 800, 2830], [325, 700, 2530]];
const FORMANT_GAINS = [1, 0.55, 0.3];
/** Armónicos de la flauta suave: casi senoidal. */
const FLUTE_HARMONICS = [1, 0.14, 0.05, 0.015];
/** Armónicos del theremin: casi senoidal, con un poco de cuerpo en los primeros. */
const THEREMIN_HARMONICS = [1, 0.32, 0.14, 0.07, 0.035, 0.015];
/** Cuenco tibetano frotado: `[relación, amplitud]` de sus modos (el roce excita sobre todo el primero). */
const BOWL_MODES = [[1, 1], [2.71, 0.38], [5.15, 0.14], [8.45, 0.06], [12.4, 0.025]];
/** Ganancia propia de algunos instrumentos para igualar su sonoridad con el resto. */
const SUSTAIN_GAIN = { flauta: 0.6, theremin: 0.6, coro: 0.7, bass80: 0.75, eolica: 1.1, cuencoCanto: 1.1 };

/** Respuesta de los formantes del coro a una nota (potencia relativa). */
function formantPower(f, p, sr) {
  const v = clamp(p.vowel ?? 0.3, 0, 1) * 2;
  const a = Math.min(1, Math.floor(v));
  const u = v - a;
  const fks = VOWEL_FORMANTS[0].map((_, k) => VOWEL_FORMANTS[a][k] + (VOWEL_FORMANTS[Math.min(2, a + 1)][k] - VOWEL_FORMANTS[a][k]) * u);
  const H = Math.min(Math.max(1, Math.floor((0.45 * sr) / f)), Math.max(1, Math.round(p.partials || 1)));
  let pin = 0;
  let pout = 0;
  for (let h = 1; h <= H; h++) {
    const amp = Math.pow(h, -(p.rolloff || 1));
    let resp = 0;
    fks.forEach((fk, k) => {
      const q = clamp(fk / 90, 2, 12);
      const x = (h * f) / fk;
      resp += FORMANT_GAINS[k] / Math.sqrt(1 + q * q * (x - 1 / x) * (x - 1 / x));
    });
    pin += amp * amp;
    pout += amp * amp * resp * resp;
  }
  return pout / Math.max(1e-12, pin);
}

/** Voces de unísono de una nota (los instrumentos sin el parámetro tienen una). */
function unison(inst, p) {
  if (inst === 'seno' || inst === 'flauta' || !Number.isFinite(p.voices)) return 1;
  return Math.max(1, Math.round(p.voices));
}

export function compileSustainElement(track, el, ctx) {
  const p = trackParams(track);
  const segments = toneSegments(el);
  const multi = segments.length > 1;
  // Cruce entre cambios de nota: la nota anterior se apaga mientras la nueva
  // entra. El usuario lo ajusta por elemento (`crossfade`); 0 es corte seco.
  const shortest = segments.reduce((m, s) => Math.min(m, s.end - s.t), Infinity);
  const requested = Number.isFinite(el.crossfade) ? el.crossfade : 0.15;
  const fade = clamp(requested, 0, Math.min(2, shortest * 0.5));
  const half = fade / 2;
  const loopFull = !!ctx.loopFull;
  const glides = track.instrument === 'theremin' && (p.glide ?? 0) > 0;
  // En bucle, el primer y el último tramo también se cruzan en la costura.
  const edge = loopFull ? Math.max(fade, Math.min(0.02, shortest * 0.5)) : fade;
  const out = [];
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    const notes = seg.notes.slice(0, 8);
    if (!notes.length) continue; // un cambio a «silencio» deja el tramo vacío
    const noteGain = 1 / Math.sqrt(notes.length);
    const last = k === segments.length - 1;
    const first = k === 0;
    // Cruce centrado: la nota anterior empieza a apagarse antes del cambio y
    // la siguiente entra antes, para que ambas se crucen alrededor del corte.
    const start = first ? seg.t : Math.max(0, seg.t - half);
    const end = seg.end + (last ? (loopFull ? edge : 0) : half);
    const d = Math.max(0.001, end - start);
    // Fundidos propios del tramo: solo los cruces. Los fundidos de entrada y
    // salida del elemento se aplican sobre el tiempo del elemento (`outer`),
    // para que un fundido largo no se coma el primer o el último tramo.
    const fadeIn = first ? (loopFull ? edge : 0) : fade;
    const fadeOut = last ? (loopFull ? edge : 0) : fade;
    const crossIn = !first || loopFull;
    const crossOut = !last || loopFull;
    const shape = multi ? segmentElement(el, start, end, d, fadeIn, fadeOut, crossIn, crossOut) : el;
    // Portamento (theremin): cada nota llega deslizándose desde la que
    // sonaba antes en la misma posición del acorde.
    const prev = glides ? (k > 0 ? segments[k - 1].notes : el.glideFrom ? [el.glideFrom] : []) : [];
    for (let j = 0; j < notes.length; j++) {
      const f = noteFrequency(notes[j], ctx.a4);
      const seed = subSeed(ctx.elementSeed, multi ? k * 16 + j : j);
      const from = prev.length ? noteFrequency(prev[Math.min(j, prev.length - 1)], ctx.a4) : 0;
      out.push({
        t: start,
        d,
        bed: true,
        voices: unison(track.instrument, p),
        create: (sr, i0, period) => new SustainVoice(track.instrument, p, shape, f, noteGain, seed, sr, i0, period, from),
      });
    }
  }
  return out;
}

/**
 * Envolvente y curva de un tramo de un `tone` con cambios. El tramo hereda el
 * nivel, la curva y los fundidos de entrada y salida del elemento (medidos en
 * el tiempo del elemento), y añade los fundidos del cruce centrado alrededor
 * de cada cambio de nota.
 */
function segmentElement(el, start, end, d, fadeIn, fadeOut, crossIn, crossOut) {
  const total = Math.max(0.1, el.length || 0.1);
  const global = curveFunction(el.curve);
  const x0 = Math.min(1, Math.max(0, start / total));
  const x1 = Math.min(1, Math.max(0, end / total));
  const curve = [];
  for (let q = 0; q <= 8; q++) curve.push([q / 8, global(x0 + (x1 - x0) * (q / 8))]);
  const fIn = Math.min(fadeIn, d * 0.9);
  const fOut = Math.min(fadeOut, Math.max(0, d - fIn));
  const outer = { offset: start, length: total, fadeIn: el.fadeIn || 0, fadeOut: el.fadeOut || 0 };
  return { ...el, start: 0, length: d, fadeIn: fIn, fadeOut: fOut, crossIn, crossOut, curve, outer };
}

class SustainVoice {
  constructor(inst, p, el, f, noteGain, seed, sr, i0, period, glideFrom = 0) {
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
    const fvRaw = new Float64Array(V);
    for (let v = 0; v < V; v++) {
      const spread = V > 1 ? (v / (V - 1)) * 2 - 1 : 0;
      const cents = (p.detune || 0) * spread + (V > 1 ? (rng.next() - 0.5) * 0.3 * (p.detune || 0) : 0);
      let fv = f * Math.pow(2, cents / 1200);
      if (inst === 'drone' && V > 1) fv += (p.beat || 0) * spread * 0.5;
      fvRaw[v] = fv;
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
    this.kind = inst === 'seno' ? 'sine' : inst === 'vidrio' || inst === 'eolica' ? 'partials' : inst === 'cuencoCanto' ? 'bowl' : 'table';
    // Con portamento desde una nota más aguda, los armónicos no deben pasar de Nyquist.
    const glide = !period && glideFrom > 0 && Math.abs(glideFrom / f - 1) > 0.001 ? { ratio: glideFrom / f, time: Math.max(0.005, p.glide ?? 0.25) } : null;
    const maxH = Math.max(1, Math.floor((0.45 * sr) / (f * 1.08 * Math.max(1, glide ? glide.ratio : 1))));
    if (this.kind === 'table' && (inst === 'flauta' || inst === 'theremin')) {
      const list = inst === 'flauta' ? FLUTE_HARMONICS : THEREMIN_HARMONICS;
      const amps = list.slice(0, Math.min(maxH, list.length));
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
      const aeolian = inst === 'eolica';
      // Arpa eólica: cuerda casi armónica (algo rígida). Vidrio: inarmónico.
      const B = aeolian ? 0.00015 : (p.inharmonic || 0) * 0.02;
      const ratios = [];
      const amps = [];
      for (let h = 1; h <= Math.round(p.partials || 6); h++) {
        const r = aeolian
          ? h * Math.sqrt(1 + B * (h * h - 1))
          : h * Math.sqrt(1 + B * (h * h - 1)) * (1 + (h > 1 ? (rng.next() - 0.5) * 0.02 * (p.inharmonic || 0) : 0));
        if (f * r > 0.45 * sr) break;
        ratios.push(r);
        amps.push(aeolian ? Math.pow(h, -0.5) : Math.pow(h, -(p.rolloff || 1)));
      }
      const sum = amps.reduce((a, b) => a + b, 0) || 1;
      this.pRatio = Float64Array.from(ratios);
      this.pAmp = Float64Array.from(aeolian ? amps : amps.map((a) => a / sum * 1.6));
      if (aeolian) this.pGain = aeolianGains(ratios.length, amps, p, seed, sr, period);
      this.pPhase = Float64Array.from(ratios.map(() => rng.next()));
      this.pInc = new Float64Array(V * ratios.length);
      this.pPh = new Float64Array(V * ratios.length);
      for (let v = 0; v < V; v++) {
        for (let k = 0; k < ratios.length; k++) {
          // En bucle, cada parcial de cada voz se ajusta por separado a un
          // número entero de ciclos (si no, la desafinación rompe la costura).
          const inc = period ? quantizeFreq(fvRaw[v] * ratios[k], period, sr) / sr : this.inc[v] * this.pRatio[k];
          this.pInc[v * ratios.length + k] = inc;
          const ph = this.pPhase[k] + rng.next() * 0.1 + inc * i0;
          this.pPh[v * ratios.length + k] = ph - Math.floor(ph);
        }
      }
    }
    if (this.kind === 'bowl') {
      // Cada modo es un par que bate (la asimetría del bronce) con sus dos
      // mitades a cada lado: el batido gira alrededor del oyente.
      const H = clamp(Math.round(p.partials || 4), 1, BOWL_MODES.length);
      const beat = clamp(p.beat ?? 0.8, 0, 3);
      const inc = [];
      const ph = [];
      const gl = [];
      const gr = [];
      let pw = 0;
      for (let k = 0; k < H; k++) {
        const [ratio, a0] = BOWL_MODES[k];
        if (f * ratio * 1.01 > 0.45 * sr) break;
        const a = Math.pow(a0, p.rolloff ?? 1.2);
        pw += a * a;
        const b = beat * (1 + 0.5 * k) * (0.85 + rng.next() * 0.3);
        const q = 0.15 + 0.6 * width;
        for (const [df, pan, share] of [[-b / 2, -q, 0.52], [b / 2, q, 0.48]]) {
          const fc = quantizeFreq(Math.max(1, f * ratio + df), period, sr);
          inc.push(fc / sr);
          const p0 = rng.next() + (fc / sr) * i0;
          ph.push(p0 - Math.floor(p0));
          const [l, r] = panGains(pan);
          gl.push(a * share * l);
          gr.push(a * share * r);
        }
      }
      const n = 1.25 / Math.sqrt(Math.max(1e-9, pw));
      this.bInc = Float64Array.from(inc);
      this.bPh = Float64Array.from(ph);
      this.bL = Float64Array.from(gl.map((x) => x * n));
      this.bR = Float64Array.from(gr.map((x) => x * n));
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
    // Ruido propio: soplo de la flauta (alrededor del tercer armónico), roce
    // de la maza del cuenco (pegado a la nota) y aire del arpa eólica.
    const noise = inst === 'flauta' ? [Math.min(4000, f * 3), 1.4, 1]
      : inst === 'cuencoCanto' ? [f, 4, 1.6]
        : inst === 'eolica' ? [1600, 0.6, 0.8] : null;
    this.breath = noise ? clamp(p.breath ?? 0, 0, 1) * 0.14 * noise[2] : 0;
    if (this.breath) {
      this.breathSeed = subSeed(seed, 7);
      this.bl = new Svf(2).set(noise[0], noise[1], sr);
      this.br = new Svf(2).set(noise[0] * 1.03, noise[1], sr);
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
    // El coro pasa por formantes: sin compensar, las notas que caen en ellos
    // suenan mucho más fuertes (hasta +12 dB en la octava 5).
    const coroComp = this.formants ? clamp(Math.sqrt(formantPower(196, p, sr) / formantPower(f, p, sr)), 0.4, 2.5) : 1;
    const base = 0.24 * noteGain * (SUSTAIN_GAIN[inst] ?? 1) * coroComp;
    // Giro de la maza del cuenco: el canto se mueve de un lado a otro.
    const rotDepth = inst === 'cuencoCanto' ? clamp(p.rotation ?? 0, 0, 1) * 0.6 : 0;
    const rotRate = q(p.rotationRate || 0.6);
    const phR = rng.next();
    this.rotates = rotDepth > 0;
    // El theremin empieza la nota limpio y el vibrato entra poco a poco.
    const vibOnset = inst === 'theremin' && !period ? 0.45 : 0;
    const centsAt = (t) => vibDepth * (vibOnset ? Math.min(1, t / vibOnset) : 1) * sineCycle(vibRate * t + phV) + driftDepth * drift(t * driftRate);
    const glideAt = (t) => {
      if (!glide || t >= glide.time) return 1;
      const u = t / glide.time;
      return Math.pow(glide.ratio, (1 - u) * (1 - u));
    };
    // En bucle, la modulación de tono se normaliza para que cada parcial dé
    // un número entero de ciclos por vuelta: así la deriva no abre la costura.
    let fmNorm = 1;
    if (period && (vibDepth || driftDepth)) {
      const M = 4096;
      let acc = 0;
      for (let m = 0; m < M; m++) acc += Math.pow(2, centsAt(((m / M) * period) / sr) / 1200);
      fmNorm = M / acc;
    }
    this.ctl = new Control(4, (i, out) => {
      const t = (period ? i % period : i) / sr;
      out[0] = Math.pow(2, centsAt(t) / 1200) * fmNorm * glideAt(t);
      out[1] = env.gainAt(i) * base * (1 - tremDepth * (0.5 + 0.5 * sineCycle(tremRate * t + phT)));
      out[2] = cutoff * Math.pow(2, filterEnv * Math.exp(-t / filterTime) + sweepDepth * sineCycle(sweepRate * t + phS));
      out[3] = rotDepth * sineCycle(rotRate * t + phR);
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
      let rot = this.rotates ? ctl.value(3, i) : 0;
      const drot = this.rotates ? ctl.step(3) : 0;
      const pg = this.pGain;
      if (pg) pg.prepare(i);
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
          const frac = pg ? (i + s - pg.at) / CONTROL_STEP : 0;
          for (let v = 0; v < V; v++) {
            let val = 0;
            for (let k = 0; k < P; k++) {
              const idx = v * P + k;
              let ph = this.pPh[idx] + this.pInc[idx] * fm;
              if (ph >= 1) ph -= 1;
              this.pPh[idx] = ph;
              const g = pg ? pg.v0[k] + (pg.v1[k] - pg.v0[k]) * frac : 1;
              val += sineCycle(ph) * this.pAmp[k] * g;
            }
            l += val * gl[v];
            r += val * gr[v];
          }
        } else if (this.kind === 'bowl') {
          const { bInc, bPh, bL, bR } = this;
          for (let k = 0; k < bInc.length; k++) {
            let ph = bPh[k] + bInc[k] * fm;
            if (ph >= 1) ph -= 1;
            bPh[k] = ph;
            const val = sineCycle(ph);
            l += val * bL[k];
            r += val * bR[k];
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
        if (rot) {
          l *= 1 + rot;
          r *= 1 - rot;
        }
        L[o + s] += l * amp;
        R[o + s] += r * amp;
        amp += damp;
        fm += dfm;
        rot += drot;
      }
      o += seg;
      i += seg;
    }
  }
}

/**
 * Ganancias de los armónicos del arpa eólica: el viento excita una banda de
 * armónicos que sube y baja despacio, y cada armónico respira por su cuenta.
 * La suma se normaliza para que el nivel no dependa de cuántos suenan.
 */
function aeolianGains(P, amps, p, seed, sr, period) {
  const wind = clamp(p.wind ?? 0.4, 0, 1);
  const rate = 0.04 + 0.22 * wind;
  const knots = (r) => (period ? Math.max(1, Math.round((r * period) / sr)) : 0);
  const kc = knots(rate);
  const ko = knots(rate * 1.7);
  const rc = period ? (kc * sr) / period : rate;
  const ro = period ? (ko * sr) / period : rate * 1.7;
  const center = smoothRandom(subSeed(seed, 501), kc);
  const own = Array.from({ length: P }, (_, k) => smoothRandom(subSeed(seed, 600 + k), ko));
  const bw = 1.2 + 2.6 * (1 - wind);
  return new Control(P, (i, out) => {
    const t = (period ? i % period : i) / sr;
    const c = 2 + (P - 2) * clamp(0.45 + 0.65 * center(t * rc), 0, 1);
    let pw = 0;
    for (let k = 0; k < P; k++) {
      const h = k + 1;
      const g = h === 1 ? 0.45 : Math.exp(-((h - c) / bw) * ((h - c) / bw)) * (0.45 + 0.55 * clamp(0.5 + 0.7 * own[k](t * ro), 0, 1)) + 0.03;
      out[k] = g;
      pw += g * g * amps[k] * amps[k];
    }
    const n = 0.8 / Math.sqrt(Math.max(1e-6, pw));
    for (let k = 0; k < P; k++) out[k] *= n;
  });
}

/** Unísono total de un elemento (para el límite de voces sostenidas). */
export function sustainVoiceCount(track, el) {
  const p = trackParams(track);
  const u = unison(track.instrument, p);
  const segments = toneSegments(el);
  let max = 0;
  for (let k = 0; k < segments.length; k++) {
    const current = segments[k].notes.length * u;
    max = Math.max(max, current);
    // Los tramos se solapan un instante al cambiar de nota: cuentan las dos.
    if (k > 0) max = Math.max(max, (segments[k - 1].notes.length + segments[k].notes.length) * u);
  }
  return max;
}

