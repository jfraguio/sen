/**
 * Sintetizador paramétrico del laboratorio.
 *
 * Genera un bucle de 16 s en mono a 16 kHz a partir de los parámetros de cada
 * ambiente. No usa archivos de audio: modela directamente ruido filtrado,
 * eventos y drones. El resultado se convierte en AudioBuffer en lab.js.
 *
 * Cada receta acepta `scene` (0, 1 o 2) para generar tres patrones distintos
 * del mismo ambiente. La escena 0 es la que usa el laboratorio por defecto.
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

function addCrackles(data, count, gain, start = 0, end = DURATION) {
  for (let k = 0; k < count; k++) {
    addCrackleAt(data, rand(start, end), gain);
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

/**
 * Llamada de grillo: varios pulsos cortos con una pequeña deriva de tono.
 * Devuelve el instante en el que termina la llamada.
 */
function addCricketCall(data, at, options = {}) {
  const {
    frequency = 4200,
    pulses = 4,
    rate = 26,
    gain = 0.12,
    spread = 0.02,
    width = 0.55,
  } = options;
  let time = at;
  for (let k = 0; k < pulses; k++) {
    const length = (width / rate) * rand(0.85, 1.15);
    const f = frequency * (1 + rand(-spread, spread));
    addChirp(data, time, length, f, f * rand(0.985, 1.015), gain * rand(0.82, 1), {
      decay: 2.4,
      harmonic: 0.03,
      warble: f * 0.003,
      warbleRate: rand(70, 120),
    });
    time += 1 / rate;
  }
  return time;
}

/** Cigarra: tono agudo con trémolo rápido y una envolvente suave. */
function addCicada(data, at, duration, frequency, gain, pulseRate) {
  const start = Math.floor(at * SAMPLE_RATE);
  const length = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  const phase = rand(0, TAU);
  for (let j = 0; j < length && start + j < data.length; j++) {
    const t = j / SAMPLE_RATE;
    const u = j / length;
    const env = Math.sin(Math.PI * u) ** 0.8;
    const am = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(TAU * pulseRate * t + phase)) ** 2;
    const shimmer = Math.sin(TAU * frequency * t + Math.sin(TAU * 6.5 * t) * 0.8);
    data[start + j] += shimmer * env * am * gain;
  }
}

/** Escena interna (0, 1 o 2) para variar el patrón de cada ambiente. */
function sceneOf(p) {
  return Math.max(0, Math.min(2, Math.round(p.scene ?? 0)));
}

/** Instante aleatorio, incluyendo la cola de crossfade para cerrar el bucle. */
function eventTime(min = 0, max = DURATION + 1) {
  return rand(min, max);
}

/** Gota de agua: ping con caída rápida y un cuerpo grave muy suave. */
function addDrop(data, at, frequency, gain, options = {}) {
  const duration = options.duration ?? rand(0.035, 0.09);
  addChirp(data, at, duration, frequency, frequency * rand(1.05, 1.25), gain, {
    decay: options.decay ?? 5.2,
    harmonic: 0.12,
    warble: frequency * 0.015,
    warbleRate: rand(30, 60),
  });
  addChirp(data, at, duration * 2.8, frequency * 0.32, frequency * 0.3, gain * (options.body ?? 0.18), {
    decay: 6.5,
    harmonic: 0.05,
  });
}

/** Chasquido de fuego en un instante concreto. */
function addCrackleAt(data, at, gain) {
  const start = Math.floor(at * SAMPLE_RATE);
  const length = Math.floor(rand(0.003, 0.035) * SAMPLE_RATE);
  let previous = 0;
  for (let j = 0; j < length && start + j < data.length; j++) {
    const n = Math.random() * 2 - 1;
    const filtered = n - previous * 0.82;
    previous = n;
    const env = Math.exp(-j / (length * 0.28));
    data[start + j] += filtered * env * gain;
  }
}

/** Burbuja: tono que sube de frecuencia y se apaga rápido. */
function addBubble(data, at, frequency, gain, options = {}) {
  addChirp(data, at, options.duration ?? rand(0.04, 0.16), frequency, frequency * rand(1.4, 2.2), gain, {
    decay: options.decay ?? 4,
    harmonic: 0.16,
    warble: frequency * 0.01,
    warbleRate: rand(15, 40),
  });
}

/** Silbido de viento. */
function addWhistle(data, at, duration, frequency, gain) {
  addChirp(data, at, duration, frequency, frequency * rand(0.92, 1.08), gain, {
    decay: 1.2,
    harmonic: 0.03,
    warble: frequency * 0.02,
    warbleRate: rand(4, 9),
  });
}

/** Crujido de rama o madera. */
function addCreak(data, at, duration, frequency, gain) {
  addChirp(data, at, duration, frequency, frequency * rand(0.8, 1.1), gain, {
    decay: 2.2,
    harmonic: 0.18,
    warble: frequency * 0.08,
    warbleRate: rand(2, 5),
  });
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

function finalize(raw, peak = 0.46, options = {}) {
  const out = new Float32Array(N);
  out.set(raw.subarray(0, N));
  for (let i = 0; i < CROSS; i++) {
    const w = i / CROSS;
    out[i] = raw[i] * w + raw[N + i] * (1 - w);
  }
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (options.drive) {
    const normal = max > 0 ? 1 / max : 1;
    max = 0;
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.tanh(out[i] * normal * options.drive);
      max = Math.max(max, Math.abs(out[i]));
    }
  }
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
  const scene = sceneOf(p);

  /* Fondo mínimo: la lluvia son las gotas, no un muro de siseo. */
  const patter = make();
  noise(patter, 1);
  highpass(patter, 420);
  lowpass(patter, map(p.brightness, 1700, 5200));
  add(raw, patter, 0.004 + p.hiss * 0.016);

  const body = make();
  noise(body, 1);
  lowpass(body, 260 + p.drops * 320);
  add(raw, body, 0.002 + p.drops * 0.007);

  if (scene === 0) {
    /* Gotas cercanas sobre el cristal, con espacio entre ellas. */
    const count = Math.round(14 + p.intensity * 22);
    for (let i = 0; i < count; i++) {
      const at = eventTime();
      const freq = rand(850, 1900);
      addDrop(raw, at, freq, rand(0.06, 0.13) * (0.7 + p.intensity * 0.5), {
        duration: rand(0.05, 0.11),
        body: 0.22,
      });
      if (Math.random() < 0.24) {
        addDrop(raw, at + rand(0.08, 0.22), freq * rand(0.85, 1.15), rand(0.025, 0.055), {
          duration: rand(0.04, 0.08),
          body: 0.16,
        });
      }
    }
  } else if (scene === 1) {
    /* Lluvia constante: muchas gotas medianas, sin llegar a aguacero. */
    const count = Math.round(48 + p.intensity * 42);
    for (let i = 0; i < count; i++) {
      addDrop(raw, eventTime(), rand(1200, 2700), rand(0.035, 0.09), {
        duration: rand(0.035, 0.08),
        body: 0.15,
      });
    }
  } else {
    /* Aguacero: gotas rápidas, brillantes y alguna ráfaga de agua. */
    const count = Math.round(88 + p.intensity * 72);
    for (let i = 0; i < count; i++) {
      addDrop(raw, eventTime(), rand(1500, 3300), rand(0.028, 0.07), {
        duration: rand(0.03, 0.07),
        body: 0.1,
      });
    }
    const gust = make();
    noise(gust, 1);
    bandpass(gust, 900, 0.6);
    for (let i = 0; i < gust.length; i++) {
      const t = i / SAMPLE_RATE;
      const swell = (0.5 + 0.5 * Math.sin((TAU * t) / 4 + 0.8)) ** 2;
      gust[i] *= 0.1 + swell * 0.9;
    }
    add(raw, gust, 0.006 + p.wind * 0.012);
  }

  breathe(raw, 1 / 8, 0.035 + p.wind * 0.05, 1.3);
  return finalize(raw, 0.5);
}

function tormenta(p) {
  const raw = make();
  const scene = sceneOf(p);

  /* La lluvia y el viento quedan por debajo; el protagonista es el trueno. */
  const rain = make();
  noise(rain, 1);
  highpass(rain, 350);
  lowpass(rain, map(p.brightness, 1700, 5200));
  for (let i = 0; i < rain.length; i++) {
    const t = i / SAMPLE_RATE;
    const gust = (0.5 + 0.5 * Math.sin((TAU * t) / 8 + 0.4)) ** 2;
    rain[i] *= 0.25 + gust * 0.75;
  }
  add(raw, rain, 0.01 + p.rain * 0.028);

  const wind = make();
  noise(wind, 1);
  lowpass(wind, 320);
  for (let i = 0; i < wind.length; i++) {
    const t = i / SAMPLE_RATE;
    const gust = (0.5 + 0.5 * Math.sin((TAU * t) / 5.333 + 2.1)) ** 2;
    wind[i] *= 0.2 + gust * 0.8;
  }
  add(raw, wind, 0.004 + p.wind * 0.012);

  const deep = make();
  brown(deep, 1);
  lowpass(deep, 75 + p.rumble * 70);
  add(raw, deep, 0.002 + p.rumble * 0.006);

  const thunderGain = (0.38 + p.thunder * 0.46) * (0.8 + p.rumble * 0.4);
  if (scene === 0) {
    /* Tormenta lejana: un trueno largo y lluvia tranquila. */
    addThunder(raw, rand(2.2, 3.6), thunderGain);
  } else if (scene === 1) {
    /* Tormenta cercana: varios truenos y un chasquido inicial. */
    const times = [1.4, 6.2, 10.8].map((at) => at + rand(-0.3, 0.3));
    times.forEach((at, index) => {
      addThunder(raw, at, thunderGain * (index === 1 ? 1 : 0.82));
      addNoiseBurst(raw, at, 0.09, 0.05 + p.thunder * 0.05);
    });
  } else {
    /* Tormenta que pasa: ráfagas de lluvia y dos descargas. */
    addThunder(raw, rand(2.8, 3.8), thunderGain);
    addThunder(raw, rand(9.8, 10.8), thunderGain * 0.8);
    const gust = make();
    noise(gust, 1);
    bandpass(gust, 700, 0.6);
    for (let i = 0; i < gust.length; i++) {
      const t = i / SAMPLE_RATE;
      gust[i] *= (0.5 + 0.5 * Math.sin((TAU * t) / 5.333 + 1.5)) ** 3;
    }
    add(raw, gust, 0.008 + p.wind * 0.014);
  }

  flicker(raw, 0.04 + p.wind * 0.07, [0.7, 1.2, 2.1]);
  return finalize(raw, 0.46);
}

function fuego(p) {
  const raw = make();
  const scene = sceneOf(p);

  /* Brasa cálida muy baja; los chasquidos llevan la escena. */
  const low = make();
  brown(low, 1.1);
  lowpass(low, map(p.rumble, 100, 360));
  add(raw, low, 0.04 + p.rumble * 0.04);

  const hiss = make();
  noise(hiss, 1);
  bandpass(hiss, map(p.brightness, 900, 2800), 0.7);
  add(raw, hiss, 0.008 + p.crackle * 0.012);

  const clusters = scene === 0 ? 3 : scene === 1 ? 7 : 5;
  for (let c = 0; c < clusters; c++) {
    const at = eventTime();
    const count = Math.round((6 + rand(0, scene === 1 ? 14 : 10)) * (0.7 + p.intensity * 0.6));
    const spread = rand(0.18, scene === 1 ? 0.9 : 0.55);
    for (let i = 0; i < count; i++) {
      addCrackleAt(raw, at + rand(0, spread), rand(0.16, 0.34) * (0.7 + p.crackle * 0.5));
    }
  }

  const pops = Math.round((scene === 0 ? 5 : scene === 1 ? 16 : 10) * (0.7 + p.intensity * 0.6));
  for (let i = 0; i < pops; i++) {
    const at = eventTime();
    const f = rand(55, 180);
    addChirp(raw, at, rand(0.06, 0.18), f, f * rand(1.2, 1.8), rand(0.025, 0.07), {
      decay: 3,
      harmonic: 0.05,
    });
  }

  if (scene === 2) {
    /* Ráfaga que aviva la llama. */
    for (const at of [rand(4, 6), rand(11, 13)]) {
      const flare = make();
      noise(flare, 1);
      lowpass(flare, 700);
      for (let i = 0; i < flare.length; i++) {
        const t = i / SAMPLE_RATE;
        const u = Math.max(0, t - at);
        flare[i] *= Math.exp(-u / 0.8) * (u > 0 ? 1 : 0);
      }
      add(raw, flare, 0.015 + p.flicker * 0.02);
    }
  }

  flicker(raw, 0.1 + p.flicker * 0.16, [1.7, 3.3, 5.1, 7.9]);
  return finalize(raw, 0.48, { drive: scene === 1 ? 3.4 : 4.2 });
}

function mar(p) {
  const raw = make();
  const scene = sceneOf(p);
  const periods = [8, 16 / 3, 4];
  let periodIndex = scene;
  if (p.speed > 0.66) periodIndex = Math.min(2, periodIndex + 1);
  else if (p.speed < 0.33) periodIndex = Math.max(0, periodIndex - 1);
  const period = periods[periodIndex];
  const wave = (u) => (u < 0.18 ? (u / 0.18) ** 2 : (1 - (u - 0.18) / 0.82) ** 2);

  /* Oleaje: la ola es el evento; entre olas, casi silencio de aire. */
  const surf = make();
  noise(surf, 1);
  highpass(surf, 90);
  lowpass(surf, map(p.brightness, 1200, 3800));
  for (let i = 0; i < surf.length; i++) {
    const u = ((i / SAMPLE_RATE) / period) % 1;
    const swell = wave(u);
    surf[i] *= 0.012 + swell * (0.1 + p.depth * 0.34);
  }
  add(raw, surf, 0.85);

  const deep = make();
  brown(deep, 1);
  lowpass(deep, 140);
  for (let i = 0; i < deep.length; i++) {
    const u = ((i / SAMPLE_RATE) / period) % 1;
    deep[i] *= 0.004 + wave(u) * (0.08 + p.depth * 0.1);
  }
  add(raw, deep, 0.7);

  const foam = make();
  noise(foam, 1);
  highpass(foam, 2600);
  for (let i = 0; i < foam.length; i++) {
    const u = ((i / SAMPLE_RATE) / period) % 1;
    foam[i] *= wave(u) ** 2;
  }
  add(raw, foam, p.foam * (scene === 2 ? 0.28 : 0.2));

  const air = make();
  noise(air, 1);
  bandpass(air, 750, 0.5);
  for (let i = 0; i < air.length; i++) {
    const u = ((i / SAMPLE_RATE) / period) % 1;
    air[i] *= 0.15 + wave(u) * 0.85;
  }
  add(raw, air, 0.001 + p.wind * 0.003);

  if (scene === 2) {
    /* Una segunda serie de olas, más corta, para un mar agitado. */
    const second = make();
    noise(second, 1);
    highpass(second, 140);
    lowpass(second, 2600);
    for (let i = 0; i < second.length; i++) {
      const u = ((i / SAMPLE_RATE) / (period * 0.5) + 0.45) % 1;
      second[i] *= wave(u) ** 1.4;
    }
    add(raw, second, 0.35 + p.depth * 0.2);
  }

  return finalize(raw, 0.5);
}

function rio(p) {
  const raw = make();
  const scene = sceneOf(p);

  /* Arroyo claro, río rápido o cauce ancho: la corriente cambia de escena. */
  const flowCut = scene === 0
    ? map(p.brightness, 2300, 4700)
    : scene === 1
      ? map(p.brightness, 2800, 5600)
      : map(p.brightness, 1200, 3000);
  const eddyPeriod = scene === 0 ? 8 : scene === 1 ? 4 : 16;
  const eddyDepth = scene === 0 ? 0.35 : scene === 1 ? 0.6 : 0.25;

  const flow = make();
  noise(flow, 1);
  highpass(flow, scene === 2 ? 180 : 320);
  lowpass(flow, flowCut);
  for (let i = 0; i < flow.length; i++) {
    const t = i / SAMPLE_RATE;
    const eddy = (0.5 + 0.5 * Math.sin((TAU * t) / eddyPeriod + 0.9)) ** 2;
    flow[i] *= 1 - eddyDepth + eddy * eddyDepth;
  }
  add(raw, flow, (scene === 0 ? 0.032 : scene === 1 ? 0.045 : 0.038) + p.flow * 0.055);

  const body = make();
  noise(body, 1);
  bandpass(body, scene === 2 ? map(p.width, 220, 520) : map(p.width, 500, 1100), 0.8);
  add(raw, body, (scene === 2 ? 0.028 : 0.012) + p.width * (scene === 2 ? 0.04 : 0.028));

  const air = make();
  noise(air, 1);
  highpass(air, 3900);
  add(raw, air, 0.001 + p.air * (scene === 1 ? 0.005 : 0.002));

  if (scene === 2) {
    const deep = make();
    noise(deep, 1);
    lowpass(deep, 220);
    add(raw, deep, 0.018 + p.flow * 0.018);
  }

  const clusters = (scene === 0 ? 4 : scene === 1 ? 8 : 5) + Math.round(p.bubbles * 5);
  const bubbleGain = (scene === 1 ? [0.028, 0.07] : [0.04, 0.095]).map(
    (value) => value * (0.6 + p.bubbles * 0.7),
  );
  for (let c = 0; c < clusters; c++) {
    const at = eventTime();
    const count = 2 + Math.round(rand(0, scene === 1 ? 5 : 3));
    const spread = rand(0.15, 0.55);
    for (let i = 0; i < count; i++) {
      const f = scene === 2 ? rand(200, 650) : scene === 1 ? rand(400, 1600) : rand(300, 1000);
      addBubble(raw, at + rand(0, spread), f, rand(bubbleGain[0], bubbleGain[1]), {
        duration: rand(0.05, 0.14),
        decay: 3.8,
      });
    }
  }

  const stones = scene === 2 ? 5 : 2;
  for (let i = 0; i < stones; i++) {
    const f = rand(90, 190);
    addChirp(raw, eventTime(), rand(0.08, 0.2), f, f * rand(0.85, 1.1), rand(0.02, 0.045), {
      decay: 4,
      harmonic: 0.08,
    });
  }

  breathe(raw, scene === 1 ? 1 / 8 : 1 / 16, scene === 1 ? 0.1 : 0.05, 2);
  return finalize(raw, 0.52);
}

function viento(p) {
  const raw = make();
  const scene = sceneOf(p);
  const period = p.speed < 0.4 ? 8 : p.speed < 0.7 ? 16 / 3 : 4;
  const lowGain = (scene === 2 ? 0.32 : scene === 1 ? 0.65 : 0.45) * (0.75 + p.gust * 0.35);
  const midGain = (scene === 2 ? 0.2 : scene === 1 ? 0.4 : 0.34) * (0.75 + p.gust * 0.35);
  const highGain = (scene === 0 ? 0.04 : scene === 1 ? 0.09 : 0.075) * (0.5 + p.air * 0.9);

  const low = make();
  noise(low, 1);
  lowpass(low, map(p.brightness, 320, 780));
  for (let i = 0; i < low.length; i++) {
    const t = i / SAMPLE_RATE;
    const a = (0.5 + 0.5 * Math.sin((TAU * t) / period + 0.6)) ** 2;
    const b = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((TAU * t) / 5.333 + 2.2));
    low[i] *= 0.12 + 0.88 * a * b;
  }
  add(raw, low, lowGain);

  const mid = make();
  noise(mid, 1);
  bandpass(mid, map(p.brightness, 600, 1500), 0.7);
  for (let i = 0; i < mid.length; i++) {
    const t = i / SAMPLE_RATE;
    const gust = (0.5 + 0.5 * Math.sin((TAU * t) / period + 0.6)) ** 2;
    mid[i] *= 0.08 + gust ** 1.3 * 0.92;
  }
  add(raw, mid, midGain);

  const high = make();
  noise(high, 1);
  highpass(high, 2500);
  for (let i = 0; i < high.length; i++) {
    const t = i / SAMPLE_RATE;
    const gust = (0.5 + 0.5 * Math.sin((TAU * t) / period + 0.6)) ** 2;
    high[i] *= gust ** 1.8;
  }
  add(raw, high, highGain);

  const whistles = scene === 0 ? 4 : scene === 1 ? 9 : 12;
  for (let i = 0; i < whistles; i++) {
    addWhistle(raw, eventTime(), rand(0.7, 2.4), rand(480, 1400), rand(0.012, 0.032) * (0.6 + p.gust * 0.8));
  }

  const rustles = scene === 0 ? 3 : scene === 1 ? 10 : 6;
  for (let i = 0; i < rustles; i++) {
    addNoiseBurst(raw, eventTime(), rand(0.15, 0.5), rand(0.006, 0.018));
  }

  return finalize(raw, 0.49);
}

function espacio(p) {
  const raw = make();
  const scene = sceneOf(p);
  const partials = scene === 0
    ? [55, 82.5, 110, 165, 220]
    : scene === 1
      ? [55, 110, 164, 220, 330]
      : [41, 55, 82.5, 110, 164];

  /* Vastedad: el drone grave sostiene la escena; el polvo estelar es mínimo. */
  partials.forEach((freq, index) => {
    const amp = (0.045 - index * 0.006) * (0.4 + p.drone);
    sine(raw, freq, amp, index * 1.3);
    sine(raw, freq + 0.0625, amp * 0.55, index * 0.7);
  });
  if (scene === 2) sine(raw, 27.5, 0.018 * (0.4 + p.drone));

  breathe(raw, scene === 0 ? 1 / 16 : scene === 1 ? 1 / 4 : 1 / 8, scene === 0 ? 0.16 : scene === 1 ? 0.09 : 0.3, 0.8);

  const shimmer = make();
  noise(shimmer, 1);
  highpass(shimmer, map(p.brightness, 2600, 5200));
  flicker(shimmer, 0.45 + p.shimmer * 0.35, [0.0625, 0.125, 0.1875]);
  add(raw, shimmer, 0.001 + p.shimmer * (scene === 1 ? 0.008 : 0.003));

  const chimes = scene === 0 ? 4 : scene === 1 ? 14 : 7;
  for (let i = 0; i < chimes; i++) {
    const f = scene === 0
      ? rand(180, 650)
      : scene === 1
        ? rand(300, 1400)
        : rand(140, 520);
    addChirp(raw, eventTime(0.2, DURATION + 0.5), rand(2.2, 4.6), f, f * rand(0.97, 1.03), rand(0.02, 0.04) * (0.7 + p.movement * 0.6) * (scene === 1 ? 1.2 : 1), {
      decay: 3.2,
      harmonic: 0.14,
    });
  }

  if (scene === 1) {
    for (let i = 0; i < 4; i++) {
      const f = rand(900, 1800);
      addChirp(raw, eventTime(), rand(1.2, 2.4), f, f * rand(1.01, 1.04), rand(0.006, 0.014), {
        decay: 4,
        harmonic: 0.08,
      });
    }
  } else if (scene === 2) {
    /* Púlsar: ecos cortos y graves que atraviesan el drone. */
    for (let i = 0; i < 4; i++) {
      const f = rand(180, 420);
      addChirp(raw, eventTime(), rand(0.08, 0.2), f, f * rand(0.7, 0.9), rand(0.012, 0.025), {
        decay: 3,
        harmonic: 0.2,
      });
    }
  }

  return finalize(raw, 0.33);
}

function cuento(p) {
  const raw = make();
  const scene = sceneOf(p);
  const padNotes = scene === 0
    ? [220, 261.625, 329.625, 440]
    : scene === 1
      ? [261.625, 329.625, 392, 523.25]
      : [110, 164, 220, 330];

  padNotes.forEach((freq, index) => {
    sine(raw, freq, 0.01 * (0.35 + p.pads), index * 1.3);
    sine(raw, freq + 0.0625, 0.006 * (0.35 + p.pads), index * 0.7);
  });
  breathe(raw, 1 / 16, 0.1 + p.pads * 0.08, 1.1);

  const air = make();
  noise(air, 1);
  bandpass(air, 1800, 0.7);
  add(raw, air, 0.0007 + p.sparkle * 0.0012);

  const scale = scene === 0
    ? [440, 493.875, 523.25, 587.328, 659.25, 783.99, 880]
    : scene === 1
      ? [523.25, 587.328, 659.25, 783.99, 880, 987.77, 1046.5]
      : [220, 261.625, 293.66, 329.63, 392];
  const interval = scene === 0
    ? map(p.tempo, 4.2, 2.6)
    : scene === 1
      ? map(p.tempo, 2, 0.95)
      : map(p.tempo, 3.4, 2);
  let at = rand(0.25, 0.8);
  let index = 0;
  while (at < DURATION + 0.8) {
    const freq = scale[index % scale.length] * (Math.random() < 0.1 ? 0.5 : 1);
    addChirp(raw, at, rand(1.8, 3.2), freq, freq, (0.035 + p.notes * 0.045) * rand(0.75, 1), {
      decay: 3.2,
      harmonic: 0.32,
    });
    if (Math.random() < 0.4) {
      addChirp(raw, at + rand(0.12, 0.4), 1.4, freq * 2, freq * 2, 0.008 + p.notes * 0.012, {
        decay: 4,
        harmonic: 0.1,
      });
    }
    at += interval * rand(0.75, 1.25);
    index += Math.random() < 0.3 ? 2 : 1;
  }

  lowpass(raw, map(p.brightness, 2800, 6800));
  return finalize(raw, 0.35);
}

function meditacion(p) {
  const raw = make();
  const scene = sceneOf(p);
  const notes = scene === 0
    ? [55, 82.5, 110, 165]
    : scene === 1
      ? [41, 55, 82.5, 110]
      : [55, 110, 165, 220];

  notes.forEach((freq, index) => {
    const amp = 0.024 * (0.35 + p.drone) * (1 - index * 0.12);
    sine(raw, freq, amp, index * 1.5);
    sine(raw, freq + 0.0625, amp * 0.55, index * 0.9);
  });

  breathe(raw, scene === 1 ? 1 / 8 : 1 / 16, (scene === 0 ? 0.16 : scene === 1 ? 0.42 : 0.12) + p.breath * 0.14, 0);

  const air = make();
  noise(air, 1);
  bandpass(air, 2400, 0.5);
  add(raw, air, 0.0005 + p.brightness * 0.0015);

  const bowls = scene === 0
    ? 3 + Math.round(p.bowls * 5)
    : scene === 1
      ? 1 + Math.round(p.bowls * 3)
      : 5 + Math.round(p.bowls * 6);
  const bowlNotes = [220, 330, 440, 660];
  for (let i = 0; i < bowls; i++) {
    const f = bowlNotes[Math.floor(rand(0, bowlNotes.length))];
    const gain = rand(0.032, 0.06) * (0.7 + p.bowls * 0.6);
    const duration = rand(3.6, 6);
    const at = eventTime(0.2, DURATION + 0.4);
    addChirp(raw, at, duration, f, f * 0.995, gain, { decay: 3.6, harmonic: 0.18 });
    addChirp(raw, at, duration, f + 0.6, f + 0.6, gain * 0.5, { decay: 3.6, harmonic: 0.12 });
  }

  return finalize(raw, 0.34);
}

function pajaros(p) {
  const raw = make();
  const scene = sceneOf(p);

  /* Pájaros al frente; hojas y aire apenas un soporte. */
  const leaves = make();
  noise(leaves, 1);
  highpass(leaves, 600);
  lowpass(leaves, map(p.brightness, 2200, 4200));
  flicker(leaves, 0.25, [0.0625, 0.1875, 0.3125]);
  add(raw, leaves, 0.002 + p.leaves * 0.007);

  const wind = make();
  brown(wind, 1);
  lowpass(wind, 140);
  add(raw, wind, 0.001 + p.wind * 0.004);

  const phrases = scene === 0
    ? 4 + Math.round(p.birds * 8)
    : scene === 1
      ? 10 + Math.round(p.birds * 16)
      : 3 + Math.round(p.birds * 6);
  for (let i = 0; i < phrases; i++) {
    const base = map(p.variety, 1600, map(p.brightness, 3000, 4800)) * rand(0.75, 1.25);
    addBirdPhrase(raw, eventTime(0.1, DURATION + 0.8), base, 0.04 + p.birds * 0.035);
  }

  const cuckoo = scene === 2 || (scene === 0 && Math.random() < 0.6);
  if (cuckoo) {
    const at = rand(1, DURATION - 2);
    addChirp(raw, at, 0.26, 700, 680, 0.03, { decay: 1.2, harmonic: 0.1 });
    addChirp(raw, at + 0.36, 0.32, 580, 560, 0.027, { decay: 1.2, harmonic: 0.1 });
  }

  breathe(raw, 1 / 16, 0.05, 1);
  return finalize(raw, 0.52);
}

function bichos(p) {
  const raw = make();
  const scene = Math.max(0, Math.min(2, Math.round(p.scene ?? 0)));
  const tone = 1 + (p.brightness - 0.5) * 0.18;

  /* Suelo ambiental mínimo: un aire muy tenue, sin ruido grave. */
  const air = make();
  noise(air, 1);
  highpass(air, 500);
  lowpass(air, 2200 + p.brightness * 1800);
  add(raw, air, 0.003 + p.air * 0.01);

  if (scene === 0) {
    /* Escena A: grillos lejanos y espaciados, con alguna cigarra al fondo. */
    const gain = (0.16 + p.crickets * 0.12) * tone;
    const starts = [0.45, 1.75, 3.15, 4.7, 6.4, 8.1, 9.9, 11.5, 13.2, 14.8];
    starts.forEach((start, index) => {
      const at = start + rand(-0.18, 0.18);
      addCricketCall(raw, at, {
        frequency: rand(3450, 4050) * tone,
        pulses: 3 + Math.round(rand(0, 3)),
        rate: rand(21, 27),
        gain: gain * rand(0.72, 1.05),
        spread: 0.015,
      });
      if (index % 3 === 1) {
        addCricketCall(raw, at + rand(0.35, 0.8), {
          frequency: rand(3900, 4450) * tone,
          pulses: 2 + Math.round(rand(0, 2)),
          rate: rand(24, 30),
          gain: gain * rand(0.35, 0.6),
          spread: 0.02,
        });
      }
    });
    for (const at of [1.2, 5.6, 9.4, 13.4]) {
      addCicada(raw, at, rand(2.2, 3.6), rand(5200, 6100) * tone, 0.014 + p.cicadas * 0.016, rand(38, 54));
    }
  } else if (scene === 1) {
    /* Escena B: trinos rápidos y densos, en pequeños grupos. */
    const gain = (0.15 + p.crickets * 0.11) * tone;
    let at = 0.08;
    while (at < DURATION - 0.9) {
      const calls = 2 + Math.round(rand(0, 3));
      let time = at;
      for (let i = 0; i < calls; i++) {
        addCricketCall(raw, time, {
          frequency: rand(4300, 5250) * tone,
          pulses: 5 + Math.round(rand(0, 5)),
          rate: rand(28, 37),
          gain: gain * rand(0.68, 1),
          spread: 0.018,
        });
        time += 0.16 + rand(0, 0.26);
      }
      at += rand(0.85, 1.55);
    }
    for (const start of [0.3, 3.4, 6.8, 10.4, 14.1]) {
      addCicada(raw, start, rand(1.7, 3.1), rand(5600, 6800) * tone, 0.014 + p.cicadas * 0.016, rand(52, 74));
    }
  } else {
    /* Escena C: dúo que alterna grillos graves y agudos. */
    const low = (0.15 + p.crickets * 0.1) * tone;
    const high = (0.13 + p.crickets * 0.11) * tone;
    let at = 0.35;
    let flip = false;
    while (at < DURATION - 1.4) {
      if (flip) {
        addCricketCall(raw, at, {
          frequency: rand(2550, 3150) * tone,
          pulses: 3 + Math.round(rand(0, 3)),
          rate: rand(17, 22),
          gain: low,
          spread: 0.025,
        });
        addCricketCall(raw, at + rand(0.72, 1.02), {
          frequency: rand(4650, 5350) * tone,
          pulses: 4 + Math.round(rand(0, 4)),
          rate: rand(29, 35),
          gain: high * rand(0.7, 0.9),
          spread: 0.02,
        });
      } else {
        addCricketCall(raw, at, {
          frequency: rand(4700, 5400) * tone,
          pulses: 5 + Math.round(rand(0, 3)),
          rate: rand(30, 36),
          gain: high,
          spread: 0.02,
        });
        addCricketCall(raw, at + rand(0.68, 0.95), {
          frequency: rand(2600, 3200) * tone,
          pulses: 2 + Math.round(rand(0, 3)),
          rate: rand(18, 23),
          gain: low * rand(0.7, 0.95),
          spread: 0.025,
        });
      }
      at += rand(1.9, 2.7);
      flip = !flip;
    }
    for (const start of [0.9, 6.5, 11.9]) {
      addCicada(raw, start, rand(1.1, 2.3), rand(6100, 7100) * tone, 0.012 + p.cicadas * 0.014, rand(58, 78));
    }
  }

  breathe(raw, 1 / 11, 0.08, 0.4);
  return finalize(raw, 0.48);
}

function bosque(p) {
  const raw = make();
  const scene = sceneOf(p);

  /* Hojas y ramas al frente; el viento de fondo queda casi apagado. */
  const leaves = make();
  noise(leaves, 1);
  highpass(leaves, 1200);
  lowpass(leaves, map(p.brightness, 3200, 5800));
  for (let i = 0; i < leaves.length; i++) {
    const t = i / SAMPLE_RATE;
    const gust = (0.5 + 0.5 * Math.sin((TAU * t) / 8 + 0.5)) ** 2;
    leaves[i] *= 0.12 + gust * 0.88;
  }
  add(raw, leaves, 0.005 + p.leaves * 0.013);

  const wind = make();
  noise(wind, 1);
  lowpass(wind, 240);
  for (let i = 0; i < wind.length; i++) {
    const t = i / SAMPLE_RATE;
    const gust = (0.5 + 0.5 * Math.sin((TAU * t) / 8 + 0.5)) ** 2;
    wind[i] *= 0.2 + gust * 0.8;
  }
  add(raw, wind, 0.002 + p.wind * 0.007);

  const rustles = (scene === 0 ? 3 : scene === 1 ? 9 : 5) + Math.round(p.rustle * 5);
  for (let i = 0; i < rustles; i++) {
    addNoiseBurst(raw, eventTime(), rand(0.2, 0.6), rand(0.008, 0.026) * (0.6 + p.rustle * 0.8));
  }

  const creaks = scene === 0 ? 2 : scene === 1 ? 6 : 3;
  for (let i = 0; i < creaks; i++) {
    addCreak(raw, eventTime(), rand(0.3, 0.8), rand(90, 220), rand(0.02, 0.045));
  }

  const birds = (scene === 0 ? 2 : scene === 1 ? 3 : 6) + Math.round(p.birds * 4);
  for (let i = 0; i < birds; i++) {
    addBirdPhrase(raw, eventTime(0.2, DURATION + 0.6), rand(1700, 3300), rand(0.012, 0.03));
  }

  breathe(raw, 1 / 16, 0.06, 0.5);
  return finalize(raw, 0.55);
}

function noche(p) {
  const raw = make();
  const scene = sceneOf(p);

  /* Aire mínimo y grillos claros; el búho aparece de vez en cuando. */
  const air = make();
  noise(air, 1);
  lowpass(air, 520);
  highpass(air, 80);
  breathe(air, 1 / 16, 0.18, 0.7);
  add(raw, air, 0.0015 + p.wind * 0.0035);

  sine(raw, 55, 0.004 * (0.3 + p.drone));
  sine(raw, 82.5, 0.0025 * (0.3 + p.drone));

  const calls = scene === 0 ? 7 : scene === 1 ? 18 : 4;
  for (let i = 0; i < calls; i++) {
    addCricketCall(raw, eventTime(0.2, DURATION + 0.8), {
      frequency: rand(3000, map(p.brightness, 3600, 4900)),
      pulses: 3 + Math.round(rand(0, 3)),
      rate: rand(18, 28),
      gain: rand(0.05, 0.11) * (0.7 + p.crickets * 0.5),
      spread: 0.015,
    });
  }

  if (scene !== 2) {
    for (let i = 0; i < Math.round(calls * 0.5); i++) {
      addCricketCall(raw, eventTime(), {
        frequency: rand(2700, 3500),
        pulses: 2 + Math.round(rand(0, 2)),
        rate: rand(15, 22),
        gain: rand(0.02, 0.045) * (0.7 + p.crickets * 0.5),
        spread: 0.02,
      });
    }
  }

  const owls = scene === 2 ? 2 : scene === 1 ? 1 : 1 + Math.round(rand(0, 1));
  for (let i = 0; i < owls; i++) {
    addOwl(raw, rand(1.2, DURATION - 3), 0.028 + p.owl * 0.03);
  }

  breathe(raw, 1 / 16, 0.08, 1.5);
  return finalize(raw, 0.46);
}

function burbujas(p) {
  const raw = make();
  const scene = sceneOf(p);

  /* El agua es solo el soporte; las burbujas son las protagonistas. */
  const water = make();
  noise(water, 1);
  lowpass(water, 850);
  highpass(water, 100);
  breathe(water, 1 / 8, 0.22, 0.3);
  add(raw, water, 0.006 + p.water * 0.016);

  const low = make();
  brown(low, 1);
  lowpass(low, 170);
  add(raw, low, 0.002 + p.water * 0.006);

  const count = scene === 0
    ? 22 + Math.round(p.bubbles * 24)
    : scene === 1
      ? 50 + Math.round(p.bubbles * 50)
      : 10 + Math.round(p.bubbles * 15);
  const tone = map(p.brightness, 0.75, 1.35);
  const freqRange = (scene === 1 ? [500, 1600] : scene === 2 ? [120, 420] : [220, 700]).map(
    (value) => value * tone,
  );
  const gainRange = scene === 1 ? [0.025, 0.06] : scene === 2 ? [0.05, 0.12] : [0.055, 0.12];
  for (let i = 0; i < count; i++) {
    addBubble(raw, eventTime(), rand(freqRange[0], freqRange[1]), rand(gainRange[0], gainRange[1]), {
      duration: scene === 2 ? rand(0.1, 0.24) : rand(0.04, 0.14),
      decay: scene === 2 ? 3 : 4,
    });
  }

  const pops = scene === 0 ? 4 : scene === 1 ? 20 : 6;
  for (let i = 0; i < pops; i++) {
    const f = rand(900, 1900) * tone;
    addChirp(raw, eventTime(), rand(0.025, 0.07), f, f * rand(1.1, 1.8), rand(0.01, 0.03), {
      decay: 4,
      harmonic: 0.1,
    });
  }

  if (scene === 2) {
    for (let i = 0; i < 4; i++) {
      const f = rand(70, 140);
      addChirp(raw, eventTime(), rand(0.1, 0.24), f, f * rand(1.1, 1.4), rand(0.02, 0.04), {
        decay: 3,
        harmonic: 0.1,
      });
    }
  }

  const fizz = make();
  noise(fizz, 1);
  highpass(fizz, 2500);
  flicker(fizz, 0.35, [0.0625, 0.1875]);
  add(raw, fizz, 0.0005 + p.fizz * 0.002);

  breathe(raw, 1 / 8, 0.1, 2);
  return finalize(raw, 0.58);
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
