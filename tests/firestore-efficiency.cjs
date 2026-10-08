const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=require('node:path').join(__dirname,'..'),source=fs.readFileSync(root+'/shim.js','utf8'),lines=source.split('\n'),R=require('../firestore-reads.js');
function decl(name){const i=lines.findIndex(l=>new RegExp('^  (?:async )?function '+name+'\\(').test(l));assert(i>=0);for(let j=i;j<lines.length;j++){const s=lines.slice(i,j+1).join('\n');try{new vm.Script(s);return s;}catch{}}throw Error(name);}
const plain=x=>JSON.parse(JSON.stringify(x));
function writes(base,options={}){
 const sent=[],c=vm.createContext({window:{},fbSettingsPending:new Map(),fbWatchGroups:new Map(),fbOffline:null,fbSend_:async(p,k,v)=>{sent.push({p,k,v:plain(v)});if(options.send)return options.send(p,k,v);},Promise});
 // Use the same realm for maps from Firestore and the application's JSON payloads.
 vm.runInContext(fs.readFileSync(root+'/firestore-reads.js','utf8'),c);
 c.base=base;c.sent=sent;vm.runInContext('base=JSON.parse(JSON.stringify(base));',c);
 c.fbWatchGroups.set('doc:meta/kakei',{raw:{exists:true,fromCache:!!options.cache,data:()=>c.base}});
 vm.runInContext(decl('fbWrite_'),c);
 return {c,sent,run:s=>vm.runInContext(s,c)};
}
test('unchanged shared settings including reordered maps skip writes, timestamps alone are not changes',async()=>{
 const t=writes({limit:20,music:{h:'a',w:'b'},updatedAt:1});
 for(let i=0;i<40;i++)await t.run('fbWrite_("meta/kakei","update",{music:{w:"b",h:"a"},limit:20,updatedAt:999})');
 assert.equal(t.sent.length,0);
 await t.run('fbWrite_("meta/kakei","update",{music:{h:"new",w:"b"},limit:20,updatedAt:999})');
 assert.deepEqual(t.sent,[{p:'meta/kakei',k:'update',v:{music:{h:'new'},updatedAt:999}}]);
});
test('same-turn shared settings edits merge into one write and preserve both roles',async()=>{
 const t=writes({music:{h:'a',w:'b'},limit:20});
 const a=t.run('fbWrite_("meta/kakei","update",{music:{h:"new"},updatedAt:2})');
 const b=t.run('fbWrite_("meta/kakei","update",{limit:30,updatedAt:3})');
 const same=t.run('fbWrite_("meta/kakei","update",{limit:30,updatedAt:4})');
 assert.equal(a,b);assert.equal(a,same);assert.equal(t.sent.length,0);await a;
 assert.equal(t.sent.length,1);assert.deepEqual(t.sent[0].v,{music:{h:'new'},limit:30,updatedAt:3});
 assert.deepEqual(R.mergeSettings({music:{h:'a',w:'b'},limit:20},t.sent[0].v),{music:{h:'new',w:'b'},limit:30,updatedAt:3});
});
test('settings patch handles null, empty maps and arrays without clearing unchanged siblings',()=>{
 assert.deepEqual(R.settingsPatch({x:{a:1,b:2},nil:3,arr:[1,2]}, {x:{a:1},nil:null,arr:[],updatedAt:5}),{nil:null,arr:[],updatedAt:5});
 assert.deepEqual(R.settingsPatch({x:{a:1}}, {x:{},updatedAt:5}),{x:{},updatedAt:5});
 assert.deepEqual(R.mergeSettings({x:{a:1}}, {x:{}}),{x:{}});
});
test('only preference sets and shared setting updates are optimized; cache-only baselines are not authoritative',async()=>{
 const t=writes({limit:20},{cache:true});await t.run('fbWrite_("meta/kakei","update",{limit:20,updatedAt:2})');assert.equal(t.sent.length,1);
 const raw={exists:true,fromCache:false,data:()=>({mode:'dark',pal:'forest'})};t.c.fbWatchGroups.set('doc:data/users/h/prefs',{raw});
 await t.run('fbWrite_("data/users/h/prefs","set",{mode:"light",pal:"forest",updatedAt:3})');
 assert.deepEqual(t.sent.at(-1),{p:'data/users/h/prefs',k:'update',v:{mode:'light',updatedAt:3}});
 await t.run('fbWrite_("items/a","set",{done:true})');assert.equal(t.sent.at(-1).k,'set');
 await t.run('fbWrite_("meta/kakei","set",{limit:40})');assert.equal(t.sent.at(-1).k,'set');
});
test('missing preference documents remain full creates; failed writes can retry and never suppress newer edits',async()=>{
 let fail=true;const t=writes({limit:20},{send:async()=>{if(fail)throw Error('fail');}});
 await assert.rejects(t.run('fbWrite_("meta/kakei","update",{limit:30})'));
 fail=false;await t.run('fbWrite_("meta/kakei","update",{limit:30})');assert.equal(t.sent.length,2);
 await t.run('fbWrite_("data/users/new/prefs","set",{mode:"dark"})');assert.equal(t.sent.at(-1).k,'set');
});
test('settings coalescing still enters the durable quota queue and overlays merged values',async()=>{
 const O=require('../firestore-offline.js');let record={paused:true,until:999,entries:[]};
 const q=O.create({project:'test',store:{read:async()=>record,update:async f=>(record=f(record))},clock:()=>1,id:()=>String(record.entries.length),pauseNetwork:async()=>{},resumeNetwork:async()=>{},limited:()=>false,dayWindow:()=>({end:999}),send:async()=>{throw Error('network must not run');}});await q.loaded;
 const t=writes({music:{h:'a',w:'b'},limit:20});t.c.fbOffline=q;
 const a=t.run('fbWrite_("meta/kakei","update",{music:{h:"new"}})');const b=t.run('fbWrite_("meta/kakei","update",{limit:30})');await Promise.all([a,b]);
 assert.equal(record.entries.length,1);assert.deepEqual(plain(record.entries[0].value),{music:{h:'new'},limit:30});
 assert.equal(q.overlay('meta/kakei',{exists:true,data:()=>({music:{h:'a',w:'b'},limit:20})},false).data().music.w,'b');
});
test('recovery keeps healthy full-history listeners and only rebinds failed or detached ones',()=>{
 const counts=[0,0,0],watches=[{un(){},failed:false},{un(){},failed:true},{un:null,failed:false}];
 watches.forEach((w,i)=>w.bind=()=>{counts[i]++;w.failed=false;w.un=()=>{};});
 const c=vm.createContext({fbWatches:new Set(watches)});vm.runInContext(decl('fbRebind_'),c);vm.runInContext('fbRebind_();fbRebind_()',c);assert.deepEqual(counts,[0,1,1]);
});
function photos(){
 let next=0;const urls=[],revoked=[],listeners=new Map(),imgs=[];
 const c=vm.createContext({window:{},urlCache:new Map(),loading:new Map(),blobValues:new Map(),PIX:'placeholder',ready:Promise.resolve(),Blob,Promise,setTimeout:()=>1,
  URL:{createObjectURL:()=>{const u='blob:'+ ++next;urls.push(u);return u;},revokeObjectURL:u=>revoked.push(u)},
  document:{querySelectorAll:()=>imgs,getElementById:()=>null},DocRef:function(path){this.onSnapshot=(cb,err)=>{assert(!listeners.has(path));listeners.set(path,{cb,err});return()=>listeners.delete(path);};}});
 vm.runInContext(decl('fill')+'\n'+decl('blobSnapshot_'),c);
 vm.runInContext(source.slice(source.indexOf('  window.__blobUrl ='),source.indexOf('  var ASSETS =')),c);
 const data=(n,type='image/jpeg')=>({type,data:{toUint8Array:()=>new Uint8Array([n]),isEqual:b=>b.toUint8Array()[0]===n}});
 return {c,urls,revoked,listeners,imgs,data,run:s=>vm.runInContext(s,c),emit:(id,v,fromCache=false)=>listeners.get('blobs/'+id).cb({exists:v!==null,fromCache,data:()=>v}),image:src=>{const im={src,getAttribute(){return this.src;}};imgs.push(im);return im;}};
}
test('photos use one persistent listener, paint cached bytes first and reuse object URL on server confirmation',async()=>{
 const t=photos(),im=t.image('placeholder#fb=a');assert.equal(t.run('window.__blobUrl("a")'),'placeholder#fb=a');t.run('window.__blobUrl("a")');await Promise.resolve();
 assert.equal(t.listeners.size,1);t.emit('a',t.data(1),true);assert.equal(im.src,'blob:1');t.emit('a',t.data(1));assert.equal(t.urls.length,1);assert.equal(t.run('window.__blobUrl("a")'),'blob:1');
});
test('same-ID restored photos, MIME changes and remote deletes replace existing images and release old URLs',async()=>{
 const t=photos(),im=t.image('placeholder#fb=a');t.run('window.__blobUrl("a")');await Promise.resolve();
 t.emit('a',t.data(1));t.emit('a',t.data(2));assert.equal(im.src,'blob:2');assert.deepEqual(t.revoked,['blob:1']);
 t.emit('a',t.data(2,'image/png'));assert.equal(im.src,'blob:3');t.emit('a',null,true);assert.equal(im.src,'blob:3');
 t.emit('a',null);assert.equal(im.src,'placeholder#fb=a');assert.equal(t.c.urlCache.has('a'),false);assert.equal(t.c.blobValues.has('a'),false);assert.deepEqual(t.revoked,['blob:1','blob:2','blob:3']);
 t.emit('a',t.data(3));assert.equal(im.src,'blob:4');
});

test('background photos update along with image elements, including deletion placeholders',async()=>{
 const t=photos();let css='url("placeholder#fb=a")';t.c.document.getElementById=()=>({style:{getPropertyValue:()=>css,setProperty:(k,v)=>{css=v;}}});
 t.run('window.__blobUrl("a")');await Promise.resolve();t.emit('a',t.data(1));assert.equal(css,'url("blob:1")');t.emit('a',t.data(2));assert.equal(css,'url("blob:2")');t.emit('a',null);assert.equal(css,'url("placeholder#fb=a")');
});

test('a reset followed by nested edits remains two ordered writes so removed siblings cannot return',async()=>{
 const t=writes({music:{h:'a',w:'b'}});const a=t.run('fbWrite_("meta/kakei","update",{music:{}})'),b=t.run('fbWrite_("meta/kakei","update",{music:{h:"new"}})');await Promise.all([a,b]);
 assert.equal(t.sent.length,2);assert.deepEqual(t.sent[0].v,{music:{}});assert.deepEqual(t.sent[1].v,{music:{h:'new'}});
 const final=t.sent.reduce((state,w)=>R.mergeSettings(state,w.v),{music:{h:'a',w:'b'}});assert.deepEqual(final,{music:{h:'new'}});
});
test('a later full preference save retains unsaved fields if an earlier in-flight patch fails',async()=>{
 let rejectFirst,n=0;const t=writes({}, {send:()=>++n===1?new Promise((ok,no)=>rejectFirst=no):Promise.resolve()});
 t.c.fbWatchGroups.set('doc:data/users/h/prefs',{raw:{exists:true,fromCache:false,data:()=>({mode:'dark',pal:'forest'})}});
 const a=t.run('fbWrite_("data/users/h/prefs","set",{mode:"light",pal:"forest"})');const failure=assert.rejects(a);await Promise.resolve();
 const b=t.run('fbWrite_("data/users/h/prefs","set",{mode:"light",pal:"blue"})');await b;rejectFirst(Error('failed'));await failure;
 assert.deepEqual(t.sent[1],{p:'data/users/h/prefs',k:'set',v:{mode:'light',pal:'blue'}});
});
test('metadata-only acknowledgement refreshes the settings baseline without another UI callback',()=>{
 let emit;const seen=[],c=vm.createContext({fbReads:null,fbWatchGroups:new Map(),fbWatches:new Set(),fbOffline:null,fbError_(){},setTimeout,M:{onSnapshot:(ref,opts,cb)=>{emit=cb;return()=>{};}},ref:{path:'data/users/h/prefs',ref:{}},cb:s=>seen.push(s)});
 vm.runInContext(decl('docSnap')+'\n'+decl('fbListen_'),c);vm.runInContext('fbListen_(ref,false,cb)',c);
 const snap=pending=>({id:'prefs',exists:()=>true,data:()=>({mode:'light'}),metadata:{fromCache:false,hasPendingWrites:pending}});
 emit(snap(true));emit(snap(false));assert.equal(seen.length,1);assert.equal(c.fbWatchGroups.get('doc:data/users/h/prefs').raw.hasPendingWrites,false);
});
