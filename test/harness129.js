// Edit offers each action's own fields (docs/assistant-workflow.md, "Batches apply in order"): a milestone move shows its
// date and whether it's the stretch date, checked the same way as the assistant's version; an action with nothing to edit
// says so instead of an empty box; and a cleared stretch date reads "stretch date cleared", not "move true -> null".
// Fixture: fixtures/batch-plan.js with its own changes on the sample plan.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), batch = require("./fixtures/batch-plan.js"), {act} = batch;
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 85000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function fileHandle(name, text = ""){ const hd = {name, text, writes:0, failWrite:false, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
  async createWritable(){ if (hd.failWrite) throw new Error("The disk is full"); let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; hd.writes++; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), onGet:null, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (dir.onGet) await dir.onGet(name, o); if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
async function page(){
  const hd = fileHandle("plan.json"), dir = folder();
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{}; w.showDirectoryPicker = async()=>dir;
    w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
    w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})}); w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
    w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  await wait(180); const w = dom.window, ev = s=>w.eval(s), d = w.document; w.FIX = sample; w.HD = hd;
  ev(`stopAuto(); S = normalize(JSON.parse(FIX), false); HD.text = serialize(S, HD.name); installPlan(S, HD.text, HD); amTried = S.meta.planId;
    whoAmI = (x, cb)=>cb(); askWhoOnStart = ()=>{}; askName = ()=>'Tester'; download = ()=>{}; render(); setMe(S.people[0].id);
    window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };`);
  await ev("assistantConnect()"); await wait(30);
  const send = (o = {}) => dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", batch(ev("S.meta.planId"), ev("S.meta.revision || 0"), ev("barById('m4').label"), o)));
  const tick = async()=>{ await ev("assistantTick()"); await wait(40); };
  const exportNow = async()=>{ ev("clearTimeout(assistantExportTimer)"); await ev("assistantExport()"); };
  const rows = () => JSON.parse(ev("JSON.stringify(amRows().map(r=>({id:r.c.id, group:r.group, status:r.r.status, after:r.after, needs:r.needs, why:r.r.reasons.join(' ')})))"));
  const show = async()=>{ ev("sel = {type:'amend', id:'x'}; render()"); await wait(5); };
  const results = () => JSON.parse(dir.files.get("sightline-assistant-results.json").text), context = () => JSON.parse(dir.files.get("sightline-assistant-view.json").text);
  return {w, ev, d, hd, dir, send, tick, rows, show, exportNow, results, context};
}
const byId = (rs, id) => rs.find(r=>r.id === id) || {};
(async()=>{
  try {
    let {w, ev, d, send, tick, rows, show} = await page();
    const iso = ev("amWeekIso(S, S.milestones.find(m=>m.id === 'ms1').at)");
    const changes = [{id:"mv", summary:"Move the go/no-go", ops:[act("milestone.move", {id:"ms1", day:"2026-10-12"})]},
      {id:"clr", summary:"Clear a stretch date that's clear", ops:[act("milestone.move", {id:"ms1", day:null, stretch:true})]},
      {id:"st", summary:"Move a stretch date", ops:[act("milestone.move", {id:"ms2", day:"2026-10-19", stretch:true})]},
      {id:"lk", summary:"Wait for another initiative", ops:[act("link.remove", {id:"m2", after:"m1"})]}];
    send({changes, batchId:"edit-1"}); await tick(); await show();
    const row = id => d.querySelector(`[data-am="${id}"]`);
    ok("S1 a cleared stretch date reads plainly", /stretch date cleared \(already so\)/.test(row("clr").textContent) && !/true|null/.test(row("clr").querySelector(".amlines").textContent), row("clr").querySelector(".amlines")?.textContent);
    ok("S2 a move reads as a move to a date", /Move ".*" to Oct 12/.test(row("mv").querySelector(".amlines").textContent) && /stretch date Oct 19/.test(row("st").querySelector(".amlines").textContent), row("mv").querySelector(".amlines")?.textContent);
    row("st").querySelector("[data-amedit]").click(); await wait(10);
    const day = d.getElementById("amed-st-0-day"), str = d.getElementById("amed-st-0-stretch");
    ok("E1 Edit on a milestone move shows its date and the stretch choice, filled in", !!day && day.value === "2026-10-19" && !!str && str.value === "yes", [day?.value, str?.value].join(","));
    day.value = "2026-10-26"; d.querySelector('[data-amsave="st"]').click(); await wait(20);
    ok("E2 Saving checks the edit the same way: it's ready, edited, and reads the new date", byId(rows(), "st").status === "ready" && /Edited by you/.test(row("st").textContent) && /stretch date Oct 26/.test(row("st").textContent));
    row("st").querySelector("[data-amedit]").click(); await wait(10);
    d.getElementById("amed-st-0-day").value = "not a date"; d.querySelector('[data-amsave="st"]').click(); await wait(20);
    ok("E3 a date that isn't one is refused with the reason, and the earlier edit is kept", /Not saved: day isn't a valid date/.test(ev("$('#status').textContent")) && ev("amEff(AM.file.batchId, AM.file.changes[2]).ops[0].args.day") === "2026-10-26", ev("$('#status').textContent"));
    ev("UI.amEditing = null; render()"); await wait(5);
    row("mv").querySelector("[data-amedit]").click(); await wait(10);
    d.getElementById("amed-mv-0-stretch").value = "yes"; d.querySelector('[data-amsave="mv"]').click(); await wait(20);
    ok("E4 the yes/no choice changes what the change moves", ev("amEff(AM.file.batchId, AM.file.changes[0]).ops[0].args.stretch") === true && /stretch date Oct 12/.test(row("mv").textContent));
    row("lk").querySelector("[data-amedit]").click(); await wait(10);
    ok("E5 an action with nothing to edit says so, instead of an empty box", /This change can't be edited here; skip it and ask your assistant\./.test(row("lk").querySelector(".amedit")?.textContent || "") && !row("lk").querySelector(".amedit input, .amedit select"));
    ok("E6 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
