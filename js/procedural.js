/* ============================================================
   procedural.js — random room generation.
   Generates a room data structure (validated so it is always
   beatable): platforms form a reachable path from start to exit.
   ============================================================ */
(function (global) {
  'use strict';

  // World constants
  const GROUND_Y = 660;    // top surface of the floor
  const H = 760;           // room height
  const JUMP_H = 85;       // reliable vertical reach
  const JUMP_DIST = 118;   // reliable horizontal gap

  function roomTemplate(floor) {
    // type selection with special events
    const isBoss = floor % 10 === 0;
    if (isBoss) return 'boss';

    // event rolls (occasionally)
    const eventRoll = Math.random();
    const canEvent = floor > 2;
    if (canEvent && eventRoll < 0.12) {
      const events = ['coinRush', 'darkness', 'doubleEnemies', 'treasure', 'cursed'];
      return 'event:' + events[Math.floor(Math.random() * events.length)];
    }

    // weighted normal floor types
    const r = Math.random();
    let type;
    if (r < 0.30) type = 'combat';
    else if (r < 0.52) type = 'trap';
    else if (r < 0.66) type = 'parkour';
    else if (r < 0.76) type = 'treasure';
    else if (r < 0.86) type = 'mystery';
    else if (r < 1.0) type = 'challenge';
    return type;
  }

  function makePlatform(x, y, w, h, kind) {
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: h || 20, kind: kind || 'solid' };
  }

  function generateFloor(floor, options) {
    options = options || {};
    let type = options.forceType || roomTemplate(floor);
    let event = null;
    if (type.indexOf('event:') === 0) {
      event = type.slice(6);
      type = 'combat';
    }

    const W = 1600;
    const isBoss = floor % 10 === 0;
    const bw = isBoss ? 1900 : W;

    const room = {
      type: isBoss ? 'boss' : type,
      floor,
      event,
      bossFloor: isBoss,
      bounds: { x: 0, y: 0, w: bw, h: H },
      platforms: [],
      start: { x: 40, y: GROUND_Y - 40 },
      // Exit always has width/height so collision & rendering work for every
      // floor type (normal floors previously had no w/h -> unreachable exit).
      exit: { x: bw - 120, y: GROUND_Y - 40, w: 40, h: 40 },
      enemies: [],
      coins: [],
      traps: [],
      chests: [],
      powerups: [],
      difficulty: calcDifficulty(floor),
      seed: (Math.random() * 1e9) | 0,
    };

    // Always a solid ground floor spanning the room.
    room.platforms.push(makePlatform(-20, GROUND_Y, bw + 40, 120));

    if (isBoss) {
      generateBossRoom(room);
    } else {
      generateNormalRoom(room, floor);
    }

    // Ensure at least one coin and a reward placement.
    addCoins(room, floor);
    addRewards(room, floor);
    validate(room);
    return room;
  }

  function calcDifficulty(floor) {
    return 1 + (floor - 1) * 0.09;
  }

  function generateBossRoom(room) {
    // Arena: flat with a couple of floating cover blocks. These must NOT form
    // impassable walls — the ground route to the exit must always stay open.
    const W = room.bounds.w;
    const cx = W / 2;
    // Floating cover blocks, high enough that the player can walk underneath.
    room.platforms.push(makePlatform(cx - 150, GROUND_Y - 120, 26, 20));
    room.platforms.push(makePlatform(cx + 120, GROUND_Y - 120, 26, 20));
    room.platforms.push(makePlatform(cx - 150, GROUND_Y - 60, 26, 20));
    room.platforms.push(makePlatform(cx + 120, GROUND_Y - 60, 26, 20));
    // boss spawn center
    room.enemies.push({ type: 'boss', x: W / 2 - 40, y: GROUND_Y - 110 });
    room.exit = { x: W - 110, y: GROUND_Y - 40, w: 40, h: 40 };
  }

  function generateNormalRoom(room, floor) {
    const W = room.bounds.w;
    const type = room.type;
    const diff = room.difficulty;
    const P = room.platforms;

    // Build a reachable stepping-stone path along the room.
    // Start platform edge at left; walk right placing platforms.
    let x = 40;
    const pathY = GROUND_Y;
    const path = [makePlatform(0, pathY, 200, 20)]; // entry ledge
    let y = pathY;
    let reachedRight = false;
    let steps = 0;
    let lastWasHigh = false;
    while (!reachedRight && steps < 60) {
      steps++;
      const gap = 60 + Math.random() * (JUMP_DIST - 62);
      let ny = y;
      // vary height within jump reach. Platforms are kept high enough that a
      // player running along the ground always clears underneath them, so the
      // ground route to the exit is never blocked by a low-hanging wall.
      const delta = (Math.random() - 0.5) * 2 * JUMP_H;
      ny = clamp(ny + delta, GROUND_Y - 140, GROUND_Y - 70);
      // never place too high then impossible
      const w = 90 + Math.random() * 120;
      const plat = makePlatform(x + gap, ny, w, 20);
      x = plat.x + plat.w;
      path.push(plat);
      y = ny;
      if (x > W - 260) reachedRight = true;
    }
    // final exit ledge
    path.push(makePlatform(x - 40, GROUND_Y, W - (x - 40) + 60, 20));

    // Now apply type-specific decoration using the path as base.
    P.push.apply(P, path);

    // ----- ENEMIES -----
    const enemyCount = Math.min(2 + Math.floor(diff * 2) + Math.floor(floor / 3), 12);
    if (type !== 'parkour' && type !== 'treasure') {
      for (let i = 0; i < enemyCount; i++) {
        const px = 200 + Math.random() * (W - 400);
        room.enemies.push({ type: pickEnemy(floor), x: px, y: pathY - 30 });
      }
    } else if (type === 'treasure') {
      // fewer enemies
      for (let i = 0; i < Math.min(3, enemyCount); i++) room.enemies.push({ type: 'slime', x: 300 + Math.random() * (W - 600), y: pathY - 30 });
    }

    // ----- TRAPS -----
    const trapCount = (type === 'trap' ? 3 + Math.floor(floor / 4) : (type === 'challenge' ? 2 : 0));
    for (let i = 0; i < trapCount; i++) {
      const plat = path[2 + Math.floor(Math.random() * Math.max(1, path.length - 4))];
      const ttype = pickTrap(floor);
      if (ttype === 'spikes') {
        room.traps.push({ type: 'spikes', x: plat.x + plat.w / 2 - 30, y: plat.y - 14, w: 60, h: 14 });
      } else if (ttype === 'saw') {
        room.traps.push({ type: 'saw', x: plat.x + 40, y: plat.y - 16, w: 32, h: 16, opts: { range: 120 } });
      } else if (ttype === 'laser') {
        room.traps.push({ type: 'laser', x: plat.x + 40, y: plat.y - 20, w: 8, h: 140, opts: { freq: 2, range: 160 } });
      } else if (ttype === 'arrow') {
        room.traps.push({ type: 'arrow', x: plat.x + 20, y: plat.y - 60, w: 24, h: 24, opts: { dir: Math.random() < 0.5 ? 1 : -1 } });
      } else if (ttype === 'explosive') {
        room.traps.push({ type: 'explosive', x: plat.x + 40, y: plat.y - 24, w: 24, h: 24, opts: { radius: 70 } });
      }
    }

    // fake floors for parkour/trap
    if (type === 'parkour' || type === 'trap') {
      for (let i = 2; i < path.length - 2; i++) {
        if (Math.random() < 0.25) path[i].kind = 'fake';
      }
    }
    // falling platforms for trap
    if (type === 'trap' && floor >= 4) {
      for (let i = 3; i < path.length - 2; i++) {
        if (Math.random() < 0.2) path[i].kind = 'falling';
      }
    }

    // ----- POWERUPS -----
    if (Math.random() < 0.35) {
      const ptype = ['shield', 'rage', 'speed', 'magnet', 'timewarp', 'dcoin'][Math.floor(Math.random() * 6)];
      room.powerups.push({ type: ptype, x: 300 + Math.random() * (W - 600), y: GROUND_Y - 60 });
    }

    // ----- CHESTS -----
    if (type === 'treasure') {
      const n = Math.min(4, 2 + Math.floor(floor / 5));
      for (let i = 0; i < n; i++) {
        const rarity = weightedChest(floor);
        room.chests.push({ rarity, x: 250 + Math.random() * (W - 500), y: GROUND_Y - 40 });
      }
    } else if (type === 'combat' && Math.random() < 0.3) {
      room.chests.push({ rarity: weightedChest(floor), x: 300 + Math.random() * (W - 600), y: GROUND_Y - 40 });
    } else if (Math.random() < 0.12) {
      room.chests.push({ rarity: 'common', x: 300 + Math.random() * (W - 600), y: GROUND_Y - 40 });
    }

    // event decorations
    if (room.event === 'coinRush') {
      // many coins handled in addCoins
    } else if (room.event === 'doubleEnemies') {
      const extra = room.enemies.slice();
      extra.forEach((e) => room.enemies.push({ type: e.type, x: Math.min(W - 40, e.x + 40), y: e.y }));
    }
  }

  function pickEnemy(floor) {
    const pool = ['slime'];
    if (floor >= 3) pool.push('bat');
    if (floor >= 5) pool.push('guard');
    if (floor >= 7) pool.push('archer');
    if (floor >= 8) pool.push('bomber');
    if (floor >= 12) pool.push('shadow');
    if (floor >= 15) pool.push('elite');
    const r = Math.random();
    // weight toward earlier enemies
    const idx = Math.floor(Math.pow(r, 0.7) * pool.length);
    return pool[Math.min(idx, pool.length - 1)];
  }

  function pickTrap(floor) {
    const pool = ['spikes'];
    if (floor >= 3) pool.push('saw');
    if (floor >= 6) pool.push('laser');
    if (floor >= 5) pool.push('arrow');
    if (floor >= 8) pool.push('explosive');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function weightedChest(floor) {
    const r = Math.random() + floor * 0.008;
    if (r < 0.6) return 'common';
    if (r < 0.85) return 'rare';
    if (r < 0.97) return 'epic';
    return 'legendary';
  }

  function addCoins(room, floor) {
    const W = room.bounds.w;
    const base = 8 + floor;
    const rush = room.event === 'coinRush';
    const count = Math.min(60, rush ? 60 : base);
    for (let i = 0; i < count; i++) {
      const x = 100 + Math.random() * (W - 200);
      const y = room.platforms.length ? (GROUND_Y - 20 - Math.random() * 60) : (GROUND_Y - 20);
      const onTop = Math.random() < 0.6;
      room.coins.push({
        x, y: onTop ? GROUND_Y - 20 - Math.random() * 40 : y,
        value: (room.event === 'doubleEnemies' || room.event === 'cursed') ? 2 : 1,
        taken: false,
      });
    }
  }

  function addRewards(room, floor) {
    // exit always has a reward (chest or coins) near it
    if (Math.random() < 0.4) {
      room.chests.push({ rarity: weightedChest(floor), x: room.exit.x - 60, y: GROUND_Y - 40 });
    } else {
      const cx = room.exit.x - 60;
      for (let i = 0; i < 6; i++) room.coins.push({ x: cx + i * 18, y: GROUND_Y - 24, value: 1, taken: false });
    }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function validate(room) {
    // Ensure exit is reachable: there is a platform within jump range of room right area.
    const W = room.bounds.w;
    // ground always exists so player can always walk/fall to exit on boss arena; for normal rooms
    // ensure exit ledge connects to ground path. We already placed exit near ground. Safe fallback:
    if (!room.bossFloor && !room.platforms.some(p => p.kind !== 'fake' && p.x + p.w > W - 140 && p.y === GROUND_Y)) {
      room.platforms.push(makePlatform(W - 240, GROUND_Y, 260, 20));
    }
    // exit coordinates ensure player lands on ground level
    room.exit.y = GROUND_Y - 40;
  }

  global.Procedural = { generateFloor, GROUND_Y, H, JUMP_H, JUMP_DIST };
})(window);
