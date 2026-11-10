/**
 * Persistencia local y archivos: autoguardado del álbum en `localStorage`,
 * abrir `.sen-album.json`, `.sen.json` o WAV con chunk `senp`, y descargas.
 */

import { LabFileError, normalizeProject } from '../engine/schema.js';
import { readSenpProject } from '../engine/wav.js';
import { albumFromProject, isAlbum, normalizeAlbum } from './album.js';
import { fileBase } from './util.js';

const KEY = 'sen-lab/album';
const LEGACY_KEY = 'sen-lab/current';
const META = 'sen-lab/meta';

export function loadAutosave() {
  let rawAlbum = null;
  try {
    rawAlbum = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (rawAlbum) {
    try {
      const { album, warnings } = normalizeAlbum(JSON.parse(rawAlbum));
      return { album, warnings };
    } catch {
      /* si el álbum guardado está dañado, se intenta la copia anterior */
    }
  }
  try {
    const rawTheme = localStorage.getItem(LEGACY_KEY);
    if (!rawTheme) return null;
    const { project, warnings } = normalizeProject(JSON.parse(rawTheme));
    return { album: albumFromProject(project, project.name), warnings };
  } catch {
    return null;
  }
}

let timer = 0;
/** Guarda el álbum tras 1 s sin cambios. `onState('guardando…' | 'guardado' | 'sin guardar')`. */
export function scheduleAutosave(album, onState) {
  clearTimeout(timer);
  onState?.('guardando…');
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(album));
      localStorage.removeItem(LEGACY_KEY);
      onState?.('guardado');
    } catch {
      onState?.('sin guardar (almacenamiento lleno)');
    }
  }, 1000);
}

export function readMeta() {
  try {
    return JSON.parse(localStorage.getItem(META) || '{}');
  } catch {
    return {};
  }
}

export function writeMeta(patch) {
  try {
    localStorage.setItem(META, JSON.stringify({ ...readMeta(), ...patch }));
  } catch {
    /* sin almacenamiento */
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function jsonText(data) {
  return `${JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2)}\n`;
}

/**
 * Escribe un JSON en un archivo abierto con la API de acceso al sistema de
 * archivos. Devuelve `false` si el navegador no permite escribir en él.
 */
async function writeJsonToHandle(handle, data) {
  if (!handle || typeof handle.createWritable !== 'function') return false;
  if (typeof handle.requestPermission === 'function') {
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return false;
  }
  const writable = await handle.createWritable();
  await writable.write(jsonText(data));
  await writable.close();
  return true;
}

/** Guarda el tema actual en el archivo del que se abrió. */
export async function saveProjectToHandle(handle, project) {
  if (!(await writeJsonToHandle(handle, project))) return false;
  writeMeta({ downloadedThemeRevision: revisionKey(project) });
  return true;
}

/** Guarda el álbum completo en el archivo del que se abrió. */
export async function saveAlbumToHandle(handle, album) {
  if (!(await writeJsonToHandle(handle, album))) return false;
  writeMeta({ downloadedAlbumRevision: revisionKey(album) });
  return true;
}

export function projectFileName(project) {
  return `${fileBase(project.name)}.sen.json`;
}

/** Descarga un tema suelto (desde el diálogo de exportación). */
export function downloadProject(project) {
  const data = { ...project, savedAt: new Date().toISOString() };
  downloadBlob(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }), projectFileName(project));
  writeMeta({ downloadedThemeRevision: revisionKey(project) });
}

/** ¿Está descargado este tema suelto? */
export function isDownloaded(project) {
  return readMeta().downloadedThemeRevision === revisionKey(project);
}

export function albumFileName(album) {
  return `${fileBase(album.name, 'album')}.sen-album.json`;
}

/** Descarga el álbum completo con todos sus temas. */
export function downloadAlbum(album) {
  const data = { ...album, savedAt: new Date().toISOString() };
  downloadBlob(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }), albumFileName(album));
  writeMeta({ downloadedAlbumRevision: revisionKey(album) });
}

/** ¿Hay cambios del álbum sin descargar? */
export function isAlbumDownloaded(album) {
  return readMeta().downloadedAlbumRevision === revisionKey(album);
}

function revisionKey(data) {
  const text = JSON.stringify(data);
  return `${text.length}:${hashText(text)}`;
}

function hashText(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

/**
 * Lee un archivo (álbum JSON, tema JSON o WAV con `senp`) y devuelve
 * `{ kind: 'album' | 'theme', album?, project?, warnings }`.
 */
export async function readProjectFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isWav = bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF';
  if (!isWav && bytes.length > 8_000_000) throw new LabFileError('El archivo supera 8 MB.');
  let raw;
  if (isWav) {
    try {
      raw = readSenpProject(bytes);
    } catch {
      throw new LabFileError('El proyecto incrustado en el WAV está dañado.');
    }
    if (!raw) throw new LabFileError('Este WAV no contiene un proyecto del laboratorio.');
  } else {
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new LabFileError('El archivo no es un JSON válido.');
    }
  }
  if (isAlbum(raw)) return { kind: 'album', ...normalizeAlbum(raw) };
  if (bytes.length > 1_000_000 && !isWav) throw new LabFileError('El tema supera 1 MB.');
  return { kind: 'theme', ...normalizeProject(raw) };
}
