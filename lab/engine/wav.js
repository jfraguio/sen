/**
 * Escritura y lectura de WAV.
 *
 * `WavWriter` escribe PCM por trozos (~1 MB) sin guardar el audio entero en
 * coma flotante. Añade `LIST/INFO` y el chunk propio `senp` con el proyecto.
 */

import { seedFrom, unitAt } from './rng.js';

const CHUNK_BYTES = 1 << 20;
const DITHER_A = seedFrom('sen-lab', 'dither', 'a');
const DITHER_B = seedFrom('sen-lab', 'dither', 'b');

export class WavWriter {
  constructor({ sampleRate, channels = 2, bits = 24 }) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.bits = bits;
    this.float = bits === 32;
    this.bytesPer = bits / 8;
    this.frameBytes = this.bytesPer * channels;
    this.parts = [];
    this.buf = new Uint8Array(CHUNK_BYTES - (CHUNK_BYTES % this.frameBytes));
    this.view = new DataView(this.buf.buffer);
    this.pos = 0;
    this.frames = 0;
    this.dataBytes = 0;
  }
  flushChunk() {
    if (this.pos) this.parts.push(this.buf.slice(0, this.pos));
    this.pos = 0;
  }
  /** Escribe `n` muestras de `L`/`R` (desde `from`). Mono: (L+R)/2. */
  write(L, R, n, from = 0) {
    const ch = this.channels;
    for (let i = from; i < from + n; i++) {
      if (this.pos + this.frameBytes > this.buf.length) this.flushChunk();
      const frame = this.frames++;
      if (ch === 1) this.sample((L[i] + R[i]) * 0.5, frame * 2);
      else {
        this.sample(L[i], frame * 2);
        this.sample(R[i], frame * 2 + 1);
      }
    }
    this.dataBytes = this.frames * this.frameBytes;
  }
  sample(x, idx) {
    const v = this.view;
    const p = this.pos;
    if (this.float) {
      v.setFloat32(p, Number.isFinite(x) ? x : 0, true);
    } else if (this.bits === 16) {
      const d = unitAt(DITHER_A, idx) - unitAt(DITHER_B, idx);
      let s = Math.round((Number.isFinite(x) ? x : 0) * 32767 + d);
      s = s < -32768 ? -32768 : s > 32767 ? 32767 : s;
      v.setInt16(p, s, true);
    } else {
      let s = Math.round((Number.isFinite(x) ? x : 0) * 8388607);
      s = s < -8388608 ? -8388608 : s > 8388607 ? 8388607 : s;
      v.setUint8(p, s & 0xff);
      v.setUint8(p + 1, (s >> 8) & 0xff);
      v.setUint8(p + 2, (s >> 16) & 0xff);
    }
    this.pos += this.bytesPer;
  }
  /** Cierra el archivo: devuelve la lista de trozos (cabecera primero). */
  finish({ info = {}, senp = null } = {}) {
    this.flushChunk();
    const enc = new TextEncoder();
    const tail = [];
    if (this.dataBytes & 1) tail.push(new Uint8Array(1));
    // LIST/INFO
    const infoParts = [];
    for (const [id, text] of Object.entries(info)) {
      if (!text) continue;
      const bytes = enc.encode(String(text));
      const size = bytes.length + 1;
      const chunk = new Uint8Array(8 + size + (size & 1));
      writeId(chunk, 0, id);
      new DataView(chunk.buffer).setUint32(4, size, true);
      chunk.set(bytes, 8);
      infoParts.push(chunk);
    }
    if (infoParts.length) {
      const body = infoParts.reduce((s, c) => s + c.length, 0);
      const head = new Uint8Array(12);
      writeId(head, 0, 'LIST');
      new DataView(head.buffer).setUint32(4, body + 4, true);
      writeId(head, 8, 'INFO');
      tail.push(head, ...infoParts);
    }
    if (senp) {
      const bytes = enc.encode(senp);
      const chunk = new Uint8Array(8 + bytes.length + (bytes.length & 1));
      writeId(chunk, 0, 'senp');
      new DataView(chunk.buffer).setUint32(4, bytes.length, true);
      chunk.set(bytes, 8);
      tail.push(chunk);
    }
    const tailBytes = tail.reduce((s, c) => s + c.length, 0);
    const fmtSize = this.float ? 18 : 16;
    const factBytes = this.float ? 12 : 0;
    const header = new Uint8Array(12 + 8 + fmtSize + factBytes + 8);
    const v = new DataView(header.buffer);
    writeId(header, 0, 'RIFF');
    v.setUint32(4, header.length - 8 + this.dataBytes + tailBytes, true);
    writeId(header, 8, 'WAVE');
    writeId(header, 12, 'fmt ');
    v.setUint32(16, fmtSize, true);
    v.setUint16(20, this.float ? 3 : 1, true);
    v.setUint16(22, this.channels, true);
    v.setUint32(24, this.sampleRate, true);
    v.setUint32(28, this.sampleRate * this.frameBytes, true);
    v.setUint16(32, this.frameBytes, true);
    v.setUint16(34, this.bits, true);
    let p = 36;
    if (this.float) {
      v.setUint16(36, 0, true);
      p = 38;
      writeId(header, p, 'fact');
      v.setUint32(p + 4, 4, true);
      v.setUint32(p + 8, this.frames, true);
      p += 12;
    }
    writeId(header, p, 'data');
    v.setUint32(p + 4, this.dataBytes, true);
    return [header, ...this.parts, ...tail];
  }
}

function writeId(bytes, offset, id) {
  for (let i = 0; i < 4; i++) bytes[offset + i] = id.charCodeAt(i);
}

/** Lista de chunks de un WAV: `{ id, offset, size }`. */
export function wavChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const id = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 12 || id(0) !== 'RIFF' || id(8) !== 'WAVE') return null;
  const out = [];
  let p = 12;
  while (p + 8 <= bytes.length) {
    const size = view.getUint32(p + 4, true);
    out.push({ id: id(p), offset: p + 8, size });
    p += 8 + size + (size & 1);
  }
  return out;
}

/** Proyecto incrustado en el chunk `senp`, o `null`. */
export function readSenpProject(bytes) {
  const chunks = wavChunks(bytes);
  const c = chunks && chunks.find((x) => x.id === 'senp');
  if (!c) return null;
  const text = new TextDecoder().decode(bytes.subarray(c.offset, c.offset + c.size));
  return JSON.parse(text);
}

/** Decodifica un WAV PCM 16/24 bits o float 32 a canales `Float32Array`. */
export function decodeWavChannels(bytes) {
  const chunks = wavChunks(bytes);
  if (!chunks) throw new Error('WAV no válido');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fmt = chunks.find((c) => c.id === 'fmt ');
  const data = chunks.find((c) => c.id === 'data');
  if (!fmt || !data) throw new Error('WAV no válido');
  const format = view.getUint16(fmt.offset, true);
  const channels = view.getUint16(fmt.offset + 2, true);
  const sampleRate = view.getUint32(fmt.offset + 4, true);
  const bits = view.getUint16(fmt.offset + 14, true);
  const bp = bits / 8;
  const frames = Math.floor(data.size / (bp * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const o = data.offset + (i * channels + c) * bp;
      let s;
      if (format === 3) s = view.getFloat32(o, true);
      else if (bits === 24) s = (bytes[o] | (bytes[o + 1] << 8) | ((bytes[o + 2] << 24) >> 8)) / 8388608;
      else s = view.getInt16(o, true) / 32768;
      out[c][i] = s;
    }
  }
  return { sampleRate, channels, bits, format, data: out };
}
