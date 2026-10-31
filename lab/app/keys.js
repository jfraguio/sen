/**
 * Distribución del teclado del ordenador para tocar las notas del laboratorio.
 *
 * Dos octavas con la disposición habitual de los pianos virtuales: la fila
 * inferior (Z S X D C…) es la octava grave y la superior (Q 2 W 3 E…) la aguda.
 * Compartido por el mini teclado del inspector (para dibujar las letras) y por
 * el modo de interpretación (para convertir las teclas en notas).
 */

export const PERFORMANCE_KEYS = [
  ['z', 0], ['s', 1], ['x', 2], ['d', 3], ['c', 4], ['v', 5],
  ['g', 6], ['b', 7], ['h', 8], ['n', 9], ['j', 10], ['m', 11],
  ['q', 12], ['2', 13], ['w', 14], ['3', 15], ['e', 16], ['r', 17],
  ['5', 18], ['t', 19], ['6', 20], ['y', 21], ['7', 22], ['u', 23],
];

const OFFSET_BY_KEY = new Map(PERFORMANCE_KEYS);
const KEY_BY_OFFSET = new Map(PERFORMANCE_KEYS.map(([key, offset]) => [offset, key]));

/** Semitonos sobre la nota base (C de la octava elegida) o `null`. */
export function offsetForKey(key) {
  return OFFSET_BY_KEY.get(String(key).toLowerCase()) ?? null;
}

/** Letra que toca un MIDI en la octava indicada, o `null`. */
export function hintForMidi(midi, octave) {
  const offset = midi - (octave + 1) * 12;
  return KEY_BY_OFFSET.get(offset) || null;
}

/** Teclas que forman el teclado, con su nombre visible. */
export function keyHints() {
  return PERFORMANCE_KEYS.map(([key, offset]) => ({ key, offset }));
}
