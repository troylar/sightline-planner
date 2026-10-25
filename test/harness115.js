// Assistant changes apply on their own at the level chosen in this browser, and never sit unapplied without a reason:
// stale context, expired, editing and review each say so in the results file, and every tick writes a heartbeat.
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, '..', 'dist', 'sightline.html'), 'utf8').replace(/<link[^>]+fonts[^>]+>/, '');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-plan.json'), 'utf8');
const checks = [];
const ok = (label, pass, detail = '') => checks.push(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function fileHandle(name, text = '') {
  const hd = {name, text, writes:0, aborted:0, permission:'granted', beforeClose:null,
    async queryPermission(){ return hd.permission; }, async requestPermission(){ hd.permission = 'granted'; return hd.permission; },
    async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
    async createWritable(){ let draft = ''; return {async write(value){ draft = value; }, async abort(){ hd.aborted++; }, async close(){ if (hd.beforeClose) await hd.beforeClose(); hd.text = draft; hd.writes++; }}; }};
  return hd;
}
function folder() {
  const dir = {name:'Private assistant', files:new Map(), permission:'granted', onGet:null,
    async queryPermission(){ return dir.permission; }, async requestPermission(){ dir.permission = 'granted'; return dir.permission; },
    async getFileHandle(name, opts = {}){ if (dir.onGet) await dir.onGet(name); if (!dir.files.has(name)){
      if (!opts.create){ const e = new Error('Missing'); e.name = 'NotFoundError'; throw e; }
      dir.files.set(name, fileHandle(name)); }
      return dir.files.get(name); }};
  return dir;
}
async function page() {
  const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/', virtualConsole:new VirtualConsole(), beforeParse(w){
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>'Tester'; w.alert = ()=>{};
    w.showOpenFilePicker = async()=>[]; w.showDirectoryPicker = async()=>w.DIR;
    w.Element.prototype.scrollIntoView = function(){}; w.HTMLAnchorElement.prototype.click = function(){};
    w.URL.createObjectURL = ()=>'blob:test'; w.URL.revokeObjectURL = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>({font:'', measureText:t=>({width:String(t).length * 7})});
    w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errors = []; w.addEventListener('error', e=>w.errors.push(e.message));
  }});
  await wait(180);
  const w = dom.window, ev = code=>w.eval(code), dir = folder(); w.DIR = dir; w.FIX = fixture;
  ev(`S = normalize(JSON.parse(FIX), false); S.meta.revision = 7; S.deliverables = [{id:'dv-test', name:'Initial deliverable', stage:'idea'}];
    file.handle = null; resetHistory(); amTried = S.meta.planId; render(); setMe(S.people[0].id);
    window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };
    whoAmI = (x, cb)=>cb(); askWhoOnStart = ()=>{}; download = ()=>{};`);
  return {dom, w, ev, dir, d:w.document};
}
async function exportNow(ev){ ev('clearTimeout(assistantExportTimer)'); await ev('assistantExport()'); }
const json = (dir, name)=>JSON.parse(dir.files.get(name).text);
const act = (action, args)=>({op:'action', action, args});
(async()=>{
  let dom;
  try {
    const p = await page(); ({dom} = p); const {w, ev, dir, d} = p;
    await ev('assistantConnect()'); await wait(25); await exportNow(ev);
    const pid = ev('S.meta.planId'), now = ()=>new Date().toISOString();
    const send = (batchId, changes, extra = {}) => { const body = {kind:'sightline-amendments', version:1, planId:pid, batchId, createdAt:now(), source:'Planning bot', basedOn:{planRevision:ev('S.meta.revision')}, changes, ...extra};
      dir.files.set('sightline-amendments.json', fileHandle('sightline-amendments.json', JSON.stringify(body))); };
    const tick = async()=>{ await ev('assistantTick()'); await wait(30); await exportNow(ev); };
    const results = ()=>json(dir, 'sightline-assistant-results.json'), change = id=>(results().changes || []).find(c=>c.id === id) || {};
    const status = ()=>json(dir, 'sightline-assistant-status.json');

    await tick();
    ok('H1 every tick writes a heartbeat with the state, level and revision', dir.files.has('sightline-assistant-status.json') && status().kind === 'sightline-assistant-status' && status().state === 'review' && status().autoApply === 'review' && status().planRevision === 7 && status().everySeconds === 30, dir.files.has('sightline-assistant-status.json') ? JSON.stringify(status()) : 'none');
    const w0 = dir.files.get('sightline-assistant-status.json').writes; await tick();
    ok('H2 the heartbeat is written again on the next tick, with a fresh time', dir.files.get('sightline-assistant-status.json').writes > w0);

    send('b-review', [{id:'r1', summary:'A risk', ops:[act('risk.add', {id:'risk-a', text:'Vendor limits', sev:'high'})]}]); await tick();
    ok('L1 by default nothing applies on its own, and the results say it waits for review', !ev("S.risks.some(r=>r.id==='risk-a')") && change('r1').held && change('r1').held.code === 'review', JSON.stringify(change('r1').held));
    ev("sel = {type:'amend', id:'x'}; render()");
    ok('L2 the panel offers the three levels, starting at review', !!d.querySelector('#amAuto') && d.querySelector('#amAuto').value === 'review' && d.querySelectorAll('#amAuto option').length === 3);
    ev("amSetLevel('routine')"); await wait(60); await tick();
    ok('L3 at "routine" a waiting routine change applies on its own', ev("S.risks.some(r=>r.id==='risk-a')") && change('r1').outcome === 'applied', JSON.stringify(change('r1')));
    ok('L4 as one quick update, with its source', ev('past.length') >= 1 && /applied on its own|on its own/.test(d.querySelector('#status').textContent), d.querySelector('#status').textContent);
    ok('L5 the level is kept in this browser, per plan, not in the folder', ev(`localStorage.getItem('sightline-assistant-auto:' + S.meta.planId)`) === 'routine' && !JSON.stringify([...dir.files.values()].map(f=>f.name)).includes('auto'));

    send('b-del', [{id:'d1', summary:'Delete m5', ops:[act('initiative.del', {id:'m5'})]}, {id:'d2', summary:'A gate', ops:[act('gate.add', {id:'gate-x', gate:'Security review'})]}]); await tick();
    ok('R1 at "routine" a delete waits for review and says why; the rest applies', !!ev("barById('m5')") && change('d1').held && /deletes/.test(change('d1').held.reason) && change('d2').outcome === 'applied', JSON.stringify([change('d1'), change('d2').outcome]));
    ev("amSetLevel('all')"); await wait(60); await tick();
    ok('R2 at "all" the delete applies', !ev("barById('m5')") && change('d1').outcome === 'applied', JSON.stringify(change('d1')));
    ev("barById('m4').tasks = [{id:'task-j', label:'Jira work', start:S.meta.start, days:1, status:'notstarted', owners:[], jira:'ABC-12', dependsOn:[]}]; render()");
    send('b-floor', [{id:'f1', summary:'Delete m4', ops:[act('initiative.del', {id:'m4'})]}], {basedOn:{planRevision:ev('S.meta.revision')}}); await tick();
    ok('R3 deleting an initiative with Jira-linked work always waits, even at "all"', !!ev("barById('m4')") && change('f1').held && /Jira-linked/.test(change('f1').held.reason), JSON.stringify(change('f1').held));

    send('b-stale', [{id:'s1', summary:'A risk', ops:[act('risk.add', {id:'risk-s', text:'Old news'})]}], {basedOn:{planRevision:5}}); await tick();
    ok('S1 a batch written against an older revision never applies on its own', !ev("S.risks.some(r=>r.id==='risk-s')") && change('s1').held && change('s1').held.code === 'stale_context', JSON.stringify(change('s1').held));
    ok('S2 and says both revisions and what to do', /revision 5/.test(change('s1').held.reason) && /revision 7/.test(change('s1').held.reason) && /Read sightline-assistant-view.json again/.test(change('s1').held.reason));
    ok('S3 the heartbeat names the held batch', status().batchId === 'b-stale' && status().batchHeld && status().batchHeld.code === 'stale_context');

    send('b-old', [{id:'o1', summary:'A risk', ops:[act('risk.add', {id:'risk-o', text:'Late'})]}], {createdAt:new Date(Date.now() - 2 * 3600e3).toISOString()}); await tick();
    ok('E1 a batch more than an hour old is expired, not applied', !ev("S.risks.some(r=>r.id==='risk-o')") && change('o1').held && change('o1').held.code === 'expired', JSON.stringify(change('o1').held));
    send('b-nodate', [{id:'n1', summary:'A risk', ops:[act('risk.add', {id:'risk-n', text:'Undated'})]}], {createdAt:undefined}); await tick();
    ok('E2 a batch without createdAt waits for review', !ev("S.risks.some(r=>r.id==='risk-n')") && change('n1').held && change('n1').held.code === 'review', JSON.stringify(change('n1').held));

    ev("window.realHandle = file.handle; window.realBase = file.baseText; file.baseText = JSON.stringify(planOfRecord(S)); file.handle = {name:'plan.json'}; file.dirty = true");
    send('b-edit', [{id:'e1', summary:'A risk', ops:[act('risk.add', {id:'risk-e', text:'While editing'})]}]); await tick();
    ok('X1 with unsaved edits nothing applies, and the results say who is editing', !ev("S.risks.some(r=>r.id==='risk-e')") && change('e1').held && change('e1').held.code === 'editing', JSON.stringify(change('e1').held));
    ok('X2 the heartbeat says editing', status().state === 'editing');
    ev("file.handle = realHandle; file.baseText = realBase; file.dirty = false");

    // Pause, and risk by size
    ev("amSetLevel('routine')"); await wait(30);
    ev("sel = {type:'amend', id:'x'}; render()"); d.querySelector('#amPause').click(); await wait(30);
    send('b-pause', [{id:'p1', summary:'A risk', ops:[act('risk.add', {id:'risk-p', text:'While paused'})]}]); await tick();
    ok('P1 Pause: nothing applies, the results say paused, and so does the heartbeat', !ev("S.risks.some(r=>r.id==='risk-p')") && change('p1').held && change('p1').held.code === 'paused' && status().state === 'paused', JSON.stringify([change('p1').held, status().state]));
    ok('P1 …and the panel offers Resume', d.querySelector('#amPause') && d.querySelector('#amPause').textContent === 'Resume');
    d.querySelector('#amPause').click(); await wait(30); await tick();
    ok('P2 Resume applies it', ev("S.risks.some(r=>r.id==='risk-p')") && change('p1').outcome === 'applied', JSON.stringify(change('p1')));
    ev(`(()=>{ const P = planOfRecord(S), lane = P.lanes[0].id; for (let i = 0; i < 7; i++) P.bars.push({id:'z' + i, lane, start:0.2 * i, span:0.2, label:'Chain ' + i, status:'notstarted', owners:[], tasks:[], dependsOn:i ? ['z' + (i - 1)] : []});
      S = normalize(P, false); render(); })()`);
    const late = ev("S.bars.filter(b=>!b.id.startsWith('z') && !(b.tasks || []).length && !b.jira).sort((a, b)=>(b.start + b.span) - (a.start + a.span))[0].id");
    send('b-big', [{id:'z', summary:'Start the chain later', ops:[act('link.add', {id:'z0', after:late})]}]); await tick();
    ok('Z1 at "routine" a change that moves more than 5 other items waits for review and says how many', ev("!(barById('z0').dependsOn || []).includes(" + JSON.stringify(late) + ")") && change('z').held && /moves \d+ other items/.test(change('z').held.reason), JSON.stringify(change('z')));
    ev("amSetLevel('all')"); await wait(30); await tick();
    ok('Z2 at "all" it applies', ev("(barById('z0').dependsOn || []).includes(" + JSON.stringify(late) + ")") && change('z').outcome === 'applied', JSON.stringify(change('z')));
    ev("amSetLevel('routine')"); await wait(30);
    const many = n => [0, 1, 2].map(c=>({id:'m' + c, summary:'Risks', ops:Array.from({length:n}, (_, i)=>act('risk.add', {id:`risk-m${c}-${i}`, text:'Many'}))}));
    send('b-many', many(20)); await tick();
    ok('Z3 at "routine" a batch touching more than 50 items waits for review', !ev("S.risks.some(r=>r.id==='risk-m0-0')") && change('m0').held && /more than 50/.test(change('m0').held.reason), JSON.stringify(change('m0')));
    send('b-some', many(10).map(c=>({...c, id:c.id + 'b', ops:c.ops.map(o=>({...o, args:{...o.args, id:o.args.id + 'b'}}))}))); await tick();
    ok('Z4 …and a batch of 30 applies', ev("S.risks.some(r=>r.id==='risk-m0-0b')") && change('m0b').outcome === 'applied', JSON.stringify(change('m0b')));
    ev("Object.defineProperty(document, 'hidden', {configurable:true, get:()=>true})");
    send('b-hidden', [{id:'h1', summary:'A risk', ops:[act('risk.add', {id:'risk-h', text:'In the background'})]}]); await tick();
    ok('B1 a background tab still applies when changes apply on their own', ev("S.risks.some(r=>r.id==='risk-h')"));
    ev("amSetLevel('review')"); const w1 = dir.files.get('sightline-assistant-status.json').writes; await tick();
    ok('B2 at "review" a background tab stays quiet, as before', dir.files.get('sightline-assistant-status.json').writes === w1);
    ev("Object.defineProperty(document, 'hidden', {configurable:true, get:()=>false})");

    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
