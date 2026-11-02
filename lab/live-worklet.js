/**
 * AudioWorkletProcessor «lab-live»: las notas del modo teclado.
 *
 * Usa las mismas voces del motor que el tema (sostenidas y puntuales), la
 * mezcla de la pista (volumen, panorama y envíos) y la reverb, el eco y la
 * ecualización del bus maestro. Así, lo que suena al tocar es lo que suena
 * al llevar las notas a la pista.
 *
 * Mensajes:
 *   { type: 'on', id, note, track, a4, fade, seed, key, master }
 *   { type: 'off', id, fast }
 *   { type: 'all-off' }
 */

import { compileSustainElement } from './engine/voices/sustain.js';
import { compileStrikeElement } from './engine/voices/strike.js';
import { Echo, Reverb } from './engine/space.js';
import { MasterEq } from './engine/master.js';
import { clamp, dbToGain, panGains } from './engine/dsp.js';
import { LIMITS } from './engine/schema.js';
import { seedFrom } from './engine/rng.js';

/** Una nota sostenida suena hasta que se suelta (como mucho, una hora). */
const HOLD = 3600;
/** Cruce mínimo para que entrar o soltar no haga clic. */
const MIN_FADE = 0.005;

class LabLive extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.reverb = new Reverb(sampleRate);
    this.echo = new Echo(sampleRate);
    this.eq = new MasterEq(sampleRate);
    this.masterKey = '';
    this.gain = 1;
    this.target = 1;
    this.tail = 6 * sampleRate;
    this.idle = Infinity;
    this.size = 0;
    // Última nota tocada por pista: el theremin se desliza desde ella.
    this.lastNote = new Map();
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  alloc(n) {
    if (n === this.size) return;
    this.size = n;
    for (const k of ['vL', 'vR', 'dryL', 'dryR', 'revL', 'revR', 'ecL', 'ecR']) this[k] = new Float32Array(n);
  }

  setMaster(m) {
    if (!m) return;
    const key = JSON.stringify(m);
    if (key === this.masterKey) return;
    this.masterKey = key;
    this.reverb.set(m.reverb || {});
    this.echo.set(m.echo || {});
    this.eq.set(m.eq || {});
    this.target = dbToGain(m.gain ?? 0);
    const decay = m.reverb?.decay ?? 4.5;
    const fb = clamp(m.echo?.feedback ?? 0, 0, 0.95);
    const echoTail = fb > 0 ? ((m.echo?.time ?? 0.5) * Math.log(1e-4)) / Math.log(fb) : 0;
    this.tail = Math.round((decay * 1.3 + Math.min(20, echoTail) + 1) * sampleRate);
  }

  onMessage(m) {
    if (m.type === 'on') this.noteOn(m);
    else if (m.type === 'off') this.noteOff(m.id, m.fast);
    else if (m.type === 'all-off') for (const v of this.voices) this.release(v, 0.02);
  }

  noteOn(m) {
    this.setMaster(m.master);
    const track = m.track;
    if (!track) return;
    const ctx = {
      a4: m.a4 ?? 440,
      key: m.key || { root: 'C', scale: 'mayor' },
      tempo: null,
      elementSeed: seedFrom(m.seed ?? 'sen', track.id ?? 'pista', 'teclado', m.id),
      audition: false,
      eventBudget: LIMITS.events,
      samples: null,
      loopFull: false,
    };
    // Si la tecla seguía sonando (o soltándose), la nueva nota cruza con ella,
    // igual que un cambio de nota en la pista.
    for (const v of this.voices) if (v.id === m.id && !v.strike) this.release(v, m.fade);
    const fade = Math.max(MIN_FADE, m.fade ?? 0.15);
    let specs;
    let strike = false;
    if (track.family === 'sustain') {
      const el = {
        id: 'teclado', type: 'tone', start: 0, length: HOLD, level: 0, fadeIn: fade, fadeOut: 0,
        crossIn: true, notes: [m.note], curve: 'plana', seed: 1,
      };
      const last = this.lastNote.get(track.id);
      if (last && track.instrument === 'theremin') el.glideFrom = last;
      this.lastNote.set(track.id, m.note);
      specs = compileSustainElement(track, el, ctx);
    } else if (track.family === 'strike') {
      strike = true;
      specs = compileStrikeElement(track, { id: 'teclado', type: 'hit', start: 0, note: m.note, velocity: 0.7, level: 0 }, ctx);
    } else return;
    const spec = specs[0];
    if (!spec) return;
    const mix = track.mix || {};
    const g = dbToGain(mix.gain ?? -6);
    const [pl, pr] = panGains(mix.pan ?? 0);
    this.voices.push({
      id: m.id,
      strike,
      rt: spec.create(sampleRate, 0, 0),
      i: 0,
      end: Math.max(1, Math.round(spec.d * sampleRate)),
      gl: g * pl,
      gr: g * pr,
      rv: clamp(mix.reverb ?? 0, 0, 1),
      ec: clamp(mix.echo ?? 0, 0, 1),
      norm: null,
      rel: null,
      held: !strike,
      fade,
    });
    // Límite de golpes que suenan a la vez, como en el motor.
    const strikes = this.voices.filter((v) => v.strike && !v.stopping);
    if (strikes.length > LIMITS.strikePerTrack) {
      const oldest = strikes[0];
      oldest.stopping = true;
      oldest.rt.stop?.(Math.round(0.01 * sampleRate));
    }
    const sustains = this.voices.filter((v) => !v.strike);
    if (sustains.length > 24) this.release(sustains[0], 0.02);
    this.idle = 0;
  }

  noteOff(id, fast = false) {
    for (const v of this.voices) {
      if (v.id !== id || v.rel || v.strike) continue;
      this.release(v, fast ? 0.02 : v.fade);
    }
  }

  /** Suelta una voz sostenida con el mismo fundido de potencia constante del cruce. */
  release(v, seconds) {
    if (v.strike) {
      if (seconds <= 0.03 && !v.stopping) {
        v.stopping = true;
        v.rt.stop?.(Math.round(0.01 * sampleRate));
      }
      return;
    }
    const total = Math.max(1, Math.round(Math.max(MIN_FADE, seconds ?? 0.15) * sampleRate));
    if (v.rel && v.rel.left <= total) return;
    v.held = false;
    v.rel = { left: total, total };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const OL = out[0];
    const OR = out[1] || out[0];
    const n = OL.length;
    if (!this.voices.length && this.idle > this.tail) return true;
    this.alloc(n);
    const { vL, vR, dryL, dryR, revL, revR, ecL, ecR } = this;
    dryL.fill(0); dryR.fill(0); revL.fill(0); revR.fill(0); ecL.fill(0); ecR.fill(0);
    // Las notas que se mantienen se reparten la ganancia como un acorde del
    // motor (1/√notas), así que tocar un acorde suena igual que en la pista.
    let held = 0;
    for (const v of this.voices) if (v.held) held++;
    const norm = 1 / Math.sqrt(Math.max(1, held));
    const k = 1 - Math.exp(-1 / (0.02 * sampleRate));
    let w = 0;
    for (let q = 0; q < this.voices.length; q++) {
      const v = this.voices[q];
      vL.fill(0);
      vR.fill(0);
      const s = Math.min(n, v.end - v.i);
      if (s > 0) {
        v.rt.process(vL, vR, 0, s, v.i);
        v.i += s;
      }
      if (v.norm === null) v.norm = v.strike ? 1 : norm;
      const target = v.strike || !v.held ? v.norm : norm;
      const rel = v.rel;
      for (let i = 0; i < s; i++) {
        v.norm += (target - v.norm) * k;
        let g = v.norm;
        if (rel) {
          g *= rel.left > 0 ? Math.sin((Math.PI / 2) * (rel.left / rel.total)) : 0;
          if (rel.left > 0) rel.left--;
        }
        const l = vL[i] * g * v.gl;
        const r = vR[i] * g * v.gr;
        dryL[i] += l;
        dryR[i] += r;
        if (v.rv > 0) {
          revL[i] += l * v.rv;
          revR[i] += r * v.rv;
        }
        if (v.ec > 0) {
          ecL[i] += l * v.ec;
          ecR[i] += r * v.ec;
        }
      }
      const finished = v.i >= v.end || v.rt.done || (rel && rel.left <= 0);
      if (!finished) this.voices[w++] = v;
    }
    this.voices.length = w;
    this.reverb.process(revL, revR, dryL, dryR, n);
    this.echo.process(ecL, ecR, dryL, dryR, n);
    this.eq.process(dryL, dryR, n);
    const g0 = this.gain;
    const g1 = g0 + (this.target - g0) * 0.05;
    this.gain = g1;
    for (let i = 0; i < n; i++) {
      const g = g0 + ((g1 - g0) * i) / n;
      OL[i] = soft(dryL[i] * g);
      OR[i] = soft(dryR[i] * g);
    }
    this.idle = this.voices.length ? 0 : this.idle + n;
    return true;
  }
}

/** Protección suave contra saturación (el tema pasa por el limitador). */
function soft(x) {
  const a = Math.abs(x);
  if (a <= 0.89) return x;
  return Math.sign(x) * (0.89 + 0.1 * Math.tanh((a - 0.89) / 0.1));
}

registerProcessor('lab-live', LabLive);
