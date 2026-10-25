// The assistant changes the plan's timeboxes (docs/assistant-workflow.md, "Timeboxes"): sprint.set names and goals of
// plan timeboxes, sprint.add adds one at the end and sprint.addThrough does what Add timeboxes through does, 60 at most per
// call and safe to repeat. Each gives the same result as Settings, every Jira-owned field is refused in both, the context
// lists the timeboxes with what finishes in each, and following Jira later refuses changes aimed at what became Jira's.
// Fixture: fixtures/timebox-plan.js.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), tb = require("./fixtures/timebox-plan.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 85000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const NOW = Date.UTC(2026, 9, 1, 14);
function fileHandle(name, text = ""){ const hd = {name, text, writes:0, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
  async createWritable(){ let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; hd.writes++; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
async function page(text = tb(sample)){
  const hd = fileHandle("plan.json"), dir = folder();
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RD = w.Date; w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{}; w.showDirectoryPicker = async()=>dir;
    w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
    w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})}); w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
    w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  await wait(180); const w = dom.window, ev = s=>w.eval(s), d = w.document; w.FIX = text; w.HD = hd; w.JS = tb.status();
  ev(`stopAuto(); S = normalize(JSON.parse(FIX), false); HD.text = serialize(S, HD.name); installPlan(S, HD.text, HD); amTried = S.meta.planId; JIRA = parseJiraStatus(JS);
    whoAmI = (x, cb)=>cb(); askWhoOnStart = ()=>{}; askName = ()=>'Tester'; download = ()=>{}; render(); setMe(S.people[0].id);
    window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };`);
  await ev("assistantConnect()"); await wait(30);
  const send = (changes, batchId = "batch-tb") => dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", JSON.stringify({kind:"sightline-amendments", version:1,
    planId:ev("S.meta.planId"), batchId, createdAt:new Date(NOW).toISOString(), source:"Planning bot", basedOn:{planRevision:ev("S.meta.revision || 0")}, changes})));
  const tick = async()=>{ await ev("assistantTick()"); await wait(40); };
  const show = async()=>{ ev("sel = {type:'amend', id:'x'}; render()"); await wait(5); };
  const settings = async()=>{ ev("UI.planTab = 'types'; goWs('plan'); render()"); await wait(10); };
  const rows = () => J(ev, "amRows().map(r=>({id:r.c.id, group:r.group, status:r.r.status, why:r.r.reasons.join(' '), lines:r.r.lines}))");
  const context = () => JSON.parse(dir.files.get("sightline-assistant-view.json").text);
  const exportNow = async()=>{ ev("clearTimeout(assistantExportTimer)"); await ev("assistantExport()"); };
  return {w, ev, d, hd, dir, send, tick, show, settings, rows, context, exportNow};
}
const act = (action, args) => ({op:"action", action, args});
const byId = (rs, id) => rs.find(r=>r.id === id) || {};
// Run an action on a copy of the plan; what the copy's timeboxes are afterwards.
// Settings' commit stamps who edited it; the action's own run doesn't (applying it does, in the same commit), so compare without.
const unstamped = xs => xs.map(({added, edited, ...rest})=>rest);
const run = (ev, id, args) => J(ev, `(()=>{ const p = clone(S); const r = runAction(p, ${JSON.stringify(id)}, ${JSON.stringify(args)}); return {r, sprints:p.sprints, weeks:p.meta.weeks}; })()`);
const fire = (w, el, type, value) => { if (value !== undefined) el.value = value; el.dispatchEvent(new w.Event(type, {bubbles:true})); };
(async()=>{
  try {
    // ---- each action gives the same result as Settings ----
    let {w, ev, d, hd, dir, send, tick, show, settings, rows, context, exportNow} = await page();
    ok("P0 the fixture follows its Jira board: lead, Sprint 42, the gap, Sprint 43, then the plan's own", ev("sprintProposal().same") === true && J(ev, "S.sprints.map((x, i)=>sprintKind(S.sprints, i))").join() === "gap,jira,gap,jira,plan,plan,plan");
    await ev("startEditing(false)"); await wait(20); ok("P0 editing", ev("editable()") === true); await settings();
    const tr = id => d.querySelector(`#t-sprints tr[data-sprint="${id}"]`), inputs = id => tr(id).querySelectorAll("input"), btns = id => tr(id).querySelectorAll("button");
    const viaSet = run(ev, "sprint.set", {id:"tb-44", field:"goal", value:"Pilot release ships", prev:""});
    fire(w, inputs("tb-44")[2], "input", "Pilot release ships"); fire(w, inputs("tb-44")[2], "change"); await wait(5);
    ok("A1 sprint.set goal gives what typing it in Settings gives", viaSet.r.ok && JSON.stringify(unstamped(viaSet.sprints)) === JSON.stringify(unstamped(J(ev, "S.sprints"))), JSON.stringify(viaSet.r));
    await settings(); const viaName = run(ev, "sprint.set", {id:"tb-45", field:"name", value:"Hardening", prev:"Sprint 45"});
    fire(w, inputs("tb-45")[0], "input", "Hardening"); fire(w, inputs("tb-45")[0], "change"); await wait(5);
    ok("A2 sprint.set name gives what renaming it in Settings gives", viaName.r.ok && JSON.stringify(unstamped(viaName.sprints)) === JSON.stringify(unstamped(J(ev, "S.sprints"))));
    ok("A2 …and the review says it in words", ev(`actLine('sprint.set', {id:'tb-45', field:'name', value:'Hardening II'}, S)`) === 'Rename "Hardening" to "Hardening II"' && ev(`actLine('sprint.set', {id:'tb-44', field:'goal', value:'Ship it'}, S)`) === `"Sprint 44"'s goal: "Ship it"`);
    const end = ev("dayToIso(startDay() + Math.round(S.meta.weeks * 7) - 3)"), oneMore = ev(`dayToIso(isoToDay('${end}') + 7)`), through = ev(`dayToIso(isoToDay('${end}') + 7 * 9)`);
    const strip = xs => unstamped(xs).map(({id, ...rest})=>rest);
    const viaAdd = run(ev, "sprint.add", {id:"tb-47"}), viaThrough = run(ev, "sprint.addThrough", {date:through});
    await settings(); fire(w, d.querySelector("#sprintsTo"), "input", oneMore); d.querySelector("#sprintsToGo").click(); await wait(5);
    ok("A3 sprint.add adds what the page's own Add does (named on from the last, the plan's usual length)", viaAdd.r.ok && JSON.stringify(strip(viaAdd.sprints)) === JSON.stringify(strip(J(ev, "S.sprints"))) && viaAdd.sprints.at(-1).id === "tb-47" && viaAdd.sprints.at(-1).name === "Sprint 47" && viaAdd.weeks === ev("S.meta.weeks"), JSON.stringify(viaAdd.sprints.at(-1)));
    ev("undo()"); await settings(); fire(w, d.querySelector("#sprintsTo"), "input", through); d.querySelector("#sprintsToGo").click(); await wait(5);
    ok("A4 sprint.addThrough adds what Add timeboxes through adds", viaThrough.r.ok && JSON.stringify(strip(viaThrough.sprints)) === JSON.stringify(strip(J(ev, "S.sprints"))) && viaThrough.sprints.length === 7 + 5, String(viaThrough.sprints.length));
    ev("undo()");
    ok("A5 a name and a goal are trimmed and capped", run(ev, "sprint.set", {id:"tb-44", field:"name", value:"  Spaced   out  "}).sprints[4].name === "Spaced out" && /up to 300 characters/.test(run(ev, "sprint.set", {id:"tb-44", field:"goal", value:"x".repeat(301)}).r.reason) && /needs a name/.test(run(ev, "sprint.set", {id:"tb-44", field:"name", value:"  "}).r.reason));
    ok("A5 Settings caps them the same way", inputs("tb-44")[0].getAttribute("maxlength") === "60" && inputs("tb-44")[2].getAttribute("maxlength") === "300");

    // ---- Jira's fields are refused, in actions and in Settings ----
    const JMSG = "This sprint comes from Jira; change it in Jira.";
    const refusals = ["name", "goal", "weeks"].map(f=>run(ev, "sprint.set", {id:"tb-42", field:f, value:f === "weeks" ? 3 : "Mine now"}).r);
    ok("J1 every field of a Jira sprint is refused, with the reason", refusals.every(r=>!r.ok && r.reason === JMSG), JSON.stringify(refusals));
    ok("J1 …even with the right prev", run(ev, "sprint.set", {id:"tb-43", field:"goal", value:"Mine", prev:""}).r.reason === JMSG);
    ok("J2 a gap row's name follows Jira, but its goal is the plan's", /following Jira names it/.test(run(ev, "sprint.set", {id:"tb-gap", field:"name", value:"Mine"}).r.reason) && run(ev, "sprint.set", {id:"tb-gap", field:"goal", value:"Catch up"}).r.ok);
    ok("J3 a timebox's length isn't the assistant's yet, and other fields aren't settable", /isn't something the assistant can do yet/.test(run(ev, "sprint.set", {id:"tb-44", field:"weeks", value:3}).r.reason) && /can't be set this way/.test(run(ev, "sprint.set", {id:"tb-44", field:"jira", value:9}).r.reason));
    await settings();
    const [jn, jw, jg] = inputs("tb-42"), [jup, jx] = btns("tb-42");
    ok("J4 Settings: a Jira sprint's name and goal are read-only, its weeks locked, and it can't move or go", jn.readOnly && jg.readOnly && jw.disabled && jup.disabled && jx.disabled && jw.title === JMSG && jx.title === JMSG);
    ok("J4 …a gap row can't change length or go (that would move Jira's sprints), and its name follows Jira, but its goal is editable", inputs("tb-gap")[1].disabled && btns("tb-gap")[1].disabled && inputs("tb-gap")[0].readOnly && !inputs("tb-gap")[2].readOnly && /move the Jira sprints after it/.test(btns("tb-gap")[1].title));
    ok("J4 …a row right after a Jira sprint can't move above it", btns("tb-44")[0].disabled && /would move a Jira sprint/.test(btns("tb-44")[0].title) && btns("tb-gap")[0].disabled);
    ok("J4 …and the plan's own timeboxes stay fully editable", !btns("tb-45")[0].disabled && !btns("tb-45")[1].disabled && !inputs("tb-45")[1].disabled && !inputs("tb-45")[0].readOnly);
    ok("J4 the From column says what each row is", [...tr("tb-gap").children][1].textContent === "Between Jira sprints" && [...tr("tb-42").children][1].textContent === "Jira sprint" && [...tr("tb-45").children][1].textContent === "Plan timebox");
    const s0 = ev("JSON.stringify(S.sprints)");
    jx.disabled = false; jx.click(); jup.disabled = false; jup.click(); jw.disabled = false; fire(w, jw, "change", "4"); fire(w, jn, "input", "Mine now"); await wait(5);
    ok("J5 even when forced, Settings changes nothing on a Jira sprint and says why", ev("JSON.stringify(S.sprints)") === s0 && ev("document.querySelector('#status').textContent") === JMSG);

    // ---- collisions, missing ids, stale prev, repeats, the 60 cap ----
    ok("C1 sprint.add refuses an id a timebox or another item already uses", /already used/.test(run(ev, "sprint.add", {id:"tb-45"}).r.reason) === false && run(ev, "sprint.add", {id:"tb-45"}).r.nochange === true && /already used/.test(run(ev, "sprint.add", {id:"tb-45", name:"Other"}).r.reason) && /already used/.test(run(ev, "sprint.add", {id:"m1"}).r.reason));
    ok("C1 …an add already in the plan as asked is done, not added twice", run(ev, "sprint.add", {id:"tb-44", name:"Sprint 44"}).r.nochange === true && run(ev, "sprint.add", {id:"tb-44", name:"Sprint 44"}).sprints.length === 7);
    ok("C2 a missing timebox is refused", run(ev, "sprint.set", {id:"tb-99", field:"goal", value:"x"}).r.reason === "That timebox isn't in the plan.");
    const st = run(ev, "sprint.set", {id:"tb-44", field:"goal", value:"New goal", prev:"Something else"}).r;
    ok("C3 a stale prev is refused as changed since", !st.ok && st.code === "stale" && st.now === "Pilot release ships", JSON.stringify(st));
    ok("C3 …unless it's already what was asked", run(ev, "sprint.set", {id:"tb-44", field:"goal", value:"Pilot release ships", prev:"Old"}).r.nochange === true);
    ok("C4 add-through when the timeboxes already reach the date changes nothing", run(ev, "sprint.addThrough", {date:end}).r.nochange === true && ev(`planActions['sprint.addThrough'].done(S, {date:'${end}'})`) === true);
    const far = ev(`dayToIso(isoToDay('${end}') + 7 * 2 * 75)`);
    const capped = J(ev, `(()=>{ const p = clone(S), a = runAction(p, 'sprint.addThrough', {date:'${far}'}), n1 = p.sprints.length, b = runAction(p, 'sprint.addThrough', {date:'${far}'}), n2 = p.sprints.length, c = runAction(p, 'sprint.addThrough', {date:'${far}'});
      return {a, b, c, n1, n2, reach:dayToIso(isoToDay(p.meta.start) + p.meta.weeks * 7 - 3), weeks:p.meta.weeks, ids:new Set(p.sprints.map(x=>x.id)).size}; })()`);
    ok("C5 add-through stops at 60 per call", capped.a.ok && capped.n1 === 7 + 60, String(capped.n1));
    ok("C5 …the second call finishes, and a third changes nothing", capped.b.ok && !capped.b.nochange && capped.n2 === 7 + 75 && capped.c.nochange === true && capped.reach >= far && capped.ids === capped.n2, JSON.stringify(capped));

    // ---- three goals in one change, one click, one update, one undo ----
    ({w, ev, d, hd, dir, send, tick, show, rows, context, exportNow} = await page());
    const goals = [["tb-44", "Pilot release ships"], ["tb-45", "Reports and the v1 host finish"], ["tb-46", "Security sign-off and rollout"]];
    send([{id:"goals", summary:"Set three goals from the work finishing in each", ops:goals.map(([id, g])=>act("sprint.set", {id, field:"goal", value:g, prev:ev(`S.sprints.find(x=>x.id==='${id}').goal`)}))},
      {id:"jira-goal", summary:"Set Sprint 42's goal", ops:[act("sprint.set", {id:"tb-42", field:"goal", value:"Mine", prev:"Jira's own goal"})]},
      {id:"more", summary:"Add timeboxes through the new end", ops:[act("sprint.addThrough", {date:through})]}]);
    await tick(); await show(); let rs = rows();
    ok("G1 the three goals are one ready change, with each in words", byId(rs, "goals").group === "ready" && byId(rs, "goals").lines.length === 3 && /"Sprint 46"'s goal: "Security sign-off and rollout"/.test(byId(rs, "goals").lines.join("|")), JSON.stringify(byId(rs, "goals")));
    ok("G2 a change to a Jira sprint is refused with the reason", byId(rs, "jira-goal").group === "attention" && byId(rs, "jira-goal").why.includes(JMSG), JSON.stringify(byId(rs, "jira-goal")));
    const undo0 = ev("past.length + quickDone.length");
    d.querySelector('[data-am="goals"] [data-amapply]').click(); await wait(80);
    ok("G3 it says what it applied, and that it's saved", /^Applied change 1\. Saved\./.test(ev("document.querySelector('#status').textContent")), ev("document.querySelector('#status').textContent"));
    ok("G3 one click sets all three", goals.every(([id, g])=>ev(`S.sprints.find(x=>x.id==='${id}').goal`) === g) && JSON.parse(hd.text).sprints.find(x=>x.id === "tb-46").goal === goals[2][1]);
    ok("G3 …as one update with one undo", ev("past.length + quickDone.length") === undo0 + 1);
    await show(); d.querySelector('[data-am="more"] [data-amapply]').click(); await wait(80);
    const n1 = ev("S.sprints.length"); await tick(); rs = rows();
    ok("G4 adding through a date applies, and the same request again is already in the plan", n1 === 12 && byId(rs, "more").status === "done", `${n1} ${JSON.stringify(byId(rs, "more"))}`);
    ev("undo()"); await wait(20); ev("undo()"); await wait(20);
    ok("G5 undo takes the goals back in one step", goals.every(([id])=>ev(`S.sprints.find(x=>x.id==='${id}').goal`) === "") && ev("S.sprints.length") === 7);

    // ---- the context lists the timeboxes and what finishes in each ----
    const withTasks = JSON.parse(tb(sample)); withTasks.bars.find(b=>b.id === "m2").tasks = [{id:"task-tb-1", label:"Wire the host", start:"2026-11-09", days:3, status:"notstarted", owners:[], dependsOn:[], jira:"ABC-7"},
      {id:"task-tb-2", label:"Same Jira work again", start:"2026-11-09", days:3, status:"notstarted", owners:[], dependsOn:[], jira:"abc-7"}];
    ({w, ev, d, hd, dir, send, tick, show, rows, context, exportNow} = await page(JSON.stringify(withTasks)));
    await exportNow(); const view = context(), T = view.planning.timeboxes, L = T.list, tx = id => L.find(x=>x.id === id);
    ok("X1 the context lists every timebox in order with its kind", L.map(x=>x.id).join() === "tb-lead,tb-42,tb-gap,tb-43,tb-44,tb-45,tb-46" && L.map(x=>x.kind).join() === "gap,jira,gap,jira,plan,plan,plan");
    ok("X1 …chart dates apart from Jira's own", tx("tb-42").chartStart === "2026-09-28" && tx("tb-42").chartEnd === "2026-10-09" && tx("tb-42").jira.start === "2026-09-28" && tx("tb-42").jira.state === "active" && tx("tb-44").chartStart === "2026-11-09" && !tx("tb-44").jira, JSON.stringify(tx("tb-42")));
    ok("X2 …and what finishes in each, by computed finish", tx("tb-42").finishing.initiatives.some(x=>x.id === "m1" && x.finish === "2026-10-02") && tx("tb-42").finishing.milestones.some(x=>x.id === "ms1") && tx("tb-44").finishing.tasks.some(x=>x.id === "task-tb-1" && x.finish === "2026-11-11"), JSON.stringify(tx("tb-44").finishing));
    ok("X2 …a Jira key on two tasks counts once", tx("tb-44").finishing.counts.tasks === 1 && !tx("tb-44").finishing.tasks.some(x=>x.id === "task-tb-2"));
    ok("X2 …an initiative with tasks is counted through them, not twice", !L.some(x=>x.finishing.initiatives.some(y=>y.id === "m2")));
    ok("X3 the coverage counts the timeboxes", view.coverage.timeboxes && view.coverage.timeboxes.total === 7 && view.coverage.timeboxes.omitted === 0);
    ok("X3 …and says what runs past the last one", T.finishingAfterLast && typeof T.finishingAfterLast.count === "number");
    ok("X4 the guide says how to change timeboxes and write a goal", /sprint\.addThrough \{date\}/.test(view.guide) && /Writing a goal: one line in plain words saying what that timebox finishes/.test(view.guide) && /Never a goal for work the plan doesn't show/.test(view.guide));
    ok("X4 …and the actions are listed", ["sprint.set", "sprint.add", "sprint.addThrough"].every(id=>view.actions.some(a=>a.id === id)) && view.actions.find(a=>a.id === "sprint.set").args.prev === "any?");
    const big = J(ev, `(()=>{ const was = S.bars.find(b=>b.id === 'm2').tasks; S.bars.find(b=>b.id === 'm2').tasks = Array.from({length:45}, (_, i)=>({id:'task-many-' + i, label:'Task ' + i, start:'2026-11-09', days:1, status:'notstarted', owners:[], dependsOn:[]}));
      const f = assistantTimeboxes().list.find(x=>x.id === 'tb-44').finishing; S.bars.find(b=>b.id === 'm2').tasks = was; return {n:f.tasks.length, count:f.counts.tasks, omitted:f.omitted.tasks}; })()`);
    ok("X5 a long list is trimmed with its omission count", big.n === 40 && big.count === 45 && big.omitted === 5, JSON.stringify(big));
    ok("X6 no page errors", !w.errs.length, w.errs.join(" | "));

    // ---- following Jira later, after the assistant's edits ----
    const own = JSON.parse(sample); own.sprints = Array.from({length:12}, (_, i)=>({id:"w" + i, name:"Week " + (i + 1), weeks:1, goal:""})); own.meta.weeks = 12;
    ({w, ev, d, hd, dir, send, tick, show, rows} = await page(JSON.stringify(own)));
    send([{id:"g5", summary:"Goal for week 6", ops:[act("sprint.set", {id:"w5", field:"goal", value:"Before the switch", prev:""})]}], "batch-f1");
    await tick(); await show(); d.querySelector('[data-am="g5"] [data-amapply]').click(); await wait(80);
    ok("F1 the assistant set a goal on the plan's own timebox", ev("S.sprints.find(x=>x.id==='w5').goal") === "Before the switch");
    send([{id:"p1", summary:"Goal for week 2", ops:[act("sprint.set", {id:"w1", field:"goal", value:"Mine", prev:""})]},
      {id:"p6", summary:"Goal for week 7", ops:[act("sprint.set", {id:"w6", field:"goal", value:"Later work", prev:""})]},
      {id:"p10", summary:"Goal for week 11", ops:[act("sprint.set", {id:"w10", field:"goal", value:"Gone", prev:""})]}], "batch-f2");
    await tick(); rs = rows();
    ok("F2 before the switch, all three are ready", ["p1", "p6", "p10"].every(id=>byId(rs, id).group === "ready"), JSON.stringify(rs));
    await ev("startEditing(false)"); await wait(20);
    ok("F3 a sync offers the switch, and accepting it follows Jira", ev("sprintProposal().same") === false && ev("useJiraSprints()") === true && ev("sprintProposal().same") === true);
    const after = J(ev, "S.sprints.map(x=>({id:x.id, jira:x.jira || null, goal:x.goal}))");
    ok("F4 timeboxes keep their identity where the rules reuse ids", after.map(x=>x.id).join() === "w0,w1,w2,w3,w4,w5,w6" && after[1].jira === 42 && after[3].jira === 43, JSON.stringify(after));
    ok("F4 …and the plan's own goal stays with its timebox", after.find(x=>x.id === "w5").goal === "Before the switch");
    await tick(); await show(); rs = rows();
    ok("F5 a pending change whose timebox is now a Jira sprint is refused, with the reason", byId(rs, "p1").group === "attention" && byId(rs, "p1").why.includes(JMSG), JSON.stringify(byId(rs, "p1")));
    ok("F5 …one whose timebox no longer exists is refused", byId(rs, "p10").group === "attention" && /That timebox isn't in the plan/.test(byId(rs, "p10").why));
    ok("F5 …and one still on a plan timebox stays ready", byId(rs, "p6").group === "ready");

    // ---- older copies ----
    ev("S.sprints.find(x=>x.id==='w6').goal = 'Kept'; commit(()=>{});");
    const round = J(ev, `(()=>{ const t = serialize(planOfRecord(S), 'plan.json'), o = JSON.parse(t), back = serialize(planOfRecord(normalize(JSON.parse(t), false)), 'plan.json');
      return {features:featuresIn(o), same:JSON.parse(back).sprints, was:o.sprints, tooNew:!!tooNew(normalize({...o, meta:{...o.meta, features:featuresIn(o)}}, false))}; })()`);
    ok("O1 no new plan fields: an older copy opens it as usual", !round.tooNew && round.features.every(f=>ev(`KNOWN_FEATURES.includes(${JSON.stringify(f)})`)), JSON.stringify(round.features));
    ok("O1 …and saving and reopening keeps every timebox as it was", JSON.stringify(round.same) === JSON.stringify(round.was));
    ok("O2 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
function J(ev, s){ return JSON.parse(ev(`JSON.stringify(${s})`)); }
