// What matters now at the top of Today (1.185.0): the live guidance, read-only, above Sightline noticed. Upcoming,
// review-due and new entries are tagged, at most five are listed, and each opens its entry in Forecast. A guidance
// notice about an entry listed here becomes its tag instead of a second line. With nothing set, editors get a way to
// add it and viewers see nothing. The sample plan (every name invented).
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
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      w.HTMLDialogElement.prototype.close = function(){ this.open = false; this.dispatchEvent(new w.Event("close")); }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    const day = n => X(`dayToIso(todayDay() + (${n}))`);
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; localStorage.clear(); S = normalize(JSON.parse(FIX), false); resetHistory(); file.handle = null; goWs("today");`); await wait(20);
    const sec = () => d.querySelector('#today [data-tsec="What matters now"]'), row = id => d.querySelector(`#today [data-matters="${id}"]`);
    const order = () => [...d.querySelectorAll("#today > .tsec, #today > p.tmatters-empty")].map(x=>x.dataset.tsec || x.id);

    ok("M1 with nothing set, an editor sees one line offering Add what matters now, and no section", !sec() && d.getElementById("tMattersAdd")?.textContent === "Add what matters now");
    X(`locked = true; render();`); await wait(10);
    ok("M2 …and a viewer sees nothing at all", !sec() && !d.getElementById("tMattersEmpty"));
    X(`locked = false; render();`); await wait(10);
    d.getElementById("tMattersAdd").click(); await wait(20);
    ok("M3 Add what matters now opens the add form in Forecast, with focus in it", X("UI.ws") === "people" && !!d.getElementById("gdForm") && d.activeElement === d.getElementById("gdText"), X("UI.ws"));
    X(`UI.gdForm = null;`);

    const lane = X("S.lanes[0].id");
    w.G = [
      {id:"gd-a", text:"Reduce cloud cost this quarter", why:"The budget was cut", from:day(-40), through:day(60)},
      {id:"gd-b", text:"Keep support load under a day a week", lanes:[lane], from:day(-3)},
      {id:"gd-c", text:"Ship the partner API first", from:day(10), through:day(90)},
      {id:"gd-d", text:"Say no to new dashboards", from:day(-60), reviewOn:day(-1)},
      {id:"gd-old", text:"Freeze the old importer", from:day(-90), through:day(-5)}];
    X(`S.guidance = G.map(g=>({...g})); S = normalize(S, false); goWs("today"); render();`); await wait(20);
    ok("M4 live entries are listed in their own section, above Sightline noticed", !!sec() && order().indexOf("What matters now") >= 0 && order().indexOf("What matters now") < Math.max(order().indexOf("Sightline noticed"), 99) && order()[0] === "What matters now", JSON.stringify(order()));
    ok("M5 …active first, then upcoming; an ended entry isn't listed", JSON.stringify([...sec().querySelectorAll("[data-matters]")].map(x=>x.dataset.matters)) === '["gd-a","gd-b","gd-d","gd-c"]',
      JSON.stringify([...sec().querySelectorAll("[data-matters]")].map(x=>x.dataset.matters)));
    ok("M6 each shows its words, why, scope and dates", /Reduce cloud cost this quarter/.test(row("gd-a").textContent) && /Why: The budget was cut/.test(row("gd-a").textContent) && /Whole plan/.test(row("gd-a").textContent)
      && row("gd-b").textContent.includes(X("S.lanes[0].name")), row("gd-b").textContent);
    const tags = id => [...row(id).querySelectorAll("[data-mtag]")].map(x=>x.dataset.mtag).join(",");
    ok("M7 tags: Upcoming on one not started, Review due on one past its review, New on one that began in the last two weeks", tags("gd-c") === "upcoming" && tags("gd-d") === "review" && tags("gd-b") === "new" && tags("gd-a") === "",
      [tags("gd-a"), tags("gd-b"), tags("gd-c"), tags("gd-d")].join(" | "));
    const notes = () => [...d.querySelectorAll('#today [data-tsec="Sightline noticed"] [data-notice="guidance"]')].map(x=>x.textContent);
    ok("M8 Sightline noticed doesn't repeat a listed entry as a notice; the ended one, not listed, is still noticed", notes().length === 1 && /Freeze the old importer/.test(notes()[0]), JSON.stringify(notes()));
    X(`S.guidance = S.guidance.filter(g=>g.id !== "gd-old"); render();`); await wait(10);
    ok("M9 …and with only listed entries, Sightline noticed says nothing about guidance", notes().length === 0, JSON.stringify(notes()));
    ok("M10 nothing on Today edits guidance: no Edit, Replace, End or Remove buttons", !sec().querySelector("[data-gdbtn]") && [...sec().querySelectorAll("button")].every(b=>b.classList.contains("linkish")));
    row("gd-b").querySelector("button").click(); await wait(20);
    ok("M11 an entry's words open it in Forecast", X("UI.ws") === "people" && !!d.querySelector('#gdSec [data-gd="gd-b"]'), X("UI.ws"));

    X(`for (let i = 0; i < 4; i++) S.guidance.push({id:"gd-x" + i, text:"Extra focus " + i, from:dayToIso(todayDay() - 30 - i)}); S = normalize(S, false); goWs("today"); render();`); await wait(20);
    ok("M12 at most five are listed, then \"and N more\"", sec().querySelectorAll("[data-matters]").length === 5 && /and 3 more/.test(d.getElementById("tMattersMore")?.textContent || ""), d.getElementById("tMattersMore")?.textContent);
    d.querySelector("#tMattersMore button").click(); await wait(20);
    ok("M13 …which opens Forecast at the first one not listed", X("UI.ws") === "people" && !!d.querySelector("#gdSec"));
    X(`goWs("today"); render();`); await wait(10);
    X(`delete S.guidance.find(g=>g.id === "gd-d").reviewOn; S.guidance.find(g=>g.id === "gd-x3").reviewOn = dayToIso(todayDay() - 1); render();`); await wait(10);
    ok("M14 a notice about an entry past the first five still shows in Sightline noticed", !row("gd-x3") && notes().length === 1 && /Extra focus 3/.test(notes()[0]), JSON.stringify(notes()));
    X(`present = true; render();`); await wait(10);
    ok("M15 presenting still shows the section, read-only", !!sec() && !sec().querySelector("[data-gdbtn]"));
    X(`present = false; locked = true; render();`); await wait(10);
    ok("M16 a viewer sees the same list", !!sec() && sec().querySelectorAll("[data-matters]").length === 5);
    ok("M17 no script errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("no exception", false, e.stack); }
  console.log(R.join("\n")); const n = R.length, f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
})();
