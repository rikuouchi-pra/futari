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
  const c = vm.createContext({ state, prefs: {}, writes, notices, Date, Set, Map, console, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, IS_IOS:false,
    today: () => '2026-09-28', myRole: () => 'h', otherRole: () => 'w', getWho: x => x.who || 'both',
    parse: d => new Date(d + 'T00:00:00'), ymd: d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    addDays: (d,n) => { const x=new Date(d+'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); },
    newId: () => 'new-id', nameOf: r => r, toast: (...a) => notices.push(a), haptic() {}, render() {}, renderTT() {}, renderChrome() {}, requestRender() {}, savePrefs() {}, aiLogSave() {},
    dset: (c,id,data) => writes.push({op:'set',c,id,data}), dupd: (c,id,data) => writes.push({op:'update',c,id,data}), ddel: (c,id) => writes.push({op:'delete',c,id}),
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    snapUndo: () => () => {}, aiActText: () => 'test', APP_VERSION: source.match(/APP_VERSION="(\d+)"/)[1],
    TITLES: { home:'ホーム', cal:'カレンダー', talk:'話す', future:'将来', settings:'設定' }, PCATS: { bousai:{}, wish:{} },
    go: v => { state.view=v; }, document:{querySelector:()=>null,querySelectorAll:()=>[]}, CSS:{escape:String},
    bugAIPanel:()=>'',pushEnabled:()=>false,...overrides });
  if(names.some(n=>['pushPlan','pushSyncRun','pushCardHTML','pushDetailsHTML'].includes(n)))names=['pushSettings',...(names.includes('pushCardHTML')?['pushDetailsHTML']:[]),...names];
  if(names.includes('aiDoAct')||names.includes('aiActText'))names=['AI_PREFS','aiPrefValue','aiPrefLabel',...names];
  if(names.includes('choreInfo'))names=['choreMovedDue',...names];
  if(names.includes('aiAsk'))names=['AI_PROMPT_MAX','aiDateTable','aiRequest','aiFailure','aiWaitText','aiWaitPaint',...names];
  if(names.includes('aiComposerHTML'))names=['aiRecM','aiVoiceAIOk',...names];
  if(names.some(n=>['aiMic','aiVoiceCancel','aiAsk','aiRefresh','aiVoiceFix','aiVoiceRec'].includes(n)))names=['aiRec','aiRecM','aiSRS','aiVoiceRun','aiVoiceCtl','aiVoiceStartTimer','aiVoiceTracks','aiVoiceReleaseRecorder','aiVoiceInvalidate',...names];
  if(names.includes('bugCard')&&!names.includes('bugDisplay'))names=['AI_RELEASE','bugTextKey','bugDisplay',...names];
  for(const name of new Set(['isRecItem','isHabit','habitItems','privateRecTasks','AI_RELEASE_184','bugRelease184','AI_RELEASE_190','bugRelease190',...names])) vm.runInContext(declaration(name), c, {filename: name});
  return c;
}
const core = ['tmin','hhmm','isRecItem','sharedBoth','bothRoleOrder','bothPick','myT','myD','timeCh','hasDayTime','dayTimeKey','dayTime','timeAt','durAt','timeChangeFor','blockAt'];
const shopFns=['DEFAULT_CHIPS','cleanShopChips','shopChipNames','shopChipsHTML','shopChipAction','saveShopChips'];
test('edited shopping candidates replace automatic history and empty saved lists stay empty',()=>{
 const c=env(shopFns);c.state.history=['牛乳','牛乳','購入履歴'];assert.equal(run(c,'shopChipNames().filter(x=>x==="牛乳").length'),1);
 c.state.shopChips=['豆乳'];assert.deepEqual(plain(run(c,'shopChipNames()')),['豆乳']);c.state.history=['牛乳','追加履歴'];assert.deepEqual(plain(run(c,'shopChipNames()')),['豆乳']);
 c.state.shopChips=[];assert.deepEqual(plain(run(c,'shopChipNames()')),[]);assert.match(run(c,'shopChipsHTML([])'),/data-shop-chips="edit"/);assert.doesNotMatch(run(c,'shopChipsHTML([])'),/data-chip=/);
});
test('shopping candidates preserve exact names safely and hide already open items',()=>{
 const c=env(shopFns);c.state.shopChips=['牛乳','<豆乳>"'];const html=run(c,'shopChipsHTML([{text:"牛乳"}])');assert.doesNotMatch(html,/data-chip="牛乳"/);assert.match(html,/&lt;豆乳&gt;&quot;/);
 c.state.shopChipsLoaded=true;run(c,'shopChipAction("edit")');assert.match(run(c,'shopChipsHTML([])'),/value="牛乳"/);c.state.shopChipDraft[0]='変更';run(c,'shopChipAction("cancel")');assert.deepEqual(plain(c.state.shopChips),['牛乳','<豆乳>"']);
});
test('shopping candidate validation and failed saves retain the draft for retry',async()=>{
 let writes=0;const c=env(shopFns,{shopChipsDoc:{set:async()=>{writes++;throw Error('write failed');}}});c.state.shopChipsLoaded=true;c.state.shopChips=['保存済み'];
 for(const draft of [[''],['同名',' 同名 ']]){c.state.shopChipDraft=draft;assert.equal(await run(c,'saveShopChips()'),false);}assert.equal(writes,0);
 c.state.shopChipDraft=['新候補'];assert.equal(await run(c,'saveShopChips()'),false);assert.equal(writes,1);assert.deepEqual(plain(c.state.shopChipDraft),['新候補']);assert.deepEqual(plain(c.state.shopChips),['保存済み']);assert.equal(c.state.shopChipSaving,false);
});
test('shopping candidate saves use a separate shared document and reload an explicitly empty list',async()=>{
 let listener,saved,docPath;const c=env([...shopFns,'bindShopChips'],{shopChipsDoc:null,db:{doc:p=>{docPath=p;return {onSnapshot:fn=>listener=fn,set:async x=>{saved=x;}};}}});run(c,'bindShopChips()');assert.equal(docPath,'meta/shopSuggestions');
 listener({exists:false,fromCache:true});assert.equal(c.state.shopChipsLoaded,false);listener({exists:false,fromCache:false});assert.equal(c.state.shopChipsLoaded,true);
 c.state.shopChipDraft=[' 豆乳 ','お茶'];assert.equal(await run(c,'saveShopChips()'),true);assert.deepEqual(plain(saved.names),['豆乳','お茶']);assert.equal(c.state.shopChipDraft,null);
 c.state.shopChipDraft=[];assert.equal(await run(c,'saveShopChips()'),true);c.state.shopChips=null;listener({exists:true,data:()=>saved});assert.deepEqual(plain(run(c,'shopChipNames()')),[]);
});
function run(c, s) { return vm.runInContext(s,c); }
function plain(x) { return JSON.parse(JSON.stringify(x)); }

function choreMoveEnv() {
  const names=['choreLast','chSch','chSkip','choreInfo','choreOn','choreDueCount','chFqLabel','choreRow','viewChore','CHORE_PRESET','MV_ON','movedIn','movedAway','isRecurEnt','applyLocal','moveOcc','dayTime','dayTimeKey','sharedBoth','hSince','hSch','tgtCode','hWd','hNth','hOn','hNextOn','moOn','moS','moN'];
  const c=env([...core,'aiDate',...names],{short:String,WD:['日','月','火','水','木','金','土'],isEditing:()=>false,ttTag:()=>'',CHECK:'✓',wrapRow:(coll,x,cls,left,body)=>`<li data-id="${x.id}" class="${cls}">${left}${body}</li>`,balanceHTML:()=>'',hint:()=>'',tgtLabel:()=> '曜日で'});
  c.day='2026-10-06';c.today=()=>c.day;
  c.state.chores=[{id:'kitchen',text:'キッチンの掃除',every:2,who:'both',pts:1,createdAt:Date.parse('2026-09-01T00:00:00Z'),log:{'2026-10-01':'w'},time:'19:00'}];
  c.chore=c.state.chores[0];
  // Exercise the shipped delegated button handler, not a copy of its implementation.
  c.document.addEventListener=(type,fn)=>{c.clickNext=fn;};
  const start=source.indexOf('document.addEventListener("click",e=>{ const b=e.target.closest("[data-hnext],[data-chnext]")');
  assert.ok(start>=0);run(c,source.slice(start,source.indexOf('},true);',start)+9));
  c.click=()=>c.clickNext({target:{closest:()=>({dataset:{chnext:'kitchen'}})},stopPropagation(){},preventDefault(){}});
  return c;
}
test('chore tomorrow button moves an overdue row to upcoming and removes overdue actions',()=>{
  const c=choreMoveEnv();assert.equal(run(c,'choreInfo(chore).diff'),-3);c.click();
  assert.equal(run(c,'choreInfo(chore).due'),'2026-10-07');assert.equal(run(c,'choreDueCount()'),0);
  const html=run(c,'viewChore()');assert.match(html,/これから/);assert.match(html,/明日/);assert.doesNotMatch(html,/今日やること|3日すぎ|data-chnext=/);
  assert.equal(run(c,"choreOn(chore,'2026-10-06')"),false);assert.equal(run(c,"choreOn(chore,'2026-10-07')"),true);
  assert.deepEqual(plain(c.chore.log),{'2026-10-01':'w'});assert.equal(c.chore.every,2);assert.equal(c.chore.who,'both');assert.equal(c.writes.length,1);
});
test('saved chore move survives reload, becomes due tomorrow, and can move again',()=>{
  const c=choreMoveEnv();c.click();const restored=choreMoveEnv();Object.assign(restored.chore,plain(c.writes[0].data));
  assert.equal(run(restored,'choreInfo(chore).due'),'2026-10-07');restored.day='2026-10-07';assert.equal(run(restored,'choreDueCount()'),1);
  restored.click();assert.equal(run(restored,'choreInfo(chore).due'),'2026-10-08');assert.equal(run(restored,'choreDueCount()'),0);
  assert.deepEqual(plain(restored.chore.moved),{'2026-10-06':'2026-10-08'});
  restored.day='2026-10-09';assert.equal(run(restored,'choreInfo(chore).diff'),-1);
});
test('completing a postponed chore resumes its interval and ignores old moves',()=>{
  const c=choreMoveEnv();c.click();c.day='2026-10-07';c.chore.log[c.day]='h';
  assert.equal(run(c,'choreInfo(chore).due'),'2026-10-09');assert.equal(run(c,'choreDueCount()'),0);
  c.day='2026-10-09';assert.equal(run(c,'choreDueCount()'),1);assert.equal(c.chore.every,2);
});
test('scheduled chore postponement preserves the next regular occurrence',()=>{
  const c=choreMoveEnv();Object.assign(c.chore,{target:'wd',wd:[2,4],log:{'2026-10-01':'w'}});c.click();
  assert.equal(run(c,'choreInfo(chore).due'),'2026-10-07');assert.equal(run(c,"choreOn(chore,'2026-10-08')"),true);
  c.day='2026-10-07';c.chore.log[c.day]='h';assert.equal(run(c,'choreInfo(chore).due'),'2026-10-08');
});
test('an old saved postponed chore and a cancelled move render correctly',()=>{
  const c=choreMoveEnv();c.chore.moved={'2026-09-25':'2026-10-02','2026-10-06':'2026-10-07'};
  assert.equal(run(c,'choreInfo(chore).due'),'2026-10-07');c.chore.moved['2026-10-06']=null;assert.equal(run(c,'choreInfo(chore).due'),'2026-10-03');
});

const voiceFns=['aiVoicePauseAudio','aiSRWatch','aiRec','aiRecM','aiSRS','aiSRStart','aiSRFinish','aiVoiceAIOk','aiVoiceClean','aiVoiceFix','aiVoiceText','aiVoiceDraft','aiRequest','aiVoiceRec','aiMic','aiVoiceCancel','aiComposerHTML'];
const talkCalFns=['aiDate','talkCalendarDates','talkShared','TALK_CAL_KINDS','talkRecurringOn','talkCalendarData','talkCalendarSummary','talkCalendarTimes','sharedBoth','bothRoleOrder','bothPick','myT','dayTime','talkCalendarRow','talkCalendarHTML','talkCalendarMove','hSince','tgtCode','hSch','hOn','hWd','hNth','hNextOn','moOn','moS','moN','hPeriod','mondayOf','dDiff','dayIn','rActive','rPaid','choreInfo','choreOn','chSch','choreLast','chSkip'];
function talkCalEnv(overrides={}){return env(talkCalFns,{shiftOf:()=>'',shiftBadge:()=>'',offState:()=>'',jpDate:String,tgtLabel:()=> '繰り返し',eventRow:x=>'<li>'+x.text+'</li>',itemRow:x=>'<li>'+x.text+'</li>',planRow:x=>'<li>'+x.text+'</li>',cautionRow:x=>'<li>'+x.text+'</li>',...overrides});}
test('talk calendar month handles leap February and year boundaries',()=>{
  const c=talkCalEnv({$:()=>null,talkOf:()=>null});c.state.talkCalDate='2024-02-29';const grid=run(c,'talkCalendarDates()');assert.equal(grid.days[0],'2024-01-29');assert.ok(grid.days.includes('2024-02-29'));assert.equal(grid.days.length%7,0);c.state.talkCalMonth='2026-12';run(c,'talkCalendarMove(null,1)');assert.equal(c.state.talkCalDate,'2027-01-01');run(c,'talkCalendarMove(null,-1)');assert.equal(c.state.talkCalDate,'2026-12-01');
});
test('talk calendar selects shared events only without exposing private entries',()=>{
  const c=talkCalEnv({shiftOf:()=> '日',shiftBadge:()=> '日',offState:()=>'',jpDate:String,eventRow:x=>`<li>${c.esc(x.text)}</li>`});c.state.talkCalDate='2026-09-29';c.state.events=[{id:'a',date:'2026-09-29',text:'<会議>',start:'12:00',who:'w'},{id:'b',date:'2026-09-29',text:'帰宅',start:'19:00',who:'both'},{id:'c',date:'2026-09-30',text:'別の日'}];c.state.blocks=[{date:'2026-09-29',text:'秘密の予定'}];const html=run(c,'talkCalendarHTML()');assert.match(html,/&lt;会議&gt;/);assert.match(html,/帰宅/);assert.doesNotMatch(html,/秘密の予定|別の日/);assert.match(html,/2026-09-29 共有2件/);
});
test('talk calendar navigation saves a pending note without changing its talk date',()=>{
  let saves=0;const c=talkCalEnv({$:()=>({value:'編集中のメモ'}),talkOf:()=>({notes:'前のメモ'}),saveTalkNotes:()=>saves++});c.state.talkDate='2026-09-27';run(c,"talkCalendarMove('2026-10-05')");assert.equal(c.state.talkDate,'2026-09-27');assert.equal(c.state.talkCalDate,'2026-10-05');assert.equal(saves,1);
});
function voiceEnv(options={}){let rec;const input={value:'元の入力',focus(){}};class Recognition{constructor(){rec=this;}start(){}stop(){this.onend();}abort(){this.onend();}}
  const c=env(voiceFns,{$:()=>input,window:{SpeechRecognition:Recognition},IS_IOS:false,songStop(){},aiMicUI(){},...options});c.input=input;return {c,get rec(){return rec;}};
}
test('shared calendar includes both assignees, purchases and completed tasks while excluding every private collection',()=>{
  const c=talkCalEnv();c.prefs.whoF='h';c.state.items=[{id:'h',list:'task',due:'2026-09-28',who:'h'},{id:'w',list:'task',due:'2026-09-28',who:'w',done:true},{id:'s',list:'shop',due:'2026-09-28',who:'both'},{id:'p',list:'task',due:'2026-09-28',who:'priv'},{id:'p2',list:'shop',due:'2026-09-28',private:true}];
  for(const key of ['pitems','blocks','habits','priv'])c.state[key]=[{id:'private-'+key,list:'task',due:'2026-09-28',date:'2026-09-28',target:7}];
  const rows=run(c,"talkCalendarData(['2026-09-28']).byDay['2026-09-28']");assert.deepEqual(plain(rows.map(o=>o.x.id).sort()),['h','s','w']);assert.equal(rows.find(o=>o.x.id==='w').x.done,true);assert.match(run(c,"talkCalendarSummary(talkCalendarData(['2026-09-28']).byDay['2026-09-28'])"),/買い物1件/);
});
test('calendar undated shared items remain visible without being assigned an invented date',()=>{
  const c=talkCalEnv();c.state.items=[{id:'task',list:'task'},{id:'shop',list:'shop',who:'w'}];c.state.plans=[{id:'plan'}];c.state.cautions=[{id:'caution'},{id:'hidden',visibility:'private'}];const data=run(c,"talkCalendarData(['2026-09-28'])");assert.equal(data.byDay['2026-09-28'].length,0);assert.deepEqual(plain(data.undated.map(o=>o.x.id).sort()),['caution','plan','shop','task']);
});
test('shared daily and weekly recurrences expand across the displayed month, including partner assignments',()=>{
  const c=talkCalEnv();c.state.items=[{id:'daily',list:'rtask',target:7,since:'2026-09-29',who:'w'},{id:'weekly',list:'rtask',target:'wd',wd:[1],since:'2026-09-01',who:'both',log:{'2026-09-28':1}},{id:'private',list:'rtask',target:7,since:'2026-09-01',who:'priv'}];const data=run(c,"talkCalendarData(['2026-09-28','2026-09-29','2026-10-05'])");assert.deepEqual(plain(data.byDay['2026-09-28'].map(o=>o.x.id)),['weekly']);assert.equal(data.byDay['2026-09-28'][0].status,'実施済み');assert.deepEqual(plain(data.byDay['2026-10-05'].map(o=>o.x.id).sort()),['daily','weekly']);
});
test('monthly, quota and interval recurrence dates stay grounded in schedule and logs',()=>{
  const c=talkCalEnv();c.state.items=[{id:'monthly',list:'rtask',target:'mo',mStart:'2026-01-31',since:'2026-01-31',mEvery:1},{id:'quota',list:'rtask',target:3,since:'2026-09-01'},{id:'interval',list:'rtask',target:'iv',every:7,since:'2026-09-01',log:{'2026-09-22':1}}];const data=run(c,"talkCalendarData(['2026-02-28','2026-09-27','2026-09-29'])");assert.ok(data.byDay['2026-02-28'].some(o=>o.x.id==='monthly'));assert.ok(data.byDay['2026-09-27'].some(o=>o.x.id==='quota'));assert.ok(data.byDay['2026-09-29'].some(o=>o.x.id==='interval'));
});
test('shared calendar includes chores, plans, annual anniversaries, cautions and monthly payments',()=>{
  const c=talkCalEnv();c.state.chores=[{id:'chore',target:'wd',wd:[3],since:'2026-09-01',createdAt:Date.UTC(2026,8,1),who:'w'}];c.state.plans=[{id:'plan',date:'2026-09-30'},{id:'anniv',cat:'anniv',date:'2020-09-30'}];c.state.cautions=[{id:'caution',date:'2026-09-30'}];c.state.recur=[{id:'bill',day:31,from:'2026-09',until:'2026-10',paid:{'2026-09':{amount:1}}},{id:'disabled',day:30,active:false}];const data=run(c,"talkCalendarData(['2026-09-30','2026-10-31','2026-11-30','2027-09-30'])");assert.deepEqual(plain(data.byDay['2026-09-30'].map(o=>o.x.id).sort()),['anniv','bill','caution','chore','plan']);assert.equal(data.byDay['2026-09-30'].find(o=>o.kind==='pay').status,'支払い済み');assert.ok(data.byDay['2026-10-31'].some(o=>o.x.id==='bill'));assert.ok(!data.byDay['2026-11-30'].some(o=>o.x.id==='bill'));assert.ok(data.byDay['2027-09-30'].some(o=>o.x.id==='anniv'));
});
test('recurring rows show the shared selected-day time and never toggle today by mistake',()=>{
  const c=talkCalEnv();c.o={c:'items',kind:'repeat',d:'2026-09-29',x:{id:'rec',text:'<掃除>',who:'both',time:'09:00',dayTimes:{'2026-09-29':{time:'18:00'}}}};const html=run(c,'talkCalendarRow(o)');assert.match(html,/18:00/);assert.doesNotMatch(html,/09:00|data-act="right"|data-htc/);assert.match(html,/&lt;掃除&gt;/);assert.match(html,/詳細・編集/);
});
test('voice result updates replace interim text without duplication and never send',()=>{
  const v=voiceEnv();v.c.sent=0;v.c.aiAsk=()=>v.c.sent++;run(v.c,'aiMic()');
  v.rec.onresult({resultIndex:0,results:[{0:{transcript:'明日の'},isFinal:false}]});
  v.rec.onresult({resultIndex:0,results:[{0:{transcript:'明日の19時'},isFinal:true},{0:{transcript:'買い物'},isFinal:false}]});
  assert.equal(v.c.state.ai.q,'元の入力\n明日の19時買い物');run(v.c,'aiMic()');assert.equal(v.c.sent,0);assert.equal(v.c.state.aiListening,false);assert.match(v.c.state.aiVoiceStatus,/確認/);
});
test('voice restart appends to edited draft and cancellation ignores late callbacks',()=>{
  const v=voiceEnv();run(v.c,'aiMic()');const old=v.rec;old.onresult({results:[{0:{transcript:'買い物'},isFinal:true}]});run(v.c,'aiMic()');v.c.input.value='修正した入力';run(v.c,'aiMic()');
  v.rec.onresult({results:[{0:{transcript:'自分だけ'},isFinal:true}]});assert.equal(v.c.state.ai.q,'修正した入力\n自分だけ');run(v.c,'aiVoiceCancel()');assert.equal(v.c.state.ai.q,'');
  old.onresult({results:[{0:{transcript:'遅れて届いた結果'},isFinal:true}]});assert.equal(v.c.state.ai.q,'');
});
test('voice permission/network failures preserve draft and offer recovery',()=>{
  for(const error of ['not-allowed','network','no-speech']){const v=voiceEnv();run(v.c,'aiMic()');v.rec.onerror({error});v.rec.onend();assert.equal(v.c.state.ai.q,'元の入力');assert.equal(v.c.state.aiListening,false);assert.match(v.c.state.aiVoiceStatus,/マイク|接続|聞き取/);}
  const v=voiceEnv({window:{}});run(v.c,'aiMic()');assert.match(v.c.state.aiVoiceStatus,/キーボード/);
});
test('failed recognition start releases session so retry works',()=>{
  const v=voiceEnv({window:{SpeechRecognition:class {start(){throw Error('busy');}}}});run(v.c,'aiMic()');assert.equal(run(v.c,'aiRec'),null);assert.equal(v.c.state.aiListening,false);assert.equal(v.c.state.ai.q,'元の入力');
});
test('voice composer escapes text, disables send during recognition and supports long drafts',()=>{
  const c=voiceEnv().c;c.state.ai.q='<script>alert(1)</script>';c.state.aiListening=true;const html=run(c,'aiComposerHTML()');assert.match(html,/maxlength="2000"/);assert.match(html,/readonly/);assert.doesNotMatch(html,/data-act="aiAsk"(?! disabled)/);assert.match(html,/data-act="aiVoiceCancel"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.equal(run(c,"aiVoiceDraft('', 'あ'.repeat(2100)).length"),2000);
});
test('notification inbox separates unread and history and excludes sender-only records',()=>{
  const c=env(['shareReceived','shareUnread','shareInboxHTML']);c.state.events=[{id:'mine',text:'<img>',date:'2026-09-29',notice:{to:'h',from:'w',at:2}},{id:'old',text:'確認した予定',date:'2026-09-27',notice:{to:'h',from:'w',at:1,seenAt:3}},{id:'sent',text:'相手宛のみ',notice:{to:'w',from:'h',at:4}}];
  const html=run(c,'shareInboxHTML()');assert.match(html,/未読 1/);assert.match(html,/確認済み（1件）/);assert.match(html,/&lt;img&gt;/);assert.doesNotMatch(html,/相手宛のみ/);assert.doesNotMatch(html,/data-share-seen="old"/);
});
test('failed or repeated acknowledgement keeps unread state and prevents duplicate writes',async()=>{
  let reject;const c=env(['shareReceived','shareUnread','shareSeen'],{err(){},colRef:()=>({doc:()=>({update:()=>new Promise((_,r)=>reject=r)})})});c.state.events=[{id:'a',notice:{to:'h',seenAt:0}}];const p=run(c,"shareSeen('a')");assert.equal(await run(c,"shareSeen('a')"),false);reject(Error('offline'));assert.equal(await p,false);assert.equal(run(c,'shareUnread().length'),1);assert.equal(c.state.shareSeenBusy,null);
});
test('new notification alerts occur once after initial load and never on account switch',()=>{
  const c=env(['shareReceived','shareUnread','shareArrived']);c.state.events=[{id:'a',notice:{to:'h',at:1}}];run(c,'shareArrived()');assert.equal(c.notices.length,0);c.state.events.push({id:'b',notice:{to:'h',at:2}});run(c,'shareArrived()');run(c,'shareArrived()');assert.equal(c.notices.length,1);c.myRole=()=> 'w';c.state.events.push({id:'c',notice:{to:'w',at:3}});run(c,'shareArrived()');assert.equal(c.notices.length,1);
});
test('photo recognition merges into the latest draft, preserving existing food',async()=>{
  let resolve;const c=env(['fridgeItems','fridgeNames','fridgeRead'],{flushExtras(){}});c.state.kakei={fridge:{items:['牛乳']}};c.state.sample={json:()=>new Promise(r=>resolve=r)};const p=run(c,'fridgeRead([{}])');c.state.fridgeDraft='牛乳、米';resolve({items:['卵','牛乳']});await p;assert.equal(c.state.fridgeDraft,'牛乳、米、卵');assert.equal(c.writes.length,0);
});
test('photo and save failures preserve food input and previous saved stock',async()=>{
  const c=env(['fridgeItems','fridgeNames','fridgeRead','fridgeSave'],{flushExtras(){},$:()=>({value:'米、卵'}),kakeiDoc:{update:async()=>{throw Error('offline');}}});c.state.fridgeDraft='米、卵';c.state.kakei={fridge:{items:['牛乳']}};c.state.sample={json:async()=>{throw Error('offline');}};await run(c,'fridgeRead([{}])');await run(c,'fridgeSave()');assert.equal(c.state.fridgeDraft,'米、卵');assert.deepEqual(plain(c.state.kakei.fridge.items),['牛乳']);assert.equal(c.state.fridgeBusy,false);
});
test('music lookup rejects similarly named cover artists and accepts exact normalized artist',async()=>{
  const c=env(['musicKey','songFind'],{itunesJsonp:async()=>({results:[{trackName:'テスト曲',artistName:'スピッツ tribute',trackViewUrl:'wrong'},{trackName:'テスト曲',artistName:'スピッツ',trackViewUrl:'correct'}]})});assert.equal((await run(c,"songFind('テスト曲','スピッツ')")).url,'correct');c.itunesJsonp=async()=>({results:[{trackName:'テスト曲',artistName:'スピ',trackViewUrl:'wrong'}]});assert.equal(await run(c,"songFind('テスト曲','スピッツ')"),null);
});
test('music context changes when favorites change, and prompts include season/weather/time',()=>{
  const c=env(['musicKey','musicArtists','songContext','songPrompt'],{musicTaste:()=> 'スピッツ',wxToday:()=>({code:61}),wxKind:()=> 'rain',WXN:{rain:'雨'},offState:()=> 'both'});const key=run(c,"songContext('2026-09-28')");c.musicTaste=()=> '宇多田ヒカル';assert.notEqual(run(c,"songContext('2026-09-28')"),key);const prompt=run(c,"songPrompt('2026-09-28',3,[])");assert.match(prompt,/季節秋/);assert.match(prompt,/天気雨/);assert.match(prompt,/現在\d+時/);
});
test('another song skips repeated and already seen candidates',()=>{
  const c=env(['musicKey','songId','songTKey','songSeed','songPlayed','songFresh','songNext'],{songOf:d=>c.state.music[0],songAllowed:()=>true,songStop(){},songLookup(){},songPreload(){},songToggle(){},songRender(){},songRefill(){}});
  c.state.music=[{id:'2026-09-28',title:'夜の東側',artist:'サカナクション',context:'today',alts:[{title:'夜の東側',artist:'サカナクション'},{title:'既聴',artist:'サカナクション',seen:true},{title:'新曲',artist:'サカナクション'},{title:'新曲',artist:'サカナクション'}]}];
  run(c,'songNext()');assert.equal(c.state.music[0].title,'新曲');assert.equal(c.writes.at(-1).data.title,'新曲');assert.equal(c.state.music[0].context,'today');
});
test('v231 songs played on earlier days are never picked again, even as another version',()=>{
  const c=env(['musicKey','songId','songTKey','songPlayed','songPast','songFresh']);
  c.state.music=[{id:'2026-10-01',title:'栞',artist:'クリープハイプ',alts:[{title:'イト',artist:'クリープハイプ',seen:true},{title:'未再生',artist:'クリープハイプ'}]}];
  c.L=[{title:'栞 (Live)',artist:'クリープハイプ'},{title:'イト',artist:'Creephyp'},{title:'未再生',artist:'クリープハイプ'},{title:'愛す',artist:'クリープハイプ'}];
  assert.deepEqual(plain(run(c,'songFresh(L,songPlayed()).map(o=>o.title)')),['未再生','愛す']);assert.match(run(c,'songPast().join()'),/栞／クリープハイプ,イト／クリープハイプ/);
});
test('catalog fallback accepts only registered artist and a different track',async()=>{
  const c=env(['musicKey','songId','songTKey','songSeed','songPlayed','songFresh','songCatalogAlternative'],{musicTaste:r=>r==='h'?'サカナクション':'',itunesJsonp:async()=>({results:[{trackName:'夜の東側',artistName:'サカナクション'},{trackName:'別曲',artistName:'サカナクション tribute'},{trackName:'次の曲',artistName:'サカナクション',trackViewUrl:'https://example.com/song'}]})});
  c.used=[{title:'夜の東側',artist:'サカナクション'}];const result=await run(c,'songCatalogAlternative(used)');assert.equal(result.title,'次の曲');assert.equal(result.artist,'サカナクション');
});
test('another song reports failure and retains the current track when no alternative exists',async()=>{
  const c=env(['musicKey','songId','songTKey','songSeed','songPlayed','songFresh','songEnsure'],{songOf:()=>c.state.music[0],songAllowed:()=>true,songContext:()=> 'today',aiText:()=>({json:async()=>{throw Error('offline')}}),songPrompt:()=>'',songPast:()=>[],songCatalogAlternative:async()=>null,songRender(){},songPreload(){},musicTaste:()=> 'サカナクション'});
  c.state.music=[{id:'2026-09-28',title:'夜の東側',artist:'サカナクション',context:'today'}];await run(c,"songEnsure('2026-09-28',true)");assert.equal(c.state.music[0].title,'夜の東側');assert.equal(c.state.songErr,'offline');assert.equal(c.state.songBusy,false);assert.equal(c.writes.length,0);
});
test('v184 release matches reviewed IDs and text, respects reopen/reject, and retains pending notes',()=>{
  const c=env(['bugTextKey','bugDisplay','AI_RELEASE']);c.b={id:'mul0h45lgni00',text:'相手からの共有通知機能追加して',ver:'183',status:'working'};assert.equal(run(c,'bugDisplay(b).fixedVersion'),'184');assert.equal(c.b.status,'working');for(const patch of [{id:'new-report'},{text:'別の問題'},{reopenedAt:1},{status:'rejected'},{ver:'184'}]){c.other={...c.b,...patch};assert.notEqual(run(c,'bugDisplay(other).resolvedBy'),'ai');}c.b={id:'mujd3btg9uap6',text:'food',status:'working',ver:'180'};assert.match(run(c,'bugDisplay(b).releaseNote'),/確認待ち/);assert.equal(run(c,'bugDisplay(b).status'),'working');
});
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
test('shared items keep one time for both people (old per-person times are read once)', () => {
  const c=env(core); c.x={list:'rtask',who:'both',time:'09:00',dayTimes_w:{'2026-09-28':{time:'07:00',dur:20}}};
  assert.equal(run(c,"timeAt(x,'2026-09-28')"),'07:00');
  run(c,"Object.assign(x,timeChangeFor('items',x,'2026-09-28','10:00',60))");
  assert.equal(c.x.dayTimes['2026-09-28'].time,'10:00'); assert.equal(run(c,"timeAt(x,'2026-09-28')"),'10:00');
  c.y={list:'task',who:'both',time:null,time_h:'11:00',time_w:'09:30',dur_h:30,updBy:'w'}; assert.equal(run(c,'myT(y)'),'09:30');
  run(c,"Object.assign(y,timeCh(y,'12:00',60))"); assert.equal(c.y.time,'12:00'); assert.equal(c.y.time_h,null); assert.equal(c.y.time_w,null); assert.equal(run(c,'myT(y)'),'12:00');
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
  const c=env([...core,'REPS','blockRow'],{scheduleShareHTML:()=>'',isEditing:()=>false,wrapRow:(_c,_b,_s,_icon,html)=>html});
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
const ai = [...core,'aiDate','aiTime','aiWho','aiAlt','aiPts','aiChoreFreq','aiAutoConds','AI_AR_KIND','TARGETS','tgtVal','aiRecurring','AI_PREFS','cut2','aiDoAct','applyLocal'];
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
  let calls=0;const c=env(['fridgeItems','fridgeNames','fridgeRead'],{flushExtras(){}});c.state.sample={json:async(p,o)=>{calls++;assert.ok(!Array.isArray(o.images));return {items:['卵',calls===1?'豆腐':'にんじん']};}};
  c.files=[{id:1},{id:2},{id:3},{id:4}];await run(c,'fridgeRead(files)');assert.equal(calls,3);assert.equal(c.state.fridgeDraft,'卵、豆腐、にんじん');assert.equal(c.writes.length,0);assert.equal(c.state.fridgeBusy,false);
});
test('fridge save preserves other shared metadata', async () => {
  let patch;const c=env(['fridgeSave'],{$:()=>({value:'卵、卵\n豆腐'}),kakeiDoc:{update:async x=>{patch=x;}}});c.state.kakei={budget:20000};
  await run(c,'fridgeSave()');assert.deepEqual(plain(patch.fridge.items),['卵','豆腐']);assert.equal(c.state.kakei.budget,20000);assert.equal(patch.budget,undefined);
});
test('favorite template remains after original task is removed and prefs reload', async () => {
  const c=env(['parseFavorites','itemFavorites','itemFavorite','saveItemFavorites','toggleItemFavorite'],{favoritesDoc:null,prefsDoc:null,store:{set(){}},err(){}});c.state.pitems=[{id:'x',text:'買う',list:'shop'}];await run(c,"toggleItemFavorite('pitems','x')");c.state.pitems=[];
  const saved=JSON.stringify(c.prefs);c.prefs=JSON.parse(saved);assert.equal(run(c,'itemFavorites()[0].text'),'買う');assert.equal(run(c,'itemFavorites()[0].private'),true);
});
test('automatic rule AND/OR combinations and empty conditions', () => {
  const c=env(['arAll','arAny','arGroup','arMatch'],{arCond:x=>x.match}); c.r={mode:'and',groups:[{mode:'or',conds:[{match:true},{match:false}]},{mode:'and',conds:[{match:false}]}]};
  assert.equal(run(c,"arMatch(r,'2026-09-28')"),false);c.r.mode='or';assert.equal(run(c,"arMatch(r,'2026-09-28')"),true);c.r.groups=[];assert.equal(run(c,"arMatch(r,'2026-09-28')"),false);
});
test('bug list includes all active requests and folds closed ones', () => {
  const c=env(['BUG_ST','bugOwner','bugDate','bugCard'],{ago:()=>''});c.state.owner=true;c.state.bugs=Array.from({length:25},(_,i)=>({id:'b'+i,text:'request-'+i,status:'new'}));c.state.bugs.push({id:'closed',text:'closed-request',status:'fixed'});
  const html=run(c,'bugCard()');assert.equal((html.match(/request-\d+/g)||[]).length,25);assert.match(html,/<details[^>]*><summary data-bug-history="fixed">対応済み（1件）/);assert.match(html,/closed-request/);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
});
const bugFns=['BUG_ST','bugOwner','bugDate','bugCard','bugSetStatus'];
function bugEnv(extra={}){ const c=env(bugFns,{ago:()=>'',refreshBugCard(){},netMark(){},err(){},...extra});c.state.owner=true;c.state.bugs=[{id:'request',text:'改善要望',status:'new'}];c.colRef=()=>({doc:id=>({update:async data=>c.writes.push({id,data})})});return c; }
test('completion records note, date and version; reopening preserves history',async()=>{
  const c=bugEnv();c.state.bugShowFixed=true;
  assert.equal(await run(c,"bugSetStatus('request','fixed',' 表示を修正 ')"),true);
  assert.equal(c.state.bugs[0].status,'fixed');assert.equal(c.state.bugs[0].fixNote,'表示を修正');assert.ok(c.state.bugs[0].fixedAt>0);assert.equal(c.state.bugs[0].fixedVersion,c.APP_VERSION);assert.equal(c.state.bugShowFixed,false);
  assert.match(run(c,'bugCard()'),/未対応・対応中（0件）/);
  assert.equal(await run(c,"bugSetStatus('request','new')"),true);assert.equal(c.state.bugs[0].status,'new');assert.equal(c.state.bugs[0].fixNote,'表示を修正');assert.ok(c.state.bugs[0].reopenedAt>0);
});
test('completion refuses blank notes, unknown requests and unauthorized callers',async()=>{
  const c=bugEnv();await run(c,"bugSetStatus('request','fixed','  ')");await run(c,"bugSetStatus('missing','fixed','fix')");await run(c,"bugSetStatus('request','invented','fix')");
  c.state.owner=false;c.myRole=()=> 'w';await run(c,"bugSetStatus('request','fixed','fix')");assert.equal(c.writes.length,0);assert.equal(c.state.bugs[0].status,'new');assert.doesNotMatch(run(c,'bugCard()'),/data-bst=/);
});
test('failed save retains active request and note and never reports success',async()=>{
  const c=bugEnv();c.state.bugClosing='request';c.state.bugFixDraft='修正内容';c.colRef=()=>({doc:()=>({update:async()=>{c.state.bugs[0]={...c.state.bugs[0],status:'fixed'};throw Error('offline');}})});
  assert.equal(await run(c,"bugSetStatus('request','fixed','修正内容')"),false);assert.equal(c.state.bugs[0].status,'new');assert.equal(c.state.bugFixDraft,'修正内容');assert.equal(c.state.bugSaving,null);assert.equal(c.notices.length,0);assert.match(run(c,'bugCard()'),/role="alert"/);
});
test('duplicate completion clicks issue only one write and wait for persistence',async()=>{
  const c=bugEnv();let resolve;const saved=new Promise(r=>resolve=r);let calls=0;c.colRef=()=>({doc:()=>({update:async()=>{calls++;await saved;}})});
  const first=run(c,"bugSetStatus('request','fixed','fix')");assert.equal(c.state.bugs[0].status,'new');assert.equal(await run(c,"bugSetStatus('request','fixed','fix')"),false);resolve();await first;assert.equal(calls,1);assert.equal(c.state.bugs[0].status,'fixed');
});
test('fixed and rejected histories are separate, escaped and reopenable',()=>{
  const c=bugEnv();c.state.bugs=[{id:'f',text:'done',status:'fixed',fixedAt:Date.UTC(2026,8,27,16),fixedVersion:'180',fixNote:'<script>bad</script>'},{id:'r',text:'later',status:'rejected'}];
  let html=run(c,'bugCard()');assert.match(html,/対応済み（1件）/);assert.match(html,/見送り（1件）/);assert.match(html,/完了 2026\/9\/28/);assert.match(html,/&lt;script&gt;bad/);assert.doesNotMatch(html,/<script>/);assert.equal((html.match(/未対応に戻す/g)||[]).length,2);
  c.state.bugShowFixed=true;html=run(c,'bugCard()');assert.match(html,/<details[^>]*\bopen><summary data-bug-history="fixed"/);assert.doesNotMatch(html,/<details[^>]*\bopen><summary data-bug-history="rejected"/);
});
test('all active statuses including legacy requests can complete directly',()=>{
  const c=bugEnv();c.state.bugs=['new','working','proposed','approved',undefined].map((status,i)=>({id:String(i),text:'item',status}));
  assert.equal((run(c,'bugCard()').match(/data-bst="fixed"/g)||[]).length,5);
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
test('AI prompt retains question and stays within the backend 40k limit', async () => {
  let prompt=''; const c=env(['AI_PREFS','AI_ACT_L','aiAsk'],{aiCan:()=>true,aiCtx:()=> '状況'.repeat(10000),aiMemB:()=>[],aiMemP:()=>[]});
  c.state._smt={json:async p=>{prompt=p;return {reply:'test',acts:[]};}};
  c.state.ai.log=Array.from({length:3},()=>({q:'q'.repeat(1000),a:{reply:'a'.repeat(1000)}}));
  await run(c,"aiAsk('質問'.repeat(2000))");assert.ok(prompt.length<=40000,`prompt=${prompt.length}`);assert.ok(prompt.indexOf('【今回の質問】')<300);assert.equal(c.state.ai.busy,false);
});
test('auto rules create private tasks, retain completed items and honor skips', () => {
  const c=env(['tmin','arMade','AR_COL','AR_SHARED','autoCook'],{setTimeout:f=>{f();return 1;},clearTimeout(){},autoTimer:null,arWriting:false,db:null,privBase:null,arSkip:()=>new Set(['rule:2026-09-29']),arRules:()=>[{id:'rule',kind:'task',on:true,name:'料理',s:'18:00',e:'19:00'}],arMatch:()=>true});
  Object.assign(c.state,{blocksLoaded:true,pitemsLoaded:true,shiftsLoaded:true});
  c.state.pitems=[{id:'auto_rule_2026-09-28',auto:'rule',done:true,text:'完了済み',due:'2026-09-28'}];run(c,'autoCook()');
  assert.ok(c.writes.every(x=>x.c==='pitems'));assert.ok(c.writes.every(x=>!['auto_rule_2026-09-28','auto_rule_2026-09-29'].includes(x.id)));assert.equal(c.writes.length,58);
});
test('timetable badges reuse tags and a line lock without redundant private assignee', () => {
  const c=env(['isRecItem','ttInfo','ttMeta','ttBadges'],{LKI:'<svg class="lk-i"></svg>'});c.o={c:'blocks',kind:'b',x:{}};
  const html=run(c,'ttBadges(o)');assert.match(html,/tag tt-kind/);assert.match(html,/tag lk/);assert.match(html,/class="lk-i"/);assert.doesNotMatch(html,/🔒|tt-person/);
  assert.equal(run(c,'ttMeta(o)'),'予定 · 自分だけ · h');
});
test('shared badges retain assignee, escape names and provide an inline accessibility mode', () => {
  const c=env(['isRecItem','ttInfo','ttMeta','ttBadges'],{LKI:'',nameOf:()=>'<long name>'});c.o={c:'items',kind:'i',x:{list:'rtask',who:'w'}};
  const html=run(c,'ttBadges(o,true)');assert.match(html,/くり返し/);assert.match(html,/共有/);assert.match(html,/w-w/);assert.match(html,/&lt;long name&gt;/);assert.match(html,/aria-hidden="true"/);
});
test('compact timetable cards omit metadata and selected details separate title from time', () => {
  assert.match(declaration('timetable'),/ht>=60\?ttBadges\(o,true\):""/);
  assert.match(declaration('ttBarHTML'),/class="tb-title"/);assert.match(declaration('ttBarHTML'),/class="tb-time"/);
  assert.doesNotMatch(declaration('ttBarHTML'),/esc\(ttMeta\(o\)\)/);
});
test('all recurrence scope resets shared overrides for both people and keeps logs',()=>{
  const c=env(core);c.x={list:'rtask',who:'both',time:'09:00',dayTimes_h:{'2026-09-28':{time:'10:00'}},dayTimes_w:{'2026-09-28':{time:'08:00'}},log:{'2026-09-27':true}};
  run(c,"Object.assign(x,timeChangeFor('items',x,'2026-09-28','12:00',60,'all'))");
  assert.equal(c.x.dayTimes_h,null);assert.equal(c.x.dayTimes_w,null);assert.equal(c.x.dayTimes,null);assert.equal(c.x.time,'12:00');assert.equal(c.x.log['2026-09-27'],true);
  assert.equal(run(c,"timeAt(x,'2026-09-29')"),'12:00');
});
test('v230 AI adds chores with frequency, rotation and points, and money items',()=>{
  const c=env(ai,{money:v=>Number(String(v).replace(/[^0-9]/g,''))||null,RKIND:{fixed:{l:'固定費'},var:{l:'変動費'},save:{l:'貯金'}},ymOf:d=>d.slice(0,7)});
  let w=act(c,{type:'add_chore',text:'ゴミ集め',target:'iv',every:7,who:'alt',pts:2});assert.equal(w.c,'chores');assert.equal(w.data.every,7);assert.equal(w.data.who,'alt');assert.equal(w.data.pts,2);assert.equal(w.data.target,undefined);
  w=act(c,{type:'add_chore',text:'風呂掃除',target:'wd',wd:[6],who:'me',time:'10:00',end:'10:30'});assert.equal(w.data.target,'wd');assert.deepEqual(plain(w.data.wd),[6]);assert.equal(w.data.dur,30);assert.equal(w.data.who,'h');
  c.writes.length=0;act(c,{type:'add_chore',text:'x',target:'iv',every:0});assert.equal(c.writes.length,0);
  w=act(c,{type:'add_money',text:'保険',kind:'fixed',amount:5000,day:27,who:'both'});assert.equal(w.c,'recur');assert.equal(w.data.amount,5000);assert.equal(w.data.day,27);
});
test('AI recurring creation supports every frequency and explicit private/shared assignees',()=>{
  const c=env(ai);const targets=run(c,'TARGETS.map(x=>x[0])');
  for(const target of targets){c.writes.length=0;const w=act(c,{type:'add_recurring',text:'routine',target,wd:[1,3],nth:[1,-1],every:4,mEvery:2,mStart:'2026-10-01',date:'2026-10-01',time:'23:30',end:'00:00',who:'priv'});assert.equal(w.c,'habits');assert.equal(String(w.data.target),target);assert.equal(w.data.since,'2026-10-01');assert.equal(w.data.dur,30);assert.equal(w.data.who,undefined);}
  const w=act(c,{type:'add_recurring',text:'shared',target:'wd',wd:[2],who:'妻'});assert.equal(w.c,'items');assert.equal(w.data.who,'w');assert.equal(w.data.list,'rtask');
});
test('AI refuses invalid recurrence parameters and unknown people without writes',()=>{
  for(const bad of [{target:'unknown'},{target:'wd',wd:[]},{target:'wd',wd:[8]},{target:'mn',wd:[1],nth:[0]},{target:'iv',every:0},{target:'iv',every:1.5},{target:'mo',mEvery:13},{target:'7',who:'unknown'}]){const c=env(ai);act(c,{type:'add_recurring',text:'test',...bad});assert.equal(c.writes.length,0,JSON.stringify(bad));}
});
test('future daily habits are absent before their explicit start date',()=>{
  const c=env(['aiDate','hSince','tgtCode','hOn','hTodayList'],{habitDue:()=>null,HFOL:[],habitLog:()=>({})});
  c.state.habits=[{id:'future',target:7,since:'2026-10-01',createdAt:1},{id:'current',target:7,since:'2026-09-01'}];
  assert.deepEqual(plain(run(c,'hTodayList().map(x=>x.id)')),['current']);assert.equal(run(c,"hOn(state.habits[0],'2026-09-30')"),false);assert.equal(run(c,"hOn(state.habits[0],'2026-10-01')"),true);
});
test('AI recurrence changes do not overwrite completion logs',()=>{
  const c=env(ai);c.state.habits=[{id:'h1',target:'wd',wd:[1],log:{'2026-09-28':true}}];
  act(c,{type:'edit',_r:{c:'habits',id:'h1'},target:'wd',wd:[2]});assert.equal(c.state.habits[0].log['2026-09-28'],true);
});
const shareFns=['aiDate','tmin','hhmm','sharePayload','shareEntry','shareReceived','shareUnread','shareSeen'];
test('sharing copies only explicit title and occurrence and targets the other person',()=>{
  const c=env(shareFns);c.o={t:'帰宅',s:1080,e:1140,x:{text:'帰宅',memo:'secret',log:{},rep:'daily',dayTimes:{}}};
  const p=plain(run(c,"sharePayload(o,'2026-09-28',1000)"));assert.equal(p.start,'18:00');assert.equal(p.notice.to,'w');assert.equal(p.who,'both');for(const key of ['memo','log','rep','dayTimes','id'])assert.equal(p[key],undefined);
  c.o={t:'終日予定',x:{allDay:true}};const a=run(c,"sharePayload(o,'2026-09-28')");assert.equal(a.start,undefined);assert.equal(a.end,undefined);
});
test('sharing waits for save, suppresses double clicks and retains a retry ID on failure',async()=>{
  const c=env(shareFns,{netMark(){},err(){}});c.o={t:'帰宅',s:1080,e:1140,x:{}};let resolve,count=0;c.colRef=()=>({doc:()=>({set:async()=>{count++;await new Promise(r=>resolve=r);}})});
  const first=run(c,"shareEntry(o,'2026-09-28')");assert.equal(c.state.events.length,0);assert.equal(await run(c,"shareEntry(o,'2026-09-28')"),false);resolve();assert.equal(await first,true);assert.equal(count,1);assert.equal(c.state.events.length,1);
  c.colRef=()=>({doc:()=>({set:async()=>{throw Error('offline');}})});assert.equal(await run(c,"shareEntry(o,'2026-09-29')"),false);assert.ok(c.state.sharePendingId);assert.equal(c.state.events.length,1);assert.equal(c.state.shareBusy,false);
});
test('only recipients see and acknowledge share notifications',async()=>{
  const c=env(shareFns,{err(){}});c.state.events=[{id:'a',notice:{to:'w',from:'h',at:5,seenAt:0}},{id:'b',notice:{to:'h',from:'w',at:3,seenAt:0}}];c.colRef=()=>({doc:id=>({update:async data=>c.writes.push({id,data})})});
  assert.deepEqual(plain(run(c,'shareUnread().map(x=>x.id)')),['b']);await run(c,"shareSeen('a')");assert.equal(c.writes.length,0);await run(c,"shareSeen('b')");assert.equal(c.writes.length,1);assert.equal(run(c,'shareUnread().length'),0);
});
test('favorite document survives legacy preference resets and failed optimistic writes',async()=>{
  const c=env(['parseFavorites','itemFavorites','saveItemFavorites'],{store:{set(){}},err(){},prefsDoc:null});c.state.favoritesLoaded=true;c.state.favorites=[{text:'keep',list:'task'}];c.prefs.itemFavorites='[]';assert.equal(run(c,'itemFavorites()[0].text'),'keep');
  c.favoritesDoc={set:async()=>{c.state.favorites=[{text:'optimistic',list:'task'}];throw Error('offline');}};assert.equal(await run(c,"saveItemFavorites([{text:'new',list:'task'}])"),false);assert.equal(run(c,'itemFavorites()[0].text'),'keep');assert.equal(c.state.favoriteSaving,false);
});
test('favorite migration uses a separate per-user document and loads its saved list',()=>{
  let cb,written,path;const c=env(['parseFavorites','itemFavorites','bindFavorites'],{favoritesDoc:null,store:{set(){}},err(){},db:{doc:p=>{path=p;return {onSnapshot:f=>cb=f,set:async x=>written=x};}}});c.prefs.itemFavorites='[{"text":"migrated","list":"shop"}]';run(c,'bindFavorites()');assert.equal(path,'data/users/test-user/favorites');cb({exists:false,fromCache:false});assert.equal(written.items[0].text,'migrated');cb({exists:true,data:()=>written});assert.equal(c.state.favoritesLoaded,true);assert.equal(run(c,'itemFavorites()[0].text'),'migrated');
});
const quickFns=['tmin','hhmm','aiDate','aiTime','aiWho','QK','qNames','nextDow','quickRule','quickParse'];
test('quick input preserves full years, normalizes digits and handles noon and midnight',()=>{
  const c=env(quickFns,{nameOf:r=>r==='h'?'りく':'のり'});
  c.src='２０２７年２月１日 午前１２時３０分 自分だけ 会議';let r=run(c,'quickRule(src)');assert.equal(r.date,'2027-02-01');assert.equal(r.time,'00:30');assert.equal(r.kind,'block');assert.equal(r.who,'priv');
  assert.equal(run(c,"quickRule('今日 午後12時 会議').time"),'12:00');assert.equal(run(c,"quickRule('今日 午後11時〜午前12時 会議').end"),'00:00');assert.equal(run(c,"quickRule('2026年2月30日 会議').invalidDate"),true);
  assert.equal(run(c,"quickRule('のりを買う').who"),'both');assert.equal(run(c,"quickRule('のり 明日 牛乳を買う').who"),'w');
});
test('weekday references use the correct week even on Sunday',()=>{
  const c=env(quickFns);assert.equal(run(c,"nextDow('2026-09-27',1,'next')"),'2026-09-28');assert.equal(run(c,"nextDow('2026-09-27',0,'current')"),'2026-09-27');assert.equal(run(c,"nextDow('2026-09-28',1,'next')"),'2026-10-05');
});
test('AI cannot override explicit quick-input date, time, or privacy',async()=>{
  const c=env(quickFns,{aiText:()=>({json:async()=>({kind:'event',text:'会議',date:'2028-05-03',time:'10:00',end:'11:00',who:'both'})})});
  const r=await run(c,"quickParse('2027年2月1日 午前12時〜午前1時 自分だけ 会議')");assert.equal(r.date,'2027-02-01');assert.equal(r.time,'00:00');assert.equal(r.end,'01:00');assert.equal(r.kind,'block');assert.equal(r.who,'priv');
  c.aiText=()=>({json:async()=>({kind:'topic',text:'private',who:'both'})});assert.equal((await run(c,"quickParse('自分だけ 秘密のメモ')")).kind,'ptask');
});
test('malformed AI quick dates and times remain explicit errors',async()=>{
  const c=env(quickFns,{aiText:()=>({json:async()=>({kind:'event',text:'会議',date:'2026-02-30',time:'25:00'})})});const r=await run(c,"quickParse('会議を追加')");assert.equal(r.invalidDate,true);assert.equal(r.invalidTime,true);
});
test('AI completion labels only the reviewed old request and never mutates source data',()=>{
  const c=env(['AI_RELEASE','bugTextKey','bugDisplay','bugExportData']);const text=run(c,'AI_RELEASE.fixes[0][0]');c.b={id:'old',text,status:'new',ver:'180'};
  const shown=run(c,'bugDisplay(b)');assert.equal(shown.status,'fixed');assert.equal(shown.resolvedBy,'ai');assert.equal(c.b.status,'new');assert.ok(shown.fixNote);assert.equal(shown.fixedVersion,'181');
  for(const patch of [{ver:'181'},{ver:undefined},{text:text+' まだ直らない'},{reopenedAt:1},{status:'working'},{status:'rejected'}]){c.other={...c.b,...patch};assert.notEqual(run(c,'bugDisplay(other).resolvedBy'),'ai');}
  c.state.bugs=[c.b];assert.equal(run(c,'bugExportData().requests[0].resolvedBy'),'ai');assert.equal(run(c,'AI_RELEASE.fixes.length'),19);
});
test('AI completion can be reopened without closing again and retains release history',async()=>{
  const c=bugEnv();c.state.bugs=[{id:'request',text:run(c,'AI_RELEASE.fixes[0][0]'),ver:'180',status:'new'}];
  assert.match(run(c,'bugCard()'),/AI対応済み 1件/);assert.equal(await run(c,"bugSetStatus('request','new')"),true);assert.equal(run(c,'bugDisplay(state.bugs[0]).status'),'new');assert.equal(c.state.bugs[0].fixedVersion,'181');assert.ok(c.state.bugs[0].fixNote);assert.doesNotMatch(run(c,'bugCard()'),/AI対応済み 1件/);
});
test('partially tested AI features remain active with a specific remaining-work note',()=>{
  const c=bugEnv();c.state.bugs=run(c,"AI_RELEASE.pending.map(([text])=>({text,ver:'180',status:'new'}))");const html=run(c,'bugCard()');assert.match(html,/未対応・対応中（5件）/);assert.match(html,/一部対応・確認待ち/);assert.match(html,/対応済み（0件）/);
});
test('recurrence edits ending at midnight preserve valid 00:00 and duration',()=>{
  const c=env(ai);c.x={rep:'daily',start:'21:00',end:'22:00'};assert.equal(run(c,"timeChangeFor('blocks',x,'2026-09-28','23:30',30,'all').end"),'00:00');
  c.state.habits=[{id:'h1',target:7,time:'21:00',dur:60}];act(c,{type:'edit',_r:{c:'habits',id:'h1'},date:'2026-09-28',time:'23:30',end:'00:00'});assert.equal(c.state.habits[0].dayTimes['2026-09-28'].dur,30);
});
test('quick commit keeps a private event private and rejects invalid dates',()=>{
  const values={qText:{value:'秘密の予定'},qDate:{value:'2027-02-01'},qTime:{value:'10:00'},qEnd:{value:'11:00'}};
  const c=env([...quickFns,'quickCommit'],{$:id=>values[id],short:x=>x});c.state.quick={r:{kind:'block',text:'秘密の予定',who:'priv'}};run(c,'quickCommit()');assert.equal(c.writes[0].c,'blocks');assert.equal(c.writes[0].data.who,undefined);assert.equal(c.writes[0].data.end,'11:00');
  c.state.quick={r:{kind:'block',text:'秘密の予定',invalidDate:true}};values.qDate.value='';run(c,'quickCommit()');assert.equal(c.writes.length,1);assert.ok(c.state.quick);
});
const requestFns=['AI_RELEASE','bugTextKey','bugDisplay','bugCanRequest','bugNormalizePlan','bugPlanOf','bugHandoffOf','bugPlanPrompt','bugDevPrompt','bugAIProgress','bugSavePlan','bugGeneratePlan','bugRecordHandoff','bugCopyRequest','bugShareRequest','bugAIPanel','bugSubmit'];
function requestEnv(extra={}){const fields={bugText:{value:'保存済み要望'}};const c=env(requestFns,{$:id=>fields[id]||null,refreshBugCard(){},netMark(){},setInterval:()=>1,clearInterval(){},navigator:{},...extra});c.fields=fields;c.state.bugs=[{id:'request',text:'操作を改善して',status:'new',ver:'181',view:'cal'}];c.colRef=()=>({doc:id=>({update:async data=>c.writes.push({op:'update',id,data}),set:async data=>c.writes.push({op:'set',id,data})})});return c;}
const planFixture={summary:'カレンダー操作を改善する',changes:['スワイプ判定を調整する'],tests:['スワイプすると翌月へ移動する'],questions:[]};
test('AI improvement prompt includes only the chosen request, not account or private data',()=>{
  const c=requestEnv();c.state.me='SECRET_UID';c.state.events=[{text:'PRIVATE_EVENT'}];c.state.fam={h:'PRIVATE_NAME'};c.state.bugs[0].ua='PRIVATE_UA';c.state.bugs[0].err='SECRET_TOKEN';c.state.bugs[0].by='AUTHOR_UID';const prompt=run(c,'bugPlanPrompt(state.bugs[0])');assert.ok(prompt.includes('操作を改善して'));assert.doesNotMatch(prompt,/SECRET|PRIVATE|AUTHOR/);assert.ok(prompt.length<20000);
  const handoff=run(c,'bugDevPrompt(state.bugs[0])');assert.match(handoff,/rikuouchi-pra\/futari/);assert.match(handoff,/要望ID：request/);assert.doesNotMatch(handoff,/SECRET|PRIVATE|AUTHOR/);
});
test('AI plan requires bounded structured fields and ignores executable actions/status',()=>{
  const c=requestEnv();c.raw={...planFixture,summary:'a'.repeat(800),changes:Array(10).fill('b'.repeat(600)),status:'fixed',acts:[{type:'delete'}],html:'<script>'};const p=run(c,'bugNormalizePlan(raw)');assert.equal(p.summary.length,500);assert.equal(p.changes.length,6);assert.equal(p.changes[0].length,300);assert.equal(p.status,undefined);assert.equal(p.acts,undefined);
  for(const raw of [{},{summary:'x',changes:[],tests:['t']},{...planFixture,tests:'bad'}]){c.raw=raw;assert.throws(()=>run(c,'bugNormalizePlan(raw)'));}
});
test('AI improvement generation saves a plan without changing request status',async()=>{
  let prompt;const c=requestEnv({aiText:()=>({json:async p=>{prompt=p;return {...planFixture,status:'fixed'};}})});assert.equal(await run(c,"bugGeneratePlan('request')"),true);assert.equal(c.state.bugs[0].status,'new');assert.equal(c.state.bugs[0].aiPlan.appVersion,c.APP_VERSION);assert.equal(c.writes[0].data.status,undefined);assert.equal(c.writes[0].data.fixedVersion,undefined);assert.ok(prompt);assert.equal(c.state.bugAIJob,null);
});
test('double plan clicks make one AI call and do not indicate completion while waiting',async()=>{
  let resolve,calls=0;const c=requestEnv({aiText:()=>({json:async()=>{calls++;return await new Promise(r=>resolve=r);}})});const first=run(c,"bugGeneratePlan('request')");assert.equal(await run(c,"bugGeneratePlan('request')"),false);assert.equal(c.writes.length,0);assert.equal(c.state.bugAIJob.phase,'asking');resolve(planFixture);await first;assert.equal(calls,1);assert.equal(c.state.bugs[0].status,'new');
});
test('AI/save failures are retryable without regenerating a successful plan',async()=>{
  let calls=0;const c=requestEnv({aiText:()=>({json:async()=>{calls++;return planFixture;}})});c.colRef=()=>({doc:()=>({update:async data=>{c.state.bugs[0].aiPlan=data.aiPlan;throw Error('offline');}})});assert.equal(await run(c,"bugGeneratePlan('request')"),false);assert.equal(c.state.bugs[0].aiPlan,undefined);assert.ok(c.state.bugAIUnsaved.plan);assert.match(c.state.bugAIError,/保存/);
  c.colRef=()=>({doc:()=>({update:async data=>c.writes.push(data)})});assert.equal(await run(c,"bugSavePlan('request',state.bugAIUnsaved.plan)"),true);assert.equal(calls,1);assert.equal(c.state.bugAIUnsaved,null);assert.equal(c.state.bugs[0].status,'new');
});
test('disabled AI and failed model response preserve the manual handoff path',async()=>{
  const c=requestEnv({aiText:()=>null});assert.equal(await run(c,"bugGeneratePlan('request')"),false);assert.equal(c.writes.length,0);assert.match(c.state.bugAIError,/原文/);assert.ok(run(c,'bugDevPrompt(state.bugs[0])'));
  c.aiText=()=>({json:async()=>{throw Error('model unavailable');}});assert.equal(await run(c,"bugGeneratePlan('request')"),false);assert.equal(c.state.bugAIJob,null);assert.equal(c.writes.length,0);
});
test('response arriving after request closure or changes cannot store a stale plan',async()=>{
  for(const change of ['closed','edited']){const c=requestEnv({aiText:()=>({json:async()=>{if(change==='closed')c.state.bugs[0].status='fixed';else c.state.bugs[0].text='別の要望';return planFixture;}})});assert.equal(await run(c,"bugGeneratePlan('request')"),false);assert.equal(c.writes.length,0);}
});
test('copying prepares a handoff but never claims AI delivery or code completion',async()=>{
  let copied;const c=requestEnv({navigator:{clipboard:{writeText:async t=>copied=t}}});assert.equal(await run(c,"bugCopyRequest('request')"),true);assert.match(copied,/操作を改善して/);assert.equal(c.state.bugs[0].devHandoff.stage,'prepared');assert.equal(c.state.bugs[0].devHandoff.confirmedAt,undefined);assert.equal(c.state.bugs[0].status,'new');
  assert.equal(await run(c,"bugRecordHandoff('request','requested')"),true);assert.equal(c.state.bugs[0].devHandoff.stage,'requested');assert.ok(c.state.bugs[0].devHandoff.confirmedAt);assert.equal(c.state.bugs[0].status,'new');await run(c,"bugCopyRequest('request')");assert.equal(c.state.bugs[0].devHandoff.stage,'requested');
});
test('clipboard denial, cancelled share and failed persistence never mark a request sent',async()=>{
  const c=requestEnv({navigator:{clipboard:{writeText:async()=>{throw Error('denied');}},share:async()=>{const e=Error('cancel');e.name='AbortError';throw e;}}});assert.equal(await run(c,"bugCopyRequest('request')"),false);assert.equal(c.writes.length,0);assert.equal(await run(c,"bugShareRequest('request')"),false);assert.equal(c.writes.length,0);assert.equal(c.state.bugTransferring,false);
  c.colRef=()=>({doc:()=>({update:async data=>{c.state.bugs[0].devHandoff=data.devHandoff;throw Error('offline');}})});assert.equal(await run(c,"bugRecordHandoff('request','prepared')"),false);assert.equal(c.state.bugs[0].devHandoff,undefined);
});
test('share success records preparation only because native share cannot prove delivery',async()=>{
  const c=requestEnv({navigator:{share:async()=>{}}});assert.equal(await run(c,"bugShareRequest('request')"),true);assert.equal(c.state.bugs[0].devHandoff.stage,'prepared');assert.equal(c.state.bugs[0].status,'new');
});
test('reopened or revised requests do not reuse old plans and handoff labels',()=>{
  const c=requestEnv();c.state.bugs[0].aiPlan={...planFixture,requestText:c.state.bugs[0].text,appVersion:c.APP_VERSION,at:1};c.state.bugs[0].devHandoff={requestText:c.state.bugs[0].text,appVersion:c.APP_VERSION,at:1,stage:'requested'};assert.ok(run(c,'bugPlanOf(state.bugs[0])'));c.state.bugs[0].reopenedAt=2;assert.equal(run(c,'bugPlanOf(state.bugs[0])'),null);assert.equal(run(c,'bugHandoffOf(state.bugs[0])'),null);
  delete c.state.bugs[0].reopenedAt;c.state.bugs[0].text='new';assert.equal(run(c,'bugPlanOf(state.bugs[0])'),null);assert.equal(run(c,'bugHandoffOf(state.bugs[0])'),null);
});
test('request panel escapes model text and hides actions for fixed/anonymous records',()=>{
  const c=requestEnv();c.state.bugAIOpen='request';c.state.bugs[0].aiPlan={...planFixture,summary:'<img onerror=alert(1)>',requestText:c.state.bugs[0].text,appVersion:c.APP_VERSION,at:1};const html=run(c,'bugAIPanel(state.bugs[0])');assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/改善案・未実装/);assert.match(html,/依頼文をコピー/);assert.match(html,/リンクを開くだけでは送信されません/);c.state.bugs[0].status='fixed';assert.equal(run(c,'bugAIPanel(state.bugs[0])'),'');c.state.bugs[0].status='new';c.state.me=null;assert.equal(run(c,'bugAIPanel(state.bugs[0])'),'');
});
test('save-and-request opens the correct persisted request without invoking AI',async()=>{
  const c=requestEnv();assert.equal(await run(c,'bugSubmit(true)'),true);assert.equal(c.state.bugAIOpen,'new-id');assert.equal(c.writes[0].op,'set');assert.equal(c.writes[0].data.status,'new');assert.equal(c.state.bugDraft,'');assert.equal(c.state.bugDraftId,null);
});
test('failed request submission keeps its text and ID for retry and deduplicates clicks',async()=>{
  const c=requestEnv();let reject,calls=0;c.colRef=()=>({doc:()=>({set:async()=>{calls++;await new Promise((_r,j)=>reject=j);}})});const first=run(c,'bugSubmit(true)');assert.equal(await run(c,'bugSubmit(true)'),false);reject(Error('offline'));assert.equal(await first,false);assert.equal(calls,1);assert.equal(c.state.bugDraft,'保存済み要望');assert.equal(c.state.bugDraftId,'new-id');assert.equal(c.state.bugAIOpen,undefined);assert.match(c.state.bugSaveError,/保存できません/);
});

const separatedFns=[...core,'recColl','recTasks','recMine','ttRecurrences','tgtCode','hDaily'];
function separatedEnv(names=[],extra={}){return env([...separatedFns,...names],{forMe:x=>!x.who||x.who==='both'||x.who==='h',hFollow:()=>true,recToday:()=>true,recOn:()=>true,hSince:h=>h.since||'2020-01-01',habitLog:h=>h.log||{},hMiss:()=>false,...extra});}
function mixedHabits(c){c.state.habits=[{id:'daily',text:'毎日の習慣',target:7,time:'07:00',log:{}},{id:'weekly',text:'週1の習慣',target:'wd',wd:[1],time:'08:00',log:{}},{id:'private-rec',text:'自分の繰り返しタスク',entryKind:'task',target:7,time:'09:00',log:{}}];c.state.items=[{id:'shared-rec',text:'共有の繰り返しタスク',list:'rtask',who:'both',target:'wd',wd:[1],time:'10:00',log:{}},{id:'partner-rec',text:'相手の繰り返しタスク',list:'rtask',who:'w',target:7,time:'11:00',log:{}}];}
test('habit/task classification follows kind rather than daily or weekly frequency',()=>{
  const c=separatedEnv();mixedHabits(c);const before=JSON.stringify(c.state.habits);
  assert.deepEqual(plain(run(c,'habitItems().map(x=>x.id)')),['daily','weekly']);
  assert.deepEqual(plain(run(c,'recMine().map(x=>x.id)')),['private-rec','shared-rec']);
  assert.equal(JSON.stringify(c.state.habits),before);
});
test('task view includes private and shared recurring tasks but no habits',()=>{
  const c=separatedEnv(['viewList','sortItems'],{byWho:x=>x.filter(y=>!y.who||y.who==='both'||y.who==='h'),whoBar:()=>'',itemFavorites:()=>[],jpDate:x=>x,habitRow:x=>x.text,itemRow:x=>x.text,PULL_HINT:'',LKI:''});mixedHabits(c);c.prefs.whoF='all';
  const html=run(c,'viewList("task")');assert.match(html,/自分の繰り返しタスク/);assert.match(html,/共有の繰り返しタスク/);assert.doesNotMatch(html,/毎日の習慣|週1の習慣|相手の繰り返しタスク/);
  assert.match(run(c,'viewList("task","pitems")'),/自分の繰り返しタスク/);
  c.prefs.whoF='w';c.byWho=x=>x.filter(y=>y.who==='w');const partner=run(c,'viewList("task")');assert.match(partner,/相手の繰り返しタスク/);assert.doesNotMatch(partner,/自分の繰り返しタスク/);
});
test('habit view includes every habit frequency and excludes private tasks',()=>{
  const c=separatedEnv(['viewHabit'],{weekGoal:()=>1,habitStats:()=>({count:0}),hTodayHTML:()=>'',HABIT_TPL:[],habitRow:x=>x.text,weekStarts:()=>[],barChart:()=>'',short:x=>x,habitHeatHTML:()=>'',hTodayList:()=>[]});mixedHabits(c);
  const html=run(c,'viewHabit()');assert.match(html,/毎日の習慣/);assert.match(html,/週1の習慣/);assert.doesNotMatch(html,/繰り返しタスク|やること」でも/);
});
test('habit reminders never include private recurring tasks',()=>{
  const c=separatedEnv(['hTodayList'],{hOn:()=>true,habitDue:()=>null,HFOL:[]});mixedHabits(c);
  assert.deepEqual(plain(run(c,'hTodayList().map(x=>x.id)')),['daily','weekly']);
});
test('menu badges count habits and recurring tasks in separate totals',()=>{
  const c=separatedEnv(['counts'],{isEve:()=>false,choreDueCount:()=>0,dueNow:()=>true,shiftMissing:()=>[],talkBadge:()=>0,mySched:()=>[]});mixedHabits(c);Object.assign(c.state,{comments:[],troubles:[],cautions:[],topics:[]});
  const n=run(c,'counts()');assert.equal(n.habit,2);assert.equal(n.task,1);assert.equal(n.ptask,1);
});
test('timetable hides opted-out habits including their saved daily overrides',()=>{
  const c=separatedEnv(['dayEntries'],{blocksFor:()=>[],choreMine:()=>false});mixedHabits(c);
  c.state.habits[1].showInTimetable=false;c.state.habits[1].dayTimes={'2026-09-28':{time:'12:00',dur:30}};
  assert.deepEqual(plain(run(c,'dayEntries(today()).map(o=>o.x.id)')),['daily','private-rec','shared-rec']);
  c.state.habits[1].showInTimetable=true;
  assert.deepEqual(plain(run(c,'dayEntries(today()).map(o=>o.x.id)')),['daily','private-rec','shared-rec','weekly']);
  assert.equal(c.state.habits[1].time,'08:00');assert.equal(c.state.habits[1].dayTimes['2026-09-28'].time,'12:00');
});
test('untimed tray respects habit opt-in and explicit start date',()=>{
  const c=separatedEnv(['ttMine','ttUntimed'],{choreMine:()=>false});mixedHabits(c);c.state.habits.forEach(x=>{delete x.time;});c.state.items=[];
  c.state.habits[1].showInTimetable=false;assert.deepEqual(plain(run(c,'ttUntimed(today()).map(o=>o.x.id)')),['daily','private-rec']);
  c.state.habits[1].showInTimetable=true;c.state.habits[0].since='2026-10-01';assert.deepEqual(plain(run(c,'ttUntimed(today()).map(o=>o.x.id)')),['weekly','private-rec']);
});
test('private recurring tasks are labeled as tasks in timetable and edit navigation',()=>{
  const c=separatedEnv(['ttInfo','editHome']);mixedHabits(c);c.x=c.state.habits[2];assert.equal(run(c,'ttInfo({c:"habits",x,kind:"i"}).type'),'繰り返しタスク');assert.equal(run(c,'editHome("habits",x)'),'task');
  c.x=c.state.habits[1];assert.equal(run(c,'ttInfo({c:"habits",x,kind:"i"}).type'),'習慣');assert.equal(run(c,'editHome("habits",x)'),'habit');
});
function habitEditEnv(kind='habit'){const fields={editText:{value:'保つ記録'},hTime:{value:'07:00'},hEnd:{value:'07:30'},hTimetable:{checked:false}};const c=separatedEnv(['saveEdit','tgtVal'],{$:id=>fields[id]||null,editSeg:{},syncItemSpend(){}});c.state.habits=[{id:'h',text:'保つ記録',entryKind:kind,target:7,time:'07:00',dur:30,log:{'2026-09-27':1},dayTimes:{'2026-09-28':{time:'08:00',dur:30}}}];c.state.editing={c:'habits',id:'h'};c.fields=fields;return c;}
test('habit opt-out editing retains history, times and collection without moving records',()=>{
  const c=habitEditEnv();run(c,'saveEdit()');assert.equal(c.writes.length,1);assert.equal(c.writes[0].op,'update');assert.equal(c.writes[0].c,'habits');assert.deepEqual(plain(c.writes[0].data),{showInTimetable:false});assert.equal(c.state.habits[0].log['2026-09-27'],1);
});
test('legacy habit can be reclassified as a private task without rewriting history',()=>{
  const c=habitEditEnv();delete c.state.habits[0].entryKind;c.editSeg.hkind='task';run(c,'saveEdit()');assert.equal(c.writes.length,1);assert.equal(c.writes[0].data.entryKind,'task');assert.equal(c.writes[0].data.log,undefined);assert.equal(c.writes[0].data.dayTimes,undefined);assert.equal(c.writes[0].data.who,undefined);
});
test('changing a private task into a habit cannot publish it through a stale assignee selection',()=>{
  const c=habitEditEnv('task');c.editSeg={hkind:'habit',ewho:'both'};run(c,'saveEdit()');assert.equal(c.writes.length,1);assert.equal(c.writes[0].c,'habits');assert.equal(c.writes[0].data.entryKind,'habit');assert.equal(c.writes[0].data.who,undefined);
});
function submitSheet(c,S){const fields={input:{value:'新規の記録'},form:{addEventListener:(_event,fn)=>{c.submitSheet=fn;}}};c.$=id=>fields[id]||null;c.state.sheet=S;c.KINDS={habit:{label:'習慣'},task:{label:'やること'}};c.closeSheet=()=>{};c.setTimeout=()=>{};c.tgtLabel=()=>'';c.money=()=>0;c.renderSheet=()=>{};c.document={querySelector:()=>null};const start=source.indexOf('$("form").addEventListener("submit",e=>{'),end=source.indexOf('\n});',start)+4;vm.runInContext(source.slice(start,end),c);c.submitSheet({preventDefault(){}});}
test('habit creation persists explicit timetable choice while private recurring tasks get a task kind',()=>{
  for(const show of [false,true]){const c=separatedEnv(['tgtVal']);submitSheet(c,{kind:'habit',htarget:'7',hTimetable:show,time:'07:00',end:'07:30'});assert.equal(c.writes[0].c,'habits');assert.equal(c.writes[0].data.entryKind,'habit');assert.equal(c.writes[0].data.showInTimetable,show);assert.equal(c.writes[0].data.time,'07:00');}
  const c=separatedEnv(['tgtVal']);submitSheet(c,{kind:'task',who:'priv',trep:'daily',htarget:'wd'});assert.equal(c.writes[0].data.entryKind,'task');assert.equal(c.writes[0].c,'habits');
});
test('AI recurring additions preserve explicit type and reject shared habit requests',()=>{
  let c=env(ai);let w=act(c,{type:'add_recurring',text:'運動',kind:'habit',target:'7',who:'priv',showInTimetable:false,time:'07:00'});assert.equal(w.data.entryKind,'habit');assert.equal(w.data.showInTimetable,false);
  c=env(ai);w=act(c,{type:'add_recurring',text:'掃除',kind:'task',target:'7',who:'priv'});assert.equal(w.data.entryKind,'task');assert.equal(w.c,'habits');
  c=env(ai);act(c,{type:'add_recurring',text:'運動',kind:'habit',target:'7',who:'both'});assert.equal(c.writes.length,0);
});

function aiChatEnv(overrides={}){return env(['AI_PREFS','AI_ACT_L','aiRec','aiRefresh','aiAsk'],{aiCan:()=>true,aiCtx:()=>'',aiMemB:()=>[],aiMemP:()=>[],$:()=>null,...overrides});}
const microtasks=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('AI refresh immediately releases busy state, retains draft, and ignores a late old answer',async()=>{
  const c=aiChatEnv();let first,second,calls=0,resets=0;
  c.state._smt={resetConnection:()=>resets++,json:()=>new Promise(r=>{if(++calls===1)first=r;else second=r;})};
  const old=run(c,"aiAsk('古い質問')");await microtasks();const oldSignal=c.state.ai.ctl.signal;
  run(c,'aiRefresh()');assert.equal(c.state.ai.busy,false);assert.equal(c.state.ai.q,'古い質問');assert.equal(oldSignal.aborted,true);assert.equal(resets,1);
  const next=run(c,"aiAsk('新しい質問')");await microtasks();first({reply:'古い答え',acts:[]});await old;
  assert.equal(c.state.ai.busy,true);assert.equal(c.state.ai.log.length,1);assert.equal(c.state.ai.log[0].a,null);
  second({reply:'新しい答え',acts:[]});await next;assert.equal(c.state.ai.log[0].a.reply,'新しい答え');assert.equal(c.state.ai.busy,false);assert.equal(c.state.ai.waitTimer,null);
});
test('AI timeout releases a provider that ignores cancellation and keeps the question editable',async()=>{
  const timers=[];const c=aiChatEnv({setTimeout:(fn,ms)=>(timers.push({fn,ms}),timers.length),clearTimeout(){},setInterval:()=>1,clearInterval(){}});
  c.state._smt={json:()=>new Promise(()=>{})};const p=run(c,"aiAsk('質問を残す')");await microtasks();assert.equal(timers[0].ms,60000);timers[0].fn();await microtasks();const t2=timers.find((t,i)=>i>0&&t.ms===45000);assert.ok(t2,'falls back to the quick model');t2.fn();await p;
  assert.equal(c.state.ai.busy,false);assert.equal(c.state.ai.q,'質問を残す');assert.match(c.state.ai.log[0].a.reply,/時間内/);
});
test('AI failures are excluded from context and a retry does not duplicate the failed question',async()=>{
  const c=aiChatEnv();let prompt;c.state._smt={json:async()=>{throw Object.assign(Error('login html'),{code:'gas_access'});}};
  await run(c,"aiAsk('買い物の日付変更')");assert.equal(c.state.ai.q,'買い物の日付変更');assert.equal(c.state.ai.log.length,1);
  c.state._smt={json:async p=>(prompt=p,{reply:'変更案',acts:[]})};await run(c,"aiAsk('買い物の日付変更')");
  assert.equal(c.state.ai.log.length,1);assert.doesNotMatch(prompt,/接続設定の確認が必要/);assert.equal(c.writes.length,0);
});
test('AI preparation errors also release busy state and preserve the question',async()=>{
  const c=aiChatEnv({aiCtx:()=>{throw Error('context failed');}});c.state._smt={json:async()=>{throw Error('must not call');}};
  await run(c,"aiAsk('下書き')");assert.equal(c.state.ai.busy,false);assert.equal(c.state.ai.q,'下書き');assert.equal(c.state.ai.log[0].a.err,true);
});
test('AI refresh keeps unsent edits and saved memories, without sending or changing stored items',()=>{
  const c=aiChatEnv({$:()=>({value:'書きかけを残す'})});c.state.ai.log=[{q:'以前の質問',a:{reply:'答え'}}];c.state.kakei={aiMem:[{t:'記憶'}]};c.state.items=[{id:'keep'}];
  run(c,'aiRefresh()');assert.equal(c.state.ai.q,'書きかけを残す');assert.equal(c.state.kakei.aiMem.length,1);assert.equal(c.state.items.length,1);assert.equal(c.writes.length,0);
});
test('AI replies retain their own item references across context changes',async()=>{
  const c=aiChatEnv({aiCtx:()=>{c.state.ai.refs={r1:{c:'items',id:'original'}};return '';}});let reply;c.state._smt={json:()=>new Promise(r=>reply=r)};
  const p=run(c,"aiAsk('日付変更')");await microtasks();c.state.ai.refs={r1:{c:'items',id:'unrelated'}};reply({reply:'変更案',acts:[{type:'edit',ref:'r1',date:'2026-10-03'}]});await p;
  assert.equal(c.state.ai.log[0].a.acts[0]._r.id,'original');assert.equal(c.writes.length,0);
});

test('v189 garbage rules: weekly, nth weekday, holiday range and date overrides', () => {
  const c = env(['GOMI_EX','GWD','gomiTxt','gomiCache','gomiRules','gomiOn']);
  c.state.kakei = { gomi: '可燃ごみ: 月 木\nプラ: 水\n不燃ごみ: 第2金\n休み: 12/29-1/3\n2027-01-07: なし\n2027-01-09: 可燃ごみ' };
  assert.deepEqual([...run(c, 'gomiOn("2026-10-05")')], ['可燃ごみ']);          // Mon
  assert.deepEqual([...run(c, 'gomiOn("2026-10-07")')], ['プラ']);              // Wed
  assert.deepEqual([...run(c, 'gomiOn("2026-10-09")')], ['不燃ごみ']);          // 2nd Fri
  assert.deepEqual([...run(c, 'gomiOn("2026-10-16")')], []);                    // 3rd Fri
  assert.deepEqual([...run(c, 'gomiOn("2026-12-31")')], []);                    // year-end off (Thu)
  assert.deepEqual([...run(c, 'gomiOn("2027-01-04")')], ['可燃ごみ']);          // Mon after break
  assert.deepEqual([...run(c, 'gomiOn("2027-01-07")')], []);                    // override none
  assert.deepEqual([...run(c, 'gomiOn("2027-01-09")')], ['可燃ごみ']);          // added
  c.state.kakei = {}; assert.ok(run(c, 'gomiOn("2026-10-05")').includes('燃やせるごみ'));  // 未設定なら公式データ
});

test('v189 garbage default is Kariya open data for 井ケ谷町 (A) incl. January paper swap', () => {
  const c = env(['GOMI_EX','GWD','gomiTxt','gomiCache','gomiRules','gomiOn']);
  c.state.kakei = {};
  const g = d => [...run(c, `gomiOn("${d}")`)];
  assert.deepEqual(g('2026-10-05'), ['燃やせるごみ','不燃ごみ','空きビン']);   // 1st Mon
  assert.deepEqual(g('2026-10-07'), ['ペットボトル','プラ容器']);           // 1st Wed
  assert.deepEqual(g('2026-10-12'), ['燃やせるごみ','空き缶・金属類']);       // 2nd Mon
  assert.deepEqual(g('2026-10-02'), ['紙容器']);                          // 1st Fri
  assert.deepEqual(g('2026-10-09'), ['古紙類']);                          // 2nd Fri
  assert.deepEqual(g('2026-11-30'), ['燃やせるごみ','アルミ缶']);           // 5th Mon
  assert.deepEqual(g('2027-01-01'), []);                                  // 年末年始
  assert.deepEqual(g('2027-01-08'), ['紙容器']);                          // Jan: 2nd Fri = 紙容器
  assert.deepEqual(g('2027-01-15'), ['古紙類']);                          // Jan: 3rd Fri = 古紙類
  assert.deepEqual(g('2027-01-29'), ['古紙類']);                          // Jan: 5th Fri
  assert.deepEqual(g('2026-10-03'), []);                                  // Sat
});

test('v190 fridge photo parsing accepts several AI answer shapes', () => {
  const c = env(['fridgeNames']);
  const f = d => [...run(c, `fridgeNames(${JSON.stringify(d)})`)];
  assert.deepEqual(f({items:['卵','牛乳']}), ['卵','牛乳']);
  assert.deepEqual(f({items:[{name:'卵'},{item:'豆腐'}]}), ['卵','豆腐']);
  assert.deepEqual(f(['にんじん']), ['にんじん']);
  assert.deepEqual(f({食材:['キャベツ']}), ['キャベツ']);
  assert.deepEqual(f({result:[{食材:'納豆'}]}), ['納豆']);
  assert.deepEqual(f(null), []);
});
test('v190 release notes close garbage and childcare requests, keep fridge pending', () => {
  const c = env(['AI_RELEASE','bugTextKey','bugDisplay']);
  const d = b => run(c, `bugDisplay(${JSON.stringify(b)})`);
  const g = d({id:'mulo3ezqkaf6q',text:'カレンダーにゴミの日を出すようにして',status:'new',ver:'187'});
  assert.equal(g.status,'fixed'); assert.equal(g.fixedVersion,'190');
  const k = d({id:'mulq3o1kxnata',text:'子育ての家事の一覧とその確認準備状況がわかるタブを将来の子タブとして追加して',status:'new',ver:'187'});
  assert.equal(k.status,'fixed');
  const r = d({id:'mulqhwu7b6tzv',text:'冷蔵庫読み取り機能が使えないから直して',status:'new',ver:'187'});
  assert.equal(r.status,'new'); assert.match(r.releaseNote,/理由/);
  const re = d({id:'mulo3ezqkaf6q',text:'カレンダーにゴミの日を出すようにして',status:'new',ver:'187',reopenedAt:1});
  assert.equal(re.status,'new');
});
test('v191 plan result log renders newest first, escaped, with author', () => {
  const c = env(['planLogHTML'], { short: d => d.slice(5).replace('-', '/') });
  const h = run(c, `planLogHTML({log:[{at:Date.UTC(2026,9,1,3),by:'h',t:'水を12L'},{at:Date.UTC(2026,9,2,3),by:'w',t:'<b>避難所</b>確認'}]})`);
  assert.ok(h.indexOf('避難所') < h.indexOf('水を12L'));
  assert.ok(h.includes('&lt;b&gt;')); assert.ok(!h.includes('<b>避難所'));
  assert.match(run(c, 'planLogHTML({})'), /まだ記録はありません/);
});
test('v192 templates add concrete memo and checklist; old names map to new templates', () => {
  const c = env(['TPLX','TPL_ALIAS','tplX','newPlan','tplNew']);
  run(c, 'tplNew("prep","児童手当の申請")');
  const w = c.writes.at(-1); assert.equal(w.c, 'plans'); assert.match(w.data.memo, /15日以内/); assert.ok(w.data.checks.length >= 3 && w.data.checks.every(x => x.done === false));
  run(c, 'tplNew("wish","温泉に行く")'); assert.equal(c.writes.at(-1).data.checks.length, 0);
  assert.ok(run(c, 'tplX("育休の相談")').c.length > 0);
});
test('v193 AI uses the Pro tier with a date table and longer context', async () => {
  let prompt='', opts=null; const c=env(['AI_PREFS','AI_ACT_L','aiAsk'],{aiCan:()=>true,aiCtx:()=> '状況'.repeat(30000),aiMemB:()=>[],aiMemP:()=>[]});
  c.state._smt={json:async (p,o)=>{prompt=p;opts=o;return {reply:'ok',acts:[]};}};
  await run(c,"aiAsk('来週の金曜に歯医者を追加して')"); assert.equal(opts.modelTier,'quick');
  await run(c,"aiAsk('来週の金曜はどう過ごすのがいい？')");
  assert.equal(opts.modelTier,'pro'); assert.equal(opts.timeoutMs,60000);
  assert.ok(prompt.length<=40000 && prompt.length>30000, `len=${prompt.length}`);
  assert.match(prompt,/2026-09-28\(月・今日\)/); assert.match(prompt,/2026-10-02\(金\)/);
  assert.match(prompt,/言った数だけ/);
});

test('v195 minimal AI card shows only the latest exchange and at most three suggestions', () => {
  const c = env(['AIQ','aiComposerHTML','aiCardHTML'], { aiCan:()=>true, aiOverdue:()=>[], aiMemB:()=>[], aiMemP:()=>[], aiProfMe:()=>({}), AIP_FIELDS:[], aiActText:x=>x.type, aiWaitText:()=>'', seg:()=>'' });
  c.state.ai.log=[{q:'古い質問',a:{reply:'古い答え',acts:[]}},{q:'新しい質問',a:{reply:'新しい答え',acts:[],next:['a','b','c','d']}}];
  const h=run(c,'aiCardHTML("dock")');
  assert.match(h,/前の会話（1）/); assert.match(h,/新しい答え/); assert.match(h,/data-act="aiDockClose"/);
  assert.equal((h.match(/data-aiq=/g)||[]).length,3);
});
test('v196 voice results that are only question marks are treated as empty', () => {
  const c = env(['aiVoiceClean']);
  assert.equal(run(c, 'aiVoiceClean("（？）")'), ''); assert.equal(run(c, 'aiVoiceClean("？？ 。")'), '');
  assert.equal(run(c, 'aiVoiceClean("明日19時に買い物")'), '明日19時に買い物');
});
test('v196 checklist items keep a decision with author and the AI can fill it', () => {
  const c = env(['checksHTML'], { CHECK:'✓', short: d => d.slice(5) });
  const h = run(c, 'checksHTML({checks:[{t:"夜中の当番を決める",done:false,m:"平日は<b>りく</b>",mAt:Date.UTC(2026,9,1),mBy:"h"}]})');
  assert.match(h, /決めたこと：平日は&lt;b&gt;りく/); assert.match(h, /data-act="cknote"/);
});

test('v198 voice keeps listening after an automatic stop and keeps earlier words', async () => {
  const v=voiceEnv(); run(v.c,'aiMic()'); const first=v.rec;
  first.onresult({results:[{0:{transcript:'明日の19時に'},isFinal:true}]});
  first.onend(); assert.equal(v.c.state.aiListening,true);
  await new Promise(r=>setTimeout(r,200)); assert.notEqual(v.rec,first);
  v.rec.onresult({results:[{0:{transcript:'買い物を追加'},isFinal:false}]});
  assert.equal(v.c.state.ai.q,'元の入力\n明日の19時に\n買い物を追加');
  run(v.c,'aiMic()'); assert.equal(v.c.state.aiListening,false);
});
test('v198 shared kakei writes merge instead of overwriting and wait for the first load', () => {
  const ups=[]; const c=env(['kakeiPut'],{kakeiDoc:{update:o=>{ups.push(o);return Promise.resolve();}}});
  c.state.kakeiLoaded=false; run(c,'kakeiPut({aiProf:{h:{a:1}}})'); assert.equal(ups.length,0);
  c.state.kakeiLoaded=true; run(c,'kakeiPut({music:{h:"x"}})'); assert.deepEqual(plain(ups),[{music:{h:'x'}}]);
});
test('v199 hubs group views by time and couple axes; unknown views fall into その他', () => {
  const c = env(['HUBS','hubOf']);
  assert.equal(run(c,'hubOf("task").k'),'today'); assert.equal(run(c,'hubOf("cal").k'),'plan');
  assert.equal(run(c,'hubOf("caution").k'),'us'); assert.equal(run(c,'hubOf("money").k'),'fut'); assert.equal(run(c,'hubOf("log").k'),'more');
});
test('v200 recurring payments show the unpaid amount per month and only once due', () => {
  const c = env(['ymOf','ymAdd','dayIn','rActive','rPaid','rPaidAmt','recurStart','recurShort','recurUnpaidList'], { byWho:x=>x });
  c.state.recur=[{id:'rent',text:'家賃',amount:80000,day:1,paid:{'2026-08':{amount:80000},'2026-09':{amount:50000}}},{id:'late',text:'保険',amount:5000,day:31}];
  assert.equal(run(c,'recurShort(state.recur[0],"2026-08")'),0);
  assert.equal(run(c,'recurShort(state.recur[0],"2026-09")'),30000);
  assert.equal(run(c,'recurShort(state.recur[1],"2026-09")'),0); // 9/30 is after today (9/28)
  const L=plain(run(c,'recurUnpaidList().map(x=>[x.r.id,x.ym,x.n])'));
  assert.deepEqual(L.filter(x=>x[0]==='rent'&&x[1]==='2026-09'),[['rent','2026-09',30000]]);
});
test('v200 unpaid months start from the item start, not before it existed', () => {
  const c = env(['ymOf','ymAdd','dayIn','rActive','rPaid','recurStart','recurShort'], { byWho:x=>x });
  const r={id:'x',amount:1000,day:1,from:'2026-09'};
  c.R=r; assert.equal(run(c,'recurShort(R,"2026-08")'),0); assert.equal(run(c,'recurShort(R,"2026-09")'),1000);
});
test('v201 per-person shares and payments track のり and りく separately', () => {
  const c = env(['ymOf','ymAdd','dayIn','rActive','rPaid','recurStart','rShare','rPaidBy','rShortBy']);
  c.R={id:'f',amount:25000,day:1,from:'2026-09',split:{w:7500,h:17500},paid:{'2026-09':{amount:7500,w:{amount:7500}}}};
  assert.equal(run(c,'rShare(R,"h")'),17500);
  assert.equal(run(c,'rShortBy(R,"2026-09","w")'),0); assert.equal(run(c,'rShortBy(R,"2026-09","h")'),17500);
  c.O={id:'o',amount:10000,day:1,from:'2026-09',who:'both',paid:{'2026-09':{amount:10000}}};
  assert.equal(run(c,'rPaidBy(O,"2026-09","w")'),5000); assert.equal(run(c,'rShortBy(O,"2026-09","h")'),0);
});
test('v201 household preset matches the spreadsheet totals (のり 20万・りく 21万)', () => {
  const c = env(['M10','HOUSEHOLD_PRESET']);
  assert.equal(run(c,'HOUSEHOLD_PRESET.reduce((a,x)=>a+M10(x[3]),0)'),200000);
  assert.equal(run(c,'HOUSEHOLD_PRESET.reduce((a,x)=>a+M10(x[4]),0)'),210000);
  assert.equal(run(c,'HOUSEHOLD_PRESET.every(x=>M10(x[3])+M10(x[4])===M10(x[2]))'),true);
});
test('v202 household import starts from September 2026 and moves later starts back', () => {
  const c = env(['M10','HOUSEHOLD_PRESET','HOUSEHOLD_FROM','householdImport'], { ymOf:d=>d.slice(0,7) }); let n=0; c.newId=()=>'id'+(n++); c.state.goals=[]; c.catGoals=()=>((c.state.kakei||{}).catGoals)||{}; c.kakeiPut=()=>Promise.resolve();
  c.state.recur=[{id:'a',text:'食費',from:'2026-10'}];
  run(c,'householdImport()');
  assert.equal(c.state.recur[0].from,'2026-09');
  const added=c.writes.filter(w=>w.op==='set'&&w.c==='recur'); assert.equal(added.length,13); assert.ok(added.every(w=>w.data.from==='2026-09'));
  const goals=c.writes.filter(w=>w.op==='set'&&w.c==='goals'); assert.deepEqual(plain(goals.map(g=>[g.data.text,g.data.target,g.data.due])),[['出産費①',1080000,'2029-08-31'],['出産費②',1080000,'2029-08-31'],['生活予備費',2880000,'2029-08-31']]);
  assert.ok(added.filter(w=>w.data.kind==='save').every(w=>w.data.goal));
  assert.equal(c.state.kakei.limit,270000); assert.equal(c.state.kakei.catGoals.house,195000); assert.equal(c.state.kakei.catGoals.food,25000);
});
test('timetable keeps dense overlaps independent and connected overlap lanes disjoint',()=>{
  const c=env(['ttLayout']);const input=[{s:540,e:600},{s:555,e:570},{s:565,e:585},{s:580,e:630},{s:600,e:615},{s:615,e:630},{s:630,e:645}].map((o,i)=>({...o,x:{id:String(i)},kind:'i',c:'items',t:'予定'+i}));
  c.input=input;const out=plain(run(c,'ttLayout(input)'));assert.equal(out.length,input.length);assert.ok(out.every(o=>!o.grp));assert.equal(new Set(out.map(o=>o.x.id)).size,input.length);
  for(const a of out)for(const b of out)if(a!==b&&a.s<b.e&&a.e>b.s){assert.equal(a.lanes,b.lanes);assert.notEqual(a.lane,b.lane);}
  assert.equal(out.at(-1).lane,0);assert.equal(out.at(-1).lanes,1);
});
test('crowded timetable keeps names in separate scrollable cards at the exact original time',()=>{
  const entries=Array.from({length:7},(_,i)=>({kind:'i',c:'pitems',x:{id:'crowded-'+i},s:1140+(i===6?15:0),e:1170+(i===6?15:0),t:'予定名'+i,col:'task'}));
  const c=env(['TT_H','timetable','hhmm','ttLayout'],{dayEntries:()=>entries,jpDate:String,ttNewHTML:()=>'',ttGrpSheetHTML:()=>'',ttMeta:()=>'',ttBadges:()=>'',CHECK:'✓'});c.prefs.ttStart='4';
  const html=run(c,'timetable("2026-10-06")');assert.equal((html.match(/data-tid="crowded-/g)||[]).length,7);assert.match(html,/data-ttscroll="1140"/);assert.match(html,/--tt-lanes:7/);assert.match(html,/top:960px;height:48px/);assert.match(html,/data-tid="crowded-6"[^>]*><b>予定名6<\/b><span>19:15–19:45/);assert.doesNotMatch(html,/class="tt-grp/);
  c.state.ttSel='pitems|crowded-6';const selected=run(c,'timetable("2026-10-06")');assert.match(selected,/top:934px;height:100px/);assert.match(selected,/data-ttbase="934" style="top:42px;height:30px/);assert.match(selected,/tt-rs top/);
});
test('crowded scrolling is restored after redraw without moving the time axis',()=>{
  const toggles=[],el={dataset:{ttscroll:'1140'},scrollLeft:0,scrollWidth:1456,clientWidth:300,parentElement:{classList:{toggle:(...a)=>toggles.push(a)}}};const tt={dataset:{ttdate:'2026-10-06'},querySelectorAll:()=>[el]};
  const c=env(['ttScrollRestore'],{$:()=>tt});c.state.ttScroll={date:'2026-10-06',positions:{1140:420}};run(c,'ttScrollRestore()');assert.equal(el.scrollLeft,420);assert.equal(toggles.at(-1)[1],false);c.state.ttScroll.date='2026-10-07';run(c,'ttScrollRestore()');assert.equal(el.scrollLeft,0);
});

function pushEnv(names,overrides={}){const memory=new Map([['futari.pushDev','device-1'],['futari.pushSec','secret'],['futari.pushEnabled','1'],['futari.pushOwner','test-user']]);const c=env(['pushDev','pushEnabled','pushSetEnabled','pushResultMessage',...names],{localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v))},pushCardRefresh(){},...overrides});c.memory=memory;return c;}
test('notification opt-out is per device and does not follow another account',()=>{const c=pushEnv([]);c.prefs.pushOn='1';assert.equal(run(c,'pushEnabled()'),true);run(c,'pushSetEnabled(false)');assert.equal(c.prefs.pushOn,'1');assert.equal(run(c,'pushEnabled()'),false);run(c,'pushSetEnabled(true)');c.state.me='other-user';assert.equal(run(c,'pushEnabled()'),false);});
test('notification message requires a positive server send receipt',()=>{const c=pushEnv([]);for(const r of [null,{}, {sent:0},{sent:false}]){c.receipt=r;assert.match(run(c,'pushResultMessage(receipt)'),/確認できていません/);}c.receipt={sent:1};assert.match(run(c,'pushResultMessage(receipt)'),/送信しました/);});
test('notification plan adds private tasks and habits without leaking them to shared recipients',()=>{
 const c=pushEnv(['pushPlan','hhmm'],{Date:class extends Date{static now(){return new Date('2026-09-28T00:00:00+09:00').getTime();}},myT:x=>x.time,doneOf:(x,r)=>x.done||x['done_'+r],dayEntries:d=>d==='2026-09-28'?[{c:'pitems',x:{id:'p'},s:600,t:'秘密のタスク'},{c:'habits',x:{id:'h'},s:660,t:'秘密の習慣'},{c:'chores',x:{id:'c'},s:720,t:'家事'},{c:'habits',x:{id:'done'},s:660,t:'完了済',done:true},{c:'habits',x:{id:'skip'},s:660,t:'スキップ済',skip:true}]:[],blocksFor:()=>[],blockAt:x=>x,ttInfo:()=>({type:'タスク'}),gomiOn:()=>[],wxDay:()=>null,SHIFT_NAME:{},shiftOf:()=>'',qaAns:()=>true});c.prefs.pushLead='15';const plan=plain(run(c,'pushPlan()'));assert.equal(plan.priv.length,2);assert.ok(plan.priv.every(x=>x.roles.join()==='h'));assert.ok(plan.shared.every(x=>!x.t.includes('秘密')));assert.ok([...plan.shared,...plan.priv].every(x=>!x.t.includes('完了済')&&!x.t.includes('スキップ済')));assert.equal(plan.priv[0].at,new Date('2026-09-28T09:45:00+09:00').getTime());c.prefs.pushLead='0';const zero=plain(run(c,'pushPlan()'));assert.equal(zero.priv[0].at,new Date('2026-09-28T10:00:00+09:00').getTime());assert.match(zero.priv[0].t,/^開始：/);
});
function pushSyncEnv(overrides={}){const writes=[],calls=[];const subscription={toJSON:()=>({endpoint:'https://push.example/device'})};const reg={pushManager:{getSubscription:async()=>subscription},active:{postMessage(){}}};const c=pushEnv(['pushSyncRun'],{db:{collection:()=>({doc:()=>({set:async x=>writes.push(['shared',JSON.parse(x.json)])})})},privBase:{collection:()=>({doc:()=>({set:async x=>writes.push(['private',JSON.parse(x.json)])})})},navigator:{serviceWorker:{ready:Promise.resolve(reg)}},pushWait:async x=>x,pushPlan:()=>({shared:[],priv:[{t:'private'}]}),pushQ:[{id:'queued'}],claude:{use:async()=>({url:'https://script.google.com/example',call:async a=>{calls.push(a);return {ok:true,sent:0};}})},...overrides});c.pushWrites=writes;c.pushCalls=calls;return c;}
test('failed notification sync retains queued changes and does not claim success',async()=>{const c=pushSyncEnv({claude:{use:async()=>({call:async()=>{throw Error('offline');}})}});assert.equal(await run(c,'pushSyncRun("test")'),null);assert.equal(c.pushQ.length,1);assert.match(c.state.pushMsg,/同期に失敗/);assert.equal(c.state.pushLast,undefined);});
test('notification sync separates private payload and removes only acknowledged queue items',async()=>{const c=pushSyncEnv();await run(c,'pushSyncRun("test")');assert.equal(c.pushQ.length,0);assert.ok(c.state.pushLast);assert.match(c.state.pushMsg,/確認できていません/);assert.equal(c.pushWrites[0][0],'shared');assert.equal(c.pushWrites[0][1].priv,undefined);assert.equal(c.pushWrites[1][1].priv[0].t,'private');});
test('missing notification subscription shows repair instructions without database writes',async()=>{const c=pushSyncEnv({navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>null}})}}});assert.equal(await run(c,'pushSyncRun()'),null);assert.equal(c.pushWrites.length,0);assert.match(c.state.pushMsg,/準備し直して/);});
test('notification stop stays disabled after account preferences resync',async()=>{const c=pushEnv(['pushOffDevice'],{pushT:null,pushQ:[],pushFlight:null,clearTimeout(){},pushWait:async x=>x,navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>({unsubscribe:async()=>true})},active:{postMessage(){}}})}},claude:{use:async()=>({call:async()=>({ok:true})})}});c.prefs.pushOn='1';await run(c,'pushOffDevice()');assert.equal(run(c,'pushEnabled()'),false);assert.equal(c.prefs.pushOn,'1');assert.match(c.state.pushMsg,/停止しました/);});
test('adding private or existing items never queues a partner notification',()=>{const queued=[];const c=pushEnv(['pushNotifyAdded'],{pushQueue:x=>queued.push(x)});c.data={text:'private',who:'both'};run(c,'pushNotifyAdded("pitems","p",data,false)');run(c,'pushNotifyAdded("items","p",data,true)');assert.equal(queued.length,0);run(c,'pushNotifyAdded("items","p",data,false)');assert.equal(queued.length,1);assert.deepEqual(Array.from(queued[0].roles),['w']);});
test('compact timetable halves height while preserving exact 15-minute coordinates',()=>{const c=env(['TT_H','ttY2m','ttY2mF','timetable','hhmm','ttLayout'],{dayEntries:()=>[],jpDate:String,ttNewHTML:()=>'',ttGrpSheetHTML:()=>''});c.prefs.ttStart='4';c.grid={getBoundingClientRect:()=>({top:100})};assert.equal(run(c,'TT_H'),64);assert.equal(run(c,'ttY2m(grid,116)'),255);assert.equal(run(c,'ttY2mF(grid,132,15)'),270);const html=run(c,'timetable("2026-09-29")');assert.match(html,/height:1280px/);assert.match(html,/top:16px[^>]*>.*?<span aria-hidden="true">:15/);assert.match(html,/top:32px[^>]*>.*?<span aria-hidden="true">:30/);assert.match(html,/top:48px[^>]*>.*?<span aria-hidden="true">:45/);});
test('unsupported notification backend is reported as a server setup issue, without requesting permission',async()=>{let requested=false;const c=pushEnv(['pushPrepare'],{db:{},privBase:{},Notification:{requestPermission:()=>{requested=true;}},claude:{use:async()=>({call:async()=>{throw Error('未対応の操作：push');}})}});await run(c,'pushPrepare()');assert.equal(c.state.pushBackendMissing,true);assert.equal(c.state.pushPrepared,null);assert.match(c.state.pushMsg,/送信サーバーに通知機能がありません/);assert.equal(requested,false);assert.equal(c.state.pushBusy,false);});
test('notification sync retains recently due reminders for the five-minute sender without reviving completed tasks',()=>{
 const now=new Date('2026-09-28T10:03:00+09:00').getTime();
 const c=pushEnv(['pushPlan','hhmm'],{Date:class extends Date{static now(){return now;}},myT:x=>x.time,doneOf:x=>x.done,dayEntries:()=>[],blocksFor:()=>[],blockAt:x=>x,ttInfo:()=>({type:'タスク'}),gomiOn:()=>[],wxDay:()=>null,SHIFT_NAME:{},shiftOf:()=>'',qaAns:()=>true});
 c.prefs.pushLead='0';c.state.events=[{id:'recent',date:'2026-09-28',start:'10:00',text:'最近の予定',who:'h'},{id:'old',date:'2026-09-28',start:'09:45',text:'古い予定',who:'h'}];
 c.state.items=[{id:'completed',done:true,due:'2026-09-28',time:'10:00',text:'完了済み',who:'h'}];const plan=plain(run(c,'pushPlan()'));assert.ok(!plan.shared.some(x=>x.id.startsWith('it:completed:')));assert.ok(plan.shared.some(x=>x.id.startsWith('ev:recent:')));assert.ok(!plan.shared.some(x=>x.id.startsWith('ev:old:')));
});
test('AI settings changes apply only on execution, refresh the name, and can be undone',()=>{
 let painted=0,saved=0;const c=env(ai,{renderChrome:()=>painted++,savePrefs:()=>saved++});c.prefs.appName='ふたりのリスト';const x={type:'set_pref',key:'appName',value:'ふたりすと'};c.state.ai.log=[{a:{acts:[x]}}];assert.equal(c.prefs.appName,'ふたりのリスト');run(c,'aiDoAct(0,0)');assert.equal(c.prefs.appName,'ふたりすと');assert.equal(x.ok,true);assert.equal(painted,1);assert.equal(saved,1);c.notices.at(-1)[1]();assert.equal(c.prefs.appName,'ふたりのリスト');assert.equal(painted,2);
});
test('AI settings accepts names and supported appearance choices but rejects invalid or unknown settings',()=>{
 const c=env(['AI_PREFS','aiPrefValue']);assert.equal(run(c,'aiPrefValue("appName"," ふたりすと ")'),'ふたりすと');assert.equal(run(c,'aiPrefValue("appName","")'),'');assert.equal(run(c,'aiPrefValue("celebrate","heart")'),'heart');for(const [key,value]of [['appName','あ'.repeat(17)],['appName','a\nb'],['appName',{}],['mode','invalid'],['__proto__','x'],['pushSec','secret']]){c.key=key;c.value=value;assert.throws(()=>run(c,'aiPrefValue(key,value)'));}
});
test('invalid AI name change is not marked done and preview shows before and after',()=>{
 const c=env([...ai,'aiActText','aiPrefLabel']);c.prefs.appName='元の名前';const x={type:'set_pref',key:'appName',value:'あ'.repeat(17)};act(c,x);assert.equal(c.prefs.appName,'元の名前');assert.notEqual(x.ok,true);assert.match(run(c,'aiActText({type:"set_pref",key:"appName",value:"ふたりすと"})'),/元の名前 → ふたりすと/);
});
test('detailed notification preferences migrate old morning hour and validate AI clock/day changes',()=>{
 const c=env(['pushSettings','AI_PREFS','aiPrefValue']);c.prefs.pushAmH='8';assert.equal(run(c,'pushSettings().am'),'08:00');c.prefs.pushAmTime='06:35';c.prefs.pushPmTime='21:45';c.prefs.pushDays='1,3,5';c.prefs.pushQuiet='1';assert.equal(run(c,'pushSettings().am'),'06:35');assert.equal(run(c,'pushSettings().pm'),'21:45');assert.deepEqual(plain(run(c,'pushSettings().days')),[1,3,5]);assert.equal(run(c,'aiPrefValue("pushDays","5,1,5")'),'1,5');assert.equal(run(c,'aiPrefValue("pushAmTime","06:35")'),'06:35');assert.throws(()=>run(c,'aiPrefValue("pushAmTime","24:00")'));assert.throws(()=>run(c,'aiPrefValue("pushDays","7")'));
});

// Hour summaries must include ongoing entries, exclude boundary-only matches, and preserve actions.
test('hour gutter lists overlapping items without losing boundaries or item identity',()=>{
 const entries=[{s:18*60+30,e:19*60,t:'継続中',kind:'i',c:'items',x:{id:'ends'}},{s:19*60,e:19*60+30,t:'名前<&',kind:'i',c:'items',x:{id:'starts'}},{s:18*60+45,e:19*60+15,t:'またぐ予定',kind:'e',c:'events',x:{id:'ongoing'}},{s:20*60,e:21*60,t:'翌時間',kind:'i',c:'items',x:{id:'next'}}].map(o=>({...o,col:'task'}));
 const c=env(['TT_H','timetable','hhmm','ttLayout'],{dayEntries:()=>entries,jpDate:String,ttNewHTML:()=>'',ttGrpSheetHTML:()=>'',ttMeta:()=>'',ttBadges:()=>'',CHECK:'check'});c.prefs.ttStart='18';
 const html=run(c,'timetable("2026-10-06")'),button=html.match(/<button[^>]+data-tthour="19"[^>]*>/)[0];
 assert.match(button,/events\|ongoing/);assert.match(button,/items\|starts/);assert.doesNotMatch(button,/items\|ends|items\|next/);assert.match(button,/19時台の2件/);
 assert.equal((html.match(/class="tt-b /g)||[]).length,4);assert.match(html,/aria-label="19:15"/);
});
test('hour list wraps titles, escapes markup, and only tasks have completion buttons',()=>{
 const entries=[{s:19*60,e:20*60,t:'<長い予定名>',kind:'e',c:'events',x:{id:'event'},col:'cal'},{s:19*60+15,e:19*60+30,t:'長いタスク名',kind:'i',c:'items',x:{id:'task'},col:'task',done:true}];
 const c=env(['ttGrpSheetHTML','hhmm'],{dayEntries:()=>entries,CHECK:'check'});c.state.ttGrp={date:'2026-10-06',hour:'19',keys:['events|event','items|task']};
 const html=run(c,'ttGrpSheetHTML("2026-10-06")');assert.match(html,/19:00–20:00 · 2件/);assert.match(html,/&lt;長い予定名&gt;/);assert.match(html,/data-tgsel="events\|event"/);assert.doesNotMatch(html,/data-ttck="events\|event"/);assert.match(html,/data-ttck="items\|task"/);assert.match(html,/19:15–19:30/);assert.match(html,/長いタスク名を未完了に戻す/);
});

// Voice lifecycle regressions: delayed browser events and AI responses use isolated sessions.
function voiceClock(){let serial=0;const timers=new Map();return {setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),setInterval:()=>++serial,clearInterval(){},fire(ms){const t=[...timers].find(([,v])=>v.ms===ms);assert.ok(t,'missing timer '+ms);timers.delete(t[0]);t[1].fn();},timers};}
test('voice errors without end events release the microphone and allow three consecutive sessions',()=>{
 const clock=voiceClock(),v=voiceEnv(clock);for(let i=0;i<3;i++){run(v.c,'aiMic()');assert.equal(v.c.state.aiListening,true);const old=v.rec;old.onerror({error:'network'});assert.equal(v.c.state.aiListening,false);assert.equal(run(v.c,'aiRec'),null);assert.equal(run(v.c,'aiSRS'),null);old.onresult({results:[{0:{transcript:'遅い結果'},isFinal:true}]});assert.equal(v.c.state.ai.q,'元の入力');}assert.equal(clock.timers.size,0);
});
test('missing stop notification releases state and stale callbacks cannot affect the next recording',()=>{
 const clock=voiceClock(),v=voiceEnv(clock);run(v.c,'aiMic()');const old=v.rec;old.stop=()=>{};old.abort=()=>{};old.onresult({results:[{0:{transcript:'最初の入力'},isFinal:false}]});run(v.c,'aiMic()');assert.equal(v.c.state.aiListening,true);clock.fire(1200);assert.equal(v.c.state.aiListening,false);v.c.input.value=v.c.state.ai.q;run(v.c,'aiMic()');const next=v.rec;old.onend();old.onerror({error:'not-allowed'});assert.equal(run(v.c,'aiRec'),next);assert.equal(v.c.state.aiListening,true);next.onresult({results:[{0:{transcript:'続き'},isFinal:true}]});assert.equal(v.c.state.ai.q,'元の入力\n最初の入力\n続き');run(v.c,'aiVoiceCancel()');
});
test('automatic voice restart retries a releasing microphone and preserves interim words',()=>{
 const clock=voiceClock(),records=[];let starts=0;class Recognition{constructor(){records.push(this);}start(){if(++starts===2)throw Object.assign(Error('still releasing'),{name:'InvalidStateError'});this.onstart();}stop(){this.onend();}abort(){this.onend();}}
 const v=voiceEnv({...clock,window:{SpeechRecognition:Recognition}});run(v.c,'aiMic()');records[0].onresult({results:[{0:{transcript:'まだ確定前'},isFinal:false}]});records[0].onend();clock.fire(150);assert.equal(v.c.state.aiListening,true);clock.fire(300);records[2].onresult({results:[{0:{transcript:'続けて話す'},isFinal:true}]});assert.equal(v.c.state.ai.q,'元の入力\nまだ確定前\n続けて話す');run(v.c,'aiVoiceCancel()');
});
test('repeated busy starts and missing start events both recover without leaving listening stuck',()=>{
 const clock=voiceClock();let starts=0;class Busy{start(){starts++;throw Object.assign(Error('busy'),{name:'InvalidStateError'});}abort(){}}
 const v=voiceEnv({...clock,window:{SpeechRecognition:Busy}});run(v.c,'aiMic()');clock.fire(300);clock.fire(600);assert.equal(starts,3);assert.equal(v.c.state.aiListening,false);assert.equal(run(v.c,'aiSRS'),null);
 const w=voiceEnv(clock);run(w.c,'aiMic()');clock.fire(5000);assert.equal(w.c.state.aiListening,false);assert.match(w.c.state.aiVoiceStatus,/再開/);
});
test('late AI correction cannot overwrite a second voice session, an edited draft, or cancelled text',async()=>{
 for(const change of ['restart','edit','cancel']){const clock=voiceClock(),v=voiceEnv({...clock,aiVoiceHints:()=>''});let resolve,signal;v.c.prefs.voiceAI='fix';v.c.state.sample={json:(_,o)=>(signal=o.signal,new Promise(r=>resolve=r))};v.c.state.ai.q='最初の聞き取り';const p=run(v.c,'aiVoiceFix("","最初の聞き取り")');
  if(change==='restart'){v.c.input.value='次の下書き';run(v.c,'aiMic()');run(v.c,'aiMic()');}else if(change==='cancel')run(v.c,'aiVoiceCancel()');else v.c.state.ai.q='手動の修正';
  const draft=v.c.state.ai.q,status=v.c.state.aiVoiceStatus;resolve({text:'遅れた補正'});await p;assert.equal(v.c.state.ai.q,draft);assert.equal(v.c.state.aiVoiceStatus,status);if(change!=='edit')assert.equal(signal.aborted,true);run(v.c,'aiVoiceCancel()');
 }
});
function recorderEnv(options={}){const records=[],tracks=[],clock=voiceClock();const stream=()=>{const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};};class Recorder{constructor(s){this.stream=s;this.state='inactive';this.mimeType='audio/webm';records.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['sound'])});this.finished=this.onstop?.();}}
 const v=voiceEnv({...clock,window:{__FUTARI_PWA:true,MediaRecorder:Recorder},navigator:{mediaDevices:{getUserMedia:async()=>stream()}},MediaRecorder:Recorder,Blob,aiToWav:async b=>b,aiVoiceHints:()=>'',...options});v.c.prefs.voiceAI='on';v.c.state.sample={json:async()=>({text:'聞き取り'})};return {...v,records,tracks,stream,clock};}
test('cancel during microphone permission releases the late stream and permits the next recording',async()=>{
 let allow;const v=recorderEnv({navigator:{mediaDevices:{getUserMedia:()=>new Promise(r=>allow=r)}}});const pending=run(v.c,'aiVoiceRec()');assert.equal(v.c.state.aiVoiceStarting,true);run(v.c,'aiMic()');assert.equal(v.c.state.aiListening,false);allow(v.stream());await pending;assert.equal(v.records.length,0);assert.equal(v.tracks[0].stopped,true);
 const next=run(v.c,'aiVoiceRec()');allow(v.stream());await next;assert.equal(v.records.length,1);assert.equal(v.c.state.aiListening,true);run(v.c,'aiVoiceCancel()');assert.ok(v.tracks.every(t=>t.stopped));
});
test('recording transcription unlocks after completion and can be used repeatedly without lost text',async()=>{
 const v=recorderEnv();for(let i=0;i<3;i++){let answer;v.c.state.sample={json:()=>new Promise(r=>answer=r)};await run(v.c,'aiVoiceRec()');const rec=v.records.at(-1);await run(v.c,'aiVoiceRec()');await microtasks();assert.equal(v.c.state.aiVoiceTranscribing,true);run(v.c,'aiMic()');assert.equal(v.records.length,i+1);answer({text:'音声'+i});await rec.finished;assert.equal(v.c.state.aiVoiceTranscribing,false);assert.equal(v.c.state.aiListening,false);v.c.input.value=v.c.state.ai.q;}
 assert.equal(v.c.state.ai.q,'元の入力\n音声0\n音声1\n音声2');assert.ok(v.tracks.every(t=>t.stopped));
});
test('recording cancel ignores late transcription and closes the stream immediately',async()=>{
 const v=recorderEnv();let answer,signal;v.c.state.sample={json:(_,o)=>(signal=o.signal,new Promise(r=>answer=r))};await run(v.c,'aiVoiceRec()');const rec=v.records[0];await run(v.c,'aiVoiceRec()');await microtasks();run(v.c,'aiVoiceCancel()');answer({text:'キャンセル後の音声'});await rec.finished;assert.equal(v.c.state.ai.q,'');assert.equal(v.c.state.aiVoiceTranscribing,false);assert.equal(signal.aborted,true);assert.ok(v.tracks.every(t=>t.stopped));
});
test('recorder constructor errors and missing stop notifications release resources for retry',async()=>{
 const v=recorderEnv({MediaRecorder:class {constructor(){throw Error('unsupported format');}}});await run(v.c,'aiVoiceRec()');assert.equal(v.c.state.aiListening,false);assert.equal(v.tracks[0].stopped,true);
 const w=recorderEnv();await run(w.c,'aiVoiceRec()');w.records[0].stop=function(){this.state='inactive';};await run(w.c,'aiVoiceRec()');w.clock.fire(2500);assert.equal(w.c.state.aiListening,false);assert.equal(w.tracks[0].stopped,true);await run(w.c,'aiVoiceRec()');assert.equal(w.records.length,2);run(w.c,'aiVoiceCancel()');
});
test('AI refresh cancels pending voice work and releases recorders without clearing the draft',async()=>{
 const v=recorderEnv();vm.runInContext(declaration('aiRefresh'),v.c);await run(v.c,'aiVoiceRec()');run(v.c,'aiRefresh()');assert.equal(v.c.state.aiListening,false);assert.equal(v.c.state.ai.q,'元の入力');assert.equal(run(v.c,'aiRecM'),null);assert.ok(v.tracks.every(t=>t.stopped));
});
test('transcription timeout unlocks the microphone and offers retry without discarding the draft',async()=>{
 const v=recorderEnv();v.c.state.sample={json:()=>new Promise(()=>{})};await run(v.c,'aiVoiceRec()');const rec=v.records[0];await run(v.c,'aiVoiceRec()');await microtasks();const html=run(v.c,'aiComposerHTML()');assert.match(html,/data-act="aiMic" disabled/);assert.match(html,/data-act="aiVoiceCancel"/);v.clock.fire(45000);await rec.finished;assert.equal(v.c.state.aiVoiceTranscribing,false);assert.equal(v.c.state.ai.q,'元の入力');assert.match(v.c.state.aiVoiceStatus,/もう一度/);await run(v.c,'aiVoiceRec()');assert.equal(v.c.state.aiListening,true);run(v.c,'aiVoiceCancel()');
});

// v286: an iPhone recognizer can start normally, then emit no further events.
test('second speech session with onstart but no results times out and stale callbacks cannot block the third',()=>{
 const clock=voiceClock(),v=voiceEnv(clock);run(v.c,'aiMic()');v.rec.onstart();v.rec.onresult({results:[{0:{transcript:'一言目'},isFinal:true}]});run(v.c,'aiMic()');v.c.input.value=v.c.state.ai.q;
 run(v.c,'aiMic()');const stuck=v.rec;stuck.onstart();stuck.abort=()=>{};assert.ok(![...clock.timers.values()].some(t=>t.ms===5000));clock.fire(12000);
 assert.equal(v.c.state.aiListening,false);assert.equal(run(v.c,'aiRec'),null);assert.equal(v.c.state.ai.q,'元の入力\n一言目');assert.match(v.c.state.aiVoiceStatus,/12秒/);
 run(v.c,'aiMic()');const next=v.rec;stuck.onresult({results:[{0:{transcript:'遅れた二言目'},isFinal:true}]});stuck.onend();assert.equal(run(v.c,'aiRec'),next);next.onstart();next.onresult({results:[{0:{transcript:'三言目'},isFinal:true}]});run(v.c,'aiMic()');assert.equal(v.c.state.ai.q,'元の入力\n一言目\n三言目');
});
test('no-result deadline survives automatic restarts and real results renew it without losing interim text',()=>{
 const clock=voiceClock(),v=voiceEnv(clock);run(v.c,'aiMic()');v.rec.onstart();const deadline=run(v.c,'aiSRS.resultTimer');v.rec.onend();clock.fire(150);v.rec.onstart();assert.equal(run(v.c,'aiSRS.resultTimer'),deadline);
 v.rec.onresult({results:[{0:{transcript:'途中まで'},isFinal:false}]});assert.notEqual(run(v.c,'aiSRS.resultTimer'),deadline);assert.ok(!clock.timers.has(deadline));clock.fire(12000);assert.equal(v.c.state.aiListening,false);assert.equal(v.c.state.ai.q,'元の入力\n途中まで');assert.match(v.c.state.aiVoiceStatus,/完了/);
});
test('iPhone AI microphone records three turns without starting Web Speech and releases each stream before transcription',async()=>{
 const v=recorderEnv({IS_IOS:true});let speechStarts=0,requests=0;v.c.window.SpeechRecognition=class {start(){speechStarts++;}};v.c.prefs.voiceAI='fix';
 assert.match(run(v.c,'aiComposerHTML()'),/録音してAIへ送り/);
 for(let i=0;i<3;i++){v.c.state.sample={json:async(_,o)=>{requests++;assert.ok(o.audio instanceof Blob);assert.equal(v.tracks[i].stopped,true);return {text:'発言'+i};}};
  await run(v.c,'aiMic()');assert.equal(v.c.state.aiListening,true);assert.equal(v.records[i].state,'recording');assert.match(run(v.c,'aiComposerHTML()'),/■ を押すと文字になります/);await run(v.c,'aiMic()');await v.records[i].finished;assert.equal(v.c.state.aiVoiceTranscribing,false);v.c.input.value=v.c.state.ai.q;
 }
 assert.equal(speechStarts,0);assert.equal(requests,3);assert.equal(v.c.state.ai.q,'元の入力\n発言0\n発言1\n発言2');assert.ok(v.tracks.every(t=>t.stopped));assert.equal(v.clock.timers.size,0);
});
test('device-only iPhone input never records or sends audio and ends after one utterance',()=>{
 const clock=voiceClock(),v=voiceEnv({...clock,IS_IOS:true});v.c.prefs.voiceAI='off';v.c.window.__FUTARI_PWA=true;v.c.window.MediaRecorder=class {constructor(){throw Error('must not record');}};v.c.navigator={mediaDevices:{getUserMedia(){throw Error('must not capture');}}};v.c.state.sample={json(){throw Error('must not send audio');}};
 run(v.c,'aiMic()');assert.equal(v.rec.continuous,false);v.rec.onstart();v.rec.onresult({results:[{0:{transcript:'端末だけ'},isFinal:true}]});v.rec.onend();assert.equal(v.c.state.aiListening,false);assert.ok(![...clock.timers.values()].some(t=>t.ms===150));assert.equal(v.c.state.ai.q,'元の入力\n端末だけ');
});
test('AI recording routing preserves non-iPhone text correction and requires recording capabilities',()=>{
 const v=recorderEnv();v.c.prefs.voiceAI='fix';assert.equal(run(v.c,'aiVoiceAIOk()'),false);v.c.IS_IOS=true;assert.equal(run(v.c,'aiVoiceAIOk()'),true);
 v.c.state.sample=null;assert.equal(run(v.c,'aiVoiceAIOk()'),false);v.c.state.sample={};v.c.window.MediaRecorder=null;assert.equal(run(v.c,'aiVoiceAIOk()'),false);
});
test('microphone preparation timeout ignores a late granted stream while the next turn succeeds',async()=>{
 const grants=[];const v=recorderEnv({navigator:{mediaDevices:{getUserMedia:()=>new Promise(r=>grants.push(r))}}});const old=run(v.c,'aiMic()');v.clock.fire(15000);assert.equal(v.c.state.aiListening,false);assert.equal(v.c.state.aiVoiceStarting,false);
 const next=run(v.c,'aiMic()');grants[0](v.stream());await old;assert.equal(v.tracks[0].stopped,true);assert.equal(v.c.state.aiVoiceStarting,true);grants[1](v.stream());await next;assert.equal(v.records.length,1);run(v.c,'aiVoiceCancel()');assert.ok(v.tracks.every(t=>t.stopped));assert.equal(v.clock.timers.size,0);
});
test('stalled audio decoding unlocks the UI and late decoding cannot overwrite the next draft',async()=>{
 let decode,signal;const v=recorderEnv({aiToWav:(b,s)=>(signal=s,new Promise(r=>decode=()=>r(b)))});await run(v.c,'aiMic()');await run(v.c,'aiMic()');const old=v.records[0];assert.equal(v.c.state.aiVoiceTranscribing,true);v.clock.fire(60000);assert.equal(signal.aborted,true);assert.equal(v.c.state.aiVoiceTranscribing,false);assert.equal(v.c.state.ai.q,'元の入力');
 await run(v.c,'aiMic()');decode();await old.finished;assert.equal(v.c.state.aiListening,true);assert.equal(v.c.state.ai.q,'元の入力');run(v.c,'aiVoiceCancel()');
});
test('music pauses before capture and cannot play or preload during input or transcription',async()=>{
 let paused=0;const v=recorderEnv({songStop(){paused++;}});v.c.state.songPlaying=true;v.c.state.songPlayNext=true;await run(v.c,'aiMic()');assert.equal(paused,1);assert.equal(v.c.state.songPlayNext,false);run(v.c,'aiVoiceCancel()');
 const c=env(['songPreload','songToggle'],{songOf(){throw Error('must not start audio');}});for(const phase of ['aiListening','aiVoiceTranscribing']){c.state[phase]=true;run(c,'songPreload();songToggle()');c.state[phase]=false;}assert.equal(c.notices.length,2);
});
