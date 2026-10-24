// 1.21: hide by person. An Added by filter; hiding what someone added (for you only, never Jira's work); hidden counts
// by reason; a link from work to hidden work it waits for; and undoing one change from Activity.
// Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
async function page(withFile){
  const handle = makeHandle("plan.json", plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  w.FIX = plan;
  if (withFile){ w.document.querySelector("#link").click(); await wait(200); } else ev("S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory();");
  ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = ()=>{}; setMe(S.people[0].id); window.ME = S.people[0].id; window.B = S.people[1].id;
    try { localStorage.removeItem("sightline-hide"); localStorage.removeItem("sightline-layer"); } catch(e){}
    const mk = (id, by, extra) => Object.assign({id, lane:S.lanes[0].id, start:1, span:2, label:id, kind:"work", owners:[], jira:"", epics:[], status:"notstarted", dependsOn:[], tasks:[], datesFrom:"manual", added:{by, at:"2026-09-20T10:00Z"}}, extra || {});
    S.bars.push(mk("byMe", ME), mk("byB", B), mk("jiraByB", B, {jira:"ABC-1", label:"ABC-1"}), mk("waiter", ME, {start:4, dependsOn:["byB"]}));
    S = normalize(JSON.parse(JSON.stringify(S)), false); setWs("timeline"); setZoom("weeks"); render();`);
  if (withFile) await ev(`(()=>{ const add = S.bars.filter(b=>["byMe","byB","jiraByB","waiter"].includes(b.id)).map(b=>clone(b)); return quickSave("setup", s=>{ add.forEach(b=>{ if (!s.bars.some(x=>x.id===b.id)) s.bars.push(b); }); }); })()`);
  return {w, d: w.document, ev, handle};
}
const has = (d, id) => !!d.querySelector(`#gantt [data-key="bar:${id}"]`);
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    ev("setHide(x=>{ x.people = [B]; })"); await wait(10);
    ok("H1: hiding a person hides what they added", !has(d, "byB") && has(d, "byMe"));
    ok("H1: but never what comes from Jira, even if they put it in the plan", has(d, "jiraByB"));
    ok("H2: the hidden line says how many, and whose", new RegExp(`hidden from your view \\(${ev("personName(B)")} \\d\\)`).test(d.querySelector("#hiddenStrip").textContent), d.querySelector("#hiddenStrip").textContent);
    ok("H3: it's kept for you, for this plan only", ev("JSON.stringify(JSON.parse(localStorage.getItem('sightline-hide'))[S.meta.planId].people)") === JSON.stringify([ev("B")]));
    const w0 = d.querySelector('#gantt [data-key="bar:waiter"]');
    ok("S1: work that waits on something hidden says so", !!w0 && /⇠ 1 hidden/.test(w0.textContent), w0 && w0.textContent);
    ev("goTo('bar', 'byB')"); await wait(20);
    ok("S1: and going to it shows it again", has(d, "byB") && !ev("hideActive()"));
    d.querySelector("#hsUnhide")?.click(); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("UI.filter = normFilter({authors:[B]}); saveUI(); render();"); await wait(10);
    ok("F1: the Added by filter shows only what that person added (and Jira's work)", has(d, "byB") && !has(d, "byMe") && has(d, "jiraByB"));
    ok("F1: it's a saved-view filter", ev("normViewDef({filter:{authors:['x']}}).filter.authors[0]") === "x" && /added by/.test(ev("scopeText()")));
    ev("UI.filter = normFilter({authors:['unknown']}); render();");
    ok("F2: Not recorded finds items from before names were tracked", !has(d, "byB") && ev("S.bars.filter(b=>!b.added && barVisible(b)).length") > 0); });

  await sec(async ()=>{ const {d, ev} = await page();
    d.querySelector("#filterBtn").click(); await wait(10);
    ok("F3: the filters show Added by and Hide from my view", /Added by/.test(d.querySelector("#filterPop").textContent) && !!d.querySelector('#fHide [data-hide]'));
    d.querySelector(`#fHide [data-hide="${ev("B")}"]`).click(); await wait(10);
    ok("F3: ticking a person there hides what they added", !has(d, "byB") && ev("hideOf().people.includes(B)")); });

  await sec(async ()=>{ const {d, ev, handle} = await page(true);
    await ev("quickSave('renamed', s=>{ s.bars.find(b=>b.id==='byMe').label = 'Renamed'; s.bars.find(b=>b.id==='byB').label = 'Also renamed'; })"); await wait(40);
    await ev("quickSave('teammate edit', s=>{ s.bars.find(b=>b.id==='byB').label = 'Changed again'; })"); await wait(40);
    const c = ev("JSON.stringify(S.changes.find(c=>c.what==='renamed'))");
    await ev(`undoChange(${c})`); await wait(60);
    const f = JSON.parse(handle._text);
    ok("U1: undoing one change puts back what nobody changed since", f.bars.find(b=>b.id==='byMe').label === "byMe", f.bars.find(b=>b.id==='byMe').label);
    ok("U1: and leaves what someone changed after it", f.bars.find(b=>b.id==='byB').label === "Changed again");
    ok("U1: and says so", /except 1 part someone changed since/.test(d.querySelector("#status").textContent), d.querySelector("#status").textContent);
    ev("UI.planTab = 'activity'; setWs('plan');"); await wait(10);
    ok("U2: each change in Activity offers Undo this", !!d.querySelector("#actList [data-undo]")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
