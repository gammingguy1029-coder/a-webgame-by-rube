/* ============================================================
   main.js — boot sequence & PWA registration.
   ============================================================ */
(function (global) {
  'use strict';

  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        try {
          navigator.serviceWorker.register('pwa/service-worker.js').catch((e) => {
            console.warn('SW registration failed', e);
          });
        } catch (e) { /* offline-ok */ }
      });
    }
  }

  function boot() {
    // Load & validate save data first (never crashes).
    try { Save.load(); } catch (e) { /* ignore */ }

    // Graceful handling if localStorage disabled — game still works in memory.
    if (!Save.storageAvailable()) {
      console.warn('localStorage unavailable — progress will not persist this session.');
    }

    registerSW();

    Game.init(document.getElementById('gameCanvas'));

    // Unlock audio on first user interaction (autoplay policy).
    const unlock = () => { AudioM.unlock(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
