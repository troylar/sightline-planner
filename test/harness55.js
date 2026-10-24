// Bitbucket pull requests, read from Jira's development panel by the sync: a PRs field on cards, a "PR waiting 3+
// days" quick filter, the PRs on a Jira item's card, and an Open pull requests panel (oldest first, stale counted).
// Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const JS = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-20":{summary:"Leaf story", status:"In Progress", category:"inprogress", type:"Story", sprintId:42, sprint:"Sprint 42", sprintState:"active", sprintStart:"2026-09-21", sprintEnd:"2026-10-02", assignee:"Avery S.", assigneeKey:"JIRAUSER1", labels:[]},
    "ABC-1":{summary:"Checkout epic", status:"In Progress", category:"inprogress", type:"Epic", labels:[]},
    "ABC-21":{summary:"Pay by card", status:"Done", category:"done", type:"Story", sprintId:42, sprint:"Sprint 42", sprintState:"active", sprintStart:"2026-09-21", sprintEnd:"2026-10-02", assignee:"Blake L.", assigneeKey:"JIRAUSER2", labels:[]},
    "ABC-22":{summary:"Gift cards", status:"To Do", category:"new", type:"Story", sprintId:43, sprint:"Sprint 43", sprintState:"future", sprintStart:"2026-10-05", sprintEnd:"2026-10-16", assignee:"", labels:[]}},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-21", end:"2026-10-02"}], rollups:{"ABC-1":{children:["ABC-21","ABC-22"]}}});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s => w.eval(s); await wait(200);
  w.FIX = plan; w.JS = JS;
  ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); setMe(S.people[0].id);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length && b.lane); window.J = L[0].id; L[0].jira = "ABC-20"; window.E = L[1].id; L[1].epics = ["ABC-1"]; L[1].jira = "";
    window.P = L.find(b=>b !== L[0] && b !== L[1] && peopleOf(b).length && wkDay(b.start) <= todayDay() && barEndDay(b) >= todayDay())?.id;
    S.people[1].jira = {key:"JIRAUSER2", name:"Blake L."};
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JS); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
const row = (d, id) => d.querySelector(`#standupWs .surow[data-person="${id}"]`);
const col = (r, i) => r ? r.querySelectorAll(".sucol")[i] : null;
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  const addDev = `const o = JSON.parse(JS); o.dev = {"ABC-21":{branches:1, prs:[{title:"Pay by card: API", url:"https://bb.example.com/pr/7", status:"OPEN", author:"Avery", repo:"web", updated:"2026-09-22T10:00:00.000+0000", reviewers:2, approved:1},
      {title:"Evil", url:"javascript:alert(1)", status:"OPEN", author:"", repo:"", updated:"2026-09-29T10:00:00.000+0000", reviewers:0, approved:0}]}, "ABC-20":{branches:0, prs:[{title:"Merged", url:"https://bb.example.com/pr/1", status:"MERGED"}]}};
    JIRA = parseJiraStatus(JSON.stringify(o));`;

  await sec(async ()=>{ const {d, ev} = await page(); ev(addDev + " UI.cards = {fields:['prs']}; goWs('standup')"); await wait(10);
    const t = d.querySelector('#standupWs [data-card="story:ABC-21"] .sufields')?.textContent || "";
    ok("P1: cards can show open pull requests, approved and waiting", /2 open PRs · 1 approved · waiting/.test(t), t);
    ok("P1: and say when there are none", /no open PRs/.test(d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"] .sufields')?.textContent || ""));
    d.querySelector('#cardsBar [data-quick="stalepr"]').click(); await wait(10);
    ok("P2: 'PR waiting 3+ days' shows just those", !!d.querySelector('#standupWs [data-card="story:ABC-21"]') && !d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"]')); });

  await sec(async ()=>{ const {d, ev} = await page(); ev(addDev + " UI.cards = {}; goWs('standup')"); await wait(10);
    const rows = [...d.querySelectorAll("#suPrs tbody tr")];
    ok("P3: an Open pull requests panel, oldest first, stale counted", rows.length === 2 && /Pay by card: API/.test(rows[0].textContent) && rows[0].classList.contains("prstale") && /1 with no update in 3\+ days/.test(d.querySelector("#suPrs header").textContent));
    ok("P3: a link that isn't https isn't a link", !d.querySelector('#suPrs a[href^="javascript"]') && !!d.querySelector('#suPrs a[href="https://bb.example.com/pr/7"]'));
    ok("P3: merged ones aren't in the Active list", ![...d.querySelectorAll('#suPrs tbody tr')].some(r=>/MERGED|merged/i.test(r.querySelector('a')?.textContent || '')) && /Active/.test(d.querySelector('#suPrs [aria-pressed=true]')?.textContent || '')); });

  await sec(async ()=>{ const {d, ev} = await page(); ev(addDev + " select('bar', J);"); await wait(10);
    ev(`(()=>{ const b = barById(J); b.jira = "ABC-21"; render(); select('bar', J); })()`); await wait(10);
    const t = d.querySelector("#side #f-jfacts")?.textContent || "";
    ok("P4: a Jira item's card lists its pull requests", /Pull requests/.test(t) && /Pay by card: API/.test(t) && /1\/2 approved/.test(t), t.slice(0, 200)); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
