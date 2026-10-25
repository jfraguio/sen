/**
 * Genera los audios sintéticos de sen.
 *
 * Sin argumentos:
 *   9 bucles de 16 s en WAV para `assets/audio` (los placeholders de la app).
 *
 * Con `--long`:
 *   versiones de 10 minutos en MP3 para `sounds/generados` (incluida en el
 *   repositorio y publicada con la app). La síntesis se extiende y evoluciona
 *   durante toda la pista para que no se note un bucle corto.
 *
 * Uso:
 *   node scripts/make-placeholder-audio.mjs
 *   node scripts/make-placeholder-audio.mjs --long
 *   node scripts/make-placeholder-audio.mjs --long --seconds=600
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const LONG = args.includes('--long');
const secondsArg = args.find((arg) => arg.startsWith('--seconds='));
const SECONDS = LONG ? Math.max(30, Number(secondsArg?.split('=')[1] || 600)) : 16;
const SR = 16000;
const N = SR * SECONDS;
const CROSS = LONG ? 0 : Math.floor(SR * 1.5);
const LEN = N + CROSS;
const TAU = Math.PI * 2;
const SCALE = SECONDS / 16;

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

/** Silbido corto con glide y trino, para pájaros y búhos. */
function addChirp(data, at, duration, freqStart, freqEnd, gain, options = {}) {
  const start = Math.floor(at * SR);
  const length = Math.max(1, Math.floor(duration * SR));
  const { warble = 0, warbleRate = 0, decay = 2.2, harmonic = 0.08 } = options;
  let phase = 0;
  for (let j = 0; j < length && start + j < LEN; j++) {
    const t = j / SR;
    const u = j / length;
    const freq = freqStart + (freqEnd - freqStart) * u + Math.sin(TAU * warbleRate * t) * warble;
    const env = Math.sin(Math.PI * u) ** 0.65 * Math.exp(-decay * u);
    phase += (TAU * freq) / SR;
    data[start + j] += (Math.sin(phase) + harmonic * Math.sin(phase * 2)) * env * gain;
  }
}

function addBirdPhrase(data, at, baseFreq, gain) {
  let time = at;
  const count = 2 + Math.floor(rand(0, 4));
  const direction = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < count; i++) {
    const duration = rand(0.06, 0.2);
    const startFreq = baseFreq * rand(0.85, 1.2) * (1 + direction * i * 0.04);
    addChirp(data, time, duration, startFreq, startFreq * rand(1.1, 1.7), gain * rand(0.55, 1), {
      warble: rand(0, 80),
      warbleRate: rand(15, 40),
      decay: rand(1.5, 3),
    });
    time += duration + rand(0.03, 0.11);
  }
  if (Math.random() < 0.3) {
    let trillAt = time + rand(0.05, 0.2);
    const trillFreq = baseFreq * rand(1.2, 1.8);
    for (let i = 0; i < 6; i++) {
      addChirp(data, trillAt, 0.045, trillFreq, trillFreq * rand(0.9, 1.1), gain * 0.5, { decay: 4 });
      trillAt += 0.055;
    }
  }
}

/** Pulsos de grillo: portadora aguda con una compuerta rítmica. */
function addCricket(data, at, duration, freq, pulseRate, gain) {
  const start = Math.floor(at * SR);
  const length = Math.max(1, Math.floor(duration * SR));
  let phase = 0;
  for (let j = 0; j < length && start + j < LEN; j++) {
    const t = j / SR;
    const u = j / length;
    const env = Math.sin(Math.PI * u) ** 0.5;
    const pulse = Math.max(0, Math.sin(TAU * pulseRate * t)) ** 3;
    phase += (TAU * freq * (1 + Math.sin(TAU * 1.7 * t) * 0.002)) / SR;
    data[start + j] += Math.sin(phase) * env * pulse * gain;
  }
}

function addNoiseBurst(data, at, duration, gain) {
  const start = Math.floor(at * SR);
  const length = Math.max(1, Math.floor(duration * SR));
  let previous = 0;
  for (let j = 0; j < length && start + j < LEN; j++) {
    const n = Math.random() * 2 - 1;
    const filtered = n - previous;
    previous = n;
    const env = Math.sin((Math.PI * j) / length) ** 2;
    data[start + j] += filtered * env * gain;
  }
}

function addOwl(data, at, gain) {
  const notes = [
    { freq: 392, duration: 0.42 },
    { freq: 330, duration: 0.55 },
  ];
  let time = at;
  for (const note of notes) {
    addChirp(data, time, note.duration, note.freq, note.freq * 0.94, gain, {
      warble: 4,
      warbleRate: 5,
      decay: 1.2,
      harmonic: 0.15,
    });
    time += note.duration + 0.2;
  }
}

function addKnocks(data, at, gain) {
  let time = at;
  for (let i = 0; i < 5; i++) {
    addChirp(data, time, 0.045, 820, 700, gain, { decay: 5, harmonic: 0.2 });
    time += 0.085 + rand(0, 0.02);
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

function applyFades(data, fadeInSeconds, fadeOutSeconds) {
  const fadeIn = Math.min(data.length, Math.floor(fadeInSeconds * SR));
  const fadeOut = Math.min(data.length, Math.floor(fadeOutSeconds * SR));
  for (let i = 0; i < fadeIn; i++) {
    data[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
  }
  for (let i = 0; i < fadeOut; i++) {
    data[data.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeOut);
  }
}

function master(raw, peak = 0.5) {
  const out = new Float32Array(N);
  out.set(raw.subarray(0, N));
  if (!LONG) {
    for (let i = 0; i < CROSS; i++) {
      const w = i / CROSS;
      out[i] = raw[i] * w + raw[N + i] * (1 - w);
    }
  }
  let max = 0;
  for (const sample of out) max = Math.max(max, Math.abs(sample));
  const scale = max > 0 ? peak / max : 1;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  if (LONG) applyFades(out, 2.5, 6);
  return out;
}

/* --------------------------------------------------------------------------
   Ambientes
   -------------------------------------------------------------------------- */

function lluvia() {
  const raw = make();
  addRain(raw, 0.9, 5200);
  highpass(raw, 180);
  const droplets = LONG ? Math.round(26 * SCALE) : 26;
  for (let i = 0; i < droplets; i++) {
    addTone(raw, rand(0, SECONDS), rand(0.05, 0.18), rand(900, 2600), rand(0.015, 0.06), {
      slide: rand(-500, 500),
      harmonic: 0.1,
      decay: 4.5,
    });
  }
  breathe(raw, LONG ? 1 / 90 : 1 / SECONDS, 0.25);
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
  if (LONG) {
    let at = rand(8, 22);
    while (at < SECONDS - 8) {
      thunder(at, rand(3.2, 5.8));
      at += rand(45, 95);
    }
  } else {
    thunder(3.2, 5.5);
    thunder(10.8, 3.8);
  }

  breathe(raw, LONG ? 1 / 120 : 1 / 8, 0.3);
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
  addCrackles(raw, LONG ? Math.round(130 * SCALE) : 130, 0.22);
  breathe(raw, LONG ? 1 / 23 : 1 / 4, 0.3);
  return master(raw, 0.46);
}

function mar() {
  const raw = make();
  const surf = make();
  mixNoise(surf, 1);
  highpass(surf, 110);
  lowpass(surf, 1400);

  const wavePeriod = LONG ? 9 : SECONDS;
  const step = TAU / (wavePeriod * SR);
  const slowStep = TAU / (73 * SR);
  for (let i = 0; i < LEN; i++) {
    let swell = (0.5 + 0.5 * Math.sin(step * i - Math.PI / 2)) ** 1.6;
    if (LONG) {
      swell *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(slowStep * i + 0.6));
    }
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
    let swell = (0.5 + 0.5 * Math.sin(step * i - Math.PI / 2)) ** 4;
    if (LONG) {
      swell *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(slowStep * i + 0.6));
    }
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

  const bubbles = LONG ? Math.round(38 * SCALE) : 38;
  for (let i = 0; i < bubbles; i++) {
    addTone(raw, rand(0, SECONDS), rand(0.06, 0.2), rand(420, 1200), rand(0.02, 0.07), {
      slide: rand(150, 700),
      harmonic: 0.08,
      decay: 4,
    });
  }
  breathe(raw, LONG ? 1 / 55 : 1 / 8, 0.22);
  return master(raw, 0.44);
}

function viento() {
  const raw = make();
  const low = make();
  mixNoise(low, 1);
  lowpass(low, 420);
  breathe(low, LONG ? 1 / 23 : 1 / 16, 0.65, 0);
  add(raw, low, 1);

  const mid = make();
  mixNoise(mid, 1);
  bandpass(mid, 900, 0.7);
  breathe(mid, LONG ? 1 / 13 : 1 / 8, 0.8, 1.4);
  add(raw, mid, 0.75);

  const high = make();
  mixNoise(high, 1);
  highpass(high, 2200);
  breathe(high, LONG ? 1 / 31 : 1 / 16, 0.9, 3.1);
  add(raw, high, 0.18);

  if (LONG) breathe(raw, 1 / 150, 0.35);
  return master(raw, 0.44);
}

function espacio() {
  const raw = make();
  addDrone(raw, [55, 82.5, 110, 165], 0.055);
  breathe(raw, LONG ? 1 / 170 : 1 / 16, 0.45, 0.8);

  const shimmer = make();
  mixNoise(shimmer, 1);
  highpass(shimmer, 3200);
  breathe(shimmer, LONG ? 1 / 90 : 1 / 8, 0.85, 2.2);
  add(raw, shimmer, 0.05);

  sine(raw, 220, 0.018);
  sine(raw, 329.0625, 0.01);

  if (LONG) {
    const notes = [220, 277.1875, 329.625, 440, 554.375];
    let at = rand(12, 30);
    while (at < SECONDS - 8) {
      addTone(raw, at, rand(2.4, 4.2), notes[Math.floor(rand(0, notes.length))], rand(0.014, 0.03), {
        harmonic: 0.12,
        decay: 3.4,
      });
      at += rand(28, 58);
    }
  }
  return master(raw, 0.4);
}

function cuento() {
  const raw = make();
  addDrone(raw, [220, 261.625, 329.625, 440], 0.022);
  breathe(raw, LONG ? 1 / 70 : 1 / 8, 0.35, 1.1);

  const air = make();
  mixNoise(air, 1);
  lowpass(air, 1800);
  highpass(air, 300);
  add(raw, air, 0.025);

  if (LONG) {
    const scale = [440, 493.875, 523.25, 587.328, 659.25, 783.99, 880];
    let at = 0.8;
    let i = 0;
    while (at < SECONDS - 2) {
      const freq = scale[i % scale.length] * (Math.random() < 0.12 ? 0.5 : 1);
      addTone(raw, at, rand(1.6, 2.8), freq, rand(0.045, 0.07), {
        harmonic: 0.3,
        decay: 3.8,
      });
      if (Math.random() < 0.35) {
        addTone(raw, at + rand(0.15, 0.4), 1.2, freq * 2, 0.012, {
          harmonic: 0.1,
          decay: 4.2,
        });
      }
      at += rand(1.8, 4.8);
      i += Math.random() < 0.25 ? 2 : 1;
    }
  } else {
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
  }
  return master(raw, 0.44);
}

function meditacion() {
  const raw = make();
  addDrone(raw, [110, 165, 220, 330], 0.035);
  sine(raw, 55, 0.05);
  sine(raw, 82.5, 0.025);
  breathe(raw, LONG ? 1 / 95 : 1 / 8, 0.5, 0);

  const air = make();
  mixNoise(air, 1);
  bandpass(air, 2400, 0.5);
  breathe(air, LONG ? 1 / 60 : 1 / 8, 0.7, 2.4);
  add(raw, air, 0.025);

  if (LONG) {
    const bowls = [220, 277.1875, 329.625, 440];
    let at = rand(18, 35);
    while (at < SECONDS - 10) {
      addTone(raw, at, rand(3, 5), bowls[Math.floor(rand(0, bowls.length))], 0.025, {
        harmonic: 0.1,
        decay: 4,
      });
      at += rand(45, 85);
    }
  }
  return master(raw, 0.38);
}

function burbujas() {
  const raw = make();

  const water = make();
  mixNoise(water, 1);
  lowpass(water, 900);
  highpass(water, 90);
  breathe(water, LONG ? 1 / 21 : 1 / 5, 0.4, 0.3);
  add(raw, water, 0.2);

  const low = make();
  brown(low, 1.1);
  lowpass(low, 180);
  add(raw, low, 0.28);

  const bubbles = LONG ? Math.round(70 * SCALE) : 70;
  for (let i = 0; i < bubbles; i++) {
    const at = rand(0, SECONDS - 0.4);
    const startFreq = rand(250, 900);
    const duration = rand(0.05, 0.2);
    addChirp(raw, at, duration, startFreq, startFreq * rand(1.3, 2.3), rand(0.022, 0.052), {
      decay: rand(2.4, 4.4),
      harmonic: 0.14,
    });
    if (Math.random() < 0.18) {
      addChirp(raw, at + rand(0.02, 0.09), duration * 1.4, startFreq * 0.4, startFreq * 0.75, rand(0.01, 0.022), {
        decay: 3.2,
        harmonic: 0.08,
      });
    }
  }

  const fizz = make();
  mixNoise(fizz, 1);
  highpass(fizz, 2400);
  breathe(fizz, LONG ? 1 / 34 : 1 / 7, 0.5, 1.4);
  add(raw, fizz, 0.028);

  const pops = LONG ? Math.round(24 * SCALE) : 24;
  for (let i = 0; i < pops; i++) {
    const at = rand(0, SECONDS - 0.2);
    const freq = rand(900, 1900);
    addChirp(raw, at, rand(0.025, 0.07), freq, freq * rand(1.1, 1.8), rand(0.012, 0.03), {
      decay: 4,
      harmonic: 0.1,
    });
  }

  breathe(raw, LONG ? 1 / 47 : 1 / 9, 0.18);
  lowpass(raw, 6800);
  return master(raw, 0.42);
}

function pajaros() {
  const raw = make();

  const leaves = make();
  mixNoise(leaves, 1);
  highpass(leaves, 260);
  lowpass(leaves, 2600);
  breathe(leaves, LONG ? 1 / 19 : 1 / 7, 0.35, 0.4);
  add(raw, leaves, 0.09);

  const air = make();
  brown(air, 1.3);
  lowpass(air, 150);
  add(raw, air, 0.28);

  const phrases = LONG ? Math.round(10 * SCALE) : 10;
  for (let i = 0; i < phrases; i++) {
    addBirdPhrase(raw, rand(0, SECONDS - 2), rand(1700, 3600), rand(0.025, 0.05));
  }

  const cuckoos = LONG ? Math.max(1, Math.round(2 * SCALE)) : 1;
  for (let i = 0; i < cuckoos; i++) {
    const at = rand(1, SECONDS - 2);
    addChirp(raw, at, 0.26, 700, 680, 0.03, { decay: 1.2, harmonic: 0.1 });
    addChirp(raw, at + 0.36, 0.32, 580, 560, 0.027, { decay: 1.2, harmonic: 0.1 });
  }

  breathe(raw, LONG ? 1 / 90 : 1 / 16, 0.2);
  lowpass(raw, 6800);
  return master(raw, 0.44);
}

function bichos() {
  const raw = make();

  const air = make();
  mixNoise(air, 1);
  highpass(air, 180);
  lowpass(air, 1200);
  add(raw, air, 0.12);

  const low = make();
  brown(low, 1.1);
  lowpass(low, 190);
  add(raw, low, 0.28);

  const crickets = LONG ? Math.round(16 * SCALE) : 16;
  for (let i = 0; i < crickets; i++) {
    addCricket(
      raw,
      rand(0, SECONDS - 2.5),
      rand(0.8, 2.6),
      rand(3200, 4600),
      rand(18, 32),
      rand(0.015, 0.038),
    );
  }

  const buzz = make();
  mixNoise(buzz, 1);
  bandpass(buzz, 4800, 1.6);
  for (let i = 0; i < LEN; i++) {
    const pulse = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin((TAU * 52 * i) / SR)) ** 2;
    buzz[i] *= pulse;
  }
  add(raw, buzz, 0.022);

  breathe(raw, LONG ? 1 / 55 : 1 / 8, 0.2);
  lowpass(raw, 6800);
  return master(raw, 0.4);
}

function bosque() {
  const raw = make();

  const wind = make();
  mixNoise(wind, 1);
  lowpass(wind, 1000);
  highpass(wind, 80);
  breathe(wind, LONG ? 1 / 27 : 1 / 9, 0.5, 0.2);
  add(raw, wind, 0.38);

  const leaves = make();
  mixNoise(leaves, 1);
  highpass(leaves, 1400);
  lowpass(leaves, 5200);
  breathe(leaves, LONG ? 1 / 14 : 1 / 5, 0.6, 1.8);
  add(raw, leaves, 0.13);

  const low = make();
  brown(low, 1);
  lowpass(low, 130);
  add(raw, low, 0.32);

  const rustles = LONG ? Math.round(2 * SCALE) : 3;
  for (let i = 0; i < rustles; i++) {
    addNoiseBurst(raw, rand(0, SECONDS - 0.5), rand(0.15, 0.5), rand(0.01, 0.03));
  }

  const creaks = LONG ? Math.max(1, Math.round(1 * SCALE)) : 1;
  for (let i = 0; i < creaks; i++) {
    addTone(raw, rand(0, SECONDS - 2), rand(0.4, 1.1), rand(80, 180), 0.018, {
      slide: rand(-30, 30),
      harmonic: 0.1,
      decay: 2,
    });
  }

  const birds = LONG ? Math.round(3 * SCALE) : 4;
  for (let i = 0; i < birds; i++) {
    addBirdPhrase(raw, rand(0, SECONDS - 2), rand(1900, 3200), rand(0.012, 0.028));
  }

  const woodpeckers = LONG ? Math.max(1, Math.round(0.5 * SCALE)) : 1;
  for (let i = 0; i < woodpeckers; i++) {
    addKnocks(raw, rand(0, SECONDS - 1), rand(0.018, 0.032));
  }

  breathe(raw, LONG ? 1 / 70 : 1 / 16, 0.25);
  lowpass(raw, 6800);
  return master(raw, 0.42);
}

function noche() {
  const raw = make();

  const air = make();
  mixNoise(air, 1);
  lowpass(air, 600);
  highpass(air, 60);
  breathe(air, LONG ? 1 / 43 : 1 / 11, 0.4, 0.7);
  add(raw, air, 0.24);

  sine(raw, 55, 0.035);
  sine(raw, 82.5, 0.016);

  const crickets = LONG ? Math.round(4 * SCALE) : 8;
  for (let i = 0; i < crickets; i++) {
    addCricket(
      raw,
      rand(0, SECONDS - 3),
      rand(1.4, 3.4),
      rand(3300, 4400),
      rand(18, 28),
      rand(0.008, 0.02),
    );
  }

  const owls = LONG ? Math.max(2, Math.round(0.4 * SCALE)) : 1;
  for (let i = 0; i < owls; i++) {
    addOwl(raw, rand(1, SECONDS - 3), 0.028);
  }

  breathe(raw, LONG ? 1 / 100 : 1 / 16, 0.3);
  lowpass(raw, 6800);
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
  burbujas,
  pajaros,
  bichos,
  bosque,
  noche,
};

const longInfo = {
  lluvia: { title: 'Lluvia', description: 'Azules oscuros, gotas y aire húmedo.', accent: '#8fbdff' },
  tormenta: { title: 'Tormenta', description: 'Lluvia, viento y truenos que llegan de lejos.', accent: '#a99bff' },
  fuego: { title: 'Fuego', description: 'Brasas, chasquidos y un resplandor irregular.', accent: '#ffa45c' },
  mar: { title: 'Mar', description: 'Oleaje lento, espuma y resaca.', accent: '#5cebd5' },
  rio: { title: 'Río', description: 'Agua entre piedras, con pájaros al fondo.', accent: '#79e8b7' },
  viento: { title: 'Viento', description: 'Ráfagas, hojas y corriente.', accent: '#b7d8d3' },
  espacio: { title: 'Espacio', description: 'Drones graves, polvo estelar y destellos.', accent: '#a48bff' },
  cuento: { title: 'Cuento', description: 'Kalimba, pads y melodías oníricas.', accent: '#ffd08a' },
  meditacion: { title: 'Meditación', description: 'Drone profundo, respiración y cuencos.', accent: '#9dded8' },
  burbujas: { title: 'Burbujas', description: 'Baño de espuma, borboteo y agua cálida.', accent: '#8fe9e3' },
  pajaros: { title: 'Pájaros', description: 'Trinos, hojas y luz de amanecer.', accent: '#e6d891' },
  bichos: { title: 'Bichos', description: 'Grillos, cigarras y luciérnagas.', accent: '#d7e08f' },
  bosque: { title: 'Bosque', description: 'Hojas, ramas y sombra verde.', accent: '#9ed6a0' },
  noche: { title: 'Noche', description: 'Grillos lejanos, búho y luna.', accent: '#9fb2d9' },
};

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = LONG
  ? path.join(here, '..', 'sounds', 'generados')
  : path.join(here, '..', 'assets', 'audio');
fs.mkdirSync(outDir, { recursive: true });

const made = [];

for (const [name, create] of Object.entries(tracks)) {
  const samples = create();

  if (!LONG) {
    const file = path.join(outDir, `${name}.wav`);
    writeWav(file, samples);
    console.log(`${name.padEnd(11)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    continue;
  }

  const wavFile = path.join(outDir, `${name}.wav`);
  const mp3File = path.join(outDir, `${name}.mp3`);
  writeWav(wavFile, samples);
  try {
    execFileSync(
      'ffmpeg',
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', wavFile,
        '-ac', '1',
        '-ar', String(SR),
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        '-metadata', `title=sen · ${longInfo[name].title}`,
        '-metadata', 'artist=sen',
        '-metadata', 'album=sen · ambientes sintéticos',
        '-metadata', 'comment=Generado con scripts/make-placeholder-audio.mjs',
        mp3File,
      ],
      { stdio: 'ignore' },
    );
    fs.unlinkSync(wavFile);
    made.push({ name, ...longInfo[name], file: `${name}.mp3` });
    console.log(`${name.padEnd(11)} ${(fs.statSync(mp3File).size / 1048576).toFixed(1)} MB · ${(SECONDS / 60).toFixed(0)} min`);
  } catch (error) {
    made.push({ name, ...longInfo[name], file: `${name}.wav` });
    console.warn(`${name.padEnd(11)} WAV (ffmpeg no disponible: ${error.message})`);
  }
}

if (LONG) {
  const totalSize = made.reduce((sum, track) => {
    const file = path.join(outDir, track.file);
    return sum + fs.statSync(file).size;
  }, 0);
  const minutes = Math.round(SECONDS / 60);
  const cards = made
    .map(
      (track, index) => `      <article class="track" style="--accent:${track.accent}">
        <div class="track__head">
          <span class="track__num">${String(index + 1).padStart(2, '0')}</span>
          <div>
            <h2>${track.title}</h2>
            <p>${track.description}</p>
          </div>
          <span class="track__time">${minutes}:00</span>
        </div>
        <audio controls preload="none" src="${track.file}"></audio>
        <code>sounds/generados/${track.file}</code>
      </article>`,
    )
    .join('\n');

  const index = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml" />
  <title>sen · sintéticos largos</title>
  <style>
    :root { color-scheme: dark; --bg:#07080a; --ink:#eae6dd; --muted:#8a8882; --line:rgba(255,255,255,.08); }
    * { box-sizing: border-box; }
    html { background: var(--bg); }
    body { margin:0; padding:clamp(20px,4vw,48px); background:radial-gradient(120% 60% at 50% -5%, #13151c 0%, transparent 55%), var(--bg); color:var(--ink); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
    .wrap { max-width: 980px; margin: 0 auto; }
    .brand { margin:0 0 10px; font-size:14px; letter-spacing:.4em; color:rgba(234,230,221,.8); }
    h1 { margin:0 0 10px; font-size:clamp(28px,5vw,44px); font-weight:400; letter-spacing:-.02em; }
    .intro { margin:0; max-width:650px; color:var(--muted); font-size:14px; line-height:1.6; }
    .meta { display:flex; gap:8px; flex-wrap:wrap; margin:20px 0 30px; }
    .meta span { border:1px solid var(--line); border-radius:999px; padding:5px 10px; color:var(--muted); font-size:11px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }
    .track { border:1px solid var(--line); border-radius:14px; padding:16px; background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.008)); }
    .track__head { display:flex; align-items:flex-start; gap:10px; margin-bottom:12px; }
    .track__num { color:var(--accent); font-size:10px; padding-top:4px; }
    .track h2 { margin:0 0 3px; font-size:16px; font-weight:500; color:var(--accent); }
    .track p { margin:0; color:var(--muted); font-size:11px; line-height:1.45; }
    .track__time { margin-left:auto; color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; }
    audio { width:100%; height:34px; display:block; }
    code { display:block; margin-top:10px; color:#6f6d68; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10px; }
    .foot { margin-top:36px; padding-top:18px; border-top:1px solid var(--line); color:#5f5d58; font-size:11px; line-height:1.7; }
    a { color:#8d8a84; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="brand">sen</p>
    <h1>Ambientes sintéticos</h1>
    <p class="intro">Las versiones largas de los ${made.length} ambientes generados para sen. La síntesis evoluciona durante toda la pista para que no se note el bucle de 16 segundos.</p>
    <div class="meta"><span>${made.length} pistas</span><span>${minutes} min cada una</span><span>${(totalSize / 1048576).toFixed(0)} MB</span><span>generado localmente</span></div>
    <div class="grid">
${cards}
    </div>
    <p class="foot">MP3 mono a 64 kbps, generado con <code>scripts/make-placeholder-audio.mjs --long</code>. Se publica con el proyecto. <a href="../../">Volver a sen</a>.</p>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), index);

  const readme = `# Ambientes sintéticos largos

Versiones de ${minutes} minutos de los ${made.length} ambientes generados con
\`scripts/make-placeholder-audio.mjs --long\`. Son las mismas texturas que los
placeholders de 16 s, pero con eventos y modulaciones repartidos a lo largo de
toda la pista para evitar que se note el bucle.

- Formato: MP3 mono, 64 kbps, ${SR} Hz.
- Duración: ${minutes}:00 por pista.
- Peso total: ${(totalSize / 1048576).toFixed(0)} MB.
- Carácter: ruido filtrado, drones, gotas, chasquidos y melodías sintetizadas.

## Escuchar

Desde la raíz del proyecto:

\`\`\`bash
python3 -m http.server 4174
\`\`\`

Y abre <http://localhost:4174/sounds/generados/>.

## Regenerar

\`\`\`bash
node scripts/make-placeholder-audio.mjs --long
\`\`\`

La carpeta \`sounds/generados/\` se incluye en el repositorio y se publica con
la app. Para usar uno de estos MP3 en la app, copia el archivo a
\`assets/audio/\` y apunta el ambiente correspondiente en
\`src/config/ambients.js\`.

## Pistas

${made.map((track) => `- \`${track.file}\` — ${track.title}: ${track.description}`).join('\n')}
`;
  fs.writeFileSync(path.join(outDir, 'README.md'), readme);

  fs.writeFileSync(
    path.join(outDir, 'playlist.m3u'),
    ['#EXTM3U', ...made.map((track) => `#EXTINF:${SECONDS},${track.title}\n${track.file}`)].join('\n'),
  );

  console.log(`\nListo: ${made.length} pistas de ${minutes} min en sounds/generados.`);
} else {
  console.log(`\nListo: ${Object.keys(tracks).length} bucles de ${SECONDS} s en assets/audio.`);
}
