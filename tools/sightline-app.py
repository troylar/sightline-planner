#!/usr/bin/env python3
"""Send an assistant's changes to Sightline and find out what happened, without a person watching.

Works on the private assistant folder connected in Sightline (Connect assistant). Standard library only; no network.

  sightline-app.py status <folder>                    is a Sightline page answering for this folder?
  sightline-app.py send <folder> <batch.json>         check the heartbeat and context, then write the batch atomically
  sightline-app.py wait <folder> <batchId>            wait until every change has an outcome
  sightline-app.py run <folder> <batch.json>          send, then wait

Exit codes: 0 everything applied (or was already in the plan); 1 something was refused, conflicted, expired or still
waits for a person; 2 the batch was written against an older revision of the plan (read the context again);
3 no Sightline page is answering for this folder (closed, asleep, or its folder permission was lost).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sys
import tempfile
import time

CONTEXT_FILE = "sightline-assistant-view.json"
AMENDMENTS_FILE = "sightline-amendments.json"
RESULTS_FILE = "sightline-assistant-results.json"
STATUS_FILE = "sightline-assistant-status.json"
MAX_READ = 5 * 1024 * 1024
AMENDMENTS_MAX = 512 * 1024
# A page ticks every 30 seconds; a background tab can be slowed to once a minute. Silence past this means nobody's there.
STALE_AFTER = 150
DONE = {"applied", "already-in-plan"}


class Fail(Exception):
    def __init__(self, code: int, message: str, detail: dict | None = None):
        super().__init__(message)
        self.code, self.message, self.detail = code, message, detail or {}


def read_json(path: Path, kind: str):
    try:
        if path.stat().st_size > MAX_READ:
            raise Fail(1, f"{path.name} is larger than {MAX_READ // (1024 * 1024)} MB.")
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as e:
        raise Fail(1, f"Can't read {path.name}: {e}")
    if not isinstance(data, dict) or data.get("kind") != kind:
        raise Fail(1, f"{path.name} isn't a Sightline {kind} file.")
    return data


def age_seconds(stamp) -> float | None:
    try:
        t = dt.datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.timezone.utc)
    return (dt.datetime.now(dt.timezone.utc) - t).total_seconds()


def heartbeat(folder: Path) -> dict:
    """The page's latest status, or Fail(3) when no page is answering."""
    st = read_json(folder / STATUS_FILE, "sightline-assistant-status")
    if st is None:
        raise Fail(3, f"No Sightline page has answered for this folder: {STATUS_FILE} isn't there. Open the plan in Sightline and connect this folder (Connect assistant).")
    age = age_seconds(st.get("at"))
    if age is None:
        raise Fail(3, f"{STATUS_FILE} has no readable time.")
    if age > STALE_AFTER:
        raise Fail(3, f"The Sightline page stopped responding: last heard {int(age)} seconds ago, when it was {st.get('state')}. Open the plan in Sightline, or reconnect the folder.",
                   {"lastHeardSeconds": int(age), "lastState": st.get("state")})
    st["ageSeconds"] = int(age)
    return st


def check_batch(batch: dict, st: dict) -> None:
    if batch.get("kind") != "sightline-amendments" or batch.get("version") != 1:
        raise Fail(1, 'The batch must have kind "sightline-amendments" and version 1.')
    if batch.get("planId") != st.get("planId"):
        raise Fail(1, f"The batch is for plan {batch.get('planId')!r}; this folder is connected to {st.get('planId')!r}.")
    if not isinstance(batch.get("batchId"), str) or not batch["batchId"]:
        raise Fail(1, "The batch needs a batchId.")
    based = (batch.get("basedOn") or {}).get("planRevision")
    if not isinstance(based, int):
        raise Fail(1, "The batch needs basedOn.planRevision: the plan revision in the context you read.")
    if based != st.get("planRevision"):
        raise Fail(2, f"The batch was written against revision {based}; the plan is at revision {st.get('planRevision')}. Read {CONTEXT_FILE} again and rewrite it.",
                   {"basedOn": based, "planRevision": st.get("planRevision")})
    made = age_seconds(batch.get("createdAt"))
    if made is None:
        raise Fail(1, "The batch needs createdAt (an ISO time), so Sightline can tell how old it is.")


def write_atomic(folder: Path, name: str, text: str) -> None:
    fd, tmp = tempfile.mkstemp(prefix=".sightline-", suffix=".tmp", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, folder / name)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def send(folder: Path, batch_path: Path) -> dict:
    st = heartbeat(folder)
    try:
        text = batch_path.read_text(encoding="utf-8")
        batch = json.loads(text)
    except (OSError, ValueError) as e:
        raise Fail(1, f"Can't read the batch {batch_path.name}: {e}")
    if len(text.encode("utf-8")) > AMENDMENTS_MAX:
        raise Fail(1, f"The batch is over {AMENDMENTS_MAX // 1024} KB.")
    check_batch(batch, st)
    write_atomic(folder, AMENDMENTS_FILE, text if text.endswith("\n") else text + "\n")
    return {"sent": batch["batchId"], "state": st.get("state"), "autoApply": st.get("autoApply")}


def outcome_of(results: dict) -> tuple[int, list, list]:
    """(exit code if finished else -1, finished lines, waiting lines) for the results of one batch."""
    done, bad, stale, waiting = [], [], [], []
    if results.get("inputError"):
        return 1, [f"Sightline couldn't read the batch: {results['inputError']}"], []
    for c in results.get("changes") or []:
        cid, held = c.get("id"), c.get("held") or {}
        why = " ".join(c.get("reasons") or []) or held.get("reason") or ""
        if c.get("outcome") in DONE:
            done.append(f"{cid}: {c.get('outcome')}")
        elif c.get("outcome") == "skipped":
            bad.append(f"{cid}: skipped by a person")
        elif c.get("status") == "invalid":
            bad.append(f"{cid}: refused: {why}")
        elif c.get("status") == "conflicted":
            bad.append(f"{cid}: changed since: {why}")
        elif held.get("code") == "stale_context":
            stale.append(f"{cid}: {held.get('reason')}")
        elif held.get("code") in ("expired", "editing", "read_only", "paused"):
            bad.append(f"{cid}: {held.get('code')}: {held.get('reason')}")
        else:
            waiting.append(f"{cid}: {held.get('reason') or 'waiting'}")
    if stale:
        return 2, stale + bad, waiting
    if waiting:
        return -1, done + bad, waiting
    return (1 if bad else 0), done + bad, []


def wait(folder: Path, batch_id: str, timeout: float, poll: float = 5.0) -> dict:
    end = time.monotonic() + timeout
    last_waiting: list = []
    while True:
        st = heartbeat(folder)
        res = read_json(folder / RESULTS_FILE, "sightline-assistant-results")
        if res and res.get("batchId") == batch_id:
            code, lines, waiting = outcome_of(res)
            if code >= 0:
                if code == 0:
                    return {"batchId": batch_id, "lines": lines}
                raise Fail(code, "Not everything in the batch applied.", {"batchId": batch_id, "lines": lines})
            last_waiting = waiting
        if time.monotonic() >= end:
            if res is None or res.get("batchId") != batch_id:
                raise Fail(3, f"The Sightline page is answering ({st.get('state')}) but hasn't picked up batch {batch_id}. Check that it was written to {AMENDMENTS_FILE} in this folder.")
            raise Fail(1, f"Still waiting after {int(timeout)} seconds" + (" for a person to review it in Sightline (Changes)." if st.get("autoApply") == "review" else "."),
                       {"batchId": batch_id, "waiting": last_waiting})
        time.sleep(poll)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Send an assistant's changes to Sightline and wait for the outcome.")
    ap.add_argument("--json", action="store_true", help="print one JSON object")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("status", help="is a Sightline page answering for this folder?")
    s.add_argument("folder")
    s = sub.add_parser("send", help="check the heartbeat and context revision, then write the batch atomically")
    s.add_argument("folder"); s.add_argument("batch")
    s = sub.add_parser("wait", help="wait until every change in a batch has an outcome")
    s.add_argument("folder"); s.add_argument("batchId"); s.add_argument("--timeout", type=float, default=180)
    s = sub.add_parser("run", help="send, then wait")
    s.add_argument("folder"); s.add_argument("batch"); s.add_argument("--timeout", type=float, default=180)
    a = ap.parse_args(argv)
    folder = Path(a.folder)
    try:
        if not folder.is_dir():
            raise Fail(1, f"{a.folder} isn't a folder.")
        if a.cmd == "status":
            out = heartbeat(folder)
            msg = f"Sightline is {out.get('state')} (heard {out['ageSeconds']} seconds ago); changes {'wait for review' if out.get('autoApply') == 'review' else 'apply on their own'}; plan revision {out.get('planRevision')}."
        elif a.cmd == "send":
            out = send(folder, Path(a.batch))
            msg = f"Sent {out['sent']}. Sightline is {out['state']}."
        elif a.cmd == "wait":
            out = wait(folder, a.batchId, a.timeout)
            msg = "Applied:\n  " + "\n  ".join(out["lines"])
        else:
            sent = send(folder, Path(a.batch))
            out = {**wait(folder, sent["sent"], a.timeout), **sent}
            msg = "Applied:\n  " + "\n  ".join(out["lines"])
        print(json.dumps({"ok": True, **out}) if a.json else msg)
        return 0
    except Fail as e:
        if a.json:
            print(json.dumps({"ok": False, "exit": e.code, "error": e.message, **e.detail}))
        else:
            print(e.message, file=sys.stderr)
            for line in e.detail.get("lines", []) + e.detail.get("waiting", []):
                print("  " + line, file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
