// Undo for quick updates (Park, Put on the board, switching stories) on a shared plan, and Epics groups that stay open.
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
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const epic = s => ({summary:s, status:"In Progress", category:"inprogress", type:"Feature", isEpic:true});
const EP = {}; for (let i = 0; i < 12; i++) EP[`ABC-${i + 1}`] = epic(`Epic ${i + 1}`);
const listing = JSON.stringify({kind:"sightline-jira-issues", version:2, generatedAt:at, jiraBase:"https://jira.example.com",
  searches:[{name:"Epics", jql:"x", total:12, keys:Object.keys(EP)}], issues:Object.entries(EP).map(([key, v])=>({key, ...v}))});
(async()=>{
  const handle = makeHandle("team.json", plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s => w.eval(s); await wait(250);
  const fileJson = () => JSON.parse(handle._text);
  try {
    d.querySelector("#link").click(); await wait(200);
    ev("askWhoOnStart = ()=>{}; setMe(S.people[0]?.id || null); whoAmI = (x, cb) => cb();");
    w.LISTING = listing; ev("JIRA_ISSUES = parseJiraIssues(LISTING); UI.planTab = 'epics'; setWs('plan');"); await wait(30);
    ok("setup: a shared plan, not in an editing session", ev("!!file.handle && !editable()") === true);
    await ev("parkMany(['ABC-1','ABC-2'])"); await wait(60);
    ok("U1: parking saves to the shared file right away", JSON.stringify(fileJson().meta.jiraSkip) === '["ABC-1","ABC-2"]');
    ok("U1: and Undo is available, naming what it undoes", d.querySelector("#undo").disabled === false && /2 epics parked/.test(d.querySelector("#undo").title), d.querySelector("#undo").title);
    ok("U1: a toast offers Undo too", /Undo/.test(d.querySelector(".toast, #toast")?.textContent || ""));
    // a teammate parks another epic meanwhile
    const j = fileJson(); j.meta.jiraSkip.push("ABC-9"); j.meta.revision = (j.meta.revision || 0) + 1; handle._text = JSON.stringify(j);
    ev("undo()"); await wait(80);
    ok("U2: Undo writes the reverse to the file", !fileJson().meta.jiraSkip.includes("ABC-1") && !fileJson().meta.jiraSkip.includes("ABC-2"));
    ok("U2: and keeps a teammate's newer change", fileJson().meta.jiraSkip.includes("ABC-9"), JSON.stringify(fileJson().meta.jiraSkip));
    ok("U2: then Redo is available", d.querySelector("#redo").disabled === false);
    ev("redo()"); await wait(80);
    ok("U3: Redo parks them again", ["ABC-1","ABC-2","ABC-9"].every(k=>fileJson().meta.jiraSkip.includes(k)));
    await ev("batchOn(['ABC-5'], S.lanes[0].id)"); await wait(60);
    ok("U4: putting an epic on the board adds an initiative", fileJson().bars.some(b=>(b.epics||[]).includes("ABC-5")));
    ev("undo()"); await wait(80);
    ok("U4: and Undo removes that initiative again", !fileJson().bars.some(b=>(b.epics||[]).includes("ABC-5")));
    // Parked group stays open across a redraw
    const pg = () => d.querySelector("#jiraWs .egroup.parked");
    pg().open = true; pg().dispatchEvent(new w.Event("toggle")); ev("renderJiraWs()");
    ok("G1: an Epics group you opened stays open when the page redraws", pg().open === true);
    d.querySelector('#jiraWs .egroup.parked [data-on]')?.click(); await wait(60);
    ok("G1: including after Back on", pg()?.open === true);
    // sprints from Jira when the plan starts before Jira's first sprint (as in the screenshot): plan Jul 27, Jira from Aug 24
    ev(`S.meta.start = "2026-07-27"; S.meta.weeks = 28; S.sprints = Array.from({length:14}, (_, i) => ({id:"sp" + i, name:i === 12 ? "Hardening" : "Sprint " + (40 + i), weeks:2, goal:""}));
      JIRA = {...(JIRA || {}), issues:{}, rollups:{}, missing:[], sprints: Array.from({length:6}, (_, i) => { const s = new Date(Date.UTC(2026, 7, 24 + 14 * i)); const e = new Date(s.getTime() + 11 * 864e5);
        return {id:40 + i, name:"Sprint " + (40 + i), state: i < 2 ? "closed" : i === 2 ? "active" : "future", start:s.toISOString().slice(0,10), end:e.toISOString().slice(0,10), goal:""}; })};`);
    const P = JSON.parse(ev("JSON.stringify(sprintProposal())"));
    ok("P1: the weeks before Jira's first sprint are called that, with a note on how to start the plan there", P.rows[0].lead === true && P.rows[0].name === "Before Sprint 40" && P.notes.some(n=>/starts 4 weeks before Sprint 40/.test(n)));
    const after = P.rows.filter(r=>r.plan).map(r=>r.name);
    ok("P2: the plan's own sprints after Jira's last continue Jira's numbering", after[0] === "Sprint 46" && after[1] === "Sprint 47", after.join(", "));
    ok("P2: a named sprint keeps its name", after.includes("Hardening"), after.join(", "));
    ok("no page errors", !w.errs.length, w.errs.join("; "));
  } catch(e){ ok("crashed", false, String(e.message).slice(0,160)); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
