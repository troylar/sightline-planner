// Show only, as chips: one gesture narrows to an initiative or a person's work, shown as a chip above the chart that
// a click takes off; Show all work clears every filter, and Back undoes each of these. The zoom stays. A Focus from 1.147
// (a saved one in this browser, or a link) opens as the same chips. It's this browser's view only.
// The sample plan, with tasks added here for two of its invented people. Every name is invented.
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
  const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };
  const X = s => { try { return ev(s); } catch(e){ return undefined; } };
  const $ = s => d.querySelector(s);
  const key = (k, o = {}) => d.dispatchEvent(new w.KeyboardEvent("keydown", {key:k, bubbles:true, ...o}));
  const chips = () => [...d.querySelectorAll("#showStrip .showchip")].map(c=>c.dataset.show);
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null;
        window.A = S.people.find(p=>p.name === "Avery").id; window.B = S.people.find(p=>p.name === "Blake").id;
        const b = S.bars.find(x=>x.id === "m2"), st = dayToIso(nearWeekday(wkDay(b.start)));
        b.tasks = [{id:"fa", label:"Avery builds", start:st, days:4, owners:[A], status:"inprogress"}, {id:"fb", label:"Blake tests", start:st, days:3, owners:[B], status:"notstarted"}];
        const c = S.bars.find(x=>x.id === "c2"); c.owners = [A]; c.tasks = [{id:"fm", label:"Morgan's part", start:st, days:2, owners:[S.people.find(p=>p.name === "Morgan").id], status:"notstarted"}];
        S.bars.find(x=>x.id === "m5").label = '<img src=x onerror="window.pwned=1">Retire';
        UI.ws = "timeline"; UI.zoom = "weeks"; UI.focus = null; UI.filter = normFilter({}); render();
        window.VIS = () => S.bars.filter(b=>barVisible(b)).map(b=>b.id).sort();
        window.TV = id => taskVisible(taskById(id).t);`);
    const lane = J(`S.bars.find(x=>x.id === "m2").lane`);
    ev(`UI.filter = normFilter({lanes:[${JSON.stringify(lane)}]}); render();`);
    const pastBefore = J("past.length"), baseVis = T("VIS()");

    // In: the card's button.
    ev(`select("bar", "m2");`); await wait(20);
    ok("S1 an initiative's card offers Show only this initiative", $("#f-only")?.textContent === "Show only this initiative" && !$("#f-focus"), $("#f-only")?.textContent);
    $("#f-only")?.click(); await wait(20);
    ok("S2 it shows only that initiative and keeps your other filters", T("UI.filter.bars")?.join() === "m2" && T("UI.filter.lanes")?.join() === lane && T("VIS()")?.join() === "m2", JSON.stringify(T("UI.filter")));
    ok("S3 the zoom stays as it was: no switch to Days", X("UI.zoom") === "weeks" && !X("UI.focus"));
    ok("S4 a chip above the chart says what's shown, with the kind and the name", chips().join() === "bar:m2" && /Showing\s*Initiative\s*/.test($("#showStrip")?.textContent || "") && $("#showAll")?.textContent === "Show all work", $("#showStrip")?.textContent);
    ok("S5 the Filters count includes it, like any filter", $("#filterBtn .fcount")?.textContent === "2" && $("#filterBtn").title === "Filter what's shown (F)", $("#filterBtn .fcount")?.textContent);
    ok("S6 it's your view only: nothing in the plan's history", J("past.length") === pastBefore);
    ev(`select("bar", "m2");`); await wait(10);
    ok("S7 the card has no Show only button while it's the one shown", !$("#f-only"));

    // A person: their chip joins the initiative's, so it's their work in it.
    ev(`select("person", A);`); await wait(20);
    ok("S8 a person's card offers Show Avery's work", $("#f-only")?.textContent === "Show Avery's work", $("#f-only")?.textContent);
    $("#f-only")?.click(); await wait(20);
    ok("S9 both chips show: Avery's work in that initiative, a teammate's task there hidden", chips().join() === "bar:m2,person:" + X("A") && X(`TV("fa")`) && !X(`TV("fb")`), chips().join());
    $('#showStrip [data-show="bar:m2"]')?.click(); await wait(20);
    ok("S10 taking the initiative's chip off leaves the person's", chips().join() === "person:" + X("A") && T("UI.filter.bars")?.length === 0);
    ev(`UI.filter.lanes = []; render();`); await wait(10);
    ok("S11 their work includes initiatives they lead, without the others' tasks there", T("VIS()")?.includes("c2") && !X(`TV("fm")`), JSON.stringify(T("VIS()")));
    ev(`UI.filter.lanes = [${JSON.stringify(lane)}]; render();`); await wait(10);

    // Back undoes each step: the chip comes back, then Forward takes it off again.
    w.history.back(); await wait(80);
    ok("S12 Back brings the chip you took off back", chips().join() === "bar:m2,person:" + X("A"), chips().join() + " " + w.location.hash);
    w.history.forward(); await wait(80);
    ok("S12 …and Forward takes it off again", chips().join() === "person:" + X("A"), chips().join());

    // Show all work clears every filter, and Back puts them all back.
    $("#showAll")?.click(); await wait(20);
    ok("S13 Show all work clears every filter, and the strip goes", !$("#showStrip") && !X("fActive()") && T("VIS()")?.length > baseVis.length, JSON.stringify(T("UI.filter")));
    w.history.back(); await wait(80);
    ok("S14 Back after Show all work puts your filters back", chips().join() === "person:" + X("A") && T("UI.filter.lanes")?.join() === lane, chips().join() + " " + JSON.stringify(T("UI.filter.lanes")));

    // Keys: Z on the selection; Z while typing does nothing; Esc never changes what's shown.
    ev(`UI.filter = normFilter({}); render(); select("task", "fa");`); await wait(5); key("z"); await wait(20);
    ok("S15 Z on a selected task shows only its initiative", T("UI.filter.bars")?.join() === "m2", JSON.stringify(T("UI.filter.bars")));
    ev(`UI.filter = normFilter({}); render(); select("bar", "m2");`); await wait(10);
    const inp = $("#f-label") || $("#side input"); inp?.focus(); key("z"); await wait(10);
    ok("S16 Z while typing does nothing", T("UI.filter.bars")?.length === 0);
    ev(`showOnly("bar", "m2"); sel = null; render();`); await wait(10); key("Escape"); await wait(20);
    ok("S17 Esc with nothing selected leaves the chips alone", chips().join() === "bar:m2");

    // Days: showing only keeps the zoom too, and doesn't frame the chart on it.
    ev(`UI.filter = normFilter({}); setZoom("days"); showOnly("bar", "m2");`); await wait(10);
    ok("S18 in Days it stays Days, with every initiative's row framing as usual", X("UI.zoom") === "days" && !X("UI.focus") && chips().join() === "bar:m2");
    ev(`setZoom("weeks"); UI.filter = normFilter({}); render();`);

    // Links: today's carry the chips as filters; a 1.147 link with a focus path opens as the same chips.
    ev(`showOnly("bar", "m2"); showOnly("person", A);`); await wait(10);
    const st = T("navState()");
    ok("S19 a link carries the chips as filters, with no focus path", st && !st.dr && /"bars":\["m2"\]/.test(st.f || "") && /"people":\[/.test(st.f || ""), JSON.stringify(st));
    ev(`UI.filter = normFilter({}); render(); applyNav({ws:"timeline", plan:S.meta.planId, f:JSON.stringify({lanes:[${JSON.stringify(lane)}]}), dr:"bar:m2,person:" + A + ",bar:nope,evil:x", drr:"1"});`); await wait(10);
    ok("S20 a 1.147 link with a focus path opens as chips over its filters, skipping what's gone", chips().join() === "bar:m2,person:" + X("A") && T("UI.filter.lanes")?.join() === lane && X("UI.drill") === undefined, chips().join() + " " + JSON.stringify(T("UI.filter")));

    // A name from the plan is text in a chip.
    ev(`UI.filter = normFilter({}); showOnly("bar", "m5");`); await wait(10);
    const hc = $('#showStrip [data-show="bar:m5"]');
    ok("S21 a name from the plan is shown as text in its chip", hc && /<img/.test(hc.textContent) && !$("#showStrip img") && !w.pwned && /Stop showing only <img/.test(hc.getAttribute("aria-label")));
    ev(`UI.filter = normFilter({}); render();`);
    ev(`UI.filter = normFilter({}); setZoom("weeks"); sel = null; render();`); await wait(10);
    d.querySelector('#gantt [data-key="bar:m2"]')?.dispatchEvent(new w.MouseEvent("dblclick", {bubbles:true})); await wait(20);
    ok("S23 double-clicking an initiative on the Timeline shows only it, in the same zoom", T("UI.filter.bars")?.join() === "m2" && X("UI.zoom") === "weeks" && chips().join() === "bar:m2", JSON.stringify(T("UI.filter.bars")));
    // From review: Find, the more-filters link, Day view, whole-plan labels, Show all work's reach, the help.
    const gid = X("S.gates[0] && S.gates[0].id");
    ev(`UI.filter = normFilter({}); showOnly("bar", "m2");`); await wait(10);
    if (gid){ ev(`goTo("gate", ${JSON.stringify(gid)})`); await wait(20); }
    ok("R1 Find on a gate a Show only chip hides takes the initiative chip off, so it's on the chart", gid && T("UI.filter.bars")?.length === 0 && X(`gateVisible(gateItems().find(g=>g.id === ${JSON.stringify(gid)}))`), gid + " " + JSON.stringify(T("UI.filter.bars")));
    ev(`UI.filter = normFilter({lanes:[${JSON.stringify(lane)}]}); showOnly("bar", "m2");`); await wait(10);
    $("#showMore")?.click(); await wait(20);
    ok("R2 the 'and 1 more filter' link opens Filters, and it stays open", $("#showMore") && /and 1 more filter/.test($("#showMore").textContent) && $("#filterPop").hidden === false, $("#showMore")?.textContent);
    ev(`closeFilterPop(); UI.filter = normFilter({}); setZoom("weeks"); select("task", "fa");`); await wait(10);
    [...d.querySelectorAll("#side button")].find(b=>b.textContent === "Day view")?.click(); await wait(20);
    ok("R3 Day view on a task's card still opens its initiative in Days", X("UI.zoom") === "days" && X("UI.focus") === "m2" && !X("fActive()"), [X("UI.zoom"), X("UI.focus"), X("fActive()"), [...d.querySelectorAll("#side button")].map(b=>b.textContent).filter(t=>/Day|Show/.test(t)).join("|")].join(" "));
    ev(`setZoom("weeks"); UI.filter = normFilter({}); showOnly("person", A);`); await wait(10);
    ok("R4 while only a person is shown, late counts say they cover the whole plan", X("partialView()") && /in the whole plan/.test($("#banners")?.textContent || ""), ($("#banners")?.textContent || "").slice(0, 140));
    ev(`UI.rows = "people"; setHiddenQuiet(["meeting"]); render();`); await wait(10);
    $("#showAll")?.click(); await wait(20);
    ok("R5 Show all work clears the filters and leaves rows and what Show hides as they were, so Back puts it all back", !X("fActive()") && X("UI.rows") === "people" && T("hiddenKinds()")?.join() === "meeting", X("UI.rows") + " " + JSON.stringify(T("hiddenKinds()")));
    ev(`UI.rows = "lanes"; setHiddenQuiet([]); render();`);
    ok("R6 the shortcut help no longer promises a focus to step out of", !/focus/i.test(X("JSON.stringify(SHORTCUTS)") || $("#legend")?.textContent || d.body.textContent.match(/Close whatever is open[^"]*/)?.[0] || ""), (d.body.textContent.match(/Close whatever is open[^.]{0,40}/) || [""])[0]);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }

  // A Focus saved by 1.147 in this browser opens as the same chips, and the old state is gone.
  try {
    const dom2 = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w2){
      w2.indexedDB = undefined; w2.confirm = ()=>true; w2.alert = ()=>{}; w2.HTMLCanvasElement.prototype.getContext = ()=>null; w2.Element.prototype.scrollIntoView = ()=>{};
      w2.localStorage.setItem("timeline-planner-ui", JSON.stringify({ws:"timeline", zoom:"days", focus:"m2", filter:{}, drill:{plan:"p", base:{filter:{lanes:["L1"]}, zoom:"weeks"}, stack:[{k:"bar", id:"m2"}, {k:"person", id:"pp1"}], rest:true}})); }});
    await wait(150); const U = JSON.parse(dom2.window.eval("JSON.stringify(UI)"));
    ok("S22 a Focus saved by 1.147 isn't kept, and its zoom under it comes back", U.drill === undefined && U.zoom === "weeks" && !U.focus, JSON.stringify(U));
    const o = JSON.parse(dom2.window.eval(`JSON.stringify(fromFocus({base:{filter:{lanes:["L1"], status:["done"]}, zoom:"days"}, stack:[{k:"bar", id:"m2"}, {k:"person", id:"pp1"}, {k:"evil", id:"x"}], rest:true}))`));
    ok("S22 …and opens as the same chips over its filters", o.filter.bars.join() === "m2" && o.filter.people.join() === "pp1" && o.filter.lanes.join() === "L1" && o.filter.status.join() === "done" && o.zoom === "days", JSON.stringify(o));
    dom2.window.close();
  } catch(e){ ok("S22 ran without throwing", false, String(e && e.stack || e).slice(0, 300)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
