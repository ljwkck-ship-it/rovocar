const CACHE='rovocar-v13';
const FILES=['./','index.html','admin.html','admin.css?v=1','admin.js?v=1','styles.css?v=5','app.js?v=13','cloud.js?v=4','supabase-config.js?v=1','manifest.webmanifest','assets/rovocar.svg','assets/icon-180.png','assets/icon-192.png','assets/icon-512.png','data/default.csv'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method==='GET')e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;}).catch(()=>caches.match('./'))));});
