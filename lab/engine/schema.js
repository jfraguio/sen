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
  cloud: { label: 'Nube generativa' },
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
  // Puntuales
  decay: num('Decaimiento', 0.2, 30, 5, { log: true, unit: 's' }),
  brightness: num('Brillo', 0, 1, 0.5, { step: 0.01 }),
  hardness: num('Dureza del golpe', 0, 1, 0.4, { step: 0.01 }),
  velocityCurve: num('Curva de velocidad', 0, 1, 0.5, { step: 0.01 }),
  fmRatio: num('Relación FM', 0.25, 12, 2, { step: 0.01, log: true }),
  fmIndex: num('Profundidad FM', 0, 12, 3, { step: 0.01 }),
  fmTime: num('Caída FM', 0.02, 10, 1.2, { log: true, unit: 's' }),
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
const NATURE_COMMON = ['distance', 'pan', 'spread', 'variation'];

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
  brass80: {
    family: 'sustain', label: 'Metales 80', color: '#ffc966',
    description: 'Metales sintéticos con sierra desafinada y una apertura de filtro rápida al atacar.',
    params: ANALOG_COMMON,
    defaults: {
      partials: 32, rolloff: 1, voices: 3, detune: 7, drift: 2, cutoff: 1600, q: 0.7,
      sweepDepth: 0.1, sweepRate: 0.05, width: 0.6, wave: 'sierra', pulseWidth: 0.5,
      filterEnv: 2.4, filterTime: 0.22, sub: 0,
    },
  },
  bass80: {
    family: 'sustain', label: 'Bajo 80', color: '#b18cff',
    description: 'Bajo analógico con pulso, subgrave y filtro resonante que cae rápido.',
    params: ANALOG_COMMON,
    defaults: {
      partials: 24, rolloff: 1, voices: 2, detune: 4, drift: 1, cutoff: 700, q: 1.1,
      sweepDepth: 0, sweepRate: 0.05, width: 0.1, wave: 'pulso', pulseWidth: 0.5,
      filterEnv: 2.8, filterTime: 0.14, sub: 0.55,
    },
  },
  lead80: {
    family: 'sustain', label: 'Lead 80', color: '#ff9ad5',
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
    family: 'strike', label: 'Cuenco', color: '#e6d891',
    description: 'Modal inarmónico con pares de modos que baten.',
    params: STRIKE_COMMON, defaults: { decay: 14, brightness: 0.35, hardness: 0.25, inharmonic: 0.1, beat: 0.9 },
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
    description: 'Cuerda de nailon pulsada cerca del puente: cálida y corta.',
    params: STRIKE_COMMON, defaults: { decay: 4.5, brightness: 0.4, hardness: 0.3, inharmonic: 0.05, beat: 0 },
  },
  pulsada: {
    family: 'strike', label: 'Cuerda pulsada', color: '#c6b2ff',
    description: 'Karplus-Strong, entre arpa y guitarra suave.',
    params: STRIKE_COMMON.filter((k) => k !== 'inharmonic' && k !== 'beat'),
    defaults: { decay: 3.5, brightness: 0.45, hardness: 0.4 },
  },
  gotaTonal: {
    family: 'strike', label: 'Gota tonal', color: '#8fbdff',
    description: 'Burbuja de Minnaert afinada (el tono sube al final).',
    params: ['decay', 'brightness', 'velocityCurve', 'width'],
    defaults: { decay: 0.6, brightness: 0.5 },
  },
  fmPiano: {
    family: 'strike', label: 'Piano FM', color: '#8fb7ff',
    description: 'Piano eléctrico de FM: campana metálica y cuerpo cálido, al estilo de los ochenta.',
    params: FM_COMMON,
    defaults: { decay: 7.5, brightness: 0.55, hardness: 0.25, fmRatio: 1, fmIndex: 2.2, fmTime: 1.4 },
  },
  fmBell: {
    family: 'strike', label: 'Campana FM', color: '#d8e0ff',
    description: 'Campana digital de FM con parciales metálicos y cola larga.',
    params: FM_COMMON,
    defaults: { decay: 13, brightness: 0.6, hardness: 0.3, fmRatio: 3.5, fmIndex: 4.8, fmTime: 2.8 },
  },
  // Ruidos
  ruido: {
    family: 'noise', label: 'Ruido', color: '#b7d8d3',
    description: 'Ruido de color filtrado, con ráfagas u oleaje.',
    params: ['color', 'filterType', 'cutoff', 'q', 'movement', 'moveRate', 'moveDepth', 'moveTarget', 'wavePeriod', 'waveShape', 'stereo'],
    defaults: { cutoff: 1400 },
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
          ['pinzon', 'Pinzón'], ['cuco', 'Cuco'], ['tortola', 'Tórtola'], ['autillo', 'Autillo'], ['carabo', 'Cárabo']]),
        def: 'mirlo',
      }],
      ['individuals', { max: 8, def: 2 }], 'songRate', 'register', 'syllables', 'shape', ...NATURE_COMMON,
    ],
    defaults: { distance: 0.35 },
  },
  rana: {
    family: 'nature', label: 'Ranas', color: '#9ed6a0',
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
    family: 'nature', label: 'Viento', color: '#b7d8d3',
    description: 'Ráfagas con aullido afinado y hojas.',
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
      { id: 'sintes', label: 'Sintes', instruments: ['pad', 'pad80', 'brass80', 'bass80', 'lead80'] },
      { id: 'drone', label: 'Drone', instruments: ['drone'] },
      { id: 'cuerdas', label: 'Cuerdas', instruments: ['cuerdas'] },
      { id: 'vientos', label: 'Vientos', instruments: ['flauta'] },
      { id: 'voces', label: 'Voces', instruments: ['coro'] },
      { id: 'cristal', label: 'Cristal y puro', instruments: ['vidrio', 'seno'] },
    ],
  },
  {
    id: 'puntuales', label: 'Puntuales',
    subgroups: [
      { id: 'teclados', label: 'Teclados', instruments: ['piano', 'fmPiano', 'celesta', 'cajaMusica'] },
      { id: 'laminas', label: 'Láminas', instruments: ['marimba', 'vibrafono', 'kalimba'] },
      { id: 'pulsadas', label: 'Cuerdas pulsadas', instruments: ['arpa', 'guitarra', 'pulsada'] },
      { id: 'campanas', label: 'Campanas y cuencos', instruments: ['campana', 'fmBell', 'cuenco'] },
      { id: 'gotas', label: 'Gotas', instruments: ['gotaTonal'] },
    ],
  },
  {
    id: 'texturas', label: 'Texturas',
    subgroups: [
      { id: 'ruido', label: 'Ruido', instruments: ['ruido'] },
    ],
  },
  {
    id: 'naturaleza', label: 'Naturaleza',
    subgroups: [
      { id: 'agua', label: 'Agua', instruments: ['gotas', 'lluvia', 'arroyo', 'olas'] },
      { id: 'aire', label: 'Aire', instruments: ['viento', 'campanillas'] },
      { id: 'animales', label: 'Animales', instruments: ['grillo', 'cigarra', 'pajaro', 'rana'] },
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

export const CURVE_PRESETS = o([['plana', 'Plana'], ['crece', 'Crece'], ['decrece', 'Decrece'], ['respira', 'Respira'], ['olas', 'Olas']]);

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
    const n = Math.max(1, Math.min(12, Number(name.split(':')[1]) || 3));
    const pts = [];
    for (let k = 0; k <= 2 * n; k++) pts.push([k / (2 * n), k % 2 ? 1 : 0.25]);
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
    duration: 180,
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
  const duration = Math.round(clampNum(info.duration, LIMITS.minDuration, LIMITS.maxLoop) * 1000) / 1000;
  const lufs = LOUDNESS_TARGETS.includes(info.lufs) ? info.lufs : -23;
  const p = createProject({
    name: `${info.name} · ${nn} · ${info.title}`,
    notes: `Pista ${nn} de ${info.name} en sen («${info.title}»). Para usarla en la app: Exportar → «Escena para sen» y sustituye assets/audio/${info.ambient}/${nn}.wav por el WAV descargado.`,
    seed: `sen-${info.ambient}-${nn}`,
    duration,
    end: { mode: 'loop', fadeOut: 4 },
    export: { ...EXPORT_DEFAULTS, ...EXPORT_PRESETS.escena, loudness: lufs, range: 'all' },
    scene: { ambient: info.ambient, track: info.track, lufs },
  });
  delete p.export.label;
  p.master.eq = { on: false, lowCut: 20, highCut: 20000, tilt: 0 };
  p.tracks = info.layers.map((layerName, k) => {
    const t = createTrack('capa', p);
    t.id = `capa${k + 1}`;
    t.name = layerName;
    t.color = LAYER_COLORS[k % LAYER_COLORS.length];
    t.source = { ambient: info.ambient, track: info.track, layer: k, name: layerName, title: `${info.name} · ${nn} · ${info.title}` };
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
};

/** Elemento por defecto para una pista. `type` es opcional. */
export function createElement(track, project, start = 0, type = null) {
  const family = FAMILIES.find((f) => f.id === track.family);
  const t = type && family.types.includes(type) ? type : family.types[family.id === 'strike' ? 2 : 0];
  const key = project?.key || { root: 'C', scale: 'mayor' };
  const duration = project?.duration || 180;
  const base = { id: newId('e'), type: t, start: Math.max(0, Math.round(start * 1000) / 1000) };
  const len = Math.max(1, Math.min(30, duration - base.start || 30));
  if (t === 'tone') {
    const chord = SUSTAIN_CHORDS[track.instrument] || [[3, 0]];
    const shape = INSTRUMENTS[track.instrument]?.tone;
    if (shape) {
      const l = Math.min(shape.length, Math.max(0.1, duration - base.start));
      return { ...base, length: l, level: 0, fadeIn: Math.min(shape.fadeIn, l / 2), fadeOut: Math.min(shape.fadeOut, l / 2), notes: chord.map(([oc, d]) => keyNote(key, oc, d)), curve: 'plana', seed: 1 };
    }
    return { ...base, length: len, level: 0, fadeIn: Math.min(4, len / 3), fadeOut: Math.min(6, len / 3), notes: chord.map(([oc, d]) => keyNote(key, oc, d)), curve: 'plana', seed: 1 };
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
    return {
      ...base, length: len, level: 0, fadeIn: 0, fadeOut: Math.min(4, len / 4), density: 8,
      range: [keyNote(key, 4, 0), keyNote(key, 6, 0)], pitches: null, timing: 0.6, motion: 0.5, gravity: 0.4,
      chord: 0.1, velocity: [0.35, 0.8], seed: 1, curve: 'plana',
    };
  }
  return { ...base, length: len, level: 0, fadeIn: Math.min(3, len / 4), fadeOut: Math.min(3, len / 4), density: 0.6, seed: 1, curve: 'plana' };
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

  const dur = Number(p.duration);
  out.duration = Number.isFinite(dur) ? clampNum(dur, LIMITS.minDuration, LIMITS.maxDuration) : 180;
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
      track.source = { ambient: t.source.ambient, track: t.source.track, layer: t.source.layer, name: text(t.source.name), title: text(t.source.title) };
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
    const notes = (Array.isArray(el.notes) ? el.notes : []).filter(validNote).slice(0, LIMITS.notesPerTone);
    if (notes.length !== (el.notes || []).length) bad('Se han descartado notas no válidas.');
    el.notes = notes.length ? notes : [keyNote(project.key, 3, 0)];
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
    fix('density', 1, 120, 8);
    for (const k of ['timing', 'motion', 'gravity', 'chord']) fix(k, 0, 1, 0.5);
    const r = Array.isArray(el.range) && el.range.length === 2 && el.range.every(validNote) ? el.range : [keyNote(project.key, 4, 0), keyNote(project.key, 6, 0)];
    el.range = r;
    el.pitches = Array.isArray(el.pitches) ? el.pitches.filter(validNote).slice(0, 24) : null;
    if (el.pitches && !el.pitches.length) el.pitches = null;
    const v = Array.isArray(el.velocity) && el.velocity.length === 2 && el.velocity.every(Number.isFinite) ? el.velocity : [0.35, 0.8];
    el.velocity = [clampNum(Math.min(v[0], v[1]), 0, 1), clampNum(Math.max(v[0], v[1]), 0, 1)];
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
