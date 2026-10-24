#!/usr/bin/env python3
"""Checks for tools/sightline-jira-sync.py. Standard library only.

    python3 test/test_jira_sync.py
"""
import getpass
import http.server
import importlib.util
import pathlib
import subprocess
import sys
import threading
import urllib.request
import time as _time

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("jirasync", HERE.parent / "tools" / "sightline-jira-sync.py")
js = importlib.util.module_from_spec(spec)
spec.loader.exec_module(js)

passed = failed = 0


def ok(name, cond):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("  FAIL", name)


def serve(handler):
    srv = http.server.HTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class Other(http.server.BaseHTTPRequestHandler):
    """A different origin. It must never see the token."""
    seen = []

    def do_GET(self):
        Other.seen.append(self.headers.get("Authorization"))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"issues":[]}')

    def log_message(self, *a):
        pass


other = serve(Other)
OTHER = f"http://127.0.0.1:{other.server_port}/steal"


class Jira(http.server.BaseHTTPRequestHandler):
    """Stands in for Jira, answering every request with a redirect to the other origin."""
    def do_GET(self):
        self.send_response(302)
        self.send_header("Location", OTHER)
        self.end_headers()

    def log_message(self, *a):
        pass


jira = serve(Jira)
BASE = f"http://127.0.0.1:{jira.server_port}"
TOKEN = "test-token-not-real"

# Control: a stock opener follows the redirect and hands the token to the other origin.
# If this ever stops happening, the check below no longer proves anything.
Other.seen.clear()
stock = urllib.request.build_opener()
stock.open(urllib.request.Request(BASE + "/x", headers={"Authorization": "Bearer " + TOKEN}), timeout=5).read()
ok("control: a stock opener leaks the token across a redirect", Other.seen == ["Bearer " + TOKEN])

# Search: refuses the redirect, exits with a clear message, and the other origin never sees the token.
Other.seen.clear()
try:
    js.jira_search(BASE, TOKEN, ["ABC-1"], opener=js.jira_opener())
    ok("search refuses a redirect", False)
except SystemExit as e:
    ok("search refuses a redirect", "redirect" in str(e).lower())
ok("search never sends the token to another origin", Other.seen == [])

# Even if some future caller follows redirects, the header is marked not to be copied onto one.
Other.seen.clear()
stock.open(js.auth_request(BASE + "/x", TOKEN), timeout=5).read()
ok("the Authorization header is never copied onto a redirect", Other.seen == [None])

# Quoting for `security -i`.
ok("quotes plain values", js._sq("abc") == '"abc"')
ok("escapes quote and backslash", js._sq('a"b\\c') == '"a\\"b\\\\c"')
try:
    js._sq("a\nb")
    ok("refuses a line break", False)
except SystemExit:
    ok("refuses a line break", True)

# macOS: the token goes in through stdin, round-trips exactly, and never appears in argv.
if sys.platform == "darwin":
    store = js.CredentialStore("sightline-selftest.invalid")
    secret = 'Ab+/9= x"y\\z'
    calls = []
    real_run = subprocess.run

    def spy(args, *a, **k):
        calls.append(list(args))
        return real_run(args, *a, **k)

    js.subprocess.run = spy
    try:
        store.save(secret)
    finally:
        js.subprocess.run = real_run
    ok("keychain: the token is not in any process argument", all(secret not in " ".join(c) for c in calls))
    ok("keychain: the token round-trips exactly", store.load() == secret)
    real_run(["security", "delete-generic-password", "-a", getpass.getuser(), "-s", store.target], capture_output=True)

# ---- search by filter: a fake Jira that answers searches in pages ----
import json as _json
import os as _os
import tempfile as _tempfile
import urllib.parse as _up


class Search(http.server.BaseHTTPRequestHandler):
    """Answers /rest/api/2/search. 250 issues match `project = ABC`; an unknown field gets Jira's 400."""
    calls = []

    def do_GET(self):
        u = _up.urlparse(self.path)
        q = dict(_up.parse_qsl(u.query))
        Search.calls.append((q, self.headers.get("Authorization")))
        if "bogus" in q.get("jql", ""):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(_json.dumps({"errorMessages": ["Field 'bogus' does not exist\nor you do not have permission"]}).encode())
            return
        if q.get("jql", "").startswith("key in"):
            keys = q["jql"][len("key in ("):-1].split(",")
            issues = [{"key": k, "fields": {"summary": "Planned " + k, "status": {"name": "Open", "statusCategory": {"key": "new"}}}} for k in keys]
            body = {"total": len(issues), "issues": issues}
        else:
            start, n = int(q.get("startAt", 0)), int(q.get("maxResults", 50))
            issues = [{"key": f"ABC-{i}", "fields": {"summary": f"Issue {i} <b>bold</b>", "issuetype": {"name": "Story"}, "priority": {"name": "High"},
                       "status": {"name": "In Progress", "statusCategory": {"key": "indeterminate"}}, "assignee": {"displayName": "Avery"}, "duedate": "2026-10-09"}}
                      for i in range(1 + start, 1 + min(250, start + n))]
            body = {"total": 250, "startAt": start, "issues": issues}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(_json.dumps(body).encode())

    def log_message(self, *a):
        pass


search = serve(Search)
SBASE = f"http://127.0.0.1:{search.server_port}"
http_opener = urllib.request.build_opener(js._RefuseRedirect())         # the fake Jira is plain http on localhost

found, order, total = js.jira_filter(SBASE, TOKEN, "project = ABC", 500, opener=http_opener)
ok("filter: pages through every match", len(order) == 250 and total == 250 and order[0] == "ABC-1" and order[-1] == "ABC-250")
ok("filter: asks in pages of 100", [c[0].get("startAt") for c in Search.calls] == ["0", "100", "200"])
ok("filter: sends the search exactly as given", all(c[0].get("jql") == "project = ABC" for c in Search.calls))
ok("filter: the token goes only as a Bearer header", all(c[1] == "Bearer " + TOKEN for c in Search.calls))
ok("filter: keeps the resolution name", js.shape_issue({"key": "ABC-9", "fields": {"resolution": {"name": "Won't Do"}}}, "https://j")[1]["resolution"] == "Won't Do")
ok("filter: keeps type and priority", found["ABC-1"]["type"] == "Story" and found["ABC-1"]["priority"] == "High")
ok("filter: Jira text is kept as text, not trusted", found["ABC-1"]["summary"] == "Issue 1 <b>bold</b>")

Search.calls.clear()
found, order, total = js.jira_filter(SBASE, TOKEN, "project = ABC", 120, opener=http_opener)
ok("filter: stops at --limit", len(order) == 120 and total == 250 and [c[0].get("maxResults") for c in Search.calls] == ["100", "20"])

try:
    js.jira_filter(SBASE, TOKEN, "bogus = 1", 500, opener=http_opener)
    ok("filter: a bad search says why", False)
except SystemExit as e:
    ok("filter: a bad search says why, on one line", "Field 'bogus' does not exist or you do not have permission" in str(e) and "\n" not in str(e))

ok("filter: --filter becomes filter = N", js.jql_for(None, "12345") == "filter = 12345")
for bad in ["12 OR project = HR", "0", "-1", "abc", "1" * 13]:
    try:
        js.jql_for(None, bad)
        ok(f"filter: refuses --filter {bad!r}", False)
    except SystemExit:
        ok(f"filter: refuses --filter {bad!r}", True)
ok("filter: --jql is put on one line", js.jql_for("project = ABC\n  AND x = 1", None) == "project = ABC AND x = 1")
for bad in ["", "   ", "x" * 2001]:
    try:
        js.jql_for(bad, None)
        ok("filter: refuses an empty or huge --jql", False)
    except SystemExit:
        ok("filter: refuses an empty or huge --jql", True)

# sync_once: the search goes to its own file; the status file stays as it was
real_filter, real_search = js.jira_filter, js.jira_search
js.jira_filter = lambda b, t, q, lim, opener=None: real_filter(b, t, q, lim, opener=http_opener)
js.jira_search = lambda b, t, k, opener=None: real_search(b, t, k, opener=http_opener)
try:
    with _tempfile.TemporaryDirectory() as d:
        plan = _os.path.join(d, "plan.json")
        out = _os.path.join(d, "jira-status.json")
        iss = _os.path.join(d, "jira-issues.json")
        with open(plan, "w", encoding="utf-8") as f:
            _json.dump({"bars": [{"jira": "ABC-2"}, {"jira": "XYZ-9"}]}, f)
        js.sync_once(plan, out, SBASE, TOKEN, "project = ABC", 10)
        status, listing = _json.load(open(out, encoding="utf-8")), _json.load(open(iss, encoding="utf-8"))
        ok("sync: the search is written to jira-issues.json beside the status file", listing["kind"] == "sightline-jira-issues" and listing["jql"] == "project = ABC")
        ok("sync: its issues keep Jira's order, with their keys", [x["key"] for x in listing["issues"][:3]] == ["ABC-1", "ABC-2", "ABC-3"] and listing["issues"][0]["summary"] == "Issue 1 <b>bold</b>")
        ok("sync: says when --limit cut the search short", listing["total"] == 250 and listing["truncated"] is True and len(listing["issues"]) == 10)
        ok("sync: the status file has only the plan's keys", set(status["issues"]) == {"ABC-2", "XYZ-9"} and "filter" not in status and "search" not in status and status["issues"]["ABC-2"]["summary"] == "Planned ABC-2")
        ok("sync: neither file contains the token", TOKEN not in open(out, encoding="utf-8").read() + open(iss, encoding="utf-8").read())
        other_path = _os.path.join(d, "sub", "mine.json")
        _os.makedirs(_os.path.dirname(other_path))
        js.sync_once(plan, out, SBASE, TOKEN, "project = ABC", 5, other_path)
        ok("sync: --issues-out puts the search where you say", len(_json.load(open(other_path, encoding="utf-8"))["issues"]) == 5)
        _os.remove(iss)
        js.sync_once(plan, out, SBASE, TOKEN)
        ok("sync: no search, no issues file", not _os.path.exists(iss))
        ok("sync: no temp files left behind", not [x for x in _os.listdir(d) if x.startswith(".")])
finally:
    js.jira_filter, js.jira_search = real_filter, real_search

# ---- people linking: the assignee's key and user name, never an email ----
k, n = js.user_id({"key": "JIRAUSER10100", "name": "asmith", "displayName": "Avery Smith", "emailAddress": "avery@corp.example"})
ok("users: the key and user name are kept", (k, n) == ("JIRAUSER10100", "asmith"))
k, n = js.user_id({"key": "avery.smith@corp.example", "name": "avery.smith@corp.example"})
ok("users: an email-like key becomes a one-way hash, the same every time", k.startswith("h-") and "@" not in k and k == js.user_id({"key": "Avery.Smith@corp.example"})[0])
ok("users: an email-like user name is left out", n == "")
ok("users: odd characters can't get through", js.user_id({"key": "a b<c>", "name": "x\ny"})[0].startswith("h-") and js.user_id({"key": "a", "name": "x\ny"})[1] == "")
shaped = js.shape_issue({"key": "ABC-1", "fields": {"assignee": {"key": "JIRAUSER1", "name": "asmith", "displayName": "Avery Smith", "emailAddress": "avery@corp.example"}}}, "https://j")[1]
ok("users: issues carry assigneeKey and assigneeUser", shaped["assigneeKey"] == "JIRAUSER1" and shaped["assigneeUser"] == "asmith" and shaped["assignee"] == "Avery Smith")
ok("users: no email ever reaches the files", "avery@corp.example" not in _json.dumps(shaped))
shaped = js.shape_issue({"key": "ABC-2", "fields": {"assignee": None}}, "https://j")[1]
ok("users: unassigned issues have empty ids", shaped["assigneeKey"] == "" and shaped["assigneeUser"] == "")

# ---- fields: found by type, never by the per-server id ----
FIELD_LIST = [
    {"id": "summary", "name": "Summary", "schema": {"type": "string", "system": "summary"}},
    {"id": "customfield_10008", "name": "Epic Link", "custom": True, "schema": {"type": "any", "custom": "com.pyxis.greenhopper.jira:gh-epic-link"}},
    {"id": "customfield_10004", "name": "Sprint", "custom": True, "schema": {"type": "array", "custom": "com.pyxis.greenhopper.jira:gh-sprint"}},
    {"id": "customfield_10106", "name": "Story Points", "custom": True, "schema": {"type": "number"}},
    {"id": "customfield_10200", "name": "Story point estimate", "custom": True, "schema": {"type": "number"}},
    {"id": "customfield_10300", "name": "Story Points", "custom": True, "schema": {"type": "string"}},
    {"id": "customfield_1,summary", "name": "Sneaky", "schema": {"custom": "com.pyxis.greenhopper.jira:gh-epic-link"}},
]
found = js.discover_fields(FIELD_LIST)
ok("fields: Epic Link and Sprint are found by type", found.get("epicLink") == "customfield_10008" and found.get("sprint") == "customfield_10004")
ok("fields: Story Points is the number field by that name, preferred over 'Story point estimate'", found.get("storyPoints") == "customfield_10106")
ok("fields: an id that isn't customfield_NNN is ignored", "customfield_1,summary" not in found.values())
ok("fields: nothing found means nothing guessed", js.discover_fields([{"id": "summary", "name": "Summary"}]) == {} and js.discover_fields("junk") == {})


class Fields(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/rest/api/2/field" else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(_json.dumps(FIELD_LIST).encode())

    def log_message(self, *a):
        pass


fsrv = serve(Fields)
ok("fields: read from GET /rest/api/2/field", js.find_fields(f"http://127.0.0.1:{fsrv.server_port}", TOKEN, opener=http_opener) == found)
fsrv.shutdown()

js.CUSTOM.clear()
js.CUSTOM.update({"epicLink": "customfield_10008", "sprint": "customfield_10004", "storyPoints": "customfield_10106"})
ok("fields: searches ask for them", js.fields_param().endswith("customfield_10008,customfield_10004,customfield_10106"))
js.CUSTOM["parentLink"] = "customfield_1,summary"
ok("fields: a bad id never reaches a request", "customfield_1,summary" not in js.fields_param())
del js.CUSTOM["parentLink"]
raw = {"key": "ABC-7", "fields": {"customfield_10008": "abc-10", "customfield_10106": 5,
       "customfield_10004": ["x.Sprint@1[id=1,state=CLOSED,name=Sprint 4,goal=]", "x.Sprint@2[id=2,state=ACTIVE,name=Sprint 5,goal=]"], "parent": {"key": "ABC-3"}}}
sh = js.shape_issue(raw, "https://j")[1]
ok("fields: each issue carries its epic, parent, active sprint and points", (sh["epic"], sh["parent"], sh["sprint"], sh["points"]) == ("ABC-10", "ABC-3", "Sprint 5", 5))
for bad in [True, "5", -1, 5000, float("nan")]:
    raw["fields"]["customfield_10106"] = bad
    ok(f"fields: points {bad!r} are dropped", js.shape_issue(raw, "https://j")[1]["points"] is None)
raw["fields"]["customfield_10008"] = "not a key"
ok("fields: an epic that isn't a key is dropped", js.shape_issue(raw, "https://j")[1]["epic"] == "")
ok("fields: sprints sent as objects work too", js._sprint_of([{"state": "active", "name": "S9"}, {"state": "future", "name": "S10"}]) == "S9")
js.CUSTOM.clear()
ok("fields: with none saved, issues still work", js.shape_issue({"key": "ABC-1", "fields": {}}, "https://j")[1]["epic"] == "")

# ---- rollups: an epic's child issues, counted ----
class Rollup(http.server.BaseHTTPRequestHandler):
    """ABC-10 has 5 stories through Epic Link; ABC-20 has one through parent. Plan keys come back as epics."""
    jqls = []

    def do_GET(self):
        q = dict(_up.parse_qsl(_up.urlparse(self.path).query))
        jql = q.get("jql", "")
        Rollup.jqls.append(jql)
        st = lambda cat: {"name": cat, "statusCategory": {"key": {"done": "done", "inprogress": "indeterminate", "todo": "new"}[cat]}}
        if jql.startswith("key in"):
            keys = jql[len("key in ("):-1].split(",")
            issues = [{"key": k, "fields": {"summary": "Epic " + k, "issuetype": {"name": "Epic"}, "status": st("inprogress")}} for k in keys if k != "ABC-99"]
        else:
            kids = [("ABC-11", "done", 3, "ABC-10", None), ("ABC-12", "done", 3, "ABC-10", None), ("ABC-13", "inprogress", 5, "ABC-10", None),
                    ("ABC-14", "todo", None, "ABC-10", None), ("ABC-15", "todo", None, "ABC-10", None), ("ABC-21", "done", 2, None, "ABC-20"),
                    ("ABC-31", "done", 8, "ABC-30", None)]
            issues = [{"key": k, "fields": {"status": st(c), "customfield_10008": e, "customfield_10106": p, **({"parent": {"key": par}} if par else {})}} for k, c, p, e, par in kids]
            start, n = int(q.get("startAt", 0)), int(q.get("maxResults", 50))
            issues = issues[start:start + n]
        body = {"total": len(issues) if jql.startswith("key in") else 7, "issues": issues}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(_json.dumps(body).encode())

    def log_message(self, *a):
        pass


rsrv = serve(Rollup)
RBASE = f"http://127.0.0.1:{rsrv.server_port}"
js.CUSTOM.clear()
js.CUSTOM.update({"epicLink": "customfield_10008", "storyPoints": "customfield_10106"})
ok("rollup: asks by Epic Link and by parent", js.rollup_jql(["ABC-10", "ABC-20"]) == "cf[10008] in (ABC-10,ABC-20) OR parent in (ABC-10,ABC-20)")
js.CUSTOM["parentLink"] = "customfield_12000"
ok("rollup: and by Parent Link when the server has it", "cf[12000] in (ABC-10)" in js.rollup_jql(["ABC-10"]))
del js.CUSTOM["parentLink"]
ok("rollup: only real keys reach the search", js.rollup_jql(["ABC-10", "x) OR project = HR OR key in (y"]) == "cf[10008] in (ABC-10) OR parent in (ABC-10)")
js.CUSTOM["epicLink"] = "customfield_1) OR (x"
ok("rollup: a bad field id is left out", js.rollup_jql(["ABC-10"]) == "parent in (ABC-10)")
js.CUSTOM["epicLink"] = "customfield_10008"

roll, cut = js.jira_rollups(RBASE, TOKEN, ["ABC-10", "ABC-20"], opener=http_opener)
ok("rollup: counts each epic's children by status", {k: roll["ABC-10"][k] for k in ("total", "done", "inprogress", "todo")} == {"total": 5, "done": 2, "inprogress": 1, "todo": 2})
ok("rollup: sums story points, and counts what isn't estimated", roll["ABC-10"]["points"] == 11 and roll["ABC-10"]["pointsDone"] == 6 and roll["ABC-10"]["unestimated"] == 2)
ok("rollup: counts by status and resolution, so the page's status map can decide", sum(v[0] for v in roll["ABC-10"]["byState"].values()) == 5 and all(k.count("|") == 2 for k in roll["ABC-10"]["byState"]))
kids = {}
roll2, _ = js.jira_rollups(RBASE, TOKEN, ["ABC-10", "ABC-20"], opener=http_opener, stories=kids, listed={"ABC-10"})
ok("stories: an epic that's on the board lists its stories one by one", sorted(roll2["ABC-10"]["children"]) == sorted(k for k, v in kids.items() if v.get("epic") == "ABC-10" or v.get("parent") == "ABC-10") and len(roll2["ABC-10"]["children"]) == 5 and roll2["ABC-10"]["childrenCut"] is False)
ok("stories: each listed story has its details (status, sprint), for the page to draw", all("status" in kids[k] and "sprint" in kids[k] for k in roll2["ABC-10"]["children"]))
ok("stories: a parked epic is counted but its stories aren't listed", "children" not in roll2["ABC-20"] and roll2["ABC-20"]["total"] == 1 and not any(v.get("parent") == "ABC-20" for v in kids.values()))
cap_s, js.STORY_CAP = js.STORY_CAP, 2
kids = {}
roll3, _ = js.jira_rollups(RBASE, TOKEN, ["ABC-10"], opener=http_opener, stories=kids)
js.STORY_CAP = cap_s
ok("stories: past the cap they're counted, not listed, and the epic says so", len(roll3["ABC-10"]["children"]) == 2 and roll3["ABC-10"]["childrenCut"] is True and roll3["ABC-10"]["total"] == 5)
class TwoEpics(js.urllib.request.BaseHandler):
    pass
real_jf = js.jira_filter
calls_seen = []
def fake_filter(base, token, jql, limit, opener=None):
    calls_seen.append(jql)
    kid = {"summary": "Shared", "status": "Open", "category": "todo", "epic": "ABC-1", "parent": "ABC-2", "points": None}
    return {"ABC-9": kid}, ["ABC-9"], 1
js.jira_filter, bat = fake_filter, js.BATCH
js.BATCH = 1                                                  # each epic in its own query batch
try:
    rr, _ = js.jira_rollups(RBASE, TOKEN, ["ABC-1", "ABC-2"], stories={})
finally:
    js.jira_filter, js.BATCH = real_jf, bat
ok("stories: a story linked to two epics in different batches counts once", rr["ABC-1"]["total"] + rr["ABC-2"]["total"] == 1 and len(calls_seen) == 2)
with _tempfile.TemporaryDirectory() as d:
    plan, out, iss = (_os.path.join(d, n) for n in ("plan.json", "status.json", "issues.json"))
    _json.dump({"bars": [{"lane": "l", "epics": ["ABC-1"]}]}, open(plan, "w"))
    seen = {}
    r_f, r_s, r_r = js.jira_filter, js.jira_search, js.jira_rollups
    js.jira_search = lambda b, t, k, opener=None: {"ABC-1": {"summary": "On the board", "isEpic": True, "status": "Open", "category": "todo"}}
    js.jira_filter = lambda b, t, q, lim, opener=None: ({"ABC-2": {"summary": "Found", "isEpic": True}, "ABC-3": {"summary": "A story", "isEpic": False}}, ["ABC-2", "ABC-3"], 2)
    def fake_roll(b, t, epics, opener=None, stories=None, listed=None):
        seen.update(epics=list(epics), listed=set(listed or ()))
        return {k: {"total": 1, "todo": 0, "inprogress": 0, "done": 1, "unknown": 0, "points": 0, "pointsDone": 0, "unestimated": 1, "sprintStart": "", "sprintEnd": "", "byState": {}} for k in epics}, False
    js.jira_rollups = fake_roll
    try:
        js.sync_once(plan, out, "https://h.example", "t", [{"name": "Epics", "jql": "x"}], 50, iss)
    finally:
        js.jira_filter, js.jira_search, js.jira_rollups = r_f, r_s, r_r
    st = _json.load(open(out))
    ok("finished: epics a search found are counted too, after the board's own", seen["epics"] == ["ABC-1", "ABC-2"] and "ABC-2" in st["rollups"])
    ok("finished: but only the board's epics have their stories listed", seen["listed"] == {"ABC-1"})
k_lab, v_lab = js.shape_issue({"key": "ABC-7", "fields": {"summary": "s", "status": {"name": "Open", "statusCategory": {"key": "new"}}, "labels": ["checkout", "", 5, "x" * 90] + ["l%d" % i for i in range(30)]}}, "https://j.example")
ok("labels: Jira labels are fetched, typed and capped", "labels" in js.FIELDS.split(",") and v_lab["labels"][0] == "checkout" and len(v_lab["labels"]) == 20 and all(isinstance(x, str) and 0 < len(x) <= 60 for x in v_lab["labels"]))
ok("refs: the sync also fetches Jira items the plan only refers to (notes, dependencies, tags by key)", {"ABC-50", "ABC-51", "ABC-52"} <= set(js.plan_keys({"bars": [{"jira": "", "tasks": [{"jiraDeps": ["abc-50"]}]}], "notes": [{"on": "jira:ABC-51"}, {"on": "bar:x"}], "jiraItems": [{"id": "ABC-52", "tags": ["t"]}, {"id": "nope"}], "proposals": [{"key": "ABC-53"}]})) and "ABC-53" in js.plan_keys({"proposals": [{"key": "abc-53"}]}))
with _tempfile.TemporaryDirectory() as d:
    plan, out = _os.path.join(d, "plan.json"), _os.path.join(d, "status.json")
    keys = ["ABC-%d" % i for i in range(1, 21)]
    _json.dump({"bars": [{"lane": "l", "jira": k, "epics": []} for k in keys]}, open(plan, "w"))
    r_s, r_r = js.jira_search, js.jira_rollups
    js.jira_rollups = lambda *a, **k: ({}, False)
    try:
        js.jira_search = lambda b, t, ks, opener=None: {k: {"summary": k, "status": "Open", "category": "todo"} for k in ks}
        js.sync_once(plan, out, "https://h.example", "t")
        good = _json.load(open(out))
        js.jira_search = lambda b, t, ks, opener=None: {k: {"summary": k, "status": "Open", "category": "todo"} for k in ks[:3]}   # a bad sync: 3 of 20
        res = js.sync_once(plan, out, "https://h.example", "t")
        kept = _json.load(open(out))
        ok("guard: a sync that loses most of the plan's Jira items keeps the earlier one", len(kept["issues"]) == 20 and kept["generatedAt"] == good["generatedAt"] and res.get("guarded"))
        ok("guard: and records why, for the page to say", kept["guard"]["found"] == 3 and kept["guard"]["previous"] == 20)
        js.sync_once(plan, out, "https://h.example", "t", accept_drop=True)
        ok("guard: --accept-drop takes the new result when the drop is real", len(_json.load(open(out))["issues"]) == 3 and "guard" not in _json.load(open(out)))
        js.jira_search = lambda b, t, ks, opener=None: {k: {"summary": k, "status": "Open", "category": "todo"} for k in ks[:2]}
        js.sync_once(plan, out, "https://h.example", "t")
        ok("guard: small plans (under 10 found before) aren't guarded against a partial drop", len(_json.load(open(out))["issues"]) == 2)
        js.jira_search = lambda b, t, ks, opener=None: {}
        res = js.sync_once(plan, out, "https://h.example", "t")
        ok("guard: but losing every Jira item is guarded at any size", len(_json.load(open(out))["issues"]) == 2 and res.get("guarded") and res["guarded"]["found"] == 0)
    finally:
        js.jira_search, js.jira_rollups = r_s, r_r
# ancestors: Parent Link / parent levels above what the sync has, fetched a few levels up and written apart
_anc = {"ABC-1": {"summary": "Epic", "isEpic": True, "status": "Open", "category": "todo", "type": "Epic", "parent": "FEAT-1"},
       "FEAT-1": {"summary": "Feature", "status": "Open", "category": "todo", "type": "Feature", "parent": "INIT-1", "assignee": "x"},
       "INIT-1": {"summary": "Initiative", "status": "Open", "category": "todo", "type": "Initiative", "parent": "INIT-1"}}
_calls = []
with _tempfile.TemporaryDirectory() as d:
    plan, out = _os.path.join(d, "plan.json"), _os.path.join(d, "status.json")
    _json.dump({"bars": [{"lane": "l", "jira": "ABC-1", "epics": ["ABC-1"]}]}, open(plan, "w"))
    r_s, r_r = js.jira_search, js.jira_rollups
    js.jira_rollups = lambda *a, **k: ({}, False)
    try:
        js.jira_search = lambda b, t, ks, opener=None: (_calls.append(list(ks)), {k: _anc[k] for k in ks if k in _anc})[1]
        js.sync_once(plan, out, "https://h.example", "t")
        S_ = _json.load(open(out))
        ok("ancestors: parents above the synced issues are fetched level by level", _calls[1:] == [["FEAT-1"], ["INIT-1"]])
        ok("ancestors: written apart from the issues, with only the tree's fields", set(S_["ancestors"]) == {"FEAT-1", "INIT-1"} and "FEAT-1" not in S_["issues"] and "assignee" not in S_["ancestors"]["FEAT-1"] and S_["ancestors"]["FEAT-1"]["parent"] == "INIT-1")
        ok("ancestors: a parent loop stops (never refetches what it has)", len(_calls) == 3)
        cap, lv = js.MAX_ANCESTORS, js.ANCESTOR_LEVELS
        js.MAX_ANCESTORS = 1
        try:
            got = js.jira_ancestors("https://h.example", "t", {"ABC-1": _anc["ABC-1"]})
            ok("ancestors: capped in total", list(got) == ["FEAT-1"])
        finally:
            js.MAX_ANCESTORS, js.ANCESTOR_LEVELS = cap, lv
        js.jira_search = lambda b, t, ks, opener=None: {k: {"summary": k, "status": "Open", "category": "todo"} for k in ks}
        js.sync_once(plan, out, "https://h.example", "t")
        ok("ancestors: none, no key in the file", "ancestors" not in _json.load(open(out)))
    finally:
        js.jira_search, js.jira_rollups = r_s, r_r
_big = {"bars": [{"jira": "ABC-%d" % i} for i in range(1, 2101)], "notes": [{"on": "jira:XYZ-%d" % i} for i in range(1, 50)]}; _tot = []
_ks = js.plan_keys(_big, _tot)
ok("cap: a plan's Jira keys are capped in total, placed ones first", len(_ks) == js.MAX_PLAN_KEYS and _tot == [2149] and not any(k.startswith("XYZ") for k in _ks))
try:
    js.check_plan_format({"meta": {"schema": js.PLAN_SCHEMA + 1}}); _fmt = "read"
except SystemExit as e:
    _fmt = str(e)
ok("format: the sync refuses a plan saved in a newer format", "plan format %d" % (js.PLAN_SCHEMA + 1) in _fmt)
js.check_plan_format({"meta": {"schema": js.PLAN_SCHEMA}}); js.check_plan_format({})
ok("format: and reads its own format, or a plan with none", True)
def _tree_filter(base, token, jql, limit, opener=None):
    iss = lambda typ, par, cat="todo": {"summary": typ, "status": "Open", "category": cat, "type": typ, "parent": par, "epic": "", "points": 2}
    if "ABC-100" in jql:
        return {"ABC-110": iss("Feature", "ABC-100"), "ABC-101": iss("Story", "ABC-100")}, ["ABC-110", "ABC-101"], 2
    if "ABC-110" in jql:
        return {"ABC-111": iss("Story", "ABC-110", "done"), "ABC-112": iss("Bug", "ABC-110")}, ["ABC-111", "ABC-112"], 2
    return {}, [], 0
_rjf = js.jira_filter; js.jira_filter = _tree_filter
try:
    _st = {}
    _rr, _cut = js.jira_rollups(RBASE, TOKEN, ["ABC-100"], stories=_st)
finally:
    js.jira_filter = _rjf
_e = _rr["ABC-100"]
ok("levels: stories under a feature roll up to the epic", _e["total"] == 3 and _e["done"] == 1 and sorted(_e["children"]) == ["ABC-101", "ABC-111", "ABC-112"])
ok("levels: the feature itself is a container, not counted as work", "ABC-110" not in _e["children"] and _e["points"] == 6 and not _cut)
def _sp(state, a, z):
    return {"sprintState": state, "sprintStart": a, "sprintEnd": z, "sprint": "S", "sprintId": 1}
def _iss(typ, par, extra=None):
    return {"summary": typ, "status": "Open", "category": "todo", "type": typ, "parent": par, "epic": "", "points": 1, **(extra or {})}
def _nest_filter(base, token, jql, limit, opener=None):
    if "Epic Search" in jql:
        return {"ABC-300": {**_iss("Epic", ""), "isEpic": True}, "ABC-400": {**_iss("Epic", "ABC-300"), "isEpic": True}}, ["ABC-300", "ABC-400"], 2
    if "ABC-300" in jql or "ABC-400" in jql:
        f = {"ABC-400": {**_iss("Epic", "ABC-300"), "isEpic": True},
             "ABC-301": _iss("Story", "ABC-300", _sp("active", "2026-09-28", "2026-10-09")),
             "ABC-401": _iss("Story", "ABC-400", _sp("future", "2026-10-12", "2026-10-23")),
             "ABC-302": _iss("Feature", "ABC-300", _sp("closed", "2026-01-05", "2026-01-16"))}
        return f, list(f), len(f)
    if "ABC-302" in jql:
        return {"ABC-303": _iss("Story", "ABC-302", _sp("active", "2026-09-28", "2026-10-09"))}, ["ABC-303"], 1
    return {}, [], 0
import tempfile as _tf, os as _os2
_rjf2, _rjs2 = js.jira_filter, js.jira_search
js.jira_filter, js.jira_search = _nest_filter, (lambda b, t, ks, opener=None: {})
try:
    with _tf.TemporaryDirectory() as _d:
        _p, _o = _os2.path.join(_d, "plan.json"), _os2.path.join(_d, "status.json")
        _json.dump({"meta": {"schema": 2}, "bars": []}, open(_p, "w"))
        js.sync_once(_p, _o, "https://h.example", "t", [{"name": "Epics", "jql": "Epic Search"}])
        _st = _json.load(open(_o))
finally:
    js.jira_filter, js.jira_search = _rjf2, _rjs2
_r3, _r4 = _st["rollups"]["ABC-300"], _st["rollups"]["ABC-400"]
ok("nested: an epic that's under another listed epic isn't counted as its story", "ABC-400" not in _r3.get("sprintKids", []) and _r4["total"] == 1)
ok("nested: the top epic's count includes the nested epic's work", _r3["total"] == 3 and "ABC-400" in _r3.get("nested", []))
ok("sprint kids: an epic not on the board still lists its sprint stories, for the page", {"ABC-301", "ABC-303", "ABC-401"} <= set(_r3.get("sprintKids", [])) and "ABC-301" in _st["issues"] and "ABC-303" in _st["issues"])
ok("containers: a feature that holds stories isn't listed, and its old sprint doesn't stretch the epic", "ABC-302" not in _r3.get("sprintKids", []) and "ABC-302" not in _st["issues"] and _r3["sprintStart"] == "2026-09-28")
import io as _io
class _FakeResp:
    def __init__(self, body): self.b = body
    def read(self, n=-1): return self.b
    def __enter__(self): return self
    def __exit__(self, *a): return False
class _FakeOpener:
    def __init__(self): self.urls = []
    def open(self, req, timeout=None):
        u = req.full_url; self.urls.append(u)
        if "/project/ABC/versions" in u:
            return _FakeResp(_json.dumps([{"id": "101", "name": "2026.10", "releaseDate": "2026-10-15", "startDate": "2026-10-01", "released": False, "archived": False},
                                          {"id": "99", "name": "Old", "releaseDate": "2025-01-01", "released": True, "archived": True},
                                          {"id": "x<script>", "name": "bad"}]).encode())
        import urllib.error as _ue
        raise _ue.HTTPError(u, 404, "no", {}, _io.BytesIO(b""))
_op = _FakeOpener()
_rels, _skip = js.project_releases("https://h.example", "t", ["ABC-1", "ABC-2", "ZED-9"], opener=_op)
ok("releases: each project's releases come with Jira's dates", _rels == [{"id": "101", "name": "2026.10", "project": "ABC", "date": "2026-10-15", "start": "2026-10-01", "released": False, "description": ""}])
ok("releases: archived ones and bad ids are left out; a project we can't read is named, not fatal", _skip == ["ZED"] and not any(r["id"] == "99" for r in _rels))
_iss = js.shape_issue({"key": "ABC-1", "fields": {"summary": "x", "status": {"name": "Open", "statusCategory": {"key": "new"}}, "fixVersions": [{"id": "101", "name": "2026.10"}, {"id": "no", "name": "bad"}]}}, "https://h.example")[1]
ok("releases: an issue says which release it's in", _iss["releases"] == [{"id": "101", "name": "2026.10"}])
_o = {"sprints": [{"id": 42, "state": "active"}], "issues": {"A-1": {"sprintId": 42, "points": 3, "category": "done"}, "A-2": {"sprintId": 42, "points": 5, "category": "todo"}, "A-3": {"sprintId": 42, "category": "todo"}, "A-4": {"sprintId": 41, "points": 8, "category": "todo"}}}
js.burndown_snapshot(_o, {"burndown": {"42": {"2026-09-01": {"scope": 6, "left": 6, "stories": 2, "unestimated": 0}}, "bad<": {}}}, {})
_d = _o["burndown"]["42"]; _t = js._dt.date.today().isoformat()
ok("burndown: each run notes the active sprint's scope and points left, keeping earlier days", _d[_t] == {"scope": 8, "left": 5, "stories": 3, "unestimated": 1, "abandoned": 0} and "2026-09-01" in _d and "bad<" not in _o["burndown"])
class _CmOpener:
    def open(self, req, timeout=None):
        return _FakeResp(_json.dumps({"issues": [{"key": "ABC-1", "fields": {"comment": {"comments": [{"created": "2026-09-20T10:00:00.000+0000"}, {"created": "2026-09-25T09:00:00.000+0000", "updated": "2026-09-26T09:00:00.000+0000"}]}}},
                                                {"key": "ABC-2", "fields": {"comment": {"comments": []}}}]}).encode())
ok("comments: the latest comment's day, for the issues shown as cards", js.last_comments("https://h.example", "t", ["ABC-1", "ABC-2", "bad key"], opener=_CmOpener()) == {"ABC-1": "2026-09-26"})
class _BadOpener:
    def open(self, req, timeout=None):
        import urllib.error as _ue
        raise _ue.URLError("down")
ok("comments: a failure leaves dates out, never fatal", js.last_comments("https://h.example", "t", ["ABC-1"], opener=_BadOpener()) == {})
_o2 = {"sprints": [{"id": 42, "state": "active"}], "board": {"columns": [{"name": "To Do", "statuses": ["Open"]}, {"name": "Done", "statuses": ["Closed"]}]},
       "issues": {"B-1": {"sprintId": 42, "points": 3, "status": "QA Complete", "category": "inprogress"}, "B-2": {"sprintId": 42, "points": 5, "status": "Open", "category": "todo", "resolution": "Won't Do"},
                  "B-3": {"sprintId": 42, "points": 2, "status": "Closed", "category": "inprogress"}}}
js.burndown_snapshot(_o2, {}, {}, {"meta": {"jiraStatusMap": {"QA Complete": "done"}}})
_d2 = _o2["burndown"]["42"][js._dt.date.today().isoformat()]
ok("burndown: it reads status like the page (the team's map, the board's last column) and leaves abandoned work out", _d2["scope"] == 5 and _d2["left"] == 0 and _d2["abandoned"] == 1)
_columns = [{"name": "To Do", "statuses": ["Open"]}, {"name": "Review", "statuses": ["Review", "Repeated"]}, {"name": "Done", "statuses": ["Closed", "Repeated", "Abandoned"]}]
_state_cases = [
    ({"status": "Review", "category": "done"}, {}, {}, "inprogress"),
    ({"status": " review ", "category": "done"}, {}, {}, "inprogress"),
    ({"status": "Review", "category": "todo"}, {}, {}, "notstarted"),
    ({"status": "closed", "category": "inprogress"}, {}, {}, "done"),
    ({"status": "Repeated", "category": "done"}, {}, {}, "inprogress"),
    ({"status": "Review", "category": "done"}, {"Review": "done"}, {}, "done"),
    ({"status": "Closed", "resolution": " Won't Do ", "category": "done"}, {}, {}, "abandoned"),
    ({"status": "Abandoned", "category": "done"}, {}, {}, "abandoned"),
    ({"status": "Abandoned", "category": "done"}, {"Abandoned": "done"}, {}, "done"),
    ({"status": "Closed", "resolution": "Won't Do", "category": "done"}, {}, {"Won't Do": "keep"}, "done"),
    ({"status": "Other", "resolution": "Incomplete", "category": "done"}, {}, {"Incomplete": "abandoned"}, "abandoned"),
    ({"status": "Other", "category": "done"}, {}, {}, "done"),
]
for _i, (_issue, _smap, _rmap, _expected) in enumerate(_state_cases):
    ok(f"burndown state parity {_i + 1}: {_issue['status']!r} -> {_expected}", js.issue_state(_issue, _smap, _rmap, {"Closed", "Repeated", "Abandoned"}, _columns) == _expected)
ok("burndown state: older four-argument callers retain final-column matching", js.issue_state({"status": " closed ", "category": "inprogress"}, {}, {}, {"Closed"}) == "done")
_old_day = {"scope": 13, "left": 8, "stories": 3, "unestimated": 0, "abandoned": 0}
_o3 = {"sprints": [{"id": 42, "state": "active"}], "board": {"columns": _columns}, "issues": {
    "ABC-901": {"sprintId": 42, "points": 5, "status": "Review", "category": "done"},
    "ABC-902": {"sprintId": 42, "points": 3, "status": "closed", "category": "inprogress"},
    "ABC-903": {"sprintId": 42, "points": 2, "status": "Abandoned", "category": "done"}}}
js.burndown_snapshot(_o3, {"burndown": {"42": {"2026-09-01": dict(_old_day)}}}, {})
ok("burndown: a nonfinal done-category status remains unfinished in today's snapshot", _o3["burndown"]["42"][js._dt.date.today().isoformat()] == {"scope": 8, "left": 5, "stories": 2, "unestimated": 0, "abandoned": 1})
ok("burndown: corrected current classification does not rewrite earlier snapshots", _o3["burndown"]["42"]["2026-09-01"] == _old_day)
class _DevOpener:
    def __init__(self): self.n = 0
    def open(self, req, timeout=None):
        self.n += 1
        return _FakeResp(_json.dumps({"detail": [{"branches": [{"name": "feature/x"}], "pullRequests": [
            {"name": "Add login", "url": "https://bb.example.com/pr/1", "status": "OPEN", "author": {"name": "Avery"}, "repositoryName": "web", "lastUpdate": "2026-09-20T10:00:00.000+0000", "reviewers": [{"name": "B", "approved": True}, {"name": "C", "approved": False}]},
            {"name": "Bad", "url": "javascript:alert(1)", "status": "merged"}]}]}).encode())
_dop = _DevOpener()
_dev = js.dev_status("https://h.example", "t", [("ABC-1", "10001")], {}, "2026-09-27T10:00:00+00:00", opener=_dop)
_p = _dev["ABC-1"]["prs"]
ok("dev: an issue's pull requests from Jira's development panel, with author, repo, review", _p[0]["title"] == "Add login" and _p[0]["repo"] == "web" and _p[0]["approved"] == 1 and _p[0]["reviewers"] == 2 and _dev["ABC-1"]["branches"] == 1)
ok("dev: links that aren't https are dropped", _p[1]["url"] == "" and _p[1]["status"] == "MERGED")
class _DraftOpener:
    def open(self, req, timeout=None):
        return _FakeResp(_json.dumps({"detail": [{"pullRequests": [
            {"name": "Real one", "status": "OPEN", "url": "https://bb.example.com/pr/1"}, {"name": "Draft: not yet", "status": "OPEN"},
            {"name": "Flagged", "status": "OPEN", "draft": True}, {"name": "By status", "status": "DRAFT"}]}]}).encode())
_dd = js.dev_status("https://h.example", "t", [("ABC-9", "10009")], {}, "2026-09-27T10:00:00+00:00", opener=_DraftOpener())["ABC-9"]["prs"]
_old2 = {**_dev["ABC-1"], "at": "2026-09-27T08:00:00+00:00"}; _dop5 = _DevOpener()
js.dev_status("https://h.example", "t", [("A-5", "5"), ("A-6", "6")], {"A-5": _old2, "A-6": _old2}, "2026-09-27T10:00:00+00:00", opener=_dop5, done={"A-6"})
ok("dev: a done issue's pull requests are reused for hours; an open one's are read again", _dop5.n == 1)
ok("dev: drafts are marked (a flag, a DRAFT status, or a Draft:/WIP title) and stay open", [p.get("draft", False) for p in _dd] == [False, True, True, True] and all(p["status"] == "OPEN" for p in _dd))
ok("dev: the repo comes from Jira's field, the target repo, or the PR's address", js.pr_repo({"repositoryName": "", "url": "https://bb.example.com/projects/PAY/repos/web-api/pull-requests/12"}) == "PAY/web-api"
   and js.pr_repo({"destination": {"repository": {"name": "web"}}}) == "web" and js.pr_repo({"repositoryName": "api", "url": "https://bb.example.com/projects/P/repos/api/pull-requests/1"}) == "P/api")
_dev2 = js.dev_status("https://h.example", "t", [("ABC-1", "10001")], _dev, "2026-09-27T10:10:00+00:00", opener=_dop)
ok("dev: a recent read is reused, not asked again", _dop.n == 1 and _dev2["ABC-1"] == _dev["ABC-1"])
class _NoDev:
    def __init__(self): self.n = 0
    def open(self, req, timeout=None):
        self.n += 1
        import urllib.error as _ue
        raise _ue.HTTPError(req.full_url, 404, "no", {}, _io.BytesIO(b""))
_nd = _NoDev(); js.dev_status("https://h.example", "t", [("A-1", "1"), ("A-2", "2"), ("A-3", "3")], {}, "2026-09-27T10:00:00+00:00", opener=_nd)
ok("dev: a Jira without the development panel is asked once", _nd.n == 1)
_b0 = js.DEV_BUDGET; js.DEV_BUDGET = -1; _dop3 = _DevOpener()
_dev3 = js.dev_status("https://h.example", "t", [("A-1", "1"), ("A-2", "2")], {"A-2": _dev["ABC-1"]}, "2026-09-27T10:00:00+00:00", opener=_dop3)
js.DEV_BUDGET = _b0
ok("dev: out of time, it stops asking and keeps what it had", _dop3.n == 0 and "A-1" not in _dev3 and "A-2" in _dev3)
js.DEV_BUDGET = -1; _old = {**_dev["ABC-1"], "at": "2026-01-01T00:00:00+00:00"}
_dev4 = js.dev_status("https://h.example", "t", [("A-2", "2")], {"A-2": _old}, "2026-09-27T10:00:00+00:00", opener=_dop3)
js.DEV_BUDGET = _b0
ok("dev: out of time, even an old read is kept instead of asking again", _dop3.n == 0 and _dev4.get("A-2") == _old)
_pg2 = __import__("tempfile").mkdtemp()
for _i in range(260):
    open(_os.path.join(_pg2, f"a{_i:03d}.txt"), "w").write("x")
open(_os.path.join(_pg2, "zz-sightline.html"), "w").write('<meta name="sightline-version" content="2.0.0">')
ok("page: many other files in the folder don't hide the page", (js.newest_page(_pg2) or {}).get("version") == "2.0.0")
ok("keys: Jira work linked to a deliverable is fetched too", "DV-7" in js.plan_keys({"bars": [], "deliverables": [{"id": "d", "name": "x", "jira": ["dv-7", "bad key"]}, "junk"]}) and "BAD KEY" not in js.plan_keys({"deliverables": [{"jira": ["bad key"]}]}))
ok("stories: a parked initiative's epics are known", js.parked_epics({"bars": [{"parked": True, "epics": ["ABC-1"], "jira": "abc-2"}, {"parked": True, "epics": ["ABC-4"]}, {"epics": ["ABC-3"]}]}) == {"ABC-1", "ABC-2", "ABC-4"})
ok("rollup: a | inside a status name is escaped, so the key keeps three parts", js.state_part("Done | QA") == "Done %7C QA" and js.state_part("100%") == "100%25")
ok("rollup: children linked by parent count too", roll["ABC-20"]["total"] == 1 and roll["ABC-20"]["done"] == 1)
ok("rollup: a child of an epic that wasn't asked about isn't counted", "ABC-30" not in roll and cut is False)
js.ROLLUP_CAP, cap0 = 3, js.ROLLUP_CAP
roll, cut = js.jira_rollups(RBASE, TOKEN, ["ABC-10"], opener=http_opener)
ok("rollup: stops at the cap and says so", roll["ABC-10"]["total"] == 3 and cut is True)
js.ROLLUP_CAP = cap0

real_filter, real_search = js.jira_filter, js.jira_search
js.jira_filter = lambda b, t, q, lim, opener=None: real_filter(b, t, q, lim, opener=http_opener)
js.jira_search = lambda b, t, k, opener=None: real_search(b, t, k, opener=http_opener)
try:
    with _tempfile.TemporaryDirectory() as d:
        plan = _os.path.join(d, "plan.json")
        out = _os.path.join(d, "jira-status.json")
        with open(plan, "w", encoding="utf-8") as f:
            _json.dump({"bars": [{"jira": "ABC-10", "epics": ["abc-10", "ABC-20", "ABC-99", "bad key"]}]}, f)
        Rollup.jqls.clear()
        res = js.sync_once(plan, out, RBASE, TOKEN)
        st = _json.load(open(out, encoding="utf-8"))
        ok("sync: epics from the plan are looked up like any key", {"ABC-10", "ABC-20"} <= set(st["issues"]) and "ABC-99" in st["missing"])
        ok("sync: the status file carries each epic's counts", st["rollups"]["ABC-10"]["total"] == 5 and st["rollups"]["ABC-20"]["total"] == 1 and st["rollupsTruncated"] is False)
        ok("health: the status file says how it's kept up to date, and for which plan (no computer name)", st["sync"]["by"] == "sync" and st["sync"]["every"] == 0 and st["sync"]["plan"] == _os.path.basename(plan) and set(st["sync"]) == {"by", "every", "plan"})
        ok("sync: the status file lists each epic's stories, with their details", len(st["rollups"]["ABC-10"]["children"]) == 5 and all(k in st["issues"] for k in st["rollups"]["ABC-10"]["children"]))
        ok("sync: an epic Jira doesn't know is left out of the count search", "ABC-99" not in st["rollups"] and all("ABC-99" not in q for q in Rollup.jqls if "cf[" in q))
finally:
    js.jira_filter, js.jira_search = real_filter, real_search
    js.CUSTOM.clear()
rsrv.shutdown()

# ---- a plan file that isn't there says so, and lists the ones that are ----
import types as _types
with _tempfile.TemporaryDirectory() as d:
    for n in ("team-plan.json", "jira-status.json", "jira-issues.json"):
        open(_os.path.join(d, n), "w").write("{}")
    js.save_config, js.load_config, real_cs = (lambda c: None), (lambda: {"base": "https://jira.example.com"}), js.CredentialStore
    js.CredentialStore = lambda host: _types.SimpleNamespace(load=lambda: "t")
    try:
        js.cmd_sync(_types.SimpleNamespace(plan=_os.path.join(d, "missing-plan.json"), out=None, issues_out=None, jql=None, filter=None, limit=500, every=0))
        ok("sync: a missing plan file says so", False)
    except SystemExit as e:
        ok("sync: a missing plan file says so, and lists the plan files there", "Can't find the plan file" in str(e) and "team-plan.json" in str(e) and "jira-status" not in str(e))
    finally:
        js.CredentialStore = real_cs

# ---- epics are known by their Epic Name, whatever the issue type is called ----
FL2 = FIELD_LIST + [{"id": "customfield_10002", "name": "Epic Name", "custom": True, "schema": {"type": "string", "custom": "com.pyxis.greenhopper.jira:gh-epic-label"}}]
ok("epics: Epic Name is found by type", js.discover_fields(FL2).get("epicName") == "customfield_10002")
js.CUSTOM.clear()
js.CUSTOM["epicName"] = "customfield_10002"
ok("epics: an issue with an Epic Name is an epic, even when its type is called something else",
   js.shape_issue({"key": "GP-1", "fields": {"issuetype": {"name": "Feature"}, "customfield_10002": "Search rollout"}}, "https://j")[1]["isEpic"] is True)
ok("epics: a story isn't", js.shape_issue({"key": "GP-2", "fields": {"issuetype": {"name": "Story"}}}, "https://j")[1]["isEpic"] is False)
js.CUSTOM.clear()
ok("epics: with no Epic Name field, the type name 'Epic' still counts", js.shape_issue({"key": "GP-3", "fields": {"issuetype": {"name": "Epic"}}}, "https://j")[1]["isEpic"] is True)

# ---- review 2 ----
sh = js.shape_issue({"key": "ABC-1", "fields": {"assignee": {"key": "JIRAUSER1", "name": "asmith", "displayName": "avery.smith@corp.example"}}}, "https://j")[1]
ok("review2: a display name that's an email is replaced by the user name", sh["assignee"] == "asmith" and "@" not in _json.dumps(sh))
sh = js.shape_issue({"key": "ABC-1", "fields": {"assignee": {"key": "a@b.example", "name": "a@b.example", "displayName": "Mail <a@b.example>"}}}, "https://j")[1]
ok("review2: and by 'Jira user' when the user name is an email too", sh["assignee"] == "Jira user" and "@" not in _json.dumps(sh))
js.CUSTOM.clear(); js.CUSTOM.update({"epicLink": "customfield_10008"})


class Unknown(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        issues = [{"key": "ABC-11", "fields": {"customfield_10008": "ABC-10", "status": {"name": "Weird"}}},
                  {"key": "ABC-12", "fields": {"customfield_10008": "ABC-10", "status": {"name": "Done", "statusCategory": {"key": "done"}}}}]
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(_json.dumps({"total": 2, "issues": issues}).encode())

    def log_message(self, *a):
        pass


usrv = serve(Unknown)
roll, _ = js.jira_rollups(f"http://127.0.0.1:{usrv.server_port}", TOKEN, ["ABC-10"], opener=http_opener)
ok("review2: a status with no category counts as unknown, not to do", roll["ABC-10"]["unknown"] == 1 and roll["ABC-10"]["todo"] == 0 and roll["ABC-10"]["total"] == 2)
usrv.shutdown()
real_filter, real_search = js.jira_filter, js.jira_search
js.jira_filter = lambda b, t, q, lim, opener=None: real_filter(b, t, q, lim, opener=http_opener)
js.jira_search = lambda b, t, k, opener=None: real_search(b, t, k, opener=http_opener)
try:
    with _tempfile.TemporaryDirectory() as d:
        plan, out, iss = (_os.path.join(d, n) for n in ("plan.json", "jira-status.json", "jira-issues.json"))
        _json.dump({"bars": []}, open(plan, "w"))
        js.sync_once(plan, out, SBASE, TOKEN, "project = ABC", 5)
        a, b = _json.load(open(out)), _json.load(open(iss))
        ok("review2: both files from one sync share a snapshot id", len(a["snapshot"]) == 16 and a["snapshot"] == b["snapshot"])
        js.sync_once(plan, out, SBASE, TOKEN)
        ok("review2: a sync without a search gives the status file a new id, so the page can tell", _json.load(open(out))["snapshot"] != b["snapshot"])
finally:
    js.jira_filter, js.jira_search = real_filter, real_search
    js.CUSTOM.clear()

# ---- sprints: each issue's sprint with its dates, and a board's sprints ----
info = js._sprint_info(["x.Sprint@1[id=41,rapidViewId=2,state=CLOSED,name=Sprint 4,startDate=2026-09-21T09:00:00.000-04:00,endDate=2026-10-02T17:00:00.000-04:00,completeDate=<null>,goal=]",
                        "x.Sprint@2[id=42,state=ACTIVE,name=Sprint 5,startDate=2026-10-05T09:00:00.000-04:00,endDate=2026-10-16T17:00:00.000-04:00,goal=Ship it]"])
ok("sprints: the active sprint's id, name and dates come through", info == {"id": 42, "state": "active", "name": "Sprint 5", "start": "2026-10-05", "end": "2026-10-16"})
ok("sprints: a future sprint with no dates has empty dates", js._sprint_info([{"id": 7, "state": "future", "name": "S7", "startDate": None}])["start"] == "")
ok("sprints: junk ids are dropped", js._sprint_info(["x.Sprint@3[id=abc,name=S,state=ACTIVE]"])["id"] == 0 and js._sprint_info([{"id": -5, "name": "S"}])["id"] == 0)
js.CUSTOM.clear(); js.CUSTOM["sprint"] = "customfield_10004"
sh = js.shape_issue({"key": "ABC-1", "fields": {"customfield_10004": [{"id": 42, "state": "active", "name": "Sprint 5", "startDate": "2026-10-05T09:00:00.000Z", "endDate": "2026-10-16T17:00:00.000Z"}]}}, "https://j")[1]
ok("sprints: issues carry sprintId, sprintStart and sprintEnd", (sh["sprint"], sh["sprintId"], sh["sprintStart"], sh["sprintEnd"]) == ("Sprint 5", 42, "2026-10-05", "2026-10-16"))
js.CUSTOM.clear()


class Agile(http.server.BaseHTTPRequestHandler):
    """Board 7 is Scrum with 60 sprints (two pages); board 8 is Kanban; anything else is missing."""
    paths = []

    def do_GET(self):
        Agile.paths.append(self.path)
        u = _up.urlparse(self.path)
        q = dict(_up.parse_qsl(u.query))
        body, code = None, 200
        if u.path == "/rest/agile/1.0/board/7":
            body = {"id": 7, "name": "Team board", "type": "scrum"}
        elif u.path == "/rest/agile/1.0/board/8":
            body = {"id": 8, "name": "Flow", "type": "kanban"}
        elif u.path == "/rest/agile/1.0/board/7/sprint":
            start = int(q.get("startAt", 0))
            vals = [{"id": i, "name": f"Sprint {i}", "state": "closed" if i < 58 else ("active" if i == 58 else "future"),
                     "startDate": f"2026-{1 + (i % 12):02d}-05T09:00:00.000Z" if i != 60 else None, "endDate": "2026-12-31T17:00:00.000Z" if i != 60 else None,
                     "goal": "g" * 400} for i in range(1 + start, 1 + min(60, start + 50))]
            body = {"values": vals, "isLast": start + 50 >= 60}
        elif u.path == "/rest/agile/1.0/board/7/configuration":
            body = {"columnConfig": {"columns": [{"name": "To Do", "statuses": [{"id": "1"}, {"id": "2"}]}, {"name": "In Progress", "statuses": [{"id": "3"}]},
                                                 {"name": "Done", "statuses": [{"id": "4"}, {"id": "5"}, {"id": "99"}]}]}}
        elif u.path == "/rest/api/2/status":
            body = [{"id": "1", "name": "To Do"}, {"id": "2", "name": "Backlog"}, {"id": "3", "name": "In Progress"}, {"id": "4", "name": "Closed"}, {"id": "5", "name": "Abandoned"}]
        elif u.path == "/rest/agile/1.0/board/9":
            body = {"id": 9, "name": "Odd", "type": "scrum"}
        elif u.path == "/rest/agile/1.0/board/9/sprint":
            body = {"values": [{"id": "bad", "name": "x"}, {"id": 0, "name": "zero"}, {"id": 5, "name": "S5", "state": "future"}], "isLast": True}
        else:
            code = 404
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(_json.dumps(body or {}).encode())

    def log_message(self, *a):
        pass


asrv = serve(Agile)
ABASE = f"http://127.0.0.1:{asrv.server_port}"
board, sprints = js.board_sprints(ABASE, TOKEN, "7", opener=http_opener)
ok("board: its name and every sprint, across pages", (board["id"], board["name"]) == (7, "Team board") and len(sprints) == 60 and sprints[-1]["id"] == 60)
ok("board: its columns, with the statuses in each (by name)", board["columns"] == [{"name": "To Do", "statuses": ["To Do", "Backlog"]}, {"name": "In Progress", "statuses": ["In Progress"]}, {"name": "Done", "statuses": ["Closed", "Abandoned"]}])
ok("board: a board whose columns can't be read still gives its sprints", js.board_sprints(ABASE, TOKEN, "9", opener=http_opener)[0]["columns"] == [])
ok("board: dates, state and a capped goal", sprints[0]["start"] == "2026-02-05" and sprints[57]["state"] == "active" and len(sprints[0]["goal"]) == 300 and sprints[59]["start"] == "")
ok("board: a sprint with a bad id is dropped", [x["id"] for x in js.board_sprints(ABASE, TOKEN, "9", opener=http_opener)[1]] == [5])
for bad, msg in (("8", "no sprints"), ("99", "no board 99"), ("7 OR 1", "board's number"), ("0", "board's number")):
    try:
        js.board_sprints(ABASE, TOKEN, bad, opener=http_opener)
        ok(f"board: refuses {bad!r}", False)
    except SystemExit as e:
        ok(f"board: refuses {bad!r}", msg in str(e))
ok("board: only GETs, to the Agile API and the status list", all(p.startswith("/rest/agile/1.0/board/") or p == "/rest/api/2/status" for p in Agile.paths))
asrv.shutdown()

# ---- inspect: what this Jira returns, with no people in it ----
class Insp(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        u = _up.urlparse(self.path)
        if u.path == "/rest/api/2/status":
            body = [{"name": "In Progress", "statusCategory": {"key": "indeterminate"}}, {"name": "Closed", "statusCategory": {"key": "done"}}, {"name": "Odd", "statusCategory": {"key": "undefined"}}]
        elif u.path == "/rest/api/2/resolution":
            body = [{"name": "Done", "description": "Work finished"}, {"name": "Won't Do", "description": "Not going to happen"}]
        elif u.path == "/rest/agile/1.0/board/7":
            body = {"id": 7, "name": "Team board", "type": "scrum"}
        elif u.path == "/rest/agile/1.0/board/7/sprint":
            body = {"values": [{"id": 42, "name": "Sprint 42", "state": "active", "startDate": "2026-09-28T09:00:00.000Z", "endDate": "2026-10-09T17:00:00.000Z"}], "isLast": True}
        elif u.path == "/rest/api/2/search":
            body = {"issues": [{"key": "ABC-1", "fields": {"issuetype": {"name": "Story"}, "status": {"name": "Closed", "statusCategory": {"key": "done"}}, "resolution": {"name": "Won't Do"},
                    "assignee": {"displayName": "Avery Smith", "emailAddress": "avery@corp.example"},
                    "customfield_10004": ["x.Sprint@2[id=42,state=ACTIVE,name=Sprint 42,startDate=2026-09-28T09:00:00.000-04:00,endDate=2026-10-09T17:00:00.000-04:00,goal=]"], "customfield_10000": "ABC-10"}}]}
        else:
            body = {}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(_json.dumps(body).encode())

    def log_message(self, *a):
        pass


isrv = serve(Insp)
js.CUSTOM.clear(); js.CUSTOM.update({"sprint": "customfield_10004", "epicLink": "customfield_10000"})
rep_lines = js.inspect_report(f"http://127.0.0.1:{isrv.server_port}", TOKEN, "7", "project = ABC", opener=http_opener)
txt = "\n".join(rep_lines)
ok("inspect: statuses with the category Sightline maps them to", "In Progress                      in progress" in txt and "Closed                           done" in txt and "unknown (undefined)" in txt)
ok("inspect: resolutions", "Won't Do" in txt and "Not going to happen" in txt)
ok("inspect: the board's sprints", "Board 7 (Team board)" in txt and "Sprint 42" in txt and "2026-09-28 to 2026-10-09" in txt)
ok("inspect: a sample issue's raw sprint value and what Sightline reads from it", "raw: [\"x.Sprint@2[id=42" in txt and "Sightline reads: sprint 'Sprint 42' (2026-09-28 to 2026-10-09), epic ABC-10" in txt, )
ok("inspect: and its resolution", "resolution \"Won't Do\"" in txt)
ok("inspect: no people in it", "Avery" not in txt and "corp.example" not in txt)
js.CUSTOM.clear()
isrv.shutdown()

# ---- each board's files in their own folder ----
ok("folder: a board's name becomes a safe folder name", js.folder_slug("Core / Platform Team") == "Core-Platform-Team" and js.folder_slug("TeamBoard") == "TeamBoard")
ok("folder: a name can't climb out of the plan's folder", "/" not in js.folder_slug("../../etc/x") and ".." not in js.folder_slug("../../etc") and not js.folder_slug("...x").startswith("."))
with _tempfile.TemporaryDirectory() as d:
    plan = _os.path.join(d, "plan.json")
    ok("folder: by default a jira folder beside the plan, whatever folder the plan is in", js.jira_folder(plan, None) == _os.path.join(d, "jira"))
    ok("folder: --folder NAME is a subfolder beside the plan, made safe", js.jira_folder(plan, "board two") == _os.path.join(d, "board-two") and js.jira_folder(plan, "..") == _os.path.join(d, "jira"))
    ok("folder: --folder with a path is used as given", js.jira_folder(plan, _os.path.join(d, "x", "y")) == _os.path.join(d, "x", "y"))

# ---- several Jira servers, each plan's own settings, watch, install ----
import argparse as _ap
cfg = {"base": "https://jira.one.example", "fields": {"sprint": "customfield_1"}}
sv = js.servers(cfg)
ok("config: an older single-server config moves into servers", list(sv) == ["jira.one.example"] and sv["jira.one.example"]["fields"] == {"sprint": "customfield_1"} and cfg["default"] == "jira.one.example" and "base" not in cfg)
cfg["servers"]["jira.two.example"] = {"base": "https://jira.two.example", "fields": {"sprint": "customfield_9"}}
ok("config: --jira picks a server", js.pick_server(cfg, "https://jira.two.example")["fields"]["sprint"] == "customfield_9")
ok("config: with several and no --jira, the default", js.pick_server(cfg)["base"] == "https://jira.one.example")
try:
    js.pick_server(cfg, "https://jira.three.example"); ok("config: an unknown server says to set it up", False)
except SystemExit as e:
    ok("config: an unknown server says to set it up", "setup --jira https://jira.three.example" in str(e))
with _tempfile.TemporaryDirectory() as d:
    plan = _os.path.join(d, "team.json"); open(plan, "w").write("{}")
    cfg["plans"] = {js.plan_key(plan): {"jira": "jira.two.example", "board": "7", "jql": "project = ABC", "every": 15}}
    job = js.plan_job(cfg, plan, _ap.Namespace())
    ok("config: a plan saved by the older version (one search) still works", (job["server"], job["board"], job["jql"]) == ("jira.two.example", "7", [{"name": "Search", "jql": "project = ABC"}]))
    job = js.plan_job(cfg, plan, _ap.Namespace(jira=None, board="8", jql=None, filter=None, folder=None, limit=None))
    ok("config: an option on the command line replaces just that setting", job["board"] == "8" and job["jql"] == [{"name": "Search", "jql": "project = ABC"}] and job["server"] == "jira.two.example" and job["every"] == 15)
    job = js.plan_job(cfg, plan, _ap.Namespace(jira="https://jira.one.example", board=None, jql="project = XYZ", filter=None, folder=None, limit=None))
    ok("config: --jira and --jql replace the saved server and searches", job["server"] == "jira.one.example" and job["board"] == "7" and job["jql"] == [{"name": "Search", "jql": "project = XYZ"}])
    copy = _os.path.join(d, "copy", "team.json"); _os.makedirs(_os.path.dirname(copy)); open(copy, "w").write("{}")
    ok("config: a copy of the plan in another folder has its own settings (none yet)", js.saved_plan(cfg, copy) == {})

# watch timing
st = {}
ok("watch: a plan never synced is due", js.is_due(st, 15, 1000.0, 1000.0))
st = {"last": 1000.0, "seen": 1000.0}
ok("watch: not due again before its interval", not js.is_due(st, 15, 1000.0, 1000.0 + 600))
ok("watch: due when its interval is up", js.is_due(st, 15, 1000.0, 1000.0 + 15 * 60))
ok("watch: a plan saved since, but still being written, waits", not js.is_due(st, 15, 1500.0, 1505.0))
ok("watch: once it's settled, it syncs", js.is_due(st, 15, 1500.0, 1500.0 + js.SETTLE))
with _tempfile.TemporaryDirectory() as d:
    p1, p2, gone = (_os.path.join(d, n) for n in ("a.json", "b.json", "gone.json"))
    for x in (p1, p2): open(x, "w").write("{}")
    c = {"servers": {"h": {"base": "https://h.example"}}, "default": "h", "plans": {js.plan_key(p1): {"every": 15}, js.plan_key(p2): {"every": 15}, js.plan_key(gone): {}}}
    calls = []
    def runner(plan, job):
        calls.append(plan)
        if plan.endswith("b.json"): raise SystemExit("Couldn't reach Jira: timed out")
    state = {}
    res = js.watch_tick(c, [js.plan_key(p1), js.plan_key(p2), js.plan_key(gone)], state, _time.time(), runner)
    ok("watch: one pass syncs every due plan; one that fails doesn't stop the others", len(calls) == 2 and res == [f"synced {js.plan_key(p1)}", f"failed {js.plan_key(p2)}"])
    ok("watch: a missing plan is skipped", state[js.plan_key(gone)]["missing"] is True)
    calls.clear(); js.watch_tick(c, [js.plan_key(p1)], state, _time.time(), runner)
    ok("watch: and nothing runs again until it's due", calls == [])
    t0 = _time.time()
    def crash(plan, job):
        calls.append(plan)
        if plan.endswith("b.json"): raise ValueError("Expecting value: line 1 column 1")   # a half-written plan
    calls.clear(); st2 = {}
    res = js.watch_tick(c, [js.plan_key(p2), js.plan_key(p1)], st2, t0, crash)
    ok("watch: an unexpected error in one plan doesn't end the watch or skip the others", res == [f"failed {js.plan_key(p2)}", f"synced {js.plan_key(p1)}"])
    calls.clear(); js.watch_tick(c, [js.plan_key(p2)], st2, t0 + js.RETRY_FIRST - 1, crash)
    ok("watch: a failed plan waits a minute before retrying", calls == [])
    js.watch_tick(c, [js.plan_key(p2)], st2, t0 + js.RETRY_FIRST, crash)
    ok("watch: then retries, well before the full interval", calls == [js.plan_key(p2)])
    calls.clear(); js.watch_tick(c, [js.plan_key(p2)], st2, t0 + js.RETRY_FIRST + js.RETRY_FIRST * 2 - 1, crash)
    ok("watch: and backs off after repeated failures", calls == [])
    beats = []
    js.watch_tick(c, [js.plan_key(p1), js.plan_key(p2)], {}, t0, runner, beat=lambda: beats.append(1))
    ok("watch: checks in after each plan, so a long pass doesn't look like a dead watch", len(beats) == 2)

# one watch at a time; install
real_dir = js.CONFIG_DIR
with _tempfile.TemporaryDirectory() as d:
    js.CONFIG_DIR = d
    try:
        ok("lock: the first watch takes it", js.take_watch_lock(1000.0))
        _json.dump({"pid": -1, "at": 1000.0}, open(js.lock_path(), "w"))
        ok("lock: a second watch is refused while the first checks in", not js.take_watch_lock(1060.0))
        ok("lock: a watch that stopped checking in is replaced", js.take_watch_lock(1000.0 + js.LOCK_FRESH + 1, settle=0))
        ok("lock: the owner keeps it with its heartbeat", js.take_watch_lock(1000.0 + js.LOCK_FRESH + 30, settle=0))
        _json.dump({"id": "someone-else", "at": 1000.0 + js.LOCK_FRESH + 40}, open(js.lock_path(), "w"))
        ok("lock: a watch that lost the lock to another finds out at its next heartbeat", not js.take_watch_lock(1000.0 + js.LOCK_FRESH + 50, settle=0))
        _os.remove(js.lock_path())
        ok("lock: a new lock is created exclusively", js.take_watch_lock(5000.0) and js.read_lock()["id"] == js.WATCH_ID)
        pg = _tempfile.mkdtemp() if "_tempfile" in globals() else __import__("tempfile").mkdtemp()
        for nm, v in (("old.html", "1.2.3"), ("timeline-planner.html", "1.10.0"), ("notes.html", None), ("x.txt", "9.9.9")):
            with open(_os.path.join(pg, nm), "w") as f:
                f.write(("<head><meta name=\"sightline-version\" content=\"%s\">" % v) if v else "<p>hi</p>")
        ok("page: the newest Sightline page in the plan's folder, by version not name", js.newest_page(pg) == {"version": "1.10.0", "file": "timeline-planner.html"})
        ok("page: a folder with none says nothing", js.newest_page(_os.path.join(pg, "missing")) is None)
        js.release_watch_lock()
        ok("lock: stopping gives it back, so the next watch starts at once", js.read_lock() is None and js.take_watch_lock(5001.0))
        _json.dump({"id": "someone-else", "pid": 4321, "at": 5000.0}, open(js.lock_path(), "w"))
        js.release_watch_lock()
        m = js.lock_held_msg(5030.0)
        ok("lock: it never removes another watch's lock", (js.read_lock() or {}).get("id") == "someone-else")
        ok("lock: the refusal says who holds it and when it clears", "process 4321" in m and "30 s ago" in m and f"try again in {js.LOCK_FRESH - 30} s" in m)
        _os.remove(js.lock_path())
        txt = js.launcher_text(r"C:\Py 3\python.exe", r"C:\Users\a%b\AppData\Roaming\Sightline\bin\sightline-jira-sync.py")
        ok("install: the launcher runs your own copy, quoted, with % escaped", '"C:\\Py 3\\python.exe"' in txt and "a%%b" in txt and txt.endswith("watch\r\n"))
        real_sd = js.startup_dir
        js.startup_dir = lambda: _os.path.join(d, "Startup")
        try:
            js.cmd_install(_ap.Namespace(no_startup=False))
            ok("install: copies the script to your own folder", _os.path.isfile(js.own_copy()) and open(js.own_copy(), "rb").read() == open(js.__file__, "rb").read())
            ok("install: and starts it when you sign in", _os.path.isfile(_os.path.join(d, "Startup", "Sightline Jira sync.cmd")))
            js.cmd_uninstall(None)
            ok("uninstall: stops it starting", not _os.path.exists(_os.path.join(d, "Startup", "Sightline Jira sync.cmd")))
        finally:
            js.startup_dir = real_sd
    finally:
        js.CONFIG_DIR = real_dir

# ---- several named searches per plan ----
ss = js.parse_searches(["Epics=project = ABC AND cf[1] is not EMPTY", "This sprint = project = ABC AND sprint in openSprints()"])
ok("searches: --search Name=JQL, repeatable", [x["name"] for x in ss] == ["Epics", "This sprint"] and ss[1]["jql"] == "project = ABC AND sprint in openSprints()")
for bad in ["no equals sign", "=project = ABC", "Bad/Name=x = 1", "x" * 31 + "=a = 1", "Epics="]:
    try:
        js.parse_searches([bad]); ok(f"searches: refuses {bad[:20]!r}", False)
    except SystemExit:
        ok(f"searches: refuses {bad[:20]!r}", True)
try:
    js.parse_searches(["A=a = 1", "a=b = 2"]); ok("searches: two with the same name are refused", False)
except SystemExit:
    ok("searches: two with the same name are refused", True)
with _tempfile.TemporaryDirectory() as d:
    plan = _os.path.join(d, "team.json"); open(plan, "w").write("{}")
    c = {"servers": {"h": {"base": "https://h.example"}}, "default": "h"}
    job = js.plan_job(c, plan, _ap.Namespace(jira=None, board="7", jql=None, filter=None, folder=None, limit=None, search=["Epics=a = 1", "No epic=b = 2"]))
    c["plans"] = {js.plan_key(plan): {"jira": "h", "board": "7", "searches": job["jql"]}}
    again = js.plan_job(c, plan, _ap.Namespace())
    ok("searches: saved with the plan and reused", [x["name"] for x in again["jql"]] == ["Epics", "No epic"])
real_filter, real_search = js.jira_filter, js.jira_search
js.jira_filter = lambda b, t, q, lim, opener=None: real_filter(b, t, q, lim, opener=http_opener)
js.jira_search = lambda b, t, k, opener=None: real_search(b, t, k, opener=http_opener)
try:
    with _tempfile.TemporaryDirectory() as d:
        plan, out, iss = (_os.path.join(d, n) for n in ("plan.json", "status.json", "issues.json"))
        _json.dump({"bars": []}, open(plan, "w"))
        js.sync_once(plan, out, SBASE, TOKEN, [{"name": "First", "jql": "project = ABC"}, {"name": "Second", "jql": "project = ABC"}], 3, iss)
        L = _json.load(open(iss))
        ok("searches: each search keeps its own list", L["version"] == 2 and [x["name"] for x in L["searches"]] == ["First", "Second"] and all(len(x["keys"]) == 3 for x in L["searches"]))
        ok("searches: an issue in two searches is stored once", len(L["issues"]) == 3)
        ok("searches: the first search is also written the old way, for an older page", L["jql"] == "project = ABC" and L["total"] == 250)
        cap = js.MAX_ISSUES; js.MAX_ISSUES = 3
        try:
            calls_before = []
            real_f2 = js.jira_filter
            js.jira_filter = lambda b, t, q, lim, opener=None: (calls_before.append(lim), real_f2(b, t, q, lim))[1]
            js.sync_once(plan, out, SBASE, TOKEN, [{"name": "First", "jql": "project = ABC"}, {"name": "Second", "jql": "project = ABC"}], 3, iss)
            js.jira_filter = real_f2
            L = _json.load(open(iss))
            ok("searches: once the file is full, later searches aren't fetched at all", calls_before == [3] and len(L["issues"]) == 3)
            ok("searches: and say they were skipped because the file is full", L["searches"][1]["keys"] == [] and L["searches"][1]["full"] is True and L["searches"][1]["truncated"] is True)
        finally:
            js.MAX_ISSUES = cap
finally:
    js.jira_filter, js.jira_search = real_filter, real_search

search.shutdown()
other.shutdown()
jira.shutdown()
print(f"{passed}/{passed + failed} passed")
sys.exit(1 if failed else 0)
