/**
 * Audio de ambiente con Web Audio.
 *
 * Usa un AudioBufferSourceNode en bucle y un GainNode por voz para el volumen:
 * así el fundido funciona también en iOS, donde `HTMLMediaElement.volume` no es
 * fiable, y se puede cambiar de pista con un crossfade corto. Reutiliza un único
 * AudioContext y cachea los buffers ya descargados.
 *
 * Si un archivo no existe o falla, la sesión visual continúa. Al cambiar de
 * pista, la voz actual sigue sonando hasta que la nueva está lista.
 */
export class AmbientAudio {
  constructor({ onError } = {}) {
    this.onError = onError;
    this.failed = false;
    this.volume = 0;
    this.ctx = null;
    this.gain = null;
    this.voices = new Set();
    this.cache = new Map();
    this._loadToken = 0;
  }

  prepare() {
    const ctx = this._ensureContext();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  async play(src, { fade = 0.15, onError } = {}) {
    const token = ++this._loadToken;
    this.failed = false;

    const ctx = this._ensureContext();
    if (!ctx) {
      this._fail(new Error('Web Audio no está disponible'), onError);
      return false;
    }

    try {
      // Debe ocurrir dentro del gesto del usuario.
      if (ctx.state !== 'running') await ctx.resume();
      const buffer = await this._loadBuffer(src);
      if (token !== this._loadToken) return false;
      this._startSource(buffer, fade);
      return true;
    } catch (error) {
      if (token === this._loadToken) this._fail(error, onError);
      return false;
    }
  }

  setGain(value) {
    const next = Math.min(1, Math.max(0, value));
    if (Math.abs(next - this.volume) < 0.0008) return;
    this.volume = next;
    if (this.gain) this.gain.gain.value = next;
  }

  stop() {
    this._loadToken++;
    this._stopVoices();
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

  /**
   * Arranca una voz nueva y retira las anteriores con un crossfade.
   * La carga del buffer ocurre antes, de modo que un fallo no corta el audio
   * que ya estaba sonando.
   */
  _startSource(buffer, fade = 0) {
    if (!buffer || !this.ctx || !this.gain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(fade > 0 ? 0 : 1, now);
    voiceGain.connect(this.gain);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(voiceGain);
    source.start(now);

    if (fade > 0) voiceGain.gain.linearRampToValueAtTime(1, now + fade);

    const voice = { source, gain: voiceGain };
    this.voices.add(voice);
    source.addEventListener('ended', () => this._forgetVoice(voice), { once: true });

    for (const other of [...this.voices]) {
      if (other !== voice) this._retireVoice(other, Math.max(0.12, fade));
    }
  }

  _retireVoice(voice, fade) {
    if (!this.voices.has(voice)) return;
    if (!this.ctx || fade <= 0) {
      this._stopVoice(voice);
      return;
    }
    const now = this.ctx.currentTime;
    const param = voice.gain.gain;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(0, now + fade);
      voice.source.stop(now + fade + 0.03);
    } catch {
      this._stopVoice(voice);
    }
  }

  _forgetVoice(voice) {
    if (!this.voices.delete(voice)) return;
    try {
      voice.source.disconnect();
    } catch {
      /* sin conexión */
    }
    try {
      voice.gain.disconnect();
    } catch {
      /* sin conexión */
    }
  }

  _stopVoice(voice) {
    if (!this.voices.has(voice)) return;
    this.voices.delete(voice);
    try {
      voice.source.stop();
    } catch {
      /* ya estaba detenido */
    }
    try {
      voice.source.disconnect();
    } catch {
      /* sin conexión */
    }
    try {
      voice.gain.disconnect();
    } catch {
      /* sin conexión */
    }
  }

  _stopVoices() {
    for (const voice of [...this.voices]) this._stopVoice(voice);
  }

  _fail(error, handler = this.onError) {
    if (this.failed) return;
    this.failed = true;
    handler?.(error);
  }
}
