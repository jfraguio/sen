/**
 * Modo teclado: interpreta con el teclado del ordenador las notas de una pista
 * sostenida, con dos modos.
 *
 * - **Prueba**: suena lo que tocas sin modificar el tema.
 * - **Grabar**: escribe los cambios de nota dentro del elemento `tone`
 *   seleccionado mientras avanza el cabezal. Mientras grabas, la pista se
 *   silencia en la escucha y oyes solo el teclado, para no duplicar el sonido.
 *
 * Los cambios se guardan en `el.changes` (`[{ t, notes }]`), t en segundos
 * desde el inicio del elemento. Un cambio con `notes: []` es silencio.
 */

import { h, typingTarget, findTrack, findElement, clampNum } from './util.js';
import { SCALES, midiToNote, noteLabel, noteToMidi, rootIndex } from '../engine/music.js';
import { LIMITS, toneNotesAt } from '../engine/schema.js';
import { PERFORMANCE_KEYS, offsetForKey } from './keys.js';

const sameNotes = (a, b) => JSON.stringify(a.map((n) => (typeof n === 'object' ? n.hz : n))) === JSON.stringify(b.map((n) => (typeof n === 'object' ? n.hz : n)));
const noteId = (n) => (n && typeof n === 'object' ? `hz:${n.hz}` : String(noteToMidi(n) ?? n));
/** Cómo graba un elemento: cambios con tiempo (`tone`) o conjunto de notas (`cloud`). */
export const recordKind = (el) => (el?.type === 'tone' ? 'timeline' : el?.type === 'cloud' && Array.isArray(el.pitches) ? 'palette' : null);

/** Progresiones habituales, agrupadas por carácter. */
const PROGRESSIONS_FULL = [
  { mood: 'Alegres', degrees: [0, 4, 5, 3] },
  { mood: 'Alegres', degrees: [0, 3, 4, 0] },
  { mood: 'Alegres', degrees: [0, 3, 5, 4] },
  { mood: 'Alegres', degrees: [0, 4, 3, 0] },
  { mood: 'Alegres', degrees: [0, 2, 3, 4] },
  { mood: 'Alegres', degrees: [4, 3, 0, 5] },
  { mood: 'Alegres', degrees: [0, 3, 4, 5] },
  { mood: 'Nostálgicas', degrees: [0, 5, 3, 4] },
  { mood: 'Nostálgicas', degrees: [5, 3, 0, 4] },
  { mood: 'Nostálgicas', degrees: [0, 5, 2, 6] },
  { mood: 'Nostálgicas', degrees: [0, 3, 5, 2] },
  { mood: 'Nostálgicas', degrees: [5, 2, 3, 0] },
  { mood: 'Nostálgicas', degrees: [6, 5, 3, 0] },
  { mood: 'Nostálgicas', degrees: [0, 5, 3, 2] },
  { mood: 'Soñadoras', degrees: [0, 3, 0, 4] },
  { mood: 'Soñadoras', degrees: [3, 0, 3, 4] },
  { mood: 'Soñadoras', degrees: [2, 3, 0, 4] },
  { mood: 'Soñadoras', degrees: [0, 2, 5, 4] },
  { mood: 'Soñadoras', degrees: [0, 5, 0, 3] },
  { mood: 'Tensas', degrees: [1, 4, 0] },
  { mood: 'Tensas', degrees: [5, 1, 4, 0] },
  { mood: 'Tensas', degrees: [0, 6, 5, 4] },
  { mood: 'Tensas', degrees: [0, 1, 4, 0] },
  { mood: 'Tensas', degrees: [0, 4, 5, 4] },
  { mood: 'Minimalistas', degrees: [0, 3] },
  { mood: 'Minimalistas', degrees: [0, 4] },
  { mood: 'Minimalistas', degrees: [0, 5] },
  { mood: 'Minimalistas', degrees: [0, 3, 0, 3] },
  { mood: 'Minimalistas', degrees: [0, 5, 0, 5] },
  { mood: 'Épicas', degrees: [0, 4, 5, 2, 3, 0, 3, 4] },
  { mood: 'Épicas', degrees: [0, 5, 3, 4, 0, 4, 5, 3] },
  { mood: 'Épicas', degrees: [0, 3, 4, 5, 3, 4, 0, 4] },
];
const PROGRESSIONS_SHORT = [
  { mood: 'Alegres', degrees: [0, 3, 4] },
  { mood: 'Nostálgicas', degrees: [0, 2, 3, 4] },
  { mood: 'Soñadoras', degrees: [0, 2, 4] },
  { mood: 'Tensas', degrees: [0, 1, 4] },
  { mood: 'Minimalistas', degrees: [0, 3] },
  { mood: 'Minimalistas', degrees: [0, 4] },
];
const KEY_BY_OFFSET = new Map(PERFORMANCE_KEYS.map(([key, offset]) => [offset, key]));
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function chordAt(key, degree, octave) {
  const steps = SCALES[key?.scale] || SCALES.mayor;
  const base = (octave + 1) * 12 + rootIndex(key?.root || 'C');
  const midis = [degree, degree + 2, degree + 4].map((k) => {
    const oct = Math.floor(k / steps.length);
    return base + oct * 12 + steps[((k % steps.length) + steps.length) % steps.length];
  });
  const third = midis[1] - midis[0];
  const fifth = midis[2] - midis[0];
  const quality = third === 4 && fifth === 7 ? 'mayor'
    : third === 3 && fifth === 7 ? 'menor'
      : third === 3 && fifth === 6 ? 'disminuido'
        : third === 4 && fifth === 8 ? 'aumentado' : '';
  const rootName = noteLabel(midiToNote(midis[0]), 'latin');
  const suffix = quality === 'menor' ? 'm' : quality === 'disminuido' ? 'º' : quality === 'aumentado' ? '+' : '';
  const keyBase = (octave + 1) * 12;
  const keys = midis.map((m) => KEY_BY_OFFSET.get(m - keyBase) || '');
  return {
    midis,
    quality,
    keys,
    short: `${rootName}${suffix}`,
    fullName: `${rootName}${quality ? ` ${quality}` : ''}`,
    letters: midis.map((m) => midiToNote(m).replace(/-?\d+$/, '')).join(' '),
  };
}

function romanFor(degree, quality) {
  const base = ROMAN[degree % ROMAN.length] || String(degree + 1);
  if (quality === 'menor' || quality === 'disminuido') return base.toLowerCase();
  if (quality === 'aumentado') return `${base}+`;
  return base;
}

/** Progresiones de la escala actual, con su cifrado, acordes y teclas. */
function progressionOptions(key, octave) {
  const steps = SCALES[key?.scale] || SCALES.mayor;
  const patterns = steps.length >= 7 ? PROGRESSIONS_FULL : PROGRESSIONS_SHORT;
  const out = [];
  for (const pattern of patterns) {
    if (pattern.degrees.some((d) => d >= steps.length)) continue;
    const chords = pattern.degrees.map((d) => chordAt(key, d, octave));
    chords.forEach((c, i) => {
      c.roman = romanFor(pattern.degrees[i], c.quality);
    });
    const roman = chords.map((c) => c.roman).join('–');
    out.push({
      index: out.length,
      mood: pattern.mood,
      label: `${roman} · ${chords.map((c) => c.short).join(' – ')}`,
      chords,
    });
  }
  return out;
}

export function createPerformance({ store, audio, actions }) {
  let active = false;
  let mode = 'test';
  let trackId = null;
  let elementId = null;
  let octave = 3;
  let gesture = null;
  let startedPlayback = false;
  let warnedLimit = false;
  let warnedCloud = false;
  const held = new Map(); // tecla → midi
  const chord = new Set(); // midi que suena ahora

  const dot = h('span', { class: 'perform__dot', 'aria-hidden': 'true' });
  const title = h('b');
  const detail = h('span', { class: 'perform__detail' });
  const chips = h('div', { class: 'perform__notes', 'aria-live': 'polite' });
  const progSelect = h('select', { class: 'perform__progression-select', 'aria-label': 'Progresiones de inspiración' });
  const progPlay = h('button', {
    type: 'button', class: 'btn perform__transport', 'aria-label': 'Escuchar la progresión elegida', title: 'Escuchar la progresión elegida',
    onclick: () => { if (previewPlaying) stopPreview(); else playSelectedProgression(); },
  }, '▶');
  const progLoop = h('button', {
    type: 'button', class: 'btn btn--quiet perform__loop', 'aria-label': 'Repetir la progresión', 'aria-pressed': 'false',
    title: 'Repetir la progresión', onclick: () => togglePreviewLoop(),
  }, '⟲');
  const progCards = h('div', { class: 'perform__prog-cards' });
  const progWrap = h('div', { class: 'perform__progressions' },
    h('span', { class: 'perform__progression-label' }, 'Progresión'), progSelect, progPlay, progLoop);
  const progArea = h('div', { class: 'perform__prog-area' }, progWrap, progCards);
  const keys = h('div', { class: 'perform__keys', 'aria-hidden': 'true' });
  const exit = h('button', { type: 'button', class: 'btn btn--quiet perform__exit', onclick: () => stop() }, 'Salir · Esc');
  const top = h('div', { class: 'perform__top' },
    h('div', { class: 'perform__head' }, dot, title, detail), chips, exit);
  const bar = h('div', { class: 'perform', role: 'region', 'aria-label': 'Modo teclado', hidden: true },
    top, progArea, keys);
  document.body.append(bar);
  progSelect.addEventListener('change', () => playSelectedProgression());

  let progSig = '';
  let progList = [];
  let previewTimer = 0;
  let previewLoop = false;
  let previewPlaying = false;
  const previewNotes = [];

  function syncPlayButton() {
    progPlay.textContent = previewPlaying ? '■' : '▶';
    progPlay.classList.toggle('is-playing', previewPlaying);
    const label = previewPlaying ? 'Detener la progresión' : 'Escuchar la progresión elegida';
    progPlay.setAttribute('aria-label', label);
    progPlay.title = label;
  }

  function setActiveCard(index) {
    progCards.querySelectorAll('.perform__prog-card').forEach((node, k) => node.classList.toggle('is-active', k === index));
  }

  function renderProgCards(prog, active = -1) {
    progCards.textContent = '';
    if (!prog) {
      progCards.append(h('span', { class: 'perform__prog-empty' }, 'Elige una progresión para ver sus notas y teclas.'));
      return;
    }
    prog.chords.forEach((c, i) => progCards.append(h('div', {
      class: `perform__prog-card${i === active ? ' is-active' : ''}`,
      title: `${c.fullName} (${c.letters})`,
    },
    h('span', { class: 'perform__prog-cipher' }, c.roman),
    h('b', {}, c.short),
    h('span', { class: 'perform__prog-notes' }, c.letters),
    h('span', { class: 'perform__prog-keys' }, ...c.keys.filter(Boolean).map((key) => h('kbd', {}, key.toUpperCase()))))));
  }

  function stopPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = 0;
    previewPlaying = false;
    for (const note of previewNotes) audio.noteOff(note);
    previewNotes.length = 0;
    setActiveCard(-1);
    syncPlayButton();
  }

  function buildProgressions() {
    const sig = JSON.stringify([store.state.project.key || {}, octave]);
    if (sig === progSig) return;
    progSig = sig;
    stopPreview();
    progList = progressionOptions(store.state.project.key, octave);
    progSelect.textContent = '';
    progSelect.append(h('option', { value: '' }, 'Elige una progresión…'));
    const groups = new Map();
    for (const p of progList) {
      if (!groups.has(p.mood)) groups.set(p.mood, []);
      groups.get(p.mood).push(p);
    }
    for (const [mood, list] of groups) {
      const group = h('optgroup', { label: mood });
      for (const p of list) group.append(h('option', { value: String(p.index) }, p.label));
      progSelect.append(group);
    }
    progSelect.value = '';
    renderProgCards(null);
  }

  function setPreviewChord(midis) {
    for (const note of previewNotes) audio.noteOff(note);
    previewNotes.length = 0;
    const t = track();
    if (!t) return;
    const a4 = store.state.project.tuning?.a4 ?? 440;
    for (const midi of midis) {
      const note = midiToNote(midi);
      previewNotes.push(note);
      audio.noteOn(note, t, a4);
    }
  }

  function playProgression(prog) {
    if (!active || mode !== 'test' || !prog) return;
    stopPreview();
    previewPlaying = true;
    syncPlayButton();
    renderProgCards(prog);
    const step = 2000;
    let i = 0;
    const advance = () => {
      if (!active || mode !== 'test') {
        stopPreview();
        return;
      }
      if (i >= prog.chords.length && !previewLoop) {
        previewTimer = setTimeout(() => stopPreview(), step);
        return;
      }
      const at = i % prog.chords.length;
      setPreviewChord(prog.chords[at].midis);
      setActiveCard(at);
      i++;
      previewTimer = setTimeout(advance, step);
    };
    advance();
  }

  function playSelectedProgression() {
    let prog = progList[Number(progSelect.value)];
    if (!prog && progList.length) {
      prog = progList[0];
      progSelect.value = String(prog.index);
    }
    if (prog) playProgression(prog);
  }

  function togglePreviewLoop() {
    previewLoop = !previewLoop;
    progLoop.setAttribute('aria-pressed', String(previewLoop));
    if (previewLoop && !previewPlaying) playSelectedProgression();
  }

  const lower = PERFORMANCE_KEYS.filter(([, o]) => o < 12).map(([k]) => k.toUpperCase()).join(' ');
  const upper = PERFORMANCE_KEYS.filter(([, o]) => o >= 12).map(([k]) => k).join(' ');
  keys.append(h('span', {}, h('b', {}, 'grave'), ` ${lower}`), h('span', {}, h('b', {}, 'aguda'), ` ${upper}`));

  const track = () => findTrack(store.state.project, trackId);
  const element = () => (elementId ? findElement(store.state.project, elementId)?.el || null : null);

  function hud() {
    const t = track();
    const e = element();
    buildProgressions();
    progArea.hidden = mode !== 'test';
    title.textContent = mode === 'record' ? 'Grabando' : 'Teclado libre';
    detail.textContent = t ? ` · ${t.name} · oct. ${octave}–${octave + 1}` : '';
    const notes = [...chord].sort((a, b) => a - b);
    chips.textContent = '';
    if (!notes.length) chips.append(h('span', { class: 'perform__silence' }, e && mode === 'record' ? 'silencio' : 'toca una letra'));
    else for (const m of notes) chips.append(h('span', { class: 'perform__note' }, noteLabel(midiToNote(m), store.state.view.notation)));
    if (e && mode === 'record') {
      if (recordKind(e) === 'palette') {
        const count = e.pitches?.length || 0;
        detail.textContent = ` · ${t?.name || ''} · ${count}/${LIMITS.cloudPitches} notas propias`;
      } else {
        const rel = clampNum(store.state.playhead - e.start, 0, e.length);
        detail.textContent = ` · ${t?.name || ''} · oct. ${octave}–${octave + 1} · ${rel.toFixed(1).replace('.', ',')} s de ${e.length.toFixed(1).replace('.', ',')}`;
      }
    }
    bar.dataset.mode = mode;
    bar.hidden = !active;
  }

  function notifyOnceLimit() {
    if (warnedLimit) return;
    warnedLimit = true;
    actions.notify(`Máximo ${LIMITS.changesPerTone} cambios de nota por elemento: se descartan los más antiguos.`, true);
  }

  function notifyCloudLimit() {
    if (warnedCloud) return;
    warnedCloud = true;
    actions.notify(`La nube ya tiene el máximo de ${LIMITS.cloudPitches} notas propias.`, true);
  }

  function record() {
    if (!active || mode !== 'record') return;
    const f = elementId ? findElement(store.state.project, elementId) : null;
    if (!f) return;
    const kind = recordKind(f.el);
    if (kind === 'palette') {
      const notes = [...chord].sort((a, b) => a - b).map((m) => midiToNote(m));
      if (!notes.length) return;
      const have = new Set(f.el.pitches.map(noteId));
      const add = notes.filter((n) => !have.has(noteId(n)));
      if (!add.length) return;
      const room = Math.max(0, LIMITS.cloudPitches - f.el.pitches.length);
      const take = add.slice(0, room);
      if (!take.length) {
        notifyCloudLimit();
        return;
      }
      store.commit((d) => {
        const x = findElement(d, elementId)?.el;
        if (!x || x.type !== 'cloud' || !Array.isArray(x.pitches)) return false;
        const current = new Set(x.pitches.map(noteId));
        const list = [...x.pitches];
        for (const n of take) {
          if (current.has(noteId(n))) continue;
          list.push(n);
          current.add(noteId(n));
        }
        x.pitches = list.slice(0, LIMITS.cloudPitches);
      }, { gesture, source: 'performance' });
      if (take.length < add.length || f.el.pitches.length + take.length >= LIMITS.cloudPitches) notifyCloudLimit();
      return;
    }
    if (kind !== 'timeline') return;
    const el = f.el;
    const now = store.state.playing ? audio.currentTime() : store.state.playhead;
    const rel = now - el.start;
    if (rel < -0.05 || rel > el.length + 0.05) return;
    const t = Math.round(clampNum(rel, 0, el.length) * 1000) / 1000;
    if (t >= el.length - 0.0005) return;
    const notes = [...chord].sort((a, b) => a - b).map((m) => midiToNote(m));
    // Un cambio a la misma nota que ya sonaba no se graba: evita rearticular.
    const kept = (el.changes || []).filter((c) => Math.abs(c.t - t) > 0.03);
    const previous = toneNotesAt({ ...el, changes: kept.filter((c) => c.t < t - 0.001) }, t);
    if (sameNotes(previous, notes)) {
      if (kept.length !== (el.changes || []).length) {
        store.commit((d) => {
          const x = findElement(d, elementId)?.el;
          if (!x) return false;
          if (kept.length) x.changes = kept;
          else delete x.changes;
        }, { gesture, source: 'performance' });
      }
      return;
    }
    let changes;
    let base = el.notes;
    if (t <= 0.02 && notes.length) {
      base = notes;
      changes = kept.filter((c) => c.t > 0.02);
    } else {
      changes = [...kept, { t, notes }].sort((a, b) => a.t - b.t);
    }
    if (changes.length > LIMITS.changesPerTone) {
      changes = changes.slice(-LIMITS.changesPerTone);
      notifyOnceLimit();
    }
    store.commit((d) => {
      const x = findElement(d, elementId)?.el;
      if (!x || x.type !== 'tone') return false;
      x.notes = base;
      if (changes.length) x.changes = changes;
      else delete x.changes;
    }, { gesture, source: 'performance' });
  }

  function press(key) {
    const offset = offsetForKey(key);
    if (offset === null || held.has(key)) return false;
    const midi = (octave + 1) * 12 + offset;
    if (chord.has(midi)) return true;
    if (chord.size >= LIMITS.notesPerTone) {
      const [oldest] = [...chord];
      releaseMidi(oldest);
    }
    const t = track();
    if (!t) return false;
    stopPreview();
    held.set(key, midi);
    chord.add(midi);
    audio.noteOn(midiToNote(midi), t, store.state.project.tuning?.a4 ?? 440);
    record();
    hud();
    return true;
  }

  function releaseMidi(midi) {
    if (!chord.has(midi)) return;
    chord.delete(midi);
    for (const [k, m] of held) if (m === midi) held.delete(k);
    audio.noteOff(midiToNote(midi));
  }

  function release(key) {
    const midi = held.get(key);
    if (midi === undefined) return false;
    held.delete(key);
    releaseMidi(midi);
    record();
    hud();
    return true;
  }

  function releaseAll(recordIt = false) {
    const had = chord.size > 0;
    for (const midi of [...chord]) releaseMidi(midi);
    held.clear();
    if (recordIt && had) record();
    hud();
  }

  /** Cambia la octava del teclado en caliente (mientras se prueba o graba). */
  function setOctave(value) {
    const next = clampNum(Math.round(Number(value) || 0), 0, 7);
    if (next === octave) return;
    if (active) releaseAll(true);
    stopPreview();
    octave = next;
    hud();
  }

  function start(nextMode, target = {}) {
    const t = findTrack(store.state.project, target.trackId);
    if (!t) {
      actions.notify('Esa pista ya no existe.', true);
      return false;
    }
    if (nextMode === 'record') {
      const f = target.elementId ? findElement(store.state.project, target.elementId) : null;
      if (!f || !recordKind(f.el)) {
        actions.notify('Selecciona un elemento sostenido o una nube con notas propias para grabar.', true);
        return false;
      }
      if (recordKind(f.el) === 'timeline' && f.el.changes?.length && !window.confirm('Grabar sustituirá los cambios de nota actuales de este elemento. ¿Continuar?')) return false;
    }
    if (active) stop(false);
    stopPreview();
    active = true;
    mode = nextMode === 'record' ? 'record' : 'test';
    trackId = t.id;
    elementId = mode === 'record' ? target.elementId : null;
    octave = clampNum(Number.isInteger(target.octave) ? target.octave : 3, 0, 7);
    warnedLimit = false;
    warnedCloud = false;
    held.clear();
    chord.clear();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    audio.ensure().catch(() => {});
    hud();
    if (mode === 'record') {
      gesture = `perf-${Date.now()}`;
      const f = findElement(store.state.project, elementId);
      if (recordKind(f?.el) === 'timeline') {
        if (f.el.changes?.length) {
          store.commit((d) => {
            const x = findElement(d, elementId)?.el;
            if (!x) return false;
            delete x.changes;
          }, { gesture, source: 'performance' });
        }
        audio.setMonitorMute(trackId);
        startedPlayback = !store.state.playing;
        actions.startPlayback(f ? f.el.start : store.state.playhead);
        actions.notify('Grabando: toca las letras mientras avanza el cabezal. Esc para salir.');
      } else {
        audio.setMonitorMute(null);
        startedPlayback = false;
        actions.notify('Grabando notas propias: toca las letras para añadirlas a la nube. Esc para salir.');
      }
    } else {
      actions.notify('Teclado libre: toca las letras. Esc para salir.');
    }
    actions.performanceChanged?.();
    return true;
  }

  function stop(message = true) {
    if (!active && bar.hidden) return;
    active = false;
    stopPreview();
    releaseAll(false);
    audio.setMonitorMute(null);
    store.endGesture();
    gesture = null;
    if (startedPlayback && store.state.playing) actions.stopPlayback();
    startedPlayback = false;
    trackId = null;
    elementId = null;
    bar.hidden = true;
    if (message) actions.notify('Modo teclado cerrado.');
    actions.performanceChanged?.();
  }

  function toggle(nextMode, target = {}) {
    if (active && mode === nextMode && trackId === target.trackId && elementId === (nextMode === 'record' ? target.elementId : null)) {
      stop();
      return false;
    }
    return start(nextMode, target);
  }

  function handleKeyDown(e) {
    if (!active) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stop();
      return true;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) return false;
    if (offsetForKey(e.key) === null) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return true;
    press(e.key);
    return true;
  }

  function handleKeyUp(e) {
    if (!active || offsetForKey(e.key) === null) return false;
    if (!held.has(e.key)) return false;
    e.preventDefault();
    release(e.key);
    return true;
  }

  /** Detiene el modo si su pista o elemento han desaparecido, o tras cargar otro tema. */
  function validate() {
    if (!active) return;
    const e = element();
    if (!track() || (elementId && !e) || (mode === 'record' && !recordKind(e))) stop(false);
    else hud();
  }

  return {
    start,
    stop,
    toggle,
    handleKeyDown,
    handleKeyUp,
    releaseAll,
    setOctave,
    validate,
    hud,
    info: () => ({ active, mode, trackId, elementId }),
  };
}
