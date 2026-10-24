// Refused edit locks and failed-link retries must preserve the current browser work, not only an older draft.
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, '..', 'dist', 'sightline.html'), 'utf8').replace(/<link[^>]+fonts[^>]+>/, '');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-plan.json'), 'utf8');
const checks = [], pages = [];
const ok = (label, pass, detail = '') => checks.push(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`);
const wait = ms => new Promise(resolve=>setTimeout(resolve, ms));
setTimeout(()=>{ console.log(checks.join('\n')); console.log('FAIL harness timed out'); process.exit(1); }, 40000).unref();
async function page(){
  const hd = {name:'reconnect-test.json', text:'', writes:0, failReads:false,
    async queryPermission(){ return 'granted'; }, async requestPermission(){ return 'granted'; },
    async getFile(){ if (hd.failReads) throw new Error('Synthetic read error'); return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
    async createWritable(){ let next = ''; return {async write(text){ next = text; }, async close(){ hd.text = next; hd.writes++; }, async abort(){}}; }};
  const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/', virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate(2026, 9, 8, 10).getTime();
    w.Date = class extends RealDate { constructor(...args){ args.length ? super(...args) : super(now); } static now(){ return now; } };
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.showOpenFilePicker = async()=>[hd]; w.confirm = ()=>true; w.prompt = ()=>'Tester'; w.alert = ()=>{};
    w.URL.createObjectURL = ()=>'blob:test'; w.URL.revokeObjectURL = ()=>{};
    w.Element.prototype.scrollIntoView = function(){}; w.HTMLAnchorElement.prototype.click = function(){};
    w.HTMLCanvasElement.prototype.getContext = ()=>({font:'', measureText:t=>({width:String(t).length * 7})});
    w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errors = []; w.addEventListener('error', e=>w.errors.push(e.message));
  }});
  pages.push(dom); await wait(160);
  const w = dom.window, ev = code=>w.eval(code), d = w.document; w.FIX = fixture; w.HD = hd;
  ev(`stopAuto(); S = normalize(JSON.parse(FIX), false); HD.text = serialize(S, HD.name); installPlan(S, HD.text, HD);
    whoAmI = (x, cb)=>cb(); askWhoOnStart = ()=>{}; askName = ()=>'Tester'; kvSet = async()=>true;
    window.downloads = []; download = (...args)=>{ downloads.push(args); return true; }; render();`);
  return {w, ev, d, hd, close:()=>ev('stopAuto(); stopHeartbeat();')};
}
const section = async fn=>{ try { await fn(); } catch(e){ ok('section crashed', false, String(e.stack).slice(0, 600)); } };
const remoteButtons = d=>[...d.querySelectorAll('#banners button')];
(async()=>{
  await section(async()=>{
    const p = await page(), {ev, d, hd} = p; await ev('startEditing(false)');
    ev(`commit(s=>{ s.bars[0].label = 'Latest browser name'; }); flushPersist(); file.holdLock = false; stopHeartbeat(); window.historyBefore = JSON.stringify(past);`);
    const remote = JSON.parse(hd.text); remote.meta.lock = {by:'Blake', id:'another-session', at:ev('new Date().toISOString()')}; hd.text = JSON.stringify(remote);
    const text = hd.text, writes = hd.writes; await ev('startEditing(false)');
    ok('L1 refused foreign lock preserves dirty live plan and complete undo history', ev(`S.bars[0].label === 'Latest browser name' && file.dirty && !file.holdLock && JSON.stringify(past) === historyBefore`));
    ev('flushPersist()');
    ok('L2 persistence after refusal retains the latest recovery draft', ev(`JSON.parse(localStorage.getItem(STORE_DRAFT) || 'null')?.data.bars[0].label === 'Latest browser name'`));
    ok('L3 refusal never writes or backs up without a deliberate choice', hd.text === text && hd.writes === writes && ev('downloads.length') === 0);
    ok('L4 refusal offers preservation choices', remoteButtons(d).some(b=>b.textContent === 'Load file version (back up mine)'));
    const later = remoteButtons(d).find(b=>b.textContent === 'Decide later'); if (later) later.click();
    ok('L5 Decide later leaves all local work intact', ev(`S.bars[0].label === 'Latest browser name' && file.dirty && JSON.stringify(past) === historyBefore`)); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, hd} = p; await ev('startEditing(false)');
    ev(`commit(s=>{ s.bars[0].label = 'Pending across expiry'; }); file.holdLock = false; stopHeartbeat(); window.historyBefore = JSON.stringify(past);`);
    await ev('startEditing(false)');
    ok('L6 reacquiring an unchanged file preserves edits and undo', ev(`file.holdLock && file.dirty && S.bars[0].label === 'Pending across expiry' && JSON.stringify(past) === historyBefore`));
    ev('undo()'); ok('L7 the preserved undo step works after reacquiring', ev(`S.bars[0].label !== 'Pending across expiry'`)); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, d, hd} = p; await ev('startEditing(false)');
    ev(`commit(s=>{ s.bars[0].label = 'Before failure'; });`); hd.failReads = true; await ev('save()');
    ok('R1 a read failure keeps a current draft before disconnecting', ev(`!file.handle && file.dirty && JSON.parse(localStorage.getItem(STORE_DRAFT) || 'null')?.data.bars[0].label === 'Before failure'`));
    ev(`commit(s=>{ s.bars[0].label = 'Typed after disconnect'; }); window.historyBefore = JSON.stringify(past);`);
    hd.failReads = false; const writes = hd.writes;
    const retry = remoteButtons(d).find(b=>b.textContent === 'Try again'); if (!retry) throw new Error('Missing retry action'); retry.click(); await ev('op.chain');
    ok('R2 Try again preserves live edits newer than the captured draft and restores link', ev(`file.handle === HD && file.dirty && S.bars[0].label === 'Typed after disconnect' && JSON.stringify(past) === historyBefore`));
    ok('R3 unchanged-file retry refreshes draft without writing the shared file', hd.writes === writes && ev(`JSON.parse(localStorage.getItem(STORE_DRAFT) || 'null')?.data.bars[0].label === 'Typed after disconnect'`));
    await ev('save()');
    ok('R4 normal Save writes the preserved latest edit', JSON.parse(hd.text).bars[0].label === 'Typed after disconnect' && !ev('file.dirty')); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, hd} = p;
    ev(`showLinkProblem(HD, 'Synthetic disconnect'); commit(s=>{ s.bars[0].label = 'First edit while disconnected'; });`);
    ok('R5 disconnected clean plans remain editable without a shared dirty flag', ev(`!file.handle && !file.dirty && S.bars[0].label === 'First edit while disconnected'`));
    await ev('adopt(HD, true)');
    ok('R6 reconnect detects edits made after a clean disconnect', ev(`file.handle === HD && file.dirty && S.bars[0].label === 'First edit while disconnected'`)); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, hd} = p; await ev('startEditing(false)');
    ev(`commit(s=>{ s.bars[0].label = 'Local title to merge'; }); showLinkProblem(HD, 'Synthetic disconnect');`);
    const remote = JSON.parse(hd.text); remote.meta.lock = null; remote.bars[1].label = 'Teammate other title'; hd.text = JSON.stringify(remote); const writes = hd.writes;
    await ev('adopt(HD, true)');
    ok('R7 changed unlocked file merges independent edits while leaving them unsaved', ev(`S.bars[0].label === 'Local title to merge' && S.bars[1].label === 'Teammate other title' && file.dirty && !file.holdLock`));
    ok('R8 reconnect merge keeps remote file untouched and captures a current draft', hd.writes === writes && ev(`JSON.parse(localStorage.getItem(STORE_DRAFT) || 'null')?.data.bars[1].label === 'Teammate other title'`)); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, hd} = p; await ev('startEditing(false)');
    ev(`commit(s=>{ s.bars[0].label = 'Local conflicting title'; }); showLinkProblem(HD, 'Synthetic disconnect');`);
    const remote = JSON.parse(hd.text); remote.meta.lock = null; remote.bars[0].label = 'Newer teammate title'; hd.text = JSON.stringify(remote);
    await ev('adopt(HD, true)');
    ok('R9 a merge that chooses a teammate value downloads the latest local version first', ev(`S.bars[0].label === 'Newer teammate title' && downloads.some(x=>JSON.parse(x[0]).bars[0].label === 'Local conflicting title')`)); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, d, hd} = p; await ev('startEditing(false)');
    ev(`commit(s=>{ s.bars[0].label = 'Keep during foreign lock'; }); showLinkProblem(HD, 'Synthetic disconnect'); window.historyBefore = JSON.stringify(past);`);
    const remote = JSON.parse(hd.text); remote.meta.lock = {by:'Blake', id:'another-session', at:ev('new Date().toISOString()')}; remote.bars[0].label = 'Shared foreign version'; hd.text = JSON.stringify(remote); const text = hd.text, writes = hd.writes;
    await ev('adopt(HD, true)');
    ok('R10 foreign-lock retry preserves live state/history and offers a conflict', ev(`S.bars[0].label === 'Keep during foreign lock' && file.dirty && !file.holdLock && JSON.stringify(past) === historyBefore`) && remoteButtons(d).some(b=>b.textContent === 'Load file version (back up mine)'));
    const load = remoteButtons(d).find(b=>b.textContent === 'Load file version (back up mine)'); if (load) { load.click(); await ev('op.chain'); }
    ok('R11 deliberate file load backs up live work and never changes remote contents', ev(`S.bars[0].label === 'Shared foreign version' && !file.dirty && downloads.some(x=>JSON.parse(x[0]).bars[0].label === 'Keep during foreign lock')`) && hd.text === text && hd.writes === writes); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, d, hd} = p; await ev('startEditing(false)');
    ev(`commit(s=>{ s.bars[0].label = 'Edit for original plan only'; }); showLinkProblem(HD, 'Synthetic disconnect'); window.historyBefore = JSON.stringify(past); window.originalId = S.meta.planId; window.originalBase = file.baseText;`);
    const original = hd.text, remote = JSON.parse(original); remote.meta.planId = 'different-plan'; remote.meta.lock = null; hd.text = JSON.stringify(remote);
    const text = hd.text, writes = hd.writes; const adopted = await ev('adopt(HD, true)');
    ok('R13 a replacement plan refuses reconnect and preserves the original state and history', adopted === false && ev(`!file.handle && interruptedLink === HD && file.dirty && S.meta.planId === originalId && S.bars[0].label === 'Edit for original plan only' && JSON.stringify(past) === historyBefore && file.baseText === originalBase`));
    ok('R14 replacement refusal explains recovery without offering an overwrite', d.querySelector('#banners').textContent.includes('different plan') && !remoteButtons(d).some(b=>/Overwrite with mine/.test(b.textContent)));
    await ev('startEditing(false)'); await ev('save()');
    ok('R15 edit and save after refusal cannot write to the replacement file', hd.text === text && hd.writes === writes);
    ev('flushPersist()');
    ok('R16 the original edit remains in the recovery draft', ev(`JSON.parse(localStorage.getItem(STORE_DRAFT) || 'null')?.data.bars[0].label === 'Edit for original plan only'`));
    hd.text = original; await ev('adopt(HD, true)');
    ok('R17 retry can reconnect when the original plan returns', ev(`file.handle === HD && file.dirty && S.meta.planId === originalId && S.bars[0].label === 'Edit for original plan only'`)); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, hd} = p;
    ev(`showLinkProblem(HD, 'Synthetic disconnect'); commit(s=>{ s.bars[0].label = 'Local edit after clean disconnect'; }); window.originalId = S.meta.planId;`);
    const remote = JSON.parse(hd.text); remote.meta.planId = 'different-plan'; hd.text = JSON.stringify(remote); const text = hd.text, writes = hd.writes;
    const adopted = await ev('adopt(HD, true)');
    ok('R18 replacement refusal also preserves and persists edits made after a clean disconnect', adopted === false && ev(`!file.handle && S.meta.planId === originalId && S.bars[0].label === 'Local edit after clean disconnect' && JSON.parse(localStorage.getItem(STORE_LOCAL) || 'null')?.meta.planId === originalId && JSON.parse(localStorage.getItem(STORE_LOCAL) || 'null')?.bars[0].label === 'Local edit after clean disconnect'`) && hd.text === text && hd.writes === writes); p.close();
  });
  await section(async()=>{
    const p = await page(), {ev, d, hd} = p; await ev('startEditing(false)');
    ev(`commit(s=>{ s.bars[0].label = 'Keep before newer format'; }); showLinkProblem(HD, 'Synthetic disconnect');`);
    const remote = JSON.parse(hd.text); remote.meta.savedWith = '9.0.0'; remote.meta.features = ['holograms']; remote.holograms = [{id:'future-item'}]; hd.text = JSON.stringify(remote); const text = hd.text, writes = hd.writes;
    await ev('adopt(HD, true)');
    ok('R12 newer-format reconnect keeps edits and offers no unsafe overwrite action', ev(`S.bars[0].label === 'Keep before newer format' && file.dirty && !file.holdLock`) && !remoteButtons(d).some(b=>/Overwrite with mine/.test(b.textContent)) && hd.text === text && hd.writes === writes); p.close();
  });
  await wait(40);
  ok('no uncaught browser errors', pages.every(p=>!p.window.errors.length), pages.flatMap(p=>p.window.errors).join('; '));
  pages.forEach(p=>p.window.close()); console.log(checks.join('\n')); const failed = checks.filter(x=>x.startsWith('FAIL')).length;
  console.log(`${checks.length - failed}/${checks.length} passed`); process.exit(failed ? 1 : 0);
})();
