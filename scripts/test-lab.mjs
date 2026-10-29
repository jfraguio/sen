#!/usr/bin/env node
/**
 * Pruebas del motor del laboratorio (`lab/engine/`).
 *
 *   node scripts/test-lab.mjs           # pruebas rápidas
 *   node scripts/test-lab.mjs --full    # además, plantillas completas y script autónomo
 *
 * Comprueba: validación de esquema, determinismo byte a byte, sonoridad y
 * techo, bucle sin costura, final con cola y exacto, chunk `senp`,
 * independencia del azar entre elementos, rendimiento y script autónomo.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compile, createRenderer, renderToWav, ENGINE_MODULES, auditionProject } from '../lab/engine/index.js';
import {
  INSTRUMENTS, INSTRUMENT_GROUPS, LabFileError, canonicalProject, createElement, createProject, createSceneProject, createTrack, layerKey, normalizeProject,
} from '../lab/engine/schema.js';
import { publishedLayers } from './lib/published.js';
import { decodeWavChannels, readSenpProject } from '../lab/engine/wav.js';
import { LoudnessMeter } from '../lab/engine/master.js';
import { planStrikeHits } from '../lab/engine/voices/strike.js';
import { seedFrom } from '../lab/engine/rng.js';
import { buildStandalone } from '../lab/app/standalone.js';
import { midiToTracks, parseMidi } from '../lab/app/midi.js';

/** MIDI de prueba: pista 1 con notas cortas; pista 2 con acordes largos (120 BPM). */
function makeMidi() {
  const vlq = (v) => {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  };
  const track = (events) => {
    const body = [];
    for (const [dt, ...bytes] of events) body.push(...vlq(dt), ...bytes);
    body.push(0, 0xff, 0x2f, 0);
    return [0x4d, 0x54, 0x72, 0x6b, (body.length >>> 24) & 255, (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255, ...body];
  };
  const melody = [[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], [0, 0xff, 0x03, 5, ...Buffer.from('Notas')]];
  for (let k = 0; k < 8; k++) melody.push([k ? 240 : 0, 0x90, 60 + (k % 5) * 2, 90], [240, 0x80, 60 + (k % 5) * 2, 0]);
  const chords = [[0, 0x91, 48, 70], [0, 0x91, 55, 70], [1920, 0x81, 48, 0], [0, 0x81, 55, 0]];
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0];
  return new Uint8Array([...head, ...track(melody), ...track(chords)]);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const full = process.argv.includes('--full');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sen-lab-'));

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed++;
};
const join = (parts) => Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const template = (name) => normalizeProject(JSON.parse(fs.readFileSync(path.join(root, 'lab/templates', `${name}.sen.json`), 'utf8'))).project;

/** Salto en la costura relativo al percentil 99,9 de los saltos internos. */
function seamScore(x) {
  const d = new Float32Array(x.length - 1);
  for (let i = 1; i < x.length; i++) d[i - 1] = Math.abs(x[i] - x[i - 1]);
  const s = Float32Array.from(d).sort();
  return Math.abs(x[0] - x[x.length - 1]) / (s[Math.floor(s.length * 0.999)] || 1e-9);
}

/** Proyecto pequeño con una pista de cada familia. */
function smallProject(over = {}) {
  const p = createProject({ seed: 'prueba', duration: 20, name: 'Prueba', ...over });
  const add = (inst, type, mutate = () => {}) => {
    const t = createTrack(inst, p);
    const e = createElement(t, p, 0, type);
    e.length = 20;
    mutate(e, t);
    t.elements.push(e);
    p.tracks.push(t);
    return t;
  };
  add('pad', 'tone', (e) => { e.fadeIn = 2; e.fadeOut = 3; });
  add('campana', 'cloud', (e) => { e.density = 30; });
  add('ruido', 'span');
  add('grillo', 'span');
  add('lluvia', 'span');
  return p;
}

/* ------------------------------------------------------------ esquema */

{
  for (const name of ['vacio', 'drone-y-campanas', 'noche-en-el-estanque', 'amanecer', 'espacio-profundo']) {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'lab/templates', `${name}.sen.json`), 'utf8'));
    const { project, warnings } = normalizeProject(raw);
    const again = normalizeProject(JSON.parse(JSON.stringify(project))).project;
    ok(!warnings.length && JSON.stringify(canonicalProject(again)) === JSON.stringify(canonicalProject(project)), `plantilla ${name} válida y estable`);
  }
  let msg = '';
  try {
    normalizeProject({ schema: 'sen-lab/2', base: 'lluvia' });
  } catch (e) {
    msg = e instanceof LabFileError ? e.message : '';
  }
  ok(msg.includes('mezclador anterior'), 'sen-lab/2 muestra el aviso del mezclador anterior');
  const bad = normalizeProject({ schema: 'sen-lab/3', duration: 99999, tracks: [{ instrument: 'pad', params: { cutoff: 1e9 }, elements: [{ type: 'tone', start: 0, length: 5, notes: ['X9', 'C3'] }] }], extra: 42 });
  ok(bad.project.duration === 1800 && bad.project.tracks[0].params.cutoff === 18000 && bad.project.tracks[0].elements[0].notes.length === 1 && bad.project.extra === 42 && bad.warnings.length >= 2,
    'valores fuera de rango se recortan, se avisa y se conservan los campos desconocidos');
}

/* ------------------------------------------------------------ azar independiente */

{
  const p = smallProject();
  const strike = p.tracks[1];
  const cloud = strike.elements[0];
  const ctx = { a4: 440, key: p.key, elementSeed: seedFrom(p.seed, strike.id, cloud.id, cloud.seed) };
  const before = JSON.stringify(planStrikeHits(strike, cloud, ctx));
  const extra = createElement(strike, p, 5, 'hit');
  strike.elements.push(extra);
  p.tracks[0].elements[0].notes = ['D3'];
  const after = JSON.stringify(planStrikeHits(strike, cloud, ctx));
  ok(before === after, 'editar un elemento no cambia el azar de los demás');
}

/* ------------------------------------------------------------ todos los instrumentos */

{
  const base = createProject({ seed: 'inst', duration: 20 });
  let all = true;
  const playable = Object.keys(INSTRUMENTS).filter((id) => INSTRUMENTS[id].family !== 'layer');
  for (const id of playable) {
    const t = createTrack(id, base);
    const plan = compile(auditionProject(base, t, { seconds: 3 }), { sampleRate: 44100, audition: true });
    const { L, R } = createRenderer(plan, { limiter: false }).render(44100 * 4);
    let pk = 0;
    let bad = false;
    for (let i = 0; i < L.length; i++) {
      if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) bad = true;
      pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    }
    if (bad || pk < 0.003 || pk > 1) {
      all = false;
      console.log(`   ${id}: pico ${pk} ${bad ? 'NaN' : ''}`);
    }
  }
  ok(all, `los ${playable.length} instrumentos suenan en la audición, sin NaN ni saturación`);
  const listed = INSTRUMENT_GROUPS.flatMap((g) => g.subgroups.flatMap((s) => s.instruments));
  ok(playable.length === listed.length && playable.every((id) => listed.filter((x) => x === id).length === 1),
    'la biblioteca agrupa todos los instrumentos una sola vez');
}


/* ------------------------------------------------------------ capas de pistas de sen */

const readRepo = async (rel) => new Uint8Array(fs.readFileSync(path.join(root, rel)));
async function sceneProject(ambient, track) {
  const r = await publishedLayers(ambient, track, readRepo);
  const { project, warnings } = normalizeProject(createSceneProject({ ...r, layers: r.layers.map((l) => l.name) }));
  const samples = new Map(r.layers.map((l, k) => [layerKey({ ambient, track, layer: k }), { rate: r.sampleRate, data: l.data }]));
  return { project, warnings, samples, r };
}
const correlation = (a, b) => {
  let c = 0, ea = 0, eb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { c += a[i] * b[i]; ea += a[i] * a[i]; eb += b[i] * b[i]; }
  return c / Math.sqrt(ea * eb);
};

{
  const { project, warnings, samples, r } = await sceneProject('bosque', 3);
  ok(!warnings.length && project.tracks.length === r.layers.length && project.tracks.every((t) => t.family === 'layer' && t.mix.gain === 0),
    `pista bosque/03 abierta en capas: ${project.tracks.map((t) => t.name).join(', ')}`);
  const res = await renderToWav(project, {}, { samples });
  const out = decodeWavChannels(new Uint8Array(join(res.parts)));
  const pub = decodeWavChannels(await readRepo('assets/audio/bosque/03.wav'));
  const corr = correlation(out.data[0], pub.data[0]);
  ok(out.sampleRate === 22050 && out.channels === 1 && out.data[0].length === pub.data[0].length && corr > 0.999,
    `sin tocar nada, exporta la misma pista que la app (correlación ${corr.toFixed(5)}, ${res.stats.lufs.toFixed(2)} LUFS)`);
  const seam = seamScore(out.data[0]);
  ok(seam <= 1, `la pista exportada enlaza sin costura (${seam.toFixed(2)})`);

  // Bajar el pad 6 dB: la capa del pad suena 6 dB más baja y el resto igual.
  const pad = project.tracks.find((t) => /Pad/.test(t.name));
  const solo = (gain) => {
    const q = structuredClone(project);
    for (const t of q.tracks) t.mix.solo = t.id === pad.id;
    q.tracks.find((t) => t.id === pad.id).mix.gain = gain;
    const { L } = createRenderer(compile(q, { sampleRate: 22050, samples }), { limiter: false }).render(22050 * 10);
    return Math.sqrt(L.reduce((a, v) => a + v * v, 0) / L.length);
  };
  const drop = 20 * Math.log10(solo(-6) / solo(0));
  ok(pad && Math.abs(drop + 6) < 0.05, `bajar el «${pad?.name}» 6 dB lo baja ${drop.toFixed(2)} dB`);

  const without = await renderToWav(project, {}, {});
  ok(without.stats.warnings.some((w) => w.includes('capa')), 'sin el audio de las capas se avisa en lugar de fallar');
  const bad = normalizeProject({ schema: 'sen-lab/3', duration: 30, tracks: [{ instrument: 'capa', elements: [] }] });
  ok(!bad.project.tracks.length && bad.warnings.length === 1, 'una capa sin origen válido se descarta con aviso');
}
{
  const { project, samples, r } = await sceneProject('mar', 1);
  const res = await renderToWav(project, {}, { samples });
  ok(r.layers.length === 1 && Math.abs(res.stats.duration - 16) < 0.001, `las pistas de síntesis base se abren como una sola capa (${res.stats.duration.toFixed(1)} s)`);
}

/* ------------------------------------------------------------ exportación */

{
  const p = smallProject();
  const a = await renderToWav(p, { sampleRate: 44100, bits: 24, channels: 2, end: 'cut', loudness: -18, ceiling: -1 });
  const b = await renderToWav(p, { sampleRate: 44100, bits: 24, channels: 2, end: 'cut', loudness: -18, ceiling: -1 });
  const fa = join(a.parts);
  ok(sha(fa) === sha(join(b.parts)), 'exportar dos veces da archivos idénticos');
  ok(a.stats.frames === 20 * 44100, 'final exacto: dura exactamente la duración del tema');
  ok(Math.abs(a.stats.lufs + 18) <= 0.5, `sonoridad a ±0,5 LU del objetivo (${a.stats.lufs.toFixed(2)} LUFS)`);
  ok(a.stats.peak <= -1 + 0.01, `el pico no supera el techo (${a.stats.peak.toFixed(2)} dBFS)`);
  const wav = decodeWavChannels(new Uint8Array(fa));
  ok(wav.sampleRate === 44100 && wav.channels === 2 && wav.bits === 24, 'formato WAV 44,1 kHz / 24 bits / estéreo');
  const last = wav.data[0].subarray(wav.data[0].length - 200);
  ok(Math.max(...last.map(Math.abs)) < 0.01, 'el fundido de salida llega a silencio');
  const senp = readSenpProject(new Uint8Array(fa));
  ok(senp && JSON.stringify(canonicalProject(normalizeProject(senp).project).tracks) === JSON.stringify(canonicalProject(p).tracks), 'el chunk senp devuelve el proyecto');
  ok(senp && !('savedAt' in senp) && !('createdAt' in senp), 'el proyecto incrustado es canónico (sin fechas)');

  const t = await renderToWav(p, { sampleRate: 22050, bits: 16, channels: 1, end: 'tail', loudness: null, ceiling: -3 });
  const tw = decodeWavChannels(new Uint8Array(join(t.parts)));
  const tl = tw.data[0];
  const endPk = Math.max(...tl.subarray(tl.length - 2205).map(Math.abs));
  ok(t.stats.duration > 20 && t.stats.duration <= 40.5, `final con cola: ${t.stats.duration.toFixed(2)} s`);
  ok(endPk < 0.0005, `la cola termina por debajo de −66 dBFS (${(20 * Math.log10(endPk + 1e-9)).toFixed(1)} dBFS, 16 bits con dither)`);
  ok(tw.channels === 1 && tw.bits === 16 && tw.sampleRate === 22050, 'formato 22,05 kHz / 16 bits / mono');

  const f = await renderToWav(p, { sampleRate: 48000, bits: 32, channels: 2, end: 'cut', loudness: -23 });
  const fw = decodeWavChannels(new Uint8Array(join(f.parts)));
  ok(fw.format === 3 && fw.bits === 32, 'formato 32 bits flotante');

  const loopP = smallProject({ end: { mode: 'loop', fadeOut: 4 } });
  const l = await renderToWav(loopP, { sampleRate: 22050, bits: 16, channels: 1, end: 'loop', loudness: -23, ceiling: -3 });
  const lw = decodeWavChannels(new Uint8Array(join(l.parts)));
  const score = seamScore(lw.data[0]);
  ok(lw.data[0].length === 20 * 22050, 'el bucle dura exactamente la duración del tema');
  ok(score <= 1, `bucle sin costura (salto relativo ${score.toFixed(2)} ≤ 1)`);

  const regionP = smallProject({ region: { start: 5, end: 12 } });
  const r = await renderToWav(regionP, { sampleRate: 22050, bits: 16, channels: 2, end: 'cut', loudness: null, range: 'region' });
  ok(r.stats.frames === 7 * 22050, 'exportar la región dura lo que la región');
}

/* ------------------------------------------------------------ automatización y pico real */

{
  const p = smallProject();
  p.tracks = [p.tracks[0]];
  p.tracks[0].elements[0].fadeIn = 0;
  p.tracks[0].elements[0].fadeOut = 0;
  const base = createRenderer(compile(p, { sampleRate: 22050 }), { limiter: false }).render(22050 * 20);
  const q = JSON.parse(JSON.stringify(p));
  q.tracks[0].automation = { gain: [[0, -6], [10, -6], [10.01, -40], [20, -40]] };
  const auto = createRenderer(compile(normalizeProject(q).project, { sampleRate: 22050 }), { limiter: false }).render(22050 * 20);
  const rmsOf = (x, a, b) => Math.sqrt(x.subarray(a * 22050, b * 22050).reduce((s, v) => s + v * v, 0) / ((b - a) * 22050));
  const before = 20 * Math.log10(rmsOf(auto.L, 2, 8) / rmsOf(base.L, 2, 8));
  const after = 20 * Math.log10(rmsOf(auto.L, 12, 18) / rmsOf(base.L, 12, 18));
  ok(Math.abs(before) < 0.5 && Math.abs(after + 34) < 1.5, `automatización de volumen (${before.toFixed(1)} dB antes, ${after.toFixed(1)} dB después del salto a −40)`);
  const loud = await renderToWav(smallProject(), { sampleRate: 44100, bits: 32, channels: 2, end: 'cut', loudness: -8, ceiling: -1 });
  ok(loud.stats.truePeak <= -1 + 0.15 && loud.stats.reduction > 1, `limitador de pico real: ${loud.stats.truePeak.toFixed(2)} dBTP con ${loud.stats.reduction.toFixed(1)} dB de reducción`);
}

/* ------------------------------------------------------------ MIDI */

{
  const bytes = makeMidi();
  const m = parseMidi(bytes);
  ok(m.tracks.length === 2 && m.tracks[0].name === 'Notas' && m.tracks[0].notes.length === 8 && Math.abs(m.seconds(480) - 0.5) < 1e-9, 'MIDI: pistas, nombres, notas y tempo');
  const p = createProject({ seed: 'midi', duration: 10 });
  const res = midiToTracks(bytes, p);
  const kinds = res.tracks.map((t) => `${t.instrument}:${t.elements.map((e) => e.type).join(',')}`);
  ok(kinds.join('|') === 'kalimba:phrase|pad:tone' && res.tracks[0].elements[0].events.length === 8 && res.tracks[1].elements[0].notes.length === 2,
    `MIDI importado como ${kinds.join(' y ')}`);
  const check = normalizeProject({ ...p, tracks: res.tracks, duration: res.duration });
  ok(!check.warnings.length, 'el resultado de la importación MIDI es un proyecto válido');
}

/* ------------------------------------------------------------ rendimiento */

{
  const p = createProject({ seed: 'rend', duration: 30 });
  const insts = ['pad', 'drone', 'cuerdas', 'campana', 'kalimba', 'ruido', 'grillo', 'pajaro', 'lluvia', 'arroyo', 'viento', 'gotas'];
  for (const id of insts) {
    const t = createTrack(id, p);
    const e = createElement(t, p, 0);
    e.length = 30;
    t.elements.push(e);
    p.tracks.push(t);
  }
  const t0 = performance.now();
  const plan = compile(p, { sampleRate: 44100 });
  const tc = performance.now() - t0;
  const r = createRenderer(plan);
  const t1 = performance.now();
  r.render(44100 * 30);
  const rt = 30000 / (performance.now() - t1);
  ok(rt >= 10, `tema típico de 12 pistas: ${rt.toFixed(1)}× tiempo real (≥ 10×)`);
  ok(tc <= 50, `compilación de un tema típico: ${tc.toFixed(1)} ms (≤ 50 ms)`);
}

/* ------------------------------------------------------------ plantillas y script autónomo */

if (full) {
  for (const name of ['drone-y-campanas', 'noche-en-el-estanque', 'amanecer', 'espacio-profundo']) {
    const p = template(name);
    const t0 = Date.now();
    const res = await renderToWav(p, {});
    ok(Number.isFinite(res.stats.lufs) && res.stats.peak <= res.stats.peak, `plantilla ${name}: ${res.stats.duration.toFixed(1)} s, ${res.stats.lufs.toFixed(1)} LUFS en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (p.end.mode === 'loop') {
      const w = decodeWavChannels(new Uint8Array(join(res.parts)));
      const s = Math.max(seamScore(w.data[0]), seamScore(w.data[1]));
      ok(s <= 1, `plantilla ${name}: bucle sin costura (${s.toFixed(2)})`);
    }
  }
  const p = template('noche-en-el-estanque');
  p.duration = 30;
  for (const t of p.tracks) for (const e of t.elements) { if (e.length > 30) e.length = 30; if (e.start > 20) e.start = 5; }
  const opts = { sampleRate: 22050, bits: 16, channels: 2, end: 'loop', loudness: -23, ceiling: -3 };
  const direct = sha(join((await renderToWav(p, opts)).parts));
  const sources = ENGINE_MODULES.map((m) => [m, fs.readFileSync(path.join(root, 'lab/engine', m), 'utf8')]);
  const script = buildStandalone(sources, p, opts, 'prueba');
  const file = path.join(tmp, 'prueba.render.mjs');
  fs.writeFileSync(file, script);
  const out = path.join(tmp, 'prueba.wav');
  execFileSync(process.execPath, [file, out], { stdio: 'pipe' });
  ok(sha(fs.readFileSync(out)) === direct, 'el script autónomo produce el mismo WAV byte a byte');
  const cli = path.join(tmp, 'cli.wav');
  const proj = path.join(tmp, 'prueba.sen.json');
  fs.writeFileSync(proj, JSON.stringify({ ...p, export: opts }));
  execFileSync(process.execPath, [path.join(root, 'scripts/render-lab.mjs'), proj, '--out', cli], { stdio: 'pipe' });
  ok(sha(fs.readFileSync(cli)) === direct, 'scripts/render-lab.mjs produce el mismo WAV byte a byte');

  const scene = await sceneProject('lluvia', 4);
  scene.project.tracks[0].mix.gain = -4;
  const sceneDirect = sha(join((await renderToWav(scene.project, {}, { samples: scene.samples })).parts));
  const sceneFile = path.join(tmp, 'lluvia.sen.json');
  const sceneOut = path.join(tmp, 'lluvia.wav');
  fs.writeFileSync(sceneFile, JSON.stringify(scene.project));
  execFileSync(process.execPath, [path.join(root, 'scripts/render-lab.mjs'), sceneFile, '--out', sceneOut], { stdio: 'pipe' });
  ok(sha(fs.readFileSync(sceneOut)) === sceneDirect, 'scripts/render-lab.mjs recalcula las capas de una pista de sen y da el mismo WAV');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} prueba(s) fallida(s)` : '\nTodo correcto');
process.exit(failed ? 1 : 0);
