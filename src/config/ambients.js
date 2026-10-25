/**
 * sen · configuración central
 * --------------------------
 * Todo lo que define la app vive aquí (o se referencia desde aquí).
 *
 * Para añadir un ambiente:
 *   1. Añade un objeto a `ambients` con un `id` único.
 *   2. Elige una animación existente (`animation`) o crea una nueva en
 *      `src/render/themes.js` y regístrala en `THEMES`.
 *   3. Deja el audio en `assets/audio/<archivo>`.
 *
 * Los iconos son rutas SVG de 24×24 (solo trazo, sin relleno), de modo que
 * se pueden retocar directamente aquí.
 */

/** Ajustes globales de la sesión. */
export const APP = {
  durationMs: 10 * 60 * 1000, // duración exacta: 10 minutos
  fadeOutMs: 30 * 1000, // fundido de audio y luz en los últimos 30 s
  holdAfterEndMs: 4000, // pantalla casi negra antes de volver a la cuadrícula
  manualFadeMs: 2000, // fundido al terminar a mano
  audioVolume: 0.9,
  audioFadeInMs: 1400,
};

/**
 * Cada ambiente:
 *   id         identificador estable (también se usa en el hash de la URL)
 *   name       nombre visible
 *   hint       descripción breve para el menú
 *   icon       clave del icono en src/config/icons.js
 *   audio      ruta local al archivo de audio en bucle
 *   animation  clave de la animación en src/render/themes.js
 *   accent     color de acento del nodo y del progreso
 *   palette    colores concretos que usa la animación
 */
export const ambients = [
  {
    id: 'lluvia',
    name: 'Lluvia',
    hint: 'agua y ventana',
    icon: 'lluvia',
    audio: 'assets/audio/lluvia.wav',
    animation: 'rain',
    accent: '#8fbdff',
    palette: {
      sky: ['#01040c', '#08203a', '#010308'],
      accent: '#a9d1ff',
      deep: '#2b5c94',
    },
  },
  {
    id: 'tormenta',
    name: 'Tormenta',
    hint: 'truenos y viento',
    icon: 'tormenta',
    audio: 'assets/audio/tormenta.wav',
    animation: 'storm',
    accent: '#a99bff',
    palette: {
      sky: ['#07040e', '#2a1d42', '#04020a'],
      cloud: '#7c68b8',
      rain: '#8f9fd8',
      bolt: '#e9edff',
    },
  },
  {
    id: 'fuego',
    name: 'Fuego',
    hint: 'brasas y calor',
    icon: 'fuego',
    audio: 'assets/audio/fuego.wav',
    animation: 'fire',
    accent: '#ffa45c',
    palette: {
      sky: ['#0b0200', '#240700', '#040100'],
      flame: ['#ffe9a3', '#ffb347', '#ff6a1f', '#c92a08'],
    },
  },
  {
    id: 'mar',
    name: 'Mar',
    hint: 'olas y espuma',
    icon: 'mar',
    audio: 'assets/audio/mar.wav',
    animation: 'sea',
    accent: '#5cebd5',
    palette: {
      sea: ['#001014', '#013742', '#001013'],
      foam: '#b6fff2',
      light: '#22d9c0',
      deep: '#01485a',
    },
  },
  {
    id: 'rio',
    name: 'Río',
    hint: 'corriente y piedras',
    icon: 'rio',
    audio: 'assets/audio/rio.wav',
    animation: 'river',
    accent: '#79e8b7',
    palette: {
      forest: ['#020f0b', '#073328', '#010a07'],
      water: '#6ff0c0',
      gold: '#ffd98a',
      deep: '#0c6b57',
    },
  },
  {
    id: 'viento',
    name: 'Viento',
    hint: 'ráfagas y hojas',
    icon: 'viento',
    audio: 'assets/audio/viento.wav',
    animation: 'wind',
    accent: '#b7d8d3',
    palette: {
      air: ['#080e13', '#1d2c35', '#05090c'],
      gust: '#c3e2d8',
      haze: '#7e9dac',
      pale: '#dfeee6',
    },
  },
  {
    id: 'espacio',
    name: 'Espacio',
    hint: 'deriva y estrellas',
    icon: 'espacio',
    audio: 'assets/audio/espacio.wav',
    animation: 'space',
    accent: '#a48bff',
    palette: {
      void: ['#010107', '#0a0922', '#010005'],
      nebula: ['#6f4cff', '#3b6dff', '#d9d1ff'],
      star: '#f3f1ff',
    },
  },
  {
    id: 'cuento',
    name: 'Cuento',
    hint: 'imaginar',
    icon: 'cuento',
    audio: 'assets/audio/cuento.wav',
    animation: 'story',
    accent: '#ffd08a',
    palette: {
      dream: ['#0d0612', '#2c1329', '#060208'],
      warm: ['#ffd08a', '#ffab68', '#c99dff'],
    },
  },
  {
    id: 'meditacion',
    name: 'Meditación',
    hint: 'respirar',
    icon: 'meditacion',
    audio: 'assets/audio/meditacion.wav',
    animation: 'meditation',
    accent: '#9dded8',
    palette: {
      deep: ['#030a10', '#0b242c', '#020609'],
      breath: ['#a8e6dd', '#7fb4d4', '#c9c1ff'],
    },
  },
  {
    id: 'pajaros',
    name: 'Pájaros',
    hint: 'amanecer',
    icon: 'pajaros',
    audio: 'assets/audio/pajaros.wav',
    animation: 'birds',
    accent: '#e6d891',
    palette: {
      sky: ['#06131a', '#173b36', '#4a2c16'],
      sun: '#ffd98a',
      bird: '#07100e',
      leaf: '#a9d69b',
    },
  },
  {
    id: 'bichos',
    name: 'Bichos',
    hint: 'grillos y luciérnagas',
    icon: 'bichos',
    audio: 'assets/audio/bichos.wav',
    animation: 'bugs',
    accent: '#d7e08f',
    palette: {
      meadow: ['#041009', '#0f2a17', '#020705'],
      glow: '#ffe28a',
      grass: '#7fbf7a',
      pale: '#d7e08f',
    },
  },
  {
    id: 'bosque',
    name: 'Bosque',
    hint: 'hojarasca',
    icon: 'bosque',
    audio: 'assets/audio/bosque.wav',
    animation: 'forest',
    accent: '#9ed6a0',
    palette: {
      forest: ['#030c08', '#0d2619', '#020604'],
      light: '#d8f1b0',
      bark: '#02110b',
      leaf: '#67a86a',
    },
  },
  {
    id: 'noche',
    name: 'Noche',
    hint: 'luna y luciérnagas',
    icon: 'noche',
    audio: 'assets/audio/noche.wav',
    animation: 'night',
    accent: '#9fb2d9',
    palette: {
      sky: ['#02050e', '#0a1730', '#01030a'],
      moon: '#e6ecff',
      hill: '#010307',
      firefly: '#ffdf9a',
    },
  },
  {
    id: 'burbujas',
    name: 'Burbujas',
    hint: 'baño de espuma',
    icon: 'burbujas',
    audio: 'assets/audio/burbujas.wav',
    animation: 'bubbles',
    accent: '#8fe9e3',
    palette: {
      water: ['#031218', '#06363f', '#02080c'],
      bubble: ['#c7fbff', '#7fe8e0', '#ffd6f5'],
      light: '#eaffff',
    },
  },
];

/** Utilidades de color compartidas por la UI. */
export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
