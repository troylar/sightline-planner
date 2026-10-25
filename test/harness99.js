// Saved views keep their source layer, and controls describe the page they affect.
// The source-layer checks fail on the build before this change.
const {JSDOM, VirtualConsole} = require("jsdom");
const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const results = [];
const ok = (name, condition, detail = "") => results.push(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.log(results.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 40000).unref();
async function page(){
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
    w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = () => true; w.prompt = () => "View"; w.alert = () => {};
    w.URL.createObjectURL = () => "blob:test"; w.URL.revokeObjectURL = () => {};
    w.Element.prototype.scrollIntoView = function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText:t => ({width:String(t).length * 7})});
    w.CSS = w.CSS || {}; w.CSS.escape = s => s;
    w.errors = []; w.addEventListener("error", e => w.errors.push(e.message));
  }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  w.FIXTURE = fixture;
  ev("S = normalize(JSON.parse(FIXTURE), false); file.handle = null; locked = false; resetHistory(); setMe(S.people[0].id); UI.ws = 'timeline'; UI.noWelcome = true; render();");
  return {w, d:w.document, ev};
}
(async () => {
  const section = async fn => { try { await fn(); } catch(e){ ok("section completed", false, e.message); } };
  await section(async () => {
    const {w, d, ev} = await page();
    for (const source of ["personal", "team"]) for (const layer of ["all", "jira", "mine"]){
      w.SOURCE = source; w.LAYER = layer;
      ev("clearView(); setLayer(LAYER); createView(SOURCE + '-' + LAYER, SOURCE);");
      const stored = ev("normViewDef(activeView().def).layer || 'all'");
      ok(`${source} ${layer}: saved view keeps its sources`, stored === layer, stored);
      ev("window.SAVED = JSON.parse(JSON.stringify(activeView())); setLayer(LAYER === 'all' ? 'jira' : 'all'); applyView(SOURCE, SAVED);");
      ok(`${source} ${layer}: applying restores sources`, ev("layerOf()") === layer, ev("layerOf()"));
      ok(`${source} ${layer}: freshly applied view is unchanged`, !ev("viewModified()") && !/Modified/.test(d.querySelector("#viewBtn").textContent));
      ev("setLayer(LAYER === 'all' ? 'mine' : 'all');");
      ok(`${source} ${layer}: source change is marked modified`, ev("viewModified()"));
      ev("saveCurrentView(); window.SAVED = JSON.parse(JSON.stringify(activeView())); setLayer(LAYER); applyView(SOURCE, SAVED);");
      const changed = layer === "all" ? "mine" : "all";
      ok(`${source} ${layer}: Save updates sources and clears modified`, ev("layerOf()") === changed && !ev("viewModified()"));
    }
    ev("clearView(); setLayer('mine'); clearView();");
    ok("All work resets source layer as well as filters", ev("layerOf()") === "all" && !ev("fActive()"));
    ok("saved view interactions raise no page errors", !w.errors.length, w.errors.join(" | "));
    await wait(30);
  });
  await section(async () => {
    const {w, d, ev} = await page();
    ev("UI.filter = normFilter({lanes:[S.lanes[0].id]}); UI.notes = 'mine';");
    const scopedReport = ev("JSON.stringify(reportDraft().sections)");
    ev("window.KEPT_FILTER = JSON.parse(JSON.stringify(UI.filter)); UI.filter = normFilter({});");
    ok("status update describes the whole plan rather than the retained Timeline filter", ev("JSON.stringify(reportDraft().sections)") === scopedReport);
    ev("UI.filter = normFilter(KEPT_FILTER);");
    for (const ws of ["timeline", "people", "today", "standup", "roadmap", "plan"]){
      w.WORKSPACE = ws; ev("UI.planTab = 'report'; setWs(WORKSPACE); render();");
      const scoped = ["timeline", "people"].includes(ws), noted = ["timeline", "people", "today", "standup"].includes(ws);
      ok(`${ws}: saved views and filters appear only where supported`, d.querySelector("#viewBtn").hidden === !scoped && d.querySelector("#filterBtn").hidden === !scoped);
      ok(`${ws}: note controls appear only where supported`, d.querySelector("#notesBtn").hidden === !noted);
      ok(`${ws}: timeline zoom appears only on Timeline`, d.querySelector("#zoomSeg").hidden === (ws !== "timeline"));
      if (ws === "roadmap" || ws === "plan"){
        const label = ws === "roadmap" ? "Roadmap" : "Status update";
        ok(`${ws}: whole-plan scope is explicit despite retained filters`, d.querySelector("#scopeLine").textContent === `Whole plan · ${label}`, d.querySelector("#scopeLine").textContent);
      }
    }
    ev("setWs('timeline'); render();");
    ok("returning to Timeline preserves its filter", ev("UI.filter.lanes.length") === 1 && ev("UI.filter.lanes[0] === S.lanes[0].id"));
    ok("three primary jobs and Settings head the menu", ["nav-work", "nav-delivery", "nav-updates", "tab-plan"].every(id=>d.querySelector("#sidenav .snh#" + id)));
    ok("Settings has only one navigation entry", d.querySelectorAll('#tab-plan').length === 1);
    d.querySelector("#tab-roadmap").click();
    ok("Updates opens the existing Roadmap", ev("UI.ws") === "roadmap" && !d.querySelector("#ws-roadmap").hidden);
    d.querySelector("#delivery-status").click();
    ok("delivery status opens the existing whole-plan report", ev("UI.ws") === "plan" && ev("UI.planTab") === "report" && !d.querySelector("#ws-plan").hidden);
    d.querySelector("#set-calendar").click();
    ev("goMainGroup('delivery')"); ev("goMainGroup('settings')");
    ok("Settings remembers Calendar after a visit to Delivery", ev("UI.ws") === "plan" && ev("UI.planTab") === "calendar" && [...d.querySelectorAll('#ws-plan [data-plan="calendar"]')].every(section=>!section.hidden));
    d.querySelector("#tab-plan").click();
    ok("clicking the Settings heading keeps the selected Calendar section", ev("UI.planTab") === "calendar" && d.querySelector('#set-calendar').getAttribute("aria-current") === "page");
    ok("workspace transitions raise no page errors", !w.errors.length, w.errors.join(" | "));
    await wait(30);
  });
  console.log(results.join("\n"));
  const failed = results.filter(r => r.startsWith("FAIL")).length;
  console.log(`${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
})();
