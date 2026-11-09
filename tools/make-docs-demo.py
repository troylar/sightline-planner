#!/usr/bin/env python3
"""Generate the invented Northstar plan used by the documentation screenshots."""
import json
from datetime import date, timedelta
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'demo'
subprocess.run([sys.executable, str(root / 'tools/make-demo.py'), str(out)], check=True)
p = out / 'plan.json'
plan = json.loads(p.read_text())
plan['meta']['title'] = 'Northstar · Product delivery'
plan['meta']['planId'] = 'p-northstar-example'
plan['meta']['revision'] = 1
plan['deliverables'] = [
    {'id':'dv-onboard', 'name':'Get new teams to their first shared plan', 'line':'Start planning together in minutes', 'kind':'improved', 'stage':'planned', 'target':'2026-Q4', 'lane':'int', 'owners':['p-avery']},
    {'id':'dv-search', 'name':'Find the right answer without asking around', 'line':'Search across the work that matters', 'kind':'new', 'stage':'planned', 'target':'2027-Q1', 'lane':'search'},
    {'id':'dv-integrations', 'name':'Bring customer context into everyday work', 'line':'Connect the tools teams already use', 'kind':'new', 'stage':'idea', 'target':'2027-Q2', 'lane':'int'},
    {'id':'dv-ai', 'name':'Turn meeting notes into a reviewed plan', 'line':'Plan with AI and stay in control', 'kind':'new', 'stage':'idea', 'target':'2027-Q3', 'lane':'search'},
    {'id':'dv-later', 'name':'Explore a workspace for partners', 'stage':'idea', 'target':'later'},
]
priority = {
    'dv-onboard': ('rock', 'Promised to the pilot teams for their first planning session'),
    'dv-search': ('pebble', 'Support asks about this every week'),
    'dv-integrations': ('sand', 'Worth doing when there is room'),
}
for d in plan['deliverables']:
    if d['id'] in priority:
        d['class'], d['why'] = priority[d['id']]
delivers = {'bar-demo-1': 'dv-onboard', 'bar-demo-5': 'dv-onboard', 'bar-demo-2': 'dv-search', 'bar-demo-3': 'dv-integrations'}
for b in plan['bars']:
    if b['id'] in delivers:
        b['delivers'] = [delivers[b['id']]]
members = {'int': ['p-avery', 'p-blake'], 'search': ['p-morgan'], 'plat': ['p-casey', 'p-jordan']}
for l in plan['lanes']:
    if l['id'] in members:
        l['members'] = members[l['id']]
        l.pop('who', None)
efforts = {'bar-demo-1': (4, 6, 9), 'bar-demo-5': (2, 3, 5), 'bar-demo-2': (3, 5, 8), 'bar-demo-3': (2, 4, 6), 'bar-demo-4': (1, 2, 3), 'bar-demo-12': (2, 3, 4), 'bar-release': (1, 2, 3)}
for b in plan['bars']:
    if b['id'] in efforts:
        lo, li, hi = efforts[b['id']]
        b['effort'] = {'low': lo, 'likely': li, 'high': hi}
plan['meta']['workOrder'] = [b for b in ['bar-demo-1', 'bar-demo-5', 'bar-demo-2', 'bar-demo-3', 'bar-demo-4', 'bar-demo-12', 'bar-release']
                             if any(x['id'] == b for x in plan['bars'])]
start = plan['meta']['start']
ago = lambda n: (date.today() - timedelta(days=n)).isoformat()
plan['deliverables'] += [
    {'id':'dv-req-export', 'name':'Export a plan summary for the weekly review', 'stage':'idea', 'capture':'request',
     'askedBy':{'type':'person', 'id':'p-morgan'}, 'raised':ago(9), 'channel':'meeting', 'impact':'Saves an hour of copying before each review',
     'origin':'weekly-review', 'about':[{'id':'dv-onboard', 'rel':'supports'}]},
    {'id':'dv-req-sso', 'name':'Sign in with the company account', 'stage':'idea', 'capture':'request',
     'role':'a customer', 'raised':ago(6), 'channel':'email', 'impact':'Blocks two pilot teams from joining', 'origin':'pilot-email-1',
     'raisedAgain':[{'id':'ra-sso-1', 'role':'support', 'raised':ago(2), 'channel':'support', 'origin':'support-ticket-7'}]},
    {'id':'dv-req-alerts', 'name':'Notifications are broken', 'stage':'idea', 'capture':'request',
     'askedBy':{'type':'person', 'id':'p-riley'}, 'raised':ago(1), 'channel':'chat'},
]
plan['guidance'] = [
    {'id':'gd-pilot', 'text':'Get the pilot teams planning before adding new integrations', 'why':'The pilot decides next year\'s rollout',
     'from':start, 'through':'2027-03-31', 'reviewOn':'2027-01-15'},
]
plan['decisions'] = [
    {'id':'dec-pilot', 'text':'Onboarding comes before the partner integrations this quarter', 'state':'decided', 'owners':['p-avery'],
     'due':'', 'item':'', 'guidance':['gd-pilot']},
]
plan['own'] = [
    {'id':'own-demo-1', 'text':'Walk the pilot teams through their first shared plan', 'owner':'p-avery', 'pin':date.today().isoformat(),
     'rel':[{'type':'deliverable', 'id':'dv-onboard'}]},
    {'id':'own-demo-2', 'text':'Answer the sign-in questions from support', 'owner':'p-avery', 'rel':[{'type':'deliverable', 'id':'dv-req-sso'}]},
    {'id':'own-demo-3', 'text':'Draft the notes for Thursday\'s review', 'owner':'p-avery'},
    {'id':'own-demo-4', 'text':'Read the onboarding survey results', 'owner':'p-avery',
     'closed':{'as':'done', 'by':'p-avery', 'at':date.today().isoformat() + 'T08:30:00Z'}},
    {'id':'own-demo-7', 'text':'Book the pilot kickoff room', 'owner':'p-avery',
     'closed':{'as':'done', 'by':'p-avery', 'at':(date.today() - timedelta(days=3)).isoformat() + 'T15:00:00Z'}},
    {'id':'own-demo-8', 'text':'Write up the first pilot retro', 'owner':'p-avery',
     'closed':{'as':'done', 'by':'p-avery', 'at':(date.today() - timedelta(days=45)).isoformat() + 'T15:00:00Z'}},
    {'id':'own-demo-5', 'text':'Check the search index sizes', 'owner':'p-morgan'},
    {'id':'own-demo-6', 'text':'Pair with the new hire on the sync setup', 'owner':'p-casey'},
]
p.write_text(json.dumps(plan, indent=2) + '\n')
print('Documentation demo: invented team, fixed roadmap targets; Jira dates follow today.')
