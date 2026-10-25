// Pending composers, discoverable Work sorting/identity, Find reveal, and keyboard filter continuity.
// Uses synthetic data only. SIGHTLINE_HTML can prove regressions against the earlier built page.
const {JSDOM, VirtualConsole} = require("jsdom");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/g, "");
const fixture = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const results = [], ok = (name, condition, detail = "")=>results.push(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? "  ("+detail+")" : ""}`);
const wait = ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(results.join("\n")); console.log("TIMEOUT"); process.exit(1); },40000).unref();
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new VirtualConsole(),beforeParse(w){
    const RealDate = w.Date, now = new RealDate(2026,8,30,10).getTime();
    w.Date = class extends RealDate { constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; } };
    w.HTMLDialogElement.prototype.showModal=function(){ this.open=true; }; w.HTMLDialogElement.prototype.close=function(){ this.open=false; };
    w.indexedDB=undefined; w.confirm=()=>true; w.prompt=()=>"Synthetic viewer"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:test"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){};
    w.HTMLCanvasElement.prototype.getContext=()=>({font:"",measureText:t=>({width:String(t).length*7})});
    w.CSS=w.CSS||{}; w.CSS.escape=s=>s; w.errors=[]; w.addEventListener("error",e=>w.errors.push(e.message));
    w.observers=[]; w.ResizeObserver=class { constructor(callback){ this.callback=callback; this.targets=[]; w.observers.push(this); } observe(el){ this.targets.push(el); } disconnect(){} };
  }});
  const w=dom.window, d=w.document, ev=s=>w.eval(s); await wait(150); w.FIXTURE=fixture;
  ev(`S=normalize(JSON.parse(FIXTURE),false); S.meta.planId='ux-plan-one'; file.handle=null; locked=false; resetHistory(); setMe(S.people[0].id); UI.ws='timeline'; UI.noWelcome=true;
    S.bars.push({id:'ux-card',label:'Synthetic work',lane:S.lanes[0].id,start:1,span:1,kind:'work',status:'notstarted',owners:[],tasks:[]});
    S.bars.push({id:'ux-card-two',label:'Other synthetic work',lane:S.lanes[0].id,start:1,span:1,kind:'work',status:'notstarted',owners:[],tasks:[]});
    S=normalize(JSON.parse(JSON.stringify(S)),false); UI.filter=normFilter({}); UI.notes='all'; render();`);
  const input=(selector,value,event="input")=>{ const el=d.querySelector(selector); if (!el) throw Error("Missing "+selector); el.value=value; el.dispatchEvent(new w.Event(event,{bubbles:true})); return el; };
  return {w,d,ev,input,close:()=>dom.window.close()};
}
(async()=>{
  const section=async(name,fn)=>{ let p; try { p=await page(); await fn(p); ok(name+": no browser errors",!p.w.errors.length,p.w.errors.join(" | ")); } catch(e){ ok(name+": completed",false,e.message); } finally { p?.close(); } };
  await section("composers",async({w,d,ev,input})=>{
    ev("select('bar','ux-card');");
    input("#sticky-in","Draft note before Jira refresh"); input("#q-upd","Pending update");
    input("#q-breason","Waiting for a test environment"); input("#q-bwho","__other","change"); input("#q-bother","Synthetic team");
    const note=d.querySelector("#sticky-in"); note.focus(); note.setSelectionRange(6,10);
    const status=JSON.stringify({kind:"sightline-jira-status",generatedAt:"2026-09-30T09:00:00Z",issues:{"ABC-123":{summary:"New synced title",status:"To Do",category:"todo",type:"Story"}},rollups:{},missing:[]});
    w.DIR={name:"synthetic-jira",async getFileHandle(name){ if (name!=="status.json") throw Error("not found"); return {getFile:async()=>({text:async()=>status})}; }};
    await ev("readJiraDir(DIR,true)");
    ok("Jira refresh keeps pending note",d.querySelector("#sticky-in").value==="Draft note before Jira refresh");
    ok("Jira refresh keeps pending quick update",d.querySelector("#q-upd").value==="Pending update");
    ok("Jira refresh keeps blocker reason and waiting-on fields",d.querySelector("#q-breason").value==="Waiting for a test environment" && d.querySelector("#q-bwho").value==="__other" && d.querySelector("#q-bother").value==="Synthetic team" && !d.querySelector("#q-bother").hidden && d.querySelector(".qblock").open);
    ok("Jira refresh preserves note focus and caret",d.activeElement.id==="sticky-in" && d.activeElement.selectionStart===6 && d.activeElement.selectionEnd===10);
    ev("select('bar','ux-card-two');"); ok("drafts do not leak to a different item",d.querySelector("#sticky-in").value==="" && d.querySelector("#q-upd").value==="");
    ev("select('bar','ux-card');"); ok("returning to item restores its drafts",d.querySelector("#sticky-in").value==="Draft note before Jira refresh");
    d.querySelector("#sticky-add").click(); await wait(50);
    ok("successful note clears composer and creates exactly one note",d.querySelector("#sticky-in").value==="" && ev("S.notes.filter(n=>n.text==='Draft note before Jira refresh').length")===1);
    d.querySelector("#q-addupd").click(); await wait(50);
    ok("successful quick update clears composer",d.querySelector("#q-upd").value==="" && ev("updatesFor('bar:ux-card').some(u=>u.text==='Pending update')"));
    input("#q-upd","Keep this after refusal"); ev("window.REAL_QUICK=quickSave; quickSave=()=>Promise.resolve(false);"); d.querySelector("#q-addupd").click(); await wait(10); ev("render(); quickSave=REAL_QUICK;");
    ok("refused submission keeps the unsent update",d.querySelector("#q-upd").value==="Keep this after refusal");
    ev("window.OLD_PLAN=S.meta.planId; S.meta.planId='ux-plan-two'; render();"); ok("drafts do not leak across plan IDs",d.querySelector("#q-upd").value==="");
    ev("S.meta.planId=OLD_PLAN; render();"); ok("returning to plan restores its own draft",d.querySelector("#q-upd").value==="Keep this after refusal");
    input("#q-upd","First submitted update"); ev("window.REAL_QUICK=quickSave; quickSave=()=>new Promise(resolve=>{window.FINISH_UPDATE=resolve;});");
    d.querySelector("#q-addupd").click(); input("#q-upd","Next update already started"); ev("FINISH_UPDATE(true); quickSave=REAL_QUICK;"); await wait(10);
    ok("finishing an earlier save keeps the next message",d.querySelector("#q-upd").value==="Next update already started");
    input("#sticky-in","Submitted note text"); ev("window.REAL_QUICK=quickSave; quickSave=()=>new Promise(resolve=>{window.FINISH_NOTE=resolve;});");
    d.querySelector("#sticky-add").click(); input("#sticky-in","Next note already started"); ev("FINISH_NOTE(true); quickSave=REAL_QUICK;"); await wait(10);
    ok("finishing an earlier note keeps the next note",d.querySelector("#sticky-in").value==="Next note already started");
    const edit=d.querySelector("[data-uedit]"); edit.click(); input(".uedit","Unsubmitted change to existing update"); ev("renderSide();");
    ok("existing update editor survives details redraw",d.querySelector(".uedit")?.value==="Unsubmitted change to existing update");
    input(".uedit",""); ev("renderSide();"); ok("empty existing-update draft remains open after redraw",d.querySelector(".uedit")?.value==="");
    d.querySelector(".uedit").dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true})); ev("renderSide();"); ok("canceling existing update discards its draft",!d.querySelector(".uedit"));
  });
  await section("filter focus",async({w,d,ev,input})=>{
    ev("S.tags=[{id:'ux-tag',name:'Synthetic tag',color:'#123456'}]; JIRA=parseJiraStatus(JSON.stringify({kind:'sightline-jira-status',issues:{'ABC-1':{summary:'Label sample',labels:['ux-label']}},rollups:{}})); S.bars[0].added={by:S.people[0].id,at:'2026-09-30T08:00:00Z'}; openFilterPop();");
    for (const selector of ['#fTags [data-tfilter="ux-tag"]','#fLabels [data-tfilter="ux-label"]']){
      const el=d.querySelector(selector); el.focus(); el.click(); ok(selector+" retains focus",d.activeElement.dataset.tfilter===el.dataset.tfilter);
      d.activeElement.click(); ok(selector+" can cycle by keyboard focus",d.activeElement.dataset.tfilter===el.dataset.tfilter);
    }
    d.querySelector('[data-fkey="range:custom"]').focus(); d.activeElement.click();
    input('#filterPop input[aria-label="From"]',"2026-09-21","change").focus();
    const from=d.querySelector('#filterPop input[aria-label="From"]'); from.focus(); from.value="2026-09-22"; from.dispatchEvent(new w.Event("change",{bubbles:true}));
    ok("custom From date retains focus after change",d.activeElement.getAttribute("aria-label")==="From");
    const to=d.querySelector('#filterPop input[aria-label="To"]'); to.focus(); to.value="2026-10-09"; to.dispatchEvent(new w.Event("change",{bubbles:true}));
    ok("custom To date retains focus after change",d.activeElement.getAttribute("aria-label")==="To");
    const hide=d.querySelector('[data-hide="unknown"]'); hide.focus(); hide.checked=true; hide.dispatchEvent(new w.Event("change",{bubbles:true}));
    ok("hide-author checkbox retains focus",d.activeElement.dataset.hide==="unknown");
    const empty=d.querySelector('[data-fkey="showEmpty"]'); empty.focus(); empty.checked=!empty.checked; empty.dispatchEvent(new w.Event("change",{bubbles:true}));
    ok("keep empty workstreams checkbox retains focus",d.activeElement.dataset.fkey==="showEmpty");
  });
  await section("Find reveal",async({d,ev})=>{
    ev("S.milestones.push({id:'ux-ms',what:'Synthetic milestone',lane:S.lanes[0].id,at:2,status:'planned'}); UI.filter=normFilter({lanes:[S.lanes[1].id],status:['done']}); UI.rows='people'; UI.fold={['lane:'+S.lanes[0].id]:true}; window.BEFORE_FIND=JSON.stringify(UI.filter); goTo('ms','ux-ms');");
    ok("Find reveals milestone hidden by another workstream",!!d.querySelector('#gantt [data-peek-id="ux-ms"]'));
    ok("Find retains unrelated status filter",ev("UI.filter.status.includes('done')"));
    ok("Find explains adjustment and offers restore",/reveal this result/.test(d.querySelector("#status").textContent) && !d.querySelector("#findRestore")?.hidden);
    d.querySelector("#findRestore")?.click();
    ok("restore returns previous filter, grouping, and fold",ev("JSON.stringify(UI.filter)===BEFORE_FIND && UI.rows==='people' && UI.fold['lane:'+S.lanes[0].id]"));
    ev("S.lanes.push({id:'ux-empty-lane',name:'Synthetic empty workstream',members:[],color:'#123456'}); S.milestones.push({id:'ux-people-ms',what:'Synthetic filtered milestone',lane:'ux-empty-lane',at:2,status:'planned'});");
    for (const zoom of ["weeks","days"]){
      ev(`UI.zoom='${zoom}'; UI.rows='people'; UI.filter=normFilter({people:[S.people[0].id]}); window.PEOPLE_BEFORE_FIND=JSON.stringify(UI.filter); goTo('ms','ux-people-ms');`);
      ok(`Find reveals milestone without matching work in ${zoom}`,!!d.querySelector('#gantt [data-peek-id="ux-people-ms"]') && ev("UI.filter.people.length===0"));
      d.querySelector("#findRestore")?.click();
      ok(`restoring milestone Find keeps original people filter in ${zoom}`,ev("JSON.stringify(UI.filter)===PEOPLE_BEFORE_FIND && UI.rows==='people'"));
    }
    ev("barById('ux-card').owners=[S.people[0].id]; S.milestones.push({id:'ux-matching-ms',what:'Milestone with matching work',lane:barById('ux-card').lane,at:2,status:'planned'}); UI.zoom='weeks'; UI.rows='people'; UI.filter=normFilter({people:[S.people[0].id]}); goTo('ms','ux-matching-ms');");
    ok("Find keeps people filter when matching work reveals milestone",!!d.querySelector('#gantt [data-peek-id="ux-matching-ms"]') && ev("UI.filter.people.length===1 && UI.filter.people[0]===S.people[0].id"));
    ev("UI.filter=normFilter({}); UI.rows='lanes'; UI.fold={}; S.notes.push({id:'ux-note',text:'Synthetic note',lane:S.lanes[0].id,date:'2026-09-30',author:S.people[0].id}); UI.notes='none'; goTo('note','ux-note');");
    ok("Find reveals a note when Notes are hidden",!!d.querySelector('#gantt [data-peek-id="ux-note"]') && ev("UI.notes") === "all");
    ev("S.gates.push({id:'ux-gate',gate:'Synthetic gate',date:'2026-09-30',owners:[]}); UI.filter=normFilter({kinds:['task'],people:[S.people[0].id]}); UI.fold={'sec:gates':true}; goTo('gate','ux-gate');");
    ok("Find reveals gate hidden by kind, person, and folding",!!d.querySelector('#gantt [data-peek-id="ux-gate"]'));
    ev("UI.filter=normFilter({authors:[S.people[1].id]}); S.notes.find(n=>n.id==='ux-note').added={by:S.people[0].id}; setLayerQuiet('jira'); setHide(hd=>{hd.people=[S.people[0].id];}); goTo('note','ux-note');");
    ok("Find resolves combined layer, author, and hidden-person restrictions",!!d.querySelector('#gantt [data-peek-id="ux-note"]'));
    ev("S.notes.push({id:'ux-attached',text:'Attached synthetic note',on:'bar:ux-card',lane:S.lanes[0].id,date:'2026-09-30',author:S.people[0].id}); UI.filter=normFilter({lanes:[S.lanes[1].id]}); goWs('today'); goTo('note','ux-attached');");
    ok("Find explains how an attached note appears",d.querySelector("#f-ntext")?.value==="Attached synthetic note" && /Use its item link/.test(d.querySelector("#status").textContent));
    d.querySelector("#f-nattached")?.click(); ok("attached note's item link reveals filtered parent",ev("sel.type==='bar' && sel.id==='ux-card'") && !!d.querySelector('#gantt [data-peek-id="ux-card"]'));
    ev("S.meta.planId='ux-different-plan'; render();"); ok("a different plan hides stale Find restore action",d.querySelector("#findRestore").hidden);
  });
  await section("daily navigation",async({d,ev})=>{
    ev("S.decisions=[{id:'ux-decision',text:'Choose synthetic option',state:'open',due:'2026-09-30',owners:[S.people[1].id],decider:S.people[0].id},{id:'ux-no-decider',text:'Unassigned synthetic decision',state:'open',due:'2026-09-30',owners:[]}]; UI.todayScope='team'; goWs('today');");
    const rows=[...d.querySelectorAll('#today li')], decision=rows.find(r=>r.textContent.includes("Choose synthetic option")), unassigned=rows.find(r=>r.textContent.includes("Unassigned synthetic decision"));
    ok("Today names decider and distinguishes owners",decision?.textContent.includes("Decider: "+ev("personName(S.people[0].id)")) && decision.textContent.includes("Owners: "+ev("personName(S.people[1].id)")));
    ok("Today explicitly identifies missing decider",unassigned?.textContent.includes("Decider: not set"));
    const sort=d.querySelector("#work-sort"); ok("Work exposes Sort Jira work directly",!!sort && !sort.hidden); sort?.click();
    ok("Sort uses existing plan section and Work navigation",ev("UI.ws==='plan' && UI.planTab==='epics' && workspaceGroup()==='work'") && d.querySelector('.sngroup[data-group="work"]').classList.contains("here") && d.querySelector("#work-sort").getAttribute("aria-current")==="page");
    ok("daily Sort workspace is not listed under Settings",!d.querySelector('#snp-settings [data-section="epics"]'));
    ev("goMainGroup('delivery'); goMainGroup('work')");
    ok("Work remembers its Sort Jira page",ev("UI.ws==='plan' && UI.planTab==='epics'"));
    d.querySelector("#set-jira").click(); ok("Settings still opens connection configuration",ev("workspaceGroup()==='settings' && UI.planTab==='jira'") && d.querySelector("#set-jira").getAttribute("aria-current")==="page");
    ev("openEpics();"); ok("old Sort Jira entry keeps working",ev("UI.ws==='plan' && UI.planTab==='epics'"));
    const identity=d.querySelector("#identityBtn"); ok("identity is visible outside Notes",!!identity && !identity.hidden && identity.textContent.includes(ev("personName(S.people[0].id)")));
    identity?.click(); await wait(10); ok("identity opens the existing browser-local person chooser",d.querySelector("#addMenu").getAttribute("aria-label")==="Who are you?" && !d.querySelector("#addMenu").hidden);
    const css=[...d.querySelectorAll("style")].map(x=>x.textContent).join("\n");
    ok("responsive CSS keeps operational status visible",!/#status\s*\{[^}]*clip\s*:/.test(css) && /#status\s*\{[^}]*white-space:normal/.test(css));
  });
  await section("header geometry",async({w,d,ev})=>{
    const top=d.querySelector(".top"), bar=d.querySelector("#wsbar"), style=d.documentElement.style;
    let topHeight=80, barHeight=46;
    Object.defineProperty(top,"offsetHeight",{configurable:true,get:()=>topHeight});
    Object.defineProperty(bar,"offsetHeight",{configurable:true,get:()=>barHeight});
    const observer=w.observers.find(o=>o.targets.includes(top) && o.targets.includes(bar));
    ok("header and workspace bar are observed for content height changes",!!observer);
    const original=style.setProperty.bind(style); let writes=0;
    style.setProperty=(...args)=>{ writes++; return original(...args); };
    ev("window.GEOMETRY_RENDERS=0; window.OLD_RENDER=render; render=()=>{GEOMETRY_RENDERS++;};");
    observer?.callback();
    topHeight=132; barHeight=72; ev("setStatus('A longer operation message wraps onto additional lines.');"); observer?.callback();
    ok("content height changes update sticky offsets without a resize",style.getPropertyValue("--toph")==="132px" && style.getPropertyValue("--wsh")==="72px");
    const before=writes; observer?.callback(); observer?.callback();
    ok("unchanged observed heights cause no CSS writes",writes===before);
    ok("header observation never redraws the application",ev("GEOMETRY_RENDERS")===0);
    delete w.ResizeObserver; topHeight=160; barHeight=84; ev("setStatus('Fallback operation message.');");
    ok("status updates synchronize heights without ResizeObserver",style.getPropertyValue("--toph")==="160px" && style.getPropertyValue("--wsh")==="84px");
    ev("render=OLD_RENDER; S.people[0].name='SyntheticVeryLongUnbrokenViewerNameForNarrowWindows'; renderMainNav();");
    const identity=d.querySelector("#identityBtn"), css=[...d.querySelectorAll("style")].map(s=>s.textContent).join("\n");
    ok("long identities are capped with a full-name tooltip",/#identityBtn\s*\{[^}]*max-width:min\(220px,60vw\)[^}]*text-overflow:ellipsis/.test(css) && identity.title.includes(ev("S.people[0].name")));
  });
  console.log(results.join("\n")); const failures=results.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${results.length-failures}/${results.length} passed`); process.exit(failures?1:0);
})();
