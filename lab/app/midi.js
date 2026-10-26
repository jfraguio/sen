/**
 * Importación de MIDI (SMF formato 0 y 1): notas → pistas del laboratorio.
 *
 * - Grupos con notas largas (mediana ≥ 1,2 s) → pista `pad` con un elemento
 *   `tone` por acorde.
 * - El resto → pista `kalimba` con elementos `phrase` de hasta 60 s y 256
 *   notas cada uno.
 * - El canal 10 (percusión) se ignora.
 */

import { LIMITS, createTrack, newId } from '../engine/schema.js';
import { midiToNote } from '../engine/music.js';

export class MidiError extends Error {}

export function isMidi(bytes) {
  return bytes.length > 14 && bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64;
}

/** Lee un archivo SMF. Devuelve `{ tracks: [{ name, notes }], seconds(tick) }`. */
export function parseMidi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const id = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (!isMidi(bytes)) throw new MidiError('No es un archivo MIDI.');
  const hlen = view.getUint32(4);
  const ntrks = view.getUint16(10);
  const division = view.getUint16(12);
  let p = 8 + hlen;
  const tempos = [];
  const tracks = [];
  for (let n = 0; n < ntrks && p + 8 <= bytes.length; n++) {
    if (id(p) !== 'MTrk') throw new MidiError('MIDI dañado: falta una pista.');
    const len = view.getUint32(p + 4);
    let q = p + 8;
    const end = Math.min(bytes.length, q + len);
    let tick = 0;
    let status = 0;
    let name = '';
    const open = new Map();
    const notes = [];
    const vlq = () => {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        const b = bytes[q++];
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return v;
    };
    while (q < end) {
      tick += vlq();
      let b = bytes[q];
      if (b & 0x80) {
        status = b;
        q++;
      } else if (!status) throw new MidiError('MIDI dañado.');
      b = status;
      if (b === 0xff) {
        const type = bytes[q++];
        const l = vlq();
        if (type === 0x03) name = new TextDecoder().decode(bytes.subarray(q, q + l));
        if (type === 0x51 && l === 3) tempos.push({ tick, us: (bytes[q] << 16) | (bytes[q + 1] << 8) | bytes[q + 2] });
        q += l;
        status = 0;
        if (type === 0x2f) break;
      } else if (b === 0xf0 || b === 0xf7) {
        q += vlq();
        status = 0;
      } else {
        const kind = b & 0xf0;
        const ch = b & 0x0f;
        const d1 = bytes[q++];
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[q++];
        const key = ch * 128 + d1;
        if (kind === 0x90 && d2 > 0) {
          if (!open.has(key)) open.set(key, []);
          open.get(key).push({ tick, vel: d2 });
        } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
          const st = open.get(key)?.shift();
          if (st) notes.push({ tick: st.tick, end: tick, midi: d1, vel: st.vel, channel: ch });
        }
      }
    }
    for (const [key, list] of open) for (const st of list) notes.push({ tick: st.tick, end: st.tick + (division & 0x7fff), midi: key % 128, vel: st.vel, channel: Math.floor(key / 128) });
    tracks.push({ name, notes });
    p += 8 + len;
  }
  // Mapa de tempo → segundos.
  let seconds;
  if (division & 0x8000) {
    const fps = 256 - (division >> 8);
    const tpf = division & 0xff;
    seconds = (t) => t / (fps * tpf);
  } else {
    const ppq = division || 480;
    const map = [...tempos].sort((a, b) => a.tick - b.tick);
    if (!map.length || map[0].tick > 0) map.unshift({ tick: 0, us: 500000 });
    const acc = [0];
    for (let k = 1; k < map.length; k++) acc.push(acc[k - 1] + ((map[k].tick - map[k - 1].tick) * map[k - 1].us) / ppq / 1e6);
    seconds = (t) => {
      let k = map.length - 1;
      while (k > 0 && map[k].tick > t) k--;
      return acc[k] + ((t - map[k].tick) * map[k].us) / ppq / 1e6;
    };
  }
  return { tracks, seconds };
}

const round = (v) => Math.round(v * 1000) / 1000;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Convierte un MIDI en pistas nuevas para `project`. Devuelve
 * `{ tracks, duration, warnings }`; no modifica el proyecto.
 */
export function midiToTracks(bytes, project) {
  const midi = parseMidi(bytes);
  const warnings = [];
  const groups = [];
  let drums = 0;
  midi.tracks.forEach((t, ti) => {
    const byCh = new Map();
    for (const n of t.notes) {
      if (n.channel === 9) {
        drums++;
        continue;
      }
      if (!byCh.has(n.channel)) byCh.set(n.channel, []);
      byCh.get(n.channel).push({ t: midi.seconds(n.tick), d: Math.max(0.02, midi.seconds(n.end) - midi.seconds(n.tick)), midi: n.midi, vel: n.vel });
    }
    for (const [ch, notes] of byCh) {
      notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
      groups.push({ name: t.name || `MIDI ${ti + 1}${byCh.size > 1 ? `·${ch + 1}` : ''}`, notes });
    }
  });
  if (drums) warnings.push('Se ha ignorado la percusión (canal 10).');
  if (!groups.length) throw new MidiError('El MIDI no tiene notas.');

  let elements = project.tracks.reduce((s, t) => s + t.elements.length, 0);
  const room = () => LIMITS.elements - elements;
  const tracks = [];
  let lastEnd = 0;
  const fake = { ...project, tracks: [...project.tracks] };
  for (const g of groups) {
    if (project.tracks.length + tracks.length >= LIMITS.tracks) {
      warnings.push('Se ha alcanzado el máximo de pistas; parte del MIDI no se ha importado.');
      break;
    }
    const sustained = median(g.notes.map((n) => n.d)) >= 1.2;
    const track = createTrack(sustained ? 'pad' : 'kalimba', fake);
    track.name = g.name.slice(0, 40);
    fake.tracks.push(track);
    if (sustained) {
      let k = 0;
      while (k < g.notes.length && room() > 0) {
        const chord = [g.notes[k]];
        while (k + chord.length < g.notes.length && g.notes[k + chord.length].t - g.notes[k].t < 0.03) chord.push(g.notes[k + chord.length]);
        k += chord.length;
        const len = Math.max(0.2, ...chord.map((n) => n.d));
        const vel = chord.reduce((s, n) => s + n.vel, 0) / chord.length;
        const picked = [...chord].sort((a, b) => b.vel - a.vel).slice(0, LIMITS.notesPerTone).sort((a, b) => a.midi - b.midi);
        track.elements.push({
          id: newId('e'), type: 'tone', start: round(chord[0].t), length: round(len), level: round(Math.max(-24, 20 * Math.log10(vel / 127))),
          fadeIn: round(Math.min(0.3, len / 4)), fadeOut: round(Math.min(1, len / 3)), notes: [...new Set(picked.map((n) => midiToNote(n.midi)))], curve: 'plana', seed: 1,
        });
        elements++;
        lastEnd = Math.max(lastEnd, chord[0].t + len);
      }
    } else {
      let k = 0;
      while (k < g.notes.length && room() > 0) {
        const t0 = g.notes[k].t;
        const events = [];
        while (k < g.notes.length && g.notes[k].t - t0 < 59.5 && events.length < 256) {
          const n = g.notes[k++];
          events.push({ t: round(n.t - t0), note: midiToNote(n.midi), v: round(n.vel / 127) });
        }
        const span = events[events.length - 1].t;
        const pattern = Math.min(60, Math.max(0.25, Math.ceil((span + 0.25) * 4) / 4));
        track.elements.push({ id: newId('e'), type: 'phrase', start: round(t0), length: pattern, level: 0, fadeIn: 0, fadeOut: 0, pattern, events, curve: 'plana' });
        elements++;
        lastEnd = Math.max(lastEnd, t0 + pattern);
      }
    }
    if (room() <= 0) warnings.push(`Se ha alcanzado el máximo de ${LIMITS.elements} elementos; parte del MIDI no se ha importado.`);
    if (track.elements.length) tracks.push(track);
  }
  const maxDur = project.end?.mode === 'loop' ? LIMITS.maxLoop : LIMITS.maxDuration;
  const duration = Math.min(maxDur, Math.max(project.duration, Math.ceil(lastEnd + 2)));
  if (lastEnd > maxDur) warnings.push('El MIDI es más largo que la duración máxima del tema.');
  return { tracks, duration, warnings: [...new Set(warnings)] };
}
