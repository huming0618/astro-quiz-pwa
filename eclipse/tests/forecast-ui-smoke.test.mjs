// Node-only event/DOM wiring smoke test. NOT a browser, layout, pixel, or touch-device test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const all=[];
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.value='';this.hidden=false;this.disabled=false;this.textContent='';all.push(this);}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(k,v){this[k]=String(v);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 fire(type,data={}){for(const fn of this.listeners[type]||[])fn({preventDefault(){},target:this,...data});}
 get firstElementChild(){return this.children[0];}
 get lastElementChild(){return this.children.at(-1);}
 getBoundingClientRect(){return {left:0,top:0,width:1000,height:548};}
 getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:(()=>{})});}
}
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),byId={};
for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(match[1]);e.id=match[2];e.value=(match[0].match(/\bvalue="([^"]*)"/)||[])[1]||'';byId[e.id]=e;}
const refs=['2026-03-01','2026-08-01'].map(v=>{const e=new Element('button');e.dataset.reference=v;return e;});
globalThis.document={getElementById:id=>byId[id]||null,createElement:t=>new Element(t),querySelector:()=>new Element(),querySelectorAll:q=>q==='[data-reference]'?refs:q==='[data-contact]'?all.filter(e=>e.dataset.contact):[]};
globalThis.window={};globalThis.fetch=async url=>{try{return {ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../'+url.replace(/^\.\//,''),import.meta.url),'utf8'))};}catch{return {ok:false};}};
const until=async predicate=>{const end=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<end,'Timed out waiting for computation');await new Promise(r=>setTimeout(r,10));}};
await import('../forecast.mjs');await until(()=>window.eclipseForecastReady&&!byId['fc-search'].disabled);
assert.equal(byId['fc-error'].textContent,'');assert.equal(byId['fc-event-kind'].textContent,'半影月食');assert.equal(byId['fc-contacts'].children.length,7);assert.equal(byId['fc-phase-buttons'].children.filter(b=>b.disabled).length,4);
refs[0].fire('click');await until(()=>!byId['fc-search'].disabled);assert.equal(byId['fc-event-kind'].textContent,'月全食');assert.equal(byId['fc-phase-buttons'].children.filter(b=>b.disabled).length,0);
byId['fc-phase-buttons'].children[0].fire('click');assert.equal(Number(byId['fc-time'].value),0);assert.equal(byId['fc-phase'].textContent,'半影阶段');
byId['fc-time'].value=1000;byId['fc-time'].fire('input');assert.equal(Number(byId['fc-time'].value),1000);
byId['fc-lat'].value='100';byId['fc-location-form'].fire('submit');assert.equal(byId['fc-error'].hidden,false);
byId['fc-lat'].value='30.57';byId['fc-lon'].value='104.07';byId['fc-location-form'].fire('submit');assert.equal(byId['fc-error'].hidden,true);
byId['fc-map'].fire('pointerdown',{clientX:506,clientY:252});byId['fc-map'].fire('pointerup',{clientX:506,clientY:252});assert.equal(Number(byId['fc-lat'].value),0);assert.equal(Number(byId['fc-lon'].value),0);
byId['fc-event'].value='1';byId['fc-event'].fire('change');assert.equal(byId['fc-event-kind'].textContent,'月偏食');assert.equal(byId['fc-phase-buttons'].children.filter(b=>b.disabled).length,2);
byId['fc-date'].value='2026-02-30';byId['fc-search-form'].fire('submit');assert.equal(byId['fc-error'].hidden,false);
console.log('PASS Node DOM/event smoke: default, total/partial switch, missing contacts, phase button, time slider, invalid location/date, map point selection. Canvas is mocked; no visual assertion.');
