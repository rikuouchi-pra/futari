/* ふたりのリスト：オフラインでも開けるようにするサービスワーカー */
const V="futari-286-ios-voice-recording";
const SHELL=["./","index.html","shim.js","config.js","manifest.webmanifest","icon-192.png","icon-512.png","apple-touch-icon.png"];
const FB="https://www.gstatic.com/firebasejs/10.12.2/";
const LIBS=["firebase-app.js","firebase-auth.js","firebase-firestore.js"].map(f=>FB+f);
self.addEventListener("install",e=>{ e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL).then(()=>Promise.all(LIBS.map(u=>c.add(u).catch(()=>{})))))); self.skipWaiting(); });
self.addEventListener("activate",e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=="futari-push").map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
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

/* v225: 通知（Web Push）。届いたら、Apps Script の受信箱から中身を取って表示 */
const PUSHC="futari-push";
self.addEventListener("message",e=>{ if(e.data&&e.data.type==="pushclear"){e.waitUntil(caches.delete(PUSHC));return;} if(e.data&&e.data.type==="pushcfg") e.waitUntil(caches.open(PUSHC).then(c=>c.put("cfg",new Response(JSON.stringify(e.data.cfg||{}),{headers:{"Content-Type":"application/json"}})))); });
self.addEventListener("push",e=>{ e.waitUntil((async()=>{ let list=[];
  try{ const c=await (await caches.open(PUSHC)).match("cfg"), cfg=c?await c.json():null; if(cfg&&cfg.url&&cfg.dev){ const r=await fetch(`${cfg.url}?inbox=${encodeURIComponent(cfg.dev)}&sec=${encodeURIComponent(cfg.sec||"")}&t=${Date.now()}`,{cache:"no-store"}); const j=await r.json(); list=Array.isArray(j.list)?j.list:[]; } }catch(x){}
  if(!list.length) list=[{id:"n"+Date.now(),t:"ふたりのリスト",b:"新しいお知らせがあります。開いて確認してください"}];
  for(const m of list.slice(-4)) await self.registration.showNotification(m.t||"ふたりのリスト",{body:m.b||"",tag:m.id,data:{u:m.u||"./"},icon:"icon-192.png",badge:"icon-192.png"}); })()); });
self.addEventListener("notificationclick",e=>{ e.notification.close(); const u=(e.notification.data&&e.notification.data.u)||"./";
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(L=>{ for(const c of L){ if("focus" in c){ try{ c.postMessage({type:"pushopen",u}); }catch(x){} return c.focus(); } } return self.clients.openWindow(u); })); });
