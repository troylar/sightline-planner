#!/usr/bin/env python3
"""Make a demo plan and a matching jira/ folder, all made up, with dates around today.

    python3 tools/make-demo.py [OUT] [--scenario small|store] [--seed N]

small (the default) is a handful of hand-picked epics that show each case once. store is a fictional outdoor-gear
retailer with 100 epics and several hundred stories, on a board whose workflow has review and acceptance steps and
many ways to be done or abandoned. Both write OUT/plan.json, OUT/jira/status.json and OUT/jira/issues.json in the same
shapes the Jira sync writes, so the page shows everything the Jira tie-in does without a Jira: epics to sort (live,
finished, new, parked), initiatives with their stories in sprints, stories off the timeline (no sprint, a parking-lot
sprint, abandoned, already a task), stories with no parent, the sync-health line, and the extras: points per sprint for
capacity, Jira releases, pull requests from the development panel, and the burndown's daily notes. Open OUT/plan.json in Sightline,
then connect OUT/jira as the Jira folder. Every name, key and date here is invented.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import random
import secrets

BASE = "https://jira.example.com"
iso = lambda d: d.isoformat()
esc = lambda v: str(v or "").replace("%", "%25").replace("|", "%7C")      # as the sync writes status|resolution|category


def monday(d: dt.date) -> dt.date:
    return d - dt.timedelta(days=d.weekday())


class Demo:
    """Collects issues, epics and the plan, then writes the three files the way the sync would."""

    def __init__(self, key: str, people: list, columns: list, category: dict):
        self.key, self.people, self.columns, self.category = key, people, columns, category
        self.names = {k: n for k, n, *_ in people}
        self.issues: dict = {}
        self.stories_of: dict = {}                               # epic -> its story keys, in order
        self.n = 0

    def issue(self, key, summary, status, *, epic="", who=None, sprint=None, points=None, resolution=None, is_epic=False, kind="Story", labels=None):
        cat = self.category[status]
        self.issues[key] = {"summary": summary, "status": status, "category": cat, "assignee": self.names.get(who, who or ""),
                            "assigneeKey": who or "", "assigneeUser": who or "", "due": "", "updated": iso(dt.date.today()),
                            "resolved": cat == "done", "resolution": resolution if resolution is not None else ("Done" if cat == "done" else ""),
                            "type": "Feature" if is_epic else kind, "epic": epic, "parent": "", "sprint": sprint["name"] if sprint else "",
                            "sprintId": sprint["id"] if sprint else 0, "sprintStart": sprint["start"] if sprint else "",
                            "sprintEnd": sprint["end"] if sprint else "", "sprintState": sprint["state"] if sprint else "",
                            "points": points, "isEpic": is_epic, "priority": "Medium", "labels": list(labels or []), "url": f"{BASE}/browse/{key}"}
        if epic:
            self.stories_of.setdefault(epic, []).append(key)
        return key

    def next_key(self) -> str:
        self.n += 1
        return f"{self.key}-{self.n}"

    def rollup(self, epic: str, listed: bool) -> dict:
        r = {"total": 0, "todo": 0, "inprogress": 0, "done": 0, "unknown": 0, "points": 0.0, "pointsDone": 0.0, "unestimated": 0,
             "sprintStart": "", "sprintEnd": "", "byState": {}}
        for k in self.stories_of.get(epic, []):
            j = self.issues[k]
            r["total"] += 1
            r[j["category"]] += 1
            bs = r["byState"].setdefault("|".join(esc(x) for x in (j["status"], j["resolution"], j["category"])), [0, 0.0])
            bs[0] += 1
            bs[1] += j["points"] or 0
            if j["sprintStart"]:
                r["sprintStart"] = min(r["sprintStart"] or j["sprintStart"], j["sprintStart"])
                r["sprintEnd"] = max(r["sprintEnd"], j["sprintEnd"])
            if isinstance(j["points"], (int, float)):
                r["points"] += j["points"]
                r["pointsDone"] += j["points"] if j["category"] == "done" else 0
            else:
                r["unestimated"] += 1
        if listed:
            r["children"], r["childrenCut"] = list(self.stories_of.get(epic, [])), False
        return r

    def enrich(self, sprints: list, releases: list) -> dict:
        """The extras the sync reads beyond an issue's status: dates (created, updated, resolved, last comment), Jira
        releases (fixVersions), pull requests from the development panel, and the burndown's daily notes. Made up,
        repeatable, and shaped exactly like the sync's output."""
        rnd, today = random.Random(self.key), dt.date.today()
        stamp = lambda d, h=15: f"{iso(d)}T{h:02d}:{rnd.randint(0, 59):02d}:00.000+0000"
        active = next((x for x in sprints if x["state"] == "active"), None)
        done_res = {"Done", "Done - Locked", ""}
        for i, (k, j) in enumerate(self.issues.items()):
            j["jid"] = str(10000 + i)
            s0 = dt.date.fromisoformat(j["sprintStart"]) if j["sprintStart"] else today - dt.timedelta(days=30)
            created = min(today, s0 - dt.timedelta(days=rnd.randint(3, 45)))
            j["created"] = stamp(created, 9)
            if j["category"] == "done":
                e = min(today, dt.date.fromisoformat(j["sprintEnd"])) if j["sprintEnd"] else today - dt.timedelta(days=rnd.randint(5, 60))
                a = max(created, min(e, s0))
                res = a + dt.timedelta(days=rnd.randint(0, max(0, (e - a).days)))
                j["resolvedAt"], j["updated"] = stamp(res), stamp(res)
            else:
                ago = rnd.choice([0, 0, 1, 1, 2, 3, 4, 6, 9, 12]) if j["sprintState"] == "active" else rnd.randint(0, 25)
                j["updated"], j["resolvedAt"] = stamp(max(created, today - dt.timedelta(days=ago))), ""
            if j["sprintState"] in ("active", "future") and not j["isEpic"] and rnd.random() < .7:
                j["commentedAt"] = iso(max(created, dt.date.fromisoformat(j["updated"][:10]) - dt.timedelta(days=rnd.randint(0, 3))))
            j["releases"] = []
        # releases: one shipped, one due soon, two later; epics carry one and their stories follow
        by_epic = {}
        for k, j in self.issues.items():
            if j["isEpic"] and releases:
                r = releases[min(len(releases) - 1, int(rnd.random() ** 1.5 * len(releases)))]
                by_epic[k] = r
                j["releases"] = [{"id": r["id"], "name": r["name"]}]
        for k, j in self.issues.items():
            r = by_epic.get(j["epic"]) if j["epic"] else (rnd.choice(releases) if releases and j["sprintState"] == "active" and rnd.random() < .5 else None)
            if r and not j["isEpic"]:
                j["releases"] = [{"id": r["id"], "name": r["name"]}]
        # pull requests for the active sprint's open work, some waiting on review for days
        dev, n = {}, 100
        repos = [f"{self.key.lower()}-web", f"{self.key.lower()}-api", f"{self.key.lower()}-infra"]
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        for k, j in self.issues.items():
            if not active or j["sprintId"] != active["id"] or j["isEpic"] or j["category"] == "done":
                continue
            count = 0 if j["category"] == "todo" and rnd.random() < .8 else rnd.choice([0, 1, 1, 1, 2])
            prs = []
            for _ in range(count):
                n += 1
                repo, revs = rnd.choice(repos), rnd.choice([0, 1, 2, 2, 3])
                st = rnd.choices(["OPEN", "MERGED", "DECLINED"], [7, 3, 1])[0]
                upd = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=rnd.choice([2, 5, 20, 30, 50, 80, 110, 150]))
                prs.append({"title": f"{k}: {j['summary'][:80]}", "url": f"https://bitbucket.example.com/projects/{self.key}/repos/{repo}/pull-requests/{n}",
                            "status": st, "author": j["assignee"] or self.names.get(rnd.choice(list(self.names)), ""), "repo": repo,
                            "updated": upd.isoformat(timespec="seconds"), "reviewers": revs, "approved": rnd.randint(0, revs) if st == "OPEN" else revs})
            dev[k] = {"prs": prs, "branches": max(1, len(prs)) if count or j["category"] == "inprogress" else 0, "at": now}
        # the burndown's daily notes: scope and points left each working day so far, with a story added mid-sprint
        burn = {}
        if active:
            mine = [j for j in self.issues.values() if j["sprintId"] == active["id"] and not j["isEpic"] and j["resolution"] in done_res]
            num = lambda j: j["points"] if isinstance(j["points"], (int, float)) else 0
            late = sorted(mine, key=lambda j: j["created"])[-1:] if len(mine) > 3 else []
            d0, days = dt.date.fromisoformat(active["start"]), {}
            while d0 <= today:
                if d0.weekday() < 5:
                    live = [j for j in mine if not (j in late and (d0 - dt.date.fromisoformat(active["start"])).days < 3)]
                    left = [j for j in live if not (j["resolvedAt"] and j["resolvedAt"][:10] <= iso(d0))]
                    days[iso(d0)] = {"scope": sum(num(j) for j in live), "left": sum(num(j) for j in left), "stories": len(live),
                                     "unestimated": sum(1 for j in live if not isinstance(j["points"], (int, float))), "abandoned": 0}
                d0 += dt.timedelta(days=1)
            burn[str(active["id"])] = days
        return {"dev": dev, "burndown": burn}

    def write(self, out: str, plan: dict, sprints: list, board_name: str, epic_keys: list, jql_epics: str, jql_stories: str, releases: list | None = None) -> None:
        releases = releases or []
        extra = self.enrich(sprints, releases)
        bars = plan["bars"]
        on_board = [k for b in bars if not b.get("parked") for k in b.get("epics", [])]
        rollups = {k: self.rollup(k, k in on_board) for k in epic_keys}       # every epic the search found is counted
        linked = {k for b in bars for k in [b.get("jira", ""), *b.get("epics", []), *[t.get("jira", "") for t in b.get("tasks", [])]] if k}
        listed = {k for e in on_board for k in self.stories_of.get(e, [])}
        snap = secrets.token_hex(8)
        at = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=4)).isoformat(timespec="seconds")
        status = {"kind": "sightline-jira-status", "version": 1, "snapshot": snap, "generatedAt": at, "jiraBase": BASE,
                  "issues": {k: v for k, v in self.issues.items() if k in linked or k in listed}, "missing": [],
                  "sync": {"by": "watch", "every": 15, "plan": "plan.json"},
                  "board": {"id": 7, "name": board_name, "columns": [{"name": c, "statuses": s} for c, s in self.columns]},
                  "sprints": sprints, "rollups": rollups, "rollupsTruncated": False,
                  "releases": releases, "releasesAt": at, "dev": extra["dev"], "burndown": extra["burndown"]}
        open_stories = [k for k, v in self.issues.items() if not v["isEpic"] and v["category"] != "done"]
        listing = {"kind": "sightline-jira-issues", "version": 2, "snapshot": snap, "generatedAt": at, "jiraBase": BASE,
                   "searches": [{"name": "Epics", "jql": jql_epics, "total": len(epic_keys), "truncated": False, "keys": epic_keys},
                                {"name": "Open stories", "jql": jql_stories, "total": len(open_stories), "truncated": False, "keys": open_stories}],
                   "issues": [{"key": k, **self.issues[k]} for k in dict.fromkeys(epic_keys + open_stories)]}
        listing.update({"jql": jql_epics, "total": len(epic_keys), "truncated": False})
        os.makedirs(os.path.join(out, "jira"), exist_ok=True)
        for path, data in ((os.path.join(out, "plan.json"), plan), (os.path.join(out, "jira", "status.json"), status),
                           (os.path.join(out, "jira", "issues.json"), listing)):
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
        n_stories = sum(len(v) for v in self.stories_of.values())
        orphans = sum(1 for v in self.issues.values() if not v["isEpic"] and not v["epic"])
        print(f"Wrote {out}/plan.json and {out}/jira/ ({len(epic_keys)} epics, {n_stories} stories, {orphans} with no parent).")
        print(f"Open {out}/plan.json in Sightline, then connect {out}/jira through Settings > Jira connection. Use Work > Sort Jira work to place issues.")


def board_sprints(start: dt.date, count: int, weekday: int, parking: str) -> list:
    """Two-week sprints from the first `weekday` on or after start, plus a "future" parking lot whose dates have passed."""
    today, first = dt.date.today(), start + dt.timedelta(days=(weekday - start.weekday()) % 7)
    out = []
    for i in range(count):
        s = first + dt.timedelta(weeks=2 * i)
        e = s + dt.timedelta(days=13)
        out.append({"id": 40 + i, "name": f"Sprint {40 + i}", "state": "closed" if e < today else "active" if s <= today else "future",
                    "start": iso(s), "end": iso(e), "goal": ""})
    old = start - dt.timedelta(weeks=12)
    out.append({"id": 99, "name": parking, "state": "future", "start": iso(old), "end": iso(old + dt.timedelta(days=13)), "goal": ""})
    return out


def demo_releases(project: str, names: list) -> list:
    """Jira releases (versions) around today: one shipped, one due in two weeks, two later (the last with no date yet)."""
    today, out = dt.date.today(), []
    for i, (name, weeks) in enumerate(zip(names, [-3, 2, 7, None])):
        date = today + dt.timedelta(weeks=weeks) if weeks is not None else None
        out.append({"id": str(20100 + i), "name": name, "project": project, "date": iso(date) if date else "",
                    "start": iso(date - dt.timedelta(weeks=6)) if date else "", "released": weeks is not None and weeks < 0,
                    "description": "Made-up release for the demo."})
    return out


def plan_shell(title, start, weeks, lanes, people, bars, sprints, skip, cap: int = 8) -> dict:
    return {"meta": {"title": title, "start": iso(start), "weeks": weeks, "sprintWeeks": 2, "firstSprint": 40, "jiraBase": f"{BASE}/browse/", "jiraSkip": skip},
            "lanes": lanes, "people": [{"id": f"p-{k}", "name": n, "role": r, "jira": {"key": k, "user": k, "name": n}, **({"capacity": cap + (i * 5) % 7 * (cap // 8)} if r not in ("Product owner", "Designer", "Data analyst") else {})}
                                    for i, (k, n, r, *_) in enumerate(people)],
            "bars": bars, "milestones": [], "gates": [], "decisions": [], "risks": [], "baseline": None,
            "sprints": [{"id": f"s{s['id']}", "name": s["name"], "weeks": 2, "goal": ""} for s in sprints if s["id"] != 99]}


def epic_bar(key, summary, lane, start, span, parked=False) -> dict:
    return {"id": f"bar-{key.lower()}", "lane": lane, "start": start, "span": span, "label": summary, "kind": "work", "owners": [],
            "jira": key, "epics": [key], "status": "inprogress", "dependsOn": [], "tasks": [], "datesFrom": "manual", **({"parked": True} if parked else {})}


# ---------------------------------------------------------------- small: each case once
def small(out: str, seed: int) -> None:
    people = [("avery", "Avery Stone", "Lead"), ("blake", "Blake Rivera", "Engineer"), ("casey", "Casey Nguyen", "Engineer"),
              ("morgan", "Morgan Lee", "Engineer"), ("riley", "Riley Patel", "QA"), ("jordan", "Jordan Kim", "Designer")]
    columns = [("To Do", ["Open", "To Do", "Backlog"]), ("In Progress", ["In Progress"]), ("In Review", ["In Review"]), ("Done", ["Done", "Closed"])]
    category = {"Open": "todo", "To Do": "todo", "Backlog": "todo", "In Progress": "inprogress", "In Review": "inprogress", "Done": "done", "Closed": "done"}
    d = Demo("DEMO", people, columns, category)
    start = monday(dt.date.today()) - dt.timedelta(weeks=4)
    sprints = board_sprints(start, 6, 0, "Parking lot")
    done = [s for s in sprints if s["state"] == "closed"]
    going = next(s for s in sprints if s["state"] == "active")
    soon = [s for s in sprints if s["state"] == "future" and s["id"] != 99]
    EPICS = [
        ("Single sign-on", "on:int", [("SSO login flow", "Done", done[0], "avery", 5), ("Session timeout rules", "Done", done[1], "blake", 3),
            ("Identity provider settings page", "In Progress", going, "blake", 5), ("Token refresh", "In Review", going, "casey", 3),
            ("SSO audit events", "To Do", soon[0], "casey", 2), ("Rotate signing keys", "To Do", soon[1], "avery", 3)]),
        ("Search relevance", "on:search", [("Tune ranking weights", "Done", done[1], "morgan", 5), ("Synonym list", "In Progress", going, "morgan", 3),
            ("Relevance test set", "In Progress", going, "riley", 3), ("Click-through logging", "To Do", soon[0], "morgan", 2),
            ("Spike: semantic search", "Open", None, None, None), ("Old keyword boost", "Closed", done[0], "morgan", 1, "Won't Do")]),
        ("Usage dashboard", "on:plat", [("Dashboard wireframes", "Done", done[1], "jordan", 2), ("Usage events API", "To Do", soon[0], "casey", 5),
            ("Charts and filters", "To Do", soon[1], "jordan", 5), ("Export to CSV", "Backlog", sprints[-1], None, 2)]),
        ("Audit log export", "on:plat", [("Export job", "Done", done[0], "blake", 3), ("Retention settings", "Done", done[0], "casey", 2), ("Download page", "Done", done[1], "jordan", 2)]),
        ("Legacy importer", "on:int", [("CSV importer", "Done", done[0], "avery", 3), ("XML importer", "Closed", done[0], "avery", 3, "Won't Do")]),
        ("Rate limiting", "unsorted", [("Per-tenant limits", "In Progress", going, "blake", 3), ("429 responses", "To Do", soon[0], "casey", 1)]),
        ("Mobile layout", "unsorted", [("Responsive nav", "To Do", soon[0], "jordan", 3), ("Touch targets", "Open", None, None, 2)]),
        ("Webhooks v2", "unsorted", [("Signed payloads", "In Progress", going, "morgan", 5), ("Retry with backoff", "To Do", soon[1], "morgan", 3)]),
        ("Old reporting", "unsorted", [("Weekly report email", "Done", done[0], "riley", 2), ("PDF layout", "Done", done[0], "jordan", 3)]),
        ("Q2 cleanup", "unsorted", [("Remove feature flags", "Done", done[1], "blake", 1), ("Delete dead jobs", "Closed", done[1], "casey", 1, "Duplicate")]),
        ("Offline mode", "unsorted", []),
        ("Billing rework", "parked", [("Invoice model", "To Do", soon[1], "avery", 5), ("Tax rules", "Open", None, None, 3)]),
    ]
    d.n = 0
    epic_keys, bars, skip = [], [], []
    for i, (summary, where, stories) in enumerate(EPICS):
        key = f"DEMO-{i + 1}"
        epic_keys.append(key)
        d.issue(key, summary, "In Progress", is_epic=True)            # epics sit In Progress for months; Sightline goes by their stories
        if where.startswith("on:") or where == "parked":
            bars.append(epic_bar(key, summary, where[3:] if where.startswith("on:") else "plat", 1, 6, parked=where == "parked"))
        if where == "parked":
            skip.append(key)
    d.n = 100
    for i, (_, _, stories) in enumerate(EPICS):
        for st in stories:
            summ, status, spr, who, pts = st[:5]
            d.issue(d.next_key(), summ, status, epic=f"DEMO-{i + 1}", who=who, sprint=spr, points=pts, resolution=st[5] if len(st) > 5 else None)
    d.n = 189
    d.issue(d.next_key(), "Fix flaky login test", "In Progress", who="riley", sprint=going, points=1, kind="Bug")
    d.issue(d.next_key(), "Update the onboarding doc", "To Do", who="avery", sprint=soon[0], points=1)
    d.issue(d.next_key(), "Investigate slow export", "Open", kind="Bug")
    lanes = [{"id": "int", "name": "Integrations", "who": "Avery · Blake", "note": "", "color": "#2c6fbb"},
             {"id": "search", "name": "Search", "who": "Morgan", "note": "", "color": "#1f8a70"},
             {"id": "plat", "name": "Platform", "who": "Casey · Jordan", "note": "", "color": "#7a4fb3"}]
    bars.append({"id": "bar-release", "lane": "plat", "start": 6, "span": 2, "label": "Release readiness", "kind": "work", "owners": ["p-avery"],
                 "jira": "", "epics": [], "status": "notstarted", "dependsOn": [], "datesFrom": "tasks",
                 "tasks": [{"id": "t-notes", "label": "Write the release notes", "start": iso(start + dt.timedelta(weeks=6)), "days": 3, "status": "notstarted", "owners": ["p-avery"], "dependsOn": []},
                           {"id": "t-ranking", "label": "Ranking weights sign-off", "jira": d.stories_of["DEMO-2"][0], "start": iso(start + dt.timedelta(weeks=2)), "days": 2, "status": "done", "owners": ["p-morgan"], "dependsOn": []}]})
    plan = plan_shell("Demo plan", start, 16, lanes, people, bars, sprints, skip)
    d.write(out, plan, sprints, "Team board", epic_keys, 'project = DEMO AND "Epic Name" is not EMPTY', "project = DEMO AND issuetype in (Story, Bug) AND resolution = Unresolved",
            demo_releases("DEMO", ["1.4", "1.5", "1.6", "2.0"]))


# ---------------------------------------------------------------- store: 100 epics at a fictional outdoor-gear retailer
STORE_LANES = [
    ("web", "Storefront", "#2c6fbb", ["Product page redesign", "Faceted search", "Size and fit guide", "Wishlist sync", "Gift cards", "Store locator",
        "Recently viewed", "Bundles and kits", "Product videos", "Compare products", "Guest reviews", "Back-in-stock alerts", "Holiday landing pages",
        "Accessibility audit fixes", "Page speed budget", "Localized pricing", "Trail guides content hub"]),
    ("pay", "Checkout & Payments", "#1f8a70", ["One-page checkout", "Saved cards", "Buy now, pay later", "Address autocomplete", "Promo code engine",
        "Tax calculation service", "Fraud screening", "Gift card redemption", "Split shipments", "Order confirmation emails", "Refunds self-service",
        "Currency switcher", "Checkout error recovery", "Wallet payments", "Loyalty points at checkout", "PCI evidence pack"]),
    ("ship", "Fulfillment", "#b3541e", ["Warehouse pick lists", "Carrier rate shopping", "Returns portal", "Ship-from-store", "Packing slip redesign",
        "Delivery date promise", "Backorder handling", "Inventory sync", "Label printing", "Damaged item claims", "Drop-ship vendors",
        "Curbside pickup", "Cycle counts", "Rental returns inspection", "Oversize item freight", "Carbon-neutral shipping option", "Pallet tracking"]),
    ("app", "Mobile App", "#7a4fb3", ["App onboarding", "Push notifications", "Barcode scan in store", "Offline trail maps", "App store ratings prompt",
        "Dark mode", "Biometric sign-in", "In-app returns", "Order tracking widget", "Deep links", "App performance", "Tablet layout",
        "Crash reporting", "Watch companion", "Gear checklist", "Trip planner", "Membership card"]),
    ("data", "Data & Insights", "#b0305a", ["Sales dashboard", "Demand forecasting", "Customer segments", "Attribution model", "Data warehouse migration",
        "Event tracking plan", "Churn alerts", "Price elasticity study", "Weekly exec report", "Experiment platform", "Inventory health report",
        "Privacy requests pipeline", "Product recommendations", "Search analytics", "Returns analysis", "Store traffic sensors"]),
    ("plat", "Platform", "#3f7f2b", ["Kubernetes upgrade", "Single sign-on for staff", "Secrets rotation", "CI speedup", "Feature flag service",
        "Observability stack", "Disaster recovery drill", "API gateway", "Rate limiting", "Log retention policy", "Dependency updates",
        "Staging environments", "Cost dashboard", "Database upgrade", "CDN switch", "Incident runbooks", "Legacy CMS shutdown"]),
]
STORE_PEOPLE = [("ana.m", "Ana Moreno", "Engineering lead"), ("ben.o", "Ben Okafor", "Engineer"), ("chloe.w", "Chloe Wright", "Engineer"),
                ("dev.r", "Dev Raman", "Engineer"), ("elena.v", "Elena Vasquez", "Engineer"), ("felix.b", "Felix Braun", "Engineer"),
                ("grace.h", "Grace Holm", "QA"), ("hiro.t", "Hiro Tanaka", "Engineer"), ("isla.m", "Isla McKay", "Designer"),
                ("jonah.p", "Jonah Price", "Product owner"), ("kira.s", "Kira Shah", "Data analyst"), ("leo.f", "Leo Fontaine", "Engineer")]
STORE_OUTSIDERS = ["contractor.qa1", "vendor.dev2"]                  # assignees who aren't on the team, to show linking people
STORE_COLUMNS = [("Ready", ["Ready", "Backlog"]), ("To Do", ["To Do"]), ("In Progress", ["In Progress"]),
                 ("Testing (Step 1)", ["Step 1"]), ("Awaiting review (Step 2)", ["Step 2"]),
                 ("Done", ["Done", "Closed", "Completed", "In Production", "Abandoned", "Not Applicable", "Expired"])]
STORE_CATEGORY = {"Ready": "todo", "Backlog": "todo", "To Do": "todo", "In Progress": "inprogress", "Step 1": "inprogress", "Step 2": "inprogress",
                  "Done": "done", "Closed": "done", "Completed": "done", "In Production": "done", "Abandoned": "done", "Not Applicable": "done", "Expired": "done"}
STORY_PARTS = ["API endpoint", "UI build", "design review", "unit and integration tests", "analytics events", "error states", "copy review",
               "feature flag and rollout", "load test", "accessibility pass", "data migration", "monitoring and alerts", "docs",
               "spike: options", "edge cases from QA", "security review", "performance tuning", "admin settings", "email templates", "cleanup after launch"]
FINISHED = [("Done", "Done"), ("Done", "Done"), ("Done", "Done"), ("Closed", "Done"), ("Completed", "Done"), ("In Production", "Done - Locked")]
ABANDONED = [("Abandoned", "Won't Do"), ("Closed", "Duplicate"), ("Closed", "Cannot Reproduce"), ("Not Applicable", "Cancelled"), ("Expired", "Archived")]


def store(out: str, seed: int) -> None:
    rnd = random.Random(seed)
    d = Demo("TRL", STORE_PEOPLE, STORE_COLUMNS, STORE_CATEGORY)
    start = monday(dt.date.today()) - dt.timedelta(weeks=8)
    sprints = board_sprints(start, 14, 3, "Awaiting triage")        # sprints run Thursday to Wednesday
    closed = [s for s in sprints if s["state"] == "closed"]
    active = next(s for s in sprints if s["state"] == "active")
    future = [s for s in sprints if s["state"] == "future" and s["id"] != 99]
    park = sprints[-1]
    team = [p[0] for p in STORE_PEOPLE]
    who = lambda: rnd.choice(team) if rnd.random() > .06 else rnd.choice(STORE_OUTSIDERS)
    pts = lambda: rnd.choice([1, 2, 3, 3, 5, 5, 8, None])

    # 100 epics: 25 live on the board, 8 finished on the board, 10 parked, 57 to sort (35 live, 15 finished, 7 new)
    names = [(lane, name) for lane, _, _, ns in STORE_LANES for name in ns][:100]
    plan_for = ["on"] * 25 + ["on-done"] * 8 + ["parked"] * 10 + ["live"] * 35 + ["done"] * 15 + ["new"] * 7
    rnd.shuffle(plan_for)
    epic_keys, bars, skip, kind_of = [], [], [], {}
    d.n = 0
    for (lane, name), kind in zip(names, plan_for):
        key = d.next_key()
        epic_keys.append(key)
        own = "Ready" if kind == "new" else "Done" if kind in ("done", "on-done") and rnd.random() < .3 else "In Progress"   # most finished epics are left open
        d.issue(key, name, own, is_epic=True)
        if kind in ("on", "on-done", "parked"):
            s0 = rnd.randint(0, 10)
            bars.append(epic_bar(key, name, lane, s0, rnd.choice([2, 3, 4, 6]), parked=kind == "parked"))
        if kind == "parked":
            skip.append(key)
        kind_of[key] = kind
    d.n = 1000
    for key in epic_keys:
        kind, epic_name = kind_of[key], d.issues[key]["summary"]
        count = 0 if kind == "new" else rnd.randint(3, 6) if kind in ("done", "on-done") else rnd.randint(4, 14)
        for part in rnd.sample(STORY_PARTS, count):
            summary, bug = f"{epic_name}: {part}", rnd.random() < .12
            if kind in ("done", "on-done"):
                status, res = rnd.choice(ABANDONED) if rnd.random() < .12 else rnd.choice(FINISHED)
                spr = rnd.choice(closed[:max(1, len(closed) - 1)]) if rnd.random() < .8 else None
            else:
                r = rnd.random()
                if r < .30:   spr, (status, res) = rnd.choice(closed), rnd.choice(ABANDONED) if rnd.random() < .1 else rnd.choice(FINISHED)
                elif r < .55: spr, status, res = active, rnd.choice(["In Progress", "In Progress", "Step 1", "Step 2", "To Do", "Done"]), None
                elif r < .75: spr, status, res = rnd.choice(future[:4]), rnd.choice(["To Do", "To Do", "Ready"]), None
                elif r < .90: spr, status, res = None, rnd.choice(["Backlog", "Backlog", "Ready"]), None
                else:         spr, status, res = park, "Ready", None
            d.issue(d.next_key(), summary, status, epic=key, who=None if status in ("Backlog", "Ready") and rnd.random() < .6 else who(),
                    sprint=spr, points=pts(), resolution=res, kind="Bug" if bug else "Story",
                    labels=rnd.sample(["customer-facing", "tech-debt", "security", "performance", "accessibility"], rnd.choice([0, 0, 0, 1, 1, 2])))
    for summary in ["Checkout button misaligned on small phones", "Update the incident contact list", "Flaky test in cart suite",
                    "Investigate slow category pages", "Rename staging buckets", "Broken link in footer", "Clean up unused images",
                    "Vendor feed timeout", "Refresh the team wiki", "Old promo banner still showing", "Audit admin roles",
                    "Spelling errors on the returns page"]:
        d.issue(d.next_key(), summary, rnd.choice(["To Do", "In Progress", "Backlog", "Step 1"]), who=who() if rnd.random() < .7 else None,
                sprint=rnd.choice([active, None, future[0]]), points=pts(), kind="Bug" if rnd.random() < .5 else "Story")

    # two hand-made initiatives with tasks; one task is also a Jira story, so the plan's task wins
    first_on = next(b for b in bars if not b.get("parked"))
    story = d.stories_of.get(first_on["jira"], [None])[0]
    bars.append({"id": "bar-peak", "lane": "web", "start": 9, "span": 3, "label": "Peak season readiness", "kind": "work", "owners": ["p-ana.m"],
                 "jira": "", "epics": [], "status": "notstarted", "dependsOn": [], "datesFrom": "tasks",
                 "tasks": [{"id": "t-freeze", "label": "Code freeze checklist", "start": iso(start + dt.timedelta(weeks=9)), "days": 3, "status": "notstarted", "owners": ["p-ana.m"], "dependsOn": []},
                           {"id": "t-load", "label": "Load test the whole site", "start": iso(start + dt.timedelta(weeks=10)), "days": 5, "status": "notstarted", "owners": ["p-felix.b"], "dependsOn": ["t-freeze"]},
                           *([{"id": "t-linked", "label": "Also tracked in Jira", "jira": story, "start": iso(start + dt.timedelta(weeks=8)), "days": 2, "status": "inprogress", "owners": ["p-ben.o"], "dependsOn": []}] if story else [])]})
    lanes = [{"id": lid, "name": name, "who": "", "note": "", "color": color} for lid, name, color, _ in STORE_LANES]
    plan = plan_shell("Trailhead Outfitters: digital roadmap", start, 26, lanes, STORE_PEOPLE, bars, sprints, skip, cap=40)   # a busy board
    # the plan's own tags: a few on initiatives, and a few on Jira items (kept by their key)
    plan["tags"] = [{"id": "tag-peak", "name": "peak-season", "color": "#b3541e"}, {"id": "tag-okr", "name": "q4-okr", "color": "#7a4fb3"}, {"id": "tag-risk", "name": "watch", "color": "#b0305a"}]
    live = [b for b in bars if not b.get("parked") and b.get("epics")]
    for b in rnd.sample(live, min(8, len(live))):
        b["tags"] = [rnd.choice(["tag-peak", "tag-okr"])]
    plan["jiraItems"] = [{"id": b["jira"], "tags": ["tag-risk"]} for b in rnd.sample(live, min(4, len(live)))]
    d.write(out, plan, sprints, "Trailhead board", epic_keys, 'project = TRL AND "Epic Name" is not EMPTY', "project = TRL AND issuetype in (Story, Bug) AND resolution = Unresolved",
            demo_releases("TRL", ["2026.3 Summer sale", "2026.4 Checkout refresh", "2026.5 Peak season", "2027.1 Loyalty"]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out", nargs="?", default="demo", help="folder to write (default: demo)")
    ap.add_argument("--scenario", choices=["small", "store"], default="small")
    ap.add_argument("--seed", type=int, default=7, help="the store scenario is random but repeatable")
    a = ap.parse_args()
    {"small": small, "store": store}[a.scenario](a.out, a.seed)
