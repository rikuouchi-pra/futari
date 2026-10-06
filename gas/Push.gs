/* Web Push backend v11. Payload-free RFC 8030 push wakes the service worker;
 * notification text is read from a device-secret-protected inbox over HTTPS.
 * No Firebase bearer token is persisted. All device data stays in the owner's Drive.
 */
const PUSH_PREFIX_ = 'FUTARI_PUSH_DEVICE_';
function pushBytes_(a) { return Uint8Array.from(a, function (x) { return x & 255; }); }
function pushB64_(a) { return Utilities.base64EncodeWebSafe(Array.from(a, function(x) { return x > 127 ? x - 256 : x; })).replace(/=+$/, ''); }
function pushHash_(s) { return pushBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function pushId_(s) { return pushB64_(pushHash_(String(s))); }
function pushLocked_(fn) { const l=LockService.getScriptLock(); if(!l.tryLock(20000)) throw err_('busy','通知処理が混み合っています。少し待って再試行してください'); try{return fn();}finally{l.releaseLock();} }
function pushKeys_() {
  const p=PropertiesService.getScriptProperties(); let k=p.getProperty('FUTARI_PUSH_VAPID_PRIVATE');
  if(!k) throw err_('push_not_ready','通知サーバーの初期設定がまだ完了していません');
  const secret=pushBytes_(Utilities.base64DecodeWebSafe(k));
  return {secret:secret,key:pushB64_(FutariP256.publicKey(secret))};
}
function pushFolder_() {
  const p=PropertiesService.getScriptProperties(), id=p.getProperty('FUTARI_PUSH_FOLDER');
  if(id)return DriveApp.getFolderById(id);
  const f=DriveApp.createFolder('ふたりのリスト 通知サーバー');p.setProperty('FUTARI_PUSH_FOLDER',f.getId());return f;
}
function pushRead_(dev) {
  const id=PropertiesService.getScriptProperties().getProperty(PUSH_PREFIX_+dev);
  return id?JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8')):null;
}
function pushWrite_(dev,d) {
  const p=PropertiesService.getScriptProperties(), id=p.getProperty(PUSH_PREFIX_+dev), s=JSON.stringify(d);
  if(s.length>180000)throw err_('push_limit','通知予定の容量を超えました');
  if(id)DriveApp.getFileById(id).setContent(s);
  else {if(pushDevices_().length>=16)throw err_('push_limit','通知端末の登録数が上限に達しました');const f=pushFolder_().createFile(dev+'.json',s,MimeType.PLAIN_TEXT);p.setProperty(PUSH_PREFIX_+dev,f.getId());}
}
function pushDevices_(){const p=PropertiesService.getScriptProperties().getProperties();return Object.keys(p).filter(function(k){return k.indexOf(PUSH_PREFIX_)===0;}).map(function(k){return k.slice(PUSH_PREFIX_.length);});}
function pushDevCheck_(dev){if(!/^d[A-Za-z0-9_-]{12,90}$/.test(String(dev||'')))throw err_('push_device','通知端末が正しくありません');return String(dev);}
function pushOrigin_(endpoint) {
  const m=String(endpoint||'').match(/^https:\/\/([a-z0-9.-]+)(\/[^\s#]*)$/i);
  if(!m||endpoint.length>4096||!(/^(web\.push\.apple\.com|fcm\.googleapis\.com|(?:[a-z0-9-]+\.)?push\.services\.mozilla\.com)$/i.test(m[1])))throw err_('push_endpoint','この通知サービスは利用できません');
  return 'https://'+m[1].toLowerCase();
}
function pushIdentity_(token,email){
  const r=UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+FIREBASE_API_KEY,{method:'post',contentType:'application/json',payload:JSON.stringify({idToken:token}),muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw err_('needs_reauth','ログインし直してください');
  const u=(JSON.parse(r.getContentText()).users||[])[0];
  if(!u||!u.localId||String(u.email||'').toLowerCase()!==email)throw err_('needs_reauth','ログインを確認できませんでした');return String(u.localId);
}
function pushDoc_(path,token){
  const r=UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/'+FIREBASE_PROJECT_ID+'/databases/(default)/documents/'+path,{headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw err_('push_data','通知データを読み込めませんでした（'+r.getResponseCode()+'）');
  const f=JSON.parse(r.getContentText()).fields||{},s=f.json&&f.json.stringValue;
  if(!s||s.length>160000)throw err_('push_data','通知データが正しくありません');return JSON.parse(s);
}
function pushMessages_(list,role,immediate){
  const now=Date.now();return (Array.isArray(list)?list:[]).slice(0,120).filter(function(m){return m&&typeof m.id==='string'&&m.id.length<=240&&Array.isArray(m.roles)&&m.roles.indexOf(role)>=0&&(immediate?m.kind==='add':['ev','am','pm'].indexOf(m.kind)>=0)&& (immediate||(Number.isFinite(m.at)&&m.at>=now-900000&&m.at<=now+172800000));}).map(function(m){return {id:m.id,at:immediate?now:m.at,kind:m.kind,t:String(m.t||'ふたりのリスト').slice(0,160),b:String(m.b||'').slice(0,800)};});
}
function pushPrune_(d){const now=Date.now();d.sent=d.sent||{};Object.keys(d.sent).forEach(function(k){if(d.sent[k]<now-259200000)delete d.sent[k];});d.inbox=(d.inbox||[]).filter(function(m){return m.at>=now-86400000;}).slice(-4);d.now=(d.now||[]).filter(function(m){return m.at>=now-900000;}).slice(-30);return d;}
function pushJwt_(origin){
  const p=PropertiesService.getScriptProperties(),key='FUTARI_PUSH_JWT_'+pushId_(origin).slice(0,16),now=Math.floor(Date.now()/1000);let old;
  try{old=JSON.parse(p.getProperty(key)||'null');}catch(e){}
  if(old&&old.refresh>now)return old.auth;
  const keys=pushKeys_(), enc=function(x){return pushB64_(pushBytes_(Utilities.newBlob(JSON.stringify(x)).getBytes()));};
  const data=enc({typ:'JWT',alg:'ES256'})+'.'+enc({aud:origin,exp:now+43200,sub:'https://rikuouchi-pra.github.io/futari/'});
  const auth='vapid t='+data+'.'+pushB64_(FutariP256.sign(pushHash_(data),keys.secret))+', k='+keys.key;
  p.setProperty(key,JSON.stringify({refresh:now+21600,auth:auth}));return auth;
}
function pushDispatch_(dev,force){
  const batch=pushLocked_(function(){const d=pushRead_(dev);if(!d||!d.on)return null;pushPrune_(d);const now=Date.now();
    if(d.inflight>now||(!force&&d.retryAt>now))return null;
    const seen={},list=[].concat(d.now||[],d.shared||[],d.priv||[]).filter(function(m){const k=pushId_(m.id);if(seen[k]||d.sent[k]||m.at>now||m.at<now-900000||(d.off||[]).indexOf(m.kind)>=0)return false;seen[k]=true;return true;}).sort(function(a,b){return a.at-b.at;}).slice(-4);
    if(!list.length)return null;const ids=list.map(function(m){return m.id;});d.inbox=d.inbox.filter(function(m){return ids.indexOf(m.id)<0;}).concat(list).slice(-4);d.inflight=now+120000;pushWrite_(dev,d);return {endpoint:d.endpoint,list:list};});
  if(!batch)return {sent:0};let status=0;
  try{const r=UrlFetchApp.fetch(batch.endpoint,{method:'post',headers:{Authorization:pushJwt_(pushOrigin_(batch.endpoint)),TTL:'300',Urgency:'normal'},payload:'',followRedirects:false,muteHttpExceptions:true});status=r.getResponseCode();}catch(e){status=0;}
  pushLocked_(function(){const d=pushRead_(dev);if(!d)return;d.inflight=0;d.lastStatus=status;d.lastAttempt=Date.now();if(status>=200&&status<300){batch.list.forEach(function(m){d.sent[pushId_(m.id)]=Date.now();});d.now=(d.now||[]).filter(function(m){return !d.sent[pushId_(m.id)];});d.retryAt=0;}else{d.retryAt=Date.now()+300000;if(status===404||status===410){d.on=false;d.inbox=[];d.shared=[];d.priv=[];d.now=[];}}pushWrite_(dev,d);});
  if(status<200||status>=300)throw err_('push_send',status===404||status===410?'端末の通知登録が期限切れです。通知登録を確認・修復してください':'通知サービスへの送信に失敗しました（'+(status||'通信エラー')+'）');
  return {sent:1};
}
function push_(token,email,a){
  const pos=AI_USERS.map(function(s){return s.toLowerCase();}).indexOf(email);if(pos<0)throw err_('not_granted','登録されたふたりだけが使えます');
  if(a.op==='key')return {key:pushKeys_().key,v:11};
  const dev=pushDevCheck_(a.dev),uid=pushIdentity_(token,email),role=pos===0?'h':'w';
  if(a.op==='off')return pushLocked_(function(){const d=pushRead_(dev);if(d&&d.uid!==uid)throw err_('not_granted','この端末の通知は変更できません');if(d)pushWrite_(dev,{uid:uid,role:role,on:false,at:Date.now(),sent:{}});return {ok:true};});
  if(a.op!=='sync'&&a.op!=='test')throw err_('push_op','未対応の通知操作です');
  const path='data/users/'+uid+'/private/push/'+dev;if(a.ppath!==path)throw err_('not_granted','本人の通知データだけを登録できます');
  const sh=pushDoc_('push/'+dev,token),pr=pushDoc_(path,token);if(!sh.on||!sh.sub)throw err_('push_data','通知登録が無効です');pushOrigin_(sh.sub.endpoint);
  if(!/^[A-Za-z0-9_-]{40,160}$/.test(String(pr.sec||'')))throw err_('push_data','端末の確認情報が正しくありません');
  const jobs=pushLocked_(function(){let d=pushRead_(dev);if(d&&d.uid!==uid)throw err_('not_granted','この端末の通知は変更できません');
    d=pushPrune_(d||{uid:uid,sent:{}});if(a.op==='test'&&d.lastTest>Date.now()-10000)throw err_('push_rate','テスト通知は10秒以上あけてください');
    Object.assign(d,{uid:uid,role:role,on:true,endpoint:sh.sub.endpoint,secHash:pushId_(pr.sec),at:Date.now(),off:(Array.isArray(sh.off)?sh.off:[]).filter(function(k){return ['ev','am','pm','add'].indexOf(k)>=0;}),shared:pushMessages_(sh.shared,role,false),priv:pushMessages_(pr.priv,role,false)});
    if(a.op==='test'){d.lastTest=Date.now();d.now.push({id:'test:'+Utilities.getUuid(),at:Date.now(),kind:'test',t:'ふたりのリスト・テスト通知',b:'通知の設定ができました。予定の前にもお知らせします。'});}
    pushWrite_(dev,d);const out=[dev];
    pushDevices_().filter(function(id){return id!==dev;}).forEach(function(id){const other=pushRead_(id);if(!other||!other.on)return;pushPrune_(other);
      // Common shared schedules can be refreshed by either partner; personal recurring schedules stay with their owner.
      const incoming=pushMessages_(sh.shared,other.role,false);other.shared=incoming.concat((other.shared||[]).filter(function(m){return other.role!==role&&m.id.indexOf('timed:')===0&&!incoming.some(function(x){return x.id===m.id;});}));
      const added=other.role===role?[]:pushMessages_(sh.now,other.role,true);const had={};other.now=(other.now||[]).concat(added).filter(function(m){const k=pushId_(m.id);if(had[k]||other.sent[k])return false;had[k]=true;return true;}).slice(-30);pushWrite_(id,other);if(added.length)out.push(id);
    });return out;});
  let sent=0,selfSent=0;for(let i=0;i<jobs.length;i++){try{const n=pushDispatch_(jobs[i],a.op==='test'&&jobs[i]===dev).sent;sent+=n;if(jobs[i]===dev)selfSent+=n;}catch(e){if(jobs[i]===dev&&a.op==='test')throw e;}}
  return {ok:true,sent:a.op==='test'?selfSent:sent,scheduled:true,v:11};
}
function pushInbox_(dev,sec){
  try{pushDevCheck_(dev);if(!/^[A-Za-z0-9_-]{40,160}$/.test(String(sec||'')))return {list:[]};return pushLocked_(function(){const d=pushRead_(dev);if(!d||!d.on||!d.secHash)return {list:[]};const hash=pushId_(sec);let diff=hash.length^d.secHash.length;for(let i=0;i<hash.length;i++)diff|=hash.charCodeAt(i)^d.secHash.charCodeAt(i);if(diff)return {list:[]};pushPrune_(d);const list=d.inbox.map(function(m){return {id:m.id,t:m.t,b:m.b,u:'https://rikuouchi-pra.github.io/futari/'};});d.inbox=[];d.lastRead=Date.now();pushWrite_(dev,d);return {list:list};});}catch(e){return {list:[]};}
}
function sendPushReminders(){let sent=0,failed=0;pushDevices_().forEach(function(dev){try{sent+=pushDispatch_(dev,false).sent;}catch(e){failed++;}});PropertiesService.getScriptProperties().setProperty('FUTARI_PUSH_LAST_RUN',JSON.stringify({at:Date.now(),sent:sent,failed:failed}));return {sent:sent,failed:failed};}
function setupPushNotifications(){
  pushLocked_(function(){const p=PropertiesService.getScriptProperties();if(!p.getProperty('FUTARI_PUSH_VAPID_PRIVATE')){
    // Seed includes the platform-issued cryptographic OAuth secret; UUIDs add unique, unlogged entropy.
    const bytes=pushHash_(ScriptApp.getOAuthToken()+':'+Utilities.getUuid()+':'+Utilities.getUuid()+':'+Utilities.getUuid());
    FutariP256.publicKey(bytes);p.setProperty('FUTARI_PUSH_VAPID_PRIVATE',pushB64_(bytes));}
    pushFolder_();if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='sendPushReminders';}))ScriptApp.newTrigger('sendPushReminders').timeBased().everyMinutes(5).create();});
  testPushBackend();Logger.log('通知サーバーの準備完了：5分ごとに確認します。アプリの「この端末の通知を準備」から登録してください。');
}
function testPushBackend(){
  const k=pushKeys_(),hash=pushHash_('futari-webpush-self-test-v11'),sig=FutariP256.sign(hash,k.secret);
  if(!FutariP256.verify(sig,hash,pushBytes_(Utilities.base64DecodeWebSafe(k.key))))throw new Error('VAPID signature verification failed');
  if(pushOrigin_('https://web.push.apple.com/test')!=='https://web.push.apple.com')throw new Error('Endpoint validation failed');
  Logger.log('OK：VAPID署名・公開鍵形式・通知サービス検証');return {ok:true,key:k.key,v:11};
}
function pushServerStatus(){const p=PropertiesService.getScriptProperties();Logger.log(JSON.stringify({v:11,ready:!!p.getProperty('FUTARI_PUSH_VAPID_PRIVATE'),trigger:ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='sendPushReminders';}),devices:pushDevices_().map(function(dev){const d=pushRead_(dev);return {on:d.on,role:d.role,scheduled:(d.shared||[]).length+(d.priv||[]).length,lastStatus:d.lastStatus||0,lastRead:d.lastRead||0};}),lastRun:JSON.parse(p.getProperty('FUTARI_PUSH_LAST_RUN')||'null')}));}
