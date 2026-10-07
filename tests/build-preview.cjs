// Build a sandbox-only preview of the actual app; never loads config.js or shim.js.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const boot=fs.readFileSync(path.join(__dirname,'preview-bootstrap.js'),'utf8');
const marker='/* ================= connect ================= */';
const start=html.indexOf(marker),end=html.indexOf('</script>',start);
if(start<0||end<0)throw new Error('Cannot find connection bootstrap');
html=html.slice(0,start)+boot+'\n'+html.slice(end);
html=html.replace(/<script src="(?:config\.js|(?:shim|firestore-monitor|firestore-offline|firestore-reads)\.js[^\"]*)"><\/script>/g,'');
html=html.replace(/<link[^>]*>/g,'');
html=html.replace(/<script>if\("serviceWorker"[\s\S]*?<\/script>/,'');
html=html.replaceAll('localStorage','previewStorage');
const isolated=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<script>const previewMemory=new Map([['futari.prefs',JSON.stringify({onboarded:'1',tipDone:'1',music:'off',wx:'off',haptic:'off',qaPop:'off',aiBrief:'off'})]]);const previewStorage={getItem:k=>previewMemory.get(k)||null,setItem:(k,v)=>previewMemory.set(k,String(v))};</script>`;
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8">'+isolated);
if(/<script src=|serviceWorker\.register|claude\.use\("db"\)/.test(html))throw new Error('Production connector leaked into preview');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
const version=html.match(/APP_VERSION="(\d+)"/)[1], destination=path.join(root,'preview/v'+version);
fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,'app.html'),html);
console.log('Built isolated preview:',Buffer.byteLength(html),'bytes');
