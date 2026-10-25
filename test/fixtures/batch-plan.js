// A synthetic assistant batch for the sample plan (docs/assistant-workflow.md, "Batches apply in order"). Change 1
// creates a task; 2 adds a second task and links it to 1's; 3 sets a gate's text to what it already is, with a stale
// prev; 4 is blocked by the plan itself (it links to a task nobody adds); 5 is independent of 4; 6 needs both 1 and 2.
// Every name here is invented.
const act = (action, args) => ({op:"action", action, args});
const changes = () => [
  {id:"c1", summary:"Add the adapter task", ops:[act("task.add", {id:"task-ba-1", bar:"m2", start:"2026-10-05", days:2, label:"Write the adapter"})]},
  {id:"c2", summary:"Add the review task after it", ops:[act("task.add", {id:"task-ba-2", bar:"m2", start:"2026-10-07", days:1, label:"Review the adapter"}), act("task.link", {id:"task-ba-2", after:"task-ba-1"})]},
  {id:"c3", summary:"Say what the first gate blocks", ops:[act("gate.set", {id:"gate-1", field:"blocks", value:"All integrations in v2", prev:""})]},
  {id:"c4", summary:"Wait for a task nobody added", ops:[act("task.link", {id:"task-ba-1", after:"task-nowhere"})]},
  {id:"c5", summary:"Rename an initiative", ops:[act("initiative.set", {id:"m4", field:"label", value:"Reports, renamed by the batch", prev:"__CUR_M4__"})]},
  {id:"c6", summary:"Add the release task after both", ops:[act("task.add", {id:"task-ba-3", bar:"m2", start:"2026-10-08", days:1, label:"Release the adapter"}),
    act("task.link", {id:"task-ba-3", after:"task-ba-1"}), act("task.link", {id:"task-ba-3", after:"task-ba-2"})]}];
// The amendments file for a plan: its id, revision and m4's current title (change 5's prev).
module.exports = (planId, revision, m4Label, opts = {}) => JSON.stringify({kind:"sightline-amendments", version:1, planId, batchId:opts.batchId || "batch-ba",
  createdAt:opts.createdAt || new Date().toISOString(), source:"Planning bot", basedOn:{planRevision:opts.basedOn ?? revision},
  changes:(opts.changes || changes()).map(c=>JSON.parse(JSON.stringify(c).replace("__CUR_M4__", m4Label.replace(/"/g, '\\"'))))});
module.exports.changes = changes;
module.exports.act = act;
