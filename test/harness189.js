// The team's work order (vision.md, principle 17 and Deciding what matters): initiative ids in the order the team takes
// them. The forecast gives ordered work people first, unordered work follows as before, and a plan without an order
// forecasts exactly as it did. Waiting for other work still comes first, Jira-dated work keeps its sprint, merges keep a
// copy when two people reorder, older copies open such a plan read-only, the Forecast lists and moves it, and an app's
// change to it (or to an outcome's priority) is held for a person at every level, end to end. Every name is invented.
const {JSDOM, VirtualConsole} = require('jsdom'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, '..', 'dist', 'sightline.html'), 'utf8').replace(/<link[^>]+fonts[^>]+>/, '');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-plan.json'), 'utf8'), checks = [];
const ok = (name, pass, x = '') => checks.push(`${pass ? 'PASS' : 'FAIL'} ${name}${x ? '  (' + x + ')' : ''}`);
const wait = ms => new Promise(r=>setTimeout(r, ms));
setTimeout(()=>{ console.log(checks.join('\n')); console.log('TIMEOUT'); process.exit(1); }, 80000).unref();
const HOSTILE = '<img src=x onerror="window.pwned=1"> Ingest';
function fileHandle(name, text = ''){
  const hd = {name, text, writes:0, permission:'granted', async queryPermission(){ return hd.permission; }, async requestPermission(){ return hd.permission; },
    async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
    async createWritable(){ let draft = ''; return {async write(v){ draft = v; }, async abort(){}, async close(){ hd.text = draft; hd.writes++; }}; }};
  return hd; }
function folder(){
  const dir = {name:'Private assistant', files:new Map(), permission:'granted', async queryPermission(){ return dir.permission; }, async requestPermission(){ return dir.permission; },
    async getFileHandle(name, opts = {}){ if (!dir.files.has(name)){ if (!opts.create){ const e = new Error('Missing'); e.name = 'NotFoundError'; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }};
  return dir; }
async function page(){
  const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/', virtualConsole:new VirtualConsole(), beforeParse(w){
    const D = w.Date; w.Date = class extends D {constructor(...a){ super(...(a.length ? a : ['2026-10-24T14:00:00Z'])); } static now(){ return new D('2026-10-24T14:00:00Z').getTime(); }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>'Tester'; w.alert = ()=>{}; w.showOpenFilePicker = async()=>[]; w.showDirectoryPicker = async()=>w.DIR;
    w.Element.prototype.scrollIntoView = function(){}; w.HTMLAnchorElement.prototype.click = function(){}; w.URL.createObjectURL = ()=>'blob:test'; w.URL.revokeObjectURL = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>({font:'', measureText:t=>({width:String(t).length * 7})}); w.CSS = {escape:s=>s}; w.errors = []; w.addEventListener('error', e=>w.errors.push(e.message)); }});
  await wait(180); const w = dom.window; w.FIX = fixture; w.DIR = folder(); return {dom, w, d:w.document, ev:s=>w.eval(s), J:s=>JSON.parse(w.eval(`JSON.stringify(${s})`))}; }
(async()=>{
  try {
    // A small plan: Data has Casey alone, so A and C compete for one person.
    const {w, d, ev, J} = await page();
    ev(`(()=>{ const P = JSON.parse(FIX); P.meta.planId = 'p-wo1';
      P.lanes = [{id:'l-data',name:'Data',members:['p-casey']},{id:'l-plat',name:'Platform',members:['p-avery']}];
      P.people = [{id:'p-casey',name:'Casey'},{id:'p-avery',name:'Avery'}]; P.holidays = []; P.gates = []; P.milestones = [];
      const bar = (id, lane, start, eff, deps, x) => ({id, lane, start, span:1, label:id, status:'notstarted', kind:'work', dependsOn:deps || [], ...(eff == null ? {} : {effort:{low:eff, likely:eff, high:eff}}), ...(x || {})});
      P.bars = [bar('A', 'l-data', 0, 2), bar('C', 'l-data', 3, 2), bar('B', 'l-data', 1, 1, ['A']), bar('J', 'l-plat', 1, 1, [], {jira:'ABC-7'}), bar('P1', 'l-plat', 2, 1),
        bar('H', 'l-data', 5, null), bar('K', 'l-data', 5, 1, [], {parent:'H'}), bar('N', 'l-data', 6, 1, [], {label:${JSON.stringify(HOSTILE)}})];
      P.deliverables = [{id:'dv-rock', name:'Partners sign in', stage:'planned', target:'2027-Q1', class:'rock'}]; P.bars[1].delivers = ['dv-rock'];
      JIRA = {kind:'sightline-jira-status', generatedAt:'2026-10-05T10:00:00Z', sprints:[], releases:[], rollups:{}, issues:{
        'ABC-7':{summary:'Sprint work', status:'In Progress', category:'inprogress', type:'Story', sprintState:'active', sprint:'Sprint 4', sprintStart:'2026-10-26', sprintEnd:'2026-11-06'}}};
      S = normalize(P, false); file.handle = null; resetHistory(); sel = null; dropJiraMemos(); render(); setMe(S.people[0].id); askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb();
      window.R = mod => { const P = clone(planOfRecord(S)); if (mod) mod(P); return forecastRun('likely', {plan:P, today:isoToDay('2026-10-26')}); };
      window.RA = (p, id, a) => runAction(p, id, a); })()`);
    const it = (mod, id) => J(`(()=>{ const r = R(${mod || ''}); return r.items['${id}'] || r.holders['${id}'] || null; })()`);

    // Data.
    const n1 = J(`normalize({...clone(S), meta:{...clone(S.meta), workOrder:['C', 'A', 'C', 'bad id!', 42, 'gone']}}, false).meta.workOrder`);
    ok('N1 the work order keeps ids once, in order, drops junk, and keeps an id whose initiative is gone (an undo can bring it back)', JSON.stringify(n1) === '["C","A","gone"]', JSON.stringify(n1));
    ok('N1 an empty work order isn\'t saved', !('workOrder' in J(`normalize({...clone(S), meta:{...clone(S.meta), workOrder:[]}}, false).meta`)));
    const rt = J(`(()=>{ const p = clone(S); p.meta.workOrder = ['C', 'A']; return [parseText(serialize(p, 'p.json')).meta.workOrder, parseText(serialize(p, 'p.yaml')).meta.workOrder]; })()`);
    ok('N2 JSON and YAML round-trip the work order', rt.every(x=>JSON.stringify(x) === '["C","A"]'), JSON.stringify(rt));
    const unk = J(`(()=>{ const i = KNOWN_FEATURES.indexOf('workOrder1'); if (i < 0) return null; KNOWN_FEATURES.splice(i, 1); const r = tooNew({meta:{features:featuresIn({meta:{workOrder:['A']}})}}); KNOWN_FEATURES.splice(i, 0, 'workOrder1'); return r && r.unknown; })()`);
    ok('N3 a work order marks the plan, so a copy that doesn\'t know it opens the plan read-only; no order, no mark', (unk || []).join() === 'workOrder1' && !J(`featuresIn({meta:{}})`).includes('workOrder1'), JSON.stringify(unk));

    // The forecast.
    const same = J(`[JSON.stringify(R()), JSON.stringify(R(P=>{ P.meta.workOrder = []; })), JSON.stringify(R(P=>{ P.meta.workOrder = ['gone', 'nope']; }))]`);
    ok('O1 without a work order (empty, or naming only initiatives that are gone) the forecast is exactly what it was', same[0] === same[1] && same[0] === same[2]);
    const a0 = it('', 'A'), c0 = it('', 'C'), a1 = it("P=>{ P.meta.workOrder = ['C']; }", 'A'), c1 = it("P=>{ P.meta.workOrder = ['C']; }", 'C');
    ok('O2 with one person for two initiatives, the work order decides who gets them first', a0.finish < c0.finish && c1.finish < a1.finish && a1.startEdge && a1.startEdge.kind === 'capacity', JSON.stringify([a0.finish, c0.finish, a1.finish, c1.finish, a1.startEdge]));
    const ad = it("P=>{ P.meta.workOrder = ['B', 'A']; }", 'A'), bd = it("P=>{ P.meta.workOrder = ['B', 'A']; }", 'B');
    ok('O3 waiting for other work still comes first: B, first in the order, starts after A', bd.start > ad.finish && bd.startEdge.kind === 'dep', JSON.stringify([ad.finish, bd.start, bd.startEdge]));
    const j0 = it('', 'J'), j1 = it("P=>{ P.meta.workOrder = ['P1', 'J']; }", 'J');
    ok('O4 Jira-dated work keeps its sprint whatever the order', j0.start === j1.start && j0.finish === j1.finish, JSON.stringify([j0, j1].map(x=>[x.start, x.finish])));
    const k0 = it('', 'K'), k1 = it("P=>{ P.meta.workOrder = ['H']; }", 'K');
    ok('O5 a holder in the order carries its leaves', k1.finish < k0.finish, JSON.stringify([k0.finish, k1.finish]));

    // The action.
    const set = ids => J(`RA(clone(S), 'initiative.order', {ids:${JSON.stringify(ids)}})`);
    const good = J(`(()=>{ const p = clone(S); const r = RA(p, 'initiative.order', {ids:['C', 'A']}); const r2 = RA(p, 'initiative.order', {ids:[]}); return [r.ok, r2.ok, 'workOrder' in p.meta]; })()`);
    ok('A1 initiative.order sets the whole order, and [] clears it', good[0] && good[1] && !good[2], JSON.stringify(good));
    const bad = [set(['A', 'A']), set(['nobody']), set(['J'])];
    ok('A2 a repeated id, an unknown initiative and Jira-dated work are refused with a reason', bad.every(x=>!x.ok && x.reason) && /Jira/.test(bad[2].reason), bad.map(x=>x.reason).join(' / '));
    ok('A3 an app\'s change to the work order is always reviewed, and says why', ev(`amRiskOf({ops:[{op:'action', action:'initiative.order', args:{ids:['C']}}]})`) === 'floor' && /work order/.test(ev(`amFloorWhy({ops:[{op:'action', action:'initiative.order', args:{ids:['C']}}]})`)));

    // Merge.
    const m = J(`(()=>{ const base = clone(S), mine = clone(base), theirs = clone(base);
      mine.meta.workOrder = ['C', 'A']; const one = mergePlans(base, mine, theirs);
      const t2 = clone(base); t2.meta.workOrder = ['A', 'C']; const two = mergePlans(base, mine, t2);
      const b3 = clone(base); b3.meta.workOrder = ['A']; const m3 = clone(b3), t3 = clone(b3); m3.meta.workOrder = ['A', 'C']; t3.meta.workOrder = ['A']; t3.title = 'x'; const three = mergePlans(b3, m3, t3);
      return {one:one.plan.meta.workOrder, two:two.plan.meta.workOrder, kept:two.kept.length, three:three.plan.meta.workOrder}; })()`);
    ok('M1 my new order merges in when a teammate didn\'t reorder; when both did, the teammate\'s stands and mine is kept aside', JSON.stringify(m.one) === '["C","A"]' && JSON.stringify(m.two) === '["A","C"]' && m.kept > 0 && JSON.stringify(m.three) === '["A","C"]', JSON.stringify(m));

    // The export.
    ev("S.meta.workOrder = ['C', 'gone', 'A']; render()");
    const v = J('assistantView()');
    ok('E1 the export lists the work order (skipping what\'s gone) and each initiative\'s place, and the guides explain it', JSON.stringify(v.planning.workOrder) === '["C","A"]' && v.initiatives.find(x=>x.id === 'C').workOrder === 1
      && v.initiatives.find(x=>x.id === 'A').workOrder === 2 && !('workOrder' in v.initiatives.find(x=>x.id === 'B')) && /initiative\.order/.test(JSON.stringify(v.guide)) && /`workOrder`/.test(ev('analysisGuide()')));

    // The Forecast panel.
    ev("goWs('people'); render(); renderForecastWs()"); await wait(20);
    const rows = () => [...d.querySelectorAll('#fcOrder li[data-wo]')].map(x=>x.dataset.wo);
    ok('U1 the Forecast shows the work order, skipping what\'s gone, with the class of what each delivers', JSON.stringify(rows()) === '["C","A"]' && d.querySelector('#fcOrder [data-wo="C"] [data-woclass="rock"]') && /Committed/.test(d.querySelector('#fcOrder [data-wo="C"] [data-woclass]').textContent));
    d.querySelector('#fcOrder [data-wo="A"] [data-wobtn="first"]').click(); await wait(20);
    ok('U2 Put first moves it to the top, saves it, and keeps focus on the moved row', JSON.stringify(J('S.meta.workOrder')) === '["A","C"]' && d.activeElement && d.activeElement.closest('[data-wo]') && d.activeElement.closest('[data-wo]').dataset.wo === 'A', JSON.stringify(J('S.meta.workOrder')));
    d.querySelector('#fcOrder [data-wo="A"] [data-wobtn="down"]').click(); await wait(20);
    ok('U3 moving down saves the new order', JSON.stringify(J('S.meta.workOrder')) === '["C","A"]');
    const add = d.querySelector('#fcOrderAdd'); add.value = 'N'; add.dispatchEvent(new w.Event('change', {bubbles:true})); await wait(20);
    ok('U4 Add to the work order puts it at the end, and Jira-dated work isn\'t offered', JSON.stringify(J('S.meta.workOrder')) === '["C","A","N"]' && ![...(d.querySelector('#fcOrderAdd') || {options:[]}).options].some(o=>o.value === 'J'));
    ok('U5 a hostile initiative name is text, not markup', !w.pwned && !d.querySelector('#fcOrder img') && d.querySelector('#fcOrder [data-wo="N"]').textContent.includes('<img'));
    ev("sel = {type:'bar', id:'A'}; render()"); await wait(20);
    ok('U6 an initiative\'s card says its place in the work order', /2nd in the work order/.test((d.querySelector('#f-workorder') || {}).textContent || ''));
    ev("sel = {type:'bar', id:'P1'}; render()"); await wait(20); d.querySelector('#f-wofirst').click(); await wait(20);
    ok('U7 an initiative not in the order can be put first from its card', J('S.meta.workOrder')[0] === 'P1');
    // Review fixes.
    ev("sel = null; S.meta.workOrder = ['A', 'J', 'C']; goWs('people'); render(); renderForecastWs()"); await wait(20);
    d.querySelector('#fcOrder [data-wo="C"] [data-wobtn="first"]').click(); await wait(20);
    ok('R1 an initiative Jira dated after it was ordered doesn\'t lock the order: moving another still works', JSON.stringify(J('S.meta.workOrder')) === '["C","A","J"]', JSON.stringify(J('S.meta.workOrder')));
    const rj = J(`RA(clone(S), 'initiative.order', {ids:['J', 'C', 'A']})`), rn = J(`(()=>{ const p = clone(S); p.meta.workOrder = ['C']; return RA(p, 'initiative.order', {ids:['C', 'J']}); })()`);
    ok('R1 …and an app can reorder it too, while adding newly Jira-dated work is still refused', rj.ok && !rn.ok && /Jira/.test(rn.reason), JSON.stringify([rj.ok, rn.reason]));
    ev("stopAuto(); startAuto = ()=>{}; file.handle = {name:'plan.json'}; file.holdLock = false; render(); renderForecastWs()"); await wait(20);
    const roBtn = d.querySelector('#fcOrder [data-wo="A"] [data-wobtn="first"]'), before = JSON.stringify(J('S.meta.workOrder'));
    ok('R2 without editing, the order\'s buttons are off and the panel says how to change it', roBtn && roBtn.disabled && /Start editing/.test((d.querySelector('#fcOrderRO') || {}).textContent || ''));
    ev("setWorkOrder(['A', 'C', 'J'], 'Moved A to 1st in the work order')"); await wait(10);
    ok('R2 …and a refused change never says it worked', JSON.stringify(J('S.meta.workOrder')) === before && !/Moved A/.test(d.querySelector('#status') ? d.querySelector('#status').textContent : ''), d.querySelector('#status') ? d.querySelector('#status').textContent : 'no status');
    ev("file.handle = null; render(); renderForecastWs()"); await wait(20);
    const xq = mod => it(mod, 'C'), noOrd = xq("P=>{ P.bars.push({...clone(P.bars.find(b=>b.id === 'A')), id:'X', start:2, label:'X'}); P.bars.find(b=>b.id === 'A').start = 0; P.bars.find(b=>b.id === 'C').dependsOn = ['X']; P.meta.workOrder = []; }"),
      ord = xq("P=>{ P.bars.push({...clone(P.bars.find(b=>b.id === 'A')), id:'X', start:2, label:'X'}); P.bars.find(b=>b.id === 'A').start = 0; P.bars.find(b=>b.id === 'C').dependsOn = ['X']; P.meta.workOrder = ['C']; }");
    ok('R3 putting something first pulls what it waits for forward too', ord.finish < noOrd.finish, JSON.stringify([noOrd.finish, ord.finish]));
    const rp = J(`(()=>{ const p = clone(S); p.meta.workOrder = ['A', 'C']; const out = applyOps(p, [{op:'set', type:'meta', id:'meta', field:'workOrder', value:['C'], prev:[]}]); return {order:out.plan ? out.plan.meta.workOrder : out.meta && out.meta.workOrder, skipped:(out.skipped || []).length}; })()`);
    ok('R4 replaying my reorder onto a teammate\'s newer one leaves theirs and reports mine as not applied', JSON.stringify(rp.order) === '["A","C"]' && rp.skipped === 1, JSON.stringify(rp));
    ev("S.meta.workOrder = ['C', 'A', 'N']; render(); renderForecastWs()"); await wait(20);
    d.querySelector('#fcOrder [data-wo="A"] [data-wobtn="remove"]').click(); await wait(20);
    ok('R5 after Remove, focus moves to the next row, not the page', JSON.stringify(J('S.meta.workOrder')) === '["C","N"]' && d.activeElement && d.activeElement.closest && d.activeElement.closest('[data-wo]') && d.activeElement.closest('[data-wo]').dataset.wo === 'N');
    // R4b: the same through Save as you go: my reorder loses to a teammate's, and mine is kept as a copy with a note.
    ev(`window.DL = []; download = (text, name) => DL.push(name); backup = (pl, tag) => DL.push('backup-' + tag);`);
    const sg = JSON.parse(await w.eval(`(async()=>{ stopAuto(); startAuto = ()=>{};
      const mine = clone(planOfRecord(S)); mine.meta.workOrder = ['A', 'C']; const base = serialize(mine, 'p.json');
      const theirs = clone(mine); theirs.meta.workOrder = ['C', 'A', 'B']; theirs.meta.revision = (mine.meta.revision || 0) + 5;
      const hd = {name:'p.json', text:serialize(theirs, 'p.json'), async queryPermission(){ return 'granted'; }, async requestPermission(){ return 'granted'; },
        async getFile(){ const t = hd.text; return {size:t.length, lastModified:1, text:async()=>t}; }, async createWritable(){ let x = ''; return {async write(v){ x = v; }, async abort(){}, async close(){ hd.text = x; }}; }};
      S = normalize(mine, false); file.handle = hd; file.baseText = base; file.baseHash = hashText(base); file.holdLock = false; file.dirty = true; locked = false;
      await quickSave('work order', null, 0, [{op:'set', type:'meta', id:'meta', field:'workOrder', prev:['A', 'C'], value:['B', 'C', 'A']}], false, true);
      const out = {file:parseText(hd.text).meta.workOrder, S:S.meta.workOrder, status:$('#status') ? $('#status').textContent : '', DL};
      file.handle = null; file.dirty = false; return JSON.stringify(out); })()`));
    ok('R4b with Save as you go, a reorder that loses to a teammate\'s keeps theirs, downloads mine as a backup and says so',
      JSON.stringify(sg.file) === '["C","A","B"]' && JSON.stringify(sg.S) === '["C","A","B"]' && sg.DL.includes('backup-mine') && /work order too/.test(sg.status) && /backup/.test(sg.status), JSON.stringify(sg));
    ok('Z1 no page errors', !w.errors.length, w.errors.join(' | '));

    // End to end: an app's batch at routine and all. The order and a priority are held; a routine risk applies.
    const p2 = await page(), e2 = p2.ev, dir = p2.w.DIR;
    e2(`S = normalize(JSON.parse(FIX), false); S.meta.revision = 7; S.deliverables = [{id:'dv-e', name:'Faster plan opening', stage:'idea'}];
      file.handle = null; resetHistory(); amTried = S.meta.planId; render(); setMe(S.people[0].id);
      window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };
      whoAmI = (x, cb)=>cb(); askWhoOnStart = ()=>{}; download = ()=>{};`);
    await e2('assistantConnect()'); await wait(25); e2('clearTimeout(assistantExportTimer)'); await e2('assistantExport()');
    const pid = e2('S.meta.planId'), bars = JSON.parse(e2("JSON.stringify(S.bars.filter(b=>!b.jira).slice(0, 2).map(b=>b.id))"));
    const act = (action, args) => ({op:'action', action, args});
    for (const lv of ['routine', 'all']){
      e2(`amSetLevel('${lv}')`); await wait(40);
      const body = {kind:'sightline-amendments', version:1, planId:pid, batchId:'b-' + lv, createdAt:new Date(Date.parse('2026-10-24T14:00:00Z')).toISOString(), source:'Planning bot', basedOn:{planRevision:e2('S.meta.revision')},
        changes:[{id:'o-' + lv, summary:'Order', ops:[act('initiative.order', {ids:bars})]}, {id:'c-' + lv, summary:'Class', ops:[act('outcome.set', {id:'dv-e', field:'class', value:'rock'})]},
          {id:'r-' + lv, summary:'A risk', ops:[act('risk.add', {id:'risk-' + lv, text:'Vendor limits', sev:'high'})]}]};
      dir.files.set('sightline-amendments.json', fileHandle('sightline-amendments.json', JSON.stringify(body)));
      await e2('assistantTick()'); await wait(60); e2('clearTimeout(assistantExportTimer)'); await e2('assistantExport()');
      const res = JSON.parse(dir.files.get('sightline-assistant-results.json').text), ch = id => (res.changes || []).find(c=>c.id === id) || {};
      const st = JSON.parse(e2(`JSON.stringify({order:S.meta.workOrder || null, cls:S.deliverables[0].class || null, risk:S.risks.some(r=>r.id === 'risk-${lv}')})`));
      ok(`F1 at "${lv}", an app's work order and an outcome's class are held for a person with the reason, while a routine change applies`,
        !st.order && !st.cls && st.risk && ch('o-' + lv).held && ch('o-' + lv).held.code === 'review' && /work order/.test(ch('o-' + lv).held.reason) && ch('c-' + lv).held && /priority/.test(ch('c-' + lv).held.reason),
        JSON.stringify({st, o:ch('o-' + lv).held, c:ch('c-' + lv).held})); }
    ok('Z2 no page errors in the assistant run', !p2.w.errors.length, p2.w.errors.join(' | '));
  } catch(e){ ok('harness ran', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e); }
  console.log(checks.join('\n')); const f = checks.filter(x=>x.startsWith('FAIL')).length; console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
