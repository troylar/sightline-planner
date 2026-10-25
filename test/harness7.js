// Process blocks: types, sprint rules, per-sprint changes, dependencies, delayed/canceled, Scrum pack, meeting sprint rules + moves.
const {JSDOM} = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",beforeParse(w){
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.indexedDB=undefined; w.confirm=()=>true; w.alert=()=>{}; w.prompt=()=>""; w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{};
  w.Element.prototype.scrollIntoView=function(){}; w.CSS=w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
const w=dom.window,d=w.document,ev=s=>w.eval(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 40000);
(async()=>{
  await wait(150); ev("askWhoOnStart = ()=>{}");
  ev(`S = normalize({meta:{title:"P",start:"2026-10-05",weeks:6,sprintWeeks:2}, lanes:[{id:"a",name:"Core"}], people:[{id:"p1",name:"Pat"},{id:"p2",name:"Lee"}],
    sprints:[{id:"s1",name:"S1",weeks:2},{id:"s2",name:"S2",weeks:2},{id:"s3",name:"S3",weeks:2}], holidays:[{date:"2026-10-12",name:"Columbus Day"}],
    bars:[{id:"X",lane:"a",start:0,span:1.4,label:"Build"},{id:"Y",lane:"a",start:2,span:1,label:"Launch prep"}],
    types:[{id:"cf",name:"Code freeze",icon:"freeze",shape:"window",days:3,rule:{anchor:"end",n:3}},{id:"rl",name:"Release",icon:"release",shape:"moment",rule:{anchor:"start",n:2}},{id:"demo",name:"Demo day",emoji:"🎬",shape:"moment"}]}, false);
    resetHistory(); setMe("p1"); UI.filter = normFilter({}); setWs("timeline"); setZoom("weeks"); render()`);
  const insts = () => ev(`JSON.stringify(blockInstances().map(i=>[i.id, dayToIso(i.s), dayToIso(i.e)]))`);
  ok("P1: a sprint rule makes one per sprint (3 sprints × 2 rule types)", ev("blockInstances().length") === 6, insts());
  ok("P2: code freeze = last 3 working days of the sprint", ev(`JSON.stringify([dayToIso(instById("cf@s1").s), dayToIso(instById("cf@s1").e)])`) === JSON.stringify(["2026-10-14","2026-10-16"]));
  ok("P3: release = day 2 of the sprint, holidays skipped (S1 day 2 is Tue Oct 6; S2 starts Oct 19)", ev(`dayToIso(instById("rl@s1").s)`) === "2026-10-06" && ev(`dayToIso(instById("rl@s2").s)`) === "2026-10-20");
  ok("P4: Weeks shows a Process row with the blocks", !!d.querySelector("#gantt .lane.blkrow") && d.querySelectorAll('#gantt .blk').length === 6);
  // per-sprint change: push this sprint's release a day
  ev(`select("block","rl@s2")`); w.prompt = ()=>"Crisis: prod incident"; d.querySelector("#f-blater").click(); w.prompt = ()=>"";
  ok("V1: 'A day later' moves just this sprint's release", ev(`dayToIso(instById(sel.id).s)`) === "2026-10-21" && ev(`dayToIso(instById("rl@s3").s)`) === "2026-11-03", insts());
  ok("V2: it becomes an override (other sprints untouched) and the reason goes in updates", ev(`S.blocks.length`) === 1 && ev(`S.blocks[0].sprint`) === "s2" && /prod incident/.test(ev(`updatesFor("block:" + S.blocks[0].id)[0].text`)));
  ok("V3: the panel says it changed for this sprint and offers to put it back", /Changed for this sprint/.test(d.querySelector("#side").textContent) && !!d.querySelector("#f-breset"));
  d.querySelector("#f-breset").click();
  ok("V4: 'Put it back to the rule' removes the override", ev("S.blocks.length") === 0 && ev(`dayToIso(instById("rl@s2").s)`) === "2026-10-20");
  ev(`select("block","cf@s3")`); d.querySelector("#f-bskip").click();
  ok("V5: skip just this sprint's code freeze", ev(`!!S.blocks.find(b=>b.type==="cf" && b.sprint==="s3")?.skip`) && !ev(`liveBlocks().some(i=>i.type.id==="cf" && i.sprint.id==="s3")`));
  ev("undo()");
  // dependencies: initiative waits for code freeze; release comes after it
  ev(`commit(()=>{ const bl = materialize("rl@s2"); bl.after = [materialize("cf@s1").id]; barById("Y").waitsFor = [materialize("cf@s1").id]; })`);
  ok("L1: an initiative that waits for a block starts after it ends", ev(`nextWork(wkDay(barById("Y").start), new Set())`) >= ev(`instById(S.blocks.find(b=>b.type==="cf"&&b.sprint==="s1").id).e + 1`));
  ev(`commit(()=>{ const f = S.blocks.find(b=>b.type==="cf"&&b.sprint==="s1"); f.days = 6; })`);
  ok("L2: making the freeze longer pushes what comes after it (release, initiative)", ev(`instById(S.blocks.find(b=>b.type==="rl"&&b.sprint==="s2").id).s`) > ev(`instById(S.blocks.find(b=>b.type==="cf"&&b.sprint==="s1").id).e`), insts());
  // canceled
  const cfId = ev(`S.blocks.find(b=>b.type==="cf"&&b.sprint==="s1").id`);
  ev(`select("block", ${JSON.stringify(cfId)})`); w.prompt = ()=>"Release train paused"; const st = d.querySelector("#f-bstatus"); st.value = "canceled"; st.dispatchEvent(new w.Event("change")); w.prompt = ()=>"";
  ok("C1: cancelling asks why, logs it, and grays it out", ev(`instById(${JSON.stringify(cfId)}).status`) === "canceled" && /Release train paused/.test(ev(`updatesFor("block:${cfId}")[0].text`)) && !!d.querySelector(`#gantt .blk.bs-canceled`));
  ok("C2: what waited for it is flagged", /wait(s)? for something canceled/.test(d.querySelector("#banners").textContent));
  ev("undo()");
  ev(`select("block", ${JSON.stringify(cfId)})`); w.prompt = ()=>"Vendor late, now Thursday"; const st2 = d.querySelector("#f-bstatus"); st2.value = "delayed"; st2.dispatchEvent(new w.Event("change")); w.prompt = ()=>"";
  ok("C3: delayed asks for the reason and the new plan", ev(`instById(${JSON.stringify(cfId)}).status`) === "delayed" && /Vendor late/.test(ev(`updatesFor("block:${cfId}")[0].text`)));
  // one-off block from + Add, with emoji type
  ev(`createAt("block:demo", null, isoToDay("2026-10-22"))`);
  ok("O1: a one-off block (emoji type) from + Add", ev(`S.blocks.some(b=>b.type==="demo" && b.date==="2026-10-22")`) && ev(`sel.type`) === "block" && d.querySelector("#side .sidehead .ic.emo")?.textContent === "🎬");
  ok("O2: the Add menu lists your types with their icons", (()=>{ ev(`sel=null; openAddMenu(document.querySelector("#addBtn").getBoundingClientRect(), {})`); const t = d.querySelector("#addMenu").textContent; ev("closeAddMenu(false)"); return /Code freeze/.test(t) && /Release/.test(t) && /Demo day/.test(t); })());
  // Days view + today + find + hover
  ev(`UI.dayZoom = 12; setZoom("days"); render()`); ok("D1: Days view shows the Process row too", !!d.querySelector("#gantt .lane.blkrow .blk"));
  ev(`setZoom("weeks")`);
  ok("F1: Find finds blocks and types", ev(`findIndex().some(x=>x.kind==="block" && /Release/.test(x.text))`) && ev(`findIndex().some(x=>x.kind==="type" && x.text==="Code freeze")`));
  ok("H1: hover card explains a rule block", /last working day|day 2 of every sprint/.test(ev(`peekContent("block","rl@s3").textContent`)));
  // filters
  ev(`UI.filter = normFilter({kinds:["work"]}); render()`); ok("FL1: a Work-only filter hides process blocks", !d.querySelector("#gantt .blk")); ev(`UI.filter = normFilter({}); render()`);
  // type editor
  ev(`select("type","cf")`); ok("TY1: type editor: icon grid, sprint rule, preview", d.querySelectorAll("#side .icb").length === ev("ICON_LIST.length") && /3rd-last working day of every sprint/.test(d.querySelector("#side").textContent));
  ev(`UI.planTab = "types"; setWs("plan")`); ok("TY2: Plan → Process lists the types", d.querySelectorAll("#t-types tbody tr").length === 3);
  ev(`select("type","rl")`); ok("TY3: the details panel shows on the Plan tab (not hidden inside Timeline)", d.querySelector("#side").parentElement === d.body && d.querySelector("#side").classList.contains("floating") && !d.querySelector("#side").closest("[hidden]") && !!d.querySelector("#f-tyname"));
  ev(`setWs("timeline")`); ok("TY4: and goes back beside the chart on Timeline", d.querySelector("#side").parentElement.classList.contains("layout"));
  // Scrum pack
  ev(`setWs("timeline")`); ev(`addScrumPack()`);
  ok("SP1: Scrum pack adds planning / standup / review / retro (types already there aren't duplicated)", ev(`S.meetings.map(m=>m.title).sort().join()`) === "Daily standup,Retrospective,Sprint planning,Sprint review" && ev(`S.types.filter(t=>t.name==="Code freeze").length`) === 1);
  ok("EV1: pack meetings invite the automatic Everyone group", ev(`S.meetings.every(m=>m.groups.includes("everyone") && attendeesOf(m).length === 2)`));
  ev(`commit(s=>{ s.people.push({id:"p9",name:"New hire",color:"#888888",initials:"NH",off:[]}); })`);
  ok("EV2: Everyone stays current: a new teammate is in every pack meeting", ev(`S.meetings.every(m=>attendeesOf(m).includes("p9"))`)); ev("undo()");
  ok("EV3: Everyone survives save/load", ev(`parseText(serialize(S,"x.json")).meetings[0].groups.includes("everyone")`));
  ok("SP2: retro is on the last day of each sprint", ev(`JSON.stringify(occurrences(S.meetings.find(m=>m.title==="Retrospective"), isoToDay("2026-10-05"), isoToDay("2026-11-13")).map(dayToIso))`) === JSON.stringify(["2026-10-16","2026-10-30","2026-11-13"]));
  // move just this retro
  const retro = ev(`S.meetings.find(m=>m.title==="Retrospective").id`);
  ev(`openMeeting(${JSON.stringify(retro)}, isoToDay("2026-10-30"))`);
  d.querySelector("#f-mmove").value = "2026-10-29"; d.querySelector("#f-mmovet").value = "11:00"; d.querySelector("#f-mmovego").click();
  { const occ = ev(`JSON.stringify(occurrences(meetingById(${JSON.stringify(retro)}), isoToDay("2026-10-05"), isoToDay("2026-11-13")).map(dayToIso))`);
    ok("MM1: 'Move just this one' moves one retro (others stay)", occ === JSON.stringify(["2026-10-16","2026-10-29","2026-11-13"]), occ);
    ok("MM2: and at its own time", ev(`occTime(meetingById(${JSON.stringify(retro)}), isoToDay("2026-10-29")).time`) === "11:00" && ev(`occTime(meetingById(${JSON.stringify(retro)}), isoToDay("2026-11-13")).time`) === "14:30"); }
  ev(`UI.planTab = "types"; setWs("plan")`);
  ok("SG1: Manage → Timeboxes has sprints, ceremonies and process blocks together", [...d.querySelectorAll('#ws-plan [data-plan="types"]')].filter(x=>!x.hidden).length === 3 && d.querySelectorAll("#t-ceremonies tbody tr").length === 3 && d.querySelectorAll("#t-types tbody tr").length === 3 && /Timeboxes/.test(d.querySelector("#set-types").textContent));
  ok("SG2: the moved retro shows as a changed date", [...d.querySelectorAll("#t-ceremonies tbody tr")].some(r=>/Retrospective/.test(r.textContent) && /\b1\b/.test(r.textContent)));
  ev(`setWs("timeline")`);
  ok("MM3: sprint rule text for meetings", /last day of every sprint/.test(ev(`recurText(meetingById(${JSON.stringify(retro)}))`)));
  ok("S1: types, blocks and meeting moves survive save/load", ev(`(()=>{ const p = parseText(serialize(S,"x.json")); return p.types.length === 3 && p.blocks.length >= 2 && p.meetings.find(m=>m.id===${JSON.stringify(retro)}).moves.length === 1; })()`));
  ok("S2: deleting a type removes its blocks and links", (()=>{ ev(`del("type","cf")`); const r = !ev(`S.blocks.some(b=>b.type==="cf")`) && !ev(`barById("Y").waitsFor.some(x=>/^cf|blk/.test(x) && !instById(x))`); ev("undo()"); return r; })());
  // --- folding ---
  ev(`UI.fold = {}; setWs("timeline"); setZoom("weeks"); render()`);
  ok("FO1: Weeks has section headers with fold buttons", !!d.querySelector('#gantt .sechdr [data-fold="sec:process"]') && !!d.querySelector('#gantt .sechdr [data-fold="sec:meetings"]'));
  d.querySelector('#gantt [data-fold="sec:process"]').click();
  ok("FO2: folding Process hides its row (Weeks)", !d.querySelector("#gantt .lane.blkrow") && ev(`folded("sec:process")`));
  ev(`UI.dayZoom = 12; setZoom("days")`); ok("FO3: and it stays folded in Days", !d.querySelector("#gantt .lane.blkrow") && !!d.querySelector('#gantt .sechdr.folded'));
  ev(`toggleFold("sec:process"); toggleFold("lane:a")`);
  ok("FO4: folding a lane in Days hides its rows but keeps its header", !d.querySelector('#gantt [data-orow="X"]') && !!d.querySelector('#gantt [data-ohdr="a"].folded'));
  ev(`setZoom("weeks")`); ok("FO5: a folded lane in Weeks is one slim row", !!d.querySelector('#gantt .lane.folded .track.mini .minibar') && !d.querySelector('#gantt [data-key="bar:X"]'));
  ev(`toggleFold("lane:a")`);
  // --- undo an accidental add ---
  ev(`setWs("timeline"); setZoom("weeks"); sel = null; render()`);
  const nb0 = ev("S.bars.length"); ev(`createAt("initiative", "a", isoToDay("2026-10-14"))`); await wait(10);
  ok("UA1: a new initiative is added and its name box has the focus", ev("S.bars.length") === nb0 + 1 && d.activeElement && d.activeElement.id === "f-label", d.activeElement && (d.activeElement.id || d.activeElement.tagName));
  d.activeElement.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ok("UA2: Esc right away removes it (even from the name box)", ev("S.bars.length") === nb0 && /Removed the new initiative/.test(d.querySelector("#status").textContent));
  ev(`createAt("milestone", "a", isoToDay("2026-10-14"))`); const nm0 = ev("S.milestones.length");
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"z",ctrlKey:true,bubbles:true}));
  ok("UA3: Ctrl+Z right away removes it", ev("S.milestones.length") === nm0 - 1);
  ev(`createAt("initiative", "a", isoToDay("2026-10-14"))`); ev(`commit(()=>{ barById(sel.id).label = "Kept"; }, {coalesce:"f-label"})`);
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ok("UA4: once you've typed, Esc no longer deletes it", ev(`S.bars.some(b=>b.label === "Kept")`));
  ok("no runtime errors", w.errs.length===0, w.errs.join(" | "));
  console.log(R.join("\n")); const f=R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
