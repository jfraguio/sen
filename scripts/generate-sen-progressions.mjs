/**
 * Genera `lab/app/sen-progressions.js` con las progresiones de acordes de las
 * capas sostenidas de todas las pistas publicadas de sen.
 *
 * El generador de paisajes marca cada capa creada con `pads()`; este script
 * renderiza las 84 escenas una vez y guarda solo esos acordes (MIDI) para que
 * el modo teclado no tenga que calcular audio al abrir la lista «Sen».
 *
 * Uso: node scripts/generate-sen-progressions.mjs
 */

import fs from 'node:fs';
import { publishedCatalog } from './lib/published.js';
import { FIRST_SCENE, renderLayers } from './lib/soundscapes.js';

const catalog = publishedCatalog();
const total = catalog.reduce((n, amb) => n + amb.tracks.length, 0);
const list = [];
let done = 0;

for (const amb of catalog) {
  for (const track of amb.tracks) {
    done++;
    process.stderr.write(`[${done}/${total}] ${amb.id}/${track.track}… `);
    if (track.scene == null) {
      process.stderr.write('sin escena\n');
      continue;
    }
    const result = renderLayers(amb.id, track.scene - FIRST_SCENE);
    const layers = result.layers.filter((layer) => layer.progression?.length > 1);
    for (const layer of layers) {
      list.push({
        name: `${amb.name} ${String(track.track).padStart(2, '0')}`,
        layer: layer.name,
        chords: layer.progression,
      });
    }
    process.stderr.write(`${layers.length} progresión(es)\n`);
  }
}

const body = `/**
 * Progresiones de acordes de las capas sostenidas de las pistas publicadas.
 *
 * Archivo generado por scripts/generate-sen-progressions.mjs; no editar a mano.
 * Cada acorde es una lista de notas MIDI.
 */

export const SEN_PROGRESSIONS = ${JSON.stringify(list, null, 2)};
`;

fs.writeFileSync(new URL('../lab/app/sen-progressions.js', import.meta.url), body);
process.stderr.write(`\nEscrito lab/app/sen-progressions.js con ${list.length} progresiones.\n`);
