import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.mjs'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
let count=0;
for(const name of ['app.mjs','vendor/OrbitControls.js','vendor/three.module.min.js','model.mjs']){
 const source=fs.readFileSync(path.join(root,name),'utf8');
 for(const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)){
   assert.ok(m[1].startsWith('.'),`Unresolved bare or external import ${m[1]}`);
   assert.ok(fs.existsSync(path.resolve(root,path.dirname(name),m[1])),`Missing import ${m[1]}`);count++;
 }
}
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
 if(m[1].startsWith('https:'))continue;
 assert.ok(fs.existsSync(path.resolve(root,m[1])),`Missing resource ${m[1]}`);count++;
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate IDs');
for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),`Missing element ${m[1]}`);
assert.match(app,/new OrbitControls/);assert.match(app,/THREE\.TOUCH\.ROTATE/);assert.match(app,/THREE\.TOUCH\.DOLLY_ROTATE/);assert.match(app,/addEventListener\('input'/);
assert.match(css,/touch-action:none/);assert.match(css,/min-height:44px/);assert.match(css,/@media\(max-width:560px\)/);
assert.match(app,/WebGLRenderer/);assert.match(app,/webglcontextlost/);assert.match(html,/WebGL/);
assert.ok(!app.includes('https://'),'No remote runtime dependencies');
assert.ok(fs.existsSync(path.join(root,'vendor/LICENSE.three.txt')));
console.log(`PASS: ${count} local resources/imports, ${ids.length} unique IDs, DOM hooks, mobile controls, WebGL fallback, vendored license.`);
