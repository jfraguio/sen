/**
 * Worker de vistas: renderiza cada elemento por separado a baja resolución y
 * devuelve su forma de onda resumida (RMS por tramos, en dB normalizados).
 * Va en su propio hilo para no competir con la escucha.
 */

import { compile, createRenderer } from './engine/index.js';

const SR = 11025;
const BINS = 160;
const MAX_SECONDS = 600;
let queue = [];
let busy = false;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'request') {
    queue = queue.filter((q) => q.key !== m.key);
    queue.push(m);
    pump();
  } else if (m.type === 'clear') queue = [];
};

const sleep = () => new Promise((r) => setTimeout(r, 0));

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.pop();
    try {
      const data = await overview(job);
      if (data) self.postMessage({ type: 'overview', key: job.key, data }, [data.buffer]);
    } catch {
      /* elemento no renderizable: se queda sin vista */
    }
    await sleep();
  }
  busy = false;
}

async function overview({ project, track, el, span }) {
  const seconds = Math.min(MAX_SECONDS, span);
  if (!(seconds > 0)) return null;
  const mini = {
    ...project,
    duration: Math.max(10, seconds + 1),
    end: { mode: 'tail', fadeOut: 0 },
    region: null,
    master: { ...project.master, gain: 0, reverb: { ...project.master.reverb }, echo: { ...project.master.echo } },
    tracks: [{ ...track, mix: { gain: 0, pan: 0, reverb: 0, echo: 0, mute: false, solo: false }, automation: undefined, elements: [{ ...el, start: 0 }] }],
  };
  const plan = compile(mini, { sampleRate: SR, mode: 'export', end: 'tail' });
  const r = createRenderer(plan, { limiter: false });
  const frames = Math.round(seconds * SR);
  const per = Math.max(1, Math.floor(frames / BINS));
  const out = new Float32Array(BINS);
  const L = new Float32Array(per);
  const R = new Float32Array(per);
  for (let b = 0; b < BINS; b++) {
    r.renderInto(L, R, 0, per);
    let e = 0;
    for (let i = 0; i < per; i++) e += L[i] * L[i] + R[i] * R[i];
    const db = 10 * Math.log10(e / (2 * per) + 1e-12);
    out[b] = Math.max(0, Math.min(1, (db + 60) / 54));
    if (b % 20 === 19) await sleep();
  }
  return out;
}
