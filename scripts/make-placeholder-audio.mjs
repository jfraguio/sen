/**
 * Genera audios de reemplazo (16 s, mono, WAV) para que la app funcione
 * sin depender de archivos externos. Son ambientes sintéticos sencillos:
 * sustitúyelos por tus pistas definitivas manteniendo los nombres.
 *
 * Uso: node scripts/make-placeholder-audio.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 16000;
const SECONDS = 16;
const N = SR * SECONDS;
const CROSS = Math.floor(SR * 1.5);
const LEN = N + CROSS;
const TAU = Math.PI * 2;

const rand = (min = 0, max = 1) => min + Math.random() * (max - min);

function make() {
  return new Float32Array(LEN);
}

function mixNoise(data, gain = 1) {
  for (let i = 0; i < LEN; i++) data[i] += (Math.random() * 2 - 1) * gain;
}

function brown(data, gain = 1) {
  let last = 0;
  for (let i = 0; i < LEN; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] += last * gain;
  }
}

function biquad(data, type, freq, q = 0.707) {
  const w0 = (TAU * freq) / SR;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  let b0;
  let b1;
  let b2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }

  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - na1 * y1 - na2 * y2;
    data[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
}

function lowpass(data, freq, q = 0.707) {
  biquad(data, 'lowpass', freq, q);
}

function highpass(data, freq, q = 0.707) {
  biquad(data, 'highpass', freq, q);
}

function bandpass(data, freq, q = 0.707) {
  biquad(data, 'bandpass', freq, q);
}

function sine(data, freq, gain, phase = 0) {
  const step = (TAU * freq) / SR;
  for (let i = 0; i < LEN; i++) data[i] += Math.sin(step * i + phase) * gain;
}

function add(target, source, gain = 1) {
  for (let i = 0; i < LEN; i++) target[i] += source[i] * gain;
}

/** Modulación lenta; usar frecuencias múltiplos de 1/SECONDS para el bucle. */
function breathe(data, freq, depth, phase = 0) {
  const step = (TAU * freq) / SR;
  for (let i = 0; i < LEN; i++) {
    data[i] *= 1 - depth / 2 + (depth / 2) * Math.sin(step * i + phase);
  }
}

function addTone(data, at, duration, freq, gain, options = {}) {
  const start = Math.floor(at * SR);
  const length = Math.floor(duration * SR);
  const { slide = 0, harmonic = 0.25, decay = 3.2 } = options;
  let phase = 0;
  for (let j = 0; j < length && start + j < LEN; j++) {
    const t = j / SR;
    const env = Math.exp(-decay * (j / length)) * Math.min(1, j / (0.004 * SR));
    phase += (TAU * (freq + slide * (j / length))) / SR;
    const value = Math.sin(phase) + harmonic * Math.sin(phase * 2);
    data[start + j] += value * env * gain;
  }
}

function addCrackles(data, count, gain) {
  for (let k = 0; k < count; k++) {
    const start = Math.floor(rand(0, N));
    const length = Math.floor(rand(0.003, 0.045) * SR);
    let previous = 0;
    for (let j = 0; j < length; j++) {
      const n = Math.random() * 2 - 1;
      const filtered = n - previous * 0.82;
      previous = n;
      const env = Math.exp(-j / (length * 0.3));
      data[start + j] += filtered * env * gain;
    }
  }
}

function addRain(data, gain = 1, brightness = 4200) {
  const layer = make();
  mixNoise(layer, 1);
  highpass(layer, 380);
  lowpass(layer, brightness);
  lowpass(layer, brightness);
  add(data, layer, gain);

  const body = make();
  mixNoise(body, 1);
  lowpass(body, 320);
  add(data, body, gain * 0.55);
}

function addDrone(data, freqs, gain) {
  freqs.forEach((freq, index) => {
    sine(data, freq, gain * (index === 0 ? 1 : 0.7));
    sine(data, freq + 0.0625, gain * 0.5, index * 1.7);
  });
}

/** Mezcla el final del buffer con el principio para que el bucle no chasquee. */
function seamless(raw) {
  const out = new Float32Array(N);
  out.set(raw.subarray(0, N));
  for (let i = 0; i < CROSS; i++) {
    const w = i / CROSS;
    out[i] = raw[i] * w + raw[N + i] * (1 - w);
  }
  return out;
}

function master(raw, peak = 0.5) {
  const out = seamless(raw);
  let max = 0;
  for (const sample of out) max = Math.max(max, Math.abs(sample));
  const scale = max > 0 ? peak / max : 1;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/* --------------------------------------------------------------------------
   Ambientes
   -------------------------------------------------------------------------- */

function lluvia() {
  const raw = make();
  addRain(raw, 0.9, 5200);
  highpass(raw, 180);
  for (let i = 0; i < 26; i++) {
    addTone(raw, rand(0, SECONDS), rand(0.05, 0.18), rand(900, 2600), rand(0.015, 0.06), {
      slide: rand(-500, 500),
      harmonic: 0.1,
      decay: 4.5,
    });
  }
  breathe(raw, 1 / SECONDS, 0.25);
  return master(raw, 0.48);
}

function tormenta() {
  const raw = make();
  addRain(raw, 0.35, 3600);
  brown(raw, 2.4);
  lowpass(raw, 160);
  const wind = make();
  mixNoise(wind, 1);
  lowpass(wind, 240);
  add(raw, wind, 0.5);

  const thunder = (at, gain) => {
    let last = 0;
    const start = Math.floor(at * SR);
    const duration = 4.2;
    for (let j = 0; j < duration * SR && start + j < LEN; j++) {
      const t = j / SR;
      const env = (1 - Math.exp(-t / 0.12)) * Math.exp(-t / 1.5);
      last = (last + 0.03 * (Math.random() * 2 - 1)) / 1.03;
      raw[start + j] += last * env * gain;
      raw[start + j] += Math.sin(TAU * 46 * t) * env * gain * 0.5;
    }
  };
  thunder(3.2, 5.5);
  thunder(10.8, 3.8);

  breathe(raw, 1 / 8, 0.3);
  return master(raw, 0.52);
}

function fuego() {
  const raw = make();
  brown(raw, 3.2);
  lowpass(raw, 520);
  const hiss = make();
  mixNoise(hiss, 1);
  bandpass(hiss, 1000, 0.6);
  add(raw, hiss, 0.25);
  addCrackles(raw, 130, 0.22);
  breathe(raw, 1 / 4, 0.3);
  return master(raw, 0.46);
}

function mar() {
  const raw = make();
  const surf = make();
  mixNoise(surf, 1);
  highpass(surf, 110);
  lowpass(surf, 1400);
  const step = TAU / (SECONDS * SR);
  for (let i = 0; i < LEN; i++) {
    const swell = (0.5 + 0.5 * Math.sin(step * i - Math.PI / 2)) ** 1.6;
    surf[i] *= 0.12 + swell * 0.88;
  }
  add(raw, surf, 1);

  const deep = make();
  brown(deep, 2);
  lowpass(deep, 280);
  add(raw, deep, 0.35);

  const foam = make();
  mixNoise(foam, 1);
  highpass(foam, 2200);
  for (let i = 0; i < LEN; i++) {
    const swell = (0.5 + 0.5 * Math.sin(step * i - Math.PI / 2)) ** 4;
    foam[i] *= swell;
  }
  add(raw, foam, 0.25);
  return master(raw, 0.5);
}

function rio() {
  const raw = make();
  const water = make();
  mixNoise(water, 1);
  highpass(water, 280);
  lowpass(water, 2800);
  add(raw, water, 0.7);

  const body = make();
  mixNoise(body, 1);
  bandpass(body, 700, 0.8);
  add(raw, body, 0.45);

  for (let i = 0; i < 38; i++) {
    addTone(raw, rand(0, SECONDS), rand(0.06, 0.2), rand(420, 1200), rand(0.02, 0.07), {
      slide: rand(150, 700),
      harmonic: 0.08,
      decay: 4,
    });
  }
  breathe(raw, 1 / 8, 0.22);
  return master(raw, 0.44);
}

function viento() {
  const raw = make();
  const low = make();
  mixNoise(low, 1);
  lowpass(low, 420);
  breathe(low, 1 / 16, 0.65, 0);
  add(raw, low, 1);

  const mid = make();
  mixNoise(mid, 1);
  bandpass(mid, 900, 0.7);
  breathe(mid, 1 / 8, 0.8, 1.4);
  add(raw, mid, 0.75);

  const high = make();
  mixNoise(high, 1);
  highpass(high, 2200);
  breathe(high, 1 / 16, 0.9, 3.1);
  add(raw, high, 0.18);

  return master(raw, 0.44);
}

function espacio() {
  const raw = make();
  addDrone(raw, [55, 82.5, 110, 165], 0.055);
  breathe(raw, 1 / 16, 0.45, 0.8);

  const shimmer = make();
  mixNoise(shimmer, 1);
  highpass(shimmer, 3200);
  breathe(shimmer, 1 / 8, 0.85, 2.2);
  add(raw, shimmer, 0.05);

  sine(raw, 220, 0.018);
  sine(raw, 329.0625, 0.01);
  return master(raw, 0.4);
}

function cuento() {
  const raw = make();
  addDrone(raw, [220, 261.625, 329.625, 440], 0.022);
  breathe(raw, 1 / 8, 0.35, 1.1);

  const air = make();
  mixNoise(air, 1);
  lowpass(air, 1800);
  highpass(air, 300);
  add(raw, air, 0.025);

  const melody = [440, 523.25, 659.25, 880, 659.25, 523.25, 493.875, 440];
  melody.forEach((freq, i) => {
    addTone(raw, i * (SECONDS / melody.length), 1.8, freq, 0.075, {
      harmonic: 0.3,
      decay: 3.8,
    });
    addTone(raw, i * (SECONDS / melody.length) + 0.16, 1.4, freq * 2, 0.018, {
      harmonic: 0.1,
      decay: 4.2,
    });
  });
  return master(raw, 0.44);
}

function meditacion() {
  const raw = make();
  addDrone(raw, [110, 165, 220, 330], 0.035);
  sine(raw, 55, 0.05);
  sine(raw, 82.5, 0.025);
  breathe(raw, 1 / 8, 0.5, 0);

  const air = make();
  mixNoise(air, 1);
  bandpass(air, 2400, 0.5);
  breathe(air, 1 / 8, 0.7, 2.4);
  add(raw, air, 0.025);

  return master(raw, 0.38);
}

/* --------------------------------------------------------------------------
   WAV
   -------------------------------------------------------------------------- */

function writeWav(file, samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buffer);
}

const tracks = {
  lluvia,
  tormenta,
  fuego,
  mar,
  rio,
  viento,
  espacio,
  cuento,
  meditacion,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'assets', 'audio');
fs.mkdirSync(outDir, { recursive: true });

for (const [name, create] of Object.entries(tracks)) {
  const samples = create();
  const file = path.join(outDir, `${name}.wav`);
  writeWav(file, samples);
  console.log(`${name.padEnd(11)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

console.log(`\nListo: ${Object.keys(tracks).length} bucles de ${SECONDS} s en assets/audio.`);
