// Plan actions (docs/app-access.md 3.3, 3.4): the card's controls for initiatives, tasks and deliverables run through
// the action table, so an action applied to a copy gives the same plan as the click. Also the executor's own rules:
// unknown actions and arguments are refused, a stale prev changes nothing, guards say why, and a copy is never the live plan.
const {JSDOM, VirtualConsole} = require('jsdom'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,'../dist/sightline.html'),'utf8').replace(/<link[^>]+fonts[^>]+>/,'');
const fixture = fs.readFileSync(path.join(__dirname,'fixtures/sample-plan.json'),'utf8'), checks = [];
const ok = (name, pass, x='')=>checks.push(`${pass ? 'PASS' : 'FAIL'} ${name}${x ? '  (' + x + ')' : ''}`);
setTimeout(()=>{console.log(checks.join('\n'));console.log('TIMEOUT');process.exit(1);},50000).unref();
(async()=>{
  const dom = new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:new VirtualConsole(),beforeParse(w){
    const D = w.Date; w.Date = class extends D {constructor(...a){super(...(a.length ? a : ['2026-10-24T14:00:00Z']));} static now(){return new D('2026-10-24T14:00:00Z').getTime();}};
    w.indexedDB=undefined;w.alert=()=>{};w.confirm=()=>true;w.prompt=()=>'Out of scope';
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:String(t).length*7})});w.Element.prototype.scrollIntoView=()=>{};
    w.CSS={escape:s=>s};w.errors=[];w.addEventListener('error',e=>w.errors.push(e.message));
  }});
  try {
    await new Promise(r=>setTimeout(r,180)); const w=dom.window, ev=s=>w.eval(s);w.FIX=fixture;
    ev(`window.pick = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', {bubbles:true})); };
      window.typeIn = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); };
      window.click = sel => document.querySelector(sel).click();
      window.addOwner = (id, q) => { const i = document.getElementById(id); i.focus(); i.value = q; i.dispatchEvent(new Event('input')); document.querySelector('#' + id + '-list .oopt').click(); };`);
    const fresh = ()=>ev(`(()=>{ const P = JSON.parse(FIX); P.meta.planId = 'p-act';
      P.people = [{id:'p-avery',name:'Avery'},{id:'p-blake',name:'Blake'},{id:'p-casey',name:'Casey'}];
      const m1 = P.bars.find(b=>b.id==='m1'); m1.owners = ['p-avery'];
      m1.tasks = [{id:'task-a',label:'Draft',start:'2026-09-21',days:2,status:'notstarted',owners:['p-avery']},{id:'task-b',label:'Review',start:'2026-09-23',days:2,status:'notstarted',owners:[],dependsOn:['task-a']}];
      P.deliverables = [{id:'dv-a',name:'Faster search',stage:'idea'},{id:'dv-b',name:'Exports',stage:'planned',target:'2026-Q4',jira:['ABC-1','ABC-2'],line:'Export your reports'}];
      S = normalize(P, false); setMe('p-avery'); moveBarTo('u3', 'u2', 'inside'); file.handle = null; past = []; future = []; sel = null; render(); })()`);
    const plan = 'JSON.stringify(planOfRecord(S))', ids = x => x.replace(/"sprint-[0-9a-f]{8}"/g, '"sprint-new"');      // a sprint added to fit is named at random
    const firstDiff = (a, b)=>{ let i = 0; while (i < a.length && a[i] === b[i]) i++; return `at ${i}: ui …${a.slice(Math.max(0,i-60), i+60)}… / action …${b.slice(Math.max(0,i-60), i+60)}…`; };
    // Do it with the card, then with applyAction on the plan as it was before; the two plans must match.
    const parity = (name, ui, id, args)=>{
      fresh(); ev(`P0 = ${plan}`); ev(ui); const A = ev(plan), changed = A !== ev('P0');
      const a = typeof args === 'function' ? args() : args;
      const r = ev(`(()=>{ const r = applyAction(JSON.parse(P0), ${JSON.stringify(id)}, ${JSON.stringify(a)}); return JSON.stringify({ok:r.ok, reason:r.reason, plan:planOfRecord(r.plan)}); })()`);
      const R = JSON.parse(r), B = ids(JSON.stringify(R.plan)), A2 = ids(A);
      ok(`${id}: the card and the action give the same plan (${name})`, changed && R.ok && A2 === B, !changed ? 'the card changed nothing' : !R.ok ? R.reason : A2 === B ? '' : firstDiff(A2, B));
    };
    const sel = (type, id)=>`select(${JSON.stringify(type)}, ${JSON.stringify(id)});`;

    // Initiatives
    parity('title', sel('bar','m2') + `typeIn('f-label', 'Partner API')`, 'initiative.set', {id:'m2', field:'label', value:'Partner API'});
    parity('chart name', sel('bar','m2') + `typeIn('f-chart', 'Partners')`, 'initiative.set', {id:'m2', field:'chartName', value:'Partners'});
    parity('kind', sel('bar','m2') + `pick('f-kind', 'gated')`, 'initiative.set', {id:'m2', field:'kind', value:'gated'});
    parity('owners', sel('bar','m2') + `barById('m2').owners = ['p-avery']; P0 = ${plan}; render(); addOwner('f-owner', 'Casey')`, 'initiative.set', {id:'m2', field:'owners', value:['p-avery', 'p-casey']});
    parity('dates from tasks', sel('bar','m1') + `pick('f-datesfrom', 'tasks')`, 'initiative.set', {id:'m1', field:'datesFrom', value:'tasks'});
    parity('status', sel('bar','m2') + `pick('f-status', 'atrisk')`, 'initiative.setStatus', {id:'m2', status:'atrisk'});
    parity('start, moving what follows', sel('bar','m3') + `pick('f-start', '5')`, 'initiative.move', {id:'m3', start:5});
    parity('length', sel('bar','m5') + `pick('f-span', '3')`, 'initiative.move', {id:'m5', span:3});
    parity('workstream', sel('bar','m4') + `pick('f-lane', 'rag')`, 'initiative.setLane', {id:'m4', lane:'rag'});
    parity('part of', sel('bar','r3') + `pick('f-parent', 'r2')`, 'initiative.setParent', {id:'r3', parent:'r2'});
    parity('back to the top level', sel('bar','u3') + `pick('f-parent', '')`, 'initiative.setParent', {id:'u3', parent:''});
    parity('move up', sel('bar','m3') + `click('#f-up')`, 'initiative.place', {id:'m3', target:'m2', zone:'before'});
    parity('indent', sel('bar','m3') + `click('#f-indent')`, 'initiative.place', {id:'m3', target:'m2', zone:'inside'});
    parity('outdent', sel('bar','u3') + `click('#f-outdent')`, 'initiative.place', {id:'u3', target:'u2', zone:'after'});
    parity('add', `createAt0('initiative', 'fin', isoToDay('2026-10-07'))`, 'initiative.add', ()=>({id:ev('sel.id'), lane:'fin', start:ev('barById(sel.id).start')}));
    parity('add inside', `createAt0('subinitiative', 'f3', isoToDay('2026-10-21'))`, 'initiative.add', ()=>({id:ev('sel.id'), parent:'f3', start:ev('barById(sel.id).start'), span:ev('barById(sel.id).span')}));
    parity('delete, with its links', `del('bar', 'c3')`, 'initiative.del', {id:'c3'});
    // That one set a risk's item first, outside the card: do the same to the copy.
    { fresh(); ev(`S.risks[0].item = 'c3'; P0 = ${plan}; del('bar', 'c3')`); const A = ev(plan);
      const B = ev(`JSON.stringify(planOfRecord(applyAction(JSON.parse(P0), 'initiative.del', {id:'c3'}).plan))`);
      ok('initiative.del: a risk pointing at the deleted initiative is cleared the same way', A === B && !ev(`S.risks[0].item`), A === B ? '' : firstDiff(A, B)); }

    // Tasks
    parity('add', `addTask0(barById('m1'))`, 'task.add', ()=>({id:ev('sel.id'), bar:'m1', start:ev('taskById(sel.id).t.start')}));
    parity('title', sel('task','task-a') + `typeIn('f-tlabel', 'Draft the spec')`, 'task.set', {id:'task-a', field:'label', value:'Draft the spec'});
    parity('owners', sel('task','task-b') + `addOwner('f-towner', 'Casey')`, 'task.set', {id:'task-b', field:'owners', value:['p-casey']});
    parity('status', sel('task','task-a') + `pick('f-tstatus', 'inprogress')`, 'task.setStatus', {id:'task-a', status:'inprogress'});
    parity('start on a weekend goes to Monday', sel('task','task-b') + `pick('f-tstart', '2026-09-26')`, 'task.move', {id:'task-b', start:'2026-09-26'});
    parity('working days', sel('task','task-a') + `pick('f-tdays', '4')`, 'task.move', {id:'task-a', days:4});
    parity('starts after', `barById('m1').tasks.push({id:'task-c',label:'Ship',start:'2026-09-28',days:1,status:'notstarted',owners:[],dependsOn:[],jiraDeps:[]}); P0 = ${plan};` + sel('task','task-c') + `pick('f-tdep', 'task-a')`,
      'task.link', {id:'task-c', after:'task-a'});
    parity('unlink', sel('task','task-b') + `click('#side .lchip .ox')`, 'task.unlink', {id:'task-b', after:'task-a'});
    parity('move to another initiative', sel('task','task-b') + `pick('f-tbar', 'm2')`, 'task.moveTo', {id:'task-b', bar:'m2'});
    parity('delete', `del('task', 'task-a')`, 'task.del', {id:'task-a'});

    // Deliverables
    const dv = id => `sel = {type:'deliverable', id:'${id}'}; render();`;
    parity('name', dv('dv-a') + `pick('f-dvname', 'Search in a second')`, 'outcome.set', {id:'dv-a', field:'name', value:'Search in a second'});
    parity('customer wording, which clears approval', `Object.assign(S.deliverables[1], {stage:'done', approved:{by:'p-avery', at:'2026-10-01T10:00Z'}}); P0 = ${plan};` + dv('dv-b') + `pick('f-dvline', 'Export any report')`,
      'outcome.set', {id:'dv-b', field:'line', value:'Export any report'});
    parity('kind', dv('dv-a') + `pick('f-dvkind', 'new')`, 'outcome.set', {id:'dv-a', field:'kind', value:'new'});
    parity('stage', dv('dv-b') + `pick('f-dvstage', 'done')`, 'outcome.set', {id:'dv-b', field:'stage', value:'done'});
    parity('workstream', dv('dv-a') + `pick('f-dvlane', 'rag')`, 'outcome.set', {id:'dv-a', field:'lane', value:'rag'});
    parity('owners', dv('dv-a') + `addOwner('f-dvown', 'Blake')`, 'outcome.set', {id:'dv-a', field:'owners', value:['p-blake']});
    parity('target, which plans an idea', dv('dv-a') + `pick('f-dvtarget', '2027-Q1')`, 'outcome.setTarget', {id:'dv-a', target:'2027-Q1'});
    parity('no target', dv('dv-b') + `pick('f-dvtarget', '')`, 'outcome.setTarget', {id:'dv-b'});
    parity('a date', dv('dv-a') + `pick('f-dvdate', '2026-12-15')`, 'outcome.setTarget', {id:'dv-a', date:'2026-12-15'});
    parity('link Jira', `linkDvJira('dv-a', ['abc-7', 'ABC-8'])`, 'outcome.linkJira', {id:'dv-a', keys:['abc-7', 'ABC-8']});
    parity('unlink Jira', dv('dv-b') + `click('#side [data-dvkey="ABC-1"] .x')`, 'outcome.unlinkJira', {id:'dv-b', key:'ABC-1'});
    parity('drop', `dropDv('dv-a')`, 'outcome.drop', {id:'dv-a', reason:'Out of scope'});
    parity('delete', dv('dv-b') + `click('#f-dvdel')`, 'outcome.del', {id:'dv-b'});
    parity('add', `addIdea('Saved searches')`, 'outcome.add', ()=>({id:ev(`S.deliverables[S.deliverables.length-1].id`), name:'Saved searches', source:''}));

    // The executor's own rules
    fresh();
    const run = (id, args)=>JSON.parse(ev(`JSON.stringify((({plan, ...r})=>r)(applyAction(S, ${JSON.stringify(id)}, ${JSON.stringify(args)})))`));
    let r = run('initiative.explode', {id:'m1'});
    ok('an unknown action is refused as invalid', !r.ok && r.code === 'invalid' && /no action/.test(r.reason), JSON.stringify(r));
    r = run('initiative.set', {id:'m1', field:'label', value:'X', colour:'red'});
    ok('an unknown argument is refused, naming it', !r.ok && r.code === 'invalid' && /colour/.test(r.reason), JSON.stringify(r));
    r = run('initiative.move', {id:'m1', start:'soon'});
    ok('a wrongly typed argument is refused', !r.ok && r.code === 'invalid', JSON.stringify(r));
    r = run('initiative.set', {id:'m1', field:'start', value:3});
    ok('a field another action owns names that action', !r.ok && /initiative\.move/.test(r.reason), JSON.stringify(r));
    r = run('initiative.set', {id:'m1', field:'edited', value:'x'});
    ok('a stamp can\'t be set', !r.ok && r.code === 'invalid', JSON.stringify(r));
    r = run('initiative.set', {id:'m2', field:'label', value:'New', prev:'Not what it says'});
    ok('a prev that doesn\'t match is stale and changes nothing', !r.ok && r.code === 'stale' && ev(`barById('m2').label`) !== 'New', JSON.stringify(r));
    r = run('initiative.set', {id:'m2', field:'label', value:'New', prev:ev(`barById('m2').label`)});
    ok('a prev that matches applies', r.ok, JSON.stringify(r));
    r = run('task.link', {id:'task-a', after:'task-b'});
    ok('a task link that would loop is blocked with the card\'s reason', !r.ok && r.code === 'blocked' && r.reason === 'That would create a loop.', JSON.stringify(r));
    r = run('initiative.setStatus', {id:'m1', status:'done'});
    ok('an initiative whose status comes from its tasks can\'t be set', !r.ok && r.code === 'blocked' && /tasks/.test(r.reason), JSON.stringify(r));
    r = run('initiative.place', {id:'u2', target:'u3', zone:'inside'});
    ok('an initiative can\'t go inside itself', !r.ok && /inside itself/.test(r.reason), JSON.stringify(r));
    r = run('task.add', {bar:'nope', start:'2026-09-21'});
    ok('a missing reference is invalid', !r.ok && r.code === 'invalid' && /isn't in the plan/.test(r.reason), JSON.stringify(r));

    fresh();
    const live0 = ev(plan), out = ev(`(()=>{ const P = JSON.parse(${JSON.stringify(live0)}), before = JSON.stringify(P), r = applyAction(P, 'initiative.move', {id:'m3', start:5});
      return JSON.stringify({moved:r.moved, same: JSON.stringify(P) === before, m4:r.plan.bars.find(b=>b.id==='m4').start}); })()`);
    const o = JSON.parse(out);
    ok('applyAction changes a copy: neither the plan passed in nor the live plan changes', o.same && ev(plan) === live0, out);
    ok('applyAction schedules like commit: what follows moves', o.moved > 0 && o.m4 > 6, out);
    ev(`S.lanes.find(l=>l.id==='int').until = dayToIso(wkDay(9) + 4); render()`);
    r = run('initiative.move', {id:'m5', start:10});
    ok('applyAction refuses a change that lands in blacked-out time', !r.ok && r.code === 'blocked' && /blacked out/.test(r.reason), JSON.stringify(r));
    fresh(); ev(`S.deliverables = Array.from({length:DV_MAX}, (_, i)=>({id:'dv-' + i, name:'D' + i, stage:'idea'}))`);
    r = run('outcome.add', {name:'One more'});
    ok('the deliverable limit holds for actions too', !r.ok && r.code === 'blocked' && /up to/.test(r.reason), JSON.stringify(r));

    fresh(); ev(sel('task','task-a') + `pick('f-tdep', 'task-b')`);
    ok('a refused card edit says why and changes nothing', /loop/.test(ev(`document.getElementById('status').textContent`)) && !ev(`(taskById('task-a').t.dependsOn || []).length`), ev(`document.getElementById('status').textContent`));
    fresh(); ev(dv('dv-a') + `pick('f-dvstage', 'planned')`);
    ok('a deliverable can\'t be planned without a target, from the card', ev(`dvById('dv-a').stage`) === 'idea' && /target/.test(ev(`document.getElementById('status').textContent`)));

    // Holidays
    parity('one day off', `addDaysOff('Founders day', '2026-10-16')`, 'holiday.add', {date:'2026-10-16', name:'Founders day'});
    parity('a range, working days only', `addDaysOff('Shutdown', '2026-11-20', '2026-11-27')`, 'holiday.addRange', {from:'2026-11-20', to:'2026-11-27', name:'Shutdown'});
    parity('remove', `S.holidays = [{date:'2026-10-16', name:'Founders day'}]; P0 = ${plan}; UI.planTab = 'calendar'; setWs('plan'); render(); $('#t-holidays').querySelector('button.x').click()`, 'holiday.del', {date:'2026-10-16'});
    { fresh(); const run = (id, a)=>JSON.parse(ev(`JSON.stringify((({ok, reason})=>({ok, reason}))(applyAction(planOfRecord(S), ${JSON.stringify(id)}, ${JSON.stringify(a)})))`));
      ok('holiday.add refuses a weekend', !run('holiday.add', {date:'2026-10-17'}).ok);
      ok('holiday.addRange refuses more than two months', !run('holiday.addRange', {from:'2026-10-01', to:'2026-12-15'}).ok);
      { const r = JSON.parse(ev(`JSON.stringify(applyAction(planOfRecord(S), 'holiday.del', {date:'2026-10-16'}), (k, v)=>k === 'plan' ? undefined : v)`)); ok('removing a day that isn\'t a holiday is already done, so reading a batch again is safe', r.ok && r.nochange, JSON.stringify(r)); }
      ev(`act('holiday.addRange', {from:'2026-11-23', to:'2026-11-27', name:'Shutdown'})`);
      ok('a range is stored as its working days with the name', ev(`JSON.stringify(S.holidays)`) === JSON.stringify(['23','24','25','26','27'].map(d=>({date:'2026-11-'+d, name:'Shutdown'}))), ev('JSON.stringify(S.holidays)'));
      ok('reading it again finds it already in the plan', ev(`planActions['holiday.addRange'].done(S, {from:'2026-11-23', to:'2026-11-27'})`) === true);
      ok('a holiday reads plainly in review', ev(`actLine('holiday.addRange', {from:'2026-11-23', to:'2026-11-27', name:'Shutdown'}, S)`) === 'Days off "Shutdown", ' + ev(`fmtDay(isoToDay('2026-11-23'))`) + ' – ' + ev(`fmtDay(isoToDay('2026-11-27'))`)); }
    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.message); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
