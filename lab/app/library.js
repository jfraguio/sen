/**
 * Biblioteca: familias e instrumentos (arrastrar a la línea de tiempo, clic
 * para añadir en el cabezal, ▶ para escuchar 3 s) y plantillas.
 */

import { h } from './util.js';
import { FAMILIES, INSTRUMENTS } from '../engine/schema.js';

export const TEMPLATES = [
  { id: 'vacio', name: 'Vacío', desc: '3 min, Do mayor, sin pistas.' },
  { id: 'drone-y-campanas', name: 'Drone y campanas', desc: 'Drone en Re con quinta, nube de campanas y aire.' },
  { id: 'noche-en-el-estanque', name: 'Noche en el estanque', desc: 'Grillos, sapos parteros, gotas y pad grave. Bucle.' },
  { id: 'amanecer', name: 'Amanecer', desc: 'Pad que crece, mirlo, petirrojo, arroyo y kalimba.' },
  { id: 'espacio-profundo', name: 'Espacio profundo', desc: 'Drone subgrave, vidrio, ruido con oleaje y eco largo.' },
];

export function createLibrary(root, store, actions) {
  const groups = FAMILIES.map((fam) => {
    const items = Object.entries(INSTRUMENTS).filter(([, v]) => v.family === fam.id).map(([id, inst]) => {
      const item = h('div', { class: 'lib-item', draggable: 'true', style: { '--c': inst.color }, title: inst.description },
        h('button', { type: 'button', class: 'lib-play', 'aria-label': `Escuchar ${inst.label}`, title: 'Escuchar 3 s', onclick: () => actions.auditionInstrument(id) }, '▶'),
        h('button', { type: 'button', class: 'lib-add', 'aria-label': `Añadir ${inst.label} en el cabezal`, onclick: () => actions.addTrack(id, store.state.playhead) },
          h('span', { class: 'dot', 'aria-hidden': 'true' }), inst.label));
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/x-sen-instrument', id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      return item;
    });
    return h('div', { class: 'lib-group' }, h('h3', {}, fam.label), ...items);
  });
  const templates = h('div', { class: 'lib-group' }, h('h3', {}, 'Plantillas'),
    ...TEMPLATES.map((t) => h('button', { type: 'button', class: 'lib-template', onclick: () => actions.loadTemplate(t.id) }, t.name, h('small', {}, t.desc))));
  const close = h('div', { class: 'ins-head' }, h('h2', {}, 'Añadir'), h('button', { type: 'button', class: 'icon-btn ins-close', 'aria-label': 'Cerrar la biblioteca', onclick: () => actions.closeSheet() }, '×'));
  root.append(close, ...groups, templates);
  return {
    focus() {
      root.querySelector('.lib-add')?.focus();
    },
  };
}
