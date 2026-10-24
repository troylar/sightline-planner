// Visible workspaces draw on demand; text edits keep immediate model/undo behavior.
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, '..', 'dist', 'sightline.html'), 'utf8').replace(/<link[^>]+fonts[^>]+>/, '');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-plan.json'), 'utf8');
const checks = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const ok = (label, pass, detail = '') => checks.push(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`);
setTimeout(()=>{ console.log(checks.join('\n')); console.log('TIMEOUT'); process.exit(1); }, 40000).unref();
async function page(){
  const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/', virtualConsole:new VirtualConsole(), beforeParse(w){
    const Date0 = w.Date, now = Date0.parse('2026-09-30T10:00:00Z');
    w.Date = class extends Date0 { constructor(...args){ args.length ? super(...args) : super(now); } static now(){ return now; } };
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>'Synthetic'; w.alert = ()=>{};
    w.Element.prototype.scrollIntoView = function(){}; w.HTMLCanvasElement.prototype.getContext = ()=>({font:'', measureText:t=>({width:String(t).length * 7})});
    w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errors = []; w.addEventListener('error', e=>w.errors.push(e.message));
  }});
  const w = dom.window, d = w.document, ev = code=>w.eval(code); await wait(220); w.FIX = fixture;
  ev("S=normalize(JSON.parse(FIX),false);file.handle=null;locked=false;resetHistory();setMe(S.people[0].id);UI.noWelcome=true;UI.ws='timeline';UI.zoom='weeks';UI.zoomN=1;UI.filter=normFilter({});render();");
  w.calls = {}; w.originals = {};
  for (const name of ['renderGantt','renderDays','renderSprints','renderHolidays','renderTeam','renderGroups','renderMeetings','renderOffTracker','renderJiraPeople','renderTypes','renderCeremonies','renderDerived','updateFileUI','updateUndo']){
    w.originals[name] = ev(name); ev(`${name}=function(...args){calls[${JSON.stringify(name)}]=(calls[${JSON.stringify(name)}]||0)+1;return originals[${JSON.stringify(name)}](...args);}`);
  }
  return {dom,w,d,ev,reset:()=>{w.calls={};}};
}
(async()=>{
  const section = async fn=>{ try { await fn(); } catch(e){ ok('section completed', false, e.stack || e.message); } };
  await section(async()=>{
    const {dom,w,d,ev,reset}=await page();
    const first=d.querySelector('#gantt').firstChild; d.querySelector('#gscroll').scrollLeft=177;
    const setupNames=['renderSprints','renderHolidays','renderTeam','renderGroups','renderMeetings','renderOffTracker','renderJiraPeople','renderTypes','renderCeremonies'];
    for(const ws of ['today','standup','roadmap']){
      reset(); w.WS=ws; ev('goWs(WS)');
      ok(`${ws}: no hidden Timeline rendering`, !w.calls.renderGantt && !w.calls.renderDays);
      ok(`${ws}: no unrelated setup tables`, setupNames.every(name=>!w.calls[name]));
    }
    ok('hidden Timeline DOM and scroll are retained', d.querySelector('#gantt').firstChild===first && d.querySelector('#gscroll').scrollLeft===177);
    const map={team:['renderTeam','renderGroups'],calendar:['renderHolidays'],meetings:['renderMeetings'],types:['renderSprints','renderTypes','renderCeremonies']};
    for(const [section,names] of Object.entries(map)){
      reset(); w.SECTION=section; ev("UI.planTab=SECTION;goWs('plan')");
      ok(`${section}: only its setup tables are drawn`, names.every(name=>w.calls[name]===1) && setupNames.filter(name=>!names.includes(name)).every(name=>!w.calls[name]));
      ok(`${section}: no hidden Timeline drawing`, !w.calls.renderGantt && !w.calls.renderDays);
    }
    reset(); ev("goWs('people')");
    ok('People draws time off and Jira users only', w.calls.renderOffTracker===1 && w.calls.renderJiraPeople===1 && setupNames.filter(name=>!['renderOffTracker','renderJiraPeople'].includes(name)).every(name=>!w.calls[name]));
    ev("UI.planTab='decisions';goWs('plan');");
    ok('visible decision table remains populated', d.querySelectorAll('#t-decisions tbody tr').length===ev('S.decisions.length'));
    await wait(30); ok('workspace drawing raises no page errors', !w.errors.length, w.errors.join(' | ')); dom.window.close();
  });
  await section(async()=>{
    const {dom,w,d,ev}=await page();
    Object.defineProperty(d.querySelector('#gscroll'),'clientWidth',{configurable:true,get:()=>d.querySelector('#ws-timeline').hidden ? 0 : 900});
    w.drawWidths=[]; const original=w.originals.renderGantt;
    w.originals.renderGantt=function(...args){w.drawWidths.push(d.querySelector('#gscroll').clientWidth);return original(...args);};
    ev("window.BID=S.bars.find(b=>!b.jira).id;goWs('today');barById(BID).label='Updated while away';UI.filter=normFilter({lanes:[barById(BID).lane]});goWs('timeline');");
    ok('return reveals Timeline before measuring geometry', w.drawWidths.at(-1)===900);
    ok('return draws current plan text and keeps filter', d.querySelector('#gantt').textContent.includes('Updated while away') && ev('UI.filter.lanes[0]===barById(BID).lane'));
    ev("UI.zoom='days';goWs('today');goWs('timeline');");
    ok('return in Days rebuilds day geometry', !!ev('DV') && ev('DV.N')>0 && d.querySelector('#gantt').classList.contains('days'));
    ev("goWs('roadmap');applyNav({ws:'timeline',plan:S.meta.planId,sel:'bar:'+BID,z:'weeks',n:'1'});render();");
    ok('deep link returns to selected Timeline item and Weeks', ev("UI.ws==='timeline'&&UI.zoom==='weeks'&&sel.type==='bar'&&sel.id===BID") && d.querySelector('#f-label'));
    ev("window.JB=clone(barById(BID));Object.assign(JB,{id:'perf-jira',jira:'ABC-900',epics:[],tasks:[],dependsOn:[],label:''});S.bars.push(JB);JIRA=parseJiraStatus(JSON.stringify({kind:'sightline-jira-status',generatedAt:'2026-09-30T10:00:00Z',issues:{'ABC-900':{summary:'Synced title',status:'Done',category:'done',type:'Story'}},rollups:{},missing:[]}));goWs('today');render();");
    ok('hidden Timeline still refreshes Jira model facts', ev("barById('perf-jira').status==='done'"));
    ev("UI.filter=normFilter({});goWs('timeline');");
    ok('return draws refreshed Jira title', d.querySelector('#gantt').textContent.includes('Synced title'));
    await wait(30); ok('geometry and deep links raise no page errors', !w.errors.length, w.errors.join(' | ')); dom.window.close();
  });
  await section(async()=>{
    const {dom,w,d,ev,reset}=await page();
    ev("window.BID=S.bars.find(b=>!b.jira).id;UI.ws='standup';sel={type:'bar',id:BID};render();resetHistory();");
    const input=d.querySelector('#f-label'); input.focus(); reset();
    for(const value of ['Draft','Draft title','Draft title final']){input.value=value;input.setSelectionRange(value.length,value.length);input.dispatchEvent(new w.Event('input',{bubbles:true}));}
    ok('typing commits latest text immediately', ev("barById(BID).label==='Draft title final'"));
    ok('typing burst keeps one undo step and the same focused field', ev('past.length')===1 && d.activeElement===input && input.selectionStart===input.value.length);
    ok('typing burst performs no synchronous derived redraw', !w.calls.renderDerived);
    ok('typing updates file and undo controls once per input', w.calls.updateFileUI===3 && w.calls.updateUndo===3);
    await wait(180);
    ok('typing burst coalesces dependent output once', w.calls.renderDerived===1, JSON.stringify(w.calls));
    ok('dependent output leaves caret and hidden Timeline intact', d.activeElement===input && input.selectionStart===input.value.length && !w.calls.renderGantt && !w.calls.renderDays);
    input.dispatchEvent(new w.Event('change',{bubbles:true}));
    ev('undo()'); ok('one undo restores the title before the burst', ev("barById(BID).label!=='Draft title final'"));
    reset(); const title=d.querySelector('#title'); title.focus(); title.value='Plan title while typing';title.dispatchEvent(new w.Event('input',{bubbles:true}));
    ok('toolbar title is immediate without a synchronous dependent redraw', ev("S.meta.title==='Plan title while typing'") && !w.calls.renderDerived);
    ev('render()'); const before=w.calls.renderDerived; await wait(160);
    ok('full rendering cancels an obsolete typing redraw', w.calls.renderDerived===before);
    ok('typing raises no page errors', !w.errors.length, w.errors.join(' | ')); dom.window.close();
  });
  console.log(checks.join('\n')); const failures=checks.filter(row=>row.startsWith('FAIL')).length;
  console.log(`${checks.length-failures}/${checks.length} passed`);process.exit(failures?1:0);
})();
