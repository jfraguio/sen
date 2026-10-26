/**
 * Azar determinista del motor del laboratorio.
 *
 * - `createRng(seed)`: RNG secuencial (mulberry32) para planificar eventos.
 * - `unitAt(seed, i)` / `noiseAt(seed, i)`: RNG basado en contador para la
 *   señal; permite saltar a cualquier muestra sin recorrer las anteriores.
 *
 * Solo usa operaciones enteras (`Math.imul`), idénticas en todos los motores.
 */

/** FNV-1a de 32 bits sobre el texto de las partes unidas por `/`. */
export function seedFrom(...parts) {
  const text = parts.map((p) => String(p)).join('/');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

/** Mezclador de 32 bits (lowbias32). */
export function mix32(x) {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Valor uniforme en [0, 1) para la muestra `i` de la semilla `seed`. */
export function unitAt(seed, i) {
  return mix32((seed ^ mix32(Math.imul(i | 0, 0x9e3779b1) + 0x632be5ab)) >>> 0) / 4294967296;
}

/** Valor uniforme en [-1, 1) para la muestra `i`. */
export function noiseAt(seed, i) {
  return unitAt(seed, i) * 2 - 1;
}

/** Deriva una semilla nueva a partir de otra y un índice. */
export function subSeed(seed, k) {
  return mix32((seed + Math.imul(k + 1, 0x85ebca6b)) >>> 0) || 1;
}

/** RNG secuencial con utilidades. */
export function createRng(seed) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (a = 0, b = 1) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    logRange: (a, b) => a * Math.pow(b / a, next()),
    gauss: () => {
      const u = Math.max(1e-12, next());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    /** Intervalo exponencial de media `mean` (proceso de Poisson). */
    exp: (mean) => -Math.log(Math.max(1e-12, 1 - next())) * mean,
    seed: () => (next() * 4294967296) >>> 0 || 1,
  };
  return rng;
}
