/**
 * sen lab · arranque y orquestación del editor.
 */

import { h, fmtTime, toast, announce, findTrack, findElement, elementSpan, typingTarget, isCompact, clampNum, installTitles, setIcon } from './util.js';
import {
  INSTRUMENTS, LIMITS, LabFileError, createElement, createSceneProject, createTrack, layerKey, newId, normalizeProject,
  projectCounts, splitToneChanges,
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
import { createPerformance } from './performance.js';
import { downloadAlbum, isAlbumDownloaded, loadAutosave, readProjectFile, scheduleAutosave, writeMeta } from './storage.js';
import { createAlbum, createAlbumTheme } from './album.js';
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
  installTitles();
  document.getElementById('app').hidden = false;
  const saved = loadAutosave();
  let album = saved?.album || createAlbum();
  let albumIndex = Math.min(Math.max(0, album.current || 0), album.themes.length - 1);
  album.current = albumIndex;
  const store = createStore(album.themes[albumIndex]);
  const { state } = store;
  const $ = (id) => document.getElementById(id);

  /** Vuelca el tema abierto (con sus cambios) en el documento del álbum. */
  function syncAlbum() {
    album.themes[albumIndex] = state.project;
    album.current = albumIndex;
    return album;
  }

  let meters = null;
  let inspector = null;
  let clipboard = [];

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

  /** Añade una canción publicada como tema nuevo de capas. Devuelve su info o `null`. */
  async function loadSceneProject(ambient, track, status = null) {
    if (layersBusy) return null;
    layersBusy = true;
    if (status) status.textContent = 'Preparando las capas… (unos segundos)';
    try {
      const r = await scenes.load(ambient, track);
      const { project } = normalizeProject(createSceneProject({ ...r, layers: r.layers.map((l) => l.name) }));
      shareSamples(await scenes.samplesFor(project));
      addTheme(project);
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

  /** Añade una plantilla de la biblioteca como tema nuevo: vacío o canción de sen. */
  async function openTemplate(t) {
    if (layersBusy) return;
    if (t.blank) {
      addTheme(createAlbumTheme(nextThemeName()));
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
      if (state.playing) audio.setLoop(previewLoop(state.project));
    },
    clearRegion() {
      store.commit((d) => {
        d.region = null;
      });
      store.set({ regionLoop: false });
      if (state.playing) audio.setLoop(previewLoop(state.project));
      updateTransport();
    },
    auditionTrack(trackId, note = null) {
      const t = findTrack(state.project, trackId);
      if (t) audio.audition(state.project, t, { note, seconds: note ? 1.6 : 3 });
    },
    auditionInstrument(inst) {
      audio.audition(state.project, createTrack(inst, state.project), { seconds: 3 });
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
          if (el.type === 'tone') {
            const parts = splitToneChanges(el, len1);
            el.notes = el.notes.slice();
            if (parts.before.length) el.changes = parts.before;
            else delete el.changes;
            second.notes = parts.notes;
            if (parts.after.length) second.changes = parts.after;
            else delete second.changes;
          }
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
    startPlayback(from) {
      actions.seek(clampNum(from, 0, state.project.duration));
      if (!state.playing) togglePlay();
    },
    performanceChanged() {
      inspector?.render(true);
    },
    togglePerformance(mode, target) {
      return performance.toggle(mode, target);
    },
    performanceInfo() {
      return performance.info();
    },
  };

  /* ------------------------------------------------------------ vistas */

  const performance = createPerformance({ store, audio, actions });
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

  /** Final del contenido: el extremo derecho de la capa más larga. */
  function contentEnd(p) {
    let end = 0;
    for (const track of p.tracks) {
      for (const el of track.elements) {
        const span = el.type === 'hit' ? elementSpan(track, el) : (Number(el.length) || 0);
        end = Math.max(end, (Number(el.start) || 0) + span);
      }
    }
    return end > 0.05 ? end : p.duration;
  }

  /** Bucle de escucha: la región marcada o todo el contenido. */
  function previewLoop(p) {
    return state.regionLoop && p.region ? p.region : { start: 0, end: contentEnd(p) };
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
    setIcon(playBtn.querySelector('.i'), state.playing ? 'pause' : 'play');
    const hasRegion = !!state.project.region;
    $('region-loop').hidden = !hasRegion;
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
      const loop = previewLoop(p);
      if (loop && (from < loop.start || from >= loop.end)) from = loop.start;
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
  $('project-settings').addEventListener('click', () => {
    store.select({ kind: 'project' });
    actions.openSheet('inspector');
  });
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
    if (state.playing) audio.setLoop(previewLoop(state.project));
    updateTransport();
    timeline.render();
    announce(state.regionLoop ? 'Región en bucle activada' : 'Región en bucle desactivada');
  }

  /* ------------------------------------------------------------ cabecera */

  const nameInput = $('project-name');
  const albumInput = $('album-name');
  const themeSelect = $('theme-select');
  let nameGesture = null;
  nameInput.addEventListener('focus', () => {
    nameGesture = `name${Date.now()}`;
  });
  nameInput.addEventListener('input', () => store.commit((d) => {
    d.name = nameInput.value || 'Tema sin título';
  }, { gesture: nameGesture, source: 'name' }));
  nameInput.addEventListener('blur', () => {
    store.endGesture();
    if (!nameInput.value.trim()) nameInput.value = state.project.name;
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameInput.blur();
  });
  albumInput.addEventListener('input', () => {
    album.name = albumInput.value.trim() || 'Álbum sin título';
    scheduleAutosave(syncAlbum(), updateSaveState);
    updateDocumentTitle();
  });
  albumInput.addEventListener('blur', () => {
    if (!albumInput.value.trim()) albumInput.value = album.name;
  });
  albumInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') albumInput.blur();
  });
  $('undo').addEventListener('click', () => store.undo());
  $('redo').addEventListener('click', () => store.redo());

  function updateDocumentTitle() {
    document.title = `${state.project.name} · ${album.name} — sen lab`;
  }

  function themeName(theme, index) {
    return String(theme?.name || '').trim() || `Tema ${index + 1}`;
  }

  /** Siguiente nombre libre «Tema N» para los temas nuevos. */
  function nextThemeName() {
    const used = new Set(album.themes.map((theme, index) => themeName(theme, index)));
    let n = 1;
    while (used.has(`Tema ${n}`)) n++;
    return `Tema ${n}`;
  }

  /** Pinta el selector y los controles que dependen del número de temas. */
  function updateAlbumUI() {
    album.themes[albumIndex] = state.project;
    if (document.activeElement !== albumInput) albumInput.value = album.name;
    const total = album.themes.length;
    themeSelect.textContent = '';
    album.themes.forEach((theme, index) => {
      themeSelect.append(h('option', { value: String(index) }, `${index + 1}/${total} · ${themeName(theme, index)}`));
    });
    themeSelect.value = String(albumIndex);
    themeSelect.disabled = total < 2;
    $('theme-prev').disabled = total < 2;
    $('theme-next').disabled = total < 2;
    const remove = $('delete-theme');
    remove.disabled = total < 2;
    remove.title = total < 2 ? 'El álbum debe tener al menos un tema' : 'Eliminar el tema abierto';
    updateDocumentTitle();
  }

  function setTheme(index) {
    const total = album.themes.length;
    if (!total) return;
    const nextIndex = ((Math.round(Number(index)) % total) + total) % total;
    if (nextIndex === albumIndex) return;
    if (state.playing) togglePlay();
    syncAlbum();
    albumIndex = nextIndex;
    album.current = nextIndex;
    store.load(album.themes[nextIndex]);
    requestAnimationFrame(() => timeline.fit());
    announce(`Tema «${themeName(album.themes[nextIndex], nextIndex)}» abierto.`);
  }

  function addTheme(project, warnings = []) {
    if (state.playing) togglePlay();
    syncAlbum();
    album.themes.push(project);
    albumIndex = album.themes.length - 1;
    album.current = albumIndex;
    store.load(project);
    requestAnimationFrame(() => timeline.fit());
    if (warnings.length) notify(warnings.join(' '));
    announce(`Tema «${themeName(project, albumIndex)}» añadido al álbum.`);
  }

  function newTheme() {
    addTheme(createAlbumTheme(nextThemeName()));
  }

  function deleteTheme() {
    if (album.themes.length < 2) return;
    const name = themeName(state.project, albumIndex);
    if (!window.confirm(`¿Eliminar el tema «${name}» del álbum?`)) return;
    if (state.playing) togglePlay();
    syncAlbum();
    album.themes.splice(albumIndex, 1);
    if (albumIndex >= album.themes.length) albumIndex = album.themes.length - 1;
    album.current = albumIndex;
    store.load(album.themes[albumIndex]);
    requestAnimationFrame(() => timeline.fit());
    announce(`Tema «${name}» eliminado del álbum.`);
  }

  function newAlbum() {
    if (!confirmDiscard()) return;
    if (state.playing) togglePlay();
    const theme = createAlbumTheme('Tema 1');
    album = createAlbum({ name: 'Álbum sin título', themes: [theme] });
    albumIndex = 0;
    album.current = 0;
    store.load(theme);
    writeMeta({ downloadedAlbumRevision: null });
    requestAnimationFrame(() => timeline.fit());
    actions.closeSheet();
    updateSaveState();
    updateAlbumUI();
    announce('Álbum nuevo.');
  }

  function loadAlbum(nextAlbum, warnings = []) {
    if (state.playing) togglePlay();
    album = nextAlbum;
    albumIndex = Math.min(Math.max(0, album.current || 0), album.themes.length - 1);
    album.current = albumIndex;
    store.load(album.themes[albumIndex]);
    writeMeta({ downloadedAlbumRevision: null });
    requestAnimationFrame(() => timeline.fit());
    updateAlbumUI();
    if (warnings.length) notify(warnings.join(' '));
    announce(`Álbum «${album.name}» abierto.`);
  }

  function confirmDiscard() {
    const current = syncAlbum();
    if (isAlbumDownloaded(current)) return true;
    const untouched = current.themes.length === 1
      && current.name === 'Álbum sin título'
      && themeName(current.themes[0], 0) === 'Tema 1'
      && !current.themes[0].tracks.length;
    if (untouched) return true;
    return window.confirm('El álbum actual no se ha descargado. Seguirá en este navegador hasta que lo sustituyas. ¿Continuar?');
  }

  /* ------------------------------------------------ menús desplegables */

  const openMenus = new Set();

  function createMenu(root, trigger, pop) {
    const items = () => [...pop.querySelectorAll('.menu__item')].filter((item) => !item.disabled);

    /** Coloca el menú bajo el botón sin salirse de la pantalla. */
    function placeMenu() {
      const rect = trigger.getBoundingClientRect();
      const width = pop.offsetWidth;
      const height = pop.offsetHeight;
      const margin = 8;
      let left = rect.right - width;
      if (left < margin) left = rect.left;
      left = Math.max(margin, Math.min(left, innerWidth - width - margin));
      const maxTop = innerHeight - height - margin;
      const top = maxTop < margin ? margin : Math.min(rect.bottom + 9, maxTop);
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
    }

    const api = {
      open(where = 'first') {
        for (const other of openMenus) if (other !== api) other.close();
        pop.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        openMenus.add(api);
        placeMenu();
        const enabled = items();
        if (!enabled.length) return;
        if (where === 'first') enabled[0].focus();
        else if (where === 'last') enabled.at(-1).focus();
      },
      close({ returnFocus = false } = {}) {
        if (pop.hidden) return;
        openMenus.delete(api);
        pop.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (returnFocus) trigger.focus();
      },
      contains(node) {
        return root.contains(node);
      },
      focusTrigger() {
        trigger.focus();
      },
    };

    trigger.addEventListener('click', () => {
      if (pop.hidden) api.open();
      else api.close({ returnFocus: true });
    });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        api.open(e.key === 'ArrowDown' ? 'first' : 'last');
      }
    });
    pop.addEventListener('keydown', (e) => {
      const enabled = items();
      const index = enabled.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        enabled[(index + 1) % enabled.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        enabled[(index - 1 + enabled.length) % enabled.length]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        enabled[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        enabled.at(-1)?.focus();
      } else if (e.key === 'Tab') {
        api.close();
      }
    });
    // Cierra el menú antes de ejecutar la acción para devolver el foco al
    // botón (un diálogo se lleva el foco después, si se abre).
    pop.addEventListener('click', (e) => {
      if (e.target.closest('.menu__item')) api.close({ returnFocus: true });
    }, true);

    document.addEventListener('click', (e) => {
      if (pop.hidden) return;
      if (pop.contains(e.target) || trigger.contains(e.target)) return;
      api.close();
    });
    root.addEventListener('focusout', (e) => {
      if (!root.contains(e.relatedTarget)) api.close();
    });
    window.addEventListener('resize', () => {
      if (!pop.hidden) placeMenu();
    });

    return api;
  }

  function closeOpenMenus() {
    const open = [...openMenus];
    if (!open.length) return false;
    const active = open.find((menu) => menu.contains(document.activeElement)) || open.at(-1);
    for (const menu of open) menu.close();
    active.focusTrigger();
    return true;
  }

  createMenu($('app-menu'), $('menu-trigger'), $('menu-pop'));
  createMenu($('theme-menu'), $('theme-menu-trigger'), $('theme-menu-pop'));

  $('new').addEventListener('click', newAlbum);
  $('new-theme').addEventListener('click', newTheme);
  $('theme-prev').addEventListener('click', () => setTheme(albumIndex - 1));
  $('theme-next').addEventListener('click', () => setTheme(albumIndex + 1));
  themeSelect.addEventListener('change', () => setTheme(Number(themeSelect.value)));
  $('delete-theme').addEventListener('click', deleteTheme);
  $('open').addEventListener('click', () => $('open-file').click());
  $('open-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await openFile(file);
  });
  $('save-project').addEventListener('click', () => {
    downloadAlbum(syncAlbum());
    updateSaveState();
    announce('Álbum descargado.');
  });
  $('export').addEventListener('click', () => exporter.open());

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
    if (read.kind === 'album') {
      if (!confirmDiscard()) return;
      loadAlbum(read.album, read.warnings);
      return;
    }
    addTheme(read.project, read.warnings);
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
    if (performance.handleKeyDown(e)) return;
    if (e.key === 'Escape' && closeOpenMenus()) {
      e.preventDefault();
      return;
    }
    if (openMenus.size) return;
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
      downloadAlbum(syncAlbum());
      updateSaveState();
      announce('Álbum descargado.');
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
  window.addEventListener('keyup', (e) => {
    performance.handleKeyUp(e);
  });
  window.addEventListener('blur', () => {
    performance.releaseAll(true);
  });

  /* ------------------------------------------------------------ guardado */

  let saveState = '';
  function updateSaveState(text) {
    if (text === 'guardando…') saveState = 'saving';
    else if (text === 'guardado') saveState = '';
    else if (typeof text === 'string' && text.startsWith('sin guardar')) saveState = 'error';
    const dot = $('save-state');
    const label = saveState === 'error' ? 'No se pudo guardar en el navegador' : saveState === 'saving' ? 'Guardando en el navegador…' : '';
    dot.hidden = !saveState;
    dot.classList.toggle('is-error', saveState === 'error');
    dot.title = label;
    if (label) dot.setAttribute('aria-label', label);
    else dot.removeAttribute('aria-label');
  }

  /* ------------------------------------------------------------ suscripción */

  let lastGridTempo = !!state.project.tempo;
  let lastDuration = state.project.duration;
  store.subscribe((kind, s, info) => {
    if (kind === 'load') performance.stop(false);
    else if (kind === 'project') performance.validate();
    if (kind === 'project' || kind === 'load') {
      audio.setProject(s.project);
      album.themes[albumIndex] = s.project;
      album.current = albumIndex;
      scheduleAutosave(album, updateSaveState);
      if (info?.source !== 'name' && document.activeElement !== nameInput) nameInput.value = s.project.name;
      if (!!s.project.tempo !== lastGridTempo) {
        lastGridTempo = !!s.project.tempo;
        updateGridOptions();
      }
      if (state.playing) audio.setLoop(previewLoop(s.project));
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
      updateAlbumUI();
    }
    if (kind === 'project' || kind === 'load') ensureLayers(s.project);
    if (kind === 'project' || kind === 'load' || kind === 'selection' || kind === 'view') {
      if (kind === 'selection') performance.selectionChanged();
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
  albumInput.value = album.name;
  updateGridOptions();
  timeline.render();
  inspector.render(true);
  compact.render();
  updateTransport();
  updateAlbumUI();
  updateSaveState();
  requestAnimationFrame(() => timeline.fit());
  if (saved?.warnings?.length) notify(saved.warnings.join(' '));
  ensureLayers(state.project);

  // Exponer para depuración en consola.
  window.senLab = { store, audio, gridSeconds };
}
