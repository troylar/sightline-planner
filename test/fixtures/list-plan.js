// A synthetic plan for List, derived from sample-plan.json after it loads: tasks with links, an initiative wait, a gate
// wait and a process wait, a task with two owners, nested initiatives, an initiative with no tasks, Jira items placed
// and derived from an epic, an unassigned task, and undated, parked and switched-off work. Run in the page: listPlan(n)
// adds n tasks (about 30 for acceptance, about 100 for profiling). Every name here is invented.
module.exports = `window.listPlan = (n) => {
  const iso = d => dayToIso(d), people = S.people.map(p=>p.id), bars = S.bars;
  S.people.push({id:'p-ext', name:'Riley', initials:'RI', color:'#888888', external:true}, {id:'p-gone', name:'Quinn', initials:'QU', color:'#999999', inactive:true});
  S.meta.jiraBase = 'https://jira.example.com/browse/';
  S.types = [{id:'ty-rev', name:'Security review', shape:'window', days:3, lane:''}];
  S.blocks = [{id:'blk-rev', type:'ty-rev', date:'2026-10-12', days:3, label:'Security review', after:[], status:'planned'}];
  const hosts = bars.slice(0, 10), per = Math.max(1, Math.round(n / hosts.length)); let k = 0;
  hosts.forEach((b, bi)=>{ b.tasks = []; for (let i = 0; i < per && k < n; i++, k++){
    const s = wkDay(b.start) + i * 3, prev = b.tasks[i - 1];
    b.tasks.push({id:'t-' + bi + '-' + i, label:'Task ' + (bi + 1) + '.' + (i + 1), start:iso(s), days:2 + (i % 3), status:i === 0 ? 'inprogress' : 'notstarted',
      owners:[people[(bi + i) % people.length]], dependsOn:prev ? [prev.id] : [], tags:[]}); } });
  const T = id => bars.flatMap(b=>b.tasks || []).find(t=>t.id === id);
  T('t-0-1').owners = [people[0], people[1]];                       // shared
  T('t-1-1').owners = [];                                           // unassigned
  T('t-1-2').label = 'Pipes | and\\nbreaks';                         // for Copy as table
  T('t-2-0').dependsOn = ['t-0-2'];                                 // a link to another initiative's task
  T('t-3-0').jiraDeps = ['XYZ-9'];                                  // an external Jira prerequisite
  T('t-0-0').jira = 'ABC-101';                                      // a Jira item placed as a task
  T('t-4-0').owners = ['p-ext']; T('t-4-1').owners = ['p-gone'];
  bars[3].dependsOn = [bars[1].id];                                 // an initiative wait
  bars[4].waitsFor = [S.gates[0].id, 'blk-rev'];                    // a gate wait and a process wait
  bars[11].parent = bars[10].id; bars[11].lane = bars[10].lane;     // nested
  bars[12].parent = bars[10].id; bars[12].lane = bars[10].lane;
  bars[13].parked = true;                                           // parked
  bars[14].epics = ['ABC-50']; bars[14].storiesOff = ['ABC-103'];   // derived Jira work, one switched off
  JIRA = {kind:'sightline-jira-status', version:1, generatedAt:'2026-10-07T08:00:00Z', sprints:[], releases:[], issues:{
    'ABC-50':{summary:'Search epic', status:'In Progress', category:'inprogress', type:'Epic'},
    'ABC-101':{summary:'Placed story', status:'In Progress', category:'inprogress', type:'Story', assignee:'Avery', sprintState:'active', sprintStart:'2026-10-05', sprintEnd:'2026-10-16'},
    'ABC-102':{summary:'Derived story', status:'To Do', category:'todo', type:'Story', sprintState:'future', sprintStart:'2026-10-19', sprintEnd:'2026-10-30'},
    'ABC-103':{summary:'Switched off story', status:'To Do', category:'todo', type:'Story', sprintState:'future', sprintStart:'2026-10-19', sprintEnd:'2026-10-30'},
    'ABC-104':{summary:'Dropped story', status:'Won\\'t Do', category:'done', resolution:'Won\\'t Do', type:'Story', sprintState:'active', sprintStart:'2026-10-05', sprintEnd:'2026-10-16'},
    'ABC-105':{summary:'Unscheduled story', status:'To Do', category:'todo', type:'Story'},
    'XYZ-9':{summary:'Other team API', status:'In Progress', category:'inprogress', type:'Story', sprintState:'future', sprintStart:'2026-11-02', sprintEnd:'2026-11-13'}},
    rollups:{'ABC-50':{children:['ABC-101', 'ABC-102', 'ABC-103', 'ABC-104', 'ABC-105'], byState:{}}}};
  S = normalize(S, false); dropJiraMemos(); resetHistory(); sel = null; render();
};`;
