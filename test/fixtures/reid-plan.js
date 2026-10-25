// Synthetic plan for changing a workstream's id (docs/assistant-workflow.md, "Workstreams"). The sample plan's "chat"
// workstream is named API v2, so its id says something else. Here every kind of place a plan names a workstream points at
// it at least once: initiatives and milestones (already in the sample), a note, a meeting, a process type and block, a
// deliverable, a time split, its Planning guide entry and a saved view. harness138 adds the baseline, a snapshot
// and a saved status update, then checks each is rewritten. Every name here is invented.
const OLD = "chat", NEW = "api-v2";
module.exports = sample => { const o = JSON.parse(sample), add = (k, x) => { o[k] = [...(o[k] || []), x]; };
  add("notes", {id:"note-reid", text:"Check the paging limits", date:"2026-10-05", lane:OLD});
  add("meetings", {id:"meet-reid", title:"API sync", date:"2026-10-06", time:"10:00", minutes:30, lane:OLD});
  add("types", {id:"type-reid", name:"API review", icon:"flag", color:"#6b5bd6", shape:"moment", days:1, lane:OLD});
  add("blocks", {id:"blk-reid", type:"type-reid", label:"Review paging", lane:OLD, date:"2026-10-07"});
  add("deliverables", {id:"dv-reid", name:"Paging for every list", stage:"planned", target:"2026-Q4", lane:OLD});
  add("planningGuide", {id:"lane:" + OLD, text:"The public API: versioning, paging and error codes."});
  add("views", {id:"view-reid", name:"API only", def:{filter:{lanes:[OLD]}}});
  add("people", {id:"person-quinn", name:"Quinn", lanes:{[OLD]:60, int:40}});
  return JSON.stringify(o); };
module.exports.OLD = OLD; module.exports.NEW = NEW;
