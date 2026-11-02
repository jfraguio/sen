/**
 * Inspector: controles del tema, de la pista, del elemento o del bus maestro
 * según la selección. Se construye a partir de las definiciones del esquema.
 */

import { h, findTrack, findElement, instrumentLabel, fmtShort, clampNum } from './util.js';
import {
  AUTOMATION_DEFS, ELEMENT_DEFS, ELEMENT_TYPES, END_MODES, FAMILIES, INSTRUMENTS, LIMITS, MASTER_DEFS, MIX_DEFS, convertElement,
  getPath, paramDefs, setPath, cloneValue, toneChangePoints,
} from '../engine/schema.js';
import { LATIN_NAMES, NOTE_NAMES, SCALE_LABELS, midiToNote, noteLabel, noteToMidi, scaleMidis, transposeNote } from '../engine/music.js';
import {
  automationEditor, boolControl, curveEditor, enumControl, noteSelect, numberControl, pairControl, phraseEditor, textControl,
} from './controls.js';
import { recordKind } from './performance.js';

const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');

/** «01.wav» a partir del origen de una pista de sen. */
function sourceFile(src) {
  return src.file || `${String(src.track).padStart(2, '0')}.wav`;
}

/** «Lluvia 01»: nombre del ambiente y nombre del archivo, sin títulos de catálogo. */
function sourceLabel(src) {
  return `${src.ambientName || capitalize(src.ambient || '')} ${String(src.track).padStart(2, '0')}`.trim();
}

const LATIN_INDEX = new Map(LATIN_NAMES.map((name, k) => [name.toLowerCase(), k]));
const NOTE_INDEX = new Map(NOTE_NAMES.map((name, k) => [name.toLowerCase(), k]));

/** Texto de una nota para los campos editables: «Do4», «Fa#4» o «440Hz». */
function noteText(note, notation) {
  if (note && typeof note === 'object') return `${Number(note.hz).toFixed(1)}Hz`;
  return noteLabel(note, notation);
}

function notesText(list, notation) {
  return list.map((n) => noteText(n, notation)).join(' ');
}

/**
 * Lee «Do4 Re4 Fa#4», «C4 D4», «440Hz» o vacío (silencio). Acepta notación
 * latina y anglosajona aunque el tema esté en la otra.
 */
function parseNotesInput(text) {
  const raw = String(text || '').trim();
  if (!raw || /^silencio$/i.test(raw)) return { ok: true, notes: [] };
  const tokens = raw.split(/[\s,;+]+/).filter(Boolean);
  const notes = [];
  for (const token of tokens) {
    const hzToken = token.replace(/hz$/i, '').replace(',', '.');
    if (/^[+]?\d+(?:\.\d+)?$/.test(hzToken)) {
      const hz = Number(hzToken);
      if (!(hz >= 8 && hz <= 16000)) return { ok: false, token };
      notes.push({ hz: Math.round(hz * 100) / 100 });
      continue;
    }
    const m = /^([a-záéíóú#]+)(-?\d+)$/i.exec(token);
    if (!m) return { ok: false, token };
    const name = m[1].toLowerCase();
    const idx = LATIN_INDEX.get(name) ?? NOTE_INDEX.get(name);
    if (idx === undefined) return { ok: false, token };
    const midi = (Number(m[2]) + 1) * 12 + idx;
    if (midi < 0 || midi > 127) return { ok: false, token };
    notes.push(midiToNote(midi));
  }
  return { ok: true, notes };
}

export function createInspector(root, store, actions) {
  const { state } = store;
  let syncers = [];
  let shownKey = '';

  const commit = (fn, gesture) => store.commit(fn, { gesture, source: 'inspector' });
  const done = () => store.endGesture();

  const section = (title, ...children) => h('section', { class: 'ins-section' }, title ? h('h3', {}, title) : null, ...children);

  function control(def, binding) {
    if (def.type === 'enum') return enumControl(def, binding, syncers);
    if (def.type === 'bool') return boolControl(def, binding, syncers);
    if (def.type === 'range') return pairControl(def, binding, syncers);
    return numberControl(def, binding, syncers);
  }

  /** Agrupa los parámetros del timbre para no mostrar una lista larga. */
  function paramGroups(track) {
    const defs = paramDefs(track.instrument);
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const used = new Set();
    const out = [];
    const add = (label, keys) => {
      const list = keys.map((k) => byKey.get(k)).filter(Boolean);
      if (!list.length) return;
      for (const d of list) used.add(d.key);
      out.push({ label, defs: list });
    };
    if (track.family === 'sustain') {
      add('Fuente', ['partials', 'rolloff', 'voices', 'detune', 'sub', 'wave', 'pulseWidth', 'vowel', 'inharmonic', 'breath']);
      add('Filtro', ['filterType', 'cutoff', 'q', 'filterEnv', 'filterTime', 'sweepDepth', 'sweepRate']);
      add('Modulación', ['glide', 'wind', 'rotation', 'rotationRate', 'vibratoDepth', 'vibratoRate', 'tremoloDepth', 'tremoloRate', 'drift', 'beat']);
      add('Espacio', ['width']);
    } else if (track.family === 'strike') {
      if (byKey.has('fmRatio')) {
        add('Operador FM', ['fmRatio', 'fmIndex', 'fmTime']);
        add('Envolvente', ['decay', 'brightness', 'hardness']);
        add('Golpe', ['velocityCurve']);
        add('Espacio', ['width']);
      } else {
        add('Material', ['decay', 'brightness', 'hardness', 'inharmonic', 'beat']);
        add('Deslizamiento', ['slide', 'slideTime', 'vibratoDepth', 'vibratoRate']);
        add('Movimiento', ['tremoloDepth', 'tremoloRate']);
        add('Golpe', ['velocityCurve']);
        add('Espacio', ['width']);
      }
    } else if (track.family === 'noise') {
      add('Color', ['color']);
      add('Filtro', ['filterType', 'cutoff', 'q']);
      add('Movimiento', ['movement', 'moveRate', 'moveDepth', 'moveTarget', 'wavePeriod', 'waveShape']);
      add('Estéreo', ['stereo']);
    } else if (track.family === 'nature') {
      add('Comportamiento', [
        'species', 'individuals', 'songRate', 'register', 'syllables', 'shape', 'callsPerMin', 'callRate',
        'pulses', 'sync', 'bout', 'rest', 'surface', 'rate', 'intensity', 'flow', 'sources', 'period',
        'size', 'foam', 'pebbles', 'strength', 'gustiness', 'howl', 'howlPitch', 'leaves', 'crackle',
        'pops', 'hiss', 'material', 'tubes', 'wind', 'pitch',
      ]);
      add('Espacio', ['distance', 'pan', 'spread', 'variation']);
    }
    const rest = defs.filter((d) => !used.has(d.key));
    if (rest.length) out.push({ label: 'Otros', defs: rest });
    return out;
  }

  const head = (title, sub, extra = null) => h('div', { class: 'ins-head' },
    h('h2', {}, title, sub ? h('small', {}, sub) : null),
    extra,
    h('button', { type: 'button', class: 'icon-btn ins-close', 'aria-label': 'Cerrar el inspector', onclick: () => actions.closeSheet() }, '×'));

  /* ------------------------------------------------------------ tema */

  function projectPanel() {
    const p = state.project;
    const pb = (path) => ({
      get: () => getPath(state.project, path),
      set: (v, { gesture } = {}) => commit((d) => setPath(d, path, v), gesture),
      done,
    });
    const maxDur = p.end.mode === 'loop' ? LIMITS.maxLoop : LIMITS.maxDuration;
    const rootOptions = NOTE_NAMES.map((n, k) => ({ value: n, label: state.view.notation === 'latin' ? LATIN_NAMES[k] : n }));
    const transpose = h('input', { type: 'number', min: -24, max: 24, step: 1, value: '0', 'aria-label': 'Semitonos', style: { width: '64px' } });
    const sc = p.scene;
    const out = [
      head(sc ? sourceLabel(sc) : 'Tema', sc ? sourceFile(sc) : 'sin selección: ajustes generales'),
      section(null,
        textControl('Nombre', pb('name'), syncers),
        textControl('Notas', pb('notes'), syncers, { multiline: true, placeholder: 'Idea, referencias…' })),
      section('Tiempo',
        numberControl({ label: 'Duración', min: LIMITS.minDuration, max: maxDur, step: 1, unit: 's', def: 180 }, pb('duration'), syncers),
        enumControl({ label: 'Final', options: END_MODES }, {
          get: () => state.project.end.mode,
          set: (v) => commit((d) => {
            d.end.mode = v;
            if (v === 'loop' && d.duration > LIMITS.maxLoop) d.duration = LIMITS.maxLoop;
          }),
        }, syncers),
        p.end.mode === 'cut' ? numberControl({ label: 'Fundido de salida', min: 0, max: 30, step: 0.1, unit: 's', def: 4 }, pb('end.fadeOut'), syncers) : null,
        boolControl({ label: 'Usar tempo' }, {
          get: () => !!state.project.tempo,
          set: (v) => commit((d) => {
            d.tempo = v ? { bpm: 60, beatsPerBar: 4 } : null;
          }),
        }, syncers),
        p.tempo ? numberControl({ label: 'Tempo', min: 30, max: 160, step: 1, unit: 'BPM', def: 60 }, pb('tempo.bpm'), syncers) : null,
        p.tempo ? enumControl({ label: 'Pulsos por compás', options: [2, 3, 4, 6].map((v) => ({ value: v, label: String(v) })) }, pb('tempo.beatsPerBar'), syncers) : null,
        p.region ? h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, `Región ${fmtShort(p.region.start)}–${fmtShort(p.region.end)}`),
          h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.clearRegion() }, 'Quitar')) : null),
      section('Tono',
        enumControl({ label: 'Raíz', options: rootOptions }, pb('key.root'), syncers),
        enumControl({ label: 'Escala', options: Object.entries(SCALE_LABELS).map(([value, label]) => ({ value, label })) }, pb('key.scale'), syncers),
        numberControl({ label: 'Afinación (La4)', min: 415, max: 466, step: 0.5, unit: 'Hz', def: 440 }, pb('tuning.a4'), syncers),
        h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, 'Transponer todo'),
          h('span', { class: 'ctl-value' }, transpose, ' ', h('button', {
            type: 'button',
            class: 'btn btn--quiet',
            onclick: () => {
              const n = Math.round(Number(transpose.value));
              if (!n) return;
              commit((d) => {
                const k = NOTE_NAMES.indexOf(d.key.root);
                d.key.root = NOTE_NAMES[(((k + n) % 12) + 12) % 12];
                for (const t of d.tracks) {
                  for (const e of t.elements) {
                    if (e.notes) e.notes = e.notes.map((x) => transposeNote(x, n));
                    if (e.changes) e.changes = e.changes.map((c) => ({ ...c, notes: c.notes.map((x) => transposeNote(x, n)) }));
                    if (e.note) e.note = transposeNote(e.note, n);
                    if (e.events) e.events = e.events.map((ev) => ({ ...ev, note: transposeNote(ev.note, n) }));
                    if (e.range) e.range = e.range.map((x) => transposeNote(x, n));
                    if (e.pitches) e.pitches = e.pitches.map((x) => transposeNote(x, n));
                  }
                }
              });
              transpose.value = '0';
              actions.notify(`Tema transpuesto ${n > 0 ? '+' : ''}${n} semitonos.`);
            },
          }, 'Aplicar')))),
      section('Azar',
        textControl('Semilla', pb('seed'), syncers),
        h('div', { class: 'ins-actions' }, h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => commit((d) => { d.seed = `sen-${Math.floor(Math.random() * 1e6)}`; }) }, 'Aleatorizar todo'))),
      section('Vista',
        enumControl({ label: 'Notación', options: [{ value: 'latin', label: 'Latina (Do, Re…)' }, { value: 'english', label: 'Anglosajona (C, D…)' }] }, {
          get: () => state.view.notation,
          set: (v) => store.setView({ notation: v }),
        }, syncers)),
    ];
    return out;
  }

  /* ------------------------------------------------------------ automatización */

  let autoKey = 'gain';
  function automationSection(id) {
    const box = h('div');
    const draw = () => {
      box.textContent = '';
      const def = AUTOMATION_DEFS.find((d) => d.key === autoKey);
      const local = [];
      const get = () => findTrack(state.project, id)?.automation?.[autoKey] || [];
      const sel = h('select', { 'aria-label': 'Parámetro automatizado' }, AUTOMATION_DEFS.map((d) => {
        const n = findTrack(state.project, id)?.automation?.[d.key]?.length || 0;
        return h('option', { value: d.key }, `${d.label}${n ? ` (${n})` : ''}`);
      }));
      sel.value = autoKey;
      sel.addEventListener('change', () => {
        autoKey = sel.value;
        draw();
      });
      const editor = automationEditor({
        binding: {
          get,
          set: (pts, { gesture } = {}) => commit((d) => {
            const t = findTrack(d, id);
            if (!t) return false;
            t.automation = { ...(t.automation || {}) };
            if (pts.length) t.automation[autoKey] = pts;
            else delete t.automation[autoKey];
            if (!Object.keys(t.automation).length) delete t.automation;
          }, gesture),
          done,
        },
        syncers: local,
        def,
        duration: () => state.project.duration,
        base: () => {
          const t = findTrack(state.project, id);
          if (!t) return def.min;
          if (autoKey === 'cutoff') return def.max;
          return t.mix[autoKey] ?? def.min;
        },
      });
      for (const fn of local) syncers.push(fn);
      box.append(
        h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, 'Parámetro'), sel),
        editor,
        h('div', { class: 'ins-actions' }, h('button', {
          type: 'button',
          class: 'btn btn--quiet',
          onclick: () => commit((d) => {
            const t = findTrack(d, id);
            if (!t?.automation?.[autoKey]) return false;
            delete t.automation[autoKey];
            if (!Object.keys(t.automation).length) delete t.automation;
          }),
        }, 'Quitar esta automatización')));
    };
    draw();
    return box;
  }

  /* ------------------------------------------------------------ cambios de nota */

  /**
   * Fila de notas editable con el mismo aspecto que la fila base de Notas de
   * un sostenido: «Do4 Mi4 Sol4», «C4 E4» o «440Hz». `count` muestra n/máx.
   */
  function notesSetRow({ get, set, max, min = 0, label, placeholder = 'Do4 Mi4 Sol4', count = false, audition = null }) {
    // Con varias notas, un área que crece con el texto para verlas todas.
    const input = max > 1
      ? h('textarea', {
        class: 'note-change__notes note-change__notes--wrap', rows: 1, spellcheck: 'false', placeholder,
        'aria-label': label, title: 'Escribe las notas separadas por espacios (Do4 Re4, C4 D4 o 440Hz)',
      })
      : h('input', {
        type: 'text', class: 'note-change__notes', spellcheck: 'false', placeholder,
        'aria-label': label, title: 'Escribe la nota (Do4, C4 o 440Hz)',
      });
    const counter = count ? h('span', { class: 'note-change__count', 'aria-hidden': 'true' }) : null;
    const autoSize = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');
    const fit = () => {
      if (autoSize || input.tagName !== 'TEXTAREA') return;
      input.style.height = 'auto';
      if (input.scrollHeight) input.style.height = `${input.scrollHeight + 2}px`;
    };
    input.addEventListener('input', fit);
    const sync = () => {
      const list = get();
      if (document.activeElement !== input) input.value = notesText(list, state.view.notation);
      if (counter) counter.textContent = `${list.length}/${max}`;
      requestAnimationFrame(fit);
    };
    const commitNotes = () => {
      const current = get();
      const parsed = parseNotesInput(input.value);
      if (!parsed.ok) {
        actions.notify(`No se entiende «${parsed.token}». Usa Do4 Re4 Fa#4, C4 D4 o 440Hz.`, true);
        input.value = notesText(current, state.view.notation);
        return;
      }
      const seen = new Set();
      let notes = parsed.notes.filter((n) => {
        const k = n && typeof n === 'object' ? `hz:${n.hz}` : String(noteToMidi(n));
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (notes.length < min) {
        actions.notify(min === 1 ? 'Escribe al menos una nota.' : `Escribe al menos ${min} notas.`, true);
        input.value = notesText(current, state.view.notation);
        return;
      }
      if (notes.length > max) {
        notes = notes.slice(0, max);
        actions.notify(max === 1 ? 'Solo una nota: se usa la primera.' : `Máximo ${max} notas.`, true);
      }
      input.value = notesText(notes, state.view.notation);
      if (notesText(notes, state.view.notation) === notesText(current, state.view.notation)) return;
      set(notes);
      if (audition && notes.length === 1) audition(notes[0]);
    };
    input.addEventListener('change', commitNotes);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        input.blur();
      }
    });
    syncers.push(sync);
    sync();
    return h('div', { class: 'note-changes' },
      h('div', { class: `note-change note-change--base note-change--set${counter ? '' : ' note-change--single'}` }, input, counter));
  }
  /** Botones de prueba y grabación con el teclado del ordenador. */
  function performanceButtons(track, el, getOctave) {
    const target = (mode) => ({ trackId: track.id, elementId: mode === 'record' ? el?.id : null, octave: getOctave?.() ?? 3 });
    const test = h('button', {
      type: 'button', class: 'btn', title: 'Toca las letras sin modificar el tema (Esc para salir)',
      onclick: () => actions.togglePerformance('test', target('test')),
    }, '▶ Teclado');
    const kind = recordKind(el);
    const rec = kind ? h('button', {
      type: 'button', class: 'btn perf-rec',
      title: kind === 'palette'
        ? 'Añade al conjunto de notas propias las teclas que toques (Esc para salir)'
        : 'Graba los cambios de nota mientras avanza el cabezal (Esc para salir)',
      onclick: () => actions.togglePerformance('record', target('record')),
    }, h('span', { class: 'perf-rec-dot', 'aria-hidden': 'true' }), 'Grabar') : null;
    const sync = () => {
      const p = actions.performanceInfo?.() || {};
      test.setAttribute('aria-pressed', String(!!p.active && p.mode === 'test' && p.trackId === track.id));
      rec?.setAttribute('aria-pressed', String(!!p.active && p.mode === 'record' && p.trackId === track.id && p.elementId === el?.id));
    };
    syncers.push(sync);
    sync();
    return h('div', { class: 'ins-actions ins-actions--perf' }, test, rec);
  }

  /** Lista de cambios de nota de un `tone`, con alta en el cabezal y borrado. */
  function changesSection(track, el) {
    const id = el.id;
    const list = h('div', { class: 'note-changes' });

    const addAtEnd = () => {
      const f = findElement(state.project, id);
      if (!f) return;
      const changes = f.el.changes || [];
      if (changes.length >= LIMITS.changesPerTone) {
        actions.notify(`Máximo ${LIMITS.changesPerTone} cambios de nota por elemento.`, true);
        return;
      }
      const last = changes[changes.length - 1];
      const limit = Math.max(0, f.el.length - 0.001);
      const t = last ? Math.round(Math.min(limit, last.t + 1) * 1000) / 1000 : Math.min(1, limit);
      if (last && t <= last.t + 0.0005) {
        actions.notify('No queda espacio al final del elemento.', true);
        return;
      }
      const notes = (last ? last.notes : f.el.notes).map((n) => (n && typeof n === 'object' ? { ...n } : n));
      commit((d) => {
        const x = findElement(d, id)?.el;
        if (!x) return false;
        x.changes = [...(x.changes || []), { t, notes }].sort((a, b) => a.t - b.t);
      });
    };

    const updateChange = (c, patch) => {
      commit((d) => {
        const x = findElement(d, id)?.el;
        if (!x?.changes) return false;
        const i = x.changes.findIndex((q) => Math.abs(q.t - c.t) < 0.0005);
        if (i < 0) return false;
        Object.assign(x.changes[i], patch);
        const edited = x.changes[i];
        x.changes = x.changes.filter((q) => q === edited || Math.abs(q.t - edited.t) > 0.0005);
        x.changes.sort((a, b) => a.t - b.t);
        return true;
      });
    };

    const render = () => {
      list.textContent = '';
      const e = findElement(state.project, id)?.el;
      const start = e?.start ?? el.start;
      const changes = e?.changes || [];
      const maxT = Math.max(0, (e?.length ?? el.length) - 0.001);
      const baseNotes = e?.notes || [];
      const baseInput = h('input', {
        type: 'text', class: 'note-change__notes', value: notesText(baseNotes, state.view.notation),
        placeholder: 'Do3 Sol3 · vacío = silencio', spellcheck: 'false',
        'aria-label': 'Notas desde el inicio del elemento',
        title: 'Notas desde el inicio hasta el primer cambio',
      });
      const commitBase = () => {
        const parsed = parseNotesInput(baseInput.value);
        if (!parsed.ok) {
          actions.notify(`No se entiende «${parsed.token}». Usa Do4 Re4 Fa#4, C4 D4 o 440Hz.`, true);
          baseInput.value = notesText(baseNotes, state.view.notation);
          return;
        }
        let notes = parsed.notes;
        if (notes.length > LIMITS.notesPerTone) {
          notes = notes.slice(0, LIMITS.notesPerTone);
          actions.notify(`Máximo ${LIMITS.notesPerTone} notas por cambio.`, true);
        }
        if (notesText(notes, state.view.notation) === notesText(baseNotes, state.view.notation)) return;
        commit((d) => {
          const x = findElement(d, id)?.el;
          if (!x) return false;
          x.notes = notes;
        });
      };
      baseInput.addEventListener('change', commitBase);
      baseInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          baseInput.blur();
        }
      });
      list.append(h('div', { class: 'note-change note-change--base' },
        h('span', { class: 'note-change__timebox' },
          h('input', {
            type: 'number', class: 'note-change__time', min: '0', max: '0', step: '1', value: '0', disabled: true,
            'aria-label': 'Inicio del elemento',
          }),
          h('span', { class: 'ctl-unit' }, 's')),
        baseInput,
        h('span', { class: 'note-change__spacer', 'aria-hidden': 'true' })));
      changes.forEach((c, k) => {
        const timeInput = h('input', {
          type: 'number', class: 'note-change__time', min: '0.01', max: String(maxT), step: '0.01',
          value: String(c.t), inputmode: 'decimal',
          'aria-label': `Segundo del cambio ${k + 1} desde el inicio`,
          title: `Desde el inicio del elemento · en el tema: ${fmtShort(start + c.t)}`,
        });
        const commitTime = () => {
          const cur = findElement(state.project, id)?.el;
          const v = Number(timeInput.value);
          if (!cur || !timeInput.value.trim() || !Number.isFinite(v)) {
            timeInput.value = String(c.t);
            return;
          }
          const t = Math.round(clampNum(v, 0.01, Math.max(0.01, cur.length - 0.001)) * 1000) / 1000;
          if (Math.abs(t - c.t) > 0.0005) updateChange(c, { t });
        };
        timeInput.addEventListener('change', commitTime);
        timeInput.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            timeInput.blur();
          }
        });
        const notesInput = h('input', {
          type: 'text', class: 'note-change__notes', value: notesText(c.notes, state.view.notation),
          placeholder: 'Do3 Sol3 · vacío = silencio', spellcheck: 'false',
          'aria-label': `Notas del cambio ${k + 1}`,
          title: 'Escribe las notas separadas por espacios; vacío es silencio',
        });
        const commitNotes = () => {
          const parsed = parseNotesInput(notesInput.value);
          if (!parsed.ok) {
            actions.notify(`No se entiende «${parsed.token}». Usa Do4 Re4 Fa#4, C4 D4 o 440Hz.`, true);
            notesInput.value = notesText(c.notes, state.view.notation);
            return;
          }
          let notes = parsed.notes;
          if (notes.length > LIMITS.notesPerTone) {
            notes = notes.slice(0, LIMITS.notesPerTone);
            actions.notify(`Máximo ${LIMITS.notesPerTone} notas por cambio.`, true);
          }
          if (notesText(notes, state.view.notation) !== notesText(c.notes, state.view.notation)) updateChange(c, { notes });
        };
        notesInput.addEventListener('change', commitNotes);
        notesInput.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            notesInput.blur();
          }
        });
        list.append(h('div', { class: 'note-change' },
          h('span', { class: 'note-change__timebox' }, timeInput, h('span', { class: 'ctl-unit' }, 's')),
          notesInput,
          h('button', {
            type: 'button', class: 'icon-btn icon-btn--small', 'aria-label': `Quitar el cambio de ${fmtShort(start + c.t)}`,
            onclick: () => commit((d) => {
              const x = findElement(d, id)?.el;
              if (!x?.changes) return false;
              x.changes = x.changes.filter((q) => Math.abs(q.t - c.t) > 0.0005);
              if (!x.changes.length) delete x.changes;
            }),
          }, '×')));
      });
      list.append(h('button', {
        type: 'button', class: 'note-change-add', title: 'Añadir un cambio al final', 'aria-label': 'Añadir un cambio al final',
        onclick: addAtEnd,
      }, '+'));
    };
    syncers.push(render);
    render();

    const crossDef = ELEMENT_DEFS.tone[0];
    const crossControl = numberControl(crossDef, {
      get: () => findElement(state.project, id)?.el.crossfade ?? crossDef.def,
      set: (v, { gesture } = {}) => commit((d) => {
        const f = findElement(d, id);
        if (!f) return false;
        f.el.crossfade = v;
      }, gesture),
      done,
    }, syncers);

    // Repite el patrón (el elemento entero: sus filas con sus tiempos) hasta
    // el final del tema, alargando el elemento.
    const repeatBtn = h('button', {
      type: 'button', class: 'btn btn--quiet note-repeat',
      title: 'Repite estas notas, con sus tiempos, una y otra vez hasta el final del tema',
      onclick: () => repeatToEnd(id),
    }, '↻ Repetir hasta el final');
    syncers.push(() => {
      const e = findElement(state.project, id)?.el;
      repeatBtn.disabled = !e || e.start + e.length >= state.project.duration - 0.0005;
    });
    repeatBtn.disabled = el.start + el.length >= state.project.duration - 0.0005;

    return section('Notas',
      performanceButtons(track, el, () => state.view.keyboardOctave ?? 3),
      list,
      h('div', { class: 'ins-actions' }, repeatBtn),
      crossControl);
  }

  /**
   * Repite las notas de un `tone` hasta el final del tema. El patrón es el
   * elemento completo: cada fila dura hasta la siguiente y la última hasta el
   * final del elemento, así que la repetición conserva todos los tiempos.
   */
  function repeatToEnd(id) {
    const f = findElement(state.project, id);
    if (!f || f.el.type !== 'tone') return;
    const el = f.el;
    const ms = (x) => Math.round(x * 1000) / 1000;
    const pattern = el.length;
    const end = ms(state.project.duration - el.start);
    if (end <= pattern + 0.0005) {
      actions.notify('El elemento ya llega al final del tema.', true);
      return;
    }
    const rows = toneChangePoints(el);
    const copy = (notes) => notes.map((n) => (n && typeof n === 'object' ? { ...n } : n));
    const changes = (el.changes || []).map((c) => ({ ...c, notes: copy(c.notes) }));
    let length = end;
    let reps = 0;
    let full = true;
    if (rows.length > 1) {
      for (let r = 1; r * pattern < end - 0.0005; r++) {
        // Cada vuelta empieza con la fila base: si no caben todas sus filas,
        // el elemento se corta al final de la última vuelta completa.
        if (changes.length + rows.length > LIMITS.changesPerTone) {
          length = ms(r * pattern);
          full = false;
          break;
        }
        for (const row of rows) {
          const t = ms(r * pattern + row.t);
          if (t < end - 0.0005) changes.push({ t, notes: copy(row.notes) });
        }
        reps++;
      }
    }
    commit((d) => {
      const x = findElement(d, id)?.el;
      if (!x) return false;
      x.length = length;
      if (changes.length) x.changes = changes;
      else delete x.changes;
      x.fadeOut = Math.min(x.fadeOut ?? 0, Math.max(0, length - (x.fadeIn ?? 0)));
    });
    const fmt = (x) => fmtShort(el.start + x);
    if (rows.length <= 1) actions.notify(`Las notas se alargan hasta el final del tema (${fmt(length)}).`);
    else if (!full) actions.notify(`Patrón repetido ${reps} veces, hasta ${fmt(length)}: máximo ${LIMITS.changesPerTone} cambios de nota por elemento.`, true);
    else actions.notify(`Patrón de ${String(ms(pattern)).replace('.', ',')} s repetido hasta el final del tema (${fmt(length)}).`);
  }

  /* ------------------------------------------------------------ pista */

  function trackPanel(track) {
    const id = track.id;
    const tb = (group, key) => ({
      get: () => findTrack(state.project, id)?.[group]?.[key],
      set: (v, { gesture } = {}) => commit((d) => {
        const t = findTrack(d, id);
        if (!t) return false;
        t[group][key] = v;
      }, gesture),
      done,
    });
    const family = FAMILIES.find((f) => f.id === track.family);
    const sameFamily = Object.entries(INSTRUMENTS).filter(([, v]) => v.family === track.family).map(([value, v]) => ({ value, label: v.label }));
    const color = h('input', { type: 'color', value: track.color, 'aria-label': 'Color de la pista' });
    color.addEventListener('input', () => commit((d) => { findTrack(d, id).color = color.value; }, `color-${id}`));
    color.addEventListener('change', done);
    syncers.push(() => {
      const t = findTrack(state.project, id);
      if (t && document.activeElement !== color) color.value = t.color;
    });
    const timbre = paramGroups(track).map((g) => section(g.label, ...g.defs.map((def) => control(def, tb('params', def.key)))));
    const mix = MIX_DEFS.map((def) => control(def, tb('mix', def.key)));
    const isLayer = track.family === 'layer';
    const src = track.source;
    const srcLabel = isLayer ? sourceLabel(src) : '';
    const srcFile = isLayer ? sourceFile(src) : '';
    return [
      head(track.name, isLayer ? `Capa de «${srcLabel}» · ${srcFile}` : `${family.label} · ${instrumentLabel(track)}`),
      section(null,
        textControl('Nombre', { get: () => findTrack(state.project, id)?.name ?? '', set: (v, { gesture } = {}) => commit((d) => { findTrack(d, id).name = v || 'Pista'; }, gesture), done }, syncers),
        h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, 'Color'), color),
        isLayer ? null : enumControl({ label: 'Instrumento', options: sameFamily }, {
          get: () => findTrack(state.project, id)?.instrument,
          set: (v) => commit((d) => {
            const t = findTrack(d, id);
            const fresh = {};
            for (const def of paramDefs(v)) fresh[def.key] = cloneValue(def.def);
            for (const k of Object.keys(fresh)) if (k in t.params && typeof t.params[k] === typeof fresh[k] && !['species', 'surface', 'material'].includes(k)) fresh[k] = t.params[k];
            t.instrument = v;
            t.params = fresh;
          }),
        }, syncers),
        h('div', { class: 'ins-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => actions.auditionTrack(id) }, '▶ Escuchar'),
          h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.addElement(id, state.playhead) }, '+ Elemento en el cabezal')),
        isLayer ? null : performanceButtons(track, null, () => 3)),
      ...timbre,
      section('Mezcla', ...mix),
      section('Automatización', automationSection(id)),
      section(null, h('div', { class: 'ins-actions' },
        h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.duplicateTrack(id) }, 'Duplicar pista'),
        h('button', { type: 'button', class: 'btn btn--quiet btn--danger', onclick: () => actions.deleteTrack(id) }, 'Borrar pista'))),
    ];
  }

  /* ------------------------------------------------------------ elemento */

  function elementPanel(track, el) {
    const id = el.id;
    const eb = (key) => ({
      get: () => findElement(state.project, id)?.el[key],
      set: (v, { gesture } = {}) => commit((d) => {
        const f = findElement(d, id);
        if (!f) return false;
        f.el[key] = v;
        if (key === 'length' || key === 'fadeIn') f.el.fadeIn = Math.min(f.el.fadeIn ?? 0, f.el.length);
        if (key === 'length' || key === 'fadeIn' || key === 'fadeOut') f.el.fadeOut = Math.min(f.el.fadeOut ?? 0, Math.max(0, f.el.length - f.el.fadeIn));
      }, gesture),
      done,
    });
    const p = state.project;
    const notation = state.view.notation;
    const audition = (note) => actions.auditionTrack(track.id, note);
    const blocks = [];
    const family = FAMILIES.find((f) => f.id === track.family);
    const typeSel = family.types.length > 1 ? enumControl({ label: 'Tipo', options: family.types.map((t) => ({ value: t, label: ELEMENT_TYPES[t].label })) }, {
      get: () => findElement(state.project, id)?.el.type,
      set: (v) => commit((d) => {
        const f = findElement(d, id);
        const idx = f.track.elements.indexOf(f.el);
        f.track.elements[idx] = convertElement(f.track, d, f.el, v);
      }),
    }, syncers) : null;

    if (el.type === 'tone') {
      blocks.push(changesSection(track, el));
    } else if (el.type === 'hit') {
      blocks.push(section('Nota',
        performanceButtons(track, el, () => state.view.keyboardOctave ?? 4),
        notesSetRow({
          get: () => [findElement(state.project, id)?.el.note].filter(Boolean),
          set: (v) => commit((d) => {
            const e = findElement(d, id)?.el;
            if (!e) return false;
            e.note = v[0];
          }),
          max: 1,
          min: 1,
          label: 'Nota del golpe',
          placeholder: 'Do4',
          audition,
        })));
    } else if (el.type === 'phrase') {
      blocks.push(section('Frase',
        performanceButtons(track, el, () => state.view.keyboardOctave ?? 4),
        ...ELEMENT_DEFS.phrase.map((def) => numberControl(def, eb(def.key), syncers)),
        phraseEditor({
          binding: {
            get: () => {
              const e = findElement(state.project, id)?.el;
              return { pattern: e?.pattern ?? 4, events: e?.events ?? [] };
            },
            set: (v) => commit((d) => Object.assign(findElement(d, id).el, v)),
          },
          syncers, project: p, notation, audition,
        })));
    } else if (el.type === 'cloud') {
      // Mismo diseño que las notas de un sostenido: teclado y grabación arriba,
      // la fila de notas y, como particularidad, el modo de notas aleatorias.
      const random = !el.pitches;
      const cloudNotesFor = (e, key) => {
        const lo = noteToMidi(e.range?.[0]);
        const hi = noteToMidi(e.range?.[1]);
        if (lo === null || hi === null) return [...(e.range || [])];
        const midis = scaleMidis(key.root, key.scale, Math.min(lo, hi), Math.max(lo, hi));
        const notes = (midis.length ? midis : [Math.min(lo, hi)]).slice(0, LIMITS.cloudPitches).map(midiToNote);
        return notes.length ? notes : [...(e.range || [])];
      };
      const notesBlock = random
        ? h('div', { class: 'ctl ctl--pair' }, h('span', { class: 'ctl-label' }, 'Registro'),
          noteSelect({ get: () => findElement(state.project, id)?.el.range[0], set: (v) => commit((d) => { findElement(d, id).el.range[0] = v; }) }, syncers, notation, 'Nota más grave'),
          noteSelect({ get: () => findElement(state.project, id)?.el.range[1], set: (v) => commit((d) => { findElement(d, id).el.range[1] = v; }) }, syncers, notation, 'Nota más aguda'))
        : notesSetRow({
          get: () => findElement(state.project, id)?.el.pitches || [],
          set: (v) => commit((d) => {
            const e = findElement(d, id)?.el;
            if (!e) return false;
            e.pitches = v;
          }),
          max: LIMITS.cloudPitches,
          min: 1,
          label: 'Notas de la nube',
          placeholder: 'Do4 Mi4 Sol4',
          count: true,
        });
      blocks.push(section('Notas',
        performanceButtons(track, el, () => state.view.keyboardOctave ?? 4),
        notesBlock,
        boolControl({ label: 'Notas aleatorias' }, {
          get: () => !findElement(state.project, id)?.el.pitches,
          set: (v) => commit((d) => {
            const e = findElement(d, id)?.el;
            if (!e) return false;
            e.pitches = v ? null : cloudNotesFor(e, d.key);
          }),
        }, syncers)));
      blocks.push(section('Nube generativa',
        ...ELEMENT_DEFS.cloud.map((def) => (def.type === 'range' ? pairControl(def, eb(def.key), syncers) : numberControl(def, eb(def.key), syncers))),
        seedRow(id)));
    } else if (el.type === 'span') {
      blocks.push(section(track.family === 'nature' ? 'Actividad' : 'Tramo',
        ...ELEMENT_DEFS.span.map((def) => numberControl(def, eb(def.key), syncers)),
        seedRow(id)));
    } else if (el.type === 'clip') {
      blocks.push(section('Capa',
        ...ELEMENT_DEFS.clip.map((def) => numberControl(def, eb(def.key), syncers))));
    }
    if (el.type !== 'hit') blocks.push(section(null, curveEditor({ binding: { get: () => findElement(state.project, id)?.el.curve ?? 'plana', set: (v, { gesture } = {}) => commit((d) => { findElement(d, id).el.curve = v; }, gesture), done }, syncers })));

    return [
      head(track.family === 'layer' ? track.name : instrumentLabel(track), elementSubtitle(id)),
      typeSel ? section(null, typeSel) : null,
      ...blocks,
      section(null, h('div', { class: 'ins-actions' },
        h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.duplicateSelection() }, 'Duplicar'),
        h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.splitAtPlayhead() }, 'Dividir'))),
    ];
  }

  /** «Nube generativa · 0:12–0:42»: tipo y posición del elemento, al día. */
  function elementSubtitle(id) {
    const out = h('span');
    const sync = () => {
      const e = findElement(state.project, id)?.el;
      if (!e) return;
      const type = ELEMENT_TYPES[e.type]?.label || '';
      const at = e.type === 'hit' ? `en ${fmtShort(e.start)}` : `${fmtShort(e.start)}–${fmtShort(e.start + e.length)}`;
      out.textContent = `${type} · ${at}`;
    };
    syncers.push(sync);
    sync();
    return out;
  }

  function seedRow(id) {
    const out = h('span', { class: 'ctl-seed' });
    const sync = () => {
      out.textContent = String(findElement(state.project, id)?.el.seed ?? 1);
    };
    syncers.push(sync);
    sync();
    return h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, 'Semilla'), h('span', { class: 'ctl-value' }, out, h('button', {
      type: 'button',
      class: 'btn btn--quiet',
      title: 'Otra variación con los mismos ajustes',
      onclick: () => commit((d) => { const e = findElement(d, id).el; e.seed = ((e.seed ?? 1) % 999999) + 1; }),
    }, '⟳ Aleatorizar')));
  }

  /* ------------------------------------------------------------ maestro */

  function masterPanel() {
    const mb = (path) => ({
      get: () => getPath(state.project.master, path),
      set: (v, { gesture } = {}) => commit((d) => setPath(d.master, path, v), gesture),
      done,
    });
    const groups = new Map();
    for (const def of MASTER_DEFS) {
      const g = def.group || '';
      if (!groups.has(g)) groups.set(g, []);
      if (def.key === 'echo.time' && state.project.tempo && getPath(state.project.master, 'echo.sync') !== 'libre') continue;
      groups.get(g).push(control(def, mb(def.key)));
    }
    return [
      head('Bus maestro'),
      ...[...groups.entries()].map(([g, list]) => section(g || 'Salida', ...list)),
    ];
  }

  /* ------------------------------------------------------------ montaje */

  function structuralKey() {
    const s = state.selection;
    const p = state.project;
    const v = state.view.notation;
    if (s.kind === 'track') {
      const t = findTrack(p, s.trackId);
      return `t|${s.trackId}|${t?.instrument}|${v}`;
    }
    if (s.kind === 'element') {
      if (s.elementIds.length !== 1) return `m|${s.elementIds.join(',')}`;
      const f = findElement(p, s.elementIds[0]);
      return `e|${s.elementIds[0]}|${f?.el.type}|${f?.track.instrument}|${!!f?.el.pitches}|${p.duration}|${JSON.stringify(p.key)}|${!!p.tempo}|${v}`;
    }
    if (s.kind === 'master') return `M|${!!p.tempo}|${p.master.echo.sync}`;
    return `p|${p.end.mode}|${!!p.tempo}|${!!p.region}|${v}|${p.region ? `${p.region.start}-${p.region.end}` : ''}`;
  }

  function render(force = false) {
    const key = structuralKey();
    if (!force && key === shownKey) {
      for (const fn of syncers) fn();
      return;
    }
    const prevId = shownKey.split('|').slice(0, 2).join('|');
    shownKey = key;
    syncers = [];
    const s = state.selection;
    let content;
    if (s.kind === 'track') {
      const t = findTrack(state.project, s.trackId);
      content = t ? trackPanel(t) : projectPanel();
    } else if (s.kind === 'element' && s.elementIds.length === 1) {
      const f = findElement(state.project, s.elementIds[0]);
      content = f ? elementPanel(f.track, f.el) : projectPanel();
    } else if (s.kind === 'element') {
      content = [
        head(`${s.elementIds.length} elementos`, 'selección múltiple'),
        section(null,
          h('div', { class: 'ins-actions' },
            h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.duplicateSelection() }, 'Duplicar'),
            h('button', { type: 'button', class: 'btn btn--quiet btn--danger', onclick: () => actions.deleteSelection() }, 'Borrar'))),
      ];
    } else if (s.kind === 'master') content = masterPanel();
    else content = projectPanel();
    const scrollTop = root.scrollTop;
    root.textContent = '';
    root.append(...content.filter(Boolean));
    if (key.split('|').slice(0, 2).join('|') === prevId) root.scrollTop = scrollTop;
  }

  return { render };
}
