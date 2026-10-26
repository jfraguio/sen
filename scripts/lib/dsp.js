/**
 * Núcleo DSP de los paisajes sonoros de alta calidad (escenas 04–06).
 *
 * Todo es determinista (RNG con semilla) y periódico: los filtros, la reverb y
 * el limitador se procesan de forma circular (dos pasadas sobre el búfer) y los
 * eventos que se salen del final se pliegan al principio. Así el bucle no
 * necesita crossfade y no tiene costura.
 *
 * Es un módulo ES sin dependencias: funciona en Node y en el navegador.
 */

export const SAMPLE_RATE = 22050;
export const SECONDS = 30;
export const N = SAMPLE_RATE * SECONDS;
const SR = SAMPLE_RATE;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ azar */

let state = 1;
export function seed(value) {
  let h = 2166136261 >>> 0;
  const text = String(value);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  state = h || 1;
}
/** mulberry32 */
export function rnd() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rand = (a = 0, b = 1) => a + (b - a) * rnd();
export const irand = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => rnd() < p;
export const pick = (list) => list[Math.floor(rnd() * list.length)];
export const logRand = (a, b) => a * Math.pow(b / a, rnd());
export function gauss() {
  const u = Math.max(1e-12, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd());
}
export const jitter = (value, amount) => value * (1 + (rnd() * 2 - 1) * amount);

/* -------------------------------------------------------------- utilidades */

export const db = (d) => Math.pow(10, d / 20);
export const sec = (s) => Math.round(s * SR);
export const buf = (n = N) => new Float32Array(n);
/** Frecuencia ajustada a un número entero de ciclos por bucle (sin costura). */
export const qf = (f) => Math.max(1, Math.round(f * SECONDS)) / SECONDS;

export function add(dst, src, g = 1) {
  for (let i = 0; i < dst.length; i++) dst[i] += src[i] * g;
  return dst;
}
export function mul(x, env) {
  for (let i = 0; i < x.length; i++) x[i] *= env[i];
  return x;
}
export function scale(x, g) {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}
export function rms(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}
export function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}
export function normRms(x, target = 0.1) {
  const r = rms(x);
  return r > 0 ? scale(x, target / r) : x;
}
export function normPeak(x, target = 1) {
  const p = peak(x);
  return p > 0 ? scale(x, target / p) : x;
}
/**
 * Nivel "activo": RMS de las ventanas de 50 ms que superan `gateDb` respecto a
 * la más fuerte. En capas continuas equivale al RMS; en eventos dispersos
 * (pájaros, truenos, gotas) mide cómo suenan cuando suenan.
 */
export function activeRms(x, gateDb = -30) {
  const w = sec(0.05);
  const energies = [];
  for (let s = 0; s + w <= x.length; s += w) {
    let e = 0;
    for (let i = s; i < s + w; i++) e += x[i] * x[i];
    energies.push(e / w);
  }
  const max = Math.max(...energies, 1e-20);
  const gate = max * Math.pow(10, gateDb / 10);
  const on = energies.filter((e) => e >= gate);
  return Math.sqrt(on.reduce((a, b) => a + b, 0) / Math.max(1, on.length));
}
export function normActive(x, target = 0.1, gateDb = -30) {
  const r = activeRms(x, gateDb);
  return r > 0 ? scale(x, target / r) : x;
}
/** Suma un evento en `dst` a partir de la muestra `at`, plegando el final. */
export function put(dst, ev, at, g = 1) {
  const n = dst.length;
  let j = ((Math.round(at) % n) + n) % n;
  for (let i = 0; i < ev.length; i++) {
    dst[j] += ev[i] * g;
    if (++j === n) j = 0;
  }
}
/** Igual que `put` pero con el tiempo en segundos. */
export const putAt = (dst, ev, t, g = 1) => put(dst, ev, t * SR, g);

/** Procesa `x` con un generador de estado. En modo circular hace dos pasadas. */
function run(x, make, circular) {
  const step = make();
  const out = new Float32Array(x.length);
  if (circular) for (let i = 0; i < x.length; i++) step(x[i], i);
  for (let i = 0; i < x.length; i++) out[i] = step(x[i], i);
  return out;
}
const isLoop = (x, opt) => (opt?.circular ?? x.length === N);

/* ------------------------------------------------------------------- ruido */

export function white(n = N) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}
/** Ruido rosa (Paul Kellet), normalizado en RMS. */
export function pink(n = N) {
  const w = white(n);
  const out = run(w, () => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    return (v) => {
      b0 = 0.99886 * b0 + v * 0.0555179;
      b1 = 0.99332 * b1 + v * 0.0750759;
      b2 = 0.969 * b2 + v * 0.153852;
      b3 = 0.8665 * b3 + v * 0.3104856;
      b4 = 0.55 * b4 + v * 0.5329522;
      b5 = -0.7616 * b5 - v * 0.016898;
      const o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + v * 0.5362;
      b6 = v * 0.115926;
      return o;
    };
  }, n === N);
  return normRms(out, 0.25);
}
/** Ruido marrón (integrador con fuga), normalizado en RMS. */
export function brown(n = N, leak = 0.996) {
  const w = white(n);
  const out = run(w, () => {
    let y = 0;
    return (v) => (y = y * leak + v * 0.06);
  }, n === N);
  return normRms(hp(out, 18, 0.5), 0.25);
}

/* ----------------------------------------------------------------- filtros */

/**
 * Filtro de variables de estado (TPT). `freq` puede ser un número o un array
 * con una frecuencia por muestra (se actualiza cada 16 muestras).
 */
export function svf(x, type, freq, q = 0.707, opt) {
  const variable = typeof freq !== 'number';
  const k = 1 / q;
  return run(x, () => {
    let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
    const set = (f) => {
      const g = Math.tan((Math.PI * Math.min(Math.max(f, 5), SR * 0.475)) / SR);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    };
    if (!variable) set(freq);
    return (v, i) => {
      if (variable && (i & 15) === 0) set(freq[i]);
      const v3 = v - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      if (type === 'lp') return v2;
      if (type === 'hp') return v - k * v1 - v2;
      return k * v1; // bp con ganancia unitaria en el centro
    };
  }, isLoop(x, opt));
}
export const lp = (x, f, q = 0.707, opt) => svf(x, 'lp', f, q, opt);
export const hp = (x, f, q = 0.707, opt) => svf(x, 'hp', f, q, opt);
export const bp = (x, f, q = 1, opt) => svf(x, 'bp', f, q, opt);
/** Paso banda de 4º orden (dos etapas). */
export const band = (x, lo, hi, opt) => lp(lp(hp(hp(x, lo, 0.707, opt), lo, 0.707, opt), hi, 0.707, opt), hi, 0.707, opt);

/** Suavizado de un polo (para envolventes). */
export function smooth(x, seconds, opt) {
  const a = Math.exp(-1 / Math.max(1, seconds * SR));
  return run(x, () => {
    let y = 0;
    return (v) => (y = v + (y - v) * a);
  }, isLoop(x, opt));
}

/** Biquad RBJ genérico (para la ponderación K y estanterías). */
function biquad(x, type, f, q, gainDb, circular) {
  const A = Math.pow(10, gainDb / 40);
  const w = (TAU * f) / SR;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highshelf') {
    const s = 2 * Math.sqrt(A) * al;
    b0 = A * (A + 1 + (A - 1) * cs + s);
    b1 = -2 * A * (A - 1 + (A + 1) * cs);
    b2 = A * (A + 1 + (A - 1) * cs - s);
    a0 = A + 1 - (A - 1) * cs + s;
    a1 = 2 * (A - 1 - (A + 1) * cs);
    a2 = A + 1 - (A - 1) * cs - s;
  } else if (type === 'lowshelf') {
    const s = 2 * Math.sqrt(A) * al;
    b0 = A * (A + 1 - (A - 1) * cs + s);
    b1 = 2 * A * (A - 1 - (A + 1) * cs);
    b2 = A * (A + 1 - (A - 1) * cs - s);
    a0 = A + 1 + (A - 1) * cs + s;
    a1 = -2 * (A - 1 + (A + 1) * cs);
    a2 = A + 1 + (A - 1) * cs - s;
  } else { // highpass
    b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2;
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  return run(x, () => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (v) => {
      const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = y;
      return y;
    };
  }, circular);
}
export const highShelf = (x, f, gainDb, opt) => biquad(x, 'highshelf', f, 0.707, gainDb, isLoop(x, opt));
export const lowShelf = (x, f, gainDb, opt) => biquad(x, 'lowshelf', f, 0.707, gainDb, isLoop(x, opt));

/* ------------------------------------------------------- modulación lenta */

/**
 * Señal aleatoria suave y periódica en [-1, 1]: suma de senos con un número
 * entero de ciclos por bucle, fases aleatorias y pendiente 1/f^slope.
 */
export function lfo(maxHz = 0.2, { minHz = 1 / SECONDS, slope = 1, n = N, parts = 18 } = {}) {
  const dur = n / SR;
  const cMin = Math.max(1, Math.round(minHz * dur));
  const cMax = Math.max(cMin, Math.round(maxHz * dur));
  let cycles = [];
  for (let c = cMin; c <= cMax; c++) cycles.push(c);
  while (cycles.length > parts) cycles.splice(Math.floor(rnd() * cycles.length), 1);
  const comps = cycles.map((c) => ({ c, a: Math.pow(c, -slope) * rand(0.6, 1.2), p: rand(0, TAU) }));
  const step = 32;
  const m = Math.ceil(n / step) + 1;
  const ctrl = new Float32Array(m);
  let mx = 1e-9;
  for (let j = 0; j < m; j++) {
    const ph = (TAU * j * step) / n;
    let v = 0;
    for (const k of comps) v += k.a * Math.sin(k.c * ph + k.p);
    ctrl[j] = v;
    mx = Math.max(mx, Math.abs(v));
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / step;
    const j = Math.floor(p);
    const f = p - j;
    out[i] = (ctrl[j] * (1 - f) + ctrl[j + 1] * f) / mx;
  }
  return out;
}
/** Seno con un número entero de ciclos por bucle. */
export function cyc(cycles, phase = 0, n = N) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((TAU * cycles * i) / n + phase);
  return out;
}

/**
 * Suma de parciales sostenidos. Las frecuencias se ajustan a un número entero
 * de ciclos por bucle para que no haya salto de fase en la costura.
 * `partials`: [{ f, a, env? }] donde `env` es un array de N muestras.
 */
export function additive(partials, n = N) {
  const out = new Float32Array(n);
  for (const { f, a, env } of partials) {
    const fr = n === N ? qf(f) : f;
    if (fr >= SR * 0.47 || a === 0) continue;
    const w = (TAU * fr) / SR;
    const c = Math.cos(w), s = Math.sin(w);
    const p0 = rand(0, TAU);
    let re = Math.cos(p0), im = Math.sin(p0);
    for (let i = 0; i < n; i++) {
      out[i] += im * a * (env ? env[i] : 1);
      const r2 = re * c - im * s;
      im = re * s + im * c;
      re = r2;
      if ((i & 4095) === 4095) {
        const m = Math.hypot(re, im);
        re /= m; im /= m;
      }
    }
  }
  return out;
}
/** Mapea una señal en [-1, 1] al rango [lo, hi], con curva opcional. */
export function range(x, lo, hi, curve = 1) {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const u = Math.pow(Math.min(1, Math.max(0, (x[i] + 1) / 2)), curve);
    out[i] = lo + (hi - lo) * u;
  }
  return out;
}

/* ------------------------------------------------------------ envolventes */

/** Envolvente ataque/decaimiento exponencial (en segundos). */
export function envAD(n, attack, tau) {
  const out = new Float32Array(n);
  const na = Math.max(1, Math.round(attack * SR));
  const d = 1 / Math.max(1, tau * SR);
  for (let i = 0; i < n; i++) {
    const a = i < na ? 0.5 - 0.5 * Math.cos((Math.PI * i) / na) : 1;
    out[i] = a * Math.exp(-Math.max(0, i - na) * d);
  }
  // Cola: últimos 2 ms a cero para que no haya escalón.
  const tail = Math.min(n, sec(0.002));
  for (let i = 0; i < tail; i++) out[n - 1 - i] *= i / tail;
  return out;
}
/** Envolvente seno^p de 0 a 1 a 0. */
export function envBell(n, p = 1) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.pow(Math.max(0, Math.sin((Math.PI * i) / Math.max(1, n - 1))), p);
  return out;
}
/** Envolvente con ataque y relajación coseno y meseta. */
export function envASR(n, attack, release) {
  const out = new Float32Array(n);
  const na = Math.max(1, Math.round(attack * SR));
  const nr = Math.max(1, Math.round(release * SR));
  for (let i = 0; i < n; i++) {
    let v = 1;
    if (i < na) v = 0.5 - 0.5 * Math.cos((Math.PI * i) / na);
    const r = n - 1 - i;
    if (r < nr) v *= 0.5 - 0.5 * Math.cos((Math.PI * r) / nr);
    out[i] = v;
  }
  return out;
}

/* --------------------------------------------------------------- voces */

/**
 * Oscilador con frecuencia y amplitud dependientes de u ∈ [0, 1].
 * `harm` es una lista [ratio, ganancia]. Devuelve un evento de `dur` segundos.
 */
export function tone(dur, { f, amp, harm = [[1, 1]], vib = 0, vibRate = 6, phase = 0 } = {}) {
  const n = Math.max(2, sec(dur));
  const out = new Float32Array(n);
  const fFn = typeof f === 'function' ? f : () => f;
  const aFn = typeof amp === 'function' ? amp : null;
  let ph = phase;
  const vr = (TAU * vibRate) / SR;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const fr = fFn(u) * (1 + vib * Math.sin(vr * i));
    ph += (TAU * fr) / SR;
    let v = 0;
    for (const [r, g] of harm) if (fr * r < SR * 0.47) v += g * Math.sin(ph * r);
    const a = aFn ? aFn(u) : 1;
    out[i] = a > 0 ? v * a : 0;
  }
  return out;
}

/**
 * Resonador modal: lista de modos [frecuencia, amplitud, tau (s)].
 * `beat` añade a cada modo un gemelo desafinado (batido de cuencos).
 */
export function modal(modes, { dur, attack = 0.002, strike = 0, strikeLp = 3000, beat = 0 } = {}) {
  const longest = Math.max(...modes.map((m) => m[2]));
  const n = sec(dur ?? Math.min(longest * 6, 24));
  const out = new Float32Array(n);
  const na = Math.max(1, sec(attack));
  for (const [f, a, tau, b = beat] of modes) {
    if (f >= SR * 0.47) continue;
    const d = Math.exp(-1 / (tau * SR));
    const twins = b ? [[f - b / 2, 0.5], [f + b / 2, 0.5]] : [[f, 1]];
    for (const [fr, g] of twins) {
      const w = (TAU * fr) / SR;
      const c = Math.cos(w), s = Math.sin(w);
      let re = 0, im = 1, e = a * g;
      // Fase inicial aleatoria para que los modos no se sumen en el ataque.
      const p0 = rand(0, TAU);
      re = Math.cos(p0); im = Math.sin(p0);
      for (let i = 0; i < n; i++) {
        const atk = i < na ? 0.5 - 0.5 * Math.cos((Math.PI * i) / na) : 1;
        out[i] += im * e * atk;
        const r2 = re * c - im * s;
        im = re * s + im * c;
        re = r2;
        e *= d;
      }
    }
  }
  if (strike > 0) {
    const sn = Math.min(n, sec(0.012));
    const nz = lp(white(sn), strikeLp, 0.707, { circular: false });
    for (let i = 0; i < sn; i++) out[i] += nz[i] * strike * Math.exp(-i / (sec(0.0025) || 1));
  }
  const tail = Math.min(n, sec(0.02));
  for (let i = 0; i < tail; i++) out[n - 1 - i] *= i / tail;
  return out;
}

/**
 * Burbuja de Minnaert (modelo de van den Doel): seno amortiguado con la
 * frecuencia subiendo a medida que la burbuja se acerca a la superficie.
 */
export function bubble(f0, { rise = 0.1, damp = 1, len } = {}) {
  const d = (0.043 * f0 + 0.0014 * Math.pow(f0, 1.5)) * damp;
  const sigma = rise * d;
  const n = Math.max(8, sec(len ?? Math.min(0.25, 5 / d)));
  const out = new Float32Array(n);
  const na = Math.max(2, sec(0.0006));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * f0 * (1 + sigma * t)) / SR;
    const atk = i < na ? i / na : 1;
    out[i] = Math.sin(ph) * Math.exp(-d * t) * atk;
  }
  return out;
}

/** Ráfaga de ruido corta filtrada (chasquido, gota sobre hoja, guijarro...). */
export function burst(dur, { lo = 500, hi = 6000, tau, attack = 0.0004, q } = {}) {
  const n = Math.max(8, sec(dur));
  let x = white(n);
  const o = { circular: false };
  if (q) x = bp(x, Math.sqrt(lo * hi), q, o);
  else {
    x = hp(x, lo, 0.707, o);
    x = lp(x, hi, 0.707, o);
  }
  return mul(x, envAD(n, attack, tau ?? dur / 4));
}

/** Banco de eventos precalculados para repartirlos muchas veces. */
export const bank = (count, make) => Array.from({ length: count }, (_, i) => make(i));

/** Proceso de Poisson: llama a `cb(t)` con tiempos en [0, SECONDS). */
export function poisson(ratePerSec, cb, { from = 0, to = SECONDS } = {}) {
  if (ratePerSec <= 0) return;
  let t = from - Math.log(1 - rnd()) / ratePerSec;
  while (t < to) {
    cb(t);
    t += -Math.log(1 - rnd()) / ratePerSec;
  }
}
/** Instantes regulares que encajan exactamente en el bucle. */
export function regular(period, { offset = 0, jitter: jit = 0 } = {}) {
  const count = Math.max(1, Math.round(SECONDS / period));
  const p = SECONDS / count;
  return Array.from({ length: count }, (_, i) => offset + i * p + (jit ? rand(-jit, jit) * p : 0));
}

/** Polvo: impulsos de amplitud aleatoria (textura de lluvia, espuma, hojas). */
export function dust(ratePerSec, { env, shape = 2, n = N } = {}) {
  const out = new Float32Array(n);
  const count = Math.round((ratePerSec * n) / SR);
  for (let k = 0; k < count; k++) {
    const i = Math.floor(rnd() * n);
    if (env && rnd() > env[i]) continue;
    out[i] += (rnd() < 0.5 ? -1 : 1) * Math.pow(rnd(), shape);
  }
  return out;
}

/* ------------------------------------------------------------------ reverb */

/**
 * Reverb FDN de 8 líneas con difusores de entrada y amortiguación por línea.
 * Devuelve solo la señal húmeda. Circular: la cola del final suena al
 * principio del bucle.
 */
export function reverb(x, { t60 = 1.8, size = 1, damp = 5000, predelay = 0.015, diffusion = 0.65, lowcut = 120 } = {}) {
  const circular = x.length === N;
  const base = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.7, 73.1];
  const lens = base.map((ms) => Math.max(8, Math.round((ms * size * SR) / 1000)));
  const gains = lens.map((l) => Math.pow(10, (-3 * l) / (t60 * SR)));
  const dampA = Math.exp((-TAU * damp) / SR);
  const apLens = [4.7, 3.6, 12.7, 9.3].map((ms) => Math.round((ms * SR) / 1000));
  const pre = Math.max(1, Math.round(predelay * SR));
  const signs = [1, -1, 1, -1, 1, -1, 1, -1];
  const input = lowcut ? hp(x, lowcut, 0.707, { circular }) : x;

  const wet = run(input, () => {
    const lines = lens.map((l) => new Float32Array(l));
    const idx = new Int32Array(8);
    const lpState = new Float32Array(8);
    const aps = apLens.map((l) => ({ b: new Float32Array(l), i: 0 }));
    const preBuf = new Float32Array(pre);
    let pi = 0;
    const outs = new Float32Array(8);
    return (v) => {
      let s = preBuf[pi];
      preBuf[pi] = v;
      if (++pi === pre) pi = 0;
      for (const ap of aps) {
        const d = ap.b[ap.i];
        const y = -diffusion * s + d;
        ap.b[ap.i] = s + diffusion * y;
        if (++ap.i === ap.b.length) ap.i = 0;
        s = y;
      }
      let sum = 0;
      for (let k = 0; k < 8; k++) {
        const o = lines[k][idx[k]];
        lpState[k] = o + (lpState[k] - o) * dampA;
        outs[k] = lpState[k] * gains[k];
        sum += outs[k];
      }
      const h = (2 / 8) * sum;
      let y = 0;
      for (let k = 0; k < 8; k++) {
        lines[k][idx[k]] = outs[k] - h + s * 0.35;
        if (++idx[k] === lens[k]) idx[k] = 0;
        y += outs[k] * signs[k];
      }
      return y * 0.7;
    };
  }, circular);
  return wet;
}

/* ------------------------------------------------ sonoridad y masterización */

/**
 * Sonoridad integrada aproximada (ITU-R BS.1770: ponderación K, bloques de
 * 400 ms con 75 % de solape, puertas absoluta y relativa). En LUFS.
 */
export function loudness(x, sampleRate = SR) {
  const kw = kWeight(x, sampleRate);
  const block = Math.round(0.4 * sampleRate);
  const hop = Math.round(0.1 * sampleRate);
  const powers = [];
  for (let s = 0; s + block <= kw.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + block; i++) e += kw[i] * kw[i];
    powers.push(e / block);
  }
  const lufs = (p) => -0.691 + 10 * Math.log10(Math.max(p, 1e-12));
  const gated = powers.filter((p) => lufs(p) > -70);
  if (!gated.length) return -70;
  const mean = gated.reduce((a, b) => a + b, 0) / gated.length;
  const rel = gated.filter((p) => lufs(p) > lufs(mean) - 10);
  return lufs(rel.reduce((a, b) => a + b, 0) / Math.max(1, rel.length));
}
function kWeight(x, sampleRate) {
  // Coeficientes RBJ equivalentes a la ponderación K, válidos a cualquier fs.
  const shelf = rbj(x, sampleRate, 'highshelf', 1681.97, 0.7072, 3.9998);
  return rbj(shelf, sampleRate, 'highpass', 38.135, 0.5003, 0);
}
function rbj(x, fs, type, f, q, gainDb) {
  const A = Math.pow(10, gainDb / 40);
  const w = (TAU * f) / fs;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highshelf') {
    const s = 2 * Math.sqrt(A) * al;
    b0 = A * (A + 1 + (A - 1) * cs + s);
    b1 = -2 * A * (A - 1 + (A + 1) * cs);
    b2 = A * (A + 1 + (A - 1) * cs - s);
    a0 = A + 1 - (A - 1) * cs + s;
    a1 = 2 * (A - 1 - (A + 1) * cs);
    a2 = A + 1 - (A - 1) * cs - s;
  } else {
    b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2;
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  }
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * Limitador con anticipación (circular): ninguna muestra supera `ceiling`.
 */
export function limit(x, ceiling = 0.79, { lookahead = 0.004, release = 0.12 } = {}) {
  const n = x.length;
  const need = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    need[i] = a > ceiling ? ceiling / a : 1;
    if (need[i] < 1) any = true;
  }
  if (!any) return x;
  const L = Math.max(1, Math.round(lookahead * SR));
  // Mínimo en la ventana [i, i + L] (circular).
  const mn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let k = 0; k <= L; k++) {
      const v = need[(i + k) % n];
      if (v < m) m = v;
    }
    mn[i] = m;
  }
  // Recuperación lenta, dos pasadas para que sea periódica.
  const r = 1 - Math.exp(-1 / (release * SR));
  const env = new Float32Array(n);
  let g = 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      g = Math.min(mn[i], g + (1 - g) * r);
      env[i] = g;
    }
  }
  // Media móvil de L muestras hacia atrás: el ataque llega antes del pico.
  const out = new Float32Array(n);
  let acc = 0;
  for (let k = 0; k < L; k++) acc += env[(n - L + k) % n];
  for (let i = 0; i < n; i++) {
    acc += env[i] - env[(i - L + n) % n];
    out[i] = x[i] * Math.min(env[i], acc / L);
  }
  return out;
}

/**
 * Doma los picos de una capa: ninguna muestra supera en `crestDb` su nivel
 * activo. Suaviza chasquidos y gotas sin aplastar el resto de la mezcla.
 */
export function tame(x, crestDb = 18, release = 0.04) {
  return limit(x, activeRms(x) * db(crestDb), { lookahead: 0.002, release });
}

/** Cadena final: DC fuera, sonoridad objetivo y limitador. */export function master(x, { lufs = -23, ceiling = 0.708, lowcut = 24 } = {}) {
  let y = hp(x, lowcut, 0.707);
  const current = loudness(y);
  y = scale(y, db(lufs - current));
  const over = 20 * Math.log10(Math.max(peak(y), 1e-9) / ceiling);
  const pre = y;
  y = limit(pre, ceiling);
  // El limitador baja un poco la sonoridad: se compensa una vez.
  const diff = lufs - loudness(y);
  if (diff > 0.1) y = limit(scale(pre, db(diff)), ceiling);
  for (let i = 0; i < y.length; i++) if (!Number.isFinite(y[i])) y[i] = 0;
  master.stats = { lufs: loudness(y), reductionDb: Math.max(0, over) };
  return y;
}
master.stats = null;

/* ------------------------------------------------------------------- WAV */

/** Codifica PCM mono de 16 bits con dither TPDF. Devuelve un Uint8Array. */
export function encodeWav(samples, sampleRate = SR) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const d = (rnd() - rnd()); // TPDF, ±1 LSB
    const v = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32766 + d);
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, v)), true);
  }
  return bytes;
}

/**
 * Decodifica un WAV PCM de 16 o 24 bits, o IEEE float de 32 bits (mono o
 * estéreo; se mezcla a mono).
 */
export function decodeWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 12;
  let fmt = null;
  while (p + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(p, p + 4));
    const size = view.getUint32(p + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: view.getUint16(p + 8, true),
        channels: view.getUint16(p + 10, true),
        sampleRate: view.getUint32(p + 12, true),
        bits: view.getUint16(p + 22, true),
      };
    } else if (id === 'data' && fmt) {
      const bytesPer = fmt.bits / 8;
      const frames = Math.floor(size / (bytesPer * fmt.channels));
      const read = fmt.format === 3
        ? (o) => view.getFloat32(o, true)
        : fmt.bits === 24
          ? (o) => ((view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getInt8(o + 2) << 16)) / 8388608)
          : (o) => view.getInt16(o, true) / 32768;
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < fmt.channels; c++) s += read(p + 8 + (i * fmt.channels + c) * bytesPer);
        out[i] = s / fmt.channels;
      }
      return { ...fmt, samples: out };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('WAV no válido');
}
