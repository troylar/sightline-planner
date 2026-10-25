// An assistant's change applies whole or not at all: a date the plan's own scheduling would put back (it waits on
// something that ends later) is refused with the reason, instead of the other half of the change landing alone.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function fileHandle(name, text = ""){ const hd = {name, text, permission:"granted", async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; }, async createWritable(){ let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
  const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00Z").getTime();
  w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
  w.showDirectoryPicker = async()=>w.DIR; w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{};
  w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
const set = (id, field, prev, value) => ({type:"initiative", op:"set", id, field, prev, value});
(async()=>{
  try {
    await wait(180); w.FIX = FIX; ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); download = ()=>{}; stopAuto(); loadExternal(FIX, 'sample')"); await wait(60); ev("if (S.people.length) setMe(S.people[0].id)");
    const dir = folder(); w.DIR = dir; ev("file.handle = null; amTried = S.meta.planId; window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; }");
    await ev("assistantConnect()"); await wait(30); ev("clearTimeout(assistantExportTimer); amSetLevel('review')");
    const V = J("assistantView()"), m4 = V.initiatives.find(b=>b.id === "m4"), m3 = V.initiatives.find(b=>b.id === "m3");
    const early = ev(`dayToIso(isoToDay(${JSON.stringify(m4.start)}) - 14)`), later = ev(`dayToIso(isoToDay(${JSON.stringify(m4.start)}) + 14)`);
    ok("setup: m4 waits on m3, which ends when m4 starts", J("barById('m4').dependsOn").includes("m3") && ev("S.meta.autoSchedule !== false"));
    const batch = (id, changes) => JSON.stringify({kind:"sightline-amendments", version:1, planId:ev("S.meta.planId"), batchId:id, createdAt:new Date().toISOString(), source:"Planning bot", basedOn:{planRevision:ev("S.meta.revision || 0")}, changes});
    const stage = async (id, changes) => { dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", batch(id, changes))); await ev("assistantTick()"); await wait(40); ev("sel = {type:'amend', id:'x'}; render()"); await wait(5); };

    // the reported case: start earlier and weeks longer, in one change
    await stage("b1", [{id:"both", summary:"Start earlier and run longer", ops:[set("m4", "start", m4.start, early), set("m4", "weeks", m4.weeks, m4.weeks + 2)]}]);
    const k = J(`amCheck(AM.file.changes[0], S)`);
    ok("P1 a start the schedule would put back makes the whole change wait, with why", k.status === "invalid" && k.reasons.some(r=>r.includes(`would start ${ev(`fmtDay(isoToDay(${JSON.stringify(m4.start)}))`)}, not ${ev(`fmtDay(isoToDay(${JSON.stringify(early)}))`)}`) && r.includes(`waits on ${m3.label}`)), JSON.stringify(k.reasons));
    ok("P1 …and review shows the reason, not a ready change", /would start/.test(d.querySelector('[data-am="both"]')?.textContent || ""), (d.querySelector('[data-am="both"]')?.textContent || "").slice(0, 200));
    const span0 = ev("barById('m4').span"), start0 = ev("barById('m4').start"); await ev("amApply(['both'])"); await wait(40);
    ok("P2 applying it changes nothing: not the start, and not the weeks either", ev("barById('m4').span") === span0 && ev("barById('m4').start") === start0);

    // the same move as an action
    await stage("b2", [{id:"act", summary:"Move it earlier", ops:[{op:"action", action:"initiative.move", args:{id:"m4", day:early, prev:{start:m4.start, weeks:m4.weeks}}}]}]);
    ok("P3 the same through initiative.move is refused the same way", J(`amCheck(AM.file.changes[0], S)`).status === "invalid" && /would start/.test(J(`amCheck(AM.file.changes[0], S)`).reasons.join(" ")));

    // what the schedule allows still applies, whole
    await stage("b3", [{id:"ok", summary:"Start later and run longer", ops:[set("m4", "start", m4.start, later), set("m4", "weeks", m4.weeks, m4.weeks + 2)]}]);
    ok("P4 a start after what it waits on is ready", J(`amCheck(AM.file.changes[0], S)`).status === "ready", JSON.stringify(J(`amCheck(AM.file.changes[0], S)`).reasons));
    const u0 = ev("past.length + quickDone.length"); await ev("amApply(['ok'])"); await wait(40);
    ok("P4 …and both halves land together, as one update", ev("amWeekIso(S, barById('m4').start)") === later && ev("barById('m4').span") === m4.weeks + 2 && ev("past.length + quickDone.length") === u0 + 1);
    ev("undo()"); await wait(40);
    ok("P4 …and one undo takes both back", ev("amWeekIso(S, barById('m4').start)") === m4.start && ev("barById('m4').span") === m4.weeks);

    // a change of weeks alone is untouched by this
    await stage("b4", [{id:"wk", summary:"Run longer", ops:[set("m4", "weeks", m4.weeks, m4.weeks + 1)]}]);
    ok("P5 weeks alone is still ready", J(`amCheck(AM.file.changes[0], S)`).status === "ready");
    ok("P6 a change with no dates is never replayed for scheduling, even on a new, empty plan", J(`amCheck({id:"add", summary:"Add", ops:[{op:"add", type:"deliverable", id:"dv-new", value:{name:"New one", target:"2028-Q1"}}]}, blankPlan())`).status === "ready");
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
