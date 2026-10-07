// Run: node --test tests/meal-week.cjs. Shipped functions, isolated data, no network.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),lines=source.split('\n');
function declaration(name){
  const start=lines.findIndex(l=>new RegExp('^(?:(?:async )?function|const|let) '+name+'(?:[=( ;])').test(l));
  assert.ok(start>=0,name);
  for(let i=start;i<lines.length;i++){const s=lines.slice(start,i+1).join('\n');try{new vm.Script(s);return s;}catch{}}
  throw Error(name);
}
const fns=['dinnerOf','dinnerText','fridgeItems','mondayOf','mealDate','mealValues','mealWeekDays','mealWeekValues','mealWeekDirty','mealModeHTML','mealWeekHTML','mealWeekStatus','mealWeekPaint','mealWeekInput','saveMealWeek','mealWeekMove','flushMeal','mealTimer','viewMeal','saveMeal','dset','ddel'];
function env(){
  const writes=[],notices=[],errors=[],store=new Map(),elements={};
  const c=vm.createContext({state:{view:'meal',dinner:[],kakei:{},me:'test-h'},writes,notices,errors,store,elements,Date,console,
    today:()=> '2026-10-07',parse:d=>new Date(d+'T00:00:00'),ymd:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    addDays:(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);},WD:['日','月','火','水','木','金','土'],
    esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),jpDate:String,short:String,
    $:id=>elements[id]||null,document:{querySelector:()=>null},myRole:()=> 'h',toast:m=>notices.push(m),render(){},requestRender(){},guestBlock:()=>false,netMark(){},actTracked:()=>false,vaultSave(){},pushNotifyAdded(){},err:e=>errors.push(e.message),clearTimeout,
    colRef:()=>({doc:id=>({set:async data=>{writes.push({op:'set',id,data});store.set(id,data);},delete:async()=>{writes.push({op:'delete',id});store.delete(id);}})})
  });
  for(const f of fns)vm.runInContext(declaration(f),c);return c;
}
const run=(c,s)=>vm.runInContext(s,c),plain=x=>JSON.parse(JSON.stringify(x));
test('Monday-based week spans year boundary and leap day; previous/next/this week',()=>{
  const c=env();c.state.mealDate='2027-01-03';assert.deepEqual(plain(run(c,'mealWeekDays()')),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.match(run(c,'mealWeekHTML()'),/2026\/12\/28 〜 2027\/1\/3/);
  run(c,'mealWeekMove("next")');assert.equal(c.state.mealDate,'2027-01-10');run(c,'mealWeekMove("prev")');assert.equal(c.state.mealDate,'2027-01-03');run(c,'mealWeekMove("today")');assert.equal(c.state.mealDate,'2026-10-07');
  c.state.mealDate='2024-02-29';assert.equal(run(c,'mealWeekDays()[6]'),'2024-03-03');
});
test('week is default, all 21 fields escape content and daily/fridge views remain available',()=>{
  const c=env();c.state.dinner=[{id:'2026-10-07',text:'<旧献立>"'}];
  const html=run(c,'viewMeal()');assert.equal((html.match(/data-mealweek-field=/g)||[]).length,21);assert.match(html,/&lt;旧献立&gt;&quot;/);assert.match(html,/冷蔵庫/);assert.match(html,/1 \/ 7日/);assert.doesNotMatch(html,/id="mealMain"/);
  c.state.mealMode='day';const day=run(c,'viewMeal()');assert.match(day,/id="mealMain"/);assert.match(day,/&lt;旧献立&gt;&quot;/);assert.doesNotMatch(day,/data-mealweek-field=/);
});
test('weekly save writes only changed dates, retains old text and partner fields, then writes nothing on repeat',async()=>{
  const c=env();c.state.dinner=[{id:'2026-10-07',text:'旧カレー',at:1,custom:'keep'},{id:'2026-10-08',main:'魚',side:'サラダ',soup:'味噌汁'}];
  run(c,'mealWeekInput("2026-10-07","side","温野菜");mealWeekInput("2026-10-08","main","鶏肉");');
  // A partner edits an untouched field while our draft is open.
  c.state.dinner[1].soup='わかめスープ';assert.equal(await run(c,'saveMealWeek()'),true);assert.equal(c.writes.length,2);
  assert.equal(c.store.get('2026-10-07').main,'旧カレー');assert.equal(c.store.get('2026-10-07').custom,'keep');assert.equal(c.store.get('2026-10-08').soup,'わかめスープ');assert.equal(c.store.get('2026-10-08').text,'鶏肉、サラダ、わかめスープ');
  assert.equal(await run(c,'saveMealWeek()'),true);assert.equal(c.writes.length,2);assert.equal(run(c,'mealWeekDirty().length'),0);
  c.state.dinner=[...c.store].map(([id,data])=>({id,...data}));assert.match(run(c,'viewMeal()'),/温野菜/);
});
test('drafts survive renders and week changes; reverting a field removes its pending write',()=>{
  const c=env();run(c,'mealWeekInput("2026-10-07","main","カレー");mealWeekMove("next")');assert.match(run(c,'mealWeekStatus()'),/ほかの週に未保存 1日/);
  run(c,'mealWeekMove("prev")');assert.equal(run(c,'mealWeekValues("2026-10-07").main'),'カレー');assert.match(run(c,'viewMeal()'),/value="カレー"/);
  run(c,'mealWeekInput("2026-10-07","main","")');assert.equal(run(c,'mealWeekDirty().length'),0);
});
test('seven new days share the existing dinner collection and daily editor reads the same saved data',async()=>{
  const c=env();run(c,'mealWeekDays().forEach((d,i)=>mealWeekInput(d,"main","献立"+i))');await run(c,'saveMealWeek()');assert.equal(c.writes.length,7);assert.equal(c.state.dinner.length,7);
  c.state.mealMode='day';assert.match(run(c,'viewMeal()'),/value="献立2"/);
  c.elements.mealMain={value:'日表示で変更'};c.elements.mealSide={value:''};c.elements.mealSoup={value:''};run(c,'saveMeal()');
  c.state.dinner=[...c.store].map(([id,data])=>({id,...data}));assert.equal(run(c,'mealWeekValues("2026-10-07").main'),'日表示で変更');
});
test('clearing an existing day deletes only that day and empty untouched days are not written',async()=>{
  const c=env();c.state.dinner=[{id:'2026-10-07',main:'魚',side:'野菜',soup:''},{id:'2026-10-08',text:'保持'}];
  run(c,'mealWeekInput("2026-10-07","main","");mealWeekInput("2026-10-07","side","")');await run(c,'saveMealWeek()');
  assert.deepEqual(plain(c.writes),[{op:'delete',id:'2026-10-07'}]);assert.equal(c.state.dinner[0].id,'2026-10-08');
});
test('partial failure retains just failed drafts for retry and shows the failure; guests cannot save',async()=>{
  const c=env(),normal=c.colRef;c.colRef=()=>({doc:id=>id==='2026-10-08'?{set:async()=>{throw Error('offline failure');}}:normal().doc(id)});
  run(c,'mealWeekInput("2026-10-07","main","カレー");mealWeekInput("2026-10-08","main","魚")');assert.equal(await run(c,'saveMealWeek()'),false);
  assert.equal(c.writes.length,1);assert.equal(run(c,'mealWeekDirty().length'),1);assert.equal(run(c,'mealWeekValues("2026-10-08").main'),'魚');assert.match(run(c,'mealWeekStatus()'),/保存できません/);assert.equal(c.state.mealWeekSaving,false);
  c.colRef=normal;assert.equal(await run(c,'saveMealWeek()'),true);assert.equal(c.writes.length,2);
  run(c,'mealWeekInput("2026-10-09","main","卵")');c.guestBlock=()=>true;assert.equal(await run(c,'saveMealWeek()'),false);assert.equal(c.writes.length,2);
});
test('double-save is ignored while a save is pending and failed deletes return false',async()=>{
  const c=env();let resolve;c.colRef=()=>({doc:()=>({set:()=>new Promise(r=>resolve=r),delete:async()=>{throw Error('failed');}})});
  run(c,'mealWeekInput("2026-10-07","main","カレー")');const save=run(c,'saveMealWeek()');assert.equal(await run(c,'saveMealWeek()'),false);resolve();await save;
  assert.equal(await run(c,'ddel("dinner","2026-10-07")'),false);assert.equal(c.errors.length,1);
});
