/**
 * ふたりのリスト：Googleカレンダー連携（Google Apps Script）
 * このスクリプトを作った人「本人」のGoogleカレンダーだけを読み書きする。
 * 夫は夫のGoogleアカウントで、妻は妻のGoogleアカウントで、それぞれ同じコードを1つずつ作ってデプロイする。
 *
 * 準備：エディタ左の「サービス ＋」から「Google Calendar API」を追加（ID は Calendar のまま）。
 * デプロイ：「デプロイ → 新しいデプロイ → 種類：ウェブアプリ」
 *           次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員
 */

// Firebase の Web API キー（config.js の apiKey と同じ）
const FIREBASE_API_KEY = "AIzaSyAvS4V-_qLGF1Al25Q5A5X5-YradL3UV8Y";

// 書き込むカレンダー（"primary" ＝ このGoogleアカウントのメインのカレンダー）
const CALENDAR_ID = "primary";
// アプリにログインするメールアドレス（空なら、このスクリプトを作ったGoogleアカウントと同じアドレス）
const APP_EMAIL = "";

// ---- AI（Gemini）----
// APIキーは「プロジェクトの設定 › スクリプト プロパティ」に GEMINI_API_KEY として保存（コードには書かない）
const FIREBASE_PROJECT_ID = "futari-list-17396";
// AI（写真の読み取りなど）は、ふたりのどちらからでも使える（カレンダーは本人だけ）
const AI_USERS = ["rikurussel14@gmail.com", "a1lic3h2dak1@gmail.com"];
// 上から順に試し、使えたものを覚える（スクリプト プロパティ GEMINI_MODEL で固定も可）
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-3-flash", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
// ---- AI の予備（ChatGPT）----
// Gemini が混雑・回数制限・エラーのときだけ ChatGPT を使う。キーは スクリプト プロパティ OPENAI_API_KEY（コードには書かない）
// モデルは上から順に試し、使えたものを覚える（スクリプト プロパティ OPENAI_MODEL で固定も可）
const OPENAI_MODELS = ["gpt-6-luna", "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"];

function doPost(e) {
  return json_(handle_((e && e.postData && e.postData.contents) || "{}"));
}

// GET：?cb=関数名&q=… はアプリからの呼び出し（JSONP）、?diag=1 は動作診断、それ以外は動作確認
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.inbox) return json_(pushInbox_(p.inbox, p.sec));
  if (p.diag) return json_(diag_());
  if (p.deploy) return json_(deployNow());  // v7：…/exec?deploy=1 を開くと、配信フォルダの更新をすぐ GitHub へ反映
  if (p.cb) {
    const cb = String(p.cb).replace(/[^A-Za-z0-9_$.]/g, "");
    return ContentService.createTextOutput(cb + "(" + JSON.stringify(handle_(p.q || "{}")) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_({ ok: true, app: "futari-list-gcal", v: 11 });
}

function handle_(raw) {
  try {
    const req = JSON.parse(raw);
    const email = verifyUser_(req.idToken);
    if (String(req.tool || "") === "push") return { payload: push_(req.idToken, email, req.args || {}) };
    if (String(req.tool || "") === "workcal") {
      if (AI_USERS.map(function (x) { return x.toLowerCase(); }).indexOf(email) < 0) throw err_("not_granted", "登録されたふたりだけが使えます");
      return { payload: workcal_((req.args || {}).years || [], !!(req.args || {}).force) };
    }
    if (String(req.tool || "") === "ai") {
      if (AI_USERS.map(function (x) { return x.toLowerCase(); }).indexOf(email) < 0) throw err_("not_granted", "このAIは登録されたふたりだけが使えます");
      return { payload: ai_(req.idToken, (req.args || {}).doc) };
    }
    const owner = String(APP_EMAIL || Session.getEffectiveUser().getEmail() || "").toLowerCase();
    if (email !== owner) throw err_("not_granted", "このカレンダー連携は " + owner + " 専用です（ログイン中：" + email + "）");
    if (String(req.tool || "") === "devsync") return { payload: devsync_(req.args || {}) };
    return { payload: run_(CALENDAR_ID, String(req.tool || ""), req.args || {}) };
  } catch (x) {
    return { error: { code: x.code || "tool_error", message: String((x && x.message) || x) } };
  }
}

// 診断：どこまで動くかを確認（Safari で …/exec?diag=1 を開く）
function diag_() {
  const out = { v: 11 };
  try { out.owner = Session.getEffectiveUser().getEmail() || "(取得できません)"; } catch (x) { out.owner = "NG：" + x.message; }
  try { const r = Calendar.Events.list(CALENDAR_ID, { maxResults: 1, timeMin: new Date().toISOString() }); out.calendar = "OK"; } catch (x) { out.calendar = "NG：" + x.message; }
  try { const k = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY"); if (!k) out.gemini = "未設定（スクリプト プロパティに GEMINI_API_KEY を入れてください）"; else { const r = gemini_([{ text: '{"ok":true} とだけJSONで返してください' }]); out.gemini = "OK（" + r.model + "）"; } } catch (x) { out.gemini = "NG：" + x.message; }
  try { if (!PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY")) out.openai = "未設定（予備なので、なくても動きます）"; else { const r = openai_([{ text: '{"ok":true} とだけJSONで返してください' }]); out.openai = "OK（" + r.model + "）"; } } catch (x) { out.openai = "NG：" + x.message; }
  try { const r = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, { method: "post", contentType: "application/json", payload: "{}", muteHttpExceptions: true }); out.firebase = "OK（" + r.getResponseCode() + "）"; } catch (x) { out.firebase = "NG：" + x.message; }
  return out;
}

/* ---------- AI：Firestore の一時ドキュメント（aitmp）から問い合わせ内容を読み、Gemini に聞いて JSON を返す ---------- */
function ai_(idToken, docId) {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(String(docId || ""))) throw err_("tool_error", "問い合わせ内容がありません");
  const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/(default)/documents/aitmp/" + docId;
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + idToken }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw err_("tool_error", "問い合わせ内容を読めませんでした（" + res.getResponseCode() + "）");
  const f = JSON.parse(res.getContentText()).fields || {};
  const parts = [{ text: (f.prompt && f.prompt.stringValue) || "" }];
  if (f.img && f.img.bytesValue) parts.push({ inline_data: { mime_type: (f.mime && f.mime.stringValue) || "image/jpeg", data: f.img.bytesValue } });
  const r = aiText_(parts, (f.tier && f.tier.stringValue) || "");
  let t = r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch (x) { throw err_("tool_error", "AIの返事を読み取れませんでした"); }
}
/* v5: まず Gemini、だめなら ChatGPT（OPENAI_API_KEY があるときだけ） */
function aiText_(parts, tier) {
  const P = PropertiesService.getScriptProperties(), hasG = !!P.getProperty("GEMINI_API_KEY"), hasO = !!P.getProperty("OPENAI_API_KEY");
  if (!hasG && hasO) return openai_(parts);
  try { return gemini_(parts, tier); }
  catch (x) { if (!hasO) throw x; try { return openai_(parts); } catch (y) { throw err_(y.code || "tool_error", "Gemini：" + x.message + "／ChatGPT：" + y.message); } }
}
function openai_(parts) {
  const P = PropertiesService.getScriptProperties(), key = P.getProperty("OPENAI_API_KEY");
  if (!key) throw err_("no_key", "ChatGPTのAPIキーが未設定です（スクリプト プロパティ OPENAI_API_KEY）");
  const content = parts.map(function (p) { return p.inline_data ? { type: "image_url", image_url: { url: "data:" + p.inline_data.mime_type + ";base64," + p.inline_data.data } } : { type: "text", text: p.text || "" }; });
  if (parts.some(function (p) { return p.inline_data && /pdf|audio/.test(p.inline_data.mime_type); })) throw err_("tool_error", "ChatGPTではPDF・音声を読めません");
  const fixed = P.getProperty("OPENAI_MODEL"), list = fixed ? [fixed] : OPENAI_MODELS.slice(), last = P.getProperty("OPENAI_OK");
  if (!fixed && last) { const i = list.indexOf(last); if (i >= 0) list.splice(i, 1); list.unshift(last); }
  let lastErr = "";
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const res = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
      method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + key }, muteHttpExceptions: true,
      payload: JSON.stringify({ model: m, messages: [{ role: "user", content: content }], response_format: { type: "json_object" } }),
    });
    const code = res.getResponseCode(), body = res.getContentText();
    if (code === 404 || (code === 400 && /model|not found|does not exist|unsupported/i.test(body))) { lastErr = m + "：使えません"; continue; }
    if (code === 401) throw err_("no_key", "ChatGPTのAPIキーが正しくありません（401）");
    if (code === 429) throw err_(/quota|billing/i.test(body) ? "no_credit" : "rate_limited", /quota|billing/i.test(body) ? "ChatGPTのクレジット（残高）が足りません" : "ChatGPTの回数制限に達しました");
    if (code !== 200) throw err_("tool_error", "ChatGPTでエラー（" + code + "）：" + body.slice(0, 200));
    const j = JSON.parse(body), text = (((j.choices || [])[0] || {}).message || {}).content || "";
    if (!text) throw err_("tool_error", "ChatGPTから返事がありませんでした");
    if (P.getProperty("OPENAI_OK") !== m) P.setProperty("OPENAI_OK", m);
    return { text: text, model: m };
  }
  throw err_("tool_error", "使えるChatGPTのモデルが見つかりません（" + lastErr + "）。スクリプト プロパティ OPENAI_MODEL にモデル名を入れてください");
}
// v10：相談・操作（tier=pro）は賢いモデルを先に試し、使えない・回数制限なら Flash に切り替える
const GEMINI_PRO_MODELS = ["gemini-pro-latest", "gemini-3-pro-preview", "gemini-2.5-pro"];
function gemini_(parts, tier) {
  const P = PropertiesService.getScriptProperties(), key = P.getProperty("GEMINI_API_KEY");
  if (!key) throw err_("no_key", "GeminiのAPIキーが未設定です（スクリプト プロパティ GEMINI_API_KEY）");
  const fixed = P.getProperty("GEMINI_MODEL"), list = fixed ? [fixed] : GEMINI_MODELS.slice();
  const last = P.getProperty("GEMINI_OK"); if (!fixed && last) { list.splice(list.indexOf(last), list.indexOf(last) >= 0 ? 1 : 0); list.unshift(last); }
  if (tier === "pro" && P.getProperty("GEMINI_PRO") !== "off") {
    const pro = P.getProperty("GEMINI_PRO_MODEL") ? [P.getProperty("GEMINI_PRO_MODEL")] : GEMINI_PRO_MODELS.slice(), pl = P.getProperty("GEMINI_PRO_OK");
    if (pl && pro.indexOf(pl) > 0) { pro.splice(pro.indexOf(pl), 1); pro.unshift(pl); }
    for (let k = pro.length - 1; k >= 0; k--) list.unshift(pro[k]);
  }
  let lastErr = "", busy = 0;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const res = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent", {
      method: "post", contentType: "application/json", headers: { "x-goog-api-key": key }, muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: "user", parts: parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }),
    });
    const code = res.getResponseCode(), body = res.getContentText();
    if (/pro/.test(m) && code !== 200) { lastErr = m + "：" + code; continue; } // Pro が使えない・混雑・回数制限のときは Flash へ
    if (code === 404 || (code === 400 && /not found|not supported|unknown/i.test(body))) { lastErr = m + "：使えません"; continue; }
    // 混雑（503/500）や回数制限（429）は、少し待って次のモデルで試す
    if (code === 503 || code === 500 || code === 429) { lastErr = m + "：" + (code === 429 ? "回数制限" : "混雑中") + "（" + code + "）"; busy = busy || code; Utilities.sleep(800); continue; }
    if (code !== 200) throw err_("tool_error", "Geminiでエラー（" + code + "）：" + body.slice(0, 200));
    const j = JSON.parse(body), c = (j.candidates || [])[0];
    const text = ((c && c.content && c.content.parts) || []).map(function (p) { return p.text || ""; }).join("");
    if (!text) throw err_("tool_error", "Geminiから返事がありませんでした");
    if (/pro/.test(m)) { if (P.getProperty("GEMINI_PRO_OK") !== m) P.setProperty("GEMINI_PRO_OK", m); }
    else if (P.getProperty("GEMINI_OK") !== m) P.setProperty("GEMINI_OK", m);
    return { text: text, model: m };
  }
  if (busy === 429) throw err_("rate_limited", "Geminiの無料枠の回数制限に達しました。少し時間をおいてください（" + lastErr + "）");
  if (busy) throw err_("busy", "Geminiが混み合っています。少し時間をおいてもう一度試してください（" + lastErr + "）");
  throw err_("tool_error", "使えるGeminiのモデルが見つかりません（" + lastErr + "）。スクリプト プロパティ GEMINI_MODEL にモデル名を入れてください");
}

/* ---------- デンソーの年度カレンダー（フレックス部門）PDFを読み、休日の一覧を返す ----------
   年度ごとにURLが変わる（…calendar-2026-flextime.pdf → …calendar-2027-flextime.pdf）。
   PDFの中身が変わったとき（ハッシュが変わったとき）だけGeminiで読み直し、結果はスクリプトに保存しておく。 */
const DENSO_URLS = [
  "https://www.denso.com/jp/ja/-/media/Global/about-us/corporate-info/profile/profile-doc-calendar-{Y}-flextime.pdf",
  "https://www.denso.com/jp/ja/-/media/global/about-us/corporate-info/profile/profile-doc-calendar-{Y}-flextime.pdf",
];
function workcal_(years, force) {
  const P = PropertiesService.getScriptProperties(), out = [];
  years.slice(0, 3).forEach(function (fy) {
    fy = Number(fy); if (!(fy > 2000 && fy < 2100)) return;
    let res = null, url = "";
    for (let i = 0; i < DENSO_URLS.length && !res; i++) {
      url = DENSO_URLS[i].replace("{Y}", fy);
      try { const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true }); if (r.getResponseCode() === 200 && /pdf/i.test(String(r.getHeaders()["Content-Type"] || r.getHeaders()["content-type"] || "pdf"))) res = r; } catch (x) {}
    }
    if (!res) { out.push({ fy: fy, found: false }); return; }
    const bytes = res.getContent(), hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes));
    const key = "denso:" + fy, cached = P.getProperty(key);
    if (cached && !force) { const c = JSON.parse(cached); if (c.hash === hash) { c.cached = true; out.push(c); return; } }
    const prompt = "これはデンソーの" + fy + "年度カレンダー（フレックス部門）のPDFです。■（塗りつぶし・色付き）の日が休日、各月の（ ）内の数字がその月の稼働日数です。\n" +
      fy + "年4月〜" + (fy + 1) + "年3月の12か月すべてについて、休日の日（土日も含む）をすべて読み取ってください。\n" +
      "次の形のJSONだけを返してください：\n{\"months\":{\"" + fy + "-04\":{\"work_days\":20,\"off\":[4,5,11]}}}\n- off はその月の休日の「日」の数字\n- work_days はPDFに書かれている稼働日数";
    const r = gemini_([{ text: prompt }, { inline_data: { mime_type: "application/pdf", data: Utilities.base64Encode(bytes) } }]);
    let j; try { j = JSON.parse(r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch (x) { throw err_("tool_error", "カレンダーの読み取り結果を解釈できませんでした"); }
    const months = {}, bad = [];
    for (let k = 0; k < 12; k++) {
      const y = k < 9 ? fy : fy + 1, m = ((k + 3) % 12) + 1, ym = y + "-" + ("0" + m).slice(-2), days = new Date(y, m, 0).getDate();
      const src = (j.months || {})[ym] || {}, off = (src.off || []).map(Number).filter(function (d) { return d >= 1 && d <= days; });
      const uniq = off.filter(function (d, i) { return off.indexOf(d) === i; }).sort(function (a, b) { return a - b; });
      const wd = Number(src.work_days) || null, ok = wd != null && days - uniq.length === wd;
      if (!ok) bad.push(ym);
      months[ym] = { off: uniq, work_days: wd, ok: ok };
    }
    const data = { fy: fy, found: true, url: url, hash: hash, at: Date.now(), months: months, bad: bad, model: r.model };
    try { P.setProperty(key, JSON.stringify(data)); } catch (x) {}
    out.push(data);
  });
  return { calendars: out };
}

/* ---------- ログイン確認（Firebase の ID トークンを検証してメールアドレスを得る） ---------- */
function verifyUser_(idToken) {
  if (!idToken) throw err_("needs_reauth", "ログイン情報がありません");
  const cache = CacheService.getScriptCache(), key = "tok:" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const hit = cache.get(key); if (hit) return hit;
  const res = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw err_("needs_reauth", "ログインの確認に失敗しました");
  const u = (JSON.parse(res.getContentText()).users || [])[0];
  const email = String((u && u.email) || "").toLowerCase();
  if (!email) throw err_("needs_reauth", "ログインの確認に失敗しました");
  cache.put(key, email, 600);
  return email;
}

/* ---------- カレンダー操作（アプリ側の呼び方に合わせる） ---------- */
function run_(calId, tool, a) {
  if (tool === "list_events") {
    const r = Calendar.Events.list(calId, {
      timeMin: a.startTime, timeMax: a.endTime, singleEvents: true, orderBy: "startTime",
      maxResults: Math.min(Number(a.pageSize) || 100, 250), timeZone: a.timeZone || "Asia/Tokyo",
    });
    return { events: (r.items || []).map(pick_) };
  }
  if (tool === "create_event") {
    const ev = Calendar.Events.insert(body_(a), calId, { sendUpdates: "none" });
    return pick_(ev);
  }
  if (tool === "update_event") {
    if (!a.eventId) throw err_("tool_error", "eventId がありません");
    try { return pick_(Calendar.Events.patch(body_(a), calId, a.eventId, { sendUpdates: "none" })); }
    catch (x) { throw err_("tool_error", "予定が見つかりません：" + x.message); }
  }
  if (tool === "delete_event") {
    if (!a.eventId) throw err_("tool_error", "eventId がありません");
    try { Calendar.Events.remove(calId, a.eventId, { sendUpdates: "none" }); return { deleted: true }; }
    catch (x) { throw err_("tool_error", "予定が見つかりません：" + x.message); }
  }
  throw err_("tool_error", "未対応の操作：" + tool);
}

function body_(a) {
  const b = {};
  if (a.summary != null) b.summary = a.summary;
  if (a.description != null) b.description = a.description;
  if (a.location != null) b.location = a.location;
  const tz = a.timeZone || "Asia/Tokyo";
  if (a.startTime) b.start = a.allDay ? { date: String(a.startTime).slice(0, 10) } : { dateTime: a.startTime, timeZone: tz };
  if (a.endTime) b.end = a.allDay ? { date: String(a.endTime).slice(0, 10) } : { dateTime: a.endTime, timeZone: tz };
  if (a.allDay && b.start && !b.end) b.end = { date: nextDay_(b.start.date) };
  return b;
}
function nextDay_(d) { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); }
function pick_(e) {
  return { id: e.id, summary: e.summary || "", start: e.start, end: e.end, htmlLink: e.htmlLink || "", recurringEventId: e.recurringEventId || null,
    location: e.location || "", status: e.status || "confirmed", description: e.description || "" };
}
function err_(code, msg) { const x = new Error(msg); x.code = code; return x; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- 最初に一度だけ実行して、カレンダーへのアクセスを許可する ---------- */
function setupTest() {
  const r = Calendar.Events.list(CALENDAR_ID, { maxResults: 3, timeMin: new Date().toISOString(), singleEvents: true, orderBy: "startTime" });
  Logger.log("OK：" + Session.getEffectiveUser().getEmail() + " のカレンダーを読めました（直近 " + (r.items || []).length + " 件）");
}


/* ---------- v6：不具合の報告と利用状況を、Claude が読めるように自分の Google ドライブのスプレッドシートへ書き出す ---------- */
function devsync_(a) {
  const P = PropertiesService.getScriptProperties();
  let ss = null; const id = P.getProperty("DEV_SHEET_ID");
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create("ふたりのリスト 不具合・利用状況（Claude用）"); P.setProperty("DEV_SHEET_ID", ss.getId()); }
  const safe = function (v) { v = v == null ? "" : v; if (typeof v === "string" && /^[=+\-@]/.test(v)) v = "'" + v; return v; };
  const put = function (name, rows) { let sh = ss.getSheetByName(name) || ss.insertSheet(name); sh.clearContents(); if (rows.length) sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows.map(function (r) { return r.map(safe); })); };
  const B = (a.bugs || []).slice(0, 500);
  put("不具合報告", [["id", "日時", "状態", "だれ", "画面", "版", "内容", "Claudeの修正案", "対応内容", "エラー"]].concat(B.map(function (b) { return [b.id, b.at ? new Date(b.at) : "", b.status || "", b.role === "h" ? "夫" : b.role === "w" ? "妻" : "", b.view || "", b.ver || "", b.text || "", b.proposal || "", b.fixNote || "", b.err || ""]; })));
  if (a.usage) put("利用状況", String(a.usage).split("\n").map(function (l) { return [l]; }));
  put("同期", [["最終同期", new Date()], ["不具合の件数", B.length]]);
  ["シート1", "Sheet1"].forEach(function (n) { const sh = ss.getSheetByName(n); if (sh && ss.getSheets().length > 1) { try { ss.deleteSheet(sh); } catch (x) {} } });
  return { ok: true, url: ss.getUrl(), n: B.length };
}


/* ---------- v7：Claude が作った更新を GitHub（rikuouchi-pra/futari）へ直接反映する ----------
 * しくみ：Claude が Google ドライブのフォルダ「ふたりのリスト 配信（Claude）」に deploy-*.json を置く
 *        → ウェブアプリの URL に ?deploy=1 を付けて開いた瞬間に反映（Claude が置いた直後に自分で開く）
 *          予備として installDeployTrigger を実行すると10分ごとにも確認する（なくてもよい）
 *        → 処理したファイルは名前の先頭に「済_」「失敗_」を付け、結果を「配信ログ」シートに残す
 * 準備（1回だけ）：
 *   1) GitHub › Settings › Developer settings › Fine-grained tokens で、リポジトリ rikuouchi-pra/futari だけ・
 *      Contents: Read and write のトークンを作る（有効期限つき推奨）
 *   2) Apps Script › プロジェクトの設定 › スクリプト プロパティに GITHUB_TOKEN として保存（コード・チャットには貼らない）
 *   3) エディタで deployNow を1回実行して許可する（Drive・外部通信の許可。フォルダもこのとき作られる）
 *   4) デプロイ › デプロイを管理 › 編集 › バージョン：新バージョン で更新（URL は変わらない）
 * deploy-*.json の形：
 *   { "message": "v189: …", "branch": "main",
 *     "files": [ { "path": "index.html", "base": "<今のファイルの sha256>", "hunks": [["探す文字列","置き換え"], …], "sha256": "<結果の sha256>" },
 *                { "path": "sw.js", "content": "ファイル全体（小さいファイル用）", "sha256": "…" } ] }
 *   ・base が今の GitHub の中身と違えば何も書かずに失敗（ほかで更新された＝上書き事故を防ぐ）
 *   ・各 hunk の「探す文字列」はちょうど1か所に一致しないと失敗
 *   ・結果の sha256 が合わなければ失敗
 */
const GH_REPO = "rikuouchi-pra/futari";
const DEPLOY_FOLDER = "ふたりのリスト 配信（Claude）";

function installDeployTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "deployNow") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("deployNow").timeBased().everyMinutes(10).create();
  deployFolder_();
  Logger.log("OK：10分ごとに「" + DEPLOY_FOLDER + "」を確認して GitHub に反映します");
}

function deployFolder_() {
  const it = DriveApp.getFoldersByName(DEPLOY_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DEPLOY_FOLDER);
}

function deployNow() {
  deployFolder_();
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return { ok: false, busy: true };
  const done = [];
  try {
    const files = []; const it = deployFolder_().getFiles();
    while (it.hasNext()) { const f = it.next(); if (/^deploy-.*\.json$/.test(f.getName())) files.push(f); }
    files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
    files.forEach(function (f) {
      let res;
      try { res = deployOne_(JSON.parse(f.getBlob().getDataAsString("UTF-8"))); f.setName("済_" + f.getName()); }
      catch (x) { res = { ok: false, error: String((x && x.message) || x) }; f.setName("失敗_" + f.getName()); }
      deployLog_(f.getName(), res); done.push({ file: f.getName(), ok: res.ok, commit: res.commit || "", error: res.error || "" });
    });
  } finally { lock.releaseLock(); }
  return { ok: done.every(function (d) { return d.ok; }), n: done.length, results: done };
}

function gh_(method, path, body) {
  const tok = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!tok) throw new Error("スクリプト プロパティ GITHUB_TOKEN がありません");
  const o = { method: method, muteHttpExceptions: true, headers: { Authorization: "Bearer " + tok, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } };
  if (body) { o.contentType = "application/json"; o.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch("https://api.github.com/repos/" + GH_REPO + path, o);
  const c = r.getResponseCode(); const t = r.getContentText();
  if (c >= 300) throw new Error("GitHub " + method + " " + path + " → " + c + "：" + t.slice(0, 300));
  return JSON.parse(t);
}

function sha256_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(function (b) { return ("0" + (b & 255).toString(16)).slice(-2); }).join("");
}

function deployOne_(d) {
  const branch = d.branch || "main";
  if (d.gas && (!d.files || !d.files.length)) return gasUpdate_(d.gas, d.message);
  if (!d.files || !d.files.length) throw new Error("files が空です");
  const ref = gh_("get", "/git/ref/heads/" + branch);
  const headSha = ref.object.sha;
  const head = gh_("get", "/git/commits/" + headSha);
  const tree = [];
  d.files.forEach(function (f) {
    if (!/^[\w.\-\/]+$/.test(f.path) || f.path.indexOf("..") >= 0) throw new Error("パスが不正：" + f.path);
    let out;
    if (typeof f.content === "string") out = f.content;
    else {
      const cur = gh_("get", "/contents/" + encodeURI(f.path) + "?ref=" + (f.from || headSha));
      const blob = gh_("get", "/git/blobs/" + cur.sha);
      let txt = Utilities.newBlob(Utilities.base64Decode(blob.content.replace(/\n/g, ""))).getDataAsString("UTF-8");
      if (f.base && sha256_(txt) !== f.base) throw new Error(f.path + "：GitHub の今の中身が想定と違います（ほかで更新済み）。何も書いていません");
      (f.hunks || []).forEach(function (h, i) {
        const n = txt.split(h[0]).length - 1;
        if (n !== 1) throw new Error(f.path + " の変更 " + (i + 1) + "：一致 " + n + " か所（1か所のはず）");
        txt = txt.replace(h[0], function () { return h[1]; });
      });
      out = txt;
    }
    if (f.sha256 && sha256_(out) !== f.sha256) throw new Error(f.path + "：結果の確認（sha256）が合いません");
    const b = gh_("post", "/git/blobs", { content: Utilities.base64Encode(out, Utilities.Charset.UTF_8), encoding: "base64" });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: b.sha });
  });
  const nt = gh_("post", "/git/trees", { base_tree: head.tree.sha, tree: tree });
  const cm = gh_("post", "/git/commits", { message: String(d.message || "Update from Claude"), tree: nt.sha, parents: [headSha] });
  gh_("patch", "/git/refs/heads/" + branch, { sha: cm.sha, force: false });
  const out = { ok: true, commit: cm.sha, files: d.files.map(function (f) { return f.path; }) };
  if (d.gas) { const g = gasUpdate_(d.gas, d.message); out.files.push("GAS v" + g.version); out.gas = g; }
  return out;
}

function deployLog_(name, res) {
  const P = PropertiesService.getScriptProperties(); let ss = null; const id = P.getProperty("DEV_SHEET_ID");
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) {} }
  if (!ss) { ss = SpreadsheetApp.create("ふたりのリスト 不具合・利用状況（Claude用）"); P.setProperty("DEV_SHEET_ID", ss.getId()); }
  const sh = ss.getSheetByName("配信ログ") || ss.insertSheet("配信ログ");
  if (!sh.getLastRow()) sh.appendRow(["日時", "ファイル", "結果", "コミット / エラー"]);
  sh.appendRow([new Date(), name, res.ok ? "反映" : "失敗", res.ok ? (res.commit || "") + "（" + res.files.join(", ") + "）" : res.error]);
}


/* ---------- v8：Claude がこの GAS 自身も更新できるようにする（Apps Script API） ----------
 * deploy-*.json に "gas" を入れると：今のコードを取得 → 変更を当てる → 文法チェック → 保存 → 新バージョン → ウェブアプリの公開も更新（URLはそのまま）
 *   "gas": { "file": "Code", "base": "<今の Code の sha256>", "hunks": [["探す","置換"], …], "sha256": "<結果の sha256>" }
 *      または { "file": "Code", "source": "全体", "sha256": "…" }
 * 安全策：base 不一致・文法エラー・sha256 不一致なら何も書かない。更新前のコードはドライブの配信フォルダに「GAS控え_日時.gs」として残す。
 *        壊れたときは エディタで rollbackGas を実行 → 1つ前のバージョンで公開し直す（コードも控えから戻す）
 * 準備（1回だけ）：
 *   1) https://script.google.com/home/usersettings で「Google Apps Script API」をオン
 *   2) プロジェクトの設定 ›「appsscript.json マニフェスト ファイルをエディタで表示する」をオン → appsscript.json を渡した内容に置き換え
 *   3) エディタで deployNow を1回実行して、追加の許可（Apps Script プロジェクトの管理）を承認
 */
function sapi_(method, path, body) {
  const o = { method: method, muteHttpExceptions: true, headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } };
  if (body) { o.contentType = "application/json"; o.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch("https://script.googleapis.com/v1/projects/" + ScriptApp.getScriptId() + path, o);
  const c = r.getResponseCode(), t = r.getContentText();
  if (c >= 300) throw new Error("Apps Script API " + method + " " + path + " → " + c + "：" + t.slice(0, 300) + (c === 403 ? "（usersettings で Apps Script API をオンにしたか確認）" : ""));
  return t ? JSON.parse(t) : {};
}
function deploymentId_() {
  const P = PropertiesService.getScriptProperties().getProperty("DEPLOYMENT_ID"); if (P) return P;
  const m = String(ScriptApp.getService().getUrl() || "").match(/\/s\/([^\/]+)\/exec/);
  if (m) return m[1];
  const L = sapi_("get", "/deployments").deployments || [];
  const w = L.filter(function (d) { return (d.entryPoints || []).some(function (e) { return e.entryPointType === "WEB_APP"; }) && d.deploymentConfig.versionNumber; });
  if (w.length === 1) return w[0].deploymentId;
  throw new Error("ウェブアプリのデプロイIDが分かりません（スクリプト プロパティ DEPLOYMENT_ID に入れてください）");
}
function gasUpdate_(g, message) {
  const name = g.file || "Code";
  const content = sapi_("get", "/content");
  const js = (content.files || []).filter(function (x) { return x.type === "SERVER_JS"; });
  const f = js.filter(function (x) { return x.name === name; })[0] || (js.length === 1 ? js[0] : null);  // 日本語UIでは「コード.gs」の名前でも動く
  if (!f) throw new Error("GAS にファイル " + name + " がありません");
  const before = f.source; let src;
  if (typeof g.source === "string") src = g.source;
  else {
    if (g.base && sha256_(before) !== g.base) throw new Error("GAS の今のコードが想定と違います（エディタで直接変えた？）。何も書いていません");
    src = before;
    (g.hunks || []).forEach(function (h, i) {
      const n = src.split(h[0]).length - 1;
      if (n !== 1) throw new Error("GAS の変更 " + (i + 1) + "：一致 " + n + " か所（1か所のはず）");
      src = src.replace(h[0], function () { return h[1]; });
    });
  }
  if (g.sha256 && sha256_(src) !== g.sha256) throw new Error("GAS：結果の確認（sha256）が合いません");
  try { new Function(src); } catch (x) { throw new Error("GAS：文法エラーのため中止（" + x.message + "）"); }
  const stamp = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd-HHmmss");
  deployFolder_().createFile("GAS控え_" + stamp + ".gs", before, "text/plain");
  f.source = src;
  sapi_("put", "/content", { files: content.files });
  const v = sapi_("post", "/versions", { description: String(message || "Claude").slice(0, 100) });
  const id = deploymentId_();
  const cur = sapi_("get", "/deployments/" + id);
  PropertiesService.getScriptProperties().setProperty("GAS_PREV_VERSION", String(cur.deploymentConfig.versionNumber || ""));
  sapi_("put", "/deployments/" + id, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: v.versionNumber, manifestFileName: "appsscript", description: String(message || "Claude").slice(0, 100) } });
  return { ok: true, version: v.versionNumber };
}
function rollbackGas() {
  const P = PropertiesService.getScriptProperties(), prev = Number(P.getProperty("GAS_PREV_VERSION") || 0);
  if (!prev) throw new Error("戻せる前のバージョンがありません");
  const id = deploymentId_();
  sapi_("put", "/deployments/" + id, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: prev, manifestFileName: "appsscript", description: "rollback" } });
  const it = deployFolder_().getFiles(); let last = null;
  while (it.hasNext()) { const f = it.next(); if (/^GAS控え_/.test(f.getName()) && (!last || f.getName() > last.getName())) last = f; }
  if (last) { const c = sapi_("get", "/content"); const js = c.files.filter(function (x) { return x.type === "SERVER_JS"; }); js.forEach(function (x) { if ((x.name === "Code" || js.length === 1) && x.type === "SERVER_JS") x.source = last.getBlob().getDataAsString("UTF-8"); }); sapi_("put", "/content", { files: c.files }); }
  Logger.log("公開をバージョン " + prev + " に戻しました" + (last ? "（コードも " + last.getName() + " に戻しました）" : ""));
}