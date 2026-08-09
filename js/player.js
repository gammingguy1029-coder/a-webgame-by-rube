/* ============================================================
   player.js — the playable character.
   Handles movement, jump, dash, attack, health, powerups.
   ============================================================ */
(function (global) {
  'use strict';

  const Player = {
    x: 0, y: 0, w: 26, h: 40,   // x,y = top-left; h is body height
    vx: 0, vy: 0,
    facing: 1,                  // 1 right, -1 left
    onGround: false,
    health: 100, maxHealth: 100,

    moveSpeed: 220, baseMoveSpeed: 220,
    jumpSpeed: 560, baseJumpSpeed: 560,
    gravity: 1700,

    dashCooldownMax: 1.4, dashCooldown: 0, dashTime: 0, dashDir: 1, dashSpeed: 780,
    invuln: 0,                  // seconds of invulnerability (dash/revive)
    iframes: 0,                 // short post-hit invulnerability

    attackCooldown: 0, attackAnim: 0, attackSwing: 0,

    powerups: {
      shield: 0, rage: 0, speed: 0, magnet: 0, timewarp: 0, dcoin: 0,
    },
    shield: false,

    combo: 0, comboTimer: 0,
    alive: true,
    coyote: 0,

    reset(stats) {
      this.maxHealth = stats.maxHealth;
      this.health = this.maxHealth;
      this.moveSpeed = this.baseMoveSpeed * stats.speedMul;
      this.jumpSpeed = this.baseJumpSpeed;
      this.dashCooldownMax = stats.dashCooldown;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.onGround = false;
      this.dashCooldown = 0; this.dashTime = 0; this.invuln = 0; this.iframes = 0;
      this.attackCooldown = 0; this.attackAnim = 0; this.attackSwing = 0;
      this.powerups = { shield: 0, rage: 0, speed: 0, magnet: 0, timewarp: 0, dcoin: 0 };
      this.shield = false;
      this.combo = 0; this.comboTimer = 0;
      this.coyote = 0;
      this.alive = true;
    },

    getSpeed() {
      let s = this.moveSpeed;
      if (this.powerups.speed > 0) s *= 1.5;
      return s;
    },

    getDamage() {
      let d = Weapons.getDamage();
      if (this.powerups.rage > 0) d *= 1.6;
      return d;
    },

    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; },
    // feet rect for ground detection
    feetRect() { return { x: this.x + 3, y: this.y + this.h - 2, w: this.w - 6, h: 3 }; },

    // --- update: dt, room, game context ---
    update(dt, ctx) {
      // timers
      if (this.dashCooldown > 0) this.dashCooldown -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.iframes > 0) this.iframes -= dt;
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (this.attackAnim > 0) { this.attackAnim -= dt; this.attackSwing += dt * 10; }
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
      const pw = this.powerups;
      for (const k in pw) { if (pw[k] > 0) pw[k] -= dt; }

      if (!this.alive) return;

      // Owner admin override: keep health pinned to max every frame.
      if (global.OwnerMode && OwnerMode.infiniteHealthOn()) {
        this.health = this.maxHealth;
      }

      // --- horizontal movement ---
      let move = 0;
      if (Input.moveLeft()) move -= 1;
      if (Input.moveRight()) move += 1;

      const accel = 2600, decel = 2200;
      if (move !== 0) {
        this.facing = move;
        this.vx += move * accel * dt;
        if (Math.abs(this.vx) > this.getSpeed()) this.vx = this.getSpeed() * Math.sign(this.vx);
      } else {
        const s = Math.sign(this.vx);
        this.vx -= s * decel * dt;
        if (Math.abs(this.vx) <= 0) this.vx = 0;
      }

      // --- jump ---
      if (Input.consumeJump() && (this.onGround || this.coyote > 0)) {
        this.vy = -this.jumpSpeed;
        this.onGround = false;
        this.coyote = 0;
        AudioM.play('jump');
        Game.particles.burstUp(this.x + this.w / 2, this.y + this.h, '#9df3ff', 6, 120, 0.3);
      }
      if (this.onGround) this.coyote = 0.1; else if (this.coyote > 0) this.coyote -= dt;

      // --- gravity ---
      this.vy += this.gravity * dt;
      if (this.vy > 1400) this.vy = 1400;

      // --- dash ---
      if (Input.consumeDash() && this.dashCooldown <= 0 && this.dashTime <= 0) {
        this.dashTime = 0.16;
        this.dashDir = move !== 0 ? move : this.facing;
        this.dashCooldown = this.dashCooldownMax;
        this.invuln = Math.max(this.invuln, 0.16);
        AudioM.play('dash');
        Game.particles.burst(this.x + this.w / 2, this.y + this.h / 2, '#4ef0ff', 10, 180, 0.35);
      }

      // --- attack ---
      if (Input.consumeAttack() && this.attackCooldown <= 0) {
        this.attack();
      }

      // --- integrate movement ---
      let mx = this.vx, my = this.vy;
      if (this.dashTime > 0) {
        this.dashTime -= dt;
        mx = this.dashDir * this.dashSpeed;
        // dash trail
        if (Math.random() < 0.6) {
          Game.particles.spawn({ x: this.x + this.w / 2 + (Math.random() - 0.5) * 10, y: this.y + this.h / 2, vx: -this.dashDir * 60, vy: (Math.random() - 0.5) * 30, life: 0.3, size: 4, color: '#4ef0ff', shape: 'circle', glow: true });
        }
      }

      // collide & move
      const solids = ctx.collidables;
      let nx = this.x + mx * dt;
      // X axis
      let blockedX = false;
      const rectX = { x: nx, y: this.y, w: this.w, h: this.h };
      for (const s of solids) {
        if (Collision.rectsOverlap(rectX, s)) {
          // resolve
          if (mx > 0) nx = s.x - this.w;
          else if (mx < 0) nx = s.x + s.w;
          this.vx = 0;
          blockedX = true;
          break;
        }
      }
      this.x = nx;

      // Y axis
      let ny = this.y + my * dt;
      this.onGround = false;
      const rectY = { x: this.x, y: ny, w: this.w, h: this.h };
      let hitCeil = false;
      for (const s of solids) {
        if (Collision.rectsOverlap(rectY, s)) {
          if (my > 0) { // falling onto floor
            ny = s.y - this.h;
            this.onGround = true;
            this.vy = 0;
          } else if (my < 0) { // ceiling
            ny = s.y + s.h;
            this.vy = 0;
            hitCeil = true;
          }
        }
      }
      this.y = ny;

      // keep within room bounds
      if (this.x < ctx.roomBounds.x) { this.x = ctx.roomBounds.x; this.vx = 0; }
      if (this.x + this.w > ctx.roomBounds.x + ctx.roomBounds.w) { this.x = ctx.roomBounds.x + ctx.roomBounds.w - this.w; this.vx = 0; }

      // fall out of world
      if (this.y > ctx.roomBounds.y + ctx.roomBounds.h + 200) {
        Game.killPlayer(true);
      }
    },

    attack() {
      this.attackCooldown = Weapons.getCooldown();
      this.attackAnim = 0.22;
      this.attackSwing = 0;
      AudioM.play('attack');

      const dmg = this.getDamage();
      const reach = Weapons.getReach();
      const arc = Weapons.getArc();
      const px = this.x + this.w / 2, py = this.y + this.h / 2;

      // Build the arc hitbox; damage enemies whose center falls within reach & arc of facing.
      const hitEntities = [];
      const entities = Game.room.entities;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (!e.alive || e.team === 'player') continue;
        const ex = e.x + (e.w || 12) / 2, ey = e.y + (e.h || 12) / 2;
        const dx = ex - px, dy = ey - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > reach + 16) continue;
        // angle check
        let ang = Math.atan2(dy, dx);
        const facingAng = this.facing > 0 ? 0 : Math.PI;
        let diff = Math.abs(normalizeAngle(ang - facingAng));
        if (diff < arc / 2) {
          hitEntities.push(e);
        }
      }
      // Apply damage + effects
      hitEntities.forEach((e) => {
        const dealt = Game.damageEntity(e, dmg, this.facing > 0 ? 1 : -1, this.powerups.rage > 0);
      });
      Game.spawnAttackSwing(px, py, this.facing, reach, arc, hitEntities.length > 0);
    },

    takeDamage(dmg, knockX, source) {
      if (this.invuln > 0 || this.iframes > 0 || !this.alive) return;
      // Owner admin override: absorb the hit and keep health at max.
      if (global.OwnerMode && OwnerMode.absorbHit && OwnerMode.absorbHit()) return;
      // Daily modifier: enemies deal more damage.
      if (Game && Game.modifiers && Game.modifiers.damageTakenMul) dmg *= Game.modifiers.damageTakenMul;
      dmg = Math.max(1, Math.round(dmg));
      if (this.powerups.shield > 0) {
        this.powerups.shield = 0;
        this.iframes = 0.7;
        AudioM.play('shield');
        Game.particles.burst(this.x + this.w / 2, this.y + this.h / 2, '#9df3ff', 16, 220, 0.4, 'circle');
        Game.toast('SHIELD BROKEN');
        return;
      }
      this.health -= dmg;
      this.iframes = 0.6;
      this.vx += (knockX || 0) * 160;
      AudioM.play('damage');
      Game.particles.burst(this.x + this.w / 2, this.y + this.h / 2, '#ff4d6d', 10, 180, 0.4);
      Game.camera.shake(6, 0.25);
      // reduce combo
      this.combo = 0; this.comboTimer = 0;
      if (this.health <= 0) {
        this.health = 0;
        Game.killPlayer(false);
      }
    },

    heal(amount) {
      this.health = Math.min(this.maxHealth, this.health + amount);
    },
    setShield() { this.powerups.shield = 3; },
  };

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  global.Player = Player;
})(window);
