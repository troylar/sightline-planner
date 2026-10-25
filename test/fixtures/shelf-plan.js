// A synthetic plan for sprint shelves, built on sample-plan.json after it loads. API v2 (lane "chat") gets an epic
// initiative with stories in two sprints (every status category, with and without points, zero points, one very large,
// one canceled, one with no sprint, one with a hostile summary), and one-story initiatives: one blocked in the plan, one
// under a parent initiative, and one with no sprint (which stays a bar). Sprints: S0 from Sep 21, two weeks each.
// Every name and key here is invented.
module.exports = `window.shelfPlan = () => {
  const B = id => S.bars.find(b=>b.id === id);
  S.people = [{id:"pa", name:"Avery Stone", jira:{key:"u-avery", user:"avery", name:"Avery Stone"}}, {id:"pb", name:"Blake Ito", jira:{key:"u-blake", user:"blake", name:"Blake Ito"}},
    {id:"pc", name:"Casey Moore", jira:{key:"u-casey", user:"casey", name:"Casey Moore"}}];
  B("c3").epics = ["ABC-100"];
  S.bars.push({id:"lf1", lane:"chat", label:"Rate-limit headers", start:2, span:2, jira:"ABC-120", status:"inprogress", blocked:{reason:"Waiting on the gateway team"}},
    {id:"lf2", lane:"chat", label:"SDK version bump", start:2, span:2, jira:"ABC-121", status:"done"},
    {id:"lf3", lane:"chat", label:"Retry hints", start:6, span:2, jira:"ABC-122", parent:"c4", status:"notstarted"},
    {id:"lf4", lane:"chat", label:"Webhooks spike", start:8, span:1, jira:"ABC-123", status:"notstarted"});
  S = normalize(S, false);
  const s1 = {sprint:"Sprint 1", sprintStart:"2026-10-05", sprintEnd:"2026-10-16", sprintState:"active"}, s3 = {sprint:"Sprint 3", sprintStart:"2026-11-02", sprintEnd:"2026-11-13", sprintState:"future"};
  const st = (status, category) => ({status, category, type:"Story"});
  const I = {
    "ABC-100":{summary:"Paging rework", status:"In Progress", category:"inprogress", type:"Epic"},
    "ABC-101":{...st("Done", "done"), ...s1, summary:"Cursor paging for lists", points:5, assignee:"Avery Stone", assigneeKey:"u-avery"},
    "ABC-102":{...st("In Review", "inprogress"), ...s1, summary:"Page size limits", points:3, assignee:"Blake Ito", assigneeKey:"u-blake"},
    "ABC-103":{...st("To Do", "todo"), ...s1, summary:"Bulk export over pages", points:21, assignee:"Casey Moore", assigneeKey:"u-casey"},
    "ABC-104":{...st("To Do", "todo"), ...s1, summary:"Paging telemetry", assignee:"Casey Moore", assigneeKey:"u-casey"},
    "ABC-105":{...st("Done", "done"), ...s1, summary:"Stable sort keys", points:0, assignee:"Blake Ito", assigneeKey:"u-blake"},
    "ABC-106":{...st("To Do", "todo"), ...s1, summary:"<img src=x onerror=alert(1)> literal title", points:1},
    "ABC-107":{status:"Won't Do", resolution:"Won't Do", category:"done", type:"Story", ...s1, summary:"Old offset shim", points:8},
    "ABC-108":{...st("In Progress", "inprogress"), ...s3, summary:"Consistency under writes", points:8, assignee:"Avery Stone", assigneeKey:"u-avery"},
    "ABC-109":{...st("To Do", "todo"), summary:"Paging docs, no sprint yet", points:2},
    "ABC-120":{...st("In Progress", "inprogress"), ...s1, summary:"Rate-limit headers", points:3, assignee:"Blake Ito", assigneeKey:"u-blake"},
    "ABC-121":{...st("Done", "done"), ...s1, summary:"SDK version bump", points:2, assignee:"Avery Stone", assigneeKey:"u-avery"},
    "ABC-122":{...st("To Do", "todo"), ...s3, summary:"Retry hints"},
    "ABC-123":{...st("To Do", "todo"), summary:"Webhooks spike"}};
  JIRA = {kind:"sightline-jira-status", version:1, generatedAt:"2026-10-07T08:00:00Z", sprints:[], releases:[], issues:I,
    rollups:{"ABC-100":{children:["ABC-101","ABC-102","ABC-103","ABC-104","ABC-105","ABC-106","ABC-107","ABC-108","ABC-109"]}}};
  dropJiraMemos(); resetHistory(); sel = null; render();
};`;
