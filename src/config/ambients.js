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
  controlsHideMs: 4000, // ocultación automática de los controles
  audioVolume: 0.9,
  audioFadeInMs: 1400,
};

/**
 * Cada ambiente:
 *   id         identificador estable (también se usa en el hash de la URL)
 *   name       nombre visible
 *   hint       descripción breve para el menú
 *   icon       rutas SVG (viewBox 0 0 24 24)
 *   audio      ruta local al archivo de audio en bucle
 *   animation  clave de la animación en src/render/themes.js
 *   accent     color de acento para el botón y los controles
 *   palette    colores concretos que usa la animación
 */
export const ambients = [
  {
    id: 'lluvia',
    name: 'Lluvia',
    hint: 'agua y ventana',
    icon: [
      'M7 15h9.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.3 9.2 3.4 3.4 0 0 0 7 15Z',
      'M8.5 18.5l-.7 2.2M12 18.5l-.7 2.2M15.5 18.5l-.7 2.2',
    ],
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
    icon: [
      'M7 14.5h9.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.3 8.7 3.4 3.4 0 0 0 7 14.5Z',
      'M12.8 16l-2.6 3.6h3L12 23',
    ],
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
    icon: [
      'M12 3.2c2.6 3.4 5 5.5 5 9.1a5 5 0 0 1-10 0c0-2 .9-3.6 2.4-5.2.2 1.7 1 2.8 2.1 3.3.1-2.7.3-4.7.5-7.2Z',
    ],
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
    icon: [
      'M2.5 9.5c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 4 0',
      'M2.5 15c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 4 0',
    ],
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
    icon: [
      'M10 3c0 5 6 5 6 9s-6 4-6 9',
      'M17.5 5.5l.01 0',
      'M6.5 18.5l.01 0',
    ],
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
    icon: [
      'M3 8.5h9.5a2.8 2.8 0 1 0-2.8-2.8',
      'M3 12.5h13.5a2.8 2.8 0 1 1-2.8 2.8',
      'M3 16.5h6',
    ],
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
    icon: [
      'M15.6 4.2a7.6 7.6 0 1 0 4.2 10.9 6.6 6.6 0 0 1-4.2-10.9Z',
      'M6 4.5v2.6M4.7 5.8h2.6',
      'M18.6 15.4v2.4M17.4 16.6h2.4',
    ],
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
    icon: [
      'M12 6.6C10 4.9 7.5 4.6 4.4 4.9v13.4c3.1-.3 5.6 0 7.6 1.7 2-1.7 4.5-2 7.6-1.7V4.9c-3.1-.3-5.6 0-7.6 1.7Z',
      'M12 6.6v13.4',
      'M17.5 2.8v2.4M16.3 4h2.4',
    ],
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
    icon: [
      'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z',
      'M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z',
      'M12 12h.01',
    ],
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
    icon: [
      'M6.5 14.8c1.8-4 4.2-6 7.2-6 2.4 0 4 1.5 4 3.4 0 2.9-3.4 5.5-7.2 5.5-1.6 0-3-.3-4-1.1v-1.8Z',
      'M17.7 9.9l2.8-1.2-2 2.6',
      'M14.6 10.8h.01',
      'M9.4 17.7v2.1M13 17.7v2.1',
      'M7.5 13.6 4.8 12l1.2 3.2',
    ],
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
    icon: [
      'M12 8.2a5 5 0 0 1 5 5v1.6a4.2 4.2 0 0 1-4.2 4.2h-1.6A4.2 4.2 0 0 1 7 14.8v-1.6a5 5 0 0 1 5-5Z',
      'M12 8.2v10.8',
      'M9.6 8.1C8.6 6 7.5 5.4 6.2 5.5M14.4 8.1c1-2.1 2.1-2.7 3.4-2.6',
      'M7 12H4M7 16.5H4M17 12h3M17 16.5h3',
      'M9.7 10.7h.01M14.3 10.7h.01',
    ],
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
    icon: [
      'M12 3l6 9h-4l3.5 5h-11L10 12H6l6-9Z',
      'M12 17v4',
      'M3 21c3-1.5 5.5-1.5 9 0 3.5-1.5 6-1.5 9 0',
    ],
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
    icon: [
      'M15.8 4.4a6.4 6.4 0 1 0 4 10.6 7.2 7.2 0 0 1-4-10.6Z',
      'M17.5 4v2M16.5 5h2',
      'M3 20c3-4 5.5-4 8.5 0 2.5-3 5-3 7.5 0',
    ],
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
];

/** Utilidades de color compartidas por la UI. */
export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
