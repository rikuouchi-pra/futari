// Run: node --test tests/regression.cjs
// Execute declarations extracted from the shipped HTML. No production data/network.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const lines = source.split('\n');
function declaration(name) {
  const start = lines.findIndex(l => new RegExp('^(?:(?:async )?function|const|let) ' + name + '(?:[=( ;])').test(l));
  assert.ok(start >= 0, 'missing declaration: ' + name);
  for (let end = start; end < lines.length; end++) {
    const code = lines.slice(start, end + 1).join('\n');
    try { new vm.Script(code); return code; } catch {}
  }
  throw new Error('incomplete declaration: ' + name);
}
function env(names, overrides = {}) {
  const state = { ai: { log: [], refs: {} }, view: 'home', me: 'test-user', items: [], pitems: [], habits: [], blocks: [], events: [], chores: [], plans: [], bugs: [], dinner: [], kakei: {} };
  const writes = [], notices = [];
  const c = vm.createContext({ state, prefs: {}, writes, notices, Date, Set, Map, console,
    today: () => '2026-09-28', myRole: () => 'h', otherRole: () => 'w', getWho: x => x.who || 'both',
    parse: d => new Date(d + 'T00:00:00'), ymd: d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    addDays: (d,n) => { const x=new Date(d+'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); },
    newId: () => 'new-id', nameOf: r => r, toast: (...a) => notices.push(a), haptic() {}, render() {}, renderTT() {}, requestRender() {}, savePrefs() {}, aiLogSave() {},
    dset: (c,id,data) => writes.push({op:'set',c,id,data}), dupd: (c,id,data) => writes.push({op:'update',c,id,data}), ddel: (c,id) => writes.push({op:'delete',c,id}),
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    snapUndo: () => () => {}, aiActText: () => 'test', APP_VERSION: '178',
    TITLES: { home:'ホーム', cal:'カレンダー', talk:'話す', future:'将来', settings:'設定' }, PCATS: { bousai:{}, wish:{} },
    go: v => { state.view=v; }, document:{querySelector:()=>null}, CSS:{escape:String},
    ...overrides });
  for(const name of names) vm.runInContext(declaration(name), c, {filename: name});
  return c;
}
const core = ['tmin','hhmm','isRecItem','sharedBoth','myT','myD','timeCh','hasDayTime','dayTimeKey','dayTime','timeAt','durAt','timeChangeFor','blockAt'];
function run(c, s) { return vm.runInContext(s,c); }
function plain(x) { return JSON.parse(JSON.stringify(x)); }
function act(c,x) { c.state.ai.log=[{a:{acts:[x]}}]; run(c,'aiDoAct(0,0)'); return c.writes.at(-1); }

test('all inline scripts, shim and service worker parse', () => {
  let count=0; for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(m[1].trim()){new vm.Script(m[1]);count++;}
  assert.ok(count>=2);
  for(const f of ['shim.js','sw.js']) new vm.Script(fs.readFileSync(path.join(root,f),'utf8'));
});
test('daily override preserves standard time and other dates', () => {
  const c=env(core); c.x={time:'09:00',dur:30,dayTimes:{'2026-09-29':{time:'12:00',dur:45}}};
  run(c,"Object.assign(x,timeChangeFor('habits',x,'2026-09-28','10:00',60))");
  assert.equal(c.x.time,'09:00'); assert.equal(run(c,"timeAt(x,'2026-09-28')"),'10:00');
  assert.equal(run(c,"timeAt(x,'2026-09-29')"),'12:00'); assert.equal(run(c,"timeAt(x,'2026-09-30')"),'09:00');
});
test('shared recurrence overrides do not change partner time', () => {
  const c=env(core); c.x={list:'rtask',who:'both',time:'09:00',dayTimes_w:{'2026-09-28':{time:'07:00',dur:20}}};
  run(c,"Object.assign(x,timeChangeFor('items',x,'2026-09-28','10:00',60))");
  assert.equal(c.x.dayTimes_w['2026-09-28'].time,'07:00'); assert.equal(c.x.dayTimes_h['2026-09-28'].time,'10:00');
});
test('removing time affects only the selected recurrence date', () => {
  const c=env(core); c.x={time:'09:00',dur:30}; run(c,"Object.assign(x,timeChangeFor('habits',x,'2026-09-28',null,null))");
  assert.equal(run(c,"timeAt(x,'2026-09-28')"),null); assert.equal(run(c,"timeAt(x,'2026-09-29')"),'09:00');
});
test('repeating blocks display selected time without changing template', () => {
  const c=env(core); c.x={rep:'daily',start:'09:00',end:'10:00'}; run(c,"Object.assign(x,timeChangeFor('blocks',x,'2026-09-28','11:00',90))");
  assert.equal(run(c,"blockAt(x,'2026-09-28').end"),'12:30'); assert.equal(run(c,"blockAt(x,'2026-09-29').start"),'09:00');
});
test('edited auto tasks are protected against regeneration', () => {
  const c=env(core); c.x={auto:'cook',time:'09:00'};
  assert.equal(run(c,"timeChangeFor('pitems',x,'2026-09-28','11:00',45).touched"),true);
});
test('calendar block rows show daily overrides but edit the standard time', () => {
  const c=env([...core,'REPS','blockRow'],{isEditing:()=>false,wrapRow:(_c,_b,_s,_icon,html)=>html});
  c.state.view='cal';c.state.sel='2026-09-28';c.x={id:'block',text:'読書',rep:'daily',start:'21:00',end:'21:30',dayTimes:{'2026-09-28':{time:'20:00',dur:30}}};
  assert.match(run(c,'blockRow(x)'),/20:00–20:30/);
  c.isEditing=()=>true;c.seg=()=>'';c.editActions=()=>'';c.BCOLORS=[];
  assert.match(run(c,'blockRow(x)'),/id="bStart" value="21:00"/);
});
test('preview allows form handlers but forbids outbound form navigation', () => {
  const wrapper=fs.readFileSync(path.join(root,'preview/v178/index.html'),'utf8');
  const build=fs.readFileSync(path.join(root,'tests/build-preview.cjs'),'utf8');
  assert.match(wrapper,/sandbox="allow-scripts allow-forms allow-downloads"/);
  assert.match(build,/form-action 'none'/);
  assert.doesNotMatch(wrapper,/allow-same-origin/);
});
test('AI dates preserve explicit years and reject nonexistent dates', () => {
  const c=env(['aiDate','aiTime']);
  for(const d of ['2027-01-01','2024-02-29','2025-12-31']) assert.equal(run(c,`aiDate(${JSON.stringify(d)})`),d);
  for(const d of ['2026-02-29','2026-04-31','2026-13-10']) assert.equal(run(c,`aiDate(${JSON.stringify(d)})`),'');
  assert.equal(run(c,"aiDate('明日')"),'2026-09-29'); assert.equal(run(c,"aiTime('24:00')"),'');
});
const ai = [...core,'aiDate','aiTime','AI_PREFS','cut2','aiDoAct','applyLocal'];
test('AI private event uses private collection with exact date/time', () => {
  const c=env(ai); const w=act(c,{type:'add_event',text:'歯医者',date:'2027-02-01',start:'10:30',end:'11:15',who:'priv'});
  assert.equal(w.c,'blocks'); assert.equal(w.data.date,'2027-02-01'); assert.equal(w.data.start,'10:30'); assert.equal(w.data.end,'11:15'); assert.equal(w.data.who,undefined);
});
test('AI invalid date or time never writes data', () => {
  for(const x of [{date:'2026-02-30'},{time:'25:00'}]) { const c=env(ai); act(c,{type:'add_event',text:'test',...x}); assert.equal(c.writes.length,0); }
});
test('AI keeps partner assignment for shared events', () => {
  const c=env(ai); const w=act(c,{type:'add_event',text:'test',who:'partner'}); assert.equal(w.c,'events');assert.equal(w.data.who,'w');
});
test('AI settings permit actual UI values and reject identity changes', () => {
  const c=env(ai); act(c,{type:'set_pref',key:'fs',value:'xl'}); assert.equal(c.prefs.fs,'xl');
  act(c,{type:'set_pref',key:'role',value:'w'}); assert.equal(c.prefs.role,undefined);
  act(c,{type:'set_pref',key:'ttStart',value:'0'}); assert.equal(c.prefs.ttStart,undefined);
});
test('AI navigation selects requested category', () => {
  const c=env(ai); act(c,{type:'open_view',view:'future',cat:'bousai'});assert.equal(c.state.view,'future');assert.equal(c.state.fut,'bousai');
});
test('AI saves a feature request as received, not fixed', () => {
  const c=env(ai); const w=act(c,{type:'report_bug',text:'表示を改善して'});assert.equal(w.c,'bugs');assert.equal(w.data.status,'new');assert.equal(w.data.source,'ai');
});
test('AI dinner separates main, side and soup', () => {
  const c=env(ai,{dinnerOf:()=>null});const w=act(c,{type:'add_dinner',main:'焼き魚',side:'サラダ',soup:'味噌汁'});
  assert.equal(w.data.main,'焼き魚');assert.equal(w.data.side,'サラダ');assert.equal(w.data.soup,'味噌汁');assert.equal(w.data.text,'焼き魚、サラダ、味噌汁');
});
test('AI recurring time edits preserve future template', () => {
  const c=env(ai);c.state.habits=[{id:'h1',time:'09:00',dur:30}];
  act(c,{type:'edit',_r:{c:'habits',id:'h1'},date:'2026-09-29',time:'11:00',end:'12:00'});
  assert.equal(c.state.habits[0].time,'09:00');assert.equal(c.state.habits[0].dayTimes['2026-09-29'].dur,60);
});
test('fridge reads at most three photos individually, deduplicates, awaits confirmation', async () => {
  let calls=0;const c=env(['fridgeRead'],{flushExtras(){}});c.state.sample={json:async(p,o)=>{calls++;assert.ok(!Array.isArray(o.images));return {items:['卵',calls===1?'豆腐':'にんじん']};}};
  c.files=[{id:1},{id:2},{id:3},{id:4}];await run(c,'fridgeRead(files)');assert.equal(calls,3);assert.equal(c.state.fridgeDraft,'卵、豆腐、にんじん');assert.equal(c.writes.length,0);assert.equal(c.state.fridgeBusy,false);
});
test('fridge save preserves other shared metadata', async () => {
  let patch;const c=env(['fridgeSave'],{$:()=>({value:'卵、卵\n豆腐'}),kakeiDoc:{update:async x=>{patch=x;}}});c.state.kakei={budget:20000};
  await run(c,'fridgeSave()');assert.deepEqual(plain(patch.fridge.items),['卵','豆腐']);assert.equal(c.state.kakei.budget,20000);assert.equal(patch.budget,undefined);
});
test('favorite template remains after original task is removed and prefs reload', () => {
  const c=env(['itemFavorites','itemFavorite','toggleItemFavorite']);c.state.pitems=[{id:'x',text:'買う',list:'shop'}];run(c,"toggleItemFavorite('pitems','x')");c.state.pitems=[];
  const saved=JSON.stringify(c.prefs);c.prefs=JSON.parse(saved);assert.equal(run(c,'itemFavorites()[0].text'),'買う');assert.equal(run(c,'itemFavorites()[0].private'),true);
});
test('automatic rule AND/OR combinations and empty conditions', () => {
  const c=env(['arGroup','arMatch'],{arCond:x=>x.match}); c.r={mode:'and',groups:[{mode:'or',conds:[{match:true},{match:false}]},{mode:'and',conds:[{match:false}]}]};
  assert.equal(run(c,"arMatch(r,'2026-09-28')"),false);c.r.mode='or';assert.equal(run(c,"arMatch(r,'2026-09-28')"),true);c.r.groups=[];assert.equal(run(c,"arMatch(r,'2026-09-28')"),false);
});
test('bug list includes all active requests and folds closed ones', () => {
  const c=env(['BUG_ST','bugCard'],{ago:()=>''});c.state.owner=true;c.state.bugs=Array.from({length:25},(_,i)=>({id:'b'+i,text:'request-'+i,status:'new'}));c.state.bugs.push({id:'closed',text:'closed-request',status:'fixed'});
  const html=run(c,'bugCard()');assert.equal((html.match(/request-\d+/g)||[]).length,25);assert.match(html,/<details[^>]*><summary>過去の対応（1件）/);assert.match(html,/closed-request/);
});
test('music rejects artists not registered in either profile', () => {
  const c=env(['musicKey','musicArtists','songAllowed'],{musicTaste:r=>r==='h'?'星野源、スピッツ':'宇多田ヒカル'});c.a={artist:'星野源'};c.b={artist:'未登録アーティスト'};
  assert.equal(run(c,'songAllowed(a)'),true);assert.equal(run(c,'songAllowed(b)'),false);assert.equal(run(c,'songAllowed(null)'),false);
});
test('timetable-created forms default private for tasks and events', () => {
  assert.match(declaration('openSheet'),/pendPrivate\|\|v==="cal"\|\|v==="psched"/);
  assert.match(declaration('openSheet'),/S\.who="priv"; S\.evPriv=true; S\.bshare=false/);
});
test('artist substrings cannot pass the preferred artist filter', () => {
  const c=env(['musicKey','musicArtists','songAllowed'],{musicTaste:()=> '星野源、King Gnu'});c.x={artist:'源'};
  assert.equal(run(c,'songAllowed(x)'),false);
});
test('AI task preserves date, start, end and partner assignment', () => {
  const c=env([...ai,'baseItem']);const w=act(c,{type:'add_task',text:'test',date:'2027-01-02',time:'9:30',end:'10:45',who:'partner'});
  assert.equal(w.c,'items');assert.equal(w.data.who,'w');assert.equal(w.data.due,'2027-01-02');assert.equal(w.data.time,'09:30');assert.equal(w.data.dur,75);
});
test('historical dates are not silently rewritten by a background timer', () => {
  assert.doesNotMatch(source,/setTimeout\(aiYearFix/);
});
test('AI prompt retains question and stays within the backend 20k limit', async () => {
  let prompt=''; const c=env(['AI_PREFS','AI_ACT_L','aiAsk'],{aiCan:()=>true,aiCtx:()=> '状況'.repeat(10000),aiMemB:()=>[],aiMemP:()=>[]});
  c.state._smt={json:async p=>{prompt=p;return {reply:'test',acts:[]};}};
  c.state.ai.log=Array.from({length:3},()=>({q:'q'.repeat(1000),a:{reply:'a'.repeat(1000)}}));
  await run(c,"aiAsk('質問'.repeat(2000))");assert.ok(prompt.length<=20000,`prompt=${prompt.length}`);assert.ok(prompt.indexOf('【今回の質問】')<300);assert.equal(c.state.ai.busy,false);
});
test('auto rules create private tasks, retain completed items and honor skips', () => {
  const c=env(['tmin','autoCook'],{setTimeout:f=>{f();return 1;},clearTimeout(){},autoTimer:null,db:null,privBase:null,arSkip:()=>new Set(['rule:2026-09-29']),arRules:()=>[{id:'rule',kind:'task',on:true,name:'料理',s:'18:00',e:'19:00'}],arMatch:()=>true});
  Object.assign(c.state,{blocksLoaded:true,pitemsLoaded:true,shiftsLoaded:true});
  c.state.pitems=[{id:'auto_rule_2026-09-28',auto:'rule',done:true,text:'完了済み',due:'2026-09-28'}];run(c,'autoCook()');
  assert.ok(c.writes.every(x=>x.c==='pitems'));assert.ok(c.writes.every(x=>!['auto_rule_2026-09-28','auto_rule_2026-09-29'].includes(x.id)));assert.equal(c.writes.length,58);
});
