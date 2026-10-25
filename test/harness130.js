// The planning assistant panel (docs/assistant-workflow.md): one connection line with a dot that says its state, the
// conversation as bubbles with a welcome when it's empty, a composer, the controls that govern applying in one place, and
// Setup and files last, as quiet rows. Every action is a button. Fixture: fixtures/batch-plan.js on the sample plan.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), batch = require("./fixtures/batch-plan.js"), {act} = batch;
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 85000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function fileHandle(name, text = ""){ const hd = {name, text, writes:0, failWrite:false, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
  async createWritable(){ if (hd.failWrite) throw new Error("The disk is full"); let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; hd.writes++; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), onGet:null, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (dir.onGet) await dir.onGet(name, o); if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
async function page(){
  const hd = fileHandle("plan.json"), dir = folder();
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{}; w.showDirectoryPicker = async()=>dir;
    w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
    w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})}); w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
    w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  await wait(180); const w = dom.window, ev = s=>w.eval(s), d = w.document; w.FIX = sample; w.HD = hd;
  ev(`stopAuto(); S = normalize(JSON.parse(FIX), false); HD.text = serialize(S, HD.name); installPlan(S, HD.text, HD); amTried = S.meta.planId;
    whoAmI = (x, cb)=>cb(); askWhoOnStart = ()=>{}; askName = ()=>'Tester'; download = ()=>{}; render(); setMe(S.people[0].id);
    window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };`);
  await ev("assistantConnect()"); await wait(30);
  const send = (o = {}) => dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", batch(ev("S.meta.planId"), ev("S.meta.revision || 0"), ev("barById('m4').label"), o)));
  const tick = async()=>{ await ev("assistantTick()"); await wait(40); };
  const exportNow = async()=>{ ev("clearTimeout(assistantExportTimer)"); await ev("assistantExport()"); };
  const rows = () => JSON.parse(ev("JSON.stringify(amRows().map(r=>({id:r.c.id, group:r.group, status:r.r.status, after:r.after, needs:r.needs, why:r.r.reasons.join(' ')})))"));
  const show = async()=>{ ev("sel = {type:'amend', id:'x'}; render()"); await wait(5); };
  const results = () => JSON.parse(dir.files.get("sightline-assistant-results.json").text), context = () => JSON.parse(dir.files.get("sightline-assistant-view.json").text);
  return {w, ev, d, hd, dir, send, tick, rows, show, exportNow, results, context};
}

(async()=>{
  try {
    // Not connected: the dot is hollow, the line is short, the empty state offers the starters, and Setup and files comes last.
    let {w, ev, d, dir, send, tick, show} = await page();
    ev("AM = null; chatState().messages = []; sel = {type:'amend', id:'x'}; render()"); await wait(5);
    const side = () => d.querySelector("#side");
    ok("C1 not connected: a hollow dot and a short line", d.querySelector("#chatDot")?.dataset.state === "off" && d.querySelector("#chatConnection").textContent === "Not connected", d.querySelector("#chatConnection")?.textContent);
    ok("C2 an empty conversation shows a welcome with both starters", !d.querySelector("#chatEmpty").hidden && !!d.querySelector("#chatEmpty #chatOrganize") && !!d.querySelector("#chatEmpty #chatReviewRoadmap"));
    const setupEl = d.querySelector(".assetup"), last = [...side().querySelectorAll(":scope *")].filter(e=>e.closest(".assetup") !== setupEl && !e.closest(".sidehead")).pop();
    ok("C3 Setup and files is last, after the composer, and holds the setup rows", !!setupEl && !!(d.querySelector(".composer").compareDocumentPosition(setupEl) & w.Node.DOCUMENT_POSITION_FOLLOWING)
      && ["chatSetup", "chatPrivacy", "assistantGuidance", "assistantIndividualFiles"].every(id=>setupEl.querySelector("#" + id)) && !(last && setupEl.compareDocumentPosition(last) & w.Node.DOCUMENT_POSITION_FOLLOWING));
    ev("chatState().draft = 'A question'; chatRenderUpdates()");
    ok("C17 a draft before connecting says how to send it, and is kept", /Connect your assistant to send\. Your draft stays here\./.test(d.querySelector("#chatStatus").textContent) && d.querySelector("#chatDraft").getAttribute("aria-describedby") === "chatStatus");
    ev("chatState().draft = ''; render()");
    ok("C4 the message box has no all-caps label; it keeps its accessible name", !d.querySelector("#assistantChat .flabel") && d.querySelector("#chatDraft").getAttribute("aria-label") === "Message your planning assistant");
    // Connected: no second sentence repeating the connection, the dot is on, and every action in the panel is a button.
    ({w, ev, d, dir, send, tick, show} = await page());
    await show();
    ok("C5 connected: the dot is on and the status line stays empty", d.querySelector("#chatDot").dataset.state === "on" && d.querySelector("#chatStatus").textContent === "" && /Folder connected/.test(d.querySelector("#chatConnection").textContent));
    ev("chatState().active = {id:'x'}; chatRenderUpdates()");
    ok("C6 waiting for a reply: the dot says so", d.querySelector("#chatDot").dataset.state === "busy"); ev("chatState().active = null; chatRenderUpdates()");
    send({changes:[{id:"mv", summary:"Move the go/no-go", ops:[act("milestone.move", {id:"ms1", day:"2026-10-12"})]}], batchId:"panel-1"}); await tick(); await show();
    const links = [...side().querySelectorAll("button.linkish")].map(b=>b.id || b.textContent);
    ok("C7 every action in the assistant panel is a button, not underlined text", links.length === 0 && !!d.querySelector("[data-amskip].btn") && !!d.querySelector("#amRefresh.btn") && !!d.querySelector("#amDisconnect.btn"), links.join(","));
    ok("C8 the controls sit together, and their heading follows the level", !!d.querySelector("#amControls #amPause") && !!d.querySelector("#amControls #amAuto") && /You review every change/.test(d.querySelector("#amControls").textContent));
    // Conversation: bubbles, text as text, and only a message that arrives slides in.
    ev(`chatState().messages = [{role:"user", content:"Which initiatives have no owner?", scope:"Whole plan"}, {role:"assistant", content:"<img src=x onerror=alert(1)> Two of them."}]; render()`); await wait(5);
    const msgs = [...d.querySelectorAll("#chatTranscript .chatmsg")];
    ok("C9 messages are bubbles, yours and the assistant's, and the welcome steps aside", msgs.length === 2 && msgs[0].classList.contains("me") && msgs[1].classList.contains("ai") && d.querySelector("#chatEmpty").hidden);
    ok("C10 the assistant's text is shown as text", !d.querySelector("#chatTranscript img") && msgs[1].textContent.includes("<img"));
    ok("C11 a redraw doesn't replay the slide-in", !d.querySelector("#chatTranscript .arrive"));
    ev(`chatState().messages.push({role:"assistant", content:"One more thing."}); chatRenderUpdates()`);
    ok("C12 a message that arrives slides in", d.querySelectorAll("#chatTranscript .arrive").length === 1 && d.querySelector("#chatTranscript .chatmsg:last-child").classList.contains("arrive"));
    // Older tools: Files opens by itself, names the version once, the files as chips, and two real buttons.
    ev(`AM.toolsConfirm = [{name:"sightline-app.py", version:"1.100.0"}, {name:"sightline-app.py.sha256"}, {name:"sightline-jira-sync.py", version:"1.100.0"}, {name:"sightline-jira-sync.py.sha256"}]; render()`); await wait(5);
    const box = d.querySelector("#amToolsConfirm"), chips = [...box.querySelectorAll(".asfiles li")].map(li=>li.textContent);
    ok("C13 older tools: Files opens, the version is said once, the tools are chips", d.querySelector("#assistantFiles").open && /^Replace tools from Sightline 1\.100\.0 with version /.test(box.querySelector("p").textContent) && chips.join() === "sightline-app.py,sightline-jira-sync.py", chips.join());
    ok("C14 Replace and Keep are buttons, Replace is the primary one", box.querySelector("#amToolsReplace.btn.primary") && box.querySelector("#amToolsKeep.btn") && !box.querySelector("#amToolsKeep.primary"));
    d.querySelector("#chatPrivacy").open = true; d.querySelector("#chatPrivacy").dispatchEvent(new w.Event("toggle")); ev("render()"); await wait(5);
    ok("C18 a setup row you opened stays open after a redraw", d.querySelector("#chatPrivacy").open);
    d.querySelector("#amToolsKeep").click(); await wait(20);
    ok("C19 Keep current tools keeps Files open and moves focus to what happened", d.querySelector("#assistantFiles").open && d.activeElement === d.querySelector("#amToolsMsg"), d.activeElement?.id);
    ev("present = true; render()"); await wait(5);
    ok("C15 presenting shows no setup", !d.querySelector(".assetup")); ev("present = false; render()");
    ok("C16 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness completed", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
