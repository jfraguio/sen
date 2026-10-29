/**
 * Worker de pistas de sen: calcula las capas de una pista publicada de la app
 * con el mismo generador que la creó (`scripts/lib/`). Es el único punto del
 * laboratorio que usa ese generador; el motor (`engine/`) no depende de él y
 * solo recibe el audio de cada capa.
 */

import { publishedCatalog, publishedLayers } from '../scripts/lib/published.js';

async function read(rel) {
  const res = await fetch(new URL(`../${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`no se pudo leer ${rel}`);
  return new Uint8Array(await res.arrayBuffer());
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'catalog') {
      self.postMessage({ type: 'catalog', id: m.id, catalog: publishedCatalog() });
    } else if (m.type === 'layers') {
      const r = await publishedLayers(m.ambient, m.track, read);
      self.postMessage({ type: 'layers', id: m.id, result: r }, r.layers.map((l) => l.data.buffer));
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: err?.message || String(err) });
  }
};
