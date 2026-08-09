/* ============================================================
   rooms.js — builds an active room from procedural data,
   updates traps/coins/projectiles, renders the environment.
   ============================================================ */
(function (global) {
  'use strict';

  function buildRoom(data) {
    // Guarantee the exit always has explicit width/height (a missing w/h would
    // make the exit collision NaN and the floor unbeatable).
    const exit = Object.assign({ w: 40, h: 40 }, data.exit);
    const room = {
      type: data.type, floor: data.floor, event: data.event, bossFloor: data.bossFloor,
      bounds: data.bounds, start: data.start, exit,
      platforms: data.platforms.slice(),
      collidables: [],
      entities: [],       // enemies + boss + projectiles
      projectiles: [],
      coins: data.coins.slice(),
      chests: data.chests.map(c => ({ rarity: c.rarity, x: c.x, y: c.y, opened: false })),
      powerups: data.powerups.map(p => ({ type: p.type, x: p.x, y: p.y, taken: false })),
      traps: [],
      exitReached: false,
      introTimer: 1.2,
      // falling/fake platform bookkeeping
      dynPlatforms: [],
    };

    // Build collidables from solid platforms; separate dynamic ones.
    data.platforms.forEach((p, i) => {
      if (p.kind === 'solid') {
        room.collidables.push({ x: p.x, y: p.y, w: p.w, h: p.h, kind: 'solid' });
      } else if (p.kind === 'falling') {
        const dp = { x: p.x, y: p.y, w: p.w, h: p.h, kind: 'falling', originalY: p.y, active: true, delay: 0, gone: false, index: room.collidables.length };
        room.dynPlatforms.push(dp);
        room.collidables.push(dp);
      } else if (p.kind === 'fake') {
        const dp = { x: p.x, y: p.y, w: p.w, h: p.h, kind: 'fake', originalY: p.y, active: true, delay: 0, gone: false, index: room.collidables.length };
        room.dynPlatforms.push(dp);
        room.collidables.push(dp);
      }
    });

    // enemies
    data.enemies.forEach((e) => {
      if (e.type === 'boss') {
        const b = Bosses.createBoss(data.floor);
        b.x = e.x; b.y = e.y;
        b.timer = 1.4;
        room.entities.push(b);
        room.boss = b;
      } else {
        const en = Enemies.createEnemy(e.type, e.x, e.y, difficultyScale(data.floor));
        en.y = en.y - (en.h - 30);
        room.entities.push(en);
      }
    });

    // traps
    data.traps.forEach((t) => room.traps.push(buildTrap(t)));

    return room;
  }

  function difficultyScale(floor) {
    // enemy hp/scale grows modestly; cap size so enemies never become huge.
    return 1 + Math.min(0.5, (floor - 1) * 0.015);
  }

  function buildTrap(t) {
    const base = {
      type: t.type, x: t.x, y: t.y, w: t.w, h: t.h, opts: t.opts || {},
      phase: Math.random() * Math.PI * 2, gone: false,
    };
    switch (t.type) {
      case 'spikes': base.warn = 0; base.pulse = 1; break;
      case 'saw': base.t = 0; base.range = t.opts.range || 120; break;
      case 'laser': base.fire = 0; base.state = 'charge'; base.t = 0.6 + Math.random(); break;
      case 'arrow': base.fire = 0; base.state = 'charge'; base.t = 1 + Math.random(); break;
      case 'explosive': base.active = true; break;
    }
    return base;
  }

  function updateRoom(room, dt, ctx) {
    if (room.introTimer > 0) room.introTimer -= dt;

    // ---- traps ----
    for (let i = room.traps.length - 1; i >= 0; i--) {
      const t = room.traps[i];
      updateTrap(t, dt, ctx, room);
      if (t.gone) room.traps.splice(i, 1);
    }

    // ---- dynamic platforms ----
    for (let i = room.dynPlatforms.length - 1; i >= 0; i--) {
      const dp = room.dynPlatforms[i];
      if (dp.gone) {
        // remove from collidables
        const idx = room.collidables.indexOf(dp);
        if (idx !== -1) room.collidables.splice(idx, 1);
        room.dynPlatforms.splice(i, 1);
        continue;
      }
      const standing = Player.onGround &&
        Collision.rectsOverlap(Player.feetRect(), { x: dp.x, y: dp.y, w: dp.w, h: dp.h });
      if (dp.kind === 'falling' && dp.active && standing && dp.delay <= 0) {
        dp.delay = 0.15;
      }
      if (dp.kind === 'fake' && dp.active && standing) {
        dp.shake = 0.4;
        if (dp.delay <= 0) dp.delay = 0.25;
      } else if (dp.kind === 'fake' && dp.active) {
        // reset countdown if player steps off before it expires
        dp.delay = 0;
      }
      // Single shared countdown for collapse (fake platforms vanish,
      // falling platforms drop). Was previously decremented twice per frame.
      if (dp.delay > 0) {
        dp.delay -= dt;
        if (dp.delay <= 0) {
          if (dp.kind === 'fake') {
            dp.gone = true;
            room.collidables.splice(room.collidables.indexOf(dp), 1);
            Game.particles.burst(dp.x + dp.w/2, dp.y, '#8ea0c2', 10, 140, 0.4);
          } else {
            dp.falling = true;
            room.collidables.splice(room.collidables.indexOf(dp), 1);
          }
        }
      }
      if (dp.falling) {
        dp.y += 600 * dt;
        if (dp.y > room.bounds.y + room.bounds.h + 50) { dp.gone = true; }
      }
    }

    // ---- coins ----
    const P = Player;
    const magnet = P.powerups.magnet > 0;
    for (let i = room.coins.length - 1; i >= 0; i--) {
      const c = room.coins[i];
      if (c.taken) { room.coins.splice(i, 1); continue; }
      const cx = c.x, cy = c.y;
      const px = P.x + P.w/2, py = P.y + P.h/2;
      let dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy);
      if (magnet && d < 200 && d > 1) {
        // coin flies to player (guard against d===0 division -> NaN coin)
        c.x += dx / d * 320 * dt;
        c.y += dy / d * 320 * dt;
        c.magnetized = true;
      }
      if (d < 22) collectCoin(room, c, i);
    }

    // ---- powerups ----
    for (let i = room.powerups.length - 1; i >= 0; i--) {
      const p = room.powerups[i];
      if (p.taken) { room.powerups.splice(i, 1); continue; }
      const d = Math.hypot(P.x + P.w/2 - p.x, P.y + P.h/2 - p.y);
      if (d < 26) collectPowerup(room, p, i);
    }

    // ---- chests ----
    for (let i = room.chests.length - 1; i >= 0; i--) {
      const c = room.chests[i];
      if (c.opened) { room.chests.splice(i, 1); continue; }
      const d = Math.hypot(P.x + P.w/2 - (c.x + 18), P.y + P.h/2 - (c.y + 16));
      if (d < 30) openChest(room, c, i);
    }

    // ---- exit ----
    if (!room.exitReached) {
      const er = room.exit;
      if (Collision.rectsOverlap({ x: P.x, y: P.y, w: P.w, h: P.h }, { x: er.x, y: er.y, w: er.w, h: er.h })) {
        room.exitReached = true;
        Game.onExitReached();
      }
    }

    // ---- enemies ----
    for (let i = room.entities.length - 1; i >= 0; i--) {
      const e = room.entities[i];
      if (!e.alive) { room.entities.splice(i, 1); continue; }
      if (e.type === 'boss') {
        Bosses.updateBoss(e, dt, ctx);
        if (e.summonT > 0) {
          e.summonT -= dt;
          if (e.summonT <= 0) { Bosses.handleBossSummon(e, ctx); e.summonT = -1; }
        }
      } else {
        Enemies.updateEnemy(e, dt, ctx);
      }
    }

    // ---- projectiles ----
    for (let i = room.projectiles.length - 1; i >= 0; i--) {
      const pr = room.projectiles[i];
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.life -= dt;
      let dead = false;
      if (pr.life <= 0) dead = true;
      // hit solids
      for (const s of room.collidables) {
        if (Collision.circleRect(pr.x, pr.y, 4, s)) { dead = true; break; }
      }
      if (!dead) {
        if (pr.team === 'player') {
          for (const e of room.entities) {
            if (!e.alive) continue;
            if (Collision.circleRect(pr.x, pr.y, 4, { x: e.x, y: e.y, w: e.w, h: e.h })) {
              Game.damageEntity(e, pr.dmg, Math.sign(pr.vx), false);
              dead = true; break;
            }
          }
        } else {
          const pr2 = { x: Player.x, y: Player.y, w: Player.w, h: Player.h };
          if (Collision.circleRect(pr.x, pr.y, 4, pr2)) {
            Player.takeDamage(pr.dmg, Math.sign(pr.vx) * 0.4, 'projectile');
            dead = true;
          }
        }
      }
      if (dead) {
        room.projectiles.splice(i, 1);
        Game.particles.spawn({ x: pr.x, y: pr.y, life: 0.2, size: 3, color: pr.color, shape: 'circle', glow: true });
      }
    }

    // ---- clear taken coins leftover guard (avoid empty run) ----
    if (room.coins.length === 0 && room.powerups.length === 0 && !room.chests.some(c=>!c.opened) &&
        !room.entities.some(e=>e.alive)) {
      // nothing left, but exit still there; fine.
    }
  }

  function collectCoin(room, c, idx) {
    c.taken = true;
    let value = c.value;
    if (Player.powerups.dcoin > 0) value *= 2;
    if (room.event === 'cursed') value *= 2;
    Game.addRunCoins(value);
    Game.addScore(value * 5);
    AudioM.play('coin');
    Game.coinFlyFx(c.x, c.y);
    Game.particles.burstUp(c.x, c.y, '#ffd24d', 5, 120, 0.3);
  }

  function collectPowerup(room, p, idx) {
    p.taken = true;
    const name = p.type.toUpperCase();
    Game.toast(name + '!', 1.2);
    AudioM.play('powerup');
    Game.particles.burst(p.x, p.y, powerColor(p.type), 14, 200, 0.4);
    switch (p.type) {
      case 'shield': Player.setShield(); break;
      case 'rage': Player.powerups.rage = 7; break;
      case 'speed': Player.powerups.speed = 6; break;
      case 'magnet': Player.powerups.magnet = 8; break;
      case 'timewarp': Player.powerups.timewarp = 6; break;
      case 'dcoin': Player.powerups.dcoin = 8; break;
    }
  }

  function powerColor(t) {
    return { shield:'#9df3ff', rage:'#ff4d6d', speed:'#4dff88', magnet:'#ffd24d', timewarp:'#b24dff', dcoin:'#ffd24d' }[t] || '#4ef0ff';
  }

  function openChest(room, c, idx) {
    c.opened = true;
    const rar = c.rarity;
    const rewards = {
      common: { coins: 20 + room.floor * 2, },
      rare: { coins: 60 + room.floor * 4 },
      epic: { coins: 120 + room.floor * 6, powerup: true },
      legendary: { coins: 300 + room.floor * 10, powerup: true, rare: true },
    };
    const cfg = rewards[rar];
    AudioM.play('chest');
    Game.particles.burstUp(c.x + 18, c.y, '#ffd24d', 16, 180, 0.5);
    Game.camera.shake(3, 0.15);
    // apply coins
    let coins = cfg.coins;
    if (Player.powerups.dcoin > 0) coins *= 2;
    Game.addRunCoins(coins);
    Game.addScore(coins * 3);
    // powerup for epic/legendary
    let msg = '+' + coins + ' COINS';
    let pw = null;
    if (cfg.powerup) {
      const types = ['shield','rage','speed','magnet','timewarp','dcoin'];
      pw = types[Math.floor(Math.random() * types.length)];
      Player.powerups[pw] = 10;
      msg += ' • ' + pw.toUpperCase();
    }
    if (cfg.rare) {
      msg += ' • RARE BONUS!';
    }
    Game.showChestReward(rar, msg);
  }

  function updateTrap(t, dt, ctx, room) {
    const P = Player;
    // Apply the daily "faster traps" modifier by speeding up trap time.
    dt *= (ctx.trapSpeedMul || 1);
    switch (t.type) {
      case 'spikes':
        t.pulse = (t.pulse + dt) % 1;
        // damage when extended
        if (t.pulse > 0.3) {
          const rect = { x: t.x, y: t.y - 6, w: t.w, h: t.h + 6 };
          if (Collision.rectsOverlap({ x: P.x, y: P.y, w: P.w, h: P.h }, rect)) {
            P.takeDamage(10, Math.sign(P.x + P.w/2 - (t.x + t.w/2)) || 1, 'trap');
          }
        }
        break;
      case 'saw': {
        t.t += dt;
        const cx = t.x + t.w/2;
        const range = t.range;
        const rx = Math.sin(t.t * 2) * range;
        t.cx = cx + rx;
        t.cy = t.y + t.h/2;
        if (Collision.circleRect(t.cx, t.cy, 18, { x: P.x, y: P.y, w: P.w, h: P.h })) {
          P.takeDamage(12, Math.sign(P.x + P.w/2 - t.cx), 'trap');
          Game.camera.shake(3, 0.1);
        }
        break;
      }
      case 'laser': {
        t.t -= dt;
        if (t.t <= 0) {
          if (t.state === 'charge') {
            t.state = 'fire';
            t.t = 0.4;
            AudioM.play('charge');
          } else if (t.state === 'fire') {
            t.state = 'charge';
            t.t = 1.2 + Math.random();
          }
        }
        // laser rect from trap upward
        if (t.state === 'fire') {
          const rect = { x: t.x, y: room.bounds.y, w: t.w, h: t.y - room.bounds.y };
          if (Collision.rectsOverlap({ x: P.x, y: P.y, w: P.w, h: P.h }, rect)) {
            P.takeDamage(14, 0, 'trap');
          }
        }
        break;
      }
      case 'arrow': {
        t.t -= dt;
        if (t.t <= 0) {
          if (t.state === 'charge') {
            t.state = 'fire';
            t.t = 0.3;
          } else if (t.state === 'fire') {
            // shoot
            const dir = t.opts.dir || 1;
            room.projectiles.push({ x: t.x, y: t.y + 10, vx: 300 * dir, vy: 0, life: 2, dmg: 12, team: 'enemy', color: '#ffd24d' });
            AudioM.play('charge');
            t.state = 'charge';
            t.t = 1.5 + Math.random();
          }
        }
        break;
      }
      case 'explosive': {
        const d = Math.hypot(P.x + P.w/2 - (t.x + t.w/2), P.y + P.h/2 - (t.y + t.h/2));
        if (d < 40 && t.active) {
          t.active = false;
          t.gone = true;
          Game.particles.burst(t.x + t.w/2, t.y + t.h/2, '#ff4d6d', 18, 240, 0.5);
          Game.particles.burst(t.x + t.w/2, t.y + t.h/2, '#ff9d4d', 10, 160, 0.4);
          Game.camera.shake(8, 0.3);
          AudioM.play('explosion');
          const rad = t.opts.radius || 70;
          if (d < rad) P.takeDamage(16, Math.sign(P.x + P.w/2 - (t.x + t.w/2)), 'explosion');
        }
        break;
      }
    }
  }

  // ================= DRAW =================
  function drawRoom(room, ctx, cam) {
    const off = cam.offset();
    const b = room.bounds;
    const dark = room.event === 'darkness';

    // background
    const g = ctx.createLinearGradient(0, 0, 0, cam.h);
    g.addColorStop(0, dark ? '#05060d' : '#0a0e1a');
    g.addColorStop(1, dark ? '#0d0a18' : '#131a30');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.w, cam.h);

    // tower backdrop columns
    ctx.fillStyle = 'rgba(78,240,255,0.05)';
    for (let x = Math.floor(off.x / 140) * 140; x < off.x + cam.w + 140; x += 140) {
      ctx.fillRect(x - off.x, 0, 3, cam.h);
    }
    // distant windows glow
    ctx.fillStyle = 'rgba(178,77,255,0.12)';
    for (let x = Math.floor(off.x / 200) * 200; x < off.x + cam.w + 200; x += 200) {
      const wy = ((x / 200) % 3) * 60 + 40;
      ctx.fillRect(x - off.x, wy, 8, 12);
      ctx.fillRect(x - off.x, wy + 30, 8, 12);
    }

    // darkness fog
    if (dark) {
      const darkG = ctx.createRadialGradient(cam.w/2, cam.h/2, 60, cam.w/2, cam.h/2, 340);
      darkG.addColorStop(0, 'rgba(0,0,0,0)');
      darkG.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = darkG;
      ctx.fillRect(0, 0, cam.w, cam.h);
    }

    // platforms (collidables solid ones)
    for (const p of room.platforms) {
      if (p.kind !== 'solid') continue;
      drawPlatform(p.x - off.x, p.y - off.y, p.w, p.h, room.event === 'cursed');
    }
    // dynamic platforms
    for (const dp of room.dynPlatforms) {
      if (dp.gone) continue;
      let shake = 0;
      if (dp.delay > 0 && dp.kind === 'falling') shake = Math.sin(Date.now()/40) * 2;
      const alpha = dp.kind === 'fake' ? 0.6 : 1;
      drawPlatform(dp.x - off.x + shake, dp.y - off.y, dp.w, dp.h, false, alpha, dp.kind);
    }

    // start marker
    ctx.fillStyle = '#4dff88';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(room.start.x - off.x, room.start.y - off.y, 20, 8);
    ctx.globalAlpha = 1;

    // exit (portal)
    const er = room.exit;
    const ex = er.x - off.x, ey = er.y - off.y;
    const pulse = 1 + Math.sin(Date.now() / 300) * 0.15;
    ctx.save();
    ctx.translate(ex + er.w/2, ey + er.h/2);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = 20;
    ctx.strokeStyle = '#4ef0ff'; ctx.lineWidth = 3;
    ctx.strokeRect(-er.w/2, -er.h/2, er.w, er.h);
    ctx.fillStyle = 'rgba(78,240,255,0.3)';
    ctx.fillRect(-er.w/2, -er.h/2, er.w, er.h);
    ctx.restore();
    ctx.shadowBlur = 0;

    // traps
    for (const t of room.traps) drawTrap(t, ctx, off);

    // coins
    for (const c of room.coins) {
      if (c.taken) continue;
      const bob = Math.sin(Date.now()/200 + c.x) * 3;
      ctx.shadowColor = '#ffd24d'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffd24d';
      ctx.beginPath();
      ctx.arc(c.x - off.x, c.y - off.y + bob, 5, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#8a6a00';
      ctx.beginPath();
      ctx.arc(c.x - off.x, c.y - off.y + bob, 2.5, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // powerups
    for (const p of room.powerups) {
      if (p.taken) continue;
      drawPowerup(p, ctx, off);
    }

    // chests
    for (const c of room.chests) {
      if (c.opened) continue;
      drawChest(c, ctx, off);
    }

    // enemies & boss
    for (const e of room.entities) {
      if (!e.alive) continue;
      if (e.type === 'boss') Bosses.drawBoss(e, ctx, cam);
      else Enemies.drawEnemy(e, ctx, cam);
    }

    // projectiles
    for (const pr of room.projectiles) {
      ctx.shadowColor = pr.color; ctx.shadowBlur = 8;
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(pr.x - off.x, pr.y - off.y, 4, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawPlatform(x, y, w, h, cursed, alpha, kind) {
    const ctx = Game.ctx;
    ctx.save();
    ctx.globalAlpha = alpha !== undefined ? alpha : 1;
    const isFake = kind === 'fake';
    ctx.fillStyle = isFake ? 'rgba(142,160,194,0.5)' : (cursed ? '#3a0f1a' : '#1b2338');
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = isFake ? '#aabbdd' : (cursed ? '#5a1626' : '#2a3450');
    ctx.fillRect(x, y, w, 3);
    // neon top edge
    ctx.fillStyle = cursed ? '#ff4d6d' : '#4ef0ff';
    ctx.globalAlpha = (alpha !== undefined ? alpha : 1) * 0.7;
    ctx.fillRect(x, y, w, 2);
    ctx.restore();
  }

  function drawTrap(t, ctx, off) {
    const sx = t.x - off.x, sy = t.y - off.y;
    switch (t.type) {
      case 'spikes': {
        const extend = t.pulse > 0.3 ? 1 : 0;
        ctx.fillStyle = '#c8ccd8';
        for (let i = 0; i < t.w / 8; i++) {
          const sx2 = sx + i * 8;
          ctx.beginPath();
          ctx.moveTo(sx2, sy + t.h);
          ctx.lineTo(sx2 + 4, sy - 6 * extend);
          ctx.lineTo(sx2 + 8, sy + t.h);
          ctx.fill();
        }
        ctx.fillStyle = '#8ea0c2';
        ctx.fillRect(sx, sy + t.h, t.w, 3);
        break;
      }
      case 'saw': {
        ctx.save();
        ctx.translate(t.cx - off.x, t.cy - off.y);
        ctx.rotate(t.t * 8);
        ctx.fillStyle = '#c8ccd8';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#666'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          ctx.beginPath(); ctx.moveTo(Math.cos(a)*14, Math.sin(a)*14); ctx.lineTo(Math.cos(a)*20, Math.sin(a)*20); ctx.stroke();
        }
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'laser': {
        // emitter
        ctx.fillStyle = '#8ea0c2';
        ctx.fillRect(sx, sy - 8, t.w, 8);
        ctx.fillStyle = '#ff4d6d';
        ctx.fillRect(sx + 2, sy - 8, t.w - 4, 2);
        if (t.state === 'charge') {
          const pulse = Math.sin(Date.now()/60) * 0.5 + 0.5;
          ctx.strokeStyle = 'rgba(255,77,109,' + pulse + ')';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sx + t.w/2, sy); ctx.lineTo(sx + t.w/2, sy - 60); ctx.stroke();
        } else if (t.state === 'fire') {
          ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 12;
          ctx.fillStyle = 'rgba(255,77,109,0.9)';
          ctx.fillRect(sx + 2, Game.camera.y - off.y, t.w - 4, t.y - Game.camera.y);
          ctx.shadowBlur = 0;
        }
        break;
      }
      case 'arrow': {
        const firing = t.state === 'fire';
        const dir = t.opts.dir || 1;
        ctx.fillStyle = '#8a5a1a';
        ctx.fillRect(sx, sy, t.w, t.h);
        ctx.fillStyle = '#ffd24d';
        if (firing) {
          // arrow head
          ctx.beginPath();
          ctx.moveTo(sx + (dir>0 ? t.w : 0), sy + t.h/2);
          ctx.lineTo(sx + (dir>0 ? t.w+10 : -10), sy + t.h/2);
          ctx.lineTo(sx + (dir>0 ? t.w : 0), sy + t.h/2 + 4);
          ctx.fill();
        }
        break;
      }
      case 'explosive': {
        ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#8a3a4a';
        ctx.beginPath(); ctx.arc(sx + t.w/2, sy + t.h/2, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath(); ctx.arc(sx + t.w/2, sy + t.h/2, 4, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  function drawPowerup(p, ctx, off) {
    const bob = Math.sin(Date.now()/250 + p.x) * 4;
    const colors = { shield:'#9df3ff', rage:'#ff4d6d', speed:'#4dff88', magnet:'#ffd24d', timewarp:'#b24dff', dcoin:'#ffd24d' };
    const col = colors[p.type] || '#4ef0ff';
    ctx.save();
    ctx.translate(p.x - off.x, p.y - off.y + bob);
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(9, 0); ctx.lineTo(0, 10); ctx.lineTo(-9, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a0e1a';
    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    const label = {shield:'S',rage:'R',speed:'F',magnet:'M',timewarp:'T',dcoin:'2x'}[p.type];
    ctx.fillText(label, 0, 3);
    ctx.restore();
  }

  function drawChest(c, ctx, off) {
    const rarColors = { common:'#c8ccd8', rare:'#ffd24d', epic:'#b24dff', legendary:'#ff2d55' };
    const col = rarColors[c.rarity] || '#c8ccd8';
    ctx.save();
    const bob = Math.sin(Date.now()/300 + c.x) * 2;
    ctx.translate(c.x - off.x, c.y - off.y + bob);
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(0, 8, 36, 26);
    ctx.fillStyle = '#7a5a2a';
    ctx.beginPath();
    ctx.moveTo(-1, 8); ctx.lineTo(18, -2); ctx.lineTo(37, 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = col;
    ctx.fillRect(15, 8, 6, 8);
    ctx.restore();
  }

  global.Rooms = { buildRoom, updateRoom, drawRoom };
})(window);
