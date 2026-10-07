/* Device-local diagnostics. Estimates are NOT billing records; no network or document contents are persisted. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FutariFirestoreReads=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const FIELDS=['reads','initial','updates','gets','attaches','cacheDocs','cacheEvents','localEvents','errors','unknown','reused','empty','removed'];
  const NAMES={items:'やること・買い物',events:'ふたりの予定',shifts:'シフト',diary:'日記',comments:'日記コメント',activity:'操作履歴',usage:'利用履歴',usageReports:'利用レポート',photos:'写真情報',blobs:'写真本体',blobmeta:'写真一覧',profiles:'プロフィール',aitmp:'AI一時データ',chores:'家事',plans:'長期計画',topics:'話すこと',talks:'話し合い記録',bugs:'改善要望',troubles:'困りごと',cautions:'注意事項',qa:'今日の質問',music:'今日の曲',spend:'支出',recur:'定期支払い',goals:'目標',thanks:'ありがとう',dinner:'夕食',pitems:'自分のタスク',blocks:'自分の予定',gsync:'カレンダー同期',habits:'習慣',reflect:'行動実施',pwish:'自分の希望',vault_w:'個人保管庫'};
  const META={family:'家族名',roles:'家族の担当',history:'買い物履歴',shopSuggestions:'買い物候補',kakei:'家計設定',favorites:'お気に入り',prefs_w:'個人設定'};
  function pathKey(path){const p=String(path||'').split('/').filter(Boolean);if(p[0]==='data'&&p[1]==='users')return p[3]==='private'?'private/'+(NAMES[p[4]]?p[4]:'other'):'private/'+(['prefs','favorites'].includes(p[3])?p[3]:'other');if(p[0]==='meta')return 'meta/'+(META[p[1]]?p[1]:'other');return NAMES[p[0]]?p[0]:'other';}
  function label(key){const p=key.split(':'),kind=p[0],path=p.slice(1).join(':'),parts=path.split('/'),base=path==='recovery'?'復旧確認':path==='legacyAI'?'AI接続サーバー':parts[0]==='private'?'自分：'+(parts[1]==='prefs'?'設定':parts[1]==='favorites'?'お気に入り':NAMES[parts[1]]||'その他'):parts[0]==='meta'?(META[parts[1]]||'共通設定'):NAMES[path]||'その他';return base+' / '+({listen:'自動同期',get:'個別取得',list:'一覧取得',remote:'推定・未確認'}[kind]||kind);}
  const zero=()=>Object.fromEntries(FIELDS.map(k=>[k,0]));
  const add=(a,b)=>{for(const k of FIELDS)a[k]+=(Number.isSafeInteger(b[k])&&b[k]>0?b[k]:0);return a;};
  const docs=(s,col)=>col?s.docs:(s.exists()?[s]:[]);
  function hash(value){const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36)+':'+s.length;}
  function create(o){
    const clock=o.clock||Date.now,storage=o.storage,dayWindow=o.dayWindow,prefix='futari.reads.v1:'+o.project+':'+o.user+':',session=o.session||clock().toString(36)+'-'+Math.random().toString(36).slice(2),key=prefix+session;
    let data={schema:1,startedAt:clock(),updatedAt:clock(),buckets:{}},timer=null,dirty=false,storageError=false;
    const active=new Map();
    function schedule(){if(timer===null)timer=(o.setTimeout||setTimeout)(()=>{timer=null;flush();if(o.onChange)o.onChange();},1500);}
    function record(process,values){
      const now=clock(),day=dayWindow(now).start,version=String(typeof o.version==='function'?o.version():o.version||'unknown'),id=day+'|'+version;
      let b=data.buckets[id];if(!b)b=data.buckets[id]={day,version,first:now,last:now,rows:{}};b.last=now;
      if(!b.rows[process])b.rows[process]=zero();add(b.rows[process],values);data.updatedAt=now;dirty=true;schedule();
    }
    function flush(){
      if(!dirty)return;const cutoff=dayWindow(clock()).start-14*86400000;
      for(const k of Object.keys(data.buckets))if(data.buckets[k].day<cutoff)delete data.buckets[k];
      try{if(storage.unavailable)throw Error("storage unavailable");storage.setItem(key,JSON.stringify(data));dirty=false;storageError=false;}catch(_){storageError=true;}
    }
    function load(){
      const result=[data],cutoff=dayWindow(clock()).start-14*86400000;
      try{if(storage.unavailable)throw Error("storage unavailable");for(let i=storage.length-1;i>=0;i--){const k=storage.key(i);if(!k||!k.startsWith(prefix)||k===key)continue;try{const d=JSON.parse(storage.getItem(k));if(!d||d.schema!==1||!d.buckets)continue;if(d.updatedAt<cutoff){storage.removeItem(k);continue;}result.push(d);}catch(_){}}}catch(_){storageError=true;}
      return result;
    }
    function snapshot(days){
      days=days===7?7:1;let start=dayWindow(clock()).start;for(let i=1;i<days;i++)start=dayWindow(start-1).start;
      const rows=Object.create(null),versions=Object.create(null),total=zero();let first=null,last=null;
      for(const d of load())for(const b of Object.values(d.buckets)){if(!Number.isFinite(b.day)||b.day<start||b.day>clock()||!b.rows)continue;first=first===null?b.first:Math.min(first,b.first);last=Math.max(last||0,b.last);const v=String(b.version).slice(0,24);if(!versions[v])versions[v]={version:v,...zero()};for(const [p,r] of Object.entries(b.rows)){if(!rows[p])rows[p]={process:p,label:label(p),...zero()};add(rows[p],r);add(total,r);add(versions[v],r);}}
      const sorted=Object.values(rows).sort((a,b)=>b.reads-a.reads||b.errors-a.errors||a.process.localeCompare(b.process));
      for(const r of sorted){r.share=total.reads?Math.round(r.reads/total.reads*1000)/10:0;r.active=active.get(r.process)||0;r.hints=hints(r);}
      return {schema:1,scope:'このブラウザ・このアカウント（複数タブを合計）',days,start,end:clock(),first,last,storageError,total,rows:sorted,versions:Object.values(versions).sort((a,b)=>Number(b.version)-Number(a.version)),active:[...active.values()].reduce((a,b)=>a+b,0),notes:['サーバー由来の受信件数からの推定。請求件数ではありません。','初回・明示的な再接続時は受信全件を計上するため、キャッシュ再開時は過大になる場合があります。','通信中の再接続、権限ルール・インデックスの内部読取、他端末、サーバー単独処理は正確に計測できません。','本文・写真・文書IDは診断に保存しません。集計日はFirestoreと同じ太平洋時間。直近14日分を保持します。']};
    }
    function hints(r){const a=[];if(r.errors)a.push('失敗あり：再試行頻度と接続状態を確認');if(r.initial>=100&&r.initial>=r.reads*.6)a.push('初回取得が多い：対象期間・件数の絞り込みを検討');if(r.updates>=100&&r.updates>=r.reads*.5)a.push('更新が多い：不要な書込・常時監視の範囲を確認');if(r.gets>=10&&r.reads>=10)a.push('個別取得が多い：キャッシュ再利用を検討');if(r.unknown)a.push('件数不明の通信あり：サーバー側の確認が必要');if(r.reused)a.push('同時取得の共用が有効');return a;}
    function process(path,col){return (col?'list:':'get:')+pathKey(path);}
    async function get(path,col,fn,tag){const p=tag||process(path,col);record(p,{gets:1});try{const s=await fn(),n=docs(s,col).length,m=s.metadata||{};if(m.fromCache)record(p,{cacheEvents:1,cacheDocs:n});else if(m.hasPendingWrites)record(p,{localEvents:1});else record(p,{reads:Math.max(1,n),empty:n===0?1:0});return s;}catch(e){record(p,{errors:1,unknown:1});throw e;}}
    function listener(path,col){
      const p='listen:'+pathKey(path);let baseline=null,lastSeen=null,firstServer=true,closed=false;
      record(p,{attaches:1});active.set(p,(active.get(p)||0)+1);
      return {snapshot(s){
        const a=docs(s,col),m=s.metadata||{};let next;
        if(lastSeen&&col&&typeof s.docChanges==='function'){next=new Map(lastSeen);for(const c of s.docChanges()){if(c.type==='removed')next.delete(c.doc.id);else next.set(c.doc.id,hash(c.doc.data()));}}
        else next=new Map(a.map(d=>[d.id,hash(d.data())]));
        const changed=lastSeen===null||next.size!==lastSeen.size||[...next].some(([k,v])=>lastSeen.get(k)!==v);lastSeen=next;
        if(m.fromCache){record(p,{cacheEvents:1,cacheDocs:a.length});return changed;}
        if(m.hasPendingWrites){record(p,{localEvents:1});return changed;}
        const confirmation=firstServer;
        if(firstServer){const n=Math.max(1,a.length);record(p,{reads:n,initial:n,empty:a.length===0?1:0});firstServer=false;}
        else{let n=0,removed=0;for(const [k,v] of next)if(!baseline.has(k)||baseline.get(k)!==v)n++;for(const k of baseline.keys())if(!next.has(k))removed++;if(n||removed)record(p,{reads:n,updates:n,removed});}
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
    return {get,listener,reused,remoteAttempt,record,snapshot,flush,export:exportData};
  }
  function singleFlight(){const jobs=new Map();return function(key,fn,reuse){if(jobs.has(key)){if(reuse)reuse();return jobs.get(key);}const p=Promise.resolve().then(fn).finally(()=>jobs.delete(key));jobs.set(key,p);return p;};}
  return {create,pathKey,label,singleFlight};
});
