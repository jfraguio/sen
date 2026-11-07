/**
 * Álbum del laboratorio: un documento con nombre y uno o más temas.
 *
 * Cada tema es un proyecto `sen-lab/3` normal. El álbum solo añade el nombre,
 * el orden de los temas y cuál está abierto. Se guarda aparte del proyecto
 * para que el motor siga recibiendo exactamente lo que espera.
 */

import { LabFileError, createProject, normalizeProject } from '../engine/schema.js';

export const ALBUM_SCHEMA = 'sen-lab/album/1';

const NAME_MAX = 120;

function text(value, fallback = '') {
  return typeof value === 'string' ? value.slice(0, NAME_MAX) : fallback;
}

/** Proyecto vacío con un nombre reconocible dentro del álbum. */
export function createAlbumTheme(name = 'Tema 1') {
  return createProject({ name, seed: 'vacio' });
}

export function createAlbum(over = {}) {
  const { themes, ...rest } = over;
  return {
    name: 'Álbum sin título',
    createdAt: new Date().toISOString(),
    savedAt: null,
    current: 0,
    ...rest,
    schema: ALBUM_SCHEMA,
    themes: Array.isArray(themes) && themes.length ? themes : [createAlbumTheme()],
  };
}

/** Un tema suelto (de un `.sen.json` o de un WAV) como álbum de un tema. */
export function albumFromProject(project, name = 'Álbum sin título') {
  return createAlbum({ name, themes: [project] });
}

export function isAlbum(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) && raw.schema === ALBUM_SCHEMA;
}

/**
 * Valida un álbum y normaliza cada uno de sus temas. Si un tema está dañado se
 * ignora y se avisa; un álbum nunca se queda sin ninguno.
 */
export function normalizeAlbum(raw) {
  if (!isAlbum(raw)) throw new LabFileError('El archivo no contiene un álbum del laboratorio.');
  const warnings = new Set();
  const themes = [];
  const list = Array.isArray(raw.themes) ? raw.themes : [];
  list.forEach((theme, index) => {
    try {
      const result = normalizeProject(theme);
      themes.push(result.project);
      for (const warning of result.warnings) warnings.add(`Tema ${index + 1}: ${warning}`);
    } catch (err) {
      warnings.add(`Se ha ignorado el tema ${index + 1}: ${err.message}`);
    }
  });
  if (!themes.length) {
    themes.push(createAlbumTheme());
    warnings.add('El álbum no contenía temas válidos; se ha creado uno vacío.');
  }

  const current = Number.isInteger(raw.current)
    ? Math.min(Math.max(0, raw.current), themes.length - 1)
    : 0;

  return {
    album: {
      ...raw,
      schema: ALBUM_SCHEMA,
      name: text(raw.name).trim() || 'Álbum sin título',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : null,
      current,
      themes,
    },
    warnings: [...warnings],
  };
}
