/* Device-local diagnostics. Estimates are NOT billing records; no network or document contents are persisted. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FutariFirestoreReads=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const FIELDS=['reads','initial','updates','gets','attaches','cacheDocs','cacheEvents','localEvents','errors','unknown','reused','empty','removed','writes','deletes','writeAttempts','deleteAttempts','writeErrors','deleteErrors','sentBytes','receivedBytes'];
  const NAMES={items:'やること・買い物',events:'ふたりの予定',shifts:'シフト',diary:'日記',comments:'日記コメント',activity:'操作履歴',push:'通知予定',usage:'利用履歴',usageReports:'利用レポート',photos:'写真情報',blobs:'写真本体',blobmeta:'写真一覧',profiles:'プロフィール',aitmp:'AI一時データ',chores:'家事',plans:'長期計画',topics:'話すこと',talks:'話し合い記録',bugs:'改善要望',troubles:'困りごと',cautions:'注意事項',qa:'今日の質問',music:'今日の曲',spend:'支出',recur:'定期支払い',goals:'目標',thanks:'ありがとう',dinner:'夕食',pitems:'自分のタスク',blocks:'自分の予定',gsync:'カレンダー同期',habits:'習慣',reflect:'行動実施',pwish:'自分の希望',vault_w:'個人保管庫'};
  const META={family:'家族名',roles:'家族の担当',history:'買い物履歴',shopSuggestions:'買い物候補',kakei:'家計設定',favorites:'お気に入り',prefs_w:'個人設定'};
  function pathKey(path){const p=String(path||'').split('/').filter(Boolean);if(p[0]==='data'&&p[1]==='users')return p[3]==='private'?'private/'+(NAMES[p[4]]?p[4]:'other'):'private/'+(['prefs','favorites'].includes(p[3])?p[3]:'other');if(p[0]==='meta')return 'meta/'+(META[p[1]]?p[1]:'other');return NAMES[p[0]]?p[0]:'other';}
  function label(key){const p=key.split(':'),kind=p[0],path=p.slice(1).join(':'),parts=path.split('/'),base=path==='recovery'?'復旧確認':path==='legacyAI'?'AI接続サーバー':parts[0]==='private'?'自分：'+(parts[1]==='prefs'?'設定':parts[1]==='favorites'?'お気に入り':NAMES[parts[1]]||'その他'):parts[0]==='meta'?(META[parts[1]]||'共通設定'):NAMES[path]||'その他';return base+' / '+({listen:'自動同期',get:'個別取得',list:'一覧取得',remote:'推定・未確認',write:'書き込み',delete:'削除'}[kind]||kind);}
  const zero=()=>Object.fromEntries(FIELDS.map(k=>[k,0]));
  const add=(a,b)=>{for(const k of FIELDS)a[k]+=(Number.isSafeInteger(b[k])&&b[k]>0?b[k]:0);return a;};
  const docs=(s,col)=>col?s.docs:(s.exists()?[s]:[]);
  function hash(value){const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36)+':'+s.length;}
  const utf8=s=>new TextEncoder().encode(String(s)).length;
  function valueSize(v){
    if(v==null||typeof v==='boolean')return 1;
    if(typeof v==='number'||v instanceof Date||v&&typeof v.toMillis==='function')return 8;
    if(typeof v==='string')return utf8(v)+1;
    if(v&&typeof v.toUint8Array==='function')return v.toUint8Array().byteLength;
    if(v instanceof Uint8Array)return v.byteLength;
    if(v&&typeof v.latitude==='number'&&typeof v.longitude==='number')return 16;
    if(v&&v.firestore&&typeof v.path==='string')return nameSize(v.path);
    if(Array.isArray(v))return v.reduce((n,x)=>n+valueSize(x),0);
    return Object.entries(v||{}).reduce((n,[k,x])=>n+utf8(k)+1+valueSize(x),32);
  }
  function nameSize(path){return String(path).split('/').reduce((n,x)=>n+utf8(x)+1,16);}
  function docSize(path,v){return nameSize(path)+valueSize(v);}
  function shape(v,depth=0){let maxField=0,maxDepth=depth;if(v&&typeof v==='object'&&!v.toMillis&&!v.toUint8Array&&!v.firestore){for(const x of Object.values(v)){maxField=Math.max(maxField,valueSize(x));if(x&&typeof x==='object'&&!x.toMillis&&!x.toUint8Array&&!x.firestore){const sub=shape(x,depth+1);maxDepth=Math.max(maxDepth,sub.maxDepth);maxField=Math.max(maxField,sub.maxField);}}}return {maxField,maxDepth};}
  function create(o){
    const clock=o.clock||Date.now,storage=o.storage,dayWindow=o.dayWindow,prefix='futari.reads.v1:'+o.project+':'+o.user+':',session=o.session||clock().toString(36)+'-'+Math.random().toString(36).slice(2),key=prefix+session;
    let data={schema:1,startedAt:clock(),updatedAt:clock(),buckets:{}},timer=null,dirty=false,storageError=false;
    const active=new Map(),known=new Map();let maxRequest=0,browserStorage={status:"unavailable"};
    function schedule(){if(timer===null)timer=(o.setTimeout||setTimeout)(()=>{timer=null;flush();if(o.onChange)o.onChange();},1500);}
    function record(process,values){
      const now=clock(),day=dayWindow(now).start,version=String(typeof o.version==='function'?o.version():o.version||'unknown'),id=day+'|'+version;
      let b=data.buckets[id];if(!b)b=data.buckets[id]={day,version,first:now,last:now,rows:{}};b.last=now;
      if(!b.rows[process])b.rows[process]=zero();add(b.rows[process],values);data.updatedAt=now;dirty=true;schedule();
    }
    function flush(){
      if(!dirty)return;const cutoff=dayWindow(clock()).start-40*86400000;
      for(const k of Object.keys(data.buckets))if(data.buckets[k].day<cutoff)delete data.buckets[k];
      try{if(storage.unavailable)throw Error("storage unavailable");storage.setItem(key,JSON.stringify(data));dirty=false;storageError=false;}catch(_){storageError=true;}
    }
    function load(){
      const result=[data],cutoff=dayWindow(clock()).start-40*86400000;
      try{if(storage.unavailable)throw Error("storage unavailable");for(let i=storage.length-1;i>=0;i--){const k=storage.key(i);if(!k||!k.startsWith(prefix)||k===key)continue;try{const d=JSON.parse(storage.getItem(k));if(!d||d.schema!==1||!d.buckets)continue;if(d.updatedAt<cutoff){storage.removeItem(k);continue;}result.push(d);}catch(_){}}}catch(_){storageError=true;}
      return result;
    }
    function snapshot(days){
      days=days===7?7:1;let start=dayWindow(clock()).start;for(let i=1;i<days;i++)start=dayWindow(start-1).start;
      const rows=Object.create(null),versions=Object.create(null),total=zero(),daily=Object.create(null);let first=null,last=null;
      for(const d of load())for(const b of Object.values(d.buckets)){if(!Number.isFinite(b.day)||b.day<start||b.day>clock()||!b.rows)continue;first=first===null?b.first:Math.min(first,b.first);last=Math.max(last||0,b.last);const v=String(b.version).slice(0,24);if(!versions[v])versions[v]={version:v,...zero()};for(const [p,r] of Object.entries(b.rows)){if(!rows[p])rows[p]={process:p,label:label(p),...zero()};add(rows[p],r);add(total,r);add(versions[v],r);if(!daily[b.day])daily[b.day]={day:b.day,...zero()};add(daily[b.day],r);}}
      const sorted=Object.values(rows).sort((a,b)=>b.reads-a.reads||b.errors-a.errors||a.process.localeCompare(b.process));
      for(const r of sorted){r.share=total.reads?Math.round(r.reads/total.reads*1000)/10:0;r.active=active.get(r.process)||0;r.hints=hints(r);}
      return {capacity:capacity(),browserStorage,trend:Object.values(daily).sort((a,b)=>a.day-b.day),month:monthUsage(),schema:1,scope:'このブラウザ・このアカウント（複数タブを合計）',days,start,end:clock(),first,last,storageError,total,rows:sorted,versions:Object.values(versions).sort((a,b)=>Number(b.version)-Number(a.version)),active:[...active.values()].reduce((a,b)=>a+b,0),notes:['サーバー由来の受信件数からの推定。請求件数ではありません。','初回・明示的な再接続時は受信全件を計上するため、キャッシュ再開時は過大になる場合があります。','通信中の再接続、権限ルール・インデックスの内部読取、他端末、サーバー単独処理は正確に計測できません。','本文・写真・文書IDは診断に保存しません。集計日はFirestoreと同じ太平洋時間。直近40日分を保持します。書込・削除はサーバー応答の成功件数です。受信サイズは文書サイズの推定で通信量とは一致しません。']};
    }
    function hints(r){const a=[];if(r.errors)a.push('失敗あり：再試行頻度と接続状態を確認');if(r.initial>=100&&r.initial>=r.reads*.6)a.push('初回取得が多い：対象期間・件数の絞り込みを検討');if(r.updates>=100&&r.updates>=r.reads*.5)a.push('更新が多い：不要な書込・常時監視の範囲を確認');if(r.gets>=10&&r.reads>=10)a.push('個別取得が多い：キャッシュ再利用を検討');if(r.unknown)a.push('件数不明の通信あり：サーバー側の確認が必要');if(r.reused)a.push('同時取得の共用が有効');if(r.writes>=50)a.push('書込が多い：自動保存の間隔・変更のない保存を確認');if(r.deletes>=50)a.push('削除が多い：一時データや履歴の整理頻度を確認');if(r.sentBytes>=1048576||r.receivedBytes>=1048576)a.push('データ量が多い：写真圧縮・取得範囲の縮小を検討');return a;}
    function process(path,col){return (col?'list:':'get:')+pathKey(path);}
    function observe(path,value){
      if(value===null){known.delete(path);return 0;}
      const bytes=docSize(path,value);known.set(path,{group:pathKey(path),bytes,...shape(value)});return bytes;
    }
    function observeSnapshot(path,col,s,partial){
      const a=docs(s,col);if(col&&!partial){const paths=new Set(a.map(d=>path+'/'+d.id));for(const k of known.keys())if(k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&!paths.has(k))known.delete(k);}
      if(!col&&!a.length)known.delete(path);
      return a.reduce((n,d)=>n+observe(col?path+'/'+d.id:path,d.data()),0);
    }
    function capacity(){const rows=Object.create(null);let bytes=0,maxDoc=0,maxField=0,maxDepth=0;for(const x of known.values()){bytes+=x.bytes;maxDoc=Math.max(maxDoc,x.bytes);maxField=Math.max(maxField,x.maxField);maxDepth=Math.max(maxDepth,x.maxDepth);if(!rows[x.group])rows[x.group]={group:x.group,label:label('get:'+x.group).replace(' / 個別取得',''),bytes:0,docs:0};rows[x.group].bytes+=x.bytes;rows[x.group].docs++;}return {bytes,docs:known.size,maxDoc,maxField,maxDepth,maxRequest,rows:Object.values(rows).sort((a,b)=>b.bytes-a.bytes),scope:'このタブで確認できた文書のみ。未取得文書・インデックスを含まない推定値'};}
    function monthUsage(){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'}),month=f.format(new Date(clock()));let bytes=0;for(const d of load())for(const b of Object.values(d.buckets)){if(b.day<=clock()&&f.format(new Date(b.day))===month)for(const r of Object.values(b.rows))bytes+=Number(r.receivedBytes)||0;}return {label:month,receivedBytes:bytes};}
    function browserEstimate(v){browserStorage=v&&Number.isFinite(v.usage)&&Number.isFinite(v.quota)&&v.quota>0?{status:'available',usage:v.usage,quota:v.quota,at:clock()}:{status:'unavailable'};if(o.onChange)o.onChange();}
    async function write(path,kind,value,fn){
      const p=(kind==='delete'?'delete:':'write:')+pathKey(path),del=kind==='delete',prior=known.get(path);let bytes=0;
      try{bytes=del?nameSize(path):docSize(path,value);maxRequest=Math.max(maxRequest,bytes);record(p,{[del?'deleteAttempts':'writeAttempts']:1,sentBytes:bytes});}catch(_){}
      let result;try{result=await fn();}catch(e){try{record(p,{errors:1,[del?'deleteErrors':'writeErrors']:1});}catch(_){}throw e;}
      try{record(p,{[del?'deletes':'writes']:1});if(del)known.delete(path);else if(known.get(path)===prior){if(kind==='set')observe(path,value);else known.delete(path);}}catch(_){}
      return result;
    }
    async function get(path,col,fn,tag,partial){const p=tag||process(path,col);record(p,{gets:1});try{const s=await fn(),n=docs(s,col).length,m=s.metadata||{};let bytes=0;try{bytes=observeSnapshot(path,col,s,partial);}catch(_){}if(m.fromCache)record(p,{cacheEvents:1,cacheDocs:n});else if(m.hasPendingWrites)record(p,{localEvents:1});else record(p,{reads:Math.max(1,n),receivedBytes:bytes,empty:n===0?1:0});return s;}catch(e){record(p,{errors:1,unknown:1});throw e;}}
    function listener(path,col,partial){
      const p='listen:'+pathKey(path);let baseline=null,lastSeen=null,firstServer=true,closed=false;
      record(p,{attaches:1});active.set(p,(active.get(p)||0)+1);
      return {snapshot(s){
        const a=docs(s,col),m=s.metadata||{};let next;try{if(lastSeen&&col&&typeof s.docChanges==='function'){for(const c of s.docChanges()){if(c.type!=='removed'||!partial)observe(path+'/'+c.doc.id,c.type==='removed'?null:c.doc.data());}}else observeSnapshot(path,col,s,partial);}catch(_){}
        if(lastSeen&&col&&typeof s.docChanges==='function'){next=new Map(lastSeen);for(const c of s.docChanges()){if(c.type==='removed')next.delete(c.doc.id);else next.set(c.doc.id,hash(c.doc.data()));}}
        else next=new Map(a.map(d=>[d.id,hash(d.data())]));
        const changed=lastSeen===null||next.size!==lastSeen.size||[...next].some(([k,v])=>lastSeen.get(k)!==v);lastSeen=next;
        if(m.fromCache){record(p,{cacheEvents:1,cacheDocs:a.length});return changed;}
        if(m.hasPendingWrites){record(p,{localEvents:1});return changed;}
        const confirmation=firstServer;
        if(firstServer){const n=Math.max(1,a.length);record(p,{reads:n,initial:n,receivedBytes:a.reduce((v,d)=>v+docSize(col?path+'/'+d.id:path,d.data()),0),empty:a.length===0?1:0});firstServer=false;}
        else{let n=0,removed=0,receivedBytes=0;const changedIds=new Set();for(const [k,v] of next)if(!baseline.has(k)||baseline.get(k)!==v){n++;changedIds.add(k);}for(const d of a)if(changedIds.has(d.id))receivedBytes+=docSize(col?path+'/'+d.id:path,d.data());for(const k of baseline.keys())if(!next.has(k))removed++;if(n||removed)record(p,{reads:n,updates:n,removed,receivedBytes});}
        baseline=next;return changed||confirmation;
      },error(){record(p,{errors:1,unknown:1});},close(){if(closed)return;closed=true;active.set(p,Math.max(0,(active.get(p)||0)-1));}};
    }
    function reused(path,col){record(process(path,col),{reused:1});}
    function remoteAttempt(){record('remote:legacyAI',{gets:1,unknown:1});}
    function exportData(){
      const daily=Object.create(null),s=snapshot(7);
      for(const d of load())for(const b of Object.values(d.buckets)){if(!Number.isFinite(b.day)||b.day<s.start||b.day>clock()||!b.rows)continue;const k=b.day+'|'+b.version;if(!daily[k])daily[k]={dayStart:b.day,version:String(b.version),rows:Object.create(null)};for(const [p,r] of Object.entries(b.rows)){if(!daily[k].rows[p])daily[k].rows[p]=zero();add(daily[k].rows[p],r);}}
      return {exportedAt:new Date(clock()).toISOString(),...s,daily:Object.values(daily)};
    }
    return {get,write,listener,reused,remoteAttempt,record,snapshot,flush,browserEstimate,export:exportData};
  }
  function singleFlight(){const jobs=new Map();return function(key,fn,reuse){if(jobs.has(key)){if(reuse)reuse();return jobs.get(key);}const p=Promise.resolve().then(fn).finally(()=>jobs.delete(key));jobs.set(key,p);return p;};}
  return {create,pathKey,label,singleFlight,docSize,valueSize};
});
