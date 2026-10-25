// A synthetic plan for stories, derived from sample-plan.json after it loads: stories on a few items (one long, using
// every supported element), a task linked to a fake Jira issue whose description is wiki markup (headings, a table and
// a code block), and an initiative linked to an issue whose description is empty. Every name here is invented.
module.exports = `window.storyPlan = () => {
  const B = id => S.bars.find(b=>b.id === id);
  window.LONG_STORY = [
    "## What this delivers", "Search that finds **every** partner record, _fast_, with ~~no~~ \\x60exact\\x60 matches.", "Second line of the outcome.", "",
    "### Who it's for", "- Support", "  - the night shift", "- Partner managers", "", "### Scope", "1. Index the catalog", "2. Rank by recency", "",
    "### Done when", "- [ ] p95 under 300 ms", "- [x] index builds nightly", "", "> Quote from the kickoff", "", "---", "",
    "\\x60\\x60\\x60", "<script>alert(1)</script>", "\\x60\\x60\\x60", "",
    "| Metric | Now | Target |", "|:--|:-:|--:|", "| p95 | 900 | 300 |", "| recall | 0.7 | 0.9 |", "",
    "See [the design](https://docs.example.com/search) and [bad](javascript:alert(1)) <b>raw</b>."].join("\\n");
  B("m1").story = LONG_STORY;
  B("m1").tasks = [
    {id:"t-a", label:"Index the catalog", start:"2026-09-22", days:3, status:"inprogress", owners:["p1"], dependsOn:[], tags:[], story:"As a support agent, I want the catalog indexed, so that search finds it."},
    {id:"t-b", label:"Rank by recency", start:"2026-09-25", days:2, status:"notstarted", owners:[], dependsOn:[], tags:[]},
    {id:"t-c", label:"Linked to Jira", start:"2026-09-29", days:2, status:"notstarted", owners:[], dependsOn:[], tags:[], jira:"ABC-201", story:"My draft before Jira had it."}];
  B("m2").story = "A short story for m2.";
  B("m3").jira = "ABC-202"; B("m3").story = "Draft kept while Jira is empty.";
  S = normalize(S, false);
  JIRA = {kind:"sightline-jira-status", version:1, generatedAt:"2026-10-07T08:00:00Z", sprints:[], releases:[], rollups:{}, issues:{
    "ABC-201":{summary:"Linked task", status:"To Do", category:"todo", type:"Story", description:"h2. Context\\nThe *partner* API needs a _cache_.\\n||Field||Owner||\\n|ttl|platform|\\n{code:js}\\nconst x = \\"<b>\\";\\n{code}\\n* first\\n** nested"},
    "ABC-202":{summary:"Linked initiative", status:"In Progress", category:"inprogress", type:"Story", description:""}}};
  dropJiraMemos(); resetHistory(); sel = null; render();
};`;
