/**
 * Fuentes sonoras para los paisajes de alta calidad: cada función devuelve un
 * evento corto (Float32Array) o una capa completa de N muestras en bucle.
 * Los modelos imitan la física o la estructura real del sonido: burbujas de
 * Minnaert para el agua, impulsos agrupados para el fuego, pulsos con
 * portadora casi pura para los grillos, contornos de frecuencia para las aves…
 */

import {
  SAMPLE_RATE as SR, SECONDS, N,
  rnd, rand, irand, chance, pick, logRand, gauss, jitter,
  db, sec, buf, add, mul, scale, rms, normRms, normPeak, normActive, tame, put, putAt,
  white, pink, brown, lp, hp, bp, band, smooth, highShelf,
  lfo, range, envAD, envBell, envASR,
  tone, modal, bubble, burst, bank, poisson, regular, dust, reverb,
} from './dsp.js';

const TAU = Math.PI * 2;

/* ------------------------------------------------------------ mezcla */

/** Atenúa y oscurece un evento según su distancia d ∈ [0, 1]. */
export function distance(ev, d) {
  if (d <= 0.02) return { ev, g: 1, wet: 0.1 };
  const cutoff = 10500 * Math.pow(1500 / 10500, d);
  return { ev: lp(ev, cutoff, 0.6), g: db(-20 * d), wet: 0.12 + 0.8 * d };
}

/** Bus con envío a reverb: `place` para eventos, `layer` para capas. */
export class Bus {
  constructor() {
    this.dry = buf();
    this.wet = buf();
  }
  place(ev, t, { g = 1, d = 0, wet } = {}) {
    const p = distance(ev, d);
    putAt(this.dry, p.ev, t, g * p.g);
    putAt(this.wet, p.ev, t, g * p.g * (wet ?? p.wet));
    return this;
  }
  layer(x, { g = 1, wet = 0 } = {}) {
    add(this.dry, x, g);
    if (wet) add(this.wet, x, g * wet);
    return this;
  }
  render(rv = {}) {
    const out = Float32Array.from(this.dry);
    return add(out, reverb(this.wet, rv), rv.gain ?? 1);
  }
}

/** Ganancia aleatoria log-normal alrededor de `centerDb`. */
export const vary = (centerDb = 0, spreadDb = 4) => db(centerDb + gauss() * spreadDb);

/**
 * Reparte eventos de un banco con un proceso de Poisson. Con `env` (array de N
 * valores en [0, 1]) la tasa y el nivel siguen a la envolvente.
 */
export function scatter(target, list, rate, { centerDb = 0, spreadDb = 5, env } = {}) {
  poisson(rate, (t) => {
    const w = env ? env[Math.floor(t * SR) % N] : 1;
    if (env && rnd() > w) return;
    putAt(target, pick(list), t, vary(centerDb, spreadDb) * (0.55 + 0.45 * w));
  });
  return target;
}

/** Envolvente de ráfagas lenta y periódica en [lo, hi]. */
export const gusts = (maxHz = 0.1, lo = 0, hi = 1, curve = 1.4, slope = 1.2) =>
  range(lfo(maxHz, { slope }), lo, hi, curve);

/** Turbulencia rápida (modulación de amplitud del agua y el viento). */
export function turbulence(cutoff = 12, depth = 0.5) {
  const t = normPeak(lp(lp(white(), cutoff), cutoff));
  return range(t, 1 - depth, 1);
}

/* ------------------------------------------------------------- lluvia */

/** Lecho de lluvia: miles de impactos diminutos filtrados. */
export function rainBed(density, { lo = 450, hi = 7000, env, shape = 2.4 } = {}) {
  let x = dust(density, { env, shape });
  x = hp(x, lo, 0.6);
  x = lp(lp(x, hi, 0.6), hi * 1.25, 0.6);
  return normRms(x, 0.1);
}

export const leafDrop = () => {
  const f = logRand(1300, 4800);
  const ev = burst(rand(0.006, 0.02), { lo: f / 1.6, hi: f * 1.6, tau: rand(0.0018, 0.006), q: rand(1.4, 3) });
  if (chance(0.35)) add(ev, padTo(scale(bubble(f * rand(0.7, 1.2), { damp: 2.2 }), 0.25), ev.length));
  return normPeak(ev, rand(0.5, 1));
};
export const waterDrop = (lo = 1000, hi = 4500) => {
  const f = logRand(lo, hi);
  const b = bubble(f, { rise: rand(0.05, 0.25), damp: rand(0.8, 1.3) });
  const s = burst(0.008, { lo: 1800, hi: 9000, tau: 0.0015 });
  const ev = buf(Math.max(b.length, s.length) + sec(0.004));
  add(ev, padTo(s, ev.length), 0.35);
  put(ev, b, sec(rand(0.001, 0.004)), 1);
  return normPeak(ev, 1);
};
export const plop = (lo = 380, hi = 900) => {
  const f = logRand(lo, hi);
  const ev = buf(sec(0.18));
  put(ev, burst(0.03, { lo: 300, hi: 4000, tau: 0.006 }), 0, 0.5);
  put(ev, bubble(f, { rise: rand(0.15, 0.35), damp: 0.8, len: 0.16 }), sec(0.006), 1);
  return normPeak(ev, 1);
};
export const tentTap = () => {
  const f = logRand(150, 330);
  const tau = rand(0.018, 0.045);
  return normPeak(modal(
    [[f, 1, tau], [f * 1.59, 0.45, tau * 0.6], [f * 2.14, 0.3, tau * 0.45], [f * 3.4, 0.12, tau * 0.3]],
    { dur: tau * 6, attack: 0.0012, strike: 0.25, strikeLp: rand(1800, 3200) },
  ), rand(0.5, 1));
};
export const roofTap = () => {
  const f = logRand(700, 1600);
  const ev = burst(0.012, { lo: 900, hi: 6000, tau: 0.002 });
  add(ev, padTo(modal([[f, 0.5, 0.008], [f * 2.3, 0.2, 0.005]], { dur: 0.012 }), ev.length));
  return normPeak(ev, rand(0.4, 1));
};
export const glassTap = () => {
  const f = logRand(2500, 5500);
  const ev = burst(0.01, { lo: 2000, hi: 9000, tau: 0.0012 });
  add(ev, padTo(modal([[f, 0.4, 0.004]], { dur: 0.01 }), ev.length));
  return normPeak(ev, rand(0.3, 1));
};

export function padTo(x, n) {
  if (x.length === n) return x;
  const out = new Float32Array(n);
  out.set(x.subarray(0, Math.min(n, x.length)));
  return out;
}

/* -------------------------------------------------------------- truenos */

/**
 * Trueno: decenas de sub-ráfagas graves agrupadas al principio (distintas
 * partes del rayo), filtradas según la distancia, más un cuerpo subgrave.
 */
export function thunder({ dur = 10, dist = 0.6, crack = 0 } = {}) {
  const n = sec(dur);
  const out = buf(n);
  const k = irand(26, 44);
  for (let i = 0; i < k; i++) {
    const t = dur * 0.85 * Math.pow(rnd(), 1.7);
    const len = rand(0.25, 1.6);
    const seg = mul(brown(sec(len), 0.998), envBell(sec(len), rand(1.2, 2.5)));
    put(out, seg, sec(t), rand(0.3, 1) * Math.exp(-t / (dur * 0.33)));
  }
  const cutoff = 1500 * Math.pow(220 / 1500, dist);
  let x = lp(lp(out, cutoff, 0.55), cutoff * 1.4, 0.6);
  const body = mul(lp(brown(n, 0.999), 70, 0.7), envAD(n, rand(0.4, 0.9), dur * 0.3));
  x = add(normRms(x, 0.2), normRms(body, 0.2), 0.8);
  mul(x, envAD(n, rand(0.06, 0.18) + dist * 0.5, dur * 0.42));
  if (crack > 0) {
    const c = buf(n);
    put(c, burst(0.09, { lo: 300, hi: 5200 - 3000 * dist, tau: 0.03 }), 0, 1);
    for (let j = 0; j < irand(6, 14); j++) {
      put(c, burst(rand(0.01, 0.04), { lo: 400, hi: 4000 - 2000 * dist, tau: 0.008 }), sec(rand(0.02, 0.5)), rand(0.2, 0.7));
    }
    add(x, lp(c, 3000), crack * peakOf(x) * 0.9);
  }
  const fade = Math.min(n, sec(0.6));
  for (let i = 0; i < fade; i++) x[n - 1 - i] *= i / fade;
  return normPeak(x, 1);
}
const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/* ---------------------------------------------------------------- viento */

/**
 * Viento: ruido rosa por un paso banda cuya frecuencia sube con la ráfaga,
 * más graves y, opcionalmente, aullidos (bandas muy estrechas que afinan con
 * la velocidad del viento).
 */
export function wind(gust, { lo = 250, hi = 1200, q = 0.7, low = 0.5, hiss = 0.2, howl = 0, howlF = [300, 430, 580], howlQ = 28 } = {}) {
  const fc = new Float32Array(N);
  for (let i = 0; i < N; i++) fc[i] = lo + (hi - lo) * gust[i];
  const amp = new Float32Array(N);
  for (let i = 0; i < N; i++) amp[i] = 0.05 + Math.pow(gust[i], 1.3);
  const body = normRms(mul(bp(pink(), fc, q), amp), 0.1);
  const out = Float32Array.from(body);
  if (low) {
    const lowAmp = range(gust.map((v) => v * 2 - 1), 0.25, 1);
    add(out, normRms(mul(lp(brown(), 140, 0.6), lowAmp), 0.1), low);
  }
  if (hiss) {
    const hAmp = gust.map((v) => v * v);
    add(out, normRms(mul(band(pink(), 2800, 8500), hAmp), 0.1), hiss);
  }
  if (howl) {
    const src = white();
    howlF.forEach((f, k) => {
      const fr = new Float32Array(N);
      const det = rand(0.92, 1.08);
      for (let i = 0; i < N; i++) fr[i] = f * det * (0.82 + 0.4 * gust[i]);
      const g = gust.map((v) => Math.pow(v, 2.4));
      add(out, normRms(mul(bp(src, fr, howlQ), g), 0.1), howl * db(-3 * k));
    });
  }
  return normRms(out, 0.1);
}

/** Hojas agitadas: impactos diminutos cuya densidad sigue a la ráfaga. */
export function leaves(gust, { rate = 5000, lo = 1300, hi = 7000, flutter = 0.35 } = {}) {
  const env = gust.map((v) => Math.min(1, Math.pow(v, 1.5)));
  let x = dust(rate, { env, shape: 2.2 });
  x = band(x, lo, hi);
  if (flutter) mul(x, range(lfo(8, { minHz: 3, slope: 0, parts: 24 }), 1 - flutter, 1));
  return normRms(x, 0.1);
}

/** Crujido de tronco: fricción (stick-slip) que excita resonancias de madera. */
export function creak({ dur = rand(1.2, 2.4), f0 = rand(18, 30), f1 = rand(40, 75), res = [rand(180, 260), rand(420, 560), rand(800, 1100)] } = {}) {
  const n = sec(dur);
  const imp = buf(n);
  let t = 0;
  while (t < dur) {
    const u = t / dur;
    const rate = f0 + (f1 - f0) * Math.sin(Math.PI * u);
    imp[Math.floor(t * SR)] = Math.sin(Math.PI * u) * rand(0.6, 1);
    t += (1 / rate) * (1 + gauss() * 0.06);
  }
  const out = buf(n);
  res.forEach((f, k) => add(out, bp(imp, f, 9), db(-4 * k)));
  return normPeak(mul(out, envBell(n, 0.7)), 1);
}

/** Tamborileo de pájaro carpintero (lejano). */
export function woodpecker() {
  const knocks = irand(14, 22);
  const f = logRand(800, 1150);
  const out = buf(sec(2));
  let t = 0;
  for (let i = 0; i < knocks; i++) {
    const k = modal([[f, 1, 0.012], [f * 1.83, 0.6, 0.008], [f * 2.9, 0.3, 0.005]], { dur: 0.05, strike: 0.5, strikeLp: 4500 });
    put(out, k, sec(t), 1 - (0.55 * i) / knocks);
    t += 0.05 + (0.018 * i) / knocks;
  }
  return normPeak(out, 1);
}

/* ------------------------------------------------------------------ agua */

/**
 * Agua que borbotea: varias "fuentes" (piedras, remansos) que repiten
 * burbujas con un tono propio y un ritmo semirregular, más burbujas sueltas.
 */
export function babble({ sources = 12, fLo = 500, fHi = 2500, rateLo = 3, rateHi = 12, damp = 1, rise = [0.06, 0.3], loose = 0.3 } = {}) {
  const out = buf();
  for (let s = 0; s < sources; s++) {
    const f = logRand(fLo, fHi);
    const rate = rand(rateLo, rateHi);
    const g = db(rand(-12, 0));
    const pool = bank(6, () => bubble(jitter(f, 0.12), { rise: rand(rise[0], rise[1]), damp }));
    poisson(rate, (t) => putAt(out, pick(pool), t, g * vary(0, 3)));
  }
  const free = bank(40, () => bubble(logRand(fLo * 0.7, fHi * 1.4), { rise: rand(rise[0], rise[1]), damp }));
  scatter(out, free, ((rateLo + rateHi) / 2) * sources * loose, { centerDb: -6, spreadDb: 5 });
  return normRms(out, 0.1);
}

/** Corriente: ruido rosa en banda modulado por turbulencia rápida. */
export function flow({ lo = 300, hi = 4500, turb = 0.5, rate = 10 } = {}) {
  const x = band(pink(), lo, hi);
  mul(x, turbulence(rate, turb));
  return normRms(x, 0.1);
}

/** Chapoteo de agua contra la orilla o las rocas. */
export function lap({ size = 1, lo = 250, hi = 2600 } = {}) {
  const dur = rand(0.5, 1.0) * (0.6 + size * 0.5);
  const n = sec(dur + 0.4);
  const out = buf(n);
  const body = mul(band(pink(sec(dur)), lo, hi), envAD(sec(dur), dur * 0.25, dur * 0.25));
  put(out, body, 0, 0.7);
  put(out, burst(0.025, { lo: 400, hi: 3000, tau: 0.008 }), sec(dur * 0.22), 0.5 * size);
  for (let i = 0; i < irand(3, 8); i++) {
    put(out, bubble(logRand(250, 1100), { rise: rand(0.1, 0.35), damp: 0.8 }), sec(rand(0.15, dur)), rand(0.15, 0.5));
  }
  return normPeak(out, 1);
}

/**
 * Ola: crecida grave con filtro que se abre, rompiente de banda ancha y
 * resaca con espuma (burbujas diminutas) y, opcionalmente, guijarros.
 */
export function wave({ build = 2.6, crash = 0.35, wash = 5.5, size = 1, bright = 3600, foam = 1, pebbles = 0 } = {}) {
  const dur = build + crash + wash;
  const n = sec(dur + 2);
  const cut = new Float32Array(n);
  const amp = new Float32Array(n);
  const fEnv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (t < build) {
      const u = t / build;
      cut[i] = 220 * Math.pow((bright * 0.45) / 220, u * u);
      amp[i] = 0.32 * u * u;
    } else if (t < build + crash) {
      const u = (t - build) / crash;
      cut[i] = bright * 0.45 + bright * 0.55 * u;
      amp[i] = 0.32 + 0.68 * Math.sin((Math.PI / 2) * u);
    } else {
      const u = (t - build - crash) / wash;
      cut[i] = Math.max(400, bright * Math.pow(0.14, Math.min(1.3, u)));
      amp[i] = Math.exp(-u * 3);
    }
    const tf = t - build - crash * 0.6;
    fEnv[i] = tf < 0 ? 0 : Math.min(1, tf / 0.4) * Math.exp(-tf / (wash * 0.3));
  }
  const src = add(pink(n), brown(n), 0.6);
  const body = mul(lp(lp(src, cut, 0.6), cut, 0.6), amp);
  const out = normRms(body, 0.1);
  if (foam) {
    const fz = band(dust(9000, { env: fEnv, n, shape: 2.6 }), 2000, 7500);
    add(out, normRms(fz, 0.1), foam * 0.3);
  }
  if (pebbles) {
    const pe = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR - build - crash - 0.8;
      pe[i] = t < 0 ? 0 : Math.min(1, t / 1.2) * Math.exp(-t / (wash * 0.35));
    }
    const pebbleBank = bank(60, () => {
      const f = logRand(1500, 5200);
      const ev = burst(rand(0.004, 0.012), { lo: f / 1.5, hi: f * 1.5, tau: rand(0.001, 0.003), q: rand(2, 5) });
      return normPeak(ev, 1);
    });
    const pz = buf(n);
    poisson(260, (t) => {
      const i = Math.floor(t * SR);
      if (i < n && rnd() < pe[i]) put(pz, pick(pebbleBank), i, vary(0, 6));
    }, { to: dur });
    add(out, normRms(pz, 0.1), pebbles * 0.6);
  }
  const fade = sec(1.5);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= Math.pow(i / fade, 2);
  return scale(out, size);
}

/* ----------------------------------------------------------------- fuego */

/**
 * Chasquido de madera: un impulso muy corto que excita dos resonancias del
 * leño (1–4 kHz, pocos milisegundos) y un golpe grave sordo. Suena a «toc»
 * seco y no a clic digital.
 */
export function woodCrack({ bright = 1 } = {}) {
  const f1 = logRand(1100, 3400) * bright;
  const ev = modal([
    [f1, 1, rand(0.0025, 0.007)],
    [f1 * rand(1.55, 2.3), rand(0.25, 0.6), rand(0.0015, 0.004)],
    [logRand(260, 620), rand(0.25, 0.7), rand(0.006, 0.014)],
  ], { dur: 0.04, attack: 0.0002, strike: rand(0.1, 0.35), strikeLp: 5000 });
  return normPeak(ev, 1);
}

/** Estallido de un nudo o una bolsa de resina: golpe grave y lluvia de chispas. */
export function knotPop() {
  const ev = buf(sec(0.6));
  put(ev, modal([[rand(110, 240), 1, rand(0.025, 0.045)], [rand(380, 700), 0.35, 0.012]], { dur: 0.25, attack: 0.0008, strike: 0.5, strikeLp: 2200 }), 0, 1);
  let t = rand(0.004, 0.02);
  for (let i = 0, n = irand(4, 11); i < n; i++) {
    put(ev, woodCrack({ bright: 1.1 }), sec(t), Math.pow(rnd(), 1.5) * 0.45);
    t += -Math.log(1 - rnd()) * 0.035;
    if (t > 0.55) break;
  }
  return normPeak(ev, 1);
}

/**
 * Fuego realista:
 *  - cuerpo: turbulencia cálida entre 150 y 1000 Hz que parpadea y «lame»,
 *  - avivamientos: soplos breves de llama que crece,
 *  - chasquidos de madera en racimos, con amplitudes de cola larga,
 *  - crepitar fino de brasas que sigue a la llama,
 *  - estallidos de nudos y algún silbido de vapor muy suave.
 * Todo con una caída suave de agudos para que no resulte áspero.
 */
export function hearth({
  size = 1, crackle = 2.4, sizzle = 1, pops = 0.08, flare = 0.14, whistle = 0.02, flicker = 2.2, levels = {},
} = {}) {
  const L = { body: 0, low: -11, flare: -3, crackle: -3, sizzle: -14, pops: -5, whistle: -24, ...levels };
  const out = buf();
  // Parpadeo: lento (respiración de la llama) y rápido (aleteo), periódicos.
  const slow = range(lfo(0.12, { slope: 1, parts: 10 }), 0.7, 1);
  const flick = range(lfo(flicker, { minHz: 0.4, slope: 0.7, parts: 24 }), 0.5, 1, 1.3);
  const flutter = range(lfo(11, { minHz: 5, slope: 0.2, parts: 20 }), 0.82, 1);
  const life = new Float32Array(N);
  for (let i = 0; i < N; i++) life[i] = slow[i] * flick[i] * flutter[i];

  // Cuerpo de la llama: dos bandas que se mueven en contrafase.
  const lick = range(lfo(0.9, { minHz: 0.2, slope: 0.8 }), 0, 1);
  const warm = bp(pink(), 300 * Math.sqrt(size), 0.55);
  const airy = bp(pink(), 760, 0.8);
  const body = new Float32Array(N);
  for (let i = 0; i < N; i++) body[i] = (warm[i] * (0.75 + 0.25 * lick[i]) + airy[i] * 0.55 * (1.15 - lick[i])) * life[i];
  add(out, normRms(lp(body, 1400, 0.6), 0.1), db(L.body) * size);
  // Base grave de la combustión, discreta.
  const low = mul(band(brown(), 55, 170), slow);
  add(out, normRms(low, 0.1), db(L.low) * size);

  // Avivamientos: soplos de 1–3 s con la banda subiendo un poco.
  if (flare > 0) {
    const fl = buf();
    poisson(flare, (t) => {
      const d = rand(1, 3);
      const n = sec(d);
      const ev = mul(band(pink(n), rand(220, 320), rand(1000, 1700), { circular: false }), envBell(n, 1.6));
      putAt(fl, ev, t, vary(0, 3));
    });
    if (rms(fl) > 0) add(out, normActive(fl, 0.1), db(L.flare) * size);
  }

  // Chasquidos en racimos y sueltos.
  const cr = buf();
  const cBank = bank(120, () => woodCrack());
  poisson(crackle / 5, (t) => {
    let tt = t;
    let g = Math.pow(rnd(), 0.6);
    for (let j = 0, m = irand(3, 14); j < m; j++) {
      putAt(cr, pick(cBank), tt, g * Math.pow(rnd(), 2.2));
      tt += -Math.log(1 - rnd()) * rand(0.012, 0.06);
      g *= rand(0.8, 1);
    }
  });
  poisson(crackle * 0.6, (t) => putAt(cr, pick(cBank), t, Math.pow(rnd(), 3) * 0.8));
  add(out, normActive(tame(lp(cr, 6500, 0.6), 11), 0.1), db(L.crackle));

  // Crepitar fino: muchos ticks muy suaves que crecen con la llama.
  if (sizzle > 0) {
    const sz = mul(lp(bp(dust(260 * sizzle, { shape: 3.2 }), 2300, 0.7), 5200), life);
    add(out, normActive(tame(sz, 14), 0.1), db(L.sizzle));
  }

  // Estallidos de nudos.
  if (pops > 0) {
    const pp = buf();
    const pBank = bank(6, knotPop);
    poisson(pops, (t) => putAt(pp, pick(pBank), t, vary(0, 2.5)));
    if (rms(pp) > 0) add(out, normActive(tame(pp, 12), 0.1), db(L.pops));
  }

  // Silbido de vapor: muy raro y muy suave.
  if (whistle > 0) {
    const wh = buf();
    poisson(whistle, (t) => {
      const d = rand(1.2, 2.6);
      const n = sec(d);
      const f = logRand(1800, 3200);
      const ev = tone(d, { f: (u) => f * (1 + 0.04 * u), amp: (u) => Math.pow(Math.sin(Math.PI * u), 1.4), vib: 0.006, vibRate: 7 });
      add(ev, mul(bp(white(n), f, 12, { circular: false }), envBell(n, 1.4)), 0.6);
      putAt(wh, ev, t, 1);
    });
    if (rms(wh) > 0) add(out, normActive(wh, 0.1), db(L.whistle));
  }
  // Tono final: agudos suaves.
  return lp(highShelf(out, 4500, -3), 9500, 0.6);
}

/* ------------------------------------------------------------------ aves */

/** Sílaba de ave: silbido con contorno de frecuencia y envolvente suave. */
export function syl(dur, f0, f1 = f0, { shape = 'line', vib = 0, vibRate = 30, h2 = 0.06, h3 = 0, attack = 0.25, curve = 0.8 } = {}) {
  const contour = {
    line: (u) => f0 + (f1 - f0) * u,
    exp: (u) => f0 * Math.pow(f1 / f0, u),
    arch: (u) => f0 + (f1 - f0) * Math.sin(Math.PI * u),
    hook: (u) => f0 + (f1 - f0) * (1 - Math.pow(1 - u, 3)),
  }[shape];
  return tone(dur, {
    f: contour,
    amp: (u) => {
      const a = u < attack ? Math.sin((Math.PI / 2) * (u / attack)) : 1;
      return a * Math.pow(Math.sin(Math.PI * u), curve);
    },
    harm: [[1, 1], [2, h2], [3, h3]],
    vib,
    vibRate,
  });
}
/** Encadena sílabas: lista de [evento, separación tras el evento (s), ganancia]. */
export function phrase(parts) {
  const total = parts.reduce((s, [ev, gap]) => s + ev.length / SR + gap, 0);
  const out = buf(sec(total + 0.05));
  let t = 0;
  for (const [ev, gap, g = 1] of parts) {
    put(out, ev, sec(t), g);
    t += ev.length / SR + gap;
  }
  return out;
}

/** Mirlo: frase aflautada y grave con remate agudo y suave. */
export function blackbird() {
  const parts = [];
  const notes = irand(3, 6);
  let base = rand(1500, 2300);
  for (let i = 0; i < notes; i++) {
    const shape = pick(['line', 'arch', 'hook', 'exp']);
    const f0 = jitter(base, 0.18);
    const f1 = f0 * pick([rand(1.1, 1.45), rand(0.7, 0.92), rand(0.95, 1.05)]);
    parts.push([syl(rand(0.09, 0.3), f0, f1, { shape, vib: rand(0, 0.02), vibRate: rand(20, 40), h2: 0.1 }), rand(0.03, 0.09), rand(0.6, 1)]);
    base = jitter(base, 0.12);
  }
  if (chance(0.75)) {
    for (let i = 0; i < irand(3, 7); i++) {
      const f = rand(3600, 6200);
      parts.push([syl(rand(0.025, 0.05), f, f * rand(0.75, 1.25), { shape: 'line', h2: 0.02 }), rand(0.01, 0.03), rand(0.2, 0.4)]);
    }
  }
  return phrase(parts);
}
/** Petirrojo: gorjeo agudo y fino, notas rápidas y algún trino. */
export function robin() {
  const parts = [];
  const n = irand(7, 14);
  for (let i = 0; i < n; i++) {
    if (chance(0.18)) {
      const f = rand(3500, 6500);
      const k = irand(4, 8);
      for (let j = 0; j < k; j++) parts.push([syl(0.03, f, f * 0.85, { h2: 0.03 }), 0.025, 0.6]);
    } else {
      const f0 = rand(2600, 7200);
      parts.push([syl(rand(0.03, 0.13), f0, f0 * rand(0.65, 1.4), { shape: pick(['line', 'arch', 'exp']), h2: 0.03, vib: rand(0, 0.03), vibRate: rand(40, 80) }), rand(0.015, 0.07), rand(0.5, 1)]);
    }
  }
  return phrase(parts);
}
/** Carbonero común: “ti-tu ti-tu ti-tu”. */
export function greatTit() {
  const hi = rand(4800, 5800), lo = hi * rand(0.62, 0.72);
  const parts = [];
  const reps = irand(3, 6);
  for (let i = 0; i < reps; i++) {
    parts.push([syl(0.075, hi, hi * 0.97, { h2: 0.03 }), 0.035, 0.9]);
    parts.push([syl(0.1, lo * 1.05, lo, { shape: 'exp', h2: 0.05 }), 0.11, 1]);
  }
  return phrase(parts);
}
/** Pinzón vulgar: trino descendente que se acelera y remate final. */
export function chaffinch() {
  const parts = [];
  let f = rand(5200, 6000);
  const a = irand(4, 6);
  for (let i = 0; i < a; i++) {
    parts.push([syl(0.055, f, f * 0.8, { h2: 0.04 }), 0.05 - i * 0.004, 0.8]);
    f *= 0.97;
  }
  f = rand(3800, 4400);
  const b = irand(3, 5);
  for (let i = 0; i < b; i++) {
    parts.push([syl(0.07, f * 1.1, f * 0.85, { shape: 'arch', h2: 0.05 }), 0.035, 1]);
    f *= 0.95;
  }
  parts.push([syl(0.28, rand(4600, 5200), rand(2400, 2900), { shape: 'hook', vib: 0.03, vibRate: 55, h2: 0.06 }), 0, 1]);
  return phrase(parts);
}
/** Paloma torcaz: “cu-CUU-cu, cu-cu”, grave y aterciopelada. */
export function woodPigeon() {
  const f = rand(380, 440);
  const coo = (dur, k = 1, g = 1) => {
    const ev = tone(dur, {
      f: (u) => f * k * (1 + 0.06 * Math.sin(Math.PI * u) - 0.04 * u),
      amp: (u) => Math.pow(Math.sin(Math.PI * u), 0.7),
      harm: [[1, 1], [2, 0.22], [3, 0.06]],
    });
    const br = mul(band(white(ev.length), 250, 900), envBell(ev.length, 1));
    return scale(add(ev, br, 0.06), g);
  };
  const parts = [];
  const reps = irand(3, 5);
  for (let r = 0; r < reps; r++) {
    parts.push([coo(0.32, 1, 0.7), 0.14], [coo(0.55, 1.05, 1), 0.16], [coo(0.3, 1, 0.7), 0.26], [coo(0.24, 0.98, 0.65), 0.1], [coo(0.24, 0.98, 0.6), 0.55]);
  }
  return phrase(parts);
}
/** Tórtola turca: “cu-CUUU-cu”. */
export function collaredDove() {
  const f = rand(470, 530);
  const coo = (dur, k, g) => tone(dur, {
    f: (u) => f * k * (1 - 0.05 * u),
    amp: (u) => Math.pow(Math.sin(Math.PI * u), 0.6) * g,
    harm: [[1, 1], [2, 0.18], [3, 0.05]],
  });
  const parts = [];
  for (let r = 0; r < irand(2, 4); r++) parts.push([coo(0.22, 1, 0.7), 0.06], [coo(0.6, 1.08, 1), 0.08], [coo(0.3, 0.9, 0.75), 0.9]);
  return phrase(parts);
}
/** Tórtola europea: ronroneo “turrr turrr”. */
export function turtleDove() {
  const f = rand(500, 580);
  const purr = () => tone(rand(0.55, 0.75), {
    f: (u) => f * (1 - 0.08 * u),
    amp: (u) => Math.pow(Math.sin(Math.PI * u), 0.6) * (0.55 + 0.45 * Math.sin(TAU * 34 * u * 0.65)),
    harm: [[1, 1], [2, 0.3], [3, 0.1]],
  });
  const parts = [];
  for (let r = 0; r < irand(3, 5); r++) parts.push([purr(), rand(0.35, 0.6)]);
  return phrase(parts);
}
/** Cuco: “cu-cú”. */
export function cuckoo() {
  const f = rand(640, 720);
  const note = (dur, k) => tone(dur, {
    f: (u) => f * k * (1 - 0.02 * u),
    amp: (u) => Math.pow(Math.sin(Math.PI * u), 0.5),
    harm: [[1, 1], [2, 0.12], [3, 0.03]],
  });
  return phrase([[note(0.17, 1), 0.13], [note(0.3, 0.81), 0]]);
}
/** Gorjeo diminuto y lejano para dar profundidad. */
export const tinyChirp = () => {
  const f = rand(3000, 7000);
  const n = irand(1, 4);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push([syl(rand(0.02, 0.06), f, f * rand(0.7, 1.3), { h2: 0.02 }), rand(0.02, 0.06), rand(0.5, 1)]);
  return phrase(parts);
};

/** Programa a un individuo cantando frases con pausas a lo largo del bucle. */
export function singer(bus, make, { gap = [3, 6], d = 0.3, g = 1, start = rand(0, 2), variants = 4, to = SECONDS } = {}) {
  const songs = bank(variants, make);
  let t = start;
  while (t < to) {
    const s = pick(songs);
    bus.place(s, t, { g: g * vary(0, 1.5), d });
    t += s.length / SR + rand(gap[0], gap[1]);
  }
}

/* ------------------------------------------------------------- rapaces */

/** Autillo: “tiú” puro y regular. */
export const scopsOwl = (f = rand(1150, 1350)) => tone(0.2, {
  f: (u) => f * (1.02 - 0.05 * u),
  amp: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7),
  harm: [[1, 1], [2, 0.07]],
});
/** Cárabo macho: “huuu… hu, hu-hu-huhuuuu”. */
export function tawnyOwl(part = 'both') {
  const f = rand(400, 450);
  const breath = (ev) => add(ev, mul(band(white(ev.length), 350, 1300), envBell(ev.length, 1)), 0.03);
  const hoot = breath(tone(0.95, {
    f: (u) => f * (1 + 0.03 * Math.sin(Math.PI * u) - 0.05 * u * u),
    amp: (u) => (u < 0.08 ? u / 0.08 : 1) * Math.pow(1 - u, 0.6),
    harm: [[1, 1], [2, 0.12], [3, 0.04]],
  }));
  const trem = breath(tone(1.7, {
    f: (u) => f * 0.98 * (1 + 0.02 * Math.sin(TAU * 11 * u * 1.7)),
    amp: (u) => {
      const am = u < 0.45 ? 0.5 + 0.5 * Math.sin(TAU * 10 * u * 1.7 - Math.PI / 2) : 1;
      return am * (u < 0.03 ? u / 0.03 : 1) * Math.pow(1 - u, 0.8);
    },
    harm: [[1, 1], [2, 0.12], [3, 0.04]],
  }));
  if (part === 'hoot') return hoot;
  if (part === 'trem') return phrase([[syl(0.14, f, f * 0.97, { h2: 0.1 }), 0.25, 0.7], [trem, 0]]);
  return phrase([[hoot, 3.2], [syl(0.14, f, f * 0.97, { h2: 0.1 }), 0.25, 0.7], [trem, 0]]);
}
/** Cárabo hembra: “ke-wick”. */
export const kewick = () => {
  const ev = tone(0.32, {
    f: (u) => 1350 + 600 * Math.sin(Math.PI * Math.min(1, u * 1.4)),
    amp: (u) => Math.pow(Math.sin(Math.PI * u), 0.5),
    harm: [[1, 1], [2, 0.35], [3, 0.15]],
  });
  return add(ev, mul(band(white(ev.length), 1200, 4000), envBell(ev.length, 1)), 0.08);
};

/* -------------------------------------------------------------- insectos */

/** Grillo de campo: chirridos de 3–5 pulsos con portadora casi pura. */
export function fieldCricket({ f = rand(4200, 5100), period = rand(0.36, 0.6), pulses = irand(3, 5), pause = 0.15 } = {}) {
  const pulseDur = rand(0.014, 0.02);
  const pulseGap = rand(0.03, 0.04);
  const chirp = () => {
    const ev = buf(sec(pulses * pulseGap + 0.03));
    for (let p = 0; p < pulses; p++) {
      const fp = f * rand(0.995, 1.005);
      const pl = tone(pulseDur, {
        f: (u) => fp * (1.012 - 0.024 * u),
        amp: (u) => Math.pow(Math.sin(Math.PI * u), 0.55),
        harm: [[1, 1], [2, 0.05], [3, 0.03]],
      });
      put(ev, pl, sec(p * pulseGap), p === 0 ? 0.75 : rand(0.85, 1));
    }
    return ev;
  };
  const variants = bank(4, chirp);
  const out = buf();
  const level = range(lfo(0.06), 0.6, 1);
  let silentUntil = -1;
  for (const t of regular(period, { offset: rand(0, period), jitter: 0.03 })) {
    if (t < silentUntil) continue;
    if (chance(pause / 10)) {
      silentUntil = t + rand(1, 3);
      continue;
    }
    putAt(out, pick(variants), t, level[Math.floor(t * SR) % N]);
  }
  return out;
}
/** Grillo arbóreo: trino continuo y suave (pulsos a 35–60 Hz). */
export function treeCricket({ f = rand(2500, 3100), rate = rand(36, 58) } = {}) {
  const pulse = tone(0.6 / rate, {
    f: (u) => f * (1.005 - 0.01 * u),
    amp: (u) => Math.pow(Math.sin(Math.PI * u), 0.7),
    harm: [[1, 1], [2, 0.04]],
  });
  const out = buf();
  const level = range(lfo(0.08), 0.35, 1, 0.8);
  // Pausas breves de vez en cuando.
  const gate = smooth(Float32Array.from(range(lfo(0.12, { slope: 0.5 }), -3, 4), (v) => (v > 0 ? 1 : 0)), 0.15);
  for (const t of regular(1 / rate)) {
    const i = Math.floor(t * SR) % N;
    const g = level[i] * gate[i];
    if (g > 0.01) putAt(out, pulse, t, g * rand(0.9, 1));
  }
  return out;
}
/** Saltamontes (chicharra verde): “ka-ty-did” rasposo. */
export function katydid() {
  const syllable = () => {
    const d = rand(0.04, 0.07);
    const n = sec(d);
    const clicks = buf(n);
    const rate = rand(220, 300);
    for (let t = 0; t < d; t += 1 / rate) clicks[Math.floor(t * SR)] = rand(0.6, 1);
    return mul(bp(bp(clicks, rand(5500, 7500), 4), rand(6000, 7000), 3), envBell(n, 0.6));
  };
  const parts = [];
  for (let i = 0; i < irand(2, 3); i++) parts.push([syllable(), rand(0.09, 0.14)]);
  return normPeak(phrase(parts), 1);
}
/** Cigarra (Cicada orni): equemas pulsadas, ronroneo seco y agudo. */
export function cicada({ f = rand(3800, 5200), rate = rand(5, 7), bout = [5, 11], rest = [2, 6] } = {}) {
  const echeme = () => {
    const d = rand(0.06, 0.1);
    const n = sec(d);
    const tym = buf(n);
    const tr = rand(160, 240);
    for (let t = 0; t < d; t += 1 / tr) tym[Math.floor(t * SR)] = 1;
    return mul(bp(bp(tym, f, 3.5), f * 1.1, 2.5), envBell(n, 0.8));
  };
  const variants = bank(4, echeme);
  const out = buf();
  let t = rand(0, 3);
  while (t < SECONDS) {
    const len = rand(bout[0], bout[1]);
    const end = t + len;
    for (let s = t; s < end; s += 1 / rate + rand(-0.01, 0.01)) {
      const u = (s - t) / len;
      putAt(out, pick(variants), s, Math.min(1, u * 4) * Math.min(1, (1 - u) * 3));
    }
    t = end + rand(rest[0], rest[1]);
  }
  return out;
}

/* ------------------------------------------------------------- anfibios */

/** Sapo partero: “piú” de campanita, muy puro. */
export const midwifeToad = (f = rand(1400, 2100)) => tone(0.14, {
  f: (u) => f * (1.01 - 0.035 * u),
  amp: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.6),
  harm: [[1, 1], [2, 0.05]],
});
/** Ranita meridional: “craaa” pulsado con formantes. */
export function treeFrog() {
  const d = rand(0.22, 0.34);
  const n = sec(d);
  const imp = buf(n);
  const rate = rand(105, 135);
  for (let t = 0; t < d; t += 1 / rate) imp[Math.floor(t * SR)] = rand(0.8, 1);
  const x = add(bp(imp, rand(900, 1100), 5), bp(imp, rand(2000, 2400), 6), 0.6);
  return normPeak(mul(x, envAD(n, d * 0.3, d * 0.4)), 1);
}

/* ---------------------------------------------------- instrumentos suaves */

export const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Caja de música: lengüeta con parciales inarmónicos rápidos. */
export function musicBox(f, vel = 1) {
  const tau = 1.9 * Math.sqrt(523 / f);
  return scale(modal([
    [f, 1, tau], [f * 2, 0.1, tau * 0.45], [f * 3, 0.04, tau * 0.3],
    [f * 5.93, 0.12, 0.06], [f * 9.4, 0.04, 0.03],
  ], { dur: Math.min(6, tau * 5), attack: 0.0015, strike: 0.18, strikeLp: 7000 }), vel);
}
/** Kalimba: lengüeta metálica con golpe grave y armónico inarmónico breve. */
export function kalimba(f, vel = 1) {
  const tau = 1.3 * Math.sqrt(392 / f);
  return scale(modal([
    [f, 1, tau], [f * 2.01, 0.06, tau * 0.4], [f * 5.4, 0.18, 0.05], [f * 0.5, 0.05, 0.08],
  ], { dur: Math.min(5, tau * 5), attack: 0.003, strike: 0.25, strikeLp: 1600 }), vel);
}
/** Celesta / campana suave. */
export function celesta(f, vel = 1) {
  const tau = 1.6 * Math.sqrt(523 / f);
  return scale(modal([
    [f, 1, tau], [f * 2, 0.22, tau * 0.5], [f * 3, 0.06, tau * 0.3], [f * 4.01, 0.08, tau * 0.25],
  ], { dur: Math.min(6, tau * 5), attack: 0.004, strike: 0.08, strikeLp: 5000 }), vel);
}
/** Acorde de pad (evento con ataque y relajación lentos). */
export function padChord(freqs, dur, { harm = 7, rolloff = 1.5, cents = 6, attack = 1.2, release = 1.6, vib = 0.002 } = {}) {
  const n = sec(dur);
  const out = buf(n);
  for (const f0 of freqs) {
    for (let v = 0; v < 3; v++) {
      const f = f0 * Math.pow(2, (cents * (v - 1) + rand(-1, 1)) / 1200);
      const ev = tone(dur, {
        f,
        harm: Array.from({ length: harm }, (_, h) => [h + 1, Math.pow(h + 1, -rolloff)]),
        vib,
        vibRate: rand(4, 5.5),
        phase: rand(0, TAU),
      });
      add(out, ev, 1 / 3);
    }
  }
  return mul(lp(out, 2600, 0.6), envASR(n, attack, release));
}

/** Cuenco tibetano: modos de placa con batidos (“uá-uá”) y decaimiento largo. */
export function bowl(f, vel = 1, { tau = 13 } = {}) {
  return scale(modal([
    [f, 1, tau, rand(0.6, 1.2)],
    [f * 2.76, 0.5, tau * 0.55, rand(1.2, 2.2)],
    [f * 5.4, 0.2, tau * 0.28, rand(2, 3.2)],
    [f * 8.93, 0.07, tau * 0.14, rand(2.5, 4)],
  ], { dur: 22, attack: 0.006, strike: 0.25, strikeLp: 1600 }), vel);
}
/** Campana tubular de viento (barra libre-libre). */
export function chime(f, vel = 1) {
  return scale(modal([
    [f, 1, 3.4], [f * 2.76, 0.45, 1.6], [f * 5.4, 0.2, 0.8], [f * 8.93, 0.06, 0.35],
  ], { dur: 8, attack: 0.001, strike: 0.12, strikeLp: 7000 }), vel);
}

/**
 * Piano de fieltro: parciales casi armónicos (leve inarmonicidad de cuerda),
 * cada uno con un gemelo desafinado ~1,5 cents (cuerdas al unísono, batido
 * lento), decaimiento en dos fases y martillo blando. Cuanto menor la
 * velocidad, más oscuro.
 */
export function feltPiano(f, vel = 1) {
  const tau = 2.6 * Math.pow(262 / f, 0.55);
  const soft = 0.5 + 0.5 * vel;
  const modes = [];
  for (let h = 1; h <= 9; h++) {
    const fh = f * h * Math.sqrt(1 + 0.00035 * h * h);
    if (fh > 6500) break;
    const a = Math.pow(h, -1.5) * Math.pow(soft, h - 1);
    const t = tau / (1 + 0.6 * (h - 1));
    modes.push([fh, a * 0.75, t], [fh * 1.0009, a * 0.2, t * 0.9], [fh, a * 0.3, t * 0.12]);
  }
  const x = modal(modes, { dur: Math.min(7, tau * 3.5), attack: 0.005, strike: 0.04, strikeLp: 700 });
  return scale(lp(x, 1800 + 2200 * vel, 0.6), vel);
}

/** Cuerda pulsada modal: `pos` es el punto de pulsación (fija qué armónicos faltan). */
function pluck(f, vel, { tau, pos, bright, lpHz, strike = 0.03, harm = 12 }) {
  const modes = [];
  for (let h = 1; h <= harm; h++) {
    const fh = f * h * (1 + 0.00015 * h * h);
    if (fh > 8000) break;
    modes.push([fh, Math.abs(Math.sin(Math.PI * h * pos)) / h, tau / (1 + bright * Math.pow(h - 1, 1.3))]);
  }
  const x = modal(modes, { dur: Math.min(6, tau * 4), attack: 0.002, strike, strikeLp: 3000 });
  return scale(lp(x, lpHz, 0.6), vel);
}
/** Arpa: cuerda larga y redonda, pulsada cerca del centro. */
export const harp = (f, vel = 1) => pluck(f, vel, { tau: 2.2 * Math.pow(262 / f, 0.6), pos: 0.2, bright: 0.35, lpHz: 5000 });
/** Guitarra de nailon: más corta y cálida, pulsada cerca del puente. */
export const nylon = (f, vel = 1) => pluck(f, vel, { tau: 1.5 * Math.pow(196 / f, 0.5), pos: 0.14, bright: 0.5, lpHz: 3600, strike: 0.04 });

/** Vibráfono suave: láminas afinadas 1:4:10, baqueta blanda y motor lento. */
export function vibes(f, vel = 1) {
  const tau = 2.8 * Math.pow(440 / f, 0.5);
  const x = modal([
    [f, 1, tau], [f * 4, 0.16, tau * 0.3], [f * 10, 0.04, tau * 0.1],
  ], { dur: Math.min(7, tau * 3.5), attack: 0.003, strike: 0.04, strikeLp: 2500 });
  const rate = rand(3.8, 4.6);
  const ph = rand(0, TAU);
  for (let i = 0; i < x.length; i++) x[i] *= 1 - 0.16 * (0.5 - 0.5 * Math.cos((TAU * rate * i) / SR + ph));
  return scale(x, vel);
}

/**
 * Voz sostenida suave (flauta de madera u ocarina lejana): casi senoidal,
 * soplo leve con un pequeño «chiff» al empezar y vibrato que llega tarde.
 * `dur` es la duración de la nota (s); la relajación se añade al final.
 */
export function softLead(f, vel = 1, dur = 1.5, { attack = 0.14, release = 0.5, breath = 0.1, vib = 0.004 } = {}) {
  const total = dur + release;
  const n = sec(total);
  const onset = Math.min(0.5, dur * 0.35);
  const vibRate = rand(4.6, 5.3);
  const ph0 = rand(0, TAU);
  const body = tone(total, {
    f: (u) => {
      const t = u * total;
      const depth = vib * Math.min(1, Math.max(0, (t - onset) / 0.6));
      return f * (1 + depth * Math.sin(TAU * vibRate * t + ph0));
    },
    harm: [[1, 1], [2, 0.14], [3, 0.05], [4, 0.015]],
    phase: rand(0, TAU),
  });
  const env = new Float32Array(n);
  const na = Math.max(1, sec(attack));
  const nd = Math.min(n - 1, sec(dur));
  for (let i = 0; i < n; i++) {
    let a = i < na ? 0.5 - 0.5 * Math.cos((Math.PI * i) / na) : 1;
    a *= 1 - 0.15 * Math.min(1, i / Math.max(1, nd));
    if (i >= nd) a *= 0.5 + 0.5 * Math.cos((Math.PI * (i - nd)) / Math.max(1, n - nd));
    env[i] = a;
  }
  const air = bp(white(n), Math.min(4000, f * 3), 0.8);
  const chiff = sec(0.08);
  for (let i = 0; i < n; i++) air[i] *= breath * env[i] * (1 + 2.5 * Math.exp(-i / chiff));
  const out = mul(body, env);
  add(out, air);
  return scale(lp(out, 3500, 0.6), vel);
}

/**
 * Pulsación de tanpura: cuerda rica en armónicos cuyo formante sube con el
 * tiempo (efecto jawari) y decae despacio.
 */
export function tanpura(f, { dur = 6.5, harm = 26 } = {}) {
  const n = sec(dur);
  const out = buf(n);
  const step = 32;
  const decay = 2.6;
  for (let h = 1; h <= harm; h++) {
    const fh = f * h * (1 + 0.0004 * h);
    if (fh > SR * 0.45) break;
    const w = (TAU * fh) / SR;
    const c = Math.cos(w), s = Math.sin(w);
    let re = Math.cos(rand(0, TAU)), im = Math.sin(rand(0, TAU));
    const m0 = Math.hypot(re, im); re /= m0; im /= m0;
    let g = 0, gNext = 0;
    for (let i = 0; i < n; i++) {
      if (i % step === 0) {
        g = gNext;
        const t = (i + step) / SR;
        const center = 2 + 22 * Math.pow(Math.min(1, t / (dur * 0.7)), 0.7);
        const bump = 0.25 + 0.75 * Math.exp(-(((h - center) / 4.5) ** 2));
        gNext = Math.pow(h, -0.9) * bump * Math.exp(-t / decay) * Math.min(1, t / 0.008);
      }
      const gi = g + ((gNext - g) * (i % step)) / step;
      out[i] += im * gi;
      const r2 = re * c - im * s;
      im = re * s + im * c;
      re = r2;
    }
  }
  const fade = sec(0.3);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return normPeak(out, 1);
}
