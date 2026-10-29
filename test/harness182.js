// Find with nothing typed is a launchpad that knows where you are: actions For the item you'd selected, your Starred items,
// what you opened Recently, and the actions On this page. > lists actions only. The selection is taken when Find opens, so
// an action for it can't land on something else. Recent is yours alone: this browser, per plan, never in the plan file;
// Back and Forward don't add to it. The sample plan (every name invented).
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } }, J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; localStorage.clear(); S = normalize(JSON.parse(FIX), false);
       resetHistory(); file.handle = null; UI.filter = normFilter({}); UI.ws = "timeline"; UI.rows = "lanes"; UI.zoom = "weeks"; sel = null; render();`); await wait(20);
    const status = () => d.querySelector("#status").textContent, plan = () => X("JSON.stringify(planOfRecord(S))"), plan0 = plan();
    const heads = () => [...d.querySelectorAll("#findList .fhead")].map(e=>e.id), recent = () => J(`recentAll().map(x=>x.k)`);
    const open = async () => { X(`closeFind(); openFind();`); await wait(20); };
    const type = async v => { const i = d.querySelector("#findIn"); i.value = v; i.dispatchEvent(new w.Event("input", {bubbles:true})); await wait(20); };
    const hits = () => J(`findHits.map(x=>x.kind + ":" + (x.id || (x.s && x.s.k) || ""))`), enter = async () => { d.querySelector("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true})); await wait(40); };
    const pick = async (t, id) => { X(`select("${t}", "${id}"); render();`); await wait(10); };

    await open();
    ok("C1 nothing selected: no For section, and the page's actions are listed under On this page", !heads().includes("findSelH") && heads().includes("findViewH") && hits().every(h=>h.startsWith("cmd:")), JSON.stringify([heads(), hits()]));
    ok("C2 the hint says > lists only actions and , stars, as keys", /start with > for actions only/.test(d.querySelector("#findList .hint").textContent) && d.querySelectorAll("#findList .hint kbd").length === 2);
    ok("C3 the first row is the active one for a screen reader", d.querySelector("#findIn").getAttribute("aria-activedescendant") === "fhit0" && d.querySelector("#fhit0")?.getAttribute("aria-selected") === "true");
    const view = J(`findHits.map(x=>x.id)`);
    ok("C4 On this page has no actions about a selection or about the whole app", view.length > 0 && view.length <= 6 && view.every(id=>!X(`CMD_SEL.includes("${id}") || CMD_APP.includes("${id}")`)), JSON.stringify(view));

    await pick("bar", "c3"); await open();
    const forH = d.querySelector("#findSelH"), forIds0 = J(`findHits.filter(x=>x.kind === "cmd").map(x=>x.id)`), forIds = J(`findHits.filter(x=>x.kind === "cmd").map(x=>x.id)`);
    ok("C5 with an initiative selected, For <its name> leads, with its actions", heads()[0] === "findSelH" && forH.textContent === "For " + X(`starLabel("bar", "c3")`) && forIds.includes("star") && forIds.includes("copy-link"), JSON.stringify([forH && forH.textContent, forIds]));
    const nFor = J(`(()=>{ const l = [...document.querySelectorAll("#findList > *")], a = l.findIndex(e=>e.id === "findSelH"), b = l.findIndex((e, i)=>i > a && e.classList.contains("fhead")); return l.slice(a + 1, b < 0 ? l.length : b).length; })()`);
    ok("C6 For lists at most 8 actions, every one of them about the selection, most used first", nFor > 0 && nFor <= 8 && forIds0.slice(0, nFor).every(id=>X(`CMD_SEL.includes("${id}")`)) && forIds0[0] === "star", JSON.stringify([nFor, forIds0.slice(0, nFor)]));
    // The selection is taken when Find opens: if it changes before an action runs, nothing happens to the new one
    await pick("bar", "c4"); X(`findCmd("star");`); await wait(10);
    ok("C7 an action for the selection refuses if the selection changed while Find was open", !X(`starOf("bar", "c4")`) && !X(`starOf("bar", "c3")`) && /selection changed while Find was open/.test(status()), status());
    await open(); X(`findCmd("star");`); await wait(10);
    ok("C8 …and runs when it's still the same item", !!X(`starOf("bar", "c4")`));

    // Recent: newest first, each item once, not what's starred or selected now
    X(`toggleStar("bar", "c4");`); await pick("bar", "m2"); await pick("bar", "c3"); await pick("bar", "m2"); X(`sel = null; render();`); await wait(10);
    ok("C9 what you open is remembered, newest first, once each", recent().slice(0, 3).join() === "bar:m2,bar:c3,bar:c4", JSON.stringify(recent()));
    ok("C10 Recent is kept for this plan in this browser, and the plan and its history don't change", Object.keys(J(`JSON.parse(localStorage.getItem("sightline-recent"))`)).join() === X("S.meta.planId") && plan() === plan0);
    X(`toggleStar("bar", "c3");`); await pick("bar", "m2"); await open();
    const rec = J(`findHits.filter(x=>x.kind === "recent").map(x=>x.s.k)`);
    ok("C11 an empty Find lists Starred, then Recent without what's starred or selected", heads().join() === "findSelH,findStarsH,findRecentH,findViewH" && rec.join() === "bar:c4", JSON.stringify([heads(), rec]));
    X(`toggleStar("bar", "c3"); sel = null; render();`); await open();
    const rec2 = J(`findHits.filter(x=>x.kind === "recent").map(x=>x.s.k)`);
    ok("C12 …and with nothing starred and nothing selected, everything you opened", rec2.join() === "bar:m2,bar:c3,bar:c4", JSON.stringify(rec2));
    const ri = J(`findHits.findIndex(x=>x.kind === "recent" && x.s.k === "bar:c3")`); X(`findIdx = ${ri};`); await enter();
    ok("C13 Enter on a Recent item goes to it", X(`sel && sel.type + ":" + sel.id`) === "bar:c3" && d.querySelector("#findPop").hidden);
    for (const id of ["a1","a2","c1","c2","m1","m3","m4","ms1"]) if (X(`!!barById("${id}")`)) await pick("bar", id);
    ok("C15 Recent keeps at most 8", recent().length <= 8 && recent().length >= 4, JSON.stringify(recent()));
    const before = recent().join(); X(`navApplying = true; select("bar", "c4"); render(); navApplying = false;`); await wait(10);
    ok("C16 Back and Forward don't add to Recent", recent().join() === before);
    X(`sel = null; render();`); await open();
    ok("C17 Clear recently opened items forgets them", J(`COMMANDS.filter(cmdOn).map(c=>c.id)`).includes("clear-recent") && (X(`findCmd("clear-recent")`), !recent().length) && /Cleared the recently opened items/.test(status()), status());

    // > is actions only
    await open(); await type(">");
    ok("C18 > on its own lists every action that applies, and nothing else", heads().join() === "findActsH" && hits().length > 6 && hits().every(h=>h.startsWith("cmd:")), JSON.stringify(heads()));
    await type("> zoom");
    ok("C19 > with words narrows the actions", hits().length > 0 && hits().every(h=>h.startsWith("cmd:")) && J(`findHits.every(x=>/zoom/i.test(x.text + " " + (COMMANDS.find(c=>c.id === x.id).also || "")))`), JSON.stringify(hits()));
    await type("Integrations");
    ok("C20 without >, typing still finds items as well as actions", hits().some(h=>!h.startsWith("cmd:")), JSON.stringify(hits().slice(0, 4)));

    // Copy a link to the selection
    X(`closeFind(); window.__link = 0; window.prompt = () => { window.__link++; return ""; };`); await pick("bar", "c3"); await open();
    X(`findCmd("copy-link");`); await wait(30);
    ok("C21 Copy a link to the selection is an action for it", X("window.__link") === 1);

    // Unstar from the menu keeps focus in Starred, on the star now in the same place
    X(`starsWrite([]); ["c3","c4","m2"].forEach(id=>toggleStar("bar", id)); render();`); await wait(10);
    d.querySelector('#snstars [data-unstar="bar:c4"]').click(); await wait(20);
    ok("C22 unstarring from the menu moves focus to the star now in its place", d.activeElement?.dataset?.star === "bar:m2", d.activeElement && d.activeElement.outerHTML.slice(0, 80));
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
