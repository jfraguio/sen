/**
 * Descubre las variantes WAV disponibles en una carpeta.
 *
 * Las alternativas se llaman 01.wav … 06.wav (01–03: síntesis base; 04–06:
 * paisajes de alta calidad). El usuario puede
 * borrar las que no le gusten: comprobamos con HEAD cada vez que se va a
 * iniciar una escucha para usar solo las que sigan existiendo.
 */

const VARIANTS = ['01.wav', '02.wav', '03.wav', '04.wav', '05.wav', '06.wav'];

export function resolveAudioVariants(directory, prefix = '') {
  return Promise.all(
    VARIANTS.map(async (name) => {
      const path = `${prefix}${directory}/${name}`;
      try {
        const response = await fetch(path, {
          method: 'HEAD',
          cache: 'no-store',
        });
        return response.ok ? path : null;
      } catch {
        return null;
      }
    }),
  ).then((paths) => paths.filter(Boolean));
}

export function pickAudioVariant(paths) {
  if (!paths.length) return null;
  return paths[Math.floor(Math.random() * paths.length)];
}
