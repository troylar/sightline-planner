#!/usr/bin/env python3
"""Writes status.json and issues.json the way the sync does, into the folder given, with Jira's answers stood in for.
For compat-old-page.js: the files are the real sync_once output (envelope, formats, every field), never written by hand.

    python3 test/sync_sample_files.py OUTDIR
"""
import importlib.util
import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("jirasync", HERE.parent / "tools" / "sightline-jira-sync.py")
js = importlib.util.module_from_spec(spec)
spec.loader.exec_module(js)

BASE = "https://jira.example.com"
ISSUE = lambda k, summary: {"summary": summary, "status": "In Progress", "category": "inprogress", "type": "Story", "updated": "2026-10-07T08:00:00Z"}
js.jira_search = lambda b, t, keys, opener=None: {k: ISSUE(k, "Wire the export") for k in keys}
js.jira_filter = lambda b, t, q, lim, opener=None: ({"ABC-2": ISSUE("ABC-2", "Found by the search")}, ["ABC-2"], 1)
js.jira_ancestors = lambda b, t, known: {}
js.project_releases = lambda b, t, keys, opener=None: ([], [])
js.newest_page = lambda folder: None

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
plan = os.path.join(out, "plan.json")
with open(plan, "w", encoding="utf-8") as f:
    json.dump({"bars": [{"jira": "ABC-1"}]}, f)
js.sync_once(plan, os.path.join(out, "status.json"), BASE, "not-a-token", "project = ABC", 10, os.path.join(out, "issues.json"))
print("1/1 passed")
