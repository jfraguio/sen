/**
 * Diálogo de exportación: WAV (Worker de exportación con progreso y
 * cancelación), proyecto `.sen.json` y script autónomo.
 */

import { h, toast, announce } from './util.js';
import { EXPORT_PRESETS } from '../engine/schema.js';
import { ENGINE_MODULES, slugify } from '../engine/index.js';
import { downloadBlob, downloadProject } from './storage.js';
import { buildStandalone } from './standalone.js';

export function createExportDialog(store, actions) {
  const { state } = store;
  const dialog = document.getElementById('export-dialog');
  const form = document.getElementById('export-form');
  const presets = document.getElementById('export-presets');
  const estimate = document.getElementById('export-estimate');
  const warning = document.getElementById('export-warning');
  const progress = document.getElementById('export-progress');
  const bar = document.getElementById('export-bar');
  const ptext = document.getElementById('export-progress-text');
  const result = document.getElementById('export-result');
  const btnWav = document.getElementById('export-wav');
  const btnCancel = document.getElementById('export-cancel');
  const btnClose = document.getElementById('export-close');
  const btnScript = document.getElementById('export-script');
  const btnProject = document.getElementById('export-project');
  let worker = null;
  let started = 0;
  let lastAnnounce = -1;

  for (const [id, p] of [...Object.entries(EXPORT_PRESETS), ['custom', { label: 'Personalizado' }]]) {
    presets.append(h('label', {}, h('input', { type: 'radio', name: 'preset', value: id }), p.label));
  }

  const field = (name) => form.elements.namedItem(name);

  function read() {
    const lv = field('loudness').value;
    return {
      sampleRate: Number(field('sampleRate').value),
      bits: Number(field('bits').value),
      channels: Number(field('channels').value),
      end: field('end').value || null,
      loudness: lv === 'none' ? null : Number(lv),
      ceiling: Math.max(-6, Math.min(-0.1, Number(field('ceiling').value) || -1)),
      range: field('range').value,
    };
  }

  function write(o) {
    field('sampleRate').value = String(o.sampleRate);
    field('bits').value = String(o.bits);
    field('channels').value = String(o.channels);
    field('end').value = o.end || '';
    field('loudness').value = o.loudness === null ? 'none' : String(o.loudness);
    field('ceiling').value = String(o.ceiling);
    field('range').value = o.range === 'region' && state.project.region ? 'region' : 'all';
  }

  function matchPreset() {
    const o = read();
    const found = Object.entries(EXPORT_PRESETS).find(([, p]) => p.sampleRate === o.sampleRate && p.bits === o.bits && p.channels === o.channels && (p.end || null) === (o.end || null) && p.loudness === o.loudness && p.ceiling === o.ceiling);
    const id = found ? found[0] : 'custom';
    for (const r of presets.querySelectorAll('input')) r.checked = r.value === id;
  }

  function update() {
    const o = read();
    const p = state.project;
    const end = o.end || p.end.mode;
    const len = o.range === 'region' && p.region ? p.region.end - p.region.start : p.duration;
    const seconds = len + (end === 'tail' ? Math.min(20, (p.master.reverb?.decay ?? 4.5) * 1.5) : 0);
    const bytes = seconds * o.sampleRate * o.channels * (o.bits / 8);
    const mb = bytes / 1e6;
    estimate.textContent = `≈ ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB · ${Math.round(seconds)} s${end === 'tail' ? ' (aprox., con cola)' : ''}${o.loudness === null ? ' · una pasada' : ' · dos pasadas (medida y escritura)'}`;
    const warns = [];
    if (mb > 300) warns.push('Archivo de más de 300 MB: en móvil puede fallar.');
    if (end === 'loop' && len > 600) warns.push('Un bucle no puede durar más de 10 minutos.');
    if (end === 'loop' && len < 10) warns.push('Un bucle debe durar al menos 10 s.');
    warning.textContent = warns.join(' ');
    warning.hidden = !warns.length;
    btnWav.disabled = !!worker || (end === 'loop' && (len > 600 || len < 10));
    field('range').querySelector('option[value="region"]').disabled = !p.region;
  }

  presets.addEventListener('change', (e) => {
    const p = EXPORT_PRESETS[e.target.value];
    if (p) write({ ...read(), ...p, range: read().range });
    update();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'preset') {
      matchPreset();
      update();
    }
  });

  function busy(on) {
    btnCancel.hidden = !on;
    btnWav.disabled = on;
    btnClose.disabled = on;
    progress.hidden = !on;
    for (const el of form.querySelectorAll('select, input')) el.disabled = on;
  }

  function saveOptions(o) {
    store.commit((d) => {
      d.export = { ...d.export, ...o };
    });
  }

  btnWav.addEventListener('click', () => {
    const o = read();
    saveOptions(o);
    result.hidden = true;
    busy(true);
    bar.parentElement.style.setProperty('--p', '0%');
    bar.style.width = '0%';
    ptext.textContent = '0 %';
    lastAnnounce = -1;
    actions.stopPlayback();
    started = performance.now();
    worker = new Worker(new URL('../export-worker.js', import.meta.url), { type: 'module' });
    const project = state.project;
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        const pct = Math.floor(m.p * 100);
        bar.style.width = `${pct}%`;
        const elapsed = (performance.now() - started) / 1000;
        const left = m.p > 0.02 ? elapsed * (1 - m.p) / m.p : null;
        ptext.textContent = `${pct} %${left !== null ? ` · quedan ≈ ${Math.ceil(left)} s` : ''}`;
        if (Math.floor(pct / 10) !== lastAnnounce) {
          lastAnnounce = Math.floor(pct / 10);
          announce(`Exportando: ${lastAnnounce * 10} %`);
        }
        return;
      }
      worker.terminate();
      worker = null;
      busy(false);
      update();
      if (m.type === 'done') {
        const stamp = new Date();
        const pad = (v) => String(v).padStart(2, '0');
        const name = `${slugify(project.name)}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.wav`;
        downloadBlob(new Blob(m.buffers, { type: 'audio/wav' }), name);
        const s = m.stats;
        const f = (v) => (Number.isFinite(v) ? v.toFixed(1).replace('.', ',') : '—');
        result.hidden = false;
        result.textContent = '';
        result.append(
          h('strong', {}, `✓ ${name}`), h('br'),
          `${f(s.duration)} s · ${s.sampleRate} Hz · ${s.bits} bits · ${s.channels === 1 ? 'mono' : 'estéreo'} · sonoridad ${f(s.lufs)} LUFS · pico ${f(s.peak)} dBFS · limitador ${f(s.reduction)} dB`,
        );
        const overshoot = s.measured !== null && Number.isFinite(s.lufs) && o.loudness !== null && o.loudness - s.lufs > 0.5;
        if (overshoot) result.append(h('p', { class: 'warn' }, 'El limitador ha bajado la sonoridad más de 0,5 LU: el objetivo es demasiado alto para este tema.'));
        announce('Exportación terminada.');
      } else if (m.type === 'cancelled') {
        announce('Exportación cancelada.');
      } else {
        toast(`No se pudo exportar: ${m.message}`, { error: true });
      }
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      busy(false);
      toast('No se pudo exportar: el motor se ha detenido.', { error: true });
    };
    worker.postMessage({ type: 'export', project, options: o });
  });

  btnCancel.addEventListener('click', () => {
    worker?.postMessage({ type: 'cancel' });
  });

  btnClose.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (e) => {
    if (worker) e.preventDefault();
  });

  btnProject.addEventListener('click', () => {
    saveOptions(read());
    downloadProject(state.project);
    actions.markDownloaded();
  });

  btnScript.addEventListener('click', async () => {
    const o = read();
    saveOptions(o);
    try {
      const base = new URL('../engine/', import.meta.url);
      const sources = await Promise.all(ENGINE_MODULES.map(async (m) => {
        const res = await fetch(new URL(m, base));
        if (!res.ok) throw new Error(`no se pudo leer ${m}`);
        return [m, await res.text()];
      }));
      const slug = slugify(state.project.name);
      const text = buildStandalone(sources, state.project, o, slug);
      downloadBlob(new Blob([text], { type: 'text/javascript' }), `${slug}.render.mjs`);
      announce('Script descargado.');
    } catch (err) {
      toast(`No se pudo generar el script: ${err.message}`, { error: true });
    }
  });

  return {
    open() {
      write({ ...state.project.export });
      matchPreset();
      result.hidden = true;
      progress.hidden = true;
      update();
      dialog.showModal();
    },
    get busy() {
      return !!worker;
    },
  };
}
