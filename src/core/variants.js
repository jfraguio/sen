/**
 * Descubre las escenas WAV disponibles en una carpeta.
 *
 * El repositorio conserva dos escenas por ambiente: `01.wav` (la que suena por
 * defecto) y `02.wav`. El usuario puede borrar la segunda sin tocar código;
 * comprobamos con HEAD cada vez que se inicia una escucha para usar solo las
 * que sigan existiendo.
 */

const VARIANTS = ['01.wav', '02.wav'];

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
