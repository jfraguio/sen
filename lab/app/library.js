/**
 * Biblioteca: instrumentos agrupados por gesto y timbre, sonidos de las
 * canciones de sen y plantillas. Cada sección se puede plegar.
 */

import { h } from './util.js';
import { INSTRUMENTS, INSTRUMENT_GROUPS } from '../engine/schema.js';

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

/** Sección plegable. `cls` distingue los grupos principales de los timbres. */
function fold(title, cls = 'lib-group', open = false) {
  const sub = cls === 'lib-subgroup';
  const body = h('div', { class: sub ? 'lib-subgroup__body' : 'lib-group__body' });
  const el = h('details', { class: cls, open },
    h('summary', { class: sub ? 'lib-subgroup__title' : 'lib-group__title' }, title),
    body);
  return { el, body };
}

export function createLibrary(root, store, actions) {
  const item = (id, inst) => {
    const el = h('div', { class: 'lib-item', draggable: 'true', style: { '--c': inst.color }, title: inst.description },
      h('button', { type: 'button', class: 'lib-play', 'aria-label': `Escuchar ${inst.label}`, title: 'Escuchar 3 s', onclick: () => actions.auditionInstrument(id) }, '▶'),
      h('button', { type: 'button', class: 'lib-add', 'aria-label': `Añadir ${inst.label} en el cabezal`, onclick: () => actions.addTrack(id, store.state.playhead) },
        h('span', { class: 'dot', 'aria-hidden': 'true' }), inst.label));
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/x-sen-instrument', id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    return el;
  };

  const groups = INSTRUMENT_GROUPS.map((group) => {
    const main = fold(group.label);
    for (const sub of group.subgroups) {
      const list = sub.instruments
        .map((id) => [id, INSTRUMENTS[id]])
        .filter(([, inst]) => inst && !inst.hidden);
      if (!list.length) continue;
      const section = fold(sub.label, 'lib-subgroup');
      section.body.append(...list.map(([id, inst]) => item(id, inst)));
      main.body.append(section.el);
    }
    return main.body.children.length ? main.el : null;
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
