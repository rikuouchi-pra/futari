const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../firestore-reads.js'),F=require('../firestore-monitor.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../shim.js'),'utf8');
function fixture(){
 const data=Array.from({length:3508},(_,i)=>({id:String(i).padStart(5,'0'),data:()=>({at:Math.floor(i/3),text:'fixture'})}));
 const requests=[],values=new Map(),store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),get length(){return values.size;},key:i=>[...values.keys()][i]};
 const meter=R.create({project:'test',user:'test',storage:store,dayWindow:F.dayWindow,setTimeout:()=>1});
 const compare=(a,b)=>a.data().at-b.data().at||(a.id<b.id?-1:a.id>b.id?1:0);
 function read(q){let rows=data.slice();const order=q.constraints?.find(x=>x.kind==='order'),limit=q.constraints?.find(x=>x.kind==='limit'),where=q.constraints?.find(x=>x.kind==='where'),cursor=q.constraints?.find(x=>x.kind==='after');
  rows.sort((a,b)=>(order?.direction==='desc'?-1:1)*compare(a,b));if(where)rows=rows.filter(d=>d.data()[where.field]<where.value);if(cursor)rows=rows.filter(d=>(order?.direction==='desc'?-1:1)*compare(d,cursor.cursor)>0);if(limit)rows=rows.slice(0,limit.count);
  requests.push({q,count:rows.length});return {docs:rows,size:rows.length,empty:!rows.length,metadata:{fromCache:false},docChanges:()=>rows.map(doc=>({type:'added',doc}))};
 }
 const M={collection:(_,...p)=>({path:p.join('/')}),doc:(_,...p)=>({path:p.join('/')}),orderBy:(field,direction)=>({kind:'order',field,direction}),limit:count=>({kind:'limit',count}),where:(field,op,value)=>({kind:'where',field,op,value}),startAfter:cursor=>({kind:'after',cursor}),query:(ref,...constraints)=>({...ref,constraints}),getDocs:async q=>read(q),getDocsFromCache:async q=>({...read(q),metadata:{fromCache:true}}),onSnapshot:(q,_opts,fn)=>{fn(read(q));return ()=>{};}};
 const c=vm.createContext({M,fs:{},fbReads:meter,fbSharedReads:R.singleFlight(),fbOffline:null,fbWatches:new Set(),fbError_(){},window:{},Promise,JSON,seen:[],nativeRows:data});
 vm.runInContext(source.slice(source.indexOf('  function fbReadRaw_'),source.indexOf('  function clean')),c);
 return {c,requests,meter,run:s=>vm.runInContext(s,c),data};
}
test('shipped query adapter reads 100 of 3508 rows and snapshot cursors preserve timestamp ties',async()=>{
 const t=fixture();t.run('var col=new ColRef("activity");var stop=col.page("at",100).onSnapshot(s=>seen.push(s));');
 assert.equal(t.requests[0].count,100);assert.equal(t.meter.snapshot().total.reads,100);
 let s=t.c.seen[0],ids=s.docs.map(d=>d.id);while(s.docs.length===100){t.c.cursor=s.cursor;s=await t.run('col.page("at",100,cursor).get()');ids.push(...s.docs.map(d=>d.id));}
 assert.equal(ids.length,3508);assert.equal(new Set(ids).size,3508);assert.ok(t.requests.every(x=>x.count<=100));assert.equal(t.meter.snapshot().capacity.docs,3508);t.run('stop()');assert.equal(t.meter.snapshot().active,0);
});
test('different query windows cannot share a flight, and cleanup fetches at most 40 old rows',async()=>{
 const t=fixture();t.run('var col=new ColRef("activity");');t.c.cursor=t.data[3408];
 const [a,b]=await Promise.all([t.run('col.page("at",100).get()'),t.run('col.page("at",100,cursor).get()')]);assert.notEqual(a.docs[0].id,b.docs[0].id);assert.equal(t.requests.length,2);
 const old=await t.run('col.before("at",100,40).get()');assert.equal(old.docs.length,40);assert.ok(old.docs.every(d=>d.data().at<100));assert.equal(t.requests.at(-1).q.constraints.find(x=>x.kind==='where').field,'at');
});
test('paused local overlays obey limits and cursors and cannot leak newer queued rows into old pages',async()=>{
 const t=fixture();t.c.cursor=t.data[100];t.c.fbOffline={snapshot:()=>({paused:true}),overlay:(_path,s)=>({...s,docs:s.docs.concat([{id:'99999',data:()=>({at:99999})},{id:'00000',data:()=>({at:0})}])})};
 const s=await t.run('new ColRef("activity").page("at",10,cursor).get()');assert.equal(s.docs.length,10);assert.ok(s.docs.every(d=>d.data().at<=t.c.cursor.data().at));assert.equal(s.metadata.fromCache,true);assert.equal(t.meter.snapshot().total.reads,0);
});
