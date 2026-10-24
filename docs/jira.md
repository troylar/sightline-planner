# Bring Jira into the plan

Use Jira for the official issue facts and Sightline for the planning conversation around them. The optional
helper supports **Jira Data Center**, uses Python's standard library and makes read-only HTTPS requests.
The HTML never contacts Jira. [Back to the tour](../README.md#add-jira-when-youre-ready).

## Try the example before connecting a server

Open [the Northstar plan](../examples/northstar/plan.json), then connect its sibling **jira** folder in
**Settings → Jira connection**. It contains synthetic files and needs no token. Choose **Work → Sort Jira work**
to see how incoming issues can be placed without editing Jira facts.

## Configure your own trusted helper

After installing the npm package globally, `sightline helpers` prints the directory containing the trusted Python
helpers. Use the full path it prints in place of `/trusted/helpers` below. From a source checkout, use `tools`.
Python 3 is required; the HTML app itself doesn't require Python.

```sh
python3 /trusted/helpers/sightline-jira-sync.py setup
python3 /trusted/helpers/sightline-jira-sync.py fields
```

`setup` asks for your Jira HTTPS address and personal access token and stores the token in your OS credential
store. Do not put tokens in a shared folder, plan, command argument or screenshot. `fields` helps identify your
server's Epic Link, Sprint and Story Points fields. Use each command's `--help` for local field overrides.

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

For repeated syncs, run `python3 /trusted/helpers/sightline-jira-sync.py watch`. Read `install --help` before
configuring startup behavior. Run trusted helper code from your own computer, never a mutable shared folder.

## Read freshness literally

A local timestamp describes the most recent successful sync in the files Sightline read. It doesn't prove Jira
is current now, that your search covers everything, or that a cloud provider delivered the latest files. Missing
issues are “not in the last sync”; their surrounding plan work is retained. Jira status and sprint dates remain
Jira-owned. Sightline proposals do not write changes back to Jira.
