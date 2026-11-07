/**
 * Puente de audio: AudioContext, AudioWorklet «lab-player» y Worker de
 * escucha unidos por un MessageChannel directo.
 *
 * El modo teclado usa un segundo AudioWorklet, «lab-live», con las mismas
 * voces del motor: las notas que tocas suenan al instante, sin esperar a que
 * el motor recompile, y con el mismo timbre, mezcla y reverb que en el tema.
 */

import { echoTime } from '../engine/index.js';
import { LIMITS, masterDefaults } from '../engine/schema.js';

const noteKey = (note) => (note && typeof note === 'object' ? `hz:${note.hz}` : String(note));

/** Bus maestro tal como lo aplica el motor (eco sincronizado y reverb limitada). */
function liveMaster(project) {
  const m = project?.master || masterDefaults();
  return {
    gain: m.gain ?? 0,
    reverb: { ...m.reverb, decay: Math.min(LIMITS.reverbDecay, m.reverb?.decay ?? 4.5) },
    echo: { ...m.echo, time: echoTime(m.echo, project?.tempo) },
    eq: { ...(m.eq || {}) },
  };
}

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
    this.liveNode = null;
    this.liveReady = null;
    this.live = new Set();
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
    // El teclado se prepara aparte: si fallara, la escucha del tema sigue.
    this.liveReady = this.ctx.audioWorklet.addModule(new URL('../live-worklet.js', import.meta.url))
      .then(() => {
        this.liveGain = this.ctx.createGain();
        this.liveGain.gain.value = this.volume;
        this.liveGain.connect(this.ctx.destination);
        this.liveNode = new AudioWorkletNode(this.ctx, 'lab-live', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        this.liveNode.connect(this.liveGain);
        return this.liveNode;
      })
      .catch((err) => {
        console.warn('Teclado sin audio:', err);
        return null;
      });
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

  /**
   * Toca una nota con el teclado en el AudioWorklet «lab-live»: las mismas
   * voces del motor, con la mezcla de la pista y el bus maestro del tema.
   * `opts`: `{ a4, fade, project }`; `fade` es el fundido entre notas (s).
   */
  async noteOn(note, track, { a4 = 440, fade = 0.15, project = null } = {}) {
    const key = noteKey(note);
    const token = (this.liveSeq.get(key) || 0) + 1;
    this.liveSeq.set(key, token);
    let node = null;
    try {
      await this.ensure();
      node = await this.liveReady;
    } catch {
      return;
    }
    // La tecla pudo soltarse (o repetirse) mientras se preparaba el contexto.
    if (this.liveSeq.get(key) !== token || !node || !track) return;
    this.live.add(key);
    node.port.postMessage({
      type: 'on',
      id: key,
      note,
      track: { id: track.id, family: track.family, instrument: track.instrument, params: track.params, mix: track.mix },
      a4,
      fade,
      seed: project?.seed,
      key: project?.key,
      master: liveMaster(project),
    });
  }

  /** Suelta una nota del teclado. `fast`: sin cruce (reinicio o robo de voz). */
  noteOff(note, fast = false) {
    const key = noteKey(note);
    this.liveSeq.set(key, (this.liveSeq.get(key) || 0) + 1);
    if (!this.live.has(key)) return;
    this.live.delete(key);
    this.liveNode?.port.postMessage({ type: 'off', id: key, fast });
  }

  allNotesOff() {
    for (const key of this.liveSeq.keys()) this.liveSeq.set(key, (this.liveSeq.get(key) || 0) + 1);
    this.live.clear();
    this.liveNode?.port.postMessage({ type: 'all-off' });
  }

  /** Posición actual estimada (s). */
  currentTime() {
    if (!this.playing) return this.pos.time;
    return this.pos.time + Math.min(0.12, (performance.now() - this.pos.at) / 1000);
  }

  /** Escucha un instrumento o una nota unos segundos. */
  async audition(project, track, { note = null, notes = null, seconds = 3 } = {}) {
    await this.ensure();
    const id = ++this.auditionId;
    this.worker.postMessage({ type: 'audition', id, project: { key: project.key, tuning: project.tuning, master: project.master }, track, note, notes, seconds });
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
