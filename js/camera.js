/* ============================================================
   camera.js — smooth follow camera with look-ahead + shake.
   ============================================================ */
(function (global) {
  'use strict';

  const Camera = {
    x: 0, y: 0, w: 800, h: 450,
    targetX: 0, targetY: 0,
    shakeT: 0, shakeMag: 0, shakeX: 0, shakeY: 0,
    bounds: { x: 0, y: 0, w: 800, h: 450 },

    setSize(w, h) {
      this.w = w; this.h = h;
    },

    setBounds(b) { this.bounds = b; },

    snap(x, y) { this.targetX = x; this.targetY = y; this.x = x; this.y = y; this.clamp(); },

    follow(px, py, lookAheadX) {
      this.targetX = px - this.w / 2 + lookAheadX * 120;
      this.targetY = py - this.h / 2 - 40;
      this.clamp();
      // smooth
      const k = 0.14;
      this.x += (this.targetX - this.x) * k;
      this.y += (this.targetY - this.y) * k;
    },

    clamp() {
      const b = this.bounds;
      if (b.w <= this.w) this.targetX = b.x + (b.w - this.w) / 2;
      else this.targetX = Math.max(b.x, Math.min(this.targetX, b.x + b.w - this.w));
      if (b.h <= this.h) this.targetY = b.y + (b.h - this.h) / 2;
      else this.targetY = Math.max(b.y, Math.min(this.targetY, b.y + b.h - this.h));
      if (b.w <= this.w) this.x = this.targetX;
      if (b.h <= this.h) this.y = this.targetY;
    },

    shake(mag, time) {
      if (!Save.get().settings.screenShake) return;
      this.shakeMag = mag; this.shakeT = time;
    },

    update(dt) {
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        this.shakeX = (Math.random() - 0.5) * 2 * this.shakeMag * (this.shakeT > 0 ? 1 : 0);
        this.shakeY = (Math.random() - 0.5) * 2 * this.shakeMag * (this.shakeT > 0 ? 1 : 0);
      } else { this.shakeX = 0; this.shakeY = 0; }
    },

    offset() { return { x: Math.round(this.x + this.shakeX), y: Math.round(this.y + this.shakeY) }; },
  };

  global.Camera = Camera;
})(window);
