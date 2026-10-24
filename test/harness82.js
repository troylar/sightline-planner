// Risks and decisions: next action, waiting on, escalate by, who decides; the ones past their escalate-by date (and
// decisions past when they were needed) show on Today and in the status update. Fails on the build before this.
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
    // Keep the fixed plan's unrelated work from aging into the capped risk summary.
    const RealDate = w.Date, now = new RealDate('2026-10-07T14:00:00Z').getTime();
    w.Date = class extends RealDate { constructor(...args){ args.length ? super(...args) : super(now); } static now(){ return now; } };
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
  await sec(async ()=>{ const {ev, d, handle} = await page(); await ev("startEditing(false)"); await wait(30);
    const F = () => JSON.parse(handle._text);
    ev(`setMe(S.people[0].id); const me = S.people[0].id, other = S.people[1].id, ago = n => dayToIso(todayDay() - n);
      commit(s=>{ s.decisions = [
        {id:"d1", text:"Pick the auth provider", state:"open", owners:[me], due:ago(-5), item:"", decider:other, next:"Get the security review back", waitingOn:"Security team", escalateBy:ago(2)},
        {id:"d2", text:"Freeze the API", state:"open", owners:[other], due:ago(1), item:""},
        {id:"d3", text:"Already decided", state:"decided", owners:[me], due:ago(9), item:"", escalateBy:ago(9)}];
        s.risks = [{id:"r1", sev:"med", text:"Vendor sandbox may slip", owners:[me], item:"", next:"Ask for a date", escalateBy:ago(0)},
                   {id:"r2", sev:"high", text:"Closed one", owners:[me], item:"", state:"closed", escalateBy:ago(5)}]; });
      UI.ws = "plan"; UI.planTab = "decisions"; render();`); await wait(20);
    const heads = [...d.querySelectorAll("#t-decisions th")].map(x=>x.textContent);
    ok("E1 decisions have Who decides, Next action, Waiting on, Escalate by", ["Who decides","Next action","Waiting on","Escalate by"].every(t=>heads.includes(t)), heads.join("|"));
    ev("setPlanTab('risks')");
    ok("E1b risks have Status, Next action, Waiting on, Escalate by", ["Status","Next action","Waiting on","Escalate by"].every(t=>[...d.querySelectorAll("#t-risks th")].map(x=>x.textContent).includes(t)));
    await ev("save()"); await wait(40);
    const f = F(), d1 = f.decisions.find(x=>x.id === "d1");
    ok("E2 the new fields save", d1.decider && d1.next === "Get the security review back" && d1.waitingOn === "Security team" && d1.escalateBy && (f.meta.features || []).includes("followUps") && f.risks.find(x=>x.id === "r2").state === "closed");
    ev(`UI.ws = "today"; UI.todayScope = "team"; render();`); await wait(20);
    const esc = [...d.querySelectorAll("#today .tsec")].find(x=>/Escalate/.test(x.querySelector("h3")?.textContent || ""));
    const keys = esc ? [...esc.querySelectorAll("li")].map(x=>x.dataset.tkey) : [];
    ok("E3 Today's Escalate lists what's past its date, not closed or decided ones", JSON.stringify(keys) === JSON.stringify(["decision:d1","decision:d2","risk:r1"]), JSON.stringify(keys));
    ok("E4 each says who decides, the next action and how far over", /Pick the auth provider/.test(esc.textContent) && /decides/.test(esc.textContent) && /next: Get the security review back/.test(esc.textContent) && /needed/.test(esc.querySelector('[data-tkey="decision:d2"]').textContent));
    ev(`UI.todayScope = "me"; render();`); await wait(20);
    const esc2 = [...d.querySelectorAll("#today .tsec")].find(x=>/Escalate/.test(x.querySelector("h3")?.textContent || ""));
    ok("E5 Mine shows the ones you own or decide", esc2 && [...esc2.querySelectorAll("li")].map(x=>x.dataset.tkey).join() === "decision:d1,risk:r1", esc2 ? [...esc2.querySelectorAll("li")].map(x=>x.dataset.tkey).join() : "none");
    ok("E6 the Today badge counts them", ev("todayCounts()") >= 2);
    const R = ev(`JSON.stringify(reportDraft().sections)`), RS = JSON.parse(R);
    ok("E7 the status update carries the next action and who decides", /Vendor sandbox may slip · next: Ask for a date · escalate by/.test(RS.risk) && /Pick the auth provider.*decides.*waiting on Security team/.test(RS.decisions), RS.risk.slice(0, 200));
    const N = JSON.parse(ev(`JSON.stringify(normalize({...JSON.parse(JSON.stringify(S)), decisions:[{id:"x", text:"t", decider:"nobody", escalateBy:"soon", next:"n".repeat(300)}]}, false).decisions[0])`));
    ok("E8 a file's values are checked", !N.decider && !N.escalateBy && N.next.length === 200);
    ev(`UI.ws = "plan"; UI.planTab = "decisions"; render();`); await wait(10);
    d.querySelector('#sec-decisions [data-add="decisions"]').click(); await wait(20);
    const last = ev("JSON.stringify(S.decisions[S.decisions.length - 1])");
    ok("E9 a new row starts without empty follow-up fields", !/"next"|"waitingOn"|"escalateBy"|"decider"/.test(last), last);
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
