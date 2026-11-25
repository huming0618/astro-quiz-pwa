// Scope-limited caches; wrong-answer records live in localStorage and are never touched.
const CACHE = 'astro-quiz-v8-network-navigation';
const PREFIX = 'astro-quiz-';
const ROOT = self.registration.scope;
const LESSONS = ['eclipse/', 'shenzhou24/'].map(path => new URL(path, ROOT).pathname);
const ASSETS = ['./', './index.html', './manifest.json', './css/styles.css', './js/app.js', './data/questions.json', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    ASSETS.map(path => new Request(new URL(path, ROOT), {cache:'reload'}))
  )).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request, url=new URL(request.url);
  if(request.method!=='GET' || url.origin!==new URL(ROOT).origin) return;
  const lesson=LESSONS.some(path=>url.pathname.startsWith(path));
  if(request.mode==='navigate' || lesson){
    // Never satisfy online document navigations from an old cache entry.
    // no-cache revalidates the HTTP cache too; science lessons are never put in CacheStorage.
    event.respondWith(fetch(request,{cache:'no-cache'}).then(response => {
      if(!lesson && response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));}
      return response;
    }).catch(async()=>{
      if(!lesson){const cached=await caches.match(request)||await caches.match(ROOT);if(cached)return cached;}
      return new Response('暂时离线，无法获取最新教学页面。请联网后重新打开；答题页的离线题库仍保留。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }));
    return;
  }
  event.respondWith(caches.match(request).then(cached => {
    const refreshed=fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));}
      return response;
    }).catch(()=>cached||Response.error());
    event.waitUntil(refreshed.then(()=>{}));
    return cached||refreshed;
  }));
});
