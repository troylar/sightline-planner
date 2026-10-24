// Senior review 1: regression checks. Each one fails on the code as it was before the fix.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
function makeHandle(name, text){ const h = {name,_text:text,_gone:false,writes:0,
  async getFile(){ if (h._gone){ const e=new Error("gone"); e.name="NotFoundError"; throw e; } const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
const handle = makeHandle("sample-plan.json", plan), fresh = makeHandle("new-plan.json", "");
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.showOpenFilePicker = async()=>[handle]; w.showSaveFilePicker = async()=>fresh;
  w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
  w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.HTMLAnchorElement.prototype.click=function(){};
  w.Element.prototype.scrollIntoView=function(){}; w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message));
}});
const w=dom.window, d=w.document, ev=s=>w.eval(s), wait=ms=>new Promise(r=>setTimeout(r,ms));
const safe = (f, dflt) => { try { return f(); } catch(e){ return dflt; } };
const status = () => d.querySelector("#status").textContent;
const BIG = 2300000;                                   // characters; the app's read limit is 2 MB (2,097,152 bytes)
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
(async()=>{
  await wait(150); ev("askWhoOnStart = ()=>{}"); w.__h = handle; w.FIX = plan;
  const sec = async (name, fn) => { try { await fn(); } catch(e){ ok(name + " (section crashed)", false, String(e.message).slice(0,140)); } };
  ev("window._dl = []; download = (t, n) => { _dl.push(n); }");        // count backups instead of downloading them

  // ---- F1b: a quick update never grows the file past the limit ----
  let text0, writes0;
  await sec("F1b", async ()=>{
  ev(`(()=>{ const p = parseText(FIX); p.decisions.push({id:"near", text:"x".repeat(2060000), state:"open", owners:[]}); p.meta.lock = null;
    __h._text = serialize(p, __h.name); })()`);
  await ev("adopt(__h, true)"); await wait(20);           // a fresh link, so F1a's result can't leak into this check
  ok("setup: near-limit file is readable and not locked", ev("file.holdLock") === false && ev("editable()") === false, String(handle._text.length));
  text0 = handle._text; writes0 = handle.writes;
  await ev(`quickSave("grow", s=>{ s.decisions.find(x=>x.id==="near").text += "y".repeat(30000); })`);
  ok("F1b: a quick update that would pass 2 MB is refused and the file is untouched", handle._text === text0 && handle.writes === writes0, `writes ${handle.writes - writes0}`);
  ok("F1b: and says why", /Not saved/.test(status()) && /2 MB/.test(status()), status());
  });

  // ---- F1: never write a file the app would refuse to reopen ----
  await sec("F1a", async ()=>{
  handle._text = plan; await ev("adopt(__h, true)"); await ev("startEditing(false)"); await wait(20);
  ok("setup: editing a linked file", ev("file.holdLock") === true && ev("file.handle === __h"));
  const text0 = handle._text, writes0 = handle.writes;
  ev(`S.decisions.push({id:"big", text:"x".repeat(${BIG}), state:"open", owners:[]}); file.dirty = true;`);
  await ev("save()");
  ok("F1a: Save refuses a plan over 2 MB and leaves the file alone", handle._text === text0 && handle.writes === writes0, `writes ${handle.writes - writes0}, size ${handle._text.length}`);
  ok("F1a: and says why", /2 MB/.test(status()) && /Not saved/.test(status()), status());
  ok("F1a: the file still opens", safe(()=>{ ev(`parseText(${JSON.stringify(handle._text)})`); return true; }, false));
  ev(`S.decisions = S.decisions.filter(x=>x.id !== "big")`); await ev("save()");
  ok("F1a: a normal save still works", handle.writes === writes0 + 1 && ev("file.handle === __h"), status());
  });

  // ---- F2: rebase keeps the teammate's value, but never drops mine without a copy ----
  const rb = which => ev(`(()=>{
    const base = parseText(file.baseText); S = clone(base); _dl.length = 0;
    S.bars[0].label = "Mine";
    const theirs = clone(base); ${which === "same" ? `theirs.bars[0].label = "Theirs";` : `theirs.bars[1].label = "Theirs";`}
    const tt = serialize(theirs, __h.name);
    const r = rebaseOnto(parseText(tt), tt);
    return JSON.stringify({r, l0: S.bars[0].label, l1: S.bars[1].label, dl: _dl.length});
  })()`);
  await sec("F2", async ()=>{
  handle._text = plan; ev("file.baseText = FIX");
  const same = JSON.parse(rb("same")), other = JSON.parse(rb("other"));
  ok("F2a: same field edited by both: the teammate's newer value wins", same.r === true && same.l0 === "Theirs", JSON.stringify(same));
  ok("F2a: and my version is backed up first", same.dl === 1, JSON.stringify(same));
  ok("F2b: different fields: both kept, no backup", other.r === true && other.l0 === "Mine" && other.l1 === "Theirs" && other.dl === 0, JSON.stringify(other));
  });

  // ---- F1c: "Start a new shared plan" never writes an oversize file ----
  await sec("F1c", async ()=>{
  ev(`file.handle = null; file.holdLock = false; file.dirty = false; S = parseText(FIX); S.decisions.push({id:"big2", text:"x".repeat(${BIG}), state:"open", owners:[]});`);
  await ev("newSharedPlan()");
  ok("F1c: a new shared plan over 2 MB is not written", fresh.writes === 0, `writes ${fresh.writes}`);
  ok("F1c: and says why", /Not saved/.test(status()) && /2 MB/.test(status()), status());
  });

  // ---- F3: a revert saved on top of my quick update is a decision, not a lost write ----
  ev(`window._qs = []; window._realQS = quickSave; quickSave = (...a) => { _qs.push(a[3]); return Promise.resolve(true); }`);
  const vl = async rev => {
    ev(`(()=>{ const p = parseText(FIX); p.bars[0].status = "notstarted"; p.meta.revision = ${rev}; p.meta.lock = null;
      const t = serialize(p, __h.name); __h._text = t; installPlan(parseText(t), t, __h); _qs.length = 0; })()`);
    ev(`verifyLater(__h, [{op:"set", type:"bars", id:S.bars[0].id, field:"status", value:"done", prev:"notstarted"}], "status", 9, 5)`);
    await wait(80); return ev("_qs.length");
  };
  await sec("F3", async ()=>{
  ok("F3a: someone saved a newer revision that undoes my change: leave it", await vl(10) === 0);
  ok("F3b: a save that never saw my change overwrote it: put it back", await vl(9) === 1);
  });
  ev("quickSave = _realQS");

  // ---- F6: a sprint rule stays inside its own sprint ----
  // Mon Oct 12 2026 is a holiday, so the week Oct 12-18 has four working days (Tue 13 - Fri 16).
  const rd = (anchor, n) => ev(`(()=>{ const hs = new Set([isoToDay("2026-10-12")]), R = {s:isoToDay("2026-10-12"), e:isoToDay("2026-10-18")};
    return dayToIso(ruleDay({anchor:"${anchor}", n:${n}}, R, hs)); })()`);
  ok("F6a: '5th working day' of a 4-day sprint stays in it (its last working day)", rd("start", 5) === "2026-10-16", rd("start", 5));
  ok("F6b: '5th-last working day' of a 4-day sprint stays in it (its first working day)", rd("end", 5) === "2026-10-13", rd("end", 5));
  ok("F6c: a rule that fits is unchanged", rd("start", 2) === "2026-10-14" && rd("end", 1) === "2026-10-16");

  // ---- F7: tasks that wait for each other stay put instead of drifting later on every edit ----
  ev(`file.handle = null; S = normalize({meta:{title:"Loops", start:"2026-10-05", weeks:8}, lanes:[{id:"a", name:"Core"}],
    bars:[{id:"B", lane:"a", start:0, span:4, label:"Loop bar", tasks:[
      {id:"tA", label:"A", start:"2026-10-05", days:2, dependsOn:["tB"]},
      {id:"tB", label:"B", start:"2026-10-05", days:2, dependsOn:["tA"]},
      {id:"tC", label:"C", start:"2026-10-05", days:2, dependsOn:["tD"]},
      {id:"tD", label:"D", start:"2026-10-05", days:2}]}]}, false); resetHistory(); render()`);
  const starts = () => ev(`JSON.stringify(Object.fromEntries(S.bars[0].tasks.map(t=>[t.id, t.start])))`);
  ev("reschedule()"); const s1 = starts(); ev("reschedule()"); ev("reschedule()"); const s3 = starts();
  ok("F7a: tasks on a loop don't move further on each reschedule", s1 === s3, `${s1} -> ${s3}`);
  ok("F7b: loop tasks keep their own dates", JSON.parse(s3).tA === "2026-10-05" && JSON.parse(s3).tB === "2026-10-05", s3);
  ok("F7c: an ordinary task dependency still schedules", JSON.parse(s3).tC === "2026-10-07", s3);
  ok("F7d: the loop is found (both tasks, nothing else)", safe(()=>ev("[...taskLoops()].sort().join()"), "") === "tA,tB");

  // ---- F8: changing a select with the keyboard keeps focus on it ----
  ev(`S = normalize({meta:{title:"Focus", start:"2026-10-05", weeks:6}, lanes:[{id:"a", name:"Core"}], bars:[{id:"Z", lane:"a", start:0, span:1, label:"Plain", status:"notstarted"}]}, false);
    resetHistory(); render(); select("bar", "Z")`);
  const st = d.querySelector("#f-status"); st.focus(); st.value = "inprogress"; st.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(10);
  ok("F8a: the change took", ev(`barById("Z").status`) === "inprogress");
  ok("F8b: focus stays on Status after the panel redraws", d.activeElement && d.activeElement.id === "f-status", d.activeElement && (d.activeElement.id || d.activeElement.tagName));

  // ---- F10: the edit strip announces its state, but never wipes out a message an operation just set ----
  await sec("F10", async ()=>{
  handle._text = plan; await ev("adopt(__h, true)"); await ev("startEditing(false)"); await wait(20);
  ev(`setStatus("Not saved: a specific reason"); file.dirty = true; renderEditStrip()`); await wait(5);
  ok("F10a: an operation's message survives the strip redrawing", status() === "Not saved: a specific reason", status());
  ev(`setStatus("working", true); file.dirty = false; renderEditStrip()`); await wait(5);
  ok("F10b: the strip still announces its new state when it spoke last", /You're editing/.test(status()), status());
  });

  // ---- F12: no menu, popover or dialog shows a stray "null" / "undefined" ----
  // DOM replaceChildren() turns a null child into the text "null"; h() skips it. Open each surface in the state that used to leak.
  await sec("F12", async ()=>{
  const strays = () => { const out = [], tw = d.createTreeWalker(d.body, w.NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) { const t = n.nodeValue.trim(); if (t === "null" || t === "undefined") out.push((n.parentElement && (n.parentElement.id || n.parentElement.className)) || "?"); } return out; };
  const R0 = "{left:40, top:40, right:80, bottom:60, width:40, height:20}";
  ev(`file.handle = null; file.holdLock = false; S = parseText(FIX); resetHistory(); sel = null; setWs("timeline"); render()`);
  ev(`openAddMenu(${R0}, {lane: S.lanes[0].id, day: isoToDay("2026-11-25"), chart: true})`);
  ok("F12a: Add menu from the chart (+ on a lane) has no stray null", strays().length === 0, strays().join());
  ev(`closeAddMenu(false); sel = null; openAddMenu(${R0}, {})`);
  ok("F12b: Add menu from the toolbar has no stray null", strays().length === 0, strays().join());
  ev(`closeAddMenu(false); select("bar", S.bars[0].id); openAddMenu(${R0}, {})`);
  ok("F12c: Add menu with an item selected has no stray null", strays().length === 0, strays().join());
  ev("closeAddMenu(false)");
  handle._text = plan; await ev("adopt(__h, true)"); await wait(20);                     // linked, not editing = read-only
  ev("openNotesMenu()");
  ok("F12d: Notes menu while read-only has no stray null", ev("editable()") === false && strays().length === 0, strays().join());
  ev("closeNotesMenu(false); file.handle = null; S = normalize({meta:{title:\"Empty\", start:\"2026-10-05\", weeks:4}, lanes:[{id:\"a\", name:\"Core\"}]}, false); render(); openFilterPop()");
  ok("F12e: Filters with nobody on the team has no stray null", strays().length === 0, strays().join());
  ev("closeFilterPop(false); openJiraDialog()");
  ok("F12f: Jira dialog with no Jira data has no stray null", strays().length === 0, strays().join());
  });

  // ---- F13: Weeks zoom Process row: bands sized by days, pins on top, one line, a legend instead of stub labels ----
  await sec("F13", async ()=>{
  ev(`file.handle = null; S = normalize({meta:{title:"Proc", start:"2026-10-05", weeks:6, sprintWeeks:2}, lanes:[{id:"a", name:"Core"}],
    sprints:[{id:"s1",name:"S1",weeks:2},{id:"s2",name:"S2",weeks:2},{id:"s3",name:"S3",weeks:2}],
    types:[{id:"fz", name:"Code freeze", icon:"freeze", shape:"window", days:3, rule:{anchor:"end", n:3}},
           {id:"rl", name:"Release", icon:"release", shape:"moment", rule:{anchor:"end", n:1}},
           {id:"hd", name:"Hardening", icon:"flag", shape:"window", days:6, rule:{anchor:"start", n:1}}]}, false);
    resetHistory(); sel = null; UI.filter = normFilter({}); setWs("timeline"); setZoom("weeks"); render()`);
  const row = () => [...d.querySelectorAll("#gantt .lane.blkrow")].find(r=>/Process/.test(r.querySelector(".glabel")?.textContent || ""));
  const r = row(), chips = r ? [...r.querySelectorAll(".blk")] : [], tr = r && r.querySelector(".track");
  const kindOf = el => el.getAttribute("aria-label").split(":")[0];
  const fz = chips.filter(c=>kindOf(c) === "Code freeze"), rl = chips.filter(c=>kindOf(c) === "Release"), hd = chips.filter(c=>kindOf(c) === "Hardening");
  ok("setup: one of each kind per sprint", fz.length === 3 && rl.length === 3 && hd.length === 3, `${fz.length}/${rl.length}/${hd.length}`);
  ok("F13a: the release sits on its freeze's line, not a second one", rl.every((c,i)=>c.style.top === fz[i].style.top), rl.map(c=>c.style.top).join() + " vs " + fz.map(c=>c.style.top).join());
  ok("F13b: bands that don't overlap in time, plus the pins on them, take one row", tr && tr.style.height === "32px", tr && tr.style.height);
  ok("F13c: no label text on Weeks chips, so nothing can truncate to a stub", chips.length && chips.every(c=>!c.querySelector(".bl")));
  ok("F13c: the name is still on every chip for screen readers and the hover card", chips.every(c=>/^(Code freeze|Release|Hardening): /.test(c.getAttribute("aria-label"))));
  const hdr = d.querySelector('#gantt .sechdr [data-fold="sec:process"]')?.closest(".sechdr") || [...d.querySelectorAll("#gantt .sechdr")].find(x=>/Process/i.test(x.textContent));
  ok("F13d: the full-width section header names every kind", !!hdr && ["Code freeze","Release","Hardening"].every(n=>hdr.querySelector(".kinds")?.textContent.includes(n)), hdr && hdr.textContent);
  ok("F13d: the narrow row label stays short (no legend to truncate)", r && !r.querySelector(".glabel .kinds") && r.querySelector(".glabel").textContent.length <= 20, r && r.querySelector(".glabel").textContent);
  const pct = el => parseFloat((el.style.width.match(/calc\(([\d.]+)%/) || [])[1]);
  const spanPct = el => ev(`(()=>{ const i = instById(${JSON.stringify(el.dataset.peekId)}); return (i.e + 1 - i.s) / 7 / S.meta.weeks * 100; })()`);
  ok("F13e: every band is as wide as the calendar days it covers", [...fz, ...hd].every(c=>Math.abs(pct(c) - spanPct(c)) < 0.01), [...fz, ...hd].map(c=>pct(c).toFixed(2) + "/" + spanPct(c).toFixed(2)).join(" "));
  ok("F13f: each kind in the legend carries its own color", !!hdr && [...hdr.querySelectorAll(".kinds i")].every(i=>/^#[0-9a-f]{6}$/i.test(i.style.getPropertyValue("--kc").trim())));
  ev(`setZoom("days"); render()`);
  const dchips = [...d.querySelectorAll("#gantt .blk")];
  ok("F13g: Days zoom keeps the labels", dchips.some(c=>c.querySelector(".bl")?.textContent === "Code freeze"), String(dchips.length));
  ev(`setZoom("weeks"); render()`);
  });

  // ---- F14: the hover + never covers a process block (jsdom has no layout, so the row's geometry is stubbed) ----
  await sec("F14", async ()=>{
  const r = [...d.querySelectorAll("#gantt .lane.blkrow")].find(r=>/Process/.test(r.querySelector(".glabel")?.textContent || ""));
  const tr = r.querySelector(".track"), blk = tr.querySelector(".blk"), ins = ev("ins");
  const box = (el, b) => { el.getBoundingClientRect = () => ({left:b[0], top:b[1], right:b[0]+b[2], bottom:b[1]+b[3], width:b[2], height:b[3], x:b[0], y:b[1]}); };
  const move = (target, x, y) => { target.dispatchEvent(new w.MouseEvent("pointermove", {bubbles:true, clientX:x, clientY:y})); };
  const top = () => parseFloat(ins.style.top), left = () => parseFloat(ins.style.left);
  box(tr, [0, 0, 600, 32]); box(blk, [250, 6, 100, 20]);
  ok("setup: can edit, and the + shows over empty track", (move(tr, 50, 16), ev("editable()") && ins.hidden === false), String(ins.hidden));
  move(blk, 300, 16);
  ok("F14a: pointing at a process block hides the +", ins.hidden === true);
  move(tr, 300, 29);
  ok("F14b: beside a block on a one-line row, the + doesn't cover it", ins.hidden === true, `left ${left()} top ${top()}`);
  box(tr, [0, 0, 600, 60]); move(tr, 300, 12);
  ok("F14c: with room in the row, the + moves to the clear spot instead", ins.hidden === false && top() >= 29 && left() + 20 > 250 && left() < 350, `left ${left()} top ${top()}`);
  move(tr, 50, 16);
  ok("F14d: away from blocks it sits where you point", ins.hidden === false && top() === 6, `top ${top()}`);
  ev("hideIns()");
  });

  // ---- F11: the built page allows only its own scripts, by hash (jsdom can't enforce CSP, so check the policy itself) ----
  { const crypto = require("crypto");
    const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "", src = (csp.match(/script-src ([^;]+)/) || [])[1] || "";
    const want = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-" + crypto.createHash("sha256").update(m[1], "utf8").digest("base64") + "'");
    ok("F11a: script-src has no 'unsafe-inline'", !!src && !/unsafe-inline/.test(src), src.slice(0,80));
    ok("F11b: script-src lists exactly the page's scripts, by hash", want.length === 2 && src.trim().split(/\s+/).sort().join(" ") === want.sort().join(" "));
  }

  ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
