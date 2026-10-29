/**
 * Paisajes sonoros de alta calidad: escenas 04 a 08 de cada ambiente. Las 04–06
 * son paisaje puro; las 07–08 añaden una melodía sutil y, a veces, un pad.
 *
 * Cada escena es una receta determinista (semilla `<id>/<escena>`) que mezcla
 * fuentes de `sources.js` y devuelve 30 s de audio mono a 22,05 kHz que se
 * repite sin costura. `renderScene` aplica la masterización común: sonoridad
 * objetivo (≈ −23 LUFS, como las escenas 01–03) y limitador a −3 dBFS.
 */

import {
  SAMPLE_RATE as SR, SECONDS, N,
  seed, rnd, rand, irand, chance, pick, logRand, jitter,
  db, sec, buf, add, mul, normActive, put,
  pink, brown, white, lp, bp, band,
  lfo, range, envBell, additive, modal, bubble, burst, bank, poisson, regular, dust, master, tame,
  scale, reverb, hp, loudness,
} from './dsp.js';
import * as S from './sources.js';

const { Bus, scatter, gusts, vary } = S;

/**
 * Mezcla capas [señal, dB, envío a reverb, cresta máxima en dB, 'Nombre']
 * normalizadas por nivel activo. La cresta limita los picos de cada capa
 * respecto a su nivel (gotas, chasquidos) para que la masterización no tenga
 * que aplastar. El nombre (opcional, siempre el último) identifica la capa en
 * el laboratorio. `post` es un proceso lineal (filtro) que se aplica al final.
 *
 * Con `renderLayers` activo, además de la mezcla se guarda cada capa por
 * separado (su parte seca más su reverb): como la reverb y `post` son
 * lineales, la suma de las capas es exactamente la mezcla.
 */
let capture = null;
function mix(layers, rv, post = null) {
  const bus = new Bus();
  const parts = [];
  for (const layer of layers) {
    const named = typeof layer[layer.length - 1] === 'string';
    const [x, d = 0, wet = 0, crest = 20] = named ? layer.slice(0, -1) : layer;
    if (!x) continue;
    const y = normActive(tame(x, crest), 0.1);
    bus.layer(y, { g: db(d), wet });
    if (capture) parts.push({ name: named ? layer[layer.length - 1] : null, y, g: db(d), wet });
  }
  if (capture) {
    capture.push(parts.map(({ name, y, g, wet }, k) => {
      const stem = scale(Float32Array.from(y), g);
      if (rv && wet) add(stem, reverb(scale(Float32Array.from(y), g * wet), rv), rv.gain ?? 1);
      return { name: name || `Capa ${k + 1}`, samples: post ? post(stem) : stem };
    }));
  }
  const out = rv ? bus.render(rv) : bus.dry;
  return post ? post(out) : out;
}

/** Proceso final lineal: paso bajo suave. */
const lowpass = (f) => (x) => lp(x, f, 0.6);

/* ---------------------------------------------------------- utilidades */

function evolvingPad(notes, { voices = 3, cents = 6, harm = 8, rolloff = 1.5, swellHz = 0.06, swellLo = 0.3, brightLo = 0.25, brightHz = 0.04, gains } = {}) {
  const bright = range(lfo(brightHz, { slope: 1.2 }), brightLo, 1);
  const brightH = Array.from({ length: harm }, (_, h) => bright.map((b) => Math.pow(b, h * 0.7)));
  const out = buf();
  notes.forEach((f, k) => {
    const note = buf();
    for (let h = 1; h <= harm; h++) {
      const partials = [];
      for (let v = 0; v < voices; v++) {
        const fv = f * Math.pow(2, (cents * (v - (voices - 1) / 2) + rand(-1.5, 1.5)) / 1200);
        partials.push({ f: fv * h, a: Math.pow(h, -rolloff) / voices });
      }
      add(note, mul(additive(partials), brightH[h - 1]));
    }
    mul(note, range(lfo(swellHz, { slope: 1 }), swellLo, 1));
    add(out, note, gains ? gains[k] : 1);
  });
  return out;
}

/**
 * Secuencia de notas [pulso, midi, velocidad, duración en pulsos] con un
 * instrumento. La duración solo la usan los instrumentos sostenidos.
 */
function sequence(bus, notes, beat, inst, { humanize = 0.012, g = 1, d = 0, offset = 0, wet } = {}) {
  for (const [b, m, vel = 1, len] of notes) {
    bus.place(inst(S.midi(m), vel * rand(0.88, 1), len == null ? undefined : len * beat), offset + b * beat + rand(-humanize, humanize), { g, d, wet });
  }
}

/* ------------------------------------------------- utilidades musicales */

/** Sala para la música: más larga y suave que la reverb del paisaje. */
const HALL = { t60: 2.6, size: 1.5, damp: 5200, predelay: 0.025 };
/** Timbres de pad: cálido (casi triangular) y cuerdas lejanas. */
const WARM = { harm: 6, rolloff: 2.2, cents: 7 };
const STRINGS = { harm: 10, rolloff: 1.1, vib: 0.003 };
/** Pulso por defecto: 32 pulsos por bucle de 30 s (64 BPM). */
const B32 = SECONDS / 32;

/** Toca notas con un instrumento y devuelve la capa con su propia reverb. */
function play(notes, beat, inst, { wet = 0.4, rv = HALL, ...opts } = {}) {
  const b = new Bus();
  sequence(b, notes, beat, inst, { ...opts, wet });
  return b.render(rv);
}

/**
 * Acordes sostenidos repartidos por igual en el bucle. Cada acorde se funde
 * con el siguiente (la relajación de uno coincide con el ataque del otro) y
 * el cambio queda centrado en el límite del acorde; el último se pliega
 * sobre el primero, así que el bucle no tiene costura.
 */
function pads(chords, { wet = 0.5, rv = HALL, fade = 2.5, ...opts } = {}) {
  const b = new Bus();
  const len = SECONDS / chords.length;
  chords.forEach((c, k) => {
    b.place(S.padChord(c.map(S.midi), len + fade, { attack: fade, release: fade, ...opts }), k * len - fade / 2, { wet });
  });
  return b.render(rv);
}

/** Arpegio: por cada acorde, `pattern` = [pulso, índice de nota, velocidad]. */
function arpeggio(chords, beatsPerChord, pattern) {
  return chords.flatMap((c, k) => pattern.map(([b, i, v]) => [k * beatsPerChord + b, c[i], v]));
}

function waveTimes(base, spread = 0.6) {
  return base.map((t) => t + rand(-spread, spread));
}

/** Coro de grillos de campo repartidos en distancia. */
function cricketChorus(bus, count, { dLo = 0.2, dHi = 1, fLo = 4100, fHi = 5200, g = 1 } = {}) {
  for (let i = 0; i < count; i++) {
    const d = rand(dLo, dHi);
    const c = S.fieldCricket({ f: rand(fLo, fHi) });
    const p = S.distance(c, d);
    bus.layer(p.ev, { g: g * p.g * rand(0.7, 1), wet: p.wet });
  }
}

/* --------------------------------------------------------------- escenas */

export const SCENES = {
  lluvia: [
    {
      title: 'Lluvia sobre hojas',
      render() {
        const inten = gusts(0.05, 0.55, 1, 1, 1);
        const bed = S.rainBed(2600, { lo: 500, hi: 6500, env: inten });
        const far = mul(band(pink(), 250, 3200), inten);
        const leaves = scatter(buf(), bank(90, S.leafDrop), 55, { env: inten, spreadDb: 5 });
        const drips = new Bus();
        const plops = bank(10, () => S.plop(450, 1000));
        poisson(0.5, (t) => drips.place(pick(plops), t, { g: vary(0, 3), d: rand(0.05, 0.4) }));
        return mix([
          [leaves, 0, 0.2, 'Gotas en las hojas'],
          [drips.dry, 1, 0.25, 'Goterones'],
          [bed, -9, 0.3, 'Lluvia fina'],
          [far, -17, 0.4, 'Lluvia lejana'],
        ], { t60: 1.1, size: 0.9, damp: 6000 });
      },
    },
    {
      title: 'Lluvia sobre el lago',
      render() {
        const inten = gusts(0.04, 0.6, 1, 1);
        const plinks = scatter(buf(), bank(160, () => S.waterDrop(1000, 4800)), 85, { env: inten, spreadDb: 6 });
        const plops = scatter(buf(), bank(20, () => S.plop(350, 850)), 2.2, { env: inten, spreadDb: 4 });
        const surface = band(dust(3500, { env: inten, shape: 2.5 }), 2500, 9000);
        const far = mul(band(pink(), 200, 2500), inten);
        return mix([
          [plinks, 0, 0.3, 'Gotas en el agua'],
          [plops, -3, 0.3, 'Plops graves'],
          [surface, -14, 0.2, 'Superficie del agua'],
          [far, -16, 0.5, 'Lluvia lejana'],
        ], { t60: 1.6, size: 1.4, damp: 5500 });
      },
    },
    {
      title: 'Lluvia en la tienda de campaña',
      render() {
        const inten = gusts(0.05, 0.55, 1, 1);
        const taps = scatter(buf(), bank(50, S.tentTap), 20, { env: inten, spreadDb: 5 });
        const fabric = mul(band(dust(700, { env: inten, shape: 2.5 }), 800, 4000), inten);
        const outside = lp(S.rainBed(3200, { lo: 300, hi: 2600, env: inten }), 2200);
        const edge = new Bus();
        const drips = bank(6, () => S.plop(650, 950));
        for (const t of regular(1.75, { jitter: 0.12 })) edge.place(pick(drips), t, { g: vary(0, 2), d: 0.25 });
        return mix([
          [taps, 0, 0.15, 'Gotas en la lona'],
          [edge.dry, -4, 0.3, 'Goteo del borde'],
          [fabric, -11, 0.1, 'Roce de la lona'],
          [outside, -10, 0.2, 'Lluvia fuera'],
        ], { t60: 0.45, size: 0.5, damp: 4500 });
      },
    },
  ],

  tormenta: [
    {
      title: 'Tormenta lejana',
      render() {
        const inten = gusts(0.04, 0.7, 1, 1);
        const rain = S.rainBed(5000, { lo: 350, hi: 6000, env: inten });
        const wash = mul(band(pink(), 200, 4000), inten);
        const drops = scatter(buf(), bank(80, S.leafDrop), 35, { env: inten });
        const w = S.wind(gusts(0.07, 0.1, 0.8, 1.3), { lo: 200, hi: 650, low: 0.6, hiss: 0.1 });
        const tb = new Bus();
        tb.place(S.thunder({ dur: 13, dist: 0.85 }), rand(5, 6.5), { wet: 0.7 });
        tb.place(S.thunder({ dur: 9, dist: 0.95 }), rand(20, 22), { g: db(-7), wet: 0.8 });
        const th = tb.render({ t60: 3.5, size: 2, damp: 2500, predelay: 0.04, lowcut: 30 });
        return mix([
          [rain, -1, 0.2, 'Lluvia'],
          [wash, -8, 0.3, 'Lluvia lejana'],
          [drops, -4, 0.2, 'Gotas en las hojas'],
          [w, -12, 0.2, 'Viento'],
          [th, 4, 'Truenos'],
        ], { t60: 1.2, size: 1.2, damp: 5000 });
      },
    },
    {
      title: 'Tormenta sobre el tejado',
      render() {
        const inten = gusts(0.05, 0.6, 1, 1);
        const roofBed = S.rainBed(4000, { lo: 700, hi: 7500, env: inten });
        const roofTaps = scatter(buf(), bank(80, S.roofTap), 110, { env: inten, centerDb: 0, spreadDb: 5 });
        const gutter = add(S.babble({ sources: 6, fLo: 600, fHi: 2200, rateLo: 6, rateHi: 14, loose: 0.4 }), S.flow({ lo: 500, hi: 3500, turb: 0.6, rate: 14 }), 0.5);
        const tb = new Bus();
        tb.place(S.thunder({ dur: 14, dist: 0.5, crack: 0.35 }), rand(7.5, 9), { wet: 0.45 });
        tb.place(S.thunder({ dur: 9, dist: 0.9 }), rand(22.5, 24), { g: db(-8), wet: 0.75 });
        const th = tb.render({ t60: 3.2, size: 2, damp: 3000, predelay: 0.03, lowcut: 30 });
        return mix([
          [roofTaps, 0, 0.12, 'Golpes en el tejado'],
          [roofBed, -5, 0.12, 'Lluvia en el tejado'],
          [gutter, -5, 0.15, 'Canalón'],
          [mul(band(pink(), 200, 3500), inten), -10, 0.3, 'Lluvia lejana'],
          [th, 2, 'Truenos'],
        ], { t60: 0.8, size: 0.8, damp: 5000 });
      },
    },
    {
      title: 'Tormenta con viento',
      render() {
        const gust = gusts(0.09, 0.05, 1, 1.4);
        const w = S.wind(gust, { lo: 220, hi: 950, q: 0.8, low: 0.8, hiss: 0.25, howl: 0.3, howlF: [320, 470, 610] });
        const rainEnv = gust.map((v) => 0.45 + 0.55 * v);
        const rain = S.rainBed(5500, { lo: 350, hi: 7000, env: rainEnv });
        const glass = scatter(buf(), bank(60, S.glassTap), 45, { env: gust, spreadDb: 5 });
        const tb = new Bus();
        tb.place(S.thunder({ dur: 12, dist: 0.8 }), rand(2.5, 4), { wet: 0.7 });
        tb.place(S.thunder({ dur: 10, dist: 0.9 }), rand(17, 18.5), { g: db(-5), wet: 0.8 });
        const th = tb.render({ t60: 3.5, size: 2, damp: 2500, predelay: 0.04, lowcut: 30 });
        return mix([
          [w, 0, 0.2, 'Viento'],
          [rain, -1, 0.2, 'Lluvia'],
          [glass, -6, 0.1, 'Gotas en el cristal'],
          [th, 0, 'Truenos'],
        ], { t60: 1.4, size: 1.4, damp: 4500 });
      },
    },
  ],

  fuego: [
    {
      title: 'Chimenea',
      render() {
        const f = S.hearth({ size: 1, crackle: 2.2, sizzle: 0.9, pops: 0.07, flare: 0.12, whistle: 0.02, flicker: 2 });
        return mix([[f, 0, 0.16, 22, 'Fuego']], { t60: 0.5, size: 0.55, damp: 4500 });
      },
    },
    {
      title: 'Hoguera al aire libre',
      render() {
        const f = S.hearth({ size: 1.25, crackle: 3.2, sizzle: 1.2, pops: 0.11, flare: 0.2, whistle: 0.03, flicker: 2.8, levels: { flare: -2, crackle: -2 } });
        const night = new Bus();
        cricketChorus(night, 5, { dLo: 0.7, dHi: 1 });
        const breeze = S.wind(gusts(0.05, 0, 0.6, 1.5), { lo: 280, hi: 800, low: 0.3, hiss: 0.05 });
        return mix([
          [f, 0, 0.08, 22, 'Fuego'],
          [night.render({ t60: 1.4, size: 1.4 }), -24, 'Grillos'],
          [breeze, -21, 0.1, 'Brisa'],
        ], { t60: 0.9, size: 1.5, damp: 4500 });
      },
    },
    {
      title: 'Brasas',
      render() {
        const f = S.hearth({ size: 0.45, crackle: 0.9, sizzle: 1.6, pops: 0.03, flare: 0.05, whistle: 0.03, flicker: 0.9, levels: { body: 0, sizzle: -12, crackle: -5 } });
        const tinkle = bank(30, () => {
          const fr = logRand(2800, 6000);
          return modal([[fr, 1, rand(0.004, 0.01)], [fr * 1.6, 0.3, 0.003]], { dur: 0.04, attack: 0.0004 });
        });
        const embers = lp(scatter(buf(), tinkle, 1.2, { spreadDb: 6 }), 6000);
        const settle = new Bus();
        for (const t of [rand(6, 9), rand(19, 23)]) {
          const ev = buf(sec(0.8));
          put(ev, modal([[rand(90, 140), 1, 0.06], [rand(220, 320), 0.4, 0.03]], { dur: 0.3, strike: 0.5, strikeLp: 1200 }), 0, 0.7);
          for (let i = 0; i < irand(12, 24); i++) put(ev, S.woodCrack(), sec(rand(0, 0.7) ** 1.5), rand(0.08, 0.4));
          settle.place(ev, t, { g: 1, d: 0.15 });
        }
        return mix([
          [f, 0, 0.18, 22, 'Brasas'],
          [embers, -17, 0.25, 12, 'Tintineo de ascuas'],
          [settle.dry, -10, 0.2, 14, 'Leña que se asienta'],
        ], { t60: 0.6, size: 0.6, damp: 4500 });
      },
    },
  ],

  mar: [
    {
      title: 'Playa de arena',
      render() {
        const b = new Bus();
        const sizes = [1, 0.78, 0.9];
        waveTimes([1.5, 11.2, 20.8]).forEach((t, i) => {
          b.place(S.wave({ build: rand(2.6, 3.4), crash: rand(0.35, 0.5), wash: rand(6, 7.5), size: sizes[i], bright: rand(3000, 3800), foam: 0.9 }), t, { wet: 0.2 });
        });
        const surf = mul(add(lp(brown(), 350), band(pink(), 200, 1400), 0.5), gusts(0.05, 0.5, 1, 1));
        const breeze = S.wind(gusts(0.06, 0, 0.6, 1.5), { lo: 400, hi: 1000, low: 0.2, hiss: 0.1 });
        return mix([
          [b.dry, 0, 0.2, 'Olas'],
          [surf, -12, 0.3, 'Rumor del mar'],
          [breeze, -20, 'Brisa'],
        ], { t60: 1.3, size: 1.6, damp: 4500 });
      },
    },
    {
      title: 'Orilla de guijarros',
      render() {
        const b = new Bus();
        waveTimes([0.5, 8.2, 15.4, 22.9], 0.4).forEach((t) => {
          b.place(S.wave({ build: rand(2.2, 2.8), crash: rand(0.3, 0.4), wash: rand(5, 6), size: rand(0.8, 1), bright: rand(3600, 4400), foam: 0.6, pebbles: 1 }), t, { wet: 0.15 });
        });
        const surf = mul(lp(brown(), 300), gusts(0.05, 0.5, 1, 1));
        return mix([
          [b.dry, 0, 0.15, 'Olas y guijarros'],
          [surf, -14, 0.3, 'Rumor del mar'],
        ], { t60: 1.0, size: 1.3, damp: 5000 });
      },
    },
    {
      title: 'Cala tranquila',
      render() {
        const b = new Bus();
        const laps = bank(8, () => S.lap({ size: rand(0.5, 1) }));
        poisson(0.5, (t) => b.place(pick(laps), t, { g: vary(0, 3), d: rand(0, 0.35) }));
        for (const t of [rand(3, 5), rand(17, 19)]) b.place(S.wave({ build: 2, crash: 0.3, wash: 4, size: 0.5, bright: 2400, foam: 0.5 }), t, { d: 0.6 });
        const gurgle = S.babble({ sources: 4, fLo: 250, fHi: 800, rateLo: 0.5, rateHi: 1.5, loose: 0.1, damp: 0.8 });
        const hush = mul(lp(brown(), 300), gusts(0.05, 0.6, 1, 1));
        return mix([
          [b.dry, 0, 0.25, 'Chapoteos y olas'],
          [gurgle, -9, 0.25, 'Gorgoteo'],
          [hush, -14, 0.2, 'Rumor grave'],
        ], { t60: 1.0, size: 1.0, damp: 5000 });
      },
    },
  ],

  rio: [
    {
      title: 'Arroyo de montaña',
      render() {
        return mix([
          [S.babble({ sources: 16, fLo: 450, fHi: 2600, rateLo: 4, rateHi: 14 }), 0, 0.15, 'Burbujeo'],
          [S.flow({ lo: 400, hi: 5000, turb: 0.5, rate: 12 }), -8, 0.15, 'Corriente'],
          [lp(brown(), 200), -18, 'Fondo grave'],
        ], { t60: 0.8, size: 0.7, damp: 6000 });
      },
    },
    {
      title: 'Río ancho y sereno',
      render() {
        const b = new Bus();
        const laps = bank(6, () => S.lap({ size: rand(0.3, 0.6), lo: 180, hi: 1600 }));
        poisson(0.25, (t) => b.place(pick(laps), t, { g: vary(0, 3), d: rand(0.1, 0.4) }));
        return mix([
          [S.babble({ sources: 7, fLo: 180, fHi: 650, rateLo: 0.8, rateHi: 3, damp: 0.8, rise: [0.15, 0.4], loose: 0.15 }), 0, 0.25, 'Burbujeo grave'],
          [S.flow({ lo: 120, hi: 1400, turb: 0.35, rate: 4 }), -3, 0.2, 'Corriente'],
          [b.dry, -6, 0.25, 'Chapoteos'],
          [lp(brown(), 250), -10, 'Fondo grave'],
        ], { t60: 1.4, size: 1.5, damp: 4500 });
      },
    },
    {
      title: 'Pequeña cascada',
      render() {
        const splashes = scatter(buf(), bank(30, () => burst(rand(0.02, 0.06), { lo: 600, hi: 7000, tau: 0.015 })), 5, { spreadDb: 4 });
        return mix([
          [S.flow({ lo: 250, hi: 6500, turb: 0.6, rate: 18 }), 0, 0.25, 'Chorro'],
          [mul(lp(brown(), 300), S.turbulence(6, 0.5)), -4, 0.2, 'Golpe del agua'],
          [S.babble({ sources: 22, fLo: 300, fHi: 3000, rateLo: 8, rateHi: 20 }), -3, 0.25, 'Burbujeo'],
          [splashes, -8, 0.25, 'Salpicaduras'],
        ], { t60: 1.2, size: 1.1, damp: 5000 }, lowpass(7500));
      },
    },
  ],

  viento: [
    {
      title: 'Brisa entre pinos',
      render() {
        const gust = gusts(0.11, 0, 1, 1.6);
        return mix([[S.wind(gust, { lo: 700, hi: 2600, q: 0.6, low: 0.25, hiss: 0.7 }), 0, 0.12, 'Brisa']], { t60: 0.9, size: 1.2, damp: 6000 }, lowpass(7500));
      },
    },
    {
      title: 'Viento de montaña',
      render() {
        const gust = gusts(0.07, 0.08, 1, 1.3);
        return mix([[S.wind(gust, { lo: 200, hi: 750, q: 0.7, low: 1, hiss: 0.15, howl: 0.55, howlF: [270, 390, 540], howlQ: 32 }), 0, 0.25, 'Viento']], { t60: 2.2, size: 1.8, damp: 4000, lowcut: 80 });
      },
    },
    {
      title: 'Ráfagas entre las hojas',
      render() {
        const gust = gusts(0.13, 0, 1, 1.5);
        const skitter = new Bus();
        poisson(0.25, (t) => {
          const ev = buf(sec(0.8));
          for (let i = 0; i < irand(6, 16); i++) put(ev, burst(rand(0.004, 0.015), { lo: 1500, hi: 7000, tau: 0.003 }), sec(rand(0, 0.7)), rand(0.3, 1));
          skitter.place(ev, t, { g: vary(0, 3), d: rand(0.1, 0.5) });
        });
        return mix([
          [S.leaves(gust, { rate: 7000 }), 0, 0.12, 'Hojas'],
          [S.wind(gust, { lo: 400, hi: 1500, low: 0.4, hiss: 0.2 }), -3, 0.12, 'Viento'],
          [skitter.dry, -9, 0.15, 'Hojas secas'],
        ], { t60: 0.9, size: 1.1, damp: 6000 });
      },
    },
  ],

  espacio: [
    {
      title: 'Nebulosa',
      lufs: -24,
      render() {
        const pad = evolvingPad([73.42, 110, 146.83, 185, 220, 329.63], { harm: 8, rolloff: 1.6, swellHz: 0.06, gains: [1, 0.8, 0.7, 0.55, 0.5, 0.3] });
        const solar = mul(bp(pink(), range(lfo(0.03), 300, 2200), 2.5), range(lfo(0.05), 0.3, 1));
        return mix([
          [pad, 0, 0.6, 'Pad'],
          [solar, -15, 0.7, 'Viento solar'],
        ], { t60: 6.5, size: 2.2, damp: 4000, predelay: 0.03 }, lowpass(5500));
      },
    },
    {
      title: 'Órbita',
      lufs: -24,
      render() {
        const drone = evolvingPad([55, 82.5, 110], { harm: 12, rolloff: 1.7, swellHz: 0.04, swellLo: 0.5 });
        const sweeps = new Bus();
        for (const t of [rand(1, 3), rand(11, 13), rand(21, 23)]) {
          const d = rand(6, 8);
          const n = sec(d);
          const f0 = rand(300, 450), f1 = rand(1800, 2600);
          const fr = Float32Array.from({ length: n }, (_, i) => f0 * Math.pow(f1 / f0, Math.sin((Math.PI / 2) * (i / n))));
          sweeps.place(mul(bp(white(n), fr, 9), envBell(n, 1.5)), t, { wet: 0.8 });
        }
        const pings = new Bus();
        const scale5 = [880, 987.77, 1108.73, 1318.51, 1479.98];
        for (let i = 0; i < 6; i++) {
          const f = pick(scale5);
          pings.place(modal([[f, 1, 2.2], [f * 2.0, 0.08, 0.9], [f * 3.0, 0.03, 0.5]], { dur: 7, attack: 0.02 }), i * 5 + rand(0.5, 3.5), { g: vary(0, 3), wet: 0.9 });
        }
        return mix([
          [drone, 0, 0.5, 'Drone'],
          [sweeps.dry, -12, 0.8, 'Barridos'],
          [pings.dry, -8, 0.9, 'Destellos'],
        ], { t60: 7, size: 2.4, damp: 4500, predelay: 0.04 }, lowpass(6000));
      },
    },
    {
      title: 'Vacío profundo',
      lufs: -25,
      render() {
        const swell = range(lfo(0.03, { slope: 1 }), 0.4, 1);
        const parts = [];
        for (const [f, a] of [[41.2, 1], [61.74, 0.6], [82.41, 0.45], [123.47, 0.15]]) {
          parts.push({ f, a: a * 0.5 }, { f: f + 0.1, a: a * 0.5 }, { f: f * 2, a: a * 0.08 });
        }
        const drone = mul(additive(parts), swell);
        const glass = new Bus();
        for (const t of [rand(2, 4), rand(12, 14), rand(21, 24)]) {
          const f = pick([1046.5, 1318.5, 1568, 1760]);
          glass.place(modal([[f, 1, 3], [f * 2.76, 0.25, 1.5], [f * 5.4, 0.08, 0.6]], { dur: 10, attack: 0.04 }), t, { g: vary(0, 2), wet: 1 });
        }
        const air = mul(lp(pink(), 300), range(lfo(0.04), 0.2, 1));
        return mix([
          [drone, 0, 0.4, 'Drone'],
          [glass.dry, -9, 1, 'Cristal'],
          [air, -22, 0.5, 'Aire'],
        ], { t60: 9, size: 2.6, damp: 3500, predelay: 0.05, lowcut: 60 });
      },
    },
  ],

  cuento: [
    {
      title: 'Caja de música',
      lufs: -24,
      render() {
        const beat = SECONDS / 32;
        const melody = [
          [0, 76], [1, 79], [2, 84], [4, 83], [5, 81], [6, 76],
          [8, 77], [9, 81], [10, 84], [11, 81], [12, 79], [15, 74],
          [16, 79], [17, 76], [18, 79], [19, 84], [20, 81], [22, 76], [23, 72],
          [24, 74], [25, 77], [26, 81], [27, 79], [28, 79], [30, 71], [31, 74],
        ].map(([b, m]) => [b, m, rand(0.75, 1)]);
        const roots = [60, 57, 53, 55, 60, 57, 53, 55];
        const fifths = [67, 64, 60, 62, 67, 64, 60, 62];
        const low = roots.flatMap((r, k) => [[k * 4, r, 0.55], [k * 4 + 2, fifths[k], 0.45]]);
        const chords = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
        const b = new Bus();
        sequence(b, melody, beat, S.musicBox);
        sequence(b, low, beat, S.musicBox, { g: 0.8 });
        const pads = new Bus();
        for (let k = 0; k < 8; k++) pads.place(S.padChord(chords[k % 4].map(S.midi), beat * 4 + 1.6), k * 4 * beat, { wet: 0.4 });
        return mix([
          [b.dry, 0, 0.35, 'Caja de música'],
          [pads.dry, -16, 0.4, 'Pad'],
        ], { t60: 2.2, size: 1.2, damp: 6000 });
      },
    },
    {
      title: 'Kalimba de cuna',
      lufs: -24,
      render() {
        const beat = SECONDS / 30; // 60 BPM, 3/4, 10 compases
        const chords = {
          Am: [57, 64, 72, 69], F: [53, 60, 69, 65], C: [48, 55, 64, 60], G: [55, 62, 71, 67], E: [52, 59, 68, 64],
        };
        const prog = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'F', 'E'];
        const pattern = [0, 1, 2, 1, 3, 1];
        const notes = [];
        prog.forEach((name, bar) => {
          pattern.forEach((idx, k) => {
            notes.push([bar * 3 + k * 0.5 + (k % 2 ? 0.04 : 0), chords[name][idx], k === 0 ? 0.95 : 0.6 + rand(0, 0.2)]);
          });
          if (bar % 2 === 1) notes.push([bar * 3 + 1, chords[name][2] + 12, 0.45]);
        });
        const b = new Bus();
        sequence(b, notes, beat, S.kalimba);
        const pads = new Bus();
        prog.forEach((name, bar) => pads.place(S.padChord(chords[name].slice(0, 3).map((m) => S.midi(m - 12)), beat * 3 + 1.4, { harm: 6 }), bar * 3 * beat, { wet: 0.4 }));
        return mix([
          [b.dry, 0, 0.3, 'Kalimba'],
          [pads.dry, -17, 0.4, 'Pad'],
        ], { t60: 1.8, size: 1.0, damp: 6000 });
      },
    },
    {
      title: 'Nana de celesta',
      lufs: -24,
      render() {
        const beat = SECONDS / 24; // 48 BPM, 6 compases de 4/4
        const melody = [
          [0, 81, 0.9], [2, 84, 0.7], [3, 81, 0.6],
          [4, 77, 0.85], [6, 74, 0.7],
          [8, 74, 0.75], [9, 77, 0.7], [10, 82, 0.9],
          [12, 81, 0.85], [14, 77, 0.7],
          [16, 79, 0.75], [17, 82, 0.7], [18, 86, 0.9],
          [20, 84, 0.85], [22, 76, 0.65], [23, 79, 0.6],
        ];
        const chords = [[53, 57, 60, 65], [50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [43, 50, 55, 58], [48, 52, 55, 60]];
        const b = new Bus();
        sequence(b, melody, beat, S.celesta);
        const strings = new Bus();
        chords.forEach((c, k) => strings.place(S.padChord(c.map(S.midi), beat * 4 + 1.5, { harm: 10, rolloff: 1.1, attack: 1.4, release: 1.8, vib: 0.003 }), k * 4 * beat, { wet: 0.45 }));
        return mix([
          [b.dry, 0, 0.4, 'Celesta'],
          [strings.dry, -9, 0.45, 'Pad de cuerdas'],
        ], { t60: 2.8, size: 1.4, damp: 5500 });
      },
    },
  ],

  meditacion: [
    {
      title: 'Cuencos tibetanos',
      lufs: -24,
      render() {
        const fund = [148, 222, 296].map((f) => jitter(f, 0.01));
        const bowls = fund.map((f) => [S.bowl(f, 1), S.bowl(f, 1)]);
        const b = new Bus();
        [[0.3, 0, 1], [7.8, 1, 0.8], [13.2, 2, 0.6], [19.6, 0, 0.85], [25.1, 1, 0.7]].forEach(([t, k, v], i) => {
          b.place(bowls[k][i % 2], t + rand(-0.2, 0.2), { g: v, wet: 0.35 });
        });
        const hum = mul(additive([{ f: fund[0] / 2, a: 1 }, { f: fund[0] / 2 + 0.1, a: 1 }, { f: fund[0], a: 0.3 }]), range(lfo(0.04), 0.4, 1));
        return mix([
          [b.dry, 0, 0.35, 'Cuencos'],
          [hum, -20, 0.3, 'Zumbido'],
        ], { t60: 4, size: 1.8, damp: 5000 });
      },
    },
    {
      title: 'Tanpura',
      lufs: -24,
      render() {
        const sa = 130.81;
        const strings = [sa * 0.75, sa, sa, sa / 2];
        const plucks = strings.map((f) => [S.tanpura(f), S.tanpura(f)]);
        const b = new Bus();
        const cycle = SECONDS / 8;
        for (let c = 0; c < 8; c++) {
          strings.forEach((_, k) => {
            b.place(plucks[k][(c + k) % 2], c * cycle + k * (cycle / 4) + rand(-0.02, 0.02), { g: [0.8, 0.9, 0.85, 1][k] * rand(0.92, 1), wet: 0.3 });
          });
        }
        const air = mul(band(pink(), 300, 1500), range(lfo(0.05), 0.3, 1));
        return mix([
          [b.dry, 0, 0.3, 'Tanpura'],
          [air, -26, 0.3, 'Aire'],
        ], { t60: 2.4, size: 1.4, damp: 5000 });
      },
    },
    {
      title: 'Campanas de viento y respiración',
      lufs: -24,
      render() {
        const breath = Float32Array.from({ length: N }, (_, i) => Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * 4 * i) / N), 1.3));
        const fc = breath.map((v) => 350 + 700 * v);
        const air = mul(bp(pink(), fc, 0.9), breath.map((v) => 0.12 + v));
        const notes = [587.33, 659.25, 739.99, 880, 987.77];
        const chimes = new Bus();
        for (const g0 of [rand(1, 3), rand(11, 13), rand(21, 23)]) {
          const len = rand(2.5, 4);
          for (let i = 0; i < irand(4, 9); i++) chimes.place(S.chime(pick(notes), rand(0.3, 0.9)), g0 + rand(0, len), { wet: 0.35 });
        }
        const drone = mul(additive([{ f: 146.83, a: 1 }, { f: 220, a: 0.6 }, { f: 146.93, a: 0.6 }]), range(lfo(0.04), 0.4, 1));
        return mix([
          [chimes.dry, 0, 0.35, 'Campanas'],
          [air, -10, 0.2, 'Respiración'],
          [drone, -18, 0.3, 'Drone'],
        ], { t60: 3.5, size: 1.6, damp: 6000 });
      },
    },
  ],

  pajaros: [
    {
      title: 'Amanecer en el jardín',
      render() {
        const b = new Bus();
        S.singer(b, S.blackbird, { gap: [3.5, 6.5], d: 0.2, g: 1 });
        S.singer(b, S.robin, { gap: [3, 5.5], d: 0.45, g: 0.8, start: rand(1, 3) });
        S.singer(b, S.greatTit, { gap: [5, 9], d: 0.75, g: 0.7, start: rand(3, 6) });
        poisson(1, (t) => b.place(S.tinyChirp(), t, { d: rand(0.8, 1), g: vary(-4, 3) }));
        const air = band(pink(), 150, 1200);
        return mix([
          [b.render({ t60: 1.3, size: 1.2, damp: 6500 }), 0, 'Pájaros'],
          [air, -28, 'Aire'],
        ]);
      },
    },
    {
      title: 'Bosque en primavera',
      render() {
        const b = new Bus();
        S.singer(b, S.chaffinch, { gap: [5, 8], d: 0.3, g: 1 });
        S.singer(b, S.greatTit, { gap: [4, 7], d: 0.45, g: 0.8, start: rand(2, 4) });
        S.singer(b, S.blackbird, { gap: [4, 8], d: 0.65, g: 0.8, start: rand(4, 7) });
        S.singer(b, S.robin, { gap: [4, 7], d: 0.75, g: 0.7, start: rand(0, 3) });
        const ck = rand(10, 13);
        for (let i = 0; i < 3; i++) b.place(S.cuckoo(), ck + i * rand(0.9, 1.1), { d: 0.85, g: 0.9 });
        poisson(0.8, (t) => b.place(S.tinyChirp(), t, { d: rand(0.8, 1), g: vary(-4, 3) }));
        const lv = S.leaves(gusts(0.08, 0, 0.7, 1.6), { rate: 3000, flutter: 0.3 });
        return mix([
          [b.render({ t60: 1.8, size: 1.6, damp: 6000 }), 0, 'Pájaros'],
          [lv, -20, 0.1, 'Hojas'],
        ]);
      },
    },
    {
      title: 'Palomas al sol',
      render() {
        const b = new Bus();
        b.place(S.woodPigeon(), rand(1, 2.5), { d: 0.3 });
        b.place(S.woodPigeon(), rand(16, 18), { d: 0.35, g: 0.9 });
        b.place(S.collaredDove(), rand(9, 11), { d: 0.55, g: 0.8 });
        b.place(S.collaredDove(), rand(24, 26), { d: 0.6, g: 0.75 });
        S.singer(b, S.turtleDove, { gap: [4, 7], d: 0.5, g: 0.7, start: rand(5, 7) });
        poisson(0.5, (t) => b.place(S.tinyChirp(), t, { d: rand(0.85, 1), g: vary(-6, 3) }));
        const breeze = S.wind(gusts(0.06, 0, 0.6, 1.5), { lo: 500, hi: 1400, low: 0.2, hiss: 0.3 });
        return mix([
          [b.render({ t60: 1.5, size: 1.4, damp: 5500 }), 0, 'Palomas y pájaros'],
          [breeze, -20, 0.1, 'Brisa'],
        ]);
      },
    },
  ],

  bichos: [
    {
      title: 'Pradera de grillos',
      render() {
        const b = new Bus();
        cricketChorus(b, 12, { dLo: 0.15, dHi: 0.95 });
        for (let i = 0; i < 2; i++) {
          const p = S.distance(S.treeCricket(), rand(0.6, 0.85));
          b.layer(p.ev, { g: p.g * 0.6, wet: p.wet });
        }
        return mix([
          [b.render({ t60: 1.4, size: 1.4, damp: 6000 }), 0, 'Grillos'],
          [band(pink(), 200, 2000), -30, 'Aire'],
        ]);
      },
    },
    {
      title: 'Siesta de cigarras',
      lufs: -24,
      render() {
        const b = new Bus();
        for (let i = 0; i < 4; i++) {
          const p = S.distance(S.cicada(), rand(0.5, 0.9));
          b.layer(p.ev, { g: p.g * rand(0.7, 1), wet: p.wet });
        }
        cricketChorus(b, 3, { dLo: 0.6, dHi: 0.9, g: 0.5 });
        const breeze = S.wind(gusts(0.08, 0, 0.7, 1.5), { lo: 600, hi: 2000, low: 0.15, hiss: 0.5 });
        return mix([
          [b.render({ t60: 1.2, size: 1.5, damp: 5000 }), 0, 'Cigarras y grillos'],
          [breeze, -10, 0.1, 'Brisa'],
        ], null, lowpass(6500));
      },
    },
    {
      title: 'Grillos arbóreos',
      render() {
        const b = new Bus();
        for (let i = 0; i < 4; i++) {
          const p = S.distance(S.treeCricket({ f: rand(2400, 3100), rate: rand(35, 60) }), rand(0.25, 0.8));
          b.layer(p.ev, { g: p.g, wet: p.wet });
        }
        for (let i = 0; i < 2; i++) {
          const d = rand(0.4, 0.8);
          const k = S.katydid();
          for (const t of regular(rand(1.2, 1.6), { offset: rand(0, 1), jitter: 0.05 })) if (chance(0.8)) b.place(k, t, { d, g: 0.5 });
        }
        cricketChorus(b, 3, { dLo: 0.7, dHi: 1, g: 0.6 });
        return mix([
          [b.render({ t60: 1.6, size: 1.5, damp: 5500 }), 0, 'Grillos'],
          [band(pink(), 200, 1500), -30, 'Aire'],
        ]);
      },
    },
  ],

  bosque: [
    {
      title: 'Hayedo con brisa',
      render() {
        const gust = gusts(0.1, 0.05, 0.9, 1.5);
        const birds = new Bus();
        S.singer(birds, S.robin, { gap: [5, 9], d: 0.6, g: 0.8 });
        S.singer(birds, S.blackbird, { gap: [6, 10], d: 0.75, g: 0.8, start: rand(3, 6) });
        birds.place(S.woodpecker(), rand(13, 16), { d: 0.7, g: 0.9 });
        return mix([
          [S.leaves(gust, { rate: 6000, lo: 1200, hi: 6500, flutter: 0.3 }), 0, 0.15, 'Hojas'],
          [S.wind(gust, { lo: 300, hi: 1100, low: 0.4, hiss: 0.2 }), -5, 0.15, 'Viento'],
          [birds.render({ t60: 1.8, size: 1.6, damp: 5500 }), -2, 'Pájaros'],
        ], { t60: 1.2, size: 1.4, damp: 5500 });
      },
    },
    {
      title: 'Bosque después de la lluvia',
      render() {
        const gust = gusts(0.08, 0, 1, 2);
        const drips = new Bus();
        const leafDrips = bank(40, () => {
          const ev = buf(sec(0.12));
          put(ev, S.leafDrop(), 0, 0.5);
          put(ev, S.waterDrop(900, 3000), sec(0.002), 0.8);
          return ev;
        });
        poisson(5, (t) => {
          const w = gust[Math.floor(t * SR) % N];
          if (rnd() < 0.25 + 0.75 * w) drips.place(pick(leafDrips), t, { g: vary(-2, 4), d: rand(0, 0.6) });
        });
        const puddles = bank(10, () => S.plop(500, 1200));
        poisson(0.6, (t) => drips.place(pick(puddles), t, { g: vary(0, 3), d: rand(0.1, 0.5) }));
        const birds = new Bus();
        S.singer(birds, S.robin, { gap: [6, 10], d: 0.7, g: 0.8 });
        S.singer(birds, S.blackbird, { gap: [7, 11], d: 0.8, g: 0.7, start: rand(4, 8) });
        const stream = lp(S.babble({ sources: 8, fLo: 400, fHi: 1800, rateLo: 4, rateHi: 10 }), 1500);
        return mix([
          [drips.dry, 0, 0.25, 'Goteo'],
          [birds.render({ t60: 1.8, size: 1.6 }), -4, 'Pájaros'],
          [stream, -16, 0.3, 'Arroyo'],
          [S.leaves(gust, { rate: 2500, flutter: 0.2 }), -16, 0.1, 'Hojas'],
        ], { t60: 1.3, size: 1.4, damp: 5500 });
      },
    },
    {
      title: 'Pinar al atardecer',
      render() {
        const gust = gusts(0.09, 0, 1, 1.6);
        const b = new Bus();
        b.place(S.creak(), rand(4, 7), { d: 0.35, g: 0.9 });
        b.place(S.creak(), rand(18, 22), { d: 0.5, g: 0.8 });
        for (const t0 of [rand(2, 4), rand(16, 19)]) {
          for (let i = 0; i < irand(3, 5); i++) b.place(S.cuckoo(), t0 + i * rand(0.9, 1.1), { d: 0.85, g: 0.9 });
        }
        b.place(S.collaredDove(), rand(9, 12), { d: 0.75, g: 0.8 });
        return mix([
          [S.wind(gust, { lo: 700, hi: 2400, q: 0.6, low: 0.3, hiss: 0.6 }), 0, 0.12, 'Viento en los pinos'],
          [b.render({ t60: 1.6, size: 1.5, damp: 5000 }), 1, 'Pájaros y crujidos'],
        ], { t60: 1.0, size: 1.2, damp: 5500 });
      },
    },
  ],

  noche: [
    {
      title: 'Noche de verano en el campo',
      render() {
        const b = new Bus();
        cricketChorus(b, 16, { dLo: 0.6, dHi: 1, g: 0.8 });
        const owlNear = S.scopsOwl();
        for (const t of regular(2.6, { offset: rand(0, 1), jitter: 0.02 })) if (!(t > 12 && t < 16)) b.place(owlNear, t, { d: 0.35 });
        const owlFar = S.scopsOwl(rand(1050, 1150));
        for (const t of regular(2.9, { offset: rand(1, 2), jitter: 0.03 })) if (t < 8 || t > 13) b.place(owlFar, t, { d: 0.8, g: 0.8 });
        const breeze = S.wind(gusts(0.06, 0, 0.5, 1.6), { lo: 300, hi: 900, low: 0.3, hiss: 0.1 });
        return mix([
          [b.render({ t60: 1.6, size: 1.6, damp: 5500 }), 0, 'Grillos y autillos'],
          [breeze, -22, 'Brisa'],
        ]);
      },
    },
    {
      title: 'Cárabo en el bosque',
      render() {
        const b = new Bus();
        b.place(S.tawnyOwl(), rand(1.5, 3), { d: 0.35 });
        b.place(S.tawnyOwl(), rand(17, 19), { d: 0.6, g: 0.9 });
        b.place(S.kewick(), rand(11, 13), { d: 0.75, g: 0.6 });
        b.place(S.kewick(), rand(26, 27.5), { d: 0.8, g: 0.5 });
        cricketChorus(b, 4, { dLo: 0.75, dHi: 1, g: 0.5 });
        const gust = gusts(0.07, 0, 0.8, 1.6);
        return mix([
          [b.render({ t60: 2.2, size: 1.8, damp: 4500 }), 0, 'Cárabos y grillos'],
          [S.leaves(gust, { rate: 3000, flutter: 0.2 }), -19, 0.2, 'Hojas'],
          [S.wind(gust, { lo: 250, hi: 800, low: 0.4, hiss: 0.1 }), -20, 0.2, 'Viento'],
        ], { t60: 1.6, size: 1.6, damp: 5000 });
      },
    },
    {
      title: 'Noche junto al lago',
      render() {
        const b = new Bus();
        for (let i = 0; i < 4; i++) {
          const toad = S.midwifeToad(rand(1400, 2100));
          const d = rand(0.25, 0.8);
          for (const t of regular(rand(1.8, 3), { offset: rand(0, 2), jitter: 0.03 })) b.place(toad, t, { d, g: 0.9 });
        }
        for (let i = 0; i < 3; i++) {
          const d = rand(0.7, 0.95);
          const frogs = bank(3, S.treeFrog);
          let t = rand(0, 8);
          while (t < SECONDS) {
            const calls = irand(5, 10);
            for (let c = 0; c < calls; c++) b.place(pick(frogs), t + c * rand(0.8, 1.1), { d, g: 0.7 });
            t += calls + rand(6, 12);
          }
        }
        cricketChorus(b, 5, { dLo: 0.75, dHi: 1, g: 0.5 });
        const water = new Bus();
        const laps = bank(6, () => S.lap({ size: rand(0.2, 0.4), lo: 200, hi: 1500 }));
        poisson(0.3, (t) => water.place(pick(laps), t, { d: rand(0.2, 0.5), g: vary(0, 3) }));
        return mix([
          [b.render({ t60: 1.6, size: 1.6, damp: 5000 }), 0, 'Sapos, ranas y grillos'],
          [water.dry, -12, 0.3, 'Agua en la orilla'],
        ], { t60: 1.4, size: 1.4, damp: 5000 });
      },
    },
  ],

  burbujas: [
    {
      title: 'Baño de espuma',
      render() {
        const fizzEnv = range(lfo(0.1), 0.5, 1);
        const foam = band(dust(1600, { env: fizzEnv, shape: 3 }), 2500, 8500);
        const popBank = bank(30, () => {
          const f = logRand(3500, 7500);
          const ev = burst(0.004, { lo: 2500, hi: 9000, tau: 0.0008 });
          add(ev, S.padTo(modal([[f, 0.5, 0.003]], { dur: 0.004 }), ev.length));
          return ev;
        });
        const pops = scatter(buf(), popBank, 8, { spreadDb: 5 });
        const b = new Bus();
        for (const t of [rand(3, 5), rand(14, 17), rand(24, 26)]) {
          const d = rand(1.2, 2);
          const n = sec(d);
          b.place(mul(band(pink(n), 150, 1500), envBell(n, 1.2)), t, { g: 0.5 });
          for (let i = 0; i < irand(6, 14); i++) b.place(bubble(logRand(300, 900), { rise: rand(0.1, 0.3), damp: 0.8 }), t + rand(0.1, d), { g: rand(0.2, 0.6) });
        }
        const drip = bank(4, () => S.plop(900, 1300));
        for (const t of regular(3.3, { offset: rand(0, 1), jitter: 0.05 })) b.place(pick(drip), t, { g: 0.55, d: 0.2 });
        return mix([
          [foam, -3, 0.2, 'Espuma'],
          [pops, -6, 0.2, 'Pompas'],
          [b.dry, 0, 0.3, 'Chapoteos y grifo'],
        ], { t60: 0.9, size: 0.6, damp: 7000, predelay: 0.008 });
      },
    },
    {
      title: 'Burbujeo bajo el agua',
      lufs: -24,
      render() {
        const pulse = range(lfo(0.6, { slope: 0.4 }), 0.2, 1, 1.5);
        const blubs = scatter(buf(), bank(60, () => bubble(logRand(120, 700), { rise: rand(0.1, 0.3), damp: 0.7 })), 28, { env: pulse, spreadDb: 5 });
        const hum = lp(brown(), 200);
        const move = mul(band(pink(), 60, 400), range(lfo(0.07), 0.3, 1));
        return mix([
          [blubs, 0, 0.35, 'Burbujas'],
          [hum, -12, 0.3, 'Zumbido'],
          [move, -10, 0.3, 'Movimiento del agua'],
        ], { t60: 1.2, size: 0.9, damp: 1200, lowcut: 60 }, lowpass(1800));
      },
    },
    {
      title: 'Acuario',
      render() {
        const stream = scatter(buf(), bank(80, () => bubble(logRand(600, 2200), { rise: rand(0.08, 0.25) })), 35, { spreadDb: 4 });
        const surf = bank(40, () => {
          const ev = buf(sec(0.06));
          put(ev, burst(0.006, { lo: 1500, hi: 8000, tau: 0.0015 }), 0, 0.6);
          put(ev, bubble(logRand(1500, 4000), { damp: 1.5 }), sec(0.001), 0.8);
          return ev;
        });
        const pops = scatter(buf(), surf, 12, { spreadDb: 5 });
        const trickle = add(S.babble({ sources: 6, fLo: 800, fHi: 2500, rateLo: 6, rateHi: 14 }), S.flow({ lo: 600, hi: 4000, turb: 0.6, rate: 15 }), 0.6);
        return mix([
          [stream, 0, 0.15, 'Burbujas del aireador'],
          [pops, -4, 0.15, 'Pompas'],
          [trickle, -9, 0.15, 'Filtro'],
        ], { t60: 0.6, size: 0.7, damp: 6000 });
      },
    },
  ],
};

/* ------------------------------------------------- escenas musicales */

/**
 * Escenas 07 y 08 de cada ambiente: el paisaje con una melodía sutil y, cuando
 * encaja, un pad sostenido. Melodías y acordes encajan exactamente en los 30 s
 * del bucle; la música lleva su propia sala y queda por debajo del paisaje.
 */
const MUSICAL = {
  lluvia: [
    {
      title: 'Piano junto a la ventana',
      render() {
        const inten = gusts(0.04, 0.6, 1, 1);
        const bed = S.rainBed(2200, { lo: 500, hi: 5500, env: inten });
        const leaves = scatter(buf(), bank(60, S.leafDrop), 30, { env: inten, spreadDb: 5 });
        const far = mul(band(pink(), 200, 2500), inten);
        const tune = [
          [0, 69, 0.7], [2, 72, 0.8], [3, 76, 0.75], [4, 74, 0.6], [6, 72, 0.6],
          [8, 76, 0.8], [10, 74, 0.6], [11, 72, 0.6], [12, 69, 0.7],
          [16, 74, 0.75], [18, 77, 0.8], [19, 76, 0.6], [20, 74, 0.6], [22, 69, 0.55],
          [24, 72, 0.7], [26, 74, 0.6], [28, 67, 0.55],
        ];
        const bass = [[0, 41], [4, 48], [8, 45], [12, 52], [16, 46], [20, 53], [24, 48], [28, 55]].map(([b, m]) => [b, m, b % 8 ? 0.24 : 0.34]);
        const piano = play([...tune, ...bass], B32, S.feltPiano, { wet: 0.4 });
        const strings = pads([[53, 57, 60, 64], [55, 57, 60, 64], [53, 58, 62, 69], [55, 60, 62, 67]], STRINGS);
        return mix([
          [leaves, 0, 0.2, 'Gotas en las hojas'],
          [bed, -8, 0.3, 'Lluvia fina'],
          [far, -15, 0.4, 'Lluvia lejana'],
          [piano, -2, 'Piano'],
          [strings, -11, 'Pad de cuerdas'],
        ], { t60: 1.1, size: 0.9, damp: 6000 });
      },
    },
    {
      title: 'Lluvia mansa y arpa',
      render() {
        const beat = SECONDS / 40;
        const inten = gusts(0.05, 0.55, 1, 1);
        const bed = S.rainBed(1800, { lo: 400, hi: 5000, env: inten });
        const leaves = scatter(buf(), bank(60, S.leafDrop), 22, { env: inten, spreadDb: 5 });
        const drips = new Bus();
        const plops = bank(8, () => S.plop(450, 900));
        poisson(0.3, (t) => drips.place(pick(plops), t, { g: vary(0, 3), d: rand(0.2, 0.5) }));
        const chords = [[50, 57, 62, 66, 69, 73], [43, 50, 59, 62, 66, 69], [47, 54, 59, 62, 66, 69], [45, 52, 57, 62, 64, 69]];
        const arp = arpeggio(chords, 10, [[0, 0, 0.6], [0.5, 1, 0.45], [1, 2, 0.45], [1.5, 3, 0.42], [2, 4, 0.42], [2.5, 5, 0.4]]);
        const tune = [[4, 76, 0.75], [6, 74, 0.6], [14, 74, 0.75], [16, 71, 0.6], [24, 73, 0.75], [26, 74, 0.6], [34, 76, 0.75], [36, 73, 0.6]];
        const harp = play([...arp, ...tune], beat, S.harp, { wet: 0.45 });
        const drone = evolvingPad([146.83, 220, 329.63], { harm: 6, rolloff: 2, swellHz: 0.05, swellLo: 0.5, brightLo: 0.4, gains: [1, 0.8, 0.45] });
        return mix([
          [leaves, 0, 0.2, 'Gotas en las hojas'],
          [bed, -7, 0.3, 'Lluvia fina'],
          [drips.dry, -4, 0.25, 'Goterones'],
          [harp, -3, 'Arpa'],
          [drone, -11, 0.3, 'Pad'],
        ], { t60: 1.3, size: 1.1, damp: 5500 });
      },
    },
  ],

  tormenta: [
    {
      title: 'Tormenta lejana y cuerdas',
      render() {
        const inten = gusts(0.04, 0.6, 1, 1);
        const rain = S.rainBed(4000, { lo: 350, hi: 5500, env: inten });
        const wash = mul(band(pink(), 200, 3500), inten);
        const tb = new Bus();
        tb.place(S.thunder({ dur: 12, dist: 0.95 }), rand(9, 11), { wet: 0.8 });
        const th = tb.render({ t60: 3.5, size: 2, damp: 2200, predelay: 0.04, lowcut: 30 });
        const strings = pads([[50, 57, 62, 65], [50, 58, 62, 65], [48, 57, 60, 65], [48, 55, 60, 64]], STRINGS);
        const tune = [
          [0, 74, 0.7], [2, 72, 0.55], [4, 69, 0.65],
          [8, 70, 0.7], [10, 69, 0.55], [12, 65, 0.6],
          [16, 69, 0.7], [18, 72, 0.6], [20, 77, 0.65], [22, 76, 0.5],
          [24, 74, 0.6], [26, 72, 0.55], [28, 67, 0.55], [29.5, 64, 0.45],
        ];
        const bass = [[0, 38], [8, 46], [16, 41], [24, 36]].map(([b, m]) => [b, m, 0.33]);
        const piano = play([...tune, ...bass], B32, S.feltPiano, { wet: 0.45 });
        return mix([
          [rain, 0, 0.2, 'Lluvia'],
          [wash, -7, 0.3, 'Lluvia lejana'],
          [th, -4, 'Trueno'],
          [strings, -8, 'Pad de cuerdas'],
          [piano, -1, 'Piano'],
        ], { t60: 1.2, size: 1.2, damp: 5000 });
      },
    },
    {
      title: 'Refugio bajo la lluvia',
      render() {
        const inten = gusts(0.05, 0.6, 1, 1);
        const roofBed = lp(S.rainBed(3500, { lo: 600, hi: 6000, env: inten }), 3200);
        const roofTaps = lp(scatter(buf(), bank(60, S.roofTap), 60, { env: inten, spreadDb: 5 }), 3500);
        const outside = mul(band(pink(), 150, 2000), inten);
        const tb = new Bus();
        tb.place(S.thunder({ dur: 10, dist: 0.95 }), rand(18, 20), { wet: 0.8 });
        const th = tb.render({ t60: 3.2, size: 2, damp: 2200, predelay: 0.04, lowcut: 30 });
        const pad = pads([[45, 57, 60, 64, 71], [41, 53, 57, 60, 64], [48, 55, 60, 64, 67], [43, 55, 59, 62, 64]], WARM);
        const tune = [
          [0, 76, 0.7], [2, 72, 0.5], [3, 71, 0.45], [4, 69, 0.6],
          [8, 72, 0.65], [10, 76, 0.6], [12, 74, 0.5],
          [16, 72, 0.65], [18, 79, 0.6], [20, 76, 0.55],
          [24, 74, 0.6], [26, 71, 0.5], [28, 67, 0.45],
        ];
        const celesta = play(tune, B32, S.celesta, { wet: 0.5 });
        return mix([
          [roofTaps, 0, 0.12, 'Golpes en el tejado'],
          [roofBed, -4, 0.12, 'Lluvia en el tejado'],
          [outside, -10, 0.3, 'Lluvia fuera'],
          [th, -6, 'Trueno'],
          [pad, -8, 'Pad'],
          [celesta, -2, 'Celesta'],
        ], { t60: 0.8, size: 0.8, damp: 5000 });
      },
    },
  ],

  fuego: [
    {
      title: 'Chimenea y guitarra',
      render() {
        const e = SECONDS / 64; // corcheas a 64 BPM, 8 compases
        const f = S.hearth({ size: 1, crackle: 1.8, sizzle: 0.8, pops: 0.05, flare: 0.1, whistle: 0, flicker: 2 });
        const chords = [[40, 47, 55, 59, 62], [36, 43, 52, 55, 59], [43, 50, 55, 59, 62], [42, 50, 54, 57, 62]];
        const bar = [[0, 0, 0.7], [1, 2, 0.4], [2, 3, 0.45], [3, 4, 0.4], [4, 1, 0.5], [5, 3, 0.4], [6, 2, 0.4], [7, 4, 0.38]];
        const arp = arpeggio(chords, 16, [...bar, ...bar.map(([b, i, v]) => [b + 8, i, v * 0.95])]);
        const tune = [
          [0, 71, 0.7], [5, 69, 0.5], [8, 67, 0.6], [13, 66, 0.45],
          [16, 72, 0.65], [21, 71, 0.5], [24, 76, 0.6], [29, 74, 0.5],
          [32, 74, 0.65], [37, 71, 0.5], [40, 67, 0.6], [45, 69, 0.5],
          [48, 69, 0.6], [53, 66, 0.5], [56, 74, 0.55], [61, 73, 0.45],
        ];
        const guitar = play([...arp, ...tune], e, S.nylon, { wet: 0.3, rv: { t60: 1.6, size: 1, damp: 5000, predelay: 0.015 } });
        const pad = pads([[52, 59, 62, 66], [52, 55, 59, 64], [50, 55, 59, 62], [50, 54, 57, 62]], WARM);
        return mix([
          [f, 0, 0.16, 22, 'Fuego'],
          [guitar, -1, 'Guitarra'],
          [pad, -15, 'Pad'],
        ], { t60: 0.6, size: 0.6, damp: 4500 });
      },
    },
    {
      title: 'Brasas y piano',
      render() {
        const f = S.hearth({ size: 0.5, crackle: 0.8, sizzle: 1.2, pops: 0.02, flare: 0.05, whistle: 0, flicker: 0.9, levels: { body: 0, sizzle: -12, crackle: -6 } });
        const pad = pads([[51, 55, 58, 62], [51, 55, 58, 60], [48, 51, 56, 60], [53, 58, 63, 65]], WARM);
        const tune = [
          [0, 67, 0.6], [1.5, 70, 0.55], [3, 74, 0.65], [5, 72, 0.5], [6, 70, 0.5],
          [8, 72, 0.6], [10, 75, 0.6], [12, 74, 0.5], [13.5, 70, 0.45],
          [16, 72, 0.6], [18, 75, 0.55], [20, 72, 0.5], [22, 67, 0.45],
          [24, 70, 0.55], [26, 72, 0.5], [27, 70, 0.45], [28, 65, 0.45],
        ];
        const bass = [[0, 39], [4, 46], [8, 36], [12, 43], [16, 44], [20, 51], [24, 46], [28, 53]].map(([b, m]) => [b, m, b % 8 ? 0.24 : 0.34]);
        const piano = play([...tune, ...bass], B32, S.feltPiano, { wet: 0.35, rv: { t60: 2.2, size: 1.2, damp: 4500, predelay: 0.02 } });
        return mix([
          [f, 0, 0.18, 22, 'Brasas'],
          [piano, -1, 'Piano'],
          [pad, -12, 'Pad'],
        ], { t60: 0.6, size: 0.6, damp: 4500 });
      },
    },
  ],

  mar: [
    {
      title: 'Mar en calma y flauta',
      render() {
        const b = new Bus();
        const sizes = [0.75, 0.6, 0.7];
        waveTimes([2, 12, 22]).forEach((t, i) => {
          b.place(S.wave({ build: rand(2.8, 3.4), crash: rand(0.3, 0.4), wash: rand(6, 7), size: sizes[i], bright: rand(2600, 3200), foam: 0.7 }), t, { wet: 0.25 });
        });
        const surf = mul(add(lp(brown(), 350), band(pink(), 200, 1200), 0.5), gusts(0.05, 0.5, 1, 1));
        const drone = evolvingPad([98, 146.83, 220, 293.66], { harm: 6, rolloff: 2, swellHz: 0.05, swellLo: 0.45, brightLo: 0.35, gains: [1, 0.8, 0.6, 0.4] });
        const tune = [
          [0, 74, 0.65, 2], [2, 76, 0.55, 1], [3, 79, 0.65, 3.5],
          [8, 76, 0.55, 1.5], [9.5, 74, 0.5, 0.5], [10, 71, 0.6, 4],
          [16, 69, 0.55, 1.5], [17.5, 71, 0.5, 0.5], [18, 74, 0.6, 2], [20, 76, 0.55, 3],
          [24, 74, 0.55, 1.5], [25.5, 71, 0.5, 0.5], [26, 67, 0.55, 3.5],
        ];
        const flute = play(tune, B32, S.softLead, { wet: 0.5, humanize: 0.02, rv: { t60: 3.2, size: 1.8, damp: 5000, predelay: 0.03 } });
        return mix([
          [b.dry, 0, 0.2, 'Olas'],
          [surf, -11, 0.3, 'Rumor del mar'],
          [drone, -12, 0.3, 'Pad'],
          [flute, -5, 'Flauta'],
        ], { t60: 1.3, size: 1.6, damp: 4500 });
      },
    },
    {
      title: 'Atardecer en la cala',
      render() {
        const b = new Bus();
        const laps = bank(8, () => S.lap({ size: rand(0.4, 0.9) }));
        poisson(0.45, (t) => b.place(pick(laps), t, { g: vary(0, 3), d: rand(0.1, 0.4) }));
        for (const t of [rand(4, 6), rand(18, 20)]) b.place(S.wave({ build: 2, crash: 0.3, wash: 4, size: 0.45, bright: 2200, foam: 0.4 }), t, { d: 0.6 });
        const hush = mul(lp(brown(), 300), gusts(0.05, 0.6, 1, 1));
        const strings = pads([[45, 57, 61, 64, 68], [42, 57, 61, 64, 66], [50, 57, 62, 66, 69], [52, 57, 59, 64, 69]], STRINGS);
        const arp = arpeggio([[57, 61, 64, 69], [54, 57, 61, 66], [50, 57, 62, 66], [52, 57, 59, 64]], 8, [[0, 0, 0.55], [0.5, 1, 0.42], [1, 2, 0.42], [1.5, 3, 0.42]]);
        const tune = [
          [3, 73, 0.65], [4, 76, 0.7], [6, 73, 0.55],
          [11, 69, 0.6], [12, 73, 0.65], [14, 71, 0.5],
          [19, 74, 0.6], [20, 78, 0.65], [22, 76, 0.55],
          [27, 71, 0.55], [28, 76, 0.6], [30, 71, 0.5],
        ];
        const harp = play([...arp, ...tune], B32, S.harp, { wet: 0.45 });
        return mix([
          [b.dry, 0, 0.25, 15, 'Chapoteos y olas'],
          [hush, -13, 0.2, 'Rumor grave'],
          [harp, -4, 'Arpa'],
          [strings, -12, 'Pad de cuerdas'],
        ], { t60: 1, size: 1, damp: 5000 });
      },
    },
  ],

  rio: [
    {
      title: 'Arroyo y kalimba',
      render() {
        const beat = SECONDS / 48; // 96 BPM, 12 pulsos por acorde
        const tune = [
          [0, 72, 0.8], [1, 76, 0.6], [2, 79, 0.7], [4, 76, 0.55], [5, 74, 0.5], [6, 72, 0.6], [8, 67, 0.5], [10, 72, 0.5],
          [12, 76, 0.75], [13, 72, 0.55], [14, 69, 0.6], [16, 72, 0.55], [17, 76, 0.5], [18, 81, 0.6], [20, 79, 0.5], [22, 76, 0.5],
          [24, 77, 0.7], [25, 72, 0.5], [26, 69, 0.55], [28, 72, 0.5], [30, 77, 0.5], [32, 76, 0.55], [34, 72, 0.5],
          [36, 74, 0.7], [37, 71, 0.5], [38, 67, 0.55], [40, 71, 0.5], [41, 74, 0.5], [42, 79, 0.6], [44, 74, 0.5], [46, 71, 0.45],
        ];
        const kalimba = play(tune, beat, S.kalimba, { wet: 0.35 });
        const pad = pads([[48, 55, 60, 64], [45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62]], WARM);
        return mix([
          [S.babble({ sources: 10, fLo: 450, fHi: 2200, rateLo: 3, rateHi: 10 }), 0, 0.15, 'Burbujeo'],
          [S.flow({ lo: 400, hi: 4000, turb: 0.45, rate: 10 }), -8, 0.15, 'Corriente'],
          [lp(brown(), 200), -18, 'Fondo grave'],
          [kalimba, -3, 'Kalimba'],
          [pad, -12, 'Pad'],
        ], { t60: 0.8, size: 0.7, damp: 6000 });
      },
    },
    {
      title: 'Río sereno y celesta',
      render() {
        const b = new Bus();
        const laps = bank(6, () => S.lap({ size: rand(0.3, 0.6), lo: 180, hi: 1600 }));
        poisson(0.25, (t) => b.place(pick(laps), t, { g: vary(0, 3), d: rand(0.1, 0.4) }));
        const strings = pads([[46, 53, 57, 62], [43, 53, 58, 62], [39, 55, 58, 62], [41, 53, 58, 60]], STRINGS);
        const tune = [
          [0, 74, 0.7], [2, 77, 0.6], [4, 81, 0.65], [6, 77, 0.5],
          [8, 79, 0.65], [10, 74, 0.55], [12, 70, 0.55],
          [16, 79, 0.65], [18, 75, 0.55], [20, 74, 0.6], [22, 70, 0.5],
          [24, 72, 0.6], [26, 77, 0.55], [28, 72, 0.5], [29, 70, 0.45],
        ];
        const celesta = play(tune, B32, S.celesta, { wet: 0.5 });
        return mix([
          [S.babble({ sources: 7, fLo: 180, fHi: 650, rateLo: 0.8, rateHi: 3, damp: 0.8, rise: [0.15, 0.4], loose: 0.15 }), 0, 0.25, 'Burbujeo grave'],
          [S.flow({ lo: 120, hi: 1400, turb: 0.35, rate: 4 }), -3, 0.2, 'Corriente'],
          [b.dry, -6, 0.25, 'Chapoteos'],
          [celesta, -2, 'Celesta'],
          [strings, -10, 'Pad de cuerdas'],
        ], { t60: 1.4, size: 1.5, damp: 4500 });
      },
    },
  ],

  viento: [
    {
      title: 'Brisa y flauta',
      render() {
        const gust = gusts(0.1, 0, 1, 1.6);
        const w = lp(S.wind(gust, { lo: 600, hi: 2400, q: 0.6, low: 0.3, hiss: 0.6 }), 7000, 0.6);
        const drone = evolvingPad([82.41, 123.47, 164.81, 246.94], { harm: 6, rolloff: 2, swellHz: 0.04, swellLo: 0.4, gains: [1, 0.8, 0.6, 0.35] });
        const tune = [
          [0, 71, 0.6, 1.5], [1.5, 74, 0.55, 0.5], [2, 76, 0.65, 3], [6, 74, 0.5, 1], [7, 71, 0.5, 0.8],
          [8, 69, 0.55, 1], [9, 67, 0.5, 1], [10, 64, 0.6, 4],
          [16, 67, 0.55, 1.5], [17.5, 69, 0.5, 0.5], [18, 71, 0.6, 2], [20, 74, 0.6, 1], [21, 76, 0.55, 1], [22, 79, 0.6, 2.5],
          [25, 76, 0.5, 1], [26, 74, 0.5, 1], [27, 71, 0.55, 3.5],
        ];
        const flute = play(tune, B32, S.softLead, { wet: 0.5, humanize: 0.02, rv: { t60: 3.2, size: 1.8, damp: 5000, predelay: 0.03 } });
        return mix([
          [w, 0, 0.12, 'Brisa'],
          [drone, -10, 0.3, 'Pad'],
          [flute, -2, 'Flauta'],
        ], { t60: 0.9, size: 1.2, damp: 6000 });
      },
    },
    {
      title: 'Valle con viento y cuerdas',
      render() {
        const gust = gusts(0.07, 0.05, 0.9, 1.4);
        const w = S.wind(gust, { lo: 220, hi: 800, q: 0.7, low: 0.8, hiss: 0.15 });
        const lv = S.leaves(gust, { rate: 2500, flutter: 0.25 });
        const strings = pads([[43, 55, 59, 62, 66], [40, 55, 59, 62, 64], [36, 52, 55, 59, 64], [50, 57, 62, 67]], STRINGS);
        const tune = [
          [0, 74, 0.6], [2, 71, 0.55], [4, 78, 0.6], [6, 74, 0.5],
          [8, 76, 0.6], [10, 71, 0.5], [12, 79, 0.6], [14, 76, 0.5],
          [16, 76, 0.6], [18, 79, 0.55], [20, 83, 0.55], [22, 79, 0.5],
          [24, 79, 0.55], [26, 74, 0.5], [28, 72, 0.5], [30, 69, 0.45],
        ];
        const harp = play(tune, B32, S.harp, { wet: 0.5 });
        return mix([
          [w, 0, 0.25, 'Viento'],
          [lv, -14, 0.1, 'Hojas'],
          [strings, -7, 'Pad de cuerdas'],
          [harp, -4, 'Arpa'],
        ], { t60: 2, size: 1.8, damp: 4000, lowcut: 80 });
      },
    },
  ],

  espacio: [
    {
      title: 'Deriva estelar',
      lufs: -24,
      render() {
        const pad = evolvingPad([65.41, 130.81, 196, 220, 329.63], { harm: 8, rolloff: 1.7, swellHz: 0.05, gains: [1, 0.8, 0.6, 0.55, 0.35] });
        const solar = mul(bp(pink(), range(lfo(0.03), 300, 1800), 2.5), range(lfo(0.05), 0.3, 1));
        const tune = [
          [0, 72, 0.6], [2, 79, 0.55], [4, 76, 0.6],
          [8, 81, 0.5], [10, 84, 0.55], [12, 79, 0.5],
          [16, 74, 0.55], [18, 76, 0.5], [20, 79, 0.5],
          [24, 71, 0.45], [26, 76, 0.55], [28, 72, 0.5],
        ];
        const celesta = play(tune, B32, S.celesta, { wet: 0.8, rv: { t60: 6, size: 2.2, damp: 4500, predelay: 0.04 } });
        return mix([
          [pad, 0, 0.6, 'Pad'],
          [solar, -16, 0.7, 'Viento solar'],
          [celesta, -5, 'Celesta'],
        ], { t60: 6.5, size: 2.2, damp: 4000, predelay: 0.03 }, lowpass(6000));
      },
    },
    {
      title: 'Luz lejana',
      lufs: -24,
      render() {
        const beat = SECONDS / 24; // 48 BPM
        const drone = evolvingPad([73.42, 110, 146.83, 220, 277.18], { harm: 8, rolloff: 1.8, swellHz: 0.04, swellLo: 0.45, gains: [1, 0.8, 0.65, 0.5, 0.3] });
        const tune = [
          [0, 74, 0.55], [1, 78, 0.5], [2, 81, 0.55], [4, 76, 0.45], [6, 73, 0.45],
          [8, 74, 0.5], [9, 69, 0.45], [12, 78, 0.5], [13, 76, 0.45], [14, 74, 0.45],
          [16, 81, 0.5], [17, 78, 0.45], [18, 76, 0.45], [20, 73, 0.45], [21, 71, 0.4], [22, 69, 0.45],
        ];
        const piano = play(tune, beat, S.feltPiano, { wet: 0.7, rv: { t60: 6, size: 2.4, damp: 4000, predelay: 0.05 } });
        const air = mul(lp(pink(), 300), range(lfo(0.04), 0.2, 1));
        return mix([
          [drone, 0, 0.5, 'Pad'],
          [piano, -3, 'Piano'],
          [air, -22, 0.5, 'Aire'],
        ], { t60: 7, size: 2.4, damp: 4500, predelay: 0.04 });
      },
    },
  ],

  cuento: [
    {
      title: 'Arpa de cuna',
      lufs: -24,
      render() {
        const beat = SECONDS / 36; // 72 BPM, 3/4, 12 compases
        const prog = ['D', 'Bm', 'G', 'A', 'D', 'F#m', 'G', 'A', 'Bm', 'G', 'Em', 'A'];
        const low = { D: [50, 57, 66], Bm: [47, 54, 62], G: [43, 50, 59], A: [45, 52, 61], 'F#m': [42, 49, 57], Em: [40, 47, 55] };
        const high = { D: [54, 57, 62], Bm: [54, 59, 62], G: [55, 59, 62], A: [52, 57, 61], 'F#m': [54, 57, 61], Em: [55, 59, 64] };
        const accomp = prog.flatMap((c, k) => low[c].map((m, i) => [k * 3 + i, m, i ? 0.38 : 0.52]));
        const tune = [
          [0, 78, 0.7], [2, 76, 0.55], [3, 74, 0.65],
          [6, 71, 0.55], [7, 74, 0.55], [8, 79, 0.6], [9, 78, 0.6], [11, 76, 0.5],
          [12, 78, 0.65], [13, 81, 0.6], [14, 78, 0.5], [15, 76, 0.6], [17, 73, 0.5],
          [18, 74, 0.6], [20, 71, 0.5], [21, 73, 0.55], [23, 69, 0.5],
          [24, 71, 0.55], [25, 74, 0.55], [26, 78, 0.6], [27, 79, 0.6], [29, 74, 0.5],
          [30, 76, 0.55], [31, 71, 0.5], [32, 67, 0.45], [33, 69, 0.55], [35, 73, 0.45],
        ];
        const harp = play([...accomp, ...tune], beat, S.harp, { wet: 0.4 });
        const strings = pads(prog.map((c) => high[c]), { ...STRINGS, fade: 1.2 });
        return mix([
          [harp, 0, 'Arpa'],
          [strings, -10, 'Pad de cuerdas'],
        ]);
      },
    },
    {
      title: 'Nana al piano',
      lufs: -24,
      render() {
        const prog = ['G', 'Em', 'C', 'D', 'G', 'Em', 'Am', 'D'];
        const broken = { G: [43, 50, 59, 50], Em: [40, 47, 55, 47], C: [48, 55, 64, 55], D: [50, 57, 66, 57], Am: [45, 52, 60, 52] };
        const voicing = { G: [55, 59, 62], Em: [55, 59, 64], C: [55, 60, 64], D: [54, 57, 62], Am: [57, 60, 64] };
        const accomp = prog.flatMap((c, k) => broken[c].map((m, i) => [k * 4 + i, m, i ? 0.26 : 0.34]));
        const tune = [
          [0, 71, 0.6], [1, 74, 0.55], [2, 79, 0.65],
          [4, 78, 0.55], [5, 76, 0.5], [6, 71, 0.5],
          [8, 72, 0.55], [9, 76, 0.55], [10, 79, 0.6], [11, 76, 0.45],
          [12, 74, 0.6], [14, 69, 0.5],
          [16, 71, 0.6], [17, 74, 0.55], [18, 79, 0.6], [19, 81, 0.5],
          [20, 79, 0.55], [21, 76, 0.5], [22, 71, 0.5],
          [24, 72, 0.55], [25, 76, 0.5], [26, 74, 0.5], [27, 72, 0.45],
          [28, 72, 0.5], [29, 71, 0.45], [30, 69, 0.5],
        ];
        const piano = play([...tune, ...accomp], B32, S.feltPiano, { wet: 0.4 });
        const pad = pads(prog.map((c) => voicing[c]), { ...WARM, fade: 1.5 });
        return mix([
          [piano, 0, 'Piano'],
          [pad, -11, 'Pad'],
        ]);
      },
    },
  ],

  meditacion: [
    {
      title: 'Cuencos y flauta',
      lufs: -24,
      render() {
        const bowls = new Bus();
        bowls.place(S.bowl(jitter(146.83, 0.002), 1), 0.3, { wet: 0.35 });
        bowls.place(S.bowl(jitter(220, 0.002), 0.8), 19, { wet: 0.35 });
        const drone = evolvingPad([73.42, 110, 146.83], { harm: 6, rolloff: 2, swellHz: 0.04, swellLo: 0.5, gains: [1, 0.7, 0.4] });
        const tune = [
          [0, 69, 0.6, 4], [4, 71, 0.5, 1], [5, 74, 0.6, 3],
          [10, 76, 0.55, 2], [12, 74, 0.5, 1], [13, 71, 0.5, 1], [14, 69, 0.55, 4],
          [20, 66, 0.5, 1.5], [21.5, 69, 0.5, 0.5], [22, 71, 0.55, 2], [24, 69, 0.5, 1], [25, 64, 0.5, 1], [26, 62, 0.55, 4],
        ];
        const flute = play(tune, B32, S.softLead, { wet: 0.5, humanize: 0.02, rv: { t60: 3.5, size: 1.8, damp: 5000, predelay: 0.03 } });
        return mix([
          [bowls.dry, 0, 0.35, 'Cuencos'],
          [flute, -3, 'Flauta'],
          [drone, -11, 0.3, 'Pad'],
        ], { t60: 4, size: 1.8, damp: 5000 });
      },
    },
    {
      title: 'Jardín zen',
      lufs: -24,
      render() {
        const beat = SECONDS / 40;
        const fountain = add(
          S.babble({ sources: 6, fLo: 700, fHi: 2200, rateLo: 3, rateHi: 8, loose: 0.2 }),
          S.flow({ lo: 500, hi: 3500, turb: 0.4, rate: 8 }), 0.4,
        );
        const drone = evolvingPad([98, 146.83, 196], { harm: 6, rolloff: 2, swellHz: 0.04, swellLo: 0.5, gains: [1, 0.7, 0.45] });
        const tune = [
          [0, 79, 0.7], [1, 74, 0.5], [2, 71, 0.55], [4, 76, 0.6], [6, 74, 0.5],
          [10, 71, 0.6], [11, 74, 0.5], [12, 79, 0.55], [14, 81, 0.55], [16, 76, 0.5],
          [20, 74, 0.6], [21, 71, 0.5], [22, 67, 0.55], [24, 69, 0.5], [26, 71, 0.5],
          [30, 74, 0.6], [31, 76, 0.5], [32, 79, 0.55], [34, 74, 0.5], [36, 71, 0.5],
        ];
        const kalimba = play(tune, beat, S.kalimba, { wet: 0.45, rv: { t60: 3, size: 1.6, damp: 5000, predelay: 0.03 } });
        return mix([
          [fountain, 0, 0.2, 'Fuente'],
          [kalimba, -2, 'Kalimba'],
          [drone, -11, 0.3, 'Pad'],
        ], { t60: 2.4, size: 1.4, damp: 5000 });
      },
    },
  ],

  pajaros: [
    {
      title: 'Mañana con arpa',
      render() {
        const b = new Bus();
        S.singer(b, S.robin, { gap: [5, 8], d: 0.5, g: 0.8 });
        S.singer(b, S.blackbird, { gap: [6, 10], d: 0.7, g: 0.8, start: rand(3, 6) });
        poisson(0.5, (t) => b.place(S.tinyChirp(), t, { d: rand(0.85, 1), g: vary(-4, 3) }));
        const arp = arpeggio([[52, 59, 64, 68], [49, 56, 61, 64], [45, 52, 61, 64], [47, 54, 59, 64]], 8, [[0, 0, 0.55], [0.5, 1, 0.42], [1, 2, 0.42], [1.5, 3, 0.42]]);
        const tune = [
          [3, 71, 0.6], [4, 75, 0.65], [6, 76, 0.55],
          [11, 73, 0.6], [12, 76, 0.6], [14, 80, 0.55],
          [19, 76, 0.6], [20, 73, 0.55], [22, 71, 0.5],
          [27, 71, 0.55], [28, 76, 0.55], [30, 75, 0.5],
        ];
        const harp = play([...arp, ...tune], B32, S.harp, { wet: 0.45 });
        const strings = pads([[52, 56, 59, 63], [49, 56, 59, 64], [45, 57, 61, 64, 68], [47, 54, 59, 64]], STRINGS);
        return mix([
          [b.render({ t60: 1.5, size: 1.4, damp: 6000 }), 0, 'Pájaros'],
          [band(pink(), 150, 1200), -28, 'Aire'],
          [harp, -2, 'Arpa'],
          [strings, -13, 'Pad de cuerdas'],
        ]);
      },
    },
    {
      title: 'Prado soleado y piano',
      render() {
        const b = new Bus();
        S.singer(b, S.chaffinch, { gap: [6, 9], d: 0.4, g: 0.9 });
        S.singer(b, S.greatTit, { gap: [5, 8], d: 0.6, g: 0.7, start: rand(2, 4) });
        S.singer(b, S.robin, { gap: [5, 8], d: 0.75, g: 0.7, start: rand(0, 3) });
        poisson(0.6, (t) => b.place(S.tinyChirp(), t, { d: rand(0.85, 1), g: vary(-4, 3) }));
        const lv = S.leaves(gusts(0.08, 0, 0.7, 1.6), { rate: 3000, flutter: 0.3 });
        const tune = [
          [0, 78, 0.6], [1, 76, 0.5], [2, 74, 0.55], [4, 69, 0.5], [6, 74, 0.5],
          [8, 73, 0.6], [10, 76, 0.55], [12, 81, 0.55], [14, 78, 0.45],
          [16, 79, 0.6], [17, 78, 0.5], [18, 74, 0.55], [20, 71, 0.5], [22, 74, 0.45],
          [24, 76, 0.55], [26, 73, 0.5], [28, 69, 0.5], [30, 76, 0.4],
        ];
        const bass = [[0, 50], [4, 57], [8, 42], [12, 49], [16, 43], [20, 50], [24, 45], [28, 52]].map(([b2, m]) => [b2, m, b2 % 8 ? 0.24 : 0.32]);
        const piano = play([...tune, ...bass], B32, S.feltPiano, { wet: 0.4 });
        const strings = pads([[50, 57, 62, 66], [49, 57, 61, 66], [47, 55, 62, 67], [45, 57, 61, 64]], STRINGS);
        return mix([
          [b.render({ t60: 1.8, size: 1.6, damp: 6000 }), 0, 'Pájaros'],
          [lv, -20, 0.1, 'Hojas'],
          [piano, -1, 'Piano'],
          [strings, -12, 'Pad de cuerdas'],
        ]);
      },
    },
  ],

  bichos: [
    {
      title: 'Pradera al anochecer',
      render() {
        const b = new Bus();
        cricketChorus(b, 8, { dLo: 0.4, dHi: 1, g: 0.8 });
        const pad = pads([[43, 55, 58, 62, 65], [39, 51, 55, 58, 62], [46, 53, 58, 62], [41, 53, 55, 60]], WARM);
        const tune = [
          [0, 74, 0.6], [2, 77, 0.55], [3, 74, 0.45], [4, 70, 0.55],
          [8, 75, 0.6], [10, 79, 0.55], [12, 74, 0.5],
          [16, 77, 0.6], [18, 74, 0.5], [20, 72, 0.5], [21, 70, 0.45],
          [24, 72, 0.55], [26, 69, 0.5], [28, 67, 0.5],
        ];
        const celesta = play(tune, B32, S.celesta, { wet: 0.5 });
        return mix([
          [b.render({ t60: 1.4, size: 1.4, damp: 6000 }), 0, 'Grillos'],
          [band(pink(), 200, 2000), -30, 'Aire'],
          [pad, -9, 'Pad'],
          [celesta, -2, 'Celesta'],
        ]);
      },
    },
    {
      title: 'Tarde de verano y guitarra',
      render() {
        const e = SECONDS / 48; // 6/8, 8 compases
        const b = new Bus();
        for (let i = 0; i < 2; i++) {
          const p = S.distance(S.treeCricket(), rand(0.7, 0.9));
          b.layer(p.ev, { g: p.g * 0.5, wet: p.wet });
        }
        cricketChorus(b, 5, { dLo: 0.7, dHi: 1, g: 0.6 });
        const breeze = S.wind(gusts(0.06, 0, 0.6, 1.5), { lo: 500, hi: 1600, low: 0.2, hiss: 0.3 });
        const chords = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [40, 47, 55, 59, 62], [45, 52, 55, 62, 64]];
        const arp = arpeggio(chords, 12, [
          [0, 0, 0.6], [1, 2, 0.38], [2, 3, 0.4], [3, 4, 0.38], [4, 3, 0.36], [5, 2, 0.36],
          [6, 1, 0.5], [7, 2, 0.38], [8, 3, 0.4], [9, 4, 0.38], [10, 3, 0.36], [11, 2, 0.36],
        ]);
        const tune = [
          [0, 78, 0.65], [3, 76, 0.5], [6, 74, 0.6], [9, 73, 0.45],
          [12, 74, 0.6], [15, 71, 0.5], [18, 73, 0.5], [21, 74, 0.45],
          [24, 76, 0.6], [27, 74, 0.5], [30, 71, 0.55], [33, 67, 0.45],
          [36, 69, 0.55], [39, 71, 0.5], [42, 74, 0.5], [45, 76, 0.45],
        ];
        const guitar = play([...arp, ...tune], e, S.nylon, { wet: 0.35 });
        const pad = pads([[50, 57, 62, 66], [47, 54, 59, 62], [47, 52, 55, 59], [45, 52, 57, 62]], WARM);
        return mix([
          [b.render({ t60: 1.4, size: 1.5, damp: 5500 }), 0, 'Grillos'],
          [breeze, -12, 0.1, 'Brisa'],
          [guitar, -1, 'Guitarra'],
          [pad, -12, 'Pad'],
        ]);
      },
    },
  ],

  bosque: [
    {
      title: 'Claro del bosque',
      render() {
        const gust = gusts(0.1, 0.05, 0.9, 1.5);
        const birds = new Bus();
        S.singer(birds, S.robin, { gap: [6, 10], d: 0.7, g: 0.7 });
        S.singer(birds, S.blackbird, { gap: [7, 11], d: 0.8, g: 0.7, start: rand(3, 6) });
        const pad = pads([[41, 53, 57, 60, 64], [50, 53, 57, 60], [46, 53, 57, 62], [48, 55, 60, 65]], STRINGS);
        const tune = [
          [0, 72, 0.6, 2], [2, 74, 0.55, 1], [3, 76, 0.6, 3], [6, 72, 0.5, 1.5],
          [8, 77, 0.6, 2], [10, 76, 0.5, 1], [11, 74, 0.5, 1], [12, 69, 0.55, 3.5],
          [16, 70, 0.5, 1], [17, 72, 0.5, 1], [18, 74, 0.6, 2], [20, 77, 0.55, 2], [22, 76, 0.5, 1.5],
          [24, 74, 0.5, 1], [25, 72, 0.5, 1], [26, 67, 0.55, 4],
        ];
        const flute = play(tune, B32, S.softLead, { wet: 0.5, humanize: 0.02, rv: { t60: 3, size: 1.7, damp: 5000, predelay: 0.03 } });
        // Sin hojarasca ni siseo (sonaban a estática): brisa grave y suave y un
        // arroyo lejano, ambos por debajo de 2 kHz; los pájaros llevan el paisaje.
        const breeze = lp(S.wind(gust, { lo: 250, hi: 900, q: 0.7, low: 0.35, hiss: 0 }), 1800, 0.6);
        const stream = lp(S.babble({ sources: 6, fLo: 300, fHi: 1200, rateLo: 2, rateHi: 6, damp: 0.8 }), 1600, 0.6);
        return mix([
          [birds.render({ t60: 1.8, size: 1.6, damp: 5500 }), 0, 'Pájaros'],
          [breeze, -8, 0.15, 'Brisa'],
          [stream, -15, 0.3, 'Arroyo'],
          [pad, -9, 'Pad de cuerdas'],
          [flute, -2, 'Flauta'],
        ], { t60: 1.2, size: 1.4, damp: 5500 });
      },
    },
    {
      title: 'Musgo y gotas',
      render() {
        const beat = SECONDS / 40;
        const gust = gusts(0.08, 0, 1, 2);
        // Gotas solo tonales (burbujas de Minnaert, sin ráfaga de ruido, con el
        // ataque suavizado) y sin hojarasca: el ruido sonaba a estática.
        const softDrop = (lo, hi, o) => {
          const ev = bubble(logRand(lo, hi), o);
          const na = Math.min(ev.length, sec(0.004));
          for (let i = 0; i < na; i++) ev[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / na);
          return lp(ev, 3000, 0.6);
        };
        const drips = new Bus();
        const plinks = bank(30, () => softDrop(900, 2600, { rise: rand(0.1, 0.3), damp: rand(0.9, 1.3) }));
        poisson(1.8, (t) => {
          const w = gust[Math.floor(t * SR) % N];
          if (rnd() < 0.25 + 0.75 * w) drips.place(pick(plinks), t, { g: vary(-2, 4), d: rand(0.1, 0.6) });
        });
        const puddles = bank(8, () => softDrop(450, 900, { rise: rand(0.15, 0.35), damp: 0.8 }));
        poisson(0.4, (t) => drips.place(pick(puddles), t, { g: vary(0, 3), d: rand(0.2, 0.5) }));
        const stream = lp(S.babble({ sources: 8, fLo: 400, fHi: 1800, rateLo: 4, rateHi: 10 }), 1500);
        const breeze = lp(S.wind(gust, { lo: 250, hi: 800, low: 0.3, hiss: 0 }), 1500, 0.6);
        const pad = pads([[40, 52, 55, 59, 66], [36, 52, 55, 59, 64], [43, 55, 59, 62], [42, 50, 54, 57, 62]], WARM);
        const tune = [
          [0, 71, 0.7], [1, 67, 0.5], [2, 64, 0.55], [4, 66, 0.5], [5, 67, 0.55], [6, 71, 0.6], [8, 74, 0.5],
          [10, 76, 0.65], [11, 72, 0.5], [12, 67, 0.5], [14, 71, 0.5], [15, 72, 0.5], [16, 76, 0.6], [18, 79, 0.5],
          [20, 74, 0.65], [21, 71, 0.5], [22, 67, 0.5], [24, 74, 0.5], [26, 79, 0.55], [27, 78, 0.5], [28, 74, 0.5],
          [30, 78, 0.6], [31, 74, 0.5], [32, 69, 0.5], [34, 66, 0.5], [36, 69, 0.5], [38, 74, 0.45],
        ];
        const kalimba = play(tune, beat, S.kalimba, { wet: 0.4 });
        return mix([
          [drips.dry, 0, 0.25, 15, 'Goteo'],
          [stream, -12, 0.3, 'Arroyo'],
          [breeze, -16, 0.1, 'Brisa'],
          [kalimba, -6, 'Kalimba'],
          [pad, -13, 'Pad'],
        ], { t60: 1.3, size: 1.4, damp: 5500 });
      },
    },
  ],

  noche: [
    {
      title: 'Noche estrellada',
      render() {
        const b = new Bus();
        cricketChorus(b, 10, { dLo: 0.6, dHi: 1, g: 0.8 });
        const breeze = S.wind(gusts(0.06, 0, 0.5, 1.6), { lo: 300, hi: 900, low: 0.3, hiss: 0.1 });
        const pad = pads([[49, 56, 60, 65], [46, 53, 56, 61, 65], [42, 53, 58, 61], [44, 51, 56, 61]], WARM);
        const tune = [
          [0, 72, 0.6], [2, 75, 0.55], [4, 77, 0.6], [6, 72, 0.45],
          [8, 73, 0.6], [10, 77, 0.55], [12, 80, 0.55], [14, 77, 0.45],
          [16, 78, 0.6], [18, 77, 0.5], [20, 73, 0.55], [22, 70, 0.45],
          [24, 72, 0.55], [26, 75, 0.5], [28, 68, 0.5],
        ];
        const vib = play(tune, B32, S.vibes, { wet: 0.5, rv: { t60: 3, size: 1.7, damp: 4800, predelay: 0.03 } });
        return mix([
          [b.render({ t60: 1.6, size: 1.6, damp: 5500 }), 0, 'Grillos'],
          [breeze, -20, 'Brisa'],
          [pad, -8, 'Pad'],
          [vib, -1, 'Vibráfono'],
        ]);
      },
    },
    {
      title: 'Nocturno junto al lago',
      render() {
        const water = new Bus();
        const laps = bank(6, () => S.lap({ size: rand(0.2, 0.45), lo: 200, hi: 1500 }));
        poisson(0.35, (t) => water.place(pick(laps), t, { d: rand(0.2, 0.5), g: vary(0, 3) }));
        const night = new Bus();
        cricketChorus(night, 5, { dLo: 0.75, dHi: 1, g: 0.5 });
        const prog = ['Bm', 'G', 'D', 'A'];
        const L = { Bm: [47, 54, 62], G: [43, 50, 59], D: [50, 57, 66], A: [45, 52, 61] };
        const accomp = prog.flatMap((c, k) => [
          [k * 8, L[c][0], 0.36], [k * 8 + 1, L[c][1], 0.32], [k * 8 + 2, L[c][2], 0.3], [k * 8 + 4, L[c][1], 0.3], [k * 8 + 5, L[c][2], 0.28],
        ]);
        const tune = [
          [0, 78, 0.6], [2, 76, 0.5], [3, 74, 0.5], [4, 71, 0.55], [6, 73, 0.45],
          [8, 74, 0.6], [10, 71, 0.5], [12, 78, 0.55], [14, 76, 0.45],
          [16, 74, 0.6], [18, 76, 0.5], [19, 78, 0.5], [20, 81, 0.55], [22, 78, 0.45],
          [24, 76, 0.55], [26, 73, 0.5], [28, 69, 0.5], [30, 73, 0.4],
        ];
        const piano = play([...tune, ...accomp], B32, S.feltPiano, { wet: 0.45 });
        const strings = pads([[47, 54, 59, 62, 66], [43, 55, 59, 62, 66], [50, 54, 57, 62, 64], [45, 52, 57, 61, 64]], STRINGS);
        return mix([
          [water.dry, 0, 0.3, 'Agua en la orilla'],
          [mul(lp(brown(), 300), gusts(0.05, 0.6, 1, 1)), -14, 0.2, 'Rumor grave'],
          [night.render({ t60: 1.6, size: 1.6, damp: 5000 }), -8, 'Grillos'],
          [piano, -3, 'Piano'],
          [strings, -12, 'Pad de cuerdas'],
        ], { t60: 1.4, size: 1.4, damp: 5000 });
      },
    },
  ],

  burbujas: [
    {
      title: 'Burbujas y caja de música',
      lufs: -24,
      render() {
        const bubbles = scatter(buf(), bank(50, () => bubble(logRand(250, 1100), { rise: rand(0.1, 0.3), damp: 0.8 })), 9, { env: range(lfo(0.1), 0.4, 1), spreadDb: 5 });
        const hum = lp(brown(), 200);
        const tune = [
          [0, 81, 0.6], [1, 79, 0.5], [2, 76, 0.55], [4, 72, 0.5], [6, 76, 0.45],
          [8, 79, 0.6], [9, 76, 0.5], [10, 74, 0.55], [12, 71, 0.5], [14, 74, 0.45],
          [16, 76, 0.6], [17, 74, 0.5], [18, 71, 0.55], [20, 67, 0.5], [22, 71, 0.45],
          [24, 72, 0.6], [25, 71, 0.5], [26, 69, 0.55], [28, 76, 0.5], [30, 72, 0.45],
        ];
        const box = play(tune, B32, S.musicBox, { wet: 0.45 });
        const pad = pads([[41, 53, 57, 60, 64], [43, 55, 59, 62, 64], [40, 52, 55, 59, 62], [45, 57, 60, 64, 67]], WARM);
        return mix([
          [bubbles, 0, 0.35, 'Burbujas'],
          [hum, -16, 0.3, 'Zumbido'],
          [box, -5, 'Caja de música'],
          [pad, -10, 'Pad'],
        ], { t60: 1.6, size: 1, damp: 4000 });
      },
    },
    {
      title: 'Acuario sereno',
      render() {
        const stream = scatter(buf(), bank(60, () => bubble(logRand(500, 1800), { rise: rand(0.08, 0.25) })), 20, { spreadDb: 4 });
        const trickle = add(S.babble({ sources: 5, fLo: 700, fHi: 2200, rateLo: 4, rateHi: 10 }), S.flow({ lo: 500, hi: 3500, turb: 0.5, rate: 12 }), 0.5);
        const pad = evolvingPad([116.54, 174.61, 220, 261.63, 293.66], { harm: 6, rolloff: 2, swellHz: 0.05, swellLo: 0.45, gains: [1, 0.8, 0.6, 0.5, 0.4] });
        const tune = [
          [0, 74, 0.6], [2, 77, 0.55], [3, 79, 0.5], [4, 74, 0.5],
          [8, 72, 0.55], [10, 70, 0.5], [11, 72, 0.45], [12, 77, 0.55],
          [16, 79, 0.55], [18, 82, 0.5], [20, 79, 0.45], [21, 77, 0.45],
          [24, 74, 0.5], [26, 72, 0.45], [28, 70, 0.5],
        ];
        const vib = play(tune, B32, S.vibes, { wet: 0.5 });
        return mix([
          [stream, 0, 0.15, 'Burbujas del aireador'],
          [trickle, -10, 0.15, 'Filtro'],
          [pad, -10, 0.3, 'Pad'],
          [vib, -3, 'Vibráfono'],
        ], { t60: 0.9, size: 0.8, damp: 6000 });
      },
    },
  ],
};

for (const [id, scenes] of Object.entries(MUSICAL)) SCENES[id].push(...scenes);

/** Número de la primera escena de alta calidad (04). */
export const FIRST_SCENE = 4;

/** Renderiza la escena `index` (0 … 4 → 04 … 08) de un ambiente. */
export function renderScene(id, index) {
  const scene = SCENES[id]?.[index];
  if (!scene) throw new Error(`Escena desconocida: ${id}/${index}`);
  seed(`${id}/${String(FIRST_SCENE + index).padStart(2, '0')}`);
  const raw = scene.render();
  return master(raw, { lufs: scene.lufs ?? -23 });
}

/**
 * Capas de una escena por separado, ya a la sonoridad de la escena: la suma
 * de todas es la escena antes del limitador final. Devuelve
 * `{ title, sampleRate, lufs, layers: [{ name, samples }] }`.
 */
export function renderLayers(id, index) {
  const scene = SCENES[id]?.[index];
  if (!scene) throw new Error(`Escena desconocida: ${id}/${index}`);
  seed(`${id}/${String(FIRST_SCENE + index).padStart(2, '0')}`);
  capture = [];
  let raw;
  let groups;
  try {
    raw = scene.render();
  } finally {
    groups = capture;
    capture = null;
  }
  // Una sola mezcla por escena; si no, la escena entera como única capa.
  const layers = groups.length === 1 ? groups[0] : [{ name: 'Escena', samples: raw }];
  const lufs = scene.lufs ?? -23;
  const filtered = layers.map((l) => ({ name: l.name, samples: hp(l.samples, 24, 0.707) }));
  const sum = new Float32Array(N);
  for (const l of filtered) add(sum, l.samples);
  const g = db(lufs - loudness(sum));
  for (const l of filtered) scale(l.samples, g);
  return { title: scene.title, sampleRate: SR, lufs, layers: filtered };
}

/* ------------------------------------------------------- pistas publicadas */

export const AMBIENT_NAMES = {
  lluvia: 'Lluvia', tormenta: 'Tormenta', fuego: 'Fuego', mar: 'Mar', rio: 'Río', viento: 'Viento', espacio: 'Espacio',
  cuento: 'Cuento', meditacion: 'Meditación', pajaros: 'Pájaros', bichos: 'Bichos', bosque: 'Bosque', noche: 'Noche', burbujas: 'Burbujas',
};

/**
 * De qué escena del generador sale cada pista publicada en la app
 * (`assets/audio/<id>/01.wav` y `02.wav`). `'base'` es una escena de la
 * síntesis base (`synth.js`), que no se puede regenerar igual: se usa el WAV.
 */
export const PUBLISHED = {
  lluvia: [4, 5], tormenta: [4, 5], fuego: [4, 5], viento: [4, 5], pajaros: [4, 5], espacio: [4, 5],
  bosque: [5, 6], burbujas: [5, 6], cuento: [4, 6], meditacion: [4, 6],
  mar: ['base', 5], noche: ['base', 4], bichos: ['base', 4], rio: ['base', 4],
};

/** Catálogo de pistas publicadas, en el orden de la app: `[{ id, name, tracks: [{ track, scene, title }] }]`. */
export function publishedCatalog() {
  return Object.keys(AMBIENT_NAMES).map((id) => ({
    id,
    name: AMBIENT_NAMES[id],
    tracks: PUBLISHED[id].map((scene, k) => ({
      track: k + 1,
      scene: scene === 'base' ? null : scene,
      title: scene === 'base' ? 'Escena original' : SCENES[id][scene - FIRST_SCENE].title,
    })),
  }));
}

export { SR as SAMPLE_RATE, SECONDS, N };
