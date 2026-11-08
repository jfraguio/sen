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
  repeatToneToEnd, splitToneChanges, toneNotesAt, trimToneStart,
} from '../lab/engine/schema.js';
import { publishedLayers } from './lib/published.js';
import { decodeWavChannels, readSenpProject } from '../lab/engine/wav.js';
import { LoudnessMeter } from '../lab/engine/master.js';
import { planStrikeHits } from '../lab/engine/voices/strike.js';
import { seedFrom } from '../lab/engine/rng.js';
import { buildStandalone } from '../lab/app/standalone.js';
import { midiToTracks, parseMidi } from '../lab/app/midi.js';
import { stretchProjectTime } from '../lab/app/stretch.js';

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
  add('campana', 'cloud', (e) => { e.mode = 'random'; e.density = 30; });
  add('ruido', 'span');
  add('grillo', 'span');
  add('lluvia', 'span');
  return p;
}

/* ------------------------------------------------------------ esquema */

{
  ok(createProject().duration === 60, 'el tema nuevo dura 1 minuto por defecto');
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

/* ------------------------------------------------------------ estirar el tema */

{
  const p = createProject({ seed: 'estirar', duration: 30 });
  const pad = createTrack('pad', p);
  const tone = createElement(pad, p, 5, 'tone');
  tone.length = 10;
  tone.changes = [{ t: 2, notes: ['E3'] }];
  tone.crossfade = 0.5;
  pad.elements.push(tone);
  pad.automation = { gain: [[0, 0], [10, -12]] };
  const kal = createTrack('kalimba', p);
  const phrase = createElement(kal, p, 20, 'phrase');
  phrase.length = 4;
  phrase.pattern = 4;
  phrase.events = [{ t: 1, note: 'C4', v: 0.7 }, { t: 3, note: 'E4', v: 0.7 }];
  kal.elements.push(phrase);
  p.tracks.push(pad, kal);
  p.region = { start: 2, end: 20 };
  stretchProjectTime(p, 120);
  ok(p.duration === 120
    && tone.start === 20 && tone.length === 40 && tone.changes[0].t === 8 && tone.crossfade === 2
    && pad.automation.gain[1][0] === 40
    && phrase.start === 80 && phrase.length === 16 && phrase.pattern === 16
    && phrase.events[0].t === 4 && phrase.events[1].t === 12
    && p.region.start === 8 && p.region.end === 80,
    'estirar el tema escala posiciones, sostenidos, cambios, frases, automatización y región');
}

/* ------------------------------------------------------------ cambios de nota */

{
  const p = createProject({ seed: 'cambios', duration: 10 });
  const track = createTrack('pad', p);
  const el = createElement(track, p, 0, 'tone');
  el.length = 10;
  el.fadeIn = 0.1;
  el.fadeOut = 0.1;
  el.notes = ['C3'];
  el.changes = [{ t: 2, notes: ['E3'] }, { t: 4, notes: ['C3', 'E3'] }, { t: 6, notes: [] }];
  track.elements.push(el);
  p.tracks.push(track);

  const rms = (L, a, b, sr) => {
    let s = 0;
    for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) s += L[i] * L[i];
    return Math.sqrt(s / Math.max(1, Math.round((b - a) * sr)));
  };
  const sr = 22050;
  const { L, R } = createRenderer(compile(p, { sampleRate: sr }), { limiter: false }).render(sr * 8);
  const finite = L.every(Number.isFinite) && R.every(Number.isFinite);
  const r1 = rms(L, 0, 2, sr);
  const r2 = rms(L, 2, 4, sr);
  const r3 = rms(L, 4, 6, sr);
  const r4 = rms(L, 6, 8, sr);
  ok(finite && r1 > 0.01 && r2 > 0.01 && r3 > 0.01 && r4 < r1 * 0.5,
    `un tone con cambios de nota suena en cada tramo y calla al final (${r1.toFixed(3)} / ${r2.toFixed(3)} / ${r3.toFixed(3)} / ${r4.toFixed(3)})`);

  const norm = normalizeProject({ schema: 'sen-lab/3', duration: 10, tracks: [{ instrument: 'pad', elements: [{ type: 'tone', start: 0, length: 10, notes: ['C3'], changes: [{ t: 20, notes: ['E3'] }, { t: 1, notes: ['D3', 'X'] }, { t: 1.0002, notes: ['F3'] }, { t: -1, notes: ['G3'] }] }] }] });
  const normEl = norm.project.tracks[0].elements[0];
  const changes = normEl.changes;
  ok(normEl.notes[0] === 'G3' && changes.length === 1 && changes[0].t === 1 && changes[0].notes[0] === 'F3',
    'los cambios de nota se ordenan, se recortan, se descartan fuera del elemento y el cambio en 0 pasa a las notas base');
  const silence = normalizeProject({ schema: 'sen-lab/3', duration: 10, tracks: [{ instrument: 'pad', elements: [{ type: 'tone', start: 0, length: 10, notes: [], changes: [{ t: 2, notes: ['C3'] }] }] }] });
  ok(silence.project.tracks[0].elements[0].notes.length === 0, 'un tone puede empezar en silencio hasta su primer cambio');
  const cross = normalizeProject({ schema: 'sen-lab/3', duration: 10, tracks: [{ instrument: 'pad', elements: [{ type: 'tone', start: 0, length: 10, notes: ['C3'], crossfade: 9 }] }] });
  const crossEl = cross.project.tracks[0].elements[0];
  ok(crossEl.crossfade === 2 && normalizeProject({ schema: 'sen-lab/3', duration: 10, tracks: [{ instrument: 'pad', elements: [{ type: 'tone', start: 0, length: 10, notes: ['C3'], crossfade: -1 }] }] }).project.tracks[0].elements[0].crossfade === 0,
    'el fundido entre notas se recorta a 0–2 s');

  const fadeProject = createProject({ seed: 'fade', duration: 10 });
  const fadeTrack = createTrack('pad', fadeProject);
  const fadeEl = createElement(fadeTrack, fadeProject, 0, 'tone');
  fadeEl.length = 10;
  fadeEl.fadeIn = 0;
  fadeEl.fadeOut = 0;
  fadeEl.notes = ['C3'];
  fadeEl.changes = [{ t: 4, notes: ['E3'] }];
  fadeEl.crossfade = 0;
  fadeTrack.elements.push(fadeEl);
  fadeProject.tracks.push(fadeTrack);
  const fadePlan = compile(fadeProject, { sampleRate: 22050 });
  const firstVoice = fadePlan.tracks[0].voices.find((v) => v.start === 0);
  ok(firstVoice && firstVoice.end === 4 * 22050, 'con fundido 0 los tramos no se solapan');

  const centerProject = createProject({ seed: 'fade-centro', duration: 10 });
  const centerTrack = createTrack('pad', centerProject);
  const centerEl = createElement(centerTrack, centerProject, 0, 'tone');
  centerEl.length = 10;
  centerEl.fadeIn = 0;
  centerEl.fadeOut = 0;
  centerEl.notes = ['C3'];
  centerEl.changes = [{ t: 4, notes: ['E3'] }];
  centerEl.crossfade = 1;
  centerTrack.elements.push(centerEl);
  centerProject.tracks.push(centerTrack);
  const centerPlan = compile(centerProject, { sampleRate: 22050 });
  const centerFirst = centerPlan.tracks[0].voices.find((v) => v.start === 0);
  const centerSecond = centerPlan.tracks[0].voices.find((v) => v.start > 0 && v.start < 4 * 22050);
  ok(centerFirst && centerFirst.end === 4.5 * 22050 && centerSecond && centerSecond.start === 3.5 * 22050,
    'el fundido entre notas centra el cruce: la anterior se alarga y la siguiente se adelanta');
  const centerAudio = createRenderer(centerPlan, { limiter: false }).render(22050 * 6).L;
  const centerMid = rms(centerAudio, 3.9, 4.1, 22050);
  const centerSide = (rms(centerAudio, 3.5, 3.7, 22050) + rms(centerAudio, 4.3, 4.5, 22050)) / 2;
  ok(centerMid > centerSide * 0.45, `el cruce no deja un hueco de silencio (${(centerMid / centerSide).toFixed(2)} de nivel en el centro)`);

  const split = splitToneChanges(el, 3);
  ok(split.notes[0] === 'E3' && split.before.length === 1 && split.after.length === 2 && split.after[0].t === 1 && split.after[1].t === 3,
    'al dividir un tone, cada parte conserva su tramo de cambios');
  const trimmed = trimToneStart(el, 3);
  ok(trimmed.notes[0] === 'E3' && trimmed.length === 7 && trimmed.changes.length === 2 && trimmed.changes[0].t === 1,
    'al recortar el principio de un tone, sus cambios se desplazan');
  ok(toneNotesAt(el, 5).length === 2 && toneNotesAt(el, 7).length === 0, 'toneNotesAt devuelve el acorde y el silencio correctos');

  const loopProject = createProject({ seed: 'cambios-loop', duration: 8, end: { mode: 'loop', fadeOut: 0 } });
  const loopTrack = createTrack('pad', loopProject);
  const loopEl = createElement(loopTrack, loopProject, 0, 'tone');
  loopEl.length = 8;
  loopEl.fadeIn = 0;
  loopEl.fadeOut = 0;
  loopEl.notes = ['C3'];
  loopEl.changes = [{ t: 4, notes: ['E3'] }];
  loopTrack.elements.push(loopEl);
  loopProject.tracks.push(loopTrack);
  const loopPlan = compile(loopProject, { sampleRate: 22050, mode: 'export', end: 'loop' });
  const atZero = loopPlan.tracks[0].voices.filter((v) => v.start <= 0 && v.end > 0).length;
  ok(atZero === 1, `un tone con cambios en bucle no superpone todos los tramos al empezar (${atZero} voz)`);
  const loopWav = await renderToWav(loopProject, { sampleRate: 22050, bits: 16, channels: 1, end: 'loop', loudness: null });
  const loopData = decodeWavChannels(new Uint8Array(join(loopWav.parts)));
  const loopSeam = seamScore(loopData.data[0]);
  ok(loopSeam <= 1, `un tone con cambios enlaza el bucle sin costura (${loopSeam.toFixed(2)})`);

  // Los fundidos del elemento se miden en el tiempo del elemento, no en cada
  // tramo: un fundido de entrada largo no se come el primer acorde ni hace que
  // el segundo entre de golpe.
  const outerAudio = (changes) => {
    const op = createProject({ seed: 'fundido-elemento', duration: 12 });
    const ot = createTrack('pad', op);
    ot.id = 't-fundido';
    const oe = createElement(ot, op, 0, 'tone');
    oe.id = 'e-fundido';
    oe.length = 12;
    oe.fadeIn = 4;
    oe.fadeOut = 0;
    oe.notes = ['C3', 'E3', 'G3'];
    if (changes) oe.changes = [{ t: 2, notes: ['C3', 'E3', 'G3'] }];
    ot.elements.push(oe);
    op.tracks.push(ot);
    return createRenderer(compile(op, { sampleRate: 22050 }), { limiter: false }).render(22050 * 6).L;
  };
  const plainFade = outerAudio(false);
  const changedFade = outerAudio(true);
  const ratio = (a, b) => 20 * Math.log10(rms(a, 2.2, 3.8, 22050) / rms(b, 2.2, 3.8, 22050));
  const fadeDiff = ratio(changedFade, plainFade);
  ok(Math.abs(fadeDiff) < 3, `con cambios de nota, el fundido de entrada sigue el del elemento (${fadeDiff.toFixed(1)} dB tras el cambio)`);

  // Repetir: el patrón termina en la última fila y no arrastra el silencio que
  // quedaba al final del elemento.
  const repeatEl = { type: 'tone', start: 0, length: 30, notes: ['C3'], changes: [{ t: 5, notes: ['E3'] }, { t: 10, notes: ['G3'] }] };
  const repeated = repeatToneToEnd(repeatEl, 60);
  const times = repeated.changes.map((c) => c.t);
  ok(repeated.ok && repeated.pattern === 15 && repeated.length === 60 && repeated.reps === 3 && times.join(',') === '5,10,15,20,25,30,35,40,45,50,55',
    'repetir usa el hueco entre notas y no el silencio final del elemento');
  const repeatedFull = repeatToneToEnd({ ...repeatEl, length: 10 }, 60);
  ok(repeatedFull.pattern === 10 && repeatedFull.length === 60, 'si la última fila llega al final, el patrón es el elemento entero');
  const extended = repeatToneToEnd({ type: 'tone', start: 0, length: 10, notes: ['C3'], changes: [] }, 60);
  ok(extended.ok && extended.rows.length === 1 && extended.length === 60 && extended.changes.length === 0,
    'con una sola fila, repetir solo alarga las notas');
  const acrossTheme = repeatToneToEnd({
    type: 'tone', start: 0, length: 60, notes: ['C3'],
    changes: [{ t: 2, notes: ['E3'] }, { t: 4, notes: ['G3'] }],
  }, 60);
  ok(acrossTheme.ok && acrossTheme.pattern === 6 && acrossTheme.length === 60 && acrossTheme.changes.length === 29,
    'repetir también rellena un elemento que ya ocupa todo el tema');
  const already = repeatToneToEnd({ type: 'tone', start: 0, length: 30, notes: ['C3'], changes: [] }, 30);
  ok(!already.ok, 'repetir no hace nada si la nota ya llega al final del tema');
}

/* ------------------------------------------------------------ nubes de notas */

{
  const p = createProject({ seed: 'nube-notas', duration: 20 });
  const track = createTrack('campana', p);
  const el = createElement(track, p, 0, 'cloud');
  ok(el.mode === 'mine' && Array.isArray(el.events) && el.events.length === 0, 'una nube nueva empieza vacía y en modo de notas propias');
  el.length = 10;
  el.events = [{ t: 2, note: 'C4', v: 0.7 }, { t: 5, note: 'E4', v: 0.5 }];
  track.elements.push(el);
  p.tracks.push(track);
  const hits = planStrikeHits(track, el, { a4: 440, key: p.key, elementSeed: seedFrom(p.seed, track.id, el.id, el.seed) });
  ok(hits.length === 2 && hits[0].t === 2 && hits[1].t === 5 && hits[0].freq < hits[1].freq,
    'las notas propias de una nube suenan exactamente en su tiempo');
  const norm = normalizeProject({ schema: 'sen-lab/3', duration: 20, tracks: [{ instrument: 'campana', elements: [{ type: 'cloud', mode: 'mine', start: 0, length: 10, events: [{ t: -1, note: 'C4' }, { t: 3, note: 'E4', v: 2 }, { t: 11, note: 'G4' }] }] }] });
  const ne = norm.project.tracks[0].elements[0];
  ok(ne.mode === 'mine' && ne.events.length === 2 && ne.events[0].t === 0 && ne.events[1].v === 1,
    'las notas propias se recortan y ordenan al validar el proyecto');
  const legacy = normalizeProject({ schema: 'sen-lab/3', duration: 20, tracks: [{ instrument: 'campana', elements: [{ type: 'cloud', start: 0, length: 10, pitches: null }] }] });
  ok(legacy.project.tracks[0].elements[0].mode === 'random', 'las nubes anteriores con pitches se abren en modo aleatorio');
  const aud = auditionProject(p, track, { notes: ['C4', 'E4'], seconds: 2 });
  const audTrack = aud.tracks[0];
  const audHits = planStrikeHits(audTrack, audTrack.elements[0], {
    a4: 440, key: aud.key, elementSeed: seedFrom(aud.seed, audTrack.id, audTrack.elements[0].id, 1),
  });
  ok(audHits.length === 2, 'la audición de una fila con acorde suena con todas sus notas');
  const padAud = auditionProject(p, createTrack('pad', p), { notes: ['C3', 'E3', 'G3'], seconds: 2 });
  ok(padAud.tracks[0].elements[0].notes.length === 3, 'la audición de un acorde sostenido usa todas sus notas');
}

/* ------------------------------------------------------------ teclado en vivo */

{
  // El AudioWorklet «lab-live» usa las voces del motor: un acorde tocado con el
  // teclado suena al mismo nivel que el mismo acorde en la pista.
  const rms = (L, a, b, rate) => {
    let s = 0;
    for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) s += L[i] * L[i];
    return Math.sqrt(s / Math.max(1, Math.round((b - a) * rate)));
  };
  const sr = 48000;
  let LiveProc = null;
  globalThis.sampleRate = sr;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { postMessage() {}, onmessage: null };
    }
  };
  globalThis.registerProcessor = (name, cls) => {
    LiveProc = cls;
  };
  await import('../lab/live-worklet.js');
  const liveLevels = (inst, notes) => {
    const p = createProject({ seed: 'teclado', duration: 20 });
    const t = createTrack(inst, p);
    t.id = `t-teclado-${inst}`;
    const m = p.master;
    const master = { gain: m.gain, reverb: { ...m.reverb }, echo: { ...m.echo }, eq: { ...m.eq } };
    const live = new LiveProc();
    for (const n of notes) live.port.onmessage({ data: { type: 'on', id: n, note: n, track: t, a4: 440, fade: 0.15, seed: p.seed, key: p.key, master } });
    const N = sr * 3;
    // Se compara la suma de los dos canales: el reparto estéreo de los modos
    // depende de la semilla de cada nota.
    const L = new Float32Array(N);
    const oL = new Float32Array(128);
    const oR = new Float32Array(128);
    for (let o = 0; o < N; o += 128) {
      live.process([], [[oL, oR]]);
      for (let i = 0; i < 128 && o + i < N; i++) L[o + i] = oL[i] + oR[i];
    }
    let e;
    if (t.family === 'sustain') {
      e = createElement(t, p, 0, 'tone');
      e.id = 'e-teclado';
      e.length = 10;
      e.fadeIn = 0.15;
      e.fadeOut = 0;
      e.notes = notes;
    } else {
      e = createElement(t, p, 0, 'hit');
      e.id = 'e-teclado';
      e.note = notes[0];
      e.velocity = 0.7;
    }
    t.elements = [e];
    p.tracks = [t];
    const out = createRenderer(compile(p, { sampleRate: sr }), { limiter: false }).render(N);
    const engine = out.L.map((x, i) => x + out.R[i]);
    for (const n of notes) live.port.onmessage({ data: { type: 'off', id: n } });
    const T = new Float32Array(sr * 2);
    for (let o = 0; o < T.length; o += 128) {
      live.process([], [[oL, oR]]);
      T.set(oL.subarray(0, Math.min(128, T.length - o)), o);
    }
    const a = t.family === 'sustain' ? 0.5 : 0;
    const b = t.family === 'sustain' ? 2.5 : 0.5;
    return {
      diff: 20 * Math.log10(rms(L, a, b, sr) / rms(engine, a, b, sr)),
      voices: live.voices.length,
      tail: rms(T, 1.6, 2, sr),
    };
  };
  const padLive = liveLevels('pad', ['C3', 'E3', 'G3']);
  ok(Math.abs(padLive.diff) < 2.5, `teclado: un acorde de pad suena como en la pista (${padLive.diff.toFixed(1)} dB)`);
  ok(padLive.voices === 0, 'teclado: al soltar las teclas las voces sostenidas se liberan');
  const kalLive = liveLevels('kalimba', ['C4']);
  ok(Math.abs(kalLive.diff) < 2.5, `teclado: un golpe de kalimba suena como en la pista (${kalLive.diff.toFixed(1)} dB)`);
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
  const visible = playable.filter((id) => !INSTRUMENTS[id].hidden);
  ok(visible.length === listed.length && visible.every((id) => listed.filter((x) => x === id).length === 1),
    'la biblioteca agrupa todos los instrumentos visibles una sola vez');
}

/* ------------------------------------------------------------ timbres */

{
  const sr = 44100;
  const render = (id, note, { type = null, len = 3, mutate = () => {} } = {}) => {
    const p = createProject({ seed: 'timbres', duration: 30 });
    const t = createTrack(id, p);
    t.id = 't-timbre';
    t.mix.reverb = 0;
    t.mix.pan = 0;
    const e = createElement(t, p, 0, type || (t.family === 'sustain' ? 'tone' : 'hit'));
    e.id = 'e-timbre';
    if (e.type === 'hit') e.note = note;
    else {
      e.notes = [note];
      e.length = len;
      e.fadeIn = 0.05;
      e.fadeOut = 0.05;
    }
    mutate(e, t);
    t.elements = [e];
    p.tracks = [t];
    return createRenderer(compile(p, { sampleRate: sr }), { limiter: false }).render(Math.round(sr * len));
  };
  const lufs = (o) => {
    const m = new LoudnessMeter(sr, 2);
    m.push(o.L, o.R, o.L.length);
    return m.integrated();
  };
  const pitch = (x, at) => {
    const s = Math.round(at * sr);
    let best = 0;
    let lagBest = 0;
    for (let lag = 40; lag < 450; lag++) {
      let c = 0;
      let e1 = 0;
      let e2 = 0;
      for (let i = 0; i < 2048; i++) {
        c += x[s + i] * x[s + i + lag];
        e1 += x[s + i] * x[s + i];
        e2 += x[s + i + lag] * x[s + i + lag];
      }
      c /= Math.sqrt(e1 * e2) || 1;
      if (c > best) {
        best = c;
        lagBest = lag;
      }
    }
    return sr / lagBest;
  };
  const slide = render('slide', 'C4', { len: 1.5 });
  const early = pitch(slide.L, 0.005);
  const late = pitch(slide.L, 0.6);
  ok(early < late * 0.96 && Math.abs(late - 261.63) < 4, `slide: la nota entra deslizándose (${early.toFixed(0)} → ${late.toFixed(0)} Hz)`);

  const ther = render('theremin', 'C4', {
    len: 4,
    mutate: (e) => {
      e.changes = [{ t: 2, notes: ['G4'] }];
    },
  });
  const tMid = pitch(ther.L, 2.02);
  const tEnd = pitch(ther.L, 3);
  ok(tMid > 275 && tMid < 380 && Math.abs(tEnd - 392) < 6, `theremin: portamento de Do4 a Sol4 (${tMid.toFixed(0)} Hz en el cambio → ${tEnd.toFixed(0)} Hz)`);

  const gp = createProject({ seed: 'gaviotas', duration: 20 });
  const gt = createTrack('pajaro', gp);
  gt.id = 't-gaviota';
  gt.params.species = 'gaviota';
  const gull = createRenderer(compile(auditionProject(gp, gt, { seconds: 4 }), { sampleRate: sr, audition: true }), { limiter: false }).render(sr * 4);
  let gpk = 0;
  for (let i = 0; i < gull.L.length; i++) gpk = Math.max(gpk, Math.abs(gull.L[i]), Math.abs(gull.R[i]));
  ok(gpk > 0.01 && gpk < 1, `pájaros: las gaviotas suenan (pico ${(20 * Math.log10(gpk)).toFixed(1)} dBFS)`);

  const bowl = render('cuenco', 'C4', { len: 3 });
  let lr = 0;
  let ll = 0;
  let rr = 0;
  for (let i = 0; i < bowl.L.length; i++) {
    lr += bowl.L[i] * bowl.R[i];
    ll += bowl.L[i] * bowl.L[i];
    rr += bowl.R[i] * bowl.R[i];
  }
  const corr = lr / Math.sqrt(ll * rr);
  ok(corr < 0.98, `cuenco tibetano: sus pares de modos giran en estéreo (correlación L/R ${corr.toFixed(2)})`);

  const bell = render('fmBell', 'C5', { len: 1 });
  const N = 8192;
  let hi = 0;
  let all = 0;
  for (let k = 1; k < N / 2; k += 4) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const w = (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)) * bell.L[2000 + i];
      re += w * Math.cos((2 * Math.PI * k * i) / N);
      im += w * Math.sin((2 * Math.PI * k * i) / N);
    }
    const e = re * re + im * im;
    all += e;
    if ((k * sr) / N > 10000) hi += e;
  }
  ok(hi / all < 0.05, `campana FM: sin bandas laterales ásperas por encima de 10 kHz (${((100 * hi) / all).toFixed(1)} %)`);

  const choir = ['C2', 'C3', 'C4', 'C5'].map((n) => lufs(render('coro', n, { len: 6 })));
  const spread = Math.max(...choir) - Math.min(...choir);
  ok(spread < 4, `coro: sonoridad pareja en todos los registros (${spread.toFixed(1)} LU entre Do2 y Do5)`);

  const rain = render('paloLluvia', 'C5', { len: 5 });
  const segRms = (x, a, b) => Math.sqrt(x.subarray(Math.round(a * sr), Math.round(b * sr)).reduce((s, v) => s + v * v, 0) / ((b - a) * sr));
  ok(segRms(rain.L, 0.5, 1.5) > 1e-3 && segRms(rain.L, 2.5, 3) > 1e-4 && segRms(rain.L, 4.6, 5) < segRms(rain.L, 0.5, 1.5) * 0.3,
    'palo de lluvia: el vuelco crece, se sostiene y se apaga');

  // Los sostenidos nuevos enlazan el bucle sin costura (frecuencias y
  // moduladores periódicos).
  for (const id of ['eolica', 'cuencoCanto']) {
    const lp = createProject({ seed: `bucle-${id}`, duration: 10, end: { mode: 'loop', fadeOut: 0 } });
    const lt = createTrack(id, lp);
    lt.id = `t-${id}`;
    const le = createElement(lt, lp, 0, 'tone');
    le.id = 'e-bucle';
    le.length = 10;
    le.fadeIn = 0;
    le.fadeOut = 0;
    lt.elements = [le];
    lp.tracks = [lt];
    const wav = await renderToWav(lp, { sampleRate: 22050, bits: 16, channels: 1, end: 'loop', loudness: null });
    const data = decodeWavChannels(new Uint8Array(join(wav.parts)));
    const seam = seamScore(data.data[0]);
    ok(seam <= 1, `${INSTRUMENTS[id].label} enlaza el bucle sin costura (${seam.toFixed(2)})`);
  }
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
  ok(project.name === '03' && project.scene?.file === '03.wav' && project.tracks.every((t) => t.source.file === '03.wav'),
    `el tema y sus capas llevan el nombre del archivo (${project.name}, ${project.scene?.file})`);
  const legacy = normalizeProject({ ...project, name: 'Bosque · 03 · Bosque después de la lluvia' }).project;
  ok(legacy.name === '03', `un proyecto guardado con el nombre de catálogo adopta el del archivo (${legacy.name})`);
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
  const { r } = await sceneProject('mar', 1);
  const dur = r.layers[0].data.length / r.sampleRate;
  ok(r.layers.length > 1 && Math.abs(dur - 60) < 0.001, `las pistas publicadas son bucles de 60 s separables en capas (mar/01: ${r.layers.length} capas, ${dur.toFixed(1)} s)`);
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
