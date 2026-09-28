/* Included only in the generated preview. No production APIs or credentials. */
{
  const docs = new Map(), listeners = new Map();
  const copy = x => JSON.parse(JSON.stringify(x));
  const merge = (a,b) => { const o={...a};for(const [k,v] of Object.entries(b))o[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(a?.[k]||{},v):v;return o; };
  const snapshot = p => ({id:p.split('/').pop(),exists:docs.has(p),fromCache:false,data:()=>copy(docs.get(p)||{})});
  const collectionSnapshot = p => ({metadata:{fromCache:false},docs:[...docs.keys()].filter(k=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).map(snapshot)});
  const notify = p => { for(const k of [p,p.slice(0,p.lastIndexOf('/'))])for(const [cb,coll] of listeners.get(k)||[])queueMicrotask(()=>cb(coll?collectionSnapshot(k):snapshot(k))); };
  function listen(p,cb,coll){ const l=listeners.get(p)||[];l.push([cb,coll]);listeners.set(p,l);queueMicrotask(()=>cb(coll?collectionSnapshot(p):snapshot(p)));return()=>{}; }
  function doc(p){return {get:async()=>snapshot(p),set:async d=>{docs.set(p,copy(d));notify(p);},update:async d=>{docs.set(p,merge(docs.get(p)||{},copy(d)));notify(p);},delete:async()=>{docs.delete(p);notify(p);},collection:c=>collection(p+'/'+c),onSnapshot:cb=>listen(p,cb,false)};}
  function collection(p){return {doc:id=>doc(p+'/'+id),get:async()=>collectionSnapshot(p),onSnapshot:cb=>listen(p,cb,true)};}
  const d=today(), tomorrow=addDays(d,1), now=Date.now(), put=(c,id,x)=>docs.set(c+'/'+id,x);
  Object.assign(state,{me:'preview-h',owner:true,acctRole:'h',emailRole:'h',fam:{h:'テストA',w:'テストB'},roles:{h:'preview-h',w:'preview-w'},rolesLoaded:true});
  Object.assign(prefs,{onboarded:'1',tipDone:'1',qaPop:'off',aiBrief:'off',music:'off',wx:'off',haptic:'off',gAuto:'0',mode:new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light'});
  db={doc,collection};privBase=doc('private');prefsDoc=doc('meta/prefs');histDoc=doc('meta/history');kakeiDoc=doc('meta/kakei');famDoc=doc('meta/family');
  put('meta','prefs',prefs);put('meta','family',state.fam);put('meta','history',{names:['牛乳','卵']});
  put('meta','kakei',{fridge:{items:['卵','豆腐','にんじん'],at:now},music:{h:'スピッツ',w:'宇多田ヒカル'}});
  const item=(text,extra={})=>({text,list:'task',done:false,who:'both',createdAt:now,updatedAt:now,...extra});
  put('items','shared-task',item('共有タスク（ふたり）',{due:d,time:'10:00',dur:30}));
  put('items','shop-today',item('今日の牛乳',{list:'shop',due:d}));
  put('items','shop-future',item('明日のパン',{list:'shop',due:tomorrow}));
  put('items','shop-undated',item('日付なしの洗剤',{list:'shop'}));
  put('items','weekly',item('共有の毎週タスク',{list:'rtask',target:'wd',wd:[parse(d).getDay()],log:{},time:'11:00',dur:30}));
  put('private/pitems','private-task',item('自分だけのタスク',{due:d,time:'13:00',dur:30,who:'h'}));
  put('private/habits','daily-habit',{text:'毎日ストレッチ',target:7,time:'07:00',dur:15,log:{},createdAt:now});
  put('private/habits','weekly-habit',{text:'週1回の習慣',target:'wd',wd:[parse(d).getDay()],log:{},createdAt:now});
  put('private/blocks','daily-block',{text:'毎日の読書',date:d,rep:'daily',start:'21:00',end:'21:30',createdAt:now});
  put('private/blocks','all-day-block',{text:'自分だけの終日予定',date:d,rep:'none',allDay:true,memo:'共有されない非公開メモ',createdAt:now});
  put('events','both-event',{text:'ふたりの共有予定',date:d,start:'15:00',end:'16:30',who:'both',createdAt:now});
  put('events','partner-event',{text:'相手だけの予定',date:d,start:'17:00',end:'18:00',who:'w',createdAt:now});
  put('talks',d,{date:d,status:'done',held:true,heldAt:now,notes:'話し合いのテスト記録',at:now});
  put('dinner',d,{date:d,text:'旧形式のカレー',at:now,role:'h'});
  put('bugs','active-request',{text:'検証用の未対応要望',status:'new',role:'h',at:now});
  put('bugs','closed-request',{text:'検証用の過去要望',status:'fixed',role:'h',at:now,fixNote:'テスト用の対応内容',fixedAt:now,fixedVersion:'179'});
  put('bugs','approved-request',{text:'検証用の承認済み要望',status:'approved',role:'h',at:now});
  put('bugs','rejected-request',{text:'検証用の見送り要望',status:'rejected',role:'h',at:now});
  for(const [i,[text]] of AI_RELEASE.fixes.entries())put('bugs','ai-fixed-'+i,{text,status:'new',role:'h',at:now,ver:'180'});
  for(const [i,[text]] of AI_RELEASE.pending.entries())put('bugs','ai-pending-'+i,{text,status:'new',role:'h',at:now,ver:'180'});
  bindFavorites();
  state.diag={user:true,db:true,canWrite:true,name:'検証用・本番接続なし',writeErr:''};
  for(const c of ['items','events','topics','talks','bugs','dinner','thanks','plans','chores','reflect','shifts','activity','comments','diary','photos','spend','recur','goals','music','qa','usage','usageReports'])collection(c).onSnapshot(s=>{state[c]=s.docs.map(x=>({id:x.id,...x.data()}));state[c+'Loaded']=true;if(c==='bugs'&&state.view==='settings'&&!state.bugSaving)refreshBugCard();else requestRender();});
  for(const c of PRIVATE)privBase.collection(c).onSnapshot(s=>{state[c]=s.docs.map(x=>({id:x.id,...x.data()}));state[c+'Loaded']=true;requestRender();});
  kakeiDoc.onSnapshot(s=>{state.kakei=s.data();state.kakeiLoaded=true;requestRender();});
  histDoc.onSnapshot(s=>state.history=s.data().names||[]);
  /* Deterministic fake response tests the UI/action path, not language understanding. */
  const mockAI={limits:async()=>({images:{mediaTypes:['image/png','image/jpeg']}}),json:async(p,o)=>{
    if(o?.images)return {items:['卵','豆腐','にんじん']};
    if(String(p).includes('改善依頼を開発者向けに整理')){await new Promise(resolve=>setTimeout(resolve,1200));return {summary:'【検証用】要望を既存の画面に合わせて実装する',changes:['対象画面の操作を確認して必要な変更を絞る','既存の保存データと公開範囲を保って追加する'],tests:['スマホ幅で入力・保存・再表示できる','保存失敗時に入力を残して再試行できる'],questions:[]};}
    const q=String(p).match(/【今回の質問】([^\n]*)/)?.[1]||String(p);
    const acts=/繰り返し|毎週/.test(q)?[{type:'add_recurring',text:'AIからの毎週ストレッチ',target:'wd',wd:[parse(d).getDay()],date:d,time:'19:00',end:'19:30',who:'priv'}]:/設定/.test(q)?[{type:'set_pref',key:'fs',value:'l'}]:/画面|カレンダー/.test(q)?[{type:'open_view',view:'cal',date:d}]:/要望|不具合/.test(q)?[{type:'report_bug',text:'AIから登録した検証用要望'}]:/防災/.test(q)?[{type:'add_plan',cat:'bousai',text:'検証用の備蓄チェック'}]:/献立|夕飯/.test(q)?[{type:'add_dinner',date:d,main:'卵焼き',side:'にんじんサラダ',soup:'豆腐のみそ汁'}]:[{type:'add_task',text:'AIからの検証タスク',date:tomorrow,time:'09:30',end:'10:15',who:'priv'}];
    return {reply:'【模擬AI】これは検証専用の固定応答です。下の操作ボタンで動作を確認できます。',acts,next:['カレンダー画面へ','夕飯の献立を記録','改善要望を登録']};
  }};
  state.sample=mockAI;state.sampleTxt=mockAI;state.sampleNote='検証用の模擬AI（外部送信なし）';
  const banner=document.createElement('div');banner.textContent='検証専用：架空データ・本番接続なし・AIは固定応答';banner.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#173b31;color:white;text-align:center;padding:5px;font-size:11px;pointer-events:none';document.body.appendChild(banner);
  addEventListener('message',e=>{if(e.source!==parent||!e.data||e.data.preview!==Number(APP_VERSION))return;if(e.data.view){go(e.data.view);if(e.data.view==='settings'){state.setOpen={data:1};render();requestAnimationFrame(()=>$('bugCard')?.scrollIntoView({block:'start'}));}}if(e.data.role){state.acctRole=e.data.role;state.emailRole=e.data.role;go('home');}if(e.data.resetPrefs){prefs.itemFavorites='[]';render();toast('検証：旧設定の空リストを受信しました');}});
  if(new URLSearchParams(location.search).get('view')==='requests'){ state.view='settings';prefs.view='settings';state.setOpen={data:1}; }
  $('syncText').textContent='検証データ';$('offline').hidden=true;applyPrefs();render();
  if(new URLSearchParams(location.search).get('view')==='requests') requestAnimationFrame(()=>$('bugCard')?.scrollIntoView({block:'start'}));
}
