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
];

/** Utilidades de color compartidas por la UI. */
export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
