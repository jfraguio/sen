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

import { h, icon, setIcon, typingTarget, findTrack, findElement, clampNum } from './util.js';
import { SCALES, SCALE_LABELS, midiToNote, noteLabel, noteToMidi, rootIndex } from '../engine/music.js';
import { LIMITS, createElement, toneNotesAt } from '../engine/schema.js';
import { PERFORMANCE_KEYS, hintForMidi, offsetForKey } from './keys.js';
import { keyboard } from './controls.js';
import { describeChord, noteToMidiLoose, parseNotesInput } from './chords.js';
import { SEN_PROGRESSIONS } from './sen-progressions.js';

const sameNotes = (a, b) => JSON.stringify(a.map((n) => (typeof n === 'object' ? n.hz : n))) === JSON.stringify(b.map((n) => (typeof n === 'object' ? n.hz : n)));
/** Cómo graba un elemento: cambios con tiempo (`tone`) o notas con tiempo (`cloud`). */
export const recordKind = (el) => (el?.type === 'tone' ? 'timeline' : el?.type === 'cloud' && el.mode === 'mine' ? 'sequence' : null);

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
const ARPEGGIOS = [
  { mood: 'Ascendentes', degrees: [0, 2, 4, 7] },
  { mood: 'Ascendentes', degrees: [0, 4, 7, 11] },
  { mood: 'Ascendentes', degrees: [0, 2, 4, 6] },
  { mood: 'Ascendentes', degrees: [0, 2, 4, 7, 9] },
  { mood: 'Ascendentes', degrees: [0, 2, 4, 7, 11] },
  { mood: 'Ascendentes', degrees: [0, 3, 5, 7] },
  { mood: 'Ascendentes', degrees: [0, 2, 4, 6, 7] },
  { mood: 'Ascendentes', degrees: [0, 4, 6, 7] },
  { mood: 'Ascendentes', degrees: [0, 3, 4, 7] },
  { mood: 'Ascendentes', degrees: [0, 2, 5, 7] },
  { mood: 'Ascendentes', degrees: [0, 2, 4, 7, 9, 11] },
  { mood: 'Ascendentes', degrees: [0, 2, 4, 5, 7] },
  { mood: 'Ascendentes', degrees: [0, 2, 4, 6, 9] },
  { mood: 'Descendentes', degrees: [7, 4, 2, 0] },
  { mood: 'Descendentes', degrees: [11, 7, 4, 2] },
  { mood: 'Descendentes', degrees: [7, 6, 4, 2, 0] },
  { mood: 'Descendentes', degrees: [11, 9, 7, 4, 2, 0] },
  { mood: 'Descendentes', degrees: [9, 7, 4, 2, 0] },
  { mood: 'Descendentes', degrees: [7, 5, 4, 2, 0] },
  { mood: 'Descendentes', degrees: [11, 7, 4, 0] },
  { mood: 'Descendentes', degrees: [9, 7, 4, 2] },
  { mood: 'Descendentes', degrees: [11, 9, 7, 4, 0] },
  { mood: 'Ondulantes', degrees: [0, 4, 2, 7, 4, 2] },
  { mood: 'Ondulantes', degrees: [0, 2, 4, 2] },
  { mood: 'Ondulantes', degrees: [0, 4, 7, 4, 2, 4] },
  { mood: 'Ondulantes', degrees: [0, 4, 7, 4, 0, 4] },
  { mood: 'Ondulantes', degrees: [0, 2, 4, 6, 4, 2] },
  { mood: 'Ondulantes', degrees: [0, 4, 2, 5, 2, 4] },
  { mood: 'Ondulantes', degrees: [0, 2, 4, 7, 11, 7, 4, 2] },
  { mood: 'Ondulantes', degrees: [0, 4, 7, 4, 2, 0, 2, 4] },
  { mood: 'Ondulantes', degrees: [0, 2, 5, 2, 4, 2] },
  { mood: 'Ondulantes', degrees: [0, 4, 6, 4, 2, 4] },
  { mood: 'Largos', degrees: [0, 4, 7] },
  { mood: 'Largos', degrees: [0, 2, 4, 7, 4, 2] },
  { mood: 'Largos', degrees: [0, 7, 4, 7] },
  { mood: 'Largos', degrees: [0, 4, 7, 9] },
  { mood: 'Largos', degrees: [0, 2, 4, 6, 7, 9] },
  { mood: 'Largos', degrees: [0, 3, 5, 7, 10] },
  { mood: 'Largos', degrees: [0, 2, 4, 5, 7, 9] },
  { mood: 'Saltos', degrees: [0, 4, 2, 7, 4, 9] },
  { mood: 'Saltos', degrees: [0, 7, 2, 9, 4, 11] },
  { mood: 'Saltos', degrees: [0, 4, 7, 2, 5, 9] },
  { mood: 'Saltos', degrees: [0, 2, 5, 7, 4, 9] },
  { mood: 'Saltos', degrees: [0, 5, 2, 7, 4, 9] },
  { mood: 'Saltos', degrees: [0, 4, 9, 2, 7, 11] },
  { mood: 'Saltos', degrees: [0, 7, 4, 11, 2, 9] },
  { mood: 'Saltos', degrees: [0, 5, 9, 2, 7, 11] },
];
const KEY_BY_OFFSET = new Map(PERFORMANCE_KEYS.map(([key, offset]) => [offset, key]));

/** Acordes que se pueden añadir a mano desde el desplegable «+». */
const CHORD_QUALITIES = [
  { id: 'M', label: 'Mayor', suffix: '', intervals: [0, 4, 7] },
  { id: 'm', label: 'Menor', suffix: 'm', intervals: [0, 3, 7] },
  { id: '7', label: 'Séptima', suffix: '7', intervals: [0, 4, 7, 10] },
  { id: 'm7', label: 'Menor séptima', suffix: 'm7', intervals: [0, 3, 7, 10] },
  { id: 'maj7', label: 'Séptima mayor', suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { id: 'sus2', label: 'Sus2', suffix: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', label: 'Sus4', suffix: 'sus4', intervals: [0, 5, 7] },
  { id: 'dim', label: 'Disminuido', suffix: 'º', intervals: [0, 3, 6] },
  { id: 'aug', label: 'Aumentado', suffix: '+', intervals: [0, 4, 8] },
];
const qualityById = (id) => CHORD_QUALITIES.find((q) => q.id === id) || CHORD_QUALITIES[0];

function noteAt(key, degree, octave) {
  const steps = SCALES[key?.scale] || SCALES.mayor;
  const base = (octave + 1) * 12 + rootIndex(key?.root || 'C');
  const oct = Math.floor(degree / steps.length);
  return base + oct * 12 + steps[((degree % steps.length) + steps.length) % steps.length];
}

/** Nombre de una raíz sin octava: «Si», «B», «Fa#»… */
function rootLabel(pc, notation = 'latin') {
  return noteLabel(midiToNote(60 + pc), notation).replace(/-?\d+$/, '');
}

/**
 * Ficha de un acorde a partir de sus notas MIDI, para pintar la tarjeta.
 * El nombre se calcula por clases de altura, así que las inversiones siguen
 * mostrando el mismo acorde con las notas en otro orden.
 */
function chordItem(midis, { notation = 'latin', octave = 3, suffix = null, qualityLabel = '', preferredRootPc = null } = {}) {
  const desc = describeChord(midis, notation, { preferredRootPc });
  const keyBase = (octave + 1) * 12;
  const root = desc?.rootLabel || rootLabel(midis[0], notation);
  return {
    midis,
    rootPc: desc?.rootPc ?? null,
    quality: desc?.quality || '',
    keys: midis.map((m) => KEY_BY_OFFSET.get(m - keyBase) || ''),
    short: `${root}${suffix ?? desc?.suffix ?? ''}`,
    fullName: qualityLabel ? `${root} ${qualityLabel}` : (desc?.fullName || `${root}${desc?.suffix || ''}`),
    letters: midis.map((m) => midiToNote(m).replace(/-?\d+$/, '')).join(' '),
    suffix,
    qualityLabel: qualityLabel || null,
  };
}

/** Ficha de una nota suelta (modo arpegios). */
function noteItem(midi, { notation = 'latin', octave = 3 } = {}) {
  const keyBase = (octave + 1) * 12;
  const note = midiToNote(midi);
  const label = noteLabel(note, notation);
  return {
    midis: [midi],
    quality: '',
    keys: [KEY_BY_OFFSET.get(midi - keyBase) || ''],
    short: label,
    fullName: label,
    letters: note.replace(/-?\d+$/, ''),
  };
}

function chordAt(key, degree, octave, notation = 'latin') {
  const midis = [degree, degree + 2, degree + 4].map((d) => noteAt(key, d, octave));
  return chordItem(midis, { notation, octave });
}

/** Copia una ficha para que la progresión no comparta estado con el catálogo. */
const cloneItem = (c) => ({ ...c, midis: [...c.midis], keys: [...c.keys] });

/** Transpone una ficha de la progresión propia y recalcula letras y teclas. */
function transposeItem(item, delta, { notation, octave }) {
  const midis = item.midis.map((m) => m + delta);
  if (midis.length === 1) return noteItem(midis[0], { notation, octave });
  return chordItem(midis, {
    notation,
    octave,
    suffix: item.suffix ?? null,
    qualityLabel: item.qualityLabel || '',
    preferredRootPc: item.rootPc == null ? null : item.rootPc + delta,
  });
}

/**
 * Acordes de una progresión de sen, plegados por octavas para que la raíz caiga
 * en el registro del teclado actual. Los intervalos y la voicing se conservan.
 */
function senItems(chords, octave, notation) {
  const low = (octave + 1) * 12;
  return chords.map((notes) => {
    const root = Math.min(...notes);
    const delta = 12 * Math.round((low - root) / 12);
    return chordItem(notes.map((m) => m + delta), { notation, octave });
  });
}

/** Progresiones de la escala actual, con sus acordes/notas y teclas. */
function progressionOptions(key, octave, type = 'chords', notation = 'latin') {
  const steps = SCALES[key?.scale] || SCALES.mayor;
  const patterns = type === 'arpeggios' ? ARPEGGIOS : steps.length >= 7 ? PROGRESSIONS_FULL : PROGRESSIONS_SHORT;
  const keyBase = (octave + 1) * 12;
  const out = [];
  for (const pattern of patterns) {
    if (type !== 'arpeggios' && pattern.degrees.some((d) => d >= steps.length)) continue;
    const items = pattern.degrees.map((degree) => {
      if (type === 'arpeggios') {
        const midi = noteAt(key, degree, octave);
        const note = midiToNote(midi);
        return {
          midis: [midi],
          quality: '',
          keys: [KEY_BY_OFFSET.get(midi - keyBase) || ''],
          short: noteLabel(note, notation),
          fullName: noteLabel(note, notation),
          letters: note.replace(/-?\d+$/, ''),
        };
      }
      return chordAt(key, degree, octave, notation);
    });
    out.push({
      index: out.length,
      mood: pattern.mood,
      type,
      label: items.map((c) => c.short).join(' – '),
      chords: items,
    });
  }
  if (type === 'chords') {
    // Progresiones reales de las capas sostenidas de las plantillas de sen.
    // Se muestran solo los acordes y se descartan las que suenan igual.
    const seen = new Set();
    for (const entry of SEN_PROGRESSIONS) {
      if (entry.chords.length < 2) continue;
      const items = senItems(entry.chords, octave, notation);
      const label = items.map((c) => c.short).join(' – ');
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({
        index: out.length,
        mood: 'Sen',
        type,
        label,
        chords: items,
        fixed: true,
      });
    }
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
  let progType = 'chords';
  // Segundos que suena cada paso de la progresión, por tipo.
  const stepSeconds = { chords: 2, arpeggios: 0.65 };
  const held = new Map(); // tecla → midi
  const chord = new Set(); // midi que suena ahora
  const tapNotes = new Set();
  const tapTimers = new Map();
  const previewNotes = [];

  const dot = h('span', { class: 'perform__dot', 'aria-hidden': 'true' });
  const title = h('b');
  const detail = h('span', { class: 'perform__detail' });
  const chips = h('div', { class: 'perform__notes', 'aria-live': 'polite' });
  const progSelect = h('select', { class: 'perform__progression-select', 'aria-label': 'Progresiones de inspiración' });
  const customOption = h('option', { value: '__custom', hidden: true }, 'Personalizada');
  const progPlay = h('button', {
    type: 'button', class: 'btn perform__transport', 'aria-label': 'Escuchar la progresión elegida', title: 'Escuchar la progresión elegida',
    onclick: () => { if (previewPlaying) stopPreview(); else playSelectedProgression(); },
  }, icon('play'));
  const progApply = h('button', {
    type: 'button', class: 'btn btn--quiet perform__apply', 'aria-label': 'Llevar a Notas',
    title: 'Llevar la progresión seleccionada a Notas', onclick: () => applyProgressionToChanges(),
  }, icon('arrow-r'), 'Notas');
  const stepInput = h('input', {
    type: 'number', class: 'perform__step-input', min: '0.1', max: '60', step: '0.05', inputmode: 'decimal',
  });
  const stepWrap = h('label', { class: 'perform__step' }, stepInput, h('span', { class: 'perform__step-unit' }, 's'));
  const commitStep = () => {
    const v = Number(String(stepInput.value).replace(',', '.'));
    if (Number.isFinite(v) && v > 0) stepSeconds[progType] = Math.round(clampNum(v, 0.1, 60) * 100) / 100;
    syncStep();
  };
  stepInput.addEventListener('change', () => {
    commitStep();
    stepInput.blur();
  });
  stepInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      stepInput.blur();
    }
  });
  stepInput.addEventListener('blur', commitStep);
  const progCards = h('div', { class: 'perform__prog-cards' });
  const addTitle = h('span', { class: 'perform__add-title' });
  const addTabScale = h('button', { type: 'button', class: 'perform__add-tab', 'aria-pressed': 'true', onclick: () => setAddTab('scale') }, 'Escala');
  const addTabFree = h('button', { type: 'button', class: 'perform__add-tab', 'aria-pressed': 'false', onclick: () => setAddTab('free') }, 'Libre');
  const addTabs = h('div', { class: 'perform__add-tabs', role: 'group', 'aria-label': 'Acordes de la escala o libres' }, addTabScale, addTabFree);
  const addHint = h('span', { class: 'perform__add-hint' });
  const addBody = h('div', { class: 'perform__add-body' });
  const addMenu = h('div', { class: 'perform__add-menu', role: 'group', 'aria-label': 'Añadir a la progresión', hidden: true }, addTitle, addTabs, addHint, addBody);
  const addBtn = h('button', {
    type: 'button', class: 'perform__add', 'aria-expanded': 'false', 'aria-controls': 'perform-add-menu',
    'aria-haspopup': 'true', 'aria-label': 'Añadir a la progresión', title: 'Añadir un acorde o una nota a la progresión',
    onclick: () => toggleAdd(),
  }, icon('plus'));
  addMenu.id = 'perform-add-menu';
  const addWrap = h('div', { class: 'perform__add-wrap' }, addBtn, addMenu);
  const editTitle = h('span', { class: 'perform__add-title' });
  const editInput = h('input', {
    type: 'text', class: 'perform__edit-input', spellcheck: 'false',
    'aria-label': 'Notas del acorde', placeholder: 'Do3 Mi3 Sol3',
  });
  const editPreview = h('span', { class: 'perform__add-preview' });
  const editInvert = h('button', {
    type: 'button', class: 'btn perform__edit-action',
    title: 'Sube una octava la nota más grave (primera inversión)',
    onclick: () => invertEdit(1),
  }, 'Invertir');
  const editInvertDown = h('button', {
    type: 'button', class: 'btn btn--quiet perform__edit-action',
    title: 'Baja una octava la nota más aguda',
    onclick: () => invertEdit(-1),
  }, 'Invertir ↓');
  const editPlay = h('button', {
    type: 'button', class: 'btn btn--quiet perform__edit-action perform__edit-play',
    'aria-label': 'Escuchar el acorde', title: 'Escuchar el acorde',
    onclick: () => {
      const item = current?.chords[editIndex];
      if (item) tapMidis(item.midis);
    },
  }, icon('play'), 'Escuchar');
  const editHint = h('span', { class: 'perform__add-hint' });
  const editMenu = h('div', {
    class: 'perform__add-menu perform__edit-menu', role: 'dialog',
    'aria-label': 'Editar las notas del acorde', hidden: true,
  },
  editTitle,
  editInput,
  h('div', { class: 'perform__edit-actions' }, editInvert, editInvertDown, editPlay),
  editPreview,
  editHint);
  document.body.append(editMenu);
  const progRow = h('div', { class: 'perform__prog-row' }, progCards, addWrap);
  const typeChords = h('button', { type: 'button', class: 'perform__type', 'aria-pressed': 'true', onclick: () => setProgType('chords') }, 'Acordes');
  const typeArps = h('button', { type: 'button', class: 'perform__type', 'aria-pressed': 'false', onclick: () => setProgType('arpeggios') }, 'Arpegios');
  const typeWrap = h('div', { class: 'perform__types', role: 'group', 'aria-label': 'Tipo de progresión' }, typeChords, typeArps);
  const progWrap = h('div', { class: 'perform__progressions' },
    h('span', { class: 'perform__progression-label' }, 'Progresión'), typeWrap, progSelect, stepWrap, progPlay, progApply);
  const progArea = h('div', { class: 'perform__prog-area' }, progWrap, progRow);
  const kb = keyboard({
    octave,
    notation: store.state.view.notation,
    hintFor: hintForMidi,
    showNav: true,
    onOctaveChange: (oct) => setOctave(oct),
    isOn: (midi) => chord.has(midi) || tapNotes.has(midi) || previewNotes.some((n) => noteToMidi(n) === midi),
    onKey: (note) => tapNote(note),
  });
  const kbWrap = h('div', { class: 'perform__keyboard' }, kb);
  const exit = h('button', { type: 'button', class: 'btn btn--quiet perform__exit', onclick: () => stop() }, 'Salir');
  const top = h('div', { class: 'perform__top' },
    h('div', { class: 'perform__head' }, dot, title, detail), chips, exit);
  const bar = h('div', { class: 'perform', role: 'region', 'aria-label': 'Modo teclado', hidden: true },
    top, progArea, kbWrap);
  document.body.append(bar);
  progSelect.addEventListener('change', () => selectProgression(progSelect.value));

  let progSig = '';
  let sigState = null;
  let progList = [];
  let current = null; // progresión editable: elegida del catálogo o construida a mano
  let addOpen = false;
  let addTab = 'scale';
  let addRootPc = 0;
  let addQualityId = 'M';
  let addNoteMidi = 60;
  let addDefaultsSig = '';
  let previewTimer = 0;
  let previewPlaying = false;
  let previewProg = null;
  let previewNext = 0;
  let previewIndex = -1;
  let editOpen = false;
  let editIndex = -1;
  let dragFrom = -1;
  let dropIndex = -1;

  document.addEventListener('pointerdown', (e) => {
    if (addOpen && !addWrap.contains(e.target)) closeAdd();
    if (editOpen && !editMenu.contains(e.target) && !e.target.closest?.('.perform__prog-edit')) closeEdit();
  }, true);
  window.addEventListener('resize', () => {
    if (addOpen) positionAddMenu();
    if (editOpen) positionEditMenu();
  });
  progCards.addEventListener('scroll', () => {
    if (editOpen) positionEditMenu();
  });
  editInput.addEventListener('change', commitEditInput);
  editInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      editInput.blur();
    }
  });

  /** Duración de cada paso (s) del tipo de progresión actual. */
  const stepNow = () => stepSeconds[progType];

  function syncStep() {
    stepInput.setAttribute('aria-label', 'Segundos por paso');
    stepInput.title = 'Segundos que dura cada paso al escuchar la progresión y al llevarla a Notas';
    if (document.activeElement !== stepInput) stepInput.value = String(stepSeconds[progType]);
  }

  function syncPlayButton() {
    setIcon(progPlay.querySelector('.i'), previewPlaying ? 'stop' : 'play');
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
    if (prog?.chords.length) {
      prog.chords.forEach((c, i) => {
        const isChord = c.midis.length > 1;
        const card = h('div', {
          class: `perform__prog-card${isChord ? '' : ' perform__prog-card--note'}${i === active ? ' is-active' : ''}`,
          dataset: { index: String(i) },
          draggable: 'true',
          title: `${c.fullName} (${c.letters}) · arrastra para reordenar`,
        });
        card.addEventListener('dragstart', (e) => startCardDrag(e, i, card));
        card.addEventListener('dragend', () => endCardDrag(card));
        card.append(
          h('button', {
            type: 'button', class: 'perform__prog-remove',
            'aria-label': `Quitar ${c.short} de la progresión`, title: `Quitar ${c.short}`,
            onclick: (e) => {
              e.stopPropagation();
              removeFromProgression(i);
            },
          }, icon('close')),
          h('button', {
            type: 'button', class: 'perform__prog-hit',
            'aria-label': `Escuchar ${c.short}`, title: `Escuchar ${c.fullName} (${c.letters})`,
            onclick: (e) => {
              e.stopPropagation();
              tapMidis(c.midis);
            },
          },
          h('b', {}, c.short),
          h('span', { class: 'perform__prog-notes' }, c.letters),
          h('span', { class: 'perform__prog-keys' }, ...c.keys.filter(Boolean).map((key) => h('kbd', {}, key.toUpperCase())))),
        );
        if (isChord) {
          card.append(h('button', {
            type: 'button', class: 'perform__prog-edit',
            'aria-label': `Editar las notas de ${c.short}`, title: `Editar las notas de ${c.short}`,
            onclick: (e) => {
              e.stopPropagation();
              openEdit(i);
            },
          }, icon('edit')));
        }
        progCards.append(card);
      });
    }
    syncProgressionControls(prog);
    if (editOpen) {
      if (!prog?.chords[editIndex]) closeEdit();
      else {
        syncEditMenu(prog.chords[editIndex], { force: document.activeElement !== editInput });
        positionEditMenu();
      }
    }
  }

  /* ---------------------------------------------------- reordenar con arrastre */

  function clearDropMarks() {
    dropIndex = -1;
    progCards.querySelectorAll('.perform__prog-card').forEach((node) => node.classList.remove('is-drop-before'));
    progCards.classList.remove('is-drop-end', 'is-dragging-over');
  }

  function startCardDrag(e, index, card) {
    if (e.target.closest?.('.perform__prog-remove, .perform__prog-edit')) {
      e.preventDefault();
      return;
    }
    if (!current?.chords[index]) {
      e.preventDefault();
      return;
    }
    dragFrom = index;
    closeAdd();
    closeEdit();
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    } catch {
      // Algunos navegadores no dejan escribir en dataTransfer durante dragstart.
    }
    card.classList.add('is-dragging');
  }

  function endCardDrag(card) {
    card.classList.remove('is-dragging');
    dragFrom = -1;
    clearDropMarks();
  }

  function cardsDragOver(e) {
    if (dragFrom < 0) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const cards = [...progCards.querySelectorAll('.perform__prog-card')];
    let at = cards.length;
    for (let k = 0; k < cards.length; k++) {
      const r = cards[k].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) {
        at = k;
        break;
      }
    }
    dropIndex = at;
    cards.forEach((node, k) => node.classList.toggle('is-drop-before', k === at));
    progCards.classList.toggle('is-drop-end', at === cards.length);
    progCards.classList.add('is-dragging-over');
    const box = progCards.getBoundingClientRect();
    if (e.clientX < box.left + 24) progCards.scrollLeft -= 10;
    else if (e.clientX > box.right - 24) progCards.scrollLeft += 10;
  }

  function cardsDragLeave(e) {
    if (dragFrom < 0) return;
    if (e.relatedTarget && progCards.contains(e.relatedTarget)) return;
    clearDropMarks();
  }

  function cardsDrop(e) {
    if (dragFrom < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const from = dragFrom;
    const at = dropIndex;
    dragFrom = -1;
    clearDropMarks();
    if (at >= 0) reorderProgression(from, at);
  }

  progCards.addEventListener('dragover', cardsDragOver);
  progCards.addEventListener('dragleave', cardsDragLeave);
  progCards.addEventListener('drop', cardsDrop);

  /** El + va pegado a la última tarjeta; los controles de paso solo con progresión. */
  function syncProgressionControls(prog = current) {
    const has = !!prog && prog.chords.length > 0;
    stepWrap.hidden = !has;
    progPlay.hidden = !has;
    if (addOpen) positionAddMenu();
  }

  /** Deja el combo en la progresión de catálogo o en «Personalizada». */
  function syncSelectValue() {
    if (current?.edited) {
      customOption.hidden = false;
      progSelect.value = '__custom';
    } else if (current?.sourceIndex != null && progList[current.sourceIndex]) {
      customOption.hidden = true;
      progSelect.value = String(current.sourceIndex);
    } else {
      customOption.hidden = true;
      progSelect.value = '';
    }
  }

  function markEdited() {
    if (!current) return;
    current.edited = true;
    current.sourceIndex = null;
    syncSelectValue();
  }

  /**
   * Las ediciones no interrumpen la escucha: si la progresión está sonando, el
   * temporizador sigue vivo y toca la lista ya modificada. Solo se detiene al
   * quedarse sin pasos o al cambiar de progresión u octava.
   */
  function addToProgression(item) {
    if (!current || current.type !== progType) current = { type: progType, sourceIndex: null, edited: false, chords: [] };
    current.chords.push(cloneItem(item));
    markEdited();
    renderProgCards(current, previewPlaying ? previewIndex : -1);
  }

  function removeFromProgression(index) {
    if (!current) return;
    if (editOpen && index === editIndex) closeEdit();
    else if (editOpen && index < editIndex) editIndex--;
    const playing = previewPlaying && previewProg === current;
    if (playing) {
      if (index < previewNext) previewNext = Math.max(0, previewNext - 1);
      if (index === previewIndex) previewIndex = -1;
      else if (index < previewIndex) previewIndex--;
    }
    current.chords.splice(index, 1);
    if (!current.chords.length) {
      current = null;
      stopPreview();
    } else {
      markEdited();
    }
    renderProgCards(current, previewPlaying ? previewIndex : -1);
    syncSelectValue();
  }

  /**
   * Lleva el acorde o la nota de `from` a la posición de inserción `insertAt`
   * (0…n). Si la progresión está sonando, conserva el paso actual y el
   * siguiente para que el arrastre no reinicie la escucha.
   */
  function reorderProgression(from, insertAt) {
    if (!current) return;
    const list = current.chords;
    if (from < 0 || from >= list.length) return;
    let to = insertAt;
    if (to > from) to -= 1;
    if (to < 0 || to >= list.length || to === from) return;
    const playing = previewPlaying && previewProg === current;
    const nextItem = playing && list.length ? list[previewNext % list.length] : null;
    const currentItem = playing && previewIndex >= 0 ? list[previewIndex] : null;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    if (playing) {
      const nextAt = nextItem ? list.indexOf(nextItem) : -1;
      previewNext = nextAt >= 0 ? nextAt : Math.min(previewNext, list.length - 1);
      previewIndex = currentItem ? list.indexOf(currentItem) : -1;
    }
    markEdited();
    renderProgCards(current, playing ? previewIndex : -1);
  }

  /* ---------------------------------------------------- editar las notas de un acorde */

  function openEdit(index) {
    const item = current?.chords[index];
    if (!item || item.midis.length < 2) return;
    closeAdd();
    closeEdit();
    editIndex = index;
    editOpen = true;
    editMenu.hidden = false;
    syncEditMenu(item, { force: true });
    positionEditMenu();
    editInput.focus();
    editInput.select();
  }

  function closeEdit() {
    if (!editOpen) return;
    editOpen = false;
    editIndex = -1;
    editMenu.hidden = true;
  }

  function syncEditMenu(item, { force = false } = {}) {
    if (!editOpen || !item) return;
    const notation = store.state.view.notation;
    const notes = item.midis.map((midi) => noteLabel(midiToNote(midi), notation)).join(' ');
    editTitle.textContent = `Editar ${item.short}`;
    if (force || document.activeElement !== editInput) editInput.value = notes;
    editPreview.textContent = `${item.fullName} · ${item.letters}`;
    editPreview.title = item.fullName;
    editHint.textContent = 'Escribe las notas separadas por espacios. Invertir sube una octava la más grave.';
    editInvert.disabled = item.midis.length < 2;
    editInvertDown.disabled = item.midis.length < 2;
  }

  /** Coloca el editor junto a la tarjeta, por encima si cabe. */
  function positionEditMenu() {
    if (!editOpen) return;
    const card = progCards.querySelectorAll('.perform__prog-card')[editIndex];
    if (!card) {
      closeEdit();
      return;
    }
    const rect = card.getBoundingClientRect();
    const width = editMenu.offsetWidth || 340;
    const height = editMenu.offsetHeight || 170;
    const margin = 8;
    const left = clampNum(rect.left + rect.width / 2 - width / 2, margin, Math.max(margin, window.innerWidth - width - margin));
    let top = rect.top - height - 8;
    if (top < margin) top = Math.min(window.innerHeight - height - margin, rect.bottom + 8);
    editMenu.style.left = `${Math.round(left)}px`;
    editMenu.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  /** Aplica una lista de notas MIDI a la tarjeta que se está editando. */
  function applyEditNotes(midis) {
    if (!editOpen || !current?.chords[editIndex]) return false;
    let clean = [...new Set(midis.map((m) => Math.round(Number(m))).filter(Number.isFinite))].sort((a, b) => a - b);
    if (!clean.length) {
      actions.notify('Un acorde necesita al menos una nota.', true);
      return false;
    }
    if (clean.length > LIMITS.notesPerTone) {
      clean = clean.slice(0, LIMITS.notesPerTone);
      actions.notify(`Máximo ${LIMITS.notesPerTone} notas por acorde.`, true);
    }
    const previous = current.chords[editIndex];
    const pitchClasses = (list) => [...new Set(list.map((m) => ((Math.round(m) % 12) + 12) % 12))].sort((a, b) => a - b).join(',');
    const sameChord = previous && pitchClasses(previous.midis) === pitchClasses(clean);
    const notation = store.state.view.notation;
    const item = clean.length === 1
      ? noteItem(clean[0], { notation, octave })
      : chordItem(clean, { notation, octave, preferredRootPc: sameChord ? previous.rootPc : null });
    current.chords[editIndex] = item;
    markEdited();
    const playing = previewPlaying && previewProg === current;
    if (playing && previewIndex === editIndex) setPreviewChord(item.midis);
    renderProgCards(current, playing ? previewIndex : -1);
    syncEditMenu(item, { force: true });
    positionEditMenu();
    return true;
  }

  function commitEditInput() {
    const item = current?.chords[editIndex];
    if (!editOpen || !item) return;
    const parsed = parseNotesInput(editInput.value);
    if (!parsed.ok) {
      actions.notify(`No se entiende «${parsed.token}». Usa Do4 Re4 Fa#4, C4 D4 o 440Hz.`, true);
      syncEditMenu(item, { force: true });
      return;
    }
    const a4 = store.state.project.tuning?.a4 ?? 440;
    const midis = parsed.notes.map((note) => noteToMidiLoose(note, a4)).filter((midi) => midi !== null);
    if (!midis.length) {
      actions.notify('Un acorde necesita al menos una nota.', true);
      syncEditMenu(item, { force: true });
      return;
    }
    if (!applyEditNotes(midis)) syncEditMenu(item, { force: true });
  }

  /** Invertir: sube la nota más grave o baja la más aguda una octava. */
  function invertEdit(direction) {
    const item = current?.chords[editIndex];
    if (!item || item.midis.length < 2) return;
    const midis = [...item.midis].sort((a, b) => a - b);
    if (direction > 0) midis[0] += 12;
    else midis[midis.length - 1] -= 12;
    applyEditNotes(midis);
  }

  /** Carga una progresión del catálogo en el editor de tarjetas. */
  function choosePreset(index, { play = true } = {}) {
    const prog = progList[index];
    if (!prog) return;
    closeEdit();
    current = { type: progType, sourceIndex: index, edited: false, chords: prog.chords.map(cloneItem) };
    renderProgCards(current);
    syncSelectValue();
    if (play) playProgression(current);
  }

  function selectProgression(value) {
    if (value === '__custom') return;
    if (value === '') {
      closeEdit();
      stopPreview();
      current = null;
      renderProgCards(null);
      syncSelectValue();
      return;
    }
    const index = Number(value);
    if (Number.isInteger(index)) choosePreset(index);
  }

  function stopPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = 0;
    previewPlaying = false;
    previewProg = null;
    previewNext = 0;
    previewIndex = -1;
    for (const note of previewNotes) audio.noteOff(note);
    previewNotes.length = 0;
    setActiveCard(-1);
    syncPlayButton();
    kb.update();
  }

  function clearTaps() {
    for (const [midi, timer] of tapTimers) {
      clearTimeout(timer);
      audio.noteOff(midiToNote(midi));
    }
    tapTimers.clear();
    tapNotes.clear();
  }

  /** Pulsación corta al hacer clic en el piano del popup. */
  function tapNote(note) {
    if (!active) return;
    const midi = noteToMidi(note);
    if (midi === null) return;
    tapMidis([midi]);
  }

  /** Pulsación corta de un acorde o nota de las tarjetas de progresión. */
  function tapMidis(midis) {
    if (!active) return;
    const t = track();
    if (!t) return;
    stopPreview();
    const opts = liveOpts();
    for (const midi of new Set(midis)) {
      const note = midiToNote(midi);
      if (tapTimers.has(midi)) clearTimeout(tapTimers.get(midi));
      tapNotes.add(midi);
      audio.noteOn(note, t, opts);
      tapTimers.set(midi, setTimeout(() => {
        tapTimers.delete(midi);
        tapNotes.delete(midi);
        audio.noteOff(note);
        hud();
      }, 900));
    }
    hud();
  }

  /* ------------------------------------------------------- añadir a la progresión */

  function closeAdd() {
    if (!addOpen) return;
    addOpen = false;
    addMenu.hidden = true;
    addBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleAdd() {
    if (addOpen) {
      closeAdd();
      return;
    }
    addOpen = true;
    addTab = 'scale';
    const key = store.state.project.key;
    const steps = SCALES[key?.scale] || SCALES.mayor;
    const low = (octave + 1) * 12;
    const defaultsSig = JSON.stringify([key?.root, key?.scale]);
    if (addDefaultsSig !== defaultsSig) {
      addDefaultsSig = defaultsSig;
      addRootPc = rootIndex(key?.root || 'C');
      addQualityId = steps.includes(3) ? 'm' : 'M';
    }
    if (addNoteMidi < low || addNoteMidi > low + 23) {
      addNoteMidi = low + ((((addRootPc - (low % 12)) % 12) + 12) % 12);
    }
    addMenu.hidden = false;
    addBtn.setAttribute('aria-expanded', 'true');
    renderAddMenu();
  }

  /** Coloca el desplegable junto al + sin salirse del panel. */
  function positionAddMenu() {
    if (!addOpen) return;
    const panel = bar.getBoundingClientRect();
    const btn = addBtn.getBoundingClientRect();
    const width = addMenu.offsetWidth || 340;
    const margin = 8;
    const minLeft = panel.left + margin;
    const maxLeft = Math.max(minLeft, panel.right - width - margin);
    const left = clampNum(btn.left + btn.width / 2 - width / 2, minLeft, maxLeft);
    const wrap = addWrap.getBoundingClientRect();
    addMenu.style.left = `${Math.round(left - wrap.left)}px`;
    addMenu.style.right = 'auto';
    const arrow = clampNum(btn.left + btn.width / 2 - left - 4, 10, width - 18);
    addMenu.style.setProperty('--add-arrow', `${Math.round(arrow)}px`);
  }

  function setAddTab(tab) {
    if (addTab === tab) return;
    addTab = tab;
    renderAddMenu();
  }

  function addChoice(c) {
    return h('button', {
      type: 'button', class: 'perform__add-choice',
      title: `Añadir ${c.fullName} (${c.letters})`,
      onclick: () => addToProgression(c),
    },
    h('b', {}, c.short),
    h('span', { class: 'perform__add-choice-notes' }, c.letters),
    h('span', { class: 'perform__add-choice-plus', 'aria-hidden': 'true' }, icon('plus')));
  }

  function addNoteChoice(n) {
    const hint = n.keys[0] ? ` · tecla ${n.keys[0].toUpperCase()}` : '';
    return h('button', {
      type: 'button', class: 'perform__add-note',
      title: `Añadir ${n.short}${hint}`,
      onclick: () => addToProgression(n),
    }, h('b', {}, n.short));
  }

  /** Notas de la escala dentro de las dos octavas del piano. */
  function scaleNoteItems() {
    const key = store.state.project.key;
    const notation = store.state.view.notation;
    const steps = SCALES[key?.scale] || SCALES.mayor;
    const root = rootIndex(key?.root || 'C');
    const low = (octave + 1) * 12;
    const items = [];
    for (let m = low; m < low + 24; m++) {
      const diff = (((m - root) % 12) + 12) % 12;
      const degree = steps.indexOf(diff);
      if (degree < 0) continue;
      items.push(noteItem(m, { notation, octave }));
    }
    return items;
  }

  function addScaleChoices() {
    const key = store.state.project.key;
    const notation = store.state.view.notation;
    if (progType === 'arpeggios') {
      const list = h('div', { class: 'perform__add-notes' });
      list.append(...scaleNoteItems().map(addNoteChoice));
      addBody.append(list);
      return;
    }
    const steps = SCALES[key?.scale] || SCALES.mayor;
    const list = h('div', { class: 'perform__add-list' });
    for (let degree = 0; degree < steps.length; degree++) {
      list.append(addChoice(chordAt(key, degree, octave, notation)));
    }
    addBody.append(list);
  }

  function freeChordItem() {
    const quality = qualityById(addQualityId);
    const rootMidi = (octave + 1) * 12 + addRootPc;
    return chordItem(quality.intervals.map((i) => rootMidi + i), {
      notation: store.state.view.notation,
      octave,
      suffix: quality.suffix,
      qualityLabel: quality.label.toLowerCase(),
    });
  }

  function addFreeChord() {
    const notation = store.state.view.notation;
    const rootSel = h('select', { class: 'perform__add-select', 'aria-label': 'Raíz del acorde' },
      ...Array.from({ length: 12 }, (_, pc) => h('option', { value: String(pc) }, rootLabel(pc, notation))));
    rootSel.value = String(addRootPc);
    const qualitySel = h('select', { class: 'perform__add-select', 'aria-label': 'Tipo de acorde' },
      ...CHORD_QUALITIES.map((q) => h('option', { value: q.id }, q.label)));
    qualitySel.value = addQualityId;
    const preview = h('span', { class: 'perform__add-preview' });
    const sync = () => {
      const item = freeChordItem();
      preview.textContent = `${item.short} · ${item.letters}`;
      preview.title = item.fullName;
    };
    rootSel.addEventListener('change', () => {
      addRootPc = Number(rootSel.value);
      sync();
    });
    qualitySel.addEventListener('change', () => {
      addQualityId = qualitySel.value;
      sync();
    });
    sync();
    addBody.append(
      h('div', { class: 'perform__add-fields' },
        h('label', { class: 'perform__add-field' }, h('span', {}, 'Raíz'), rootSel),
        h('label', { class: 'perform__add-field' }, h('span', {}, 'Tipo'), qualitySel),
        h('button', {
          type: 'button', class: 'btn perform__add-confirm',
          onclick: () => addToProgression(freeChordItem()),
        }, 'Añadir')),
      preview);
  }

  function addFreeNote() {
    const notation = store.state.view.notation;
    const low = (octave + 1) * 12;
    if (addNoteMidi < low || addNoteMidi > low + 23) {
      addNoteMidi = low + ((((addRootPc - (low % 12)) % 12) + 12) % 12);
    }
    const noteSel = h('select', { class: 'perform__add-select', 'aria-label': 'Nota' },
      ...Array.from({ length: 24 }, (_, k) => {
        const midi = low + k;
        const hint = KEY_BY_OFFSET.get(k);
        return h('option', { value: String(midi) }, `${noteLabel(midiToNote(midi), notation)}${hint ? ` · ${hint.toUpperCase()}` : ''}`);
      }));
    noteSel.value = String(addNoteMidi);
    const item = () => noteItem(addNoteMidi, { notation, octave });
    const preview = h('span', { class: 'perform__add-preview' });
    const sync = () => {
      preview.textContent = item().short;
      preview.title = item().short;
    };
    noteSel.addEventListener('change', () => {
      addNoteMidi = Number(noteSel.value);
      sync();
    });
    sync();
    addBody.append(
      h('div', { class: 'perform__add-fields' },
        h('label', { class: 'perform__add-field perform__add-field--grow' }, h('span', {}, 'Nota'), noteSel),
        h('button', {
          type: 'button', class: 'btn perform__add-confirm',
          onclick: () => addToProgression(item()),
        }, 'Añadir')),
      preview);
  }

  function renderAddMenu() {
    if (!addOpen) return;
    const key = store.state.project.key;
    const keyName = `${rootLabel(rootIndex(key?.root || 'C'), store.state.view.notation)} ${(SCALE_LABELS[key?.scale] || SCALE_LABELS.mayor).toLowerCase()}`;
    addTabScale.setAttribute('aria-pressed', String(addTab === 'scale'));
    addTabFree.setAttribute('aria-pressed', String(addTab === 'free'));
    const scaleHint = progType === 'arpeggios'
      ? `Solo las notas de ${keyName}. Para otras, usa Libre.`
      : `Solo los acordes de ${keyName} en esta octava. Para otros, usa Libre.`;
    addTitle.textContent = `${progType === 'arpeggios' ? 'Añadir nota' : 'Añadir acorde'} · ${keyName}`;
    addHint.textContent = addTab === 'scale'
      ? scaleHint
      : (progType === 'arpeggios' ? 'Cualquier nota cromática.' : 'Cualquier raíz y tipo de acorde.');
    addBody.textContent = '';
    if (addTab === 'scale') addScaleChoices();
    else if (progType === 'arpeggios') addFreeNote();
    else addFreeChord();
    positionAddMenu();
  }

  function buildProgressions() {
    const next = {
      key: store.state.project.key || {}, octave, type: progType, notation: store.state.view.notation,
    };
    const sig = JSON.stringify(next);
    if (sig === progSig) return;
    const prev = sigState;
    progSig = sig;
    sigState = next;
    stopPreview();
    progList = progressionOptions(store.state.project.key, octave, progType, store.state.view.notation);
    progSelect.textContent = '';
    progSelect.append(
      h('option', { value: '' }, progType === 'arpeggios' ? 'Arpegios' : 'Progresiones'),
      customOption);
    const groups = new Map();
    for (const p of progList) {
      if (!groups.has(p.mood)) groups.set(p.mood, []);
      groups.get(p.mood).push(p);
    }
    for (const [mood, list] of groups) {
      const group = h('optgroup', { label: mood });
      list.sort((a, b) => a.label.localeCompare(b.label, 'es'));
      for (const p of list) group.append(h('option', { value: String(p.index) }, p.label));
      progSelect.append(group);
    }
    // La progresión propia se conserva (transportada de octava si hace falta);
    // una de catálogo se recalcula con la nueva tonalidad u octava.
    if (current && current.type === progType) {
      if (current.edited) {
        const delta = prev && prev.type === progType ? (octave - prev.octave) * 12 : 0;
        if (delta || (prev && prev.notation !== next.notation)) {
          current.chords = current.chords.map((item) => transposeItem(item, delta, { notation: next.notation, octave }));
        }
        renderProgCards(current);
        syncSelectValue();
      } else if (current.sourceIndex != null && progList[current.sourceIndex]) {
        choosePreset(current.sourceIndex, { play: false });
      } else {
        current = null;
        renderProgCards(null);
        syncSelectValue();
      }
    } else {
      current = null;
      renderProgCards(null);
      syncSelectValue();
    }
    if (addOpen) renderAddMenu();
  }

  function syncProgType() {
    typeChords.setAttribute('aria-pressed', String(progType === 'chords'));
    typeArps.setAttribute('aria-pressed', String(progType === 'arpeggios'));
    syncStep();
  }

  function setProgType(type) {
    if (progType === type) return;
    closeEdit();
    progType = type;
    stopPreview();
    syncProgType();
    progSig = '';
    buildProgressions();
    if (progList.length) choosePreset(0);
  }

  function setPreviewChord(midis) {
    for (const note of previewNotes) audio.noteOff(note);
    previewNotes.length = 0;
    const t = track();
    if (!t) return;
    const opts = liveOpts();
    for (const midi of midis) {
      const note = midiToNote(midi);
      previewNotes.push(note);
      audio.noteOn(note, t, opts);
    }
    kb.update();
  }

  function playProgression(prog) {
    if (!active || !prog || !prog.chords.length) return;
    stopPreview();
    previewPlaying = true;
    previewProg = prog;
    previewNext = 0;
    syncPlayButton();
    renderProgCards(prog);
    const advance = () => {
      if (!active || !previewProg) {
        stopPreview();
        return;
      }
      const list = previewProg.chords;
      if (!list.length) {
        setPreviewChord([]);
        setActiveCard(-1);
        previewIndex = -1;
        previewNext = 0;
        previewTimer = setTimeout(advance, stepNow() * 1000);
        return;
      }
      const at = previewNext % list.length;
      previewIndex = at;
      setPreviewChord(list[at].midis);
      setActiveCard(at);
      previewNext = at + 1;
      // El paso se lee en cada vuelta: cambiarlo mientras suena se oye al momento.
      previewTimer = setTimeout(advance, stepNow() * 1000);
    };
    advance();
  }

  function playSelectedProgression() {
    if (current?.chords.length) {
      playProgression(current);
      return;
    }
    if (current) {
      actions.notify('Añade algún acorde o nota a la progresión con +.', true);
      return;
    }
    if (progList.length) {
      choosePreset(0, { play: false });
      if (current?.chords.length) playProgression(current);
    }
  }

  /**
   * Opciones de las notas en vivo: afinación, bus maestro y el fundido entre
   * notas del elemento sostenido seleccionado (o el de por defecto).
   */
  function liveOpts() {
    const p = store.state.project;
    const tone = mode === 'record' ? element() : selectedTone()?.el;
    const fade = tone?.type === 'tone' && Number.isFinite(tone.crossfade) ? tone.crossfade : 0.15;
    return { a4: p.tuning?.a4 ?? 440, fade, project: p };
  }

  function selectedTone() {
    const s = store.state.selection;
    if (s.kind === 'element' && s.elementIds.length) {
      const f = findElement(store.state.project, s.elementIds[0]);
      if (f?.el.type === 'tone') return f;
    }
    if (elementId) {
      const f = findElement(store.state.project, elementId);
      if (f?.el.type === 'tone') return f;
    }
    return null;
  }

  /** Elemento puntual seleccionado o, si no hay, la pista puntual activa. */
  function selectedStrike() {
    const s = store.state.selection;
    let f = null;
    if (s.kind === 'element' && s.elementIds.length) f = findElement(store.state.project, s.elementIds[0]);
    else if (elementId) f = findElement(store.state.project, elementId);
    if (f?.track.family === 'strike') return f;
    const t = track();
    return t?.family === 'strike' ? { track: t, el: null } : null;
  }

  /**
   * Lleva la progresión a Notas una sola vez, con la duración de paso elegida:
   * el paso k empieza en k × paso y el elemento termina con el último, sin
   * nada después. Sustituye las notas del elemento.
   */
  function applyProgressionToChanges() {
    const prog = current;
    if (!prog || !prog.chords.length) {
      actions.notify('Elige una progresión o añade acordes y notas con +.', true);
      return;
    }
    const tone = selectedTone();
    const strike = tone ? null : selectedStrike();
    if (!tone && !strike) {
      actions.notify('Selecciona una pista o un elemento sostenido o puntual para llevar la progresión a Notas.', true);
      return;
    }
    const step = stepNow();
    const ms = (x) => Math.round(x * 1000) / 1000;
    const start = tone ? tone.el.start : (strike.el?.start ?? store.state.playhead);
    const room = ms(Math.max(0.1, store.state.project.duration - start));
    const length = ms(Math.min(prog.chords.length * step, room));
    const generated = [];
    prog.chords.forEach((c, k) => {
      const t = ms(k * step);
      if (t < length - 0.0005) generated.push({ t, notes: c.midis.map((m) => midiToNote(m)) });
    });
    if (!generated.length) {
      actions.notify('No cabe la progresión en lo que queda de tema.', true);
      return;
    }
    if (strike) {
      applyStrikeProgression(strike, generated, length, step);
      return;
    }
    if (tone.el.changes?.length && !window.confirm('Llevar la progresión sustituirá las notas actuales de este elemento. ¿Continuar?')) return;
    // Fundidos cortos: el primer paso se oye entero y el último termina sin
    // apagarse antes de tiempo.
    const maxFade = ms(Math.min(0.5, step / 4));
    store.commit((d) => {
      const f = findElement(d, tone.el.id);
      if (!f || f.el.type !== 'tone') return false;
      f.el.length = length;
      f.el.notes = generated[0].notes;
      const changes = generated.slice(1);
      if (changes.length) f.el.changes = changes;
      else delete f.el.changes;
      f.el.fadeIn = Math.min(f.el.fadeIn ?? 0, maxFade);
      f.el.fadeOut = Math.min(f.el.fadeOut ?? 0, ms(Math.min(1.5, step / 4)), Math.max(0, length - f.el.fadeIn));
      return true;
    }, { source: 'performance' });
    const label = prog.type === 'arpeggios' ? 'Arpegio llevado' : 'Progresión llevada';
    const fmt = (x) => String(ms(x)).replace('.', ',');
    const cut = generated.length < prog.chords.length ? ` (solo caben ${generated.length} de ${prog.chords.length} antes del final del tema)` : '';
    actions.notify(`${label} a Notas: ${generated.length} pasos de ${fmt(step)} s, de 0 a ${fmt(length)} s${cut}.`);
  }

  /**
   * Lleva la progresión a una pista puntual: crea o sustituye una frase con
   * una entrada por nota y paso. La frase se selecciona para editar su lista.
   */
  function applyStrikeProgression(strike, generated, length, step) {
    const existing = strike.el;
    const replace = existing && (existing.type === 'phrase' ? (existing.events?.length || 0) > 0 : existing.type === 'cloud');
    if (replace && !window.confirm('Llevar la progresión sustituirá las notas actuales de este elemento. ¿Continuar?')) return;
    const start = Math.round((existing?.start ?? store.state.playhead) * 1000) / 1000;
    const events = [];
    for (const g of generated) for (const note of g.notes) events.push({ t: g.t, note, v: 0.7 });
    let id = existing?.id || null;
    store.commit((d) => {
      const t = findTrack(d, strike.track.id);
      if (!t) return false;
      const fresh = createElement(t, d, start, 'phrase');
      fresh.length = length;
      fresh.pattern = Math.max(0.25, length);
      fresh.fadeIn = 0;
      fresh.fadeOut = 0;
      fresh.events = events.map((e) => ({ ...e }));
      if (existing) {
        const idx = t.elements.findIndex((e) => e.id === existing.id);
        if (idx < 0) return false;
        fresh.id = existing.id;
        fresh.level = existing.level ?? 0;
        fresh.curve = existing.curve ?? 'plana';
        t.elements[idx] = fresh;
        id = existing.id;
      } else {
        t.elements.push(fresh);
        id = fresh.id;
      }
      return true;
    }, { source: 'performance' });
    if (id) store.select({ kind: 'element', elementIds: [id] });
    const label = current?.type === 'arpeggios' ? 'Arpegio llevado' : 'Progresión llevada';
    const fmt = (x) => String(Math.round(x * 1000) / 1000).replace('.', ',');
    const cut = generated.length < current.chords.length ? ` (solo caben ${generated.length} de ${current.chords.length} antes del final del tema)` : '';
    actions.notify(`${label} a Notas: ${generated.length} pasos de ${fmt(step)} s, de 0 a ${fmt(length)} s${cut}.`);
  }

  function selectedTrack() {
    const s = store.state.selection;
    if (s.kind === 'track') return findTrack(store.state.project, s.trackId);
    if (s.kind === 'element' && s.elementIds.length) return findElement(store.state.project, s.elementIds[0])?.track || null;
    return null;
  }

  const track = () => {
    if (mode === 'record') return findTrack(store.state.project, trackId);
    const selected = selectedTrack();
    if (selected && selected.family !== 'layer') return selected;
    return findTrack(store.state.project, trackId);
  };
  const element = () => (elementId ? findElement(store.state.project, elementId)?.el || null : null);

  function hud() {
    const t = track();
    const e = element();
    buildProgressions();
    title.textContent = mode === 'record' ? 'Grabando' : 'Teclado';
    detail.textContent = t ? ` · ${t.name} · oct. ${octave}–${octave + 1}` : '';
    const notes = [...chord].sort((a, b) => a - b);
    chips.textContent = '';
    if (notes.length) {
      for (const m of notes) chips.append(h('span', { class: 'perform__note' }, noteLabel(midiToNote(m), store.state.view.notation)));
    } else if (e && mode === 'record') {
      chips.append(h('span', { class: 'perform__silence' }, 'silencio'));
    }
    if (e && mode === 'record') {
      if (recordKind(e) === 'sequence') {
        const count = e.events?.length || 0;
        const rel = clampNum(store.state.playhead - e.start, 0, e.length);
        detail.textContent = ` · ${t?.name || ''} · ${count} ${count === 1 ? 'nota' : 'notas'} · ${rel.toFixed(1).replace('.', ',')} s de ${e.length.toFixed(1).replace('.', ',')}`;
      } else {
        const rel = clampNum(store.state.playhead - e.start, 0, e.length);
        detail.textContent = ` · ${t?.name || ''} · oct. ${octave}–${octave + 1} · ${rel.toFixed(1).replace('.', ',')} s de ${e.length.toFixed(1).replace('.', ',')}`;
      }
    }
    kb.update();
    bar.dataset.mode = mode;
    bar.hidden = !active;
  }

  function notifyOnceLimit() {
    if (warnedLimit) return;
    warnedLimit = true;
    actions.notify(`Máximo ${LIMITS.changesPerTone} cambios de nota por elemento: se descartan los más antiguos.`, true);
  }

  function record(midi = null) {
    if (!active || mode !== 'record') return;
    const f = elementId ? findElement(store.state.project, elementId) : null;
    if (!f) return;
    const kind = recordKind(f.el);
    if (kind === 'sequence') {
      // Una tecla pulsada es una nota de la lista, con su tiempo de aparición.
      if (midi === null) return;
      const el = f.el;
      const now = store.state.playing ? audio.currentTime() : store.state.playhead;
      const rel = now - el.start;
      if (rel < -0.05 || rel > el.length + 0.05) return;
      const t = Math.round(clampNum(rel, 0, el.length) * 1000) / 1000;
      if (t >= el.length - 0.0005) return;
      const note = midiToNote(midi);
      let warned = false;
      store.commit((d) => {
        const x = findElement(d, elementId)?.el;
        if (!x || x.type !== 'cloud' || x.mode !== 'mine') return false;
        const events = [...(x.events || []), { t, note, v: 0.7 }].sort((a, b) => a.t - b.t);
        if (events.length > LIMITS.cloudEvents) {
          events.splice(0, events.length - LIMITS.cloudEvents);
          warned = true;
        }
        x.events = events;
        return true;
      }, { gesture, source: 'performance' });
      if (warned) actions.notify(`Máximo ${LIMITS.cloudEvents} notas por nube: se descartan las más antiguas.`, true);
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
    clearTaps();
    held.set(key, midi);
    chord.add(midi);
    audio.noteOn(midiToNote(midi), t, liveOpts());
    record(midi);
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
    closeEdit();
    if (active) releaseAll(true);
    stopPreview();
    clearTaps();
    octave = next;
    kb.setOctave(next);
    if (store.state.view.keyboardOctave !== next) store.setView({ keyboardOctave: next });
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
        actions.notify('Selecciona un elemento sostenido o una nube de notas para grabar.', true);
        return false;
      }
      const kind = recordKind(f.el);
      const existing = kind === 'timeline' ? f.el.changes?.length : f.el.events?.length;
      if (existing && !window.confirm('Grabar sustituirá las notas actuales de este elemento. ¿Continuar?')) return false;
    }
    if (active) stop(false);
    stopPreview();
    closeAdd();
    closeEdit();
    active = true;
    mode = nextMode === 'record' ? 'record' : 'test';
    trackId = t.id;
    elementId = mode === 'record' ? target.elementId : null;
    octave = clampNum(Number.isInteger(target.octave) ? target.octave : 3, 0, 7);
    warnedLimit = false;
    held.clear();
    chord.clear();
    clearTaps();
    kb.setOctave(octave);
    syncProgType();
    syncPlayButton();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    audio.ensure().catch(() => {});
    hud();
    if (mode === 'record') {
      gesture = `perf-${Date.now()}`;
      const f = findElement(store.state.project, elementId);
      const kind = recordKind(f?.el);
      if (kind === 'timeline' || kind === 'sequence') {
        if (kind === 'timeline') {
          if (f.el.changes?.length) {
            store.commit((d) => {
              const x = findElement(d, elementId)?.el;
              if (!x) return false;
              delete x.changes;
            }, { gesture, source: 'performance' });
          }
        } else if (f.el.events?.length) {
          store.commit((d) => {
            const x = findElement(d, elementId)?.el;
            if (!x) return false;
            x.events = [];
          }, { gesture, source: 'performance' });
        }
        audio.setMonitorMute(trackId);
        startedPlayback = !store.state.playing;
        actions.startPlayback(f ? f.el.start : store.state.playhead);
        actions.notify(kind === 'timeline'
          ? 'Grabando: toca las letras mientras avanza el cabezal. Esc para salir.'
          : 'Grabando notas: cada tecla se añade a la lista con su tiempo. Esc para salir.');
      } else {
        audio.setMonitorMute(null);
        startedPlayback = false;
      }
    }
    actions.performanceChanged?.();
    return true;
  }

  function stop(message = true) {
    if (!active && bar.hidden) return;
    active = false;
    stopPreview();
    closeAdd();
    closeEdit();
    clearTaps();
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
      if (editOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeEdit();
        return true;
      }
      if (addOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeAdd();
        return true;
      }
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

  /** En Tocar, el teclado sigue a la pista que se selecciona. */
  function selectionChanged() {
    if (!active || mode !== 'test') return;
    const selected = selectedTrack();
    if (!selected || selected.family === 'layer' || selected.id === trackId) return;
    trackId = selected.id;
    stopPreview();
    clearTaps();
    releaseAll(false);
    hud();
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
    selectionChanged,
    hud,
    info: () => ({ active, mode, trackId, elementId }),
  };
}
