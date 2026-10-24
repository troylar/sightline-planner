// Local shared-file checks and deliberate whole-copy recovery. No OneDrive upload claim.
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,'../dist/sightline.html'),'utf8');
const fixture = fs.readFileSync(path.join(__dirname,'fixtures/sample-plan.json'),'utf8');
const R = [], ok = (n,c) => R.push(`${c?'PASS':'FAIL'}  ${n}`), wait = ms => new Promise(r=>setTimeout(r,ms));
const handles = [];
function handle(text,name='shared.json'){
  const hd={name,text,writes:0,reads:0,onRead:null,onClose:null,permission:'granted',gone:false,size:null,
    async getFile(){ hd.reads++; if(hd.onRead)await hd.onRead(); if(hd.gone){const e=new Error('gone');e.name='NotFoundError';throw e;} const text=hd.text;return {size:hd.size??text.length,text:async()=>text};},
    async queryPermission(){return hd.permission;}, async requestPermission(){return hd.permission;},
    async createWritable(){let data;return {write:async v=>{data=v;},close:async()=>{hd.text=data;hd.writes++;if(hd.onClose)await hd.onClose();}};}};
  handles.push(hd);return hd;
}
async function page(auto){
  const prefs=new Map();if(auto!==undefined)prefs.set('auto',auto);
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:new VirtualConsole(),beforeParse(w){
    w.indexedDB={open(){const r={};setTimeout(()=>{r.result={close(){},transaction(){const tx={objectStore(){return {get(k){const q={};setTimeout(()=>{q.result=prefs.get(k);q.onsuccess?.();},0);return q;},put(v,k){prefs.set(k,v);setTimeout(()=>tx.oncomplete?.(),0);},delete(k){prefs.delete(k);setTimeout(()=>tx.oncomplete?.(),0);}};}};return tx;}};r.onsuccess?.();},0);return r;}};
    w.showOpenFilePicker=async()=>[w.picked]; w.confirm=()=>true; w.prompt=()=> 'Tester'; w.alert=()=>{};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
    w.HTMLAnchorElement.prototype.click=function(){};w.URL.createObjectURL=()=> 'blob:x';w.URL.revokeObjectURL=()=>{};
    w.CSS=w.CSS||{};w.CSS.escape=s=>s;w.Element.prototype.scrollIntoView=function(){};
    w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:String(t).length*7})});
    w.errors=[];w.addEventListener('error',e=>w.errors.push(e.message));
  }});
  const w=dom.window,d=w.document,ev=s=>w.eval(s);await wait(180);w.fixture=fixture;
  ev("askWhoOnStart=()=>{}; S=normalize(JSON.parse(fixture),true); S.meta.planId='synthetic-shared-plan'; S.meta.revision=8; S.meta.savedAt='2026-10-08T12:00:00Z'; locked=false; UI.noWelcome=true; render();");
  const hd=handle(ev('serialize(S,"shared.json")'));w.hd=hd;await ev('adopt(hd,false)');await wait(15);
  w.downloads=[];ev('download=(text,name)=>{downloads.push({text,name});return true;}');
  const candidate=JSON.parse(hd.text);candidate.bars[0].label='Recovered example';candidate.bars.splice(1,1);candidate.meta.revision=2;candidate.meta.title='Ignored old settings';
  const cp=handle(JSON.stringify(candidate),'conflict-copy.json');w.picked=cp;
  return {w,d,ev,hd,cp,dom,prefs,close(){dom.window.close();}};
}
async function section(fn){try{await fn();}catch(e){ok('section completed: '+e.message,false);}}
(async()=>{
  await section(async()=>{const p=await page();const {ev,d,hd,w}=p;
    ok('Auto defaults on when preference absent',d.querySelector('#auto').checked);
    ok('automatic checking is discoverable beside linked file',!!d.querySelector('#stripAuto')?.checked);
    ev('stopAuto(); window.draws=0; window.events=0; render=()=>{draws++;}; planChanged=()=>{events++;}; file.lastCheck=1;');const writes=hd.writes;
    await ev('refresh(false)');
    ok('unchanged check stamps successful local read',ev('file.lastCheck')>1 && /local file checked.*cloud sync not verified/.test(d.querySelector('#fileCheck')?.textContent||''));
    ok('unchanged check does not render or publish plan change',ev('draws===0 && events===0')&&hd.writes===writes);
    const successful=ev('file.lastCheck');hd.text='{bad json';await ev('refresh(false)');
    ok('invalid remote data preserves prior successful check and current plan',ev('file.lastCheck')===successful&&ev('S.bars[0].label')!=='Recovered example');
    hd.gone=true;await ev('refresh(false)');ok('moved file preserves screen and edits without writes',ev('file.handle===null')&&ev('S.bars.length')>0&&hd.writes===writes);p.close();
  });
  await section(async()=>{const p=await page(false),{ev,d,w,hd}=p;
    ok('explicit Auto opt-out survives connection',!d.querySelector('#auto').checked&&ev('autoTimer===null'));
    const reads=hd.reads;w.dispatchEvent(new w.Event('focus'));await wait(25);ok('Auto off does not refresh on foreground return',hd.reads===reads);
    ev('setAuto(true);');await wait(25);const start=hd.reads;
    const input=d.createElement('input');d.body.append(input);input.focus();w.dispatchEvent(new w.Event('focus'));d.dispatchEvent(new w.Event('visibilitychange'));await ev("typeof checkSharedWhenReady==='function'?checkSharedWhenReady():Promise.resolve()");await wait(20);
    ok('poll/focus/visibility all defer while typing',hd.reads===start);
    input.blur();const modal=d.querySelector('#dlgHelp');modal.showModal();await ev("typeof checkSharedWhenReady==='function'?checkSharedWhenReady():Promise.resolve()");await wait(10);ok('automatic checks defer inside open dialog',hd.reads===start);modal.close();
    ev('drag={};');await ev("typeof checkSharedWhenReady==='function'?checkSharedWhenReady():Promise.resolve()");ok('automatic checks defer while dragging',hd.reads===start);ev('drag=null;');
    w.dispatchEvent(new w.Event('focus'));await wait(25);ok('foreground return checks when ready and writes nothing',hd.reads>start&&hd.writes===0);p.close();
  });
  for(const enabled of [true,false])await section(async()=>{const p=await page(enabled),{ev,w,hd}=p;
    const target=handle('', 'new-shared.json');target.onClose=async()=>{target.text='{unexpected replacement';};w.showSaveFilePicker=async()=>target;
    const previous=ev('S.meta.planId');await ev('newSharedPlan()');
    ok(`new file readback failure retains previous linked plan (Auto ${enabled?'on':'off'})`,ev('file.handle===hd')&&ev('S.meta.planId')===previous&&target.reads>0);
    ok(`failed new file keeps explicit Auto ${enabled?'on':'off'} state`,enabled?ev('autoTimer!==null'):ev('autoTimer===null'));
    ok('failed new file does not write previous plan',hd.writes===0);p.close();
  });
  await section(async()=>{const p=await page(),{ev,d,hd}=p;
    const input=d.createElement('input');input.className='quick';d.body.append(input);
    const old=ev('S.bars[0].label'), next=JSON.parse(hd.text);next.bars[0].label='Arriving while typing';hd.text=JSON.stringify(next);
    hd.onRead=async()=>{hd.onRead=null;input.focus();input.value='Still drafting';};
    await ev("typeof checkSharedWhenReady==='function'?checkSharedWhenReady():refresh(false)");
    ok('typing begun during slow read defers incoming change and preserves draft/focus',ev('S.bars[0].label')===old&&input.value==='Still drafting'&&d.activeElement===input);
    input.blur();await ev("typeof checkSharedWhenReady==='function'?checkSharedWhenReady():refresh(false)");
    ok('deferred remote change arrives on next eligible check without writes',ev('S.bars[0].label')==='Arriving while typing'&&hd.writes===0);p.close();
  });
  await section(async()=>{const p=await page(),{ev,d,hd,w}=p;
    ok('guided read-only copy review available',typeof ev('window.reviewAnotherCopy')==='function');if(typeof ev('window.reviewAnotherCopy')!=='function'){p.close();return;}
    await ev('reviewAnotherCopy()');const dialog=d.querySelector('#dlgCopyReview');
    ok('review shows missing work and field before/after',!!dialog&&/1 shared-file items.*missing/.test(dialog.textContent)&&/label:.*Recovered example/.test(dialog.textContent));
    ok('preview performs no writes and preserves clean original',hd.writes===0&&!ev('file.dirty')&&ev('S.bars[0].label')!=='Recovered example');
    d.querySelector('#copyReviewDownload').click();ok('both exact originals downloadable before deciding',w.downloads.length===2&&w.downloads[0].text===hd.text&&w.downloads[1].text===p.cp.text);
    d.querySelector('#copyReviewUse').click();await ev('op.chain');await wait(20);
    ok('recovery writes lock only and loads copy as unsaved edits',hd.writes===1&&JSON.parse(hd.text).bars[0].label!=='Recovered example'&&ev('S.bars[0].label')==='Recovered example'&&ev('file.dirty && file.holdLock'));
    ok('canonical entire metadata retained instead of foreign lock/settings/revision',ev('S.meta.title')!== 'Ignored old settings'&&ev('S.meta.revision')===8&&ev('S.meta.lock.id===SESSION'));
    ok('current shared text retained as save base',ev('file.baseText')===hd.text&&w.downloads.length===4);
    await ev('save()');ok('only deliberate Save writes recovered contents',hd.writes===2&&JSON.parse(hd.text).bars[0].label==='Recovered example'&&JSON.parse(hd.text).meta.revision===9);ok('successful save says local file',/Saved to local file/.test(d.querySelector('#status').textContent));ok('recovery raises no browser errors',!w.errors.length);p.close();
  });
  for(const mode of ['foreign plan','newer format','oversize','different dates','remote changed','dirty','plan switched','cancel during read','cancel during compare check','cancel during permission','cancel during write','race after lock','foreign lock'])await section(async()=>{
    const p=await page(),{ev,d,hd,cp,w}=p;if(typeof ev('window.reviewAnotherCopy')!=='function'){ok(mode+': safe refusal available',false);p.close();return;}
    const change=fn=>{const x=JSON.parse(cp.text);fn(x);cp.text=JSON.stringify(x);};
    if(mode==='foreign plan')change(x=>x.meta.planId='another-plan');if(mode==='newer format')change(x=>x.meta.features=['unknown-feature']);if(mode==='oversize')cp.size=6*1024*1024;if(mode==='different dates')change(x=>x.meta.start='2026-08-03');
    await ev('reviewAnotherCopy()');const use=d.querySelector('#copyReviewUse');
    if(['foreign plan','newer format','oversize','different dates'].includes(mode)){ok(mode+': rejected without writes or edits',!use&&hd.writes===0&&!ev('file.dirty'));p.close();return;}
    if(mode==='remote changed'){const x=JSON.parse(hd.text);x.bars[0].label='Teammate later';hd.text=JSON.stringify(x);}
    if(mode==='dirty')ev("file.dirty=true;S.bars[0].label='Unsaved mine';");
    if(mode==='plan switched')ev('file.gen++;');
    if(mode==='foreign lock'){const x=JSON.parse(hd.text);x.meta.lock={by:'Another editor',id:'other-tab',at:new Date().toISOString()};hd.text=JSON.stringify(x);}
    if(mode==='cancel during compare check'){let count=0;hd.onRead=async()=>{if(++count===2){hd.onRead=null;d.querySelector('#dlgCopyReview').close();}};}
    if(mode==='cancel during read')hd.onRead=async()=>{hd.onRead=null;d.querySelector('#dlgCopyReview').close();};
    if(mode==='cancel during permission'){hd.permission='prompt';hd.requestPermission=async()=>{d.querySelector('#dlgCopyReview').close();return 'granted';};}
    if(mode==='cancel during write')hd.onClose=async()=>{hd.onClose=null;d.querySelector('#dlgCopyReview').close();};
    if(mode==='race after lock')hd.onClose=async()=>{const x=JSON.parse(hd.text);x.bars[0].label='Teammate race';hd.text=JSON.stringify(x);};
    use.click();await ev('op.chain');await wait(15);
    ok(mode+': refuses stale recovery and preserves current edits',ev('S.bars[0].label')!=='Recovered example'&&(mode!=='dirty'||ev('S.bars[0].label')==='Unsaved mine')&&hd.writes===(mode==='race after lock'?1:mode==='cancel during write'?2:0)&&(mode!=='cancel during write'||JSON.parse(hd.text).meta.lock===null));p.close();
  });
  console.log(R.join('\n'));const failures=R.filter(x=>x.startsWith('FAIL')).length;console.log(`${R.length-failures}/${R.length} passed`);process.exit(failures?1:0);
})();
