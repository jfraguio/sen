/**
 * Genera las tres variantes (01.wav, 02.wav y 03.wav) de cada ambiente.
 * Cada escena prioriza el carácter del sonido y deja un fondo mínimo.
 *
 * Uso:
 *   node scripts/make-audio-variants.mjs
 *   node scripts/make-audio-variants.mjs --only=bichos
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAmbient, SAMPLE_RATE } from './lib/synth.js';

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice('--only='.length).split(',').map((id) => id.trim()) : null;

/* Cada ambiente tiene tres escenas: 01, 02 y 03. */
const BASE_VARIANTS = {
  lluvia: { scene: 0 },
  tormenta: { scene: 0 },
  fuego: { scene: 0 },
  mar: { scene: 0 },
  rio: { scene: 0 },
  viento: { scene: 0 },
  espacio: { scene: 0 },
  cuento: { scene: 0 },
  meditacion: { scene: 0 },
  pajaros: { scene: 0 },
  bichos: { scene: 0 },
  bosque: { scene: 0 },
  noche: { scene: 0 },
  burbujas: { scene: 0 },
};

const VARIANTS = {
  lluvia: [
    { scene: 1, intensity: 0.72, drops: 0.55, hiss: 0.4, brightness: 0.68 },
    { scene: 2, intensity: 0.9, drops: 0.6, hiss: 0.45, wind: 0.4, brightness: 0.48 },
  ],
  tormenta: [
    { scene: 1, rain: 0.7, thunder: 0.7, wind: 0.5, rumble: 0.65, brightness: 0.52 },
    { scene: 2, rain: 0.5, thunder: 0.55, wind: 0.7, rumble: 0.5, brightness: 0.4 },
  ],
  fuego: [
    { scene: 1, intensity: 0.75, crackle: 0.85, flicker: 0.65, brightness: 0.65 },
    { scene: 2, intensity: 0.55, crackle: 0.6, rumble: 0.6, flicker: 0.4, brightness: 0.42 },
  ],
  mar: [
    { scene: 1, speed: 0.65, depth: 0.78, foam: 0.6, wind: 0.25, brightness: 0.6 },
    { scene: 2, speed: 0.45, depth: 0.95, foam: 0.85, wind: 0.4, brightness: 0.48 },
  ],
  rio: [
    { scene: 1, flow: 0.8, bubbles: 0.75, width: 0.55, air: 0.25, brightness: 0.68 },
    { scene: 2, flow: 0.5, bubbles: 0.4, width: 0.8, air: 0.2, brightness: 0.4 },
  ],
  viento: [
    { scene: 1, gust: 0.8, speed: 0.7, air: 0.6, brightness: 0.55 },
    { scene: 2, gust: 0.6, speed: 0.35, air: 0.7, brightness: 0.68 },
  ],
  espacio: [
    { scene: 1, drone: 0.55, shimmer: 0.65, movement: 0.7, brightness: 0.55 },
    { scene: 2, drone: 0.8, shimmer: 0.25, movement: 0.4, brightness: 0.35 },
  ],
  cuento: [
    { scene: 1, pads: 0.5, notes: 0.8, tempo: 0.75, sparkle: 0.6, brightness: 0.65 },
    { scene: 2, pads: 0.7, notes: 0.45, tempo: 0.3, sparkle: 0.2, brightness: 0.4 },
  ],
  meditacion: [
    { scene: 1, drone: 0.6, breath: 0.7, bowls: 0.35, brightness: 0.5 },
    { scene: 2, drone: 0.75, breath: 0.4, bowls: 0.8, brightness: 0.4 },
  ],
  pajaros: [
    { scene: 1, birds: 0.9, variety: 0.8, leaves: 0.3, wind: 0.15, brightness: 0.6 },
    { scene: 2, birds: 0.4, variety: 0.45, leaves: 0.45, wind: 0.4, brightness: 0.4 },
  ],
  bichos: [
    { scene: 1, crickets: 0.78, cicadas: 0.32, air: 0.18, brightness: 0.58 },
    { scene: 2, crickets: 0.72, cicadas: 0.5, air: 0.12, brightness: 0.44 },
  ],
  bosque: [
    { scene: 1, wind: 0.7, leaves: 0.8, rustle: 0.7, birds: 0.2, brightness: 0.55 },
    { scene: 2, wind: 0.25, leaves: 0.4, rustle: 0.3, birds: 0.75, brightness: 0.62 },
  ],
  noche: [
    { scene: 1, crickets: 0.85, owl: 0.25, wind: 0.15, drone: 0.25, brightness: 0.5 },
    { scene: 2, crickets: 0.4, owl: 0.7, wind: 0.25, drone: 0.6, brightness: 0.35 },
  ],
  burbujas: [
    { scene: 1, bubbles: 0.85, pops: 0.8, fizz: 0.7, water: 0.4, brightness: 0.65 },
    { scene: 2, bubbles: 0.5, pops: 0.25, water: 0.7, fizz: 0.15, brightness: 0.35 },
  ],
};

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
  if (ONLY && !ONLY.includes(id)) continue;
  const dir = path.join(audioRoot, id);
  fs.mkdirSync(dir, { recursive: true });

  if (BASE_VARIANTS[id]) {
    const file = path.join(dir, '01.wav');
    writeWav(file, renderAmbient(id, BASE_VARIANTS[id]));
    console.log(`${id}/01.wav ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }

  variants.forEach((variant, index) => {
    const file = path.join(dir, `${String(index + 2).padStart(2, '0')}.wav`);
    const samples = renderAmbient(id, variant);
    writeWav(file, samples);
    console.log(`${id}/${path.basename(file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  });
}

console.log('\nListo: las tres variantes están generadas.');
