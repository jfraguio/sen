/**
 * Descubre las escenas WAV disponibles en una carpeta.
 *
 * El repositorio conserva seis escenas por ambiente, de `01.wav` (la que
 * suena por defecto) a `06.wav`, y Bichos añade una séptima. El usuario puede
 * borrar cualquiera sin tocar código; comprobamos con HEAD cada vez que se
 * inicia una escucha para usar solo las que sigan existiendo.
 */

const VARIANTS = ['01.wav', '02.wav', '03.wav', '04.wav', '05.wav', '06.wav', '07.wav'];
/** Raíz del sitio, para que las rutas no dependan de la página que carga la app. */
const SITE_ROOT = new URL('../../', import.meta.url);

export function resolveAudioVariants(directory, prefix = '') {
  return Promise.all(
    VARIANTS.map(async (name) => {
      const path = new URL(`${prefix}${directory}/${name}`, SITE_ROOT).href;
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
