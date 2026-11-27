'use strict';
const fs=require('fs');
// Load the QA harness boot (redefine minimal env) by reusing it: simplest is to run the qa harness's setup inline.
const src=fs.readFileSync(__dirname+'/.arena_qa.js','utf8');
// Instead, replicate: run all scripts with stubs
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

// ---- STRESS 1: generate 5000 floors, validate ----
let bad=0, minFloors=Infinity;
for(let f=1;f<=5000;f++){
  const d=Procedural.generateFloor(f,{});
  const all=[d.difficulty,d.exit.x,d.exit.y,d.bounds.w];
  for(const v of all){ if(!Number.isFinite(v)||v<0) bad++; }
  if(!d.exit.w||!d.exit.h) bad++;
  const ground=d.platforms.some(p=>p.kind!=='fake'&&p.kind!=='falling'&&p.y===660);
  if(!ground) bad++;
  if(d.platforms.length>100) bad++;
}
console.log('STRESS 5000 floors: bad='+bad);
if(bad>0) process.exit(1);

// ---- STRESS 2: simulate climbing 40 floors via actual play ----
Game.beginRun(false);
let errors=0, floors=1;
const ctxf={player:Player,collidables:()=>Game.room.collidables,gravity:1700};
for(let step=0;step<40000;step++){
  // drive player to the right, jump sometimes, attack sometimes
  Input.keys['d']=true;
  if(step%20===0) Input.bufferedJump=true;
  if(step%10===0) Input.bufferedAttack=true;
  try {
    Game.update(1/60);
  } catch(e){ errors++; console.log('ERROR at step',step,':',e.message); break; }
  // if floor completed -> continue
  if(Game.state==='FLOOR_COMPLETE'){
    Game.continueRun();
    floors=Game.run.floor;
    if(Game.run.floor>40) break;
  } else if(Game.state==='FLOOR_SELECTION'){
    Game.chooseFloor('safe');
  } else if(Game.state==='CHEST'){
    Game.closeChest();
  } else if(Game.state==='DEAD'){
    Game.startRun(); // restart
  }
  // prevent infinite loops: cap
}
console.log('STRESS 40-floor climb: reached floor',Game.run.floor,'errors='+errors,'runCoins',Game.run.runCoins);
if(errors>0) process.exit(1);
if(Game.run.floor<10){ console.log('WARNING: did not climb far (floor '+Game.run.floor+')'); }
Game.toMenu();
console.log('STRESS DONE OK');
