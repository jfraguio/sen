/**
 * Estado del editor: proyecto inmutable, selección, vista, deshacer/rehacer.
 *
 * Cada cambio clona el proyecto y guarda el anterior en la pila de deshacer
 * (200 pasos). Los gestos continuos (arrastres, deslizadores) comparten un
 * identificador y cuentan como un solo paso.
 */

const HISTORY = 200;

export function createStore(project) {
  const listeners = new Set();
  const state = {
    project,
    selection: { kind: 'project', trackId: null, elementIds: [] },
    view: { pps: 6, grid: 0.5, snap: true, notation: 'latin' },
    playhead: 0,
    playing: false,
    regionLoop: false,
    revision: 0,
  };
  let undo = [];
  let redo = [];
  let gesture = null;

  const emit = (kind, info) => {
    for (const fn of listeners) fn(kind, state, info);
  };

  function validateSelection() {
    const s = state.selection;
    const p = state.project;
    if (s.kind === 'track' && !p.tracks.some((t) => t.id === s.trackId)) state.selection = { kind: 'project', trackId: null, elementIds: [] };
    if (s.kind === 'element') {
      const ids = s.elementIds.filter((id) => p.tracks.some((t) => t.elements.some((e) => e.id === id)));
      if (!ids.length) state.selection = { kind: 'project', trackId: null, elementIds: [] };
      else if (ids.length !== s.elementIds.length) state.selection = { ...s, elementIds: ids };
    }
  }

  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * Aplica un cambio sobre una copia del proyecto. `mutate` puede devolver
     * `false` para cancelar. `source` identifica quién lo origina (para no
     * repintar el control que lo ha provocado).
     */
    commit(mutate, { gesture: g = null, source = null } = {}) {
      const draft = structuredClone(state.project);
      if (mutate(draft) === false) return false;
      if (!(g && g === gesture)) {
        undo.push(state.project);
        if (undo.length > HISTORY) undo.shift();
      }
      gesture = g;
      redo = [];
      state.project = draft;
      state.revision++;
      validateSelection();
      emit('project', { source });
      return true;
    },
    endGesture() {
      gesture = null;
    },
    load(project) {
      state.project = project;
      undo = [];
      redo = [];
      gesture = null;
      state.revision++;
      state.selection = { kind: 'project', trackId: null, elementIds: [] };
      state.playhead = 0;
      state.regionLoop = false;
      emit('load');
    },
    undo() {
      if (!undo.length) return;
      redo.push(state.project);
      state.project = undo.pop();
      gesture = null;
      state.revision++;
      validateSelection();
      emit('project', { source: 'history' });
    },
    redo() {
      if (!redo.length) return;
      undo.push(state.project);
      state.project = redo.pop();
      gesture = null;
      state.revision++;
      validateSelection();
      emit('project', { source: 'history' });
    },
    get canUndo() {
      return undo.length > 0;
    },
    get canRedo() {
      return redo.length > 0;
    },
    select(selection) {
      state.selection = { kind: 'project', trackId: null, elementIds: [], ...selection };
      emit('selection');
    },
    setView(patch) {
      Object.assign(state.view, patch);
      emit('view');
    },
    set(patch, kind = 'ui') {
      Object.assign(state, patch);
      emit(kind);
    },
  };
}
