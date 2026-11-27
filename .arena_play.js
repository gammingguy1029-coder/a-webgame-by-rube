/* Full playthrough simulation — NOT part of the game.
   Autoplayer: walks right, auto-fires constantly, infinite health.
   Verifies floors complete (exit reached) across many floors. */
'use strict';
const fs=require('fs');
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

// infinite health so death can't block progression (isolates floor-completion)
OwnerMode.active=true; OwnerMode.infiniteHealth=true;

Game.beginRun(false);
let maxFloor=1, errors=0;
let lastFloorAt=Date.now();
for(let step=0;step<300000;step++){
  // autoplayer inputs: walk right along the ground + auto-fire bullets.
  // No jumping/dashing (ground route is always clear).
  Input.keys['d']=true;
  Input.mouseDown=true; // auto-fire bullets
  Input.bufferedJump=false; Input.bufferedDash=false;
  try{
    Game.update(1/60);
  }catch(e){ errors++; if(errors<=5) console.log('ERROR',e.message); }
  if(Game.state==='FLOOR_COMPLETE'){ Game.continueRun(); }
  else if(Game.state==='FLOOR_SELECTION'){ Game.chooseFloor('safe'); }
  else if(Game.state==='CHEST'){ Game.closeChest(); }
  maxFloor=Math.max(maxFloor,Game.run.floor);
  if(Game.run.floor>60) break;
}
console.log('PLAY: reached floor',Game.run.floor,'max',maxFloor,'errors',errors);
console.log('RESULT', errors===0 && maxFloor>=10 ? 'PASS':'FAIL');
process.exit(errors===0 && maxFloor>=10 ? 0:1);
