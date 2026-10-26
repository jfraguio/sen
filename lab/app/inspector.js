/**
 * Inspector: controles del tema, de la pista, del elemento o del bus maestro
 * según la selección. Se construye a partir de las definiciones del esquema.
 */

import { h, findTrack, findElement, instrumentLabel, fmtShort } from './util.js';
import {
  AUTOMATION_DEFS, ELEMENT_DEFS, ELEMENT_TYPES, END_MODES, FAMILIES, INSTRUMENTS, LIMITS, MASTER_DEFS, MIX_DEFS, convertElement,
  getPath, paramDefs, setPath, cloneValue,
} from '../engine/schema.js';
import { LATIN_NAMES, NOTE_NAMES, SCALE_LABELS, transposeNote } from '../engine/music.js';
import {
  automationEditor, boolControl, curveEditor, enumControl, noteSelect, notesEditor, numberControl, pairControl, phraseEditor, textControl,
} from './controls.js';
import { elementLabel } from './timeline.js';

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
    const out = [
      head('Tema', 'sin selección: ajustes generales'),
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
        p.end.mode === 'loop' ? h('p', { class: 'help' }, 'El final enlaza con el principio. Lo que sobresale se oye al principio (rayado en la línea de tiempo).') : null,
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
          }, 'Aplicar'))),
        h('p', { class: 'help' }, 'Cambiar la raíz no mueve las notas escritas; las nubes generativas siguen la nueva escala.')),
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
        }, 'Quitar esta automatización')),
        h('p', { class: 'help' }, 'Mientras haya puntos, la automatización sustituye al valor fijo. En bucle se repite en cada vuelta.'));
    };
    draw();
    return box;
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
    const timbre = paramDefs(track.instrument).map((def) => control(def, tb('params', def.key)));
    const mix = MIX_DEFS.map((def) => control(def, tb('mix', def.key)));
    return [
      head(track.name, `${family.label} · ${instrumentLabel(track)}`),
      section(null,
        textControl('Nombre', { get: () => findTrack(state.project, id)?.name ?? '', set: (v, { gesture } = {}) => commit((d) => { findTrack(d, id).name = v || 'Pista'; }, gesture), done }, syncers),
        h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, 'Color'), color),
        enumControl({ label: 'Instrumento', options: sameFamily }, {
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
        h('p', { class: 'help' }, INSTRUMENTS[track.instrument].description),
        h('div', { class: 'ins-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => actions.auditionTrack(id) }, '▶ Escuchar'),
          h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.addElement(id, state.playhead) }, '+ Elemento en el cabezal'))),
      section('Timbre', ...timbre),
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
    const dur = state.project.duration;
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

    const timing = [];
    if (el.type === 'hit') {
      for (const def of ELEMENT_DEFS.hit) timing.push(numberControl({ ...def, max: def.key === 'start' ? dur - 0.01 : def.max }, eb(def.key), syncers));
    } else {
      for (const def of ELEMENT_DEFS.common) {
        const max = def.key === 'start' ? dur - 0.01 : def.key === 'length' ? Math.max(dur, el.length) : def.key.startsWith('fade') ? Math.max(dur, el.length) : def.max;
        timing.push(numberControl({ ...def, max, step: def.key === 'level' ? 0.5 : 0.01 }, eb(def.key), syncers));
      }
    }
    blocks.push(section('Tiempo y nivel', ...timing));

    if (el.type === 'tone') {
      blocks.push(section('Notas', notesEditor({ binding: { get: () => findElement(state.project, id)?.el.notes || [], set: (v) => commit((d) => { findElement(d, id).el.notes = v; }) }, syncers, notation, max: LIMITS.notesPerTone, audition, octave: 3 })));
    } else if (el.type === 'hit') {
      blocks.push(section('Nota', notesEditor({ binding: { get: () => [findElement(state.project, id)?.el.note].filter(Boolean), set: (v) => commit((d) => { findElement(d, id).el.note = v[v.length - 1]; }) }, syncers, notation, max: 1, audition, octave: 4 })));
    } else if (el.type === 'phrase') {
      blocks.push(section('Frase',
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
      const useOwn = !!el.pitches;
      blocks.push(section('Nube generativa',
        ...ELEMENT_DEFS.cloud.map((def) => (def.type === 'range' ? pairControl(def, eb(def.key), syncers) : numberControl(def, eb(def.key), syncers))),
        h('div', { class: 'ctl ctl--pair' }, h('span', { class: 'ctl-label' }, 'Registro'),
          noteSelect({ get: () => findElement(state.project, id)?.el.range[0], set: (v) => commit((d) => { findElement(d, id).el.range[0] = v; }) }, syncers, notation, 'Nota más grave'),
          noteSelect({ get: () => findElement(state.project, id)?.el.range[1], set: (v) => commit((d) => { findElement(d, id).el.range[1] = v; }) }, syncers, notation, 'Nota más aguda')),
        boolControl({ label: 'Usar notas propias (en vez de la escala)' }, {
          get: () => !!findElement(state.project, id)?.el.pitches,
          set: (v) => commit((d) => { const e = findElement(d, id).el; e.pitches = v ? [...e.range] : null; }),
        }, syncers),
        useOwn ? notesEditor({ binding: { get: () => findElement(state.project, id)?.el.pitches || [], set: (v) => commit((d) => { findElement(d, id).el.pitches = v; }) }, syncers, notation, max: 24, audition, octave: 4 }) : null,
        seedRow(id)));
    } else if (el.type === 'span') {
      blocks.push(section(track.family === 'nature' ? 'Actividad' : 'Tramo',
        ...ELEMENT_DEFS.span.map((def) => numberControl(def, eb(def.key), syncers)),
        seedRow(id)));
    }
    if (el.type !== 'hit') blocks.push(section(null, curveEditor({ binding: { get: () => findElement(state.project, id)?.el.curve ?? 'plana', set: (v, { gesture } = {}) => commit((d) => { findElement(d, id).el.curve = v; }, gesture), done }, syncers })));

    const solo = h('button', { type: 'button', class: 'btn', title: 'Mantén pulsado para escuchar solo este elemento' }, '◉ Escuchar solo esto');
    const on = (e) => {
      e.preventDefault();
      actions.soloElement(id, true);
    };
    const off = () => actions.soloElement(id, false);
    solo.addEventListener('pointerdown', on);
    solo.addEventListener('pointerup', off);
    solo.addEventListener('pointerleave', off);
    solo.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') on(e); });
    solo.addEventListener('keyup', off);

    return [
      head(ELEMENT_TYPES[el.type].label, `${track.name} · ${elementLabel(track, el, notation)}`),
      typeSel ? section(null, typeSel) : null,
      ...blocks,
      section(null, h('div', { class: 'ins-actions' },
        solo,
        h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.duplicateSelection() }, 'Duplicar'),
        h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.splitAtPlayhead() }, 'Dividir en el cabezal'),
        h('button', { type: 'button', class: 'btn btn--quiet btn--danger', onclick: () => actions.deleteSelection() }, 'Borrar'))),
    ];
  }

  function seedRow(id) {
    const out = h('span', { class: 'ctl-value' });
    const sync = () => {
      out.textContent = `semilla ${findElement(state.project, id)?.el.seed ?? 1}`;
    };
    syncers.push(sync);
    sync();
    return h('div', { class: 'ctl ctl--row' }, out, h('button', {
      type: 'button',
      class: 'btn btn--quiet',
      onclick: () => commit((d) => { const e = findElement(d, id).el; e.seed = ((e.seed ?? 1) % 999999) + 1; }),
    }, '⟳ Aleatorizar'));
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
      head('Bus maestro', 'reverb y eco globales, ecualización y limitador'),
      ...[...groups.entries()].map(([g, list]) => section(g || 'Salida', ...list)),
      section(null, h('p', { class: 'help' }, 'Cada pista envía a la reverb y al eco con sus propios niveles (sección «Mezcla» de la pista).')),
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
        section(null, h('p', { class: 'help' }, 'Arrástralos juntos en la línea de tiempo o muévelos con ← y → (Mayús: 1 s).'),
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
