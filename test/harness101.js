// Contextual details, release notes and keyboard access to Delivery lists.
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, '../dist/sightline.html'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/sample-plan.json'), 'utf8');
const checks = [], ok = (name, pass)=>checks.push(`${pass ? 'PASS' : 'FAIL'} ${name}`);
(async()=>{
  const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/', virtualConsole:new VirtualConsole(), beforeParse(w){
    w.HTMLDialogElement.prototype.showModal = function(){this.open=true;};
    w.HTMLDialogElement.prototype.close = function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
    w.indexedDB=undefined; w.confirm=()=>true; w.prompt=()=>'Tester';
    w.Element.prototype.scrollIntoView=function(){};
    w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:String(t).length*7})});
    w.CSS=w.CSS || {}; w.CSS.escape=s=>s;
    w.errors=[];w.addEventListener('error',e=>w.errors.push(e.message));
  }});
  const w=dom.window,d=w.document,ev=s=>w.eval(s);
  try{
    await new Promise(r=>setTimeout(r,220));w.FIX=fixture;
    ev("S=normalize(JSON.parse(FIX),false);file.handle=null;locked=false;resetHistory();setMe(S.people[0].id);UI.noWelcome=true;UI.ws='timeline';render();");
    ev("S.deliverables=[{id:'dv-sorted',name:'Sorted delivery',stage:'planned',target:'2026-Q4'}];goWs('roadmap')");
    ok('D0 Roadmap never renders an absent section as null', ![...d.querySelector('#roadmapWs').childNodes].some(n=>n.nodeType===3 && n.textContent.trim()==='null'));
    ev("goWs('timeline')");
    ev("sel={type:'bar',id:S.bars.find(b=>!b.jira).id};render();");
    ok('D1 structural initiative fields are behind disclosure', !!d.querySelector('#itemOptions #f-parent') && !d.querySelector('#itemOptions').open);
    ok('D2 common title and status remain outside disclosure', !!d.querySelector('#f-label') && !d.querySelector('#itemOptions #f-label') && !d.querySelector('#itemOptions #f-status'));
    d.querySelector('#itemOptions').open=true;await new Promise(r=>setTimeout(r,20));ev('render()');
    ok('D3 disclosure stays open for the same item', d.querySelector('#itemOptions').open);
    ev("S.bars[0].tasks=[{id:'task-detail',label:'Test task',start:S.meta.start,days:2,status:'notstarted'}];sel={type:'task',id:'task-detail'};render();");
    ok('D4 task movement is behind disclosure', !!d.querySelector('#itemOptions #f-tbar') && !d.querySelector('#itemOptions').open);
    for(const section of ['report','decisions','risks']){
      ev(`sel=null;UI.planTab='${section}';goWs('plan')`);
      const cur=d.querySelector('#sidenav [aria-current="page"]'), gates=d.querySelector('#delivery-gates');
      ok(`D5 ${section}: supporting lists sit beside it in the menu, reachable by Tab`,!!cur && cur.dataset.section===section && cur.closest('.sngroup')===gates.closest('.sngroup') && gates.closest('.sngroup').classList.contains('open') && gates.tabIndex>=0);
      gates.focus();gates.click();await new Promise(r=>setTimeout(r,10));
      ok(`D6 ${section}: the menu opens Gates`,ev("UI.planTab==='gates'") && d.querySelector('#delivery-gates').getAttribute('aria-current')==='page');
    }
    ev("JIRA=null;goWs('roadmap')");d.querySelector('#updates-notes').click();
    ok('D7 release notes explain empty connection',d.querySelector('#customerReleasesDialog')?.open && d.querySelector('#customerReleasesDialog').textContent.includes('No Jira releases'));
    d.querySelector('#customerReleasesDialog .x').click();
    ok('D8 release notes dialog closes cleanly',!d.querySelector('#customerReleasesDialog'));
    ev("JIRA={releases:[{id:'rel-one',name:'Synthetic release',date:'2026-10-20'}],issues:{}};JIRA_ISSUES=null;dropJiraMemos();render()");
    d.querySelector('#updates-notes').click();d.querySelector('#customerReleasesDialog [data-release]').click();
    ok('D9 release choice opens existing release details',ev("UI.ws==='roadmap' && sel.type==='release' && sel.id==='rel-one'") && !d.querySelector('#customerReleasesDialog'));
    ev("S.deliverables=[{id:'dv-timing',name:'Test delivery',stage:'planned',target:'2027-H1'}];sel={type:'deliverable',id:'dv-timing'};render()");
    ok('D10 broad timing has source and uncertainty',d.querySelector('#dvTimingMeaning').textContent.includes('Target window') && d.querySelector('#dvTimingMeaning').textContent.includes('not a delivery guarantee'));
    ev("S.deliverables[0].date='2026-10-20';render()");
    ok('D11 specific date described as planned',d.querySelector('#dvTimingMeaning').textContent.includes('Planned date'));
    ev("S.deliverables[0].release='rel-one';render()");
    ok('D12 release timing identifies Jira source',d.querySelector('#dvTimingMeaning').textContent.includes('Jira release date'));
    ok('D13 no page errors',!w.errors.length);
  }catch(e){checks.push('FAIL completed: '+e.stack);}
  finally{await new Promise(r=>setTimeout(r,30));dom.window.close();console.log(checks.join('\n'));const passed=checks.filter(x=>x.startsWith('PASS')).length;console.log(`${passed}/${checks.length} passed`);process.exitCode=passed===checks.length?0:1;}
})();
