/**
 * Esquema `sen-lab/3`: familias, instrumentos, parámetros, valores por
 * defecto, rangos, validación y migración.
 *
 * Es la fuente de verdad del catálogo: el motor lee de aquí los valores por
 * defecto y la UI construye el inspector a partir de estas definiciones.
 */

import { NOTE_NAMES, SCALES, SCALE_LABELS, rootIndex, midiToNote, noteToMidi } from './music.js';

export const SCHEMA_ID = 'sen-lab/3';
export const ENGINE_VERSION = 'sen-synth/2';

export const LIMITS = {
  minDuration: 10,
  maxDuration: 1800,
  maxLoop: 600,
  tracks: 32,
  elements: 500,
  notesPerTone: 8,
  changesPerTone: 512,
  cloudPitches: 24,
  cloudEvents: 2048,
  sustainVoices: 96,
  strikePerTrack: 16,
  strikeTotal: 64,
  events: 200000,
  projectBytes: 1000000,
  reverbDecay: 12,
};

export const FAMILIES = [
  { id: 'sustain', label: 'Sostenidos', short: 'Sostenidos', types: ['tone'] },
  { id: 'strike', label: 'Puntuales', short: 'Puntuales', types: ['hit', 'phrase', 'cloud'] },
  { id: 'noise', label: 'Texturas', short: 'Texturas', types: ['span'] },
  { id: 'nature', label: 'Naturaleza', short: 'Naturaleza', types: ['span'] },
  { id: 'layer', label: 'Capas de sen', short: 'Capas', types: ['clip'] },
];

export const ELEMENT_TYPES = {
  tone: { label: 'Nota o acorde' },
  hit: { label: 'Golpe' },
  phrase: { label: 'Frase' },
  cloud: { label: 'Nube de notas' },
  span: { label: 'Tramo' },
  clip: { label: 'Capa de audio' },
};

/* ------------------------------------------------------------ parámetros */

const num = (label, min, max, def, extra = {}) => ({ type: 'number', label, min, max, def, ...extra });
const opt = (label, options, def) => ({ type: 'enum', label, options, def });
const rng = (label, min, max, def, extra = {}) => ({ type: 'range', label, min, max, def, ...extra });
const o = (pairs) => pairs.map(([value, label]) => ({ value, label }));

export const PARAMS = {
  // Sostenidas
  partials: num('Parciales', 1, 32, 12, { step: 1 }),
  rolloff: num('Caída de armónicos', 0.5, 3, 1.5, { step: 0.05 }),
  voices: num('Voces', 1, 7, 3, { step: 1 }),
  detune: num('Desafinación', 0, 30, 6, { step: 0.5, unit: 'cents' }),
  drift: num('Deriva', 0, 20, 3, { step: 0.5, unit: 'cents' }),
  filterType: opt('Filtro', o([['lp', 'Paso bajo'], ['hp', 'Paso alto'], ['bp', 'Banda']]), 'lp'),
  cutoff: num('Corte', 40, 18000, 2400, { log: true, unit: 'Hz' }),
  q: num('Resonancia (Q)', 0.5, 12, 0.7, { log: true }),
  vibratoDepth: num('Vibrato', 0, 50, 0, { step: 0.5, unit: 'cents' }),
  vibratoRate: num('Velocidad del vibrato', 0.05, 8, 4.5, { log: true, unit: 'Hz' }),
  tremoloDepth: num('Trémolo', 0, 1, 0, { step: 0.01 }),
  tremoloRate: num('Velocidad del trémolo', 0.05, 8, 0.2, { log: true, unit: 'Hz' }),
  sweepDepth: num('Barrido de filtro', 0, 4, 0, { step: 0.05, unit: 'oct' }),
  sweepRate: num('Velocidad del barrido', 0.01, 1, 0.05, { log: true, unit: 'Hz' }),
  width: num('Ancho estéreo', 0, 1, 0.6, { step: 0.01 }),
  sub: num('Subgrave', 0, 1, 0.3, { step: 0.01 }),
  beat: num('Batido', 0, 3, 0.3, { step: 0.01, unit: 'Hz' }),
  vowel: num('Vocal (a–o–u)', 0, 1, 0.3, { step: 0.01 }),
  inharmonic: num('Inarmonicidad', 0, 1, 0.4, { step: 0.01 }),
  breath: num('Soplo', 0, 1, 0.35, { step: 0.01 }),
  wave: opt('Forma de onda', o([['sierra', 'Sierra'], ['pulso', 'Pulso'], ['cuadrada', 'Cuadrada'], ['triangulo', 'Triángulo']]), 'sierra'),
  pulseWidth: num('Ancho de pulso', 0.05, 0.95, 0.5, { step: 0.01 }),
  filterEnv: num('Envolvente del filtro', 0, 4, 0, { step: 0.05, unit: 'oct' }),
  filterTime: num('Caída de la envolvente', 0.01, 4, 0.2, { log: true, unit: 's' }),
  glide: num('Portamento', 0, 2, 0.25, { step: 0.01, unit: 's' }),
  rotation: num('Giro de la maza', 0, 1, 0.35, { step: 0.01 }),
  rotationRate: num('Velocidad del giro', 0.05, 3, 0.6, { log: true, unit: 'Hz' }),
  // Puntuales
  decay: num('Decaimiento', 0.2, 30, 5, { log: true, unit: 's' }),
  brightness: num('Brillo', 0, 1, 0.5, { step: 0.01 }),
  hardness: num('Dureza del golpe', 0, 1, 0.4, { step: 0.01 }),
  velocityCurve: num('Curva de velocidad', 0, 1, 0.5, { step: 0.01 }),
  fmRatio: num('Relación FM', 0.25, 12, 2, { step: 0.01, log: true }),
  fmIndex: num('Profundidad FM', 0, 12, 3, { step: 0.01 }),
  fmTime: num('Caída FM', 0.02, 10, 1.2, { log: true, unit: 's' }),
  detune: num('Desafinación', 0, 30, 0, { step: 0.1, unit: 'cents' }),
  wow: num('Ondulación de cinta', 0, 40, 0, { step: 0.1, unit: 'cents' }),
  wowRate: num('Velocidad de la ondulación', 0.05, 2, 0.28, { log: true, unit: 'Hz' }),
  slide: num('Deslizamiento', 0, 12, 2, { step: 0.1, unit: 'semitonos' }),
  slideTime: num('Tiempo del deslizamiento', 0.01, 2, 0.2, { log: true, unit: 's' }),
  // Ruido
  color: opt('Color', o([['blanco', 'Blanco'], ['rosa', 'Rosa'], ['marron', 'Marrón']]), 'rosa'),
  movement: opt('Movimiento', o([['ninguno', 'Ninguno'], ['rafagas', 'Ráfagas'], ['oleaje', 'Oleaje']]), 'rafagas'),
  moveRate: num('Velocidad de las ráfagas', 0.01, 2, 0.12, { log: true, unit: 'Hz' }),
  moveDepth: num('Profundidad del movimiento', 0, 1, 0.5, { step: 0.01 }),
  moveTarget: opt('Mueve', o([['nivel', 'Nivel'], ['filtro', 'Filtro'], ['ambos', 'Nivel y filtro']]), 'ambos'),
  wavePeriod: num('Periodo del oleaje', 3, 20, 9, { step: 0.1, unit: 's' }),
  waveShape: num('Asimetría subida/bajada', 0.1, 0.9, 0.35, { step: 0.01 }),
  stereo: num('Decorrelación estéreo', 0, 1, 0.8, { step: 0.01 }),
  // Simulaciones · comunes
  distance: num('Distancia', 0, 1, 0.4, { step: 0.01 }),
  pan: num('Posición', -1, 1, 0, { step: 0.01 }),
  spread: num('Dispersión estéreo', 0, 1, 0.7, { step: 0.01 }),
  variation: num('Variación', 0, 1, 0.5, { step: 0.01 }),
  // Simulaciones · propios
  individuals: num('Individuos', 1, 24, 6, { step: 1 }),
  pitch: rng('Registro', 2000, 6000, [4200, 5000], { log: true, unit: 'Hz' }),
  callRate: num('Llamadas por segundo', 0.2, 6, 1.8, { log: true }),
  pulses: num('Pulsos por llamada', 1, 8, 3, { step: 1 }),
  sync: num('Sincronía', 0, 1, 0.2, { step: 0.01 }),
  bout: rng('Duración de las tandas', 2, 20, [5, 11], { unit: 's' }),
  rest: rng('Duración de las pausas', 1, 15, [2, 6], { unit: 's' }),
  species: opt('Especie', o([['generico', 'Genérico']]), 'generico'),
  songRate: num('Frases por minuto', 1, 30, 6, { step: 0.5 }),
  register: rng('Registro', 1000, 8000, [2200, 5200], { log: true, unit: 'Hz' }),
  syllables: num('Sílabas por frase', 2, 16, 6, { step: 1 }),
  shape: opt('Forma', o([['silbido', 'Silbido'], ['trino', 'Trino'], ['gorjeo', 'Gorjeo']]), 'gorjeo'),
  callsPerMin: num('Llamadas por minuto', 2, 60, 20, { step: 1 }),
  surface: opt('Superficie', o([['agua', 'Agua']]), 'agua'),
  rate: num('Gotas por segundo', 0.1, 200, 4, { log: true }),
  intensity: num('Intensidad (impactos/s)', 50, 3000, 600, { log: true }),
  flow: num('Caudal', 0, 1, 0.55, { step: 0.01 }),
  sources: num('Fuentes de burbujeo', 1, 24, 10, { step: 1 }),
  period: num('Periodo', 4, 20, 9, { step: 0.1, unit: 's' }),
  size: num('Tamaño', 0, 1, 0.6, { step: 0.01 }),
  foam: num('Espuma', 0, 1, 0.5, { step: 0.01 }),
  pebbles: num('Guijarros', 0, 1, 0, { step: 0.01 }),
  strength: num('Fuerza', 0, 1, 0.5, { step: 0.01 }),
  gustiness: num('Racheo', 0, 1, 0.5, { step: 0.01 }),
  howl: num('Aullido', 0, 1, 0.15, { step: 0.01 }),
  howlPitch: num('Afinación del aullido', 150, 1200, 420, { log: true, unit: 'Hz' }),
  leaves: num('Hojas', 0, 1, 0.3, { step: 0.01 }),
  crackle: num('Chasquidos por segundo', 0, 20, 4, { step: 0.1 }),
  pops: num('Estallidos por segundo', 0, 2, 0.15, { step: 0.01 }),
  hiss: num('Siseo', 0, 1, 0.3, { step: 0.01 }),
  material: opt('Material', o([['metal', 'Metal'], ['bambu', 'Bambú'], ['vidrio', 'Vidrio']]), 'metal'),
  tubes: num('Tubos', 3, 8, 5, { step: 1 }),
  wind: num('Actividad del viento', 0, 1, 0.4, { step: 0.01 }),
};

const SUSTAIN_COMMON = ['partials', 'rolloff', 'voices', 'detune', 'drift', 'filterType', 'cutoff', 'q',
  'vibratoDepth', 'vibratoRate', 'tremoloDepth', 'tremoloRate', 'sweepDepth', 'sweepRate', 'width'];
const ANALOG_COMMON = [...SUSTAIN_COMMON, 'wave', 'pulseWidth', 'filterEnv', 'filterTime', 'sub'];
const STRIKE_COMMON = ['decay', 'brightness', 'hardness', 'inharmonic', 'beat', 'velocityCurve', 'width'];
const FM_COMMON = ['decay', 'brightness', 'hardness', 'velocityCurve', 'width', 'fmRatio', 'fmIndex', 'fmTime'];
const VINTAGE_FM_COMMON = [...FM_COMMON, 'detune', 'wow', 'wowRate'];
const NATURE_COMMON = ['distance', 'pan', 'spread', 'variation'];
const NOISE_COMMON = ['color', 'filterType', 'cutoff', 'q', 'movement', 'moveRate', 'moveDepth', 'moveTarget', 'wavePeriod', 'waveShape', 'stereo'];

/* ------------------------------------------------------------ instrumentos */

export const INSTRUMENTS = {
  // Notas sostenidas
  pad: {
    family: 'sustain', label: 'Pad', color: '#9dded8',
    description: 'Aditiva: parciales armónicos con caída configurable y voces desafinadas.',
    params: SUSTAIN_COMMON,
    defaults: { partials: 12, rolloff: 1.6, voices: 3, detune: 7, cutoff: 2600, tremoloDepth: 0.08 },
  },
  drone: {
    family: 'sustain', label: 'Drone', color: '#a48bff',
    description: 'Pocas parciales graves, batidos lentos entre voces y subgrave.',
    params: [...SUSTAIN_COMMON, 'sub', ['beat', { max: 2, def: 0.3 }]],
    defaults: { partials: 6, rolloff: 1.8, voices: 3, detune: 3, drift: 4, cutoff: 1100, sweepDepth: 0.8, sweepRate: 0.03 },
  },
  cuerdas: {
    family: 'sustain', label: 'Cuerdas', color: '#ffd08a',
    description: 'Diente de sierra limitado en banda, paso bajo lento y vibrato suave.',
    params: SUSTAIN_COMMON,
    defaults: { partials: 24, rolloff: 1, voices: 4, detune: 9, cutoff: 1800, vibratoDepth: 6, vibratoRate: 4.8, sweepDepth: 0.4, sweepRate: 0.04 },
  },
  flauta: {
    family: 'sustain', label: 'Flauta suave', color: '#bfe3c8',
    description: 'Voz casi senoidal con soplo y vibrato, como una flauta de madera lejana. Para melodías: una nota por elemento.',
    params: ['vibratoDepth', 'vibratoRate', 'drift', 'breath', 'cutoff', 'tremoloDepth', 'tremoloRate', 'width'],
    defaults: { vibratoDepth: 7, vibratoRate: 5, drift: 2, cutoff: 3500, width: 0.2, breath: 0.2 },
    tone: { length: 2, fadeIn: 0.12, fadeOut: 0.45 },
  },
  coro: {
    family: 'sustain', label: 'Coro', color: '#e6b8d8',
    description: 'Fuente rica con tres formantes vocales interpolables (a–o–u).',
    params: [...SUSTAIN_COMMON, 'vowel'],
    defaults: { partials: 28, rolloff: 1, voices: 5, detune: 11, cutoff: 5000, vibratoDepth: 8, vibratoRate: 5 },
  },
  vidrio: {
    family: 'sustain', label: 'Vidrio', color: '#8fe9e3',
    description: 'Parciales inarmónicos sostenidos, brillo frío.',
    params: [...SUSTAIN_COMMON.filter((k) => k !== 'partials'), ['partials', { max: 10, def: 6 }], 'inharmonic'],
    defaults: { rolloff: 1.1, voices: 2, detune: 4, cutoff: 9000, tremoloDepth: 0.15, tremoloRate: 0.3 },
  },
  seno: {
    family: 'sustain', label: 'Seno', color: '#cfd8e6',
    description: 'Una sinusoide pura, para graves y tonos de prueba.',
    params: ['drift', 'vibratoDepth', 'vibratoRate', 'tremoloDepth', 'tremoloRate', 'width'],
    defaults: { drift: 0, width: 0 },
  },
  cuencoCanto: {
    family: 'sustain', label: 'Cuenco tibetano', color: '#e6d891',
    description: 'Cuenco tibetano con la maza: el canto crece despacio, sus parciales inarmónicos baten y el sonido gira alrededor.',
    params: [
      ['partials', { min: 1, max: 5, def: 4 }], 'rolloff', ['beat', { max: 3, def: 0.8 }], 'rotation', 'rotationRate',
      ['tremoloDepth', { label: 'Pulso del roce', def: 0.12 }], ['tremoloRate', { label: 'Velocidad del pulso', def: 0.6 }],
      ['breath', { label: 'Roce', def: 0.25 }], 'drift', 'cutoff', 'width',
    ],
    defaults: { rolloff: 1.2, drift: 1.5, cutoff: 7000, width: 0.8 },
  },
  theremin: {
    family: 'sustain', label: 'Theremin', color: '#c7a8ff',
    description: 'Voz electrónica casi senoidal que se desliza de una nota a otra (portamento) y vibra al sostener: el sonido clásico del espacio y la ciencia ficción. Para melodías.',
    params: ['glide', ['vibratoDepth', { def: 22 }], ['vibratoRate', { def: 5.5 }], 'drift', 'cutoff', 'tremoloDepth', 'tremoloRate', 'width'],
    defaults: { drift: 3, cutoff: 4500, width: 0.2 },
    tone: { length: 3, fadeIn: 0.2, fadeOut: 0.8 },
  },
  eolica: {
    family: 'sustain', label: 'Arpa eólica', color: '#b8e0d2',
    description: 'Cuerdas que toca el viento: sus armónicos aparecen y se apagan solos, lentos y etéreos. Para atmósferas, playas y espacio.',
    params: [['partials', { min: 4, max: 24, def: 16 }], 'wind', 'voices', 'detune', 'drift', ['breath', { label: 'Aire', def: 0.15 }], 'cutoff', 'width'],
    defaults: { voices: 2, detune: 3, drift: 1, cutoff: 5000, width: 0.8, wind: 0.4 },
  },
  // Sintetizadores de estética ochentera
  pad80: {
    family: 'sustain', label: 'Pad 80', color: '#7ad7ff',
    description: 'Pad analógico de los ochenta: pulso y sierra desafinados, coro por voces y filtro lento.',
    params: ANALOG_COMMON,
    defaults: {
      partials: 28, rolloff: 1.05, voices: 4, detune: 9, drift: 3, cutoff: 2800, q: 0.8,
      sweepDepth: 0.35, sweepRate: 0.05, width: 0.85, wave: 'pulso', pulseWidth: 0.32,
      filterEnv: 0.5, filterTime: 1.2, sub: 0.12,
    },
  },
  cinta: {
    family: 'sustain', label: 'Cinta', color: '#d8b79d',
    description: 'Pad cálido de cinta magnética: triángulo redondo, voces anchas, deriva lenta y un fondo oscuro. Profundo y nostálgico.',
    params: ANALOG_COMMON,
    defaults: {
      partials: 26, rolloff: 1.35, voices: 5, detune: 8, drift: 5.5, cutoff: 1300, q: 0.5,
      sweepDepth: 0.18, sweepRate: 0.045, width: 0.95, wave: 'triangulo', pulseWidth: 0.5,
      filterEnv: 0.5, filterTime: 1.6, sub: 0.22, tremoloDepth: 0.04, tremoloRate: 0.16,
    },
  },
  bruma: {
    family: 'sustain', label: 'Bruma', color: '#98a7d9',
    description: 'Pad profundo y neblinoso: pulso hueco, muchas voces, filtro bajo y movimientos muy lentos que revelan matices al sostenerse.',
    params: ANALOG_COMMON,
    defaults: {
      partials: 32, rolloff: 1.15, voices: 6, detune: 12, drift: 6, cutoff: 1050, q: 0.85,
      sweepDepth: 0.5, sweepRate: 0.025, width: 1, wave: 'pulso', pulseWidth: 0.18,
      filterEnv: 0.3, filterTime: 2.4, sub: 0.3, tremoloDepth: 0.05, tremoloRate: 0.11,
    },
  },
  // Los sintes 80 retirados siguen disponibles para abrir proyectos antiguos,
  // pero no se muestran en la biblioteca.
  brass80: {
    family: 'sustain', label: 'Metales 80', color: '#ffc966', hidden: true,
    description: 'Metales sintéticos con sierra desafinada y una apertura de filtro rápida al atacar.',
    params: ANALOG_COMMON,
    defaults: {
      partials: 32, rolloff: 1, voices: 3, detune: 7, drift: 2, cutoff: 1600, q: 0.7,
      sweepDepth: 0.1, sweepRate: 0.05, width: 0.6, wave: 'sierra', pulseWidth: 0.5,
      filterEnv: 2.4, filterTime: 0.22, sub: 0,
    },
  },
  bass80: {
    family: 'sustain', label: 'Bajo 80', color: '#b18cff', hidden: true,
    description: 'Bajo analógico con pulso, subgrave y filtro resonante que cae rápido.',
    params: ANALOG_COMMON,
    defaults: {
      partials: 24, rolloff: 1, voices: 2, detune: 4, drift: 1, cutoff: 700, q: 1.1,
      sweepDepth: 0, sweepRate: 0.05, width: 0.1, wave: 'pulso', pulseWidth: 0.5,
      filterEnv: 2.8, filterTime: 0.14, sub: 0.55,
    },
  },
  lead80: {
    family: 'sustain', label: 'Lead 80', color: '#ff9ad5', hidden: true,
    description: 'Lead de sierra con vibrato y filtro abierto, para melodías brillantes.',
    params: ANALOG_COMMON,
    defaults: {
      partials: 32, rolloff: 1, voices: 3, detune: 5, drift: 2, cutoff: 3800, q: 0.9,
      vibratoDepth: 8, vibratoRate: 5.2, sweepDepth: 0.2, sweepRate: 0.06, width: 0.4,
      wave: 'sierra', pulseWidth: 0.5, filterEnv: 1.4, filterTime: 0.5, sub: 0.05,
    },
  },
  // Notas puntuales
  campana: {
    family: 'strike', label: 'Campana', color: '#ffd08a',
    description: 'Modal con parciales de campana y golpe metálico.',
    params: STRIKE_COMMON, defaults: { decay: 7, brightness: 0.5, hardness: 0.35, inharmonic: 0.15, beat: 0.4 },
  },
  cuenco: {
    family: 'strike', label: 'Cuenco tibetano', color: '#e6d891',
    description: 'Cuenco tibetano golpeado con la maza: parciales inarmónicos en pares que baten y giran en estéreo, con una cola muy larga.',
    params: STRIKE_COMMON, defaults: { decay: 16, brightness: 0.35, hardness: 0.2, inharmonic: 0.05, beat: 0.9 },
  },
  kalimba: {
    family: 'strike', label: 'Kalimba', color: '#f0b37e',
    description: 'Lengüeta modal con ataque blando y cuerpo de madera.',
    params: STRIKE_COMMON, defaults: { decay: 2.6, brightness: 0.45, hardness: 0.35, inharmonic: 0.1, beat: 0 },
  },
  cajaMusica: {
    family: 'strike', label: 'Caja de música', color: '#ffe3b0',
    description: 'Púa metálica brillante, decaimiento corto.',
    params: STRIKE_COMMON, defaults: { decay: 1.8, brightness: 0.7, hardness: 0.45, inharmonic: 0.15, beat: 0 },
  },
  celesta: {
    family: 'strike', label: 'Celesta', color: '#d8e0ff',
    description: 'Láminas metálicas suaves con resonador.',
    params: STRIKE_COMMON, defaults: { decay: 3.2, brightness: 0.45, hardness: 0.2, inharmonic: 0.05, beat: 0 },
  },
  marimba: {
    family: 'strike', label: 'Marimba', color: '#d9a679',
    description: 'Láminas de madera con resonador tubular.',
    params: STRIKE_COMMON, defaults: { decay: 1.3, brightness: 0.4, hardness: 0.45, inharmonic: 0, beat: 0 },
  },
  vibrafono: {
    family: 'strike', label: 'Vibráfono', color: '#b8d4ff',
    description: 'Láminas afinadas 1:4:10 con baqueta blanda y motor lento (trémolo).',
    params: [...STRIKE_COMMON.filter((k) => k !== 'inharmonic' && k !== 'beat'), ['tremoloDepth', { def: 0.16 }], ['tremoloRate', { def: 4.2 }]],
    defaults: { decay: 9, brightness: 0.5, hardness: 0.25 },
  },
  piano: {
    family: 'strike', label: 'Piano de fieltro', color: '#f2d7b6',
    description: 'Piano íntimo con fieltro: martillo blando, decaimiento en dos fases y cuerdas ligeramente desafinadas.',
    params: STRIKE_COMMON, defaults: { decay: 9, brightness: 0.4, hardness: 0.15, inharmonic: 0.1, beat: 0 },
  },
  arpa: {
    family: 'strike', label: 'Arpa', color: '#e9c98f',
    description: 'Cuerda larga y redonda pulsada cerca del centro.',
    params: STRIKE_COMMON, defaults: { decay: 7, brightness: 0.45, hardness: 0.2, inharmonic: 0.05, beat: 0 },
  },
  guitarra: {
    family: 'strike', label: 'Guitarra de nailon', color: '#d9b48a',
    description: 'Cuerda de nailon pulsada cerca del puente, con la resonancia de la caja: cálida y corta.',
    params: STRIKE_COMMON, defaults: { decay: 4.5, brightness: 0.4, hardness: 0.3, inharmonic: 0.05, beat: 0 },
  },
  ukelele: {
    family: 'strike', label: 'Ukelele', color: '#f2c38b',
    description: 'Cuerdas de nailon cortas y una caja pequeña: pulsación clara y alegre, de isla tropical.',
    params: STRIKE_COMMON, defaults: { decay: 2.4, brightness: 0.55, hardness: 0.35, inharmonic: 0.03, beat: 0 },
  },
  banjo: {
    family: 'strike', label: 'Banjo', color: '#f6d68a',
    description: 'Cuerdas de acero cortas y brillantes sobre un parche de resonador: pulsación seca, chispeante y con mucha madera.',
    params: STRIKE_COMMON, defaults: { decay: 3.2, brightness: 0.68, hardness: 0.45, inharmonic: 0.02, beat: 0 },
  },
  slide: {
    family: 'strike', label: 'Slide hawaiana', color: '#9fd3c7',
    description: 'Guitarra hawaiana de acero tocada con barra: cada nota entra deslizándose desde abajo y canta con un vibrato lento.',
    params: [
      'decay', 'brightness', 'hardness', 'inharmonic', 'slide', 'slideTime',
      ['vibratoDepth', { def: 12 }], ['vibratoRate', { def: 5 }], 'velocityCurve', 'width',
    ],
    defaults: { decay: 6, brightness: 0.55, hardness: 0.25, inharmonic: 0.08 },
  },
  pulsada: {
    family: 'strike', label: 'Cuerda pulsada', color: '#c6b2ff',
    description: 'Karplus-Strong, entre arpa y guitarra suave.',
    params: STRIKE_COMMON.filter((k) => k !== 'inharmonic' && k !== 'beat'),
    defaults: { decay: 3.5, brightness: 0.45, hardness: 0.4 },
  },
  gotaTonal: {
    family: 'strike', label: 'Gota tonal', color: '#8fbdff', hidden: true,
    description: 'Burbuja de Minnaert afinada (el tono sube al final).',
    params: ['decay', 'brightness', 'velocityCurve', 'width'],
    defaults: { decay: 0.6, brightness: 0.5 },
  },
  // Palo de lluvia antiguo, solo para abrir proyectos ya guardados. La versión
  // nueva es la textura «Palo de agua» de la familia de ruidos.
  paloLluvia: {
    family: 'strike', label: 'Palo de lluvia', color: '#c8b48a', hidden: true,
    description: 'Semillas que caen por un tubo: cada golpe es un vuelco del palo, un chaparrón que crece y se apaga. La nota fija el color del grano.',
    params: [['decay', { label: 'Duración del vuelco', def: 4 }], 'brightness', ['hardness', { label: 'Dureza del grano' }], 'velocityCurve', 'width'],
    defaults: { brightness: 0.5, hardness: 0.4, width: 0.7 },
  },
  handpan: {
    family: 'strike', label: 'Handpan', color: '#c9d7e8',
    description: 'Tambor de acero afinado tocado con la mano: nota redonda con su octava y su quinta, cola larga y un batido suave.',
    params: STRIKE_COMMON, defaults: { decay: 10, brightness: 0.4, hardness: 0.15, inharmonic: 0, beat: 0.35 },
  },
  lengueta: {
    family: 'strike', label: 'Tambor de lengüeta', color: '#a9c4e0',
    description: 'Tambor de acero con lengüetas (tongue drum), tocado con los dedos: nota pura y redonda, con la resonancia grave de la caja y una cola larga. Muy de meditación.',
    params: STRIKE_COMMON, defaults: { decay: 8, brightness: 0.35, hardness: 0.2, inharmonic: 0, beat: 0.25 },
  },
  steelpan: {
    family: 'strike', label: 'Steel drum', color: '#ffd9a0',
    description: 'Tambor metálico del Caribe con baqueta de goma: brillante y cantarín, con el batido de sus pares de modos.',
    params: STRIKE_COMMON, defaults: { decay: 3.2, brightness: 0.6, hardness: 0.35, inharmonic: 0, beat: 0.6 },
  },
  fmPiano: {
    family: 'strike', label: 'Piano FM', color: '#8fb7ff',
    description: 'Piano eléctrico de FM: campana metálica y cuerpo cálido, al estilo de los ochenta.',
    params: FM_COMMON,
    defaults: { decay: 7.5, brightness: 0.55, hardness: 0.25, fmRatio: 1, fmIndex: 3.2, fmTime: 1.4 },
  },
  fmBell: {
    family: 'strike', label: 'Campana FM', color: '#d8e0ff',
    description: 'Campana digital de FM con parciales metálicos y cola larga.',
    params: FM_COMMON,
    defaults: { decay: 13, brightness: 0.6, hardness: 0.3, fmRatio: 3.5, fmIndex: 4.8, fmTime: 2.8 },
  },
  pianoCinta: {
    family: 'strike', label: 'Piano de cinta', color: '#e8c49a',
    description: 'Piano eléctrico de cinta: ataque suave, cuerpo cálido y una ondulación lenta, como una grabación de los ochenta.',
    params: VINTAGE_FM_COMMON,
    defaults: {
      decay: 8.5, brightness: 0.42, hardness: 0.18, fmRatio: 1, fmIndex: 2.6, fmTime: 1.8,
      detune: 4.5, wow: 7, wowRate: 0.23, width: 0.45,
    },
  },
  cristal80: {
    family: 'strike', label: 'Cristal', color: '#a9d9ff',
    description: 'Cristal digital de FM: brillo de campana, cola de cristal y un coro tenue que se abre en estéreo.',
    params: VINTAGE_FM_COMMON,
    defaults: {
      decay: 14, brightness: 0.7, hardness: 0.22, fmRatio: 3.01, fmIndex: 5.2, fmTime: 2.6,
      detune: 3, wow: 2.5, wowRate: 0.17, width: 0.72,
    },
  },
  metal80: {
    family: 'strike', label: 'Metal', color: '#c9b8e8',
    description: 'Golpe metálico de sintetizador: armónicos duros, caída media y una desafinación ancha con carácter de cinta.',
    params: VINTAGE_FM_COMMON,
    defaults: {
      decay: 6.5, brightness: 0.52, hardness: 0.34, fmRatio: 2.414, fmIndex: 4.2, fmTime: 0.9,
      detune: 7, wow: 10, wowRate: 0.31, width: 0.55,
    },
  },
  // Ruidos
  ruido: {
    family: 'noise', label: 'Ruido', color: '#b7d8d3',
    description: 'Ruido de color filtrado, con ráfagas u oleaje.',
    params: NOISE_COMMON,
    defaults: { cutoff: 1400 },
  },
  ruidoBrisa: {
    family: 'noise', label: 'Brisa', color: '#a9d1ff',
    description: 'Ruido rosa en banda media con ráfagas lentas: aire suave y abierto.',
    params: NOISE_COMMON,
    defaults: {
      color: 'rosa', filterType: 'bp', cutoff: 1200, q: 0.5, movement: 'rafagas',
      moveRate: 0.07, moveDepth: 0.28, moveTarget: 'filtro', stereo: 0.9,
    },
  },
  ruidoMarea: {
    family: 'noise', label: 'Marea', color: '#79a9e8',
    description: 'Ruido marrón con oleaje largo y grave: una marea lejana.',
    params: NOISE_COMMON,
    defaults: {
      color: 'marron', filterType: 'lp', cutoff: 700, q: 0.6, movement: 'oleaje',
      moveRate: 0.05, moveDepth: 0.55, moveTarget: 'ambos', wavePeriod: 12, waveShape: 0.32, stereo: 0.7,
    },
  },
  ruidoSiseo: {
    family: 'noise', label: 'Siseo', color: '#cfd8e6',
    description: 'Ruido rosa muy filtrado en agudos, con un vaivén casi imperceptible.',
    params: NOISE_COMMON,
    defaults: {
      color: 'rosa', filterType: 'hp', cutoff: 2600, q: 0.5, movement: 'rafagas',
      moveRate: 0.045, moveDepth: 0.18, moveTarget: 'nivel', stereo: 0.8,
    },
  },
  ruidoCalor: {
    family: 'noise', label: 'Calor', color: '#ffd08a',
    description: 'Ruido marrón grave y redondo, como un zumbido lejano y cálido.',
    params: NOISE_COMMON,
    defaults: {
      color: 'marron', filterType: 'lp', cutoff: 380, q: 0.8, movement: 'rafagas',
      moveRate: 0.035, moveDepth: 0.25, moveTarget: 'nivel', stereo: 0.35,
    },
  },
  ruidoTerciopelo: {
    family: 'noise', label: 'Terciopelo', color: '#e6b8d8',
    description: 'Ruido rosa suave y ancho, con respiración lenta y sin aristas.',
    params: NOISE_COMMON,
    defaults: {
      color: 'rosa', filterType: 'lp', cutoff: 900, q: 0.5, movement: 'oleaje',
      moveRate: 0.05, moveDepth: 0.35, moveTarget: 'ambos', wavePeriod: 9, waveShape: 0.5, stereo: 0.95,
    },
  },
  paloAgua: {
    family: 'noise', label: 'Palo de agua', color: '#c8b48a',
    description: 'Textura de semillas que caen por un tubo: un susurro granular, cálido y continuo.',
    params: [
      ['rate', { label: 'Semillas por segundo', min: 20, max: 500, def: 200, log: true }],
      'brightness',
      ['hardness', { label: 'Dureza del grano' }],
      'variation',
      'width',
    ],
    defaults: { rate: 200, brightness: 0.55, hardness: 0.4, variation: 0.5, width: 0.7 },
  },
  // Simulaciones
  grillo: {
    family: 'nature', label: 'Grillos', color: '#d7e08f',
    description: 'Llamadas de pulsos con portadora casi pura.',
    params: ['individuals', 'pitch', 'callRate', 'pulses', 'sync', ...NATURE_COMMON], defaults: { distance: 0.5 },
  },
  cigarra: {
    family: 'nature', label: 'Cigarras', color: '#e8d27a',
    description: 'Zumbido pulsado en tandas con pausas.',
    params: [['individuals', { max: 6, def: 2 }], ['pitch', { min: 3000, max: 7000, def: [3800, 5200] }], 'bout', 'rest', ...NATURE_COMMON],
    defaults: { distance: 0.6 },
  },
  pajaro: {
    family: 'nature', label: 'Pájaros', color: '#e6d891',
    description: 'Cantos por especie o un pájaro genérico parametrizable.',
    params: [
      ['species', {
        options: o([['generico', 'Genérico'], ['mirlo', 'Mirlo'], ['petirrojo', 'Petirrojo'], ['carbonero', 'Carbonero'],
          ['pinzon', 'Pinzón'], ['cuco', 'Cuco'], ['tortola', 'Tórtola'], ['autillo', 'Autillo'], ['carabo', 'Cárabo'], ['gaviota', 'Gaviota']]),
        def: 'mirlo',
      }],
      ['individuals', { max: 8, def: 2 }], 'songRate', 'register', 'syllables', 'shape', ...NATURE_COMMON,
    ],
    defaults: { distance: 0.35 },
  },
  rana: {
    family: 'nature', label: 'Ranas', color: '#9ed6a0', hidden: true,
    description: 'Sapo partero, ranita o croar grave.',
    params: [
      ['species', { options: o([['sapoPartero', 'Sapo partero'], ['ranita', 'Ranita'], ['croar', 'Croar grave']]), def: 'sapoPartero' }],
      ['individuals', { max: 12, def: 4 }], 'callsPerMin', ...NATURE_COMMON,
    ],
    defaults: { distance: 0.5 },
  },
  gotas: {
    family: 'nature', label: 'Gotas', color: '#8fbdff',
    description: 'Gotas sueltas sobre agua, hoja, cristal o piedra.',
    params: [
      ['surface', { options: o([['agua', 'Agua'], ['hoja', 'Hoja'], ['cristal', 'Cristal'], ['piedra', 'Piedra']]), def: 'agua' }],
      'rate', ['pitch', { min: 300, max: 6000, def: [900, 3200] }], ...NATURE_COMMON,
    ],
    defaults: { distance: 0.3 },
  },
  lluvia: {
    family: 'nature', label: 'Lluvia', color: '#79a9e8',
    description: 'Lecho de impactos sobre distintas superficies.',
    params: [
      ['surface', { options: o([['hojas', 'Hojas'], ['tejado', 'Tejado'], ['cristal', 'Cristal'], ['agua', 'Agua'], ['lona', 'Lona']]), def: 'hojas' }],
      'intensity', ...NATURE_COMMON,
    ],
    defaults: { distance: 0.3, spread: 1 },
  },
  lluviaFina: {
    family: 'nature', label: 'Lluvia fina', color: '#8fc3ff', hidden: true,
    description: 'Gotas pequeñas y brillantes sobre hojas, con un siseo continuo.',
    params: ['intensity', ...NATURE_COMMON],
    defaults: { distance: 0.25, spread: 1, variation: 0.6, intensity: 900 },
  },
  lluviaLejana: {
    family: 'nature', label: 'Lluvia lejana', color: '#6889b8',
    description: 'Rumor lejano y difuso, sin gotas cercanas: un fondo de lluvia.',
    params: [['intensity', { label: 'Intensidad', min: 0.1, max: 1.5, def: 0.7, step: 0.01 }], ...NATURE_COMMON],
    defaults: { distance: 0.65, spread: 0.9, variation: 0.55, intensity: 0.7 },
  },
  arroyo: {
    family: 'nature', label: 'Arroyo', color: '#79e8b7',
    description: 'Corriente con fuentes de burbujeo.',
    params: ['flow', 'sources', ['register', { min: 200, max: 4000, def: [450, 2200] }], ...NATURE_COMMON],
    defaults: { distance: 0.35, spread: 0.8 },
  },
  olas: {
    family: 'nature', label: 'Olas', color: '#5cebd5',
    description: 'Olas con crecida, rompiente, espuma y guijarros.',
    params: ['period', 'size', 'foam', 'pebbles', ...NATURE_COMMON],
    defaults: { distance: 0.4, spread: 0.9 },
  },
  viento: {
    family: 'nature', label: 'Viento', color: '#b7d8d3', hidden: true,
    description: 'Ráfagas con aullido afinado y hojas. Se mantiene para abrir proyectos anteriores.',
    params: ['strength', 'gustiness', 'howl', 'howlPitch', 'leaves', ...NATURE_COMMON],
    defaults: { distance: 0.3, spread: 1 },
  },
  fuego: {
    family: 'nature', label: 'Fuego', color: '#ffa45c',
    description: 'Rugido, chasquidos en racimos, estallidos y siseo.',
    params: ['size', 'crackle', 'pops', 'hiss', ...NATURE_COMMON],
    defaults: { distance: 0.25, spread: 0.5 },
  },
  campanillas: {
    family: 'nature', label: 'Campanillas', color: '#d8e0ff',
    description: 'Tubos afinados a la escala del tema y movidos por el viento.',
    params: ['material', 'tubes', 'wind', ...NATURE_COMMON],
    defaults: { distance: 0.35 },
  },
  // Capas de pistas de sen (no se añaden desde la biblioteca: llegan al abrir una pista de la app)
  capa: {
    family: 'layer', label: 'Capa de pista de sen', color: '#9fb4c8', hidden: true,
    description: 'Una capa de una pista de la app (lluvia, pájaros, pad, melodía…) tal como suena allí. Puedes cambiar su volumen, panorama, fundidos y automatización, pero no su timbre.',
    params: [],
    defaults: {},
  },
};

/**
 * Agrupación de la biblioteca: primero el gesto (sostenido, puntual, textura,
 * naturaleza) y dentro, el timbre. Solo afecta a la presentación; los IDs y las
 * familias del motor no cambian.
 */
export const INSTRUMENT_GROUPS = [
  {
    id: 'sostenidos', label: 'Sostenidos',
    subgroups: [
      { id: 'sintes', label: 'Sintes', instruments: ['pad', 'pad80', 'cinta', 'bruma', 'theremin'] },
      { id: 'drone', label: 'Drone', instruments: ['drone'] },
      { id: 'cuerdas', label: 'Cuerdas', instruments: ['cuerdas', 'eolica'] },
      { id: 'vientos', label: 'Vientos', instruments: ['flauta'] },
      { id: 'voces', label: 'Voces', instruments: ['coro'] },
      { id: 'cuencos', label: 'Cuencos', instruments: ['cuencoCanto'] },
      { id: 'cristal', label: 'Cristal y puro', instruments: ['vidrio', 'seno'] },
    ],
  },
  {
    id: 'puntuales', label: 'Puntuales',
    subgroups: [
      { id: 'teclados', label: 'Teclados', instruments: ['piano', 'fmPiano', 'celesta', 'cajaMusica'] },
      { id: 'laminas', label: 'Láminas', instruments: ['marimba', 'vibrafono', 'kalimba'] },
      { id: 'tambores', label: 'Tambores de acero', instruments: ['handpan', 'lengueta', 'steelpan'] },
      { id: 'pulsadas', label: 'Cuerdas pulsadas', instruments: ['arpa', 'guitarra', 'ukelele', 'banjo', 'slide', 'pulsada'] },
      { id: 'campanas', label: 'Campanas y cuencos', instruments: ['campana', 'fmBell', 'cuenco'] },
      { id: 'sintes80', label: 'Sintes', instruments: ['pianoCinta', 'cristal80', 'metal80'] },
    ],
  },
  {
    id: 'texturas', label: 'Texturas',
    subgroups: [
      { id: 'ruido', label: 'Ruido', instruments: ['ruido', 'ruidoBrisa', 'ruidoMarea', 'ruidoSiseo', 'ruidoCalor', 'ruidoTerciopelo', 'paloAgua'] },
    ],
  },
  {
    id: 'naturaleza', label: 'Naturaleza',
    subgroups: [
      { id: 'agua', label: 'Agua', instruments: ['gotas', 'lluvia', 'lluviaLejana', 'arroyo', 'olas'] },
      { id: 'aire', label: 'Aire', instruments: ['campanillas'] },
      { id: 'animales', label: 'Animales', instruments: ['grillo', 'cigarra', 'pajaro'] },
      { id: 'fuego', label: 'Fuego', instruments: ['fuego'] },
    ],
  },
];

/** Definiciones resueltas de los parámetros de un instrumento. */
export function paramDefs(instrumentId) {
  const inst = INSTRUMENTS[instrumentId];
  if (!inst) return [];
  return inst.params.map((entry) => {
    const [key, over] = Array.isArray(entry) ? entry : [entry, {}];
    const base = PARAMS[key];
    const def = { key, ...base, ...over };
    if (inst.defaults && key in inst.defaults) def.def = inst.defaults[key];
    return def;
  });
}

/** Parámetros completos de una pista (los que falten toman el defecto). */
export function trackParams(track) {
  const out = {};
  for (const def of paramDefs(track.instrument)) {
    const v = track.params?.[def.key];
    out[def.key] = v === undefined ? cloneValue(def.def) : v;
  }
  return out;
}

/* ------------------------------------------------------------ mezcla y maestro */

export const MIX_DEFS = [
  { key: 'gain', ...num('Volumen', -60, 6, -6, { step: 0.5, unit: 'dB' }) },
  { key: 'pan', ...num('Panorama', -1, 1, 0, { step: 0.01 }) },
  { key: 'reverb', ...num('Envío a reverb', 0, 1, 0.3, { step: 0.01 }) },
  { key: 'echo', ...num('Envío a eco', 0, 1, 0, { step: 0.01 }) },
  { key: 'mute', type: 'bool', label: 'Silencio', def: false },
  { key: 'solo', type: 'bool', label: 'Solo', def: false },
];

/** Parámetros automatizables por pista. Los puntos son `[segundos, valor]`. */
export const AUTOMATION_DEFS = [
  { key: 'gain', label: 'Volumen', min: -60, max: 6, unit: 'dB', step: 0.5 },
  { key: 'pan', label: 'Panorama', min: -1, max: 1, step: 0.01 },
  { key: 'reverb', label: 'Envío a reverb', min: 0, max: 1, step: 0.01 },
  { key: 'echo', label: 'Envío a eco', min: 0, max: 1, step: 0.01 },
  { key: 'cutoff', label: 'Filtro de pista (paso bajo)', min: 80, max: 20000, unit: 'Hz', log: true },
];

/** Valor de una automatización en `t` (interpolación lineal; logarítmica si `log`). */
export function automationValue(points, t, log = false) {
  if (!points || !points.length) return null;
  if (t <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (t >= last[0]) return last[1];
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const [t0, v0] = points[lo];
  const [t1, v1] = points[hi];
  const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
  if (log && v0 > 0 && v1 > 0) return v0 * Math.pow(v1 / v0, u);
  return v0 + (v1 - v0) * u;
}

export const ECHO_SYNC = o([['libre', 'Libre'], ['1/16', '1/16'], ['1/8', '1/8'], ['1/8.', '1/8 con puntillo'],
  ['1/4', '1/4'], ['1/4.', '1/4 con puntillo'], ['1/2', '1/2'], ['1', '1 pulso × 4']]);

export const MASTER_DEFS = [
  { key: 'gain', ...num('Volumen', -24, 12, 0, { step: 0.5, unit: 'dB' }) },
  { key: 'ceiling', ...num('Techo del limitador', -6, -0.1, -1, { step: 0.1, unit: 'dBFS' }) },
  { key: 'reverb.size', group: 'Reverb', ...num('Tamaño', 0, 1, 0.6, { step: 0.01 }) },
  { key: 'reverb.decay', group: 'Reverb', ...num('Decaimiento', 0.3, 12, 4.5, { log: true, unit: 's' }) },
  { key: 'reverb.damping', group: 'Reverb', ...num('Amortiguación', 1000, 16000, 6000, { log: true, unit: 'Hz' }) },
  { key: 'reverb.predelay', group: 'Reverb', ...num('Predelay', 0, 0.2, 0.02, { step: 0.001, unit: 's' }) },
  { key: 'echo.time', group: 'Eco', ...num('Tiempo', 0.02, 2, 0.48, { log: true, unit: 's' }) },
  { key: 'echo.sync', group: 'Eco', ...opt('Sincronía con el tempo', ECHO_SYNC, 'libre') },
  { key: 'echo.feedback', group: 'Eco', ...num('Realimentación', 0, 0.9, 0.35, { step: 0.01 }) },
  { key: 'echo.tone', group: 'Eco', ...num('Tono', 500, 12000, 3200, { log: true, unit: 'Hz' }) },
  { key: 'echo.pingPong', group: 'Eco', type: 'bool', label: 'Ping-pong', def: true },
  { key: 'eq.on', group: 'Ecualización', type: 'bool', label: 'Ecualización activa', def: true },
  { key: 'eq.lowCut', group: 'Ecualización', ...num('Corte de graves', 20, 200, 30, { log: true, unit: 'Hz' }) },
  { key: 'eq.highCut', group: 'Ecualización', ...num('Corte de agudos', 2000, 20000, 18000, { log: true, unit: 'Hz' }) },
  { key: 'eq.tilt', group: 'Ecualización', ...num('Inclinación', -6, 6, 0, { step: 0.1, unit: 'dB' }) },
];

export const END_MODES = o([['tail', 'Con cola'], ['cut', 'Duración exacta'], ['loop', 'Bucle sin costura']]);

export const EXPORT_PRESETS = {
  estudio: { label: 'Estudio', sampleRate: 48000, bits: 24, channels: 2, end: null, loudness: -18, ceiling: -1 },
  cd: { label: 'CD', sampleRate: 44100, bits: 16, channels: 2, end: null, loudness: -16, ceiling: -1 },
  escena: { label: 'Escena para sen', sampleRate: 22050, bits: 16, channels: 1, end: 'loop', loudness: -23, ceiling: -3 },
};

/** Sonoridades de exportación admitidas (−24 y −25 son las de algunas pistas de sen). */
export const LOUDNESS_TARGETS = [-25, -24, -23, -18, -16, -14];

export const EXPORT_DEFAULTS = {
  sampleRate: 48000, bits: 24, channels: 2, end: null, loudness: -18, ceiling: -1, range: 'all',
};

/* ------------------------------------------------------------ elementos */

export const ELEMENT_DEFS = {
  common: [
    { key: 'start', ...num('Inicio', 0, LIMITS.maxDuration, 0, { step: 0.001, unit: 's' }) },
    { key: 'length', ...num('Duración', 0.1, LIMITS.maxDuration, 30, { step: 0.001, unit: 's' }) },
    { key: 'level', ...num('Nivel', -40, 6, 0, { step: 0.5, unit: 'dB' }) },
    { key: 'fadeIn', ...num('Fundido de entrada', 0, LIMITS.maxDuration, 3, { step: 0.01, unit: 's' }) },
    { key: 'fadeOut', ...num('Fundido de salida', 0, LIMITS.maxDuration, 3, { step: 0.01, unit: 's' }) },
  ],
  tone: [
    { key: 'crossfade', ...num('Fundido entre notas', 0, 2, 0.15, { step: 0.01, unit: 's' }) },
  ],
  hit: [
    { key: 'start', ...num('Instante', 0, LIMITS.maxDuration, 0, { step: 0.001, unit: 's' }) },
    { key: 'velocity', ...num('Velocidad', 0, 1, 0.7, { step: 0.01 }) },
    { key: 'level', ...num('Nivel', -40, 6, 0, { step: 0.5, unit: 'dB' }) },
  ],
  phrase: [
    { key: 'pattern', ...num('Longitud del patrón', 0.25, 60, 4, { step: 0.05, unit: 's' }) },
  ],
  cloud: [
    { key: 'density', ...num('Notas por minuto', 1, 120, 8, { step: 0.5 }) },
    { key: 'timing', ...num('Azar en el tiempo', 0, 1, 0.6, { step: 0.01 }) },
    { key: 'motion', ...num('Pasos cercanos', 0, 1, 0.5, { step: 0.01 }) },
    { key: 'gravity', ...num('Gravedad (tónica y quinta)', 0, 1, 0.4, { step: 0.01 }) },
    { key: 'chord', ...num('Probabilidad de acorde', 0, 1, 0.1, { step: 0.01 }) },
    { key: 'velocity', ...rng('Velocidad', 0, 1, [0.35, 0.8], { step: 0.01 }) },
  ],
  span: [
    { key: 'density', ...num('Densidad', 0, 1, 0.6, { step: 0.01 }) },
  ],
  clip: [
    { key: 'offset', ...num('Punto de la capa al empezar', 0, 3600, 0, { step: 0.01, unit: 's' }) },
  ],
};

/* ------------------------------------------------------------ curvas */

export const CURVE_PRESETS = o([['plana', 'Plana'], ['crece', 'Crece'], ['decrece', 'Decrece'], ['respira', 'Respira'], ['olas', 'Olas'], ['olas-suaves', 'Olas suaves']]);

/** Puntos `[x, y]` de una curva (nombre predefinido o lista). */
export function curvePoints(curve) {
  if (Array.isArray(curve) && curve.length) {
    return curve
      .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([x, y]) => [clampNum(x, 0, 1), clampNum(y, 0, 1)])
      .sort((a, b) => a[0] - b[0]);
  }
  const name = typeof curve === 'string' ? curve : 'plana';
  if (name === 'crece') return [[0, 0.1], [1, 1]];
  if (name === 'decrece') return [[0, 1], [1, 0.1]];
  if (name === 'respira') return [[0, 0.2], [0.5, 1], [1, 0.2]];
  if (name.startsWith('olas')) {
    // Las olas suaves repiten el patrón con menos recorrido: picos más bajos
    // y valles más altos.
    const soft = name.startsWith('olas-suaves');
    const n = Math.max(1, Math.min(12, Number(name.split(':')[1]) || 3));
    const low = soft ? 0.45 : 0.25;
    const high = soft ? 0.8 : 1;
    const pts = [];
    for (let k = 0; k <= 2 * n; k++) pts.push([k / (2 * n), k % 2 ? high : low]);
    return pts;
  }
  return [[0, 1], [1, 1]];
}

/** Función `x → y` de una curva, interpolación suave entre puntos. */
export function curveFunction(curve) {
  const pts = curvePoints(curve);
  if (pts.length === 0) return () => 1;
  if (pts.every((p) => p[1] === pts[0][1])) {
    const y = pts[0][1];
    return () => y;
  }
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let k = 1; k < pts.length; k++) {
      if (x <= pts[k][0]) {
        const [x0, y0] = pts[k - 1];
        const [x1, y1] = pts[k];
        const u = x1 > x0 ? (x - x0) / (x1 - x0) : 1;
        const s = u * u * (3 - 2 * u);
        return y0 + (y1 - y0) * s;
      }
    }
    return pts[pts.length - 1][1];
  };
}

/* ------------------------------------------------------------ utilidades */

export function clampNum(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function cloneValue(v) {
  return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
}

export function newId(prefix = '') {
  const abc = 'abcdefghijkmnopqrstuvwxyz23456789';
  let s = prefix;
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/** Nota de la tonalidad en una octava y grado de la escala. */
export function keyNote(key, octave, degree = 0) {
  const steps = SCALES[key?.scale] || SCALES.mayor;
  const root = rootIndex(key?.root || 'C');
  const oct = Math.floor(degree / steps.length);
  const step = steps[((degree % steps.length) + steps.length) % steps.length];
  return midiToNote((octave + 1 + oct) * 12 + root + step);
}

/* ------------------------------------------------------------ creación */

export function masterDefaults() {
  const m = {};
  for (const def of MASTER_DEFS) setPath(m, def.key, cloneValue(def.def));
  return m;
}

export function createProject(over = {}) {
  return {
    schema: SCHEMA_ID,
    engine: ENGINE_VERSION,
    name: 'Tema sin título',
    notes: '',
    createdAt: new Date().toISOString(),
    savedAt: null,
    seed: `sen-${Math.floor(Math.random() * 1e6)}`,
    duration: 60,
    end: { mode: 'tail', fadeOut: 4 },
    tuning: { a4: 440 },
    key: { root: 'C', scale: 'mayor' },
    tempo: null,
    region: null,
    tracks: [],
    master: masterDefaults(),
    export: { ...EXPORT_DEFAULTS },
    ...over,
  };
}

export function createTrack(instrumentId, project) {
  const inst = INSTRUMENTS[instrumentId];
  if (!inst) throw new Error(`Instrumento desconocido: ${instrumentId}`);
  const params = {};
  for (const def of paramDefs(instrumentId)) params[def.key] = cloneValue(def.def);
  const same = (project?.tracks || []).filter((t) => t.instrument === instrumentId).length;
  const mix = {};
  for (const def of MIX_DEFS) mix[def.key] = def.def;
  if (inst.family === 'nature') mix.gain = -8;
  if (inst.family === 'noise') mix.gain = -10;
  if (inst.family === 'strike') mix.reverb = 0.45;
  if (inst.family === 'layer') {
    mix.gain = 0;
    mix.reverb = 0;
  }
  return {
    id: newId('t'),
    name: same ? `${inst.label} ${same + 1}` : inst.label,
    color: inst.color,
    family: inst.family,
    instrument: instrumentId,
    params,
    mix,
    elements: [],
  };
}

const LAYER_COLORS = ['#8fbdff', '#9ed6a0', '#e6d891', '#f0b37e', '#c6b2ff', '#9dded8', '#e6b8d8', '#ffd08a'];

/**
 * Proyecto para retocar una pista de sen: una pista por capa, todas a 0 dB,
 * en bucle y con la exportación «Escena para sen» a la sonoridad de la
 * pista. Sin tocar nada, exporta la misma pista que suena en la app.
 * `info`: `{ ambient, track, name, title, duration, lufs, layers: ['Nombre', …] }`.
 */
export function createSceneProject(info) {
  const nn = String(info.track).padStart(2, '0');
  const file = info.file || `${nn}.wav`;
  const duration = Math.round(clampNum(info.duration, LIMITS.minDuration, LIMITS.maxLoop) * 1000) / 1000;
  const lufs = LOUDNESS_TARGETS.includes(info.lufs) ? info.lufs : -23;
  const p = createProject({
    name: nn,
    notes: `Pista ${nn} de ${info.name} en sen. Para usarla en la app: Exportar → «Escena para sen» y sustituye assets/audio/${info.ambient}/${file} por el WAV descargado.`,
    seed: `sen-${info.ambient}-${nn}`,
    duration,
    end: { mode: 'loop', fadeOut: 4 },
    export: { ...EXPORT_DEFAULTS, ...EXPORT_PRESETS.escena, loudness: lufs, range: 'all' },
    scene: { ambient: info.ambient, track: info.track, lufs, name: info.name, file },
  });
  delete p.export.label;
  p.master.eq = { on: false, lowCut: 20, highCut: 20000, tilt: 0 };
  p.tracks = info.layers.map((layerName, k) => {
    const t = createTrack('capa', p);
    t.id = `capa${k + 1}`;
    t.name = layerName;
    t.color = LAYER_COLORS[k % LAYER_COLORS.length];
    t.source = { ambient: info.ambient, track: info.track, layer: k, name: layerName, file, ambientName: info.name };
    const e = createElement(t, p, 0, 'clip');
    e.id = `e${k + 1}`;
    e.length = duration;
    e.offset = 0;
    t.elements.push(e);
    return t;
  });
  return p;
}

/** Clave de una capa de pista de sen: `ambiente/NN#capa`. */
export function layerKey(source) {
  if (!source) return '';
  return `${source.ambient}/${String(source.track).padStart(2, '0')}#${source.layer}`;
}

function validSource(s) {
  return !!s && typeof s === 'object' && /^[a-z]{2,20}$/.test(s.ambient || '') && Number.isInteger(s.track) && s.track >= 1 && s.track <= 9
    && Number.isInteger(s.layer) && s.layer >= 0 && s.layer < 32;
}

const SUSTAIN_CHORDS = {
  pad: [[3, 0], [3, 4], [4, 2]],
  drone: [[2, 0], [2, 4]],
  cuerdas: [[3, 0], [3, 2], [3, 4]],
  coro: [[3, 0], [3, 4]],
  vidrio: [[4, 0], [4, 4]],
  seno: [[3, 0]],
  flauta: [[4, 0]],
  cuencoCanto: [[3, 0]],
  theremin: [[4, 0]],
  eolica: [[2, 0]],
};

/** Elemento por defecto para una pista. `type` es opcional. */
export function createElement(track, project, start = 0, type = null) {
  const family = FAMILIES.find((f) => f.id === track.family);
  const t = type && family.types.includes(type) ? type : family.types[family.id === 'strike' ? 2 : 0];
  const key = project?.key || { root: 'C', scale: 'mayor' };
  const duration = project?.duration || 60;
  const base = { id: newId('e'), type: t, start: Math.max(0, Math.round(start * 1000) / 1000) };
  const len = Math.max(1, Math.min(30, duration - base.start || 30));
  if (t === 'tone') {
    const chord = SUSTAIN_CHORDS[track.instrument] || [[3, 0]];
    const shape = INSTRUMENTS[track.instrument]?.tone;
    if (shape) {
      const l = Math.min(shape.length, Math.max(0.1, duration - base.start));
      return { ...base, length: l, level: 0, fadeIn: Math.min(shape.fadeIn, l / 2), fadeOut: Math.min(shape.fadeOut, l / 2), notes: chord.map(([oc, d]) => keyNote(key, oc, d)), curve: 'plana', seed: 1, crossfade: 0.15 };
    }
    return { ...base, length: len, level: 0, fadeIn: Math.min(4, len / 3), fadeOut: Math.min(6, len / 3), notes: chord.map(([oc, d]) => keyNote(key, oc, d)), curve: 'plana', seed: 1, crossfade: 0.15 };
  }
  if (t === 'clip') {
    const l = Math.max(0.1, Math.round((duration - base.start) * 1000) / 1000);
    return { ...base, length: l, level: 0, fadeIn: 0, fadeOut: 0, offset: base.start, curve: 'plana' };
  }
  if (t === 'hit') return { ...base, note: keyNote(key, 4, 0), velocity: 0.7, level: 0 };
  if (t === 'phrase') {
    return {
      ...base, length: Math.min(16, len), level: 0, fadeIn: 0, fadeOut: 0, pattern: 4, curve: 'plana',
      events: [[0, 0, 0.7], [0.75, 2, 0.55], [1.5, 4, 0.6], [2.5, 7, 0.5]].map(([tt, d, v]) => ({ t: tt, note: keyNote(key, 4, d), v })),
    };
  }
  if (t === 'cloud') {
    // Una nube nueva empieza vacía: las notas se graban con el teclado o se
    // generan activando «Notas aleatorias».
    return {
      ...base, mode: 'mine', events: [], length: len, level: 0, fadeIn: 0, fadeOut: Math.min(4, len / 4), density: 8,
      range: [keyNote(key, 4, 0), keyNote(key, 6, 0)], pitches: null,
      timing: 0.6, motion: 0.5, gravity: 0.4,
      chord: 0.1, velocity: [0.35, 0.8], seed: 1, curve: 'plana',
    };
  }
  return { ...base, length: len, level: 0, fadeIn: Math.min(3, len / 4), fadeOut: Math.min(3, len / 4), density: 0.6, seed: 1, curve: 'plana' };
}

/* ------------------------------------------------------------ cambios de nota */

/**
 * Puntos efectivos de un `tone`: las notas base (`notes`) en 0 y los cambios
 * (`changes`) ordenados. Un cambio en 0 sustituye las notas base.
 */
export function toneChangePoints(el) {
  const len = Math.max(0.1, Number(el.length) || 0.1);
  const base = Array.isArray(el.notes) ? el.notes : [];
  const points = [{ t: 0, notes: base }];
  const list = (Array.isArray(el.changes) ? el.changes : [])
    .filter((c) => c && Number.isFinite(c.t) && Array.isArray(c.notes))
    .map((c) => ({ t: clampNum(c.t, 0, len), notes: c.notes }))
    .sort((a, b) => a.t - b.t);
  for (const c of list) {
    if (c.t <= 0) points[0] = { t: 0, notes: c.notes };
    else if (c.t < len) {
      const last = points[points.length - 1];
      if (Math.abs(last.t - c.t) < 0.0005) points[points.length - 1] = { t: c.t, notes: c.notes };
      else points.push({ t: c.t, notes: c.notes });
    }
  }
  return points;
}

/** Notas que suenan en `t` (segundos desde el inicio del elemento). */
export function toneNotesAt(el, t) {
  const points = toneChangePoints(el);
  let notes = points[0].notes;
  for (const p of points) {
    if (p.t <= t + 1e-6) notes = p.notes;
    else break;
  }
  return notes.map((n) => (n && typeof n === 'object' ? { ...n } : n));
}

/** Tramos efectivos de un `tone`: `{ t, end, notes }` (puede haber silencios). */
export function toneSegments(el) {
  const points = toneChangePoints(el);
  const len = Math.max(0.1, Number(el.length) || 0.1);
  const out = [];
  for (let k = 0; k < points.length; k++) {
    const start = points[k].t;
    const end = k + 1 < points.length ? points[k + 1].t : len;
    if (end > start + 1e-6) out.push({ t: start, end, notes: points[k].notes });
  }
  return out;
}

/**
 * Repite el patrón de notas de un `tone` hasta el final del tema.
 *
 * El patrón dura hasta el final de la última fila, que conserva como duración
 * el intervalo con la fila anterior. Así, si las notas están en 0, 5, 10 y 15 s
 * dentro de un elemento de 30 s, se repiten cada 5 s y no se arrastra el
 * silencio final. Si la última fila ya llega al final del elemento, el patrón
 * es el elemento entero, como antes.
 *
 * Devuelve los cambios ya expandidos y la duración final. Si no cabe una
 * vuelta completa por el límite de cambios, el elemento termina en la última
 * vuelta completa. No modifica el elemento.
 */
export function repeatToneToEnd(el, duration) {
  const ms = (x) => Math.round(x * 1000) / 1000;
  const elementLength = ms(Math.max(0.1, Number(el.length) || 0.1));
  const end = ms(Math.max(0, Number(duration) - (Number(el.start) || 0)));
  const copy = (notes) => notes.map((n) => (n && typeof n === 'object' ? { ...n } : n));
  const rows = toneChangePoints(el).map((row) => ({ t: row.t, notes: copy(row.notes) }));
  const changes = (Array.isArray(el.changes) ? el.changes : [])
    .filter((c) => c && Number.isFinite(c.t) && Array.isArray(c.notes))
    .map((c) => ({ t: c.t, notes: copy(c.notes) }));
  // La última fila dura lo mismo que el hueco anterior (o el elemento entero
  // si no hay más filas), sin arrastrar un silencio largo al repetir.
  let pattern = elementLength;
  if (rows.length > 1) {
    const last = rows[rows.length - 1];
    const gap = last.t - rows[rows.length - 2].t;
    if (gap > 0.0005) pattern = ms(Math.min(elementLength, Math.max(0.1, last.t + gap)));
  }
  const result = (ok, length, reps, full, reason = null) => ({ ok, length, changes, reps, full, reason, pattern, end, rows });
  if (end <= pattern + 0.0005) return result(false, pattern, 0, true, 'end');
  if (rows.length <= 1) return result(true, end, 0, true);
  let length = end;
  let reps = 0;
  let full = true;
  for (let r = 1; r * pattern < end - 0.0005; r++) {
    // Se cuentan solo los cambios que caben de verdad antes del final.
    const items = [];
    for (const row of rows) {
      const t = ms(r * pattern + row.t);
      if (t < end - 0.0005) items.push({ t, notes: copy(row.notes) });
    }
    if (changes.length + items.length > LIMITS.changesPerTone) {
      length = ms(r * pattern);
      full = false;
      break;
    }
    changes.push(...items);
    reps++;
  }
  return result(true, length, reps, full);
}

/** Reparte los cambios de un `tone` al dividirlo en `cut` (segundos desde su inicio). */
export function splitToneChanges(el, cut) {
  const before = (el.changes || [])
    .filter((c) => Number.isFinite(c.t) && c.t < cut - 0.0005)
    .map((c) => ({ ...c, notes: [...c.notes] }));
  const after = (el.changes || [])
    .filter((c) => Number.isFinite(c.t) && c.t > cut + 0.0005)
    .map((c) => ({ t: Math.round((c.t - cut) * 1000) / 1000, notes: [...c.notes] }));
  return { before, after, notes: toneNotesAt(el, cut) };
}

/** Recorta el principio de un `tone` conservando las notas que sonaban en `cut`. */
export function trimToneStart(el, cut) {
  const length = Math.round(Math.max(0.1, el.length - cut) * 1000) / 1000;
  const out = {
    ...el,
    start: 0,
    length,
    notes: toneNotesAt(el, cut),
    fadeIn: 0,
    fadeOut: Math.min(el.fadeOut || 0, length),
  };
  const changes = (el.changes || [])
    .filter((c) => Number.isFinite(c.t) && c.t > cut + 0.0005)
    .map((c) => ({ ...c, t: Math.round((c.t - cut) * 1000) / 1000, notes: [...c.notes] }));
  if (changes.length) out.changes = changes;
  else delete out.changes;
  return out;
}

/** Convierte un elemento puntual a otro tipo conservando inicio y duración. */
export function convertElement(track, project, el, type) {
  const fresh = createElement(track, project, el.start, type);
  fresh.id = el.id;
  if ('length' in fresh && el.length) fresh.length = el.length;
  if ('level' in fresh && Number.isFinite(el.level)) fresh.level = el.level;
  if (type === 'hit' && el.note) fresh.note = el.note;
  return fresh;
}

/* ------------------------------------------------------------ validación */

export class LabFileError extends Error {}

function clampDef(def, v, fallback) {
  if (def.type === 'number') {
    if (!Number.isFinite(v)) return { value: fallback, bad: v !== undefined };
    const c = clampNum(v, def.min, def.max);
    const r = def.step === 1 ? Math.round(c) : c;
    return { value: r, bad: r !== v };
  }
  if (def.type === 'enum') {
    const ok = def.options.some((x) => x.value === v);
    return { value: ok ? v : fallback, bad: !ok && v !== undefined };
  }
  if (def.type === 'bool') return { value: typeof v === 'boolean' ? v : fallback, bad: v !== undefined && typeof v !== 'boolean' };
  if (def.type === 'range') {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) return { value: cloneValue(fallback), bad: v !== undefined };
    const a = clampNum(Math.min(v[0], v[1]), def.min, def.max);
    const b = clampNum(Math.max(v[0], v[1]), def.min, def.max);
    return { value: [a, b], bad: a !== v[0] || b !== v[1] };
  }
  return { value: v, bad: false };
}

function validNote(n) {
  if (n && typeof n === 'object') return Number.isFinite(n.hz) && n.hz >= 8 && n.hz <= 16000;
  return noteToMidi(n) !== null;
}

/**
 * Valida un proyecto: rellena defectos, recorta valores fuera de rango y
 * conserva los campos desconocidos. Devuelve `{ project, warnings }`.
 */
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new LabFileError('El archivo no contiene un proyecto.');
  if (raw.schema === 'sen-lab/2') throw new LabFileError('Este archivo es del mezclador anterior y no se puede abrir en el editor.');
  if (raw.schema !== SCHEMA_ID) throw new LabFileError(`Esquema desconocido: ${raw.schema ?? 'sin esquema'}.`);
  const p = migrateProject(cloneValue(raw));
  const warnings = new Set();
  const bad = (msg) => warnings.add(msg);
  const base = createProject({ seed: 'sen' });

  const out = { ...base, ...p };
  out.schema = SCHEMA_ID;
  out.name = typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, 120) : base.name;
  out.notes = typeof p.notes === 'string' ? p.notes : '';
  out.seed = p.seed === undefined ? 'sen' : String(p.seed);
  out.createdAt = typeof p.createdAt === 'string' ? p.createdAt : base.createdAt;
  out.engine = typeof p.engine === 'string' ? p.engine : ENGINE_VERSION;
  if (p.scene && typeof p.scene === 'object' && Number.isInteger(p.scene.track) && p.scene.track >= 1) {
    const text = (v) => (typeof v === 'string' ? v.slice(0, 120) : '');
    const nn = String(p.scene.track).padStart(2, '0');
    out.scene = {
      ambient: text(p.scene.ambient),
      track: p.scene.track,
      name: text(p.scene.name),
      file: text(p.scene.file) || `${nn}.wav`,
    };
    if (LOUDNESS_TARGETS.includes(p.scene.lufs)) out.scene.lufs = p.scene.lufs;
    // Los proyectos de antes llamaban al tema «Ambiente · NN · título de la
    // escena». Ahora, por defecto, el tema se llama como el archivo.
    if (!out.name.trim() || /^\s*[^·]+·\s*\d{1,2}\s*·\s*\S/.test(out.name)) out.name = nn;
    if (/^Pista \d{1,2} de .+ en sen \(«.+»\)\./.test(out.notes)) {
      const ambientName = out.scene.name || out.scene.ambient;
      out.notes = `Pista ${nn} de ${ambientName} en sen. Para usarla en la app: Exportar → «Escena para sen» y sustituye assets/audio/${out.scene.ambient}/${out.scene.file} por el WAV descargado.`;
    }
  } else delete out.scene;

  const dur = Number(p.duration);
  out.duration = Number.isFinite(dur) ? clampNum(dur, LIMITS.minDuration, LIMITS.maxDuration) : 60;
  if (out.duration !== dur) bad('Duración del tema fuera de rango.');
  const mode = ['tail', 'cut', 'loop'].includes(p.end?.mode) ? p.end.mode : 'tail';
  out.end = { ...(p.end || {}), mode, fadeOut: clampNum(Number.isFinite(p.end?.fadeOut) ? p.end.fadeOut : 4, 0, 30) };
  if (mode === 'loop' && out.duration > LIMITS.maxLoop) {
    out.duration = LIMITS.maxLoop;
    bad('Un bucle no puede durar más de 10 minutos.');
  }
  out.tuning = { ...(p.tuning || {}), a4: clampNum(Number.isFinite(p.tuning?.a4) ? p.tuning.a4 : 440, 415, 466) };
  out.key = {
    ...(p.key || {}),
    root: NOTE_NAMES.includes(p.key?.root) ? p.key.root : NOTE_NAMES[rootIndex(p.key?.root || 'C')],
    scale: SCALE_LABELS[p.key?.scale] ? p.key.scale : 'mayor',
  };
  if (p.tempo && typeof p.tempo === 'object') {
    out.tempo = {
      ...p.tempo,
      bpm: clampNum(Number.isFinite(p.tempo.bpm) ? p.tempo.bpm : 60, 30, 160),
      beatsPerBar: [2, 3, 4, 6].includes(p.tempo.beatsPerBar) ? p.tempo.beatsPerBar : 4,
    };
  } else out.tempo = null;
  if (p.region && Number.isFinite(p.region.start) && Number.isFinite(p.region.end) && p.region.end - p.region.start >= 0.5) {
    const s = clampNum(p.region.start, 0, out.duration);
    out.region = { start: s, end: clampNum(p.region.end, s + 0.5, out.duration) };
  } else out.region = null;

  // Maestro
  const master = cloneValue(p.master && typeof p.master === 'object' ? p.master : {});
  for (const def of MASTER_DEFS) {
    const r = clampDef(def, getPath(master, def.key), def.def);
    if (r.bad) bad('Algunos valores del bus maestro estaban fuera de rango.');
    setPath(master, def.key, r.value);
  }
  out.master = master;

  // Exportación
  const ex = { ...EXPORT_DEFAULTS, ...(p.export || {}) };
  if (![22050, 44100, 48000].includes(ex.sampleRate)) ex.sampleRate = 48000;
  if (![16, 24, 32].includes(ex.bits)) ex.bits = 24;
  if (![1, 2].includes(ex.channels)) ex.channels = 2;
  if (![null, 'tail', 'cut', 'loop'].includes(ex.end)) ex.end = null;
  if (ex.loudness !== null && !LOUDNESS_TARGETS.includes(ex.loudness)) ex.loudness = -18;
  ex.ceiling = clampNum(Number.isFinite(ex.ceiling) ? ex.ceiling : -1, -6, -0.1);
  if (!['all', 'region'].includes(ex.range)) ex.range = 'all';
  out.export = ex;

  // Pistas
  const ids = new Set();
  const uniq = (id, prefix) => {
    let v = typeof id === 'string' && id ? id : newId(prefix);
    while (ids.has(v)) v = newId(prefix);
    ids.add(v);
    return v;
  };
  let elementCount = 0;
  out.tracks = [];
  for (const t of Array.isArray(p.tracks) ? p.tracks : []) {
    const inst = INSTRUMENTS[t?.instrument];
    if (!inst) {
      bad(`Se ha ignorado una pista con un instrumento desconocido (${t?.instrument}).`);
      continue;
    }
    if (out.tracks.length >= LIMITS.tracks) {
      bad('El tema superaba el máximo de 32 pistas.');
      break;
    }
    if (inst.family === 'layer' && !validSource(t.source)) {
      bad('Se ha ignorado una capa de pista de sen sin origen válido.');
      continue;
    }
    const track = { ...t, id: uniq(t.id, 't'), family: inst.family, name: typeof t.name === 'string' && t.name ? t.name : inst.label };
    if (inst.family === 'layer') {
      const text = (v) => (typeof v === 'string' ? v.slice(0, 120) : '');
      track.source = {
        ambient: t.source.ambient, track: t.source.track, layer: t.source.layer,
        name: text(t.source.name), file: text(t.source.file), ambientName: text(t.source.ambientName),
      };
    }
    track.color = /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : inst.color;
    const params = { ...(t.params || {}) };
    for (const def of paramDefs(t.instrument)) {
      const r = clampDef(def, params[def.key], def.def);
      if (r.bad) bad('Algunos parámetros de timbre estaban fuera de rango.');
      params[def.key] = r.value;
    }
    track.params = params;
    const mix = { ...(t.mix || {}) };
    for (const def of MIX_DEFS) {
      const r = clampDef(def, mix[def.key], def.def);
      if (r.bad) bad('Algunos valores de mezcla estaban fuera de rango.');
      mix[def.key] = r.value;
    }
    track.mix = mix;
    if (t.automation && typeof t.automation === 'object') {
      const auto = {};
      for (const def of AUTOMATION_DEFS) {
        const pts = t.automation[def.key];
        if (!Array.isArray(pts)) continue;
        const clean = pts
          .filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]))
          .map(([tt, v]) => [clampNum(tt, 0, out.duration), clampNum(v, def.min, def.max)])
          .sort((a, b) => a[0] - b[0])
          .slice(0, 512);
        if (clean.length) auto[def.key] = clean;
      }
      track.automation = auto;
    } else delete track.automation;
    track.elements = [];
    const family = FAMILIES.find((f) => f.id === inst.family);
    for (const e of Array.isArray(t.elements) ? t.elements : []) {
      if (!e || !family.types.includes(e.type)) {
        bad('Se han ignorado elementos de un tipo que no corresponde a su pista.');
        continue;
      }
      if (elementCount >= LIMITS.elements) {
        bad('El tema superaba el máximo de 500 elementos.');
        break;
      }
      track.elements.push(normalizeElement(e, track, out, uniq, bad));
      elementCount++;
    }
    out.tracks.push(track);
  }
  return { project: out, warnings: [...warnings] };
}

function normalizeElement(e, track, project, uniq, bad) {
  const el = { ...e, id: uniq(e.id, 'e') };
  const fix = (key, lo, hi, def) => {
    const v = Number(el[key]);
    const r = Number.isFinite(v) ? clampNum(v, lo, hi) : def;
    if (el[key] !== undefined && r !== v) bad('Algunos elementos tenían valores fuera de rango.');
    el[key] = r;
  };
  fix('start', 0, Math.max(0, project.duration - 0.01), 0);
  fix('level', -40, 6, 0);
  if (el.type !== 'hit') {
    fix('length', 0.1, LIMITS.maxDuration, 30);
    fix('fadeIn', 0, el.length, 0);
    fix('fadeOut', 0, el.length - el.fadeIn, 0);
    if (!(typeof el.curve === 'string' || Array.isArray(el.curve))) el.curve = 'plana';
  }
  if ('seed' in el || el.type === 'cloud' || el.type === 'span' || el.type === 'tone') fix('seed', 1, 999999, 1);
  if (el.type === 'tone') {
    const hasNotes = Array.isArray(el.notes);
    const notes = (hasNotes ? el.notes : []).filter(validNote).slice(0, LIMITS.notesPerTone);
    if (notes.length !== (hasNotes ? el.notes : []).length) bad('Se han descartado notas no válidas.');
    el.notes = hasNotes ? notes : [keyNote(project.key, 3, 0)];
    const rawChanges = Array.isArray(el.changes) ? el.changes : [];
    const clean = [];
    for (const c of rawChanges) {
      if (!c || !Number.isFinite(c.t) || !Array.isArray(c.notes)) continue;
      const t = Math.round(clampNum(c.t, 0, el.length) * 1000) / 1000;
      if (t >= el.length - 0.0005) continue;
      const list = c.notes.filter(validNote).slice(0, LIMITS.notesPerTone);
      if (list.length !== c.notes.length) bad('Se han descartado notas no válidas en un cambio.');
      clean.push({ t, notes: list });
    }
    clean.sort((a, b) => a.t - b.t);
    const changes = [];
    for (const c of clean) {
      const last = changes[changes.length - 1];
      if (last && Math.abs(last.t - c.t) < 0.0005) changes[changes.length - 1] = c;
      else changes.push(c);
    }
    if (changes.length > LIMITS.changesPerTone) bad(`Se han conservado los primeros ${LIMITS.changesPerTone} cambios de nota.`);
    // Un cambio en 0 es la nota base: se funde para no duplicar la primera fila.
    if (changes.length && changes[0].t <= 0.0005) el.notes = changes.shift().notes;
    if (changes.length) el.changes = changes.slice(0, LIMITS.changesPerTone);
    else delete el.changes;
    fix('crossfade', 0, 2, 0.15);
  }
  if (el.type === 'hit') {
    if (!validNote(el.note)) el.note = keyNote(project.key, 4, 0);
    fix('velocity', 0, 1, 0.7);
  }
  if (el.type === 'phrase') {
    fix('pattern', 0.25, 60, 4);
    el.events = (Array.isArray(el.events) ? el.events : [])
      .filter((ev) => ev && validNote(ev.note) && Number.isFinite(ev.t))
      .map((ev) => ({ ...ev, t: clampNum(ev.t, 0, el.pattern), v: clampNum(Number.isFinite(ev.v) ? ev.v : 0.6, 0, 1) }))
      .slice(0, 256);
  }
  if (el.type === 'cloud') {
    // Proyectos anteriores no tienen `mode`: si traen `pitches` (propias o
    // nulas) eran nubes generativas; si no lo traen, son listas de notas.
    el.mode = el.mode === 'random' || el.mode === 'mine'
      ? el.mode
      : (el.pitches === undefined || Array.isArray(el.events) ? 'mine' : 'random');
    fix('density', 1, 120, 8);
    for (const k of ['timing', 'motion', 'gravity', 'chord']) fix(k, 0, 1, 0.5);
    const r = Array.isArray(el.range) && el.range.length === 2 && el.range.every(validNote) ? el.range : [keyNote(project.key, 4, 0), keyNote(project.key, 6, 0)];
    el.range = r;
    el.pitches = Array.isArray(el.pitches) ? el.pitches.filter(validNote).slice(0, LIMITS.cloudPitches) : null;
    if (el.pitches && !el.pitches.length) el.pitches = null;
    const v = Array.isArray(el.velocity) && el.velocity.length === 2 && el.velocity.every(Number.isFinite) ? el.velocity : [0.35, 0.8];
    el.velocity = [clampNum(Math.min(v[0], v[1]), 0, 1), clampNum(Math.max(v[0], v[1]), 0, 1)];
    if (el.mode === 'mine') {
      const raw = Array.isArray(el.events) ? el.events : [];
      const events = [];
      for (const ev of raw) {
        if (!ev || !validNote(ev.note) || !Number.isFinite(ev.t)) continue;
        if (ev.t >= el.length - 0.0005) continue;
        const t = Math.round(clampNum(ev.t, 0, el.length) * 1000) / 1000;
        events.push({ t, note: ev.note, v: clampNum(Number.isFinite(ev.v) ? ev.v : 0.7, 0, 1) });
      }
      events.sort((a, b) => a.t - b.t);
      if (events.length > LIMITS.cloudEvents) bad(`Se han conservado las primeras ${LIMITS.cloudEvents} notas de una nube.`);
      el.events = events.slice(0, LIMITS.cloudEvents);
    }
  }
  if (el.type === 'span') fix('density', 0, 1, 0.6);
  if (el.type === 'clip') fix('offset', 0, 3600, 0);
  return el;
}

/** Migración de versiones anteriores del esquema `sen-lab/3`. */
export function migrateProject(p) {
  return p;
}

/** Proyecto canónico: sin fechas y con las claves ordenadas. */
export function canonicalProject(project) {
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        if (k === 'createdAt' || k === 'savedAt') continue;
        out[k] = strip(v[k]);
      }
      return out;
    }
    return v;
  };
  return strip(project);
}

/** Recuento para comprobar límites. */
export function projectCounts(project) {
  let elements = 0;
  for (const t of project.tracks) elements += t.elements.length;
  return { tracks: project.tracks.length, elements };
}
