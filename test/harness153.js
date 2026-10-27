// Show only these initiatives: pick one or more (from the initiative's card or the Filters panel) and every view shows
// just those, everything inside them, and the initiatives that hold them. Milestones done when a shown initiative is
// stay; gates go. It's a filter like the others: counted, saved with a view, cleaned when an initiative is deleted.
// The sample plan, with a small tree added here (c1 holds c2, c2 holds c3). Every name is invented.
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
  const $ = s => w.document.querySelector(s);
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const p = JSON.parse(FIX);
        p.bars.find(b=>b.id === "c2").parent = "c1"; p.bars.find(b=>b.id === "c3").parent = "c2";
        p.milestones[0].after = ["c3"]; p.milestones[1].after = ["m1"];
        p.bars.find(b=>b.id === "m5").label = '<img src=x onerror="window.pwned=1">Retire';
        S = normalize(p, false); UI.filter = normFilter({}); render();
        window.VIS = () => S.bars.filter(b=>barVisible(b)).map(b=>b.id).sort();`);
    const all = J("S.bars.length");

    // The filter's data.
    const n = T(`normFilter({bars:["c2", 7, "", "c2", "x".repeat(500)]}).bars`);
    ok("N1 a picked list keeps text ids only, once each", Array.isArray(n) && n.includes("c2") && n.every(x=>typeof x === "string" && x) && n.filter(x=>x === "c2").length === 1, JSON.stringify(n && n.slice(0, 3)));
    ok("N2 an empty filter picks nothing", T(`normFilter({}).bars`)?.length === 0);
    ok("N3 picking counts as one filter, however many are picked", T(`[fActive(normFilter({bars:["c2"]})), fCount(normFilter({bars:["c2", "m1"], lanes:["chat"]}))]`)?.join() === "true,2");
    ok("N4 an initiative that's gone is dropped from the list", T(`cleanFilter(normFilter({bars:["c2", "gone"]})).bars`)?.join() === "c2");

    // What shows.
    ev(`UI.filter = normFilter({bars:["c2"]}); render();`);
    ok("V1 only c2, what's inside it (c3) and what holds it (c1)", T("VIS()")?.join() === "c1,c2,c3", T("VIS()")?.join());
    ev(`UI.filter = normFilter({bars:["c2", "m1"]}); render();`);
    ok("V2 two picked: both, with their trees", T("VIS()")?.join() === "c1,c2,c3,m1", T("VIS()")?.join());
    ok("V3 a milestone done when a shown initiative is stays; one tied to nothing shown goes", T(`[msVisible(S.milestones[0]), msVisible(S.milestones[1]), msVisible(S.milestones[2])]`)?.join() === "true,true,false");
    ok("V4 gates are hidden while picking (they're not tied to an initiative)", J("S.gates.length") > 0 && T("S.gates.every(g=>!gateVisible(g))") === true);
    ev(`UI.filter = normFilter({bars:["c1"], lanes:["int"]}); render();`);
    ok("V5 picks combine with other filters (a workstream it isn't in shows nothing)", T("VIS()")?.length === 0, T("VIS()")?.join());
    ev(`UI.filter = normFilter({bars:["c1"]}); render();`);
    ok("V6 picking the top one shows everything inside it", T("VIS()")?.join() === "c1,c2,c3", T("VIS()")?.join());
    ev(`commit(s=>{ s.bars.find(b=>b.id === "c4").parent = "c3"; });`);
    ok("V7 an initiative moved inside a picked one shows at once", T("VIS()")?.join() === "c1,c2,c3,c4", T("VIS()")?.join());
    const before = T("VIS()")?.length; ev(`undo && undo(); UI.filter = normFilter({}); render();`);
    ok("V8 taking the pick off brings every initiative back", before === 4 && T("VIS()")?.length === all);

    // The card.
    ev(`select("bar", "c2");`); await wait(30);
    let b = $("#f-only");
    ok("C1 an initiative's card offers Show only this", b && b.textContent === "Show only this" && b.getAttribute("aria-pressed") === "false", b && b.textContent);
    b && b.click(); await wait(30);
    ok("C2 clicking it picks that initiative", T("UI.filter.bars")?.join() === "c2" && T("VIS()")?.join() === "c1,c2,c3");
    b = $("#f-only");
    ok("C3 the card now offers to show everything again, and keeps focus", b && b.textContent === "Show every initiative" && b.getAttribute("aria-pressed") === "true" && w.document.activeElement === b, b && b.textContent);
    ok("C4 the status line says what's shown", /Showing only/.test($("#status")?.textContent || J("document.body.textContent")));
    ev(`select("bar", "m1");`); await wait(30); b = $("#f-only");
    ok("C5 another initiative's card offers Also show this", b && b.textContent === "Also show this", b && b.textContent);
    b && b.click(); await wait(30);
    ok("C6 and adds it", T("UI.filter.bars")?.join() === "c2,m1");
    b = $("#f-only");
    ok("C7 with two picked, the card takes just this one off", b && b.textContent === "Stop showing this one", b && b.textContent);
    b && b.click(); await wait(30);
    ok("C8 and only this one", T("UI.filter.bars")?.join() === "c2");
    ok("C9 the scope line names the pick", /only Runtime library spike/.test(J("scopeText()")), J("scopeText()"));

    // It stays said: a strip above the chart while picks are on, in Present too; late counts say they're the whole plan.
    const strip = $("#onlyStrip");
    ok("B1 a strip says only one initiative is shown, for as long as it is", strip && /Showing only "Runtime library spike"/.test(strip.textContent) && $("#onlyAll"), strip && strip.textContent);
    ok("B2 the late count says it's for the whole plan while picking", /late in the whole plan:/.test($("#banners")?.textContent || ""), ($("#banners")?.textContent || "").slice(0, 120));
    ev(`present = true; drawBanners();`);
    ok("B3 Present shows the strip too", !!$("#onlyStrip"));
    ev(`present = false; drawBanners();`);
    // The Filters panel.
    ev(`openFilterPop();`); await wait(30);
    const chip = $('#fBars [data-fkey="bars:c2"]'), add = $("#fBarAdd");
    ok("P1 the panel lists the pick as a chip under Show only, by name, and its × says what it does", chip && chip.textContent === "Runtime library spike ×" && chip.getAttribute("aria-label") === "Stop showing Runtime library spike" && /Show only these initiatives/.test($("#fBars .fh")?.textContent || ""), chip && chip.textContent);
    ok("P2 the picker offers other initiatives by workstream, not the ones picked", add && !add.querySelector('option[value="c2"]') && add.querySelector('optgroup option[value="m1"]'));
    add.focus(); add.value = "r1"; add.dispatchEvent(new w.Event("change")); await wait(30);
    ok("P3 picking from the panel adds it", T("UI.filter.bars")?.join() === "c2,r1");
    ok("P4 focus stays on the picker after it redraws", w.document.activeElement && w.document.activeElement.id === "fBarAdd", w.document.activeElement && w.document.activeElement.id);
    $('#fBars [data-fkey="bars:r1"]')?.click(); await wait(30);
    ok("P5 a chip's click takes it off", T("UI.filter.bars")?.join() === "c2");
    ev(`setOnly("m5", true);`); await wait(30); ev(`openFilterPop();`); await wait(30);
    const hostile = $('#fBars [data-fkey="bars:m5"]');
    ok("P6 a name from the plan is shown as text", hostile && /<img/.test(hostile.textContent) && !$("#fBars img") && !w.pwned);

    // A saved view keeps it; List follows it.
    ev(`createView("Chat only", "personal");`);
    const saved = T(`personalViews().find(v=>v.name === "Chat only").def.filter.bars`);
    ok("S1 a saved view keeps the picks", saved?.join() === "c2,m5", JSON.stringify(saved));
    ev(`UI.filter = normFilter({}); render(); applyView("personal", personalViews().find(v=>v.name === "Chat only"));`);
    ok("S2 opening the view picks them again", T("UI.filter.bars")?.join() === "c2,m5");
    $("#onlyAll")?.click(); await wait(30);
    ok("B4 the strip's Show every initiative takes every pick off, and the strip goes", T("UI.filter.bars")?.length === 0 && !$("#onlyStrip") && !/in the whole plan/.test($("#banners")?.textContent || ""));
    ev(`applyView("personal", personalViews().find(v=>v.name === "Chat only"));`);
    const rows = T(`listModel().rows.filter(r=>r.type === "bar").map(r=>r.id).sort()`);
    ok("L1 the List shows only those initiatives and their trees", rows?.join() === "c1,c2,c3,m5", rows?.join());
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
