/* Durable local changes while Firestore is rate limited. No background copy is sent elsewhere. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FutariFirestoreOffline=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const empty=()=>({paused:false,until:0,entries:[]});
  function storage(indexedDB,key){
    let opened;
    function db(){if(!opened)opened=new Promise((ok,ng)=>{let done=false;const t=setTimeout(()=>{done=true;ng(Error('端末の保存領域が応答しません'));},8000),r=indexedDB.open('futari-recovery',1);r.onupgradeneeded=()=>r.result.createObjectStore('queues');r.onsuccess=()=>{clearTimeout(t);if(done)r.result.close();else ok(r.result);};r.onerror=r.onblocked=()=>{done=true;clearTimeout(t);ng(r.error||Error('端末の保存領域を開けません'));};});return opened;}
    async function update(fn){const d=await db();return new Promise((ok,ng)=>{const tx=d.transaction('queues','readwrite'),s=tx.objectStore('queues'),r=s.get(key);let value;r.onsuccess=()=>{try{value=fn(r.result||empty());s.put(value,key);}catch(e){tx.abort();ng(e);}};tx.oncomplete=()=>ok(value);tx.onabort=tx.onerror=()=>ng(tx.error||Error('端末への保存ができませんでした'));});}
    async function read(){const d=await db();return new Promise((ok,ng)=>{const r=d.transaction('queues').objectStore('queues').get(key);r.onsuccess=()=>ok(r.result||empty());r.onerror=()=>ng(r.error);});}
    return {read,update};
  }
  function merge(a,b){const out={...a};for(const k of Object.keys(b||{})){if(['__proto__','constructor','prototype'].includes(k))continue;const v=b[k];out[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(a&&a[k]&&typeof a[k]==='object'?a[k]:{},v):v;}return out;}
  function apply(data,entries){let d=data;for(const e of entries){if(e.kind==='delete')d=null;else d=e.kind==='set'?e.value:merge(d||{},e.value);}return d;}
  function create(o){
    let record=empty(),error='',job=null,recovering=false,ready=false;
    const clock=o.clock||Date.now;
    const loaded=o.store.read().then(r=>{record=r;ready=true;return r;}).catch(()=>{error='端末内の保存領域を開けません。未同期の変更を保存できません。';ready=true;return record;});
    const notify=()=>{if(o.onChange)o.onChange(snapshot());};
    function snapshot(){return {paused:record.paused,pending:record.entries.length,until:record.until,recovering,error,ready};}
    async function pause(e){await loaded;if(record.paused)return;record=await o.store.update(r=>({...r,paused:true,until:o.dayWindow(clock()).end}));if(o.onError)o.onError(e);await o.pauseNetwork();notify();if(o.rebind)o.rebind();}
    async function enqueue(path,kind,value){
      const entry={id:o.id(),path,kind,at:clock(),...(kind==='delete'?{}:{value:JSON.parse(JSON.stringify(value))})};
      try{record=await o.store.update(r=>({...r,paused:true,entries:[...r.entries,entry]}));error='';}catch(e){error='端末に変更を保存できませんでした。この変更は保存済みではありません。';notify();throw Error(error);}
      notify();if(o.emit)o.emit(path);return {local:true};
    }
    async function syncState(){await loaded;const wasPaused=record.paused;record=await o.store.read();if(wasPaused&&!record.paused){await o.resumeNetwork();if(o.rebind)o.rebind();}else if(!wasPaused&&record.paused){await o.pauseNetwork();if(o.rebind)o.rebind();}}
    async function write(path,kind,value){await syncState();if(record.paused)return enqueue(path,kind,value);try{return await o.send(path,kind,value);}catch(e){if(!record.paused&&!o.limited(e))throw e;await pause(e);return enqueue(path,kind,value);}}
    function overlay(path,base,isCollection){
      if(!isCollection){const data=apply(base.exists?base.data():null,record.entries.filter(e=>e.path===path));return {...base,exists:data!==null,fromCache:record.paused||base.fromCache,pendingLocal:record.entries.some(e=>e.path===path),data:()=>data};}
      const prefix=path+'/',rows=new Map(base.docs.map(d=>[d.id,d.data()]));
      for(const e of record.entries){if(!e.path.startsWith(prefix)||e.path.slice(prefix.length).includes('/'))continue;const id=e.path.slice(prefix.length),v=apply(rows.has(id)?rows.get(id):null,[e]);if(v===null)rows.delete(id);else rows.set(id,v);}
      return {...base,docs:[...rows].map(([id,d])=>({id,data:()=>d})),size:rows.size,empty:rows.size===0,metadata:{...base.metadata,fromCache:record.paused||!!base.metadata?.fromCache,pendingLocal:record.entries.length>0}};
    }
    async function reload(){await syncState();notify();if(o.emit)o.emit();}
    function resume(manual){
      if(job)return job;
      job=(async()=>{await syncState();if(!record.paused){notify();return;}if(!manual&&clock()<record.until)return;
        const owner=o.id();record=await o.store.update(r=>r.lease&&r.lease.until>clock()?r:{...r,lease:{owner,until:clock()+90000}});if(record.lease.owner!==owner)return;
        recovering=true;error='';notify();if(o.unbind)o.unbind();
        try{
          await o.resumeNetwork();await o.probe();
          for(let i=0;i<500;i++){
            record=await o.store.update(r=>r.lease&&r.lease.owner===owner?{...r,lease:{owner,until:clock()+90000}}:r);if(!record.lease||record.lease.owner!==owner)throw Error('同期の担当が変わりました');const e=record.entries[0];
            if(!e){record=await o.store.update(r=>r.entries.length?r:{...r,paused:false,until:0});if(!record.paused)break;continue;}
            await o.send(e.path,e.kind,e.value);record=await o.store.update(r=>({...r,entries:r.entries.filter(x=>x.id!==e.id)}));notify();
          }
          if(record.paused){await o.pauseNetwork();record=await o.store.update(r=>({...r,until:clock()+60000}));}
        }catch(e){record=await o.store.update(r=>({...r,paused:true,until:clock()+900000}));error='まだ同期できません。変更は端末に残し、15分後に再確認します。';if(o.onError)o.onError(e);await o.pauseNetwork();
        }finally{record=await o.store.update(r=>r.lease&&r.lease.owner===owner?{...r,lease:null}:r);recovering=false;notify();if(o.rebind)o.rebind();}
      })().finally(()=>{job=null;});return job;
    }
    return {loaded,snapshot,pause,write,overlay,reload,resume,export:async()=>{await reload();return JSON.parse(JSON.stringify({project:o.project,at:clock(),pendingChanges:record.entries}));}};
  }
  return {storage,create,merge,apply};
});
