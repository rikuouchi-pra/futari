/* ふたりのリスト：オフラインでも開けるようにするサービスワーカー */
const V="futari-176-84868368";
const SHELL=["./","index.html","shim.js","config.js","manifest.webmanifest","icon-192.png","icon-512.png","apple-touch-icon.png"];
const FB="https://www.gstatic.com/firebasejs/10.12.2/";
const LIBS=["firebase-app.js","firebase-auth.js","firebase-firestore.js"].map(f=>FB+f);
self.addEventListener("install",e=>{ e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL).then(()=>Promise.all(LIBS.map(u=>c.add(u).catch(()=>{})))))); self.skipWaiting(); });
self.addEventListener("activate",e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET") return;
  if(u.origin===location.origin){
    // アプリ本体：ネット優先（更新をすぐ反映）→ だめなら控え
    e.respondWith(fetch(e.request).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(V).then(c=>c.put(e.request,cp)); } return r; })
      .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match("index.html"))));
    return;
  }
  if(u.href.startsWith(FB)||u.host==="fonts.googleapis.com"||u.host==="fonts.gstatic.com"){
    // ライブラリ・フォント：控え優先
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{ const cp=res.clone(); caches.open(V).then(c=>c.put(e.request,cp)); return res; })));
  }
});
