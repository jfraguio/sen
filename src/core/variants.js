/**
 * Descubre las escenas WAV disponibles en una carpeta.
 *
 * El repositorio conserva seis escenas por ambiente, de `01.wav` (la que
 * suena por defecto) a `06.wav`: bucles de 60 s de paisaje con una melodía
 * baja. El usuario puede borrar cualquiera sin tocar código; comprobamos con
 * HEAD cada vez que se inicia una escucha para usar solo las que sigan
 * existiendo.
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
