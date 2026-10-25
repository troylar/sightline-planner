// Snapshots: save a named copy (in the shared file), compare today with it, drive the Timeline's slip marks from it.
// Fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; if (h.cross){ const c = h.cross; h.cross = null; h._text = c(h._text); } }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
async function page(fileText){
  const handle = makeHandle("plan.json", fileText || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(250);
  const ev = s => w.eval(s);
  w.document.querySelector("#link").click(); await wait(200);
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb();");
  return {w, d: w.document, ev, handle};
}

(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  await sec(async ()=>{ const {ev, d, handle} = await page();
    const F = () => JSON.parse(handle._text);
    ev(`setMe(S.people[0].id); UI.ws = "plan"; UI.planTab = "snapshots"; render();`); await wait(20);
    ok("Z1 Delivery has a Snapshots page", !!d.querySelector('#snp-delivery [data-section="snapshots"]') && !!d.querySelector("#snapAdd"));
    d.querySelector("#snapName").value = "Q4 commit"; d.querySelector("#snapAdd").dispatchEvent(new d.defaultView.Event("submit", {cancelable:true})); await wait(80);
    const f1 = F(), sn = (f1.snapshots || [])[0];
    ok("Z2 saving writes it to the shared file", sn && sn.name === "Q4 commit" && Object.keys(sn.info.b).length === f1.bars.length && (f1.meta.features || []).includes("snapshots"), sn ? sn.name : "none");
    ok("Z3 it opens its comparison: nothing changed yet", /Nothing has changed since then/.test(d.querySelector("#snapCmp")?.textContent || ""));
    const leaf = ev(`(S.bars.find(b=>!(b.epics||[]).length && !S.bars.some(c=>c.parent === b.id || (c.dependsOn||[]).includes(b.id)) && !(b.dependsOn||[]).length && !(b.tasks||[]).length && b.status !== "done") || {}).id`);
    const other = ev(`S.bars.find(b=>b.id !== "${leaf}" && !S.bars.some(c=>c.parent === b.id || (c.dependsOn||[]).includes(b.id)) && !(b.tasks||[]).length && b.status !== "done").id`);
    await ev(`quickSave("move", s=>{ s.bars.find(b=>b.id === "${leaf}").start += 2; })`); await wait(40);
    await ev(`quickSave("done", s=>{ s.bars.find(b=>b.id === "${other}").status = "done"; })`); await wait(40);
    await ev(`quickSave("add", s=>{ s.bars.push({id:"bar-new1", lane:s.lanes[0].id, start:1, span:1, label:"Brand new", kind:"work", owners:[], jira:"", epics:[], status:"notstarted", dependsOn:[], tasks:[], datesFrom:"manual"}); s.deliverables = [{id:"dv-z", name:"Z deliverable", stage:"planned", target:"2027-Q1"}]; })`); await wait(40);
    ev("render()"); await wait(20);
    const grp = k => d.querySelector(`#snapCmp [data-grp="${k}"]`)?.textContent || "";
    ok("Z4 a moved item shows as later, by working days", /Later than then \(1\)/.test(grp("slipped")) && /10 working days/.test(grp("slipped")), grp("slipped"));
    ok("Z5 finished and added show", /Finished since \(1\)/.test(grp("finished")) && /Brand new/.test(grp("added")) && /Z deliverable/.test(grp("added")), grp("finished") + " | " + grp("added"));
    ok("Z6 lines open their item", !!d.querySelector('#snapCmp [data-grp="slipped"] button'));
    d.querySelector(`[data-snaptl="${sn.id}"]`).click(); await wait(80);
    ok("Z7 Show slip on the Timeline makes it the baseline", F().baseline && F().baseline.snap === sn.id && F().baseline.name === "Q4 commit" && /^Since Q4 commit:/.test(ev("baselineStory()")), ev("baselineStory()"));
    ok("Z8 and the list says it's on the Timeline", /On the Timeline/.test(d.querySelector(`[data-snap="${sn.id}"]`).textContent));
    ev("window.confirm = () => true"); d.querySelector(`[data-snapdel="${sn.id}"]`).click(); await wait(80);
    ok("Z9 deleting removes it for everyone; the Timeline's slip stays", !(F().snapshots || []).length && F().baseline && F().baseline.name === "Q4 commit");
    const bad = ev(`JSON.stringify(normalize({...JSON.parse(JSON.stringify(S)), snapshots:[...Array(15)].map((_, i)=>({id:"s" + i, name:"n" + i, takenAt:"2026-09-01T00:00:00Z", base:{}, info:{b:JSON.parse('{"__proto__":["x","2026-09-01","2026-09-02","done","l",0],"ok1":["Fine","2026-09-01","2026-09-02","bogus","l",0]}')}}))}, false).snapshots)`);
    const B = JSON.parse(bad);
    ok("Z10 a file's snapshots are checked: all 15 kept (merges may pass 12; 24 at most), no unsafe keys, known statuses", B.length === 15 && Object.keys(B[0].info.b).join() === "ok1" && Object.getPrototypeOf(B[0].info.b) === Object.prototype && B[0].info.b.ok1[3] === "notstarted");
    ev(`S.snapshots = [...Array(12)].map((_, i)=>({id:"s" + i, name:"n" + i, takenAt:"2026-09-01T00:00:00Z", by:"", base:{}, info:{b:{}, t:{}, m:{}, dv:{}}}))`);
    const r = await ev(`saveSnapshot("one too many")`);
    ok("Z11 a 13th is refused with the reason", r === false && /up to 12 snapshots/.test(ev("document.querySelector('#status')?.textContent || ''")));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
