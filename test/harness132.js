// What the assistant knows (docs/assistant-workflow.md): workstream guidance where people look, skills on people and
// needs on work, milestone stories, gate descriptions, hints for the assistant, the actions that change all of them,
// the context that carries them (trimmed in a set order, with what's missing counted first), and an older copy opening
// such a plan read-only. Also initiative.move taking prev as the context shows it. Synthetic plan: fixtures/ai-context.js.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const fixture = require("./fixtures/ai-context.js"), HOSTILE = fixture.HOSTILE;
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 85000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function fileHandle(name, text = ""){ const hd = {name, text, permission:"granted", async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; }, async createWritable(){ let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
  const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00Z").getTime();
  w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
  w.showDirectoryPicker = async()=>w.DIR; w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
  w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})});
  w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
const peek = async (type, id, root = "") => { ev(`openPeek(document.querySelector('${root} [data-peek-type="${type}"][data-peek-id="${id}"]'))`); await wait(5); return d.querySelector("#peek"); };
const run = (id, args) => J(`(()=>{ const p = clone(S); const r = runAction(p, ${JSON.stringify(id)}, ${JSON.stringify(args)}); return {r, p}; })()`);
(async()=>{
  try {
    await wait(180); ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); download = ()=>{}");
    w.FIX = fixture(); ev("stopAuto(); loadExternal(FIX, 'ai-context')"); await wait(40); ev("setMe('p-avery'); sel = null; goWs('timeline'); setZoom('weeks'); render()");

    // the plan keeps them
    ok("D1 the catalog loads, and a label that repeats another (ignoring case and spaces) is dropped", J("S.skills.map(x=>x.id)").join() === "sk-api,sk-a11y,sk-data,sk-load", J("S.skills.map(x=>x.id)").join());
    ok("D1 …people keep their skills, minus any the catalog doesn't have", J("personById('p-avery').skills").join() === "sk-api,sk-a11y" && J("personById('p-blake').skills").join() === "sk-api" && ev("personById('p-casey').skills") === undefined);
    ok("D1 …work keeps its needs and hints, a milestone its story, a gate its description", J("barById('c1').needs").join() === "sk-api,sk-data" && /pairing/.test(ev("barById('m1').aiHint")) && /Pilot users/.test(ev("S.milestones.find(m=>m.id === 'ms2').story")) && /Why it matters/.test(ev("gateById('g-auth').description")));
    ok("D1 …and a hint is cut to 500 characters", ev(`normalize({lanes:[{id:"a", name:"A"}], bars:[{id:"b", lane:"a", label:"x", aiHint:"h".repeat(600)}]}, false).bars[0].aiHint.length`) === 500);
    const F = J("featuresIn(S)");
    ok("D2 the plan names each new part (skills1, aiHint1, msStory1, descriptions1), and this copy knows them", ["skills1", "aiHint1", "msStory1", "descriptions1"].every(f=>F.includes(f) && J("KNOWN_FEATURES").includes(f)), F.join());
    ok("D2 …each on its own", J(`[featuresIn({skills:[{id:"s", label:"S"}]}), featuresIn({people:[{id:"p", aiHint:"x"}]}), featuresIn({milestones:[{id:"m", story:"x"}]}), featuresIn({gates:[{id:"g", description:"x"}]}), featuresIn({bars:[{id:"b", tasks:[{id:"t", needs:["s"]}]}]})]`).map(x=>x.join()).join("|") === "skills1|aiHint1|msStory1|descriptions1|skills1");
    for (const f of ["skills1", "aiHint1", "msStory1", "descriptions1"]){ ev(`KNOWN_FEATURES.splice(KNOWN_FEATURES.indexOf('${f}'), 1)`);
      ok(`D3 a copy that doesn't know ${f} opens the plan read-only`, !!J(`tooNew(normalize({...S, meta:{...S.meta, features:featuresIn(S)}}, false))`)); ev(`KNOWN_FEATURES.push('${f}')`); }
    { const back = J("normalize(JSON.parse(JSON.stringify(portablePlan(planOfRecord(S)))), false)"), pick = p => JSON.stringify([p.skills, p.people.map(x=>[x.skills, x.aiHint]), p.bars.map(b=>[b.needs, b.aiHint, (b.tasks || []).map(t=>t.needs)]), p.milestones.map(m=>[m.story, m.aiHint]), p.gates.map(g=>g.description)]);
      ok("D4 saving and opening again keeps every one of them", pick(back) === pick(J("S"))); }

    // skills
    let x = run("skill.add", {id:"sk-new", label:" api design"});
    ok("K1 a skill whose label repeats another, ignoring case, is refused", !x.r.ok && /already a skill called API design/.test(x.r.reason), x.r.reason);
    x = run("skill.rename", {id:"sk-api", label:"Interface design", prev:"API design"});
    ok("K2 a rename keeps the id, so the people and work that have it keep it", x.r.ok && x.p.skills.find(s=>s.id === "sk-api").label === "Interface design" && x.p.people.find(p=>p.id === "p-avery").skills.includes("sk-api") && x.p.bars.find(b=>b.id === "c1").needs.includes("sk-api"));
    x = run("skill.rename", {id:"sk-api", label:"accessibility"});
    ok("K2 …and renaming onto another skill's label is refused", !x.r.ok && /Accessibility/.test(x.r.reason));
    x = run("skill.remove", {id:"sk-api"});
    ok("K3 removing a skill in use is refused, saying where", !x.r.ok && /used by 2 people, 2 initiatives/.test(x.r.reason), x.r.reason);
    x = run("skill.remove", {id:"sk-load"});
    ok("K3 …and an unused one goes, as a risky change", x.r.ok && !x.p.skills.some(s=>s.id === "sk-load") && ev("planActions['skill.remove'].risk") === "risky");
    x = run("person.set", {id:"p-casey", field:"skills", value:["sk-nope"]});
    ok("K4 a skill the catalog doesn't have is refused", !x.r.ok && /skill/.test(x.r.reason));
    x = run("person.set", {id:"p-avery", field:"skills", value:[]});
    ok("K4 …and an empty list clears them", x.r.ok && x.p.people.find(p=>p.id === "p-avery").skills === undefined);
    x = run("task.set", {id:"t-m2-a", field:"needs", value:Array.from({length:21}, (_, i)=>"sk-" + i)});
    ok("K4 …over 20 is refused", !x.r.ok && /20/.test(x.r.reason));

    // workstreams
    x = run("workstream.del", {id:"int"});
    ok("W1 deleting a workstream that still has work is refused, saying what's in it", !x.r.ok && /Integrations still has \d+ initiatives/.test(x.r.reason), x.r.reason);
    ev("commit(()=>act('workstream.add', {id:'ws-empty', name:'Spare'})); commit(()=>act('guide.setWorkstream', {lane:'ws-empty', value:'For later.'}))");
    x = run("workstream.del", {id:"ws-empty"});
    ok("W2 an empty one goes, with its guidance", x.r.ok && !x.p.lanes.some(l=>l.id === "ws-empty") && !x.p.planningGuide.some(g=>g.id === "lane:ws-empty"));
    ev("commit(()=>act('workstream.setReserve', {id:'ws-empty', reserve:20}))"); x = run("workstream.del", {id:"ws-empty"});
    ok("W2 …but not while it keeps its own reserve", !x.r.ok && /its own reserve/.test(x.r.reason), x.r.reason);
    ev("commit(()=>act('workstream.setReserve', {id:'ws-empty', reserve:null}))");
    ok("W3 deleting a workstream always waits for a person", ev("amRiskOf({ops:[{op:'action', action:'workstream.del', args:{id:'ws-empty'}}]})") === "floor");
    x = run("workstream.set", {id:"ws-empty", field:"until", value:"2026-01-01"}); const y = run("workstream.set", {id:"ws-empty", field:"color", value:"#AA3300"});
    ok("W4 its note, color and dates have an action", x.r.ok && x.p.lanes.find(l=>l.id === "ws-empty").until === "2026-01-01" && y.p.lanes.find(l=>l.id === "ws-empty").color === "#aa3300");
    x = run("workstream.move", {id:"ws-empty", index:0, prev:J("S.lanes.length") - 1});
    ok("W4 …and so does its place in the list", x.r.ok && x.p.lanes[0].id === "ws-empty");

    // the Planning guide
    x = run("guide.setWorkstream", {lane:"fin", value:"Reports for finance.", prev:"Something else"});
    ok("G1 guidance written against an older text is refused as changed", !x.r.ok && x.r.code === "stale");
    x = run("guide.setWorkstream", {lane:"fin", value:"Reports for finance.", prev:""});
    ok("G1 …and applies when prev is what's there", x.r.ok && x.p.planningGuide.find(g=>g.id === "lane:fin").text === "Reports for finance.");
    x = run("guide.set", {section:"purpose", value:"New purpose.", prev:"Deliver the v2 platform without breaking partners."});
    ok("G2 the six plan-wide sections have an action too", x.r.ok && x.p.planningGuide.find(g=>g.id === "purpose").text === "New purpose." && !run("guide.set", {section:"secrets", value:"x"}).r.ok);
    x = run("template.set", {kind:"milestone", value:"## Reached when\n- [ ]"});
    ok("G3 milestones get a story template, and an action sets it", x.r.ok && x.p.meta.storyTemplates.milestone === "## Reached when\n- [ ]" && ev("STORY_TEMPLATES.milestone").startsWith("## What this marks"));
    x = run("milestone.set", {id:"ms4", field:"story", value:"## Delivered\nTo finance."});
    const g = run("gate.set", {id:"g-auth", field:"description", value:"Short."}), mt = run("meeting.set", {id:"meet-sync", field:"note", value:"New agenda.", prev:"**Agenda:** blockers first, then the pilot."});
    ok("G4 a milestone's story, a gate's description and a meeting's note each have a set action", x.r.ok && x.p.milestones.find(m=>m.id === "ms4").story === "## Delivered\nTo finance." && g.r.ok && g.p.gates.find(z=>z.id === "g-auth").description === "Short." && mt.r.ok);
    ok("G4 …and a hint is set the same way on every kind the context carries", ["initiative.set:m1", "task.set:t-m2-a", "milestone.set:ms2", "gate.set:g-auth", "person.set:p-avery", "risk.set:" + ev("S.risks[0].id"), "decision.set:" + ev("S.decisions[0].id")]
      .every(s=>{ const [a, id] = s.split(":"); const r = run(a, {id, field:"aiHint", value:"Prefer the smaller change."}); return r.r.ok; }) && run("initiative.set", {id:"m1", field:"aiHint", value:"h".repeat(501)}).r.ok === false);

    // initiative.move: prev as the context shows it
    ev("barById('c2').start = 2.3; barById('c2').span = 1.5");
    const vb = J("assistantView()").initiatives.find(b=>b.id === "c2");
    x = run("initiative.move", {id:"c2", day:"2026-11-02", prev:{start:vb.start, weeks:vb.weeks}});
    ok("M1 a move whose prev is the context's own start and weeks applies, even from a part-week start", x.r.ok && !x.r.nochange && x.p.bars.find(b=>b.id === "c2").start !== 2.3, JSON.stringify(x.r) + " " + JSON.stringify(vb && {start:vb.start, weeks:vb.weeks}));
    x = run("initiative.move", {id:"c2", day:"2026-11-02", prev:{start:"2026-10-19", weeks:vb.weeks}});
    ok("M1 …a wrong one is still stale", !x.r.ok && x.r.code === "stale");
    x = run("initiative.move", {id:"c2", span:2, prev:{start:2.3, span:1.5}});
    ok("M1 …and the old shape still works", x.r.ok);
    ev("barById('c2').start = 2; barById('c2').span = 1");
    ev("S.milestones.find(m=>m.id === 'ms4').at = 3.4; S.milestones.find(m=>m.id === 'ms4').after = []"); const vm = J("assistantView()").planning.milestones.find(m=>m.id === "ms4");
    x = run("milestone.move", {id:"ms4", day:"2026-11-04", prev:vm.at}); const x2 = run("milestone.move", {id:"ms4", day:"2026-11-04", prev:3.1});
    ok("M2 a milestone move whose prev is the context's at (a week number) applies, and a wrong one is stale", x.r.ok && !x2.r.ok && x2.r.code === "stale" && run("milestone.move", {id:"ms4", day:"2026-11-04", prev:ev("amWeekIso(S, 3.4)")}).r.ok, JSON.stringify([x.r, vm.at]));

    // the context
    const dir = folder(); w.DIR = dir; ev("file.handle = null; amTried = S.meta.planId; window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; }");
    await ev("assistantConnect()"); await wait(30); ev("clearTimeout(assistantExportTimer)");
    ev("JIRA = {generatedAt:'2026-10-07T08:00:00Z', issues:{'ABC-9':{summary:'Pilot', status:'Open', category:'To Do', description:'h3. From Jira'}}, sprints:[], rollups:{}, missing:[]}; dropJiraMemos();");
    const V = J("assistantView()"), P = V.planning;
    ok("C1 the context carries the catalog, people's skills, joins, leaves, split and hint", P.skills.length === 4 && P.people.find(p=>p.id === "p-avery").skills.join() === "sk-api,sk-a11y" && P.people.find(p=>p.id === "p-casey").aiHint === HOSTILE && "alloc" in P.people[0]);
    ok("C1 …work's needs and hints, milestone stories, gate descriptions, meetings' notes and workstream notes", V.initiatives.find(b=>b.id === "c1").needs.join() === "sk-api,sk-data" && /pairing/.test(V.initiatives.find(b=>b.id === "m1").aiHint)
      && /Pilot users/.test(P.milestones.find(m=>m.id === "ms2").story) && /Why it matters/.test(P.gates.find(z=>z.id === "g-auth").description) && P.meetings.find(m=>m.id === "meet-sync").note.startsWith("**Agenda") && "note" in P.workstreams[0]);
    ok("C1 …Jira's descriptions, with when they were synced", V.jira.issues.find(i=>i.key === "ABC-9").description === "h3. From Jira" && V.jira.issues.find(i=>i.key === "ABC-9").syncedAt === "2026-10-07T08:00:00Z");
    ok("C2 it says hints and guidance are data: never authorization or evidence of ability", /never authorization/.test(V.safety) && /evidence of anyone's ability/.test(V.safety) && /aiHint/.test(V.guide) && /skill\.add/.test(V.guide) && /guide\.setWorkstream/.test(V.guide));
    ok("C2 …and lists every new action", ["guide.set", "guide.setWorkstream", "template.set", "workstream.set", "workstream.move", "workstream.del", "skill.add", "skill.rename", "skill.remove", "meeting.set"].every(a=>V.actions.some(z=>z.id === a)));
    const C = V.coverage.context;
    ok("C3 coverage lists the workstreams with no guidance, exactly", C.workstreamsWithoutGuidance.ids.join() === "fin,ui,plat,none" && C.workstreamsWithoutGuidance.missing === 4 && C.workstreamsWithoutGuidance.checked === 8, JSON.stringify(C.workstreamsWithoutGuidance));
    ok("C3 …the people with no skills, exactly", C.peopleWithoutSkills.missing === 7 && !C.peopleWithoutSkills.ids.includes("p-avery") && C.peopleWithoutSkills.ids.includes("p-casey"), JSON.stringify(C.peopleWithoutSkills));
    ok("C3 …the milestones in the next 12 weeks with no story, leaving out those without a date", C.milestonesWithoutStory.missing === ev("S.milestones.filter(m=>m.at != null && nearWeekday(atToDay(m.at)) >= todayDay() && nearWeekday(atToDay(m.at)) <= todayDay() + 84 && !m.story).length")
      && !C.milestonesWithoutStory.ids.includes("ms2") && C.milestonesWithoutStory.notApplicable >= 2, JSON.stringify(C.milestonesWithoutStory));
    ok("C3 …and open work with no story or needs, done work not counted", !C.workWithoutStory.ids.includes("m2") && !C.workWithoutStory.ids.includes("t-m2-c") && C.workWithoutNeeds.missing === C.workWithoutNeeds.checked - 2, JSON.stringify([C.workWithoutNeeds.missing, C.workWithoutNeeds.checked]));
    const fit = J(`(()=>{ const v = assistantView(); const big = "w".repeat(3990); for (let i = 0; i < 700; i++) v.initiatives[0].tasks.push({id:"x" + i, label:"x", start:"2026-09-21", days:1, status:"notstarted", owners:[], dependsOn:[], jiraDeps:[], needs:[], story:big, aiHint:"h".repeat(500)}); return assistantFitView(v).coverage; })()`);
    ok("C4 over the budget, hints go first, then stories", fit.hints.omitted > 0 && fit.hints.total === fit.hints.exported + fit.hints.omitted && fit.complete === false && (fit.hints.exported === 0 || fit.stories.omitted === 0), JSON.stringify([fit.hints, fit.stories]));
    ok("C4 …and the gaps are the ones counted before trimming", JSON.stringify(fit.context) === JSON.stringify(C));

    // where people see it
    ev("goWs('timeline'); setZoom('weeks'); render()"); let pk = await peek("lane", "int", "#gantt");
    ok("H1 pointing at a workstream's name shows what it's for, as formatted markdown", !pk.hidden && !!pk.querySelector(".pk-story .md h4") && pk.querySelector(".pk-story strong")?.textContent === "partner tools" && pk.querySelector(".pk-story a")?.getAttribute("href") === "https://docs.example.com/int");
    pk = await peek("lane", "fin", "#gantt"); ok("H1 …or No description yet", /No description yet/.test(pk.textContent));
    { const t = d.querySelector('#gantt [data-peek-type="lane"][data-peek-id="int"]'); ev("closePeek()"); t.focus(); t.dispatchEvent(new w.FocusEvent("focusin", {bubbles:true})); await wait(5);
      ok("H2 …by keyboard too: focusing the name shows it", !d.querySelector("#peek").hidden && d.querySelector("#peek").textContent.includes("Integrations")); }
    ev("closePeek(); setZoom('days'); render()"); pk = await peek("lane", "int", "#gantt");
    ok("H3 in Days, the workstream's header name shows it too, and opens the workstream", !pk.hidden && !!d.querySelector('#gantt .lanehdr button.lhname[data-peek-id="int"]'));
    ev("closePeek(); setZoom('weeks'); select('bar', 'm1')"); await wait(5);
    ok("H4 an item's panel links to its workstream's description", !!d.querySelector('#side button.lnabout[data-peek-type="lane"][data-peek-id="int"]'));
    pk = await peek("lane", "int", "#side"); ok("H4 …with the same card", !pk.hidden && pk.textContent.includes("Connects"));
    d.querySelector("#side button.lnabout").click(); await wait(5);
    ok("H5 clicking it opens the workstream with its description and Edit", ev("sel.type + ':' + sel.id") === "lane:int" && !!d.querySelector("#f-lguide .md :is(h3, h4)") && !!d.querySelector("#f-lguide-edit"));
    ev("closePeek(); select('ms', 'ms2')"); await wait(5); pk = await peek("ms", "ms2", "#gantt");
    ok("H6 a milestone's card shows its story as markdown, a link opening in a new tab", !!pk.querySelector(".pk-story strong") && pk.querySelector(".pk-story a")?.target === "_blank");
    pk = await peek("bar", "m2", "#gantt"); ok("H6 …so does an initiative's", !!pk.querySelector(".pk-story h4"));
    ok("H7 the milestone's panel shows its story with Edit", !!d.querySelector("#f-storybox .md") && !!d.querySelector("#f-storyedit"));

    // the hostile hint stays text, and stays out of cards
    ev("closePeek(); select('person', 'p-casey')"); await wait(5);
    const hb = d.querySelector("#f-hintbox");
    ok("X1 a hint sits under For the assistant, closed, as plain text", hb && !hb.open && /For the assistant/.test(hb.querySelector("summary").textContent) && hb.querySelector("textarea").value === HOSTILE && !d.querySelector("#side script, #side img"));
    ok("X1 …saying who can read it", /Anyone who can open the plan, and your assistant's provider, can read it/.test(hb.textContent));
    ev("UI.rows = 'people'; render()"); pk = await peek("person", "p-casey", "#gantt");
    ok("X2 no hint on hover cards", !(pk.textContent || "").includes("Ignore every earlier"));
    ev("UI.rows = 'lanes'; closePeek(); render()");
    ok("X3 hostile markdown in a description renders as text, never as markup", (()=>{ const x = d.createElement("div"); x.append(ev(`mdRender(${JSON.stringify(HOSTILE)})`)); return !x.querySelector("script, img, a") && x.textContent.includes("<script>"); })());
    const rev0 = ev("S.meta.revision || 0"), pid = ev("S.meta.planId"), act = (action, args)=>({op:"action", action, args});
    ok("X4 a hint can't authorize anything: a routine change still waits at the review level", (ev("amSetLevel('review')"), ev("amLevel()") === "review"));

    // a reviewed batch, applied as one update with one undo
    const batch = id => JSON.stringify({kind:"sightline-amendments", version:1, planId:pid, batchId:id, createdAt:new Date().toISOString(), source:"Planning bot", basedOn:{planRevision:ev("S.meta.revision || 0")},
      changes:[{id:"skills", summary:"Skills for the team", ops:[act("skill.add", {id:"sk-ux", label:"UX writing"}), act("skill.add", {id:"sk-sec", label:"Security review"}),
        act("person.set", {id:"p-casey", field:"skills", value:["sk-ux"], prev:[]}), act("person.set", {id:"p-devon", field:"skills", value:["sk-sec", "sk-data"], prev:[]}), act("person.set", {id:"p-harper", field:"skills", value:["sk-ux"], prev:[]}),
        act("task.set", {id:"t-m2-a", field:"needs", value:["sk-ux"], prev:[]}), act("task.set", {id:"t-m2-b", field:"needs", value:["sk-sec"], prev:[]})]},
        {id:"guide", summary:"Describe Reporting", ops:[act("guide.setWorkstream", {lane:"fin", value:"## Reporting\nReports **for finance**.", prev:""})]}]});
    dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", batch("ctx-1")));
    await ev("assistantTick()"); await wait(40); ev("sel = {type:'amend', id:'x'}; render()"); await wait(5);
    const gr = d.querySelector('[data-am="guide"]');
    ok("B1 review shows the guidance in full, as it is now and after", gr && /Guidance for Reporting/.test(gr.textContent) && /Now: empty/.test(gr.textContent) && gr.querySelector(".amstory strong")?.textContent === "for finance");
    ok("B1 …and each skill change in plain words", /New skill "UX writing"/.test(d.querySelector('[data-am="skills"]')?.textContent || "") && /Skills for "Casey": "UX writing"/.test(d.querySelector('[data-am="skills"]')?.textContent || ""), (d.querySelector('[data-am="skills"]')?.textContent || "").slice(0, 400));
    const u0 = ev("past.length"); await ev("amApply(['skills'])"); await wait(40);
    ok("B2 two skills, three people's skills and two tasks' needs apply as one update", J("S.skills.map(s=>s.id)").includes("sk-sec") && J("personById('p-devon').skills").join() === "sk-sec,sk-data" && J("taskById('t-m2-b').t.needs").join() === "sk-sec" && ev("past.length") === u0 + 1);
    ev("undo()"); ok("B2 …with one undo", !J("S.skills.map(s=>s.id)").includes("sk-ux") && ev("personById('p-casey').skills") === undefined && ev("taskById('t-m2-a').t.needs") === undefined);
    ev("redo()"); await ev("amApply(['guide'])"); await wait(40);
    ok("B3 the reviewed guidance applies, and the workstream's card shows it", /Reports/.test(ev("planningGuideValue('lane:fin')")) && (ev("closePeek(); goWs('timeline'); render()"), (await peek("lane", "fin", "#gantt")).querySelector(".pk-story strong")?.textContent === "for finance"));
    dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", batch("ctx-1"))); await ev("assistantTick()"); await wait(40);
    ok("B4 the same batch again changes nothing", J("S.skills.filter(s=>s.id === 'sk-ux').length") <= 1 && ev("planningGuideValue('lane:fin')").startsWith("## Reporting"));
    const stale = JSON.parse(batch("ctx-2")); stale.changes = [{id:"late", summary:"Rewrite Reporting", ops:[act("guide.setWorkstream", {lane:"fin", value:"Other.", prev:""})]}];
    dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", JSON.stringify(stale))); await ev("assistantTick()"); await wait(40); ev("sel = {type:'amend', id:'x'}; render()"); await wait(5);
    ok("B5 a batch written against the old guidance is refused as changed since", /changed since/i.test(d.querySelector('[data-am="late"]')?.textContent || "") && ev("planningGuideValue('lane:fin')").startsWith("## Reporting"), String(d.querySelector('[data-am="late"]')?.textContent).slice(0, 300) + " | " + d.querySelector("#side")?.textContent.slice(0, 300));

    // Settings
    ev("sel = null; goMainGroup('settings'); UI.planTab = 'team'; goWs('plan'); render()"); await wait(5);
    ok("S1 Settings, Team lists the skills with where each is used", d.querySelectorAll("#t-skills tr[data-skill]").length === ev("S.skills.length") && /Used by/.test(d.querySelector('#t-skills tr[data-skill="sk-api"]').textContent));
    d.querySelector('#t-skills [data-skilldel="sk-api"]').click(); await wait(5);
    ok("S1 …and removing one in use says why instead", ev("S.skills.some(s=>s.id === 'sk-api')") && /used by/.test(d.querySelector("#status")?.textContent || ev("lastStatus || ''")));
    ok("S2 the Planning guide preview shows the same gaps", (ev("UI.planTab = 'guide'; render()"), !!d.querySelector("#pgGaps")) && /workstreams? without a description/.test(d.querySelector("#pgGaps").textContent));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
