const C='fi-calc-v2-app-1';
const FILES=['./','index.html','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png','css/lenders.css','js/lenders.js','data/lenders/index.json','data/lenders/tx.json','data/compliance/tx.json','data/compliance/il.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(name=>name.startsWith('fi-calc-v2-app-')&&name!==C).map(name=>caches.delete(name)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  const scopePath=new URL(self.registration.scope).pathname;
  if(url.origin!==self.location.origin||!url.pathname.startsWith(scopePath))return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
});
