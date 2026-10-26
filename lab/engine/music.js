/**
 * Notas, escalas y afinación del laboratorio.
 *
 * Las notas se guardan en notación científica anglosajona (`D3`, `F#4`) o como
 * frecuencia libre `{ hz: 136.1 }`. La UI puede mostrarlas en notación latina.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const LATIN_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

export const SCALES = {
  mayor: [0, 2, 4, 5, 7, 9, 11],
  menor: [0, 2, 3, 5, 7, 8, 10],
  dorica: [0, 2, 3, 5, 7, 9, 10],
  lidia: [0, 2, 4, 6, 7, 9, 11],
  mixolidia: [0, 2, 4, 5, 7, 9, 10],
  'pentatonica-mayor': [0, 2, 4, 7, 9],
  'pentatonica-menor': [0, 3, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  'tonos-enteros': [0, 2, 4, 6, 8, 10],
  cromatica: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_LABELS = {
  mayor: 'Mayor',
  menor: 'Menor natural',
  dorica: 'Dórica',
  lidia: 'Lidia',
  mixolidia: 'Mixolidia',
  'pentatonica-mayor': 'Pentatónica mayor',
  'pentatonica-menor': 'Pentatónica menor',
  hirajoshi: 'Hirajoshi',
  'tonos-enteros': 'Tonos enteros',
  cromatica: 'Cromática',
};

const FLATS = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };

/** Índice 0–11 de una raíz (`C`, `F#`, `Bb`…). */
export function rootIndex(root) {
  const name = FLATS[root] || root;
  const i = NOTE_NAMES.indexOf(name);
  return i < 0 ? 0 : i;
}

/** `F#4` → 66. Devuelve `null` si no es una nota válida. */
export function noteToMidi(note) {
  if (typeof note !== 'string') return null;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(note.trim());
  if (!m) return null;
  const name = m[1].toUpperCase() + m[2];
  const idx = rootIndex(name);
  if (NOTE_NAMES[idx] !== (FLATS[name] || name)) return null;
  let octave = Number(m[3]);
  if (name === 'Cb') octave -= 1;
  if (name === 'B#') octave += 1;
  return (octave + 1) * 12 + idx;
}

/** 66 → `F#4`. */
export function midiToNote(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

export function midiFrequency(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Frecuencia en Hz de una nota (`D3` o `{ hz }`). */
export function noteFrequency(note, a4 = 440) {
  if (note && typeof note === 'object' && Number.isFinite(note.hz)) return note.hz;
  const midi = noteToMidi(note);
  return midi === null ? midiFrequency(60, a4) : midiFrequency(midi, a4);
}

/** Etiqueta visible de una nota. */
export function noteLabel(note, notation = 'latin') {
  if (note && typeof note === 'object') return `${Number(note.hz).toFixed(1)} Hz`;
  const midi = noteToMidi(note);
  if (midi === null) return String(note);
  if (notation !== 'latin') return midiToNote(midi);
  return LATIN_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/** Notas MIDI de la escala entre `lo` y `hi` (incluidos). */
export function scaleMidis(root, scale, lo, hi) {
  const steps = SCALES[scale] || SCALES.mayor;
  const r = rootIndex(root);
  const out = [];
  for (let m = Math.ceil(lo); m <= hi; m++) {
    if (steps.includes((((m - r) % 12) + 12) % 12)) out.push(m);
  }
  return out;
}

/** ¿Es `midi` la tónica o la quinta de la tonalidad? */
export function degreeWeight(root, midi) {
  const d = (((midi - rootIndex(root)) % 12) + 12) % 12;
  if (d === 0) return 2;
  if (d === 7) return 1;
  return 0;
}

/** Transpone una nota `semitones`; las frecuencias libres se escalan. */
export function transposeNote(note, semitones) {
  if (note && typeof note === 'object') return { hz: Math.round(note.hz * Math.pow(2, semitones / 12) * 100) / 100 };
  const midi = noteToMidi(note);
  return midi === null ? note : midiToNote(midi + semitones);
}
