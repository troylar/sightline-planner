#!/usr/bin/env python3
"""Generate the invented Northstar plan used by the documentation screenshots."""
import json
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
p.write_text(json.dumps(plan, indent=2) + '\n')
print('Documentation demo: invented team, fixed roadmap targets; Jira dates follow today.')
