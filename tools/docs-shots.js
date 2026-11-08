// docs-shots.js [shot,shot...]: recapture the documentation screenshots from dist/sightline.html and the invented
// Northstar demo (python3 tools/make-docs-demo.py first). Writes docs/images/<shot>-light.png and -dark.png.
// Playwright comes from node_modules, or from PLAYWRIGHT=/path/to/node_modules/playwright. See docs/screenshots.md.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.error("Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); process.exit(1); }
const root = path.join(__dirname, ".."), read = f => fs.readFileSync(path.join(root, f), "utf8");
const HTML = path.join(root, "dist/sightline.html"), OUT = path.join(root, "docs/images");
const PLAN = read("demo/plan.json"), STATUS = read("demo/jira/status.json"), ISSUES = read("demo/jira/issues.json"), REPLY = read("examples/northstar/assistant-reply.json");
const go = ws => p => p.evaluate(w=>goWs(w), ws);
const SHOTS = {
  roadmap: go("roadmap"),
  timeline: go("timeline"),
  today: async p => { await go("today")(p); await p.waitForTimeout(200); await p.evaluate(()=>{ const d = document.querySelector("details:has(.tgroomh)"); if (d) d.open = true; }); },
  review: async p => { await p.evaluate(r=>{ openPasteChanges(); $("#pasteBox").value = r; $("#pasteReview").click(); }, REPLY); await p.waitForTimeout(400);
    await p.evaluate(()=>{ const s = [...document.querySelectorAll("summary")].find(x=>/^Ready \(/.test(x.textContent)); if (s) s.scrollIntoView({block:"start"}); }); },
  assistant: async p => { await p.evaluate(()=>openPlanningAssistant()); await p.waitForTimeout(400);
    await p.evaluate(()=>{ const d = $("#assistantAnalysis"); if (d){ d.open = true; d.scrollIntoView({block:"center"}); } }); },
  whatif: async p => { await p.evaluate(()=>openWhatIf({kind:"new", name:"Sign in with the company account", lane:"int", likely:"3", low:"2", high:"5"})); await p.waitForTimeout(300);
    await p.evaluate(()=>$("#wiGo").click()); await p.waitForTimeout(300); await p.evaluate(()=>$("#wiSec").scrollIntoView({block:"start"})); },
  "bundled-skills": p => p.evaluate(()=>openPlanningSkills()),
};
const SIZE = {"bundled-skills":{width:1100, height:900}};
(async()=>{ const want = (process.argv[2] || Object.keys(SHOTS).join(",")).split(","), b = await pw.chromium.launch(); let bad = 0;
  for (const name of want) for (const theme of ["light", "dark"]){
    if (!SHOTS[name]){ console.error(`No shot called ${name}. Shots: ${Object.keys(SHOTS).join(", ")}`); process.exit(1); }
    const page = await b.newPage({viewport:SIZE[name] || {width:1440, height:850}, colorScheme:theme}), errs = []; page.on("pageerror", e=>errs.push(String(e)));
    await page.goto("file://" + HTML);
    await page.evaluate(t=>{ localStorage.setItem("timeline-planner-theme", t); localStorage.setItem("timeline-planner-me-person", JSON.stringify({"p-northstar-example":"p-avery"})); }, theme);
    await page.goto("file://" + HTML); await page.waitForTimeout(300);
    await page.evaluate(([P, st, is])=>{ askWhoOnStart = ()=>{}; stopAuto(); S = normalize(JSON.parse(P), false); file.handle = null; sel = null;
      JIRA = parseJiraStatus(st); JIRA_ISSUES = parseJiraIssues(is); render(); useJiraSprints(); render(); }, [PLAN, STATUS, ISSUES]);
    await page.waitForTimeout(300); await SHOTS[name](page); await page.waitForTimeout(500);
    const file = path.join(OUT, `${name}-${theme}.png`); await page.screenshot({path:file});
    if (errs.length){ bad++; console.error(`${name} ${theme}: ${errs.join(" | ")}`); } else console.log(path.relative(root, file));
    await page.close(); }
  await b.close(); process.exit(bad ? 1 : 0); })().catch(e=>{ console.error(e); process.exit(1); });
