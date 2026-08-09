/* ============================================================
   bosses.js — boss entities with multi-pattern attacks.
   Floor 10: THE WARDEN
   Floor 20: THE VOID BEAST
   Floor 30: THE TOWER KING
   All attacks have visible warnings (telegraphs).
   ============================================================ */
(function (global) {
  'use strict';

  const BOSS_DEFS = {
    1: { // The Warden
      name: 'THE WARDEN',
      hp: 600, w: 70, h: 110, dmg: 16, color: '#ff9d4d', speed: 60,
      coin: 60, score: 150,
    },
    2: { // The Void Beast
      name: 'THE VOID BEAST',
      hp: 1400, w: 90, h: 70, dmg: 22, color: '#b24dff', speed: 90,
      coin: 140, score: 300,
    },
    3: { // The Tower King
      name: 'THE TOWER KING',
      hp: 2800, w: 100, h: 140, dmg: 26, color: '#ff2d55', speed: 70,
      coin: 300, score: 600,
    },
  };

  function createBoss(floorIndex) {
    const tier = Math.min(3, Math.ceil(floorIndex / 10));
    const def = BOSS_DEFS[tier];
    const hpMul = 1 + (floorIndex - tier * 10) * 0.03;
    const b = {
      tier, type: 'boss',
      name: def.name,
      x: 0, y: 0, w: def.w, h: def.h,
      maxHp: Math.round(def.hp * hpMul), hp: Math.round(def.hp * hpMul),
      dmg: def.dmg, speed: def.speed, color: def.color,
      coin: def.coin, score: def.score, team: 'enemy', alive: true,
      facing: -1, vx: 0, vy: 0, onGround: false,
      hitFlash: 0,
      // AI
      state: 'enter', timer: 0, atkCd: 2, patternIdx: 0,
      phase: 1, maxPhases: 3,
      telegraph: null, // { type, x, y, radius, t, dur }
      shield: 0,
      warnTime: 0,
      summonT: 0,
    };
    return b;
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function updateBoss(b, dt, ctx) {
    const P = ctx.player;
    const px = P.x + P.w/2, py = P.y + P.h/2;
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const d = dist({x: cx, y: cy}, {x: px, y: py});
    b.facing = px >= cx ? 1 : -1;
    if (b.hitFlash > 0) b.hitFlash -= dt;
    if (b.warnTime > 0) b.warnTime -= dt;

    if (b.telegraph) {
      b.telegraph.t -= dt;
      if (b.telegraph.t <= 0) { executeTelegraph(b, ctx); b.telegraph = null; }
    }

    // phases
    const phaseHp = 1 - b.hp / b.maxHp;
    if (phaseHp > 0.33 && b.phase === 1) { b.phase = 2; b.warnTime = 2.0; AudioM.play('bossWarn'); }
    if (phaseHp > 0.66 && b.phase === 2) { b.phase = 3; b.warnTime = 2.0; AudioM.play('bossWarn'); }

    // shield in later phases
    b.shield = 0;
    if (b.phase === 3 && Math.sin(Date.now()/1000) > 0.5) b.shield = 1;

    if (b.state === 'enter') {
      b.vx = 0;
      b.timer -= dt;
      if (b.timer <= 0) { b.state = 'idle'; b.atkCd = 1.2; }
    } else if (b.state === 'idle') {
      // walk toward player slowly
      b.vx = b.facing * b.speed * 0.5;
      b.atkCd -= dt;
      if (b.atkCd <= 0) { choosePattern(b, ctx, d); }
      moveBoss(b, dt, ctx);
    } else if (b.state === 'moving') {
      // generic movement
      b.vx = b.facing * b.speed;
      moveBoss(b, dt, ctx);
      b.timer -= dt;
      if (b.timer <= 0) b.state = 'idle';
    } else if (b.state === 'charging') {
      b.vx = b.chargeDir * b.speed * 3.2;
      moveBoss(b, dt, ctx);
      b.timer -= dt;
      if (b.timer <= 0) { b.state = 'idle'; b.atkCd = 1.4; }
      // contact damage during charge
      if (Collision.rectsOverlap({x:b.x,y:b.y,w:b.w,h:b.h}, {x:P.x,y:P.y,w:P.w,h:P.h})) P.takeDamage(b.dmg, b.chargeDir);
    }
  }

  function choosePattern(b, ctx, d) {
    const P = ctx.player;
    const px = P.x + P.w/2, py = P.y + P.h/2;
    const cx = b.x + b.w/2, cy = b.y + b.h/2;

    // Patterns pool based on tier & phase
    const options = [];
    if (b.tier >= 1) options.push('projectile');
    if (b.tier >= 2) options.push('charge');
    if (b.tier >= 3) options.push('summon');
    if (b.tier >= 1) options.push('slam');
    if (b.tier >= 2 && b.phase >= 2) options.push('spread');
    if (b.tier === 3 && b.phase >= 2) options.push('beams');

    // pick next pattern, avoid immediate repeat
    let pick;
    do { pick = options[Math.floor(Math.random() * options.length)]; } while (pick === b.patternIdx && options.length > 1);
    b.patternIdx = pick;

    switch (pick) {
      case 'projectile': {
        b.state = 'projectile';
        b.timer = 1.4;
        b.aimAngle = Math.atan2(py - cy, px - cx);
        b.burstCount = 3 + b.tier;
        b.burstT = 0.4;
        b.telegraph = { type: 'line', x: cx, y: cy, angle: b.aimAngle, t: 0.5, dur: 0.5, color: b.color };
        AudioM.play('bossWarn');
        break;
      }
      case 'charge': {
        b.state = 'preCharge';
        b.timer = 0.6;
        b.chargeDir = Math.sign(px - cx) || 1;
        b.telegraph = { type: 'charge', x: cx, y: cy, angle: b.chargeDir, t: 0.6, dur: 0.6, len: 300, color: '#ff9d4d' };
        AudioM.play('bossWarn');
        break;
      }
      case 'slam': {
        b.state = 'preSlam';
        b.timer = 0.7;
        b.aimX = px; b.aimY = py + 40;
        b.telegraph = { type: 'circle', x: px, y: py + 30, radius: 70, t: 0.7, dur: 0.7, color: '#ff4d6d' };
        AudioM.play('bossWarn');
        break;
      }
      case 'summon': {
        b.state = 'idle';
        b.atkCd = 2.2;
        AudioM.play('bossWarn');
        b.summonT = 0.2;
        break;
      }
      case 'spread': {
        b.state = 'spread';
        b.timer = 1.0;
        b.spreadAng = Math.random() * Math.PI * 2;
        b.telegraph = { type: 'line', x: cx, y: cy, angle: b.spreadAng, t: 0.6, dur: 0.6, color: b.color };
        AudioM.play('bossWarn');
        break;
      }
      case 'beams': {
        b.state = 'beams';
        b.timer = 2.0;
        b.beamAng = Math.atan2(py - cy, px - cx);
        b.beamT = 0.8;
        b.telegraph = { type: 'line', x: cx, y: cy, angle: b.beamAng, t: 0.8, dur: 0.8, len: 400, color: '#ff2d55' };
        AudioM.play('bossWarn');
        break;
      }
    }
  }

  function executeTelegraph(b, ctx) {
    const P = ctx.player;
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const px = P.x + P.w/2, py = P.y + P.h/2;
    switch (b.patternIdx) {
      case 'projectile': {
        // Fire the intended burst volley with slight spread. Previously only a
        // single projectile was spawned because the multi-shot timer was never
        // consumed (GAME-BOSS-001).
        const count = Math.max(1, b.burstCount);
        for (let i = 0; i < count; i++) {
          ctx.spawnProjectile(cx, cy, b.aimAngle + (Math.random() - 0.5) * 0.3, 300, b.dmg, 'enemy');
        }
        b.state = 'moving'; b.timer = 1.2;
        break;
      }
      case 'charge': {
        b.state = 'charging'; b.timer = 0.9;
        Game.camera.shake(4, 0.2);
        AudioM.play('charge');
        break;
      }
      case 'slam': {
        // area slam
        Game.camera.shake(10, 0.4);
        AudioM.play('explosion');
        Game.particles.burst(b.aimX, b.aimY, '#ff4d6d', 20, 260, 0.5);
        Game.particles.burst(b.aimX, b.aimY, '#ff9d4d', 10, 160, 0.4);
        const d = dist({x: px, y: py}, {x: b.aimX, y: b.aimY});
        if (d < 70) P.takeDamage(b.dmg, Math.sign(px - b.aimX));
        b.state = 'moving'; b.timer = 1.0;
        break;
      }
      case 'spread': {
        for (let i = 0; i < 8; i++) {
          const ang = b.spreadAng + i * Math.PI * 2 / 8;
          ctx.spawnProjectile(cx, cy, ang, 240, b.dmg * 0.7, 'enemy');
        }
        AudioM.play('charge');
        b.state = 'moving'; b.timer = 1.2;
        break;
      }
      case 'beams': {
        ctx.spawnProjectile(cx, cy, b.beamAng, 500, b.dmg, 'enemy');
        ctx.spawnProjectile(cx, cy, b.beamAng + 0.15, 500, b.dmg, 'enemy');
        ctx.spawnProjectile(cx, cy, b.beamAng - 0.15, 500, b.dmg, 'enemy');
        AudioM.play('bossHit');
        b.state = 'moving'; b.timer = 1.4;
        break;
      }
    }
  }

  function moveBoss(b, dt, ctx) {
    // gravity
    b.vy = (b.vy || 0) + ctx.gravity * dt;
    const nx = b.x + b.vx * dt;
    b.x = nx;
    let ny = b.y + b.vy * dt;
    b.onGround = false;
    for (const s of ctx.collidables) {
      if (Collision.rectsOverlap({x: b.x, y: ny, w: b.w, h: b.h}, s)) {
        if (b.vy > 0) { ny = s.y - b.h; b.vy = 0; b.onGround = true; }
        else if (b.vy < 0) { ny = s.y + s.h; b.vy = 0; }
      }
    }
    b.y = ny;
    // clamp to room
    const R = ctx.roomBounds;
    if (b.x < R.x) { b.x = R.x; b.vx = 0; }
    if (b.x + b.w > R.x + R.w) { b.x = R.x + R.w - b.w; b.vx = 0; }
  }

  function handleBossSummon(b, ctx) {
    // summon minions
    const R = ctx.roomBounds;
    for (let i = 0; i < 2 + b.tier; i++) {
      const sx = R.x + 30 + Math.random() * (R.w - 60);
      const type = Math.random() < 0.5 ? 'slime' : 'bat';
      ctx.spawnEnemy(type, sx, R.y + 40);
    }
    Game.toast(b.name + ' summons minions!');
  }

  function drawBoss(b, ctx, cam) {
    const off = cam.offset();
    const sx = b.x - off.x, sy = b.y - off.y;
    const cx = sx + b.w/2, cy = sy + b.h/2;
    ctx.save();
    if (b.hitFlash > 0) ctx.globalAlpha = 0.5;

    // telegraph drawing
    if (b.telegraph) {
      const tg = b.telegraph;
      const p = Math.max(0, tg.t / tg.dur);
      ctx.strokeStyle = tg.color; ctx.shadowColor = tg.color; ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now()/50);
      if (tg.type === 'circle') {
        ctx.beginPath(); ctx.arc(tg.x - off.x, tg.y - off.y, tg.radius, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = tg.color; ctx.globalAlpha *= 0.2;
        ctx.beginPath(); ctx.arc(tg.x - off.x, tg.y - off.y, tg.radius, 0, Math.PI*2); ctx.fill();
      } else if (tg.type === 'line' && tg.angle !== undefined) {
        const len = tg.len || 300;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(tg.angle) * len, cy + Math.sin(tg.angle) * len);
        ctx.stroke();
      } else if (tg.type === 'charge') {
        const len = tg.len;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + tg.angle * len, cy + 10);
        ctx.stroke();
      }
    }

    // body
    ctx.shadowColor = b.color; ctx.shadowBlur = 20;
    ctx.fillStyle = b.color;
    if (b.tier === 1) {
      // Warden: armored humanoid
      ctx.fillRect(sx + 6, sy, b.w - 12, b.h);
      ctx.fillStyle = '#333';
      ctx.fillRect(sx + 2, sy, b.w - 4, 14);
      ctx.fillStyle = '#ff0';
      ctx.fillRect(cx + (b.facing>0?4:-10), sy + 18, 6, 4);
      ctx.fillRect(cx + (b.facing>0?4:-10), sy + 26, 6, 4);
      // sword
      ctx.strokeStyle = '#9df3ff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx + (b.facing>0? b.w/2+2 : -b.w/2-2), cy); ctx.lineTo(cx + (b.facing>0? b.w/2+40 : -b.w/2-40), cy - 30); ctx.stroke();
    } else if (b.tier === 2) {
      // Void Beast: floating orb-beast
      ctx.globalAlpha *= 0.85;
      ctx.beginPath(); ctx.ellipse(cx, cy, b.w/2, b.h/2, Math.sin(Date.now()/400)*0.1, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#0a0e1a';
      ctx.beginPath(); ctx.arc(cx - 12, cy - 8, 7, 0, Math.PI*2); ctx.arc(cx + 12, cy - 8, 7, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#7a8bff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, b.w/2 + 12 + Math.sin(Date.now()/200)*5, 0, Math.PI*2); ctx.stroke();
    } else {
      // Tower King
      ctx.fillRect(sx + 4, sy + 20, b.w - 8, b.h - 20);
      ctx.beginPath(); ctx.arc(cx, sy + 20, 26, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(cx - 9, sy + 12, 6, 7); ctx.fillRect(cx + 3, sy + 12, 6, 7);
      // crown
      ctx.fillStyle = '#ffd24d';
      ctx.beginPath();
      ctx.moveTo(cx - 14, sy + 6); ctx.lineTo(cx - 14, sy - 6); ctx.lineTo(cx - 7, sy + 2); ctx.lineTo(cx, sy - 8); ctx.lineTo(cx + 7, sy + 2); ctx.lineTo(cx + 14, sy - 6); ctx.lineTo(cx + 14, sy + 6);
      ctx.closePath(); ctx.fill();
      // hammer
      ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx + (b.facing>0? b.w/2 : -b.w/2), cy + 10); ctx.lineTo(cx + (b.facing>0? b.w/2+36 : -b.w/2-36), cy - 20); ctx.stroke();
    }
    ctx.restore();

    // shield indicator
    if (b.shield > 0) {
      ctx.strokeStyle = '#9df3ff'; ctx.lineWidth = 3; ctx.shadowColor = '#9df3ff'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(cx, cy, b.w/2 + 10 + Math.sin(Date.now()/200)*3, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#9df3ff';
      ctx.beginPath(); ctx.arc(cx, cy, b.w/2 + 10, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // phase warning
    if (b.warnTime > 0) {
      ctx.fillStyle = '#ff0'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText('ENRAGED!', cx, sy - 14);
    }
    // name above
    ctx.fillStyle = b.color; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.shadowColor = b.color; ctx.shadowBlur = 6;
    ctx.fillText(b.name, cx, sy - 8);
  }

  global.Bosses = { createBoss, updateBoss, drawBoss, BOSS_DEFS };
})(window);
