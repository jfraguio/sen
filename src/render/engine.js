import { THEMES, fallbackTheme } from './themes.js';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const MAX_DPR = 1.5;

/**
 * Canvas a pantalla completa. Mantiene su propio reloj de animación, de modo
 * que pausar el renderer congela el movimiento sin detener la sesión.
 */
export class AmbientRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.theme = null;
    this.running = false;
    this.paused = false;
    this.time = 0;
    this.last = 0;
    this.raf = 0;
    this.motionQuery = window.matchMedia(REDUCED_MOTION);
    this.reduced = this.motionQuery.matches;
    this._onResize = () => this.resize();
    this._onMotionChange = (event) => {
      this.reduced = event.matches;
      if (!this.running) return;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.reduced) {
        this.draw(0);
      } else if (!this.paused) {
        this.last = performance.now();
        this.loop(this.last);
      }
    };

    window.addEventListener('resize', this._onResize, { passive: true });
    this.motionQuery.addEventListener?.('change', this._onMotionChange);
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.running && this.theme) this.draw(0);
  }

  start(ambient) {
    this.stopLoop();
    const createTheme = THEMES[ambient.animation] || fallbackTheme;
    this.theme = createTheme(ambient);
    this.time = 0;
    this.paused = false;
    this.running = true;
    this.resize();
    this.last = performance.now();
    if (this.reduced) {
      this.time = 2.4;
      this.draw(0);
    } else {
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  loop = (now) => {
    if (!this.running || this.paused) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.draw(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  draw(dt) {
    if (!this.theme) return;
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    this.theme.draw(ctx, this.time, dt, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.last = performance.now();
    if (!this.reduced) this.raf = requestAnimationFrame(this.loop);
    else this.draw(0);
  }

  stopLoop() {
    this.running = false;
    this.paused = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  stop() {
    this.stopLoop();
    this.theme = null;
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.motionQuery.removeEventListener?.('change', this._onMotionChange);
  }
}
