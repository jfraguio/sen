/**
 * Screen Wake Lock: mantiene la pantalla encendida durante la sesión cuando
 * el navegador lo permite.
 *
 * El sistema libera el bloqueo al ocultar la pestaña, al cambiar de aplicación
 * o por políticas de ahorro de energía. Por eso se vuelve a solicitar al
 * recuperar visibilidad o foco, y también cuando el propio sistema libera el
 * sentinel sin que la página se haya ocultado. Si la solicitud falla, se
 * reintenta con una espera creciente mientras la sesión siga activa.
 */
export class WakeLock {
  constructor() {
    this.supported = 'wakeLock' in navigator;
    this.sentinel = null;
    this.wanted = false;
    this.pending = false;
    this.retryTimer = 0;
    this.retryDelay = 2000;
    this._onVisibility = () => {
      if (document.visibilityState === 'visible') {
        this.retryDelay = 2000;
        this._acquire();
      } else {
        this._clearRetry();
      }
    };
    this._onFocus = () => this._acquire();
    this._onPageShow = () => this._acquire();
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('focus', this._onFocus);
    window.addEventListener('pageshow', this._onPageShow);
  }

  request() {
    this.wanted = true;
    this.retryDelay = 2000;
    this._acquire();
  }

  async _acquire() {
    if (!this.wanted || !this.supported || this.sentinel || this.pending) return;
    if (document.visibilityState !== 'visible') return;
    await this._request();
  }

  async _request() {
    if (this.pending) return;
    this.pending = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!this.wanted) {
        sentinel.release().catch(() => {});
        return;
      }
      this.sentinel = sentinel;
      this._clearRetry();
      this.retryDelay = 2000;
      sentinel.addEventListener('release', () => {
        if (this.sentinel !== sentinel) return;
        this.sentinel = null;
        // El sistema puede liberar el bloqueo sin que la pestaña se oculte.
        this._scheduleRetry(1000);
      });
    } catch {
      this.sentinel = null;
      this._scheduleRetry();
    } finally {
      this.pending = false;
    }
  }

  _scheduleRetry(delay = this.retryDelay) {
    if (!this.wanted || !this.supported || this.sentinel || this.retryTimer) return;
    if (document.visibilityState !== 'visible') return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0;
      this._acquire();
    }, delay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30000);
  }

  _clearRetry() {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = 0;
  }

  release() {
    this.wanted = false;
    this._clearRetry();
    this.retryDelay = 2000;
    if (!this.sentinel) return;
    const sentinel = this.sentinel;
    this.sentinel = null;
    sentinel.release().catch(() => {});
  }

  dispose() {
    this.release();
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('focus', this._onFocus);
    window.removeEventListener('pageshow', this._onPageShow);
  }
}
