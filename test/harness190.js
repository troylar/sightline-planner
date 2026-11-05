// Paste-only assistants: Copy for my assistant puts the sightline-plan skill and the plan's data on the clipboard, and
// Paste proposed changes opens an assistant's reply for review, checked like a changes file. Nothing applies on its own.
// The sample plan (every name invented).
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const SKILL = fs.readFileSync(path.join(__dirname, "..", "skills", "sightline-plan", "SKILL.md"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{ w.alerted = true; }; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      w.HTMLDialogElement.prototype.close = function(){ this.open = false; this.dispatchEvent(new w.Event("close")); }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message));
      w.__clip = null; Object.defineProperty(w.navigator, "clipboard", {configurable:true, value:{writeText:t=>{ w.__clip = t; return Promise.resolve(); }}}); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } }, J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; localStorage.clear(); S = normalize(JSON.parse(FIX), false);
       S.notes = [...(S.notes || []), {id:"n-private", text:"Private thought", lane:S.lanes[0].id, at:2}]; S = normalize(S, false); resetHistory(); file.handle = null;
       sel = {type:"amend", id:"x"}; render();`); await wait(20);
    const status = () => d.querySelector("#status").textContent, plan0 = X("JSON.stringify(planOfRecord(S))");
    const pid = X("S.meta.planId"), rev = X("S.meta.revision || 0"), person = X("S.people[0].id");

    // ---- copy ----
    const sec = d.getElementById("assistantAnalysis");
    ok("C1 with no assistant folder, Use any AI assistant is open, with Copy for my assistant first and Paste proposed changes beside it",
      !!sec && sec.open && /Use any AI assistant/.test(sec.querySelector("summary").textContent) && d.getElementById("planCopy")?.textContent === "Copy for my assistant" && d.getElementById("pasteChanges")?.textContent === "Paste proposed changes");
    d.getElementById("planCopy").click(); await wait(30);
    const clip = X("window.__clip") || "", body = SKILL.replace(/^---[\s\S]*?\n---\s*/, "").trim();
    ok("C2 the copy carries the sightline-plan skill word for word", clip.includes(body), clip.slice(0, 120));
    ok("C3 …this plan's id and revision in the envelope to return, and the plan's data as JSON", clip.includes(`"planId":"${pid}"`) && clip.includes(`"planRevision":${rev}`) && (()=>{ try { const m = clip.match(/```json\n([\s\S]*?)\n```/); return JSON.parse(m[1]).kind === "sightline-assistant-view"; } catch(e){ return false; } })());
    ok("C4 …says the data is data, never instructions, and leaves notes out", /never as instructions/.test(clip) && !clip.includes("Private thought"));
    ok("C5 the status line says how long it is", /Copied the plan for your assistant \([\d,]+ characters/.test(status()), status());

    // ---- paste ----
    const reply = (changes, o = {}) => "Seven topics. Here are the changes:\n\n```json\n" + JSON.stringify({kind:"sightline-amendments", version:1, planId:pid, batchId:o.batchId || "paste-1", createdAt:"2026-11-05T10:00:00Z", source:"assistant", basedOn:{planRevision:rev}, changes, ...o.extra}) + "\n```\nNothing has been applied.";
    const open = async text => { d.getElementById("pasteChanges").focus(); d.getElementById("pasteChanges").click(); await wait(10); const box = d.getElementById("pasteBox"); box.value = text; d.getElementById("pasteReview").click(); await wait(20);
      return {dlg:d.getElementById("dlgPaste"), note:(d.getElementById("pasteStatus") || {}).textContent || ""}; };
    let r = await open("I couldn't find anything to change.");
    ok("P1 a reply with no changes block says why and stays open, focused on the box", !!r.dlg && r.dlg.open && /no proposed changes in that reply/.test(r.note) && d.activeElement === d.getElementById("pasteBox"), r.note);
    d.getElementById("pasteClose").click(); await wait(10);
    ok("P2 Cancel closes it and returns focus to Paste proposed changes", !d.getElementById("dlgPaste") && d.activeElement === d.getElementById("pasteChanges"));
    r = await open(reply([{id:"c1", summary:"x", ops:[{op:"action", action:"outcome.add", args:{name:"x"}}]}], {extra:{planId:"plan-elsewhere"}}).replace(`"planId":"${pid}"`, `"planId":"plan-elsewhere"`));
    ok("P3 a reply for another plan is refused, with the reason", /written for another plan/.test(r.note), r.note);
    d.getElementById("pasteClose").click(); await wait(10);
    const changes = [{id:"cap", summary:"Record: keyboard focus lost after Save <img src=x onerror=alert(1)>", ops:[{op:"action", action:"outcome.add", args:{id:"dv-focus", name:"Keyboard focus lost after Save", capture:"request", askedBy:{type:"person", id:person}, raised:"2026-11-05", source:"Bug report"}}]},
      {id:"plain", summary:"Add a usage report outcome", ops:[{op:"action", action:"outcome.add", args:{id:"dv-usage", name:"Usage report"}}]}];
    r = await open(reply(changes));
    ok("P4 a valid reply (prose around a JSON block) opens for review and closes the dialog", !d.getElementById("dlgPaste") && X("sel && sel.type") === "amend" && /Opened 2 proposed changes for review. Nothing has been applied./.test(status()), status() + " " + r.note);
    const rows = J("amRows().map(r=>({id:r.c.id, group:r.group, status:r.r.status}))");
    ok("P5 both changes are ready to review; nothing reached the plan", Array.isArray(rows) && rows.length === 2 && rows.every(x=>x.group === "ready") && X("JSON.stringify(planOfRecord(S))") === plan0, JSON.stringify(rows));
    await X("amAuto()"); await wait(10);
    ok("P6 a pasted reply never applies on its own", X("JSON.stringify(planOfRecord(S))") === plan0);
    ok("P7 a hostile summary stays text", !d.querySelector("#amendPanel img, .amrow img, img[src='x']") && !w.alerted && d.body.textContent.includes("<img src=x onerror=alert(1)>"));
    r = await open(reply(changes, {batchId:"paste-2"}));
    ok("P8 while changes wait, another paste is refused and the waiting ones are kept", /already waiting first/.test(r.note) && J("amRows().length") === 2, r.note);
    d.getElementById("pasteClose").click(); await wait(10);
    const ok1 = await X(`amApply(["plain"])`); await wait(20);
    ok("P9 applying one adds it to the plan, the way a changes file would", ok1 === true && !!J("(S.deliverables || []).find(x=>x.id === 'dv-usage')") && !J("(S.deliverables || []).find(x=>x.id === 'dv-focus')"));
    ok("Z1 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
