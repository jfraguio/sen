/**
 * Worker de exportación: dos pasadas (medida y escritura) y WAV por trozos.
 */

import { renderToWav } from './engine/index.js';

let controller = null;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'cancel') {
    controller?.abort();
    return;
  }
  if (m.type !== 'export') return;
  controller = new AbortController();
  try {
    const { parts, stats } = await renderToWav(m.project, m.options, {
      signal: controller.signal,
      samples: m.samples || null,
      onProgress: (p) => self.postMessage({ type: 'progress', p }),
    });
    const buffers = parts.map((p) => (p.byteOffset === 0 && p.byteLength === p.buffer.byteLength ? p.buffer : p.slice().buffer));
    self.postMessage({ type: 'done', buffers, stats }, buffers);
  } catch (err) {
    self.postMessage({ type: err?.name === 'AbortError' ? 'cancelled' : 'error', message: err?.message || String(err) });
  } finally {
    controller = null;
  }
};
