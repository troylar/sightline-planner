// Serves on Sprint cards: the deliverable a story rolls up to, linked on the story, its feature or its epic.
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
  await sec(async ()=>{ const {ev, d} = await page();
    ev(`const a = todayDay(), sp = {sprintId:42, sprintState:"active", sprint:"Sprint 42", sprintStart:dayToIso(a - 2), sprintEnd:dayToIso(a + 9)};
      JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:new Date().toISOString(), jiraBase:"https://jira.example.com", missing:[],
        rollups:{"E-1":{total:2, todo:2, children:["A-1","F-1"]}},
        issues:{"E-1":{summary:"Checkout epic", status:"To Do", category:"todo", type:"Epic", isEpic:true},
          "F-1":{summary:"Wallet feature", status:"To Do", category:"todo", type:"Feature", parent:"E-1"},
          "A-1":{summary:"Pay by card", status:"To Do", category:"todo", type:"Story", ...sp}, "A-2":{summary:"Wallet story", status:"To Do", category:"todo", type:"Story", parent:"F-1", ...sp},
          "A-3":{summary:"Receipt email", status:"To Do", category:"todo", type:"Story", ...sp}, "A-4":{summary:"Nothing linked", status:"To Do", category:"todo", type:"Story", ...sp}},
        sprints:[{id:42, name:"Sprint 42", state:"active", start:dayToIso(a - 2), end:dayToIso(a + 9)}]})); dropJiraMemos();
      S.deliverables = [{id:"dv-1", name:"Faster checkout", stage:"planned", target:quarterOf(a), jira:["E-1"]}, {id:"dv-2", name:"Email receipts", stage:"planned", target:quarterOf(a), jira:["A-3"]}, {id:"dv-3", name:"Dropped one", stage:"dropped", jira:["A-4"]}];
      UI.ws = "standup"; render();`); await wait(30);
    const sv = k => (d.querySelector(`[data-card*="${k}"] .suserves`) || {}).textContent || "";
    ok("V1 a story under the epic serves its deliverable", /Serves Faster checkout/.test(sv("A-1")), sv("A-1") || [...d.querySelectorAll(".sucard")].map(x=>x.dataset.card).join());
    ok("V2 so does a story under a feature under that epic", /Faster checkout/.test(sv("A-2")), sv("A-2"));
    ok("V3 a story linked on its own serves that one", /Email receipts/.test(sv("A-3")) && !/Faster/.test(sv("A-3")), sv("A-3"));
    ok("V4 nothing shows when nothing live links it (a dropped deliverable doesn't count)", !sv("A-4") && !!d.querySelector('[data-card*="A-4"]'));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
