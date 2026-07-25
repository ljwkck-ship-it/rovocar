const CACHE='rovocar-v23';
const FILES=['./','index.html','admin.html','csv-maker/index.html','admin.css?v=1','admin.js?v=1','styles.css?v=7','core.mjs','app.js?v=21','cloud.js?v=5','supabase-config.js?v=1','manifest.webmanifest','assets/rovocar.svg','assets/icon-180.png','assets/icon-192.png','assets/icon-512.png','data/default.csv'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
const inScope=url=>url.origin===location.origin&&url.pathname.startsWith(new URL(self.registration.scope).pathname);
async function cachePut(request,response){if(response&&response.ok){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}return response;}
async function networkFirst(request){try{return await cachePut(request,await fetch(request));}catch{return await caches.match(request)||await caches.match('./');}}
async function cacheFirst(request){const cached=await caches.match(request);if(cached)return cached;try{return await cachePut(request,await fetch(request));}catch{return await caches.match('./');}}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(!inScope(url))return;
  const html=e.request.mode==='navigate'||e.request.destination==='document'||url.pathname.endsWith('.html')||url.pathname.endsWith('/');
  e.respondWith(html?networkFirst(e.request):cacheFirst(e.request));
});
