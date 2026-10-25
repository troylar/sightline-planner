// The header: one menu for you and this browser (who you are, text size, theme, what's new, help), and View, which
// holds rows and sources and says what's chosen. Text size is this browser's: 90-150% in 10% steps, never below 9px.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const page = (store = {}) => { const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
  w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }}); return dom.window; };
const fontOf = (w, sel) => { for (const sh of w.document.styleSheets) for (const r of sh.cssRules) if (r.selectorText === sel) return r.style.getPropertyValue("font-size"); return null; };
const key = (w, el, k, o = {}) => el.dispatchEvent(new w.KeyboardEvent("keydown", {key:k, bubbles:true, cancelable:true, ...o}));
(async()=>{
  try {
    const w = page(), d = w.document, ev = s=>w.eval(s); await wait(180);
    ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(window.FIX); resetHistory(); sel = null; goWs('timeline'); setZoom('weeks'); render()".replace("window.FIX", JSON.stringify(FIX)));
    const mb = d.querySelector("#meBtn"), menu = d.querySelector("#meMenu");
    ok("A1 one button in the header holds who you are, text size, theme, what's new and help", ["#identityBtn", "#tsDown", "#tsUp", "#tsReset", "#theme", "#whatsNew", "#help"].every(s=>menu.contains(d.querySelector(s))) && !!d.querySelector(".top #meBtn"));
    ok("A1 …and before you choose, it says Choose yourself", /Choose yourself/.test(mb.textContent) && /^Choose yourself/.test(mb.getAttribute("aria-label")));
    ev("setMe(S.people[0].id); render()"); const p0 = J => ev(`personById(S.people[0].id).${J}`);
    ok("A2 then it shows your initials, and names you to a screen reader", d.querySelector("#meIni").textContent === p0("initials") && mb.getAttribute("aria-label").startsWith(`You: ${p0("name")}`) && !d.querySelector("#meLbl").textContent);
    mb.click(); await wait(5);
    ok("A3 it opens as a menu, focus on its first item", !menu.hidden && mb.getAttribute("aria-expanded") === "true" && d.activeElement === d.querySelector("#identityBtn"));
    key(w, d.activeElement, "ArrowDown"); ok("A3 …arrow keys move through it", d.activeElement === d.querySelector("#tsDown"));
    key(w, d.activeElement, "Escape"); ok("A3 …and Escape closes it, back on the button", menu.hidden && d.activeElement === mb && mb.getAttribute("aria-expanded") === "false");
    mb.click(); await wait(5); d.body.click(); ok("A3 …so does a click elsewhere", menu.hidden);
    mb.click(); await wait(5); d.querySelector("#help").click(); await wait(5);
    ok("A4 Help still opens help, and closes the menu", d.querySelector("#dlgHelp").open && menu.hidden); d.querySelector("#dlgHelp").close();
    mb.click(); await wait(5); d.querySelector("#theme").click();
    ok("A4 the theme changes in place, menu still open to see it", d.documentElement.getAttribute("data-theme") === "light" && !menu.hidden && /Theme: Light/.test(d.querySelector("#theme").textContent));
    d.querySelector("#theme").click(); d.querySelector("#theme").click(); mb.click();
    ev("localStorage.setItem('sightline-seen-release', '1.0.0'); updateWhatsNew(); render()");
    ok("A5 something new to read puts the dot on the button too", !d.querySelector("#meBtn .wn-dot").hidden && /Something new/.test(mb.getAttribute("aria-label")));

    // text size
    const base = fontOf(w, ".bar"), tiny = fontOf(w, ".tbar .who .ini"), title = fontOf(w, ".top input.title");
    ok("T1 it starts at 100%, with the page's own sizes", d.querySelector("#tsVal").textContent === "100%" && base === "11.5px" && d.querySelector("#tsReset").getAttribute("aria-disabled") === "true");
    mb.click(); await wait(5); for (let i = 0; i < 6; i++){ d.querySelector("#tsUp").focus(); d.querySelector("#tsUp").click(); }
    ok("T2 A+ goes up in 10% steps and stops at 150%", d.querySelector("#tsVal").textContent === "150%" && d.querySelector("#tsUp").getAttribute("aria-disabled") === "true" && !menu.hidden && d.activeElement === d.querySelector("#tsUp"));
    key(w, d.activeElement, "Escape"); ok("T2 …and at the end, Escape still closes the menu", menu.hidden && d.activeElement === mb); mb.click(); await wait(5);
    ok("T2 …the page's base text scales too, since no style hides its size in a font shorthand with var()", fontOf(w, "body") === "21px" && ![...d.querySelectorAll("style")].some(x=>/font:[^;}]*var\(/.test(x.textContent)));
    ok("T2 …every size scales with it", fontOf(w, ".bar") === "17.25px" && fontOf(w, ".top input.title") === parseFloat(title) * 1.5 + "px" && fontOf(w, ".tbar .who .ini") === parseFloat(tiny) * 1.5 + "px");
    ok("T2 …and it's kept in this browser only", w.localStorage.getItem("timeline-planner-textsize") === "1.5" && !JSON.stringify(ev("portablePlan(S)")).includes("textsize") && !/textScale|textsize/.test(JSON.stringify(ev("assistantView()"))));
    ok("T3 bar labels are measured at the new size, so they still fit", ev("textW('Integrations')") === "Integrations".length * 6.3 * 1.5);
    for (let i = 0; i < 8; i++) d.querySelector("#tsDown").click();
    ok("T4 A- stops at 90%", d.querySelector("#tsVal").textContent === "90%" && d.querySelector("#tsDown").getAttribute("aria-disabled") === "true");
    ok("T4 …and nothing goes below 9px: 10px becomes 9px, and a size already under 9px stays", fontOf(w, ".bar") === "10.35px" && ev("tsSize(10)") === 9 && fontOf(w, ".tbar .who .ini") === tiny && parseFloat(tiny) < 9);
    d.querySelector("#tsReset").click();
    ok("T5 Reset goes back to 100%, and forgets the setting", d.querySelector("#tsVal").textContent === "100%" && fontOf(w, ".bar") === "11.5px" && w.localStorage.getItem("timeline-planner-textsize") === null);
    d.querySelector("#tsUp").click(); key(w, d.body, "=", {ctrlKey:true}); key(w, d.body, "+"); key(w, d.body, "-"); key(w, d.body, "0", {ctrlKey:true});
    ok("T6 no keyboard shortcut changes it, and Ctrl or Cmd with + and - are left to the browser", d.querySelector("#tsVal").textContent === "110%");
    d.querySelector("#tsReset").click(); mb.click();
    const w2 = page({"timeline-planner-textsize":"1.3"}); await wait(180);
    ok("T7 a saved size is there next time", w2.document.querySelector("#tsVal").textContent === "130%" && fontOf(w2, ".bar") === "14.95px");
    const w3 = page({"timeline-planner-textsize":"4"}); await wait(180);
    ok("T7 …and a value out of range is ignored", w3.document.querySelector("#tsVal").textContent === "100%" && fontOf(w3, ".bar") === "11.5px");

    // View
    const vb = d.querySelector("#layoutBtn"), vp = d.querySelector("#layoutPop");
    ok("V1 View says how the rows are shown", d.querySelector("#layoutSum").textContent === "By workstream" && /^View: By workstream/.test(vb.getAttribute("aria-label")) && vp.contains(d.querySelector("#rowsSeg")) && vp.contains(d.querySelector("#layerSeg")));
    vb.click(); await wait(5);
    ok("V2 it opens on the choice that's on", !vp.hidden && d.activeElement === d.querySelector("#rLanes") && vb.getAttribute("aria-expanded") === "true");
    d.querySelector("#rPeople").click(); await wait(5);
    ok("V2 …choosing rows by person says so, and keeps it open for the next choice", d.querySelector("#layoutSum").textContent === "By person" && !vp.hidden);
    ok("V3 with nothing from Jira there is no source to choose, so none is shown", d.querySelector("#layerSeg").hidden && d.querySelector("#layerH").hidden && d.querySelector("#layoutSum").textContent === "By person");
    ev("JIRA = {generatedAt:'2026-10-07T08:00:00Z', issues:{}, sprints:[], rollups:{}, missing:[]}; dropJiraMemos(); render()"); await wait(5); d.querySelector("#lyJira").click(); await wait(5);
    ok("V3 …and with Jira, a source other than all sources shows next to the rows", !d.querySelector("#layerSeg").hidden && d.querySelector("#layoutSum").textContent === "By person · Jira only" && /By person, Jira only/.test(vb.getAttribute("aria-label")), d.querySelector("#layoutSum").textContent);
    key(w, d.activeElement, "Escape"); ok("V4 Escape closes it, back on View", vp.hidden && d.activeElement === vb);
    ev("setLayer('all'); setRows('lanes'); render()"); key(w, d.body, "r"); await wait(5);
    ok("V5 R still switches rows, and View follows", d.querySelector("#layoutSum").textContent === "By person"); ev("setRows('lanes'); render()");
    ev("goWs('roadmap')"); await wait(5);
    ok("V6 on a page with neither choice, View isn't there", d.querySelector("#layoutWrap").hidden === (d.querySelector("#rowsSeg").hidden && d.querySelector("#layerSeg").hidden) && d.querySelector("#rowsSeg").hidden);
    ev("goWs('timeline'); setPresent(true)"); await wait(5); ok("V7 presenting hides the menu button", mb.hidden); ev("setPresent(false)");
    ok("Z no page errors", !w.errs.length && !w2.errs.length, w.errs.concat(w2.errs).join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
