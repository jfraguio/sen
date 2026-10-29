/**
 * sen lab · arranque y orquestación del editor.
 */

import { h, fmtTime, toast, announce, findTrack, findElement, typingTarget, isCompact, clampNum } from './util.js';
import {
  INSTRUMENTS, LIMITS, LabFileError, createElement, createProject, createSceneProject, createTrack, layerKey, newId, normalizeProject, projectCounts,
} from '../engine/schema.js';
import { sustainVoiceCount } from '../engine/voices/sustain.js';
import { noteLabel } from '../engine/music.js';
import { SCALE_LABELS } from '../engine/music.js';
import { createStore } from './store.js';
import { LabAudio } from './audio.js';
import { createTimeline, gridSeconds } from './timeline.js';
import { createInspector } from './inspector.js';
import { createLibrary, startTemplates } from './library.js';
import { createExportDialog } from './export.js';
import { createCompact } from './compact.js';
import { downloadProject, isDownloaded, loadAutosave, readProjectFile, scheduleAutosave, writeMeta } from './storage.js';
import { midiToTracks } from './midi.js';
import { createSceneSource } from './scenes.js';

/* ------------------------------------------------------------ requisitos */

function missingRequirements() {
  const out = [];
  if (!window.isSecureContext) out.push('Contexto seguro (HTTPS o localhost).');
  if (!('AudioContext' in window)) out.push('Web Audio.');
  if (!('AudioWorkletNode' in window)) out.push('AudioWorklet.');
  if (!('Worker' in window)) out.push('Web Workers.');
  else {
    let module = false;
    try {
      const w = new Worker('data:text/javascript,', { get type() { module = true; return 'module'; } });
      w.terminate();
    } catch {
      /* sin soporte */
    }
    if (!module) out.push('Workers de tipo módulo.');
  }
  if (!('structuredClone' in window)) out.push('structuredClone.');
  return out;
}

const missing = missingRequirements();
document.getElementById('boot').remove();
if (missing.length) {
  document.getElementById('unsupported').hidden = false;
  const list = document.getElementById('unsupported-list');
  for (const m of missing) list.append(h('li', {}, m));
} else {
  boot();
}

/* ------------------------------------------------------------ arranque */

function boot() {
  document.getElementById('app').hidden = false;
  const saved = loadAutosave();
  const store = createStore(saved?.project || createProject({ seed: 'vacio' }));
  const { state } = store;
  const $ = (id) => document.getElementById(id);

  let meters = null;
  let inspector = null;
  let clipboard = [];
  let soloOverride = null;

  const audio = new LabAudio({
    onMeters: (m) => {
      meters = m;
    },
    onEnded: () => {
      store.set({ playing: false });
      state.playhead = Math.min(state.playhead, state.project.duration);
      updateTransport();
    },
    onStatus: (s) => {
      $('st-load').textContent = `motor ${Math.round(s.load * 100)} %`;
      $('st-load').classList.toggle('load-high', s.load > 0.8);
      $('st-quality').hidden = s.quality !== 'low';
    },
    onCompiled: (c) => {
      const w = $('st-warn');
      // Mientras las capas se están calculando, el aviso de «falta audio» es
      // transitorio: se oculta para no confundirlo con un error.
      const pending = !$('st-layers').hidden;
      const warnings = pending ? c.warnings.filter((x) => !x.startsWith('Falta el audio de')) : c.warnings;
      w.hidden = !warnings.length;
      w.textContent = warnings.join(' ');
    },
    onUnderrun: () => {
      $('st-load').classList.add('load-high');
    },
    onError: (msg) => {
      store.set({ playing: false });
      updateTransport();
      const w = $('st-warn');
      w.hidden = false;
      w.textContent = '';
      w.append(`${msg} `, h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => { audio.restart(); w.hidden = true; toast('Motor reiniciado.'); } }, 'Reiniciar motor'));
      toast(`${msg} El proyecto no se ha perdido.`, { error: true });
    },
  });
  audio.setProject(state.project);

  /* ------------------------------------------------------------ vistas de onda */

  const overviews = new Map();
  const pending = new Set();
  let overviewWorker = null;
  let overviewRender = 0;
  function overviewKey(track, el) {
    const p = state.project;
    const { mix, name, color, collapsed, automation, elements, ...timbre } = track;
    return JSON.stringify([p.seed, p.key, p.tuning, timbre, { ...el, start: 0 }]);
  }
  function overview(track, el, span) {
    if (track.family === 'layer' && !layerSamples[layerKey(track.source)]) return null;
    const key = overviewKey(track, el);
    const hit = overviews.get(key);
    if (hit) return hit;
    if (!pending.has(key) && span <= 600) {
      pending.add(key);
      if (!overviewWorker) {
        overviewWorker = new Worker(new URL('../overview-worker.js', import.meta.url), { type: 'module' });
        if (Object.keys(layerSamples).length) overviewWorker.postMessage({ type: 'samples', samples: layerSamples });
        overviewWorker.onmessage = (e) => {
          if (e.data.type !== 'overview') return;
          pending.delete(e.data.key);
          if (overviews.size > 400) overviews.clear();
          overviews.set(e.data.key, e.data.data);
          cancelAnimationFrame(overviewRender);
          overviewRender = requestAnimationFrame(() => {
            if (!dragging()) timeline.render();
          });
        };
      }
      const p = state.project;
      overviewWorker.postMessage({ type: 'request', key, project: { seed: p.seed, key: p.key, tuning: p.tuning, tempo: p.tempo, master: p.master, schema: p.schema }, track: { ...track, elements: [] }, el, span });
    }
    return null;
  }
  const dragging = () => !!document.querySelector('.el.is-dragging, .tl-marquee:not([hidden])');

  /* ------------------------------------------------------------ acciones */

  const notify = (text, error = false) => toast(text, { error });

  function checkLimits(project) {
    const c = projectCounts(project);
    if (c.tracks > LIMITS.tracks) return `El máximo es ${LIMITS.tracks} pistas.`;
    if (c.elements > LIMITS.elements) return `El máximo es ${LIMITS.elements} elementos.`;
    // Voces sostenidas simultáneas (notas × unísono), con barrido temporal.
    const edges = [];
    for (const t of project.tracks) {
      if (t.family !== 'sustain') continue;
      for (const e of t.elements) {
        const v = sustainVoiceCount(t, e);
        edges.push([e.start, v], [e.start + e.length, -v]);
      }
    }
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0;
    let max = 0;
    for (const [, v] of edges) {
      cur += v;
      max = Math.max(max, cur);
    }
    if (max > LIMITS.sustainVoices) return `${max} voces sostenidas a la vez (máximo ${LIMITS.sustainVoices}: notas × voces de unísono).`;
    if (JSON.stringify(project).length > LIMITS.projectBytes) return 'El proyecto superaría 1 MB.';
    return null;
  }

  /** Todo cambio pasa por la comprobación de límites: si se supera, no se aplica. */
  const rawCommit = store.commit.bind(store);
  let lastLimit = '';
  store.commit = (fn, opts) => {
    let reason = null;
    const okk = rawCommit((d) => {
      if (fn(d) === false) return false;
      reason = checkLimits(d);
      return reason ? false : undefined;
    }, opts);
    if (reason && reason !== lastLimit) notify(`No se puede: ${reason}`, true);
    lastLimit = reason || '';
    if (reason) inspector?.render(true);
    return okk;
  };
  const guarded = (fn, opts) => store.commit(fn, opts);

  /* ------------------------------------------------------------ pistas de sen */

  const scenes = createSceneSource();
  /** Audio de las capas de pistas de sen ya calculadas: `{ clave: { rate, data, id } }`. */
  const layerSamples = {};
  let layersPending = null;

  function shareSamples(add) {
    if (!Object.keys(add).length) return;
    Object.assign(layerSamples, add);
    audio.setSamples(add);
    overviewWorker?.postMessage({ type: 'samples', samples: add });
  }

  /** Prepara el audio de las capas que use el proyecto (si falta). */
  function ensureLayers(project) {
    const missing = project.tracks.some((t) => t.family === 'layer' && !layerSamples[layerKey(t.source)]);
    if (!missing) return Promise.resolve(true);
    if (layersPending) return layersPending;
    $('st-layers').hidden = false;
    layersPending = scenes.samplesFor(project)
      .then((add) => {
        shareSamples(add);
        timeline.render();
        exporter.refresh();
        return true;
      })
      .catch((err) => {
        notify(`No se pudieron preparar las capas: ${err.message}`, true);
        const w = $('st-warn');
        w.hidden = false;
        w.textContent = `No se pudieron preparar las capas: ${err.message}`;
        return false;
      })
      .finally(() => {
        layersPending = null;
        $('st-layers').hidden = true;
        // Si entretanto se ha abierto otro proyecto, prepara sus capas. Si es
        // el mismo y ha fallado, no reintentar en bucle.
        if (state.project !== project && state.project.tracks.some((t) => t.family === 'layer' && !layerSamples[layerKey(t.source)])) ensureLayers(state.project);
      });
    return layersPending;
  }

  let catalogPromise = null;
  /** Catálogo de canciones de sen (una sola petición por sesión). */
  function getCatalog() {
    if (!catalogPromise) {
      catalogPromise = scenes.catalog().catch((err) => {
        catalogPromise = null;
        throw err;
      });
    }
    return catalogPromise;
  }

  let layersBusy = false;

  /** Abre una canción publicada como proyecto de capas. Devuelve su info o `null`. */
  async function loadSceneProject(ambient, track, status = null) {
    if (layersBusy) return null;
    if (!confirmDiscard()) return null;
    layersBusy = true;
    if (status) status.textContent = 'Preparando las capas… (unos segundos)';
    try {
      const r = await scenes.load(ambient, track);
      const { project } = normalizeProject(createSceneProject({ ...r, layers: r.layers.map((l) => l.name) }));
      shareSamples(await scenes.samplesFor(project));
      loadProject(project);
      if (status) status.textContent = '';
      return r;
    } catch (err) {
      const msg = `No se pudo abrir: ${err.message}`;
      if (status) status.textContent = msg;
      else notify(msg, true);
      return null;
    } finally {
      layersBusy = false;
    }
  }

  /** Abre una plantilla de la biblioteca: el tema vacío o una canción de sen. */
  async function openTemplate(t) {
    if (layersBusy) return;
    if (t.blank) {
      if (!confirmDiscard()) return;
      loadProject(createProject({ seed: 'vacio' }));
      actions.closeSheet();
      return;
    }
    notify(`Preparando «${t.name}»… (unos segundos)`);
    const r = await loadSceneProject(t.ambient, t.track);
    if (!r) return;
    actions.closeSheet();
    notify(`${t.name}: ${r.layers.length} ${r.layers.length === 1 ? 'capa' : 'capas'} a 0 dB.`);
  }

  const actions = {
    notify,
    overview,
    layerSamples: () => layerSamples,
    layersReady: () => !state.project.tracks.some((t) => t.family === 'layer' && !layerSamples[layerKey(t.source)]),
    focusLibrary() {
      if (isCompact()) actions.openSheet('library');
      else library.focus();
    },
    addTrack(inst, time) {
      let elId = null;
      const ok = guarded((d) => {
        const t = createTrack(inst, d);
        const start = clampNum(time ?? 0, 0, Math.max(0, d.duration - 1));
        const e = createElement(t, d, start);
        t.elements.push(e);
        d.tracks.push(t);
        elId = e.id;
      });
      if (ok) {
        store.select({ kind: 'element', elementIds: [elId] });
        announce(`${INSTRUMENTS[inst].label} añadido.`);
        if (isCompact()) actions.closeSheet();
      }
    },
    addElement(trackId, time) {
      let elId = null;
      const ok = guarded((d) => {
        const t = findTrack(d, trackId);
        if (!t) return false;
        const e = createElement(t, d, clampNum(time, 0, d.duration - 0.5));
        t.elements.push(e);
        elId = e.id;
      });
      if (ok) store.select({ kind: 'element', elementIds: [elId] });
    },
    toggleMix(trackId, key) {
      store.commit((d) => {
        const t = findTrack(d, trackId);
        if (!t) return false;
        t.mix[key] = !t.mix[key];
      });
    },
    seek(t) {
      const time = clampNum(t, 0, state.project.duration + 20);
      state.playhead = time;
      audio.seek(time);
      timeline.updatePlayhead(time);
      updateClock(time);
    },
    regionChanged() {
      updateTransport();
      if (state.playing && state.regionLoop) audio.setLoop(state.project.region);
    },
    clearRegion() {
      store.commit((d) => {
        d.region = null;
      });
      store.set({ regionLoop: false });
      if (state.playing) audio.setLoop(null);
      updateTransport();
    },
    auditionTrack(trackId, note = null) {
      const t = findTrack(state.project, trackId);
      if (t) audio.audition(state.project, t, { note, seconds: note ? 1.6 : 3 });
    },
    auditionInstrument(inst) {
      audio.audition(state.project, createTrack(inst, state.project), { seconds: 3 });
    },

    soloElement(id, on) {
      if (on) {
        if (soloOverride === id) return;
        soloOverride = id;
        const p = structuredClone(state.project);
        for (const t of p.tracks) {
          const has = t.elements.some((e) => e.id === id);
          t.mix.solo = false;
          t.mix.mute = !has;
          if (has) t.elements = t.elements.filter((e) => e.id === id);
        }
        audio.setProject(p);
        if (!state.playing) {
          const f = findElement(state.project, id);
          if (f) {
            actions.seek(f.el.start);
            togglePlay();
          }
        }
      } else if (soloOverride === id) {
        soloOverride = null;
        audio.setProject(state.project);
      }
    },
    duplicateTrack(id) {
      let nid = null;
      guarded((d) => {
        const t = findTrack(d, id);
        if (!t) return false;
        const copy = structuredClone(t);
        copy.id = newId('t');
        copy.name = `${t.name} (2)`;
        copy.mix.solo = false;
        for (const e of copy.elements) e.id = newId('e');
        d.tracks.splice(d.tracks.indexOf(t) + 1, 0, copy);
        nid = copy.id;
      });
      if (nid) store.select({ kind: 'track', trackId: nid });
    },
    deleteTrack(id) {
      const t = findTrack(state.project, id);
      store.commit((d) => {
        d.tracks = d.tracks.filter((x) => x.id !== id);
      });
      store.select({ kind: 'project' });
      if (t) announce(`Pista ${t.name} borrada. Cmd/Ctrl+Z para deshacer.`);
    },
    duplicateSelection() {
      const ids = state.selection.kind === 'element' ? state.selection.elementIds : [];
      if (!ids.length) return;
      const out = [];
      guarded((d) => {
        let span = 0;
        let min = Infinity;
        for (const id of ids) {
          const f = findElement(d, id);
          if (!f) continue;
          min = Math.min(min, f.el.start);
          span = Math.max(span, f.el.start + (f.el.type === 'hit' ? 1 : f.el.length));
        }
        const off = span - min;
        for (const id of ids) {
          const f = findElement(d, id);
          if (!f) continue;
          const c = { ...structuredClone(f.el), id: newId('e'), start: Math.round(clampNum(f.el.start + off, 0, d.duration - 0.01) * 1000) / 1000 };
          f.track.elements.push(c);
          out.push(c.id);
        }
      });
      if (out.length) store.select({ kind: 'element', elementIds: out });
    },
    deleteSelection() {
      const s = state.selection;
      if (s.kind === 'element') {
        const ids = new Set(s.elementIds);
        store.commit((d) => {
          for (const t of d.tracks) t.elements = t.elements.filter((e) => !ids.has(e.id));
        });
        store.select({ kind: 'project' });
        announce(`${ids.size === 1 ? 'Elemento borrado' : `${ids.size} elementos borrados`}.`);
      } else if (s.kind === 'track') actions.deleteTrack(s.trackId);
    },
    splitAtPlayhead() {
      const t0 = state.playhead;
      const ids = state.selection.kind === 'element' ? state.selection.elementIds : [];
      let n = 0;
      guarded((d) => {
        for (const id of ids) {
          const f = findElement(d, id);
          if (!f || f.el.type === 'hit') continue;
          const { el } = f;
          if (t0 <= el.start + 0.05 || t0 >= el.start + el.length - 0.05) continue;
          const len1 = Math.round((t0 - el.start) * 1000) / 1000;
          const second = { ...structuredClone(el), id: newId('e'), start: Math.round(t0 * 1000) / 1000, length: Math.round((el.length - len1) * 1000) / 1000, fadeIn: 0 };
          if (el.type === 'clip') second.offset = Math.round(((el.offset || 0) + len1) * 1000) / 1000;
          second.fadeOut = Math.min(el.fadeOut, second.length);
          el.length = len1;
          el.fadeOut = 0;
          el.fadeIn = Math.min(el.fadeIn, len1);
          f.track.elements.push(second);
          n++;
        }
        return n > 0 ? undefined : false;
      });
      if (!n) notify('Coloca el cabezal dentro del elemento seleccionado para dividirlo.');
    },
    copy(cut = false) {
      const ids = state.selection.kind === 'element' ? state.selection.elementIds : [];
      clipboard = ids.map((id) => findElement(state.project, id)).filter(Boolean).map((f) => ({ trackId: f.track.id, el: structuredClone(f.el) }));
      if (cut && clipboard.length) actions.deleteSelection();
      if (clipboard.length) announce(`${clipboard.length} copiado${clipboard.length > 1 ? 's' : ''}.`);
    },
    paste() {
      if (!clipboard.length) return;
      const min = Math.min(...clipboard.map((c) => c.el.start));
      const out = [];
      guarded((d) => {
        for (const c of clipboard) {
          const t = findTrack(d, c.trackId);
          if (!t) continue;
          const e = { ...structuredClone(c.el), id: newId('e'), start: Math.round(clampNum(state.playhead + c.el.start - min, 0, d.duration - 0.01) * 1000) / 1000 };
          t.elements.push(e);
          out.push(e.id);
        }
        return out.length ? undefined : false;
      });
      if (out.length) store.select({ kind: 'element', elementIds: out });
    },
    openSheet(which) {
      $('library').classList.toggle('is-open', which === 'library');
      $('inspector').classList.toggle('is-open', which === 'inspector');
    },
    closeSheet() {
      $('library').classList.remove('is-open');
      $('inspector').classList.remove('is-open');
    },
    loadTemplate(template) {
      return openTemplate(template);
    },
    stopPlayback() {
      if (state.playing) togglePlay();
    },
    markDownloaded() {
      updateSaveState();
    },
  };

  /* ------------------------------------------------------------ vistas */

  const timeline = createTimeline($('timeline'), store, actions);
  inspector = createInspector($('inspector'), store, actions);
  const library = createLibrary($('library'), store, actions);
  const exporter = createExportDialog(store, actions);
  const compact = createCompact($('compact'), store, actions);
  getCatalog()
    .then((catalog) => library.setTemplates(startTemplates(catalog)))
    .catch((err) => notify(`No se pudieron cargar las canciones de sen: ${err.message}`, true));

  /* ------------------------------------------------------------ transporte */

  const playBtn = $('play');
  const grid = $('grid');

  function updateClock(t) {
    $('clock').value = `${fmtTime(t)} / ${fmtTime(state.project.duration)}`;
    $('clock').textContent = $('clock').value;
  }

  function updateGridOptions() {
    const opts = [['0', 'libre'], ['0.1', '0,1 s'], ['0.25', '0,25 s'], ['0.5', '0,5 s'], ['1', '1 s'], ['5', '5 s']];
    if (state.project.tempo) opts.push(['beat', 'pulso'], ['bar', 'compás']);
    grid.textContent = '';
    for (const [v, l] of opts) grid.append(h('option', { value: v }, l));
    let cur = String(state.view.grid);
    if (!state.project.tempo && (cur === 'beat' || cur === 'bar')) {
      store.setView({ grid: 0.5 });
      cur = '0.5';
    }
    grid.value = cur;
  }

  function updateTransport() {
    playBtn.setAttribute('aria-pressed', String(state.playing));
    playBtn.setAttribute('aria-label', state.playing ? 'Pausa' : 'Reproducir');
    playBtn.firstElementChild.textContent = state.playing ? '❚❚' : '▶';
    const hasRegion = !!state.project.region;
    $('region-loop').disabled = !hasRegion;
    $('region-loop').setAttribute('aria-pressed', String(hasRegion && state.regionLoop));
    $('region-clear').hidden = !hasRegion;
    $('undo').disabled = !store.canUndo;
    $('redo').disabled = !store.canRedo;
    const k = state.project.key;
    const root = noteLabel(`${k.root}4`, state.view.notation).replace(/-?\d+$/, '');
    $('st-key').textContent = `${root} ${SCALE_LABELS[k.scale].toLowerCase()} · ${state.project.tempo ? `${state.project.tempo.bpm} BPM` : 'sin tempo'} · ${state.project.tracks.length} pistas`;
    updateClock(state.playhead);
  }

  function togglePlay() {
    if (state.playing) {
      state.playhead = audio.currentTime();
      audio.pause();
      store.set({ playing: false });
      announce('Pausa');
    } else {
      const p = state.project;
      let from = state.playhead;
      const loop = state.regionLoop && p.region ? p.region : null;
      if (loop && (from < loop.start || from >= loop.end)) from = loop.start;
      if (!loop && p.end.mode !== 'loop' && from >= p.duration - 0.05) from = 0;
      if (p.end.mode === 'loop' && from >= p.duration) from = 0;
      state.playhead = from;
      store.set({ playing: true });
      audio.play(from, loop).catch((err) => {
        store.set({ playing: false });
        notify(`No se pudo iniciar el audio: ${err.message}`, true);
      });
      announce('Reproduciendo');
    }
    updateTransport();
  }

  function stop() {
    if (state.playing) {
      audio.pause();
      store.set({ playing: false });
    }
    actions.seek(0);
    updateTransport();
  }

  playBtn.addEventListener('click', togglePlay);
  $('stop').addEventListener('click', stop);
  $('region-loop').addEventListener('click', () => toggleRegionLoop());
  $('region-clear').addEventListener('click', () => actions.clearRegion());
  grid.addEventListener('change', () => {
    const v = grid.value;
    store.setView({ grid: v === 'beat' || v === 'bar' ? v : Number(v) });
  });
  $('zoom-in').addEventListener('click', () => timeline.zoom(1.5));
  $('zoom-out').addEventListener('click', () => timeline.zoom(1 / 1.5));
  $('volume').addEventListener('input', (e) => audio.setVolume(Number(e.target.value)));
  $('compact-add').addEventListener('click', () => actions.openSheet('library'));

  function toggleRegionLoop() {
    if (!state.project.region) {
      notify('Marca una región arrastrando sobre la regla.');
      return;
    }
    store.set({ regionLoop: !state.regionLoop });
    if (state.playing) audio.setLoop(state.regionLoop ? state.project.region : null);
    updateTransport();
    timeline.render();
    announce(state.regionLoop ? 'Región en bucle activada' : 'Región en bucle desactivada');
  }

  /* ------------------------------------------------------------ cabecera */

  const nameInput = $('project-name');
  let nameGesture = null;
  nameInput.addEventListener('focus', () => {
    nameGesture = `name${Date.now()}`;
  });
  nameInput.addEventListener('input', () => store.commit((d) => {
    d.name = nameInput.value || 'Tema sin título';
  }, { gesture: nameGesture, source: 'name' }));
  nameInput.addEventListener('blur', () => store.endGesture());
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameInput.blur();
  });
  $('undo').addEventListener('click', () => store.undo());
  $('redo').addEventListener('click', () => store.redo());
  $('new').addEventListener('click', () => {
    if (!confirmDiscard()) return;
    loadProject(createProject({ seed: 'vacio' }));
    actions.closeSheet();
    updateSaveState();
  });
  $('open').addEventListener('click', () => $('open-file').click());
  $('open-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await openFile(file);
  });
  $('save-project').addEventListener('click', () => {
    downloadProject(state.project);
    updateSaveState();
    announce('Proyecto descargado.');
  });
  $('export').addEventListener('click', () => exporter.open());

  function confirmDiscard() {
    if (!state.project.tracks.length || isDownloaded(state.project)) return true;
    return window.confirm('El tema actual no se ha descargado. Seguirá en este navegador hasta que lo sustituyas. ¿Continuar?');
  }

  function loadProject(project, warnings = []) {
    if (state.playing) togglePlay();
    store.load(project);
    writeMeta({ downloadedRevision: null });
    requestAnimationFrame(() => timeline.fit());
    if (warnings.length) notify(warnings.join(' '));
    announce(`Tema «${project.name}» abierto.`);
  }

  async function importMidi(file) {
    try {
      const res = midiToTracks(new Uint8Array(await file.arrayBuffer()), state.project);
      let count = 0;
      const ok = guarded((d) => {
        d.duration = res.duration;
        for (const t of res.tracks) {
          t.elements = t.elements.filter((e) => e.start < d.duration - 0.01);
          count += t.elements.length;
          if (t.elements.length) d.tracks.push(t);
        }
        return count ? undefined : false;
      });
      if (ok) notify(`MIDI importado: ${res.tracks.length} pista${res.tracks.length === 1 ? '' : 's'} y ${count} elementos. ${res.warnings.join(' ')}`.trim());
      else if (!count) notify('El MIDI no tiene notas que importar.', true);
    } catch (err) {
      notify(`No se puede importar el MIDI: ${err.message}`, true);
    }
  }

  async function openFile(file) {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (String.fromCharCode(...head) === 'MThd') {
      await importMidi(file);
      return;
    }
    let read;
    try {
      read = await readProjectFile(file);
    } catch (err) {
      notify(err instanceof LabFileError ? err.message : `No se puede abrir este archivo: ${err.message}`, true);
      return;
    }
    if (!confirmDiscard()) return;
    loadProject(read.project, read.warnings);
    writeMeta({ downloadedRevision: null });
  }

  /* ------------------------------------------------------------ arrastrar archivos */

  const hint = $('drop-hint');
  window.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    hint.hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) hint.hidden = true;
  });
  window.addEventListener('drop', async (e) => {
    hint.hidden = true;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    await openFile(file);
  });

  /* ------------------------------------------------------------ teclado */

  window.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const typing = typingTarget(e.target);
    const k = e.key;
    if (mod && k.toLowerCase() === 'z') {
      if (typing) return;
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && k.toLowerCase() === 'y') {
      if (typing) return;
      e.preventDefault();
      store.redo();
      return;
    }
    if (mod && k.toLowerCase() === 's') {
      e.preventDefault();
      downloadProject(state.project);
      updateSaveState();
      announce('Proyecto descargado.');
      return;
    }
    if (mod && k.toLowerCase() === 'e') {
      e.preventDefault();
      exporter.open();
      return;
    }
    if (typing) return;
    if (mod && k.toLowerCase() === 'c') return actions.copy(false);
    if (mod && k.toLowerCase() === 'x') return actions.copy(true);
    if (mod && k.toLowerCase() === 'v') return actions.paste();
    if (mod && k.toLowerCase() === 'd') {
      e.preventDefault();
      return actions.duplicateSelection();
    }
    if (mod || e.altKey) return;
    const selectedTrack = () => {
      const s = state.selection;
      if (s.kind === 'track') return s.trackId;
      if (s.kind === 'element' && s.elementIds.length) return findElement(state.project, s.elementIds[0])?.track.id;
      return null;
    };
    if (k === ' ') {
      e.preventDefault();
      togglePlay();
    } else if (k === 'Home') {
      e.preventDefault();
      stop();
    } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.target.closest?.('.el') && e.target.type !== 'range') {
      e.preventDefault();
      actions.seek(state.playhead + (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1));
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      actions.deleteSelection();
    } else if (k === 's' || k === 'S') {
      if (e.shiftKey) {
        const t = selectedTrack();
        if (t) actions.toggleMix(t, 'solo');
      } else actions.splitAtPlayhead();
    } else if (k === 'm' || k === 'M') {
      const t = selectedTrack();
      if (t) actions.toggleMix(t, 'mute');
    } else if (k === 'l' || k === 'L') {
      toggleRegionLoop();
    } else if (k === '?') {
      e.preventDefault();
      window.open('guia.html', '_blank', 'noopener');
    } else if (k === '+' || k === '=') {
      timeline.zoom(1.5);
    } else if (k === '-' || k === '_') {
      timeline.zoom(1 / 1.5);
    } else if (k === 'Escape') {
      if (state.selection.kind !== 'project') store.select({ kind: 'project' });
      actions.closeSheet();
    }
  });

  /* ------------------------------------------------------------ guardado */

  let saveText = 'guardado';
  function updateSaveState(text) {
    if (text) saveText = text;
    const dl = isDownloaded(state.project);
    $('save-state').textContent = `${saveText}${state.project.tracks.length ? (dl ? ' · descargado' : ' · sin descargar') : ''}`;
  }

  /* ------------------------------------------------------------ suscripción */

  let lastGridTempo = !!state.project.tempo;
  let lastDuration = state.project.duration;
  store.subscribe((kind, s, info) => {
    if (kind === 'project' || kind === 'load') {
      if (!soloOverride) audio.setProject(s.project);
      scheduleAutosave(s.project, updateSaveState);
      if (info?.source !== 'name' && document.activeElement !== nameInput) nameInput.value = s.project.name;
      if (!!s.project.tempo !== lastGridTempo) {
        lastGridTempo = !!s.project.tempo;
        updateGridOptions();
      }
      if (state.playing && state.regionLoop) audio.setLoop(s.project.region);
      if (s.project.duration !== lastDuration) {
        lastDuration = s.project.duration;
        const view = timeline.scroll.clientWidth;
        const w = s.view.pps * (s.project.duration + 25);
        if (w < view * 0.6) requestAnimationFrame(() => timeline.fit());
      }
      if (kind === 'load') {
        nameInput.value = s.project.name;
        updateGridOptions();
      }
    }
    if (kind === 'project' || kind === 'load') ensureLayers(s.project);
    if (kind === 'project' || kind === 'load' || kind === 'selection' || kind === 'view') {
      if (info?.source !== 'tl-vol') timeline.render();
      inspector.render(kind === 'load' || kind === 'view');
      compact.render();
      updateTransport();
    }
    if (kind === 'selection' && isCompact() && s.selection.kind === 'project') {
      /* La hoja se abre desde las tarjetas. */
    }
  });

  window.matchMedia('(max-width: 899px)').addEventListener('change', () => {
    actions.closeSheet();
    compact.render();
    timeline.render();
  });

  /* ------------------------------------------------------------ bucle de pintado */

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastMeter = 0;
  function frame(now) {
    if (state.playing) {
      const t = audio.currentTime();
      state.playhead = t;
      timeline.updatePlayhead(t, true);
      updateClock(t);
    }
    const interval = reduced.matches ? 250 : 66;
    if (now - lastMeter > interval) {
      lastMeter = now;
      const m = state.playing ? meters : null;
      const toPct = (v) => `${clampNum((20 * Math.log10((v || 0) + 1e-9) + 60) / 60, 0, 1) * 100}%`;
      $('meter-l').style.setProperty('--v', toPct(m?.peakL));
      $('meter-r').style.setProperty('--v', toPct(m?.peakR));
      $('st-lufs').textContent = m && Number.isFinite(m.short) ? `${m.short.toFixed(1).replace('.', ',')} LUFS` : '— LUFS';
      const pk = m ? Math.max(m.peakL, m.peakR) : 0;
      $('st-peak').textContent = m ? `pico ${(20 * Math.log10(pk + 1e-9)).toFixed(1).replace('.', ',')}` : 'pico —';
      $('st-peak').classList.toggle('load-high', pk > 0.98);
      timeline.updateMeters(m?.tracks);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------ inicio */

  nameInput.value = state.project.name;
  updateGridOptions();
  timeline.render();
  inspector.render(true);
  compact.render();
  updateTransport();
  updateSaveState();
  requestAnimationFrame(() => timeline.fit());
  if (saved?.warnings?.length) notify(saved.warnings.join(' '));
  ensureLayers(state.project);

  // Exponer para depuración en consola.
  window.senLab = { store, audio, gridSeconds };
}
