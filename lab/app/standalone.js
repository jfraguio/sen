/**
 * Script autónomo: un único `.mjs` con el motor y el proyecto dentro.
 * `node tema.render.mjs` escribe el WAV sin necesidad del repositorio.
 *
 * Cada módulo del motor se envuelve en una función que devuelve sus
 * exportaciones; los `import { … } from './x.js'` se convierten en
 * desestructuraciones de esos objetos. Reglas que debe cumplir el motor:
 *   - solo `import { a, b as c } from './x.js'` entre sus propios módulos;
 *   - exportaciones por declaración (`export const/function/class`) o
 *     `export { a, b }` de nombres ya declarados;
 *   - sin dependencias circulares.
 */

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g;
const EXPORT_DECL_RE = /^export\s+((?:async\s+)?(?:function\*?|class|const|let|var))\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?\s*$/gm;

function resolvePath(from, rel) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

const varName = (path) => `__m_${path.replace(/[^A-Za-z0-9]/g, '_')}`;

/** Transforma un módulo en una expresión que devuelve sus exportaciones. */
export function wrapModule(path, code, known) {
  const imports = [];
  let body = code.replace(IMPORT_RE, (_, names, from) => {
    if (!from.startsWith('.')) throw new Error(`${path}: importación externa no permitida (${from})`);
    const target = resolvePath(path, from);
    if (!known.has(target)) throw new Error(`${path}: ${target} no está antes en la lista de módulos`);
    const list = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => {
      const [a, b] = n.split(/\s+as\s+/);
      return b ? `${a}: ${b}` : a;
    });
    imports.push(`const { ${list.join(', ')} } = ${varName(target)};`);
    return '';
  });
  if (/^\s*import\s/m.test(body)) throw new Error(`${path}: forma de import no admitida`);
  const names = [];
  body = body.replace(EXPORT_DECL_RE, (_, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  body = body.replace(EXPORT_LIST_RE, (_, list) => {
    for (const n of list.split(',').map((x) => x.trim()).filter(Boolean)) names.push(n);
    return '';
  });
  if (/^\s*export\s/m.test(body)) throw new Error(`${path}: forma de export no admitida`);
  return `const ${varName(path)} = (() => {\n${imports.join('\n')}\n${body}\nreturn { ${names.join(', ')} };\n})();\n`;
}

/**
 * Construye el script. `sources` es una lista `[ruta, código]` en el orden de
 * `ENGINE_MODULES` (rutas relativas a `lab/engine/`).
 */
export function buildStandalone(sources, project, options, fileName) {
  const known = new Set();
  const modules = sources.map(([path, code]) => {
    const out = wrapModule(path, code, known);
    known.add(path);
    return `// ---- lab/engine/${path}\n${out}`;
  });
  const json = JSON.stringify(project, null, 2);
  return `#!/usr/bin/env node
/**
 * ${String(project.name).replace(/\*\//g, '')} · script autónomo de sen lab.
 *
 * Uso:  node ${fileName}.render.mjs [salida.wav]
 *
 * Contiene el motor de síntesis del laboratorio y el proyecto. Con Node ≥ 18
 * escribe el mismo WAV que el botón «Exportar → WAV» con estas opciones.
 */

import fs from 'node:fs';

${modules.join('\n')}
const { renderToWav } = ${varName('index.js')};

const PROJECT = ${json};

const OPTIONS = ${JSON.stringify(options)};

const out = process.argv[2] || ${JSON.stringify(`${fileName}.wav`)};
let last = -1;
const { parts, stats } = await renderToWav(PROJECT, OPTIONS, {
  onProgress(p) {
    const pct = Math.floor(p * 100);
    if (pct !== last && process.stderr.isTTY) {
      last = pct;
      process.stderr.write('\\r' + String(pct).padStart(3) + ' %');
    }
  },
});
if (process.stderr.isTTY) process.stderr.write('\\n');
fs.writeFileSync(out, Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
console.log('✓ ' + out + ' · ' + stats.duration.toFixed(2) + ' s · ' + (Number.isFinite(stats.lufs) ? stats.lufs.toFixed(1) : '—') + ' LUFS');
`;
}
