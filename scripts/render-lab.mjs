#!/usr/bin/env node
/**
 * Renderiza en local un tema del laboratorio con el mismo motor que el
 * navegador (`lab/engine/`). Con las mismas opciones, el WAV es idéntico byte
 * a byte al exportado desde Chrome o Edge.
 *
 * Uso:
 *   node scripts/render-lab.mjs tema.sen.json
 *   node scripts/render-lab.mjs tema.sen.json --out tema.wav --rate 44100 --bits 16 \
 *     --mono --end loop --lufs -23 --peak -3
 *   node scripts/render-lab.mjs tema.wav            # usa el proyecto del chunk senp
 *
 * Si el tema usa capas de pistas de sen, se recalculan con el generador de la
 * app (`scripts/lib/published.js`), igual que en el navegador.
 *
 * Opciones (sustituyen a las de `export` del proyecto):
 *   --out <archivo>        destino (por defecto, al lado del proyecto)
 *   --rate 22050|44100|48000
 *   --bits 16|24|32
 *   --mono | --stereo
 *   --end tail|cut|loop
 *   --lufs <-23|-18|-16|-14|none>
 *   --peak <dBFS>          techo del limitador
 *   --range all|region
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderToWav, resolveExportOptions, slugify } from '../lab/engine/index.js';
import { ENGINE_VERSION, layerKey, normalizeProject } from '../lab/engine/schema.js';
import { readSenpProject } from '../lab/engine/wav.js';
import { publishedLayers } from './lib/published.js';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.log('Uso: node scripts/render-lab.mjs <tema.sen.json|tema.wav> [--out f.wav] [--rate 48000] [--bits 24]\n'
    + '       [--mono|--stereo] [--end tail|cut|loop] [--lufs -18|none] [--peak -1] [--range all|region]');
  process.exit(args.length ? 0 : 1);
}

const input = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--mono', '--stereo'].includes(args[i - 1])));
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!input || !fs.existsSync(input)) fail(`No encuentro el archivo: ${input ?? '(sin archivo)'}`);

let raw;
const bytes = new Uint8Array(fs.readFileSync(input));
if (input.toLowerCase().endsWith('.wav')) {
  raw = readSenpProject(bytes);
  if (!raw) fail('Este WAV no contiene un proyecto del laboratorio (chunk senp).');
} else {
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail('El archivo no es un JSON válido.');
  }
}

let project;
let warnings;
try {
  ({ project, warnings } = normalizeProject(raw));
} catch (err) {
  fail(err.message);
}
for (const w of warnings) console.warn(`! ${w}`);
if (raw.engine && raw.engine !== ENGINE_VERSION) {
  console.warn(`! El tema se creó con ${raw.engine} y este motor es ${ENGINE_VERSION}: la salida puede diferir de la original.`);
}

const options = {};
if (flag('--rate')) options.sampleRate = Number(flag('--rate'));
if (flag('--bits')) options.bits = Number(flag('--bits'));
if (args.includes('--mono')) options.channels = 1;
if (args.includes('--stereo')) options.channels = 2;
if (flag('--end')) options.end = flag('--end');
if (flag('--lufs')) options.loudness = flag('--lufs') === 'none' ? null : Number(flag('--lufs'));
if (flag('--peak')) options.ceiling = Number(flag('--peak'));
if (flag('--range')) options.range = flag('--range');

const opts = resolveExportOptions(project, options);
const dir = path.dirname(input);
const base = input.toLowerCase().endsWith('.wav')
  ? `${path.basename(input, path.extname(input))}.render`
  : path.basename(input).replace(/\.sen\.json$|\.json$/i, '') || slugify(project.name);
const out = flag('--out') || path.join(dir, `${base}.wav`);

console.log(`${project.name} · ${project.duration} s · ${opts.sampleRate} Hz · ${opts.bits} bits · ${opts.channels === 1 ? 'mono' : 'estéreo'} · final ${opts.end} · ${opts.loudness === null ? 'solo limitador' : `${opts.loudness} LUFS`} · techo ${opts.ceiling} dBFS`);

/** Audio de las capas de pistas de sen que use el tema. */
async function layerSamples(p) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const wanted = new Set(p.tracks.filter((t) => t.family === 'layer').map((t) => `${t.source.ambient}/${t.source.track}`));
  const samples = new Map();
  for (const key of wanted) {
    const [ambient, track] = key.split('/');
    const res = await publishedLayers(ambient, Number(track), async (rel) => new Uint8Array(fs.readFileSync(path.join(root, rel))));
    res.layers.forEach((l, k) => samples.set(layerKey({ ambient, track: Number(track), layer: k }), { rate: res.sampleRate, data: l.data }));
    console.log(`  capas de ${res.name} · ${res.file}: ${res.layers.map((l) => l.name).join(', ')}`);
  }
  return samples;
}
const samples = await layerSamples(project);

const started = Date.now();
let lastDraw = 0;
const draw = (p) => {
  if (!process.stderr.isTTY) return;
  const now = Date.now();
  if (now - lastDraw < 100 && p < 1) return;
  lastDraw = now;
  const w = 30;
  const n = Math.round(p * w);
  process.stderr.write(`\r[${'#'.repeat(n)}${'.'.repeat(w - n)}] ${(p * 100).toFixed(0).padStart(3)} %`);
};

const { parts, stats } = await renderToWav(project, options, { onProgress: draw, samples });
if (process.stderr.isTTY) process.stderr.write('\n');
const file = Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
fs.writeFileSync(out, file);
const sha = crypto.createHash('sha256').update(file).digest('hex');
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
for (const w of stats.warnings) console.warn(`! ${w}`);
console.log(`✓ ${out}`);
console.log(`  duración ${fmt(stats.duration, 2)} s · sonoridad ${fmt(stats.lufs)} LUFS · pico ${fmt(stats.peak)} dBFS · limitador ${fmt(stats.reduction)} dB · ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`  sha256 ${sha}`);
