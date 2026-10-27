// Show work from: Added here. On the Timeline and the List, only work added here shows: tasks and initiatives with no
// Jira link, and an initiative that holds such work. Jira-linked items and Jira's stories are hidden. Sprint is Jira's
// sprint, so it has no such choice, and a plan with no Jira work doesn't offer it. It's this viewer's own choice, never
// saved into a shared view. The sample plan with a few Jira keys; names are invented.
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
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); window.PLAIN = JSON.parse(FIX); const p = JSON.parse(FIX);
        p.bars.find(b=>b.id === "m1").jira = "ABC-101";
        const r1 = p.bars.find(b=>b.id === "r1"); r1.tasks = [{id:"tj", label:"Tracked task", start:"2026-10-08", days:2, jira:"ABC-103", status:"notstarted"}, {id:"tp", label:"Plan task", start:"2026-10-08", days:2, status:"notstarted"}];
        S = normalize(p, false); file.handle = null; setLayerQuiet("all"); render();`);
    ok("H0 the choice is offered on the Timeline", $("#lyHere") && !$("#lyHere").hidden && $("#lyHere").textContent === "Added here");
    $("#lyHere").click(); await wait(30);
    ok("H1 it's pressed, and only work added here shows: a plan task stays, a Jira-linked task goes", $("#lyHere").getAttribute("aria-pressed") === "true" && T(`taskVisible(taskById("tp").t)`) === true && T(`taskVisible(taskById("tj").t)`) === false);
    ok("H2 a Jira-linked initiative with nothing added here goes; one holding work added here stays; one added here stays", T(`barVisible(barById("m1"))`) === false && T(`barVisible(barById("r1"))`) === true && T(`barVisible(barById("c3"))`) === true, JSON.stringify(T(`["m1","r1","c3"].map(id=>barVisible(barById(id)))`)));
    ok("H3 Jira's stories go", T(`storyVisible({key:"ABC-9", status:"todo", summary:"s"})`) === false);
    ok("H4 milestones stay: they're the plan's own", T(`S.milestones.length`) > 0 && T(`S.milestones.some(m=>msVisible(m))`) === true);
    ok("H5 a banner says what's hidden and how to show everything", /Showing only work added here/.test($("#hereStrip")?.textContent || "") && !!$("#hereAll"));
    ev(`S.bars.find(b=>b.id === "m1").start = 0; S.bars.find(b=>b.id === "m1").status = "inprogress"; render();`);
    const lateB = [...w.document.querySelectorAll("#banners .banner.warn b")].map(e=>e.textContent).join(" | ");
    ok("H5b the late count says it covers the whole plan, since this view hides some of it", /late in the whole plan: /.test(lateB), lateB);
    ev(`present = true; drawBanners();`);
    ok("H5c Present keeps the banner, so nobody presents a view without Jira's work unaware", !!$("#hereStrip") && !!$("#hereAll"));
    ok("H5d Present's review counts say they cover the whole plan", ($("#banners .review .lbl")?.textContent || "") === "Review of the whole plan", $("#banners .review .lbl")?.textContent);
    ev(`present = false; drawBanners();`);
    ev(`setWs("list"); render();`); await wait(30);
    const ids = T(`listModel().rows.map(r=>r.x ? r.x.id : r.id)`) || [];
    ok("H6 the List follows it", ids.includes("tp") && !ids.includes("tj") && !ids.includes("m1"), JSON.stringify(ids.slice(0, 12)));
    ev(`setWs("standup"); render();`); await wait(30);
    ok("H7 Sprint is Jira's sprint: no Added here there, and All sources shows as pressed", $("#lyHere").hidden && T(`hereOnly()`) === false && $("#lyAll").getAttribute("aria-pressed") === "true");
    ev(`setWs("timeline"); render();`);
    ok("H8 a shared view never saves it: it's this viewer's own choice", T(`hereOnly()`) === true && T(`"layer" in currentDef()`) === false);
    ok("H9 it's kept for this plan in this browser", T(`JSON.parse(localStorage.getItem("sightline-layer"))[S.meta.planId]`) === "here");
    ev(`S = normalize(clone(PLAIN), false); layerMemo = null; render();`); await wait(30);
    ok("H10 a plan with no Jira work doesn't offer it, and shows everything", $("#lyHere").hidden && T(`hereOnly()`) === false && T(`S.bars.filter(b=>!b.parked).every(b=>barVisible(b))`) === true);
    ev(`setLayerQuiet("all");`);
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
