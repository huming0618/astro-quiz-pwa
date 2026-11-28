// Node-only event/DOM wiring smoke test. NOT a browser, layout, pixel, or touch-device test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const all=[];
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.classList={items:new Set(),toggle(name,on){if(on)this.items.add(name);else this.items.delete(name);},add(name){this.items.add(name);},remove(name){this.items.delete(name);}};all.push(this);}
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
for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(match[1]);e.id=match[2];e.value=(match[0].match(/\bvalue="([^"]*)"/)||[])[1]||'';if(match[2]==='fc-filter')e.value='all';byId[e.id]=e;}
const refs=[...html.matchAll(/data-reference="([^"]+)"/g)].map(m=>{const e=new Element('button');e.dataset.reference=m[1];return e;});
assert.ok(refs.some(r=>r.dataset.reference==='2026-08-10'));
assert.ok(refs.some(r=>r.dataset.reference==='2020-06-20'));
globalThis.document={getElementById:id=>byId[id]||null,createElement:t=>new Element(t),querySelector:()=>new Element(),querySelectorAll:q=>q==='[data-reference]'?refs:q==='[data-contact]'?all.filter(e=>e.dataset.contact):[]};
globalThis.window={};globalThis.fetch=async url=>{try{return {ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../'+url.replace(/^\.\//,''),import.meta.url),'utf8'))};}catch{return {ok:false};}};
const until=async predicate=>{const end=Date.now()+15000;while(!predicate()){assert.ok(Date.now()<end,'Timed out waiting for computation');await new Promise(r=>setTimeout(r,10));}};
await import('../forecast.mjs');await until(()=>window.eclipseForecastReady&&!byId['fc-search'].disabled);
assert.equal(byId['fc-error'].textContent,'');
assert.match(byId['fc-date'].value,/^\d{4}-\d{2}-\d{2}$/);
assert.equal(byId['fc-date'].value==='2026-11-22',false);
assert.ok(byId['fc-event'].children.length>=1);
const lunarTotal=refs.find(r=>r.dataset.reference==='2026-03-01');
lunarTotal.fire('click');await until(()=>!byId['fc-search'].disabled);
assert.equal(byId['fc-event-kind'].textContent,'月全食');assert.equal(byId['fc-phase-buttons'].children.filter(b=>b.disabled).length,0);
byId['fc-phase-buttons'].children[0].fire('click');assert.equal(Number(byId['fc-time'].value),0);assert.equal(byId['fc-phase'].textContent,'半影阶段');
byId['fc-time'].value=1000;byId['fc-time'].fire('input');assert.equal(Number(byId['fc-time'].value),1000);
byId['fc-lat'].value='100';byId['fc-location-form'].fire('submit');assert.equal(byId['fc-error'].hidden,false);
byId['fc-lat'].value='30.57';byId['fc-lon'].value='104.07';byId['fc-location-form'].fire('submit');assert.equal(byId['fc-error'].hidden,true);
byId['fc-map'].fire('pointerdown',{clientX:506,clientY:252});byId['fc-map'].fire('pointerup',{clientX:506,clientY:252});assert.equal(Number(byId['fc-lat'].value),0);assert.equal(Number(byId['fc-lon'].value),0);
byId['fc-event'].value='1';byId['fc-event'].fire('change');assert.equal(byId['fc-event-kind'].textContent,'日全食');
byId['fc-chengdu'].fire('click');assert.equal(Number(byId['fc-lat'].value),30.57);
assert.match(byId['fc-local-summary'].children[0].textContent,/此地不可见/);
const solarAnnular=refs.find(r=>r.dataset.reference==='2020-06-20');
solarAnnular.fire('click');await until(()=>!byId['fc-search'].disabled);
assert.equal(byId['fc-event-kind'].textContent,'日环食');
assert.match(byId['fc-local-summary'].children[0].textContent,/此地可见日偏食/);
byId['fc-year'].value='2026';byId['fc-year-form'].fire('submit');await until(()=>!byId['fc-search'].disabled);
assert.equal(byId['fc-event'].children.length,4);
byId['fc-filter'].value='lunar';byId['fc-filter'].fire('change');await until(()=>!byId['fc-search'].disabled);
assert.equal(byId['fc-event'].children.length,2);assert.equal(byId['fc-event-kind'].textContent,'月全食');
byId['fc-date'].value='2026-02-30';byId['fc-search-form'].fire('submit');assert.equal(byId['fc-error'].hidden,false);
byId['fc-prev'].fire('click'); // should not throw even after a date error; form already failed so events may still be lunar year list
console.log('PASS Node DOM/event smoke: default today, lunar total, solar annular/Chengdu visibility, year list, filter, missing contacts, phase button, time slider, invalid location/date, map point selection. Canvas is mocked; no visual assertion.');
