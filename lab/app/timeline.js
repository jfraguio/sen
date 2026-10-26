/**
 * Línea de tiempo: regla con región de escucha, pistas con sus elementos,
 * arrastres (mover, duración, fundidos), selección por marco, creación por
 * doble clic o arrastrando desde la biblioteca, y teclado.
 */

import { h, fmtShort, findElement, elementSpan, instrumentLabel, clampNum, typingTarget } from './util.js';
import { AUTOMATION_DEFS, ELEMENT_TYPES, INSTRUMENTS, LIMITS, curveFunction, newId, projectCounts } from '../engine/schema.js';
import { noteLabel } from '../engine/music.js';
import { planStrikeHits } from '../engine/voices/strike.js';
import { seedFrom } from '../engine/rng.js';
import { fadeCurve } from '../engine/dsp.js';

const HEAD_W = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-w')) || 200;
const MIN_PPS = 0.4;
const MAX_PPS = 240;

export function gridSeconds(view, project) {
  const g = view.grid;
  if (g === 'beat' && project.tempo) return 60 / project.tempo.bpm;
  if (g === 'bar' && project.tempo) return (60 / project.tempo.bpm) * project.tempo.beatsPerBar;
  return typeof g === 'number' ? g : 0;
}

export function elementLabel(track, el, notation) {
  if (el.type === 'tone') return el.notes.map((n) => noteLabel(n, notation)).join(' ');
  if (el.type === 'hit') return noteLabel(el.note, notation);
  if (el.type === 'phrase') return `Frase · ${el.events.length} notas`;
  if (el.type === 'cloud') return `Nube · ${el.density}/min`;
  return `${instrumentLabel(track)} · ${Math.round((el.density ?? 0.6) * 100)} %`;
}

export function createTimeline(root, store, actions) {
  const { state } = store;
  const scroll = h('div', { class: 'tl-scroll' });
  const content = h('div', { class: 'tl-content' });
  const ruler = h('div', { class: 'tl-ruler', role: 'slider', 'aria-label': 'Regla: clic para mover el cabezal, arrastra para marcar la región de escucha', tabindex: '-1' });
  const rulerbar = h('div', { class: 'tl-rulerbar' }, h('div', { class: 'tl-corner' }, 'pistas'), ruler);
  const rows = h('div', { class: 'tl-rows' });
  const addRow = h('div', { class: 'tl-addrow' }, h('div', { class: 'tl-head' },
    h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => actions.focusLibrary() }, '+ pista')), h('div', { class: 'tl-lane' }));
  const masterBtn = h('button', { type: 'button', class: 'tl-name', onclick: () => store.select({ kind: 'master' }) }, 'Maestro', h('small', {}, 'reverb · eco · eq · techo'));
  const masterRow = h('div', { class: 'tl-masterrow' }, h('div', { class: 'tl-head' }, masterBtn), h('div', { class: 'tl-lane' }));
  const playhead = h('div', { class: 'tl-playhead', 'aria-hidden': 'true' });
  const endMark = h('div', { class: 'tl-end', 'aria-hidden': 'true', title: 'Fin del tema' });
  const after = h('div', { class: 'tl-after', 'aria-hidden': 'true' });
  const empty = h('p', { class: 'tl-empty' }, 'Arrastra un instrumento de la biblioteca hasta aquí, o haz clic en él para añadirlo en el cabezal.');
  const marquee = h('div', { class: 'tl-marquee', hidden: true });
  const region = h('div', { class: 'tl-region', hidden: true });
  ruler.append(region);
  content.append(rulerbar, rows, addRow, masterRow, after, endMark, playhead, empty, marquee);
  scroll.append(content);
  root.append(scroll);

  const pps = () => state.view.pps;
  const x = (t) => HEAD_W() + t * pps();
  /** Posición dentro de un carril (el carril ya empieza tras la cabecera). */
  const lx = (t) => t * pps();
  const tAt = (clientX) => (clientX - content.getBoundingClientRect().left - HEAD_W()) / pps();
  const dotsCache = new Map();

  /* ------------------------------------------------------------ dibujo */

  function ticks() {
    ruler.querySelectorAll('.tl-tick').forEach((n) => n.remove());
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const major = steps.find((s) => s * pps() >= 70) || 600;
    const minor = major / (major >= 60 ? 4 : 5);
    const total = state.project.duration + 25;
    const frag = document.createDocumentFragment();
    for (let t = 0; t <= total; t += minor) {
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      frag.append(h('div', { class: `tl-tick${isMajor ? '' : ' tl-tick--minor'}`, style: { left: `${t * pps()}px` } }, isMajor ? fmtShort(t) : ''));
    }
    ruler.append(frag);
  }

  function envPath(el) {
    const n = 40;
    const len = el.length;
    const curve = curveFunction(el.curve);
    let d = 'M0,100';
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * len;
      let g = curve(k / n);
      if (el.fadeIn > 0 && t < el.fadeIn) g *= fadeCurve(t / el.fadeIn);
      if (el.fadeOut > 0 && t > len - el.fadeOut) g *= fadeCurve((len - t) / el.fadeOut);
      d += ` L${(k / n) * 100},${100 - g * 72}`;
    }
    return `${d} L100,100 Z`;
  }

  function dots(track, el) {
    const key = `${state.project.seed}|${track.id}|${track.instrument}|${JSON.stringify(state.project.key)}|${JSON.stringify(el)}`;
    let list = dotsCache.get(key);
    if (!list) {
      const hits = planStrikeHits(track, el, { a4: state.project.tuning.a4, key: state.project.key, elementSeed: seedFrom(state.project.seed, track.id, el.id, el.seed ?? 1) });
      const fs = hits.map((h0) => Math.log2(h0.freq));
      const lo = Math.min(...fs);
      const hi = Math.max(...fs);
      list = hits.slice(0, 600).map((h0, k) => [h0.t / el.length, hi > lo ? (fs[k] - lo) / (hi - lo) : 0.5]);
      if (dotsCache.size > 300) dotsCache.clear();
      dotsCache.set(key, list);
    }
    return list;
  }

  function elementNode(track, el) {
    const span = elementSpan(track, el);
    const sel = state.selection.kind === 'element' && state.selection.elementIds.includes(el.id);
    const label = elementLabel(track, el, state.view.notation);
    const end = el.start + (el.type === 'hit' ? 0 : el.length);
    const node = h('button', {
      type: 'button',
      class: `el el--${el.type}${sel ? ' is-selected' : ''}`,
      dataset: { el: el.id, track: track.id },
      'aria-pressed': String(sel),
      'aria-label': `${track.name}, ${ELEMENT_TYPES[el.type].label.toLowerCase()}: ${label}, ${el.type === 'hit' ? `en ${fmtShort(el.start)}` : `de ${fmtShort(el.start)} a ${fmtShort(end)}`}`,
      style: { left: `${lx(el.start)}px`, width: `${Math.max(el.type === 'hit' ? 10 : 6, span * pps())}px` },
    });
    const wave = actions.overview?.(track, el, span);
    if (wave) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'el-wave');
      svg.setAttribute('viewBox', `0 0 ${wave.length - 1} 100`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      let d = 'M0,50';
      for (let k = 0; k < wave.length; k++) d += ` L${k},${50 - wave[k] * 46}`;
      for (let k = wave.length - 1; k >= 0; k--) d += ` L${k},${50 + wave[k] * 46}`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `${d} Z`);
      svg.append(path);
      node.append(svg);
      node.classList.add('has-wave');
    }
    if (el.type !== 'hit') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'el-env');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', envPath(el));
      svg.append(path);
      node.append(svg);
    }
    node.append(h('span', { class: 'el-label' }, label));
    if (el.type === 'cloud' || el.type === 'phrase') {
      const box = h('span', { class: 'el-dots', 'aria-hidden': 'true' });
      for (const [u, v] of dots(track, el)) box.append(h('i', { style: { left: `${u * 100}%`, bottom: `${v * 85}%` } }));
      node.append(box);
    }
    if (el.type !== 'hit') {
      node.append(h('span', { class: 'el-h el-h--l', dataset: { h: 'l' } }), h('span', { class: 'el-h el-h--r', dataset: { h: 'r' } }));
      node.append(h('span', { class: 'el-f el-f--in', dataset: { h: 'in' }, title: 'Fundido de entrada', style: { left: `${Math.max(5, (el.fadeIn / el.length) * 100)}%` } }));
      node.append(h('span', { class: 'el-f el-f--out', dataset: { h: 'out' }, title: 'Fundido de salida', style: { left: `${Math.min(95, 100 - (el.fadeOut / el.length) * 100)}%` } }));
    }
    return node;
  }

  function automationOverlay(points, def, duration) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tl-automation');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    const W = Math.max(1, duration * pps());
    svg.setAttribute('viewBox', `0 0 ${W} 100`);
    svg.style.width = `${W}px`;
    const y = (v) => 96 - 92 * (def.log ? Math.log(v / def.min) / Math.log(def.max / def.min) : (v - def.min) / (def.max - def.min));
    let d = `M0,${y(points[0][1])}`;
    for (const [t, v] of points) d += ` L${t * pps()},${y(v)}`;
    d += ` L${W},${y(points[points.length - 1][1])}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
    return svg;
  }

  function render() {
    const p = state.project;
    const width = HEAD_W() + (p.duration + 25) * pps();
    content.style.width = `${width}px`;
    ticks();
    rows.textContent = '';
    const frag = document.createDocumentFragment();
    for (const track of p.tracks) {
      const selected = state.selection.kind === 'track' && state.selection.trackId === track.id;
      const lane = h('div', { class: 'tl-lane', dataset: { track: track.id } });
      const autoKey = track.automation && AUTOMATION_DEFS.map((d) => d.key).find((k) => track.automation[k]?.length);
      if (autoKey) lane.append(automationOverlay(track.automation[autoKey], AUTOMATION_DEFS.find((d) => d.key === autoKey), p.duration));
      for (const el of track.elements) {
        lane.append(elementNode(track, el));
        if (p.end.mode === 'loop') {
          const over = el.start + elementSpan(track, el) - p.duration;
          if (over > 0) lane.append(h('div', { class: 'el-ghost', style: { left: `${lx(0)}px`, width: `${Math.min(p.duration, over) * pps()}px` }, title: 'Parte que se pliega al principio del bucle' }));
        }
      }
      const head = h('div', { class: 'tl-head' },
        h('button', { type: 'button', class: 'tl-name', onclick: () => store.select({ kind: 'track', trackId: track.id }), title: 'Seleccionar pista' },
          track.name, h('small', {}, instrumentLabel(track)), track.automation && Object.keys(track.automation).length ? h('small', { class: 'tl-auto', title: 'Pista con automatización' }, 'A') : null),
        h('div', { class: 'tl-ctrls' },
          h('button', { type: 'button', class: 'tl-ms tl-mute', 'aria-pressed': String(!!track.mix.mute), 'aria-label': `Silenciar ${track.name}`, title: 'Silencio (M)', onclick: () => actions.toggleMix(track.id, 'mute') }, 'M'),
          h('button', { type: 'button', class: 'tl-ms tl-solo', 'aria-pressed': String(!!track.mix.solo), 'aria-label': `Solo de ${track.name}`, title: 'Solo (Mayús+S)', onclick: () => actions.toggleMix(track.id, 'solo') }, 'S'),
          h('span', { class: 'tl-meter', dataset: { meter: track.id } }, h('i'))));
      frag.append(h('div', { class: `tl-row${selected ? ' is-selected' : ''}`, dataset: { track: track.id }, style: { '--c': track.color } }, head, lane));
    }
    rows.append(frag);
    masterBtn.closest('.tl-masterrow').classList.toggle('is-selected', state.selection.kind === 'master');
    endMark.style.left = `${x(p.duration)}px`;
    after.style.left = `${x(p.duration)}px`;
    empty.hidden = p.tracks.length > 0;
    renderRegion();
    updatePlayhead(state.playhead);
  }

  function renderRegion() {
    const r = state.project.region;
    region.hidden = !r;
    if (r) {
      region.style.left = `${r.start * pps()}px`;
      region.style.width = `${(r.end - r.start) * pps()}px`;
      region.classList.toggle('is-on', state.regionLoop);
    }
  }

  function updatePlayhead(t, follow = false) {
    playhead.style.left = `${x(t)}px`;
    if (follow) {
      const px = x(t);
      const left = scroll.scrollLeft + HEAD_W();
      const right = scroll.scrollLeft + scroll.clientWidth - 40;
      if (px > right || px < left) scroll.scrollLeft = Math.max(0, px - HEAD_W() - 40);
    }
  }

  function updateMeters(tracks) {
    for (const node of rows.querySelectorAll('[data-meter]')) {
      const v = tracks?.[node.dataset.meter] ?? 0;
      const db = 20 * Math.log10(v + 1e-9);
      node.style.setProperty('--v', `${clampNum((db + 60) / 60, 0, 1) * 100}%`);
    }
  }

  /* ------------------------------------------------------------ ajuste */

  function snap(t, ev, exclude = new Set()) {
    if (!state.view.snap || ev?.shiftKey) return t;
    const tol = 8 / pps();
    let best = null;
    let bd = tol;
    const consider = (c) => {
      const d = Math.abs(c - t);
      if (d < bd) {
        bd = d;
        best = c;
      }
    };
    consider(0);
    consider(state.project.duration);
    consider(state.playhead);
    for (const track of state.project.tracks) {
      for (const el of track.elements) {
        if (exclude.has(el.id)) continue;
        consider(el.start);
        if (el.type !== 'hit') consider(el.start + el.length);
      }
    }
    if (best !== null) return best;
    const g = gridSeconds(state.view, state.project);
    return g > 0 ? Math.round(t / g) * g : Math.round(t * 1000) / 1000;
  }

  /* ------------------------------------------------------------ arrastres */

  let drag = null;
  const round = (v) => Math.round(v * 1000) / 1000;

  rows.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const elNode = e.target.closest('.el');
    const lane = e.target.closest('.tl-lane');
    if (!lane && !elNode) return;
    if (elNode) {
      const id = elNode.dataset.el;
      const sel = state.selection.kind === 'element' ? state.selection.elementIds : [];
      let ids = sel;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        ids = sel.includes(id) ? sel.filter((x0) => x0 !== id) : [...sel, id];
        store.select({ kind: 'element', elementIds: ids });
        return;
      }
      if (!sel.includes(id)) {
        ids = [id];
        store.select({ kind: 'element', elementIds: ids });
      }
      const handle = e.target.dataset.h || null;
      const mode = handle === 'l' ? 'resize-l' : handle === 'r' ? 'resize-r' : handle === 'in' ? 'fade-in' : handle === 'out' ? 'fade-out' : 'move';
      const targets = mode === 'move' ? ids : [id];
      const origin = new Map();
      for (const tid of targets) {
        const f = findElement(state.project, tid);
        if (f) origin.set(tid, { ...f.el });
      }
      drag = { mode, id, ids: targets, origin, startX: e.clientX, moved: false, alt: e.altKey, values: null };
      rows.setPointerCapture(e.pointerId);
      e.preventDefault();
      rows.querySelector(`.el[data-el="${id}"]`)?.focus({ preventScroll: true });
      return;
    }
    // Marco de selección sobre el fondo.
    const r = content.getBoundingClientRect();
    drag = { mode: 'marquee', x0: e.clientX - r.left, y0: e.clientY - r.top, moved: false };
    rows.setPointerCapture(e.pointerId);
  });

  rows.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.mode === 'marquee') {
      const r = content.getBoundingClientRect();
      const x1 = e.clientX - r.left;
      const y1 = e.clientY - r.top;
      if (!drag.moved && Math.hypot(x1 - drag.x0, y1 - drag.y0) < 4) return;
      drag.moved = true;
      const L = Math.min(drag.x0, x1);
      const T = Math.min(drag.y0, y1);
      Object.assign(marquee.style, { left: `${L}px`, top: `${T}px`, width: `${Math.abs(x1 - drag.x0)}px`, height: `${Math.abs(y1 - drag.y0)}px` });
      marquee.hidden = false;
      const box = marquee.getBoundingClientRect();
      const ids = [];
      for (const n of rows.querySelectorAll('.el')) {
        const b = n.getBoundingClientRect();
        const hit = b.right > box.left && b.left < box.right && b.bottom > box.top && b.top < box.bottom;
        n.classList.toggle('is-selected', hit);
        if (hit) ids.push(n.dataset.el);
      }
      drag.ids = ids;
      return;
    }
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 3) return;
    drag.moved = true;
    const dt = dx / pps();
    const o = drag.origin.get(drag.id);
    const dur = state.project.duration;
    const values = new Map();
    if (drag.mode === 'move') {
      let ns = snap(o.start + dt, e, new Set(drag.ids));
      let delta = ns - o.start;
      for (const [, v] of drag.origin) delta = Math.max(delta, -v.start);
      for (const [, v] of drag.origin) delta = Math.min(delta, dur - 0.01 - v.start);
      for (const [id, v] of drag.origin) values.set(id, { start: round(v.start + delta) });
    } else if (drag.mode === 'resize-r') {
      const endT = snap(o.start + o.length + dt, e, new Set([drag.id]));
      const len = round(Math.max(0.1, endT - o.start));
      values.set(drag.id, { length: len, fadeIn: Math.min(o.fadeIn, len), fadeOut: Math.min(o.fadeOut, Math.max(0, len - Math.min(o.fadeIn, len))) });
    } else if (drag.mode === 'resize-l') {
      const endT = o.start + o.length;
      const ns = clampNum(snap(o.start + dt, e, new Set([drag.id])), 0, endT - 0.1);
      const len = round(endT - ns);
      values.set(drag.id, { start: round(ns), length: len, fadeIn: Math.min(o.fadeIn, len), fadeOut: Math.min(o.fadeOut, Math.max(0, len - Math.min(o.fadeIn, len))) });
    } else if (drag.mode === 'fade-in') {
      values.set(drag.id, { fadeIn: round(clampNum(o.fadeIn + dt, 0, o.length - o.fadeOut)) });
    } else if (drag.mode === 'fade-out') {
      values.set(drag.id, { fadeOut: round(clampNum(o.fadeOut - dt, 0, o.length - o.fadeIn)) });
    }
    drag.values = values;
    // Vista previa sin reconstruir.
    for (const [id, v] of values) {
      const n = rows.querySelector(`.el[data-el="${id}"]`);
      if (!n) continue;
      const base = drag.origin.get(id);
      const merged = { ...base, ...v };
      n.classList.add('is-dragging');
      n.style.left = `${lx(merged.start)}px`;
      if (merged.type !== 'hit') n.style.width = `${Math.max(6, merged.length * pps())}px`;
      const fi = n.querySelector('.el-f--in');
      const fo = n.querySelector('.el-f--out');
      if (fi) fi.style.left = `${Math.max(5, (merged.fadeIn / merged.length) * 100)}%`;
      if (fo) fo.style.left = `${Math.min(95, 100 - (merged.fadeOut / merged.length) * 100)}%`;
      const path = n.querySelector('.el-env path');
      if (path) path.setAttribute('d', envPath(merged));
    }
  });

  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.mode === 'marquee') {
      marquee.hidden = true;
      if (d.moved) store.select(d.ids.length ? { kind: 'element', elementIds: d.ids } : { kind: 'project' });
      else if (e.type === 'pointerup') store.select({ kind: 'project' });
      return;
    }
    if (!d.moved) {
      if (state.selection.elementIds.length > 1 && !e.shiftKey) store.select({ kind: 'element', elementIds: [d.id] });
      return;
    }
    if (!d.values || e.type === 'pointercancel') return render();
    const dup = d.alt && d.mode === 'move';
    if (dup && projectCounts(state.project).elements + d.values.size > LIMITS.elements) {
      actions.notify(`No se pueden duplicar: el máximo es ${LIMITS.elements} elementos.`);
      return render();
    }
    const newIds = [];
    store.commit((p) => {
      for (const [id, v] of d.values) {
        const f = findElement(p, id);
        if (!f) continue;
        if (dup) {
          const copy = { ...structuredClone(f.el), ...v, id: newId('e') };
          f.track.elements.push(copy);
          newIds.push(copy.id);
        } else Object.assign(f.el, v);
      }
    });
    if (dup) store.select({ kind: 'element', elementIds: newIds });
  };
  rows.addEventListener('pointerup', endDrag);
  rows.addEventListener('pointercancel', endDrag);

  rows.addEventListener('dblclick', (e) => {
    if (e.target.closest('.el')) return;
    const lane = e.target.closest('.tl-lane');
    if (!lane?.dataset.track) return;
    actions.addElement(lane.dataset.track, snap(tAt(e.clientX), e));
  });

  /* ------------------------------------------------------------ teclado sobre elementos */

  let keyGesture = null;
  rows.addEventListener('keydown', (e) => {
    const n = e.target.closest?.('.el');
    if (!n || typingTarget(e.target)) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const sign = e.key === 'ArrowRight' ? 1 : -1;
    const step = e.shiftKey ? 1 : 0.1;
    const id = n.dataset.el;
    const ids = state.selection.kind === 'element' && state.selection.elementIds.includes(id) ? state.selection.elementIds : [id];
    if (!e.repeat || !keyGesture) keyGesture = `k${Date.now()}`;
    store.commit((p) => {
      for (const eid of ids) {
        const f = findElement(p, eid);
        if (!f) continue;
        if (e.altKey && f.el.type !== 'hit') {
          f.el.length = round(Math.max(0.1, f.el.length + sign * step));
          f.el.fadeIn = Math.min(f.el.fadeIn, f.el.length);
          f.el.fadeOut = Math.min(f.el.fadeOut, f.el.length - f.el.fadeIn);
        } else if (!e.altKey) f.el.start = round(clampNum(f.el.start + sign * step, 0, p.duration - 0.01));
      }
    }, { gesture: keyGesture });
    rows.querySelector(`.el[data-el="${id}"]`)?.focus({ preventScroll: true });
  });
  rows.addEventListener('keyup', () => {
    keyGesture = null;
    store.endGesture();
  });
  rows.addEventListener('focusin', (e) => {
    const n = e.target.closest?.('.el');
    if (!n) return;
    const id = n.dataset.el;
    if (!(state.selection.kind === 'element' && state.selection.elementIds.includes(id))) {
      store.select({ kind: 'element', elementIds: [id] });
      rows.querySelector(`.el[data-el="${id}"]`)?.focus({ preventScroll: true });
    }
  });

  /* ------------------------------------------------------------ regla */

  let rdrag = null;
  ruler.addEventListener('pointerdown', (e) => {
    const t0 = clampNum(tAt(e.clientX), 0, state.project.duration);
    rdrag = { t0, x0: e.clientX, moved: false };
    ruler.setPointerCapture(e.pointerId);
    actions.seek(t0);
  });
  ruler.addEventListener('pointermove', (e) => {
    if (!rdrag) return;
    if (!rdrag.moved && Math.abs(e.clientX - rdrag.x0) < 4) return;
    rdrag.moved = true;
    const t1 = clampNum(snap(tAt(e.clientX), e), 0, state.project.duration);
    const a = Math.min(rdrag.t0, t1);
    const b = Math.max(rdrag.t0, t1);
    rdrag.region = { start: round(a), end: round(b) };
    region.hidden = false;
    region.style.left = `${a * pps()}px`;
    region.style.width = `${(b - a) * pps()}px`;
  });
  const endRuler = () => {
    if (!rdrag) return;
    const d = rdrag;
    rdrag = null;
    if (d.moved && d.region && d.region.end - d.region.start >= 0.5) {
      store.commit((p) => {
        p.region = d.region;
      });
      actions.regionChanged();
    } else renderRegion();
  };
  ruler.addEventListener('pointerup', endRuler);
  ruler.addEventListener('pointercancel', endRuler);

  /* ------------------------------------------------------------ soltar desde la biblioteca */

  content.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('text/x-sen-instrument')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    content.classList.add('is-drop');
  });
  content.addEventListener('dragleave', () => content.classList.remove('is-drop'));
  content.addEventListener('drop', (e) => {
    const inst = e.dataTransfer?.getData('text/x-sen-instrument');
    content.classList.remove('is-drop');
    if (!inst || !INSTRUMENTS[inst]) return;
    e.preventDefault();
    e.stopPropagation();
    actions.addTrack(inst, clampNum(snap(tAt(e.clientX), e), 0, state.project.duration - 1));
  });

  /* ------------------------------------------------------------ zoom */

  function zoom(factor, anchorTime = null) {
    const t = anchorTime ?? (scroll.scrollLeft + scroll.clientWidth / 2 - HEAD_W()) / pps();
    const screenX = x(t) - scroll.scrollLeft;
    const next = clampNum(pps() * factor, MIN_PPS, MAX_PPS);
    store.setView({ pps: next });
    scroll.scrollLeft = Math.max(0, x(t) - screenX);
  }
  scroll.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, tAt(e.clientX));
  }, { passive: false });

  function fit() {
    const w = scroll.clientWidth - HEAD_W() - 40;
    if (w > 100) store.setView({ pps: clampNum(w / (state.project.duration + 5), MIN_PPS, MAX_PPS) });
  }

  return { render, updatePlayhead, updateMeters, zoom, fit, scroll };
}

