# Bring Jira into the plan

Use Jira for the official issue facts and Sightline for the planning conversation around them. The optional
helper supports **Jira Data Center**, uses Python's standard library and makes read-only HTTPS requests.
The HTML never contacts Jira. [Back to the tour](../README.md#how-it-works).

## Try the example before connecting a server

Open [the Northstar plan](../examples/northstar/plan.json), then connect its sibling **jira** folder in
**Settings → Jira connection**. It contains synthetic files and needs no token. Choose **Work → Sort Jira work**
to see how incoming issues can be placed without editing Jira facts.

## Configure your own trusted helper

`npx @troylar/sightline helpers` prints the folder that holds the helpers, stamped with the app's version. Use
that absolute path in place of `/trusted/helpers` below. From a source checkout, run `./build.sh` and use **dist/**
(`node bin/sightline.js helpers` prints it). Python 3.10+ is required for the helpers; the HTML app itself does not
require Python. The helper only reads from Jira: it never creates, edits or deletes anything there.

```sh
python3 /trusted/helpers/sightline-jira-sync.py setup
python3 /trusted/helpers/sightline-jira-sync.py fields
```

`setup` asks for your Jira HTTPS address and personal access token and stores the token in your OS credential
store. Do not put tokens in a shared folder, plan, command argument or screenshot. `fields` helps identify your
server's Epic Link, Sprint, Story Points and Parent Link fields. Use each command's `--help` for local field overrides.
If your Jira puts a feature (or another level) between epics and stories through Parent Link, the sync needs that
field to trace each story to its epic. Without it, the sync says so after each run, and **Sort Jira work** explains
why such stories show with **No epic**. Sort Jira work groups a story under the first epic above it, through any
feature in between, even when that epic isn't on the plan.

Save a JSON plan first. Then, with an explicit Jira board ID and JQL that you choose locally:

```sh
python3 /trusted/helpers/sightline-jira-sync.py sync /path/to/plan.json --board 42 --jql 'project = DEMO' --save
```

`42` and `DEMO` are invented examples. Replace them deliberately with your own board and search. The helper reads
more than search results, including relevant issue, board and sprint endpoints. Server/search configuration stays
local to the token holder and is never taken from the shared plan. `--save` remembers this plan's sync settings on
that computer. The default output is a **jira** folder beside the plan.

## Connect the output in Sightline

1. Open the matching plan in Sightline.
2. Choose **Settings → Jira connection**, then connect the local **jira** output folder.
3. Check the sync timestamp, coverage and any setup warnings. If the plan's sprints differ, inspect **See the change
   first** before choosing to follow Jira's sprints.
4. Use **Work → Sort Jira work** to arrange returned issues. Open an item: **From Jira** stays read-only;
   **Added here** is your planning context.
   Your assistant can propose where each issue goes (the **Sort Jira work** skill); you review every placement in
   **Changes** before anything joins the plan, and nothing is written to Jira. See
   [Sorting Jira work](assistant-workflow.md#sorting-jira-work).
5. An initiative or task linked to an issue shows the issue's description as its story, marked **From Jira**
   (Sightline 1.109.0 or later, with the matching sync). The sync reads descriptions only for issues the plan links.
6. Every Jira item shows who owns it as a small circle with their initials. You'll see it on story and Jira-linked
   bars, sprint shelf tiles, cards, List rows, and the hover card and details. A dashed empty circle means unassigned.
   An outlined circle is an owner outside the team. Hover it, or use a screen reader, for the full name. Spotlight
   rings that person's circles. The initials come from the plan's people and Jira's display names. No pictures are
   fetched. If two people share initials, each gets a third letter.

For repeated syncs, run `python3 /trusted/helpers/sightline-jira-sync.py watch`. Read `install --help` before
configuring startup behavior. Run trusted helper code from your own computer, never a mutable shared folder.

## Read freshness literally

A local timestamp describes the most recent successful sync in the files Sightline read. It doesn't prove Jira
is current now, that your search covers everything, or that a cloud provider delivered the latest files. Missing
issues are “not in the last sync”; their surrounding plan work is retained. Jira status and sprint dates remain
Jira-owned. Sightline proposals do not write changes back to Jira.
