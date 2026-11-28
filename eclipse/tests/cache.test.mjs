import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const root='https://huming0618.github.io/astro-quiz-pwa/',url=root+'eclipse/';
function harness(source,offline=false){
 const handlers={},stores=new Map([['astro-quiz-v4',new Map([[url,'OLD 3D HTML'],[root,'OFFLINE QUIZ']])],['astro-quiz-v7-network-navigation',new Map([[root,'OFFLINE QUIZ']])],['another-app-cache',new Map()]]),calls=[];
 const key=r=>typeof r==='string'?r:r.url;
 const caches={keys:async()=>[...stores.keys()],delete:async k=>stores.delete(k),open:async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {addAll:async requests=>calls.push(...requests.map(r=>({url:r.url,cache:r.cache}))),put:async(r,response)=>store.set(key(r),await response.text())};},match:async r=>{for(const store of stores.values())if(store.has(key(r)))return new Response(store.get(key(r)));}};
 const self={registration:{scope:root},addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 const fetch=async(r,options={})=>{calls.push({url:key(r),cache:options.cache});if(offline)throw Error('offline');return new Response('FRESH FORECAST HTML');};
 vm.runInNewContext(source,{self,caches,fetch,URL,Request,Response,Promise});
 return {stores,calls,async request(address=url,mode='navigate'){const waits=[];let promise;handlers.fetch({request:{url:address,method:'GET',mode},respondWith:p=>promise=p,waitUntil:p=>waits.push(p)});const response=await promise;await Promise.all(waits);return response;},async activate(){let p;handlers.activate({waitUntil:v=>p=v});await p;},async install(){let p;handlers.install({waitUntil:v=>p=v});await p;}};
}
const old=execFileSync('git',['show','f444a07:sw.js'],{encoding:'utf8'}),fresh=fs.readFileSync(new URL('../../sw.js',import.meta.url),'utf8');
assert.equal(await (await harness(old).request()).text(),'OLD 3D HTML');
assert.equal(await (await harness(old).request(url+'?release=new')).text(),'FRESH FORECAST HTML');
assert.equal(await (await harness(old).request(url+'forecast.html')).text(),'FRESH FORECAST HTML');
const online=harness(fresh);assert.equal(await (await online.request()).text(),'FRESH FORECAST HTML');assert.equal(online.calls[0].cache,'no-cache');
const offline=harness(fresh,true);assert.equal((await offline.request()).status,503);assert.equal(await (await offline.request(root)).text(),'OFFLINE QUIZ');
await online.activate();assert.ok(!online.stores.has('astro-quiz-v4'));assert.ok(online.stores.has('another-app-cache'));
await online.install();assert.ok(online.calls.filter(c=>c.cache==='reload').length===8);
assert.doesNotMatch(fresh,/\blocalStorage\s*\./);
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),alternate=fs.readFileSync(new URL('../forecast.html',import.meta.url),'utf8');
assert.equal(index,alternate);assert.match(index,/data-build="20261128-r8"/);assert.match(index,/update\.mjs\?v=20261128-r8/);assert.match(index,/styles\.css\?v=20261128-r8/);
console.log('PASS cache regression: reproduced legacy stale navigation, query/path miss escapes it, new online navigation revalidates, offline lesson does not lie, quiz offline retained, cache deletion scope-limited, both release entries identical.');
