/**
 * Audio de ambiente con Web Audio.
 *
 * Usa un AudioBufferSourceNode en bucle y un GainNode para el volumen: así el
 * fundido funciona también en iOS, donde `HTMLMediaElement.volume` no es
 * fiable. Reutiliza un único AudioContext y cachea los buffers ya descargados.
 * Si un archivo no existe, la sesión visual continúa y se avisa en pantalla.
 */
export class AmbientAudio {
  constructor({ onError } = {}) {
    this.onError = onError;
    this.src = '';
    this.failed = false;
    this.volume = 0;
    this.ctx = null;
    this.gain = null;
    this.source = null;
    this.buffer = null;
    this.cache = new Map();
    this._shouldPlay = false;
    this._loadToken = 0;
  }

  prepare() {
    const ctx = this._ensureContext();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  async play(src) {
    const token = ++this._loadToken;
    this._shouldPlay = true;
    this.src = src;
    this.failed = false;
    this.stopSource();

    const ctx = this._ensureContext();
    if (!ctx) {
      this._fail(new Error('Web Audio no está disponible'));
      return false;
    }

    try {
      // Debe ocurrir dentro del gesto del usuario.
      if (ctx.state !== 'running') await ctx.resume();
      const buffer = await this._loadBuffer(src);
      if (token !== this._loadToken) return false;
      this.buffer = buffer;
      this._startSource();
      return true;
    } catch (error) {
      if (token === this._loadToken) this._fail(error);
      return false;
    }
  }

  setGain(value) {
    const next = Math.min(1, Math.max(0, value));
    if (Math.abs(next - this.volume) < 0.0008) return;
    this.volume = next;
    if (this.gain) this.gain.gain.value = next;
  }

  pause() {
    this._shouldPlay = false;
    if (!this.ctx) return;
    this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (!this.src || this.failed || !this.ctx) return;
    this._shouldPlay = true;
    this.ctx.resume().catch(() => {});
  }

  stop() {
    this._shouldPlay = false;
    this._loadToken++;
    this.stopSource();
    this.volume = 0;
    if (this.gain) this.gain.gain.value = 0;
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
  }

  _ensureContext() {
    if (this.ctx) return this.ctx;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      this.ctx = new AudioContextClass();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.gain = null;
      return null;
    }
    return this.ctx;
  }

  async _loadBuffer(src) {
    if (this.cache.has(src)) return this.cache.get(src);
    const response = await fetch(src, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`No se pudo cargar el audio (${response.status})`);
    const data = await response.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.cache.set(src, buffer);
    return buffer;
  }

  _startSource() {
    this.stopSource();
    if (!this.buffer || !this.ctx || !this.gain) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(this.gain);
    source.start();
    this.source = source;
  }

  stopSource() {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      /* ya estaba detenido */
    }
    try {
      this.source.disconnect();
    } catch {
      /* sin conexión */
    }
    this.source = null;
  }

  _fail(error) {
    if (this.failed) return;
    this.failed = true;
    this.onError?.(error);
  }
}
