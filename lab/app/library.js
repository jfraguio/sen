/**
 * Biblioteca: familias e instrumentos (arrastrar a la línea de tiempo, clic
 * para añadir en el cabezal, ▶ para escuchar 3 s) y plantillas de canciones.
 * Cada sección se puede plegar para recorrer el panel con comodidad.
 */

import { h } from './util.js';
import { FAMILIES, INSTRUMENTS } from '../engine/schema.js';

/** Opción para empezar un tema desde cero. */
export const BLANK_TEMPLATE = { blank: true, name: 'Vacío', title: '3 min, Do mayor, sin pistas.' };

/** Nombre visible de una pista publicada como plantilla: «Bosque - 01». */
export function templateName(ambientName, track) {
  return `${ambientName} - ${String(track).padStart(2, '0')}`;
}

/**
 * Opciones para empezar: el tema vacío y una plantilla por cada canción
 * publicada, con el nombre «Ambiente - NN» y el título de la escena.
 */
export function startTemplates(catalog) {
  return [
    BLANK_TEMPLATE,
    ...catalog.flatMap((amb) => amb.tracks.map((t) => ({
      ambient: amb.id,
      track: t.track,
      name: templateName(amb.name, t.track),
      title: t.title,
    }))),
  ];
}

/** Sección plegable: devuelve el `<details>` y el contenedor de su contenido. */
function fold(title) {
  const body = h('div', { class: 'lib-group__body' });
  const el = h('details', { class: 'lib-group', open: true },
    h('summary', { class: 'lib-group__title' }, title),
    body);
  return { el, body };
}

export function createLibrary(root, store, actions) {
  const groups = FAMILIES.map((fam) => {
    const items = Object.entries(INSTRUMENTS).filter(([, v]) => v.family === fam.id && !v.hidden).map(([id, inst]) => {
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
    if (!items.length) return null;
    const g = fold(fam.label);
    g.body.append(...items);
    return g.el;
  }).filter(Boolean);
  const templates = fold('Plantillas');
  templates.body.append(h('p', { class: 'help' }, 'Cargando las canciones de sen…'));
  const close = h('div', { class: 'ins-head' }, h('h2', {}, 'Añadir'), h('button', { type: 'button', class: 'icon-btn ins-close', 'aria-label': 'Cerrar la biblioteca', onclick: () => actions.closeSheet() }, '×'));
  root.append(close, ...groups, templates.el);
  return {
    focus() {
      const target = root.querySelector('details[open] .lib-add')
        || root.querySelector('details[open] summary')
        || root.querySelector('summary');
      target?.focus();
    },
    /** Sustituye la lista de plantillas por las canciones publicadas de sen. */
    setTemplates(list) {
      templates.body.textContent = '';
      templates.body.append(...list.map((t) => h('button', {
        type: 'button',
        class: 'lib-template',
        title: t.title,
        onclick: () => actions.loadTemplate(t),
      }, t.name, h('small', {}, t.title))));
    },
  };
}
