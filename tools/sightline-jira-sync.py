#!/usr/bin/env python3
"""Sightline Jira sync (Jira Data Center).

Reads the Jira keys in a Sightline plan, asks Jira for each issue's status, assignee and due date,
and writes jira-status.json next to the plan. Sightline reads that file. The file never contains
your token.

With --jql or --filter it also runs a Jira search and writes the issues it finds to a separate file,
jira-issues.json, so Sightline can offer the ones that aren't in the plan yet. The search is yours: it
runs with your token, and anyone who can open jira-issues.json can read what it found. Use a search
your teammates are allowed to see.

Your personal access token (PAT) is kept in the operating system's credential store:
Windows Credential Manager on Windows, the login keychain on macOS. It is never written to disk
by this script, never printed, and never sent anywhere except your Jira server over HTTPS.

Standard library only (no pip installs), Python 3.9+.

    python sightline-jira-sync.py setup                     # once: Jira address + token
    python sightline-jira-sync.py sync  PLAN.json           # write jira-status.json beside it
    python sightline-jira-sync.py sync  PLAN.json --every 15   # keep syncing every 15 minutes
    python sightline-jira-sync.py sync  PLAN.json --filter 12345          # also write a saved filter's issues to jira-issues.json
    python sightline-jira-sync.py sync  PLAN.json --jql "project = ABC AND sprint in openSprints()"
    python sightline-jira-sync.py sync  PLAN.json --board 123     # also read the board's sprints
    python sightline-jira-sync.py fields                    # find Epic Link, Sprint, Story Points (setup does this too)
    python sightline-jira-sync.py inspect --board 123 --jql "project = ABC"   # print statuses, resolutions, sprints, sample issues
    python sightline-jira-sync.py sync  PLAN.json --board 123 --filter 12345 --save   # remember this plan's settings
    python sightline-jira-sync.py watch                     # keep every saved plan in sync
    python sightline-jira-sync.py install                   # your own copy, started when you sign in
    python sightline-jira-sync.py forget                    # remove the stored token

Security decisions (documented per ASVS V1):
- HTTPS only; certificate verification always on, using the OS trust store (corporate CAs work).
- The token lives only in the OS credential store and in memory for the request; it is not logged.
- Read-only: the script only makes GET requests (/rest/api/2/search, /field to find your server's custom fields,
  /myself to check the token, /rest/agile/1.0/board/N/sprint for --board). It never changes anything in Jira.
- Field ids (customfield_NNN) are found by field type, saved in the local config (no secrets), and checked
  against ^customfield_[0-9]+$ before they are put in a request.
- The search comes from the command line of the person running the script, never from the shared plan:
  a teammate who can edit the plan must not be able to point someone else's token at issues only they can see.
- A search returns at most --limit issues (default 500, at most 2000), fetched in pages.
- Jira responses are treated as untrusted: fields are type-checked, trimmed and length-capped
  before they are written, and Sightline renders them as text, never as HTML.
- Output is written atomically (temp file, then rename) so Sightline never reads a half file.
"""
from __future__ import annotations

import argparse
import shutil
import datetime as _dt
import getpass
import hashlib
import json
import os
import re
import secrets
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

APP = "Sightline Jira"
CONFIG_DIR = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~/.config"), "Sightline")
CONFIG_PATH = os.path.join(CONFIG_DIR, "jira.json")           # base URL only, no secrets
KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,19}-[1-9][0-9]{0,8}$")
BATCH = 50                                                     # keys per JQL query
MAX_PLAN_BYTES = 5 * 1024 * 1024
# The Sightline page this copy matches. build.sh stamps it into the copy it publishes beside the page; None means this
# runs from source, where nothing is stamped and nothing is compared.
PAGE_VERSION = None
CONTEXT_FILE = "sightline-assistant-view.json"
PLAN_SCHEMA = 2        # the plan format this script reads; must equal SCHEMA in the page (a test checks)
STATUS_FORMAT = 1      # the formats this script writes; the page refuses files newer than it knows (a test checks)
ISSUES_FORMAT = 2
TIMEOUT = 30
FIELDS = "summary,status,assignee,duedate,updated,resolution,issuetype,priority,parent,labels,fixVersions,created,resolutiondate,description"
DESC_MAX = 4000                    # a description, like a story in the plan
DESC_BUDGET = 1_000_000            # all descriptions in one file, so a plan of long descriptions can't outgrow the page's read limit
CUSTOM: dict[str, str] = {}                                    # epicLink / sprint / storyPoints / parentLink -> customfield_NNN, from `fields`
FIELD_ID_RE = re.compile(r"^customfield_[0-9]{1,9}$")
# Jira Data Center gives these fields a different customfield_NNN on every server, but the field *type* is the same
# everywhere, so that's what we look for. Story Points has no type of its own: it's a number field found by its name.
FIELD_TYPES = {
    "epicLink": "com.pyxis.greenhopper.jira:gh-epic-link",
    "sprint": "com.pyxis.greenhopper.jira:gh-sprint",
    "parentLink": "com.atlassian.jpo:jpo-custom-field-parent",
    "epicName": "com.pyxis.greenhopper.jira:gh-epic-label",     # only epics have one, whatever the admins named the type
}
POINT_NAMES = ("story points", "story point estimate")
PAGE = 100                                                     # issues per page when running a search
FILTER_ID_RE = re.compile(r"^[1-9][0-9]{0,11}$")
MAX_JQL = 2000
MAX_ANCESTORS = 500                                            # parents above the synced issues (features, initiatives...)
ANCESTOR_LEVELS = 6
MAX_ISSUES = 2000                                              # issues in one issues.json, across all its searches
SEARCH_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,29}$")
MAX_SEARCHES = 8


# ---------------------------------------------------------------- credential store
def _sq(v: str) -> str:
    """Quote one argument for `security -i`: double quotes, with backslash and quote escaped."""
    if "\n" in v or "\r" in v:
        raise SystemExit("That value contains a line break, which the keychain can't store safely.")
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'


class CredentialStore:
    """Stores one secret per Jira host in the OS credential store."""

    def __init__(self, host: str):
        self.target = f"{APP}: {host}"

    def save(self, secret: str) -> None:
        if sys.platform == "win32":
            _win_cred_write(self.target, secret)
        elif sys.platform == "darwin":
            # `security -w <secret>` would put the token in the process arguments, which other local processes can read.
            # `security -i` reads the command from stdin instead, so the token never appears in argv.
            cmd = "add-generic-password -U -a {} -s {} -w {}\n".format(_sq(getpass.getuser()), _sq(self.target), _sq(secret))
            subprocess.run(["security", "-i"], input=cmd, text=True, check=True, capture_output=True)
        else:
            raise SystemExit("This helper supports Windows and macOS credential stores only.")

    def load(self) -> str | None:
        if sys.platform == "win32":
            return _win_cred_read(self.target)
        if sys.platform == "darwin":
            r = subprocess.run(["security", "find-generic-password", "-a", getpass.getuser(), "-s", self.target, "-w"],
                               capture_output=True, text=True)
            return r.stdout.strip() or None if r.returncode == 0 else None
        return None

    def delete(self) -> bool:
        if sys.platform == "win32":
            return _win_cred_delete(self.target)
        if sys.platform == "darwin":
            return subprocess.run(["security", "delete-generic-password", "-a", getpass.getuser(), "-s", self.target],
                                  capture_output=True).returncode == 0
        return False


if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    class _CREDENTIAL(ctypes.Structure):
        _fields_ = [("Flags", wintypes.DWORD), ("Type", wintypes.DWORD), ("TargetName", wintypes.LPWSTR),
                    ("Comment", wintypes.LPWSTR), ("LastWritten", wintypes.FILETIME), ("CredentialBlobSize", wintypes.DWORD),
                    ("CredentialBlob", ctypes.POINTER(ctypes.c_char)), ("Persist", wintypes.DWORD),
                    ("AttributeCount", wintypes.DWORD), ("Attributes", ctypes.c_void_p), ("TargetAlias", wintypes.LPWSTR),
                    ("UserName", wintypes.LPWSTR)]

    _advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    _CRED_TYPE_GENERIC, _CRED_PERSIST_LOCAL_MACHINE = 1, 2

    def _win_cred_write(target: str, secret: str) -> None:
        blob = secret.encode("utf-16-le")
        buf = ctypes.create_string_buffer(blob, len(blob))
        cred = _CREDENTIAL(Type=_CRED_TYPE_GENERIC, TargetName=target, CredentialBlobSize=len(blob),
                           CredentialBlob=ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)),
                           Persist=_CRED_PERSIST_LOCAL_MACHINE, UserName=getpass.getuser())
        if not _advapi.CredWriteW(ctypes.byref(cred), 0):
            raise OSError(ctypes.get_last_error(), "Couldn't save the token to Windows Credential Manager")

    def _win_cred_read(target: str) -> str | None:
        p = ctypes.POINTER(_CREDENTIAL)()
        if not _advapi.CredReadW(target, _CRED_TYPE_GENERIC, 0, ctypes.byref(p)):
            return None
        try:
            c = p.contents
            return ctypes.string_at(c.CredentialBlob, c.CredentialBlobSize).decode("utf-16-le")
        finally:
            _advapi.CredFree(p)

    def _win_cred_delete(target: str) -> bool:
        return bool(_advapi.CredDeleteW(target, _CRED_TYPE_GENERIC, 0))


# ---------------------------------------------------------------- config
def load_config() -> dict:
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        return cfg if isinstance(cfg, dict) else {}
    except (OSError, ValueError):
        return {}


def servers(cfg: dict) -> dict:
    """{host: {"base", "fields"}}. An older single-server config ({"base", "fields"}) is moved in here."""
    sv = cfg.get("servers") if isinstance(cfg.get("servers"), dict) else {}
    if not sv and cfg.get("base"):
        host = urllib.parse.urlparse(str(cfg["base"])).hostname or ""
        if host:
            sv = {host: {"base": cfg["base"], "fields": cfg.get("fields") if isinstance(cfg.get("fields"), dict) else {}}}
            cfg["default"] = host
    cfg["servers"] = sv
    cfg.pop("base", None)
    cfg.pop("fields", None)
    return sv


def plan_key(plan: str) -> str:
    return os.path.normcase(os.path.abspath(plan))


def saved_plan(cfg: dict, plan: str) -> dict:
    sp = cfg.get("plans") if isinstance(cfg.get("plans"), dict) else {}
    v = sp.get(plan_key(plan))
    return v if isinstance(v, dict) else {}


def pick_server(cfg: dict, jira: str | None = None, plan: dict | None = None) -> dict:
    """Which Jira: --jira, else the plan's saved one, else the only one, else the default."""
    sv = servers(cfg)
    if jira:
        host = urllib.parse.urlparse(normalize_base(jira)).hostname
        if host not in sv:
            raise SystemExit(f"No Jira set up at {host}. Run: setup --jira {normalize_base(jira)}")
        return sv[host]
    want = (plan or {}).get("jira") or (next(iter(sv)) if len(sv) == 1 else cfg.get("default"))
    if not want or want not in sv:
        raise SystemExit("Run `setup` first." if not sv else f"Which Jira? Add --jira with one of: {', '.join('https://' + h for h in sv)}")
    return sv[want]


def use_server(entry: dict) -> tuple[str, str]:
    """(base, token) for a server, with its custom fields loaded (they differ from server to server)."""
    base = normalize_base(entry["base"])
    token = CredentialStore(urllib.parse.urlparse(base).hostname).load()
    if not token:
        raise SystemExit(f"No stored token for {urllib.parse.urlparse(base).hostname}. Run: setup --jira {base}")
    saved = entry.get("fields") if isinstance(entry.get("fields"), dict) else {}
    CUSTOM.clear()
    CUSTOM.update({k: v for k, v in saved.items() if k in FIELD_LABELS and isinstance(v, str) and FIELD_ID_RE.match(v)})
    return base, token


def save_config(cfg: dict) -> None:
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def normalize_base(url: str) -> str:
    url = url.strip().rstrip("/")
    for suffix in ("/browse", "/secure/Dashboard.jspa"):
        if url.lower().endswith(suffix.lower()):
            url = url[: -len(suffix)]
    p = urllib.parse.urlparse(url)
    if p.scheme != "https" or not p.hostname:
        raise SystemExit("The Jira address must start with https:// (for example https://jira.yourcompany.com).")
    if p.username or p.password or p.query or p.fragment:
        raise SystemExit("Enter just the Jira address, with no user name, ? or #.")
    return url


# ---------------------------------------------------------------- plan + output
def plan_epics(plan: dict) -> list[str]:
    """Epic keys linked to initiatives (bar.epics). Their child issues are counted, not listed."""
    keys = set()
    for bar in plan.get("bars", []) if isinstance(plan.get("bars"), list) else []:
        for k in bar.get("epics", []) if isinstance(bar, dict) and isinstance(bar.get("epics"), list) else []:
            k = str(k).strip().upper()
            if KEY_RE.match(k):
                keys.add(k)
    return sorted(keys)


def parked_epics(plan: dict) -> set[str]:
    """Epics whose initiative is parked: still counted, but their stories aren't listed (nobody is looking at them)."""
    out = set()
    for bar in plan.get("bars", []) if isinstance(plan.get("bars"), list) else []:
        if isinstance(bar, dict) and bar.get("parked"):
            for k in [*(bar.get("epics") if isinstance(bar.get("epics"), list) else []), bar.get("jira", "")]:
                if KEY_RE.match(str(k).strip().upper()):
                    out.add(str(k).strip().upper())
    return out


MAX_PLAN_KEYS = 2000   # Jira items one plan can have fetched, in all: placed ones first, then ones it only refers to


def check_plan_format(plan) -> None:
    """Refuse a plan saved in a newer format than this script reads, rather than misread it and fetch the wrong issues."""
    meta = plan.get("meta") if isinstance(plan, dict) else None
    schema = meta.get("schema") if isinstance(meta, dict) else None
    if isinstance(schema, int) and schema > PLAN_SCHEMA:
        raise SystemExit(f"This plan was saved in plan format {schema}; this sync script reads format {PLAN_SCHEMA}. "
                         "Get the sync script that came with your copy of Sightline.")


def plan_keys(plan: dict, total: list | None = None) -> list[str]:
    """The Jira keys the plan links, at most MAX_PLAN_KEYS; `total`, if given, gets how many it links before the cap."""
    keys = set(plan_epics(plan))
    for bar in plan.get("bars", []) if isinstance(plan.get("bars"), list) else []:
        if not isinstance(bar, dict):
            continue
        for item in [bar, *[t for t in bar.get("tasks", []) if isinstance(t, dict)]]:
            k = str(item.get("jira", "")).strip().upper()
            if KEY_RE.match(k):
                keys.add(k)
    # Jira work linked to deliverables: fetched like placed work, so linked epics get their stories counted
    for dv in plan.get("deliverables", []) if isinstance(plan.get("deliverables"), list) else []:
        for k in dv.get("jira", []) if isinstance(dv, dict) and isinstance(dv.get("jira"), list) else []:
            k = str(k).strip().upper()
            if KEY_RE.match(k):
                keys.add(k)
    # Jira items the plan refers to without placing them: notes on them, dependencies on them, and tags kept by key
    extra = set()
    for bar in plan.get("bars", []) if isinstance(plan.get("bars"), list) else []:
        for item in [bar, *[t for t in bar.get("tasks", []) if isinstance(t, dict)]] if isinstance(bar, dict) else []:
            for k in item.get("jiraDeps", []) if isinstance(item.get("jiraDeps"), list) else []:
                extra.add(str(k).strip().upper())
    for n in plan.get("notes", []) if isinstance(plan.get("notes"), list) else []:
        on = str(n.get("on", "")) if isinstance(n, dict) else ""
        if on.startswith("jira:"):
            extra.add(on[5:].strip().upper())
    for x in plan.get("jiraItems", []) if isinstance(plan.get("jiraItems"), list) else []:
        if isinstance(x, dict):
            extra.add(str(x.get("id", "")).strip().upper())
    for x in plan.get("proposals", []) if isinstance(plan.get("proposals"), list) else []:
        if isinstance(x, dict):
            extra.add(str(x.get("key", "")).strip().upper())
    placed = sorted(k for k in keys if KEY_RE.match(k))
    refs = sorted(k for k in extra if KEY_RE.match(k) and k not in keys)
    if total is not None:
        total.append(len(placed) + len(refs))
    return sorted((placed + refs)[:MAX_PLAN_KEYS])


def fields_param() -> str:
    return ",".join([FIELDS, *[v for v in CUSTOM.values() if FIELD_ID_RE.match(v)]])


def discover_fields(fields: list) -> dict:
    """Pick our custom fields out of GET /rest/api/2/field. Returns {role: customfield_NNN} for the ones found."""
    found, points = {}, []
    for f in fields if isinstance(fields, list) else []:
        if not isinstance(f, dict):
            continue
        fid, sch = clean(f.get("id"), 40), f.get("schema") if isinstance(f.get("schema"), dict) else {}
        if not FIELD_ID_RE.match(fid):
            continue
        for role, typ in FIELD_TYPES.items():
            if sch.get("custom") == typ and role not in found:
                found[role] = fid
        if clean(f.get("name"), 60).lower() in POINT_NAMES and sch.get("type") == "number":
            points.append((POINT_NAMES.index(clean(f.get("name"), 60).lower()), fid))
    if points:
        found["storyPoints"] = sorted(points)[0][1]        # "Story Points" before "Story point estimate"
    return found


def _day(v) -> str:
    """The date part of a Jira timestamp, or "" (Jira writes <null> for a sprint with no dates)."""
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", clean(v, 40))
    return m.group(1) if m else ""


def _sprint_info(v) -> dict:
    """The sprint an issue is in: the active one, else the latest. Jira DC sends objects or Sprint@...[k=v,...] strings."""
    parsed = []
    for x in v if isinstance(v, list) else []:
        if isinstance(x, dict):
            d = {"id": x.get("id"), "state": x.get("state"), "name": x.get("name"), "start": x.get("startDate"), "end": x.get("endDate")}
        elif isinstance(x, str):
            f = dict(re.findall(r"[,\[](id|state|name|startDate|endDate)=([^,\]]*)", x))
            d = {"id": f.get("id"), "state": f.get("state"), "name": f.get("name"), "start": f.get("startDate"), "end": f.get("endDate")}
        else:
            continue
        sid = int(d["id"]) if str(d["id"] or "").isdigit() and 0 < int(d["id"]) < 10**9 else 0
        name = clean(d["name"], 80) if isinstance(d["name"], str) else ""
        if name:
            parsed.append({"id": sid, "state": clean(d["state"], 20).lower() if isinstance(d["state"], str) else "", "name": name,
                           "start": _day(d["start"]), "end": _day(d["end"])})
    active = [p for p in parsed if p["state"] == "active"]
    return (active or parsed or [{}])[-1]


def _sprint_of(v) -> str:
    return _sprint_info(v).get("name", "")


def _key_of(v) -> str:
    """A linked issue's key from Epic Link (a string), Parent Link ({data: {key}}), or parent ({key})."""
    if isinstance(v, dict):
        data = v.get("data") if isinstance(v.get("data"), dict) else {}
        v = v.get("key") or data.get("key") or ""
    k = clean(v, 40).upper()
    return k if KEY_RE.match(k) else ""


def clean(v, n=200) -> str:
    return v.strip()[:n] if isinstance(v, str) else ""


CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_desc(v) -> str:
    """A description as plain text: Jira's wiki markup kept as written (the page converts it), control characters out."""
    return CTRL_RE.sub("", v).strip()[:DESC_MAX] if isinstance(v, str) else ""


def own_keys(plan: dict) -> set:
    """Keys an initiative or task links as itself: the only issues whose description the page shows."""
    out = set()
    for bar in plan.get("bars", []) if isinstance(plan.get("bars"), list) else []:
        for item in [bar, *[t for t in bar.get("tasks", []) if isinstance(t, dict)]] if isinstance(bar, dict) else []:
            k = str(item.get("jira", "")).strip().upper()
            if KEY_RE.match(k):
                out.add(k)
    return out


def keep_descriptions(issues: dict, keys: set) -> None:
    """Drop descriptions except for `keys`, and stop at DESC_BUDGET characters in all (key order, so it's stable)."""
    room = DESC_BUDGET
    for k in sorted(issues):
        v = issues[k]
        if not isinstance(v, dict) or "description" not in v:
            continue
        if k not in keys or len(v["description"]) > room:
            v.pop("description")
            continue
        room -= len(v["description"])


USER_RE = re.compile(r"^[A-Za-z0-9._+-]{1,100}$")
EMAILISH = re.compile(r"[^\s@]+@[^\s@]+")


def display_name(who: dict, username: str) -> str:
    """A person's name for the shared files. Some accounts show an email address as their name; that never goes out."""
    n = clean(who.get("displayName"), 80)
    return (username or "Jira user") if EMAILISH.search(n) else n


def user_id(who: dict) -> tuple[str, str]:
    """(key, username) for linking Sightline people to Jira users. The key never changes on Data Center, so
    Sightline matches on it. Some servers use email addresses as user names; an email is personal data and the
    status files sit in a shared folder, so an email-like key is replaced by a one-way hash (still matchable)
    and an email-like username is left out."""
    key, name = clean(who.get("key"), 200), clean(who.get("name"), 200)
    if key and not USER_RE.match(key):
        key = "h-" + hashlib.sha256(key.lower().encode("utf-8")).hexdigest()[:24]
    return key, name if USER_RE.match(name) else ""


def shape_issue(raw: dict, base: str) -> tuple[str, dict] | None:
    """Keep only the fields Sightline shows, type-checked and length-capped (Jira data is untrusted)."""
    key = clean(raw.get("key"), 40).upper()
    if not KEY_RE.match(key):
        return None
    f = raw.get("fields") if isinstance(raw.get("fields"), dict) else {}
    st = f.get("status") if isinstance(f.get("status"), dict) else {}
    cat = st.get("statusCategory") if isinstance(st.get("statusCategory"), dict) else {}
    who = f.get("assignee") if isinstance(f.get("assignee"), dict) else {}
    due = clean(f.get("duedate"), 10)
    akey, aname = user_id(who) if who else ("", "")
    typ = f.get("issuetype") if isinstance(f.get("issuetype"), dict) else {}
    pts = f.get(CUSTOM.get("storyPoints", ""))
    pts = pts if isinstance(pts, (int, float)) and not isinstance(pts, bool) and 0 <= pts <= 1000 else None
    pri = f.get("priority") if isinstance(f.get("priority"), dict) else {}
    return key, {
        "jid": clean(raw.get("id"), 20) if re.match(r"^[0-9]{1,18}$", clean(raw.get("id"), 20)) else "",
        "summary": clean(f.get("summary"), 300),
        **({"description": clean_desc(f.get("description"))} if "description" in f else {}),   # "" is an empty one; absent, not fetched
        "status": clean(st.get("name"), 60),
        "category": {"new": "todo", "indeterminate": "inprogress", "done": "done"}.get(clean(cat.get("key"), 20), ""),
        "assignee": display_name(who, aname) if who else "",
        "assigneeKey": akey,
        "assigneeUser": aname,
        "due": due if re.match(r"^\d{4}-\d{2}-\d{2}$", due) else "",
        "updated": clean(f.get("updated"), 40),
        "created": clean(f.get("created"), 40),
        "resolvedAt": clean(f.get("resolutiondate"), 40),
        "resolved": bool(f.get("resolution")),
        "resolution": clean((f.get("resolution") or {}).get("name"), 60) if isinstance(f.get("resolution"), dict) else "",
        "type": clean(typ.get("name"), 40),
        "epic": _key_of(f.get(CUSTOM.get("epicLink", ""))),
        "parent": _key_of(f.get("parent")) or _key_of(f.get(CUSTOM.get("parentLink", ""))),
        "sprint": (spi := _sprint_info(f.get(CUSTOM.get("sprint", "")))).get("name", ""),
        "sprintId": spi.get("id", 0),
        "sprintStart": spi.get("start", ""),
        "sprintEnd": spi.get("end", ""),
        "sprintState": spi.get("state", ""),
        "points": pts,
        "isEpic": bool(clean(f.get(CUSTOM.get("epicName", "")), 200)) or clean(typ.get("name"), 40).lower() == "epic",
        "priority": clean(pri.get("name"), 40),
        "labels": [clean(x, 60) for x in (f.get("labels") if isinstance(f.get("labels"), list) else []) if isinstance(x, str) and x.strip()][:20],
        "releases": [{"id": clean(v.get("id"), 20), "name": clean(v.get("name"), 80)} for v in (f.get("fixVersions") if isinstance(f.get("fixVersions"), list) else [])
                     if isinstance(v, dict) and re.match(r"^[0-9]{1,18}$", clean(v.get("id"), 20))][:10],
        "url": f"{base}/browse/{urllib.parse.quote(key)}",
    }


def write_atomic(path: str, data: dict) -> None:
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(prefix="." + os.path.splitext(os.path.basename(path))[0] + "-", suffix=".json", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------- Jira
class _RefuseRedirect(urllib.request.HTTPRedirectHandler):
    """urllib copies request headers - including Authorization - onto a redirect, even to another host or to http://.
    Jira's REST calls have no reason to redirect, so refuse instead of following."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, f"redirected to {newurl}", headers, fp)


def jira_opener():
    return urllib.request.build_opener(_RefuseRedirect(), urllib.request.HTTPSHandler(context=ssl_context()))


def auth_request(url: str, token: str) -> urllib.request.Request:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    req.add_unredirected_header("Authorization", f"Bearer {token}")   # belt and braces: never copied onto a redirect
    return req


def redirect_exit(e: urllib.error.HTTPError):
    return SystemExit(f"Jira answered with a redirect ({e.code}), so the token was not sent on. "
                      "Check the Jira address in `setup` - use the exact https:// address you see in the browser.")


def ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()        # verifies certificates; on Windows this reads the system (corporate) trust store
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    return ctx


def jira_search(base: str, token: str, keys: list[str], opener=None) -> dict:
    """Returns {KEY: issue} for the keys Jira knows. Read-only GET requests."""
    opener = opener or jira_opener()
    found = {}
    for i in range(0, len(keys), BATCH):
        chunk = keys[i:i + BATCH]
        jql = "key in (" + ",".join(chunk) + ")"            # keys are validated against KEY_RE, so no JQL injection
        q = urllib.parse.urlencode({"jql": jql, "fields": fields_param(), "maxResults": str(len(chunk)), "validateQuery": "false"})
        req = auth_request(f"{base}/rest/api/2/search?{q}", token)
        try:
            with opener.open(req, timeout=TIMEOUT) as r:
                body = json.loads(r.read(10 * 1024 * 1024).decode("utf-8"))
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                raise redirect_exit(e)
            if e.code in (401, 403):
                raise SystemExit("Jira refused the token (401/403). It may have expired: run `setup` again with a new personal access token.")
            if e.code == 400:                          # an unknown key fails the whole query: retry one by one
                for k in chunk:
                    found.update(jira_search(base, token, [k], opener) if len(chunk) > 1 else {})
                continue
            raise SystemExit(f"Jira answered with an error ({e.code}). Try again later.")
        except urllib.error.URLError as e:
            raise SystemExit(f"Couldn't reach Jira: {e.reason}")
        for raw in body.get("issues", []) if isinstance(body, dict) else []:
            shaped = shape_issue(raw, base) if isinstance(raw, dict) else None
            if shaped:
                found[shaped[0]] = shaped[1]
    return found


def jql_for(jql: str | None, filter_id: str | None) -> str:
    """The search to run, from --jql or --filter. Checked here, then Jira checks the JQL itself."""
    if filter_id is not None:
        f = str(filter_id).strip()
        if not FILTER_ID_RE.match(f):
            raise SystemExit("--filter takes the filter's number, the one in its address: .../issues/?filter=12345")
        return f"filter = {f}"
    q = " ".join(str(jql or "").split())                # one line: Jira ignores the line breaks anyway
    if not q:
        raise SystemExit("--jql needs a search, for example: --jql \"project = ABC AND resolution = Unresolved\"")
    if len(q) > MAX_JQL:
        raise SystemExit(f"That search is longer than {MAX_JQL} characters.")
    return q


def parse_searches(values: list[str] | None) -> list[dict]:
    """--search "Name=JQL", repeatable. Names are short labels for the Jira window; the JQL is checked like --jql."""
    out = []
    for v in values or []:
        name, sep, q = str(v).partition("=")
        name = " ".join(name.split())
        if not sep or not SEARCH_NAME_RE.match(name):
            raise SystemExit(f'--search takes "Name=JQL", with a short name (letters, digits, spaces; up to 30), for example "Epics=project = ABC". Got: {str(v)[:60]}')
        if any(x["name"].lower() == name.lower() for x in out):
            raise SystemExit(f"Two searches are both called {name}.")
        out.append({"name": name, "jql": jql_for(q, None)})
    if len(out) > MAX_SEARCHES:
        raise SystemExit(f"At most {MAX_SEARCHES} searches per plan.")
    return out


def jira_error_text(e: urllib.error.HTTPError) -> str:
    """Jira's own reason for a 400, e.g. an unknown field in the JQL. Untrusted: one line, capped."""
    try:
        body = json.loads(e.read(64 * 1024).decode("utf-8"))
        msgs = body.get("errorMessages") if isinstance(body, dict) else None
        if isinstance(msgs, list) and msgs and isinstance(msgs[0], str):
            return " ".join(msgs[0].split())[:300]
    except (ValueError, OSError, UnicodeDecodeError):
        pass
    return ""


def jira_filter(base: str, token: str, jql: str, limit: int, opener=None) -> tuple[dict, list[str], int]:
    """Runs one search. Returns ({KEY: issue}, keys in Jira's order, total Jira reported). Read-only GET requests."""
    opener = opener or jira_opener()
    found, order, total, start = {}, [], 0, 0
    while start < limit:
        q = urllib.parse.urlencode({"jql": jql, "fields": fields_param(), "startAt": str(start), "maxResults": str(min(PAGE, limit - start))})
        req = auth_request(f"{base}/rest/api/2/search?{q}", token)
        try:
            with opener.open(req, timeout=TIMEOUT) as r:
                body = json.loads(r.read(10 * 1024 * 1024).decode("utf-8"))
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                raise redirect_exit(e)
            if e.code in (401, 403):
                raise SystemExit("Jira refused the token (401/403). It may have expired: run `setup` again with a new personal access token.")
            if e.code == 400:
                why = jira_error_text(e)
                raise SystemExit("Jira couldn't run that search" + (f": {why}" if why else ".") + " Check it in Jira's issue search first.")
            raise SystemExit(f"Jira answered with an error ({e.code}). Try again later.")
        except urllib.error.URLError as e:
            raise SystemExit(f"Couldn't reach Jira: {e.reason}")
        if not isinstance(body, dict):
            break
        total = body.get("total") if isinstance(body.get("total"), int) else total
        raw = body.get("issues") if isinstance(body.get("issues"), list) else []
        for r in raw:
            shaped = shape_issue(r, base) if isinstance(r, dict) else None
            if shaped and shaped[0] not in found:
                found[shaped[0]] = shaped[1]
                order.append(shaped[0])
        start += len(raw)
        if not raw or start >= total:
            break
    return found, order, total


LEAF_TYPES = re.compile(r"^(story|bug|task|sub-?task|defect|spike|improvement)$", re.I)   # types that don't hold other issues
MAX_LEVELS = 3                                                 # levels below an epic followed (feature, then its stories, ...)
ROLLUP_CAP = 5000                                              # child issues counted per sync, across all epics
STORY_CAP = 3000                                               # of those, how many are listed one by one (the page shows them)


def state_part(v: str) -> str:
    """One part of a status|resolution|category key, with | and % escaped so a status named "Done | Verified" stays one part."""
    return str(v or "").replace("%", "%25").replace("|", "%7C")


def rollup_jql(epics: list[str]) -> str:
    """Children of these epics, by whichever links this server has. Keys are validated, ids checked: no injection."""
    ks = ",".join(k for k in epics if KEY_RE.match(k))
    parts = [f"cf[{CUSTOM[r][len('customfield_'):]}] in ({ks})" for r in ("epicLink", "parentLink") if FIELD_ID_RE.match(CUSTOM.get(r, ""))]
    return " OR ".join(parts + [f"parent in ({ks})"])


ROLL_SUMS = ("total", "todo", "inprogress", "done", "unknown", "points", "pointsDone", "unestimated")


def jira_ancestors(base: str, token: str, known: dict) -> dict:
    """The parents above what the sync already has, a few levels up: Parent Link or parent (a feature, an initiative,
    an epic above an epic), so the page can nest its rows by epic to the top. Only what the tree needs is kept, and
    they're written apart from the issues, so a parent never shows up as work to sort."""
    got: dict = {}
    ups = lambda vs: {p for v in vs for p in (v.get("parent"), v.get("epic")) if isinstance(p, str) and KEY_RE.match(p)}
    frontier = ups(known.values())
    for _ in range(ANCESTOR_LEVELS):
        want = sorted(k for k in frontier if k not in known and k not in got)[:MAX_ANCESTORS - len(got)]
        if not want:
            break
        found = jira_search(base, token, want)
        for k, v in found.items():
            got[k] = {f: v[f] for f in ("summary", "status", "category", "type", "isEpic", "parent", "epic") if f in v}
        frontier = ups(found.values())
    return got


def fold_nested(roll: dict, epic_issues: dict) -> None:
    """An epic under another epic (a feature-level epic, say) adds its work to the top one, so every count rolls up to
    the highest level. The nested epic keeps its own count too, for when it's placed on its own. Loops are ignored."""
    def top_of(k: str) -> str:
        cur, seen = k, {k}
        for _ in range(8):
            j = epic_issues.get(cur) or {}
            up = next((p for p in (j.get("parent"), j.get("epic")) if p and p in roll), "")
            if not up:
                break
            if up in seen:
                return ""
            seen.add(up)
            cur = up
        return "" if cur == k else cur
    own = {k: json.loads(json.dumps(v)) for k, v in roll.items()}
    for k, t in ((k, top_of(k)) for k in list(roll)):
        if not t:
            continue
        a, b = roll[t], own[k]
        for f in ROLL_SUMS:
            a[f] += b[f]
        for sk, (n, pts) in b["byState"].items():
            if len(a["byState"]) < 200 or sk in a["byState"]:
                x = a["byState"].setdefault(sk, [0, 0.0])
                x[0] += n
                x[1] += pts
        if b["sprintStart"]:
            a["sprintStart"] = min(a["sprintStart"] or b["sprintStart"], b["sprintStart"])
            a["sprintEnd"] = max(a["sprintEnd"], b["sprintEnd"])
        for lst in ("children", "sprintKids"):
            if lst in a:
                a[lst].extend(c for c in b.get("children", []) + b.get("sprintKids", []) if c not in a[lst])
            elif b.get(lst) and lst == "sprintKids":
                a[lst] = list(b[lst])
        if b.get("childrenCut"):
            a["childrenCut"] = True
        a.setdefault("nested", []).append(k)


def jira_rollups(base: str, token: str, epics: list[str], opener=None, stories: dict | None = None, listed: set | None = None) -> tuple[dict, bool]:
    """{EPIC: counts} for each epic's child issues: by status category, story points, and how many aren't estimated.
    Only epics Jira already confirmed exist are asked about, since one unknown key fails the whole search.
    With `stories`, the children of the `listed` epics (default: all) are also kept one by one (key -> issue), and each
    of those epics gets `children`, so the page can show its stories; past STORY_CAP they're counted only."""
    roll = {k: {"total": 0, "todo": 0, "inprogress": 0, "done": 0, "unknown": 0, "points": 0.0, "pointsDone": 0.0, "unestimated": 0,
                "sprintStart": "", "sprintEnd": "", "byState": {}} for k in epics}
    if stories is not None:
        for k in epics:
            if listed is None or k in listed:
                roll[k]["children"], roll[k]["childrenCut"] = [], False
    counted, truncated, owned = 0, False, set()                   # a story linked to two epics counts once, under the first
    top, found_all = {}, {}                                        # each counted issue -> the epic it rolls up to

    def tally(epic: str, k: str, j: dict, sign: int = 1) -> None:
        r = roll[epic]
        r["total"] += sign
        r[j["category"] or "unknown"] += sign       # a status with no category isn't assumed to be To Do
        sk = "|".join(state_part(x) for x in (j["status"], j.get("resolution", ""), j["category"]))   # the page maps these with the team's status map
        if len(r["byState"]) < 200 or sk in r["byState"]:
            bs = r["byState"].setdefault(sk, [0, 0.0])
            bs[0] += sign
            bs[1] += sign * (j["points"] if isinstance(j.get("points"), (int, float)) else 0)
            if bs[0] <= 0:
                del r["byState"][sk]
        if isinstance(j.get("points"), (int, float)):
            r["points"] += sign * j["points"]
            if j["category"] == "done":
                r["pointsDone"] += sign * j["points"]
        else:
            r["unestimated"] += sign
        if sign > 0 and j.get("sprintStart") and j.get("sprintEnd"):
            r["sprintStart"] = min(r["sprintStart"] or j["sprintStart"], j["sprintStart"])
            r["sprintEnd"] = max(r["sprintEnd"], j["sprintEnd"])

    listed_epics = set(epics)                   # an epic that was asked about keeps its own count; fold_nested() rolls it up

    def take(epic: str, k: str, j: dict) -> None:
        owned.add(k)
        top[k], found_all[k] = epic, j
        r = roll[epic]
        if "children" in r:
            if len(stories) < STORY_CAP or k in stories:
                stories.setdefault(k, j)
                r["children"].append(k)
            else:
                r["childrenCut"] = True
        elif j.get("sprintState") in ("active", "future") and (len(stories) < STORY_CAP or k in stories):
            stories.setdefault(k, j)                 # an epic not on the board yet: its sprint stories, so the page can offer it
            r.setdefault("sprintKids", []).append(k)
        tally(epic, k, j)

    for i in range(0, len(epics), BATCH):
        chunk = epics[i:i + BATCH]
        if counted >= ROLLUP_CAP:
            truncated = True
            break
        found, order, total = jira_filter(base, token, rollup_jql(chunk), ROLLUP_CAP - counted, opener)
        truncated = truncated or total > len(order)
        want = set(chunk)
        for k in order:
            j = found[k]
            epic = next((e for e in (j.get("epic"), j.get("parent")) if e in want), "")
            if not epic or k in owned or k in listed_epics:
                continue
            take(epic, k, j)
            counted += 1
    # Levels in between (a feature under an epic, its stories under it): everything rolls up to the highest level, the
    # epic. A child that turns out to hold others is a container, not work, so it leaves the counts and the story list.
    def holds(j: dict) -> bool:                   # a known type that isn't a leaf (a feature, say) may hold issues
        t = j.get("type", "")
        return bool(t) and not LEAF_TYPES.match(t)

    containers: set = set()
    level = [k for k in top if holds(found_all[k])]
    for _depth in range(MAX_LEVELS):
        if not level or counted >= ROLLUP_CAP:
            truncated = truncated or bool(level)
            break
        nxt, holders = [], set()
        for i in range(0, len(level), BATCH):
            chunk = level[i:i + BATCH]
            if counted >= ROLLUP_CAP:
                truncated = True
                break
            found, order, total = jira_filter(base, token, rollup_jql(chunk), ROLLUP_CAP - counted, opener)
            truncated = truncated or total > len(order)
            want = set(chunk)
            for k in order:
                j = found[k]
                par = next((e for e in (j.get("epic"), j.get("parent")) if e in want), "")
                if not par or k in listed_epics:
                    continue
                holders.add(par)              # it holds something, even when that something was already counted elsewhere
                if k in owned:
                    continue
                take(top[par], k, j)
                counted += 1
                if holds(j):
                    nxt.append(k)
        for c in holders:
            e = top[c]
            tally(e, c, found_all[c], -1)
            containers.add(c)
            r = roll[e]
            for lst in ("children", "sprintKids"):
                if c in r.get(lst, []):
                    r[lst].remove(c)
            stories.pop(c, None)                  # a container isn't a story: give its slot back
        level = nxt
    # Sprint span from the work that's left, now that containers are out.
    for e, r in roll.items():
        leaves = [found_all[k] for k, t in top.items() if t == e and k not in containers]
        starts = [j["sprintStart"] for j in leaves if j.get("sprintStart") and j.get("sprintEnd")]
        ends = [j["sprintEnd"] for j in leaves if j.get("sprintStart") and j.get("sprintEnd")]
        r["sprintStart"], r["sprintEnd"] = (min(starts), max(ends)) if starts else ("", "")
    return roll, truncated


BOARD_RE = re.compile(r"^[1-9][0-9]{0,9}$")
MAX_SPRINTS = 500


PROJECT_RE = re.compile(r"^([A-Z][A-Z0-9_]{0,19})-[0-9]+$")
MAX_RELEASE_PROJECTS, MAX_RELEASES = 10, 300
RELEASE_TTL = 6 * 3600                                         # seconds between rereading the projects' releases


def project_releases(base: str, token: str, keys, opener=None) -> tuple[list, list]:
    """The releases (Jira "versions") of the projects these issues belong to, with Jira's own dates. Read-only GETs.
    A project we can't read is skipped and named, never fatal: releases are extra, the sync's job is the issues."""
    opener = opener or jira_opener()
    counts: dict = {}
    for k in keys:
        m = PROJECT_RE.match(str(k))
        if m:
            counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    projects = sorted(counts, key=lambda p: (-counts[p], p))[:MAX_RELEASE_PROJECTS]
    out, skipped = [], []
    for proj in projects:
        if len(out) >= MAX_RELEASES:
            break
        try:
            with opener.open(auth_request(f"{base}/rest/api/2/project/{urllib.parse.quote(proj)}/versions", token), timeout=TIMEOUT) as r:
                vals = json.loads(r.read(5 * 1024 * 1024).decode("utf-8"))
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                raise redirect_exit(e)
            skipped.append(proj)
            continue
        except (urllib.error.URLError, ValueError):
            skipped.append(proj)
            continue
        for v in vals if isinstance(vals, list) else []:
            if len(out) >= MAX_RELEASES:
                break
            vid = clean(v.get("id"), 20) if isinstance(v, dict) else ""
            if not re.match(r"^[0-9]{1,18}$", vid) or v.get("archived") is True:
                continue
            out.append({"id": vid, "name": clean(v.get("name"), 80), "project": proj, "date": _day(v.get("releaseDate")), "start": _day(v.get("startDate")),
                        "released": v.get("released") is True, "description": clean(v.get("description"), 300)})
    return out, skipped


MAX_BURN_DAYS, MAX_BURN_SPRINTS = 40, 6
MAX_COMMENT_KEYS = 300
MAX_DEV, DEV_TTL, DEV_TTL_DONE, DEV_BUDGET = 200, 1800, 6 * 3600, 120      # issues whose pull requests are read per sync, how long a read is reused, and a time limit for the lot (seconds)


def _https(u: str) -> str:
    u = clean(u, 400)
    return u if re.match(r"^https://[^\s\"'<>]+$", u) else ""


PR_DRAFT_TITLE = re.compile(r"^\s*[\[(]?\s*(draft|wip)\s*[\])]?\s*[:\-]?\s", re.I)     # "Draft: …", "[WIP] …"
PR_REPO_URL = re.compile(r"/projects/([^/]+)/repos/([^/]+)/pull-requests/", re.I)


def pr_repo(p: dict) -> str:
    """The pull request's repository, "PROJECT/repo" where known: Jira's field when it sends one, else the target (or
    source) repository, else read from the PR's Bitbucket address."""
    def nm(x):
        return clean(x.get("name") if isinstance(x, dict) else "", 100)
    name = clean(p.get("repositoryName"), 100)
    for side in ("destination", "source"):
        if not name and isinstance(p.get(side), dict):
            name = nm(p[side].get("repository"))
    m = PR_REPO_URL.search(str(p.get("url") or ""))
    if m:
        proj, repo = urllib.parse.unquote(m.group(1)), urllib.parse.unquote(m.group(2))
        return clean(f"{proj}/{name or repo}", 100)
    return name


def dev_status(base: str, token: str, items: list, prev: dict, now: str, opener=None, done: set | None = None) -> dict:
    """{KEY: {prs: [...], branches: n, at}} from Jira's development panel (Bitbucket linked to Jira), read with the
    same token: no Bitbucket token needed. Only the active sprint's open work; a read under DEV_TTL old is reused. A
    Jira without the panel answers 404 once and nothing more is asked."""
    opener = opener or jira_opener()
    out, t_now, t0 = {}, _dt.datetime.fromisoformat(now), time.monotonic()
    for key, jid in items[:MAX_DEV]:
        if time.monotonic() - t0 > DEV_BUDGET:                 # out of time: keep what we had, even if old; skip the rest (counted in devCover)
            if isinstance(prev, dict) and isinstance(prev.get(key), dict):
                out[key] = prev[key]
            continue
        old = prev.get(key) if isinstance(prev, dict) else None
        if isinstance(old, dict) and old.get("at"):
            try:
                if (t_now - _dt.datetime.fromisoformat(old["at"])).total_seconds() < (DEV_TTL_DONE if key in (done or ()) else DEV_TTL):   # a done issue's pull requests rarely change
                    out[key] = old
                    continue
            except ValueError:
                pass
        q = urllib.parse.urlencode({"issueId": jid, "applicationType": "stash", "dataType": "pullrequest"})
        try:
            with opener.open(auth_request(f"{base}/rest/dev-status/latest/issue/detail?{q}", token), timeout=TIMEOUT) as r:
                body = json.loads(r.read(5 * 1024 * 1024).decode("utf-8"))
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                raise redirect_exit(e)
            if e.code in (400, 404):
                break                                          # this Jira has no development panel: stop asking
            continue
        except (urllib.error.URLError, ValueError):
            continue
        prs, branches = [], 0
        for d in (body.get("detail") or []) if isinstance(body, dict) else []:
            if not isinstance(d, dict):
                continue
            branches += len(d.get("branches") or []) if isinstance(d.get("branches"), list) else 0
            for p in d.get("pullRequests") or []:
                if not isinstance(p, dict) or len(prs) >= 20:
                    continue
                revs = [x for x in (p.get("reviewers") or []) if isinstance(x, dict)]
                st = clean(p.get("status"), 20).upper()
                draft = st == "DRAFT" or p.get("draft") is True or p.get("isDraft") is True or bool(PR_DRAFT_TITLE.match(str(p.get("name") or "")))
                prs.append({"title": clean(p.get("name"), 200), "url": _https(p.get("url")), "status": "OPEN" if st == "DRAFT" else st, **({"draft": True} if draft else {}),
                            "author": clean((p.get("author") or {}).get("name") if isinstance(p.get("author"), dict) else "", 80),
                            "repo": pr_repo(p), "updated": clean(p.get("lastUpdate"), 40),
                            "reviewers": len(revs), "approved": sum(1 for x in revs if x.get("approved") is True)})
        out[key] = {"prs": prs, "branches": branches, "at": now}
    return out


def last_comments(base: str, token: str, keys: list, opener=None) -> dict:
    """{KEY: day of its latest comment}, for the issues shown as cards (this and coming sprints). Only the comment
    field is asked for, in batches, so the ordinary searches stay light. Any failure just leaves dates out."""
    opener = opener or jira_opener()
    out: dict = {}
    ks = [k for k in keys if KEY_RE.match(str(k))][:MAX_COMMENT_KEYS]
    for i in range(0, len(ks), BATCH):
        chunk = ks[i:i + BATCH]
        q = urllib.parse.urlencode({"jql": f"key in ({','.join(chunk)})", "fields": "comment", "maxResults": str(len(chunk))})
        try:
            with opener.open(auth_request(f"{base}/rest/api/2/search?{q}", token), timeout=TIMEOUT) as r:
                body = json.loads(r.read(10 * 1024 * 1024).decode("utf-8"))
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                raise redirect_exit(e)
            continue
        except (urllib.error.URLError, ValueError):
            continue
        for it in body.get("issues") or [] if isinstance(body, dict) else []:
            k = clean(it.get("key"), 40).upper() if isinstance(it, dict) else ""
            cm = ((it.get("fields") or {}).get("comment") or {}).get("comments") if isinstance(it, dict) else None
            days = [_day(c.get("updated") or c.get("created")) for c in cm or [] if isinstance(c, dict)]
            days = [d for d in days if d]
            if k and days:
                out[k] = max(days)
    return out


def prev_status(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            o = json.load(f)
        return o if isinstance(o, dict) else {}
    except (OSError, ValueError):
        return {}


ABANDON_RES = {"won't do", "wont do", "duplicate", "cannot reproduce", "cancelled", "canceled", "archived", "won't fix", "declined", "rejected", "obsolete"}
ABANDON_ST = {"abandoned", "cancelled", "canceled", "rejected", "closed-incomplete", "closed incomplete", "expired", "not applicable", "de-commissioned", "decommissioned", "withdrawn", "won't do"}


def issue_state(j: dict, smap: dict, rmap: dict, done_cols: set, columns: list | None = None) -> str:
    """The same reading of a Jira status the page uses: the team's status map, abandoned resolutions and statuses,
    the board's columns, then Jira's category. Returns done, abandoned, inprogress or notstarted.
    done_cols remains the fallback for older callers that do not supply all the columns."""
    st, res, cat = str(j.get("status") or ""), str(j.get("resolution") or ""), str(j.get("category") or "")
    status_key = st.strip().lower()
    if smap.get(st) in ("done", "abandoned", "inprogress", "notstarted"):
        return smap[st]
    if res and (rmap.get(res) == "abandoned" or (not rmap.get(res) and res.strip().lower() in ABANDON_RES)):
        return "abandoned"
    if status_key in ABANDON_ST:
        return "abandoned"
    if columns is not None:
        # Match the first column containing the status, ignoring case and surrounding spaces, like boardColumnOf.
        for i, col in enumerate(columns):
            if isinstance(col, dict) and any(str(value).strip().lower() == status_key for value in col.get("statuses") or []):
                return "done" if i == len(columns) - 1 else "notstarted" if cat == "todo" else "inprogress"
    elif any(str(value).strip().lower() == status_key for value in done_cols):
        return "done"
    return {"todo": "notstarted", "inprogress": "inprogress", "done": "done"}.get(cat, "notstarted")


def burndown_snapshot(out: dict, prev: dict, more: dict, plan: dict | None = None) -> None:
    """Each run notes, for the active sprint, the points in it (scope) and the points not done yet, by day, carrying
    earlier days forward from the last file. So the burndown shows scope added mid-sprint, not just what closed."""
    hist = prev.get("burndown") if isinstance(prev.get("burndown"), dict) else {}
    hist = {k: v for k, v in hist.items() if re.match(r"^[0-9]{1,9}$", str(k)) and isinstance(v, dict)}
    active = [x for x in out.get("sprints") or [] if x.get("state") == "active"]
    today = _dt.date.today().isoformat()
    every = {**(more or {}), **(out.get("issues") or {})}
    meta = (plan or {}).get("meta") if isinstance((plan or {}).get("meta"), dict) else {}
    smap = meta.get("jiraStatusMap") if isinstance(meta.get("jiraStatusMap"), dict) else {}
    rmap = meta.get("jiraResMap") if isinstance(meta.get("jiraResMap"), dict) else {}
    cols = ((out.get("board") or {}).get("columns") or [])
    done_cols = set(cols[-1].get("statuses") or []) if cols and isinstance(cols[-1], dict) else set()
    for sp in active:
        sid = str(sp["id"])
        mine = [j for j in every.values() if isinstance(j, dict) and j.get("sprintId") == sp["id"] and not j.get("isEpic")]
        state = {id(j): issue_state(j, smap, rmap, done_cols, cols) for j in mine}
        live = [j for j in mine if state[id(j)] != "abandoned"]            # abandoned work isn't scope, and isn't "done" either
        num = lambda j: j["points"] if isinstance(j.get("points"), (int, float)) else 0
        days = dict(hist.get(sid) or {})
        days[today] = {"scope": round(sum(num(j) for j in live), 2), "left": round(sum(num(j) for j in live if state[id(j)] != "done"), 2), "stories": len(live),
                       "unestimated": sum(1 for j in live if not isinstance(j.get("points"), (int, float))), "abandoned": len(mine) - len(live)}
        hist[sid] = dict(sorted(days.items())[-MAX_BURN_DAYS:])
    if hist:
        out["burndown"] = dict(sorted(hist.items(), key=lambda kv: max(kv[1]) if kv[1] else "")[-MAX_BURN_SPRINTS:])


def board_sprints(base: str, token: str, board: str, opener=None) -> tuple[dict, list]:
    """A Scrum board's name and its sprints (closed, active and future), from Jira's Agile API. Read-only GETs."""
    if not BOARD_RE.match(str(board)):
        raise SystemExit("--board takes the board's number, the rapidView=123 in the board's address.")
    opener = opener or jira_opener()

    def get(path: str) -> dict:
        try:
            with opener.open(auth_request(f"{base}{path}", token), timeout=TIMEOUT) as r:
                body = json.loads(r.read(5 * 1024 * 1024).decode("utf-8"))
                return body if isinstance(body, dict) else {}
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                raise redirect_exit(e)
            if e.code == 404:
                raise SystemExit(f"Jira has no board {board}, or you can't see it.")
            if e.code == 400:
                why = jira_error_text(e)
                raise SystemExit(f"Jira couldn't list that board's sprints" + (f": {why}" if why else ".") + " Is it a Scrum board?")
            raise SystemExit("Jira refused the token (401/403)." if e.code in (401, 403) else f"Jira answered with an error ({e.code}).")
        except urllib.error.URLError as e:
            raise SystemExit(f"Couldn't reach Jira: {e.reason}")

    info = get(f"/rest/agile/1.0/board/{board}")
    if clean(info.get("type"), 20).lower() not in ("scrum", ""):
        raise SystemExit(f"Board {board} is a {clean(info.get('type'), 20)} board, which has no sprints.")
    sprints, start = [], 0
    while len(sprints) < MAX_SPRINTS:
        page = get(f"/rest/agile/1.0/board/{board}/sprint?" + urllib.parse.urlencode({"startAt": str(start), "maxResults": "50"}))
        vals = page.get("values") if isinstance(page.get("values"), list) else []
        for v in vals:
            if not isinstance(v, dict) or not isinstance(v.get("id"), int) or not 0 < v["id"] < 10**9:
                continue
            sprints.append({"id": v["id"], "name": clean(v.get("name"), 80), "state": clean(v.get("state"), 20).lower(),
                            "start": _day(v.get("startDate")), "end": _day(v.get("endDate")), "goal": clean(v.get("goal"), 300)})
        start += len(vals)
        if not vals or page.get("isLast") is True:
            break
    columns = []
    try:
        conf = get(f"/rest/agile/1.0/board/{board}/configuration")
        cols = (conf.get("columnConfig") or {}).get("columns") if isinstance(conf.get("columnConfig"), dict) else None
        if isinstance(cols, list):
            ids = {str(st.get("id")) for c in cols if isinstance(c, dict) for st in (c.get("statuses") or []) if isinstance(st, dict)}
            names = {}
            if ids:
                all_st = get_json(base, token, "/rest/api/2/status", opener)
                names = {str(x.get("id")): clean(x.get("name"), 60) for x in all_st if isinstance(x, dict)} if isinstance(all_st, list) else {}
            for c in cols[:30]:
                if isinstance(c, dict):
                    columns.append({"name": clean(c.get("name"), 60), "statuses": [names[str(st.get("id"))] for st in (c.get("statuses") or [])
                                                                                     if isinstance(st, dict) and str(st.get("id")) in names][:60]})
    except SystemExit as e:                           # the board's columns are a nicety: without them, Jira's categories are used
        columns = []
        print(f"        couldn't read board {board}'s columns ({e}); statuses will use Jira's own categories", file=sys.stderr)
    return {"id": int(board), "name": clean(info.get("name"), 120), "columns": columns}, sprints[:MAX_SPRINTS]


# ---------------------------------------------------------------- commands
def cmd_setup(args) -> None:
    cfg = load_config()
    sv = servers(cfg)
    dflt = sv.get(cfg.get("default") or "", {}).get("base", "https://jira.yourcompany.com")
    base = normalize_base(getattr(args, "jira", None) or input(f"Jira address [{dflt}]: ") or dflt)
    print("Create a personal access token in Jira: your profile picture → Profile → Personal Access Tokens.")
    print("Read access is enough. The token is stored in your system's credential store, not in a file.")
    token = getpass.getpass("Personal access token (hidden): ").strip()
    if not token:
        raise SystemExit("No token entered.")
    host = urllib.parse.urlparse(base).hostname
    try:                                               # check the token works before saving it
        opener = jira_opener()
        req = auth_request(f"{base}/rest/api/2/myself", token)
        with opener.open(req, timeout=TIMEOUT) as r:
            me = json.loads(r.read(1024 * 1024).decode("utf-8"))
    except urllib.error.HTTPError as e:
        if 300 <= e.code < 400:
            raise redirect_exit(e)
        raise SystemExit("Jira refused that token." if e.code in (401, 403) else f"Jira answered with an error ({e.code}).")
    except urllib.error.URLError as e:
        raise SystemExit(f"Couldn't reach Jira: {e.reason}")
    CredentialStore(host).save(token)
    fields = {}
    try:
        fields = find_fields(base, token, opener)
    except SystemExit as e:
        print(f"Couldn't look up your Jira's fields ({e}). Run `fields` later.")
    sv[host] = {"base": base, "fields": fields}
    cfg.setdefault("default", host)
    save_config(cfg)
    print(f"Saved {host}. Signed in to Jira as {clean(me.get('displayName'), 80) or 'you'}." + (f" You now have {len(sv)} Jira servers set up." if len(sv) > 1 else ""))
    if fields:
        print("Found these fields in your Jira:")
        report_fields(fields)


def find_fields(base: str, token: str, opener=None) -> dict:
    opener = opener or jira_opener()
    try:
        with opener.open(auth_request(f"{base}/rest/api/2/field", token), timeout=TIMEOUT) as r:
            return discover_fields(json.loads(r.read(5 * 1024 * 1024).decode("utf-8")))
    except urllib.error.HTTPError as e:
        if 300 <= e.code < 400:
            raise redirect_exit(e)
        raise SystemExit("Jira refused the token (401/403)." if e.code in (401, 403) else f"Jira answered with an error ({e.code}).")
    except urllib.error.URLError as e:
        raise SystemExit(f"Couldn't reach Jira: {e.reason}")


FIELD_LABELS = {"epicLink": "Epic Link", "epicName": "Epic Name", "sprint": "Sprint", "storyPoints": "Story Points", "parentLink": "Parent Link (Advanced Roadmaps)"}


def report_fields(found: dict) -> None:
    for role, label in FIELD_LABELS.items():
        print(f"  {label:32} {found.get(role) or 'not found'}")
    if "epicLink" not in found and "parentLink" not in found:
        print("  No Epic Link or Parent Link field: epics will be read from each issue's parent, if it has one.")


def cmd_fields(args) -> None:
    cfg = load_config()
    entry = pick_server(cfg, getattr(args, "jira", None))
    fields = dict(entry.get("fields") or {})
    if args.set:
        for pair in args.set:
            role, _, fid = pair.partition("=")
            if role not in FIELD_LABELS or not FIELD_ID_RE.match(fid):
                raise SystemExit(f"--set takes ROLE=customfield_NNN, with ROLE one of {', '.join(FIELD_LABELS)}.")
            fields[role] = fid
        print("Saved your field choices:")
    else:
        base, token = use_server(entry)
        fields = find_fields(base, token)
        print(f"Found these fields in {urllib.parse.urlparse(base).hostname}:")
    entry["fields"] = fields
    save_config(cfg)
    report_fields(fields)
    print("To change one yourself: fields --set ROLE=customfield_NNNNN  (for example storyPoints=customfield_9900001)")


def get_json(base: str, token: str, path: str, opener=None, cap: int = 5 * 1024 * 1024):
    """One read-only GET. Same redirect and error handling as the rest of the script."""
    opener = opener or jira_opener()
    try:
        with opener.open(auth_request(f"{base}{path}", token), timeout=TIMEOUT) as r:
            return json.loads(r.read(cap).decode("utf-8"))
    except urllib.error.HTTPError as e:
        if 300 <= e.code < 400:
            raise redirect_exit(e)
        if e.code == 400:
            why = jira_error_text(e)
            raise SystemExit("Jira couldn't do that" + (f": {why}" if why else "."))
        raise SystemExit("Jira refused the token (401/403)." if e.code in (401, 403) else f"Jira answered with an error ({e.code}) for {path.split('?')[0]}.")
    except urllib.error.URLError as e:
        raise SystemExit(f"Couldn't reach Jira: {e.reason}")


def _short(v, n=160) -> str:
    """A raw field value on one line, capped, for looking at its format."""
    t = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    t = " ".join(t.split())
    return t if len(t) <= n else t[:n] + "…"


def inspect_report(base: str, token: str, board: str | None, jql: str | None, opener=None, sample: int = 3) -> list[str]:
    """What this Jira returns, so its format can be checked: statuses and their categories, resolutions, a board's
    sprints, and a few sample issues' raw sprint / resolution / epic values. No people: no assignees, no emails."""
    out = []
    sts = get_json(base, token, "/rest/api/2/status", opener)
    out.append(f"Statuses ({len(sts) if isinstance(sts, list) else 0}), and the category Sightline maps each to:")
    cats = {"new": "to do", "indeterminate": "in progress", "done": "done"}
    for st in sorted([x for x in sts if isinstance(x, dict)] if isinstance(sts, list) else [], key=lambda x: clean(x.get("name"), 60).lower()):
        cat = st.get("statusCategory") if isinstance(st.get("statusCategory"), dict) else {}
        out.append(f"  {clean(st.get('name'), 60):32} {cats.get(clean(cat.get('key'), 20), 'unknown (' + clean(cat.get('key'), 20) + ')')}")
    res = get_json(base, token, "/rest/api/2/resolution", opener)
    out.append("")
    out.append(f"Resolutions ({len(res) if isinstance(res, list) else 0}):")
    for r in [x for x in res if isinstance(x, dict)] if isinstance(res, list) else []:
        out.append(f"  {clean(r.get('name'), 60):32} {clean(r.get('description'), 90)}")
    if board:
        b, sprints = board_sprints(base, token, board, opener)
        out.append("")
        out.append(f"Board {b['id']} ({b['name'] or 'no name'}): {len(sprints)} sprint(s), newest last")
        for x in sprints[-15:]:
            out.append(f"  {x['id']:>7}  {x['name'][:40]:40} {x['state']:8} {x['start'] or '-':10} to {x['end'] or '-'}")
    if jql:
        q = jql_for(jql, None)
        body = get_json(base, token, "/rest/api/2/search?" + urllib.parse.urlencode({"jql": q, "fields": fields_param(), "maxResults": str(sample)}), opener)
        issues = body.get("issues") if isinstance(body, dict) and isinstance(body.get("issues"), list) else []
        out.append("")
        out.append(f"Sample issues from: {q}")
        for raw in [x for x in issues if isinstance(x, dict)][:sample]:
            f = raw.get("fields") if isinstance(raw.get("fields"), dict) else {}
            st = f.get("status") if isinstance(f.get("status"), dict) else {}
            rs = f.get("resolution") if isinstance(f.get("resolution"), dict) else {}
            typ = f.get("issuetype") if isinstance(f.get("issuetype"), dict) else {}
            out.append(f"  {clean(raw.get('key'), 40)}  type {clean(typ.get('name'), 40)!r} · status {clean(st.get('name'), 60)!r} · resolution {clean(rs.get('name'), 60) or 'none'!r}")
            for role in ("sprint", "epicLink", "epicName", "storyPoints", "parentLink"):
                fid = CUSTOM.get(role, "")
                if FIELD_ID_RE.match(fid):
                    out.append(f"      {role:12} {fid:18} raw: {_short(f.get(fid))}")
            shaped = shape_issue(raw, base)
            if shaped:
                v = shaped[1]
                out.append(f"      Sightline reads: sprint {v['sprint']!r} ({v['sprintStart'] or '-'} to {v['sprintEnd'] or '-'}), epic {v['epic'] or '-'}, "
                           f"points {v['points'] if v['points'] is not None else '-'}, isEpic {v['isEpic']}")
    return out


def cmd_inspect(args) -> None:
    base, token = use_server(pick_server(load_config(), getattr(args, "jira", None)))
    print("\n".join(inspect_report(base, token, args.board, args.jql, sample=max(1, min(10, args.sample)))))
    print("\nNo assignees or emails are shown. Nothing was changed in Jira.")


def cmd_forget(args) -> None:
    cfg = load_config()
    if not servers(cfg):
        print("Nothing to forget.")
        return
    entry = pick_server(cfg, getattr(args, "jira", None))
    host = urllib.parse.urlparse(entry["base"]).hostname
    ok = CredentialStore(host).delete()
    servers(cfg).pop(host, None)
    if cfg.get("default") == host:
        cfg["default"] = next(iter(servers(cfg)), None)
    save_config(cfg)
    print(f"Removed the stored token for {host}." if ok else f"No stored token found for {host}; removed its settings.")


PAGE_META = re.compile(rb'<meta name="sightline-version" content="([0-9]{1,4}\.[0-9]{1,5}\.[0-9]{1,6})">')


def newest_page(folder: str) -> dict | None:
    """The newest Sightline page among the .html files in the plan's folder: {version, file}. Only the version stamp in
    each file's first few KB is read, and only the file's name (no path) is written."""
    best = None
    try:
        names = sorted(n for n in os.listdir(folder) if n.lower().endswith((".html", ".htm")))[:2000]   # every page, within reason
    except OSError:
        return None
    for name in names:
        if not name.lower().endswith((".html", ".htm")):
            continue
        try:
            with open(os.path.join(folder, name), "rb") as f:
                m = PAGE_META.search(f.read(8192))
        except OSError:
            continue
        if m:
            v = m.group(1).decode()
            if best is None or tuple(map(int, v.split("."))) > tuple(map(int, best["version"].split("."))):
                best = {"version": v, "file": clean(name, 120)}
    return best


def sync_once(plan_path: str, out_path: str, base: str, token: str, jql: str | None = None, limit: int = 500,
              issues_path: str | None = None, board: str | None = None, how: dict | None = None, accept_drop: bool = False) -> dict:
    if os.path.getsize(plan_path) > MAX_PLAN_BYTES:
        raise SystemExit("The plan file is larger than 5 MB.")
    with open(plan_path, encoding="utf-8") as f:
        plan = json.load(f)
    check_plan_format(plan)
    linked: list = []
    keys = plan_keys(plan, linked)
    issues = jira_search(base, token, keys) if keys else {}
    searches = jql if isinstance(jql, list) else ([{"name": "Search", "jql": jql}] if jql else [])
    issues_all, lists = {}, []
    for srch in searches:
        # Several named searches ("Epics", "This sprint", "No epic"): each keeps its own list of keys, in Jira's order,
        # and the issues are stored once. --limit applies to each search; MAX_ISSUES caps the whole file.
        room = min(limit, MAX_ISSUES - len(issues_all))
        if room <= 0:                                # the file is full: say so rather than fetch past the cap
            lists.append({"name": srch["name"], "jql": srch["jql"], "total": 0, "truncated": True, "keys": [], "full": True})
            continue
        found, order, total = jira_filter(base, token, srch["jql"], room)
        for k in order:
            issues_all.setdefault(k, found[k])
        lists.append({"name": srch["name"], "jql": srch["jql"], "total": total, "truncated": total > len(order), "keys": order, **({"full": True} if room < limit and total > len(order) else {})})
    # epics linked by an initiative's list, or by its own key when Jira says that key is an epic
    epics = sorted({k for k in plan_epics(plan) if k in issues} | {k for k in keys if (issues.get(k) or {}).get("isEpic")})
    # epics the searches found that aren't on the board: counted too (not listed), so the page can tell a finished
    # epic from a live one while you sort. The board's epics come first for the count limit.
    found_epics = sorted(k for k, v in issues_all.items() if v.get("isEpic") and k not in epics)
    stories: dict = {}
    parked = parked_epics(plan)
    counted = epics + found_epics
    rollups, cut = jira_rollups(base, token, counted, stories=stories, listed={k for k in epics if k not in parked}) if counted else ({}, False)
    fold_nested(rollups, {k: issues.get(k) or issues_all.get(k) or {} for k in rollups})
    for k, v in stories.items():                     # an epic's stories, for the page; issues the plan links keep their own entry
        issues.setdefault(k, v)
    keep_descriptions(issues, own_keys(plan))
    keep_descriptions(issues_all, set())             # the search file never carries them
    ancestors = jira_ancestors(base, token, {**issues_all, **issues})
    out = {"kind": "sightline-jira-status", "version": STATUS_FORMAT, "snapshot": secrets.token_hex(8),   # both files from one run share it
           "generatedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
           "jiraBase": base, "issues": issues, "missing": [k for k in keys if k not in issues],
           **({"keysCut": {"linked": linked[0], "fetched": len(keys)}} if linked and linked[0] > len(keys) else {}),
           **({"ancestors": ancestors} if ancestors else {}),
           # without Parent Link, a story under a feature can't be traced to its epic: the page says so where it shows
           **({} if FIELD_ID_RE.match(CUSTOM.get("parentLink", "")) else {"noParentLink": True}),
           # how this file is kept up to date, so the page can say when it's overdue (no computer or user names)
           "sync": {"by": (how or {}).get("by", "sync"), "every": int((how or {}).get("every") or 0), "plan": os.path.basename(plan_path)[:200]}}
    if board:
        out["board"], out["sprints"] = board_sprints(base, token, board)
    page = newest_page(os.path.dirname(os.path.abspath(plan_path)))
    if page:
        out["page"] = page                              # so an open page can say a newer copy of itself is there
    rel_keys = list(issues) + [k for k in issues_all if k not in issues]
    prev_rel = prev_status(out_path)
    fresh = prev_rel.get("releasesAt") and isinstance(prev_rel.get("releases"), list) and (_dt.datetime.now(_dt.timezone.utc) - _dt.datetime.fromisoformat(prev_rel["releasesAt"])).total_seconds() < RELEASE_TTL
    if rel_keys and fresh:
        out["releases"], out["releasesAt"] = prev_rel["releases"], prev_rel["releasesAt"]      # releases change rarely: reread every few hours
        if prev_rel.get("releasesSkipped"):
            out["releasesSkipped"] = prev_rel["releasesSkipped"]
    elif rel_keys:
        out["releases"], skipped_rel = project_releases(base, token, rel_keys)
        out["releasesAt"] = out["generatedAt"]
        if skipped_rel:
            out["releasesSkipped"] = skipped_rel
    prev_st = prev_status(out_path)
    burndown_snapshot(out, prev_st, issues_all, plan)
    card_keys = [k for k, v in {**issues_all, **issues}.items() if isinstance(v, dict) and v.get("sprintState") in ("active", "future") and not v.get("isEpic")]
    every = {**issues_all, **issues}
    # the active sprint's work: open issues first (their pull requests change), then done ones (for merged pull requests)
    act = [k for k in card_keys if every[k].get("jid") and every[k].get("sprintState") == "active"]
    done_keys = {k for k in act if every[k].get("category") == "done"}
    open_i = [(k, every[k]["jid"]) for k in act if k not in done_keys]
    done_i = [(k, every[k]["jid"]) for k in act if k in done_keys]
    room = max(MAX_DEV // 4, MAX_DEV - len(open_i))                  # a quarter of the room is kept for done issues' merged pull requests
    dev_items = open_i[:MAX_DEV - min(room, len(done_i))] + done_i[:room]
    if dev_items:
        dev = dev_status(base, token, dev_items, prev_st.get("dev") if isinstance(prev_st.get("dev"), dict) else {}, out["generatedAt"], done=done_keys)
        if dev:
            out["dev"] = dev
        out["devCover"] = {"read": sum(1 for k, _ in dev_items if k in (dev or {})), "of": len(dev_items)}     # so the page can say when it's partial
    if card_keys:
        old = prev_st.get("issues") if isinstance(prev_st.get("issues"), dict) else {}
        cm, ask = {}, []
        for k in card_keys:
            o, n = old.get(k) or {}, {**issues_all, **issues}.get(k) or {}
            if o.get("commentedAt") and o.get("updated") and o.get("updated") == n.get("updated"):
                cm[k] = o["commentedAt"]                   # nothing changed since: no need to ask Jira again
            else:
                ask.append(k)
        cm.update(last_comments(base, token, ask) if ask else {})
        for k, d in cm.items():
            for src in (issues, issues_all):
                if k in src:
                    src[k]["commentedAt"] = d
    if counted:
        out["rollups"] = rollups
        out["rollupsTruncated"] = cut
    # A guard against a bad sync: if this run found far fewer of the plan's own Jira items than the last good one (a
    # permissions change, a Jira outage returning nothing, a search that broke), keep the previous files and say so,
    # rather than making the team's work look like it vanished. --accept-drop takes the new result when the drop is real.
    prev = None
    try:
        with open(out_path, encoding="utf-8") as f:
            prev = json.load(f)
    except (OSError, ValueError):
        prev = None
    if isinstance(prev, dict) and isinstance(prev.get("issues"), dict) and not accept_drop:
        before = sum(1 for k in keys if k in prev["issues"])
        now = sum(1 for k in keys if k in issues)
        if (before and now == 0) or (before >= DROP_MIN and now < before * DROP_KEEP):   # losing all of them is guarded at any size
            prev["guard"] = {"at": out["generatedAt"], "found": now, "previous": before, "plan": os.path.basename(plan_path)[:200]}
            write_atomic(out_path, prev)
            return {**out, "guarded": prev["guard"]}
    if searches:
        listing = {"kind": "sightline-jira-issues", "version": ISSUES_FORMAT, "snapshot": out["snapshot"], "generatedAt": out["generatedAt"], "jiraBase": base,
                   "searches": lists, "issues": [{"key": k, **v} for k, v in issues_all.items()],
                   # version-1 fields, so an older page still shows the first search
                   "jql": lists[0]["jql"], "total": lists[0]["total"], "truncated": lists[0]["truncated"]}
        write_atomic(issues_path or os.path.join(os.path.dirname(os.path.abspath(out_path)), "jira-issues.json"), listing)
        out["search"] = [{"name": x["name"], "found": x["total"], "kept": len(x["keys"]), "truncated": x["truncated"], "full": x.get("full", False)} for x in lists]   # for the console only
    write_atomic(out_path, {k: v for k, v in out.items() if k != "search"})
    return out


DROP_MIN = 10          # a partial drop is guarded only for plans linking at least this many Jira items
DROP_KEEP = 2 / 3      # and keeps the earlier sync when fewer than this share of them came back


SLUG_RE = re.compile(r"[^A-Za-z0-9._-]+")


def folder_slug(name: str) -> str:
    """A board's name as a safe folder name: letters, digits, . _ - only (no path separators, no leading dots)."""
    return SLUG_RE.sub("-", clean(name, 60)).strip("-.")[:40]


def jira_folder(plan: str, folder: str | None) -> str:
    """Where the Jira files live: a jira/ folder beside the plan, so the plan and its Jira data move together when
    someone copies the folder for their own project. --folder (a subfolder name, or a path) overrides it."""
    here = os.path.dirname(os.path.abspath(plan))
    if not folder:
        return os.path.join(here, "jira")
    if os.path.isabs(folder) or os.sep in folder or (os.altsep and os.altsep in folder):
        return os.path.abspath(folder)
    return os.path.join(here, folder_slug(folder) or "jira")


def plan_job(cfg: dict, plan: str, args) -> dict:
    """What to sync for a plan: what was saved for it with --save, with each option on the command line replacing
    just that setting (--board 8 changes the board and keeps the saved searches)."""
    sp = saved_plan(cfg, plan)
    a = lambda k: getattr(args, k, None)
    searches = parse_searches(a("search"))
    if a("jql") is not None or a("filter") is not None:
        searches.insert(0, {"name": "Filter " + str(a("filter")) if a("filter") is not None else "Search", "jql": jql_for(a("jql"), a("filter"))})
    saved_s = sp.get("searches") if isinstance(sp.get("searches"), list) else ([{"name": "Search", "jql": sp["jql"]}] if sp.get("jql") else [])
    saved_s = [{"name": x["name"], "jql": jql_for(x["jql"], None)} for x in saved_s if isinstance(x, dict) and SEARCH_NAME_RE.match(str(x.get("name", ""))) and x.get("jql")]
    pick = lambda k: a(k) if a(k) is not None else sp.get(k)
    job = {"jira": a("jira"), "board": pick("board"), "folder": pick("folder"), "limit": a("limit") or sp.get("limit") or 500,
           "every": a("every") or sp.get("every") or 15, "jql": searches or saved_s or None, "accept_drop": bool(a("accept_drop"))}
    entry = pick_server(cfg, job["jira"], sp)
    job["server"] = urllib.parse.urlparse(entry["base"]).hostname
    job["entry"] = entry
    return job


def check_plan(plan: str, shown: str) -> None:
    if not os.path.isfile(plan):
        here = os.path.dirname(plan)
        near = sorted(f for f in os.listdir(here) if f.lower().endswith(".json") and not f.startswith(("jira-status", "jira-issues", "."))) if os.path.isdir(here) else []
        raise SystemExit(f"Can't find the plan file {shown}." + (f" Plan files in that folder: {', '.join(near[:10])}" if near else " Check the name and folder."))


def run_job(plan: str, job: dict, out: str | None = None, issues_out: str | None = None, how: dict | None = None) -> tuple[dict, str, str]:
    base, token = use_server(job["entry"])
    folder = jira_folder(plan, job.get("folder"))
    out = out or os.path.join(folder, "status.json")
    issues_out = issues_out or os.path.join(folder, "issues.json")
    if issues_out == out:
        raise SystemExit("--issues-out must be a different file from the status file.")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    os.makedirs(os.path.dirname(issues_out), exist_ok=True)
    res = sync_once(plan, out, base, token, job.get("jql"), max(1, min(2000, int(job.get("limit") or 500))), issues_out, job.get("board"), how, bool(job.get("accept_drop")))
    return res, out, issues_out


def report_run(res: dict, out: str, issues_out: str, label: str = "") -> None:
    stamp = _dt.datetime.now().strftime("%H:%M")
    if res.get("guarded"):
        g = res["guarded"]
        print(f"[{stamp}] {label}Kept the earlier sync: Jira returned only {g['found']} of this plan's {g['previous']} Jira items this time "
              "(a permissions change, a Jira problem, or a changed search?). Nothing was replaced. If the drop is real, run sync with --accept-drop.")
        return
    kids = sum(len(r.get("children") or []) for r in (res.get("rollups") or {}).values())
    print(f"[{stamp}] {label}{len(res['issues'])} issue(s) written to {out}" + (f" ({kids} of them stories under your epics)" if kids else "") + (f"; not found in Jira: {', '.join(res['missing'][:10])}" if res["missing"] else ""))
    if res.get("noParentLink"):
        print("        no Parent Link field found: a story that sits under a feature will show with no epic. Run fields to check.")
    if res.get("keysCut"):
        print(f"        this plan links {res['keysCut']['linked']} Jira items; only the first {res['keysCut']['fetched']} were fetched. Remove links the plan no longer needs.")
    if "sprints" in res:
        print(f"        board {res['board']['name'] or res['board']['id']}: {len(res['sprints'])} sprint(s), {len(res['board'].get('columns') or [])} column(s)")
    if res.get("dev"):
        opn = [p for d in res["dev"].values() for p in d.get("prs", []) if p.get("status") == "OPEN"]
        print(f"        pull requests: {len(opn)} open, across {sum(1 for d in res['dev'].values() if any(p.get('status') == 'OPEN' for p in d.get('prs', [])))} of the sprint's issues")
    if res.get("releases") is not None or res.get("releasesSkipped"):
        rel = res.get("releases") or []
        print(f"        releases: {len(rel)} from {', '.join(sorted({r['project'] for r in rel})) or 'no project'}"
              + (f"; couldn't read {', '.join(res['releasesSkipped'])}" if res.get("releasesSkipped") else ""))
    for fl in res.get("search") or []:
        if fl["full"] and not fl["found"]:
            print(f"        {fl['name']}: skipped; the file already holds {MAX_ISSUES} issues. Narrow the searches above it.")
        else:
            print(f"        {fl['name']}: found {fl['found']} issue(s)" + (f"; only the first {fl['kept']} were kept (" + (f"the file holds {MAX_ISSUES} issues across all searches" if fl["full"] else "--limit") + ")" if fl["truncated"] else ""))
    if res.get("search"):
        print(f"        written to {issues_out}")


def cmd_sync(args) -> None:
    cfg = load_config()
    plan = os.path.abspath(args.plan)
    check_plan(plan, args.plan)
    job = plan_job(cfg, plan, args)
    save = getattr(args, "save", False)
    out = os.path.abspath(args.out) if getattr(args, "out", None) else None
    issues_out = os.path.abspath(args.issues_out) if getattr(args, "issues_out", None) else None
    while True:
        res, o, io = run_job(plan, job, out, issues_out, how={"by": "sync", "every": getattr(args, "every", 0) or 0})
        report_run(res, o, io)
        if save:                                     # only settings that just worked are kept
            cfg = load_config()
            cfg.setdefault("plans", {})[plan_key(plan)] = {"jira": job["server"], "board": job.get("board"), "searches": job.get("jql") or [],
                                                            "folder": job.get("folder"), "limit": job.get("limit") or 500, "every": job.get("every") or 15}
            save_config(cfg)
            print(f"Saved this plan's sync settings on this computer. From now on: sync \"{args.plan}\", or watch.")
            save = False
        if not getattr(args, "every", 0):
            break
        time.sleep(max(5, args.every) * 60)


# ---------------------------------------------------------------- watch and install
WATCH_TICK = 20                                                # seconds between checks
SETTLE = 10                                                    # a saved plan must be still this long before it's synced
LOCK_FRESH = 120                                               # a watch that hasn't checked in for this long is gone


def lock_path() -> str:
    return os.path.join(CONFIG_DIR, "watch.lock")


WATCH_ID = secrets.token_hex(8)                                # this process's claim on the lock


def read_lock() -> dict | None:
    try:
        with open(lock_path(), encoding="utf-8") as f:
            held = json.load(f)
        return held if isinstance(held, dict) else {}
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        return {}


def take_watch_lock(now: float, settle: float = 1.0) -> bool:
    """One watch at a time. A heartbeat file with this process's id, instead of a pid check, which isn't safe on Windows
    (os.kill ends processes). A new lock is created exclusively; a stale one is replaced, then re-read after a moment so
    two watches starting together can't both win."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    mine = {"id": WATCH_ID, "pid": os.getpid(), "at": now}
    held = read_lock()
    if held is None:
        try:
            fd = os.open(lock_path(), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            return False
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(mine, f)
        return True
    if held.get("id") != WATCH_ID:
        try:
            fresh = now - float(held.get("at", 0)) < LOCK_FRESH
        except (TypeError, ValueError):
            fresh = False
        if fresh:
            return False
        write_atomic(lock_path(), mine)
        if settle:
            time.sleep(settle)
        return (read_lock() or {}).get("id") == WATCH_ID
    write_atomic(lock_path(), mine)
    return True


def release_watch_lock() -> None:
    """On the way out (Ctrl+C included), give the lock back if it's still ours, so the next watch can start at once."""
    held = read_lock()
    if isinstance(held, dict) and held.get("id") == WATCH_ID:
        try:
            os.remove(lock_path())
        except OSError:
            pass


def lock_held_msg(now: float) -> str:
    held = read_lock() or {}
    try:
        age = max(0, int(now - float(held.get("at", now))))
    except (TypeError, ValueError):
        age = 0
    pid = held.get("pid") if isinstance(held.get("pid"), int) else None
    wait = max(1, LOCK_FRESH - age)
    return (f"A watch is already running on this computer{f' (process {pid})' if pid else ''}, last checked in {age} s ago. "
            "It may be the one that starts when you sign in: a minimized \"Sightline Jira sync\" window. Close that window to stop it. "
            f"If you just stopped one some other way, try again in {wait} s.")


def is_due(st: dict, every_min: float, mtime: float, now: float) -> bool:
    """Sync when the interval is up, or when the plan was saved since the last sync and has settled."""
    if now - st.get("last", 0) >= max(5, every_min) * 60:
        return True
    return st.get("seen") is not None and mtime != st["seen"] and now - mtime >= SETTLE


RETRY_FIRST = 60                                               # seconds before retrying a failed sync; doubles up to the interval


def watch_tick(cfg: dict, plans: list[str], state: dict, now: float, runner=None, beat=None) -> list[str]:
    """One pass over the watched plans. Returns what happened, one line per plan synced or failed. A failure in one
    plan (Jira down, a half-written plan, a full disk) is reported and retried soon; it never stops the others."""
    runner = runner or (lambda plan, job: report_run(*run_job(plan, job, how={"by": "watch", "every": job.get("every") or 15}), label=os.path.basename(plan) + ": "))
    done = []
    for plan in plans:
        st = state.setdefault(plan, {})
        try:
            mtime = os.path.getmtime(plan)
        except OSError:
            if not st.get("missing"):
                print(f"[watch] {plan} isn't there any more; skipping it until it is.")
            st["missing"] = True
            continue
        st["missing"] = False
        every = float(saved_plan(cfg, plan).get("every") or 15)
        if not is_due(st, every, mtime, now):
            continue
        try:
            runner(plan, plan_job(cfg, plan, argparse.Namespace()))
            done.append(f"synced {plan}")
            st["fails"] = 0
            st["last"] = now
        except (SystemExit, Exception) as e:         # say so, and try again sooner than the full interval
            st["fails"] = st.get("fails", 0) + 1
            wait = min(max(5, every) * 60, RETRY_FIRST * 2 ** (st["fails"] - 1))
            msg = str(e) if isinstance(e, SystemExit) else f"{type(e).__name__}: {e}"
            print(f"[watch] {os.path.basename(plan)}: {clean(msg, 300).rstrip('.')}. Trying again in {int(wait // 60) or 1} min.")
            done.append(f"failed {plan}")
            st["last"] = now - max(5, every) * 60 + wait
        st["seen"] = mtime
        if beat:
            beat()
    return done


def own_copy() -> str:
    return os.path.join(CONFIG_DIR, "bin", "sightline-jira-sync.py")


def warn_if_shared() -> None:
    here = os.path.normcase(os.path.abspath(__file__))
    if here != os.path.normcase(own_copy()):
        print(f"Note: this script is running from {os.path.dirname(here)}. Anyone who can edit that folder could change it, "
              "and it runs with your Jira token. Run `install` to use your own copy instead.", file=sys.stderr)


def cmd_watch(args) -> None:
    cfg = load_config()
    saved = cfg.get("plans") if isinstance(cfg.get("plans"), dict) else {}
    plans = [plan_key(p) for p in args.plans] if args.plans else list(saved)
    if not plans:
        raise SystemExit('Nothing to watch yet. Save a plan first: sync "path\\to\\plan.json" --board 123 --save')
    unsaved = [p for p in plans if p not in saved]
    if unsaved:
        raise SystemExit(f"Save these first with sync --save: {', '.join(unsaved)}")
    warn_if_shared()
    if not take_watch_lock(time.time()):
        raise SystemExit(lock_held_msg(time.time()))
    print(f"Watching {len(plans)} plan(s). Each syncs on its schedule, and within a minute of being saved. Ctrl+C stops.")
    state = {}

    def beat() -> None:
        if not take_watch_lock(time.time(), settle=0):
            raise SystemExit("Another watch took over on this computer; this one is stopping.")

    try:
        while True:
            beat()
            try:
                cfg = load_config()
            except (SystemExit, Exception) as e:
                print(f"[watch] Couldn't read the settings: {e}")
                time.sleep(WATCH_TICK)
                continue
            watch_tick(cfg, plans, state, time.time(), beat=beat)
            time.sleep(WATCH_TICK)
    except KeyboardInterrupt:
        print("Stopped watching.")
    finally:
        release_watch_lock()


def startup_dir() -> str | None:
    if sys.platform != "win32" or not os.environ.get("APPDATA"):
        return None
    return os.path.join(os.environ["APPDATA"], "Microsoft", "Windows", "Start Menu", "Programs", "Startup")


def launcher_text(python: str, script: str) -> str:
    q = lambda v: '"' + v.replace("%", "%%").replace('"', "") + '"'          # a .cmd file expands %VAR%; paths can't hold quotes
    return f'@echo off\r\nrem Sightline Jira sync: keeps your saved plans in sync. Remove this file to stop it starting.\r\nstart "Sightline Jira sync" /min {q(python)} {q(script)} watch\r\n'


def cmd_install(args) -> None:
    """Copy this script to your own folder (so a shared folder can't change what runs with your token), and start
    `watch` when you sign in to Windows."""
    dest = own_copy()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.normcase(os.path.abspath(__file__)) != os.path.normcase(dest):
        shutil.copyfile(os.path.abspath(__file__), dest)
    print(f"Your copy of the sync: {dest}")
    sd = startup_dir()
    if sd and not args.no_startup:
        os.makedirs(sd, exist_ok=True)
        path = os.path.join(sd, "Sightline Jira sync.cmd")
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(launcher_text(sys.executable, dest))
        print(f"It starts when you sign in: {path}")
        print("Remove it with: uninstall")
    elif not sd:
        print(f"To keep it running, start it yourself: {sys.executable} \"{dest}\" watch")
    print("Run `sync PLAN ... --save` once per plan, and watch keeps them all in sync.")


def cmd_uninstall(_args) -> None:
    sd = startup_dir()
    path = os.path.join(sd, "Sightline Jira sync.cmd") if sd else None
    if path and os.path.exists(path):
        os.remove(path)
        print(f"Removed {path}. The sync won't start when you sign in.")
    else:
        print("Nothing starts the sync when you sign in.")


# ---------------- check-amendments: the page's amendment checker, offline ----------------
# The same strict rules Sightline uses before anything is applied (version 1: deliverables and Jira proposals). The page
# checks again when you apply, against the plan as it is then; this is for your assistant to check its own file first.
AM_MAX_BYTES, AM_MAX_CHANGES, AM_MAX_OPS, DV_MAX_KEYS = 512 * 1024, 100, 25, 200
AM_FIELDS = {"name": 120, "line": 300, "note": 4000, "source": 100, "kind": "kind", "stage": "stage", "target": "target", "date": "date",
             "release": "release", "lane": "lane", "owners": "people"}
AM_ID = re.compile(r"^(?!(?:__proto__|constructor|prototype|toString|valueOf|hasOwnProperty)$)[A-Za-z0-9._-]{1,80}$")
AM_DV_ID = re.compile(r"^dv-[A-Za-z0-9_-]{1,60}$")
TARGET_RE = re.compile(r"^(\d{4})(?:-(Q[1-4]|H[12]))?$")
PROPOSAL_FIELDS = ["sprint", "assignee", "points", "status", "labels+", "labels-"]
AM_IN_FIELDS = {"label": 120, "status": "status", "owners": "people", "lane": "lane", "start": "start", "weeks": "weeks"}
AM_TK_FIELDS = {"label": 120, "status": "status", "owners": "people", "start": "tstart", "days": "days"}
AM_BAR_ID, AM_TASK_ID = re.compile(r"^bar-[A-Za-z0-9_-]{1,60}$"), re.compile(r"^task-[A-Za-z0-9_-]{1,60}$")
STATUS_KEYS = ["notstarted", "inprogress", "done", "atrisk"]


# Actions ({op: "action", action, args}): the page's action table, by name and argument types. harness114 checks this
# table against the page's own. Offline, an action is checked for shape and references; its rules (loops, Jira dates,
# blacked-out time) are checked by the page, which runs it on a copy before showing it for review.
ACTIONS = {
    "initiative.add": ({"id": "id?", "lane": "id?", "parent": "id?", "start": "num?", "day": "iso?", "span": "num?", "label": "str?", "owners": "ids?", "tags": "ids?", "story": "str?"}, False),
    "initiative.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "initiative.setStatus": ({"id": "id", "status": "str"}, True),
    "initiative.move": ({"id": "id", "start": "num?", "day": "iso?", "span": "num?"}, True),
    "initiative.setLane": ({"id": "id", "lane": "id"}, True),
    "initiative.setParent": ({"id": "id", "parent": "idOrBlank"}, True),
    "initiative.place": ({"id": "id", "target": "id", "zone": "str"}, False),
    "initiative.del": ({"id": "id"}, False),
    "initiative.setEffort": ({"id": "id", "likely": "num?", "low": "num?", "high": "num?", "at": "iso?"}, True),
    "initiative.setScope": ({"id": "id", "scope": "str"}, True),
    "initiative.delivers.add": ({"id": "id", "outcome": "id"}, False),
    "initiative.delivers.remove": ({"id": "id", "outcome": "id"}, False),
    "task.add": ({"id": "id?", "bar": "id", "start": "iso", "days": "int?", "label": "str?", "owners": "ids?", "tags": "ids?", "story": "str?"}, False),
    "task.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "task.setStatus": ({"id": "id", "status": "str"}, True),
    "task.move": ({"id": "id", "start": "iso?", "days": "int?"}, True),
    "task.moveTo": ({"id": "id", "bar": "id"}, True),
    "task.link": ({"id": "id", "after": "id"}, False),
    "task.unlink": ({"id": "id", "after": "id"}, False),
    "task.del": ({"id": "id"}, False),
    "outcome.add": ({"id": "id?", "name": "str", "source": "str?", "target": "str?", "release": "id?", "date": "iso?", "jira": "keys?"}, False),
    "outcome.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "outcome.setTarget": ({"id": "id", "target": "str?", "date": "iso?"}, True),
    "outcome.setRelease": ({"id": "id", "release": "idOrBlank"}, True),
    "outcome.linkJira": ({"id": "id", "keys": "keys"}, False),
    "outcome.unlinkJira": ({"id": "id", "key": "str"}, False),
    "outcome.drop": ({"id": "id", "reason": "str?"}, False),
    "outcome.del": ({"id": "id"}, True),
    "link.add": ({"id": "id", "after": "id"}, False),
    "link.remove": ({"id": "id", "after": "id"}, False),
    "initiative.waitFor": ({"id": "id", "gate": "id"}, False),
    "initiative.unwait": ({"id": "id", "gate": "id"}, False),
    "workstream.add": ({"id": "id?", "name": "str", "members": "ids?", "color": "str?"}, False),
    "workstream.rename": ({"id": "id", "name": "str"}, True),
    "workstream.addMember": ({"id": "id", "person": "id"}, False),
    "workstream.removeMember": ({"id": "id", "person": "id"}, False),
    "workstream.setReserve": ({"id": "id", "reserve": "any"}, True),
    "workstream.set": ({"id": "id", "field": "str", "value": "str"}, True),
    "workstream.move": ({"id": "id", "index": "int"}, True),
    "workstream.del": ({"id": "id"}, False),
    "guide.set": ({"section": "str", "value": "str"}, True),
    "guide.setWorkstream": ({"lane": "id", "value": "str"}, True),
    "template.set": ({"kind": "str", "value": "str"}, True),
    "skill.add": ({"id": "id", "label": "str"}, False),
    "skill.rename": ({"id": "id", "label": "str"}, True),
    "skill.remove": ({"id": "id"}, False),
    "meeting.set": ({"id": "id", "field": "str", "value": "str"}, True),
    "person.add": ({"id": "id?", "name": "str", "role": "str?", "days": "int?", "outside": "any?"}, False),
    "person.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "person.setAlloc": ({"id": "id", "alloc": "any"}, True),
    "person.setSplit": ({"id": "id", "lanes": "weights"}, True),
    "person.timeOff.add": ({"id": "id", "from": "iso", "to": "iso?", "note": "str?"}, False),
    "person.timeOff.del": ({"id": "id", "from": "iso"}, False),
    "holiday.add": ({"date": "iso", "name": "str?"}, False),
    "holiday.addRange": ({"from": "iso", "to": "iso", "name": "str?"}, False),
    "holiday.del": ({"date": "iso"}, False),
    "forecast.setReserve": ({"reserve": "any"}, True),
    "milestone.add": ({"id": "id?", "what": "str", "day": "iso?", "lane": "id?", "status": "str?", "owners": "ids?", "after": "ids?"}, False),
    "milestone.move": ({"id": "id", "day": "isoOrNull", "stretch": "any?"}, True),
    "milestone.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "milestone.doneWhen.add": ({"id": "id", "bar": "id"}, False),
    "milestone.doneWhen.remove": ({"id": "id", "bar": "id"}, False),
    "milestone.del": ({"id": "id"}, False),
    "gate.add": ({"id": "id?", "gate": "str", "day": "iso?", "label": "str?", "blocks": "str?", "owners": "ids?"}, False),
    "gate.move": ({"id": "id", "day": "str"}, True),
    "gate.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "gate.del": ({"id": "id"}, False),
    "sprint.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "sprint.add": ({"id": "id", "name": "str?", "goal": "str?"}, False),
    "sprint.addThrough": ({"date": "iso"}, False),
    "jira.toWorkstream": ({"keys": "keys", "lane": "id", "epic": "str?"}, False),
    "jira.toInitiative": ({"keys": "keys", "id": "id", "epic": "str?"}, False),
    "jira.notOurs": ({"keys": "keys"}, False),
    "jira.epicLink": ({"epic": "str", "id": "id"}, False),
    "jira.epicNew": ({"epic": "str", "lane": "id", "id": "id?"}, False),
    "risk.add": ({"id": "id?", "text": "str", "sev": "any?", "state": "any?", "owners": "any?", "item": "any?", "next": "any?", "waitingOn": "any?", "escalateBy": "any?", "aiHint": "any?"}, False),
    "risk.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "risk.del": ({"id": "id"}, False),
    "decision.add": ({"id": "id?", "text": "str", "state": "any?", "owners": "any?", "item": "any?", "due": "any?", "decider": "any?", "next": "any?", "waitingOn": "any?", "escalateBy": "any?", "aiHint": "any?"}, False),
    "decision.set": ({"id": "id", "field": "str", "value": "any"}, True),
    "decision.del": ({"id": "id"}, False),
}
ACT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,79}$")
# What an id-like argument points at, by the action's first word (id) or the argument's own name.
ACT_REF_BY_NOUN = {"initiative": "bar", "link": "bar", "task": "task", "outcome": "dv", "workstream": "lane", "person": "person", "skill": "skill", "meeting": "meeting",
                   "milestone": "ms", "gate": "gate", "risk": "risk", "decision": "dec", "sprint": "sprint", "jira": "bar"}
ACT_REF_BY_ARG = {"outcome": "dv", "after": "bar", "parent": "bar", "target": "bar", "bar": "bar", "lane": "lane", "person": "person",
                  "owners": "person", "members": "person", "item": "bar", "decider": "person"}


def _act_type_ok(t: str, v) -> bool:
    if t == "id":
        return isinstance(v, str) and bool(ACT_ID.match(v))
    if t == "isoOrNull":
        return v is None or _act_type_ok("iso", v)
    if t == "idOrBlank":
        return v == "" or _act_type_ok("id", v)
    if t == "ids":
        return isinstance(v, list) and len(v) <= 500 and all(_act_type_ok("id", x) for x in v)
    if t == "str":
        return isinstance(v, str) and len(v) <= 4000
    if t == "num":
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf")
    if t == "int":
        return isinstance(v, int) and not isinstance(v, bool)
    if t == "iso":
        return _valid_iso(v)
    if t == "keys":
        return isinstance(v, list) and len(v) <= 500 and all(isinstance(k, str) and len(k) <= 40 for k in v)
    if t == "any":
        return v is None or isinstance(v, bool) or _act_type_ok("num", v) or _act_type_ok("str", v) or _act_type_ok("ids", v)
    if t == "weights":
        return v is None or (isinstance(v, dict) and len(v) <= 20 and all(_act_type_ok("id", k) and _act_type_ok("int", x) for k, x in v.items()))
    return False


def _valid_iso(v) -> bool:
    if not isinstance(v, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return False
    try:
        return _dt.date.fromisoformat(v).isoformat() == v
    except ValueError:
        return False


def check_action_op(o, at: str, ids: dict, made: dict) -> str:
    """Shape, types and references for one action op; '' when fine. made collects ids the change creates."""
    name, args = o.get("action"), o.get("args")
    if not isinstance(name, str) or name not in ACTIONS:
        return f'{at}: "{str(name)[:40]}" isn\'t an action (the context file lists them under actions)'
    extra = [k for k in o if k not in ("op", "action", "args")]
    if extra:
        return f"{at}: an action op has op, action and args (not {', '.join(str(k)[:20] for k in extra)})"
    if not isinstance(args, dict):
        return f"{at}: {name} needs args, an object"
    spec, has_prev = ACTIONS[name]
    for k in args:
        if k not in spec and not (k == "prev" and has_prev):
            return f"{at}: {name} has no argument called {str(k)[:30]}."
    for k, t in spec.items():
        opt, ty = t.endswith("?"), t.rstrip("?")
        if k not in args:
            if opt:
                continue
            return f"{at}: {name} needs {k}."
        if not _act_type_ok(ty, args[k]):
            return f"{at}: {k} isn't a valid {'date (YYYY-MM-DD)' if ty in ('iso', 'isoOrNull') else 'list' if ty in ('ids', 'keys') else 'id' if ty == 'id' else 'number' if ty in ('num', 'int') else 'split ({workstream id: weight})' if ty == 'weights' else 'value'}."
    noun, verb = name.split(".", 1)
    creates = verb == "add" and noun not in ("link",)
    if name == "jira.epicNew" and isinstance(args.get("id"), str) and args["id"]:      # its id is optional: the page makes a stable one from the epic key
        made.setdefault("bar", set()).add(args["id"])
    if creates and "id" in spec and not (isinstance(args.get("id"), str) and args["id"]):
        return f"{at}: give the new item an id (like risk-vendor-limits), so reading the file again can't add it twice"
    for k, v in args.items():
        kind = ACT_REF_BY_NOUN.get(noun) if k == "id" else ACT_REF_BY_ARG.get(k)
        if name == "task.link" or name == "task.unlink":
            kind = "task" if k in ("id", "after") else kind
        if name in ("task.add", "task.moveTo") and k == "bar":
            kind = "bar"
        if name == "initiative.waitFor" and k == "gate":
            kind = "gate|block"
        if not kind or (k == "id" and (creates or name == "jira.epicNew")) or name.endswith(".remove") and k != "id" or name in ("link.remove", "initiative.unwait", "task.unlink", "milestone.doneWhen.remove", "workstream.removeMember", "outcome.unlinkJira") and k != "id":
            continue
        vals = v if isinstance(v, list) else [v]
        for x in vals:
            if x == "" or not isinstance(x, str):
                continue
            if not any(x in ids.get(kd, set()) or x in made.get(kd, set()) for kd in kind.split("|")):
                return f"{at}: {x[:60]} isn't in the plan (for {k})"
    if noun == "jira" and isinstance(args.get("keys"), list) and len({str(k).strip().upper() for k in args["keys"]}) > 100:
        return f"{at}: one change places up to 100 issues"
    if creates and isinstance(args.get("id"), str):
        made.setdefault(ACT_REF_BY_NOUN.get(noun, noun), set()).add(args["id"])
    return ""


def _plan_ids(plan) -> dict:
    bars = [b for b in plan.get("bars") or [] if isinstance(b, dict)]
    pick = lambda key: {x.get("id") for x in plan.get(key) or [] if isinstance(x, dict)}
    return {"bar": {b.get("id") for b in bars}, "task": {t.get("id") for b in bars for t in b.get("tasks") or [] if isinstance(t, dict)},
            "dv": pick("deliverables"), "lane": pick("lanes"), "person": pick("people"), "ms": pick("milestones"), "gate": pick("gates"),
            "block": pick("blocks"), "risk": pick("risks"), "dec": pick("decisions"), "sprint": pick("sprints"), "skill": pick("skills"), "meeting": pick("meetings")}


def _plan_start(plan) -> _dt.date:
    return _dt.date.fromisoformat((plan.get("meta") or {}).get("start"))


def _week_iso(plan, w) -> str:
    # the page's Math.round: halves round up (Python's round() rounds them to even)
    return (_plan_start(plan) + _dt.timedelta(days=int((w * 7 + 0.5) // 1))).isoformat()


def _iso_week(plan, iso) -> float:
    d = _dt.date.fromisoformat(iso)
    return ((d - _dt.timedelta(days=d.weekday())) - _plan_start(plan)).days / 7


def _item_err(fields, field, v, plan) -> str:
    t = fields.get(field)
    if t is None:
        return f'"{str(field)[:30]}" can\'t be changed by an amendment'
    if not _plain(v) or v is None:
        return "" if field == "owners" and v is None else f"{field} can't be empty"
    if isinstance(t, int):
        return f"{field} must be text" if not isinstance(v, str) or not v.strip() else f"{field} is longer than {t} characters" if len(v) > t else ""
    if t == "status":
        return "" if v in STATUS_KEYS else "status must be " + ", ".join(STATUS_KEYS)
    if t == "people":
        ids = {p.get("id") for p in plan.get("people") or [] if isinstance(p, dict)}
        return "" if isinstance(v, list) and all(x in ids for x in v) else "owners must be ids of people in the plan"
    if t == "lane":
        return "" if any(isinstance(l, dict) and l.get("id") == v for l in plan.get("lanes") or []) else f'workstream "{str(v)[:40]}" isn\'t in the plan'
    weeks = (plan.get("meta") or {}).get("weeks") or 0
    if t == "start":
        if not _iso_ok(v):
            return "start must be YYYY-MM-DD"
        w = _iso_week(plan, v)
        return "start is outside the plan's dates" if w < 0 or w >= weeks else ""
    if t == "tstart":
        if not _iso_ok(v):
            return "start must be YYYY-MM-DD"
        d, a = _dt.date.fromisoformat(v), _plan_start(plan)
        return "start is outside the plan's dates" if d < a or (d - a).days > weeks * 7 else "start is a weekend" if d.weekday() >= 5 else ""
    if t == "weeks":
        return "" if isinstance(v, (int, float)) and not isinstance(v, bool) and 0.5 <= v <= 104 and round(v * 2) == v * 2 else "weeks must be a number from 0.5 to 104, in halves"
    if t == "days":
        return "" if isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 260 else "days must be a whole number from 1 to 260"
    return ""


def _iso_ok(v) -> bool:
    if not isinstance(v, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return False
    try:
        _dt.date.fromisoformat(v)
        return True
    except ValueError:
        return False


def _plain(v) -> bool:
    return v is None or isinstance(v, (str, int, float, bool)) or (isinstance(v, list) and len(v) <= DV_MAX_KEYS and all(isinstance(x, str) and len(x) <= 120 for x in v))


def _value_err(field, v, plan, status) -> str:
    t = AM_FIELDS.get(field)
    if t is None:
        return f'"{str(field)[:30]}" can\'t be changed by an amendment'
    if not _plain(v):
        return f"{field} must be plain text, a number, a short list or null"
    if v is None:
        return "a deliverable needs a name" if field == "name" else ""
    if isinstance(t, int):
        return f"{field} must be text" if not isinstance(v, str) or not v.strip() else f"{field} is longer than {t} characters" if len(v) > t else ""
    if t == "kind":
        return "" if v in ("new", "improved", "fixed") else "kind must be new, improved or fixed"
    if t == "stage":
        return "" if v in ("idea", "planned", "done", "dropped") else "stage must be idea, planned, done or dropped"
    if t == "target":
        return "" if isinstance(v, str) and (TARGET_RE.match(v) or v == "later") else "target must be like 2027, 2027-H1, 2027-Q2, or later"
    if t == "date":
        return "" if _iso_ok(v) else "date must be YYYY-MM-DD"
    if t == "release":
        return "" if any(str(r.get("id")) == str(v) for r in status.get("releases") or [] if isinstance(r, dict)) else f"release {str(v)[:30]} isn't in the last Jira sync"
    if t == "lane":
        return "" if any(isinstance(l, dict) and l.get("id") == v for l in plan.get("lanes") or []) else f'workstream "{str(v)[:40]}" isn\'t in the plan'
    if t == "people":
        ids = {p.get("id") for p in plan.get("people") or [] if isinstance(p, dict)}
        return "" if isinstance(v, list) and all(x in ids for x in v) else "owners must be ids of people in the plan"
    return ""


def am_parse(text: str, plan: dict) -> tuple[dict | None, str]:
    if len(text.encode("utf-8")) > AM_MAX_BYTES:
        return None, f"The amendments file is over {AM_MAX_BYTES // 1024} KB."
    def no_constant(c):
        raise ValueError(f"{c} isn't allowed in JSON")
    try:
        # the page's JSON.parse refuses NaN and Infinity, so this does too
        o = json.loads(text, parse_constant=no_constant)
    except ValueError as e:
        return None, "The amendments file isn't valid JSON: " + str(e)[:120]
    if not isinstance(o, dict) or o.get("kind") != "sightline-amendments":
        return None, 'This isn\'t a Sightline amendments file: "kind" should be "sightline-amendments".'
    if o.get("version") != 1:
        return None, f"This amendments file is version {str(o.get('version'))[:10]}; this checker reads version 1."
    pid = (plan.get("meta") or {}).get("planId")
    if o.get("planId") != pid:
        return None, f"These amendments were written for another plan ({str(o.get('planId'))[:40]}); this plan is {pid}."
    if not AM_ID.match(str(o.get("batchId") or "")):
        return None, "batchId is missing, or has characters other than letters, digits, . _ and -."
    ch = o.get("changes")
    if not isinstance(ch, list):
        return None, "changes must be a list."
    if len(ch) > AM_MAX_CHANGES:
        return None, f"That's {len(ch)} changes; a file holds up to {AM_MAX_CHANGES}."
    ids = set()
    for c in ch:
        if not isinstance(c, dict) or not AM_ID.match(str(c.get("id") or "")):
            return None, "Every change needs an id (letters, digits, . _ and -)."
        if c["id"] in ids:
            return None, f'Two changes share the id "{c["id"]}".'
        ids.add(c["id"])
        ops = c.get("ops")
        if not isinstance(ops, list) or not ops or len(ops) > AM_MAX_OPS:
            return None, f'Change "{c["id"]}" needs 1 to {AM_MAX_OPS} ops.'
        if c.get("reason") is not None and not isinstance(c.get("reason"), str):
            return None, f'Change "{c["id"]}": reason is one line of text.'
        if c.get("confidence") is not None and c.get("confidence") not in ("high", "low"):
            return None, f'Change "{c["id"]}": confidence is "high" or "low".'
    return o, ""


def _am_item(o, at, plan, made_bars, made_tasks) -> str:
    """One initiative or task op: "" (nothing to do), "todo", "stale:<why>", or an error. Mirrors the page."""
    is_in = o.get("type") == "initiative"
    fields, i = (AM_IN_FIELDS if is_in else AM_TK_FIELDS), str(o.get("id") or "")
    bars = [b for b in plan.get("bars") or [] if isinstance(b, dict)]

    def bar_of(x):
        return made_bars.get(x) or next((b for b in bars if b.get("id") == x), None)

    def task_of(x):
        if x in made_tasks:
            return made_tasks[x]
        for b in bars:
            for t in b.get("tasks") or []:
                if isinstance(t, dict) and t.get("id") == x:
                    return t, b
        return None

    def kids(b):
        return any(x.get("parent") == b.get("id") for x in bars)
    if o.get("op") == "add":
        v = o.get("value")
        if not (AM_BAR_ID if is_in else AM_TASK_ID).match(i):
            return f"{at}: a new {o.get('type')}'s id must start with {'bar-' if is_in else 'task-'} (letters, digits, _ and -)"
        if bar_of(i) or task_of(i):
            return f"{at}: the id {i} is already in the plan"
        if not isinstance(v, dict):
            return f"{at}: add needs a value object"
        allowed = list(AM_IN_FIELDS) if is_in else [*AM_TK_FIELDS, "initiative"]
        extra = [k for k in v if k not in allowed and k != "id"]
        if extra:
            return f"{at}: can't set " + ", ".join(k[:20] for k in extra)
        need = ["label", "lane", "start", "weeks"] if is_in else ["initiative", "label", "start", "days"]
        miss = [k for k in need if v.get(k) is None]
        if miss:
            return f"{at}: a new {o.get('type')} needs " + ", ".join(miss)
        for k, x in v.items():
            if k in ("id", "initiative"):
                continue
            e = _item_err(fields, k, x, plan)
            if e:
                return f"{at}: {e}"
        if is_in:
            made_bars[i] = {"id": i, "lane": v["lane"], "start": _iso_week(plan, v["start"]), "span": v["weeks"], "label": v["label"], "jira": "", "epics": [], "tasks": [],
                            "status": v.get("status") or "notstarted", "owners": v.get("owners") or []}
            return "todo"
        b = bar_of(str(v.get("initiative")))
        if not b:
            return f"{at}: there's no initiative {str(v.get('initiative'))[:60]} in the plan"
        if kids(b):
            return f"{at}: {b.get('label')} holds other initiatives, so tasks go on those"
        made_tasks[i] = ({"id": i, "label": v["label"], "start": v["start"], "days": v["days"], "status": v.get("status") or "notstarted", "owners": v.get("owners") or []}, b)
        return "todo"
    if o.get("op") != "set":
        return f'{at}: an {o.get("type")} can be added or set (not "{str(o.get("op"))[:20]}")'
    if is_in:
        hit, host = bar_of(i), None
    else:
        ht = task_of(i)
        hit, host = (ht[0], ht[1]) if ht else (None, None)
    if not hit:
        return f"{at}: there's no {o.get('type')} {i[:60]} in the plan"
    f = str(o.get("field") or "")
    e = _item_err(fields, f, o.get("value"), plan)
    if e:
        return f"{at}: {e}"
    jl = bool(hit.get("jira") or (is_in and hit.get("epics")))
    name = hit.get("label") or ("Task" if not is_in else "Untitled item")
    if jl and f in ("status", "start", "weeks", "days"):
        return f"{at}: {name}: {'its status comes' if f == 'status' else 'its dates come'} from Jira: propose it in Jira instead"
    if is_in and f in ("start", "weeks") and (kids(hit) or (hit.get("tasks") and hit.get("datesFrom") == "tasks")):
        return f"{at}: {name}: its dates come from " + ("the initiatives inside it" if kids(hit) else "its tasks")
    if is_in and f == "status" and (hit.get("tasks") or kids(hit)):
        return f"{at}: {name}: its status comes from " + ("the initiatives inside it" if kids(hit) else "its tasks")
    if "prev" not in o:
        return f"{at}: a set needs prev, the value it expects now"
    if not _plain(o["prev"]):
        return f"{at}: prev must be plain text, a number, a short list or null"
    if is_in:
        now = _week_iso(plan, hit.get("start") or 0) if f == "start" else hit.get("span") if f == "weeks" else (hit.get("owners") or []) if f == "owners" else hit.get(f)
    else:
        now = (hit.get("owners") or []) if f == "owners" else hit.get(f)
    if now == o.get("value"):
        return ""
    if now != o["prev"]:
        return f"stale:Changed since: {name}'s {f} was expected to be {o['prev']!r}; it's now {now!r}."
    if i in made_bars or i in made_tasks:
        if is_in and f == "start":
            hit["start"] = _iso_week(plan, o["value"])
        elif is_in and f == "weeks":
            hit["span"] = o["value"]
        else:
            hit[f] = o["value"]
        return ""
    return "todo"


def am_check(c: dict, plan: dict, status: dict, earlier: dict | None = None) -> dict:
    """One change against the plan: {status: ready|changed|invalid|done, reasons, notes}. Mirrors the page's amCheck.
    earlier: ids that earlier changes in the batch add, by kind; an action may refer to them (the page applies in order)."""
    bad, stale, notes, made, todo, made_bars, made_tasks = [], [], [], {}, 0, {}, {}
    dvs = [d for d in plan.get("deliverables") or [] if isinstance(d, dict)]
    issues = status.get("issues") or {}

    def dv(i):
        return made.get(i) or next((d for d in dvs if d.get("id") == i), None)

    plan_ids, act_made = _plan_ids(plan), {k: set(v) for k, v in (earlier or {}).items()}
    for n, o in enumerate(c["ops"], 1):
        at = f"op {n}"
        if not isinstance(o, dict):
            bad.append(f"{at} isn't an object")
            continue
        if o.get("op") == "action":
            why = check_action_op(o, at, plan_ids, act_made)
            if why:
                bad.append(why)
            else:
                todo += 1
                notes.append("Sightline checks each action's own rules (loops, Jira dates, blacked-out time) when it reads the file.")
            continue
        if o.get("op") == "propose":
            k, f = str(o.get("key") or "").upper(), o.get("field")
            if not KEY_RE.match(k):
                bad.append(f'{at}: "{str(o.get("key"))[:30]}" isn\'t a Jira key')
                continue
            if f not in PROPOSAL_FIELDS:
                bad.append(f'{at}: Jira field "{str(f)[:20]}" can\'t be proposed (use {", ".join(PROPOSAL_FIELDS)})')
                continue
            v = o.get("value")
            if isinstance(v, bool) or not isinstance(v, (str, int, float)) or len(str(v)) > 120:
                bad.append(f"{at}: the proposed value must be short text or a number")
                continue
            if f == "sprint" and not any(str(x.get("id")) == str(v) or x.get("name") == v for x in status.get("sprints") or [] if isinstance(x, dict)):
                bad.append(f'{at}: sprint "{str(v)[:40]}" isn\'t in the last Jira sync')
                continue
            if f == "assignee" and not any(isinstance(j, dict) and v in (j.get("assigneeKey"), j.get("assigneeUser"), j.get("assignee")) and j.get("assigneeKey") for j in issues.values()):
                bad.append(f'{at}: "{str(v)[:40]}" isn\'t a Jira user in the last sync')
                continue
            if f == "points" and (isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v in (float("inf"), float("-inf"))):
                bad.append(f"{at}: points must be a number")
                continue
            if k not in issues:
                notes.append(f"{k} isn't in the last Jira sync")
            if f == "sprint":
                sp = next(x for x in status.get("sprints") or [] if isinstance(x, dict) and (str(x.get("id")) == str(v) or x.get("name") == v))
                same = lambda x: isinstance(x, dict) and x.get("id") == sp.get("id")
            elif f == "assignee":
                key = next(j.get("assigneeKey") for j in issues.values() if isinstance(j, dict) and v in (j.get("assigneeKey"), j.get("assigneeUser"), j.get("assignee")) and j.get("assigneeKey"))
                same = lambda x: isinstance(x, dict) and x.get("key") == key
            else:
                same = lambda x: not isinstance(x, dict) and str("" if x is None else x) == str(v)
            if any(isinstance(x, dict) and x.get("key") == k and x.get("field") == f and same(x.get("value")) and (x.get("review") or {}).get("state") == "proposed" for x in plan.get("proposals") or []):
                continue
            todo += 1
            continue
        if o.get("type") in ("initiative", "task"):
            e = _am_item(o, at, plan, made_bars, made_tasks)
            if e == "todo":
                todo += 1
            elif e.startswith("stale:"):
                stale.append(e[6:])
            elif e:
                bad.append(e)
            continue
        if o.get("type") != "deliverable":
            bad.append(f'{at}: amendments cover deliverables, initiatives and tasks (type "deliverable", "initiative" or "task")')
            continue
        i = str(o.get("id") or "")
        if o.get("op") == "add":
            v = o.get("value")
            if not AM_DV_ID.match(i):
                bad.append(f"{at}: a new deliverable's id must start with dv- (letters, digits, _ and -)")
            elif i in made:
                bad.append(f"{at}: {i} is added twice in this change")
            elif not isinstance(v, dict):
                bad.append(f"{at}: add needs a value object")
            elif [k for k in v if k not in ("id", "jira") and k not in AM_FIELDS]:
                bad.append(f"{at}: can't set " + ", ".join(k[:20] for k in v if k not in ("id", "jira") and k not in AM_FIELDS))
            elif v.get("id") is not None and v.get("id") != i:
                bad.append(f"{at}: value.id doesn't match id")
            else:
                err = ""
                for k, x in v.items():
                    if k == "id":
                        continue
                    if k == "jira":
                        if not isinstance(x, list) or len(x) > DV_MAX_KEYS or not all(isinstance(y, str) and KEY_RE.match(y.upper()) for y in x):
                            err = f"{at}: jira must be a list of up to {DV_MAX_KEYS} Jira keys"
                            break
                        continue
                    e = _value_err(k, x, plan, status)
                    if e:
                        err = f"{at}: {e}"
                        break
                if not err and not v.get("name"):
                    err = f"{at}: a deliverable needs a name"
                if err:
                    bad.append(err)
                    continue
                d = {"id": i, "stage": "idea", **{k: ([y.upper() for y in x] if k == "jira" else x) for k, x in v.items() if k != "id" and x is not None}}
                cur = next((x for x in dvs if x.get("id") == i), None)
                if cur:
                    same = all((k == "stage" and "stage" not in v) or cur.get(k) == d[k] for k in d)
                    if not same:
                        bad.append(f'{at}: the id {i} is already used by "{cur.get("name")}" with other details')
                    continue
                made[i] = d
                todo += 1
            continue
        d = dv(i)
        if not d:
            bad.append(f"{at}: there's no deliverable {i[:60]} in the plan")
            continue
        if o.get("op") == "set":
            f = str(o.get("field") or "")
            if f == "jira":
                bad.append(f"{at}: use link or unlink for Jira work")
                continue
            e = _value_err(f, o.get("value"), plan, status)
            if e:
                bad.append(f"{at}: {e}")
                continue
            if "prev" not in o:
                bad.append(f"{at}: a set needs prev, the value it expects now (null when it's empty)")
                continue
            if not _plain(o["prev"]):
                bad.append(f"{at}: prev must be plain text, a number, a short list or null")
                continue
            cur, want = d.get(f), o.get("value")
            if cur == want:
                continue
            if cur != o["prev"]:
                stale.append(f"Changed since: {d.get('name') or i}'s {f} was expected to be {o['prev']!r}; it's now {cur!r}.")
                continue
            todo += 1
            if i in made:
                if want is None:
                    d.pop(f, None)
                else:
                    d[f] = want
            continue
        if o.get("op") in ("link", "unlink"):
            ks = [str(k).upper() for k in o.get("jira")] if isinstance(o.get("jira"), list) else []
            if not ks or len(ks) > DV_MAX_KEYS or not all(KEY_RE.match(k) for k in ks):
                bad.append(f"{at}: {o['op']} needs jira, a list of Jira keys")
                continue
            have = set(d.get("jira") or [])
            change = [k for k in ks if (k not in have) == (o["op"] == "link")]
            if o["op"] == "link" and len(have) + len(change) > DV_MAX_KEYS:
                bad.append(f"{at}: that would link {len(have) + len(change)} Jira issues; a deliverable links up to {DV_MAX_KEYS}")
                continue
            notes.extend(f"{k} isn't in the last Jira sync" for k in ks if k not in issues)
            if change:
                todo += 1
            continue
        bad.append(f'{at}: "{str(o.get("op"))[:20]}" isn\'t an amendment (use add, set, link, unlink, propose or action)')
    st = "invalid" if bad else "changed" if stale else "ready" if todo else "done"
    if earlier is not None and st != "invalid":
        for k, v in act_made.items():
            earlier.setdefault(k, set()).update(v)
    return {"id": c["id"], "summary": str(c.get("summary") or "")[:200], "status": st, "reasons": bad + stale, "notes": list(dict.fromkeys(notes))}


# What this offline check covers, and what only the page can check (it has the live plan, Jira and the person's choices).
AM_CHECKED = ["the file's shape and ids", "action names and their arguments", "that every id an action uses is in the plan or added by an earlier change in this batch",
              "deliverable, initiative and task fields, values and prev"]
AM_NOT_CHECKED = ["each action's own rules (loops, Jira-owned dates and status, blacked-out time, limits)", "prev for actions",
                  "what an earlier change in this batch sets", "review and apply-on-its-own holds", "unsaved edits in the open page"]


def semver(v) -> tuple:
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", str(v or ""))
    return tuple(int(x) for x in m.groups()) if m else ()


def version_gate(plan: dict, amendments_path: str, context_path: str | None) -> None:
    """Refuse when the page this copy matches isn't the one that wrote the context, or the plan is newer than it."""
    if not PAGE_VERSION:
        return
    ctx = context_path or os.path.join(os.path.dirname(os.path.abspath(amendments_path)), CONTEXT_FILE)
    try:
        with open(ctx, encoding="utf-8") as f:
            found = (json.load(f) or {}).get("appVersion")
    except (OSError, ValueError, AttributeError):
        found = None
    if found and found != PAGE_VERSION:
        raise SystemExit(f"This sightline-jira-sync.py matches Sightline {PAGE_VERSION}, but {os.path.basename(ctx)} was written by Sightline {found}. "
                         "Its actions may differ, so nothing was checked. Use the scripts published beside that page (their .sha256 files say whether the copies are intact).")
    saved = (plan.get("meta") or {}).get("savedWith")
    if semver(saved) and semver(saved) > semver(PAGE_VERSION):
        raise SystemExit(f"This sightline-jira-sync.py matches Sightline {PAGE_VERSION}, but the plan was saved with Sightline {saved}. "
                         "Nothing was checked. Use the scripts published beside the newer page.")


def cmd_check_amendments(args) -> None:
    plan_path = os.path.abspath(args.plan)
    check_plan(plan_path, args.plan)
    try:
        with open(plan_path, encoding="utf-8") as f:
            plan = json.load(f)
    except (OSError, ValueError) as e:
        raise SystemExit(f"Can't read the plan {args.plan}: {e}")
    check_plan_format(plan)
    version_gate(plan, args.amendments, args.context)
    try:
        with open(args.amendments, encoding="utf-8") as f:
            text = f.read(AM_MAX_BYTES + 1)
    except OSError as e:
        raise SystemExit(f"Can't read the amendments file {args.amendments}: {e}")
    status = prev_status(args.status or os.path.join(jira_folder(plan_path, None), "status.json"))
    o, err = am_parse(text, plan)
    if err:
        if args.json:
            print(json.dumps({"ok": False, "error": err}, indent=2))
        else:
            print("Can't use this file: " + err)
        raise SystemExit(2)
    earlier: dict = {}
    rows = [am_check(c, plan, status, earlier) for c in o["changes"]]
    counts = {k: sum(1 for r in rows if r["status"] == k) for k in ("ready", "changed", "invalid", "done")}
    if args.json:
        print(json.dumps({"ok": counts["invalid"] == 0, "matchesPage": PAGE_VERSION, "batchId": o["batchId"], "counts": counts, "changes": rows,
                          "checked": AM_CHECKED, "notCheckedHere": AM_NOT_CHECKED, "checkedWhen": "Sightline checks everything again, in order, when it applies the batch.",
                          "jiraSyncedAt": status.get("generatedAt"), "planRevision": (plan.get("meta") or {}).get("revision", 0)}, indent=2))
    else:
        label = {"ready": "READY  ", "changed": "CHANGED", "invalid": "INVALID", "done": "DONE   "}
        print(f"Checked with the rules of Sightline {PAGE_VERSION}." if PAGE_VERSION else "Checked with the rules in this source copy (not stamped with a page version).")
        for r in rows:
            print(f"{label[r['status']]} {r['id']}" + (f"  {r['summary']}" if r["summary"] else ""))
            for x in r["reasons"]:
                print(f"          {x}")
            for x in r["notes"]:
                print(f"          note: {x}")
        print(f"{counts['ready']} ready, {counts['changed']} changed since, {counts['invalid']} invalid, {counts['done']} already in the plan."
              + ("" if status else " No Jira sync found, so releases, sprints and assignees can't be checked."))
        print("Checked here: " + "; ".join(AM_CHECKED) + ".")
        print("Not checked here: " + "; ".join(AM_NOT_CHECKED) + ". Sightline checks those when it applies the batch, in order.")
    raise SystemExit(1 if counts["invalid"] else 0)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="Sync Jira Data Center status into a Sightline plan (read-only).")
    ap.add_argument("--version", action="version", version=f"sightline-jira-sync.py for Sightline {PAGE_VERSION}" if PAGE_VERSION else "sightline-jira-sync.py (source copy, not stamped with a page version)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    su = sub.add_parser("setup", help="add a Jira server: its address and your personal access token")
    su.add_argument("--jira", metavar="URL", help="the Jira address (asked if left out)")
    su.set_defaults(fn=cmd_setup)
    fg = sub.add_parser("forget", help="remove a Jira server's stored token")
    fg.add_argument("--jira", metavar="URL")
    fg.set_defaults(fn=cmd_forget)
    fl = sub.add_parser("fields", help="find your Jira's Epic Link, Sprint and Story Points fields")
    fl.add_argument("--jira", metavar="URL", help="which Jira, if you've set up more than one")
    fl.add_argument("--set", action="append", metavar="ROLE=customfield_NNN", help="set one yourself (repeatable)")
    fl.set_defaults(fn=cmd_fields)
    ins = sub.add_parser("inspect", help="print your Jira's statuses, resolutions, a board's sprints and sample issues")
    ins.add_argument("--jira", metavar="URL", help="which Jira, if you've set up more than one")
    ins.add_argument("--board", metavar="N", help="also list this Scrum board's sprints")
    ins.add_argument("--jql", metavar="SEARCH", help="also show a few issues from this search, with their raw field values")
    ins.add_argument("--sample", type=int, default=3, metavar="N", help="how many sample issues (default 3, at most 10)")
    ins.set_defaults(fn=cmd_inspect)
    s = sub.add_parser("sync", help="write the plan's Jira files into a jira folder beside it")
    s.add_argument("plan", help="the Sightline plan file (.json)")
    s.add_argument("--jira", metavar="URL", help="which Jira, if you've set up more than one")
    s.add_argument("--save", action="store_true", help="remember this plan's settings on this computer (for sync with no options, and watch)")
    s.add_argument("--accept-drop", action="store_true", help="write this sync even if it returns far fewer of the plan's Jira items than the last one")
    s.add_argument("--out", help="where to write the status file (default: jira/status.json beside the plan)")
    s.add_argument("--every", type=int, default=0, metavar="MINUTES", help="keep syncing every N minutes (5 or more)")
    g = s.add_mutually_exclusive_group()
    g.add_argument("--jql", metavar="SEARCH", help="also list the issues this Jira search finds")
    g.add_argument("--filter", metavar="ID", help="also list the issues in this saved Jira filter (its number)")
    s.add_argument("--search", action="append", metavar='"NAME=JQL"', help="a named search, repeatable: each shows as its own list in the Jira window")
    s.add_argument("--board", metavar="N", help="also read this Scrum board's sprints (the rapidView number), so the plan's sprints can follow Jira")
    s.add_argument("--folder", metavar="NAME", help="where the Jira files go (default: a jira folder beside the plan)")
    s.add_argument("--issues-out", metavar="PATH", help="where to write the search's issues (default: jira/issues.json beside the plan)")
    s.add_argument("--limit", type=int, default=None, metavar="N", help="most issues to keep from the search (default 500, at most 2000)")
    s.set_defaults(fn=cmd_sync)
    w = sub.add_parser("watch", help="keep saved plans in sync: on a schedule, and soon after a plan is saved")
    w.add_argument("plans", nargs="*", help="which saved plans (default: all of them)")
    w.set_defaults(fn=cmd_watch)
    i = sub.add_parser("install", help="use your own copy of this script, and start watch when you sign in")
    i.add_argument("--no-startup", action="store_true", help="just copy the script; don't start it at sign-in")
    i.set_defaults(fn=cmd_install)
    sub.add_parser("uninstall", help="stop the sync starting when you sign in").set_defaults(fn=cmd_uninstall)
    ca = sub.add_parser("check-amendments", help="check an assistant's amendments file against the plan, offline (the page checks again when you apply)")
    ca.add_argument("plan", help="the plan file (.json)")
    ca.add_argument("amendments", help="the amendments file your assistant wrote")
    ca.add_argument("--status", metavar="PATH", help="the Jira status file (default: jira/status.json beside the plan)")
    ca.add_argument("--json", action="store_true", help="print the result as JSON, for your assistant")
    ca.add_argument("--context", metavar="PATH", help=f"the page's assistant context (default: {CONTEXT_FILE} beside the amendments file)")
    ca.set_defaults(fn=cmd_check_amendments)
    args = ap.parse_args(argv)
    try:
        args.fn(args)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
