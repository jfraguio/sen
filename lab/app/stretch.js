/**
 * Estiramiento temporal del tema: cambia la duración y reparte todo el
 * contenido en el nuevo tiempo. No altera las frecuencias ni las velocidades
 * internas de los instrumentos; alarga los sostenidos y separa los puntuales.
 */

import { LIMITS, clampNum } from '../engine/schema.js';

const ms = (value) => Math.round(value * 1000) / 1000;

/** Duración máxima admitida por el modo de final actual. */
export function maxProjectDuration(project) {
  return project?.end?.mode === 'loop' ? LIMITS.maxLoop : LIMITS.maxDuration;
}

/**
 * Escala un proyecto entero para que dure `duration` segundos. Devuelve el
 * mismo objeto modificado.
 */
export function stretchProjectTime(project, duration) {
  const oldDuration = Math.max(0.001, Number(project.duration) || 0);
  const next = ms(clampNum(Number(duration) || oldDuration, LIMITS.minDuration, maxProjectDuration(project)));
  if (Math.abs(next - oldDuration) < 0.001) return project;
  const factor = next / oldDuration;
  project.duration = next;

  for (const track of project.tracks) {
    for (const el of track.elements) {
      el.start = ms(el.start * factor);
      if (el.type === 'hit') continue;
      el.length = ms(Math.max(0.1, el.length * factor));
      if (Array.isArray(el.changes)) {
        for (const change of el.changes) change.t = ms(change.t * factor);
      }
      if (Array.isArray(el.events)) {
        for (const event of el.events) event.t = ms(event.t * factor);
      }
      if (Number.isFinite(el.pattern)) el.pattern = ms(Math.max(0.05, el.pattern * factor));
      if (Number.isFinite(el.crossfade)) el.crossfade = ms(clampNum(el.crossfade * factor, 0, 2));
    }
    if (track.automation) {
      for (const points of Object.values(track.automation)) {
        if (!Array.isArray(points)) continue;
        for (const point of points) {
          if (Array.isArray(point)) point[0] = ms(point[0] * factor);
        }
      }
    }
  }

  if (project.region) {
    const start = ms(clampNum(project.region.start * factor, 0, next));
    project.region.start = start;
    project.region.end = ms(clampNum(project.region.end * factor, start + 0.5, next));
  }
  if (project.end && Number.isFinite(project.end.fadeOut)) {
    project.end.fadeOut = ms(clampNum(project.end.fadeOut * factor, 0, 30));
  }
  return project;
}
