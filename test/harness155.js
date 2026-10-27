// Clearer about what's what: "Added here" on work the plan holds that nothing in Jira tracks (only in a plan with Jira
// work too); each date a proposed change moves says what the item waits for; after Apply, the status line counts what
// was added, linked and moved. Nothing new is saved. The sample plan with a few Jira keys added here; names are invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); window.PLAIN = normalize(JSON.parse(FIX), false); const p = JSON.parse(FIX);
        p.bars.find(b=>b.id === "m1").jira = "ABC-101"; p.bars.find(b=>b.id === "c2").parent = "c1"; p.bars.find(b=>b.id === "c2").jira = "ABC-102";
        const r1 = p.bars.find(b=>b.id === "r1"); r1.tasks = [{id:"tj", label:"Tracked task", start:"2026-10-08", days:2, jira:"ABC-103", status:"notstarted"}, {id:"tp", label:"Plan task", start:"2026-10-08", days:2, status:"notstarted"}];
        S = normalize(p, false); file.handle = null; render();`);
    const here = id => !!$(`[data-sel="bar:${id}"] .tag.here, .bar[data-id="${id}"] .tag.here`);
    const barEl = id => $$(".bar").find(e=>e.getAttribute("data-sel") === "bar:" + id || e.dataset.id === id || e.getAttribute("data-key") === "bar:" + id);
    const tagOf = id => !!(barEl(id) && barEl(id).querySelector(".tag.here"));
    ok("H1 an initiative nothing in Jira tracks says Added here when you hover or read it, not as a tag on every bar", T(`untracked(barById("c3"), "bar")`) === true && barEl("c3") && !tagOf("c3") && /Added here: in this plan, not tracked in Jira/.test(barEl("c3").getAttribute("aria-label")), String(!!barEl("c3")));
    ok("H1b the Key says what no Jira key means", /Added here: no Jira key, not tracked in Jira/.test($("#legend")?.textContent || ""));
    ok("H2 one with a Jira key doesn't", T(`untracked(barById("m1"), "bar")`) === false && barEl("m1") && !/Added here/.test(barEl("m1").getAttribute("aria-label")));
    ok("H3 nor one holding Jira work inside it", T(`untracked(barById("c1"), "bar")`) === false && T(`untracked(barById("r1"), "bar")`) === false);
    ok("H3b a waiting or unstaffed item isn't work, so it isn't labeled", T(`S.bars.filter(b=>b.kind === "waiting").length`) > 0 && T(`S.bars.filter(b=>b.kind === "waiting").every(b=>!untracked(b, "bar"))`) === true);
    ok("H4 a plan task does; a Jira task doesn't", T(`[untracked(taskById("tp").t, "task"), untracked(taskById("tj").t, "task")]`)?.join() === "true,false");
    ev(`S = PLAIN; render();`);
    ok("H5 a plan with no Jira work at all labels nothing (there's nothing to mistake it for)", T(`S.bars.some(b=>untracked(b, "bar"))`) === false && !$(".tag.here"));
    ev(`const p = JSON.parse(FIX); p.bars.find(b=>b.id === "m1").jira = "ABC-101"; const r1 = p.bars.find(b=>b.id === "r1"); r1.tasks = [{id:"tj", label:"Tracked task", start:"2026-10-08", days:2, jira:"ABC-103", status:"notstarted"}, {id:"tp", label:"Plan task", start:"2026-10-08", days:2, status:"notstarted"}];
        S = normalize(p, false); render(); setZoom("days", "r1"); render();`); await wait(40);
    const tp = $$('[data-sel="task:tp"]').map(e=>e.textContent).join(" | "), tj = $$('[data-sel="task:tj"]').map(e=>e.textContent).join(" | ");
    ok("H6 on the Days view a plan task says added here, a Jira task doesn't", /added here/i.test(tp) && !/added here/i.test(tj), `${tp} // ${tj}`);
    ev(`setZoom("weeks"); setWs("list"); render();`); await wait(40);
    const lp = $('[data-lk="list:task:tp"]'), lj = $('[data-lk="list:task:tj"]');
    ok("H7 the List says it too, beside the name", lp && /Added here/.test(lp.textContent) && lj && !/Added here/.test(lj.textContent), lp ? lp.textContent.slice(0, 80) : "no row");
    ok("H8 the label is text, not only a style, and says what it means on hover", T(`hereTag(barById("c3"), "bar").title`) === "Added here: in this plan, not tracked in Jira");
    ev(`setWs("timeline"); render();`);

    // What a move waits for.
    ev(`commit(s=>{ const b = s.bars.find(x=>x.id === "c4"); b.tasks = [{id:"wa", label:"Adapter", start:"2026-10-12", days:2, owners:[], jira:"", status:"notstarted"}, {id:"wb", label:"Wire it", start:"2026-10-14", days:2, owners:[], jira:"", status:"notstarted", dependsOn:["wa"]}]; });`);
    const mv = T(`amCheck({id:'c-mv', ops:[{op:'action', action:'task.move', args:{id:'wa', days:4}}]}, S)`);
    const lines = mv ? JSON.stringify(mv.notes || []) + JSON.stringify(mv.lines || []) : "";
    ok("M1 a date a change moves says what it waits for", /Wire it moves 2 days later \(Oct 14 to Oct 16\), waits for \\"Adapter\\"/.test(lines), lines.slice(0, 400));
    const ml = T(`moveLine({label:"X", from:"2026-10-14", to:"2026-10-12", days:-2, waits:["Y"]})`);
    const many = T(`moveLine({label:"X", from:"2026-10-12", to:"2026-10-14", days:2, waits:["A", "B", "C", "D"]})`);
    ok("M2 with many, it names two and counts the rest; a move earlier claims no wait", many === 'X moves 2 days later (Oct 12 to Oct 14), waits for "A" and "B" and 2 more' && ml === "X moves 2 days earlier (Oct 14 to Oct 12)", many);

    // After Apply.
    const tally = T(`(()=>{ const a = clone(S), b = clone(S); const bb = b.bars.find(x=>x.id === "c4"); bb.tasks.push({id:"n1", label:"N1", start:"2026-10-20", days:1, jira:"", status:"notstarted", dependsOn:["wb"]}, {id:"n2", label:"N2", start:"2026-10-21", days:1, jira:"", status:"notstarted", dependsOn:["n1", "wa"]});
      bb.tasks.find(t=>t.id === "wb").start = "2026-10-15"; return applyTally(a, b); })()`);
    ok("T1 the count says tasks added, links added and dates moved", tally === "2 tasks added, 3 links added, 1 date moved", tally);
    ok("T2 nothing changed counts nothing", T(`applyTally(clone(S), clone(S))`) === "");
    const F = {kind:"sightline-amendments", version:1, planId:J("S.meta.planId"), batchId:"b-155", basedOn:{planRevision:J("S.meta.revision")}, changes:[
      {id:"c1", summary:"Add the first task", ops:[{op:"action", action:"task.add", args:{id:"q1", bar:"c4", start:"2026-10-19", days:2, label:"Q1"}}]},
      {id:"c2", summary:"Add the second after it", ops:[{op:"action", action:"task.add", args:{id:"q2", bar:"c4", after:["q1"], days:1, label:"Q2"}}]}]};
    w.AMTEXT = JSON.stringify(F);
    ev(`AM = {file:amParse(AMTEXT).file, handle:null, name:"amendments.json", held:{}}; AM.file.source = AM.file.source || "Test assistant";`);
    await ev(`amApply(["c1", "c2"], {inOrder:true})`); await wait(50);
    const st = J(`AM.lastApply ? AM.lastApply.summary : ""`);
    ok("T3 after Apply, the status line says what was added and linked", /Applied .*\(2 tasks added, 1 link added\)/.test(st) && J(`AM.lastApply.tally`) === "2 tasks added, 1 link added", st);
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
