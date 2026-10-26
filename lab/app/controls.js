/**
 * Controles del inspector: deslizadores con valor numérico, selectores,
 * interruptores, pares de valores, editor de notas con mini teclado, editor
 * de curvas y mini piano roll para frases.
 *
 * Cada control recibe un `binding` `{ get(), set(value, { gesture }), done() }`
 * y registra una función de sincronización en `syncers` para reflejar
 * cambios externos (deshacer, arrastres) sin reconstruirse.
 */

import { h, fmtNum, clampNum } from './util.js';
import { CURVE_PRESETS, curvePoints } from '../engine/schema.js';
import { LATIN_NAMES, NOTE_NAMES, midiToNote, noteLabel, noteToMidi, scaleMidis } from '../engine/music.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;
let gestureSeq = 0;
const newGesture = () => `g${++gestureSeq}`;

function roundTo(v, def) {
  if (def.step) {
    const r = Math.round(v / def.step) * def.step;
    return Number(r.toFixed(6));
  }
  if (v === 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2);
  return Number((Math.round(v / mag) * mag).toFixed(6));
}

/** Deslizador + campo numérico. */
export function numberControl(def, binding, syncers) {
  const id = nextId('n');
  const log = !!def.log && def.min > 0;
  const toPos = (v) => (log ? (1000 * Math.log(v / def.min)) / Math.log(def.max / def.min) : v);
  const fromPos = (p) => (log ? def.min * Math.pow(def.max / def.min, p / 1000) : p);
  const range = h('input', {
    type: 'range',
    id,
    min: log ? 0 : def.min,
    max: log ? 1000 : def.max,
    step: log ? 1 : def.step || (def.max - def.min) / 1000,
    'aria-label': def.label,
  });
  const num = h('input', { type: 'number', min: def.min, max: def.max, step: def.step || 'any', 'aria-label': `${def.label} (valor)` });
  let gesture = null;
  let dragging = false;
  const show = (v) => {
    range.value = String(toPos(v));
    num.value = String(roundTo(v, def));
  };
  const apply = (v, opts = {}) => {
    const c = clampNum(roundTo(v, def), def.min, def.max);
    show(c);
    binding.set(c, opts);
  };
  range.addEventListener('pointerdown', () => {
    dragging = true;
    gesture = newGesture();
  });
  range.addEventListener('input', () => {
    if (!gesture) gesture = newGesture();
    apply(fromPos(Number(range.value)), { gesture });
  });
  range.addEventListener('change', () => {
    dragging = false;
    gesture = null;
    binding.done?.();
  });
  range.addEventListener('dblclick', () => apply(def.def));
  range.addEventListener('wheel', (e) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    const cur = binding.get();
    const step = log ? cur * 0.01 : def.step || (def.max - def.min) / 200;
    if (!gesture) gesture = newGesture();
    apply(cur + (e.deltaY < 0 ? step : -step), { gesture });
    clearTimeout(range._t);
    range._t = setTimeout(() => {
      gesture = null;
      binding.done?.();
    }, 400);
  }, { passive: false });
  num.addEventListener('change', () => {
    const v = Number(num.value);
    if (Number.isFinite(v)) apply(v);
    else show(binding.get());
  });
  const label = h('label', { for: id, title: 'Doble clic: valor por defecto', ondblclick: () => apply(def.def) }, def.label, def.unit ? h('span', { class: 'ctl-unit' }, ` · ${def.unit}`) : null);
  const row = h('div', { class: 'ctl' }, label, num, range);
  show(binding.get());
  syncers.push(() => {
    if (dragging || document.activeElement === num) return;
    show(binding.get());
  });
  return row;
}

export function enumControl(def, binding, syncers) {
  const id = nextId('s');
  const sel = h('select', { id }, def.options.map((o) => h('option', { value: String(o.value) }, o.label)));
  sel.value = String(binding.get());
  sel.addEventListener('change', () => {
    const o = def.options.find((x) => String(x.value) === sel.value);
    binding.set(o ? o.value : sel.value, {});
  });
  syncers.push(() => {
    if (document.activeElement !== sel) sel.value = String(binding.get());
  });
  return h('div', { class: 'ctl ctl--row' }, h('label', { for: id }, def.label), sel);
}

export function boolControl(def, binding, syncers) {
  const id = nextId('b');
  const box = h('input', { type: 'checkbox', id });
  box.checked = !!binding.get();
  box.addEventListener('change', () => binding.set(box.checked, {}));
  syncers.push(() => {
    box.checked = !!binding.get();
  });
  return h('div', { class: 'ctl ctl--row' }, h('label', { for: id }, def.label), h('span', { class: 'ctl-value' }, box));
}

export function textControl(label, binding, syncers, { multiline = false, placeholder = '' } = {}) {
  const id = nextId('t');
  const input = multiline ? h('textarea', { id, rows: 3, placeholder }) : h('input', { type: 'text', id, placeholder });
  input.value = binding.get() ?? '';
  let gesture = null;
  input.addEventListener('focus', () => {
    gesture = newGesture();
  });
  input.addEventListener('input', () => binding.set(input.value, { gesture }));
  input.addEventListener('blur', () => {
    gesture = null;
    binding.done?.();
  });
  syncers.push(() => {
    if (document.activeElement !== input) input.value = binding.get() ?? '';
  });
  if (multiline) return h('div', { class: 'ctl-block' }, h('label', { for: id, class: 'ctl-label' }, label), input);
  return h('div', { class: 'ctl ctl--row' }, h('label', { for: id }, label), input);
}

/** Par de valores `[a, b]` con campos numéricos. */
export function pairControl(def, binding, syncers) {
  const a = h('input', { type: 'number', min: def.min, max: def.max, step: def.step || 'any', 'aria-label': `${def.label}: mínimo` });
  const b = h('input', { type: 'number', min: def.min, max: def.max, step: def.step || 'any', 'aria-label': `${def.label}: máximo` });
  const show = () => {
    const [x, y] = binding.get();
    a.value = String(roundTo(x, def));
    b.value = String(roundTo(y, def));
  };
  const commit = () => {
    let x = clampNum(Number(a.value), def.min, def.max);
    let y = clampNum(Number(b.value), def.min, def.max);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return show();
    if (x > y) [x, y] = [y, x];
    binding.set([x, y], {});
    show();
  };
  a.addEventListener('change', commit);
  b.addEventListener('change', commit);
  show();
  syncers.push(() => {
    if (document.activeElement !== a && document.activeElement !== b) show();
  });
  return h('div', { class: 'ctl ctl--pair' }, h('span', { class: 'ctl-label' }, def.label, def.unit ? h('span', { class: 'ctl-unit' }, ` · ${def.unit}`) : null), a, b);
}

/** Selector de una nota (para registros `[nota, nota]`). */
export function noteSelect(binding, syncers, notation, label) {
  const sel = h('select', { 'aria-label': label });
  for (let m = 24; m <= 108; m++) sel.append(h('option', { value: midiToNote(m) }, noteLabel(midiToNote(m), notation)));
  sel.value = binding.get();
  sel.addEventListener('change', () => binding.set(sel.value, {}));
  syncers.push(() => {
    if (document.activeElement !== sel) sel.value = binding.get();
  });
  return sel;
}

/* ------------------------------------------------------------ teclado */

/**
 * Mini teclado de dos octavas. `onKey(note)`; `isOn(midi)` marca teclas.
 */
export function keyboard({ octave = 3, onKey, isOn = () => false, notation = 'latin' }) {
  let oct = octave;
  const wrap = h('div', { class: 'kb' });
  const keys = h('div', { class: 'keyboard', role: 'group', 'aria-label': 'Teclado' });
  const label = h('span');
  const render = () => {
    keys.textContent = '';
    const whites = [0, 2, 4, 5, 7, 9, 11];
    const W = 100 / 14;
    let wi = 0;
    for (let o = 0; o < 2; o++) {
      for (let s = 0; s < 12; s++) {
        const midi = (oct + 1 + o) * 12 + s;
        const note = midiToNote(midi);
        const white = whites.includes(s);
        const name = notation === 'latin' ? `${LATIN_NAMES[s]}${oct + o}` : `${NOTE_NAMES[s]}${oct + o}`;
        const key = h('button', {
          type: 'button',
          class: `key ${white ? 'key--white' : 'key--black'}${isOn(midi) ? ' is-on' : ''}`,
          'aria-label': name,
          title: name,
          onclick: () => onKey(note),
        }, white && s === 0 ? h('span', {}, name) : null);
        if (white) {
          key.style.left = `${wi * W}%`;
          key.style.width = `${W}%`;
          wi++;
        } else {
          key.style.left = `${wi * W - W * 0.32}%`;
          key.style.width = `${W * 0.64}%`;
        }
        keys.append(key);
      }
    }
    label.textContent = notation === 'latin' ? `Octavas ${oct} y ${oct + 1}` : `Octaves ${oct}–${oct + 1}`;
  };
  const nav = h('div', { class: 'oct' },
    h('button', { type: 'button', class: 'icon-btn icon-btn--small', 'aria-label': 'Octava más grave', onclick: () => { oct = Math.max(0, oct - 1); render(); } }, '‹'),
    label,
    h('button', { type: 'button', class: 'icon-btn icon-btn--small', 'aria-label': 'Octava más aguda', onclick: () => { oct = Math.min(7, oct + 1); render(); } }, '›'));
  wrap.append(nav, keys);
  render();
  wrap.refresh = render;
  return wrap;
}

/* ------------------------------------------------------------ notas */

/**
 * Lista de notas (máximo `max`) con chips, teclado y frecuencia libre.
 * Pulsar una tecla añade la nota o sustituye la seleccionada.
 */
export function notesEditor({ binding, syncers, notation, max = 8, audition, octave = 3 }) {
  let active = -1;
  const chips = h('div', { class: 'notes' });
  const hz = h('input', { type: 'number', min: 8, max: 16000, step: 0.1, placeholder: 'Hz', 'aria-label': 'Frecuencia libre en Hz', style: { width: '90px' } });
  const kb = keyboard({
    octave,
    notation,
    isOn: (m) => binding.get().some((n) => noteToMidi(n) === m),
    onKey: (note) => {
      const list = [...binding.get()];
      if (active >= 0 && active < list.length) list[active] = note;
      else if (list.some((n) => n === note)) {
        audition?.(note);
        return;
      } else if (list.length < max) list.push(note);
      else list[list.length - 1] = note;
      binding.set(list, {});
      audition?.(note);
      render();
    },
  });
  const render = () => {
    chips.textContent = '';
    const list = binding.get();
    list.forEach((n, k) => {
      chips.append(h('span', { class: `note-chip${k === active ? ' is-active' : ''}` },
        h('button', { type: 'button', 'aria-pressed': String(k === active), title: 'Selecciona para sustituirla con el teclado', onclick: () => { active = active === k ? -1 : k; render(); } }, noteLabel(n, notation)),
        list.length > 1 ? h('button', { type: 'button', 'aria-label': `Quitar ${noteLabel(n, notation)}`, onclick: () => { const l = [...binding.get()]; l.splice(k, 1); active = -1; binding.set(l, {}); render(); } }, '×') : null));
    });
    kb.refresh();
  };
  const addHz = h('button', {
    type: 'button',
    class: 'btn btn--quiet',
    onclick: () => {
      const v = Number(hz.value);
      if (!Number.isFinite(v) || v < 8 || v > 16000) return;
      const list = [...binding.get()];
      const note = { hz: Math.round(v * 100) / 100 };
      if (active >= 0) list[active] = note;
      else if (list.length < max) list.push(note);
      binding.set(list, {});
      hz.value = '';
      render();
    },
  }, 'Añadir Hz');
  syncers.push(render);
  render();
  return h('div', { class: 'notes-editor' }, chips, kb, h('div', { class: 'ins-actions' }, hz, addHz),
    h('p', { class: 'help' }, `Hasta ${max} notas. Pulsa una nota para sustituirla con el teclado.`));
}

/* ------------------------------------------------------------ curvas */

export function curveEditor({ binding, syncers }) {
  const sel = h('select', { 'aria-label': 'Curva de intensidad' },
    CURVE_PRESETS.map((o) => h('option', { value: o.value }, o.label)), h('option', { value: 'custom' }, 'Personalizada'));
  const waves = h('input', { type: 'number', min: 1, max: 12, step: 1, 'aria-label': 'Número de olas', style: { width: '56px' } });
  const canvas = h('canvas', { class: 'curve-editor', width: 300, height: 70, 'aria-label': 'Editor de curva: clic para añadir puntos, arrastra para moverlos, doble clic para quitarlos' });
  let gesture = null;
  let drag = -1;
  const presetOf = (c) => (typeof c === 'string' ? (c.startsWith('olas') ? 'olas' : c) : 'custom');
  const draw = () => {
    const c = binding.get();
    sel.value = presetOf(c);
    waves.hidden = sel.value !== 'olas';
    if (typeof c === 'string' && c.startsWith('olas')) waves.value = String(Number(c.split(':')[1]) || 3);
    const pts = curvePoints(c);
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#2a3045';
    ctx.beginPath();
    ctx.moveTo(0, H - 1);
    ctx.lineTo(W, H - 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 3) {
      const u = x / W;
      let y = pts[0][1];
      for (let k = 1; k < pts.length; k++) {
        if (u <= pts[k][0]) {
          const [x0, y0] = pts[k - 1];
          const [x1, y1] = pts[k];
          const t = x1 > x0 ? (u - x0) / (x1 - x0) : 1;
          y = y0 + (y1 - y0) * t * t * (3 - 2 * t);
          break;
        }
        y = pts[k][1];
      }
      ctx.lineTo(x, H - 4 - y * (H - 8));
    }
    ctx.lineTo(W, H);
    ctx.fillStyle = 'rgba(157,222,216,0.14)';
    ctx.fill();
    ctx.strokeStyle = '#9dded8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#9dded8';
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x * W, H - 4 - y * (H - 8), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const toPt = (e) => {
    const r = canvas.getBoundingClientRect();
    return [clampNum((e.clientX - r.left) / r.width, 0, 1), clampNum(1 - (e.clientY - r.top - 4) / (r.height - 8), 0, 1)];
  };
  const nearest = (pts, p) => {
    const r = canvas.getBoundingClientRect();
    let best = -1;
    let bd = 12;
    pts.forEach(([x, y], k) => {
      const d = Math.hypot((x - p[0]) * r.width, (y - p[1]) * (r.height - 8));
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    return best;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const pts = curvePoints(binding.get()).map((p) => [...p]);
    const p = toPt(e);
    let k = nearest(pts, p);
    gesture = newGesture();
    if (k < 0) {
      pts.push(p);
      pts.sort((a, b) => a[0] - b[0]);
      k = pts.findIndex((q) => q === p);
      binding.set(pts.map((q) => q.map((v) => Math.round(v * 1000) / 1000)), { gesture });
    }
    drag = k;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const pts = curvePoints(binding.get()).map((p) => [...p]);
    const p = toPt(e);
    const lo = drag > 0 ? pts[drag - 1][0] : 0;
    const hi = drag < pts.length - 1 ? pts[drag + 1][0] : 1;
    pts[drag] = [clampNum(p[0], lo, hi), p[1]];
    binding.set(pts.map((q) => q.map((v) => Math.round(v * 1000) / 1000)), { gesture });
  });
  const end = () => {
    if (drag >= 0) binding.done?.();
    drag = -1;
    gesture = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', (e) => {
    const pts = curvePoints(binding.get()).map((p) => [...p]);
    const k = nearest(pts, toPt(e));
    if (k >= 0 && pts.length > 2) {
      pts.splice(k, 1);
      binding.set(pts, {});
    }
  });
  sel.addEventListener('change', () => {
    if (sel.value === 'custom') binding.set(curvePoints(binding.get()), {});
    else if (sel.value === 'olas') binding.set(`olas:${Number(waves.value) || 3}`, {});
    else binding.set(sel.value, {});
  });
  waves.addEventListener('change', () => binding.set(`olas:${clampNum(Math.round(Number(waves.value)) || 3, 1, 12)}`, {}));
  syncers.push(draw);
  requestAnimationFrame(draw);
  return h('div', { class: 'curve' },
    h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, 'Curva de intensidad'), h('span', { class: 'ctl-value' }, sel, ' ', waves)),
    canvas);
}

/* ------------------------------------------------------------ frase */

/** Mini piano roll: clic en una celda vacía añade una nota; en una nota, la quita. */
export function phraseEditor({ binding, syncers, project, notation, audition }) {
  let base = 4;
  let vel = 0.6;
  const canvas = h('canvas', { class: 'roll', width: 300, height: 150, 'aria-label': 'Frase: clic para añadir o quitar notas' });
  const key = project.key;
  const pitches = () => scaleMidis(key.root, key.scale, (base + 1) * 12, (base + 3) * 12);
  const step = () => (project.tempo ? 60 / project.tempo.bpm / 2 : 0.25);
  const draw = () => {
    const { pattern, events } = binding.get();
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const ps = pitches();
    const rowH = H / ps.length;
    ctx.clearRect(0, 0, W, H);
    ps.forEach((m, k) => {
      const y = H - (k + 1) * rowH;
      ctx.fillStyle = m % 12 === noteToMidi(`${key.root}0`) % 12 ? '#161c2b' : '#0f1320';
      ctx.fillRect(0, y, W, rowH - 1);
    });
    const st = step();
    for (let t = 0; t <= pattern + 1e-6; t += st) {
      const x = (t / pattern) * W;
      ctx.fillStyle = Math.abs(t - Math.round(t)) < 1e-6 ? '#2a3045' : '#1a1f30';
      ctx.fillRect(x, 0, 1, H);
    }
    for (const ev of events) {
      const m = noteToMidi(ev.note);
      const k = ps.indexOf(m);
      if (k < 0) continue;
      const x = (ev.t / pattern) * W;
      const y = H - (k + 1) * rowH;
      ctx.fillStyle = `rgba(255, 208, 138, ${0.35 + 0.65 * ev.v})`;
      ctx.fillRect(x + 1, y + 1, Math.max(6, (st / pattern) * W - 2), rowH - 3);
    }
  };
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const { pattern, events } = binding.get();
    const ps = pitches();
    const st = step();
    const t = clampNum(Math.floor((((e.clientX - r.left) / r.width) * pattern) / st + 1e-6) * st, 0, pattern - st / 2);
    const k = clampNum(Math.floor(((r.bottom - e.clientY) / r.height) * ps.length), 0, ps.length - 1);
    const note = midiToNote(ps[k]);
    const hit = events.findIndex((ev) => noteToMidi(ev.note) === ps[k] && Math.abs(ev.t - t) < st / 2);
    const list = events.map((ev) => ({ ...ev }));
    if (hit >= 0) list.splice(hit, 1);
    else {
      list.push({ t: Number(t.toFixed(4)), note, v: vel });
      list.sort((a, b) => a.t - b.t);
      audition?.(note);
    }
    binding.set({ events: list }, {});
    draw();
  });
  const octSel = h('select', { 'aria-label': 'Octava inferior del piano roll' }, [1, 2, 3, 4, 5, 6].map((o) => h('option', { value: String(o) }, notation === 'latin' ? `Octavas ${o}–${o + 1}` : `Octaves ${o}–${o + 1}`)));
  octSel.value = String(base);
  octSel.addEventListener('change', () => {
    base = Number(octSel.value);
    draw();
  });
  const velIn = h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: String(vel), 'aria-label': 'Velocidad de las notas nuevas' });
  velIn.addEventListener('input', () => {
    vel = Number(velIn.value);
  });
  syncers.push(draw);
  requestAnimationFrame(draw);
  return h('div', { class: 'phrase' },
    h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, 'Registro'), octSel),
    canvas,
    h('div', { class: 'ctl ctl--row' }, h('span', { class: 'ctl-label' }, 'Velocidad de las notas nuevas'), h('span', { class: 'ctl-value' }, velIn)),
    h('p', { class: 'help' }, `Notas de la escala del tema. Rejilla de ${fmtNum(step(), 0.01)} s.`));
}

/* ------------------------------------------------------------ automatización */

/**
 * Editor de automatización a lo largo de todo el tema: clic añade un punto,
 * arrastrar lo mueve, doble clic lo quita. `binding.get()` devuelve la lista
 * `[[s, valor], …]` (vacía si no hay automatización).
 */
export function automationEditor({ binding, syncers, def, duration, base }) {
  const canvas = h('canvas', { class: 'curve-editor', width: 300, height: 90, 'aria-label': `Automatización de ${def.label}: clic para añadir puntos, arrastra para moverlos, doble clic para quitarlos` });
  const readout = h('span', { class: 'ctl-unit' });
  const toY = (v) => (def.log ? Math.log(v / def.min) / Math.log(def.max / def.min) : (v - def.min) / (def.max - def.min));
  const fromY = (u) => (def.log ? def.min * Math.pow(def.max / def.min, u) : def.min + u * (def.max - def.min));
  const fmt = (v) => `${fmtNum(v, def.step || (def.log ? 1 : 0.01))}${def.unit ? ` ${def.unit}` : ''}`;
  let drag = -1;
  let gesture = null;
  const draw = () => {
    const pts = binding.get();
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const py = (v) => H - 5 - clampNum(toY(v), 0, 1) * (H - 10);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#2a3045';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, py(base()));
    ctx.lineTo(W, py(base()));
    ctx.stroke();
    ctx.setLineDash([]);
    if (pts.length) {
      ctx.strokeStyle = '#ffd08a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, py(pts[0][1]));
      for (const [t, v] of pts) ctx.lineTo((t / duration()) * W, py(v));
      ctx.lineTo(W, py(pts[pts.length - 1][1]));
      ctx.stroke();
      ctx.fillStyle = '#ffd08a';
      for (const [t, v] of pts) {
        ctx.beginPath();
        ctx.arc((t / duration()) * W, py(v), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    readout.textContent = pts.length ? ` · ${pts.length} puntos` : ' · sin automatización (valor fijo)';
  };
  const toPt = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = clampNum((e.clientX - r.left) / r.width, 0, 1) * duration();
    const u = clampNum(1 - (e.clientY - r.top - 5) / (r.height - 10), 0, 1);
    return [Math.round(t * 100) / 100, Number(fromY(u).toFixed(def.log ? 0 : 3))];
  };
  const nearest = (pts, e) => {
    const r = canvas.getBoundingClientRect();
    let best = -1;
    let bd = 10;
    pts.forEach(([t, v], k) => {
      const x = r.left + (t / duration()) * r.width;
      const y = r.top + 5 + (1 - clampNum(toY(v), 0, 1)) * (r.height - 10);
      const d = Math.hypot(x - e.clientX, y - e.clientY);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    return best;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const pts = binding.get().map((p) => [...p]);
    gesture = `auto${Date.now()}`;
    let k = nearest(pts, e);
    if (k < 0) {
      const p = toPt(e);
      pts.push(p);
      pts.sort((a, b) => a[0] - b[0]);
      k = pts.indexOf(p);
      binding.set(pts, { gesture });
    }
    drag = k;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const pts = binding.get().map((p) => [...p]);
    if (!pts[drag]) return;
    const p = toPt(e);
    const lo = drag > 0 ? pts[drag - 1][0] : 0;
    const hi = drag < pts.length - 1 ? pts[drag + 1][0] : duration();
    pts[drag] = [clampNum(p[0], lo, hi), p[1]];
    readout.textContent = ` · ${fmtShortTime(pts[drag][0])} → ${fmt(pts[drag][1])}`;
    binding.set(pts, { gesture });
  });
  const end = () => {
    if (drag >= 0) binding.done?.();
    drag = -1;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', (e) => {
    const pts = binding.get().map((p) => [...p]);
    const k = nearest(pts, e);
    if (k >= 0) {
      pts.splice(k, 1);
      binding.set(pts, {});
    }
  });
  syncers.push(draw);
  requestAnimationFrame(draw);
  return h('div', { class: 'automation' }, h('div', { class: 'help' }, def.label, readout), canvas);
}

function fmtShortTime(t) {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}
