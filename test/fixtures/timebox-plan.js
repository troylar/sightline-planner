// Synthetic timeboxes for the sample plan (docs/assistant-workflow.md, "Timeboxes"): a Jira board with two sprints and a
// two-week gap between them, a lead row before the first, and plan timeboxes after the last. Every name here is invented.
const STATUS = {kind:"sightline-jira-status", generatedAt:"2026-10-01T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], issues:{}, rollups:{},
  board:{id:7, name:"Team board"},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09", goal:"Jira's own goal"},
    {id:43, name:"Sprint 43", state:"future", start:"2026-10-26", end:"2026-11-06", goal:""}]};
// The plan's timeboxes as following that board makes them: lead, Sprint 42, the gap, Sprint 43, then three of the plan's.
const sprints = () => [{id:"tb-lead", name:"Before Sprint 42", weeks:1, goal:""}, {id:"tb-42", name:"Sprint 42", weeks:2, goal:"Jira's own goal", jira:42},
  {id:"tb-gap", name:"No sprint", weeks:2, goal:""}, {id:"tb-43", name:"Sprint 43", weeks:2, goal:"", jira:43},
  {id:"tb-44", name:"Sprint 44", weeks:2, goal:""}, {id:"tb-45", name:"Sprint 45", weeks:2, goal:""}, {id:"tb-46", name:"Sprint 46", weeks:2, goal:""}];
// The sample plan with those timeboxes (13 weeks from its Monday start).
module.exports = sample => { const o = JSON.parse(sample); o.sprints = sprints(); o.meta.weeks = 13; return JSON.stringify(o); };
module.exports.status = (extra = {}) => JSON.stringify({...STATUS, ...extra});
module.exports.sprints = sprints;
