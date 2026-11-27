/* Headless runtime test harness — NOT part of the game. */
'use strict';
const fs = require('fs');
const path = require('path');

// ---- minimal DOM / window stubs ----
function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: 'left', shadowColor: '', shadowBlur: 0, imageSmoothingEnabled: false,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {}, drawImage() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {},
    fill() {}, stroke() {}, arc() {}, rect() {}, ellipse() {}, moveTo() {}, lineTo() {},
    fillText() {}, strokeText() {}, clip() {}, bezierCurveTo() {}, quadraticCurveTo() {},
  };
  return new Proxy(target, {
    get(o, p) { if (p in o) return o[p]; return () => gradient; },
    set(o, p, v) { o[p] = v; return true; },
  });
}

function makeElement(id) {
  const listeners = {};
  const el = {
    id,
    _text: '', innerHTML: '',
    style: {}, dataset: {},
    children: [], parentNode: null,
    className: '',
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, f) { if (f === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else { f ? this._set.add(c) : this._set.delete(c); } },
      contains(c) { return this._set.has(c); },
    },
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 20, left: 0, top: 0 }),
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    append(c) { this.appendChild(c); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
  };
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; }, set(v) { this._text = String(v); }
  });
  return el;
}

const elements = {};
function getEl(id) {
  if (id === 'gameCanvas') return canvas;
  if (!elements[id]) elements[id] = makeElement(id);
  return elements[id];
}

const ctx = makeCtx();
const canvas = {
  width: 800, height: 450, style: {},
  getContext: () => ctx,
  getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 450 }),
};

const windowStub = {
  devicePixelRatio: 1,
  innerWidth: 1000, innerHeight: 600,
  navigator: { maxTouchPoints: 0 },
  addEventListener() {},
  localStorage: {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame() { return 0; },
  performance: { now: () => Date.now() },
};

// Proxy window so that assigning window.Save etc. also defines it as a bare global,
// mirroring browser behavior where window === global object.
const windowProxy = new Proxy(windowStub, {
  get(t, p) { return t[p]; },
  set(t, p, v) { t[p] = v; try { global[p] = v; } catch (e) {} return true; },
  has(t, p) { return p in t; },
});
global.window = windowProxy;
global.window.window = windowProxy;
global.self = windowProxy;
global.document = {
  getElementById: getEl,
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (t) => {
    if (t === 'canvas') { const c = makeElement('canvas'); c.width = 120; c.height = 120; c.getContext = () => makeCtx(); return c; }
    return makeElement(t);
  },
  body: makeElement('body'),
  addEventListener() {},
  documentElement: { style: {} },
  readyState: 'complete',
};
global.localStorage = windowStub.localStorage;
try { Object.defineProperty(global, 'navigator', { value: windowStub.navigator, configurable: true }); } catch (e) { global.navigator = windowStub.navigator; }
global.requestAnimationFrame = windowStub.requestAnimationFrame;
global.performance = windowStub.performance;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;

// ---- load all game scripts in order ----
const files = [
  'ads.js','ownerMode.js','audio.js','settings.js','save.js','particles.js','input.js','mobileControls.js',
  'weapons.js','player.js','enemies.js','bosses.js','collision.js','camera.js','procedural.js',
  'rooms.js','upgrades.js','dailyChallenge.js','ui.js','game.js','main.js'
];
for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');
  try { eval(code); } catch (e) { console.error('LOAD ERROR in ' + f + ':', e.message); process.exit(1); }
}
console.log('All scripts loaded OK.');

// ---- simulate a run ----
Save.load();
Game.init(canvas);
UI.init();
MobileControls.enabled = false;

// Force through loading
Game.finishLoading();
if (Game.state !== 'MENU') { console.error('Expected MENU, got', Game.state); process.exit(1); }
console.log('Menu state OK.');

// start run (skip tutorial by marking seen)
Save.get().unlocks.tutorialSeen = true;
Game.beginRun(false);
if (Game.state !== 'PLAYING') { console.error('Expected PLAYING, got', Game.state); process.exit(1); }
console.log('Run started. Floor', Game.run.floor, 'room type', Game.room.type, 'platforms', Game.room.platforms.length, 'enemies', Game.room.entities.length, 'coins', Game.room.coins.length, 'traps', Game.room.traps.length);

// simulate player moving & several frames
Player.x = Game.room.start.x; Player.y = Game.room.start.y;
for (let i = 0; i < 300; i++) {
  // simulate walking right and jumping
  Input.keys['d'] = true;
  if (i % 40 === 0) Input.bufferedJump = true;
  if (i % 15 === 0) Input.bufferedAttack = true;
  Game.update(1 / 60);
  if (Game.state !== 'PLAYING') break;
}
console.log('After 300 frames: state', Game.state, 'floor', Game.run.floor, 'runCoins', Game.run.runCoins, 'score', Game.run.score, 'playerHealth', Math.round(Player.health));
if (Game.state !== 'PLAYING') console.log('   (state changed during simulation)');

// Test kill player / death flow
Game.killPlayer(false);
console.log('After kill: state', Game.state);

// damageEntity test
// ---- test floor completion -> selection -> next floor ----
console.log('\nFLOOR COMPLETION FLOW:');
// ensure a living player in an active run for exit completion
Player.alive = true;
Game.state = 'PLAYING';
Game.run.floor = 3; // make next floor (4) trigger selection
Game.run.canRevive = true;
Game.room.exitReached = false;
Game.onExitReached();
console.log('  after exit reached: state', Game.state, 'runCoins', Game.run.runCoins);
Game.continueRun();
console.log('  continueRun -> state', Game.state, 'floor', Game.run.floor);
Game.chooseFloor('insane');
console.log('  chooseFloor -> state', Game.state, 'pendingDifficulty', Game.pendingDifficulty);
Game.room.exitReached = false;
Game.onExitReached();
Game.continueRun();
console.log('  next floor', Game.run.floor, 'state', Game.state);

// ---- daily flow ----
console.log('\nDAILY FLOW:');
const ch = Daily.getChallenge();
console.log('  challenge: target', ch.targetFloor, 'modifier', ch.modifier.id, 'reward', ch.reward);
Game.startDailyRun();
console.log('  daily run state', Game.state, 'modifiers', JSON.stringify(Game.modifiers.id));

// ---- upgrade purchase ----
console.log('\nUPGRADE SHOP:');
Save.get().playerData.coins = 100000;
const before = Save.get().upgrades.health;
const price = Upgrades.priceFor('health', before);
UI.buyUpgrade('health');
const after = Save.get().upgrades.health;
console.log('  bought health: before', before, 'after', after, 'price', price, 'coins left', Save.get().playerData.coins);
const stats = Upgrades.getStats();
console.log('  stats:', JSON.stringify(stats));

// ---- boss kill ----
console.log('\nBOSS FLOW:');
const bossRoom = Game.room;
if (bossRoom.boss) {
  console.log('  boss present:', bossRoom.boss.name, 'hp', bossRoom.boss.hp);
  Game.damageEntity(bossRoom.boss, 99999, 1, true);
  console.log('  after massive damage boss alive?', bossRoom.boss.alive, 'bossKills', Game.run.bossKills);
} else {
  console.log('  (not on boss floor, skipped)');
}

// ---- death -> bank on final transition ----
console.log('\nEND OF RUN:');
Game.run.runCoins = 123;
Game.killPlayer(false);
const banked = Game.bankRun();
console.log('  state', Game.state, 'banked coins', banked, 'player coins', Save.get().playerData.coins);
console.log('  second bankRun (idempotent):', Game.bankRun(), 'coins still', Save.get().playerData.coins);

// ---- dedicated boss test ----
console.log('\nBOSS FLOOR TEST:');
Game.generateRoom(10);
console.log('  bossFloor:', Game.room.bossFloor, 'boss:', Game.room.boss ? Game.room.boss.name : 'none');
if (Game.room.boss) {
  const b = Game.room.boss;
  console.log('  boss hp', b.hp, '/', b.maxHp);
  Game.damageEntity(b, 99999, 1, true);
  console.log('  boss alive after hit:', b.alive, 'bossKills', Game.run.bossKills);
}

// ---- daily claim + save corruption ----
console.log('\nDAILY CLAIM & SAVE VALIDATION:');
const ch2 = Daily.getChallenge();
const s2 = Save.get();
s2.dailyChallenge = { date: ch2.date, seed: ch2.seed, completed: true, bestFloor: ch2.targetFloor, rewardClaimed: false };
const beforeCoins = s2.playerData.coins;
const claimed = Daily.claimReward();
console.log('  claimed reward:', claimed, 'coins before->after:', beforeCoins, '->', s2.playerData.coins);
console.log('  rewardClaimed now:', s2.dailyChallenge.rewardClaimed);
// corrupt save test
window.localStorage.setItem('oneMoreFloorSave', '{oops not json');
const recovered = Save.load();
console.log('  after corrupt load: coins', recovered.playerData.coins, 'saveVersion', recovered.saveVersion, 'highestFloor', recovered.playerData.highestFloor);
// NaN/negative clamp test
window.localStorage.setItem('oneMoreFloorSave', JSON.stringify({ saveVersion: 3, playerData: { coins: -500, highestFloor: NaN, bestScore: 'abc' }, upgrades: { health: 999 }, statistics: {}, settings: {}, dailyChallenge: {}, unlocks: {} }));
const clamped = Save.load();
console.log('  clamped: coins', clamped.playerData.coins, 'highestFloor', clamped.playerData.highestFloor, 'bestScore', clamped.playerData.bestScore, 'health lvl', clamped.upgrades.health);

console.log('\nPROCEDURAL VALIDATION:');
let invalid = 0;
for (let f = 1; f <= 40; f++) {
  const d = Procedural.generateFloor(f, {});
  const hasGround = d.platforms.some(p => p.kind === 'solid' && p.y === 660);
  const exitInBounds = d.exit.x > 0 && d.exit.x < d.bounds.w;
  if (!hasGround || !exitInBounds) invalid++;
  if (f % 10 === 0) console.log('  floor', f, d.type, 'platforms', d.platforms.length, 'enemies', d.enemies.length, 'traps', d.traps.length, d.event || '');
}
console.log('  invalid floors:', invalid);
console.log('DONE');
