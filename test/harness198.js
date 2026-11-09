// The assistant's instructions match the page (1.187.1): every action the page has is exported with what it does, named
// in the in-page guide or knowingly left to its own description, and its family is named in the skill and in
// docs/assistant-workflow.md; the analysis guide names everything the context's planning section holds. A new action,
// family or planning list fails here until the instructions say how to use it. Fixture: fixtures/sample-plan.json.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const SKILL = process.env.SIGHTLINE_SKILL || path.join(__dirname, "..", "skills", "sightline-plan", "SKILL.md");
const DOC = path.join(__dirname, "..", "docs", "assistant-workflow.md");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const R = []; let f = 0; const ok = (n, c, x = "") => { if (!c) f++; R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + String(x).slice(0, 600) + ")" : ""}`); };
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 30000).unref();

// Actions the in-page guide doesn't name: each is a sibling of one it does (a remove beside an add, a delete beside a
// set) or a single-purpose setter, and its own desc in the context says what it does. Adding an action means naming it
// in the guide or adding it here on purpose; an entry the guide now names, or that isn't an action, fails.
const DESC_ONLY = ["initiative.setStatus", "initiative.setParent", "initiative.place", "initiative.delivers.remove", "initiative.waitFor", "initiative.unwait",
  "task.setStatus", "task.moveTo", "task.link", "task.unlink", "task.del",
  "outcome.setTarget", "outcome.setRelease", "outcome.linkJira", "outcome.unlinkJira", "outcome.unrelate", "outcome.unraise", "outcome.del", "ref.del",
  "workstream.add", "workstream.rename", "workstream.addMember", "workstream.removeMember", "guidance.del", "own.del",
  "person.timeOff.add", "person.timeOff.del", "milestone.doneWhen.remove", "milestone.del", "gate.add", "gate.move", "gate.del", "risk.del", "decision.del"];

const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
  w.indexedDB = undefined; w.Element.prototype.scrollIntoView = ()=>{}; w.CSS = {escape:s=>s};
  w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})}); }});
setTimeout(()=>{
  try {
    const w = dom.window, ev = s=>w.eval(s); w.FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
    ev(`S = normalize(JSON.parse(FIX), false); file.handle = null; render();`);
    const ctx = JSON.parse(ev("JSON.stringify(assistantView())")), ag = ev("analysisGuide()");
    const skill = fs.readFileSync(SKILL, "utf8"), doc = fs.readFileSync(DOC, "utf8"), guide = [].concat(ctx.guide || []).join("\n");
    const registry = JSON.parse(ev("JSON.stringify(Object.keys(planActions).filter(k=>!planActions[k].preview))")), ids = ctx.actions.map(a=>a.id);
    const fams = [...new Set(ids.map(i=>i.split(".")[0]))];

    ok("A1 every action the page has is in the context, with a desc saying what it does", registry.every(k=>ids.includes(k)) && ctx.actions.every(a=>typeof a.desc === "string" && a.desc.trim().length >= 10),
      registry.filter(k=>!ids.includes(k)).concat(ctx.actions.filter(a=>!a.desc).map(a=>a.id)).join(", "));
    const unnamed = ids.filter(id=>!guide.includes(id) && !DESC_ONLY.includes(id));
    ok(`A2 every action is named in the in-page guide, or listed here as left to its desc (${ids.length - DESC_ONLY.length} named)`, !unnamed.length, unnamed.join(", "));
    const stale = DESC_ONLY.filter(id=>!ids.includes(id) || guide.includes(id));
    ok("A2b the left-to-its-desc list has nothing the guide names and nothing that isn't an action", !stale.length, stale.join(", "));
    const line = (skill.match(/Action families: ([^.\n]+)\./) || [])[1] || "", listed = line.split(/,\s*/).filter(Boolean);
    ok(`A3 the skill names every action family (${fams.length}) in its Action families line, and nothing else`, fams.every(x=>listed.includes(x)) && listed.every(x=>fams.includes(x)),
      `missing ${fams.filter(x=>!listed.includes(x)).join(", ") || "none"}; extra ${listed.filter(x=>!fams.includes(x)).join(", ") || "none"}`);
    ok("A3b the skill stays under 12 KiB", Buffer.byteLength(skill) < 12288, Buffer.byteLength(skill));
    const docMiss = fams.filter(x=>!doc.includes("`" + x + "."));
    ok("A4 docs/assistant-workflow.md names an action from every family", !docMiss.length, docMiss.join(", "));
    const planLines = ag.split("\n").filter(l=>l.startsWith("- `planning")).join("\n"), keys = Object.keys(ctx.planning).filter(k=>k !== "version");
    const agMiss = keys.filter(k=>!new RegExp("\\b" + k + "\\b").test(planLines));
    ok(`A5 the analysis guide's planning lines name everything planning holds (${keys.length})`, !agMiss.length, agMiss.join(", "));
    ok("A6 the analysis guide says what a deliverable's captures, decisions and risks are", ["capture", "raisedAgain", "handoff", "waitingOnDecisions", "risks"].every(k=>ag.includes("`" + k + "`")));
    ok("A7 the guide and the skill say ops in a change run in order, so a target comes before planning", /target before setting its stage to planned/.test(guide) && /target an outcome before planning it/.test(skill));
  } catch(e){ ok("no exception", false, e.stack); }
  console.log(R.join("\n")); const n = R.length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
}, 300);
