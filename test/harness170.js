// Linked work: pick an item and show only it and what's linked to it, what it waits for all the way back and what
// waits for it all the way on, never sideways. It's a viewer's filter: the plan doesn't change. The sample plan's
// dependency chains (c1 -> c3 -> c4 -> c5 -> c6, c3 -> u4 -> u5, m3 -> c4); every name is invented.
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
  const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const X = s => { try { return ev(s); } catch(e){ return undefined; } };
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null;
        S.milestones.find(m=>m.id === "ms6").after = ["c4"]; S.bars.find(b=>b.id === "c4").waitsFor = ["gate-3"];
        UI.filter = normFilter({}); UI.ws = "timeline"; UI.zoom = "weeks"; render();
        window.VIS = () => S.bars.filter(b=>barVisible(b)).map(b=>b.id).sort();
        window.MSV = () => S.milestones.filter(m=>msVisible(m)).map(m=>m.id).sort();
        window.GV = () => gateItems().filter(g=>gateVisible(g)).map(g=>g.id).sort();`);
    const plan0 = X("JSON.stringify(planOfRecord(S))"), all0 = J("VIS()");

    ev(`select("bar", "c3"); render();`); await wait(10);
    const btn = d.querySelector("#f-linked");
    ok("L1 an initiative's details offer Show linked work", !!btn && /Show linked work/.test(btn.textContent), btn && btn.textContent);
    btn.click(); await wait(20);
    const v = J("VIS()");
    ok("L2 it shows the initiative, what it waits for (c1) and everything that waits on it, all the way on (c4, c5, c6, u4, u5)", ["c1","c3","c4","c5","c6","u4","u5"].every(x=>v.includes(x)), v.join(","));
    ok("L3 …but not work that only shares a prerequisite (c2 also waits for c1) or what something downstream also waits for (m3)", !v.includes("c2") && !v.includes("m3") && !v.includes("m1") && !v.includes("r1"), v.join(","));
    ok("L4 …the milestone that waits on the linked work shows, and a gate only something downstream waits for doesn't (that's sideways)", J("MSV()").join() === "ms6" && J("GV()").join() === "", J("MSV()").join() + " / " + J("GV()").join());
    const chip = d.querySelector('#showStrip [data-show="linked:bar:c3"]');
    ok("L5 one chip above the chart says what it's linked to, and the status line counts the items", !!chip && /Linked to/.test(chip.textContent) && /Showing .* and the \d+ items linked to it/.test(d.querySelector("#showLive")?.textContent || "") && /Showing .* and the \d+ items linked to it/.test(d.querySelector("#status")?.textContent || ""), (chip && chip.textContent) + " | " + (d.querySelector("#showLive")?.textContent || ""));
    ok("L6 picking linked work changes nothing in the plan", X("JSON.stringify(planOfRecord(S))") === plan0);

    ev(`select("ms", "ms6"); render(); showLinked("ms", "ms6");`); await wait(20);
    const vm = J("VIS()");
    ok("L7 from a milestone: everything it waits for, all the way back (c4 <- c3, m3 <- c1, m2, m1) and the gate on the way", ["c1","c3","c4","m1","m2","m3"].every(x=>vm.includes(x)) && !vm.includes("c5") && !vm.includes("u4") && J("GV()").join() === "gate-3", vm.join(",") + " / " + J("GV()").join());

    ev(`{ const b = S.bars.find(x=>x.id === "c3"), st = dayToIso(nearWeekday(wkDay(b.start))); b.tasks = [{id:"ta", label:"Contract first", start:st, days:2, owners:[], status:"notstarted"}, {id:"tb", label:"Wire it up", start:st, days:2, owners:[], status:"notstarted", dependsOn:["ta"]}, {id:"tc", label:"Unrelated docs", start:st, days:1, owners:[], status:"notstarted"}]; }
        render(); select("task", "tb"); render();`); await wait(10);
    d.querySelector("#f-linked")?.click(); await wait(20);
    const tv = J(`["ta","tb","tc"].filter(id=>taskVisible(taskById(id).t))`);
    ok("L8 from a task: its own chain of tasks shows, its siblings with no link don't, and its initiative holds the row", tv.join() === "ta,tb" && J("VIS()").includes("c3") && J("VIS()").includes("c1"), tv.join() + " / " + J("VIS()").join(","));

    d.querySelector('#showStrip .linkchip')?.click(); await wait(20);
    ok("L9 the chip's × shows everything again", J("VIS()").join() === all0.join() && !d.querySelector("#showStrip .linkchip"), J("VIS()").length + " of " + all0.length);
    ev(`showLinked("bar", "c3");`); await wait(30); w.history.back(); await wait(80);
    ok("L10 …and so does Back", !(J("UI.filter.linked") || []).length, JSON.stringify(J("UI.filter.linked")));

    ev(`S.bars.find(b=>b.id === "c1").dependsOn = ["c6"]; dropJiraMemos(); render();`);   // a loop
    const loop = X(`(()=>{ const L = linkedItems([{t:"bar", id:"c3"}]); return [...L.bars].sort().join(); })()`);
    ok("L11 a loop of links ends, with every item once", !!loop && loop.split(",").length === new Set(loop.split(",")).size, loop);
    ev(`S.bars.find(b=>b.id === "c1").dependsOn = [];`);

    ev(`select("bar", "c3"); render(); openFind(); renderFind("linked");`); await wait(10);
    const cmd = [...d.querySelectorAll("#findList .fhit.fcmd .ft")].map(x=>x.textContent);
    ok("L12 Find offers it for the selection, by name", cmd.includes("Show only what's linked to the selection"), cmd.join(" | "));
    ev(`findCmd("linked");`); await wait(20);
    ok("L13 …and runs it", J("UI.filter.linked").length === 1 && J("UI.filter.linked")[0].id === "c3");
    ok("L14 a saved view doesn't keep a linked pick (yet)", (J(`normViewDef({filter:UI.filter}).filter.linked`) || []).length === 0);
    ev(`UI.ws = "list"; render();`); await wait(20);
    const rows = [...d.querySelectorAll("#listTable tr[data-lk^='list:bar:']")].map(r=>r.dataset.lk.slice(9));
    ok("L15 the List shows the same linked work", rows.includes("c3") && rows.includes("c6") && !rows.includes("c2"), rows.join(","));
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
