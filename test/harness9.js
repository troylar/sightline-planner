// What's new: release notes browser, unseen dot, one-time update notice, search/filters, scale, escaping.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const releases = JSON.parse(fs.readFileSync(process.env.SIGHTLINE_RELEASES || path.join(__dirname,"..","src","releases.json"),"utf8"));
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
// A fresh page, with whatever this browser already had in localStorage.
async function page(stored = {}, pageHtml = html){
  const dom = new JSDOM(pageHtml,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    for (const [k,v] of Object.entries(stored)) w.localStorage.setItem(k, v);
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){ if (this.open){ this.open=false; this.dispatchEvent(new w.Event("close")); } };
    w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){};
    w.HTMLCanvasElement.prototype.getContext=()=>({font:"",measureText:t=>({width:String(t).length*7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(1100);                                  // past the 800 ms update notice
  return {w, d: w.document, ev: s => w.eval(s)};
}
(async()=>{
  const V = releases[0].version, KINDS0 = [["new","New"],["improved","Improved"],["fixed","Fixed"]].filter(([k])=>releases[0].changes.some(c=>c.kind===k)).map(x=>x[1]).join();

  // ---- the "didn't start" notice goes away when the code runs ----
  { const {d} = await page();
    ok("B1: the didn't-start notice is removed once Sightline runs", !d.getElementById("bootfail")); }

  // ---- the data ----
  { const {d, ev} = await page();
    ok("R1: the app's version is the newest release", ev("APP_VERSION") === V && /^\d+\.\d+\.\d+$/.test(V), ev("APP_VERSION"));
    ok("R1: the current version is visible without opening a dialog", d.querySelector("#whatsNew").textContent.includes(V));
    ok("R1: every release is embedded, newest first", ev("RELEASES.length") === releases.length && ev("RELEASES.every((r,i,a)=>!i || semverCmp(a[i-1].version, r.version) > 0)")); }

  // ---- opening the source keeps existing work available and points to the ready-to-use app ----
  { const source = fs.readFileSync(process.env.SIGHTLINE_SOURCE || path.join(__dirname,"..","src","sightline.template.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
    const fixture = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
    const {w,d,ev} = await page({"timeline-planner-local":fixture},source), notice=d.querySelector("#sourceNotice"), link=notice?.querySelector("a");
    ok("L1: the source explains missing YAML and release history", !!notice && !notice.hidden && /YAML/.test(notice.textContent) && /release history/.test(notice.textContent));
    ok("L2: the source offers the built app in a new tab", link?.getAttribute("href")==="../dist/sightline.html" && link.target==="_blank" && link.rel.split(/\s+/).includes("noopener"));
    ok("L3: the source is visibly identified instead of claiming a release version", /source template/i.test(d.querySelector("#whatsNew").textContent));
    d.querySelector("#whatsNew").click();
    ok("L3: the source does not offer an empty release browser", d.querySelector("#whatsNew").disabled && !d.querySelector("#dlgReleases").open);
    const url=w.location.href, original=JSON.parse(fixture).bars[0].id;
    ok("L4: source guidance leaves the existing browser plan loaded", ev("S.bars[0].id")===original);
    ev(`commit(s=>{s.bars[0].label='Keep this browser edit';}); window.captured=null; download=(text,name,type)=>{window.captured={text,name,type};return true;}; drawBanners();`);
    d.querySelector("#saveJson").click();
    ok("L5: source guidance preserves current edits for JSON download", w.captured && JSON.parse(w.captured.text).bars[0].label==="Keep this browser edit" && w.captured.type==="application/json" && w.location.href===url);
    ok("L6: ordinary banner redraws keep source guidance visible", !!d.querySelector("#sourceNotice") && !d.querySelector("#sourceNotice").hidden);
    ok("L7: source recovery has no runtime errors",w.errs.length===0,w.errs.join(" | "));
  }

  // ---- someone new: no dot, no notice, nothing to catch up on ----
  { const {d, ev} = await page();
    ok("R2: a first-time user sees no unseen dot", d.querySelector("#whatsNew .wn-dot").hidden === true);
    ok("R2: and no update notice", d.querySelector("#toast").hidden !== false || !/updated to/.test(d.querySelector("#toast").textContent), d.querySelector("#toast").textContent);
    ok("R2: and counts as having seen this release", ev(`localStorage.getItem("sightline-seen-release")`) === V); }

  // ---- someone who used Sightline before release notes existed ----
  const returning = {"timeline-planner-ui": "{}"};
  { const {w, d, ev} = await page(returning);
    ok("R3: a returning user sees the unseen dot", d.querySelector("#whatsNew .wn-dot").hidden === false);
    ok("R3: and a one-time note that Sightline was updated", d.querySelector("#toast").hidden === false && d.querySelector("#toast").textContent.includes(`updated to ${V}`), d.querySelector("#toast").textContent);
    ok("R3: the button says so to a screen reader", /not seen yet/.test(d.querySelector("#whatsNew").getAttribute("aria-label")));

    // ---- open it ----
    d.querySelector("#whatsNew").click();
    const dl = d.querySelector("#dlgReleases"), items = () => [...d.querySelectorAll("#relList .rn-item")], detail = () => d.querySelector("#relDetail");
    ok("R4: What's new opens the release notes", dl.open === true);
    ok("R4: it says which version you're on", d.querySelector("#relVersion").textContent.includes(V));
    const page1 = Math.min(40, releases.length);
    const newestMonth = new Date(releases[0].date + "T00:00:00Z").toLocaleDateString("en-US", {month:"long", year:"numeric", timeZone:"UTC"});
    ok("R4: releases are listed newest first, grouped by their release month, 40 at a time", items().length === page1 && items()[0].textContent.startsWith(V) && d.querySelector("#relList .rn-month")?.textContent === newestMonth);
    for (let i = 0; i < 10 && d.querySelector("#relList .rn-more"); i++){ d.querySelector("#relList .rn-more").click(); await wait(10); }   // 40 more each time
    ok("R4: and Show more lists the rest, so every release can be found", items().length === releases.length);
    ok("R4: the newest is marked Latest", !!items()[0].querySelector(".rn-tag.latest") && !items()[1].querySelector(".rn-tag.latest"));
    ok("R5: releases since your last visit are marked New for you", items().every((x,i)=>!!x.querySelector(".rn-tag.fresh") === (releases[i].version !== "1.0.0")));
    ok("R4: the latest release is open, with New / Improved / Fixed", detail().querySelector(".rn-title").textContent === `Sightline ${V}` && [...detail().querySelectorAll(".rn-group h4 .rn-kind")].map(x=>x.textContent).join() === KINDS0);
    const n0 = releases[0].changes.length;
    ok("R4: every change shows Before, Now and Where", detail().querySelectorAll(".rn-chg").length === n0 && detail().querySelectorAll(".rn-chg .before").length === releases[0].changes.filter(c=>c.before).length && detail().querySelectorAll(".rn-chg .rn-where").length === releases[0].changes.filter(c=>c.where).length);
    ok("R4: the release list shows how many of each kind", ["new","improved","fixed"].filter(k=>releases[0].changes.some(c=>c.kind===k)).every(k=>items()[0].textContent.includes(releases[0].changes.filter(c=>c.kind===k).length + " " + k)), items()[0].textContent);
    ok("R5: opening it clears the dot and records the release as seen", d.querySelector("#whatsNew .wn-dot").hidden === true && ev(`localStorage.getItem("sightline-seen-release")`) === V);
    ok("R4: focus starts in the search box", d.activeElement && d.activeElement.id === "relSearch");

    // ---- search and filters ----
    const search = t => { const s = d.querySelector("#relSearch"); s.value = t; s.dispatchEvent(new w.Event("input",{bubbles:true})); };
    search("redirect");
    const hit = releases.find(r=>r.changes.some(c=>/redirect/i.test(JSON.stringify(c)))).version;
    ok("R6: search narrows the list to releases with a match", items().length === 1 && items()[0].textContent.startsWith(hit), items().map(x=>x.textContent.slice(0,6)).join());
    ok("R6: and the release shows only the matching changes", /Showing 1 of \d+ changes/.test(detail().querySelector(".rn-filtered")?.textContent || "") && detail().querySelectorAll(".rn-chg").length === 1);
    detail().querySelector(".rn-filtered .linkish").click();
    ok("R6: Show all clears the search", d.querySelector("#relSearch").value === "" && items().length === Math.min(40, releases.length) && detail().querySelectorAll(".rn-chg").length === releases.find(r=>r.version===hit).changes.length);
    search("the planner gets a name");
    ok("R6: a search that matches a release's headline keeps all its changes", items().length === 1 && detail().querySelectorAll(".rn-chg").length === releases.find(r=>r.headline==="the planner gets a name").changes.length);
    search("zzzz-nothing");
    ok("R9: no matches says so", d.querySelector("#relList .rn-empty")?.textContent.includes("No changes match") && detail().children.length === 0);
    search("");
    [...d.querySelectorAll("#relKinds .rn-chip")].find(b=>b.textContent === "Fixed").click();
    for (let i = 0; i < 10 && d.querySelector("#relList .rn-more"); i++){ d.querySelector("#relList .rn-more").click(); await wait(10); }   // past 40 fixed releases, the filter pages too
    ok("R7: the Fixed filter shows only fixed changes", [...detail().querySelectorAll(".rn-group h4 .rn-kind")].map(x=>x.textContent).join() === "Fixed" && items().length === releases.filter(r=>r.changes.some(c=>c.kind==="fixed")).length);
    ok("R7: the filter chip shows it's on", [...d.querySelectorAll("#relKinds .rn-chip")].find(b=>b.textContent === "Fixed").getAttribute("aria-pressed") === "true");
    [...d.querySelectorAll("#relKinds .rn-chip")].find(b=>b.textContent === "All").click();
    const area = d.querySelector("#relArea"); area.value = "Jira"; area.dispatchEvent(new w.Event("change",{bubbles:true}));
    ok("R8: the area filter finds that area in every release", items().length === Math.min(40, releases.filter(r=>r.changes.some(c=>c.area==="Jira")).length) && [...detail().querySelectorAll(".rn-chg .a")].every(x=>x.textContent === "Jira"));
    area.value = ""; area.dispatchEvent(new w.Event("change",{bubbles:true}));
    items()[0]?.click();                                  // back to the newest release (the area filter may have moved to an older one)

    // ---- getting around ----
    const older = [...detail().querySelectorAll(".rn-nav button")].find(b=>b.textContent.includes(releases[1].version));
    older?.click();
    ok("R10: step to the previous release from the bottom of one", detail().querySelector(".rn-title").textContent === `Sightline ${releases[1].version}`);
    ok("R4: a change with nothing before it shows Now on its own", detail().querySelectorAll(".rn-ba.solo").length === releases[1].changes.filter(c=>!c.before).length);
    items()[1].focus(); items()[1].dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}));
    ok("R11: arrow keys move through the list", detail().querySelector(".rn-title").textContent === `Sightline ${V}` && d.activeElement === items()[0]);
    d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"a",bubbles:true}));
    ok("R12: shortcuts don't fire behind the dialog", d.querySelector("#addMenu").hidden === true);
    const strays = [...(function*(){ const tw = d.createTreeWalker(dl, w.NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) yield n.nodeValue.trim(); })()].filter(t=>t === "null" || t === "undefined");
    ok("R15: no stray null / undefined anywhere in it", strays.length === 0, String(strays.length));
    d.querySelector("#relClose").click();
    ok("R16: closing returns focus to What's new", dl.open === false && d.activeElement && d.activeElement.id === "whatsNew");
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | ")); }

  // ---- the note shows once per release, not every visit ----
  { const {d} = await page({...returning, "sightline-seen-release": "1.0.0", "sightline-toasted-release": V});
    ok("R3: after the note has been shown once, it doesn't show again", d.querySelector("#toast").hidden !== false || !/updated to/.test(d.querySelector("#toast").textContent));
    ok("R3: but the dot stays until they look", d.querySelector("#whatsNew .wn-dot").hidden === false); }

  // ---- untrusted text and scale ----
  { const {w, d, ev} = await page();
    ev(`rel.list = [{version:"9.9.9", date:"2026-12-01", headline:"<img src=x onerror=window.pwned=1>", changes:[{kind:"new", area:"<b>x</b>", title:"<script>window.pwned=1</script>", now:"<svg onload=window.pwned=1>"}]}]; openReleases();`);
    ok("R13: release text is shown as text, never as HTML", !d.querySelector("#dlgReleases img, #dlgReleases svg[onload], #relDetail script, #relDetail b + b") && ev("!window.pwned") && d.querySelector("#relDetail .rn-chg .t").textContent.startsWith("<script>"));
    d.querySelector("#relClose").click();
    const kinds = ["new","improved","fixed"];
    ev(`rel.list = Array.from({length:1000}, (_, i) => { const v = 1000 - i, y = 2026 + Math.floor(v / 120), m = 1 + (v % 12);
      return {version:"2." + v + ".0", date: y + "-" + String(m).padStart(2,"0") + "-01", headline:"release " + v,
        changes: Array.from({length:10}, (_, j) => ({kind: ${JSON.stringify(kinds)}[j % 3], area: "Area " + (j % 7), title: "Change " + v + "." + j, before: "was " + j, now: "is " + j + (v === 7 ? " needle" : ""), where: "here"}))}; });
      openReleases();`);
    const items = () => d.querySelectorAll("#relList .rn-item").length;
    ok("R14: 1,000 releases open showing the first page, not all of them", items() === 40 && /Show 40 more/.test(d.querySelector(".rn-more")?.textContent || ""), String(items()));
    d.querySelector(".rn-more").click();
    ok("R14: Show more adds the next page", items() === 80);
    const t0 = Date.now(); const s = d.querySelector("#relSearch"); s.value = "needle"; s.dispatchEvent(new w.Event("input",{bubbles:true})); const dt = Date.now() - t0;
    ok("R14: searching 10,000 changes finds the one match quickly", items() === 1 && d.querySelector("#relDetail .rn-title").textContent === "Sightline 2.7.0" && dt < 300, dt + " ms");
    ok("no runtime errors (untrusted text, scale)", w.errs.length === 0, w.errs.join(" | ")); }

  // ---- CHANGELOG.md for people reading the repo ----
  { const md = fs.readFileSync(path.join(__dirname,"..","CHANGELOG.md"),"utf8");
    ok("R17: CHANGELOG.md lists every release", releases.every(r=>md.includes(`## ${r.version} · `)));
    ok("R17: and says it's generated from releases.json", /Generated by build\.sh from src\/releases\.json/.test(md)); }

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
