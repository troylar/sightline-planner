// A milestone's runway: "What leads here" on its card lists the work it waits for, all the way back, and nothing that
// waits on it or only shares a prerequisite. It names what finishes last, marks what runs past the milestone's date and
// Jira's sprint dates, and changes nothing. The sample plan's chains (m1 -> m2 -> m3, c1 -> c3 -> c4 <- m3, c4 -> c5 -> c6,
// and the sideways c2 and m4); every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s), X = s => { try { return ev(s); } catch(e){ return undefined; } };
  const box = () => d.querySelector("#f-mrunway"), txt = () => (box() && box().textContent) || "";
  const listed = () => [...(box() ? box().querySelectorAll("[data-rw]") : [])].map(b=>b.getAttribute("data-rw"));
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; UI.filter = normFilter({}); UI.ws = "timeline"; render();`);
    ev(`window._dep9 = S.milestones.find(m=>m.id === "ms9").dep; S.milestones.find(m=>m.id === "ms9").dep = ""; select("ms", "ms9");`); await wait(10);
    ok("R1 a milestone with nothing linked says so, and how to link it", /Nothing is linked to it yet/.test(txt()) && /Done when these finish/.test(txt()), txt().slice(0, 120));
    ok("R1b …and offers no Show linked work, which would show the milestone alone", !d.querySelector("#f-linked") && !d.querySelector("#f-linkedOnly"));
    ev(`S.milestones.find(m=>m.id === "ms9").dep = "Env owner, spend"; render(true);`); await wait(10);
    ok("R1c with only a Depends on note, it says the note isn't counted, instead of that nothing leads here", /No initiatives are linked yet\. Depends on is a note/.test(txt()) && !/Nothing is linked/.test(txt()), txt().slice(0, 140));
    ev(`S.milestones.find(m=>m.id === "ms9").dep = window._dep9; render(true);`);

    ev(`commit(()=>{ S.milestones.find(m=>m.id === "ms8").after = ["c4"]; }); select("ms", "ms8");`); await wait(10);
    const plan0 = X("JSON.stringify(planOfRecord(S))"), keys = X(`JSON.stringify([...runwayOf(S.milestones.find(m=>m.id === "ms8")).rows.map(r=>r.t + ":" + r.id)])`);
    const got = JSON.parse(keys || "[]");
    ok("R2 it lists the work the milestone waits for, all the way back", ["c4","c3","c1","m3","m2","m1"].every(x=>got.includes("bar:" + x)) && got.length === 6, got.join(","));
    ok("R3 …and nothing that waits on it (c5, c6) or only shares a prerequisite (c2, m4)", !["c5","c6","c2","m4"].some(x=>got.includes("bar:" + x)));
    const over = X(`runwayOf(S.milestones.find(m=>m.id === "ms8")).rows.filter(r=>!r.done && r.e < todayDay()).length`);
    ok("R4 the card shows the runway with a count of what leads here, and how much is overdue", over > 0 && new RegExp(`6 items lead here: 0 done, ${over} overdue\\.`).test(txt()), over + " overdue; " + txt().slice(0, 140));
    ok("R4b a milestone with work linked offers Show linked work", !!d.querySelector("#f-linked"));
    const lastId = X(`(()=>{ const r = runwayOf(S.milestones.find(m=>m.id === "ms8")).rows; return r.filter(x=>!x.done).sort((a, b)=>b.e - a.e)[0].id; })()`);
    const lastEl = d.querySelector("#f-mrwlast"), lastBtn = lastEl && lastEl.querySelector("[data-rw]");
    ok("R5 it names what finishes last, with its date, as the cause", !!lastBtn && lastBtn.getAttribute("data-rw") === "bar:" + lastId && /^Finishes last:.+Ends \w{3} \d+/.test(lastEl.textContent), lastEl && lastEl.textContent);
    ok("R6 a milestone whose date follows its initiatives says so", /Its date follows these initiatives/.test((d.querySelector("#f-mrwfollow") || {}).textContent || ""));
    ok("R7 the rest are listed latest finish first, with date, status and owner", (()=>{ const lis = [...box().querySelectorAll("li")]; return lis.length === 5 && lis.every(li=>/Ends \w{3} \d+, [A-Z][a-z]+/.test(li.textContent)); })(), box().querySelectorAll("li").length + " rows");
    ok("R8 nothing in it edits: only buttons that open an item, and Show on the Timeline", !box().querySelector("input,select,textarea") && [...box().querySelectorAll("button")].every(b=>b.classList.contains("rwopen") || b.id === "f-mrwshow"));

    ev(`S.milestones.find(m=>m.id === "ms8").at -= 1; render(true);`); await wait(10);   // the date no longer covers c4 (a stale date or a clash)
    ok("R9 work finishing after the milestone's date is marked, and counted", d.querySelector("#f-mrwlast").classList.contains("bad") && /1 finishing after the milestone/.test(txt()) && /days? after the milestone/.test(d.querySelector("#f-mrwlast").textContent), d.querySelector("#f-mrwlast").textContent);
    ev(`S.milestones.find(m=>m.id === "ms8").at += 1; render(true);`); await wait(10);

    ev(`window._lock = jiraLockOf; jiraLockOf = x => x && x.id === "c1" ? {dates:true} : null; render(true);`); await wait(10);
    const c1 = [...box().querySelectorAll("li")].find(li=>li.querySelector('[data-rw="bar:c1"]'));
    ok("R10 an item dated by Jira's sprint is marked as Jira's", !!c1 && /Jira's sprint/.test(c1.textContent), c1 && c1.textContent);
    ev(`jiraLockOf = window._lock; render(true);`);

    d.querySelector('#f-mrunway [data-rw="bar:c3"]').click(); await wait(10);
    ok("R11 clicking an item opens it", X("sel && sel.type + ':' + sel.id") === "bar:c3", X("sel && sel.type + ':' + sel.id"));
    ok("R12 Show linked work still walks both ways (m2: m1 back, m3 on)", (()=>{ const L = X(`JSON.stringify([...linkedItems([{t:"bar",id:"m2"}]).bars])`); return /"m1"/.test(L) && /"m3"/.test(L); })());
    ok("R13 …and the runway's walk goes one way only (m2: m1, not m3)", (()=>{ const L = X(`JSON.stringify([...linkedItems([{t:"bar",id:"m2"}], S, "up").keys])`); return /bar:m1/.test(L) && !/bar:m3/.test(L); })());
    ok("R14 nothing in the plan changed", X("JSON.stringify(planOfRecord(S))") === plan0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
