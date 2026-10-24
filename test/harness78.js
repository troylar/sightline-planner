// Deliverables on the Timeline: planned ones with a quarter, date or release get a row under Releases, spanning their
// linked Jira work's sprints; broader ones stay on the Roadmap. Fails on the build before this.
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
    ok("T0 no deliverables, no row", !d.querySelector(".dvrow"));
    ev(`const a = startDay(), iso = n => dayToIso(n);
      JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
        issues:{"A-1":{summary:"s", status:"Done", category:"done", type:"Story", sprintId:42, sprintState:"active", sprintStart:iso(a + 28), sprintEnd:iso(a + 41)},
                "A-2":{summary:"t", status:"To Do", category:"todo", type:"Story", sprintId:43, sprintState:"future", sprintStart:iso(a + 42), sprintEnd:iso(a + 55)}},
        sprints:[], releases:[{id:"7", name:"v2.0", date:iso(a + 60), project:"A"}]})); dropJiraMemos();
      S.deliverables = [
        {id:"dv-q", name:"Quarter only", stage:"planned", target:quarterOf(a + 10)},
        {id:"dv-j", name:"With Jira", stage:"planned", target:quarterOf(a + 10), jira:["A-1","A-2"]},
        {id:"dv-r", name:"In a release", stage:"planned", release:"7", target:quarterOf(a + 60)},
        {id:"dv-h", name:"Broad half", stage:"planned", target:dayToIso(a).slice(0,4) + (+dayToIso(a).slice(5,7) <= 6 ? "-H1" : "-H2")},
        {id:"dv-i", name:"Just an idea", stage:"idea"}, {id:"dv-x", name:"Dropped", stage:"dropped", target:quarterOf(a + 10)}];
      UI.ws = "timeline"; render();`); await wait(20);
    const ids = [...d.querySelectorAll(".dvrow [data-dvtl]")].map(x=>x.dataset.dvtl);
    ok("T1 a Deliverables row lists the planned, timed ones", JSON.stringify(ids.sort()) === JSON.stringify(["dv-j","dv-q","dv-r"]), JSON.stringify(ids));
    ok("T2 broader ones are counted, not drawn", /1 broader, on the Roadmap/.test(d.querySelector(".dvrow").previousElementSibling.textContent), d.querySelector(".dvrow").previousElementSibling.textContent);
    const bar = d.querySelector('[data-dvtl="dv-j"]'), exp = ev("dayToAt(startDay() + 28) / S.meta.weeks * 100");
    ok("T3 with Jira work, it starts at its first sprint", Math.abs(parseFloat(bar.style.left) - exp) < 0.01, `${bar.style.left} vs ${exp}`);
    ok("T4 and shows its progress", /1\/2/.test(bar.textContent), bar.textContent);
    ok("T5 no Jira work yet: a faint band across the quarter", d.querySelector('[data-dvtl="dv-q"]').classList.contains("band") && !bar.classList.contains("band"));
    ok("T6 a release marks its ship day", d.querySelectorAll(".dvrow .dvtl-ship").length === 1);
    bar.click(); await wait(20);
    ok("T7 clicking opens the deliverable", ev("sel && sel.type === 'deliverable' && sel.id === 'dv-j'") && ev("UI.ws") === "timeline" && [...d.querySelectorAll("#side input, #side textarea")].some(x=>x.value === "With Jira") || /With Jira/.test(d.querySelector("#side")?.textContent || ""), `sel ${ev("JSON.stringify(sel)")}, ws ${ev("UI.ws")}, side ${(d.querySelector("#side")?.textContent || "").slice(0, 60)}`);
    ok("T8 nothing is saved or made unsaved by drawing it", !ev("file.dirty"));
    ev(`UI.zoom = "days"; sel = null; render(); dayScrollTo(startDay() + 28);`); await wait(30);
    const dids = [...d.querySelectorAll(".dvrow [data-dvtl]")].map(x=>x.dataset.dvtl);
    ok("T9 the Days view has the row too", d.querySelector("#gantt").classList.contains("days") && dids.includes("dv-j"), JSON.stringify(dids));
    const dbar = d.querySelector('.dvrow [data-dvtl="dv-j"]'), dexp = ev("DV.colOf(startDay() + 28) / DV.N * 100");
    ok("T10 and there it starts on its first sprint's first working day", Math.abs(parseFloat(dbar.style.left) - dexp) < 0.01, `${dbar.style.left} vs ${dexp}`);
    ok("T11 with the ship day marked, and clicking opens it", d.querySelectorAll(".dvrow .dvtl-ship").length >= 1 && (dbar.click(), ev("sel && sel.id === 'dv-j'")));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
