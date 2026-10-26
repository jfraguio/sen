/**
 * Modo compacto (< 900 px): pistas en vertical, elementos como tarjetas con
 * campos numéricos e inspector como hoja inferior.
 */

import { h, findElement, instrumentLabel, clampNum } from './util.js';
import { ELEMENT_TYPES } from '../engine/schema.js';
import { elementLabel } from './timeline.js';

export function createCompact(root, store, actions) {
  const { state } = store;

  function num(label, value, onChange, { min = 0, max = 1e6, step = 0.1 } = {}) {
    const input = h('input', { type: 'number', min, max, step, value: String(value), 'aria-label': label });
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) onChange(clampNum(v, min, max));
    });
    return h('label', {}, label, input);
  }

  function render() {
    if (!window.matchMedia('(max-width: 899px)').matches) return;
    const p = state.project;
    root.textContent = '';
    root.append(h('div', { class: 'ins-actions', style: { padding: '10px' } },
      h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => { store.select({ kind: 'project' }); actions.openSheet('inspector'); } }, 'Tema'),
      h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => { store.select({ kind: 'master' }); actions.openSheet('inspector'); } }, 'Maestro'),
      h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.openSheet('library') }, '＋ Pista')));
    if (!p.tracks.length) root.append(h('p', { class: 'muted', style: { padding: '0 12px' } }, 'Añade una pista con «＋ Pista».'));
    for (const track of p.tracks) {
      const card = h('div', { class: 'compact-track', style: { '--c': track.color } });
      card.append(h('header', {},
        h('button', { type: 'button', class: 'tl-name', onclick: () => { store.select({ kind: 'track', trackId: track.id }); actions.openSheet('inspector'); } }, track.name, h('small', {}, instrumentLabel(track))),
        h('button', { type: 'button', class: 'tl-ms tl-mute', 'aria-pressed': String(!!track.mix.mute), 'aria-label': `Silenciar ${track.name}`, onclick: () => actions.toggleMix(track.id, 'mute') }, 'M'),
        h('button', { type: 'button', class: 'tl-ms tl-solo', 'aria-pressed': String(!!track.mix.solo), 'aria-label': `Solo de ${track.name}`, onclick: () => actions.toggleMix(track.id, 'solo') }, 'S')));
      for (const el of track.elements) {
        const sel = state.selection.kind === 'element' && state.selection.elementIds.includes(el.id);
        const set = (key) => (v) => store.commit((d) => {
          const f = findElement(d, el.id);
          f.el[key] = v;
          if (f.el.type !== 'hit') {
            f.el.fadeIn = Math.min(f.el.fadeIn, f.el.length);
            f.el.fadeOut = Math.min(f.el.fadeOut, f.el.length - f.el.fadeIn);
          }
        });
        card.append(h('div', { class: `compact-el${sel ? ' is-selected' : ''}` },
          h('button', { type: 'button', onclick: () => { store.select({ kind: 'element', elementIds: [el.id] }); actions.openSheet('inspector'); } },
            h('strong', {}, ELEMENT_TYPES[el.type].label), h('br'), h('small', { class: 'muted' }, elementLabel(track, el, state.view.notation))),
          num('Inicio (s)', el.start, set('start'), { max: p.duration - 0.01 }),
          el.type === 'hit' ? num('Velocidad', el.velocity, set('velocity'), { max: 1, step: 0.05 }) : num('Duración (s)', el.length, set('length'), { min: 0.1, max: 1800 }),
          num('Nivel (dB)', el.level ?? 0, set('level'), { min: -40, max: 6, step: 0.5 })));
      }
      card.append(h('div', { class: 'compact-add' }, h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.addElement(track.id, state.playhead) }, '+ Elemento en el cabezal')));
      root.append(card);
    }
  }

  return { render };
}
