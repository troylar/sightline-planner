#!/usr/bin/env python3
"""sightline-app.py: send a batch, wait for the outcome, and fail loudly with the right exit code."""
import datetime as dt
import json
import os
import pathlib
import subprocess
import sys
import tempfile

TOOL = pathlib.Path(__file__).resolve().parent.parent / "tools" / "sightline-app.py"
passed = failed = 0


def ok(name: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
    else:
        failed += 1
        print(f"  FAIL {name}: {detail}")


def stamp(seconds_ago: float = 0) -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=seconds_ago)).isoformat().replace("+00:00", "Z")


def run(*args):
    return subprocess.run([sys.executable, str(TOOL), "--json", *args], capture_output=True, text=True, timeout=60)


def out(p):
    try:
        return json.loads(p.stdout)
    except ValueError:
        return {}


def put(folder, name, data):
    (folder / name).write_text(json.dumps(data), encoding="utf-8")


def heartbeat(folder, age=0, state="ready", rev=4, level="routine"):
    put(folder, "sightline-assistant-status.json", {"kind": "sightline-assistant-status", "version": 1, "planId": "p-app", "at": stamp(age),
                                                   "everySeconds": 30, "state": state, "autoApply": level, "planRevision": rev})


ACTIONS = [{"id": "holiday.add", "args": {"date": "iso", "name": "str?"}}, {"id": "risk.add", "args": {"id": "id?", "text": "str", "sev": "any?"}},
           {"id": "link.add", "args": {"id": "id", "after": "id"}}]
HOLIDAY = [{"id": "c1", "summary": "Day off", "ops": [{"op": "action", "action": "holiday.add", "args": {"date": "2026-11-27", "name": "Shutdown"}}]}]


def context(folder, rev=4):
    put(folder, "sightline-assistant-view.json", {"kind": "sightline-assistant-view", "version": 1, "plan": {"id": "p-app", "revision": rev}, "actions": ACTIONS})


def batch(folder, rev=4, bid="b-1", changes=None, **extra):
    path = folder / "batch.json"
    put(folder, "batch.json", {"kind": "sightline-amendments", "version": 1, "planId": "p-app", "batchId": bid, "createdAt": stamp(),
                               "source": "Planning bot", "basedOn": {"planRevision": rev}, "changes": HOLIDAY if changes is None else changes, **extra})
    return path


def act(cid, action, args):
    return {"id": cid, "summary": action, "ops": [{"op": "action", "action": action, "args": args}]}


def results(folder, bid, changes, **extra):
    put(folder, "sightline-assistant-results.json", {"kind": "sightline-assistant-results", "version": 1, "planId": "p-app", "batchId": bid, "changes": changes, **extra})


with tempfile.TemporaryDirectory() as tmp:
    f = pathlib.Path(tmp)
    p = run("status", str(f))
    ok("no page: status exits 3 and says to open the plan", p.returncode == 3 and "Open the plan" in out(p).get("error", ""), p.stdout + p.stderr)
    heartbeat(f, age=600, state="ready")
    p = run("status", str(f))
    ok("a silent page: exit 3 with how long ago and its last state", p.returncode == 3 and out(p).get("lastHeardSeconds", 0) >= 600 and out(p).get("lastState") == "ready" and "stopped responding" in out(p).get("error", ""), p.stdout)
    heartbeat(f)
    p = run("status", str(f))
    ok("a live page: status exits 0 with its state and level", p.returncode == 0 and out(p).get("state") == "ready" and out(p).get("autoApply") == "routine", p.stdout + p.stderr)

    p = run("check", str(f), str(batch(f)))
    ok("check without the context says to connect and read it", p.returncode == 1 and "Connect" in out(p).get("error", ""), p.stdout)
    context(f)
    p = run("check", str(f), str(batch(f)))
    ok("check passes a good batch offline, with no page", p.returncode == 0 and out(p).get("changes") == 1, p.stdout + p.stderr)
    p = run("check", str(f), str(batch(f, rev=3)))
    ok("check: a batch older than the context exits 2", p.returncode == 2 and out(p).get("planRevision") == 4, p.stdout)
    wrong = [act("u", "initiative.explode", {"id": "m1"}), act("m", "link.add", {"id": "m1"}), act("d", "holiday.add", {"date": "2026-02-30"}),
             act("x", "holiday.add", {"date": "2026-11-27", "colour": "red"}), act("n", "risk.add", {"text": "Vendor limits"}),
             {"id": "c1", "summary": "twice", "ops": [{"op": "explode"}]}, {"id": "c1", "summary": "dup", "ops": [{"op": "set"}]}]
    p = run("check", str(f), str(batch(f, changes=wrong)))
    lines = " | ".join(out(p).get("lines", []))
    ok("check names each problem: unknown action, missing argument, bad date, unknown argument, no id on an add, unknown op, a reused id",
       p.returncode == 1 and all(x in lines for x in ["isn't an action", "needs after", "valid date", "no argument 'colour'", "give the new item an id", "op is one of", "used twice"]), lines)
    p = run("send", str(f), str(batch(f, changes=wrong)))
    ok("send runs the same check and writes nothing when it fails", p.returncode == 1 and not (f / "sightline-amendments.json").exists(), p.stdout)
    p = run("send", str(f), str(batch(f, rev=2)))
    ok("send refuses a batch written against an older revision, exit 2 with both", p.returncode == 2 and out(p).get("basedOn") == 2 and out(p).get("planRevision") == 4, p.stdout)
    ok("and writes nothing", not (f / "sightline-amendments.json").exists())
    put(f, "batch.json", {"kind": "sightline-amendments", "version": 1, "planId": "other", "batchId": "b-x", "createdAt": stamp(), "basedOn": {"planRevision": 4}, "changes": []})
    p = run("send", str(f), str(f / "batch.json"))
    ok("send refuses a batch for another plan", p.returncode == 1 and "connected to" in out(p).get("error", ""), p.stdout)
    p = run("send", str(f), str(batch(f)))
    written = json.loads((f / "sightline-amendments.json").read_text()) if (f / "sightline-amendments.json").exists() else {}
    ok("send writes the batch as the amendments file", p.returncode == 0 and written.get("batchId") == "b-1", p.stdout + p.stderr)
    ok("atomically: no temporary files are left", not [x for x in os.listdir(f) if x.endswith(".tmp")])
    heartbeat(f, age=600)
    p = run("send", str(f), str(batch(f, bid="b-2")))
    ok("send to a silent page exits 3 and writes nothing new", p.returncode == 3 and json.loads((f / "sightline-amendments.json").read_text()).get("batchId") == "b-1", p.stdout)

    heartbeat(f)
    results(f, "b-1", [{"id": "c1", "status": "done", "outcome": "applied"}, {"id": "c2", "status": "done", "outcome": "already-in-plan"}])
    p = run("wait", str(f), "b-1", "--timeout", "1")
    ok("wait exits 0 when everything applied", p.returncode == 0 and len(out(p).get("lines", [])) == 2, p.stdout + p.stderr)
    results(f, "b-1", [{"id": "c1", "status": "ready", "outcome": "waiting", "held": {"code": "stale_context", "reason": "Written against revision 2; the plan is now at revision 4."}}])
    p = run("wait", str(f), "b-1", "--timeout", "1")
    ok("a stale context exits 2 with the page's reason", p.returncode == 2 and "revision 2" in " ".join(out(p).get("lines", [])), p.stdout)
    results(f, "b-1", [{"id": "c1", "status": "invalid", "outcome": "waiting", "reasons": ["op 1: That would create a loop."]}, {"id": "c2", "status": "done", "outcome": "applied"}])
    p = run("wait", str(f), "b-1", "--timeout", "1")
    ok("a refused change exits 1 with its reason", p.returncode == 1 and "loop" in " ".join(out(p).get("lines", [])), p.stdout)
    results(f, "b-1", [{"id": "c1", "status": "ready", "outcome": "waiting", "held": {"code": "editing", "reason": "Avery has unsaved edits in Sightline."}}])
    p = run("wait", str(f), "b-1", "--timeout", "1")
    ok("someone editing exits 1 at once, saying so", p.returncode == 1 and "editing" in " ".join(out(p).get("lines", [])), p.stdout)
    results(f, "b-1", [{"id": "c1", "status": "ready", "outcome": "waiting", "held": {"code": "review", "reason": "Waiting for review in Sightline (Changes)."}}])
    heartbeat(f, level="review")
    p = run("wait", str(f), "b-1", "--timeout", "1")
    ok("waiting for review times out with exit 1 and says a person needs to review it", p.returncode == 1 and "review" in out(p).get("error", "") and out(p).get("waiting"), p.stdout)
    results(f, "b-0", [])
    p = run("wait", str(f), "b-1", "--timeout", "1")
    ok("a page that never picks up the batch exits 3", p.returncode == 3 and "hasn't picked up" in out(p).get("error", ""), p.stdout)
    heartbeat(f, age=600)
    p = run("wait", str(f), "b-1", "--timeout", "1")
    ok("a page that stops mid-wait exits 3", p.returncode == 3 and "stopped responding" in out(p).get("error", ""), p.stdout)

    # A copy published beside a page is stamped with that page's version and refuses a page of any other version.
    stamped = f / "stamped-app.py"
    stamped.write_text(TOOL.read_text().replace("\nPAGE_VERSION = None\n", '\nPAGE_VERSION = "1.105.1"\n'), encoding="utf-8")
    srun = lambda *a: subprocess.run([sys.executable, str(stamped), "--json", *a], capture_output=True, text=True, timeout=60)
    v = subprocess.run([sys.executable, str(stamped), "--version"], capture_output=True, text=True)
    ok("a stamped copy prints the page version it matches", v.stdout.strip() == "sightline-app.py for Sightline 1.105.1", v.stdout + v.stderr)
    heartbeat(f); st = json.loads((f / "sightline-assistant-status.json").read_text()); st["appVersion"] = "1.106.0"; put(f, "sightline-assistant-status.json", st)
    before = (f / "sightline-amendments.json").read_text() if (f / "sightline-amendments.json").exists() else None
    p = srun("send", str(f), str(batch(f, bid="b-v")))
    ok("a stamped copy refuses to send to a page of another version, exit 4, naming both", p.returncode == 4 and out(p).get("page") == "1.106.0" and out(p).get("matchesPage") == "1.105.1" and "beside that page" in out(p).get("error", ""), p.stdout + p.stderr)
    ok("…and writes nothing", ((f / "sightline-amendments.json").read_text() if (f / "sightline-amendments.json").exists() else None) == before)
    ctx = json.loads((f / "sightline-assistant-view.json").read_text()); ctx["appVersion"] = "1.106.0"; put(f, "sightline-assistant-view.json", ctx)
    p = srun("check", str(f), str(batch(f)))
    ok("a stamped copy refuses to check against a context from another version", p.returncode == 4 and "sightline-assistant-view.json was written by Sightline 1.106.0" in out(p).get("error", ""), p.stdout)
    ctx["appVersion"] = "1.105.1"; put(f, "sightline-assistant-view.json", ctx)
    p = srun("check", str(f), str(batch(f)))
    ok("…and checks one from its own version", p.returncode == 0 and out(p).get("matchesPage") == "1.105.1", p.stdout + p.stderr)
    ctx["appVersion"] = "1.106.0"; put(f, "sightline-assistant-view.json", ctx)
    p = run("check", str(f), str(batch(f)))
    ok("the unstamped source copy doesn't compare versions", p.returncode == 0 and out(p).get("matchesPage") is None, p.stdout + p.stderr)
    stamped.unlink()

    # A dated release gives an outcome a target the page keeps when the release is cleared; an undated one doesn't.
    put(f, "sightline-assistant-view.json", {"kind": "sightline-assistant-view", "version": 1, "plan": {"id": "p-app", "revision": 4},
                                             "actions": [{"id": "outcome.set", "args": {"id": "str", "field": "str", "value": "any"}},
                                                         {"id": "outcome.setRelease", "args": {"id": "str", "release": "str"}}],
                                             "choices": {"releases": [{"id": "r-dated", "date": "2027-03-01"}, {"id": "r-open", "date": None}]},
                                             "deliverables": [{"id": "dv-1", "name": "Export", "stage": "idea"}, {"id": "dv-2", "name": "Import", "stage": "idea"}]})
    rel = lambda i, r: {"op": "action", "action": "outcome.setRelease", "args": {"id": i, "release": r}}
    plan_it = lambda i: {"op": "action", "action": "outcome.set", "args": {"id": i, "field": "stage", "value": "planned"}}
    p = run("check", str(f), str(batch(f, changes=[{"id": "r1", "summary": "dated", "ops": [rel("dv-1", "r-dated"), rel("dv-1", ""), plan_it("dv-1")]},
                                                  {"id": "r2", "summary": "undated", "ops": [rel("dv-2", "r-open"), rel("dv-2", ""), plan_it("dv-2")]}])))
    lines = out(p).get("lines", [])
    ok("a dated release leaves a target behind when it's cleared, so planning is allowed; an undated one doesn't",
       not any(x.startswith("change r1") for x in lines) and "change r2, op 3: Pick a target to plan it." in lines, p.stdout + p.stderr)

    # A release the context left out may be dated: the checker can't refuse it, or planning an outcome that has it.
    put(f, "sightline-assistant-view.json", {"kind": "sightline-assistant-view", "version": 1, "plan": {"id": "p-app", "revision": 4},
                                             "actions": [{"id": "outcome.set", "args": {"id": "str", "field": "str", "value": "any"}},
                                                         {"id": "outcome.setRelease", "args": {"id": "str", "release": "str"}}],
                                             "choices": {"releases": [{"id": "r-open", "date": None}]},
                                             "coverage": {"complete": False, "choices.releases": {"total": 2, "exported": 1, "omitted": 1}},
                                             "deliverables": [{"id": "dv-1", "name": "Export", "stage": "idea"},
                                                              {"id": "dv-2", "name": "Import", "stage": "idea", "release": "r-left-out"}]})
    p = run("check", str(f), str(batch(f, changes=[{"id": "o1", "summary": "left out", "ops": [rel("dv-1", "r-left-out"), plan_it("dv-1")]},
                                                  {"id": "o2", "summary": "has one", "ops": [plan_it("dv-2")]}])))
    ok("a release the context left out isn't refused, and nor is planning an outcome that has one", out(p).get("ok") is True and not out(p).get("lines"), p.stdout + p.stderr)

    # A placement checked against jiraSort is the context's: after an op that may change it (a new initiative), the page decides.
    put(f, "sightline-assistant-view.json", {"kind": "sightline-assistant-view", "version": 1, "plan": {"id": "p-app", "revision": 4},
                                             "actions": [{"id": "initiative.add", "args": {"id": "id?", "label": "str?"}, "creates": "initiativeId"},
                                                         {"id": "jira.toInitiative", "args": {"keys": "keys", "id": "str"}}],
                                             "jiraSort": {"issues": [{"key": "ABC-101"}], "placed": {}, "epics": [], "targets": {"initiatives": [], "workstreams": []}}})
    to_new = {"op": "action", "action": "jira.toInitiative", "args": {"keys": ["ABC-101"], "id": "b-new"}}
    p = run("check", str(f), str(batch(f, changes=[{"id": "j1", "summary": "new home", "ops": [{"op": "action", "action": "initiative.add", "args": {"id": "b-new", "label": "New"}}, to_new]},
                                                  {"id": "j2", "summary": "alone", "ops": [to_new]}])))
    lines = out(p).get("lines", [])
    ok("a placement on an initiative made earlier in the change isn't checked against the context's targets",
       not any(x.startswith("change j1") for x in lines), p.stdout + p.stderr)

    # A placement makes tasks with ids the page picks, and a workstream's former id reads as its id now (the page's alias).
    REFS = {"taskId": {"noun": "task", "in": "initiatives[].tasks", "coverage": "tasks", "missing": "That task isn't in the plan."},
            "workstreamId": {"noun": "workstream", "in": "planning.workstreams", "coverage": "workstreams", "missing": "That workstream isn't in the plan."}}
    put(f, "sightline-assistant-view.json", {"kind": "sightline-assistant-view", "version": 1, "plan": {"id": "p-app", "revision": 4},
                                             "argTypes": {"refs": REFS, "types": {}},
                                             "coverage": {"complete": True, "tasks": {"total": 0, "exported": 0, "omitted": 0}, "workstreams": {"total": 1, "exported": 1, "omitted": 0}},
                                             "actions": [{"id": "jira.toInitiative", "args": {"keys": "keys", "id": "str"}},
                                                         {"id": "task.set", "args": {"id": "taskId", "field": "str", "value": "any"}, "fields": {"label": "str"}},
                                                         {"id": "workstream.rename", "args": {"id": "workstreamId", "name": "str"}}],
                                             "initiatives": [{"id": "b-1", "label": "Home", "tasks": []}],
                                             "planning": {"workstreams": [{"id": "lane-renamed", "name": "Platform"}]},
                                             "jiraSort": {"issues": [{"key": "ABC-901"}], "placed": {}, "epics": [],
                                                          "targets": {"initiatives": [{"id": "b-1"}], "workstreams": [{"id": "lane-renamed", "was": ["int"]}]}}})
    act = lambda n, x: {"op": "action", "action": n, "args": x}
    p = run("check", str(f), str(batch(f, changes=[
        {"id": "k1", "summary": "place, then label", "ops": [act("jira.toInitiative", {"keys": ["ABC-901"], "id": "b-1"}), act("task.set", {"id": "task-abc-901", "field": "label", "value": "Planning label"})]},
        {"id": "k2", "summary": "former id", "ops": [act("workstream.rename", {"id": "int", "name": "Platform"})]}])))
    ok("a task a placement made, and a workstream's former id, aren't refused as missing", out(p).get("ok") is True and not out(p).get("lines"), p.stdout + p.stderr)
    p = run("check", str(f), str(batch(f, changes=[{"id": "k3", "summary": "no such task", "ops": [act("task.set", {"id": "task-zz", "field": "label", "value": "X"})]}])))
    ok("…while a task nothing made is still refused", "change k3, op 1: That task isn't in the plan." in out(p).get("lines", []), p.stdout + p.stderr)

    # An epic made into an initiative gets an id the page picks: an add with that id may be the same one (already done),
    # and a link or reference to it can't be proved wrong. An own item that may have become a task is still an own item
    # to a later change, if the context left it out.
    REF = lambda noun, where, cov, **x: {"noun": noun, "in": where, "coverage": cov, "missing": f"That {noun} isn't in the plan.", **x}
    put(f, "sightline-assistant-view.json", {"kind": "sightline-assistant-view", "version": 1, "plan": {"id": "p-app", "revision": 4},
        "argTypes": {"types": {}, "refs": {"initiativeId": REF("initiative", "initiatives", "initiatives"), "outcomeId": REF("deliverable", "deliverables", "deliverables"),
                                           "itemId": REF("item", "deliverables, initiatives", "deliverables, initiatives", of=["outcomeId", "initiativeId"]),
                                           "taskId": REF("task", "initiatives[].tasks", "tasks"), "ownId": REF("own item", "planning.own", "own"),
                                           "workstreamId": REF("workstream", "planning.workstreams", "workstreams")}},
        "coverage": {"complete": False, "initiatives": {"omitted": 0}, "deliverables": {"omitted": 0}, "tasks": {"omitted": 0}, "workstreams": {"omitted": 0}, "own": {"omitted": 1}},
        "actions": [{"id": "jira.epicNew", "args": {"epic": "str", "lane": "workstreamId", "id": "id?"}, "creates": "initiativeId"},
                    {"id": "initiative.add", "args": {"id": "id?", "label": "str?", "parent": "initiativeId?"}, "creates": "initiativeId"},
                    {"id": "link.add", "args": {"id": "initiativeId", "after": "initiativeId"}},
                    {"id": "ref.add", "args": {"on": "itemId", "id": "id?", "url": "str"}},
                    {"id": "own.toTask", "args": {"id": "ownId", "initiativeId": "initiativeId"}},
                    {"id": "own.set", "args": {"id": "ownId", "field": "str", "value": "any"}, "fields": {"text": "str"}}],
        "initiatives": [{"id": "m1", "label": "Home", "tasks": []}], "deliverables": [],
        "planning": {"workstreams": [{"id": "int", "name": "Integrations"}], "own": []},
        "jiraSort": {"issues": [], "placed": {}, "epics": [{"key": "ABC-901", "state": "new"}], "targets": {"initiatives": [{"id": "m1"}], "workstreams": [{"id": "int"}]}}})
    p = run("check", str(f), str(batch(f, changes=[
        {"id": "g2", "summary": "own item into a task", "ops": [act("own.toTask", {"id": "own-x", "initiativeId": "m1"})]},
        {"id": "g3", "summary": "edit it as an own item", "ops": [act("own.set", {"id": "own-x", "field": "text", "value": "Call the vendor"})]}])))
    ok("an own item the context left out, that may or may not have become a task, isn't refused", out(p).get("ok") is True and not out(p).get("lines"), p.stdout + p.stderr)
    whole = json.loads((f / "sightline-assistant-view.json").read_text())
    whole["coverage"] = {"complete": True}
    put(f, "sightline-assistant-view.json", whole)
    p = run("check", str(f), str(batch(f, changes=[
        {"id": "g1", "summary": "epic, its add again, a link", "ops": [act("jira.epicNew", {"epic": "ABC-901", "lane": "int"}),
                                                                     act("initiative.add", {"id": "bar-abc-901", "label": "ABC-901", "parent": "m1"}),
                                                                     act("link.add", {"id": "bar-abc-901", "after": "m1"}),
                                                                     act("ref.add", {"on": "bar-abc-901", "id": "ref-new", "url": "https://docs.example.com/a"})]}])))
    ok("an initiative a placement made: its add again may be done, and a link or reference to it isn't refused", out(p).get("ok") is True and not out(p).get("lines"), p.stdout + p.stderr)
    p = run("check", str(f), str(batch(f, changes=[
        {"id": "g4", "summary": "epic, then a reference on it", "ops": [act("jira.epicNew", {"epic": "ABC-901", "lane": "int"}),
                                                                       act("ref.add", {"on": "bar-abc-901", "id": "ref-new", "url": "https://docs.example.com/a"})]}])))
    ok("…and an item reference (an outcome or an initiative) to it isn't refused either", out(p).get("ok") is True and not out(p).get("lines"), p.stdout + p.stderr)

    ok("the tool uses only the standard library", all(not line.startswith(("import requests", "from requests")) for line in TOOL.read_text().splitlines()))
    ok("it never touches the context or results files", '"w"' not in TOOL.read_text().split("def write_atomic")[0])

print(f"{passed}/{passed + failed} passed")
sys.exit(1 if failed else 0)
