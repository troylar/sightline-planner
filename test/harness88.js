// Polish from review 15's delight pass, and the status line: it states the file's state without the buttons' labels
// run into it; Before we commit opens on the sprint being planned and asks before recording with things to look at;
// snapshots show all on request; the Deliverables row says where broader ones are; Today sums up what changed.
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
  await sec(async ()=>{ const {ev, d} = await page(); await wait(1200);
    ev("statusAt = 0; stripKey = 'changed|x|x|x|x|x'; renderEditStrip();"); await wait(30);
    const st = ev("document.querySelector('#status')?.textContent || ''");
    ok("P1 the status line has the file's state, not the buttons' labels", /Read-only · plan\.json/.test(st) && !/Start editing|Save as you go/.test(st) && !/\d(Start|Save)/.test(st), st);
    const J = (fut) => `JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:new Date().toISOString(), jiraBase:"https://jira.example.com", missing:[], rollups:{},
      issues:{"A-1":{summary:"One", status:"To Do", category:"todo", type:"Story", sprintId:43, sprintState:"future"}},
      sprints:[{id:42, name:"Sprint 42", state:"active", start:dayToIso(todayDay() - 5), end:dayToIso(todayDay() + 5)}, {id:43, name:"Sprint 43", state:"future", start:dayToIso(todayDay() + ${fut}), end:dayToIso(todayDay() + ${fut} + 13)}]})); dropJiraMemos(); UI.bwcSprint = null;`;
    ev(J(6) + "UI.ws = 'standup'; render();"); await wait(20);
    ok("P2 a week before the next sprint, Before we commit is about that sprint", /Sprint 43/.test(d.querySelector("#suCommit header").textContent));
    ev(J(12) + "render();"); await wait(20);
    ok("P3 otherwise it's about the sprint running now", /Sprint 42/.test(d.querySelector("#suCommit header").textContent));
    ev(J(6) + "render(); window.__asked = ''; window.confirm = m => { __asked = m; return false; };"); await wait(20);
    d.querySelector("#bwcRecord").click(); await wait(30);
    ok("P4 recording with things to look at asks first, naming them, and nothing is recorded if you say no", /Still to look at/.test(ev("__asked")) && /not estimated/.test(ev("__asked")) && !ev("(S.commitments || []).length"), ev("__asked").slice(0, 120));
    ev(`S.deliverables = [{id:"dv-h", name:"Broad", stage:"planned", target:(d0 => d0.slice(0, 4) + (+d0.slice(5, 7) <= 6 ? "-H1" : "-H2"))(dayToIso(startDay() + 20))}]; UI.ws = "timeline"; UI.zoom = "weeks"; render();`); await wait(20);
    const hdr = [...d.querySelectorAll(".sechdr")].find(x=>/Deliverables/.test(x.textContent));
    ok("P5 with only broader deliverables, the Timeline still says where they are", !!hdr && /1 broader, on the Roadmap/.test(hdr.textContent) && /Open the Roadmap/.test(hdr.textContent));
    ev(`setMe(S.people[0].id); const o = S.people[1].id, cut = sinceCut("week").at, at = i => new Date(cut + (Date.now() - cut) * (i + 1) / 16).toISOString(); S.changes = [...Array(15)].map((_, i)=>({id:"c" + i, by:o, at:at(i), what:"change " + i, ops:[]})); UI.sinceMode = "week"; UI.ws = "today"; render();`); await wait(20);
    ok("P6 Today sums up what changed under its heading", /15 changes since Monday/.test(d.querySelector("#tSinceSum")?.textContent || ""), d.querySelector("#tSinceSum")?.textContent || "none");
    ok("P7 and past the first 12, See all opens Activity", !!d.querySelector("#tSinceAll") && (d.querySelector("#tSinceAll").click(), ev("UI.ws === 'plan' && UI.planTab === 'activity'")));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
