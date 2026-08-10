/* Reachability simulator — tests whether floors are actually finishable.
   NOT part of the game. Uses the real Player/Rooms physics.
   Simulates an invincible autoplayer that walks right and jumps, and checks
   whether it can reach the exit within a time budget. */
'use strict';
const fs = require('fs');

function mkctx(){const g={addColorStop(){}};const t={fillStyle:'',strokeStyle:'',lineWidth:1,globalAlpha:1,font:'',textAlign:'left',shadowColor:'',shadowBlur:0,createLinearGradient:()=>g,createRadialGradient:()=>g,createPattern:()=>({}),measureText:()=>({width:10}),save(){},restore(){},translate(){},rotate(){},scale(){},setTransform(){},clearRect(){},fillRect(){},strokeRect(){},beginPath(){},closePath(){},fill(){},stroke(){},arc(){},rect(){},ellipse(){},moveTo(){},lineTo(){},fillText(){},strokeText(){},clip(){},getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData(){},drawImage(){},bezierCurveTo(){},quadraticCurveTo(){}};return new Proxy(t,{get(o,p){return p in o?o[p]:(()=>g);},set(o,p,v){o[p]=v;return true;}});}
function mkEl(id){const l={};const el={id,_text:'',innerHTML:'',style:{},dataset:{},children:[],className:'',parentNode:null,classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x));},remove(...c){c.forEach(x=>this._s.delete(x));},toggle(c,f){if(f===undefined){this._s.has(c)?this._s.delete(c):this._s.add(c);}else{f?this._s.add(c):this._s.delete(c);}},contains(c){return this._s.has(c);}},getBoundingClientRect:()=>({x:0,y:0,width:100,height:20,left:0,top:0,right:100,bottom:20}),addEventListener(t,f){(l[t]=l[t]||[]).push(f);},removeEventListener(){},appendChild(c){c.parentNode=this;return c;},append(c){this.appendChild(c);},querySelector(){return null;},querySelectorAll(){return [];},focus(){}};Object.defineProperty(el,'textContent',{get(){return this._text;},set(v){this._text=String(v);}});return el;}
const els={};function getEl(id){if(id==='gameCanvas')return canvas;if(!els[id])els[id]=mkEl(id);return els[id];}
const ctx=mkctx();const canvas={width:800,height:450,style:{},getContext:()=>ctx,getBoundingClientRect:()=>({x:0,y:0,width:800,height:450})};
const ws={devicePixelRatio:1,innerWidth:1000,innerHeight:600,navigator:{maxTouchPoints:0},addEventListener(){},localStorage:{_d:{},getItem(k){return this._d[k]??null;},setItem(k,v){this._d[k]=String(v);},removeItem(k){delete this._d[k];}},setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame(){return 0;},performance:{now:()=>Date.now()}};
const wp=new Proxy(ws,{get(t,p){return t[p];},set(t,p,v){t[p]=v;try{global[p]=v;}catch(e){}return true;},has(t,p){return p in t;}});
global.window=wp;global.self=wp;global.document={getElementById:getEl,querySelectorAll:()=>[],querySelector:()=>null,createElement:(t)=>t==='canvas'?(()=>{const c=mkEl('c');c.getContext=()=>mkctx();return c;})():mkEl(t),body:mkEl('b'),addEventListener(){},documentElement:{style:{}},readyState:'complete'};
global.localStorage=ws.localStorage;try{Object.defineProperty(global,'navigator',{value:ws.navigator,configurable:true});}catch(e){}global.requestAnimationFrame=ws.requestAnimationFrame;global.performance=ws.performance;global.AudioContext=undefined;global.webkitAudioContext=undefined;
['ads.js','ownerMode.js','audio.js','settings.js','save.js','particles.js','input.js','mobileControls.js','weapons.js','player.js','enemies.js','bosses.js','collision.js','camera.js','procedural.js','rooms.js','upgrades.js','dailyChallenge.js','ui.js','game.js','main.js'].forEach(f=>eval(fs.readFileSync(__dirname+'/js/'+f,'utf8')));
Save.load();Game.init(canvas);UI.init();MobileControls.enabled=false;Save.get().unlocks.tutorialSeen=true;

// enable infinite health so death doesn't stop the run (isolates reachability)
OwnerMode.active=true; OwnerMode.infiniteHealth=true;

function testFloor(floor){
  const data=Procedural.generateFloor(floor,{});
  Game.room=Rooms.buildRoom(data);
  Game.run={floor,runCoins:0,score:0,kills:0,bossKills:0,highestThisRun:1,timeSurvived:0,
    canRevive:true,daily:false,startTime:0};
  Game.state='PLAYING';
  Player.x=Game.room.start.x; Player.y=Game.room.start.y;
  Player.reset(Upgrades.getStats()); Player.alive=true;
  Game.room.exitReached=false;
  const collidables=Game.room.collidables;
  const bounds=Game.room.bounds;
  // time budget: enough to walk the room (~ width/220 + margin)
  const budget=Math.ceil((data.bounds.w/150)*2+20);
  let reached=false;
  let stuck=0, stuckX=-9999, stuckT=0;
  for(let step=0; step<budget*60; step++){
    // autoplayer: walk right along the ground (the intended safe route).
    // No jumping, so this tests that a ground route to the exit always exists.
    Input.keys['d']=true; Input.keys['a']=false;
    Input.bufferedJump=false;
    const px=Player.x+Player.w/2, ex=Game.room.exit.x+Game.room.exit.w/2;
    if(px>ex){ Input.keys['d']=false; }
    const c={player:Player,collidables,roomBounds:bounds,gravity:Player.gravity,
      spawnProjectile(){},spawnEnemy(){},enemySpeedMul:1,trapSpeedMul:1};
    Player.update(1/60,c);
    Rooms.updateRoom(Game.room,1/60,c);
    if(Game.room.exitReached){reached=true;break;}
    // stuck detection: no progress for 3 seconds
    if(Player.x>stuckX){stuckX=Player.x;stuckT=0;} else {stuckT++; if(stuckT>180)break;}
  }
  return reached;
}

let fails=0, total=0;
for(let f=1;f<=2000;f++){
  total++;
  const ok=testFloor(f);
  if(!ok){ fails++; if(fails<=10) console.log('UNREACHABLE floor',f,'type',Procedural.generateFloor(f,{}).type); }
}
console.log('REACHABILITY: '+total+' floors, '+fails+' unreachable');
process.exit(fails===0?0:1);
