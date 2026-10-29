/**
 * Capas de las pistas publicadas en la app (`assets/audio/<id>/0N.wav`).
 *
 * Las pistas que salen del generador de paisajes se recalculan y se separan
 * en sus capas (la suma es la pista, salvo el limitador final). Las de la
 * síntesis base no se pueden regenerar igual: se leen del WAV publicado como
 * una sola capa. `readFile(ruta)` lee bytes (fetch en el navegador, fs en Node).
 *
 * Módulo ES sin dependencias externas: vale en Node y en un Worker.
 */

import { AMBIENT_NAMES, FIRST_SCENE, PUBLISHED, publishedCatalog, renderLayers } from './soundscapes.js';
import { decodeWav } from './dsp.js';

export { publishedCatalog, AMBIENT_NAMES };

/** Ruta del WAV publicado, relativa a la raíz del repositorio. */
export const publishedPath = (ambient, track) => `assets/audio/${ambient}/${String(track).padStart(2, '0')}.wav`;

/**
 * `{ ambient, track, title, name, sampleRate, duration, lufs, layers: [{ name, data }] }`
 * con `data` en Float32Array mono.
 */
export async function publishedLayers(ambient, track, readFile) {
  const list = PUBLISHED[ambient];
  if (!list || !(track >= 1 && track <= list.length)) throw new Error(`No existe la pista ${ambient}/${track}.`);
  const scene = list[track - 1];
  const name = AMBIENT_NAMES[ambient] || ambient;
  if (scene === 'base') {
    const wav = decodeWav(await readFile(publishedPath(ambient, track)));
    return {
      ambient, track, name, title: 'Escena original', sampleRate: wav.sampleRate, duration: wav.samples.length / wav.sampleRate, lufs: -23,
      layers: [{ name: 'Escena completa', data: wav.samples }],
    };
  }
  const r = renderLayers(ambient, scene - FIRST_SCENE);
  return {
    ambient, track, name, title: r.title, sampleRate: r.sampleRate, duration: r.layers[0].samples.length / r.sampleRate, lufs: r.lufs,
    layers: r.layers.map((l) => ({ name: l.name, data: l.samples })),
  };
}
