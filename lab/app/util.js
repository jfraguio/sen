/**
 * Utilidades de la interfaz: DOM, formato, avisos y búsquedas en el proyecto.
 */

import { trackParams, INSTRUMENTS } from '../engine/schema.js';
import { strikeLength } from '../engine/voices/strike.js';
import { noteFrequency } from '../engine/music.js';

/** Crea un elemento: `h('button', { class: 'x', onclick }, 'texto')`. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** `mm:ss,d` */
export function fmtTime(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0').replace('.', ',')}`;
}

/** `m:ss` corto para la regla. */
export function fmtShort(t) {
  const m = Math.floor(t / 60);
  const s = Math.round(t - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtNum(v, step = 0.01) {
  if (!Number.isFinite(v)) return '—';
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return v.toFixed(d).replace('.', ',');
}

const live = () => document.getElementById('live');

export function announce(text) {
  const el = live();
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = text;
  });
}

let toastTimer = 0;
export function toast(text, { error = false, ms = 3800 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
  announce(text);
}

export function findTrack(project, id) {
  return project.tracks.find((t) => t.id === id) || null;
}

export function findElement(project, elId) {
  for (const track of project.tracks) {
    const el = track.elements.find((e) => e.id === elId);
    if (el) return { track, el };
  }
  return null;
}

/** Final visual de un elemento (los golpes muestran su cola). */
export function elementSpan(track, el) {
  if (el.type !== 'hit') return el.length;
  const p = trackParams(track);
  return strikeLength(track.instrument, p, noteFrequency(el.note));
}

export function instrumentLabel(track) {
  return INSTRUMENTS[track.instrument]?.label || track.instrument;
}

/** ¿El foco está en un campo de texto? (para los atajos de una letra) */
export function typingTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  if (target.tagName === 'INPUT') return !['range', 'checkbox', 'radio', 'button'].includes(target.type);
  return false;
}

export function clampNum(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export const isCompact = () => window.matchMedia('(max-width: 899px)').matches;
