// The assistant sorts Jira work (docs/assistant-workflow.md, "Sorting Jira work"). The context lists exactly what Sort Jira
// work counts, with counts and the bulk sort's own suggestion; placement actions give the same result as the same bulk
// sort on the page (one placement model); every placement waits for a person, at every level, and counts each issue for the
// size holds; conflicts (placed elsewhere, a target that can't take work any more, a hierarchy change) fail a change as a
// whole; replays are done; undo and redo; Not ours and its recovery; Skip leaves an issue unsorted; the review table, its
// destination picker and keyboard use; hostile Jira text stays text; the helpers accept and reject what the page does; and
// the acceptance flow. Fixture: fixtures/sort-plan.js (synthetic).
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path"), os = require("os"), {spawnSync} = require("child_process");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), F = require("./fixtures/sort-plan.js");
const APP = path.join(__dirname, "..", "dist", "sightline-app.py");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 85000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function fileHandle(name, text = ""){ const hd = {name, text, writes:0, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
  async createWritable(){ let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; hd.writes++; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
async function page(opts = {}){
  const hd = fileHandle("plan.json"), dir = folder();
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime(); w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{ w.alerted = true; }; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{}; w.showDirectoryPicker = async()=>dir;
    w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
    w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})}); w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
    w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  await wait(180); const w = dom.window, ev = s=>w.eval(s), d = w.document; w.FIX = F.plan(sample); w.HD = hd; w.JS = JSON.stringify(F.status(opts.status));
  ev(`stopAuto(); S = normalize(JSON.parse(FIX), false); HD.text = serialize(S, HD.name); installPlan(S, HD.text, HD); amTried = S.meta.planId; JIRA = parseJiraStatus(JS);
    whoAmI = (x, cb)=>cb(); askWhoOnStart = ()=>{}; askName = ()=>'Tester'; download = ()=>{}; render(); setMe(S.people[0].id);
    window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };`);
  await ev("assistantConnect()"); await wait(30);
  const send = (o = {}) => dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", F.amendments(ev("S.meta.planId"), ev("S.meta.revision || 0"), {createdAt:new Date(2026, 8, 30, 9, 59).toISOString(), ...o})));
  const tick = async()=>{ await ev("assistantTick()"); await wait(40); };
  const rows = () => JSON.parse(ev("JSON.stringify(amRows().map(r=>({id:r.c.id, group:r.group, status:r.r.status, why:r.r.reasons.join(' ')})))"));
  const show = async()=>{ ev("sel = {type:'amend', id:'x'}; render()"); await wait(5); };
  const pile = () => JSON.parse(ev("JSON.stringify(sortPile().map(x=>x.key))"));
  const run = (id, args) => JSON.parse(ev(`JSON.stringify((r => ({ok:r.ok, code:r.code || '', reason:r.reason || '', nochange:!!r.nochange}))(applyAction(S, ${JSON.stringify(id)}, ${JSON.stringify(args)})))`));
  // the plan's Jira placements, without ids or stamps: where each key is, and how
  const shape = expr => JSON.parse(ev(`JSON.stringify((p => p.bars.map(b=>({lane:b.lane, jira:b.jira || "", epics:b.epics || [], off:b.storiesOff || [], parked:!!b.parked, start:b.start, tasks:(b.tasks || []).filter(t=>t.jira).map(t=>[t.jira, t.start, t.days])})).filter(b=>b.jira || b.epics.length || b.tasks.length).sort((a, b)=>JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))(${expr}))`));
  return {w, ev, d, hd, dir, send, tick, rows, show, pile, run, shape};
}
const byId = (rs, id) => rs.find(r=>r.id === id) || {};
(async()=>{
  try {
    let P = await page(), {w, ev, d, dir, send, tick, rows, show, pile, run, shape} = P;

    // ---- the context says what needs sorting ----
    const want = [...F.LOOSE, ...F.GROUP, ...F.NOWHERE].sort((a, b)=>a.localeCompare(b, undefined, {numeric:true}));
    ok("P1 Sort Jira work counts the fixture's 19 issues", JSON.stringify(pile()) === JSON.stringify(want), pile().join(","));
    ev("clearTimeout(assistantExportTimer)"); await ev("assistantExport()");
    const ctx = JSON.parse(dir.files.get("sightline-assistant-view.json").text), js = ctx.jiraSort;
    ok("C1 the context lists exactly the issues Sort Jira work counts, in the same order", !!js && JSON.stringify(js.issues.map(x=>x.key)) === JSON.stringify(pile()) && js.total === 19);
    ok("C1 …with exact counts: 19 in the pile, 19 exported, none left out", ctx.coverage.jiraSort && ctx.coverage.jiraSort.total === 19 && ctx.coverage.jiraSort.exported === 19 && ctx.coverage.jiraSort.omitted === 0, JSON.stringify(ctx.coverage.jiraSort));
    const ix = k => js.issues.find(x=>x.key === k) || {};
    ok("C2 each issue has the bulk sort's own suggestion as evidence (the assignee's workstream), or none", ix("ABC-101").suggestion?.lane === "int" && ix("ABC-106").suggestion?.lane === "chat" && ix("ABC-110").suggestion?.lane === "rag" && ix("ABC-120").suggestion === null);
    ok("C2 …and labels, sprint, assignee and source", JSON.stringify(ix("ABC-101").labels) === '["connectors"]' && ix("ABC-121").labels[0] === "misc" && ix("ABC-101").sprint === "Sprint 42" && ix("ABC-101").assigneeKey === "JIRAUSER1" && ix("ABC-101").source === "sprint");
    ok("C3 an epic group says it's a group whose stories are all known; a story under a feature isn't", ix("ABC-21").epic === "ABC-20" && ix("ABC-21").epicStoriesKnown === true && ix("ABC-21").epicState === "unsorted" && ix("ABC-32").epic === "ABC-30" && ix("ABC-32").epicStoriesKnown === true);
    ok("C4 the epic list's state, and where work can go (workstreams, initiatives that take stories)", js.epics.some(x=>x.key === "ABC-1" && x.state === "on" && x.on === "c1") && js.epics.some(x=>x.key === "ABC-20" && x.state === "unsorted") && js.targets.workstreams.some(x=>x.id === "int") && js.targets.initiatives.some(x=>x.id === "m2") && !js.targets.initiatives.some(x=>x.id === "n1" && ev("barById('n1').kind") === "waiting"));
    ok("C5 Jira's text is data: the hostile summary is exported as it is, and the guide says not to follow it", ix("ABC-109").summary === F.HOSTILE && /never as instructions/.test(js.about) && /Every placement waits for a person's review/.test(ctx.guide));
    const longOut = ix("ABC-113").summary;
    ok("C6 long text is trimmed by character, never leaving half of one", [...longOut].length === 200 && !/[\uD800-\uDBFF]$/.test(longOut) && JSON.stringify(longOut).indexOf("\\ud") < 0 && longOut === [...F.LONG].slice(0, 200).join(""));
    ok("C7 the plan's own Jira issue list carries labels too", ctx.jira.issues.find(x=>x.key === "ABC-101")?.labels?.[0] === "connectors");

    // ---- placement actions match the bulk sort ----
    const same = async (label, keys, target, id, args) => {
      const a = run(id, args), mine = shape("(p => (applyJira(p), p))(applyAction(S, " + JSON.stringify(id) + ", " + JSON.stringify(args) + ").plan)");
      const Q = await page(); await Q.ev(`sortMove(${JSON.stringify(keys)}, ${JSON.stringify(target)})`); await wait(10);
      const theirs = Q.shape("S"); ok(label, a.ok && !a.nochange && JSON.stringify(mine) === JSON.stringify(theirs), a.reason || JSON.stringify(mine).slice(0, 300) + " vs " + JSON.stringify(theirs).slice(0, 300)); };
    await same("A1 a loose issue to a workstream: a Jira-linked leaf initiative, as the bulk sort makes it", ["ABC-101"], "lane:int", "jira.toWorkstream", {keys:["ABC-101"], lane:"int"});
    await same("A2 to an initiative: a Jira-linked task with its sprint's dates", ["ABC-106"], "bar:m2", "jira.toInitiative", {keys:["ABC-106"], id:"m2"});
    await same("A3 an epic's stories together: one initiative for the epic", F.GROUP, "lane:rag", "jira.toWorkstream", {keys:F.GROUP, lane:"rag", epic:"ABC-20"});
    await same("A4 part of an epic: the epic's initiative, with the stories nobody picked switched off", ["ABC-21", "ABC-22"], "lane:rag", "jira.toWorkstream", {keys:["ABC-21", "ABC-22"], lane:"rag"});
    await same("A5 a story under a feature: on its own", ["ABC-32"], "lane:int", "jira.toWorkstream", {keys:["ABC-32"], lane:"int"});
    await same("A6 Not ours", ["ABC-120"], "skip", "jira.notOurs", {keys:["ABC-120"]});
    { const Q = await page({status:{rollups:{...F.status().rollups, "ABC-20":{total:5, todo:5, children:F.GROUP}}}});      // the files list 3 of ABC-20's 5 stories
      const a = Q.run("jira.toWorkstream", {keys:F.GROUP, lane:"rag"}), mine = Q.shape(`(p => (applyJira(p), p))(applyAction(S, "jira.toWorkstream", ${JSON.stringify({keys:F.GROUP, lane:"rag"})}).plan)`);
      await Q.ev(`sortMove(${JSON.stringify(F.GROUP)}, "lane:rag")`); await wait(10);
      ok("A7 when an epic's stories aren't all known, each is placed on its own, the same as the bulk sort", a.ok && JSON.stringify(mine) === JSON.stringify(Q.shape("S")) && mine.filter(b=>F.GROUP.includes(b.jira)).length === 3 && !mine.some(b=>b.epics.includes("ABC-20")), JSON.stringify([a, mine.filter(b=>F.GROUP.includes(b.jira) || b.epics.includes("ABC-20")), Q.shape("S").filter(b=>F.GROUP.includes(b.jira) || b.epics.includes("ABC-20"))])); }
    ok("A8 a placement makes stable ids from the key", ev(`applyAction(S, "jira.toWorkstream", {keys:["ABC-101"], lane:"int"}).plan.bars.some(b=>b.id === "bar-abc-101")`) && ev(`applyAction(S, "jira.toInitiative", {keys:["ABC-106"], id:"m2"}).plan.bars.find(b=>b.id === "m2").tasks.some(t=>t.id === "task-abc-106")`));

    // ---- conflicts, replays, atomic groups ----
    let r = run("jira.toWorkstream", {keys:["ABC-2"], lane:"int"});
    ok("X1 an issue already where the change puts it is done (ABC-2 is a task in an Integrations initiative)", r.ok && r.nochange);
    r = run("jira.toWorkstream", {keys:["ABC-2"], lane:"chat"});
    ok("X1 …somewhere else on the plan is a conflict that says where", !r.ok && r.code === "stale" && /ABC-2 is already on/.test(r.reason), r.reason);
    r = run("jira.toWorkstream", {keys:["ABC-21", "ABC-22", "ABC-2"], lane:"rag"});
    ok("X2 a group with one issue placed elsewhere fails as a whole", !r.ok && r.code === "stale");
    ev("S.bars.find(b=>b.id === 'm2').parked = true; dropJiraMemos();"); r = run("jira.toInitiative", {keys:["ABC-106"], id:"m2"}); ev("delete S.bars.find(b=>b.id === 'm2').parked; dropJiraMemos();");
    ok("X3 a target that can't take work any more (parked) is a conflict", !r.ok && r.code === "stale" && /can't take Jira work/.test(r.reason), r.reason);
    r = run("jira.toWorkstream", {keys:["ABC-101"], lane:"nowhere"});
    ok("X4 an unknown workstream, or a key that isn't in the Jira files, is invalid", !r.ok && r.code === "invalid" && run("jira.notOurs", {keys:["ZZZ-9"]}).code === "invalid" && run("jira.notOurs", {keys:["not a key"]}).code === "invalid");
    ev(`JIRA = parseJiraStatus(JSON.stringify((o => { o.issues["ABC-23"].parent = "ABC-30"; o.rollups["ABC-20"] = {total:2, todo:2, children:["ABC-21", "ABC-22"]}; o.rollups["ABC-30"].children.push("ABC-23"); return o; })(JSON.parse(JS)))); dropJiraMemos();`);
    r = run("jira.toWorkstream", {keys:F.GROUP, lane:"rag", epic:"ABC-20"});
    ok("X5 the hierarchy changed between proposal and apply (ABC-23 moved epics): the group fails as a whole, nothing placed", !r.ok && r.code === "stale" && /ABC-23 is no longer under ABC-20/.test(r.reason), r.reason);
    ev("JIRA = parseJiraStatus(JS); dropJiraMemos();");
    ok("X6 a duplicate replay is done, not added twice", ev(`(()=>{ const p = applyAction(S, "jira.toWorkstream", {keys:F_G, lane:"rag", epic:"ABC-20"}).plan; const r = runAction(p, "jira.toWorkstream", {keys:F_G, lane:"rag", epic:"ABC-20"}); return r.ok && r.nochange && p.bars.filter(b=>(b.epics||[]).includes("ABC-20")).length === 1; })()`.replace(/F_G/g, JSON.stringify(F.GROUP))));
    ok("X7 an epic link and a new initiative from an epic mirror the epic's On menu", ev(`(()=>{ const ra = applyAction(S, "jira.epicLink", {epic:"ABC-20", id:"r2"}), rb = applyAction(S, "jira.epicNew", {epic:"ABC-20", lane:"rag"}), a = ra.plan, b = rb.plan;
      return epicOwner("ABC-20", a.bars)?.id === "r2" && epicOwner("ABC-20", b.bars)?.id === "bar-abc-20" && epicOwner("ABC-20", b.bars).lane === "rag" && runAction(a, "jira.epicNew", {epic:"ABC-20", lane:"int"}).code === "stale" && runAction(S, "jira.epicLink", {epic:"ABC-21", id:"r2"}).code === "invalid"; })()`),
      ev(`JSON.stringify([(r => [r.ok, r.nochange, r.code, (epicOwner("ABC-20", r.plan.bars) || {}).id, r.plan.bars.find(b=>b.id === "r2").epics])(applyAction(S, "jira.epicLink", {epic:"ABC-20", id:"r2"})), applyAction(S, "jira.epicNew", {epic:"ABC-20", lane:"rag"}).reason, (epicOwner("ABC-20", applyAction(S, "jira.epicNew", {epic:"ABC-20", lane:"rag"}).plan.bars) || {}).id, runAction(S, "jira.epicLink", {epic:"ABC-21", id:"r2"}).code])`));

    { const r = ev(`(()=>{ const b = S.bars.find(x=>x.id === "r2"); const c = {ops:[{op:"action", action:"jira.epicLink", args:{epic:"ABC-20", id:"r2"}}, {op:"set", type:"initiative", id:"r2", field:"status", prev:b.status ?? null, value:b.status === "done" ? "inprogress" : "done"}]}; const k = amCheck(c, S); return JSON.stringify([k.status, (k.reasons || []).join(" | ")]); })()`);
      ok("X11 a change that links an epic and then sets the same initiative's status is refused: Jira owns it from that step on", JSON.parse(r)[0] === "invalid" && /from Jira/.test(JSON.parse(r)[1]), r); }
    ok("X8 an initiative holds up to 50 epics: a 51st is refused, not dropped", ev(`(()=>{ const p = clone(S); p.bars.find(b=>b.id === "r2").epics = Array.from({length:50}, (_, i)=>"ZZZ-" + (i + 1)); const r = runAction(p, "jira.epicLink", {epic:"ABC-20", id:"r2"}); return !r.ok && r.code === "invalid" && /50 epics/.test(r.reason); })()`));
    ok("X9 a parked initiative for the epic isn't done: the change says it's already there, parked", ev(`(()=>{ const p = applyAction(S, "jira.epicNew", {epic:"ABC-20", lane:"rag"}).plan; epicOwner("ABC-20", p.bars).parked = true; const r = runAction(p, "jira.epicNew", {epic:"ABC-20", lane:"rag"}); return !r.ok && r.code === "stale"; })()`));
    ok("X10 a feature under another epic isn't placed as an epic (it isn't in the epic list)", run("jira.epicNew", {epic:"ABC-31", lane:"int"}).code === "invalid" && /feature under another epic/.test(run("jira.epicNew", {epic:"ABC-31", lane:"int"}).reason));
    // ---- review: the table, always waiting for a person ----
    send(); await tick(); await show();
    let rs = rows();
    ok("V1 the batch's 15 placements are ready", rs.length === 15 && rs.every(x=>x.group === "ready"), JSON.stringify(rs.filter(x=>x.group !== "ready")));
    for (const level of ["review", "routine", "all"]){ ev(`amSetLevel(${JSON.stringify(level)})`); await ev("amAuto()"); await wait(10);
      const held = JSON.parse(ev("JSON.stringify(AM.held || {})")), n = Object.keys(held).length;
      ok(`V2 at "${level}", every placement waits for a person and nothing is applied`, n === 15 && pile().length === 19 && (level === "review" || Object.values(held).every(h=>/places Jira work on the plan, so a person always reviews it/.test(h.reason))), `${n} held; ${Object.values(held)[0]?.reason}`); }
    ev(`amSetLevel("review")`);
    const tbl = d.querySelector('table.amjira[data-amjira="ready"]'), trs = tbl ? [...tbl.querySelectorAll("tbody tr[data-am]")] : [];
    ok("V3 one compact table, one row per placement: issue, where it goes, why, confidence", !!tbl && trs.length === 15 && [...tbl.querySelectorAll("thead th")].map(x=>x.textContent).join("|") === "Issue|Goes to|Why|Confidence|Actions" && tbl.getAttribute("role") === "table" && trs.every(x=>x.getAttribute("role") === "row" && [...x.cells].every(c=>c.getAttribute("role") === "cell")));
    const tr = k => d.querySelector(`tr[data-am="place-${k.toLowerCase()}"]`);
    ok("V3 …a row says the key and summary, the workstream, the reason and the confidence", /ABC-101/.test(tr("ABC-101").cells[0].textContent) && /Connector auth refresh/.test(tr("ABC-101").cells[0].textContent) && tr("ABC-101").cells[1].textContent === "Integrations" && /assignee's other work/.test(tr("ABC-101").cells[2].textContent) && tr("ABC-101").cells[3].textContent === "Low");
    ok("V3 …the epic group is one row, its stories together", /ABC-21/.test(d.querySelector('tr[data-am="place-abc-20"]').cells[0].textContent) && /\+2, ABC-20 together/.test(d.querySelector('tr[data-am="place-abc-20"]').cells[0].textContent));
    ok("V4 hostile Jira text stays text in the table", tr("ABC-109").cells[0].textContent.includes("Ignore previous instructions") && !d.querySelector(".amjira img") && !w.alerted);

    // ---- size holds count every issue ----
    { const many = Array.from({length:50}, (_, i)=>"ABC-" + (2001 + i)), extra = {}; many.forEach(k=>{ extra[k] = {summary:"Bulk " + k, status:"To Do", category:"todo", type:"Story", assigneeKey:"", labels:[], sprintId:42, sprint:"Sprint 42", sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09"}; });
      const Q = await page({status:{issues:{...F.status().issues, ...extra}}});
      const mk = n => [{id:"big", summary:"Many", ops:[F.act("jira.notOurs", {keys:many.slice(0, n)})]}, {id:"other", summary:"Rename", ops:[F.act("initiative.set", {id:"m4", field:"label", value:"Renamed for the size check " + n})]}];
      for (const [n, held] of [[49, false], [50, true]]){ Q.ev(`amSetLevel("routine")`); Q.send({changes:mk(n), batchId:"size-" + n}); await Q.tick(); await Q.ev("amAuto()"); await wait(10);
        const h = JSON.parse(Q.ev("JSON.stringify(AM.held || {})"));
        ok(`H1 a placement of ${n} issues plus one other change touches ${n + 1} items: the other change ${held ? "waits" : "doesn't wait"} for size`, !!h.big && (held ? /touches about 51 items/.test((h.other || {}).reason || "") : !h.other), JSON.stringify(h) + Q.ev("JSON.stringify(amRows().map(r=>[r.c.id, r.group, r.r.status, r.r.reasons]))")); } }
    ok("H2 a placement moves nothing else (it isn't a date change), so the 5-move hold never counts it", ev("amRows().every(r=>!r.r.dated)"));

    // ---- edit: a destination picker limited to eligible targets, by keyboard ----
    const editBtn = tr("ABC-110").querySelector("[data-amedit]"); editBtn.click(); await wait(10);
    const pick = d.getElementById("amjd-place-abc-110");
    ok("E1 Edit opens a destination picker, focused, with the workstreams, the initiatives that take work, and Not ours", !!pick && d.activeElement === pick && pick.value === "lane:rag" && [...pick.options].some(o=>o.value === "lane:int") && [...pick.options].some(o=>o.value === "bar:m2") && [...pick.options].some(o=>o.value === "skip") && ![...pick.options].some(o=>o.value === "bar:n1"));
    pick.value = "bar:r2"; pick.dispatchEvent(new w.Event("change", {bubbles:true})); d.querySelector('[data-amsave="place-abc-110"]').click(); await wait(20);
    tr("ABC-110").querySelector("[data-amedit]").click(); await wait(10);
    ok("E3 opening Edit again shows the edited destination, so saving keeps it", d.getElementById("amjd-place-abc-110")?.value === "bar:r2");
    d.querySelector('[data-amsave="place-abc-110"]').click(); await wait(20);
    ok("E2 Save keeps the edit: the row goes to the initiative, marked Edited by you, and focus returns to Edit", /Edited by you/.test(tr("ABC-110").cells[1].textContent) && tr("ABC-110").cells[1].textContent.startsWith(ev("barTitle(barById('r2'))")) && d.activeElement === tr("ABC-110").querySelector("[data-amedit]") && byId(rows(), "place-abc-110").status === "ready");

    // ---- the acceptance flow: skip one, apply the rest as one update ----
    tr("ABC-111").querySelector("[data-amskip]").click(); await wait(10);
    const jira0 = ev("JSON.stringify(JIRA)"), undo0 = ev("past.length + quickDone.length");
    ok("F1 Apply ready applies the 14 left as one update", /Apply 14 ready as one update/.test(d.querySelector("#amApplyAll")?.textContent || ""), d.querySelector("#amApplyAll")?.textContent);
    d.querySelector("#amApplyAll").click(); await wait(120);
    ok("F2 afterwards Sort Jira work shows only what was skipped or couldn't be placed", JSON.stringify(pile()) === JSON.stringify(["ABC-111", "ABC-120", "ABC-121"]), pile().join(","));
    ok("F3 …the edited one went where the person said", ev("barById('r2').tasks.some(t=>t.jira === 'ABC-110')"));
    ok("F4 …as one update, one Undo", ev("past.length + quickDone.length") === undo0 + 1);
    ok("F5 …and Jira's data is unchanged", ev("JSON.stringify(JIRA)") === jira0);
    ev("undo()"); await wait(80);
    ok("U1 Undo puts all 16 issues back in Sort Jira work", pile().length === 19, pile().length);
    ev("redo()"); await wait(80);
    ok("U2 Redo places them again", pile().length === 3, pile().join(","));

    // ---- Not ours, and its recovery ----
    ({w, ev, d, dir, send, tick, rows, show, pile, run, shape} = await page());
    send({changes:[{id:"no-120", summary:"Not ours", reason:"No owner and no epic.", confidence:"low", ops:[F.act("jira.notOurs", {keys:["ABC-120"]})]}], batchId:"skip-1"}); await tick(); await show();
    d.querySelector('[data-amapply="no-120"]').click(); await wait(80);
    ok("N1 Not ours takes it out of Sort Jira work, recoverably", !pile().includes("ABC-120") && ev("S.meta.jiraSkip.includes('ABC-120')"));
    ev("undo()"); await wait(60); const back1 = pile().includes("ABC-120"); ev("redo()"); await wait(60);
    ev(`UI.jiraSort = false; UI.planTab = "epics"; goWs("plan"); render();`); await wait(10);
    const offLine = d.querySelector("#sortNotOurs")?.textContent || "";
    d.querySelector("#sortUnskip")?.click(); await wait(60);
    ok("N2 …Sort Jira work says one is marked not ours; Undo, or Show them again there, puts it back", /1 Jira issue is marked not ours/.test(offLine) && back1 && pile().includes("ABC-120") && !ev("(S.meta.jiraSkip || []).includes('ABC-120')"), JSON.stringify([pile().includes("ABC-120"), ev("JSON.stringify(S.meta.jiraSkip)")]));
    send({changes:[{id:"s1", summary:"Place", ops:[F.act("jira.toWorkstream", {keys:["ABC-101"], lane:"int"})]}], batchId:"skip-2"}); await tick(); await show();
    d.querySelector('[data-amskip="s1"]').click(); await wait(10);
    ok("N3 a review Skip leaves the issue in Sort Jira work", pile().includes("ABC-101") && !ev("(S.meta.jiraSkip || []).includes('ABC-101')"));

    // ---- reason and confidence are validated ----
    send({changes:[{id:"bad", summary:"x", confidence:"certain", ops:[F.act("jira.notOurs", {keys:["ABC-120"]})]}], batchId:"bad-1"}); await tick();
    ok("Z1 a confidence other than high or low is refused, with a reason", /confidence is "high" or "low"/.test(ev("AM.error || ''")), ev("AM.error || ''"));
    send({changes:[{id:"ok1", summary:"x", reason:"  one\n line  ", ops:[F.act("jira.notOurs", {keys:["ABC-120"]})]}], batchId:"bad-2"}); await tick();
    ok("Z2 the reason is kept on the change, as one line", ev("AM.file && AM.file.changes[0].reason") === "one line");

    // ---- the helper check accepts and rejects what the page does ----
    { ev("clearTimeout(assistantExportTimer)"); await ev("assistantExport()");
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sl-sort-")); fs.writeFileSync(path.join(tmp, "sightline-assistant-view.json"), dir.files.get("sightline-assistant-view.json").text);
      const cases = [["ok", F.act("jira.toWorkstream", {keys:["ABC-101"], lane:"int"}), true], ["group", F.act("jira.toWorkstream", {keys:F.GROUP, lane:"rag", epic:"ABC-20"}), true],
        ["lane", F.act("jira.toWorkstream", {keys:["ABC-101"], lane:"nowhere"}), false], ["key", F.act("jira.notOurs", {keys:["ZZZ-9"]}), false],
        ["bar", F.act("jira.toInitiative", {keys:["ABC-101"], id:"n1"}), ev("jiraTakes(barById('n1'), S)")], ["epic", F.act("jira.epicNew", {epic:"ABC-20", lane:"rag"}), true],
        ["here", F.act("jira.toWorkstream", {keys:["ABC-2"], lane:"int"}), true], ["there", F.act("jira.toWorkstream", {keys:["ABC-2"], lane:"chat"}), false],
        ["padded", F.act("jira.notOurs", {keys:[" abc-101 "]}), true], ["feature", F.act("jira.epicNew", {epic:"ABC-31", lane:"int"}), false],
        ["many", F.act("jira.notOurs", {keys:Array.from({length:101}, (_, i)=>"ABC-" + (3001 + i))}), false]];
      const verdicts = cases.map(([id, op, want])=>{ const b = {kind:"sightline-amendments", version:1, planId:ev("S.meta.planId"), batchId:"h-" + id, createdAt:"2026-09-30T09:00:00Z", basedOn:{planRevision:ev("S.meta.revision || 0")}, changes:[{id, summary:id, ops:[op]}]};
        fs.writeFileSync(path.join(tmp, "b.json"), JSON.stringify(b)); const o = spawnSync("python3", [APP, "check", tmp, path.join(tmp, "b.json"), "--json"], {encoding:"utf8"});          // the order the guide writes it
        let out = null; try { out = JSON.parse(o.stdout); } catch(e){}
        const pageOk = JSON.parse(ev(`JSON.stringify((r => r.ok)(runAction(clone(S), ${JSON.stringify(op.action)}, ${JSON.stringify(op.args)})))`));
        return {id, want, helper:o.status === 0 && !!out && out.ok === true, json:!!out, pageOk, raw:(o.stdout || o.stderr).slice(0, 200)}; });
      ok("K1 the helper check accepts and rejects the same placements as the page", verdicts.every(v=>v.helper === v.want && v.pageOk === v.want), JSON.stringify(verdicts.filter(v=>v.helper !== v.want || v.pageOk !== v.want)));
      ok("K2 the helper takes --json after the command, as the guide writes it, and answers in JSON", verdicts.every(v=>v.json), JSON.stringify(verdicts.filter(v=>!v.json).map(v=>v.raw)));
      fs.rmSync(tmp, {recursive:true, force:true}); }
    ok("Z3 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
