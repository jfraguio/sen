/**
 * Analiza escenas WAV: formato, duración, pico, sonoridad integrada (LUFS
 * aproximados), salto en la costura del bucle y, opcionalmente, espectrogramas.
 *
 * Uso:
 *   node scripts/analyze-audio.mjs                       # todas las escenas
 *   node scripts/analyze-audio.mjs assets/audio/mar      # una carpeta
 *   node scripts/analyze-audio.mjs --png=/tmp/espectros  # + espectrogramas
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodeWav, loudness } from './lib/dsp.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const pngArg = args.find((a) => a.startsWith('--png='));
const pngDir = pngArg ? pngArg.slice(6) : null;
const targets = args.filter((a) => !a.startsWith('--'));
if (!targets.length) targets.push(path.join(here, '..', 'assets', 'audio'));

function collect(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return p.endsWith('.wav') ? [p] : [];
  return fs.readdirSync(p).sort().flatMap((n) => collect(path.join(p, n)));
}

/** Salto en la costura comparado con el percentil 99,9 de los saltos internos. */
function seamScore(x) {
  const diffs = new Float32Array(x.length - 1);
  for (let i = 1; i < x.length; i++) diffs[i - 1] = Math.abs(x[i] - x[i - 1]);
  const sorted = Float32Array.from(diffs).sort();
  const p999 = sorted[Math.floor(sorted.length * 0.999)] || 1e-9;
  const jump = Math.abs(x[0] - x[x.length - 1]);
  return jump / p999;
}

/** Diferencia de energía (dB) entre los últimos y los primeros 100 ms. */
function seamLevel(x, sr) {
  const w = Math.round(0.1 * sr);
  const e = (a, b) => {
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    return Math.sqrt(s / (b - a)) + 1e-9;
  };
  return 20 * Math.log10(e(x.length - w, x.length) / e(0, w));
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function color(v) {
  // v ∈ [0, 1] → paleta oscura tipo "magma".
  const stops = [[0, 0, 4], [40, 11, 84], [140, 41, 129], [222, 73, 104], [254, 159, 109], [252, 253, 191]];
  const p = Math.min(0.9999, Math.max(0, v)) * (stops.length - 1);
  const i = Math.floor(p), f = p - i;
  return stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f));
}
function spectrogram(x, sr, file) {
  const size = 1024, hop = 256, rows = 300;
  const cols = Math.floor((x.length - size) / hop);
  const win = Float32Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const mags = [];
  let mx = -200;
  for (let c = 0; c < cols; c++) {
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = x[c * hop + i] * win[i];
    fft(re, im);
    const col = new Float32Array(rows);
    for (let r = 0; r < rows; r++) {
      // Eje de frecuencia logarítmico de 40 Hz a Nyquist.
      const f = 40 * Math.pow(sr / 2 / 40, r / (rows - 1));
      const bin = Math.min(size / 2 - 1, Math.round((f / sr) * size));
      const m = 10 * Math.log10(re[bin] ** 2 + im[bin] ** 2 + 1e-14);
      col[r] = m;
      mx = Math.max(mx, m);
    }
    mags.push(col);
  }
  const width = Math.min(cols, 1200);
  const rgb = Buffer.alloc(width * rows * 3);
  for (let xpx = 0; xpx < width; xpx++) {
    const col = mags[Math.floor((xpx * cols) / width)];
    for (let r = 0; r < rows; r++) {
      const v = (col[r] - (mx - 90)) / 90;
      const [R, G, B] = color(v);
      const o = ((rows - 1 - r) * width + xpx) * 3;
      rgb[o] = R; rgb[o + 1] = G; rgb[o + 2] = B;
    }
  }
  fs.writeFileSync(file, png(width, rows, rgb));
}

const files = targets.flatMap(collect);
if (pngDir) fs.mkdirSync(pngDir, { recursive: true });
console.log('archivo                         Hz     s    pico(dBFS)  LUFS   costura  Δnivel(dB)');
for (const file of files) {
  const wav = decodeWav(new Uint8Array(fs.readFileSync(file)));
  const x = wav.samples;
  let bad = 0, pk = 0;
  for (const v of x) {
    if (!Number.isFinite(v)) bad++;
    pk = Math.max(pk, Math.abs(v));
  }
  const name = path.relative(path.join(here, '..', 'assets', 'audio'), file);
  const lufs = loudness(x, wav.sampleRate);
  const seam = seamScore(x);
  const lvl = seamLevel(x, wav.sampleRate);
  // Δnivel es informativo: en escenas con eventos dispersos varía con naturalidad.
  const flag = bad || pk >= 0.999 || seam > 1 ? '  <-- revisar' : '';
  console.log(
    `${name.padEnd(30)} ${String(wav.sampleRate).padStart(6)} ${(x.length / wav.sampleRate).toFixed(1).padStart(5)}`
    + ` ${(20 * Math.log10(pk + 1e-9)).toFixed(1).padStart(9)} ${lufs.toFixed(1).padStart(8)}`
    + ` ${seam.toFixed(2).padStart(8)} ${lvl.toFixed(1).padStart(9)}${flag}`,
  );
  if (pngDir) spectrogram(x, wav.sampleRate, path.join(pngDir, name.replace(/[\\/]/g, '-').replace('.wav', '.png')));
}
