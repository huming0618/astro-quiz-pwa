import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const siteDir = path.resolve(rootDir, '..');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'vendor') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(html|css|js|mjs|md)$/.test(name)) acc.push(p);
  }
  return acc;
}

const files = walk(rootDir);
const joined = files.map(p => fs.readFileSync(p, 'utf8')).join('\n');
assert.doesNotMatch(joined, /https?:\/\/cdn\.|unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare|ajax\.googleapis|esm\.sh/i);
assert.ok(fs.existsSync(path.join(rootDir, 'vendor/three.module.min.js')));
assert.ok(fs.existsSync(path.join(rootDir, 'vendor/OrbitControls.js')));
assert.ok(fs.existsSync(path.join(rootDir, 'vendor/LICENSE.three.txt')));
assert.ok(fs.existsSync(path.join(rootDir, 'vendor/ne_110m_land.geojson')));

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
assert.match(html, /data-build="20261125-s1"/);
assert.match(html, /update\.mjs\?v=20261125-s1/);
assert.match(html, /styles\.css\?v=20261125-s1/);
assert.match(html, /app\.mjs\?v=20261125-s1/);
assert.match(html, /同型通常时序/);
assert.match(html, /教学示意/);
assert.match(html, /天宫二号/);
assert.doesNotMatch(html, /cdn/i);
assert.match(html, /type="module"/);

const home = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
assert.match(home, /\.\/shenzhou24\//);

const sw = fs.readFileSync(path.join(siteDir, 'sw.js'), 'utf8');
assert.match(sw, /astro-quiz-v8-network-navigation/);
assert.match(sw, /shenzhou24\//);
assert.match(sw, /eclipse\//);
assert.doesNotMatch(sw, /\blocalStorage\s*\./);

// Lesson paths (eclipse and shenzhou24) must be network-first and not written to CacheStorage.
const root = 'https://huming0618.github.io/astro-quiz-pwa/';
const stores = new Map([
  ['astro-quiz-v7-network-navigation', new Map([[root, 'OFFLINE QUIZ']])],
  ['another-app-cache', new Map()]
]);
const calls = [];
const caches = {
  keys: async () => [...stores.keys()],
  delete: async k => stores.delete(k),
  open: async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      addAll: async requests => calls.push(...requests.map(r => ({url: r.url, cache: r.cache}))),
      put: async (r, response) => store.set(typeof r === 'string' ? r : r.url, await response.text())
    };
  },
  match: async r => {
    const key = typeof r === 'string' ? r : r.url;
    for (const store of stores.values()) if (store.has(key)) return new Response(store.get(key));
  }
};
const handlers = {};
const self = {registration: {scope: root}, addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting: async () => {}, clients: {claim: async () => {}}};
const fetchFn = async (r, options = {}) => {
  calls.push({url: typeof r === 'string' ? r : r.url, cache: options.cache});
  return new Response('FRESH SZ24 HTML');
};
vm.runInNewContext(sw, {self, caches, fetch: fetchFn, URL, Request, Response, Promise});
async function request(address, mode = 'navigate') {
  const waits = [];
  let promise;
  handlers.fetch({request: {url: address, method: 'GET', mode}, respondWith: p => { promise = p; }, waitUntil: p => waits.push(p)});
  const response = await promise;
  await Promise.all(waits);
  return response;
}
const sz = root + 'shenzhou24/';
assert.equal(await (await request(sz)).text(), 'FRESH SZ24 HTML');
assert.equal(calls[0].cache, 'no-cache');
const after = [...stores.values()].some(store => [...store.keys()].some(k => String(k).includes('shenzhou24')));
assert.equal(after, false, 'shenzhou24 responses must not be written to CacheStorage');
assert.equal(await (await request(root + 'eclipse/')).text(), 'FRESH SZ24 HTML');

let activateP;
handlers.activate({waitUntil: v => { activateP = v; }});
await activateP;
assert.ok(!stores.has('astro-quiz-v7-network-navigation'));
assert.ok(stores.has('another-app-cache'));

console.log('PASS static / cache policy for shenzhou24');
