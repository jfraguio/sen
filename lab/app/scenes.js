/**
 * Pistas de sen en el laboratorio: catálogo de pistas publicadas y audio de
 * sus capas (calculado en `scene-worker.js` y guardado en memoria).
 *
 *   const scenes = createSceneSource();
 *   const list = await scenes.catalog();
 *   const r = await scenes.load('bosque', 3);   // { name, title, sampleRate, duration, lufs, layers }
 *   const samples = await scenes.samplesFor(project);   // { 'bosque/03#0': { rate, data, id }, … }
 */

import { layerKey } from '../engine/schema.js';

export function createSceneSource() {
  let worker = null;
  let seq = 0;
  let catalog = null;
  const waiting = new Map();
  const cache = new Map();

  function start() {
    worker = new Worker(new URL('../scene-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.type === 'error') w.reject(new Error(m.message));
      else w.resolve(m);
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      for (const w of waiting.values()) w.reject(new Error('el generador de pistas se ha detenido'));
      waiting.clear();
      worker.terminate();
      worker = null;
    };
  }

  function call(msg) {
    if (!worker) start();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id });
    });
  }

  const api = {
    catalog() {
      if (!catalog) catalog = call({ type: 'catalog' }).then((m) => m.catalog).catch((err) => { catalog = null; throw err; });
      return catalog;
    },
    /** Capas de una pista publicada (una sola vez por pista y sesión). */
    load(ambient, track) {
      const key = `${ambient}/${track}`;
      if (!cache.has(key)) {
        cache.set(key, call({ type: 'layers', ambient, track }).then((m) => m.result).catch((err) => {
          cache.delete(key);
          throw err;
        }));
      }
      return cache.get(key);
    },
    /** ¿Usa el proyecto capas de pistas de sen? */
    uses(project) {
      return project.tracks.some((t) => t.family === 'layer');
    },
    /** Audio de todas las capas que usa un proyecto. */
    async samplesFor(project) {
      const wanted = new Map();
      for (const t of project.tracks) if (t.family === 'layer') wanted.set(`${t.source.ambient}/${t.source.track}`, t.source);
      const out = {};
      for (const src of wanted.values()) {
        const r = await api.load(src.ambient, src.track);
        r.layers.forEach((l, k) => {
          out[layerKey({ ambient: src.ambient, track: src.track, layer: k })] = { rate: r.sampleRate, data: l.data, id: `${src.ambient}/${src.track}` };
        });
      }
      return out;
    },
  };
  return api;
}
