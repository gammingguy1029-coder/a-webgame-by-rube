/* ============================================================
   particles.js — lightweight pooled particle system.
   Includes floating damage numbers.
   ============================================================ */
(function (global) {
  'use strict';

  const POOL = [];
  const MAX_PARTICLES = 240;

  function particle() {
    return {
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 0, size: 2, color: '#fff',
      gravity: 0, drag: 0.98, shape: 'rect', glow: false,
      rot: 0, vrot: 0,
    };
  }

  const Particles = {
    list: [],

    spawn(opts) {
      const settings = Save.get().settings;
      if (!settings.particles || settings.reducedEffects) {
        // allow damage numbers even in reduced mode (important info)
        if (!opts.always) return;
      }
      let p = POOL.pop();
      if (!p) p = particle();
      if (this.list.length >= MAX_PARTICLES) {
        // recycle oldest
        p = this.list.shift();
        p.active = false;
      }
      p.active = true;
      p.x = opts.x; p.y = opts.y;
      p.vx = opts.vx || 0; p.vy = opts.vy || 0;
      p.maxLife = opts.life || 0.5;
      p.life = p.maxLife;
      p.size = opts.size || 2;
      p.color = opts.color || '#fff';
      p.gravity = opts.gravity || 0;
      p.drag = opts.drag !== undefined ? opts.drag : 0.98;
      p.shape = opts.shape || 'rect';
      p.glow = !!opts.glow;
      p.rot = Math.random() * Math.PI;
      p.vrot = (Math.random() - 0.5) * 8;
      this.list.push(p);
    },

    burst(x, y, color, count, speed, life, shape) {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = speed * (0.4 + Math.random() * 0.6);
        this.spawn({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: life || 0.4, size: 1 + Math.random() * 3, color, shape: shape || 'rect', glow: true });
      }
    },

    burstUp(x, y, color, count, speed, life) {
      for (let i = 0; i < count; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const sp = speed * (0.4 + Math.random() * 0.6);
        this.spawn({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: life || 0.5, size: 1 + Math.random() * 2.5, color, gravity: -80, glow: true });
      }
    },

    damageText(x, y, amount, color, crit) {
      this.list.push(this._textP(x, y, amount, color || '#fff', crit));
    },

    _textP(x, y, amount, color, crit) {
      return {
        active: true, isText: true, x, y, vx: (Math.random() - 0.5) * 20, vy: -60,
        life: 0.7, maxLife: 0.7, size: crit ? 16 : 13, color, text: String(amount), glow: true,
      };
    },

    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          this.list.splice(i, 1);
          POOL.push(p);
          continue;
        }
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
      }
    },

    draw(ctx, camera) {
      for (let i = 0; i < this.list.length; i++) {
        const p = this.list[i];
        const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
        const sx = p.x - camera.x, sy = p.y - camera.y;
        if (sx < -50 || sx > camera.w + 50 || sy < -50 || sy > camera.h + 50) continue;
        ctx.globalAlpha = alpha;
        if (p.isText) {
          ctx.font = 'bold ' + p.size + 'px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color; ctx.shadowBlur = 8;
          ctx.fillText(p.text, sx, sy);
          ctx.shadowBlur = 0;
          continue;
        }
        ctx.fillStyle = p.color;
        if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 6; }
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    },

    clear() { this.list.length = 0; },
  };

  global.Particles = Particles;
})(window);
