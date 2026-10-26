/**
 * Persistencia local y archivos: autoguardado en `localStorage`, abrir
 * `.sen.json` o WAV con chunk `senp`, y descargas.
 */

import { LabFileError, normalizeProject } from '../engine/schema.js';
import { readSenpProject } from '../engine/wav.js';
import { slugify } from '../engine/index.js';

const KEY = 'sen-lab/current';
const META = 'sen-lab/meta';

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { project, warnings } = normalizeProject(JSON.parse(raw));
    return { project, warnings };
  } catch {
    return null;
  }
}

let timer = 0;
/** Guarda tras 1 s sin cambios. `onState('guardando…' | 'guardado' | 'sin guardar')`. */
export function scheduleAutosave(project, onState) {
  clearTimeout(timer);
  onState?.('guardando…');
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
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

export function projectFileName(project) {
  return `${slugify(project.name)}.sen.json`;
}

/** Descarga el proyecto y lo marca como descargado. */
export function downloadProject(project) {
  const data = { ...project, savedAt: new Date().toISOString() };
  downloadBlob(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }), projectFileName(project));
  writeMeta({ downloadedRevision: JSON.stringify(project).length + ':' + hashText(JSON.stringify(project)) });
}

/** ¿Hay cambios sin descargar? */
export function isDownloaded(project) {
  return readMeta().downloadedRevision === JSON.stringify(project).length + ':' + hashText(JSON.stringify(project));
}

function hashText(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

/** Lee un archivo (JSON o WAV con `senp`) y devuelve `{ project, warnings }`. */
export async function readProjectFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isWav = bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF';
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
  if (bytes.length > 1_000_000 && !isWav) throw new LabFileError('El proyecto supera 1 MB.');
  return normalizeProject(raw);
}
