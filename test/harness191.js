// What matters now (vision.md 21-24): dated guidance people set, decisions that cite it, the panel above the work order,
// the assistant export, and Sightline noticed. Every change an app proposes to it waits for a person. Invented names only.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const SKILL = fs.readFileSync(path.join(__dirname, "..", "skills", "sightline-plan", "SKILL.md"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      w.HTMLDialogElement.prototype.close = function(){ this.open = false; }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } }, J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; localStorage.clear(); S = normalize(JSON.parse(FIX), false); resetHistory(); file.handle = null; render();`); await wait(20);
    const day = n => X(`dayToIso(todayDay() + (${n}))`), lane = X("S.lanes[0].id"), lane2 = X("S.lanes[1].id"), status = () => d.querySelector("#status").textContent;
    const can = X("typeof guidanceState === 'function' && !!planActions['guidance.add']");
    ok("G0 the page knows guidance (guidance.add, guidanceState)", can === true, String(can));

    // ---- what's kept ----
    const raw = JSON.parse(FIX); raw.guidance = [
      {id:"gd-cost", text:"  Reduce   cloud cost  ", why:"Budget review", lanes:[lane, "nope"], from:day(-3), through:day(60), reviewOn:day(30), extra:"x"},
      {id:"gd-bad", text:"Bad dates", from:"tomorrow", through:"2026-13-40"},
      {id:"gd-flip", text:"Backwards", from:day(10), through:day(5)},
      {id:"gd-blank", text:"   "}];
    raw.decisions = [...(raw.decisions || []), {id:"dec-cite", text:"Pause the reporting work", state:"decided", owners:[], due:"", item:"", guidance:["gd-cost", "gd-gone"]}];
    w.RAW = JSON.stringify(raw);
    const n = J(`normalize(JSON.parse(RAW), false)`), g0 = (n.guidance || [])[0] || {}, dc = (n.decisions || []).find(x=>x.id === "dec-cite") || {};
    ok("G1 an entry keeps its statement (spaces tidied), why, known workstreams and real dates, and nothing else", g0.text === "Reduce cloud cost" && g0.why === "Budget review" && JSON.stringify(g0.lanes) === JSON.stringify([lane]) && g0.from === day(-3) && g0.reviewOn === day(30) && !("extra" in g0), JSON.stringify(g0));
    ok("G2 dates that aren't dates are dropped, an end before the start is dropped, and an empty statement is dropped", (()=>{ const b = n.guidance.find(x=>x.id === "gd-bad"), f = n.guidance.find(x=>x.id === "gd-flip");
      return b && !b.from && !b.through && f && f.from && !f.through && !n.guidance.some(x=>x.id === "gd-blank"); })(), JSON.stringify(n.guidance));
    ok("G3 a decision keeps citations of guidance in the plan and drops the rest", JSON.stringify(dc.guidance) === JSON.stringify(["gd-cost"]), JSON.stringify(dc));
    ok("G4 featuresIn names guidance1 for guidance, and for a citation alone; this copy knows it", J(`featuresIn(normalize(JSON.parse(RAW), false))`).includes("guidance1")
      && J(`(()=>{ const p = normalize(JSON.parse(FIX), false); return featuresIn(p); })()`).includes("guidance1") === false && J(`KNOWN_FEATURES`).includes("guidance1"));
    ok("G5 it survives a save and a reopen", J(`(()=>{ const p = normalize(JSON.parse(RAW), false); const q = normalize(JSON.parse(serialize(p, "plan.json")), false); return [q.guidance.length, q.guidance[0].text, (q.decisions.find(x=>x.id === "dec-cite") || {}).guidance]; })()`).join("|") === "3|Reduce cloud cost|gd-cost", J(`(()=>{ const p = normalize(JSON.parse(RAW), false); const q = normalize(JSON.parse(serialize(p, "plan.json")), false); return [q.guidance.length, q.guidance[0].text, (q.decisions.find(x=>x.id === "dec-cite") || {}).guidance]; })()`));

    // ---- actions ----
    X(`S = normalize(JSON.parse(RAW), false); resetHistory(); render();`);
    const run = (id, a) => J(`runAction(S, ${JSON.stringify(id)}, ${JSON.stringify(a)})`);
    let r = run("guidance.add", {text:"Faster onboarding", from:day(5), supersedes:"gd-cost", lanes:[lane2]});
    const nw = J(`S.guidance.find(g=>g.text === "Faster onboarding")`), old = J(`S.guidance.find(g=>g.id === "gd-cost")`);
    ok("A1 replacing adds a new entry that names the old one, and the old one ends the day the new one starts", r.ok && nw && nw.supersedes === "gd-cost" && JSON.stringify(nw.lanes) === JSON.stringify([lane2]) && old.through === day(5), JSON.stringify([r, nw, old]));
    r = run("guidance.set", {id:"gd-cost", field:"lanes", value:"x"});
    ok("A2 changing what it covers in place is refused, pointing to a new entry", !r.ok && /add a new entry that replaces it/.test(r.reason), r.reason);
    r = run("guidance.set", {id:"gd-cost", field:"through", value:"yesterday"});
    ok("A3 dates can be said in words (yesterday)", r.ok && J(`S.guidance.find(g=>g.id === "gd-cost").through`) === day(-1), JSON.stringify(r));
    r = run("guidance.set", {id:"gd-cost", field:"through", value:day(-10)});
    ok("A4 an end before the start is refused", !r.ok && /end before it starts/.test(r.reason), r.reason);
    r = run("guidance.add", {text:"x".repeat(301)});
    ok("A5 a statement over 300 characters is refused", !r.ok && /1 to 300/.test(r.reason), r.reason);
    r = run("decision.set", {id:"dec-cite", field:"guidance", value:["gd-nope"]});
    ok("A6 a decision can only cite guidance that's in the plan", !r.ok && /guidance entry/.test(r.reason), r.reason);
    r = run("guidance.del", {id:"gd-cost"});
    ok("A7 removing an entry takes it out of the decisions that cited it", r.ok && !J(`S.guidance.some(g=>g.id === "gd-cost")`) && !J(`"guidance" in S.decisions.find(x=>x.id === "dec-cite")`));

    // ---- an app's changes always wait ----
    X(`S = normalize(JSON.parse(RAW), false); resetHistory();`);
    const risk = ops => X(`amRiskOf({ops:${JSON.stringify(ops)}})`), why = ops => X(`amFloorWhy({ops:${JSON.stringify(ops)}})`), op = (action, args) => ({op:"action", action, args});
    ok("F1 adding, editing or removing guidance always waits for a person", ["guidance.add", "guidance.set", "guidance.del"].every(a=>risk([op(a, {id:"gd-cost", text:"t", field:"why", value:"v"})]) === "floor")
      && /changes what matters now/.test(why([op("guidance.set", {id:"gd-cost", field:"why", value:"v"})])));
    ok("F2 a decision citing guidance always waits, with its reason; one that doesn't cite stays routine", risk([op("decision.set", {id:"dec-cite", field:"guidance", value:["gd-cost"]})]) === "floor"
      && risk([op("decision.add", {text:"t", guidance:["gd-cost"]})]) === "floor" && /which guidance a decision relied on/.test(why([op("decision.add", {text:"t", guidance:["gd-cost"]})]))
      && risk([op("decision.add", {text:"t"})]) === "routine");

    // ---- state ----
    const st = g => J(`guidanceState(${JSON.stringify(g)})`);
    ok("S1 upcoming, active, ended, and review due (never for an ended entry)", st({from:day(2)}).state === "upcoming" && st({from:day(-2)}).state === "active" && st({}).state === "active"
      && st({through:day(-1)}).state === "ended" && st({reviewOn:day(0)}).review === true && st({through:day(-1), reviewOn:day(-5)}).review === false);

    // ---- export ----
    const v = J(`assistantView().planning`), eg = (v.guidance || []).find(g=>g.id === "gd-cost") || {};
    ok("E1 the assistant export lists guidance with its scope, state, review and the decisions that cited it", eg.text === "Reduce cloud cost" && eg.state === "active" && eg.reviewDue === false && JSON.stringify(eg.citedBy) === JSON.stringify(["dec-cite"])
      && eg.scope === X("S.lanes[0].name") && (v.decisions || []).find(x=>x.id === "dec-cite").guidance[0] === "gd-cost", JSON.stringify(eg));

    // ---- the panel ----
    X(`S = normalize(JSON.parse(RAW), false); resetHistory(); goWs("people"); renderForecastWs();`); await wait(20);
    const sec = () => d.getElementById("gdSec"), li = id => d.querySelector(`#gdSec [data-gd="${id}"]`);
    ok("U1 What matters now sits above the work order, with the entry, its why, scope, dates and how many decisions cited it",
      !!sec() && /What matters now/.test(sec().querySelector("h3").textContent) && !!li("gd-cost") && /Reduce cloud cost/.test(li("gd-cost").textContent) && /Why: Budget review/.test(li("gd-cost").textContent)
      && /cited by 1 decision/.test(li("gd-cost").textContent) && (!d.getElementById("fcOrderSec") || (sec().compareDocumentPosition(d.getElementById("fcOrderSec")) & 4)), sec() ? sec().textContent.slice(0, 200) : "none");
    X(`present = true; renderForecastWs();`); await wait(10);
    ok("U2 read-only: no buttons", !sec().querySelector("[data-gdbtn]"));
    X(`present = false; renderForecastWs();`); await wait(10);
    d.getElementById("gdAdd").click(); await wait(10);
    ok("U3 Add opens a form, focused on the statement, with workstreams to pick (none: the whole plan)", !!d.getElementById("gdForm") && d.activeElement === d.getElementById("gdText") && !!d.querySelector("#gdLanes input"));
    d.getElementById("gdSave").click(); await wait(10);
    ok("U4 saving with no statement adds nothing and keeps the form open", !!d.getElementById("gdForm") && J("S.guidance.length") === 3);
    d.getElementById("gdText").value = "Keep support load low"; d.getElementById("gdWhy").value = "Two people out"; d.getElementById("gdThrough").value = day(40);
    d.getElementById("gdSave").click(); await wait(10);
    const added = J(`S.guidance.find(g=>g.text === "Keep support load low")`);
    ok("U5 Add saves the entry for the whole plan, stamped with who set it, and says so", added && added.why === "Two people out" && added.through === day(40) && !added.lanes && !!added.added && /Added "Keep support load low"/.test(status()) && !d.getElementById("gdForm"), JSON.stringify(added));
    li("gd-cost").querySelector('[data-gdbtn="edit"]').click(); await wait(10);
    ok("U6 Edit shows the scope as text: changing it means Replace", !d.querySelector("#gdForm #gdLanes") && /use Replace/.test(d.getElementById("gdForm").textContent));
    d.getElementById("gdText").value = "Reduce cloud spend"; d.getElementById("gdSave").click(); await wait(10);
    ok("U7 Edit changes the wording in place, keeping the id and the citation", J(`S.guidance.find(g=>g.id === "gd-cost").text`) === "Reduce cloud spend" && J(`S.decisions.find(x=>x.id === "dec-cite").guidance[0]`) === "gd-cost" && d.activeElement === li("gd-cost").querySelector('[data-gdbtn="edit"]'));
    li("gd-cost").querySelector('[data-gdbtn="end"]').click(); await wait(10);
    ok("U8 End today ends it today (still active until tonight) and says decisions that cited it are listed", J(`S.guidance.find(g=>g.id === "gd-cost").through`) === day(0) && J(`guidanceState(S.guidance.find(g=>g.id === "gd-cost")).state`) === "active" && /ended today/.test(status()), status());
    X(`S.guidance.find(g=>g.id === "gd-cost").through = dayToIso(todayDay() - 1); renderForecastWs();`); await wait(10);
    ok("U9 an ended entry is listed under Ended, not with what matters now", !!d.querySelector('#gdEnded [data-gd="gd-cost"]') && !d.querySelector('#gdList [data-gd="gd-cost"]'));
    const nid = J(`S.guidance.find(g=>g.text === "Keep support load low").id`);
    li(nid).querySelector('[data-gdbtn="replace"]').click(); await wait(10);
    d.getElementById("gdText").value = "Keep support load under a day a week"; d.getElementById("gdSave").click(); await wait(10);
    const rep = J(`S.guidance.find(g=>g.supersedes === ${JSON.stringify(nid)})`), was = J(`S.guidance.find(g=>g.id === ${JSON.stringify(nid)})`);
    ok("U10 Replace adds a new entry naming the old one, which ends today and stays as history", rep && rep.text === "Keep support load under a day a week" && was.through === day(0) && /replaces/.test(status()), JSON.stringify([rep, was]));
    li(rep.id).querySelector('[data-gdbtn="remove"]').click(); await wait(10);
    ok("U11 Remove takes it out, says Undo brings it back, and Undo does", !J(`S.guidance.some(g=>g.id === ${JSON.stringify(rep.id)})`) && /Undo brings it back/.test(status())
      && (X("undo()"), J(`S.guidance.some(g=>g.id === ${JSON.stringify(rep.id)})`)));

    // ---- noticed ----
    const notes = () => J(`noticed()`).filter(x=>x.kind === "guidance");
    X(`S = normalize(JSON.parse(RAW), false); S.guidance = [{id:"gd-new", text:"Ship the SSO work", from:dayToIso(todayDay() - 2)}];`);
    ok("N1 guidance that started in the last two weeks is noticed", /"Ship the SSO work" applies from/.test((notes()[0] || {}).text || ""), JSON.stringify(notes()));
    X(`S.guidance[0].reviewOn = dayToIso(todayDay());`);
    ok("N2 guidance due for review asks whether it's still what matters", /due for review: is it still what matters/.test((notes()[0] || {}).text || ""), JSON.stringify(notes()));
    X(`S = normalize(JSON.parse(RAW), false); S.guidance[0].through = dayToIso(todayDay() - 3); S.guidance.push({id:"gd-next", text:"Faster onboarding", from:dayToIso(todayDay() - 3), supersedes:"gd-cost"});`);
    const t = (notes()[0] || {}).text || "";
    ok("N3 guidance that ended says what replaced it and how many decisions cited it, and claims nothing moved because of it", /"Reduce cloud cost" ended/.test(t) && /replaced by "Faster onboarding"/.test(t) && /1 decision cited it/.test(t) && !/because/.test(t), t);
    X(`S.guidance[0].through = dayToIso(todayDay() - 45); S.guidance.pop();`);
    ok("N4 guidance that ended over a month ago isn't noticed", !notes().length, JSON.stringify(notes()));
    X(`S = normalize(JSON.parse(RAW), false); S.guidance[0].text = "<img src=x onerror=alert(1)>"; S.guidance[0].from = dayToIso(todayDay() - 1); S.guidance[0].reviewOn = ""; delete S.guidance[0].reviewOn; goWs("people"); renderForecastWs();`); await wait(10);
    ok("N5 guidance text is shown as text, never markup", !d.querySelector("#gdSec img") && /<img src=x/.test(d.getElementById("gdSec").textContent));

    // ---- the skill ----
    ok("K1 the front-door skill reads what matters now, cites entries, keeps today's guidance apart from what a decision recorded, and proposes a new focus for review",
      /## What matters now/.test(SKILL) && /guidance\.add/.test(SKILL) && /supersedes/.test(SKILL) && /what a decision recorded/i.test(SKILL) && /whose input to seek/i.test(SKILL) && !/\bweight(ed)?\b/i.test(SKILL.replace(/never .{0,40}weight/gi, "")));
    ok("Z1 no page errors", !X("window.errs").length, X("window.errs.join(' | ')"));
  } catch(e){ ok("crash", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
