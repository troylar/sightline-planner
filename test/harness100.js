// One private assistant connection keeps saved context/results current without publishing unsaved plan edits.
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
(async()=>{
  let dom;
  try {
    const p = await page(); ({dom} = p); const {w, ev, dir, d} = p;
    ok('A0 assistant connection supported', ev("typeof assistantConnect === 'function'"));
    if (!ev("typeof assistantConnect === 'function'")) throw new Error('Missing assistant folder workflow');
    ev("sel = {type:'amend', id:'x'}; render()");
    ok('U1 first use has one folder action and collapsed manual alternative', !!d.querySelector('#assistantConnect') && !d.querySelector('#assistantIndividualFiles').open && d.querySelector('#amExport0').closest('details') === d.querySelector('#assistantIndividualFiles'));
    const directoryPicker = w.showDirectoryPicker, filePicker = w.showOpenFilePicker;
    w.showDirectoryPicker = undefined; w.showOpenFilePicker = undefined; ev('render()');
    ok('U2 unsupported browser explains automatic connection and expands honest fallback', !d.querySelector('#assistantConnect') && d.querySelector('#assistantIndividualFiles').open && /Edge or Chrome/.test(d.querySelector('#assistantBrowserHelp').textContent) && d.querySelector('#amConnect2').disabled && !!d.querySelector('#amExport0'));
    w.showDirectoryPicker = directoryPicker; w.showOpenFilePicker = filePicker; ev('render()');
    await ev('assistantConnect()'); await wait(25); await exportNow(ev);
    ok('A1 one folder connection creates context, results and the heartbeat only', dir.files.size === 3 && dir.files.has('sightline-assistant-status.json') && !dir.files.has('sightline-amendments.json'));
    ev("sel = {type:'amend', id:'x'}; render()");
    ok('A1b one-click assistant handoff is available', !!d.querySelector('#assistantCopyInstructions') && ev('assistantInstructions()').includes('Never overwrite'));
    ok('A2 directory remembered per plan', ev("remembered.get('assistantDir:' + S.meta.planId) === DIR"));
    let context = json(dir, 'sightline-assistant-view.json');
    ok('A3 context has current choices, IDs and source ownership', context.deliverables[0].id === 'dv-test' && context.choices.people.length && context.ownership.jira && context.snapshot.source === 'this-browser');
    ev('window.snapshotBuilds = 0; const originalPayloads = assistantPayloads; assistantPayloads = ()=>{ snapshotBuilds++; return originalPayloads(); };');
    const initialWrites = dir.files.get('sightline-assistant-view.json').writes + dir.files.get('sightline-assistant-results.json').writes;
    ev('render(); render(); render(); assistantScheduleExport()'); await wait(240); await exportNow(ev);
    ok('P1 view-only renders do not build snapshots or rewrite output files', ev('snapshotBuilds') === 0 && dir.files.get('sightline-assistant-view.json').writes + dir.files.get('sightline-assistant-results.json').writes === initialWrites);
    await ev('assistantTick()'); await wait(240); await exportNow(ev);
    ok('P2 unchanged foreground poll does not rebuild context', ev('snapshotBuilds') === 0);
    ev("dvById('dv-test').line = 'New customer wording'; changeGen++; render()"); await wait(240); await exportNow(ev);
    ok('P3 a real browser-plan edit rebuilds once and updates context', ev('snapshotBuilds') === 1 && json(dir, 'sightline-assistant-view.json').deliverables[0].line === 'New customer wording');
    const ch = {id:'rename', summary:'Rename deliverable', ops:[{op:'set', type:'deliverable', id:'dv-test', field:'name', prev:'Initial deliverable', value:'Updated deliverable'}]};
    const input = {kind:'sightline-amendments', version:1, planId:ev('S.meta.planId'), batchId:'batch-one', basedOn:{planRevision:7}, changes:[ch]};
    const inbox = fileHandle('sightline-amendments.json', JSON.stringify(input)); dir.files.set(inbox.name, inbox);
    await ev('assistantTick()'); await exportNow(ev);
    ok('A4 read proposals without applying them', ev('AM.file.changes.length') === 1 && ev("dvById('dv-test').name") === 'Initial deliverable');
    ok('A5 ready results visible to assistant', json(dir, 'sightline-assistant-results.json').changes[0].status === 'ready' && inbox.writes === 0);
    await ev("amApply(['rename'])"); await exportNow(ev);
    let results = json(dir, 'sightline-assistant-results.json');
    ok('A6 applied receipt reflects plan', ev("dvById('dv-test').name") === 'Updated deliverable' && results.changes[0].outcome === 'applied');
    ev("dvById('dv-test').name = 'Initial deliverable'; changeGen++; render()"); await exportNow(ev);
    ok('A7 undo invalidates an earlier applied outcome', json(dir, 'sightline-assistant-results.json').changes[0].outcome === 'waiting');
    ev("amMark(AM.file.batchId, AM.file.changes[0], 'skipped')"); await exportNow(ev);
    ok('A8 skipped outcome exported', json(dir, 'sightline-assistant-results.json').changes[0].outcome === 'skipped');
    w.OPS = [{...ch.ops[0], value:'Edited deliverable'}]; ev('amSetEdit(AM.file.batchId, AM.file.changes[0], OPS)'); await exportNow(ev);
    results = json(dir, 'sightline-assistant-results.json');
    ok('A9 human edit exports original and effective operations', results.changes[0].edited && results.changes[0].effectiveOps[0].value === 'Edited deliverable' && results.changes[0].originalOps[0].value === 'Updated deliverable');
    // Publish confirmed shared context while deliberately leaving a different unsaved value in the browser.
    w.PLANHD = fileHandle('plan.json'); ev("file.handle = PLANHD; file.baseText = serialize(clone(planOfRecord(S)), 'plan.json'); file.dirty = true; dvById('dv-test').name = 'Unsaved local value'; changeGen++;");
    await exportNow(ev); context = json(dir, 'sightline-assistant-view.json');
    ok('A10 unsaved shared edits excluded and flagged', context.deliverables[0].name === 'Initial deliverable' && context.snapshot.source === 'saved-shared-file' && context.snapshot.unsavedChangesInBrowser && ev("dvById('dv-test').name") === 'Unsaved local value');
    const sharedBuilds = ev('snapshotBuilds');
    ev("dvById('dv-test').name = 'Still unsaved'; changeGen++; render()"); await wait(240); await exportNow(ev);
    ok('P4 further unsaved typing does not reconstruct shared context', ev('snapshotBuilds') === sharedBuilds && json(dir, 'sightline-assistant-view.json').deliverables[0].name === 'Initial deliverable');
    ev("file.baseText = file.baseText.replace('Initial deliverable', 'Teammate value'); file.dirty = false; changeGen++;"); await exportNow(ev);
    results = json(dir, 'sightline-assistant-results.json');
    ok('A11 changed saved field reports conflict', results.changes[0].status === 'conflicted' && results.changes[0].currentValues[0].value === 'Teammate value' && /expected/.test(results.changes[0].reasons.join(' ')));
    // Automatic amendment refresh cannot replace an open editor's unsaved text.
    ev("sel = {type:'amend', id:'x'}; UI.amEditing = 'rename'; render()");
    const field = d.querySelector('#amed-rename-0-value'); field.value = 'Still typing'; field.focus(); field.setSelectionRange(3, 6);
    input.changes[0].ops[0].value = 'Assistant rewrite'; inbox.text = JSON.stringify(input);
    await ev('assistantTick()');
    ok('A12 live proposals defer while editing', field === d.querySelector('#amed-rename-0-value') && field.value === 'Still typing' && field.selectionStart === 3 && ev('AM.file.changes[0].ops[0].value') === 'Updated deliverable');
    ev('UI.amEditing = null'); field.blur(); ev('render()'); await ev('assistantForeground()'); await wait(35);
    ok('A13 foreground reads proposals immediately', ev('AM.file.changes[0].ops[0].value') === 'Assistant rewrite');
    ev("sel = {type:'amend', id:'x'}; UI.amEditing = 'rename'; render()");
    input.changes[0].ops[0].value = 'After panel closed'; inbox.text = JSON.stringify(input);
    ev('sel = null; render()'); await ev('assistantForeground()'); await wait(35);
    ok('A13b closing an editor resumes refresh without stale busy state', !d.querySelector('#amEdit-rename') && !ev('assistantInteractionBusy()') && ev('AM.file.changes[0].ops[0].value') === 'After panel closed');
    ev("sel = {type:'amend', id:'x'}; UI.amEditing = 'rename'; render()");
    input.changes[0].ops[0].value = 'After navigation'; inbox.text = JSON.stringify(input);
    ev('sel = null; setWs("timeline"); render()'); await ev('assistantForeground()'); await wait(35);
    ok('A13c navigation away resumes external proposals', !ev('assistantInteractionBusy()') && ev('AM.file.changes[0].ops[0].value') === 'After navigation');

    dir.permission = 'prompt'; await ev('assistantTick()');
    const writes = dir.files.get('sightline-assistant-view.json').writes;
    await exportNow(ev);
    ok('A14 revoked permission pauses exports', ev('AM.paused') === true && dir.files.get('sightline-assistant-view.json').writes === writes);
    await ev('assistantReconnect()'); await exportNow(ev);
    ok('A15 one reconnect resumes', !ev('AM.paused') && dir.permission === 'granted');
    inbox.text = '{broken'; await ev('assistantTick()'); await exportNow(ev);
    ok('A16 broken proposal file clears old changes and exports error', !ev('AM.file') && !!json(dir, 'sightline-assistant-results.json').inputError);
    dir.files.delete(inbox.name); await ev('assistantTick()'); await exportNow(ev);
    ok('A17 absent inbox clears stale proposals without recreating it', !ev('AM.file') && !ev('AM.handle') && !dir.files.has(inbox.name));
    const contextFile = dir.files.get('sightline-assistant-view.json');
    contextFile.text = JSON.stringify({kind:'sightline-assistant-view', plan:{id:'another-plan'}}); const oldWrites = contextFile.writes;
    ev('AM.exportHash = ""'); await exportNow(ev);
    ok('A18 refuses other plan output overwrite', contextFile.writes === oldWrites && /another plan/.test(ev('AM.exportError')));
    contextFile.text = ''; ev('AM.exportError = ""; AM.exportHash = ""');
    dir.onGet = async name=>{ if (name === 'sightline-assistant-view.json'){ dir.onGet = null; ev('AM = null'); } };
    await exportNow(ev);
    ok('A19 disconnected in-flight export cannot finish writing', contextFile.writes === oldWrites);
    dir.onGet = null; await ev('assistantConnect()'); await exportNow(ev);
    const connected = ev('AM'); ev('AM = null; amTried = ""; amRestore()'); await wait(45);
    ok('A20 restore uses remembered folder', ev('AM.dir === DIR') && ev('AM') !== connected);
    // A source revision changing during awaited I/O invalidates the export before any close.
    const beforeRevisionRace = contextFile.writes;
    ev('AM.exportHash = ""');
    dir.onGet = async name=>{ if (name === 'sightline-assistant-view.json'){ dir.onGet = null; ev("file.baseText = file.baseText.replace('Teammate value', 'New saved value'); changeGen++"); } };
    await exportNow(ev);
    ok('A21 source changing during export cannot publish stale context', contextFile.writes === beforeRevisionRace);
    await exportNow(ev);
    ok('A22 next export uses new saved source', json(dir, 'sightline-assistant-view.json').deliverables[0].name === 'New saved value');
    // Derive a linked item's status from a synthetic Jira snapshot; the real browser state remains untouched.
    ev(`const savedPlan = parseText(file.baseText); savedPlan.bars.push({id:'bar-jira-test', lane:savedPlan.lanes[0].id, label:'Linked work', jira:'ABC-991', start:0, span:1, status:'notstarted', owners:[], tasks:[], epics:[]});
      file.baseText = serialize(savedPlan, 'plan.json'); JIRA = {kind:'sightline-jira-status', generatedAt:'2026-10-08T10:00:00Z', issues:{'ABC-991':{summary:'Current Jira title', status:'Done', category:'done', type:'Story'}}, sprints:[], releases:[], rollups:{}}; dropJiraMemos();`);
    const beforeSnapshot = ev('JSON.stringify(S)'), beforeShadow = ev('JSON.stringify([...jiraShadow])');
    await exportNow(ev); context = json(dir, 'sightline-assistant-view.json');
    ok('A23 context uses current Jira status and freshness with ownership', context.initiatives.find(b=>b.id === 'bar-jira-test').status === 'done' && context.initiatives.find(b=>b.id === 'bar-jira-test').jiraLinked && context.jira.syncedAt === '2026-10-08T10:00:00Z');
    ok('A24 context building restores plan and Jira shadow', ev('JSON.stringify(S)') === beforeSnapshot && ev('JSON.stringify([...jiraShadow])') === beforeShadow);
    ev('amDisconnect()'); const writeCount = contextFile.writes; await ev('assistantTick()'); await exportNow(ev);
    ok('A25 disconnect stops writes and forgets folder', ev('AM') === null && contextFile.writes === writeCount && !ev("remembered.has('assistantDir:' + S.meta.planId)"));
    ok('A26 no browser script errors', !w.errors.length, w.errors.join(';'));
  } catch(e){ ok('section crashed', false, String(e.stack).slice(0, 600)); }
  if (dom) dom.window.close();
  console.log(checks.join('\n')); const fail = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`${checks.length - fail}/${checks.length} passed`); process.exit(fail ? 1 : 0);
})();
