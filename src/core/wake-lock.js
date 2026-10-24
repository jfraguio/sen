/**
 * Screen Wake Lock: mantiene la pantalla encendida durante la sesión cuando
 * el navegador lo permite. Si la pestaña pasa a segundo plano, el sistema
 * libera el bloqueo; al volver, se solicita de nuevo.
 */
export class WakeLock {
  constructor() {
    this.supported = 'wakeLock' in navigator;
    this.sentinel = null;
    this.wanted = false;
    this.pending = false;
    this._onVisibility = () => {
      if (this.wanted && document.visibilityState === 'visible' && !this.sentinel) {
        this._request();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  request() {
    this.wanted = true;
    if (!this.supported || this.sentinel) return;
    this._request();
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
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch {
      this.sentinel = null;
    } finally {
      this.pending = false;
    }
  }

  release() {
    this.wanted = false;
    if (!this.sentinel) return;
    const sentinel = this.sentinel;
    this.sentinel = null;
    sentinel.release().catch(() => {});
  }

  dispose() {
    this.release();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}
