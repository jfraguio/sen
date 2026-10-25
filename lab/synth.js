/**
 * Sintetizador paramétrico del laboratorio.
 *
 * Genera un bucle de 16 s en mono a 16 kHz a partir de los parámetros de cada
 * ambiente. No usa archivos de audio: modela directamente ruido filtrado,
 * eventos y drones. El resultado se convierte en AudioBuffer en lab.js.
 */

export const SAMPLE_RATE = 16000;
export const DURATION = 16;
const N = SAMPLE_RATE * DURATION;
const CROSS = Math.floor(SAMPLE_RATE * 1.5);
const TAU = Math.PI * 2;

const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
const map = (value, min, max) => min + (max - min) * value;

function make() {
  return new Float32Array(N + CROSS);
}

function noise(data, gain = 1) {
  for (let i = 0; i < data.length; i++) data[i] += (Math.random() * 2 - 1) * gain;
}

function brown(data, gain = 1) {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] += last * gain;
  }
}

function biquad(data, type, freq, q = 0.707) {
  const w0 = (TAU * freq) / SAMPLE_RATE;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  let b0;
  let b1;
  let b2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }

  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - na1 * y1 - na2 * y2;
    data[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
}

function lowpass(data, freq, q = 0.707) { biquad(data, 'lowpass', freq, q); }
function highpass(data, freq, q = 0.707) { biquad(data, 'highpass', freq, q); }
function bandpass(data, freq, q = 0.707) { biquad(data, 'bandpass', freq, q); }

function sine(data, freq, gain, phase = 0) {
  const step = (TAU * freq) / SAMPLE_RATE;
  for (let i = 0; i < data.length; i++) data[i] += Math.sin(step * i + phase) * gain;
}

function add(target, source, gain = 1) {
  for (let i = 0; i < target.length; i++) target[i] += source[i] * gain;
}

function addChirp(data, at, duration, startFreq, endFreq, gain, options = {}) {
  const start = Math.floor(at * SAMPLE_RATE);
  const length = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  const { warble = 0, warbleRate = 0, decay = 2.2, harmonic = 0.08 } = options;
  let phase = 0;
  for (let j = 0; j < length && start + j < data.length; j++) {
    const t = j / SAMPLE_RATE;
    const u = j / length;
    const freq = startFreq + (endFreq - startFreq) * u + Math.sin(TAU * warbleRate * t) * warble;
    const env = Math.sin(Math.PI * u) ** 0.65 * Math.exp(-decay * u);
    phase += (TAU * freq) / SAMPLE_RATE;
    data[start + j] += (Math.sin(phase) + harmonic * Math.sin(phase * 2)) * env * gain;
  }
}

function addCrackles(data, count, gain) {
  for (let k = 0; k < count; k++) {
    const start = Math.floor(rand(0, N));
    const length = Math.floor(rand(0.003, 0.04) * SAMPLE_RATE);
    let previous = 0;
    for (let j = 0; j < length && start + j < data.length; j++) {
      const n = Math.random() * 2 - 1;
      const filtered = n - previous * 0.82;
      previous = n;
      const env = Math.exp(-j / (length * 0.3));
      data[start + j] += filtered * env * gain;
    }
  }
}

function addNoiseBurst(data, at, duration, gain) {
  const start = Math.floor(at * SAMPLE_RATE);
  const length = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  let previous = 0;
  for (let j = 0; j < length && start + j < data.length; j++) {
    const n = Math.random() * 2 - 1;
    const filtered = n - previous;
    previous = n;
    const env = Math.sin((Math.PI * j) / length) ** 2;
    data[start + j] += filtered * env * gain;
  }
}

function addCricket(data, at, duration, freq, pulseRate, gain) {
  const start = Math.floor(at * SAMPLE_RATE);
  const length = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  let phase = 0;
  for (let j = 0; j < length && start + j < data.length; j++) {
    const t = j / SAMPLE_RATE;
    const u = j / length;
    const env = Math.sin(Math.PI * u) ** 0.5;
    const pulse = Math.max(0, Math.sin(TAU * pulseRate * t)) ** 3;
    phase += (TAU * freq * (1 + Math.sin(TAU * 1.7 * t) * 0.002)) / SAMPLE_RATE;
    data[start + j] += Math.sin(phase) * env * pulse * gain;
  }
}

function addBirdPhrase(data, at, baseFreq, gain) {
  const count = 2 + Math.floor(rand(0, 4));
  let time = at;
  const direction = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < count; i++) {
    const duration = rand(0.06, 0.2);
    const f0 = baseFreq * rand(0.85, 1.2) * (1 + direction * i * 0.04);
    addChirp(data, time, duration, f0, f0 * rand(1.1, 1.7), gain * rand(0.55, 1), {
      warble: rand(0, 80),
      warbleRate: rand(15, 40),
      decay: rand(1.5, 3),
    });
    time += duration + rand(0.03, 0.11);
  }
  if (Math.random() < 0.3) {
    let t = time + rand(0.05, 0.2);
    const f = baseFreq * rand(1.2, 1.8);
    for (let i = 0; i < 6; i++) {
      addChirp(data, t, 0.045, f, f * rand(0.9, 1.1), gain * 0.5, { decay: 4 });
      t += 0.055;
    }
  }
}

function addThunder(data, at, gain) {
  const start = Math.floor(at * SAMPLE_RATE);
  const duration = 4.2;
  let last = 0;
  for (let j = 0; j < duration * SAMPLE_RATE && start + j < data.length; j++) {
    const t = j / SAMPLE_RATE;
    const env = (1 - Math.exp(-t / 0.12)) * Math.exp(-t / 1.5);
    last = (last + 0.03 * (Math.random() * 2 - 1)) / 1.03;
    data[start + j] += last * env * gain;
    data[start + j] += Math.sin(TAU * 46 * t) * env * gain * 0.5;
  }
}

function addOwl(data, at, gain) {
  const notes = [
    { freq: 392, duration: 0.42 },
    { freq: 330, duration: 0.55 },
  ];
  let time = at;
  for (const note of notes) {
    addChirp(data, time, note.duration, note.freq, note.freq * 0.94, gain, {
      warble: 4,
      warbleRate: 5,
      decay: 1.2,
      harmonic: 0.15,
    });
    time += note.duration + 0.2;
  }
}

function flicker(data, depth, rates) {
  if (depth <= 0.001) return;
  const phases = rates.map(() => rand(0, TAU));
  for (let i = 0; i < data.length; i++) {
    let modulation = 0;
    for (let k = 0; k < rates.length; k++) {
      modulation += 0.5 + 0.5 * Math.sin((TAU * rates[k] * i) / SAMPLE_RATE + phases[k]);
    }
    modulation /= rates.length;
    data[i] *= 1 - depth * (1 - modulation);
  }
}

function breathe(data, freq, depth, phase = 0) {
  if (depth <= 0.001) return;
  const step = (TAU * freq) / SAMPLE_RATE;
  for (let i = 0; i < data.length; i++) {
    data[i] *= 1 - depth / 2 + (depth / 2) * Math.sin(step * i + phase);
  }
}

function finalize(raw, peak = 0.46) {
  const out = new Float32Array(N);
  out.set(raw.subarray(0, N));
  for (let i = 0; i < CROSS; i++) {
    const w = i / CROSS;
    out[i] = raw[i] * w + raw[N + i] * (1 - w);
  }
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  const scale = max > 0 ? peak / max : 1;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/* --------------------------------------------------------------------------
   Controles por ambiente
   -------------------------------------------------------------------------- */

export const BASE_CONTROLS = {
  lluvia: [
    { key: 'intensity', label: 'Intensidad', default: 0.6 },
    { key: 'drops', label: 'Gotas', default: 0.45 },
    { key: 'hiss', label: 'Siseo', default: 0.55 },
    { key: 'wind', label: 'Aire', default: 0.2 },
    { key: 'brightness', label: 'Brillo', default: 0.6 },
  ],
  tormenta: [
    { key: 'rain', label: 'Lluvia', default: 0.55 },
    { key: 'thunder', label: 'Truenos', default: 0.5 },
    { key: 'wind', label: 'Viento', default: 0.45 },
    { key: 'rumble', label: 'Graves', default: 0.55 },
    { key: 'brightness', label: 'Brillo', default: 0.5 },
  ],
  fuego: [
    { key: 'intensity', label: 'Intensidad', default: 0.55 },
    { key: 'crackle', label: 'Chasquidos', default: 0.65 },
    { key: 'rumble', label: 'Graves', default: 0.5 },
    { key: 'flicker', label: 'Parpadeo', default: 0.45 },
    { key: 'brightness', label: 'Brillo', default: 0.55 },
  ],
  mar: [
    { key: 'speed', label: 'Velocidad', default: 0.45 },
    { key: 'depth', label: 'Oleaje', default: 0.6 },
    { key: 'foam', label: 'Espuma', default: 0.5 },
    { key: 'wind', label: 'Viento', default: 0.25 },
    { key: 'brightness', label: 'Brillo', default: 0.55 },
  ],
  rio: [
    { key: 'flow', label: 'Corriente', default: 0.55 },
    { key: 'bubbles', label: 'Burbujeo', default: 0.4 },
    { key: 'width', label: 'Cauce', default: 0.5 },
    { key: 'air', label: 'Aire', default: 0.3 },
    { key: 'brightness', label: 'Brillo', default: 0.55 },
  ],
  viento: [
    { key: 'gust', label: 'Ráfagas', default: 0.55 },
    { key: 'speed', label: 'Velocidad', default: 0.5 },
    { key: 'air', label: 'Aire', default: 0.5 },
    { key: 'brightness', label: 'Brillo', default: 0.5 },
  ],
  espacio: [
    { key: 'drone', label: 'Drone', default: 0.55 },
    { key: 'shimmer', label: 'Destellos', default: 0.35 },
    { key: 'movement', label: 'Movimiento', default: 0.4 },
    { key: 'brightness', label: 'Brillo', default: 0.5 },
  ],
  cuento: [
    { key: 'pads', label: 'Pads', default: 0.55 },
    { key: 'notes', label: 'Notas', default: 0.55 },
    { key: 'tempo', label: 'Tempo', default: 0.5 },
    { key: 'sparkle', label: 'Destellos', default: 0.4 },
    { key: 'brightness', label: 'Brillo', default: 0.55 },
  ],
  meditacion: [
    { key: 'drone', label: 'Drone', default: 0.55 },
    { key: 'breath', label: 'Respiración', default: 0.4 },
    { key: 'bowls', label: 'Cuencos', default: 0.45 },
    { key: 'brightness', label: 'Brillo', default: 0.5 },
  ],
  pajaros: [
    { key: 'birds', label: 'Pájaros', default: 0.6 },
    { key: 'variety', label: 'Variedad', default: 0.55 },
    { key: 'wind', label: 'Viento', default: 0.3 },
    { key: 'leaves', label: 'Hojas', default: 0.4 },
    { key: 'brightness', label: 'Brillo', default: 0.55 },
  ],
  bichos: [
    { key: 'crickets', label: 'Grillos', default: 0.6 },
    { key: 'cicadas', label: 'Cigarras', default: 0.45 },
    { key: 'air', label: 'Aire', default: 0.3 },
    { key: 'brightness', label: 'Brillo', default: 0.5 },
  ],
  bosque: [
    { key: 'wind', label: 'Viento', default: 0.5 },
    { key: 'leaves', label: 'Hojas', default: 0.55 },
    { key: 'birds', label: 'Pájaros', default: 0.35 },
    { key: 'rustle', label: 'Ramas', default: 0.45 },
    { key: 'brightness', label: 'Brillo', default: 0.55 },
  ],
  noche: [
    { key: 'crickets', label: 'Grillos', default: 0.55 },
    { key: 'owl', label: 'Búho', default: 0.35 },
    { key: 'wind', label: 'Aire', default: 0.3 },
    { key: 'drone', label: 'Drone', default: 0.4 },
    { key: 'brightness', label: 'Brillo', default: 0.4 },
  ],
  burbujas: [
    { key: 'bubbles', label: 'Burbujas', default: 0.55 },
    { key: 'pops', label: 'Pompas', default: 0.5 },
    { key: 'water', label: 'Agua', default: 0.5 },
    { key: 'fizz', label: 'Efervescencia', default: 0.4 },
    { key: 'brightness', label: 'Brillo', default: 0.5 },
  ],
};

export function defaultBaseParams(id) {
  const controls = BASE_CONTROLS[id] || BASE_CONTROLS.lluvia;
  return Object.fromEntries(controls.map((control) => [control.key, control.default]));
}

/* --------------------------------------------------------------------------
   Recetas
   -------------------------------------------------------------------------- */

function lluvia(p) {
  const raw = make();
  const hiss = make();
  noise(hiss, 1);
  highpass(hiss, 300);
  lowpass(hiss, map(p.brightness, 1100, 6500));
  add(raw, hiss, 0.12 + p.hiss * 0.33);

  const body = make();
  noise(body, 1);
  lowpass(body, map(p.drops, 240, 900));
  add(raw, body, 0.12 + p.drops * 0.32);

  const air = make();
  noise(air, 1);
  bandpass(air, 600, 0.7);
  add(raw, air, p.wind * 0.22);

  const drops = Math.round(8 + p.intensity * 60);
  for (let i = 0; i < drops; i++) {
    const freq = rand(700, map(p.brightness, 1500, 3200));
    addChirp(raw, rand(0, DURATION - 0.1), rand(0.025, 0.08), freq, freq * 1.2, rand(0.012, 0.035), { decay: 4.5 });
  }

  breathe(raw, 1 / 9, p.wind * 0.2, 1.3);
  return finalize(raw, 0.46);
}

function tormenta(p) {
  const raw = make();
  const rain = make();
  noise(rain, 1);
  highpass(rain, 300);
  lowpass(rain, map(p.brightness, 1000, 5500));
  add(raw, rain, 0.08 + p.rain * 0.32);

  const wind = make();
  noise(wind, 1);
  lowpass(wind, 260);
  add(raw, wind, 0.1 + p.wind * 0.3);

  const rumble = make();
  brown(rumble, 1);
  lowpass(rumble, 100 + p.rumble * 130);
  add(raw, rumble, 0.18 + p.rumble * 0.35);

  const strikes = 1 + Math.round(p.thunder * 4);
  for (let i = 0; i < strikes; i++) {
    addThunder(raw, rand(0.3, DURATION - 4.5), 0.25 + p.thunder * 0.6);
  }

  flicker(raw, 0.08 + p.wind * 0.15, [0.7, 1.2, 2.1]);
  return finalize(raw, 0.5);
}

function fuego(p) {
  const raw = make();
  const low = make();
  brown(low, 1.1);
  lowpass(low, map(p.rumble, 80, 420));
  add(raw, low, 0.28 + p.rumble * 0.42);

  const hiss = make();
  noise(hiss, 1);
  bandpass(hiss, map(p.brightness, 800, 3000), 0.7);
  add(raw, hiss, 0.06 + p.crackle * 0.2);

  addCrackles(raw, Math.round(20 + p.intensity * 340), 0.12 + p.crackle * 0.32);

  const pops = Math.round(3 + p.intensity * 18);
  for (let i = 0; i < pops; i++) {
    const at = rand(0, DURATION - 0.2);
    const f = rand(50, 180);
    addChirp(raw, at, rand(0.06, 0.18), f, f * rand(1.2, 1.8), rand(0.01, 0.03), { decay: 3, harmonic: 0.05 });
  }

  flicker(raw, p.flicker * 0.45, [1.7, 3.3, 5.1, 7.9]);
  return finalize(raw, 0.48);
}

function mar(p) {
  const raw = make();
  const period = map(p.speed, 14, 4.5);
  const step = TAU / (period * SAMPLE_RATE);

  const surf = make();
  noise(surf, 1);
  highpass(surf, 90);
  lowpass(surf, map(p.brightness, 700, 4000));
  for (let i = 0; i < surf.length; i++) {
    const swell = (0.5 + 0.5 * Math.sin(step * i - Math.PI / 2)) ** 1.5;
    surf[i] *= 0.1 + swell * (0.18 + p.depth * 0.72);
  }
  add(raw, surf, 0.9);

  const deep = make();
  brown(deep, 1);
  lowpass(deep, 180);
  add(raw, deep, 0.14 + p.depth * 0.18);

  const foam = make();
  noise(foam, 1);
  highpass(foam, 2200);
  for (let i = 0; i < foam.length; i++) {
    const swell = (0.5 + 0.5 * Math.sin(step * i - Math.PI / 2)) ** 3;
    foam[i] *= swell;
  }
  add(raw, foam, p.foam * 0.16);

  const wind = make();
  noise(wind, 1);
  lowpass(wind, 900);
  add(raw, wind, p.wind * 0.1);

  return finalize(raw, 0.48);
}

function rio(p) {
  const raw = make();
  const water = make();
  noise(water, 1);
  highpass(water, 260);
  lowpass(water, map(p.brightness, 1300, 5200));
  add(raw, water, 0.22 + p.flow * 0.34);

  const body = make();
  noise(body, 1);
  bandpass(body, map(p.width, 420, 1000), 0.8);
  add(raw, body, 0.12 + p.flow * 0.26);

  const bubbles = Math.round(6 + p.bubbles * 80);
  for (let i = 0; i < bubbles; i++) {
    const f = rand(300, 1200);
    addChirp(raw, rand(0, DURATION - 0.1), rand(0.05, 0.18), f, f * rand(1.3, 2), rand(0.01, 0.032), { decay: 4 });
  }

  const air = make();
  noise(air, 1);
  highpass(air, 3200);
  add(raw, air, p.air * 0.065);

  breathe(raw, 1 / 8, 0.18, 2);
  return finalize(raw, 0.44);
}

function viento(p) {
  const raw = make();
  const low = make();
  noise(low, 1);
  lowpass(low, map(p.brightness, 240, 700));
  flicker(low, 0.5 + p.gust * 0.3, [0.16, 0.3, 0.47]);
  add(raw, low, 0.35 + p.air * 0.3);

  const mid = make();
  noise(mid, 1);
  bandpass(mid, map(p.brightness, 600, 1500), 0.7);
  flicker(mid, 0.55 + p.gust * 0.35, [0.23, 0.41, 0.73]);
  add(raw, mid, 0.25 + p.air * 0.22);

  const high = make();
  noise(high, 1);
  highpass(high, 2300);
  flicker(high, 0.6, [0.12, 0.29, 0.53]);
  add(raw, high, 0.04 + p.air * 0.12);

  breathe(raw, map(p.speed, 1 / 30, 1 / 9), 0.22, 1.1);
  return finalize(raw, 0.44);
}

function espacio(p) {
  const raw = make();
  const partials = [55, 82.5, 110, 165, 220];
  partials.forEach((freq, index) => {
    sine(raw, freq, (0.05 - index * 0.007) * (0.35 + p.drone));
    sine(raw, freq + 0.0625, (0.03 - index * 0.004) * (0.35 + p.drone), index * 1.7);
  });

  const shimmer = make();
  noise(shimmer, 1);
  highpass(shimmer, 3200);
  flicker(shimmer, 0.4 + p.shimmer * 0.5, [0.08, 0.17, 0.31]);
  add(raw, shimmer, 0.02 + p.shimmer * 0.06);

  const chimes = 2 + Math.round(p.movement * 8);
  for (let i = 0; i < chimes; i++) {
    const f = rand(220, 660);
    addChirp(raw, rand(0, DURATION - 2), rand(2, 4.5), f, f * rand(0.96, 1.05), rand(0.008, 0.025), {
      decay: 3.4,
      harmonic: 0.12,
    });
  }

  breathe(raw, 1 / 15, 0.25 + p.drone * 0.15, 0.8);
  return finalize(raw, 0.4);
}

function cuento(p) {
  const raw = make();
  const notes = [220, 261.625, 329.625, 440];
  notes.forEach((freq, index) => {
    sine(raw, freq, 0.012 * (0.4 + p.pads), index * 1.3);
    sine(raw, freq + 0.0625, 0.008 * (0.4 + p.pads), index * 0.7);
  });

  const air = make();
  noise(air, 1);
  lowpass(air, 1800);
  highpass(air, 300);
  add(raw, air, 0.012 + p.sparkle * 0.02);

  const scale = [440, 493.875, 523.25, 587.328, 659.25, 783.99, 880];
  const interval = map(p.tempo, 4.6, 1.5);
  let at = 0.7;
  let index = 0;
  while (at < DURATION - 2) {
    const freq = scale[index % scale.length] * (Math.random() < 0.12 ? 0.5 : 1);
    addChirp(raw, at, rand(1.6, 2.8), freq, freq, (0.025 + p.notes * 0.05) * rand(0.65, 1), {
      decay: 3.8,
      harmonic: 0.3,
    });
    if (Math.random() < 0.35) {
      addChirp(raw, at + rand(0.15, 0.4), 1.2, freq * 2, freq * 2, (0.006 + p.notes * 0.014), {
        decay: 4.2,
        harmonic: 0.1,
      });
    }
    at += interval * rand(0.7, 1.3);
    index += Math.random() < 0.25 ? 2 : 1;
  }

  breathe(raw, 1 / 9, 0.18 + p.pads * 0.14, 1.1);
  return finalize(raw, 0.44);
}

function meditacion(p) {
  const raw = make();
  const notes = [110, 165, 220, 330];
  notes.forEach((freq, index) => {
    sine(raw, freq, 0.03 * (0.35 + p.drone), index * 1.5);
    sine(raw, freq + 0.0625, 0.015 * (0.35 + p.drone), index * 0.9);
  });

  const air = make();
  noise(air, 1);
  bandpass(air, 2400, 0.5);
  add(raw, air, 0.008 + p.brightness * 0.02);

  const bowls = 2 + Math.round(p.bowls * 9);
  for (let i = 0; i < bowls; i++) {
    const f = notes[Math.floor(rand(0, notes.length))];
    addChirp(raw, rand(0, DURATION - 4), rand(3, 5), f, f * 0.98, rand(0.012, 0.03), {
      decay: 4,
      harmonic: 0.1,
    });
  }

  breathe(raw, map(p.breath, 1 / 18, 1 / 7), 0.25 + p.breath * 0.25, 0);
  return finalize(raw, 0.4);
}

function pajaros(p) {
  const raw = make();
  const leaves = make();
  noise(leaves, 1);
  highpass(leaves, 260);
  lowpass(leaves, 2500);
  flicker(leaves, 0.3, [0.14, 0.31, 0.52]);
  add(raw, leaves, 0.01 + p.leaves * 0.04);

  const wind = make();
  brown(wind, 1);
  lowpass(wind, 150);
  add(raw, wind, 0.04 + p.wind * 0.12);

  const phrases = 3 + Math.round(p.birds * 28);
  for (let i = 0; i < phrases; i++) {
    addBirdPhrase(raw, rand(0, DURATION - 2), map(p.variety, 1500, 3800) * rand(0.7, 1.2), rand(0.016, 0.04));
  }

  const cuckoo = Math.random() < 0.5;
  if (cuckoo) {
    const at = rand(1, DURATION - 2);
    addChirp(raw, at, 0.26, 700, 680, 0.018, { decay: 1.2, harmonic: 0.1 });
    addChirp(raw, at + 0.36, 0.32, 580, 560, 0.016, { decay: 1.2, harmonic: 0.1 });
  }

  breathe(raw, 1 / 20, 0.16, 1);
  return finalize(raw, 0.44);
}

function bichos(p) {
  const raw = make();
  const air = make();
  noise(air, 1);
  highpass(air, 180);
  lowpass(air, 1200);
  add(raw, air, 0.05 + p.air * 0.16);

  const crickets = 5 + Math.round(p.crickets * 35);
  for (let i = 0; i < crickets; i++) {
    addCricket(raw, rand(0, DURATION - 3), rand(0.8, 2.6), rand(3200, 4600), rand(18, 32), rand(0.01, 0.03));
  }

  const buzz = make();
  noise(buzz, 1);
  bandpass(buzz, 4800, 1.5);
  flicker(buzz, 0.15, [0.08, 0.17]);
  add(raw, buzz, p.cicadas * 0.055);

  breathe(raw, 1 / 11, 0.15, 0.4);
  return finalize(raw, 0.42);
}

function bosque(p) {
  const raw = make();
  const wind = make();
  noise(wind, 1);
  lowpass(wind, 1000);
  highpass(wind, 80);
  flicker(wind, 0.45, [0.09, 0.17, 0.33]);
  add(raw, wind, 0.16 + p.wind * 0.3);

  const leaves = make();
  noise(leaves, 1);
  highpass(leaves, 1400);
  lowpass(leaves, 5200);
  flicker(leaves, 0.55, [0.11, 0.28, 0.47]);
  add(raw, leaves, 0.04 + p.leaves * 0.14);

  const low = make();
  brown(low, 1);
  lowpass(low, 130);
  add(raw, low, 0.14 + p.wind * 0.16);

  const rustles = 1 + Math.round(p.rustle * 8);
  for (let i = 0; i < rustles; i++) {
    addNoiseBurst(raw, rand(0, DURATION - 0.6), rand(0.15, 0.5), rand(0.008, 0.025));
  }

  const birds = Math.round(p.birds * 24);
  for (let i = 0; i < birds; i++) {
    addBirdPhrase(raw, rand(0, DURATION - 2), rand(1800, 3200), rand(0.008, 0.02));
  }

  if (Math.random() < 0.35) {
    addChirp(raw, rand(0, DURATION - 1), rand(0.3, 0.7), rand(80, 180), rand(80, 180), rand(0.01, 0.025), { decay: 1.6 });
  }

  breathe(raw, 1 / 17, 0.18, 0.5);
  return finalize(raw, 0.43);
}

function noche(p) {
  const raw = make();
  const air = make();
  noise(air, 1);
  lowpass(air, 600);
  highpass(air, 60);
  breathe(air, 1 / 13, 0.28, 0.7);
  add(raw, air, 0.1 + p.wind * 0.24);

  sine(raw, 55, 0.025 * (0.3 + p.drone));
  sine(raw, 82.5, 0.012 * (0.3 + p.drone));

  const crickets = 4 + Math.round(p.crickets * 32);
  for (let i = 0; i < crickets; i++) {
    addCricket(raw, rand(0, DURATION - 3), rand(1.3, 3.2), rand(3300, 4400), rand(18, 28), rand(0.006, 0.018));
  }

  const owls = 1 + Math.round(p.owl * 3);
  for (let i = 0; i < owls; i++) {
    addOwl(raw, rand(1, DURATION - 3), 0.02);
  }

  breathe(raw, 1 / 14, 0.2, 1.5);
  return finalize(raw, 0.4);
}

function burbujas(p) {
  const raw = make();
  const water = make();
  noise(water, 1);
  lowpass(water, 900);
  highpass(water, 90);
  breathe(water, 1 / 6, 0.3, 0.3);
  add(raw, water, 0.06 + p.water * 0.22);

  const low = make();
  brown(low, 1);
  lowpass(low, 180);
  add(raw, low, 0.1 + p.water * 0.18);

  const bubbles = Math.round(12 + p.bubbles * 64);
  for (let i = 0; i < bubbles; i++) {
    const at = rand(0, DURATION - 0.2);
    const f = rand(220, 900);
    addChirp(raw, at, rand(0.05, 0.2), f, f * rand(1.3, 2.2), rand(0.012, 0.038), {
      decay: rand(2.4, 4.4),
      harmonic: 0.14,
    });
  }

  const pops = Math.round(2 + p.pops * 22);
  for (let i = 0; i < pops; i++) {
    const f = rand(900, 1900);
    addChirp(raw, rand(0, DURATION - 0.1), rand(0.025, 0.07), f, f * rand(1.1, 1.8), rand(0.008, 0.026), {
      decay: 4,
      harmonic: 0.1,
    });
  }

  const fizz = make();
  noise(fizz, 1);
  highpass(fizz, 2500);
  flicker(fizz, 0.4, [0.1, 0.23]);
  add(raw, fizz, p.fizz * 0.035);

  breathe(raw, 1 / 9, 0.14, 2);
  return finalize(raw, 0.42);
}

const RECIPES = {
  lluvia,
  tormenta,
  fuego,
  mar,
  rio,
  viento,
  espacio,
  cuento,
  meditacion,
  pajaros,
  bichos,
  bosque,
  noche,
  burbujas,
};

export function renderAmbient(id, params = {}) {
  const values = { ...defaultBaseParams(id), ...params };
  const recipe = RECIPES[id] || lluvia;
  return recipe(values);
}
