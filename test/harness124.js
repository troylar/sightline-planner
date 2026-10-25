// Stories (docs/assistant-workflow.md): an optional markdown story on initiatives and tasks. The field and its limits,
// templates, the hover card's first lines, the panel (read, edit with preview, breakdown), Jira's description winning
// once linked (the draft kept), one safe markdown renderer, Up and Down moving the selection on Timeline and List, the
// assistant (context, budget, a batch of stories applied as one update, review in full, Edit in a text box), and an
// older copy opening the plan read-only. Synthetic plan: fixtures/story-plan.js.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), storyPlan = require("./fixtures/story-plan.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 80000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function fileHandle(name, text = ""){ const hd = {name, text, permission:"granted", async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; }, async createWritable(){ let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
  const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00Z").getTime();
  w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
  w.showDirectoryPicker = async()=>w.DIR; w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
  w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})});
  w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
const key = (k, target = d.body, o = {}) => target.dispatchEvent(new w.KeyboardEvent("keydown", {key:k, bubbles:true, ...o}));
const peek = async (type, id) => { ev(`openPeek(document.querySelector('[data-peek-type="${type}"][data-peek-id="${id}"]'))`); await wait(5); return d.querySelector("#peek"); };
(async()=>{
  try {
    await wait(180); ev("askWhoOnStart = ()=>{}; reschedule = ()=>({moved:0}); whoAmI = (x, cb)=>cb(); download = ()=>{}");
    ev(`loadExternal(${JSON.stringify(sample)}, "sample")`); await wait(40); ev(storyPlan); ev("storyPlan(); setMe(S.people[0].id)");

    // the field
    ok("S1 normalize keeps a story on an initiative and a task", ev("barById('m1').story") === ev("LONG_STORY") && ev("taskById('t-a').t.story").startsWith("As a support agent"));
    ok("S1 …drops one that's only whitespace, and caps one at 4,000 characters", !("story" in J(`normalize({...planOfRecord(S), bars:[{...planOfRecord(S).bars[0], story:"  \\n "}]}, false).bars[0]`)) &&
      ev(`normalize({...planOfRecord(S), bars:[{...planOfRecord(S).bars[0], story:"x".repeat(5000)}]}, false).bars[0].story.length`) === 4000);
    ok("S1 …and a plan with stories names the stories1 feature", J("featuresIn(planOfRecord(S))").includes("stories1") && J("KNOWN_FEATURES").includes("stories1") && !J(`featuresIn({bars:[{id:"b", tasks:[{id:"t"}]}]})`).includes("stories1"));
    ok("S1 …which survives a save and reopen", ev(`normalize(JSON.parse(JSON.stringify(planOfRecord(S))), false).bars.find(b=>b.id === "m1").story`) === ev("LONG_STORY"));
    ev("KNOWN_FEATURES.splice(KNOWN_FEATURES.indexOf('stories1'), 1)");
    ok("S2 an older copy (one that doesn't know stories1) opens the plan read-only", !!J(`tooNew(normalize({...planOfRecord(S), meta:{...planOfRecord(S).meta, features:featuresIn(planOfRecord(S))}}, false))`));
    ev("KNOWN_FEATURES.push('stories1')");

    // actions
    ev("file.handle = null; locked = false; editLock = null"); const undo0 = ev("past.length");
    ok("S3 initiative.set sets a story", ev(`commit(()=>act("initiative.set", {id:"m2", field:"story", value:"## New\\nText"}))`) === true && ev("barById('m2').story") === "## New\nText");
    ok("S3 …in one step of undo", ev("past.length") === undo0 + 1 && (ev("undo()"), ev("barById('m2').story")) === "A short story for m2.");
    ok("S3 a stale prev is refused as changed since", J(`runAction(S, "initiative.set", {id:"m2", field:"story", value:"x", prev:"not this"})`).code === "stale");
    ok("S3 a story over 4,000 characters is refused, saying so", /4,000 characters/.test(J(`runAction(S, "task.set", {id:"t-b", field:"story", value:"y".repeat(4001)})`).reason || "") && /4,000 characters/.test(J(`runAction(S, "task.add", {id:"t-x", bar:"m2", start:"2026-10-05", label:"X", story:"y".repeat(4001)})`).reason || ""));
    ev(`commit(()=>act("task.set", {id:"t-a", field:"story", value:"   "}))`);
    ok("S3 an empty story clears it, so nothing is stored", !("story" in J("taskById('t-a').t")) && (ev("undo()"), !!ev("taskById('t-a').t.story")));
    ev(`commit(()=>act("task.add", {id:"t-new", bar:"m2", start:"2026-10-05", label:"With a story", story:"Born with a story."}))`);
    ok("S3 task.add and initiative.add accept a story", ev("taskById('t-new').t.story") === "Born with a story." && J(`runAction(clone(S), "initiative.add", {id:"bar-st", lane:S.lanes[0].id, day:"2026-10-05", label:"X", story:"Y"})`).ok); ev("undo()");

    // hover card
    ev("goWs('timeline'); setZoom('weeks')"); await wait(5);
    let pk = await peek("bar", "m1");
    ok("S4 hovering an initiative shows its story's first lines", !!pk.querySelector(".pk-story .mdpeek h4") && /What this delivers/.test(pk.querySelector(".pk-story").textContent));
    ok("S4 …cut at four lines, on whole rows, with More in the panel", pk.querySelectorAll(".pk-story .mdpeek li").length <= 2 && /More in the panel/.test(pk.querySelector(".pk-story").textContent) && !pk.querySelector(".pk-story table"));
    pk = await peek("bar", "m4"); ok("S4 an item without a story says No story yet", /No story yet/.test(pk.querySelector(".pk-story")?.textContent || ""));
    pk = await peek("bar", "m3"); ok("S4 an item linked to an empty Jira description shows the draft, labeled", /Draft \(Jira description is empty\)/.test(pk.textContent) && /Draft kept while Jira is empty/.test(pk.textContent));
    ev("setZoom('days')"); await wait(5);
    pk = await peek("task", "t-a"); ok("S4 hovering a task in the Days view shows its story", /As a support agent/.test(pk.querySelector(".pk-story")?.textContent || ""));
    pk = await peek("task", "t-c"); ok("S4 a linked task shows From Jira, not the draft", /From Jira/.test(pk.textContent) && /Context/.test(pk.textContent) && !/My draft/.test(pk.textContent));
    ev("closePeek(); goWs('list')"); await wait(5);
    ev(`openPeek(document.querySelector('#listTable tr[data-lk="list:task:t-a"]'))`); await wait(5);
    ok("S4 …and so does a List row", /As a support agent/.test(d.querySelector("#peek .pk-story")?.textContent || ""));
    ev("closePeek(); goWs('timeline'); setZoom('weeks')");

    // the renderer
    const md = d.createElement("div"); md.append(ev("mdRender(LONG_STORY)"));
    const tags = new Set([...md.querySelectorAll("*")].map(e=>e.tagName.toLowerCase())), allowed = "div h3 h4 h5 p br ul ol li input strong em del code pre blockquote hr table thead tbody tr th td a".split(" ");
    ok("S5 the long story uses every supported element", ["h4","h5","p","br","ul","ol","li","input","strong","em","del","code","pre","blockquote","hr","table","thead","tbody","th","td","a"].every(t=>tags.has(t)), [...tags].join(" "));
    ok("S5 …and nothing else", [...tags].every(t=>allowed.includes(t)), [...tags].filter(t=>!allowed.includes(t)).join(" "));
    const attrsOk = [...md.querySelectorAll("*")].every(e=>[...e.attributes].every(a=>e.tagName === "DIV" ? a.name === "class" : e.tagName === "A" ? ["href","target","rel"].includes(a.name) : e.tagName === "INPUT" ? ["type","disabled"].includes(a.name) : ["TH","TD"].includes(e.tagName) ? a.name === "align" : e.tagName === "P" && a.name === "class" && a.value === "mdmore"));
    ok("S5 …with no attribute but align, href, target and rel (and a disabled checkbox's)", attrsOk);
    ok("S5 task lists are disabled checkboxes, ticked when done", [...md.querySelectorAll("input")].map(i=>i.type + i.disabled + i.checked).join() === "checkboxtruefalse,checkboxtruetrue");
    ok("S5 tables keep alignment and scroll inside the panel", [...md.querySelectorAll("th")].map(t=>t.getAttribute("align")).join() === "left,center,right" && !!md.querySelector(".mdtable > table"));
    ok("S5 raw HTML and code holding HTML are text", !md.querySelector("script, b") && md.querySelector("pre code").textContent === "<script>alert(1)</script>" && /<b>raw<\/b>/.test(md.textContent));
    const links = src => { const x = d.createElement("div"); x.append(ev(`mdRender(${JSON.stringify(src)})`)); return [...x.querySelectorAll("a")].map(a=>a.getAttribute("href")); };
    ok("S5 an https link opens in a new tab, without the opener", (()=>{ const a = md.querySelector("a"); return a.href === "https://docs.example.com/search" && a.target === "_blank" && a.rel === "noopener noreferrer"; })());
    const evil = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "&#106;avascript:alert(1)", "&#x6A;avascript:alert(1)", "java%0ascript:alert(1)", " javascript:alert(1)", "vbscript:x", "//example.com", "https:/x", "mailto:", "mailto:not-an-address", "file:///etc/passwd", "ftp://example.com"];
    ok("S5 every other link is text: javascript, data, mixed case, entities, whitespace and percent tricks, mail without an address", evil.every(u=>links(`[x](${u})`).length === 0), evil.filter(u=>links(`[x](${u})`).length).join(" | "));
    ok("S5 http and mailto links are kept (1.117)", links("[x](http://example.com/a)").join() === "http://example.com/a" && links("[x](mailto:team@example.com)").join() === "mailto:team@example.com");
    ok("S5 …and an entity-encoded https link is decoded, then kept", links("[x](&#104;ttps://example.com/a)").join() === "https://example.com/a");

    // Jira wiki markup
    const wiki = d.createElement("div"); wiki.append(ev("mdRender(wikiToMd(JIRA.issues['ABC-201'].description))"));
    ok("S6 Jira's wiki markup reads as the same markdown: heading, bold, italic, table, code, nested list", !!wiki.querySelector("h4") && wiki.querySelector("strong")?.textContent === "partner" && wiki.querySelector("em")?.textContent === "cache" &&
      wiki.querySelectorAll("th").length === 2 && /const x = "<b>";/.test(wiki.querySelector("pre")?.textContent || "") && !!wiki.querySelector("ul ul"));
    ok("S6 …links with a label convert, and unknown markup stays text", ev(`wikiToMd("[the doc|https://example.com/d] {color:red}hi{color}")`) === "[the doc](https://example.com/d) {color:red}hi{color}");
    ok("S6 a synced description has control characters stripped and is capped", J(`parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-10-07T08:00:00Z", issues:{"ABC-9":{summary:"s", description:"a\\u0007b\\nc" + "z".repeat(5000)}}})).issues["ABC-9"].description`).length === 4000 &&
      J(`parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-10-07T08:00:00Z", issues:{"ABC-9":{summary:"s", description:"a\\u0007b\\nc"}}})).issues["ABC-9"].description`) === "ab\nc");

    // the panel
    ev("select('bar', 'm1')"); await wait(5);
    const side = () => d.querySelector("#side");
    ok("S7 one click shows the whole story in the panel, above everything else", side().querySelector("#f-storybox") === side().querySelector(".sidehead").nextElementSibling.closest("#f-storybox") || side().querySelector("#f-storybox").previousElementSibling.classList.contains("sidehead") || side().querySelector("#f-storybox").previousElementSibling.classList.contains("viewonly"));
    ok("S7 …in full: the table and every list item", side().querySelectorAll("#f-storybox table tr").length === 3 && side().querySelectorAll("#f-storybox .md li").length === 7);
    ok("S7 an initiative lists its breakdown: title, owner, status, and whether each has a story", (()=>{ const L = [...side().querySelectorAll("#f-storykids li")].map(l=>l.textContent); return L.length === 3 && /Index the catalog/.test(L[0]) && /has a story/.test(L[0]) && /no story yet/.test(L[1]) && /no owner/.test(L[1]) && /In progress/.test(L[0]); })());
    side().querySelector('#f-storykids [data-kid="task:t-b"]').click(); await wait(5);
    ok("S7 …and clicking one selects it, swapping the panel in place", ev("sel.type + ':' + sel.id") === "task:t-b" && /No story yet/.test(side().querySelector("#f-storybox").textContent));
    side().querySelector("#f-storyedit").click(); await wait(5);
    const ta = () => side().querySelector("#f-story");
    ok("S8 Edit on an empty story starts from the task template", !!ta() && ta().value.startsWith("As a <who>, I want <what>") && /Done when/.test(ta().value));
    ta().value = "## Rank\nBy **recency**."; ta().dispatchEvent(new w.Event("input", {bubbles:true}));
    ok("S8 the preview follows the source as you type", side().querySelector("#f-storyprev h4")?.textContent === "Rank" && side().querySelector("#f-storyprev strong")?.textContent === "recency" && /23 \/ 4000/.test(side().querySelector("#f-storycount").textContent));
    side().querySelector("#f-storyprevbtn").click();
    ok("S8 Preview toggles between the source and the preview on a narrow panel", side().querySelector(".mdedit").classList.contains("showprev") && side().querySelector("#f-storyprevbtn").getAttribute("aria-pressed") === "true");
    ev("select('bar', 'm2')"); ev("select('task', 't-b')"); await wait(5);
    ok("S8 an unsaved story waits while you look at another item", ta()?.value === "## Rank\nBy **recency**.");
    const u1 = ev("past.length"); side().querySelector("#f-storysave").click(); await wait(5);
    ok("S8 Save stores it as one step of undo", ev("taskById('t-b').t.story") === "## Rank\nBy **recency**." && ev("past.length") === u1 + 1 && !ta() && side().querySelector("#f-storybox h4")?.textContent === "Rank");
    side().querySelector("#f-storyedit").click(); side().querySelector("#f-storycancel").click(); await wait(5);
    ok("S8 Cancel leaves it as it was", !ta() && ev("taskById('t-b').t.story") === "## Rank\nBy **recency**.");
    ev("select('task', 't-c')"); await wait(5);
    ok("S9 a linked task shows Jira's description, From Jira, read-only", /From Jira/.test(side().querySelector("#f-storysrc")?.textContent || "") && side().querySelector("#f-storybox h4")?.textContent === "Context");
    ok("S9 …and keeps the draft, collapsed as Draft before Jira", !side().querySelector("#f-storydraft").open && /Draft before Jira/.test(side().querySelector("#f-storydraft summary").textContent) && /My draft before Jira/.test(side().querySelector("#f-storydraft").textContent));
    ev("JIRA = {...JIRA, generatedAt:'2026-10-08T08:00:00Z', issues:{...JIRA.issues, 'ABC-201':{...JIRA.issues['ABC-201'], description:'h3. Changed in Jira'}}}; dropJiraMemos(); render()");
    ok("S9 a new sync shows Jira's new text and the draft stays", side().querySelector("#f-storybox h5")?.textContent === "Changed in Jira" && ev("taskById('t-c').t.story") === "My draft before Jira had it.");
    ev("select('bar', 'm3')"); await wait(5);
    ok("S9 an empty Jira description falls back to the draft, labeled", /Draft \(Jira description is empty\)/.test(side().querySelector("#f-storysrc")?.textContent || "") && /Draft kept/.test(side().querySelector("#f-storybox").textContent));

    // templates
    ev("goWs('plan'); setPlanTab('guide')"); await wait(5);
    ok("S10 Settings has story templates, prefilled with the built-in ones", d.querySelector("#tpl-initiative")?.value.startsWith("## What this delivers") && d.querySelector("#tpl-task")?.value.startsWith("As a <who>"));
    d.querySelector("#tpl-task").value = "### Why\n-"; d.querySelector("#tplSave").click(); await wait(5);
    ok("S10 saving one keeps only what differs from the built-in", J("S.meta.storyTemplates").task === "### Why\n-" && !("initiative" in J("S.meta.storyTemplates")));
    ev("goWs('timeline'); select('task', 't-new' in {} ? 't-b' : 't-b')"); ev(`commit(()=>act("task.set", {id:"t-b", field:"story", value:""}))`); ev("select('task', 't-b')"); await wait(5);
    side().querySelector("#f-storyedit").click(); await wait(5);
    ok("S10 …and a new task story starts from it", ta()?.value === "### Why\n-"); side().querySelector("#f-storycancel").click();
    ev("undo()"); ev("undo()");

    // arrows
    ev("goWs('timeline'); setZoom('weeks'); select('bar', 'm1')"); await wait(5);
    const order = J(`[...document.querySelectorAll('#gantt [data-key^="bar:"]')].map(e=>e.dataset.key.slice(4)).filter((v, i, a)=>a.indexOf(v) === i)`), i1 = order.indexOf("m1");
    d.body.focus(); key("ArrowDown"); await wait(5);
    ok("S11 Down moves the selection to the next item while the panel is open", ev("sel && sel.id") === order[i1 + 1], ev("sel && sel.id") + " vs " + order[i1 + 1]);
    key("ArrowUp"); await wait(5); ok("S11 …and Up back", ev("sel.id") === "m1");
    ev("goWs('list')"); await wait(5);
    const rows = () => [...d.querySelectorAll("#listTable tr[data-lk]")].map(r=>r.dataset.lk), at = rows().indexOf("list:bar:m1");
    d.querySelector('#listTable tr[data-lk="list:bar:m1"]').focus(); key("ArrowDown", d.querySelector('#listTable tr[data-lk="list:bar:m1"]')); await wait(5);
    ok("S11 on List, Down with the panel open selects the next row: the same movement", "list:" + ev("sel.type + ':' + sel.id") === rows()[at + 1] && d.activeElement?.dataset?.lk === rows()[at + 1], ev("sel.type + ':' + sel.id"));
    ev("sel = null; render()"); d.querySelector(`#listTable tr[data-lk="${rows()[at]}"]`).focus(); key("ArrowDown", d.activeElement); await wait(5);
    ok("S11 …without a panel, Down only moves between rows, as before", ev("sel") === null && d.activeElement?.dataset?.lk === rows()[at + 1]);
    ev("goWs('timeline')");

    // the assistant
    const dir = folder(); w.DIR = dir; ev("file.handle = null; amTried = S.meta.planId; window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; }");
    await ev("assistantConnect()"); await wait(30); ev("clearTimeout(assistantExportTimer)"); await ev("assistantExport()");
    const view = J("assistantView()");
    ok("S12 the context carries stories as plan data, marked as written by people", view.initiatives.find(b=>b.id === "m1").story === ev("LONG_STORY") && view.initiatives.find(b=>b.id === "m1").tasks.find(t=>t.id === "t-a").story.startsWith("As a") && /stories/.test(view.safety));
    ok("S12 …with the templates and how to write one", view.storyTemplates.initiative.startsWith("## What this delivers") && view.storyTemplates.task === "As a <who>, I want <what>, so that <why>.\n\n### Why it exists\n<who uses the result, or the risk it retires>\n\n### Done when\n- [ ]\n\n### Out of scope\n-" && /field story/.test(view.guide));
    const fit = J(`(()=>{ const v = assistantView(); const big = "w".repeat(3990); for (let i = 0; i < 600; i++) v.initiatives[0].tasks.push({id:"x" + i, label:"x", start:"2026-09-21", days:1, status:"notstarted", owners:[], dependsOn:[], jiraDeps:[], story:big}); return assistantFitView(v).coverage; })()`);
    ok("S12 over the size budget, stories go first, and coverage says how many", fit.stories && fit.stories.omitted > 0 && fit.stories.total === fit.stories.exported + fit.stories.omitted && fit.complete === false, JSON.stringify(fit.stories));
    ev("amSetLevel('review')");
    const pid = ev("S.meta.planId"), rev = ev("S.meta.revision || 0"), act = (action, args)=>({op:"action", action, args});
    const long = "## Index the catalog\n" + "Every partner record. ".repeat(20) + "\n\n- [ ] p95 under 300 ms";
    dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", JSON.stringify({kind:"sightline-amendments", version:1, planId:pid, batchId:"stories-1", createdAt:new Date().toISOString(), source:"Planning bot", basedOn:{planRevision:rev},
      changes:[{id:"st", summary:"Stories for the search work", ops:[act("task.set", {id:"t-a", field:"story", value:long, prev:ev("taskById('t-a').t.story")}), act("task.set", {id:"t-b", field:"story", value:"As a planner, I want ranking.", prev:ev("taskById('t-b').t.story")}),
        act("task.set", {id:"t-c", field:"story", value:"Jira-linked draft.", prev:"My draft before Jira had it."}), act("initiative.set", {id:"m2", field:"story", value:"## Ship it\nFor partners.", prev:"A short story for m2."})]}]})));
    await ev("assistantTick()"); await wait(40);
    ev("sel = {type:'amend', id:'x'}; render()"); await wait(5);
    const row = d.querySelector('[data-am="st"]');
    ok("S13 review shows each story in full, not the one-line summary", row && row.querySelectorAll(".amstory").length === 4 && row.querySelector(".amstory").textContent.includes("Every partner record. ".repeat(20).trim()) && row.querySelector(".amstory h4")?.textContent === "Index the catalog", row ? row.querySelectorAll(".amstory").length : "no row");
    ok("S13 …with a short line for each", [...row.querySelectorAll(".amlines li")].filter(l=>/story \(shown below\)/.test(l.textContent)).length === 4);
    ev("UI.amEditing = 'st'; render()"); await wait(5);
    const box = d.querySelector('#amEdit-st textarea[id$="-0-story"]');
    ok("S13 Edit opens each story in a text box", !!box && box.value === long && d.querySelectorAll('#amEdit-st textarea[id$="-story"]').length === 4);
    box.value = long + "\n\nEdited in review."; d.querySelector('[data-amsave="st"]').click(); await wait(10);
    const u2 = ev("past.length"); await ev("amApply(['st'])"); await wait(40);
    ok("S14 three tasks and one initiative get their stories as one update", ev("taskById('t-a').t.story").endsWith("Edited in review.") && ev("taskById('t-b').t.story") === "As a planner, I want ranking." && ev("taskById('t-c').t.story") === "Jira-linked draft." && ev("barById('m2').story") === "## Ship it\nFor partners.");
    ok("S14 …with one undo", ev("past.length") === u2 + 1 && (ev("undo()"), ev("barById('m2').story") === "A short story for m2." && ev("taskById('t-b').t.story") === "## Rank\nBy **recency**."));
    ok("S15 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
