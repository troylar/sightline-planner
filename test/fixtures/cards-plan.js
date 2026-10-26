// A synthetic plan for the Cards page, built on sample-plan.json after it loads. Two epic initiatives (API v2's "c3" with
// ABC-100, Search's "r1" with ABC-200), one-issue initiatives (one blocked in the plan, one under a parent), and a Jira task
// in Reporting. Stories in every status category, with and without points, one canceled, one with no sprint, and one with a
// hostile summary. An initiative made from an epic alone (Web App's "ep3", ABC-300). The board has three in-progress steps (In Progress, Code Review, QA). Every name and key is invented.
module.exports = `window.cardsPlan = () => {
  const B = id => S.bars.find(b=>b.id === id);
  S.meta.jiraBase = "https://jira.example.com/browse/";
  S.people = [{id:"pa", name:"Avery Stone", jira:{key:"u-avery", user:"avery", name:"Avery Stone"}}, {id:"pb", name:"Blake Ito", jira:{key:"u-blake", user:"blake", name:"Blake Ito"}},
    {id:"pc", name:"Casey Moore", jira:{key:"u-casey", user:"casey", name:"Casey Moore"}}];
  B("c3").epics = ["ABC-100"]; B("r1").epics = ["ABC-200"];
  B("f2").tasks = [{id:"t301", label:"ABC-301", start:"2026-10-05", days:3, owners:[], jira:"ABC-301", status:"inprogress"}];
  S.bars.push({id:"lf1", lane:"chat", label:"Rate-limit headers", start:2, span:2, jira:"ABC-120", status:"inprogress", blocked:{reason:"Waiting on the gateway team"}},
    {id:"lf3", lane:"chat", label:"Retry hints", start:6, span:2, jira:"ABC-122", parent:"c4", status:"notstarted"},
    {id:"ep3", lane:"ui", label:"ABC-300", start:4, span:2, jira:"ABC-300", epics:["ABC-300"], status:"notstarted"});
  S = normalize(S, false);
  const s1 = {sprint:"Sprint 1", sprintId:11, sprintStart:"2026-10-05", sprintEnd:"2026-10-16", sprintState:"active"}, s2 = {sprint:"Sprint 2", sprintId:12, sprintStart:"2026-10-19", sprintEnd:"2026-10-30", sprintState:"future"};
  const st = (status, category) => ({status, category, type:"Story"});
  const I = {
    "ABC-100":{summary:"Paging rework", status:"In Progress", category:"inprogress", type:"Epic"},
    "ABC-101":{...st("Done", "done"), ...s1, summary:"Cursor paging for lists", points:5, assignee:"Avery Stone", assigneeKey:"u-avery", labels:["api"], priority:"High"},
    "ABC-102":{...st("In Progress", "inprogress"), ...s1, summary:"Page size limits", points:3, assignee:"Blake Ito", assigneeKey:"u-blake", due:"2026-10-02"},
    "ABC-103":{...st("To Do", "todo"), ...s2, summary:"Bulk export over pages", points:21, assignee:"Casey Moore", assigneeKey:"u-casey"},
    "ABC-104":{...st("To Do", "todo"), summary:"Paging telemetry", assignee:"Casey Moore", assigneeKey:"u-casey"},
    "ABC-105":{status:"Won't Do", resolution:"Won't Do", category:"done", type:"Story", ...s1, summary:"Old offset shim", points:8},
    "ABC-106":{...st("To Do", "todo"), ...s1, summary:"<img src=x onerror=alert(1)> literal title", points:1},
    "ABC-200":{summary:"Search quality", status:"To Do", category:"todo", type:"Epic"},
    "ABC-201":{...st("To Do", "todo"), ...s2, summary:"Query rewrite flag", points:2, assignee:"Avery Stone", assigneeKey:"u-avery"},
    "ABC-202":{...st("Code Review", "inprogress"), ...s1, summary:"Citation threshold", points:5, assignee:"Blake Ito", assigneeKey:"u-blake"},
    "ABC-203":{...st("QA", "inprogress"), ...s1, summary:"Eval set refresh", points:3},
    "ABC-120":{...st("In Progress", "inprogress"), ...s1, summary:"Rate-limit headers", points:3, assignee:"Blake Ito", assigneeKey:"u-blake"},
    "ABC-122":{...st("To Do", "todo"), ...s2, summary:"Retry hints"},
    "ABC-300":{summary:"Theme tokens", status:"To Do", category:"todo", type:"Epic"},
    "ABC-302":{...st("To Do", "todo"), ...s2, summary:"Dark theme audit", points:3},
    "ABC-301":{...st("In Progress", "inprogress"), ...s1, summary:"Report delivery job", points:2, assignee:"Casey Moore", assigneeKey:"u-casey"}};
  JIRA = {kind:"sightline-jira-status", version:1, generatedAt:"2026-10-07T08:00:00Z", releases:[], issues:I,
    sprints:[{id:11, name:"Sprint 1", state:"active", start:"2026-10-05", end:"2026-10-16"}, {id:12, name:"Sprint 2", state:"future", start:"2026-10-19", end:"2026-10-30"}],
    board:{columns:[{name:"To Do", statuses:["To Do"]}, {name:"In Progress", statuses:["In Progress"]}, {name:"Code Review", statuses:["Code Review"]}, {name:"QA", statuses:["QA"]}, {name:"Done", statuses:["Done"]}]},
    rollups:{"ABC-100":{children:["ABC-101","ABC-102","ABC-103","ABC-104","ABC-105","ABC-106"], total:6}, "ABC-200":{children:["ABC-201","ABC-202","ABC-203"], total:3}, "ABC-300":{children:["ABC-302"], total:1}}};
  dropJiraMemos(); resetHistory(); sel = null; render();
};`;
