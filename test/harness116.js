// Changes an app makes for a person carry {app, name, batch} on their stamps and change records, and survive a
// save, a reopen, YAML and normalize; a plan that has them names the appVia1 feature so older copies open it read-only.
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
    ev(`amSetLevel('routine')`);
    const pid = ev('S.meta.planId'), now = ()=>new Date().toISOString();
    const send = (batchId, changes) => dir.files.set('sightline-amendments.json', fileHandle('sightline-amendments.json', JSON.stringify({kind:'sightline-amendments', version:1, planId:pid, batchId, createdAt:now(), source:'Planning bot', basedOn:{planRevision:ev('S.meta.revision')}, changes})));
    const tick = async()=>{ await ev('assistantTick()'); await wait(30); await exportNow(ev); };
    const bar = ev('S.bars.find(b=>!b.jira && !(b.tasks || []).length && !S.bars.some(c=>c.parent === b.id)).id');
    send('bot-1', [{id:'c1', summary:'Vendor risk', ops:[act('risk.add', {id:'risk-vendor', text:'Vendor limits', sev:'high'})]},
                   {id:'c2', summary:'Rename', ops:[act('initiative.set', {id:bar, field:'label', value:'Renamed by the bot'})]}]);
    await tick();
    const risk = JSON.parse(ev(`JSON.stringify(S.risks.find(r=>r.id === 'risk-vendor') || null)`)), b = JSON.parse(ev(`JSON.stringify(barById(${JSON.stringify(bar)}))`));
    ok('V1 an item an assistant added says which app and batch, and the person it acted for', !!risk && risk.added && risk.added.by === ev('meId()') && JSON.stringify(risk.added.via) === JSON.stringify({app:'assistant', name:'Planning bot', batch:'bot-1'}), JSON.stringify(risk && risk.added));
    ok('V1 …and an item it edited too', b.label === 'Renamed by the bot' && b.edited && b.edited.via && b.edited.via.batch === 'bot-1', JSON.stringify(b.edited));
    ev(`select('bar', ${JSON.stringify(bar)})`); await wait(20);
    ok('V2 the card says it was edited via the assistant', /edited by .+ via Planning bot/.test((d.querySelector('#f-addedby') || {}).textContent || ''), (d.querySelector('#f-addedby') || {}).textContent);
    ev(`commit(s=>{ s.bars.find(x=>x.id === ${JSON.stringify(bar)}).label = 'Renamed by hand'; })`);
    ok('V3 an edit by hand afterwards is stamped without an app', !ev(`barById(${JSON.stringify(bar)}).edited.via`) && !!ev(`S.risks.find(r=>r.id === 'risk-vendor').added.via`));
    ok('V4 a plan with app stamps names the appVia1 feature, which this copy knows', ev(`featuresIn(S).includes('appVia1') && KNOWN_FEATURES.includes('appVia1')`) === true);
    ok('V4 …and a plan without them doesn\'t', ev(`featuresIn(normalize(JSON.parse(FIX), false)).includes('appVia1')`) === false);
    ok('V4 an older copy that doesn\'t know app stamps opens the plan read-only', ev(`(()=>{ const p = JSON.parse(serialize(planOfRecord(S), 'p.json')); const known = KNOWN_FEATURES.slice(); KNOWN_FEATURES.splice(KNOWN_FEATURES.indexOf('appVia1'), 1); const t = tooNew(p); KNOWN_FEATURES.splice(0, KNOWN_FEATURES.length, ...known); return !!t && t.unknown.includes('appVia1'); })()`) === true);
    ok('V5 saving and opening again keeps every app stamp (JSON)', ev(`(()=>{ const t = serialize(planOfRecord(S), 'plan.json'), p2 = parseText(t); return JSON.stringify(p2.risks.find(r=>r.id === 'risk-vendor').added.via) === JSON.stringify(S.risks.find(r=>r.id === 'risk-vendor').added.via) && JSON.parse(t).meta.features.includes('appVia1'); })()`) === true);
    ok('V5 …and YAML', ev(`(()=>{ const p2 = parseText(serialize(planOfRecord(S), 'plan.yaml')); return p2.risks.find(r=>r.id === 'risk-vendor').added.via.batch === 'bot-1'; })()`) === true);
    ok('V5 …and a merge with a teammate\'s copy keeps the stamps from both sides', ev(`(()=>{ const base = planOfRecord(S), mine = clone(base), theirs = clone(base);
      theirs.risks.push({id:'risk-theirs', sev:'low', text:'Theirs', owners:[], item:'', added:{by:'', at:'2026-10-01T10:00Z', via:{app:'assistant', name:'Their bot', batch:'tb-1'}}});
      const m = mergePlans(base, mine, theirs), P = m.plan || m; return P.risks.find(r=>r.id === 'risk-theirs').added.via.batch === 'tb-1' && P.risks.find(r=>r.id === 'risk-vendor').added.via.batch === 'bot-1'; })()`) === true);
    ok('V6 a change record keeps the app', ev(`JSON.stringify(changeRecord('x', [{op:'set', type:'bars', id:'b', field:'label', value:'y'}], {app:'assistant', name:'Planning bot', batch:'bot-1'}).via)`) === JSON.stringify({app:'assistant', name:'Planning bot', batch:'bot-1'}));
    ok('V6 …and opening the plan keeps it', ev(`(()=>{ const P = planOfRecord(S); P.changes = [{id:'chg-1', by:'', at:new Date().toISOString(), what:'x', via:{app:'assistant', name:'Planning bot', batch:'bot-1'}, ops:[]}]; return normalize(P, false).changes[0].via.app; })()`) === 'assistant');
    ok('V7 a malformed app stamp is dropped, the stamp kept', ev(`(()=>{ const P = planOfRecord(S); P.risks[0].added = {by:'', at:'2026-10-01T10:00Z', via:{app:'Evil App <b>', name:'x'}}; const r = normalize(P, false).risks[0].added; return !r.via && r.at === '2026-10-01T10:00Z'; })()`) === true);
    ok('V7 a long app name is cut to 80 characters', ev(`normVia({app:'assistant', name:'x'.repeat(500)}).name.length`) === 80);
    { const hd = fileHandle('plan.json', ev(`serialize(planOfRecord(S), 'plan.json')`)); w.HD = hd;
      ev(`installPlan(parseText(HD.text), HD.text, HD); file.dirty = false; file.holdLock = false;`);
      const r = await ev(`(()=>{ const fn = s=>{ s.risks.push({id:'risk-q', sev:'low', text:'Quick', owners:[], item:''}); }; fn.via = {app:'assistant', name:'Planning bot', batch:'bot-2'}; return quickSave('a quick update', fn); })()`);
      const saved = JSON.parse(hd.text), rec = (saved.changes || []).slice(-1)[0] || {};
      ok('V8 a quick update to the shared file records the app on its change and on the item', r === true && rec.via && rec.via.batch === 'bot-2' && saved.risks.find(x=>x.id === 'risk-q').added.via.batch === 'bot-2', JSON.stringify(rec).slice(0, 200));
      // Undo this batch: only that batch's changes go back, with other quick updates after it kept, and a teammate's newer value kept.
      send('bot-3', [{id:'u1', summary:'Two risks', ops:[act('risk.add', {id:'risk-u1', text:'Undo me', sev:'low'}), act('risk.add', {id:'risk-u2', text:'Teammate edits me', sev:'low'})]}]);
      await tick();
      const has = id => JSON.parse(hd.text).risks.some(x=>x.id === id);
      ok('V9 the batch applied to the shared file on its own', has('risk-u1') && has('risk-u2'), JSON.stringify(JSON.parse(hd.text).risks.map(x=>x.id)));
      await ev(`quickSave('a later update', s=>{ s.risks.push({id:'risk-later', sev:'low', text:'Later', owners:[], item:''}); })`);
      { const t = JSON.parse(hd.text); t.risks.find(x=>x.id === 'risk-u2').text = 'A teammate changed this'; hd.text = JSON.stringify(t); }
      ev("sel = {type:'amend', id:'x'}; render()"); await wait(20);
      const btn = d.querySelector('[data-undo-batch="bot-3"]');
      ok('V10 the Assistant panel offers Undo this batch for it', !!btn, (d.querySelector('#amUndo') || {}).textContent);
      await ev(`undoBatch('bot-3')`); await wait(30);
      ok('V10 undo removes what the batch added, and keeps the later update', !has('risk-u1') && has('risk-later'), JSON.stringify(JSON.parse(hd.text).risks.map(x=>x.id)));
      ok('V10 …and keeps an item a teammate changed since', has('risk-u2') && JSON.parse(hd.text).risks.find(x=>x.id === 'risk-u2').text === 'A teammate changed this');
      ev('file.handle = null'); }
    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.stack); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
