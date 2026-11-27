/* ============================================================
   enemies.js — enemy types & AI: slime, bat, guard, archer,
   bomber, shadow, elite.
   ============================================================ */
(function (global) {
  'use strict';

  const ENEMY_DEFS = {
    slime:  { w: 26, h: 18, hp: 30, dmg: 10, speed: 55,  coin: 4, color: '#4dff88' },
    bat:    { w: 22, h: 16, hp: 20, dmg: 8,  speed: 120, coin: 4, color: '#b24dff', fly: true },
    guard:  { w: 26, h: 38, hp: 70, dmg: 14, speed: 70,  coin: 8, color: '#ff9d4d' },
    archer: { w: 24, h: 34, hp: 40, dmg: 10, speed: 90,  coin: 8, color: '#ffd24d' },
    bomber: { w: 24, h: 22, hp: 25, dmg: 18, speed: 100, coin: 6, color: '#ff4d6d' },
    shadow: { w: 24, h: 34, hp: 55, dmg: 16, speed: 160, coin: 12, color: '#7a8bff' },
    elite:  { w: 34, h: 44, hp: 220, dmg: 20, speed: 80, coin: 25, color: '#ff2d55', elite: true },
  };

  function createEnemy(type, x, y, scale) {
    scale = scale || 1;
    const def = ENEMY_DEFS[type];
    const e = {
      type, x, y, w: def.w * scale, h: def.h * scale,
      maxHp: def.hp * scale, hp: def.hp * scale,
      dmg: def.dmg, speed: def.speed * (1 + (scale - 1) * 0.5),
      coin: Math.round(def.coin * scale),
      color: def.color, team: 'enemy', alive: true,
      fly: !!def.fly, elite: !!def.elite,
      facing: 1,
      // AI state
      state: 'idle', timer: 0, attackTimer: 0, atkCd: 0,
      hopT: 0, vy: 0, onGround: false,
      vx: 0,
      dmgMul: 1,
      // shadow teleport
      teleWarn: 0, teleX: 0, teleY: 0,
      // guard block
      blocking: false,
      hitFlash: 0,
    };
    return e;
  }

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function updateEnemy(e, dt, ctx) {
    const P = ctx.player;
    const px = P.x + P.w / 2, py = P.y + P.h / 2;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
    const dx = px - ex, dy = py - ey;
    const d = dist(ex, ey, px, py) || 1;

    e.facing = dx >= 0 ? 1 : -1;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.attackTimer > 0) e.attackTimer -= dt;
    if (e.timer > 0) e.timer -= dt;
    if (e.teleWarn > 0) e.teleWarn -= dt;

    const speedMul = (P.powerups.timewarp > 0 ? 0.45 : 1) * (ctx.enemySpeedMul || 1);
    e.speedNow = e.speed * speedMul;

    switch (e.type) {
      case 'slime': aiSlime(e, dt, ctx, px, py, dx, dy); break;
      case 'bat': aiBat(e, dt, ctx, px, py, dx, dy); break;
      case 'guard': aiGuard(e, dt, ctx, px, py, dx, dy, d); break;
      case 'archer': aiArcher(e, dt, ctx, px, py, dx, dy, d); break;
      case 'bomber': aiBomber(e, dt, ctx, px, py, dx, dy, d); break;
      case 'shadow': aiShadow(e, dt, ctx, px, py, dx, dy, d); break;
      case 'elite': aiElite(e, dt, ctx, px, py, dx, dy, d); break;
    }
  }

  function moveEnemy(e, dt, ctx, speed, fly) {
    const nx = e.x + e.vx * dt;
    if (!fly) {
      let blocked = false;
      for (const s of ctx.collidables) {
        if (Collision.rectsOverlap({ x: nx, y: e.y, w: e.w, h: e.h }, s)) {
          blocked = true;
          e.vx = 0;
          // ledge check handled by gravity below; reverse on wall
          e.facing *= -1;
          break;
        }
      }
      e.x = nx;
      // gravity
      e.vy = (e.vy || 0) + ctx.gravity * dt;
      let ny = e.y + e.vy * dt;
      e.onGround = false;
      for (const s of ctx.collidables) {
        if (Collision.rectsOverlap({ x: e.x, y: ny, w: e.w, h: e.h }, s)) {
          if (e.vy > 0) { ny = s.y - e.h; e.vy = 0; e.onGround = true; }
          else if (e.vy < 0) { ny = s.y + s.h; e.vy = 0; }
        }
      }
      e.y = ny;
    } else {
      e.x = nx;
      const ny = e.y + e.vy * dt;
      // flying entities avoid walls
      let bx = false, by = false;
      for (const s of ctx.collidables) {
        if (Collision.rectsOverlap({ x: nx, y: e.y, w: e.w, h: e.h }, s)) bx = true;
        if (Collision.rectsOverlap({ x: e.x, y: ny, w: e.w, h: e.h }, s)) by = true;
      }
      if (bx) e.x = e.x; else e.x = nx;
      if (!by) e.y = ny;
    }
  }

  function aiSlime(e, dt, ctx, px, py, dx) {
    const dir = Math.sign(dx);
    e.vx = dir * e.speedNow;
    // hop
    e.hopT -= dt;
    if (e.hopT <= 0 && e.onGround) { e.vy = -260; e.hopT = 1.2; }
    moveEnemy(e, dt, ctx, e.speedNow, false);
    if (dmgNear(e, ctx, 24)) { attackPlayer(e, ctx); }
  }

  function aiBat(e, dt, ctx, px, py, dx, dy) {
    const d = dist(e.x + e.w/2, e.y + e.h/2, px, py);
    if (e.state === 'idle') {
      // hover in place, sine bob
      e.timer -= dt;
      e.vx = Math.sin(e.timer * 3) * 40;
      e.vy = Math.cos(e.timer * 3) * 30;
      if (d < 260) { e.state = 'dive'; }
    } else if (e.state === 'dive') {
      const ang = Math.atan2(py - (e.y + e.h/2), px - (e.x + e.w/2));
      e.vx = Math.cos(ang) * 260 * (ctx.player.powerups.timewarp>0?0.45:1);
      e.vy = Math.sin(ang) * 260 * (ctx.player.powerups.timewarp>0?0.45:1);
      if (dmgNear(e, ctx, 22)) { attackPlayer(e, ctx); e.state = 'recover'; e.timer = 1.4; }
      if (d > 400) { e.state = 'recover'; e.timer = 1.0; }
    } else if (e.state === 'recover') {
      e.timer -= dt;
      e.vx = 0; e.vy = 40;
      if (e.timer <= 0) e.state = 'idle';
    }
    moveEnemy(e, dt, ctx, 260, true);
  }

  function aiGuard(e, dt, ctx, px, py, dx, dy, d) {
    e.atkCd -= dt;
    if (d > 40) {
      e.vx = Math.sign(dx) * e.speedNow;
    } else {
      e.vx = 0;
      if (e.atkCd <= 0) {
        e.attackTimer = 0.25;
        e.atkCd = 1.3;
      }
    }
    // occasionally block
    e.blocking = false;
    if (Math.random() < dt * 0.6) e.blocking = true;
    moveEnemy(e, dt, ctx, e.speedNow, false);
    if (e.attackTimer > 0 && d < 46) {
      if (e.atkCd <= 1.2) attackPlayer(e, ctx, 0.9);
      e.attackTimer = 0;
    }
  }

  function aiArcher(e, dt, ctx, px, py, dx, dy, d) {
    e.atkCd -= dt;
    // keep distance ~230
    if (d < 170) { e.vx = Math.sign(dx) * -e.speedNow * 0.8; }
    else if (d > 280) { e.vx = Math.sign(dx) * e.speedNow * 0.8; }
    else e.vx = 0;

    if (e.atkCd <= 0 && d < 380 && d > 60) {
      e.atkCd = 2.0;
      e.attackTimer = 0.4; // telegraph
      e.state = 'charging';
    }
    if (e.state === 'charging') {
      e.vx = 0;
      if (e.attackTimer <= 0) {
        e.state = 'idle';
        // fire projectile
        const ang = Math.atan2(py - (e.y + e.h/2), px - (e.x + e.w/2));
        ctx.spawnProjectile(e.x + e.w/2, e.y + e.h/2, ang, 300, e.dmg, 'enemy');
        AudioM.play('charge');
      }
    }
    moveEnemy(e, dt, ctx, e.speedNow, false);
  }

  function aiBomber(e, dt, ctx, px, py, dx, dy, d) {
    e.vx = Math.sign(dx) * e.speedNow;
    if (d < 34) {
      // explode
      explodeBomber(e, ctx);
    }
    moveEnemy(e, dt, ctx, e.speedNow, false);
  }

  function explodeBomber(e, ctx) {
    if (!e.alive) return;
    e.alive = false;
    const P = ctx.player;
    const ex = e.x + e.w/2, ey = e.y + e.h/2;
    Game.particles.burst(ex, ey, '#ff4d6d', 20, 260, 0.5);
    Game.particles.burst(ex, ey, '#ff9d4d', 10, 180, 0.4);
    Game.camera.shake(8, 0.3);
    AudioM.play('explosion');
    const d = dist(ex, ey, P.x + P.w/2, P.y + P.h/2);
    if (d < 60) P.takeDamage(e.dmg, Math.sign(P.x + P.w/2 - ex), 'explosion');
    Game.registerKill(e, false);
  }

  function aiShadow(e, dt, ctx, px, py, dx, dy, d) {
    e.atkCd -= dt;
    if (e.state === 'warping') {
      // Hold still during the warning phase. The actual teleport is completed
      // below once the warning elapses (do NOT drop to idle here or the
      // teleport never executes).
      e.vx = 0; e.vy = 0;
    } else {
      if (e.atkCd <= 0 && d < 380) {
        e.atkCd = 3.0;
        // teleport behind player
        e.teleWarn = 0.5;
        const behind = -Math.sign(dx);
        e.teleX = px + behind * 60;
        e.teleY = py + 10;
        e.state = 'warping';
        e.vx = 0; e.vy = 0;
      } else {
        e.vx = Math.sign(dx) * e.speedNow * 0.6;
      }
    }
    moveEnemy(e, dt, ctx, e.speedNow, false);
    // when warping finishes teleport
    if (e.state === 'warping' && e.teleWarn <= 0 && e.timer === 0) {
      // complete teleport
      e.x = e.teleX; e.y = e.teleY;
      e.state = 'idle';
      e.timer = -1;
      e.atkCd = 0.4;
      Game.particles.burst(e.x + e.w/2, e.y + e.h/2, '#7a8bff', 14, 200, 0.4);
      AudioM.play('dash');
    }
    if (dmgNear(e, ctx, 26)) attackPlayer(e, ctx);
  }

  function aiElite(e, dt, ctx, px, py, dx, dy, d) {
    e.atkCd -= dt;
    const dir = Math.sign(dx);
    e.vx = dir * e.speedNow;
    if (e.atkCd <= 0 && d < 120) {
      e.attackTimer = 0.4;
      e.atkCd = 2.4;
      e.state = 'charging';
    }
    if (e.state === 'charging') {
      e.vx = 0;
      if (e.attackTimer <= 0) {
        e.state = 'idle';
        // shockwave attack
        AudioM.play('charge');
        Game.camera.shake(5, 0.2);
        Game.particles.burst(e.x + e.w/2, e.y + e.h/2, '#ff2d55', 16, 200, 0.4);
        const d2 = dist(px, py, e.x + e.w/2, e.y + e.h/2);
        if (d2 < 70) attackPlayer(e, ctx);
      }
    }
    moveEnemy(e, dt, ctx, e.speedNow, false);
  }

  function dmgNear(e, ctx, range) {
    const P = ctx.player;
    const d = dist(P.x + P.w/2, P.y + P.h/2, e.x + e.w/2, e.y + e.h/2);
    return d < range + P.w / 2;
  }

  function attackPlayer(e, ctx, mult) {
    const P = ctx.player;
    P.takeDamage(Math.round(e.dmg * (mult || 1) * e.dmgMul), e.facing);
  }

  // Draw enemy
  function drawEnemy(e, ctx, cam) {
    const off = cam.offset();
    const sx = e.x - off.x, sy = e.y - off.y;
    const cx = sx + e.w/2, cy = sy + e.h/2;
    ctx.save();
    if (e.hitFlash > 0) ctx.globalAlpha = 0.5;
    if (e.state === 'warping' && e.type === 'shadow') ctx.globalAlpha *= 0.3;

    ctx.shadowColor = e.color; ctx.shadowBlur = e.elite ? 14 : 7;

    if (e.type === 'slime') {
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(cx, cy + e.h/2 - 4, e.w/2, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(cx - e.w/2, cy, e.w, 4);
      // eyes
      ctx.fillStyle = '#06260f';
      ctx.fillRect(cx - 8, cy - 2, 4, 5); ctx.fillRect(cx + 4, cy - 2, 4, 5);
    } else if (e.type === 'bat') {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(cx, cy, e.w/2, e.h/2, 0, 0, Math.PI*2); ctx.fill();
      // wings
      ctx.beginPath();
      ctx.moveTo(cx - e.w/2, cy);
      ctx.lineTo(cx - e.w - 4, cy - 8);
      ctx.lineTo(cx - e.w/2, cy + 4);
      ctx.moveTo(cx + e.w/2, cy);
      ctx.lineTo(cx + e.w + 4, cy - 8);
      ctx.lineTo(cx + e.w/2, cy + 4);
      ctx.fill();
      ctx.fillStyle = '#ff0';
      ctx.fillRect(cx - 4, cy - 3, 2, 2); ctx.fillRect(cx + 2, cy - 3, 2, 2);
    } else if (e.type === 'guard') {
      ctx.fillStyle = e.color;
      ctx.fillRect(sx + 3, sy, e.w - 6, e.h);
      ctx.fillStyle = '#333'; // helmet
      ctx.fillRect(sx + 1, sy, e.w - 2, 10);
      if (e.blocking) {
        ctx.strokeStyle = '#9df3ff'; ctx.lineWidth = 3; ctx.shadowBlur = 10;
        ctx.strokeRect(sx - 2, sy + 6, e.w + 4, e.h - 10);
      }
      ctx.fillStyle = '#fff'; ctx.fillRect(cx + (e.facing>0?2:-8), sy + 14, 6, 3);
    } else if (e.type === 'archer') {
      ctx.fillStyle = e.color;
      ctx.fillRect(sx + 4, sy, e.w - 8, e.h);
      ctx.fillRect(sx + 4, sy, e.w - 8, e.h); // torso
      ctx.fillStyle = '#8a5a1a';
      ctx.fillRect(cx + (e.facing>0?4:-8), sy + 8, 4, 20); // bow
    } else if (e.type === 'bomber') {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(cx, cy, e.w/2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff0'; ctx.fillRect(cx - 2, sy + 2, 4, 4);
      // flashing
      if (Math.sin(Date.now()/80) > 0) { ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(cx, cy, e.w/2 - 3, 0, Math.PI*2); ctx.fill(); }
    } else if (e.type === 'shadow') {
      ctx.fillStyle = e.color;
      ctx.globalAlpha *= 0.7;
      ctx.beginPath(); ctx.ellipse(cx, cy, e.w/2, e.h/2, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(cx - 3, cy - 4, 2, 4); ctx.fillRect(cx + 2, cy - 4, 2, 4);
      if (e.state === 'warping') {
        ctx.strokeStyle = '#7a8bff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 20 + (0.5 - e.teleWarn) * 60, 0, Math.PI*2); ctx.stroke();
        // draw teleport target marker
        ctx.strokeStyle = '#ff0';
        ctx.beginPath(); ctx.arc(e.teleX - off.x, e.teleY - off.y, 8, 0, Math.PI*2); ctx.stroke();
      }
    } else if (e.type === 'elite') {
      ctx.fillStyle = e.color;
      ctx.fillRect(sx + 2, sy, e.w - 4, e.h);
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(cx - 6, sy + 6, 5, 6); ctx.fillRect(cx + 2, sy + 6, 5, 6);
      ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, e.w/2 + 4, 0, Math.PI*2); ctx.stroke();
      // aura
      ctx.globalAlpha *= 0.3 + Math.sin(Date.now()/150)*0.2;
      ctx.beginPath(); ctx.arc(cx, cy, e.w/2 + 10, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
    // hp bar for elites
    if (e.elite && e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx, sy - 10, e.w, 4);
      ctx.fillStyle = '#ff2d55';
      ctx.fillRect(sx, sy - 10, e.w * Math.max(0, e.hp/e.maxHp), 4);
    }
  }

  global.Enemies = { createEnemy, updateEnemy, drawEnemy, ENEMY_DEFS };
})(window);
