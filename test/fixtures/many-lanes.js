// A large synthetic plan for the sticky workstream names (harness131): 22 workstreams, 13 initiatives each, so every
// workstream is taller than the chart in Days and many are in Weeks. Every name is invented.
const fs = require("fs"), path = require("path");
const AREAS = ["Billing", "Search", "Onboarding", "Reporting", "Mobile", "Payments", "Identity", "Messaging", "Catalog", "Checkout", "Analytics",
  "Notifications", "Storage", "Scheduling", "Localization", "Accessibility", "Partner API", "Support tools", "Data export", "Pricing", "Offline mode", "Admin console"];
const COLORS = ["#2f6fd0", "#17744a", "#8a5bd0", "#c9372c", "#94600a", "#1f8a8a", "#b0408a", "#4a6a1f"];
module.exports = (lanes = AREAS.length, perLane = 13) => {
  const plan = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-plan.json"), "utf8"));
  plan.lanes = AREAS.slice(0, lanes).map((name, i)=>({id:"ws" + i, name, color:COLORS[i % COLORS.length]}));
  plan.bars = []; plan.milestones = []; plan.notes = [];
  plan.lanes.forEach((l, i)=>{ for (let k = 0; k < perLane; k++) plan.bars.push({id:`b${i}-${k}`, lane:l.id, start:(k * 3 + i) % 10, span:2 + (k % 3), label:`${l.name} piece ${k + 1}`, kind:"work", owner:"", jira:"", status:k % 4 ? "notstarted" : "inprogress", dependsOn:[]}); });
  return JSON.stringify(plan);
};
