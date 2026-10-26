/**
 * Genera las escenas de alta calidad 04.wav, 05.wav y 06.wav de cada ambiente
 * con el motor de `scripts/lib/soundscapes.js` (22,05 kHz, mono, 16 bits, 30 s, bucle
 * sin costura, sonoridad ≈ −23 LUFS). No toca las escenas 01–03.
 *
 * Uso:
 *   node scripts/make-soundscapes.mjs
 *   node scripts/make-soundscapes.mjs --only=lluvia,fuego
 *   node scripts/make-soundscapes.mjs --only=mar --scene=5
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, FIRST_SCENE, renderScene, SAMPLE_RATE } from './lib/soundscapes.js';
import { encodeWav, master, seed } from './lib/dsp.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ONLY = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const SCENE = arg('scene') ? Number(arg('scene')) : null;

const here = path.dirname(fileURLToPath(import.meta.url));
const audioRoot = path.join(here, '..', 'assets', 'audio');

for (const [id, scenes] of Object.entries(SCENES)) {
  if (ONLY && !ONLY.includes(id)) continue;
  const dir = path.join(audioRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  scenes.forEach((scene, index) => {
    const number = FIRST_SCENE + index;
    if (SCENE && SCENE !== number) return;
    const started = Date.now();
    const samples = renderScene(id, index);
    const { lufs, reductionDb } = master.stats;
    seed(`${id}/${number}/dither`);
    const file = path.join(dir, `${String(number).padStart(2, '0')}.wav`);
    fs.writeFileSync(file, encodeWav(samples, SAMPLE_RATE));
    console.log(
      `${id}/${path.basename(file)}  ${scene.title.padEnd(34)} ${(fs.statSync(file).size / 1024).toFixed(0).padStart(5)} KB`
      + `  ${lufs.toFixed(1)} LUFS  limitador ${reductionDb.toFixed(1)} dB  ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  });
}

console.log('\nListo: escenas 04–06 generadas.');
