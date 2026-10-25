// Daily tracking: find, Jira links, quick save (no lock) + merge, timestamps, blocked, updates, reforecast, slip impact, Today, decisions/risks.
const {JSDOM} = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",beforeParse(w){
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.indexedDB=undefined; w.confirm=()=>true; w.alert=()=>{}; w.prompt=()=>""; w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.HTMLAnchorElement.prototype.click=function(){};
  w.Element.prototype.scrollIntoView=function(){}; w.CSS=w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
const w=dom.window,d=w.document,ev=s=>w.eval(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
const T = new Date(); const iso = n => { const x = new Date(T.getFullYear(), T.getMonth(), T.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 30000).unref?.();
(async()=>{
  await wait(150);
  ev("askWhoOnStart = ()=>{}");
  // plan anchored on today's week so "late" and "today" are real
  const mon = ev(`dayToIso(mondayOf(todayDay()) - 14)`);
  const planObj = {meta:{title:"Daily",start:mon,weeks:12}, lanes:[{id:"a",name:"Core"},{id:"b",name:"Web"}],
    people:[{id:"p1",name:"Pat"},{id:"p2",name:"Lee"},{id:"p3",name:"Kim",off:[{from:ev("dayToIso(todayDay())"),to:ev("dayToIso(todayDay())")}]}],
    bars:[{id:"X",lane:"a",start:0,span:1,label:"Old thing",owners:["p1"],status:"inprogress",jira:"CORE-12"},
          {id:"Y",lane:"a",start:1,span:1,label:"Never started",owners:["p1"],status:"notstarted"},
          {id:"Z",lane:"b",start:2,span:3,label:"Current work",owners:["p2"],status:"inprogress",dependsOn:["X"]},
          {id:"H",lane:"b",start:0,span:4,label:"Holder"},{id:"K",lane:"b",parent:"H",start:2,span:2,label:"Kid",owners:["p2"],tasks:[{id:"t1",label:"Build API",start:ev("dayToIso(todayDay())"),days:3,owners:["p2"]},{id:"t2",label:"Write docs",start:ev("dayToIso(nextWork(todayDay()+1,new Set()))"),days:1,owners:["p1"]}],datesFrom:"tasks"}],
    decisions:[{id:"d1",text:"Pick the vector store"}], risks:[{id:"r1",sev:"high",text:"Vendor contract not signed"}]};
  ev(`S = normalize(${JSON.stringify(planObj)}, false); resetHistory(); UI.filter = normFilter({}); setMe("p1"); render()`);
  // --- Find ---
  ev("openFind()"); const fi = d.querySelector("#findIn"); fi.value = "core-12"; fi.dispatchEvent(new w.Event("input"));
  ok("F1: Find matches Jira keys", d.querySelectorAll("#findList .fhit").length === 1 && /Old thing/.test(d.querySelector("#findList").textContent));
  fi.value = "docs"; fi.dispatchEvent(new w.Event("input")); fi.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  ok("F2: Enter jumps to a task (Days view, selected)", ev("sel && sel.type")==="task" && ev("sel.id")==="t2" && ev("UI.zoom")==="days" && d.querySelector("#findPop").hidden);
  ev(`UI.collapsed = {H:true}; UI.filter = normFilter({people:["p3"]}); setZoom("weeks"); render(); goTo("bar","K")`);
  ok("F3: jumping unfolds the holder and clears a filter that hides it", !ev("UI.collapsed.H") && !ev("fActive()") && ev("sel.id")==="K", ev(`JSON.stringify([UI.collapsed, UI.filter.people, sel])`));
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"/",bubbles:true}));
  ok("F4: / opens Find", !d.querySelector("#findPop").hidden); ev("closeFind()");
  ev(`fi = null; findIndex().length`);
  ok("F5: Find covers people, meetings-less plans, decisions and risks", ev(`findIndex().some(x=>x.kind==="person") && findIndex().some(x=>x.kind==="decision") && findIndex().some(x=>x.kind==="risk")`));
  // --- Jira ---
  ev(`select("bar","X")`); ok("J1: no Jira link until the base address is set", !d.querySelector("#side .jlink"));
  ev(`commit(s=>{ s.meta.jiraBase = "https://acme.atlassian.net/browse/"; }); select("bar","X")`);
  ok("J2: Jira key becomes a link", d.querySelector("#side .jlink")?.getAttribute("href")==="https://acme.atlassian.net/browse/CORE-12" && d.querySelector("#side .jlink").target === "_blank");
  // --- timestamps ---
  ev(`commit(()=>{ barById("Y").status = "inprogress"; })`);
  ok("S1: moving to In progress records when it started", !!ev(`barById("Y").startedAt`));
  ev(`commit(()=>{ barById("Y").status = "done"; })`);
  ok("S2: Done records when it finished", !!ev(`barById("Y").doneAt`));
  ev(`commit(()=>{ barById("Y").status = "notstarted"; })`);
  ok("S3: back to Not started clears both", !ev(`barById("Y").doneAt`) && !ev(`barById("Y").startedAt`));
  ev("undo(); undo(); undo()");
  // --- local (not shared) quick panel ---
  ev(`select("bar","Y")`);
  ok("Q1: a work item shows the quick panel", !!d.querySelector("#side .quick #q-inprogress"));
  ok("Q2: a not-started item past its dates offers to move it", /Should have (started|finished)/.test(d.querySelector("#side .quick").textContent) && !!d.querySelector("#q-rf0"));
  d.querySelector("#q-rf0").click(); await wait(20);
  ok("Q3: Start today moves it to today", ev(`nextWork(wkDay(barById("Y").start), new Set())`) === ev(`nextWork(todayDay(), HS())`), ev(`dayToIso(wkDay(barById("Y").start))`));
  ev(`select("bar","X")`);
  ok("Q4: an in-progress item past its end offers a new finish", /Should have finished/.test(d.querySelector("#side .quick").textContent) && !!d.querySelector("#q-rf3"));
  const zBefore = ev(`barById("Z").start`);
  d.querySelector("#q-rf3").click(); await wait(20);
  ok("Q5: +3 days stretches it to finish 3 working days from today", ev(`barEndDay(barById("X"))`) === ev(`addWork(nextWork(todayDay(), HS()), 4, HS())`), ev(`dayToIso(barEndDay(barById("X")))`));
  ok("Q5: and pushes what waits for it", ev(`barById("Z").start`) > zBefore);
  ev(`select("bar","X")`);
  d.querySelector("#q-breason").value = "Waiting for API keys"; d.querySelector("#q-bwho").value = "__other"; d.querySelector("#q-bwho").dispatchEvent(new w.Event("change")); d.querySelector("#q-bother").value = "Security team";
  d.querySelector("#q-block").click(); await wait(20);
  ok("B1: Mark blocked stores reason, who, since", ev(`barById("X").blocked.reason`)==="Waiting for API keys" && ev(`barById("X").blocked.waitingOn`)==="Security team" && !!ev(`barById("X").blocked.since`));
  ok("B2: and writes an update", /Blocked: Waiting for API keys \(waiting on Security team\)/.test(ev(`updatesFor("bar:X")[0].text`)));
  ok("B3: the bar shows a blocked tag; its holder-less lane still fine", /blocked/.test(d.querySelector('#gantt [data-key="bar:X"]').textContent));
  ok("B4: the filter can show only blocked work", (()=>{ ev(`UI.filter = normFilter({status:["blocked"]}); render()`); const r = ev(`barVisible(barById("X")) && !barVisible(barById("Z"))`); ev(`UI.filter = normFilter({}); render()`); return r; })());
  ev(`select("task","t1")`); d.querySelector("#q-breason").value = "Schema unclear"; d.querySelector("#q-block").click(); await wait(20);
  ok("B5: a holder counts blocked work inside it", ev(`blockedInside(barById("H"))`)===1 && /⛔ 1/.test(d.querySelector('#gantt [data-key="bar:H"]')?.textContent || ""));
  ev(`select("bar","X")`); w.prompt = ()=>"keys arrived"; d.querySelector("#q-unblock").click(); await wait(20); w.prompt = ()=>"";
  ok("B6: Unblock clears it and logs why", !ev(`barById("X").blocked`) && ev(`updatesFor("bar:X")[0].text`)==="Unblocked: keys arrived");
  ev(`select("bar","X")`); d.querySelector("#q-upd").value = "Demo moved to Thursday"; d.querySelector("#q-addupd").click(); await wait(20);
  ok("U1: Add update logs text, author and time", ev(`updatesFor("bar:X")[0].text`)==="Demo moved to Thursday" && !!ev(`updatesFor("bar:X")[0].at`));
  d.querySelector("#q-done").click(); await wait(20);
  ok("U2: the Done button works from the quick panel", ev(`barById("X").status`)==="done" && !!ev(`barById("X").doneAt`));
  ok("U3: updates survive save/load, and deleting the item removes them", ev(`parseText(serialize(S,"x.json")).updates.length`) === ev("S.updates.length") && (()=>{ ev(`del("bar","X")`); const r = !ev(`S.updates.some(u=>u.item==="bar:X")`); ev("undo()"); return r; })());
  // --- slip impact ---
  const hits = ev(`JSON.stringify(slipImpact("bar:X", 3))`);
  ok("W1: 'If this slips' lists what moves (Z waits for X)", /Current work/.test(hits), hits);
  ok("W2: slip impact doesn't change the real plan", ev(`barById("Z").start`) === ev(`barById("Z").start`) && ev("past.length") >= 0 && ev(`slipImpact("bar:Y", 2).length`) === 0);
  // --- Today ---
  ev(`(()=>{ const t0 = todayDay(), iso = n => dayToIso(n);
    S.bars.push({id:"L1",lane:"a",start:0,span:1,label:"Late with update",owners:["p1"],status:"inprogress",dependsOn:[],tasks:[],datesFrom:"manual",kind:"work",jira:""});
    S.bars.push({id:"L2",lane:"a",start:0,span:1,label:"Stale one",owners:["p2"],status:"inprogress",dependsOn:[],tasks:[],datesFrom:"manual",kind:"work",jira:""});
    S.bars.push({id:"B1",lane:"a",start:2,span:1,label:"Blocked one",owners:["p1"],status:"inprogress",blocked:{reason:"Need creds",waitingOn:"p2",since:new Date(Date.now()-3*864e5).toISOString()},dependsOn:[],tasks:[],datesFrom:"manual",kind:"work",jira:""});
    S = normalize(S, false); S.updates.push({id:"u9", item:"bar:L1", at:new Date().toISOString(), by:"p1", text:"Almost there"});
    S.decisions = [{id:"d1",text:"Pick the vector store",state:"open",owners:["p1"],due:iso(t0+2),item:"Z"},{id:"d2",text:"Old call",state:"decided",owners:[],due:iso(t0),item:""}];
    S.risks = [{id:"r1",sev:"high",text:"Vendor contract not signed",owners:["p2"],item:"Z"}];
    S.meetings = [{id:"mt",title:"Standup",lane:"",date:iso(t0),time:"09:30",end:"09:45",recur:normRecur({freq:"daily",weekdays:true}, iso(t0)),skip:[],attendees:["p1","p2"],groups:[],note:""}];
    resetHistory(); UI.todayScope = "team"; setWs("today"); })()`);
  const tt = d.querySelector("#today").textContent;
  ok("T1: Today tab renders with the team scope", !d.querySelector("#ws-today").hidden && /Today ·/.test(tt));
  ok("T2: blocked work, with who it waits on and for how long", /Blocked one/.test(tt) && /waiting on Lee/.test(tt) && /Need creds/.test(tt));
  ok("T3: late split: 'Late' (updated since due) vs 'Stale' (not)", ev(`todayData("team").late.some(x=>x.id==="L1")`) && ev(`todayData("team").stale.some(x=>x.id==="L2")`));
  { const wknd = ev("isWeekend(todayDay())");      // on weekends there are no meetings and nobody is "out" today
    ok("T4: meetings today, decisions due (not decided ones), who's out", (wknd || (/Standup/.test(tt) && /Kim/.test(tt))) && /Pick the vector store/.test(tt) && !/Old call/.test(tt)); }
  ok("T5: the tab shows a count of blocked + late", d.querySelector("#todayBadge").textContent === String(ev(`todayCounts()`)) && ev(`todayCounts()`) >= 3);
  d.querySelector("#tMe").click();
  ok("T6: 'Mine' narrows to my work", ev(`todayScope()`)==="me" && !ev(`todayData().stale.some(x=>x.id==="L2")`) && ev(`todayData().blocked.some(x=>x.id==="B1")`));
  d.querySelector("#tTeam").click();
  const doneBtn = [...d.querySelectorAll("#today .trow")].find(r=>/Stale one/.test(r.textContent)).querySelectorAll(".tacts .btn");
  [...doneBtn].find(b=>b.textContent==="Done").click(); await wait(20);
  ok("T7: Done from Today works and the item leaves the list", ev(`barById("L2").status`)==="done" && !/Stale one/.test([...d.querySelectorAll("#today .tsec")].filter(x=>!/Done this week/.test(x.textContent)).map(x=>x.textContent).join(" ")) && /Stale one/.test(d.querySelector("#today").textContent));
  // --- decisions & risks ---
  ev(`UI.planTab = "decisions"; setWs("plan")`);
  ok("D1: decisions have status, owner, needed-by and 'affects'", d.querySelectorAll("#t-decisions thead th").length >= 5 && /Needed by/.test(d.querySelector("#t-decisions thead").textContent) && /Affects/.test(d.querySelector("#t-decisions thead").textContent));
  ev(`setWs("timeline"); setZoom("weeks"); select("bar","Z")`);
  ok("D2: a high risk tags the initiative and shows in its panel", /⚠ risk/.test(d.querySelector('#gantt [data-key="bar:Z"]').textContent) && /Risks and decisions/.test(d.querySelector("#side").textContent));
  ev(`del("bar","Z")`); ok("D3: deleting the initiative unlinks its risks and decisions", ev(`S.risks[0].item`)==="" && ev(`S.decisions[0].item`)===""); ev("undo()");
  ok("D4: decision/risk fields survive save/load", ev(`(()=>{ const p2 = parseText(serialize(S,"x.json")); return p2.decisions[0].due && p2.decisions[0].owners[0]==="p1" && p2.risks[0].item==="Z"; })()`));
  // --- moving notes ---
  ev(`S.notes = [{id:"n1",text:"Ask Lee",date:dayToIso(nextWork(todayDay(),HS())),lane:"a",author:"p1",created:new Date().toISOString()}]; UI.notes = "all"; render()`);
  ev(`moveNote("n1", nextWork(todayDay()+2, HS()), "b")`); await wait(20);
  ok("N1: a note can move to another day and lane", ev(`S.notes[0].lane`)==="b" && ev(`S.notes[0].date`)===ev(`dayToIso(nextWork(todayDay()+2, HS()))`));
  const nel = d.querySelector('#gantt [data-peek-type="note"]'); nel.focus(); nel.dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true})); await wait(20);
  ok("N2: arrow keys move a note a working day", ev(`S.notes[0].date`) > ev(`dayToIso(nextWork(todayDay()+2, HS()))`));
  // --- sticky notes on items ---
  ev(`setWs("timeline"); setZoom("weeks"); select("bar","Z")`);
  d.querySelector("#sticky-in").value = "Check with legal first"; d.querySelector("#sticky-add").click(); await wait(20);
  ok("SN1: a sticky note can be stuck on an initiative from its panel", ev(`S.notes.some(n=>n.on==="bar:Z" && n.text==="Check with legal first")`));
  ok("SN2: it shows as a badge on the bar, not in the lane", !!d.querySelector('#gantt [data-key="bar:Z"] .nbadge') && ![...d.querySelectorAll("#gantt .note")].some(x=>/legal/.test(x.textContent)));
  ok("SN3: the badge's card lists the notes", /Check with legal first/.test(ev(`peekContent("notes","bar:Z").textContent`)));
  ev(`select("task","t1")`); d.querySelector("#sticky-in").value = "Blocked on schema?"; d.querySelector("#sticky-add").click(); await wait(20);
  ev(`setZoom("days"); render()`);
  ok("SN4: tasks take notes too (badge in Days)", !!d.querySelector('#gantt [data-key="task:t1"] .nbadge'));
  ev(`setZoom("weeks"); UI.notes = "none"; render()`); ok("SN5: 'Hide notes' hides badges too", !d.querySelector("#gantt .nbadge")); ev(`UI.notes = "all"; render()`);
  ev(`(()=>{ const n = S.notes.find(x=>x.on==="bar:Z"); select("note", n.id); })()`); d.querySelector("#f-ndetach").click(); await wait(20);
  ok("SN6: Detach puts it back on the chart by itself", !ev(`S.notes.some(n=>n.on==="bar:Z")`) && [...d.querySelectorAll("#gantt .note")].some(x=>/legal/.test(x.textContent)));
  ev(`(()=>{ const n = S.notes.find(x=>/legal/.test(x.text)); n.on = "bar:Z"; del("bar","Z"); })()`);
  ok("SN7: if the item is deleted its notes fall back onto the chart", ev(`noteOn(S.notes.find(x=>/legal/.test(x.text)))`)==="" ); ev("undo()");
  ok("SN8: attached notes survive save/load", ev(`parseText(serialize(S,"x.json")).notes.some(n=>n.on==="task:t1")`));
  // --- fix dependency conflicts in one click ---
  ev(`S.meta.autoSchedule = false; barById("Z").start = 0; barById("X").span = 3; render()`);
  ok("DF1: the warning offers 'Move them later'", ev(`depProblems(barById("Z")).length`) > 0 && !!d.querySelector("#fixDeps"));
  d.querySelector("#fixDeps").click();
  ok("DF2: one click clears the conflicts (auto-move stays off)", ev(`depProblems(barById("Z")).length`) === 0 && ev("S.meta.autoSchedule") === false && !d.querySelector("#fixDeps"));
  ev("undo(); S.meta.autoSchedule = true; render()");
  // --- "Move them later" at the end of the plan and after waiting blocks ---
  { const keep = ev("JSON.stringify(S)");
    ev(`S = normalize({meta:{start:"2026-09-21",weeks:12,autoSchedule:false},lanes:[{id:"a",name:"A"}],bars:[{id:"p",lane:"a",start:8,span:3,label:"P"},{id:"c",lane:"a",start:9,span:2,label:"C",dependsOn:["p"]},{id:"w1",lane:"a",start:2,span:3,label:"W",kind:"waiting"},{id:"c2",lane:"a",start:3,span:2,label:"C2",dependsOn:["w1"]}]},false); resetHistory(); render(); fixDeps()`);
    ok("DF3: conflicts at the end of the plan clear (the plan grows instead)", ev(`S.bars.filter(b=>depProblems(b).length).length`) === 0 && ev("S.meta.weeks") > 12, ev("S.meta.weeks") + " " + ev(`document.querySelector("#status").textContent`));
    ok("DF4: waiting on a 'waiting' block also clears", ev(`depProblems(barById("c2")).length`) === 0);
    ev(`S = JSON.parse(${JSON.stringify(keep)}); resetHistory(); render()`); }
  // --- quick save to a shared file someone else is editing ---
  const other = ev(`(()=>{ const p = clone(S); p.meta.lock = {by:"Lee", id:"other-session", at:new Date().toISOString()}; return serialize(p, "plan.json"); })()`);
  const hd = makeHandle("plan.json", other); w.__hd = hd;
  ev(`installPlan(parseText(__hd._text), __hd._text, __hd); render()`);
  ok("QS1: someone else holds the lock, so I'm read-only", !ev("editable()") && ev("!file.holdLock"));
  ev(`select("task","t2")`);
  ok("QS2: the quick panel still works when read-only", !d.querySelector("#q-inprogress").disabled && d.querySelector("#f-tlabel").disabled);
  d.querySelector("#q-inprogress").click(); await wait(60);
  const saved = JSON.parse(hd._text);
  ok("QS3: it saves straight to the file", hd.writes===1 && saved.bars.find(b=>b.id==="K").tasks.find(t=>t.id==="t2").status==="inprogress");
  ok("QS4: and leaves the other person's lock alone", saved.meta.lock && saved.meta.lock.id==="other-session");
  ok("QS5: I'm still read-only afterwards", !ev("editable()"));
  // Lee (the lock holder) saves later: my quick update must survive
  const leeBase = other;
  const leeEdit = (()=>{ const p = JSON.parse(leeBase); p.bars.find(b=>b.id==="Z").label = "Current work (renamed)"; return p; })();
  hd._text = hd._text.replace(/"other-session"/g, JSON.stringify(ev("SESSION")));   // the file's lock belongs to the person now saving (Lee)
  ev(`(()=>{ const theirs = parseText(__hd._text); file.baseText = ${JSON.stringify(leeBase)}; S = normalize(${JSON.stringify(leeEdit)}, false); S.meta.lock = {by:"Lee", id:SESSION, at:new Date().toISOString()}; file.holdLock = true; file.dirty = true; })()`);
  await ev("save()"); await wait(30);
  const after = JSON.parse(hd._text);
  ok("M1: the lock holder's save keeps my quick update", after.bars.find(b=>b.id==="K").tasks.find(t=>t.id==="t2").status==="inprogress", after.bars.find(b=>b.id==="K").tasks.find(t=>t.id==="t2").status);
  ok("M2: and their own edit", after.bars.find(b=>b.id==="Z").label==="Current work (renamed)");
  ok("M3: no conflict banner", ![...d.querySelectorAll(".banner")].some(b=>/someone else saved|took over/.test(b.textContent)));
  // --- Codex review fixes ---
  // (a) holder removes a field (unblocks), teammate quick-saves meanwhile: holder's save still works and the removal sticks
  ev(`(()=>{ const t = taskById("t1").t; t.blocked = {reason:"x", waitingOn:"", since:new Date().toISOString()}; })()`);
  const baseA = ev(`(()=>{ const p = clone(S); p.meta.lock = {by:"Lee", id:SESSION, at:new Date().toISOString()}; return serialize(p, "plan.json"); })()`);
  const hdA = makeHandle("plan.json", baseA); w.__hdA = hdA;
  ev(`installPlan(parseText(__hdA._text), __hdA._text, __hdA); render()`);
  ok("CX0: holder has the lock", ev("editable()"));
  ev(`commit(()=>{ delete taskById("t1").t.blocked; })`);
  hdA._text = (()=>{ const p = JSON.parse(hdA._text); p.bars.find(b=>b.id==="K").tasks.find(t=>t.id==="t2").status = "done"; return JSON.stringify(p, null, 2) + "\n"; })();   // teammate's quick save
  await ev("save()"); await wait(30);
  { const f = JSON.parse(hdA._text); const k = f.bars.find(b=>b.id==="K");
    ok("CX1: a removed field survives a merge (unblock kept, teammate's Done kept)", !k.tasks.find(t=>t.id==="t1").blocked && k.tasks.find(t=>t.id==="t2").status === "done"); }
  ok("CX2: merging clears Undo (so it can't erase a teammate's update)", ev("past.length") === 0);
  // (b) both changed the same field: teammate's value wins and it's reported
  ev(`commit(()=>{ taskById("t2").t.status = "inprogress"; })`);
  hdA._text = (()=>{ const p = JSON.parse(hdA._text); p.bars.find(b=>b.id==="K").tasks.find(t=>t.id==="t2").status = "atrisk"; return JSON.stringify(p, null, 2) + "\n"; })();
  await ev("save()"); await wait(30);
  ok("CX3: same field edited by both: the teammate's newer value is kept and I'm told", JSON.parse(hdA._text).bars.find(b=>b.id==="K").tasks.find(t=>t.id==="t2").status === "atrisk" && /Kept a teammate's newer change on 1 item/.test(d.querySelector("#toast").textContent) && !d.querySelector("#toast").hidden, d.querySelector("#toast").textContent);
  // (c) a teammate saves between my read and my write: quick save retries and both changes land
  const baseC = ev(`(()=>{ const p = clone(S); p.meta.lock = {by:"Lee", id:"other-session", at:new Date().toISOString()}; return serialize(p, "plan.json"); })()`);
  const hdC = makeHandle("plan.json", baseC); let reads = 0; const origGet = hdC.getFile;
  hdC.getFile = async function(){ reads++; if (reads === 2){ const p = JSON.parse(hdC._text); p.bars.find(b=>b.id==="Z").label = "Renamed by Lee"; hdC._text = JSON.stringify(p, null, 2) + "\n"; } return origGet.call(hdC); };
  w.__hdC = hdC; ev(`installPlan(parseText(__hdC._text), __hdC._text, __hdC); render()`);
  ev(`quickSave("test", s=>{ taskById("t1").t.status = "done"; })`); await wait(120);
  { const f = JSON.parse(hdC._text);
    ok("CX4: a save that lands mid-quick-save is not overwritten (retry keeps both)", f.bars.find(b=>b.id==="Z").label === "Renamed by Lee" && f.bars.find(b=>b.id==="K").tasks.find(t=>t.id==="t1").status === "done", `${f.bars.find(b=>b.id==="Z").label} / ${f.bars.find(b=>b.id==="K").tasks.find(t=>t.id==="t1").status}`); }
  // (d) lapsed lock with unsaved edits: quick save refuses instead of discarding them
  ev(`file.dirty = true; file.holdLock = false`);
  const r4 = await ev(`quickSave("x", s=>{ taskById("t1").t.status = "notstarted"; })`);
  ok("CX5: with unsaved edits and no lock, quick save refuses (edits kept)", r4 === false && /unsaved edits/.test(d.querySelector("#status").textContent));
  ev(`file.dirty = false`);
  // (e) Find clears a filter that hides the task itself
  ev(`file.handle = null; S.meta.lock = null; UI.filter = normFilter({people:["p2"]}); setZoom("weeks"); render(); goTo("task","t2")`);
  ok("CX6: Find clears a filter that hides the searched task", !ev("fActive()") && ev("sel && sel.id")==="t2");
  // (f) long leave counts in full
  ok("CX7: time off longer than a year still counts", ev(`(()=>{ const pp = {id:"zz", off:[{from:"2026-01-05", to:"2027-06-30"}]}; return personOff(pp).has(isoToDay("2027-06-01")); })()`));
  // --- Codex second pass ---
  const lockedBy = (id) => ev(`(()=>{ const p = clone(S); p.meta.lock = {by:"Lee", id:${JSON.stringify(id)}, at:new Date().toISOString()}; return serialize(p, "plan.json"); })()`);
  // (g) I delete an initiative while a teammate adds a task inside it: the initiative (with their task) is kept
  { ev("file.handle = null; file.dirty = false"); const base = lockedBy(ev("SESSION")); const hd = makeHandle("plan.json", base); w.__hdG = hd;
    ev(`installPlan(parseText(__hdG._text), __hdG._text, __hdG); render()`); ev(`del("bar","Y")`);
    hd._text = (()=>{ const p = JSON.parse(hd._text); p.bars.find(b=>b.id==="Y").tasks.push({id:"tnew",label:"Teammate task",start:p.meta.start,days:1,owners:[],status:"notstarted"}); return JSON.stringify(p,null,2)+"\n"; })();
    await ev("save()"); await wait(40); const f = JSON.parse(hd._text);
    ok("CY1: a delete doesn't erase an item a teammate changed meanwhile", !!f.bars.find(b=>b.id==="Y") && f.bars.find(b=>b.id==="Y").tasks.some(t=>t.id==="tnew") && /Didn't delete 1 item/.test(d.querySelector("#toast").textContent)); }
  // (h) I mark done while a teammate marks at risk: status and its timestamps stay consistent (theirs)
  { const t2 = () => ev(`JSON.stringify(taskById("t1").t)`);
    ev(`commit(()=>{ taskById("t1").t.status = "notstarted"; })`); await ev("save()"); await wait(30);
    const hd = w.__hdG; ev(`commit(()=>{ taskById("t1").t.status = "done"; })`);
    hd._text = (()=>{ const p = JSON.parse(hd._text); const t = p.bars.find(b=>b.id==="K").tasks.find(x=>x.id==="t1"); t.status = "atrisk"; t.startedAt = new Date().toISOString(); return JSON.stringify(p,null,2)+"\n"; })();
    await ev("save()"); await wait(30); const t = JSON.parse(hd._text).bars.find(b=>b.id==="K").tasks.find(x=>x.id==="t1");
    ok("CY2: status conflicts keep status and timestamps together (no at-risk task with a done date)", t.status === "atrisk" && !t.doneAt, JSON.stringify(t)); }
  // (i) a retried quick save doesn't add the same note twice
  { ev("file.handle = null; file.dirty = false; file.holdLock = false"); const base = lockedBy("other-session"); const hd = makeHandle("plan.json", base); let reads = 0; const og = hd.getFile;
    hd.getFile = async function(){ reads++; if (reads === 2){ const p = JSON.parse(hd._text); p.meta.title = "Retitled"; hd._text = JSON.stringify(p,null,2)+"\n"; } return og.call(hd); };
    w.__hdI = hd; ev(`installPlan(parseText(__hdI._text), __hdI._text, __hdI); render()`);
    ev(`quickSave("note", s=>{ s.notes.push({id:newId("note"), text:"Only once please", date:s.meta.start, lane:"a", author:"p1", created:new Date().toISOString(), on:"bar:Z"}); })`); await wait(150);
    const f = JSON.parse(hd._text);
    ok("CY3: a retry re-applies the same change: the note appears once and the teammate's edit is kept", f.notes.filter(n=>n.text==="Only once please").length === 1 && f.meta.title === "Retitled", `${f.notes.filter(n=>n.text==="Only once please").length} / ${f.meta.title}`); }
  // (j) if a same-instant save overwrote my quick update, it gets put back
  { const hd = w.__hdI; ev(`quickSave("update", s=>{ addUpdate(s, "task:t2", "Unique update 42"); })`); await wait(60);
    const had = JSON.parse(hd._text).updates.some(u=>u.text==="Unique update 42");
    hd._text = (()=>{ const p = JSON.parse(hd._text); p.updates = p.updates.filter(u=>u.text!=="Unique update 42"); return JSON.stringify(p,null,2)+"\n"; })();   // a same-instant save overwrote it
    await wait(1700);
    ok("CY4: an overwritten quick update is detected and put back", had && JSON.parse(hd._text).updates.filter(u=>u.text==="Unique update 42").length === 1); }
  // (j2) a teammate deliberately changes it right after my quick save: the repair must NOT undo their decision
  { const hd = w.__hdI; ev(`quickSave("status", s=>{ taskById("t2").t.status = "done"; })`); await wait(60);
    hd._text = (()=>{ const p = JSON.parse(hd._text); const t = p.bars.find(b=>b.id==="K").tasks.find(x=>x.id==="t2"); t.status = "inprogress"; delete t.doneAt; return JSON.stringify(p,null,2)+"\n"; })();
    await wait(1700);
    const t = JSON.parse(hd._text).bars.find(b=>b.id==="K").tasks.find(x=>x.id==="t2");
    ok("CY4b: a teammate's deliberate change right after mine is not reverted by the repair", t.status === "inprogress" && !t.doneAt, JSON.stringify(t)); }
  // (k) a quick action during my own save waits for it instead of discarding my edits
  { const base = lockedBy(ev("SESSION")); const hd = makeHandle("plan.json", base); w.__hdK = hd; ev(`installPlan(parseText(__hdK._text), __hdK._text, __hdK); render()`);
    ev(`commit(()=>{ barById("Z").label = "My unsaved rename"; })`);
    const p1 = ev("save()"); const p2 = ev(`quickSave("x", s=>{ taskById("t2").t.status = "done"; })`); await p1; await p2; await wait(30);
    ok("CY5: a quick action during my own save doesn't discard my edits", ev(`barById("Z").label`) === "My unsaved rename" && JSON.parse(hd._text).bars.find(b=>b.id==="Z").label === "My unsaved rename"); }
  // (l) very long leave: the next working day is still found
  ok("CY6: work after a long leave lands on a real working day", ev(`(()=>{ const hs = new Set(); for (let d = isoToDay("2026-10-05"); d < isoToDay("2027-12-31"); d++) hs.add(d); const n = nextWork(isoToDay("2026-10-05"), hs); return n >= isoToDay("2027-12-31"); })()`));
  // --- shortcuts + help ---
  ev(`file.handle = null; file.holdLock = false; file.dirty = false; S.meta.lock = null; UI.filter = normFilter({}); sel = null; setWs("timeline"); setZoom("weeks"); render()`);
  const key = (k, o={}) => d.dispatchEvent(new w.KeyboardEvent("keydown",{key:k, bubbles:true, ...o}));
  key("?"); ok("K1: ? opens help on the shortcuts page", d.querySelector("#dlgHelp").open && d.querySelector("#helpTitle").textContent === "Keyboard shortcuts" && d.querySelectorAll("#helpBody kbd").length > 20);
  key("1"); ok("K2: shortcuts don't fire while help is open", ev("UI.ws") === "timeline"); d.querySelector("#dlgHelp").close();
  [...d.querySelectorAll("#helpNav button")].forEach(b=>{}); 
  ok("K3: every help topic renders", ev(`HELP.every(t=>{ const n = t[2](); return Array.isArray(n) && n.length > 0; })`));
  key("1"); ok("K4: 1 opens Today", ev("UI.ws") === "today");
  key("2"); ok("K5: 2 back to Timeline", ev("UI.ws") === "timeline");
  key("j"); const first = ev("sel && sel.type + ':' + sel.id"); key("j"); const second = ev("sel && sel.type + ':' + sel.id");
  ok("K6: J steps through items", !!first && !!second && first !== second, first + " → " + second);
  key("k"); ok("K7: K steps back", ev("sel && sel.type + ':' + sel.id") === first);
  ev(`setMe("p1"); commit(s=>{ s.bars.push({id:"LEAF",lane:"a",start:3,span:1,label:"Leaf item",kind:"work",owners:["p1"],jira:"",status:"notstarted",dependsOn:[],tasks:[],datesFrom:"manual"}); }); select("bar","LEAF")`); key("x"); await wait(30);
  ok("K8: X marks the selected item done", ev(`barById("LEAF").status`) === "done");
  key("x"); await wait(30); ok("K9: X again puts it back in progress", ev(`barById("LEAF").status`) === "inprogress");
  key("u"); ok("K10: U jumps to the update box", d.activeElement?.id === "q-upd");
  d.activeElement.blur(); key("b"); ok("K11: B opens the blocked form", d.querySelector("#side .qblock")?.open && d.activeElement?.id === "q-breason");
  d.activeElement.blur(); key("s"); ok("K12: S jumps to the sticky note box", d.activeElement?.id === "sticky-in");
  d.activeElement.blur(); const z0 = ev("UI.zoom"); key("."); await wait(10); ok("K13: . goes to today and keeps the zoom (Weeks stays Weeks)", ev("UI.zoom") === z0 && ev("UI.ws") === "timeline");
  key("w"); key("t"); ok("K14: T opens Today", ev("UI.ws") === "today"); key("2");
  ev(`sel = null; openAddMenu(document.querySelector("#addBtn").getBoundingClientRect(), {day: isoToDay("2026-10-10")})`);
  ok("AM1: the Add menu says plainly where a new item goes, using the weekday it will really get", /^New item: Fri Oct 9 in /.test(d.querySelector("#addMenu .mh").textContent) && /click a workstream or item first/.test(d.querySelector("#addMenu").textContent), d.querySelector("#addMenu .mh").textContent);
  ev("closeAddMenu(false)");
  ev(`UI.planTab = "risks"; setWs("plan"); openAddMenu(document.querySelector("#addBtn").getBoundingClientRect(), {})`);
  { const btns = [...d.querySelectorAll("#addMenu button")].map(b=>b.textContent);
    ok("AM2: on Plan → Risks, the Add menu leads with Risk", /^Add to Risks/.test(d.querySelector("#addMenu .mh").textContent) && /^Risk/.test(btns[0]) && /On the timeline:/.test(d.querySelector("#addMenu").textContent), btns.join("|")); }
  const nr0 = ev("S.risks.length"); d.querySelector("#addMenu").dispatchEvent(new w.KeyboardEvent("keydown",{key:"r",bubbles:true}));
  ok("AM3: R adds a risk there", ev("S.risks.length") === nr0 + 1); ev("undo()");
  ev(`setWs("people"); openAddMenu(document.querySelector("#addBtn").getBoundingClientRect(), {})`);
  ok("AM4: on People, Time off and Person come first", /^Time off/.test(d.querySelector("#addMenu button").textContent) && /Add to People/.test(d.querySelector("#addMenu .mh").textContent));
  ev(`closeAddMenu(false); UI.planTab = "team"; setWs("plan"); openAddMenu(document.querySelector("#addBtn").getBoundingClientRect(), {})`);
  ok("AM5: on Plan → Team: Person and Group", /^Person/.test(d.querySelectorAll("#addMenu button")[0].textContent) && /^Group/.test(d.querySelectorAll("#addMenu button")[1].textContent));
  ev(`closeAddMenu(false); setWs("timeline")`);
  ok("no runtime errors", w.errs.length===0, w.errs.join(" | "));
  console.log(R.join("\n")); const f=R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
