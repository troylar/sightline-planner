#!/usr/bin/env python3
"""Send an assistant's changes to Sightline and find out what happened, without a person watching.

Works on the private assistant folder connected in Sightline (Connect assistant). Standard library only; no network.

  sightline-app.py status <folder>                    is a Sightline page answering for this folder?
  sightline-app.py check <folder> <batch.json>        check a batch against the context you read, offline (no page needed)
  sightline-app.py send <folder> <batch.json>         check the heartbeat and context, then write the batch atomically
  sightline-app.py wait <folder> <batchId>            wait until every change has an outcome
  sightline-app.py run <folder> <batch.json>          send, then wait

Exit codes: 0 everything applied (or was already in the plan); 1 something was refused, conflicted, expired or still
waits for a person; 2 the batch was written against an older revision of the plan (read the context again);
3 no Sightline page is answering for this folder (closed, asleep, or its folder permission was lost); 4 this copy was
published with a different Sightline version than the page that wrote the folder's files (use the copy beside that page).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sys
import re
import tempfile
import time

# The Sightline page this copy matches. build.sh stamps it into the copy it publishes beside the page; None means this
# runs from source, where nothing is stamped and nothing is compared.
PAGE_VERSION = None
CONTEXT_FILE = "sightline-assistant-view.json"
AMENDMENTS_FILE = "sightline-amendments.json"
RESULTS_FILE = "sightline-assistant-results.json"
STATUS_FILE = "sightline-assistant-status.json"
MAX_READ = 5 * 1024 * 1024
AMENDMENTS_MAX = 512 * 1024
# A page ticks every 30 seconds; a background tab can be slowed to once a minute. Silence past this means nobody's there.
STALE_AFTER = 150
DONE = {"applied", "already-in-plan"}
OPS = {"add", "set", "link", "unlink", "propose", "action"}
CHANGE_ID = re.compile(r"^(?!(?:__proto__|constructor|prototype|toString|valueOf|hasOwnProperty)$)[A-Za-z0-9._-]{1,80}$")
ARG_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,79}$")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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


def match_page(found, where: str) -> None:
    if PAGE_VERSION and found and found != PAGE_VERSION:
        raise Fail(4, f"This sightline-app.py matches Sightline {PAGE_VERSION}, but {where} was written by Sightline {found}. Nothing was sent or checked. "
                      "Use the sightline-app.py published beside that page (its .sha256 file says whether the copy is intact).", {"matchesPage": PAGE_VERSION, "page": found})


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
    match_page(st.get("appVersion"), STATUS_FILE)
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


def arg_ok(t: str, v) -> bool:
    t = t.rstrip("?")
    if t == "any":
        return True
    if t == "id":
        return isinstance(v, str) and bool(ARG_ID.match(v))
    if t == "idOrBlank":
        return v == "" or arg_ok("id", v)
    if t in ("ids", "keys"):
        return isinstance(v, list) and len(v) <= 500 and all(isinstance(x, str) and x for x in v)
    if t == "str":
        return isinstance(v, str) and len(v) <= 4000
    if t == "iso":
        if not (isinstance(v, str) and ISO.match(v)):
            return False
        try:
            dt.date.fromisoformat(v)
        except ValueError:
            return False
        return True
    if t == "num":
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf")
    if t == "int":
        return isinstance(v, int) and not isinstance(v, bool)
    return True


def check_offline(folder: Path, batch: dict) -> list:
    """Problems with a batch, checked against the context file it was written from. The page checks again."""
    ctx = read_json(folder / CONTEXT_FILE, "sightline-assistant-view")
    if ctx is None:
        raise Fail(1, f"{CONTEXT_FILE} isn't in this folder. Connect it in Sightline (Connect assistant), then read the context.")
    match_page(ctx.get("appVersion"), CONTEXT_FILE)
    plan = ctx.get("plan") or {}
    if batch.get("kind") != "sightline-amendments" or batch.get("version") != 1:
        raise Fail(1, 'The batch must have kind "sightline-amendments" and version 1.')
    if batch.get("planId") != plan.get("id"):
        raise Fail(1, f"The batch is for plan {batch.get('planId')!r}; the context is for {plan.get('id')!r}.")
    based = (batch.get("basedOn") or {}).get("planRevision")
    if not isinstance(based, int):
        raise Fail(1, "The batch needs basedOn.planRevision: the plan revision in the context you read.")
    if based != plan.get("revision", 0):
        raise Fail(2, f"The batch was written against revision {based}; the context is at revision {plan.get('revision', 0)}. Read {CONTEXT_FILE} again and rewrite it.",
                   {"basedOn": based, "planRevision": plan.get("revision", 0)})
    actions = {a.get("id"): a.get("args") or {} for a in ctx.get("actions") or [] if isinstance(a, dict)}
    bad, seen = [], set()
    changes = batch.get("changes")
    if not isinstance(changes, list) or not changes:
        return ["The batch has no changes."]
    for ci, c in enumerate(changes, 1):
        cid = c.get("id") if isinstance(c, dict) else None
        at = f"change {cid or ci}"
        if not isinstance(cid, str) or not CHANGE_ID.match(cid):
            bad.append(f"{at}: every change needs an id (letters, digits, . _ and -).")
            continue
        if cid in seen:
            bad.append(f"{at}: the id is used twice.")
        seen.add(cid)
        ops = c.get("ops")
        if not isinstance(ops, list) or not ops:
            bad.append(f"{at}: no ops.")
            continue
        if c.get("reason") is not None and not isinstance(c.get("reason"), str):
            bad.append(f"{at}: reason is one line of text.")
        if c.get("confidence") is not None and c.get("confidence") not in ("high", "low"):
            bad.append(f'{at}: confidence is "high" or "low".')
        for oi, o in enumerate(ops, 1):
            where = f"{at}, op {oi}"
            if not isinstance(o, dict) or o.get("op") not in OPS:
                bad.append(f"{where}: op is one of {', '.join(sorted(OPS))}.")
                continue
            if o["op"] != "action":
                continue
            name, args = o.get("action"), o.get("args")
            if name not in actions:
                bad.append(f"{where}: {name!r} isn't an action in the context.")
                continue
            if not isinstance(args, dict):
                bad.append(f"{where}: args must be an object.")
                continue
            spec = actions[name]
            for k in args:
                if k not in spec:
                    bad.append(f"{where}: {name} has no argument {k!r}.")
            for k, t in spec.items():
                if k not in args or (args[k] is None and t.endswith("?")):
                    if not t.endswith("?"):
                        bad.append(f"{where}: {name} needs {k}.")
                    continue
                if not arg_ok(t, args[k]):
                    bad.append(f"{where}: {k} isn't a valid {'date (YYYY-MM-DD)' if t.startswith('iso') else t.rstrip('?')}.")
            if name.endswith(".add") and "id" in spec and not (isinstance(args.get("id"), str) and args["id"]):
                bad.append(f"{where}: give the new item an id (like risk-vendor-limits), so reading the file again can't add it twice.")
            if str(name).startswith("jira.") and name not in ("jira.hide", "jira.unhide"):      # hiding isn't a placement
                bad.extend(f"{where}: {x}" for x in check_jira_place(ctx.get("jiraSort") or {}, name, args))
    return bad


JIRA_KEYS_MAX = 100


def check_jira_place(sort: dict, name: str, args: dict) -> list:
    """A Jira placement against the context's sort list: what's waiting to be sorted, what's already on the plan and where
    work can go. Mirrors the page, which checks again: already where the change puts it is fine; somewhere else isn't."""
    up = lambda v: str(v or "").strip().upper()
    pile = {up(x.get("key")): x for x in sort.get("issues") or [] if isinstance(x, dict)}
    placed = {up(k): v for k, v in (sort.get("placed") or {}).items() if isinstance(v, dict)}
    epics = {up(x.get("key")) for x in sort.get("epics") or [] if isinstance(x, dict)}
    targets = sort.get("targets") or {}
    lane_of = {}                                       # a workstream's id, or a former id it keeps (was) -> its id now
    for x in targets.get("workstreams") or []:
        if isinstance(x, dict) and isinstance(x.get("id"), str):
            lane_of[x["id"]] = x["id"]
            for o in x.get("was") if isinstance(x.get("was"), list) else []:
                lane_of.setdefault(o, x["id"])
    lanes = set(lane_of)
    bars = {x.get("id"): x for x in targets.get("initiatives") or [] if isinstance(x, dict)}
    bad = []
    if name in ("jira.epicLink", "jira.epicNew"):
        epic = up(args.get("epic"))
        if epic not in epics:
            bad.append(f"{epic[:40] or 'epic'} isn't an epic in jiraSort.epics.")
    else:
        keys = list(dict.fromkeys(up(k) for k in args.get("keys"))) if isinstance(args.get("keys"), list) else []
        if not keys:
            bad.append("list at least one Jira key in keys.")
        if len(keys) > JIRA_KEYS_MAX:
            bad.append(f"one change places up to {JIRA_KEYS_MAX} issues.")
        dest = ("notOurs", None) if name == "jira.notOurs" else ("lane", lane_of.get(args.get("lane"), args.get("lane"))) if name == "jira.toWorkstream" else ("initiative", args.get("id"))
        for k in keys:
            if k in pile:
                continue
            w = placed.get(k)
            if w is None:
                bad.append(f"{k[:40]} isn't waiting to be sorted (it isn't in jiraSort.issues).")
            elif not (w.get("kind") == "notOurs" if dest[0] == "notOurs" else w.get(dest[0]) == dest[1]):
                bad.append(f"{k[:40]} is already on the plan somewhere else (jiraSort.placed).")
        epic = up(args.get("epic"))
        if epic and any(up(pile[k].get("epic")) != epic for k in keys if k in pile):
            bad.append(f"every key in an epic group must be one of {epic[:40]}'s stories.")
    if name in ("jira.toWorkstream", "jira.epicNew") and args.get("lane") not in lanes:
        bad.append(f"{str(args.get('lane'))[:40]} isn't a workstream in jiraSort.targets.")
    if name in ("jira.toInitiative", "jira.epicLink") and args.get("id") not in bars:
        bad.append(f"{str(args.get('id'))[:40]} isn't an initiative that takes Jira work (jiraSort.targets.initiatives).")
    if name == "jira.epicLink" and args.get("id") in bars:
        held = [up(e) for e in bars[args.get("id")].get("epics") or []]
        if up(args.get("epic")) not in held and len(held) >= 50:
            bad.append(f"{str(args.get('id'))[:40]} already has 50 epics, the most an initiative holds.")
    return bad


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
    problems = check_offline(folder, batch)
    if problems:
        raise Fail(1, "The batch has problems; nothing was sent.", {"lines": problems})
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
    ap.add_argument("--version", action="version", version=f"sightline-app.py for Sightline {PAGE_VERSION}" if PAGE_VERSION else "sightline-app.py (source copy, not stamped with a page version)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    after = argparse.ArgumentParser(add_help=False)          # --json works after the command too, as the guide writes it
    after.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help="print one JSON object")
    s = sub.add_parser("status", parents=[after], help="is a Sightline page answering for this folder?")
    s.add_argument("folder")
    s = sub.add_parser("check", parents=[after], help="check a batch against the context you read, offline; nothing is written")
    s.add_argument("folder"); s.add_argument("batch")
    s = sub.add_parser("send", parents=[after], help="check the heartbeat and context revision, then write the batch atomically")
    s.add_argument("folder"); s.add_argument("batch")
    s = sub.add_parser("wait", parents=[after], help="wait until every change in a batch has an outcome")
    s.add_argument("folder"); s.add_argument("batchId"); s.add_argument("--timeout", type=float, default=180)
    s = sub.add_parser("run", parents=[after], help="send, then wait")
    s.add_argument("folder"); s.add_argument("batch"); s.add_argument("--timeout", type=float, default=180)
    a = ap.parse_args(argv)
    folder = Path(a.folder)
    try:
        if not folder.is_dir():
            raise Fail(1, f"{a.folder} isn't a folder.")
        if a.cmd == "status":
            out = heartbeat(folder)
            msg = f"Sightline is {out.get('state')} (heard {out['ageSeconds']} seconds ago); changes {'wait for review' if out.get('autoApply') == 'review' else 'apply on their own'}; plan revision {out.get('planRevision')}."
        elif a.cmd == "check":
            try:
                batch = json.loads(Path(a.batch).read_text(encoding="utf-8"))
            except (OSError, ValueError) as e:
                raise Fail(1, f"Can't read the batch {Path(a.batch).name}: {e}")
            if not isinstance(batch, dict):
                raise Fail(1, "The batch must be a JSON object.")
            problems = check_offline(folder, batch)
            if problems:
                raise Fail(1, f"{len(problems)} problem{'' if len(problems) == 1 else 's'} in the batch.", {"lines": problems})
            out = {"checked": batch.get("batchId"), "changes": len(batch.get("changes") or [])}
            msg = f"The batch looks right: {out['changes']} change{'' if out['changes'] == 1 else 's'}. Sightline checks it again when it applies."
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
        print(json.dumps({"ok": True, "matchesPage": PAGE_VERSION, **out}) if a.json else msg)
        return 0
    except Fail as e:
        if a.json:
            print(json.dumps({"ok": False, "exit": e.code, "error": e.message, "matchesPage": PAGE_VERSION, **e.detail}))
        else:
            print(e.message, file=sys.stderr)
            for line in e.detail.get("lines", []) + e.detail.get("waiting", []):
                print("  " + line, file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
