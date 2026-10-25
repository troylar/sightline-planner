// List (docs/workspaces.md): the plan's work as rows. Layouts and their order (ties included), what each item waits on,
// filters and hidden counts against Timeline's, selection between Timeline and List, the URL, the keyboard, Copy as
// table and its fallback, an unchanged plan file, and a 100-item profile. Synthetic plan: fixtures/list-plan.js.
const {JSDOM} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), listPlan = require("./fixtures/list-plan.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 50000).unref();
const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", beforeParse(w){
  const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00Z").getTime();
  w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
  w.HTMLCanvasElement.prototype.getContext = ()=>({measureText:t=>({width:String(t).length * 7})});
  w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
const w = dom.window, d = w.document, ev = s=>w.eval(s), wait = ms=>new Promise(r=>setTimeout(r, ms)), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
(async()=>{
  try {
    await wait(150); ev("askWhoOnStart = ()=>{}; reschedule = ()=>({moved:0})");
    ev(`loadExternal(${JSON.stringify(sample)}, "sample")`); await wait(40); ev(listPlan); ev("listPlan(30)");
    const before = ev("JSON.stringify(planOfRecord(S))");
    const bar = i => J(`{id:S.bars[${i}].id, label:chartLabel(S.bars[${i}])}`), rows = () => [...d.querySelectorAll("#listTable tr[data-lk]")], lks = () => rows().map(r=>r.dataset.lk);
    let lrCalls = 0; w.__countList = () => lrCalls++; ev("const __rl = renderList; renderList = function(){ __countList(); return __rl.apply(this, arguments); }");
    ev("goWs('timeline')"); const c0 = lrCalls; ev("render()");
    ok("L0 List isn't drawn while another page is showing", lrCalls === c0);
    d.querySelector("#tab-list").click(); await wait(20);
    ok("L1 List is a tab under Delivery, next to Timeline", ev("UI.ws") === "list" && !d.querySelector("#ws-list").hidden && d.querySelector("#tab-list").previousElementSibling.id === "tab-timeline" && ev("workspaceGroup('list')") === "delivery");
    const head = rows().find(r=>r.dataset.lk === "list:bar:" + bar(0).id);
    ok("L2 an initiative with tasks is a group header with its own dates, owner and task count", head && head.classList.contains("lhead") && head.querySelector("th[scope=row]") && /3 items/.test(head.textContent) && head.cells[0].textContent !== "", head && head.textContent);
    const under = lks().slice(lks().indexOf("list:bar:" + bar(0).id) + 1, lks().indexOf("list:bar:" + bar(0).id) + 4);
    ok("L2 …and its tasks follow it, in start order", under.join() === ["list:task:t-0-1", "list:task:t-0-2", "list:task:t-0-0"].join(), under.join());
    ok("L3 a leaf initiative with no tasks is a row", rows().some(r=>r.dataset.lk === "list:bar:" + bar(15).id && !r.classList.contains("lhead")));
    const nest = rows().find(r=>r.dataset.lk === "list:bar:" + bar(11).id), top = rows().find(r=>r.dataset.lk === "list:bar:" + bar(10).id);
    ok("L3 nesting is kept: a sub-initiative sits under its parent, indented", nest && top && top.classList.contains("lhead") && parseInt(nest.querySelector(".lname").style.paddingLeft) > parseInt(top.querySelector(".lname").style.paddingLeft) && lks().indexOf(nest.dataset.lk) > lks().indexOf(top.dataset.lk));
    ok("L4 a Jira item placed as a task appears once", lks().filter(k=>/ABC-101|t-0-0/.test(k)).length === 1 && !lks().includes("list:story:ABC-101"));
    ok("L4 …and a story derived from an epic is a row under its initiative", lks().includes("list:story:ABC-102") && lks().indexOf("list:story:ABC-102") > lks().indexOf("list:bar:" + bar(14).id));
    ok("L5 what Timeline doesn't draw is in a collapsed group at the end, with a count", /Not on the timeline \(4\)/.test(d.querySelector("#listOffToggle").textContent) && !rows().some(r=>r.classList.contains("loff")));
    d.querySelector("#listOffToggle").click();
    const why = k => (rows().find(r=>r.dataset.lk === k) || {querySelector:()=>null}).querySelector(".lwhy")?.textContent;
    ok("L5 …each with the reason: parked, switched off, abandoned, undated", why("list:bar:" + bar(13).id) === "parked" && why("list:story:ABC-103") === "switched off here" && why("list:story:ABC-104") === "abandoned in Jira" && why("list:story:ABC-105") === "no sprint dates",
      [why("list:bar:" + bar(13).id), why("list:story:ABC-103"), why("list:story:ABC-104"), why("list:story:ABC-105")].join());
    const cell = (k, i) => (rows().find(r=>r.dataset.lk === k) || {cells:[]}).cells[i]?.textContent || "";
    ok("L6 Owner: plan owners, Unassigned when none, and people outside the team or inactive are marked", cell("list:task:t-0-1", 3) === "Avery, Blake" && cell("list:task:t-1-1", 3) === "Unassigned" && cell("list:task:t-4-0", 3) === "Riley (outside the team)" && cell("list:task:t-4-1", 3) === "Quinn (inactive)", [cell("list:task:t-0-1", 3), cell("list:task:t-1-1", 3), cell("list:task:t-4-0", 3)].join(" | "));
    ok("L6 …a Jira item shows its Jira assignee and, apart, the plan lead", /^Jira: Avery/.test(cell("list:task:t-0-0", 3)) && /Lead:/.test(cell("list:task:t-0-0", 3)) && cell("list:story:ABC-102", 3) === "Jira: Unassigned", cell("list:task:t-0-0", 3));
    ok("L7 Status: the effective status, and for Jira items Jira's own status and freshness", cell("list:task:t-0-1", 5) === "Not started" && /^In progressJira: In Progress, synced /.test(cell("list:task:t-0-0", 5)), cell("list:task:t-0-0", 5));
    const waits = k => [...(rows().find(r=>r.dataset.lk === k) || d.createElement("tr")).querySelectorAll(".lwaits li")].map(x=>x.textContent);
    ok("L8 Waits on: a task's link to the task before it", waits("list:task:t-0-2").join() === "after " + ev("taskTitle(taskById('t-0-1').t)"), waits("list:task:t-0-2").join());
    ok("L8 …the initiative's own waits on its header: another initiative, a gate and a process step", waits("list:bar:" + bar(3).id).includes("after " + bar(1).label) && waits("list:bar:" + bar(4).id).includes(`gate: ${ev("S.gates[0].gate")}`) && waits("list:bar:" + bar(4).id).includes("process: Security review"), waits("list:bar:" + bar(4).id).join(" | "));
    const ext = rows().find(r=>r.dataset.lk === "list:task:t-3-0").querySelector(".lwaits a");
    ok("L8 …an external Jira prerequisite links to Jira, and warns when it ends after the item starts", ext && ext.href === "https://jira.example.com/browse/XYZ-9" && ext.target === "_blank" && /ends Nov 13, after this starts/.test(ext.textContent), ext && ext.textContent);
    rows().find(r=>r.dataset.lk === "list:task:t-2-0").querySelector(".lwaits button").click(); await wait(10);
    ok("L8 a name in Waits on selects that item, and stays on List", ev("sel && sel.type + ':' + sel.id") === "task:t-0-2" && ev("UI.ws") === "list" && d.querySelector("#side").childElementCount > 0);
    // Filters: the same filter hides the same work on Timeline (Days draws every task and story) and List.
    const avery = ev("S.people.find(p=>p.name === 'Avery').id");
    ev(`UI.filter = normFilter({people:['${avery}']}); saveUI(); render()`);
    const listShown = new Set(lks().filter(k=>!rows().find(r=>r.dataset.lk === k).classList.contains("lhead") && !rows().find(r=>r.dataset.lk === k).classList.contains("loff")).map(k=>k.replace(/^list:/, "")));
    ok("F1 a filter narrows the list, and the summary counts what it hides", listShown.size > 0 && /hidden by filters/.test(d.querySelector("#listSummary").textContent), d.querySelector("#listSummary").textContent);
    ok("F1 …a prerequisite hidden by the filter still shows by name and opens", (()=>{ const r = rows().find(x=>x.dataset.lk === "list:task:t-0-1"); return !!r && waits("list:task:t-0-1").join() === "after " + ev("taskTitle(taskById('t-0-0').t)"); })() || waits("list:task:t-0-2").length === 1, waits("list:task:t-0-1").join());
    ev("goWs('timeline'); setZoom('days'); render()"); await wait(20);
    const tlTasks = new Set([...d.querySelectorAll('#gantt [data-key^="task:"], #gantt [data-key^="story:"]')].map(x=>x.dataset.key));
    const lsTasks = new Set([...listShown].filter(k=>/^(task|story):/.test(k)));
    ok("F2 the same filter shows the same tasks and stories on Timeline and List", tlTasks.size === lsTasks.size && [...lsTasks].every(k=>tlTasks.has(k)), `timeline ${[...tlTasks].sort().join(",")} / list ${[...lsTasks].sort().join(",")}`);
    ev("setZoom('weeks'); UI.filter = normFilter({}); saveUI(); goWs('list')"); await wait(10);
    // Saved views on List: filters and layers apply, and it stays on List with the selection.
    ev(`select('task', 't-1-0'); PV_SAVE = null`); ev(`(()=>{ const v = {id:'v-l', name:'Avery only', def:normViewDef({...currentDef(), ws:'timeline', filter:normFilter({people:['${avery}']})})}; applyView('personal', v); })()`); await wait(10);
    ok("F3 applying a saved view on List applies its filters and stays on List, keeping the selection", ev("UI.ws") === "list" && ev("UI.filter.people.join()") === avery && ev("sel && sel.id") === "t-1-0");
    ok("F3 …and a selected item the filter hides says so, without clearing the filter", !!d.querySelector("#listSelHidden") && ev("UI.filter.people.length") === 1);
    ev("UI.filter = normFilter({}); UI.view = null; saveUI(); render()");
    // Layouts.
    ev("setListLayout('start')"); await wait(10);
    const flat = J(`listGroups(listModel(), 'start')[0].rows.map(r=>[r.s, r.ord])`);
    ok("Y1 Everything by start date is one flat list in start order, ties in initiative and plan order", flat.length > 30 && flat.every((x, i)=>!i || flat[i - 1][0] < x[0] || flat[i - 1][0] === x[0] && flat[i - 1][1] < x[1]) && !d.querySelector("#listTable tr.lgroup:not(.loffg tr)") , flat.slice(0, 4).join(" | "));
    ok("Y1 …and each task row says which initiative it's in", rows().filter(r=>/list:(task|story):/.test(r.dataset.lk) && !r.classList.contains("loff")).every(r=>/^in /.test(r.querySelector(".lin")?.textContent || "")));
    ev("setListLayout('person')"); await wait(10);
    const groups = J(`listGroups(listModel(), 'person').map(g=>({label:g.label, ids:g.rows.map(r=>r.type + ':' + r.id + (r.shared ? '*' : ''))}))`);
    const inA = groups.find(g=>g.label === "Avery"), inB = groups.find(g=>g.label === "Blake");
    ok("Y2 By person: a task with two owners is under each, marked shared", inA && inB && inA.ids.includes("task:t-0-1*") && inB.ids.includes("task:t-0-1*") && /shared/.test(rows().find(r=>r.dataset.lk === "list:task:t-0-1").textContent));
    ok("Y2 …each person's work is in start order, and Unassigned comes last", groups.at(-1).label === "Unassigned" && groups.every(g=>J(`listGroups(listModel(), 'person').find(x=>x.label === ${JSON.stringify(g.label)}).rows.map(r=>r.s)`).every((s, i, a)=>!i || a[i - 1] <= s)));
    ok("Y2 …and counts count unique items, not repeated rows", /^\d+ items/.test(d.querySelector("#listSummary").textContent) && +d.querySelector("#listSummary").textContent.split(" ")[0] === J("listModel().rows.filter(r=>!r.header).length"));
    ok("Y3 the layout is stored per plan in this browser, not in views or the plan", JSON.parse(w.localStorage.getItem("sightline-list-layout"))[ev("S.meta.planId")] === "person" && !/person/.test(JSON.stringify(ev("JSON.stringify(currentDef())"))) && ev("JSON.stringify(planOfRecord(S))") === before);
    // URL, Back and Forward.
    ev("render()"); await wait(10);
    ok("U1 List, its layout and the selection are in the URL", /ws=list/.test(w.location.hash) && /ll=person/.test(w.location.hash) && /sel=task%3At-1-0|sel=task:t-1-0/.test(w.location.hash), w.location.hash);
    ev("setListLayout('initiative')"); await wait(10); ev("goWs('timeline')"); await wait(10);
    ok("U2 the selection carries from List to Timeline", ev("UI.ws") === "timeline" && ev("sel && sel.id") === "t-1-0");
    ev("goWs('list')"); await wait(10);
    ok("U2 …and back", ev("sel && sel.id") === "t-1-0" && rows().find(r=>r.dataset.lk === "list:task:t-1-0").classList.contains("lsel"));
    ev(`applyNav({ws:'list', plan:S.meta.planId, ll:'nonsense', sel:'task:t-2-1'})`); await wait(10);
    ok("U3 a link with a layout this page doesn't know falls back to the default", ev("listLayout()") === "initiative" && ev("sel && sel.id") === "t-2-1");
    ev(`applyNav({ws:'list', plan:'p-someone-else', sel:'task:t-0-1'})`); await wait(10);
    ok("U4 a link from another plan says so instead of selecting", ev("sel && sel.id") === "t-2-1" && /another plan/.test(d.querySelector("#status")?.textContent || ev("lastStatus || ''")), d.querySelector("#status")?.textContent);
    ev(`applyNav({ws:'list', plan:S.meta.planId, ll:'start'})`); await wait(10); ev(`history.pushState(null, '', '#' + encodeNav({ws:'list', plan:S.meta.planId, ll:'person'})); applyNav(parseNav(location.hash))`); await wait(10);
    w.history.back(); await wait(60);
    ok("U5 Back returns to the earlier layout", ev("listLayout()") === "start", ev("listLayout()") + " " + w.location.hash);
    w.history.forward(); await wait(60);
    ok("U5 …and Forward to the later one", ev("listLayout()") === "person", ev("listLayout()"));
    ev("setListLayout('initiative'); sel = null; render()"); await wait(10);
    // Keyboard.
    const r0 = rows()[0]; r0.focus();
    r0.dispatchEvent(new w.KeyboardEvent("keydown", {key:"ArrowDown", bubbles:true}));
    ok("K1 Down moves to the next row", d.activeElement === rows()[1]);
    d.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", {key:"ArrowUp", bubbles:true}));
    ok("K1 …and Up back", d.activeElement === rows()[0]);
    const target = rows()[2].dataset.lk; rows()[2].focus(); d.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true})); await wait(10);
    ok("K2 Enter opens its details without leaving List", ev("UI.ws") === "list" && !!ev("sel") && d.querySelector("#side").childElementCount > 0 && "list:" + ev("sel.type + ':' + sel.id") === target);
    const inp = d.querySelector("#side input, #side textarea, #side select");
    if (inp){ inp.focus(); inp.dispatchEvent(new w.KeyboardEvent("keydown", {key:"ArrowDown", bubbles:true})); }
    ok("K3 arrows in a panel input stay in the input", !inp || d.activeElement === inp);
    if (d.activeElement && d.activeElement.blur) d.activeElement.blur(); d.body.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Escape", bubbles:true})); await wait(20);
    ok("K4 Escape closes the details and puts focus back on the row", !ev("sel") && d.activeElement && d.activeElement.dataset.lk === target, d.activeElement && d.activeElement.dataset ? d.activeElement.dataset.lk : String(d.activeElement));
    // Hover card on rows.
    const pr = rows().find(r=>r.dataset.lk === "list:task:t-0-1"); pr.focus(); pr.dispatchEvent(new w.FocusEvent("focusin", {bubbles:true})); await wait(10);
    ok("P1 focusing a row shows the hover card, built for that item", !d.querySelector("#peek").hidden && /Avery/.test(d.querySelector("#peek").textContent), d.querySelector("#peek").textContent.slice(0, 80));
    ev("closePeek()");
    // Copy as table.
    const md = ev("listMarkdown(listGroups(listModel(), 'initiative'), 'initiative')");
    const lines = md.trim().split("\n");
    ok("C1 Copy as table makes a markdown table with the six columns", lines[0] === "| Start | End | Item | Owner | Waits on | Status |" && lines[1] === "| --- | --- | --- | --- | --- | --- |" && lines.length > 30);
    ok("C1 …pipes are escaped and line breaks inside a cell are flattened", md.includes("Pipes \\| and breaks") && lines.every(l=>l.startsWith("|") && l.endsWith("|")) && lines.every(l=>l.split(/(?<!\\)\|/).length === 8), lines.find(l=>/Pipes/.test(l)));
    let copied = null; w.navigator.clipboard = {writeText:t=>{ copied = t; return Promise.resolve(); }};
    d.querySelector("#listCopy").click(); await wait(20);
    ok("C2 the button copies the rows as shown", copied && copied.includes("| Start | End |") && /Copied the table/.test(d.querySelector("#status")?.textContent || ""), (d.querySelector("#status") || {}).textContent);
    w.navigator.clipboard = {writeText:()=>Promise.reject(new Error("no"))}; d.execCommand = ()=>false;
    d.querySelector("#listCopy").click(); await wait(20);
    ok("C3 when the browser refuses, the table is shown selected, to copy by hand", !d.querySelector("#listCopyBox").hidden && d.querySelector("#listCopyText").value.startsWith("| Start |"));
    ok("C4 printing: the print rules show only the list, repeat the header and don't clip", /@media print\{body\.on-list>:not\(#ws-list\)\{display:none!important\}/.test(html) && /body\.on-list \.lwrap\{overflow:visible\}/.test(html) && /thead\{display:table-header-group\}/.test(html) && d.body.classList.contains("on-list"));
    ok("A1 a real table: six column headers, row headers for initiatives, named groups", d.querySelectorAll("#listTable thead th[scope=col]").length === 6 && d.querySelectorAll("#listTable tbody th[scope=row]").length > 0 && !!d.querySelector("#listTable[aria-label]"));
    ok("S1 using List never changes the plan file", ev("JSON.stringify(planOfRecord(S))") === before);
    // Profile: about 100 work items.
    ev(`loadExternal(${JSON.stringify(sample)}, "sample")`); await wait(40); ev("listPlan(100)"); ev("goWs('list')");
    const ms = J(`(()=>{ const t0 = performance.now(); for (let i = 0; i < 5; i++) renderList(); return (performance.now() - t0) / 5; })()`), n = rows().filter(r=>!r.classList.contains("lhead")).length;
    ok("Z1 about 100 items draw in well under 200 ms", n >= 100 && ms < 200, `${n} rows, ${ms.toFixed(1)} ms`);
    ok("no runtime errors", ev("window.errs.length") === 0, ev("window.errs.join(' | ')"));
  } catch(e){ ok("harness ran", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" ") : e); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
