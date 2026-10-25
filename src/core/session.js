const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/**
 * Reloj de una sesión.
 * - Duración configurable, con fundido de luz/audio en los últimos 30 s.
 * - Al llegar al final: fase `hold` (pantalla casi negra) y después `complete`.
 * - Terminar a mano: fase `manual` con un fundido de 2 s.
 * - La pausa congela el tiempo.
 *
 * Los valores de luz (0..1) y ganancia (0..1) son aproximaciones visuales:
 * la app los aplica al velo negro y al volumen del audio.
 */
export class Session {
  constructor({
    durationMs,
    fadeOutMs,
    holdMs,
    manualFadeMs,
    onUpdate,
    onComplete,
  }) {
    this.durationMs = durationMs;
    this.fadeOutMs = fadeOutMs;
    this.holdMs = holdMs;
    this.manualFadeMs = manualFadeMs;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;

    this.phase = 'idle';
    this._startedAt = 0;
    this._pausedAt = 0;
    this._pausedTotal = 0;
    this._frozenElapsed = 0;
    this._holdAt = 0;
    this._manualAt = 0;
    this._manualFrom = { light: 0, gain: 1 };
    this._raf = 0;
    this._interval = 0;
    this._done = false;
  }

  start() {
    if (this.phase !== 'idle') return;
    this.phase = 'running';
    this._startedAt = performance.now();
    this._emit();
    this._raf = requestAnimationFrame(this._frame);
    // Respaldo para pestañas en segundo plano, donde rAF se detiene.
    this._interval = window.setInterval(() => {
      if (this.phase === 'paused' || this._done) return;
      this._step(performance.now());
    }, 1000);
  }

  pause() {
    if (this.phase !== 'running') return false;
    this.phase = 'paused';
    this._pausedAt = performance.now();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._emit();
    return true;
  }

  resume() {
    if (this.phase !== 'paused') return false;
    this._pausedTotal += performance.now() - this._pausedAt;
    this._pausedAt = 0;
    this.phase = 'running';
    this._emit();
    this._raf = requestAnimationFrame(this._frame);
    return true;
  }

  end() {
    if (!['running', 'paused'].includes(this.phase)) return false;
    const now = performance.now();
    const current = this.snapshot(now);
    this._frozenElapsed = current.elapsed;
    this._manualAt = now;
    this._manualFrom = { light: current.light, gain: current.gain };
    this.phase = 'manual';
    this._emit();
    if (!this._raf) this._raf = requestAnimationFrame(this._frame);
    return true;
  }

  snapshot(now = performance.now()) {
    const duration = this.durationMs / 1000;
    const fade = this.fadeOutMs / 1000;
    let elapsed = this._frozenElapsed;

    if (this.phase === 'running') {
      elapsed = (now - this._startedAt - this._pausedTotal) / 1000;
    } else if (this.phase === 'paused') {
      elapsed = (this._pausedAt - this._startedAt - this._pausedTotal) / 1000;
    }
    elapsed = Math.min(Math.max(elapsed, 0), duration);

    const fadeProgress = smooth((elapsed - (duration - fade)) / fade);
    let light = fadeProgress * 0.9;
    let gain = 1 - fadeProgress;

    if (this.phase === 'paused') {
      light = Math.max(light, 0.42);
    }

    if (this.phase === 'hold') {
      light = 0.965;
      gain = 0;
    }

    if (this.phase === 'manual') {
      const progress = smooth((now - this._manualAt) / this.manualFadeMs);
      light = this._manualFrom.light + (0.99 - this._manualFrom.light) * progress;
      gain = this._manualFrom.gain * (1 - progress);
    }

    return {
      phase: this.phase,
      paused: this.phase === 'paused',
      elapsed,
      remainingMs: Math.max(0, this.durationMs - elapsed * 1000),
      fadeProgress,
      light: clamp01(light),
      gain: clamp01(gain),
    };
  }

  _frame = (now) => {
    if (this._done) return;
    this._step(now);
    if (!this._done && this.phase !== 'paused') {
      this._raf = requestAnimationFrame(this._frame);
    }
  };

  _step(now) {
    if (this._done) return;

    if (this.phase === 'running') {
      const elapsed = (now - this._startedAt - this._pausedTotal) / 1000;
      if (elapsed >= this.durationMs / 1000) {
        this._frozenElapsed = this.durationMs / 1000;
        this.phase = 'hold';
        this._holdAt = now;
      }
    }

    this._emit(now);

    if (this.phase === 'hold' && now - this._holdAt >= this.holdMs) {
      this._finish();
      return;
    }
    if (this.phase === 'manual' && now - this._manualAt >= this.manualFadeMs) {
      this._finish();
    }
  }

  _emit(now = performance.now()) {
    this.onUpdate?.(this.snapshot(now));
  }

  _finish() {
    if (this._done) return;
    this._done = true;
    const phase = this.phase;
    this.phase = 'done';
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    window.clearInterval(this._interval);
    this._interval = 0;
    this.onComplete?.({ reason: phase === 'manual' ? 'manual' : 'natural' });
  }

  dispose() {
    this._done = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    window.clearInterval(this._interval);
    this._interval = 0;
    if (this.phase !== 'done') this.phase = 'done';
  }
}
