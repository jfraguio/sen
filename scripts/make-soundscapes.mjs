/**
 * Genera las escenas de alta calidad 04.wav … 08.wav de cada ambiente con el
 * motor de `scripts/lib/soundscapes.js` (22,05 kHz, mono, 16 bits, 30 s, bucle
 * sin costura, sonoridad ≈ −23 LUFS). 04–06 son paisaje puro; 07–08 llevan
 * melodía sutil y pad. No toca las escenas 01–03.
 *
 * Con `--publish` escribe directamente las pistas que usa la app (01.wav …
 * 04.wav) a partir de la tabla `PUBLISHED`; las de síntesis base no se tocan.
 *
 * Uso:
 *   node scripts/make-soundscapes.mjs
 *   node scripts/make-soundscapes.mjs --only=lluvia,fuego
 *   node scripts/make-soundscapes.mjs --only=mar --scene=5
 *   node scripts/make-soundscapes.mjs --scene=7,8
 *   node scripts/make-soundscapes.mjs --publish [--only=bosque]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, FIRST_SCENE, PUBLISHED, renderScene, SAMPLE_RATE } from './lib/soundscapes.js';
import { encodeWav, master, seed } from './lib/dsp.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ONLY = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const SCENE = arg('scene')?.split(',').map(Number).filter(Boolean) ?? null;
const PUBLISH = process.argv.includes('--publish');

const here = path.dirname(fileURLToPath(import.meta.url));
const audioRoot = path.join(here, '..', 'assets', 'audio');

function write(id, number, fileName) {
  const started = Date.now();
  const scene = SCENES[id][number - FIRST_SCENE];
  const samples = renderScene(id, number - FIRST_SCENE);
  const { lufs, reductionDb } = master.stats;
  seed(`${id}/${number}/dither`);
  const dir = path.join(audioRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fileName);
  fs.writeFileSync(file, encodeWav(samples, SAMPLE_RATE));
  console.log(
    `${id}/${fileName}  ${PUBLISH ? `(escena ${String(number).padStart(2, '0')}) ` : ''}${scene.title.padEnd(34)} ${(fs.statSync(file).size / 1024).toFixed(0).padStart(5)} KB`
    + `  ${lufs.toFixed(1)} LUFS  limitador ${reductionDb.toFixed(1)} dB  ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
}

for (const [id, scenes] of Object.entries(SCENES)) {
  if (ONLY && !ONLY.includes(id)) continue;
  if (PUBLISH) {
    PUBLISHED[id].forEach((number, k) => {
      if (number === 'base' || (SCENE && !SCENE.includes(number))) return;
      write(id, number, `${String(k + 1).padStart(2, '0')}.wav`);
    });
    continue;
  }
  scenes.forEach((_, index) => {
    const number = FIRST_SCENE + index;
    if (SCENE && !SCENE.includes(number)) return;
    write(id, number, `${String(number).padStart(2, '0')}.wav`);
  });
}

console.log('\nListo.');
