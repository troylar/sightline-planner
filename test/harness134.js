// Settings pages and the File menu: File holds only file actions; Plan details, the baseline and the start page each
// have one home; every Settings page is titled with its name in the menu, word for word, with no second heading saying it again.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
  w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
const w = dom.window, d = w.document, ev = s=>w.eval(s);
const shown = el => !!el && !el.closest("[hidden]");
(async()=>{
  try {
    await wait(180); w.FIX = FIX; ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); resetHistory(); sel = null; goWs('timeline'); render()");
    const fm = d.querySelector("#fileMenu"), heads = [...fm.querySelectorAll(".mh")].map(x=>x.textContent);
    ok("F1 File holds only file actions: the shared file, importing a copy, exporting a copy", heads.join("|") === "Shared file|Import a copy|Export a copy", heads.join("|"));
    ok("F1 …so Jira setup, Plan settings, Set baseline and Start with are no longer in it", ["#jiraMenu", "#settings", "#baseline", "#startWith"].every(s=>!fm.querySelector(s)) && !d.querySelector("#jiraMenu"));
    ok("F2 Start with is a choice for this browser, in your menu", d.querySelector("#meMenu").contains(d.querySelector("#startWith")) && /Start Sightline with/.test(d.querySelector("#startWith").textContent));
    d.querySelector("#startWith").click(); await wait(5); ok("F2 …and still opens the same choice", !!d.querySelector("#dlgStart")?.open); d.querySelector("#dlgStart")?.close();

    // Plan details
    d.querySelector("#set-details").click(); await wait(5);
    const t = d.querySelector("#planTitle");
    ok("P1 Settings starts its Plan group with Plan details, its own page", ev("UI.ws + ':' + UI.planTab") === "plan:details" && d.querySelector("#snp-settings .snp").id === "set-details" && shown(d.querySelector('[data-plan="details"]')));
    ok("P1 …titled Plan details, the region named by it", t.tagName === "H1" && !t.hidden && t.textContent === "Plan details" && d.querySelector("#ws-plan").getAttribute("aria-labelledby") === "planTitle");
    ok("P2 it lists the start, sprints, scheduling and where Jira links go", /Starts/.test(d.querySelector("#detailsList").textContent) && d.querySelector("#detailsList").textContent.includes(ev("fmtDay(isoToDay(S.meta.start))")) && /Jira links go to/.test(d.querySelector("#detailsList").textContent));
    ev("quickMode = true; render()"); d.querySelector("#settings").click(); await wait(5);
    ok("P3 Edit plan details opens the same dialog, now named Plan details", d.querySelector("#dlgDates").open && /Plan details/.test(d.querySelector("#dlgDates h3").textContent));
    d.querySelector("#dStart").value = "2026-09-28"; d.querySelector("#dDatesOk").click(); await wait(10);
    ok("P3 …and the page shows the change", ev("S.meta.start") === "2026-09-28" && d.querySelector("#detailsList").textContent.includes(ev("fmtDay(isoToDay('2026-09-28'))")));
    ev("undo(); quickMode = false; render()");

    // every Settings page, titled by its menu name
    const pages = [...d.querySelectorAll("#snp-settings .snp")], bad = [];
    for (const b of pages){ b.click(); await wait(5); const name = b.querySelector(".snl").textContent;
      const visible = [...d.querySelectorAll("#ws-plan [data-plan] h1, #ws-plan [data-plan] h2")].filter(shown).map(x=>x.textContent.trim());
      if (t.hidden || t.textContent !== name || visible.includes(name)) bad.push(`${name}: title "${t.hidden ? "" : t.textContent}", also ${visible.filter(x=>x === name).length}`); }
    ok("T1 every Settings page is titled with its name in the menu, and no heading below says it again", !bad.length && pages.length === 8, bad.join("; "));
    ok("T1 …so Jira's page says Jira connection, and Team's list is People", (d.querySelector("#set-jira").click(), t.textContent === "Jira connection") && (d.querySelector("#set-team").click(), shown([...d.querySelectorAll('[data-plan="team"] h2')].find(x=>x.textContent === "People"))));
    ok("T2 the group names in the Settings menu are read out, not hidden", [...d.querySelectorAll("#snp-settings .snsub")].every(x=>!x.hasAttribute("aria-hidden")) && d.querySelectorAll("#snp-settings .snsub").length === 3);
    d.querySelector("#delivery-milestones").click(); await wait(5);
    ok("T3 Delivery pages keep their own headings, with no Settings title", t.hidden && d.querySelector("#ws-plan").getAttribute("aria-labelledby") === "tab-plan");

    // the baseline lives with Snapshots
    d.querySelector("#delivery-snapshots").click(); await wait(5); ev("quickMode = true; S.baseline = null; render()");
    const bl = d.querySelector("#baseline");
    ok("B1 Set baseline is on Snapshots, with what it does", shown(bl) && bl.closest('[data-plan="snapshots"]') && /dashed outline/.test(d.querySelector("#baselineHint").textContent) && bl.textContent === "Set baseline");
    bl.click(); await wait(5);
    ok("B1 …and sets it as before", !!ev("S.baseline") && bl.textContent === "Clear baseline"); ev("undo(); quickMode = false; render()");
    ok("B2 help points to where things moved", /\(Delivery (→|\\u2192) Snapshots\) before a review/.test(html) && /in Settings, Plan details, and Jira keys become links/.test(html) && !/in File, Plan settings, and Jira keys/.test(html));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
