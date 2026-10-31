/**
 * Puente de audio: AudioContext, AudioWorklet «lab-player» y Worker de
 * escucha unidos por un MessageChannel directo.
 *
 * Incluye un sintetizador ligero para el modo teclado: las notas que tocas con
 * el ordenador suenan al instante, sin esperar a que el motor recompile.
 */

import { trackParams } from '../engine/schema.js';
import { noteFrequency } from '../engine/music.js';

const noteKey = (note) => (note && typeof note === 'object' ? `hz:${note.hz}` : String(note));

export class LabAudio {
  constructor(handlers = {}) {
    this.h = handlers;
    this.ctx = null;
    this.node = null;
    this.ready = null;
    this.project = null;
    this.sendTimer = 0;
    this.lastSend = 0;
    this.playing = false;
    this.pos = { time: 0, at: 0 };
    this.volume = 0.8;
    this.auditionId = 0;
    this.auditionSrc = null;
    this.samples = {};
    this.monitorMute = null;
    this.liveGain = null;
    this.live = new Map();
    this.liveSeq = new Map();
    this.createWorker();
  }

  createWorker() {
    this.worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.onWorker(e.data);
    this.worker.onerror = (e) => {
      e.preventDefault?.();
      this.playing = false;
      this.h.onError?.('El motor se ha detenido.');
    };
  }

  /** Reinicia el motor tras un fallo. */
  restart() {
    this.worker.terminate();
    this.createWorker();
    if (this.node) this.connect();
    if (Object.keys(this.samples).length) this.worker.postMessage({ type: 'samples', samples: this.samples });
    this.postProject();
  }

  /** Proyecto que recibe el motor: durante la grabación, la pista se silencia. */
  monitored() {
    const p = this.project;
    if (!p || !this.monitorMute) return p;
    return {
      ...p,
      tracks: p.tracks.map((t) => (t.id === this.monitorMute ? { ...t, mix: { ...t.mix, mute: true } } : t)),
    };
  }

  postProject() {
    const project = this.monitored();
    if (project) this.worker.postMessage({ type: 'project', project });
  }

  /** Silencia (o vuelve a dejar sonar) una pista mientras se graba con el teclado. */
  setMonitorMute(trackId) {
    this.monitorMute = trackId || null;
    if (this.project) this.setProject(this.project);
  }

  /** Audio de las capas de pistas de sen: `{ clave: { rate, data, id } }`. */
  setSamples(samples) {
    this.samples = { ...this.samples, ...samples };
    this.worker.postMessage({ type: 'samples', samples });
  }

  /** Crea o reanuda el contexto. Llamar dentro del gesto del usuario. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ready;
    }
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ready = (async () => {
      await this.ctx.audioWorklet.addModule(new URL('../player-worklet.js', import.meta.url));
      this.node = new AudioWorkletNode(this.ctx, 'lab-player', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.node.connect(this.ctx.destination);
      this.node.port.onmessage = (e) => this.onPlayer(e.data);
      this.node.port.postMessage({ type: 'volume', value: this.volume });
      this.connect();
      // Las capas viajan aparte del proyecto; hay que reenviarlas al conectar
      // (o tras reiniciar el motor) para que el worker pueda compilarlas.
      if (Object.keys(this.samples).length) this.worker.postMessage({ type: 'samples', samples: this.samples });
      this.postProject();
    })();
    return this.ready;
  }

  connect() {
    const ch = new MessageChannel();
    this.node.port.postMessage({ type: 'port', port: ch.port2 }, [ch.port2]);
    this.worker.postMessage({ type: 'init', sampleRate: this.ctx.sampleRate, port: ch.port1 }, [ch.port1]);
  }

  /** Envía el proyecto (como mucho una revisión cada 60 ms). */
  setProject(project) {
    this.project = project;
    const now = performance.now();
    const send = () => {
      this.sendTimer = 0;
      this.lastSend = performance.now();
      this.postProject();
    };
    if (this.sendTimer) return;
    if (now - this.lastSend >= 60) send();
    else this.sendTimer = setTimeout(send, 60 - (now - this.lastSend));
  }

  async play(from, loop) {
    await this.ensure();
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = 0;
      this.postProject();
    }
    this.playing = true;
    this.pos = { time: from, at: performance.now() };
    this.worker.postMessage({ type: 'play', from, loop: loop || null });
  }

  pause() {
    this.playing = false;
    this.worker.postMessage({ type: 'pause' });
  }

  seek(time) {
    this.pos = { time, at: performance.now() };
    if (this.playing) this.worker.postMessage({ type: 'seek', time });
  }

  setLoop(loop) {
    this.worker.postMessage({ type: 'loop', loop: loop || null });
  }

  setVolume(v) {
    this.volume = v;
    this.node?.port.postMessage({ type: 'volume', value: v });
    if (this.auditionGain) this.auditionGain.gain.value = v;
    if (this.liveGain) this.liveGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /* ------------------------------------------------------------ teclado */

  ensureLive() {
    if (!this.ctx) return null;
    if (!this.liveGain) {
      this.liveGain = this.ctx.createGain();
      this.liveGain.gain.value = this.volume;
      this.liveGain.connect(this.ctx.destination);
    }
    return this.liveGain;
  }

  /**
   * Toca una nota con el teclado. No pasa por el motor: un sintetizador ligero
   * imita el timbre de la pista para responder sin latencia mientras se prueba
   * o se graba. La nota real se escucha al reproducir el tema.
   */
  async noteOn(note, track, a4 = 440) {
    const key = noteKey(note);
    const token = (this.liveSeq.get(key) || 0) + 1;
    this.liveSeq.set(key, token);
    try {
      await this.ensure();
    } catch {
      return;
    }
    // La tecla pudo soltarse (o repetirse) mientras se preparaba el contexto.
    if (this.liveSeq.get(key) !== token) return;
    const out = this.ensureLive();
    if (!out || !track) return;
    this.noteOff(key, true);
    const p = trackParams(track);
    const f = noteFrequency(note, a4);
    const now = this.ctx.currentTime + 0.004;
    const g = this.ctx.createGain();
    g.connect(out);
    const voice = { g, nodes: [] };
    this.live.set(key, voice);
    while (this.live.size > 16) {
      const oldest = this.live.keys().next().value;
      if (oldest === key) break;
      this.noteOff(oldest);
    }
    const peak = 0.1;
    const sustain = track.family === 'sustain';
    const inst = track.instrument;
    const attack = sustain ? 0.035 : 0.004;

    if (sustain) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = p.filterType === 'hp' ? 'highpass' : p.filterType === 'bp' ? 'bandpass' : 'lowpass';
      filter.frequency.value = Math.min(16000, Math.max(80, p.cutoff || 2400));
      filter.Q.value = Math.min(12, Math.max(0.3, p.q || 0.7));
      filter.connect(g);
      const kind = inst === 'seno' || inst === 'flauta' ? 'sine' : inst === 'cuerdas' || inst.startsWith('pad') || inst === 'brass80' || inst === 'lead80' || inst === 'bass80' ? 'sawtooth' : 'triangle';
      const voices = Math.min(3, Math.max(1, Math.round(p.voices || 1)));
      const detune = Math.min(30, Math.max(0, p.detune || 0));
      for (let k = 0; k < voices; k++) {
        const o = this.ctx.createOscillator();
        o.type = kind;
        o.frequency.value = f;
        const spread = voices > 1 ? (k / (voices - 1)) * 2 - 1 : 0;
        o.detune.value = spread * detune;
        o.connect(filter);
        o.start(now);
        voice.nodes.push(o);
      }
      if (inst === 'drone' || inst === 'bass80') {
        const o = this.ctx.createOscillator();
        const sub = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f / 2;
        sub.gain.value = Math.min(0.5, p.sub ?? 0.3);
        o.connect(sub).connect(filter);
        o.start(now);
        voice.nodes.push(o);
      }
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + attack);
      g.gain.setTargetAtTime(peak * 0.86, now + attack, 0.4);
    } else {
      const decay = Math.min(8, Math.max(0.25, p.decay || 3));
      for (let k = 0; k < 2; k++) {
        const o = this.ctx.createOscillator();
        o.type = k ? 'sine' : inst === 'piano' || inst === 'arpa' || inst === 'guitarra' || inst === 'pulsada' ? 'triangle' : 'sine';
        o.frequency.value = f * (k ? 2.005 : 1);
        o.connect(g);
        o.start(now);
        voice.nodes.push(o);
      }
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak * 1.2, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      for (const o of voice.nodes) o.stop(now + decay + 0.02);
    }
  }

  /** Suelta una nota del teclado. `fast`: sin relajación (reinicio o robo de voz). */
  noteOff(note, fast = false) {
    const key = noteKey(note);
    this.liveSeq.set(key, (this.liveSeq.get(key) || 0) + 1);
    if (!this.ctx) return;
    const voice = this.live.get(key);
    if (!voice) return;
    this.live.delete(key);
    const now = this.ctx.currentTime;
    const rel = fast ? 0.02 : 0.28;
    const g = voice.g.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
    else {
      const v = Math.max(0.0001, g.value);
      g.cancelScheduledValues(now);
      g.setValueAtTime(v, now);
    }
    g.exponentialRampToValueAtTime(0.0001, now + rel);
    for (const o of voice.nodes) {
      try {
        o.stop(now + rel + 0.02);
      } catch {
        /* ya parado */
      }
    }
    setTimeout(() => {
      try {
        voice.g.disconnect();
      } catch {
        /* ya desconectado */
      }
    }, (rel + 0.2) * 1000);
  }

  allNotesOff() {
    for (const key of new Set([...this.live.keys(), ...this.liveSeq.keys()])) this.noteOff(key, true);
  }

  /** Posición actual estimada (s). */
  currentTime() {
    if (!this.playing) return this.pos.time;
    return this.pos.time + Math.min(0.12, (performance.now() - this.pos.at) / 1000);
  }

  /** Escucha un instrumento o una nota unos segundos. */
  async audition(project, track, { note = null, seconds = 3 } = {}) {
    await this.ensure();
    const id = ++this.auditionId;
    this.worker.postMessage({ type: 'audition', id, project: { key: project.key, tuning: project.tuning, master: project.master }, track, note, seconds });
  }

  playBuffer(buf) {
    if (!this.ctx) return;
    try {
      this.auditionSrc?.stop();
    } catch {
      /* ya parado */
    }
    if (!this.auditionGain) {
      this.auditionGain = this.ctx.createGain();
      this.auditionGain.connect(this.ctx.destination);
    }
    this.auditionGain.gain.value = this.volume;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.auditionGain);
    src.start();
    this.auditionSrc = src;
  }

  onWorker(m) {
    if (m.type === 'audition') {
      if (m.id !== this.auditionId || !this.ctx) return;
      const buf = this.ctx.createBuffer(2, m.L.length, m.rate);
      buf.copyToChannel(m.L, 0);
      buf.copyToChannel(m.R, 1);
      this.playBuffer(buf);
    } else if (m.type === 'status') this.h.onStatus?.(m);
    else if (m.type === 'compiled') this.h.onCompiled?.(m);
    else if (m.type === 'error') this.h.onError?.(m.message);
  }

  onPlayer(m) {
    if (m.type === 'pos') {
      this.pos = { time: m.time, at: performance.now() };
      if (m.meters) this.h.onMeters?.(m.meters);
    } else if (m.type === 'ended') {
      this.playing = false;
      this.h.onEnded?.();
    } else if (m.type === 'underrun') this.h.onUnderrun?.();
  }
}
