// First run and quieter notices: reconnecting is one clear button; an empty shared plan says what's going on and how to
// set it up; an empty plan you're editing gets a checklist that ticks itself off; someone only reading a shared plan gets
// setup offers as one quiet line, while blockers stay in full. Fails on the build before this.
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
  await sec(async ()=>{ const {ev, d, handle} = await page(); await wait(300);
    ev(`window.PLAN0 = S; S = blankPlan(); locked = true; reconnectHd = {name:"team-plan.json"}; UI.ws = "timeline"; render();`); await wait(10);
    ok("F1 reconnecting shows one clear button, naming the file", /Reconnect team-plan.json to see the plan/.test(d.querySelector("#emptyReconnect")?.textContent || "") && !!d.querySelector("#emptyReconnectGo"));
    ev(`locked = false; reconnectHd = null; S = blankPlan(); file.holdLock = false; render();`); await wait(10);
    ok("F2 an empty shared plan you're reading says so and how to set it up", /nothing in it yet/.test(d.querySelector("#emptyShared")?.textContent || "") && !!d.querySelector("#emptyStart"), (d.querySelector(".empty") || {}).textContent);
    handle._text = ev("serialize(S, 'team-plan.json')");
    await ev("startEditing(false)"); await wait(40); ev("render()"); await wait(10);
    const steps = () => [...d.querySelectorAll("#emptySetup .sstep")].map(x=>x.dataset.step + (x.classList.contains("done") ? "+" : "-")).join(" ");
    ok("F3 editing it, a setup checklist: sharing already done here, Jira optional", /name- lanes- item- jira- share\+/.test(steps()) && /optional/.test(d.querySelector('[data-step="jira"]').textContent), steps());
    ev(`commit(s=>{ s.meta.title = "Checkout team"; })`); await wait(10);
    ok("F4 steps tick themselves off", /name\+/.test(steps()), steps());
    d.querySelector("#emptyAdd").click(); await wait(20);
    ok("F5 adding the first initiative, and the checklist is gone", ev("S.bars.length") === 1 && !d.querySelector("#emptySetup"));
  });
  await sec(async ()=>{ const {ev, d} = await page(); await wait(300);
    ev(`setBanner("jsprints", "warn", ["The plan's sprints aren't Jira's. ", "Use Jira's sprints"]); setBanner("draft", "warn", ["Unsaved edits from yesterday."]);`); await wait(10);
    const B = () => d.querySelector("#banners").textContent;
    ok("F6 reading a shared plan, a setup offer is one quiet line", /1 setup note for whoever runs this plan/.test(B()) && !/aren't Jira's/.test(B()), B().slice(0, 120));
    ok("F7 and a blocker still shows in full", /Unsaved edits from yesterday/.test(B()));
    d.querySelector("#noticeShow").click(); await wait(5);
    ok("F8 Show opens it", /aren't Jira's/.test(B()));
    ev("noticesOpen = false; drawBanners();"); await ev("startEditing(false)"); await wait(40);
    ev(`setBanner("jsprints", "warn", ["The plan's sprints aren't Jira's. ", "Use Jira's sprints"]);`);
    ok("F9 editing, setup offers show in full", /aren't Jira's/.test(B()) && !d.querySelector("#noticeLine"));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
