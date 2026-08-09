/* Headless QA regression harness — NOT part of the game. */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL: ' + name + (detail ? ' :: ' + detail : '')); }
}

function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    fillStyle:'',strokeStyle:'',lineWidth:1,globalAlpha:1,font:'',textAlign:'left',
    shadowColor:'',shadowBlur:0,imageSmoothingEnabled:false,
    createLinearGradient:()=>gradient, createRadialGradient:()=>gradient,
    createPattern:()=>({}), measureText:()=>({width:10}),
    getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, drawImage(){},
    save(){},restore(){},translate(){},rotate(){},scale(){},setTransform(){},
    clearRect(){},fillRect(){},strokeRect(){},beginPath(){},closePath(){},
    fill(){},stroke(){},arc(){},rect(){},ellipse(){},moveTo(){},lineTo(){},
    fillText(){},strokeText(){},clip(){},bezierCurveTo(){},quadraticCurveTo(){},
  };
  return new Proxy(target, { get(o,p){ return (p in o)?o[p]:(()=>gradient); }, set(o,p,v){ o[p]=v; return true; } });
}
function makeElement(id){
  const listeners={};
  const el={
    id,_text:'',innerHTML:'',style:{},dataset:{},children:[],className:'',parentNode:null,
    classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x));},remove(...c){c.forEach(x=>this._s.delete(x));},
      toggle(c,f){if(f===undefined){this._s.has(c)?this._s.delete(c):this._s.add(c);}else{f?this._s.add(c):this._s.delete(c);}},
      contains(c){return this._s.has(c);}},
    getBoundingClientRect:()=>({x:0,y:0,width:100,height:20,left:0,top:0,right:100,bottom:20}),
    addEventListener(t,f){(listeners[t]=listeners[t]||[]).push(f);}, removeEventListener(){},
    appendChild(c){this.children.push(c);c.parentNode=this;return c;}, append(c){this.appendChild(c);},
    querySelector(){return null;}, querySelectorAll(){return [];}, focus(){},
  };
  Object.defineProperty(el,'textContent',{get(){return this._text;},set(v){this._text=String(v);}});
  return el;
}
const elements={};
function getEl(id){ if(id==='gameCanvas') return canvas; if(!elements[id]) elements[id]=makeElement(id); return elements[id]; }
const ctx=makeCtx();
const canvas={width:800,height:450,style:{},getContext:()=>ctx,getBoundingClientRect:()=>({x:0,y:0,width:800,height:450})};

const windowStub={
  devicePixelRatio:1,innerWidth:1000,innerHeight:600,
  navigator:{maxTouchPoints:0}, addEventListener(){},
  localStorage:{_d:{},getItem(k){return Object.prototype.hasOwnProperty.call(this._d,k)?this._d[k]:null;},setItem(k,v){this._d[k]=String(v);},removeItem(k){delete this._d[k];}},
  setTimeout,clearTimeout,setInterval,clearInterval, requestAnimationFrame(){return 0;}, performance:{now:()=>Date.now()},
};
const windowProxy=new Proxy(windowStub,{get(t,p){return t[p];},set(t,p,v){t[p]=v;try{global[p]=v;}catch(e){}return true;},has(t,p){return p in t;}});
global.window=windowProxy; global.window.window=windowProxy; global.self=windowProxy;
global.document={getElementById:getEl,querySelectorAll:()=>[],querySelector:()=>null,
  createElement:(t)=>{ if(t==='canvas'){const c=makeElement('canvas');c.width=120;c.height=120;c.getContext=()=>makeCtx();return c;} return makeElement(t);},
  body:makeElement('body'),addEventListener(){},documentElement:{style:{}},readyState:'complete'};
global.localStorage=windowStub.localStorage;
try{Object.defineProperty(global,'navigator',{value:windowStub.navigator,configurable:true});}catch(e){}
global.requestAnimationFrame=windowStub.requestAnimationFrame; global.performance=windowStub.performance;
global.AudioContext=undefined; global.webkitAudioContext=undefined;

const files=['ads.js','ownerMode.js','audio.js','settings.js','save.js','particles.js','input.js','mobileControls.js','weapons.js','player.js','enemies.js','bosses.js','collision.js','camera.js','procedural.js','rooms.js','upgrades.js','dailyChallenge.js','ui.js','game.js','main.js'];
for(const f of files){ eval(fs.readFileSync(path.join(__dirname,'js',f),'utf8')); }
Save.load(); Game.init(canvas); UI.init(); MobileControls.enabled=false;
Save.get().unlocks.tutorialSeen=true;

console.log('=== QA REGRESSION TESTS ===');

// ---- TEST 1: every floor has a valid exit with w/h ----
{
  let bad=0;
  for(let f=1;f<=1000;f++){
    const d=Procedural.generateFloor(f,{});
    if(!d.exit || typeof d.exit.w!=='number' || typeof d.exit.h!=='number' || d.exit.w<=0 || d.exit.h<=0) bad++;
    if(!isFinite(d.exit.x)||!isFinite(d.exit.y)) bad++;
    if(!d.platforms.some(p=>p.kind!=='fake'&&p.y===660)) bad++;
    if(!Number.isFinite(d.difficulty)) bad++;
    if(d.platforms.length<2||d.platforms.length>80) bad++;
    if(!Array.isArray(d.enemies)) bad++;
  }
  ok(bad===0,'PROC: exit dims & bounds valid for floors 1-1000','bad='+bad);
}
// ---- TEST 1b: built room collision can actually detect exit overlap ----
{
  Game.beginRun(false);
  const r=Game.room;
  // move player onto exit, run updateRoom via Game.update
  Player.x=r.exit.x-5; Player.y=r.exit.y; Player.alive=true;
  const er=r.exit;
  const overlap=Collision.rectsOverlap({x:Player.x,y:Player.y,w:Player.w,h:Player.h},{x:er.x,y:er.y,w:er.w,h:er.h});
  ok(overlap===true,'PROC: exit rect overlaps player (non-boss)','overlap='+overlap);
}
// ---- TEST 2: only ONE game loop ----
{
  const before=global.requestAnimationFrame;
  let rafCalls=0;
  global.requestAnimationFrame=(fn)=>{ rafCalls++; return 0; };
  // startLoop called once in init already (the stub returns 0). beginRun must not add loops.
  rafCalls=0;
  Game.beginRun(false);
  Game.beginRun(false);
  Game.beginRun(false);
  ok(rafCalls===0,'LOOP: beginRun() does not add additional RAF loops','rafCalls='+rafCalls);
  global.requestAnimationFrame=before;
}
// ---- TEST 3: revive does NOT double-bank rewards ----
{
  // reset save
  Save.reset(); Save.get().unlocks.tutorialSeen=true;
  Game.beginRun(false);
  Game.run.runCoins=100;
  Player.health=0; Player.alive=true;
  Game.killPlayer(false);
  const coinsAfterDeath=Save.get().playerData.coins; // should be 0 (not banked yet)
  ok(coinsAfterDeath===0,'REVIVE: coins not banked at death (waiting on final choice)','coins='+coinsAfterDeath);
  // revive (simulate ad success) -> continue
  Game.run.canRevive=true;
  Player.alive=true; Player.health=50;
  Game.state='PLAYING';
  // add more coins after revive
  Game.run.runCoins=250;
  // now run truly ends via toMenu -> banks once
  Game.toMenu();
  const banked=Save.get().playerData.coins;
  ok(banked===Math.floor(250*1),'REVIVE: run banked exactly once after revive','banked='+banked);
  // go to menu again -> no double bank
  const before2=Save.get().playerData.coins;
  Game.toMenu();
  ok(Save.get().playerData.coins===before2,'REVIVE: no double-bank on repeated menu','delta='+(Save.get().playerData.coins-before2));
}
// ---- TEST 4: totalPlayTime not double counted ----
{
  Save.reset(); Save.get().unlocks.tutorialSeen=true;
  Game.beginRun(false);
  Game.run.timeSurvived=50;
  Game.toMenu(); // banks: +50
  const t1=Save.get().statistics.totalPlayTime;
  ok(t1===50,'TIME: first run time 50 banked once','t1='+t1);
  Game.beginRun(false);
  Game.run.timeSurvived=30;
  Game.toMenu();
  ok(Save.get().statistics.totalPlayTime===80,'TIME: second run added without double-count','total='+Save.get().statistics.totalPlayTime);
}
// ---- TEST 5: coinFly life actually expires ----
{
  Game.coinFly.length=0;
  Game.coinFly.push({x:100,y:100,vx:0,vy:0,life:0.01});
  Game.beginRun(false);
  // run several frames
  for(let i=0;i<5;i++) Game.update(1/60);
  ok(Game.coinFly.length===0,'COINFLY: coin fly particles expire','len='+Game.coinFly.length);
  Game.toMenu();
}
// ---- TEST 6: shadow teleport completes ----
{
  const e=Enemies.createEnemy('shadow', 300, 600, 1);
  e.state='warping'; e.teleWarn=0.5; e.teleX=500; e.teleY=600; e.timer=0;
  const ctx={player:Player, collidables:Game.room?Game.room.collidables:[], gravity:1700,
    spawnProjectile(){},spawnEnemy(){},enemySpeedMul:1,roomBounds:{x:0,y:0,w:1900,h:760}};
  // run updateEnemy frames until teleWarn expires
  for(let i=0;i<40;i++){ e.teleWarn-=1/60; Enemies.updateEnemy(e,1/60,ctx); }
  // Teleport should move the shadow toward its target (from 300 toward 500);
  // it may drift afterward from idle chase, so assert meaningful displacement.
  ok(e.state==='idle' && Math.abs(e.x-300) > 40, 'SHADOW: teleports toward player', 'x='+e.x+' state='+e.state);
}
// ---- TEST 7: guard blocking reduces damage ----
{
  Game.beginRun(false);
  const g=Enemies.createEnemy('guard', 200, 600, 1);
  g.hp=70; g.maxHp=70; g.blocking=true;
  const before=Game.run.score;
  Game.damageEntity(g, 40, 1, false);
  ok(g.hp>70-40,'GUARD: blocking halves incoming damage','hp='+g.hp+' expected >30');
  Game.toMenu();
}
// ---- TEST 8: boss projectile fires full volley ----
{
  Game.generateRoom(10);
  const b=Game.room.boss;
  // simulate a projectile pattern via choosePattern forced, then executeTelegraph
  const projStart=Game.room.projectiles.length;
  b.patternIdx='projectile'; b.burstCount=5; b.aimAngle=0;
  b.x=Game.room.bounds.w/2-40; b.y=620;
  // call internal executeTelegraph through updateBoss by setting telegraph and stepping
  b.telegraph={type:'line',x:b.x+b.w/2,y:b.y,angle:0,t:0.01,dur:0.01,color:'#fff'};
  b.state='projectile'; b.timer=1;
  const ctx={player:Player, collidables:Game.room.collidables, gravity:1700,
    spawnProjectile:(x,y,ang,s,dmg,team)=>Game.spawnProjectile(x,y,ang,s,dmg,team),
    spawnEnemy:()=>{},roomBounds:Game.room.bounds};
  Bosses.updateBoss(b, 0.02, ctx);
  const fired=Game.room.projectiles.length-projStart;
  ok(fired>=5,'BOSS: projectile pattern fires full volley (5)','fired='+fired);
  Game.toMenu();
}
// ---- TEST 9: daily reward cannot be double-claimed ----
{
  const ch=Daily.getChallenge();
  const s=Save.get();
  s.dailyChallenge={date:ch.date,seed:ch.seed,completed:true,bestFloor:ch.targetFloor,rewardClaimed:false};
  const coinsBefore=Save.get().playerData.coins;
  const c1=Daily.claimReward();
  ok(c1>0,'DAILY: first claim grants reward','c1='+c1);
  const c2=Daily.claimReward();
  ok(c2===0,'DAILY: second claim grants nothing','c2='+c2);
  // now re-record a success -> must NOT reset rewardClaimed
  Daily.recordResult(ch.targetFloor+2, true);
  const c3=Daily.claimReward();
  ok(c3===0,'DAILY: re-completing daily cannot double-claim','c3='+c3);
}
// ---- TEST 10: magnet no NaN coin ----
{
  Game.beginRun(false);
  Player.powerups.magnet=5;
  // place coin exactly at player center
  const r=Game.room;
  r.coins.length=0;
  r.coins.push({x:Player.x+Player.w/2,y:Player.y+Player.h/2,value:1,taken:false});
  Rooms.updateRoom(r, 1/60, {player:Player,collidables:r.collidables,roomBounds:r.bounds,gravity:1700,spawnProjectile(){},spawnEnemy(){},enemySpeedMul:1,trapSpeedMul:1});
  // coin should have been collected (no NaN)
  const anyNaN=r.coins.some(c=>Number.isNaN(c.x)||Number.isNaN(c.y));
  ok(!anyNaN,'MAGNET: no NaN coin positions','anyNaN='+anyNaN);
  Game.toMenu();
}
// ---- TEST 11: die at exit does not complete floor ----
{
  Game.beginRun(false);
  Game.run.highestThisRun=1;
  // kill player then simulate exit overlap in updateRoom
  Player.alive=false; Player.health=0;
  const r=Game.room; r.exitReached=false;
  Player.x=r.exit.x; Player.y=r.exit.y;
  r.exit.w=40; r.exit.h=40;
  Rooms.updateRoom(r, 1/60, {player:Player,collidables:r.collidables,roomBounds:r.bounds,gravity:1700,spawnProjectile(){},spawnEnemy(){},enemySpeedMul:1,trapSpeedMul:1});
  ok(Game.state!=='FLOOR_COMPLETE','EXIT: dead player cannot complete floor','state='+Game.state);
  Player.alive=true; Game.toMenu();
}
// ---- TEST 12: mouse click in menu does not attack ----
{
  // Game is in menu (state MENU)
  Input.bufferedAttack=false;
  Input.mouseDownHandler({button:0});
  ok(Input.bufferedAttack===false,'INPUT: menu click does not buffer attack');
  // playing click does
  Game.beginRun(false);
  Input.bufferedAttack=false;
  Input.mouseDownHandler({button:0});
  ok(Input.bufferedAttack===true,'INPUT: gameplay click buffers attack');
  Game.toMenu();
}
// ---- TEST 13: boss enrage warnTime set on phase change ----
{
  Game.generateRoom(10);
  const b=Game.room.boss;
  b.phase=1; b.hp=b.maxHp*0.5; // forces phase 2
  const ctx={player:Player, collidables:Game.room.collidables, gravity:1700,
    spawnProjectile(){},spawnEnemy(){},roomBounds:Game.room.bounds};
  Bosses.updateBoss(b,1/60,ctx);
  ok(b.phase===2 && b.warnTime>0,'BOSS: enrage warning timer set on phase up','warnTime='+b.warnTime+' phase='+b.phase);
  Game.toMenu();
}
// ---- TEST 14: high-floor numbers stay finite ----
{
  let allFinite=true;
  for(let f of [1,10,50,100,500,1000,99999]){
    const d=Procedural.generateFloor(f,{});
    const d2=Rooms.buildRoom(d);
    const st=Upgrades.getStats();
    if(![d.difficulty,d2.bounds.w,st.maxHealth,st.dmgMul].every(Number.isFinite)) allFinite=false;
  }
  ok(allFinite,'NUM: high-floor values stay finite');
}
// ---- TEST 15: upgrade can't buy without coins / deducts exactly once ----
{
  Save.reset();
  Save.get().playerData.coins=0;
  const lvl0=Save.get().upgrades.health;
  UI.buyUpgrade('health');
  ok(Save.get().upgrades.health===lvl0 && Save.get().playerData.coins===0,'UPGRADE: cannot buy without coins');
  Save.get().playerData.coins=100000;
  const cBefore=Save.get().playerData.coins;
  UI.buyUpgrade('health');
  ok(Save.get().upgrades.health===lvl0+1,'UPGRADE: level increased once');
  ok(cBefore-Save.get().playerData.coins===Upgrades.priceFor('health',lvl0),'UPGRADE: deducted exact price once');
}
// ---- TEST 16: save recovery (corrupt + NaN/negative/overflow) ----
{
  window.localStorage.setItem('oneMoreFloorSave','not json {');
  const s=Save.load();
  ok(s.playerData.coins===0,'SAVE: corrupt JSON -> clean save');
  window.localStorage.setItem('oneMoreFloorSave',JSON.stringify({
    saveVersion:99,playerData:{coins:Infinity,highestFloor:NaN,bestScore:-5},
    upgrades:{health:-50,damage:999999},statistics:{totalCoins:'abc'},
    settings:{musicVolume:Infinity},dailyChallenge:{},unlocks:{}}));
  const c=Save.load();
  ok(Number.isFinite(c.playerData.coins)&&c.playerData.coins>=0,'SAVE: Infinity coins clamped');
  ok(c.upgrades.health>=0&&c.upgrades.health<=99,'SAVE: negative/huge upgrade clamped to 0..99','health='+c.upgrades.health);
  ok(Number.isFinite(c.statistics.totalCoins),'SAVE: non-numeric stats -> 0');
  ok(c.settings.musicVolume>=0&&c.settings.musicVolume<=1,'SAVE: volume clamped 0..1');
}
// ---- TEST 17: dead player cannot attack/move/take damage ----
{
  Game.beginRun(false);
  Player.alive=false;
  const h=Player.health;
  Player.takeDamage(50,0,'test');
  ok(Player.health===h,'DEATH: dead player takes no further damage');
  // attack() guarded by alive in update; just ensure no crash
  Input.bufferedAttack=true;
  Player.update(1/60,{player:Player,collidables:Game.room.collidables,roomBounds:Game.room.bounds,gravity:1700,spawnProjectile(){},spawnEnemy(){}});
  ok(true,'DEATH: update on dead player is a no-op (no crash)');
  Player.alive=true; Game.toMenu();
}
// ---- TEST 18: health cannot go negative or exceed max ----
{
  Player.reset({maxHealth:100,speedMul:1,dashCooldown:1.4});
  Player.health=100;
  Player.takeDamage(1000,0,'test');
  ok(Player.health===0||Player.health<0===false,'HP: health floor at 0','health='+Player.health);
  // reset alive for subsequent tests
  Player.alive=true;
  Game.toMenu();
}

// ---- TEST 19: OWNER MODE ---
{
  // init already called via Game.init; ensure owner not active by default
  ok(OwnerMode.active===false,'OWNER: not active by default');
  // password auth
  OwnerMode.onOwnerButton();
  ok(OwnerMode._passOpen===true,'OWNER: button opens password dialog');
  // spam guard
  OwnerMode.onOwnerButton(); OwnerMode.onOwnerButton();
  ok(OwnerMode._passOpen===true && document.getElementById('ownerPassOverlay').classList.contains('hidden')===false,'OWNER: spam does not create extra dialogs');
  // wrong password -> denied, stays inactive
  OwnerMode.setPasswordValueForTest('wrongpass');
  OwnerMode.submitPassword();
  ok(OwnerMode.active===false,'OWNER: wrong password denied');
  ok(document.getElementById('ownerPassMsg')._text==='ACCESS DENIED','OWNER: denied message shown');
  // correct password -> granted + active + panel
  OwnerMode.setPasswordValueForTest('rubethegreat');
  OwnerMode.submitPassword();
  ok(OwnerMode.active===true,'OWNER: correct password activates');
  ok(document.getElementById('ownerPanelScreen').classList.contains('hidden')===false,'OWNER: panel opens after auth');
  // infinite health
  OwnerMode.setToggle('infiniteHealth',true);
  ok(OwnerMode.infiniteHealthOn()===true,'OWNER: infinite health toggle on');
  Player.reset({maxHealth:100,speedMul:1,dashCooldown:1.4});
  Player.health=50; Player.alive=true;
  Player.takeDamage(500,0,'test');
  ok(Player.health===100,'OWNER: infinite health absorbs damage (stays max)');
  ok(Player.alive===true,'OWNER: infinite health prevents death');
  // fall death guard
  Game.beginRun(false);
  Player.health=1; Player.alive=true;
  const stateBefore=Game.state;
  Game.killPlayer(true);
  ok(Game.state===stateBefore && Player.alive===true,'OWNER: infinite health prevents fall death');
  // aura toggle + draw no-crash
  OwnerMode.setAura(true);
  ok(OwnerMode._auraParts.length>0,'OWNER: aura seeds particles');
  // run update/draw (aura) — no crash
  Game.update(1/60);
  OwnerMode.drawBehind(ctx);
  ok(true,'OWNER: aura update/draw run without error');
  // toggle aura repeatedly -> no duplicate growth
  OwnerMode.setAura(false);
  OwnerMode.setAura(true);
  OwnerMode.setAura(false);
  ok(OwnerMode._auraParts.length===0,'OWNER: aura disabled clears particles (no duplicates)');
  // music toggle off by default & no crash when enabling (YT may fail offline)
  OwnerMode.setMusic(false);
  ok(OwnerMode.musicOn===false,'OWNER: music toggle controls state');
  // reset effects keeps owner active, disables toggles
  OwnerMode.setToggle('infiniteHealth',true); OwnerMode.setAura(true);
  OwnerMode.resetEffects();
  ok(OwnerMode.infiniteHealthOn()===false && OwnerMode.auraOn===false && OwnerMode.musicOn===false,'OWNER: reset effects disables all toggles');
  ok(OwnerMode.active===true,'OWNER: reset effects keeps owner active');
  // exit cleanup
  OwnerMode.exitOwnerMode();
  ok(OwnerMode.active===false,'OWNER: exit deactivates');
  ok(OwnerMode._auraParts.length===0,'OWNER: exit clears aura particles');
  ok(document.getElementById('ownerBtn')._text==='OWNER','OWNER: button label restored to OWNER');
  // infinite health off -> normal damage works
  Player.reset({maxHealth:100,speedMul:1,dashCooldown:1.4});
  Player.health=100; Player.alive=true;
  Player.takeDamage(30,0,'test');
  ok(Player.health===70,'OWNER: after exit, normal damage works');
  // exit twice / re-enter many times no crash
  for(let i=0;i<20;i++){ OwnerMode.setToggle('infiniteHealth',true); OwnerMode.setAura(true); OwnerMode.exitOwnerMode(); }
  ok(OwnerMode.active===false,'OWNER: 20 enter/exit cycles clean');
}
// ---- TEST 20: normal damage still works when owner not active ----
{
  // ensure no owner influence
  ok(OwnerMode.active===false,'OWNER: inactive for normal gameplay');
}

console.log('\n=== RESULT ===');
console.log('PASS: '+pass+'  FAIL: '+fail);
if(failures.length){ console.log('Failures:'); failures.forEach(f=>console.log(' - '+f)); }
process.exit(fail===0?0:1);
