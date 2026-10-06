/* ふたりのリスト 単独アプリ版：Claude の実行環境（window.claude.use）を Firebase で置き換える薄い層 */
(function(){
  "use strict";
  var FB = "https://www.gstatic.com/firebasejs/10.12.2/";
  var CFG = window.FUTARI_FIREBASE_CONFIG || null;
  var OWNER = (window.FUTARI_OWNER_EMAIL || "").toLowerCase();
  var ALLOWED = (window.FUTARI_ALLOWED_EMAILS || []).map(function(e){ return String(e).toLowerCase(); });
  window.__FUTARI_PWA = true;

  var M = {};            // firebase modules
  var app, auth, fs, me = null, fbMonitor=null, fbOffline=null;
  var fbWatches=new Set();
  var readyResolve, readyReject;
  var ready = new Promise(function(ok, ng){ readyResolve = ok; readyReject = ng; });

  /* ---------- ログイン画面 ---------- */
  var css = "#fbGate{position:fixed;inset:0;z-index:99999;background:var(--ground,#EEF2EF);display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,'Hiragino Sans',sans-serif;color:var(--ink,#1B2622)}"
    + "#fbGate .bx{width:100%;max-width:360px;background:var(--surface,#fff);border-radius:22px;padding:22px 20px;box-shadow:0 8px 30px rgba(0,0,0,.08)}"
    + "#fbGate h1{font-size:20px;margin:0 0 4px}#fbGate p{font-size:13px;color:var(--muted,#66756F);margin:4px 0 14px;line-height:1.5}"
    + "#fbGate input{width:100%;box-sizing:border-box;font-size:16px;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line,#D8E0DB);margin:0 0 10px;background:transparent;color:inherit}"
    + "#fbGate button{width:100%;font-size:16px;font-weight:700;padding:12px;border-radius:12px;border:0;margin-top:4px;cursor:pointer}"
    + "#fbGate .pri{background:var(--task,#1F6B57);color:#fff}#fbGate .sec{background:transparent;color:var(--task,#1F6B57);font-weight:600;font-size:14px}"
    + "#fbGate .msg{font-size:13px;min-height:18px;color:#B3261E;margin:6px 0 0;white-space:pre-wrap}#fbGate .ok{color:var(--task,#1F6B57)}";
  function gate(mode, info){
    var g = document.getElementById("fbGate");
    if(!g){ var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
      g = document.createElement("div"); g.id = "fbGate"; document.body.appendChild(g); }
    if(mode === "none"){ g.remove(); return; }
    if(mode === "config"){ g.innerHTML = '<div class="bx"><h1>設定がまだです</h1><p>config.js に Firebase の設定を入れてください（README の手順2）。</p></div>'; return; }
    if(mode === "verify"){
      g.innerHTML = '<div class="bx"><h1>メールを確認してください</h1><p>' + esc(info || "") + ' に確認メールを送りました。メール内のリンクを開いてから「確認した」を押してください。</p>'
        + '<button class="pri" id="fbVerified">確認した</button><button class="sec" id="fbResend">確認メールをもう一度送る</button><button class="sec" id="fbOut">別のアカウントでログイン</button><div class="msg" id="fbMsg"></div></div>';
      g.querySelector("#fbVerified").onclick = async function(){ await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); if(auth.currentUser.emailVerified) location.reload(); else msg("まだ確認が済んでいません"); };
      g.querySelector("#fbResend").onclick = async function(){ try{ await M.sendEmailVerification(auth.currentUser); msg("送りました", true); }catch(e){ msg(jaErr(e)); } };
      g.querySelector("#fbOut").onclick = function(){ M.signOut(auth).then(function(){ location.reload(); }); };
      return; }
    if(mode === "denied"){
      g.innerHTML = '<div class="bx"><h1>このアカウントは使えません</h1><p>' + esc(info || "") + ' はこのアプリに登録されていません。</p><button class="pri" id="fbOut">ログアウト</button></div>';
      g.querySelector("#fbOut").onclick = function(){ M.signOut(auth).then(function(){ location.reload(); }); }; return; }
    g.innerHTML = '<div class="bx"><h1>ふたりのリスト</h1><p>ふたりのメールアドレスでログインします。はじめての人は「はじめて使う」で自分のパスワードを決めてください。</p>'
      + '<input type="email" id="fbEmail" autocomplete="username" placeholder="メールアドレス" inputmode="email">'
      + '<input type="password" id="fbPass" autocomplete="current-password" placeholder="パスワード（6文字以上）">'
      + '<button class="pri" id="fbIn">ログイン</button><button class="sec" id="fbUp">はじめて使う（登録）</button><button class="sec" id="fbReset">パスワードを忘れた</button><div class="msg" id="fbMsg"></div><a href="./setup.html" style="display:block;text-align:center;margin-top:14px;font-size:13px;color:inherit;opacity:.75">はじめての方へ：始め方の手順 ›</a></div>';
    var em = g.querySelector("#fbEmail"), pw = g.querySelector("#fbPass");
    try{ em.value = localStorage.getItem("futari.lastEmail") || ""; }catch(e){}
    var val = function(){ var e = em.value.trim().toLowerCase(); if(ALLOWED.length && ALLOWED.indexOf(e) < 0){ msg("このアプリに登録されたメールアドレスではありません"); return null; } try{ localStorage.setItem("futari.lastEmail", e); }catch(x){} return e; };
    g.querySelector("#fbIn").onclick = async function(){ var e = val(); if(!e) return; msg("ログイン中…", true); try{ await M.signInWithEmailAndPassword(auth, e, pw.value); }catch(x){ msg(jaErr(x)); } };
    g.querySelector("#fbUp").onclick = async function(){ var e = val(); if(!e) return; if(pw.value.length < 6){ msg("パスワードは6文字以上にしてください"); return; }
      msg("登録中…", true); try{ await M.createUserWithEmailAndPassword(auth, e, pw.value); }catch(x){ msg(jaErr(x)); } };
    g.querySelector("#fbReset").onclick = async function(){ var e = val(); if(!e) return; try{ await M.sendPasswordResetEmail(auth, e); msg("パスワード再設定のメールを送りました", true); }catch(x){ msg(jaErr(x)); } };
    pw.addEventListener("keydown", function(ev){ if(ev.key === "Enter") g.querySelector("#fbIn").click(); });
  }
  function msg(t, ok){ var m = document.getElementById("fbMsg"); if(m){ m.textContent = t; m.className = "msg" + (ok ? " ok" : ""); } }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
  function jaErr(e){ var c = (e && e.code) || "";
    return ({ "auth/invalid-credential":"メールアドレスかパスワードが違います", "auth/wrong-password":"パスワードが違います", "auth/user-not-found":"まだ登録されていません（「はじめて使う」から登録）",
      "auth/email-already-in-use":"このメールアドレスは登録済みです。ログインしてください", "auth/weak-password":"パスワードが短すぎます", "auth/invalid-email":"メールアドレスの形が正しくありません",
      "auth/too-many-requests":"試行が多すぎます。しばらく待ってからもう一度", "auth/network-request-failed":"通信できません。電波を確認してください" })[c] || ("エラー：" + (c || (e && e.message) || e)); }

  /* ---------- 起動 ---------- */
  async function boot(){
    if(!CFG || !CFG.apiKey || /xxx/i.test(CFG.apiKey)){ document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", function(){ gate("config"); }) : gate("config"); throw new Error("no config"); }
    var mods = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
    Object.assign(M, mods[0], mods[1], mods[2]);
    app = M.initializeApp(CFG);
    auth = M.getAuth(app);
    try{ fs = M.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: M.persistentLocalCache({ tabManager: M.persistentMultipleTabManager() }) }); }
    catch(e){ fs = M.getFirestore(app); }
    window.__futariWaitWrites = function(){ return M.waitForPendingWrites(fs); }; /* v171: オンライン復帰時に、オフライン中の変更の送信完了を待つ */
    me = await new Promise(function(ok){ var un = M.onAuthStateChanged(auth, function(u){ if(u && ALLOWED.length && ALLOWED.indexOf((u.email || "").toLowerCase()) < 0){ gate("denied", u.email); return; }
      if(u){ un(); ok(u); } else gate("login"); }); });
    gate("none");
    try{await initFirestoreStatus_();}catch(e){fbNotify_();}
    var nm = me.displayName || (me.email || "").split("@")[0];
    /* Display names use meta/family; a profile write on each startup was unnecessary. */
    return me;
  }
  ready = boot(); ready.catch(function(){});

  function fbNotify_(){window.dispatchEvent(new Event("futari-storage-status"));}
  function fbEmit_(path){fbWatches.forEach(function(w){if(w.raw&&(!path||w.path===path||(w.collection&&path.slice(0,path.lastIndexOf("/"))===w.path)))w.cb(fbOffline.overlay(w.path,w.raw,w.collection));});}
  function fbUnbind_(){fbWatches.forEach(function(w){if(w.un){w.un();w.un=null;}});}
  function fbRebind_(){fbWatches.forEach(function(w){w.bind();});}
  function fbError_(e,op){if(fbMonitor)fbMonitor.observeError(e,op||"read");if(fbOffline&&window.FutariFirestoreMonitor.limited(e))fbOffline.pause(e).catch(function(){fbNotify_();});}
  function fbDeadline_(p){var timer;return Promise.race([p,new Promise(function(_,ng){timer=setTimeout(function(){ng(gasError_("store_timeout","保存先の応答を確認できませんでした"));},20000);})]).finally(function(){clearTimeout(timer);});}
  async function initFirestoreStatus_(){
    if(!window.FutariFirestoreMonitor||!window.FutariFirestoreOffline)return;
    var F=window.FutariFirestoreMonitor,O=window.FutariFirestoreOffline,local;try{local=localStorage;}catch(e){local={getItem:function(){return null;},setItem:function(){}};}
    fbMonitor=F.create({project:CFG.projectId,user:me.uid,storage:local,isVisible:function(){return !document.hidden&&navigator.onLine!==false;},onChange:fbNotify_,fetchUsage:async function(){
      var G=(window.FUTARI_GAS_URLS||{})[OWNER]||gasUrl();if(!G)throw Error("利用状況を確認する接続先がありません");
      var tok=await me.getIdToken(),r=await gasCall_(G,{idToken:tok,tool:"firestoreUsage",args:{}},25000);if(r.error)throw gasError_(r.error.code,r.error.message);return r.payload;
    }});
    fbOffline=O.create({project:CFG.projectId,store:O.storage(window.indexedDB,CFG.projectId+":"+me.uid),id:rid,dayWindow:F.dayWindow,limited:F.limited,onChange:fbNotify_,onError:function(e){fbMonitor.observeError(e,"read");},
      pauseNetwork:function(){return M.disableNetwork(fs);},resumeNetwork:function(){return M.enableNetwork(fs);},probe:async function(){await fbDeadline_(M.getDocFromServer(M.doc(fs,"meta","family")));fbMonitor.clearIssue();},
      send:function(path,kind,value){var ref=M.doc.apply(null,[fs].concat(segs(path)));return fbDeadline_(kind==="delete"?M.deleteDoc(ref):M.setDoc(ref,value,kind==="update"?{merge:true}:{}));},emit:fbEmit_,unbind:fbUnbind_,rebind:fbRebind_
    });
    window.__futariFirestore=fbMonitor;window.__futariOffline=fbOffline;await fbOffline.loaded;if(fbOffline.snapshot().paused)await M.disableNetwork(fs);
    fbMonitor.start();
    setInterval(function(){if(!document.hidden&&navigator.onLine!==false)fbOffline.resume(false).catch(function(){fbNotify_();});},60000);
    document.addEventListener("visibilitychange",function(){if(!document.hidden){fbMonitor.refresh(false);fbOffline.reload().then(function(){if(fbOffline.snapshot().paused)return M.disableNetwork(fs);}).then(function(){return fbOffline.resume(false);}).catch(function(){});}});
  }
  function fbWrite_(path,kind,value){if(fbOffline)return fbOffline.write(path,kind,value);var ref=M.doc.apply(null,[fs].concat(segs(path)));return kind==="delete"?M.deleteDoc(ref):M.setDoc(ref,value,kind==="update"?{merge:true}:{});}
  async function fbGet_(ref,collection){
    var local=fbOffline&&fbOffline.snapshot().paused,read=function(cache){return collection?(cache?M.getDocsFromCache(ref.ref):M.getDocs(ref.ref)):(cache?M.getDocFromCache(ref.ref):M.getDoc(ref.ref));},s;
    try{s=await read(local);}catch(e){fbError_(e,"read");if(local||!fbOffline||!window.FutariFirestoreMonitor.limited(e))throw e;await fbOffline.pause(e);s=await read(true);}
    var base=collection?colSnap(s):docSnap(s);return fbOffline?fbOffline.overlay(ref.path,base,collection):base;
  }
  function fbListen_(ref,collection,cb,err){
    var w={path:ref.path,collection:collection,cb:cb,raw:null,un:null,bind:function(){if(w.un)w.un();w.un=M.onSnapshot(ref.ref,function(s){w.raw=collection?colSnap(s):docSnap(s);cb(fbOffline?fbOffline.overlay(ref.path,w.raw,collection):w.raw);},function(e){fbError_(e,"read");if(err)err(e);});}};
    fbWatches.add(w);w.bind();return function(){if(w.un)w.un();fbWatches.delete(w);};
  }

  /* ---------- db（Claude の db 互換） ---------- */
  function segs(path){ return String(path).split("/").filter(Boolean); }
  function colSnap(qs){ return { docs: qs.docs.map(function(d){ return { id: d.id, data: function(){ return d.data(); } }; }), size: qs.size, empty: qs.empty, metadata: { fromCache: !!(qs.metadata && qs.metadata.fromCache) } }; }
  function docSnap(s){ return { id: s.id, exists: s.exists(), fromCache: !!(s.metadata && s.metadata.fromCache), data: function(){ return s.data(); } }; }
  function DocRef(path){ this.path = path; this.ref = M.doc.apply(null, [fs].concat(segs(path))); }
  DocRef.prototype.set = function(d){ return fbWrite_(this.path,"set",clean(d)); };
  DocRef.prototype.update = function(ch){ return fbWrite_(this.path,"update",clean(ch)); };   // 1段目のオブジェクトは中身をマージ（Claude 版と同じ）
  DocRef.prototype.delete = function(){ return fbWrite_(this.path,"delete"); };
  DocRef.prototype.get = function(){ return fbGet_(this,false); };
  DocRef.prototype.onSnapshot = function(cb, err){ return fbListen_(this,false,cb,err); };
  DocRef.prototype.collection = function(c){ return new ColRef(this.path + "/" + c); };
  function ColRef(path){ this.path = path; this.ref = M.collection.apply(null, [fs].concat(segs(path))); }
  ColRef.prototype.doc = function(id){ return new DocRef(this.path + "/" + id); };
  ColRef.prototype.get = function(){ return fbGet_(this,true); };
  ColRef.prototype.onSnapshot = function(cb, err){ return fbListen_(this,true,cb,err); };
  function clean(o){ return JSON.parse(JSON.stringify(o, function(k, v){ return v === undefined ? null : v; })); }
  var DB = { collection: function(p){ return new ColRef(p); }, doc: function(p){ return new DocRef(p); } };

  /* ---------- user ---------- */
  var USER = {
    id: async function(){ return me.uid; },
    isOwner: async function(){ return !!OWNER && (me.email || "").toLowerCase() === OWNER; },
    me: async function(){ return { name: me.displayName || (me.email || "").split("@")[0], email: me.email }; },
    can: async function(){ return true; },
    profiles: async function(ids){ var out = {}; await Promise.all(ids.map(async function(id){ try{ var s = await M.getDoc(M.doc(fs, "profiles", id)); if(s.exists()) out[id] = { name: s.data().name || "" }; }catch(e){} })); return out; },
    signOut: function(){ return M.signOut(auth).then(function(){ location.reload(); }); },
    email: function(){ return me && me.email; }
  };

  /* ---------- downloads ---------- */
  var DL = { save: async function(o){
    var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: /\.json$/.test(o.filename) ? "application/json" : /\.html?$/.test(o.filename) ? "text/html" : /\.csv$/.test(o.filename) ? "text/csv" : "application/octet-stream" });
    try{ var f = new File([blob], o.filename, { type: blob.type }); if(navigator.canShare && navigator.canShare({ files: [f] })){ await navigator.share({ files: [f] }); return { saved: true }; } }
    catch(e){ if(e && e.name === "AbortError"){ var d = new Error("declined"); d.code = "declined"; throw d; } }
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000); return { saved: true };
  } };

  /* ---------- assets（写真は Firestore に保存：1枚 900KB 以下に縮小） ---------- */
  var MAX_ONE = 900 * 1024, MAX_BYTES = 700 * 1024 * 1024, MAX_FILES = 5000;
  var urlCache = new Map(), loading = new Map();
  var PIX = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  function rid(){ var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, function(b){ return b.toString(16).padStart(2, "0"); }).join(""); }
  async function shrinkTo(blob){
    if(blob.size <= MAX_ONE) return blob;
    var src = await createImageBitmap(blob), max = 1400, q = 0.72, out = blob;
    for(var i = 0; i < 5 && out.size > MAX_ONE; i++){
      var W0 = src.naturalWidth || src.width, H0 = src.naturalHeight || src.height, k = Math.min(1, max / Math.max(W0, H0)), c = document.createElement("canvas"); c.width = Math.round(W0 * k); c.height = Math.round(H0 * k);
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); out = await new Promise(function(r){ c.toBlob(r, "image/jpeg", q); }); max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.06); }
    if(out.size > MAX_ONE){ var e = new Error("too large"); e.code = "quota_or_state"; throw e; }
    return out;
  }
  async function putBlob(id, blob, type){
    if(fbOffline&&fbOffline.snapshot().paused)throw gasError_("local_mode","写真の追加は同期が復旧してからできます。文章の変更は端末に保存できます。");
    blob = await shrinkTo(blob); var buf = new Uint8Array(await blob.arrayBuffer());
    await M.setDoc(M.doc(fs, "blobs", id), { data: M.Bytes.fromUint8Array(buf), type: type || blob.type || "image/jpeg", size: buf.length, at: Date.now(), by: me.uid });
    await M.setDoc(M.doc(fs, "blobmeta", id), { size: buf.length, type: type || blob.type || "image/jpeg", at: Date.now(), by: me.uid });
    var u = URL.createObjectURL(new Blob([buf], { type: type || "image/jpeg" })); urlCache.set(id, u); fill(id, u);
    return { id: id, url: u };
  }
  function fill(id, u){ document.querySelectorAll('img[src$="#fb=' + id + '"]').forEach(function(im){ im.src = u; }); }
  window.__blobUrl = function(id){
    if(urlCache.has(id)) return urlCache.get(id);
    if(!loading.has(id)) loading.set(id, ready.then(function(){ return fbOffline&&fbOffline.snapshot().paused?M.getDocFromCache(M.doc(fs,"blobs",id)):M.getDoc(M.doc(fs, "blobs", id)); }).then(function(s){
      if(!s.exists()) return; var d = s.data(), u = URL.createObjectURL(new Blob([d.data.toUint8Array()], { type: d.type || "image/jpeg" })); urlCache.set(id, u); fill(id, u); }).catch(function(){}).finally(function(){ setTimeout(function(){ loading.delete(id); }, 30000); }));
    return PIX + "#fb=" + id;
  };
  var ASSETS = {
    upload: function(blob, o){ return putBlob(rid(), blob, (o && o.type) || blob.type); },
    putWithId: function(id, blob){ return putBlob(id, blob, blob.type || "image/jpeg"); },
    list: async function(){ if(fbOffline&&fbOffline.snapshot().paused)throw gasError_("local_mode","写真一覧の取得は同期が復旧してからできます。");var qs = await M.getDocs(M.collection(fs, "blobmeta")); var as = qs.docs.map(function(d){ var x = d.data(); return { id: d.id, size: x.size || 0, by: x.by || null, at: x.at || 0, mine: !!(x.by && me && x.by === me.uid) }; });
      return { assets: as, usage: { files: as.length, bytes: as.reduce(function(a, x){ return a + x.size; }, 0), maxFiles: MAX_FILES, maxBytes: MAX_BYTES } }; },
    delete: async function(id){ if(fbOffline&&fbOffline.snapshot().paused)throw gasError_("local_mode","写真の削除は同期が復旧してからできます。");await M.deleteDoc(M.doc(fs, "blobs", id)); await M.deleteDoc(M.doc(fs, "blobmeta", id)); var u = urlCache.get(id); if(u){ URL.revokeObjectURL(u); urlCache.delete(id); } return { deleted: true }; }
  };

  /* ---------- sample（レシート文字の読み取り：端末内のかんたん解析） ---------- */
  function parseReceipt(prompt){
    var m = String(prompt).split("----"); var t = (m[1] || prompt).replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[，]/g, ",").replace(/[￥]/g, "¥");
    var lines = t.split(/\n/).map(function(s){ return s.trim(); }).filter(Boolean);
    var num = function(s){ var r = String(s).match(/[¥\\]?\s*(-?[\d,]{1,9})\s*円?\s*[※*軽外内]?$/); return r ? Number(r[1].replace(/,/g, "")) : null; };
    var total = null;
    for(var i = 0; i < lines.length && total == null; i++){ if(/(合\s*計|お支払|支払金額|領収金額|ご請求|お買上計)/.test(lines[i]) && !/(小計|点数)/.test(lines[i])){ total = num(lines[i]) || (lines[i + 1] ? num(lines[i + 1]) : null); } }
    var date = null, dm = t.match(/(20\d{2})\s*[\/年.\-]\s*(\d{1,2})\s*[\/月.\-]\s*(\d{1,2})/) || t.match(/令和\s*(\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if(dm){ var y = Number(dm[1]); if(y < 100) y += 2018; date = y + "-" + String(dm[2]).padStart(2, "0") + "-" + String(dm[3]).padStart(2, "0"); }
    var items = [];
    lines.forEach(function(l){ if(items.length >= 12 || /(合\s*計|小計|税|釣|預|支払|ポイント|点数|クレジット|現金|レジ|No\.|TEL|電話|〒)/i.test(l)) return;
      var r = l.match(/^(.{2,30}?)\s+[¥\\]?\s*([\d,]{2,7})\s*円?\s*[※*軽外内]?$/); if(r && !/^\d+$/.test(r[1])) items.push({ name: r[1].replace(/[¥\\]$/, "").trim(), price: Number(r[2].replace(/,/g, "")) }); });
    if(total == null && items.length) total = items.reduce(function(a, x){ return a + x.price; }, 0);
    var store = (lines.find(function(l){ return !/\d{2,}/.test(l) && l.length <= 24 && !/(領収|レシート|いらっしゃ|ありがとう)/.test(l); }) || "").slice(0, 30);
    var all = t, cat = /(カフェ|珈琲|コーヒー|レストラン|食堂|ラーメン|寿司|焼肉|居酒屋|マクドナルド|スターバックス|すき家|吉野家|店内|テイクアウト|お子様|ランチ)/.test(all) ? "eatout"
      : /(薬局|ドラッグ|マツモトキヨシ|スギ|ウエルシア|ココカラ|洗剤|ティッシュ|シャンプー)/.test(all) ? "daily"
      : /(スーパー|イオン|アピタ|生鮮|野菜|精肉|鮮魚|牛乳|豆腐|卵|パン)/.test(all) ? "food"
      : /(ガソリン|レギュラー|ENEOS|出光|駐車|高速)/.test(all) ? "car" : "other";
    return { store: store, date: date, total: total, items: items, category: cat };
  }
  /* AI：Apps Script 経由で Gemini に問い合わせる。写真と長い文章は一時的に Firestore（aitmp）に置き、スクリプトが読みに行く */
  function gasUrl(){ var U = window.FUTARI_GAS_URLS || {}, mine = me && U[(me.email || "").toLowerCase()];
    if(mine) return mine; for(var k in U) if(U[k]) return U[k]; return window.FUTARI_GAS_URL || ""; }
  /* v200: iPhone の写真（HEIC など）で createImageBitmap が失敗するときは <img> で読み込む */
  async function aiDecode_(blob){
    try { return await createImageBitmap(blob); } catch(e) {}
    var url = URL.createObjectURL(blob);
    try { return await new Promise(function(ok, ng){ var im = new Image(); im.onload = function(){ ok(im); }; im.onerror = function(){ var e = new Error("写真を開けませんでした（JPEGで撮り直すか、スクリーンショットで試してください）"); e.code = "bad_image"; ng(e); }; im.src = url; }); }
    finally { setTimeout(function(){ URL.revokeObjectURL(url); }, 30000); }
  }
  async function aiShrink(blob){
    var src = await aiDecode_(blob), max = 2000, q = 0.82, out = null;
    for(var i = 0; i < 6; i++){
      var W0 = src.naturalWidth || src.width, H0 = src.naturalHeight || src.height, k = Math.min(1, max / Math.max(W0, H0)), c = document.createElement("canvas"); c.width = Math.round(W0 * k); c.height = Math.round(H0 * k);
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); out = await new Promise(function(r){ c.toBlob(r, "image/jpeg", q); });
      if(out && out.size <= MAX_ONE) return out; max = Math.round(max * 0.82); q = Math.max(0.55, q - 0.06); }
    var e = new Error("写真が大きすぎます"); e.code = "too_large"; throw e;
  }
  function aiAbortError_(){ var e=new Error("AI request cancelled"); e.name="AbortError"; e.code="ai_cancelled"; return e; }
  function waitAbort_(promise, signal){
    return new Promise(function(ok,ng){
      var done=false, finish=function(err,value){if(done)return;done=true;if(signal)signal.removeEventListener("abort",abort);err?ng(err):ok(value);};
      var abort=function(){finish(aiAbortError_());};
      Promise.resolve(promise).then(function(v){finish(null,v);},function(e){finish(e);});
      if(signal){if(signal.aborted)abort();else signal.addEventListener("abort",abort,{once:true});}
    });
  }
  var aiConnectionIssue=null;
  var aiStoreIssue=null;
  function aiStoreLimited_(e){return !!e&&(e.code==="ai_store_rate_limited"||/(^|\/)resource-exhausted$/.test(String(e.code||""))||/問い合わせ内容を読めませんでした[（(]429[）)]/.test(String(e.detail||e.message||"")));}
  function aiStoreError_(e){var x=gasError_("ai_store_rate_limited","質問の保存先が利用制限（429）に達しています。時間をおいて再送してください。");x.detail=String(e.detail||e.message||x.message);return x;}
  function aiDelay_(ms,signal){return new Promise(function(ok,ng){var timer,done=false;function finish(error){if(done)return;done=true;clearTimeout(timer);if(signal)signal.removeEventListener("abort",abort);error?ng(error):ok();}function abort(){finish(aiAbortError_());}if(signal&&signal.aborted){abort();return;}if(signal)signal.addEventListener("abort",abort,{once:true});timer=setTimeout(function(){finish();},ms);});}
  var aiBackendInfo=null,aiBackendJob=null;
  async function aiSupportsDirect_(signal){
    var G=gasUrl();if(aiBackendInfo&&aiBackendInfo.url===G&&Date.now()-aiBackendInfo.at<300000)return aiBackendInfo.direct;
    if(!aiBackendJob)aiBackendJob=(async function(){var tok=await me.getIdToken(),r=await gasCall_(G,{idToken:tok,tool:"capabilities",args:{}},20000);
      if(r.error&&!/未対応の操作.*capabilities/.test(r.error.message||""))throw gasError_(r.error.code,r.error.message);
      var direct=!!(r.payload&&r.payload.directAI===1);aiBackendInfo={url:G,at:Date.now(),direct:direct};return direct;
    })().finally(function(){aiBackendJob=null;});return waitAbort_(aiBackendJob,signal);
  }
  async function aiAsk(prompt,o){
    o=o||{};if(!gasUrl())throw gasError_("no_gas","AIの接続先がありません");
    if(await aiSupportsDirect_(o.signal))return aiAskDirect_(prompt,o);
    if(fbOffline&&fbOffline.snapshot().paused)throw gasError_("gas_update_required","Firestoreを使わないAIの接続サーバーは更新待ちです。入力は残しています。");
    return aiAskLegacy_(prompt,o);
  }
  async function aiAskLegacy_(prompt, o){
    o=o||{}; var signal=o.signal, G=gasUrl();
    if(signal&&signal.aborted)throw aiAbortError_();
    if(!G){var e0=new Error("no_gas");e0.code="no_gas";throw e0;}
    if(aiConnectionIssue&&aiConnectionIssue.url===G&&Date.now()<aiConnectionIssue.until)throw aiConnectionIssue.error;
    if(aiStoreIssue&&aiStoreIssue.url===G&&Date.now()<aiStoreIssue.until)throw aiStoreIssue.error;
    var imgs=o.images?(Array.isArray(o.images)?o.images:[o.images]):[], id="ai"+rid(), ref=M.doc(fs,"aitmp",id), doc={prompt:String(prompt).slice(0,40000),at:Date.now(),by:me.uid};
    if(o.modelTier)doc.tier=String(o.modelTier).slice(0,10); /* v193: pro＝賢いモデル（Apps Script v10 以降で有効） */
    var ctl=new AbortController(), expired=false, budget=Math.max(1000,Math.min(150000,Number(o.timeoutMs)||(imgs.length||o.audio?90000:30000)));
    var cancel=function(){ctl.abort();}, timer=setTimeout(function(){expired=true;ctl.abort();},budget), written=null,deadline=Date.now()+budget,storeIssue=null;
    if(signal)signal.addEventListener("abort",cancel,{once:true});
    var phase=function(t){if(typeof o.onProgress==="function")o.onProgress(t);};
    try{
      phase("送信を準備しています");
      if(o.audio){if(o.audio.size>MAX_ONE){var ea=new Error("録音が長すぎます");ea.code="too_large";throw ea;}doc.img=M.Bytes.fromUint8Array(new Uint8Array(await waitAbort_(o.audio.arrayBuffer(),ctl.signal)));doc.mime=o.audio.type||"audio/wav";} /* v193: 音声の文字起こし */
      else if(imgs[0]){var b=await waitAbort_(aiShrink(imgs[0]),ctl.signal);doc.img=M.Bytes.fromUint8Array(new Uint8Array(await waitAbort_(b.arrayBuffer(),ctl.signal)));doc.mime="image/jpeg";}
      if(ctl.signal.aborted)throw aiAbortError_();
      written=M.setDoc(ref,doc);await waitAbort_(written,ctl.signal);
      var tok=await waitAbort_(me.getIdToken(),ctl.signal);
      phase("AIに問い合わせています");
      /* A read-limit response occurs before the model runs. Retry the same uploaded document only, never re-upload or switch models for a storage quota. */
      var j;
      for(var attempt=0;attempt<3;attempt++){
        if(ctl.signal.aborted)throw aiAbortError_();
        j=await gasCall_(G,{idToken:tok,tool:"ai",args:{doc:id}},Math.max(1,deadline-Date.now()),ctl.signal);
        if(!j.error)break;
        var z=new Error(j.error.message||j.error.code);z.code=j.error.code||"tool_error";z.detail=j.error.message;
        if(!aiStoreLimited_(z))throw z;
        z=aiStoreError_(z);storeIssue=aiStoreIssue={url:G,until:Date.now()+60000,error:z};
        if(attempt===2)throw z;
        var delay=2000*Math.pow(2,attempt)+Math.floor(Math.random()*1000);
        if(deadline-Date.now()<=delay+1000)throw z;
        phase("質問の保存先が混み合っています。少し待って再試行します（"+(attempt+1)+"/2）");
        await aiDelay_(delay,ctl.signal);
        phase("AIに問い合わせています");
      }
      if(storeIssue&&aiStoreIssue===storeIssue)aiStoreIssue=null;
      aiConnectionIssue=null;return j.payload;
    }catch(e){
      if(expired){var t=new Error("AIの応答が時間内に届きませんでした");t.code="ai_timeout";throw t;}
      if(aiStoreLimited_(e)){fbError_(e,"read");var limited=aiStoreError_(e);aiStoreIssue={url:G,until:Date.now()+60000,error:limited};throw limited;}
      if(e.code==="gas_access"||e.code==="gas_response")aiConnectionIssue={url:G,until:Date.now()+60000,error:e};
      throw e;
    }finally{
      clearTimeout(timer);if(signal)signal.removeEventListener("abort",cancel);
      if(written)Promise.resolve(written).then(function(){return M.deleteDoc(ref);}).catch(function(){});
    }
  }
  async function aiAskDirect_(prompt,o){
    o=o||{};var signal=o.signal,G=gasUrl();if(signal&&signal.aborted)throw aiAbortError_();
    if(!G)throw gasError_("no_gas","AIの接続先がありません");
    var ctl=new AbortController(),expired=false,budget=Math.max(1000,Math.min(150000,Number(o.timeoutMs)||(o.images||o.audio?90000:30000)));
    var timer=setTimeout(function(){expired=true;ctl.abort();},budget),deadline=Date.now()+budget,cancel=function(){ctl.abort();};if(signal)signal.addEventListener("abort",cancel,{once:true});
    var phase=function(t){if(typeof o.onProgress==="function")o.onProgress(t);};
    try{
      phase("送信を準備しています");var args={prompt:String(prompt).slice(0,40000),tier:String(o.modelTier||"").slice(0,10)},imgs=o.images?(Array.isArray(o.images)?o.images:[o.images]):[];
      var blob=o.audio|| (imgs[0]?await waitAbort_(aiShrink(imgs[0]),ctl.signal):null);
      if(blob){if(blob.size>MAX_ONE)throw gasError_("too_large","音声・写真が大きすぎます");var bytes=new Uint8Array(await waitAbort_(blob.arrayBuffer(),ctl.signal)),binary="";for(var i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));args.img=btoa(binary);args.mime=o.audio?(blob.type||"audio/wav"):"image/jpeg";}
      var tok=await waitAbort_(me.getIdToken(),ctl.signal);phase("AIに直接問い合わせています");
      var j=await gasForm_(G,{idToken:tok,tool:"aiDirect",args:args},Math.max(1,deadline-Date.now()),ctl.signal);
      if(j.error){var e=gasError_(j.error.code||"tool_error",j.error.message||"AIに接続できませんでした");if(/未対応の操作.*aiDirect/.test(e.message))e=gasError_("gas_update_required","AIの接続サーバーの更新が必要です。入力は残しています。");throw e;}return j.payload;
    }catch(e){if(expired)throw gasError_("ai_timeout","AIの応答が時間内に届きませんでした");throw e;
    }finally{clearTimeout(timer);if(signal)signal.removeEventListener("abort",cancel);}
  }
  function gasForm_(url,req,ms,signal){
    return new Promise(function(ok,ng){
      var nonce=rid(),frame=document.createElement("iframe"),form=document.createElement("form"),done=false,timer;
      frame.name="futari_rpc_"+nonce;frame.hidden=true;frame.title="AIへの送信";form.method="POST";form.action=url;form.target=frame.name;form.hidden=true;
      function cleanup(){clearTimeout(timer);window.removeEventListener("message",message);if(signal)signal.removeEventListener("abort",abort);form.remove();frame.remove();}
      function finish(error,result){if(done)return;done=true;cleanup();error?ng(error):ok(result);}
      function abort(){finish(aiAbortError_());}
      function message(e){if(!/^https:\/\/(?:[a-z0-9-]+-)?script\.googleusercontent\.com$/.test(e.origin)&&e.origin!=="https://script.google.com")return;
        var d=e.data;if(!d||d.type!=="futari-rpc"||d.nonce!==nonce)return;if(!d.result||typeof d.result!=="object"||(!Object.prototype.hasOwnProperty.call(d.result,"payload")&&!d.result.error)){finish(gasError_("gas_response","AIの応答形式を確認できませんでした"));return;}finish(null,d.result);}
      if(signal&&signal.aborted){abort();return;}window.addEventListener("message",message);if(signal)signal.addEventListener("abort",abort,{once:true});
      for(var pair of [["futariRpc",nonce],["rpcPayload",JSON.stringify(req)]]){var input=document.createElement("input");input.type="hidden";input.name=pair[0];input.value=pair[1];form.appendChild(input);}
      timer=setTimeout(function(){finish(gasError_("ai_timeout","AIから時間内に返事が届きませんでした。入力は残しています。"));},ms);
      document.body.appendChild(frame);document.body.appendChild(form);try{form.submit();}catch(e){finish(gasError_("gas_connection","AIへ送信できませんでした"));}
    });
  }

  var SAMPLE = {
    resetConnection: function(){gasMode=null;aiConnectionIssue=null;},
    limits: function(){ return gasUrl() ? { images: { mediaTypes: ["image/*"] }, ai: "gemini" } : {}; },
    json: async function(prompt, o){
      if(!gasUrl()){ if(o && o.images){ var e = new Error("no_ai"); e.code = "no_ai"; throw e; } return parseReceipt(prompt); }
      try{ return await aiAsk(prompt, o); }
      catch(x){ if(x.name==="AbortError"||(o&&o.signal&&o.signal.aborted))throw x; if(!(o && o.images) && /レシート/.test(String(prompt))) return parseReceipt(prompt); throw x; }
    },
    get local(){ return !gasUrl(); }
  };

  /* ---------- Apps Script 呼び出し（JSONP：スクリプトタグで読むので、ブラウザの通信制限を受けない） ---------- */
  var jpN = 0;
  /* v151: まず普通の通信（POST）で呼び、だめなときだけ従来の方法（JSONP）に切り替える。
     どちらも、返事がJSONでない（ログイン画面など）ときは待ち続けずにすぐ理由を出す */
  var gasMode = null; /* "post" | "jsonp"：一度うまくいった方を使い続ける */
  function gasError_(code,message){var e=new Error(message);e.code=code;return e;}
  async function gasCall_(url, req, ms, signal){
    var ctl=new AbortController(), expired=false, deadline=Date.now()+(ms||30000);
    var cancel=function(){ctl.abort();}, tm=setTimeout(function(){expired=true;ctl.abort();},ms||30000);
    if(signal){if(signal.aborted)cancel();else signal.addEventListener("abort",cancel,{once:true});}
    try{
      if(ctl.signal.aborted)throw aiAbortError_();
      if(gasMode!=="jsonp"){
        var r=null;
        try{r=await waitAbort_(fetch(url,{method:"POST",body:JSON.stringify(req),headers:{"Content-Type":"text/plain;charset=utf-8"},redirect:"follow",signal:ctl.signal,credentials:"omit"}),ctl.signal);}
        catch(e){if(ctl.signal.aborted)throw e;/* Transport failure only: try JSONP once within the same deadline. */}
        if(r){
          var txt=await waitAbort_(r.text(),ctl.signal), j;
          try{j=JSON.parse(txt);}catch(e){throw gasError_(/<html|<!doctype/i.test(txt)?"gas_access":"gas_response",/<html|<!doctype/i.test(txt)?"Apps Scriptがログイン画面などを返しました。接続先URLとデプロイのアクセス設定を確認してください":"Apps Scriptの返事を読み取れませんでした（"+r.status+"）");}
          if(!j||typeof j!=="object"||(!Object.prototype.hasOwnProperty.call(j,"payload")&&!j.error))throw gasError_("gas_response","Apps Scriptの応答形式が違います。接続設定を確認してください");
          gasMode="post";return j;
        }
      }
      if(ctl.signal.aborted)throw aiAbortError_();
      var j2=await jsonp_(url,req,Math.max(1,deadline-Date.now()),ctl.signal);gasMode="jsonp";return j2;
    }catch(e){if(expired)throw gasError_("ai_timeout","Apps Scriptの応答が時間内に届きませんでした");throw e;}
    finally{clearTimeout(tm);if(signal)signal.removeEventListener("abort",cancel);}
  }
  function jsonp_(url, req, ms, signal){
    return new Promise(function(ok,ng){
      var cb="__fjp"+Date.now().toString(36)+(jpN++),sc=document.createElement("script"),done=false,t=null,loadTimer=null;
      var cleanup=function(){clearTimeout(t);clearTimeout(loadTimer);if(signal)signal.removeEventListener("abort",abort);sc.onload=null;sc.onerror=null;sc.remove();try{delete window[cb];}catch(e){window[cb]=undefined;}};
      var fail=function(code,message){if(done)return;done=true;cleanup();ng(code==="ai_cancelled"?aiAbortError_():gasError_(code,message||code));};
      var abort=function(){fail("ai_cancelled");};
      window[cb]=function(res){if(done)return;if(!res||typeof res!=="object"||(!Object.prototype.hasOwnProperty.call(res,"payload")&&!res.error)){fail("gas_response","Apps Scriptの応答形式が違います");return;}done=true;cleanup();ok(res);};
      if(signal){if(signal.aborted){abort();return;}signal.addEventListener("abort",abort,{once:true});}
      var q=encodeURIComponent(JSON.stringify(req));if(q.length>7000){fail("request_too_large","送る内容が長すぎます");return;}
      sc.src=url+(url.indexOf("?")<0?"?":"&")+"cb="+cb+"&q="+q;
      sc.onerror=function(){fail(navigator.onLine===false?"server_unavailable":"gas_connection","Apps Scriptに接続できません。通信状態と接続設定を確認してください");};
      sc.onload=function(){if(!done)loadTimer=setTimeout(function(){fail("gas_response","Apps Scriptが正しい返事を返しませんでした。接続先URLとデプロイ設定を確認してください");},100);};
      t=setTimeout(function(){fail("ai_timeout","Apps Scriptから時間内に返事が届きませんでした");},ms||30000);
      document.head.appendChild(sc);
    });
  }

  /* ---------- window.claude 互換 ---------- */
  window.claude = { use: async function(name){
    if(name === "db"){ try{ await ready; return DB; }catch(e){ return null; } }
    await ready.catch(function(){});
    if(!me) return null;
    if(name === "user") return USER;
    if(name === "downloads") return DL;
    if(name === "assets") return ASSETS;
    if(name === "sample") return SAMPLE;
    if(name === "push"){ var GP = gasUrl(); if(!GP) return null; /* v225: 通知（Web Push）。夫婦どちらも、使えるApps Scriptを経由 */
      return { url: GP, call: async function(args){ var tok = await me.getIdToken(); var j = await gasCall_(GP, { idToken: tok, tool: "push", args: args || {} }, 40000);
        if(j.error){ var z = new Error(j.error.message || j.error.code); z.code = j.error.code || "tool_error"; z.detail = j.error.message; throw z; } return j.payload; } }; }
    if(name === "mcp"){ var G = (window.FUTARI_GAS_URLS || {})[(me.email || "").toLowerCase()] || window.FUTARI_GAS_URL; if(!G) return null;
      return { callTool: async function(server, tool, args){
        if(/googleusercontent\.com\/macros\/echo/.test(G) || !/\/exec(\?|$)/.test(G)){ var q = new Error("bad url"); q.code = "config.js のURLが違います。Apps Scriptの「デプロイを管理」に表示される https://script.google.com/macros/s/…/exec の形のURLを入れてください"; throw q; }
        var tok = await me.getIdToken();
        var j = await gasCall_(G, { idToken: tok, tool: tool, args: args || {} }, tool === "workcal" ? 150000 : 30000);
        if(j.error){ var z = new Error(j.error.message || j.error.code); z.code = j.error.code || "tool_error"; z.detail = j.error.message; throw z; }
        return { payload: j.payload };
      } }; }
    return null;
  } };
  window.__futariParseReceipt = parseReceipt;
  window.__futariSignOut = function(){ return USER.signOut(); };
  window.__futariEmail = function(){ return me && me.email; };
})();
