// An assistant can do a whole replan from one amendments file: starts-after links, deletes, workstreams, people,
// milestones with "done when", gates, risks and decisions, as {op:"action"} ops checked by the page's action table.
// Also: a link reports what it moves and by how much, a refused action says why, and the offline checker knows the
// same actions as the page. Fails on the build before this (no action ops, and the guide says to do these by hand).
const {JSDOM, VirtualConsole} = require('jsdom'), fs = require('fs'), path = require('path'), os = require('os'), {spawnSync} = require('child_process');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,'../dist/sightline.html'),'utf8').replace(/<link[^>]+fonts[^>]+>/,'');
const SYNC = path.join(__dirname, '..', 'tools', 'sightline-jira-sync.py');
const fixture = fs.readFileSync(path.join(__dirname,'fixtures/sample-plan.json'),'utf8'), checks = [];
const ok = (name, pass, x='')=>checks.push(`${pass ? 'PASS' : 'FAIL'} ${name}${x ? '  (' + x + ')' : ''}`);
setTimeout(()=>{console.log(checks.join('\n'));console.log('TIMEOUT');process.exit(1);},50000).unref();
const act = (action, args)=>({op:'action', action, args});
(async()=>{
  const dom = new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:new VirtualConsole(),beforeParse(w){
    const D = w.Date; w.Date = class extends D {constructor(...a){super(...(a.length ? a : ['2026-10-24T14:00:00Z']));} static now(){return new D('2026-10-24T14:00:00Z').getTime();}};
    w.indexedDB=undefined;w.alert=()=>{};w.confirm=()=>true;w.prompt=()=>'';
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:String(t).length*7})});w.Element.prototype.scrollIntoView=()=>{};
    w.CSS={escape:s=>s};w.errors=[];w.addEventListener('error',e=>w.errors.push(e.message));
  }});
  try {
    await new Promise(r=>setTimeout(r,180)); const w=dom.window, ev=s=>w.eval(s);w.FIX=fixture;
    const fresh = ()=>ev(`(()=>{ const P = JSON.parse(FIX); P.meta.planId = 'p-replan';
      P.people = [{id:'p-avery',name:'Avery'},{id:'p-blake',name:'Blake'},{id:'p-casey',name:'Casey'}];
      S = normalize(P, false); setMe('p-avery'); file.handle = null; past = []; future = []; sel = null; AM = null; render(); })()`);
    const amFile = changes => JSON.stringify({kind:'sightline-amendments', version:1, planId:'p-replan', batchId:'replan-1', createdAt:'2026-10-24T14:00:00Z', source:'Planning bot', basedOn:{planRevision:0}, changes});
    const load = changes => { w.AMTEXT = amFile(changes); return ev(`(()=>{ const r = amParse(AMTEXT); AM = {name:'sightline-amendments.json', text:AMTEXT, hash:'h-' + Math.random(), file:r.file, error:r.error || ''}; amMemo = null; return r.error || ''; })()`); };
    const rows = () => JSON.parse(ev(`JSON.stringify(amRows().map(x=>({id:x.c.id, status:x.r.status, reasons:x.r.reasons, notes:x.r.notes, lines:x.r.lines})))`));

    fresh();
    const R0 = ev(`S.risks[0].id`), R0sev = ev(`S.risks[0].sev`), D0 = ev(`S.decisions[0].id`);
    const links = [['r6','r5'],['f3','f2'],['u3','u2'],['p2','p1'],['n2','n1'],['c2','m1'],['r2','c1'],['f2','m2'],['u2','r1'],['c6','u5'],['n1','p2'],['f1','p1']];
    const changes = [
      {id:'links', summary:'Re-link the plan', ops:[...links.map(([id, after])=>act('link.add', {id, after})),
        act('link.remove', {id:'m2', after:'m1'}), act('link.remove', {id:'c4', after:'m3'}), act('link.remove', {id:'u4', after:'c3'})]},
      {id:'team', summary:'Workstreams and people', ops:[act('workstream.add', {id:'lane-ops', name:'Operations'}), act('workstream.rename', {id:'plat', name:'Platform', prev:'Platform gates'}),
        act('person.set', {id:'p-avery', field:'role', value:'Backend'}), act('person.setAlloc', {id:'p-avery', alloc:80}), act('workstream.addMember', {id:'int', person:'p-avery'}),
        act('person.set', {id:'p-blake', field:'role', value:'Frontend'}), act('person.setAlloc', {id:'p-blake', alloc:50}), act('workstream.addMember', {id:'ui', person:'p-blake'}),
        act('person.add', {id:'p-drew', name:'Drew', role:'Data'}), act('person.setAlloc', {id:'p-drew', alloc:100}), act('workstream.addMember', {id:'lane-ops', person:'p-drew'})]},
      {id:'dates', summary:'Milestones, gates, risks and decisions', ops:[act('initiative.del', {id:'m5'}), act('initiative.del', {id:'r4'}),
        act('milestone.add', {id:'ms-beta', what:'Beta', day:'2026-11-16', lane:'chat'}), act('milestone.doneWhen.add', {id:'ms-beta', bar:'c3'}),
        act('milestone.add', {id:'ms-ga', what:'General availability', day:'2026-12-07', lane:'ui'}), act('milestone.doneWhen.add', {id:'ms-ga', bar:'u5'}),
        act('gate.add', {id:'gate-sec', gate:'Security review', day:'2026-11-02'}), act('gate.add', {id:'gate-legal', gate:'Legal sign-off'}),
        act('risk.add', {id:'risk-vendor', text:'Vendor API rate limits', sev:'high', owners:['p-avery']}), act('risk.add', {id:'risk-index', text:'Search index rebuild takes a weekend', sev:'med'}),
        act('risk.add', {id:'risk-holiday', text:'Holiday coverage is thin', sev:'low', item:'u5'}), act('risk.set', {id:R0, field:'sev', value:'low', prev:R0sev}),
        act('decision.add', {id:'dec-export', text:'Pick the export format', owners:['p-blake'], due:'2026-11-06'}), act('decision.add', {id:'dec-beta', text:'Who runs the beta', decider:'p-casey'}),
        act('decision.set', {id:D0, field:'state', value:'decided', prev:'open'})]}];
    ok('the replan batch reads', load(changes) === '');
    const before = rows();
    ok('every change in it checks as ready', before.every(r=>r.status === 'ready'), JSON.stringify(before.filter(r=>r.status !== 'ready').map(r=>[r.id, r.status, r.reasons])));
    const lk = before.find(r=>r.id === 'links') || {lines:[], notes:[]};
    ok('the review says each link in names', lk.lines.some(l=>/^"[^"]+" starts after "[^"]+"$/.test(l)), lk.lines.slice(0, 2).join(' | '));
    ok('and lists what the links move, with dates and how far', lk.notes.some(n=>/moves \d+(\.5)? weeks? later \([A-Z][a-z]{2} \d+ to [A-Z][a-z]{2} \d+\)/.test(n)), lk.notes.slice(0, 3).join(' | '));
    const hist = ev('past.length');
    await ev(`amApply(['links', 'team', 'dates'])`);
    ok('one Apply puts the whole replan in, as one change', ev('past.length') === hist + 1 && rows().every(r=>r.status === 'done'), JSON.stringify(rows().map(r=>[r.id, r.status, r.reasons])));
    const bar = id => JSON.parse(ev(`JSON.stringify(barById('${id}') || null)`));
    ok('12 starts-after links are added', links.every(([id, after])=>bar(id) && bar(id).dependsOn.includes(after)));
    ok('3 are removed', !bar('m2').dependsOn.includes('m1') && !bar('c4').dependsOn.includes('m3') && !bar('u4').dependsOn.includes('c3'));
    ok('2 initiatives are deleted, and nothing still points at them', !bar('m5') && !bar('r4') && !bar('r5').dependsOn.includes('r4'));
    ok('a workstream is added and one renamed', ev(`S.lanes.some(l=>l.id==='lane-ops' && l.name==='Operations') && S.lanes.find(l=>l.id==='plat').name === 'Platform'`));
    ok('people get their role, allocation and workstream',
      ev(`(()=>{ const p = id => S.people.find(x=>x.id===id), m = (l, id) => laneMembers(S.lanes.find(x=>x.id===l)).includes(id);
        return p('p-avery').role==='Backend' && p('p-avery').alloc===80 && m('int','p-avery') && p('p-blake').role==='Frontend' && p('p-blake').alloc===50 && m('ui','p-blake')
          && p('p-drew') && p('p-drew').role==='Data' && p('p-drew').alloc===100 && m('lane-ops','p-drew'); })()`));
    ok('2 milestones are added, done when their initiatives finish', ev(`S.milestones.find(m=>m.id==='ms-beta').after.includes('c3') && S.milestones.find(m=>m.id==='ms-ga').after.includes('u5')`));
    ok('a new milestone sits on its calendar day', ev(`dayToIso(atToDay(S.milestones.find(m=>m.id==='ms-ga').at))`) >= '2026-12-07', ev(`dayToIso(atToDay(S.milestones.find(m=>m.id==='ms-ga').at))`));
    ok('2 gates are added', ev(`S.gates.some(g=>g.id==='gate-sec' && g.date==='2026-11-02') && S.gates.some(g=>g.id==='gate-legal')`));
    ok('4 risks are added or updated', ev(`S.risks.filter(r=>/Vendor API|index rebuild|Holiday coverage/.test(r.text)).length === 3 && S.risks.find(r=>r.id===${JSON.stringify(R0)}).sev === 'low'`));
    ok('3 decisions are added or updated', ev(`S.decisions.filter(d=>/export format|runs the beta/.test(d.text)).length === 2 && S.decisions.find(d=>d.id===${JSON.stringify(D0)}).state === 'decided'`));
    ok('items the batch adds are stamped as added by the person', ev(`S.gates.find(g=>g.id==='gate-sec').added.by`) === 'p-avery');
    ev('undo()');
    ok('one Undo takes the whole replan back', !!bar('m5') && !ev(`S.lanes.some(l=>l.id==='lane-ops')`) && ev(`S.people.find(x=>x.id==='p-avery').role`) === '');

    // Refusals land on the change that has them; the rest still applies.
    fresh();
    load([{id:'loop', summary:'A loop', ops:[act('link.add', {id:'m1', after:'m3'})]},
      {id:'tree', summary:'Inside its own tree', ops:[act('initiative.setParent', {id:'m2', parent:'m1'}), act('link.add', {id:'m2', after:'m1'})]},
      {id:'stale', summary:'Changed since', ops:[act('workstream.rename', {id:'int', name:'Partners', prev:'Not its name'})]},
      {id:'nope', summary:'Unknown', ops:[act('initiative.explode', {id:'m1'})]},
      {id:'noid', summary:'No id', ops:[act('risk.add', {text:'Added twice?'})]},
      {id:'fine', summary:'Fine', ops:[act('risk.add', {id:'risk-still', text:'Still applies'})]}]);
    const rr = Object.fromEntries(rows().map(r=>[r.id, r]));
    ok('a link that would loop is refused with the card\'s reason', rr.loop.status === 'invalid' && rr.loop.reasons.some(x=>/would create a loop/.test(x)), JSON.stringify(rr.loop.reasons));
    ok('a link inside one initiative\'s own tree is refused', rr.tree.status === 'invalid' && rr.tree.reasons.some(x=>/inside the other/.test(x)), JSON.stringify(rr.tree.reasons));
    ok('a prev that doesn\'t match waits as changed since', rr.stale.status === 'changed', JSON.stringify(rr.stale));
    ok('an unknown action is refused, pointing at the list', rr.nope.status === 'invalid' && /isn't an action/.test(rr.nope.reasons[0]), JSON.stringify(rr.nope.reasons));
    ok('an add without an id is refused, so it can\'t be added twice', rr.noid.status === 'invalid' && /give the new item an id/.test(rr.noid.reasons[0]), JSON.stringify(rr.noid.reasons));
    await ev(`amApply(['loop', 'tree', 'stale', 'nope', 'fine'])`);
    ok('the good change applies and the refused ones change nothing', ev(`S.risks.some(r=>r.text==='Still applies') && !barById('m1').dependsOn.includes('m3') && S.lanes.find(l=>l.id==='int').name === 'Integrations'`));
    fresh(); ev(`S.lanes.find(l=>l.id==='int').until = dayToIso(wkDay(9) + 4); render()`);
    load([{id:'late', summary:'Past the end', ops:[act('initiative.move', {id:'m5', start:10})]}]);
    const late = rows()[0];
    ok('a change that lands in blacked-out time is refused before Apply', late.status === 'invalid' && late.reasons.some(x=>/blacked out/.test(x)), JSON.stringify(late.reasons));

    // What a link moves, straight from the engine.
    fresh();
    const L = JSON.parse(ev(`JSON.stringify((({plan, ...r})=>r)(applyAction(S, 'link.add', {id:'r6', after:'f3'})))`));
    const self = (L.moves || []).find(m=>m.id === 'r6');
    ok('a link reports the linked item\'s own move, with both dates', L.ok && self && self.from === '2026-11-30' && self.to > self.from && self.weeks > 0, JSON.stringify(L.moves));
    ok('in plain words', self && /moves \d+(\.5)? weeks? later/.test(ev(`moveLine(${JSON.stringify(self)})`)), self && ev(`moveLine(${JSON.stringify(self)})`));
    const pv = JSON.parse(ev(`(()=>{ const before = JSON.stringify(S), r = applyAction(S, 'link.preview', {id:'r6', after:'f3'}); return JSON.stringify({ok:r.ok, preview:r.preview, n:(r.moves || []).length, same: JSON.stringify(S) === before && !barById('r6').dependsOn.includes('f3')}); })()`));
    ok('link.preview reports the same moves and changes nothing', pv.ok && pv.preview && pv.n === L.moves.length && pv.same, JSON.stringify(pv));
    ev(`S.meta.autoSchedule = false`);
    const off = JSON.parse(ev(`JSON.stringify((({plan, ...r})=>r)(applyAction(S, 'link.add', {id:'r6', after:'f3'})))`));
    ok('with auto-schedule off nothing moves, and it says what would', off.ok && !off.moves.length && off.would.some(m=>m.id === 'r6'), JSON.stringify({moves:off.moves, would:off.would}));
    fresh(); ev(`barById('f3').parked = true`);
    ok('a link to a parked initiative is refused', /parked/.test(JSON.parse(ev(`JSON.stringify((({plan, ...r})=>r)(applyAction(S, 'link.add', {id:'r6', after:'f3'})))`)).reason || ''));
    fresh();
    const ms = JSON.parse(ev(`JSON.stringify((({plan, ...r})=>r)(applyAction(S, 'milestone.move', {id:'ms-x', day:'2026-11-02'})))`));
    ok('a missing milestone is invalid', !ms.ok && ms.code === 'invalid');
    const alloc = JSON.parse(ev(`JSON.stringify((({plan, ...r})=>r)(applyAction(S, 'person.setAlloc', {id:'p-avery', alloc:140})))`));
    ok('an allocation over 100% is refused', !alloc.ok && /0 to 100/.test(alloc.reason), alloc.reason);

    // What the assistant is told.
    fresh();
    const view = JSON.parse(ev(`JSON.stringify(assistantView())`));
    ok('the context lists every action with its arguments', Array.isArray(view.actions) && view.actions.some(a=>a.id === 'link.add' && a.args.after === 'id') && view.actions.some(a=>a.id === 'decision.set' && a.args.prev), JSON.stringify((view.actions || []).slice(0, 2)));
    ok('the guide no longer sends links, people, risks and decisions to the UI', !/require manual UI changes/.test(view.guide) && /op:'action'/.test(view.guide));
    ok('the example shows an action op', JSON.stringify(view.example).includes('"op":"action"'));

    // The offline checker knows the same actions, and gives the same verdicts on this batch.
    const py = spawnSync('python3', ['-c', `import importlib.util, json, sys; sp = importlib.util.spec_from_file_location('s', sys.argv[1]); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); print(json.dumps({k: [v[0], v[1]] for k, v in m.ACTIONS.items()}))`, SYNC], {encoding:'utf8'});
    let pyA = null; try { pyA = JSON.parse(py.stdout); } catch(e){}
    const pageA = JSON.parse(ev(`JSON.stringify(Object.fromEntries(Object.values(planActions).filter(a=>!a.preview).map(a=>[a.id, [a.args, !!a.cur]])))`));
    ok('the offline checker\'s action table matches the page\'s', !!pyA && JSON.stringify(pyA) === JSON.stringify(pageA), pyA ? Object.keys(pageA).filter(k=>JSON.stringify(pyA[k]) !== JSON.stringify(pageA[k])).join(', ') : (py.stderr || '').slice(0, 200));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-act-')), pf = path.join(dir, 'plan.json'), af = path.join(dir, 'am.json');
    fs.writeFileSync(pf, ev(`JSON.stringify(planOfRecord(S))`));
    const offline = [...changes, {id:'nope', summary:'Unknown', ops:[act('initiative.explode', {id:'m1'})]}, {id:'badref', summary:'Missing', ops:[act('link.add', {id:'m1', after:'zz-9'})]},
      {id:'badarg', summary:'Bad arg', ops:[act('person.setAlloc', {id:'p-avery', alloc:50, colour:'red'})]}];
    fs.writeFileSync(af, amFile(offline));
    const chk = spawnSync('python3', [SYNC, 'check-amendments', pf, af, '--json'], {encoding:'utf8'});
    let out = null; try { out = JSON.parse(chk.stdout); } catch(e){}
    const st = out ? Object.fromEntries(out.changes.map(c=>[c.id, c.status])) : {};
    ok('check-amendments passes the replan batch offline', st.links === 'ready' && st.team === 'ready' && st.dates === 'ready', JSON.stringify(out ? out.changes.filter(c=>c.status !== 'ready').map(c=>[c.id, c.reasons]) : (chk.stderr || chk.stdout).slice(0, 200)));
    ok('and refuses an unknown action, a missing reference and an unknown argument', st.nope === 'invalid' && st.badref === 'invalid' && st.badarg === 'invalid', JSON.stringify(st));
    fs.rmSync(dir, {recursive:true, force:true});

    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.message); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
