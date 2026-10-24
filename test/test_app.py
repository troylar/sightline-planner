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

    ok("the tool uses only the standard library", all(not line.startswith(("import requests", "from requests")) for line in TOOL.read_text().splitlines()))
    ok("it never touches the context or results files", '"w"' not in TOOL.read_text().split("def write_atomic")[0])

print(f"{passed}/{passed + failed} passed")
sys.exit(1 if failed else 0)
