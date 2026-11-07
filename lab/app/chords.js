/**
 * Nombres de acordes y lectura de notas escritas a mano.
 *
 * El nombre se calcula por clases de altura, no por orden de las notas, para
 * que una inversión siga llamándose igual: Do3 Mi3 Sol3 y Mi3 Sol3 Do4 son
 * «Do mayor». La nota más grave solo decide cuando dos acordes encajan.
 */

import { LATIN_NAMES, NOTE_NAMES, midiToNote, noteLabel, noteToMidi } from '../engine/music.js';

const LATIN_INDEX = new Map(LATIN_NAMES.map((name, k) => [name.toLowerCase(), k]));
const NOTE_INDEX = new Map(NOTE_NAMES.map((name, k) => [name.toLowerCase(), k]));

/** Plantillas habituales, de más notas a menos para reconocer los acordes ricos. */
const CHORD_TEMPLATES = [
  { suffix: '7', quality: 'séptima', intervals: [0, 4, 7, 10] },
  { suffix: 'maj7', quality: 'séptima mayor', intervals: [0, 4, 7, 11] },
  { suffix: 'm7', quality: 'menor séptima', intervals: [0, 3, 7, 10] },
  { suffix: 'm7b5', quality: 'menor séptima bemol cinco', intervals: [0, 3, 6, 10] },
  { suffix: 'º7', quality: 'disminuido séptima', intervals: [0, 3, 6, 9] },
  { suffix: '6', quality: 'sexta', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', quality: 'menor sexta', intervals: [0, 3, 7, 9] },
  { suffix: '7sus4', quality: 'séptima suspendida', intervals: [0, 5, 7, 10] },
  { suffix: 'add9', quality: 'novena añadida', intervals: [0, 2, 4, 7] },
  { suffix: '', quality: 'mayor', intervals: [0, 4, 7] },
  { suffix: 'm', quality: 'menor', intervals: [0, 3, 7] },
  { suffix: 'º', quality: 'disminuido', intervals: [0, 3, 6] },
  { suffix: '+', quality: 'aumentado', intervals: [0, 4, 8] },
  { suffix: 'sus2', quality: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'sus4', quality: 'sus4', intervals: [0, 5, 7] },
  { suffix: '5', quality: 'quinta', intervals: [0, 7] },
];

const pcOf = (midi) => ((Math.round(midi) % 12) + 12) % 12;

/** «Do», «Fa#», «C», «Bb»… sin octava. */
export function pitchClassLabel(pc, notation = 'latin') {
  return noteLabel(midiToNote(60 + ((pc % 12) + 12) % 12), notation).replace(/-?\d+$/, '');
}

/** MIDI aproximado de una nota escrita (`Do4`) o de una frecuencia libre. */
export function noteToMidiLoose(note, a4 = 440) {
  if (typeof note === 'string') return noteToMidi(note);
  if (note && Number.isFinite(note.hz)) return Math.round(69 + 12 * Math.log2(note.hz / a4));
  return null;
}

/**
 * Ficha de un acorde a partir de sus notas MIDI. Devuelve `null` si no hay
 * ninguna nota válida.
 */
export function describeChord(midis, notation = 'latin', { preferredRootPc = null } = {}) {
  if (!Array.isArray(midis) || !midis.length) return null;
  const sorted = midis.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const bass = sorted[0];
  const bassPc = pcOf(bass);
  const pcs = [...new Set(sorted.map(pcOf))].sort((a, b) => a - b);
  const letters = sorted.map((m) => noteLabel(midiToNote(m), notation).replace(/-?\d+$/, ''));

  if (pcs.length === 1) {
    const label = noteLabel(midiToNote(sorted[0]), notation);
    return {
      rootPc: bassPc,
      bassPc,
      rootLabel: pitchClassLabel(bassPc, notation),
      suffix: '',
      quality: '',
      short: label,
      fullName: label,
      letters,
      pitchClasses: pcs,
      bassMidi: bass,
      midis: sorted,
    };
  }

  const candidates = [];
  for (const template of CHORD_TEMPLATES) {
    if (template.intervals.length !== pcs.length) continue;
    for (const rootPc of pcs) {
      const relative = pcs.map((pc) => (pc - rootPc + 12) % 12).sort((a, b) => a - b);
      if (relative.every((v, k) => v === template.intervals[k])) candidates.push({ rootPc, template });
    }
  }

  const preferredPc = preferredRootPc === null || preferredRootPc === undefined
    ? null
    : ((Math.round(preferredRootPc) % 12) + 12) % 12;
  const picked = (preferredPc !== null ? candidates.find((c) => c.rootPc === preferredPc) : null)
    || candidates.find((c) => c.rootPc === bassPc)
    || candidates[0]
    || null;
  const rootPc = picked ? picked.rootPc : bassPc;
  const root = pitchClassLabel(rootPc, notation);
  const suffix = picked ? picked.template.suffix : '';
  const quality = picked ? picked.template.quality : '';

  return {
    rootPc,
    bassPc,
    rootLabel: root,
    suffix,
    quality,
    short: picked ? `${root}${suffix}` : `${root} +${pcs.length - 1}`,
    fullName: picked ? `${root} ${quality}` : letters.join(' '),
    letters,
    pitchClasses: pcs,
    bassMidi: bass,
    midis: sorted,
  };
}

/** Igual que `describeChord`, pero partiendo de las notas tal como se guardan. */
export function describeNotes(notes, notation = 'latin', a4 = 440) {
  const midis = (Array.isArray(notes) ? notes : [])
    .map((note) => noteToMidiLoose(note, a4))
    .filter((midi) => midi !== null);
  return midis.length ? describeChord(midis, notation) : null;
}

/**
 * Lee «Do4 Re4 Fa#4», «C4 D4», «440Hz» o vacío (silencio). Acepta notación
 * latina y anglosajona aunque el tema esté en la otra.
 */
export function parseNotesInput(text) {
  const raw = String(text || '').trim();
  if (!raw || /^silencio$/i.test(raw)) return { ok: true, notes: [] };
  const tokens = raw.split(/[\s,;+]+/).filter(Boolean);
  const notes = [];
  for (const token of tokens) {
    const hzToken = token.replace(/hz$/i, '').replace(',', '.');
    if (/^[+]?\d+(?:\.\d+)?$/.test(hzToken)) {
      const hz = Number(hzToken);
      if (!(hz >= 8 && hz <= 16000)) return { ok: false, token };
      notes.push({ hz: Math.round(hz * 100) / 100 });
      continue;
    }
    const m = /^([a-záéíóú#]+)(-?\d+)$/i.exec(token);
    if (!m) return { ok: false, token };
    const name = m[1].toLowerCase();
    const idx = LATIN_INDEX.get(name) ?? NOTE_INDEX.get(name);
    if (idx === undefined) return { ok: false, token };
    const midi = (Number(m[2]) + 1) * 12 + idx;
    if (midi < 0 || midi > 127) return { ok: false, token };
    notes.push(midiToNote(midi));
  }
  return { ok: true, notes };
}
