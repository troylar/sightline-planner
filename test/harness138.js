// Changing a workstream's id (workstream.reid): every reference in the plan moves with it in one update (a scan of the
// whole plan finds the old id only where it's kept as a former id), one Undo puts every one back, a person always reviews
// it, the old id still resolves in files written before (with a note), ids are never reused, the plan says it needs this
// copy (laneIds1), the context exports former ids, and the workstream's panel changes it. Fixture: fixtures/reid-plan.js.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const RF = require("./fixtures/reid-plan.js"), FIX = RF(fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8")), {OLD, NEW} = RF;
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function fileHandle(name, text = ""){ const hd = {name, text, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; }, async createWritable(){ let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
// Where a plan says the old id: every string equal to it (or "lane:" + it), and every key, by path with indexes dropped.
const SCAN = `(function scan(o, at, out){ if (typeof o === "string"){ if (o === OLD || o === "lane:" + OLD) out.push(at); return out; }
  if (!o || typeof o !== "object") return out; for (const [k, v] of Object.entries(o)){ const p = Array.isArray(o) ? at + "[]" : at + "." + (at.endsWith(".bars") || at.endsWith(".b") ? "*" : k);
    if (!Array.isArray(o) && (k === OLD || k === "lane:" + OLD)) out.push(at + ".{key}"); scan(v, p, out); } return out; })`;
const act = (action, args) => ({op:"action", action, args});
(async()=>{
  try {
    const dir = folder();
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      const RD = w.Date, now = new RD("2026-10-07T14:00:00").getTime(); w.Date = class extends RD {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{}; w.showDirectoryPicker = async()=>dir;
      w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    await wait(150); const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
    w.FIX = FIX; w.OLD = OLD; w.NEW = NEW;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); download = ()=>{}; stopAuto(); loadExternal(FIX, 'sample')`); await wait(60);
    ev(`setMe(S.people[0].id); quickMode = true; file.handle = null; amTried = S.meta.planId; window.scan = ${SCAN};
      window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };
      commit(s=>{ s.baseline = baselineOf(s); s.snapshots = [snapOf("Before the change")]; s.reports = [{id:"rep-1", at:new Date().toISOString(), by:"", status:"ontrack", title:"This week", sections:{}, info:snapOf("x").info}]; });
      UI.filter = normFilter({lanes:[OLD]}); UI.fold = {...(UI.fold || {}), ["lane:" + OLD]:true}; UI.jiraWs = OLD; saveUI(); render();`);
    const cats = hits => [...new Set(hits)].sort();
    const before = cats(J("scan(S, 'plan', [])"));
    const WANT = ["plan.lanes[].id", "plan.bars[].lane", "plan.milestones[].lane", "plan.notes[].lane", "plan.meetings[].lane", "plan.types[].lane", "plan.blocks[].lane", "plan.deliverables[].lane",
      "plan.people[].lanes.{key}", "plan.planningGuide[].id", "plan.views[].def.filter.lanes[]", "plan.baseline.bars.*.lane", "plan.snapshots[].base.bars.*.lane", "plan.snapshots[].info.b.*[]", "plan.reports[].info.b.*[]"];
    ok("F1 the fixture names the workstream in every kind of place a plan can", WANT.every(x=>before.includes(x)), "missing: " + WANT.filter(x=>!before.includes(x)).join(", ") + " | has: " + before.join(", "));
    const withLane = J(`Object.keys(S).filter(k=>Array.isArray(S[k]) && S[k].some(x=>x && typeof x === "object" && "lane" in x))`);
    ok("F2 every collection whose items carry a workstream is one the rewrite knows", withLane.every(k=>["bars","milestones","flags","notes","meetings","types","blocks","deliverables"].includes(k)), withLane.join(","));
    const json0 = ev("JSON.stringify(S)"), undo0 = ev("past.length");

    // through the assistant: a staged change, always held for a person
    await ev("assistantConnect()"); await wait(30); ev("clearTimeout(assistantExportTimer); amSetLevel('all')");
    const batch = (id, changes) => JSON.stringify({kind:"sightline-amendments", version:1, planId:ev("S.meta.planId"), batchId:id, createdAt:new Date().toISOString(), source:"Planning bot", basedOn:{planRevision:ev("S.meta.revision || 0")}, changes});
    const stage = async (id, changes) => { dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", batch(id, changes))); await ev("assistantTick()"); await wait(60); };
    // a change written now, with the old id, to apply after the id change
    const later = batch("b2", [{id:"mv", summary:"Move a bar", ops:[act("initiative.setLane", {id:"m3", lane:"int"}), act("milestone.add", {id:"ms-later", what:"Paging ready", lane:OLD})]}]);
    await stage("b1", [{id:"reid", summary:"Make the id match the name", ops:[act("workstream.reid", {lane:OLD, id:NEW, prev:OLD})]}]);
    const k = J("amCheck(AM.file.changes[0], S)");
    ok("A1 a staged id change is ready, and says what it does", k.status === "ready" && k.lines.some(l=>l.includes(`from ${OLD} to ${NEW}`)), JSON.stringify(k.lines));
    ok("A1 …and a person always reviews it, even with Apply everything", ev("amRiskOf(AM.file.changes[0])") === "floor" && ev("actLane(S, OLD)") && !ev("actLane(S, NEW)"));
    await ev("amApply(['reid'])"); await wait(60);
    ok("A2 applied: the workstream has the new id, and keeps the old one", ev("!!actLane(S, NEW) && !actLane(S, OLD)") && J("actLane(S, NEW).was").join() === OLD);
    const after = cats(J("scan(S, 'plan', [])"));
    ok("A2 every reference moved: the old id is left only as the former id and in the change log", after.every(x=>x === "plan.lanes[].was[]" || x.startsWith("plan.changes")), after.join(", "));
    ok("A2 …and each place now names the new id", (()=>{ ev("window.OLD0 = OLD; OLD = NEW"); const c = cats(J("scan(S, 'plan', [])")); ev("OLD = OLD0"); return WANT.every(x=>c.includes(x)); })());
    ok("A3 as one update", ev("past.length") === undo0 + 1);
    ok("A4 this browser's filter, folded row and Jira pick follow it", J("UI.filter.lanes").join() === NEW && ev("!!UI.fold['lane:' + NEW] && !('lane:' + OLD in UI.fold)") && ev("UI.jiraWs") === NEW);
    ok("A5 the plan says it needs a copy that knows former ids", J("featuresIn(S)").includes("laneIds1") && ev("KNOWN_FEATURES.includes('laneIds1')") && J("JSON.parse(serialize(S, 'p.json')).meta.features").includes("laneIds1"));
    ok("A5 …so an older copy, which doesn't know it, opens it read-only", !!ev("tooNew({meta:{features:['laneIds1', 'laterThing9']}})") && !ev("tooNew({meta:{features:featuresIn(S)}})"));
    const V = J("assistantView()");
    { const ws = J("assistantView()").planning?.workstreams || []; const t = J("assistantView().jiraSort?.targets?.workstreams || []");
      ok("A6 the context lists the former id with the workstream, and Sort Jira work's targets do too", ws.some(x=>x.id === NEW && (x.was || []).includes(OLD)) && (!t.length || t.some(x=>x.id === NEW && (x.was || []).includes(OLD))), JSON.stringify(ws.find(x=>x.id === NEW))); }
    ok("A7 the action list tells assistants how to use it", JSON.stringify(V).includes("workstream.reid {lane, id, prev}"));

    // a file written before still resolves
    dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", later.replace(/"planRevision":\d+/, `"planRevision":${ev("S.meta.revision || 0")}`))); await ev("assistantTick()"); await wait(60);
    const k2 = J("amCheck(AM.file.changes[0], S)");
    ok("B1 a change that still says the old id is ready, with a note that it did", k2.status === "ready" && k2.notes.some(n=>n.includes(`Uses ${OLD}`) && n.includes(`read as ${NEW}`)), JSON.stringify(k2));
    await ev("amApply(['mv'])"); await wait(60);
    ok("B1 …and what it adds names the new id", ev("actMs(S, 'ms-later')?.lane") === NEW);
    ok("B2 a plan file that still says the old id somewhere (a teammate's older copy) reads as the new id", (()=>{ const o = J("JSON.parse(serialize(S, 'p.json'))"); o.bars[0].lane = OLD; o.notes.push({id:"note-old", text:"x", date:"2026-10-05", lane:OLD}); w.T = JSON.stringify(o);
      return ev("(p => p.bars[0].lane === NEW && p.notes.find(n=>n.id === 'note-old').lane === NEW)(normalize(JSON.parse(T), false))"); })());

    // never reused, and the rules for a new id
    const run = args => J(`(r => ({ok:r.ok, reason:r.reason || '', nochange:!!r.nochange}))(applyAction(S, "workstream.reid", ${JSON.stringify(args)}))`);
    ok("C1 an id another workstream has is refused", /already Integrations's id/.test(run({lane:"rag", id:"int"}).reason));
    ok("C2 an id a workstream had before is refused for any other", /was API v2's id before/.test(run({lane:"rag", id:OLD}).reason), run({lane:"rag", id:OLD}).reason);
    ok("C3 an id an initiative has is refused", /already used/.test(run({lane:"rag", id:"m1"}).reason));
    ok("C4 an id that breaks the rules is refused", ["", " api", "a b", "-x", "x".repeat(61), "constructor", "a/b"].every(v=>!run({lane:"rag", id:v}).ok));
    ok("C5 the same id again changes nothing", run({lane:NEW, id:NEW}).nochange || run({lane:NEW, id:NEW}).ok);
    ok("C6 a workstream can take back its own former id", run({lane:NEW, id:OLD}).ok);

    // one Undo puts every reference back (the later batch's two changes first)
    ev("undo()"); await wait(20); ev("undo()"); await wait(20);
    ok("U1 one Undo restores every reference", ev("JSON.stringify(S)") === json0, ev("JSON.stringify(S)").length + " vs " + json0.length);

    // the workstream's own panel
    ev("sel = {type:'lane', id:OLD}; render()"); await wait(5);
    const inp = d.querySelector("#f-lid"), go = d.querySelector("#f-lidgo");
    ok("P1 its panel shows the id, with what it's for", !!inp && inp.value === OLD && /Files, links and assistants use it/.test(d.querySelector("#f-lidhint").textContent));
    inp.value = "int"; go.click(); await wait(10);
    ok("P2 a taken id says why and changes nothing", /already Integrations's id/.test(d.querySelector("#f-lidhint").textContent) && ev("!!actLane(S, OLD)"));
    d.querySelector("#f-lid").value = NEW; d.querySelector("#f-lidgo").click(); await wait(10);
    ok("P3 a good one changes it everywhere, keeps the selection, and says so", ev("!!actLane(S, NEW)") && ev("sel && sel.id") === NEW && d.querySelector("#f-lid")?.value === NEW && new RegExp(`Was ${OLD}`).test(d.querySelector("#f-lidhint").textContent) && /Undo puts it back/.test(ev("$('#status')?.textContent || ''") + d.body.textContent));
    ev("undo()"); await wait(10);
    ok("P4 and Undo takes it back", ev("!!actLane(S, OLD) && !actLane(S, NEW)") && ev("JSON.stringify(S)") === json0);
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
