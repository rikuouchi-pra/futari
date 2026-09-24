/* ふたりのリスト 単独アプリ版：Claude の実行環境（window.claude.use）を Firebase で置き換える薄い層 */
(function(){
  "use strict";
  var FB = "https://www.gstatic.com/firebasejs/10.12.2/";
  var CFG = window.FUTARI_FIREBASE_CONFIG || null;
  var OWNER = (window.FUTARI_OWNER_EMAIL || "").toLowerCase();
  var ALLOWED = (window.FUTARI_ALLOWED_EMAILS || []).map(function(e){ return String(e).toLowerCase(); });
  window.__FUTARI_PWA = true;

  var M = {};            // firebase modules
  var app, auth, fs, me = null;
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
      + '<button class="pri" id="fbIn">ログイン</button><button class="sec" id="fbUp">はじめて使う（登録）</button><button class="sec" id="fbReset">パスワードを忘れた</button><div class="msg" id="fbMsg"></div></div>';
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
    me = await new Promise(function(ok){ var un = M.onAuthStateChanged(auth, function(u){ if(u && ALLOWED.length && ALLOWED.indexOf((u.email || "").toLowerCase()) < 0){ gate("denied", u.email); return; }
      if(u){ un(); ok(u); } else gate("login"); }); });
    gate("none");
    var nm = me.displayName || (me.email || "").split("@")[0];
    M.setDoc(M.doc(fs, "profiles", me.uid), { name: nm, email: me.email, at: Date.now() }, { merge: true }).catch(function(){});
    return me;
  }
  ready = boot(); ready.catch(function(){});

  /* ---------- db（Claude の db 互換） ---------- */
  function segs(path){ return String(path).split("/").filter(Boolean); }
  function colSnap(qs){ return { docs: qs.docs.map(function(d){ return { id: d.id, data: function(){ return d.data(); } }; }), size: qs.size, empty: qs.empty, metadata: { fromCache: !!(qs.metadata && qs.metadata.fromCache) } }; }
  function docSnap(s){ return { id: s.id, exists: s.exists(), fromCache: !!(s.metadata && s.metadata.fromCache), data: function(){ return s.data(); } }; }
  function DocRef(path){ this.path = path; this.ref = M.doc.apply(null, [fs].concat(segs(path))); }
  DocRef.prototype.set = function(d){ return M.setDoc(this.ref, clean(d)); };
  DocRef.prototype.update = function(ch){ return M.setDoc(this.ref, clean(ch), { merge: true }); };   // 1段目のオブジェクトは中身をマージ（Claude 版と同じ）
  DocRef.prototype.delete = function(){ return M.deleteDoc(this.ref); };
  DocRef.prototype.get = function(){ return M.getDoc(this.ref).then(docSnap); };
  DocRef.prototype.onSnapshot = function(cb, err){ return M.onSnapshot(this.ref, function(s){ cb(docSnap(s)); }, err || function(){}); };
  DocRef.prototype.collection = function(c){ return new ColRef(this.path + "/" + c); };
  function ColRef(path){ this.path = path; this.ref = M.collection.apply(null, [fs].concat(segs(path))); }
  ColRef.prototype.doc = function(id){ return new DocRef(this.path + "/" + id); };
  ColRef.prototype.get = function(){ return M.getDocs(this.ref).then(colSnap); };
  ColRef.prototype.onSnapshot = function(cb, err){ return M.onSnapshot(this.ref, function(qs){ cb(colSnap(qs)); }, err || function(){}); };
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
      var k = Math.min(1, max / Math.max(src.width, src.height)), c = document.createElement("canvas"); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); out = await new Promise(function(r){ c.toBlob(r, "image/jpeg", q); }); max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.06); }
    if(out.size > MAX_ONE){ var e = new Error("too large"); e.code = "quota_or_state"; throw e; }
    return out;
  }
  async function putBlob(id, blob, type){
    blob = await shrinkTo(blob); var buf = new Uint8Array(await blob.arrayBuffer());
    await M.setDoc(M.doc(fs, "blobs", id), { data: M.Bytes.fromUint8Array(buf), type: type || blob.type || "image/jpeg", size: buf.length, at: Date.now(), by: me.uid });
    await M.setDoc(M.doc(fs, "blobmeta", id), { size: buf.length, type: type || blob.type || "image/jpeg", at: Date.now(), by: me.uid });
    var u = URL.createObjectURL(new Blob([buf], { type: type || "image/jpeg" })); urlCache.set(id, u); fill(id, u);
    return { id: id, url: u };
  }
  function fill(id, u){ document.querySelectorAll('img[src$="#fb=' + id + '"]').forEach(function(im){ im.src = u; }); }
  window.__blobUrl = function(id){
    if(urlCache.has(id)) return urlCache.get(id);
    if(!loading.has(id)) loading.set(id, ready.then(function(){ return M.getDoc(M.doc(fs, "blobs", id)); }).then(function(s){
      if(!s.exists()) return; var d = s.data(), u = URL.createObjectURL(new Blob([d.data.toUint8Array()], { type: d.type || "image/jpeg" })); urlCache.set(id, u); fill(id, u); }).catch(function(){}).finally(function(){ setTimeout(function(){ loading.delete(id); }, 30000); }));
    return PIX + "#fb=" + id;
  };
  var ASSETS = {
    upload: function(blob, o){ return putBlob(rid(), blob, (o && o.type) || blob.type); },
    putWithId: function(id, blob){ return putBlob(id, blob, blob.type || "image/jpeg"); },
    list: async function(){ var qs = await M.getDocs(M.collection(fs, "blobmeta")); var as = qs.docs.map(function(d){ return { id: d.id, size: d.data().size || 0 }; });
      return { assets: as, usage: { files: as.length, bytes: as.reduce(function(a, x){ return a + x.size; }, 0), maxFiles: MAX_FILES, maxBytes: MAX_BYTES } }; },
    delete: async function(id){ await M.deleteDoc(M.doc(fs, "blobs", id)); await M.deleteDoc(M.doc(fs, "blobmeta", id)); var u = urlCache.get(id); if(u){ URL.revokeObjectURL(u); urlCache.delete(id); } return { deleted: true }; }
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
  var SAMPLE = { limits: function(){ return {}; }, json: async function(prompt){ return parseReceipt(prompt); }, local: true };

  /* ---------- window.claude 互換 ---------- */
  window.claude = { use: async function(name){
    if(name === "db"){ try{ await ready; return DB; }catch(e){ return null; } }
    await ready.catch(function(){});
    if(!me) return null;
    if(name === "user") return USER;
    if(name === "downloads") return DL;
    if(name === "assets") return ASSETS;
    if(name === "sample") return SAMPLE;
    if(name === "mcp"){ var G = (window.FUTARI_GAS_URLS || {})[(me.email || "").toLowerCase()] || window.FUTARI_GAS_URL; if(!G) return null;
      return { callTool: async function(server, tool, args){
        var tok = await me.getIdToken(), r;
        try{ r = await fetch(G, { method: "POST", body: JSON.stringify({ idToken: tok, tool: tool, args: args || {} }) }); }
        catch(e){ var x = new Error("offline"); x.code = navigator.onLine === false ? "server_unavailable" : "通信できません：Apps ScriptのURLが正しいか、デプロイの「アクセスできるユーザー」が「全員」か確認"; throw x; }
        var txt = await r.text(), j;
        try{ j = JSON.parse(txt); }catch(e){
          var y = new Error("bad response"); var t = txt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
          y.code = /ログイン|Sign in|accounts\.google/i.test(txt) ? "Apps Scriptの公開設定が「全員」になっていません（デプロイを管理→編集→アクセス：全員）"
            : /Calendar is not defined|Calendar.*定義/i.test(txt) ? "Apps Scriptに「Google Calendar API」サービスが追加されていません"
            : /許可|authorization|承認/i.test(txt) ? "Apps Scriptで setupTest を実行して許可してください"
            : "Apps Scriptの応答が不正です（HTTP " + r.status + "：" + t + "）";
          throw y; }
        if(j.error){ var z = new Error(j.error.message || j.error.code); z.code = j.error.code === "tool_error" || j.error.code === "not_granted" || j.error.code === "needs_reauth" ? j.error.code : j.error.code; z.detail = j.error.message; throw z; }
        return { payload: j.payload };
      } }; }
    return null;
  } };
  window.__futariSignOut = function(){ return USER.signOut(); };
  window.__futariEmail = function(){ return me && me.email; };
})();
