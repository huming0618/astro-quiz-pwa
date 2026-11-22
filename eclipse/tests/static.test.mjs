import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.mjs'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
let count=0;
for(const name of ['app.mjs','vendor/OrbitControls.js','vendor/three.module.min.js','model.mjs','forecast.mjs','forecast-core.mjs','update.mjs','vendor/astronomy-engine.mjs']){
 const source=fs.readFileSync(path.join(root,name),'utf8');
 for(const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)){
   assert.ok(m[1].startsWith('.'),`Unresolved bare or external import ${m[1]}`);
   assert.ok(fs.existsSync(path.resolve(root,path.dirname(name),m[1].split(/[?#]/)[0])),`Missing import ${m[1]}`);count++;
 }
}
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
 if(m[1].startsWith('https:'))continue;
 assert.ok(fs.existsSync(path.resolve(root,m[1].split(/[?#]/)[0])),`Missing resource ${m[1]}`);count++;
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate IDs');
const allApp=app+'\n'+fs.readFileSync(path.join(root,'forecast.mjs'),'utf8');
for(const m of allApp.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),`Missing element ${m[1]}`);
assert.match(app,/new OrbitControls/);assert.match(app,/THREE\.TOUCH\.ROTATE/);assert.match(app,/THREE\.TOUCH\.DOLLY_ROTATE/);assert.match(app,/addEventListener\('input'/);
assert.match(css,/touch-action:none/);assert.match(css,/min-height:44px/);assert.match(css,/@media\(max-width:560px\)/);
assert.match(app,/WebGLRenderer/);assert.match(app,/webglcontextlost/);assert.match(html,/WebGL/);
assert.ok(!app.includes('https://'),'No remote runtime dependencies');
assert.ok(fs.existsSync(path.join(root,'vendor/LICENSE.three.txt')));
console.log(`PASS: ${count} local resources/imports, ${ids.length} unique IDs, DOM hooks, mobile controls, WebGL fallback, vendored license.`);

for(const name of ['vendor/ne_110m_land.geojson','research/validation.json','research/nasa-reference.json','vendor/LICENSE.astronomy-engine.txt'])assert.ok(fs.existsSync(path.join(root,name)),name);
assert.match(allApp,/pointerup/);assert.match(allApp,/fc-time.*addEventListener\('input'/);
console.log('PASS: forecast DOM hooks, pointer interaction, time slider, local astronomy/maps/reference assets');
