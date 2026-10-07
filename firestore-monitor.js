/* Project-wide Google metrics plus independent local quota error handling. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.FutariFirestoreMonitor=api;})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  const LIMITS={reads:50000,writes:20000,deletes:20000}, STORAGE_LIMIT=1073741824, PERIOD=300000;
  function dayWindow(now){
    const fmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
    const parts=t=>Object.fromEntries(fmt.formatToParts(new Date(t)).filter(p=>p.type!=="literal").map(p=>[p.type,Number(p.value)]));
    const p=parts(now),base=Date.UTC(p.year,p.month-1,p.day);
    const midnight=target=>{let t=target;for(let i=0;i<4;i++){const q=parts(t);t+=target-Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second);}return t;};
    return {start:midnight(base),end:midnight(base+86400000)};
  }
  function limited(e){return !!e&&(/(^|\/)resource-exhausted$/.test(String(e.code||""))||e.code==="ai_store_rate_limited"||/問い合わせ内容を読めませんでした[（(]429[）)]/.test(String(e.detail||e.message||"")));}
  function validReport(r,project){
    if(!r||![1,2].includes(r.schema)||r.project!==project||r.database!=="(default)"||!Number.isFinite(r.checkedAt)||!r.day||!Number.isFinite(r.day.start)||!Number.isFinite(r.day.end)||!r.metrics)return false;
    const d=dayWindow(r.checkedAt);if(r.day.start!==d.start||r.day.end!==d.end)return false;
    const stamp=m=>m.lastPointAt===null||m.lastPointAt===undefined||(Number.isFinite(m.lastPointAt)&&m.lastPointAt<=r.checkedAt);
    if(r.schema===2){const s=r.metrics.storage;if(!s||!(s.bytes===null||(Number.isSafeInteger(s.bytes)&&s.bytes>=0))||!stamp(s)||(s.bytes!==null&&!Number.isFinite(s.lastPointAt)))return false;}
    return Object.keys(LIMITS).every(k=>r.metrics[k]&&stamp(r.metrics[k])&&(r.metrics[k].count===null||(Number.isSafeInteger(r.metrics[k].count)&&r.metrics[k].count>=0)));
  }
  function safeSetupUrl(value,project){
    try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)return "";
      if(u.hostname==="script.google.com"&&/^\/home\/projects\/[A-Za-z0-9_-]+\/edit$/.test(u.pathname)&&!u.search)return u.href;
      if(u.hostname==="console.cloud.google.com"&&["/billing/enable","/apis/library/monitoring.googleapis.com","/iam-admin/iam"].includes(u.pathname)&&u.searchParams.get("project")===project)return u.href;
    }catch(_){}return "";
  }
  function create(o){
    const clock=o.clock||Date.now,key="futari.firestore.monitor:"+o.project+":"+o.user;
    let report=null,issue=null,error="",setupUrl="",setupReason="",loading=false,job=null,lastAttempt=0,started=false,timer=null,stoppedForSetup=false;
    try{const saved=JSON.parse(o.storage.getItem(key)||"null");if(!o.localOnly&&saved&&validReport(saved.report,o.project))report=saved.report;if(saved&&saved.issue&&Number.isFinite(saved.issue.at)&&["read","write","ai"].includes(saved.issue.operation))issue=saved.issue;}catch(_){}
    const persist=()=>{try{o.storage.setItem(key,JSON.stringify({report,issue}));}catch(_){}};
    const notify=()=>{if(o.onChange)o.onChange(snapshot());};
    function snapshot(){
      const now=clock(),day=dayWindow(now),current=!!report&&report.day.start===day.start&&report.checkedAt<=now+60000,stale=!current||now-report.checkedAt>2*PERIOD;
      const activeIssue=issue&&issue.at>=day.start&&issue.at<=now?issue:null;
      const ratios=current&&!stale&&!error?Object.keys(LIMITS).map(k=>report.metrics[k].count===null?0:report.metrics[k].count/LIMITS[k]):[];
      const s=report&&report.metrics.storage,storageFresh=!!s&&s.bytes!==null&&Number.isFinite(s.lastPointAt)&&s.lastPointAt<=now&&now-s.lastPointAt<=2*PERIOD&&!error;
      if(storageFresh)ratios.push(s.bytes/STORAGE_LIMIT);const ratio=Math.max(0,...ratios);
      return {report,day,current,stale,storageFresh,issue:activeIssue,error,setupUrl,setupReason,loading,needsUpdate:!!report&&report.schema===1,connected:current&&!stale&&!error,level:activeIssue?"limited":ratio>=1?"limit":ratio>=.95?"critical":ratio>=.8?"warning":"unknown"};
    }
    function observeError(e,operation){if(!limited(e))return;const now=clock();if(issue&&now-issue.at<60000&&issue.operation===operation)return;issue={at:now,operation};persist();notify();}
    function dailyReadLimited(){const s=snapshot();return !!s.issue&&s.current&&s.report.metrics.reads.count!==null&&s.report.metrics.reads.count>=LIMITS.reads;}
    function refresh(manual){
      if(o.localOnly)return Promise.resolve(snapshot());
      if(job)return job;
      if((stoppedForSetup&&!manual)||(lastAttempt&&clock()-lastAttempt<(manual?30000:PERIOD)))return Promise.resolve(snapshot());
      lastAttempt=clock();loading=true;notify();
      job=Promise.resolve().then(()=>o.fetchUsage()).then(r=>{
        if(r&&r.status==="setup_required"){
          error=String(r.message||"監視の接続設定が必要です。");setupUrl=safeSetupUrl(r.setupUrl,o.project);setupReason=String(r.reason||"");stoppedForSetup=true;return;
        }
        if(!validReport(r,o.project))throw Error("利用状況を確認できませんでした。監視用のサーバー更新が必要です。");
        report=r;error="";setupUrl="";setupReason="";stoppedForSetup=false;persist();
      }).catch(e=>{error=/未対応の操作.*firestoreUsage/.test(String(e.message))?"監視用のサーバー更新が必要です。":String(e.message||"利用状況を取得できませんでした。");if(/未対応の操作.*firestoreUsage/.test(String(e.message)))stoppedForSetup=true;
      }).finally(()=>{job=null;loading=false;notify();});
      return job;
    }
    function tick(){if(!o.isVisible||o.isVisible()){notify();refresh(false);}}
    function start(){if(o.localOnly){notify();return;}if(started)return;started=true;tick();timer=(o.setInterval||setInterval)(tick,PERIOD);}
    function stop(){if(timer)(o.clearInterval||clearInterval)(timer);timer=null;started=false;}
    function clearIssue(){issue=null;persist();notify();}
    return {snapshot,refresh,observeError,clearIssue,dailyReadLimited,start,stop};
  }
  return {LIMITS,STORAGE_LIMIT,dayWindow,limited,validReport,create};
});
