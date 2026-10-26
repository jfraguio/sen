/**
 * AudioWorkletProcessor «lab-player»: reproduce en cola los bloques que le
 * envía el Worker de escucha, sin huecos. Remuestrea si el bloque viene a otra
 * frecuencia (calidad reducida) y devuelve posición y medidores.
 */

class LabPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.cur = null;
    this.pos = 0;
    this.gen = 0;
    this.volume = 1;
    this.vol = 1;
    this.fade = null;
    this.worker = null;
    this.lastPost = 0;
    this.active = false;
    this.lastUnderrun = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'port') {
        this.worker = m.port;
        this.worker.onmessage = (ev) => this.onWorker(ev.data);
      } else if (m.type === 'volume') this.volume = m.value;
    };
  }

  onWorker(m) {
    if (m.type === 'flush') {
      if (this.cur) this.fade = { block: this.cur, pos: this.pos, left: 240, total: 240 };
      this.gen = m.gen;
      this.queue = [];
      this.cur = null;
      this.pos = 0;
      this.active = !m.stop;
    } else if (m.type === 'block' || m.type === 'end') {
      if (m.gen === this.gen) {
        this.queue.push(m);
        this.active = true;
      }
    }
  }

  sampleAt(block, pos) {
    const L = block.L;
    const R = block.R;
    const i = pos | 0;
    if (block.rate === sampleRate) return [L[i], R[i]];
    const f = pos - i;
    const j = Math.min(L.length - 1, i + 1);
    return [L[i] + (L[j] - L[i]) * f, R[i] + (R[j] - R[i]) * f];
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const OL = out[0];
    const OR = out[1] || out[0];
    const n = OL.length;
    for (let i = 0; i < n; i++) {
      let l = 0;
      let r = 0;
      while (!this.cur && this.queue.length) {
        const next = this.queue.shift();
        if (next.type === 'end') {
          this.active = false;
          this.port.postMessage({ type: 'ended' });
          continue;
        }
        this.cur = next;
        this.pos = 0;
        this.port.postMessage({ type: 'pos', time: next.time, meters: next.meters });
        this.lastPost = currentTime;
      }
      if (this.cur) {
        const c = this.cur;
        [l, r] = this.sampleAt(c, this.pos);
        this.pos += c.rate / sampleRate;
        if (this.pos >= c.L.length) {
          this.worker?.postMessage({ type: 'played', gen: c.gen, seconds: c.L.length / c.rate });
          this.cur = null;
        }
      } else if (this.active && currentTime - this.lastUnderrun > 0.5) {
        this.lastUnderrun = currentTime;
        this.port.postMessage({ type: 'underrun' });
      }
      if (this.fade) {
        const f = this.fade;
        if (f.pos < f.block.L.length && f.left > 0) {
          const [fl, fr] = this.sampleAt(f.block, f.pos);
          const g = f.left / f.total;
          l += fl * g;
          r += fr * g;
          f.pos += f.block.rate / sampleRate;
          f.left--;
        } else this.fade = null;
      }
      this.vol += (this.volume - this.vol) * 0.002;
      OL[i] = l * this.vol;
      OR[i] = r * this.vol;
    }
    if (this.cur && currentTime - this.lastPost > 0.05) {
      this.lastPost = currentTime;
      this.port.postMessage({ type: 'pos', time: this.cur.time + this.pos / this.cur.rate, meters: null });
    }
    return true;
  }
}

registerProcessor('lab-player', LabPlayer);
