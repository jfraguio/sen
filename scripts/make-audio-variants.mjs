/**
 * Genera dos variantes sintéticas (02.wav y 03.wav) para cada ambiente.
 * La variante 01 es el WAV principal que ya vive en la carpeta.
 *
 * Uso: node scripts/make-audio-variants.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAmbient, SAMPLE_RATE } from '../lab/synth.js';

const VARIANTS = {
  lluvia: [
    { intensity: 0.75, drops: 0.5, hiss: 0.45, wind: 0.15, brightness: 0.7 },
    { intensity: 0.45, drops: 0.65, hiss: 0.65, wind: 0.35, brightness: 0.45 },
  ],
  tormenta: [
    { rain: 0.7, thunder: 0.7, wind: 0.55, rumble: 0.65, brightness: 0.55 },
    { rain: 0.4, thunder: 0.35, wind: 0.3, rumble: 0.75, brightness: 0.4 },
  ],
  fuego: [
    { intensity: 0.75, crackle: 0.8, rumble: 0.4, flicker: 0.6, brightness: 0.65 },
    { intensity: 0.35, crackle: 0.5, rumble: 0.7, flicker: 0.25, brightness: 0.4 },
  ],
  mar: [
    { speed: 0.7, depth: 0.75, foam: 0.6, wind: 0.35, brightness: 0.65 },
    { speed: 0.25, depth: 0.55, foam: 0.35, wind: 0.1, brightness: 0.4 },
  ],
  rio: [
    { flow: 0.7, bubbles: 0.65, width: 0.6, air: 0.35, brightness: 0.65 },
    { flow: 0.4, bubbles: 0.25, width: 0.4, air: 0.5, brightness: 0.45 },
  ],
  viento: [
    { gust: 0.75, speed: 0.7, air: 0.6, brightness: 0.6 },
    { gust: 0.3, speed: 0.3, air: 0.4, brightness: 0.4 },
  ],
  espacio: [
    { drone: 0.62, shimmer: 0.3, movement: 0.45, brightness: 0.45, filterHz: 1000 },
    { drone: 0.48, shimmer: 0.42, movement: 0.35, brightness: 0.55, filterHz: 1000 },
  ],
  cuento: [
    { pads: 0.65, notes: 0.75, tempo: 0.65, sparkle: 0.55, brightness: 0.65 },
    { pads: 0.4, notes: 0.35, tempo: 0.35, sparkle: 0.25, brightness: 0.45 },
  ],
  meditacion: [
    { drone: 0.65, breath: 0.6, bowls: 0.65, brightness: 0.6 },
    { drone: 0.4, breath: 0.25, bowls: 0.25, brightness: 0.4 },
  ],
  pajaros: [
    { birds: 0.8, variety: 0.7, wind: 0.2, leaves: 0.3, brightness: 0.6 },
    { birds: 0.4, variety: 0.35, wind: 0.45, leaves: 0.6, brightness: 0.45 },
  ],
  bichos: [
    { crickets: 0.8, cicadas: 0.6, air: 0.25, brightness: 0.6 },
    { crickets: 0.4, cicadas: 0.2, air: 0.5, brightness: 0.4 },
  ],
  bosque: [
    { wind: 0.6, leaves: 0.7, birds: 0.55, rustle: 0.6, brightness: 0.6 },
    { wind: 0.35, leaves: 0.4, birds: 0.2, rustle: 0.25, brightness: 0.4 },
  ],
  noche: [
    { crickets: 0.75, owl: 0.5, wind: 0.25, drone: 0.55, brightness: 0.5 },
    { crickets: 0.35, owl: 0.2, wind: 0.45, drone: 0.25, brightness: 0.3 },
  ],
  burbujas: [
    { bubbles: 0.75, pops: 0.7, water: 0.6, fizz: 0.55, brightness: 0.6 },
    { bubbles: 0.35, pops: 0.3, water: 0.4, fizz: 0.2, brightness: 0.4 },
  ],
};

function lowpass(data, freq, q = 0.707) {
  const sampleRate = SAMPLE_RATE;
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const b0 = (1 - cos) / 2;
  const b1 = 1 - cos;
  const b2 = (1 - cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    data[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }
  const cross = Math.floor(1.2 * sampleRate);
  for (let i = 0; i < cross; i++) {
    const w = i / cross;
    data[i] = data[i] * w + data[data.length - cross + i] * (1 - w);
  }
  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? 0.4 / peak : 1;
  for (let i = 0; i < data.length; i++) data[i] *= gain;
}

function writeWav(file, samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
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

const here = path.dirname(fileURLToPath(import.meta.url));
const audioRoot = path.join(here, '..', 'assets', 'audio');

for (const [id, variants] of Object.entries(VARIANTS)) {
  const dir = path.join(audioRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  variants.forEach((variant, index) => {
    const file = path.join(dir, `${String(index + 2).padStart(2, '0')}.wav`);
    const { filterHz, ...params } = variant;
    const samples = renderAmbient(id, params);
    if (filterHz) lowpass(samples, filterHz);
    writeWav(file, samples);
    console.log(`${id}/${path.basename(file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  });
}

console.log('\nListo: variantes 02 y 03 generadas.');
