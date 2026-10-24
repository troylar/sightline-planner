# Your first five minutes with Sightline

The goal: one useful outcome, a four-quarter view and a plan you can reopen. Jira and AI can wait until you
want them. [Back to the tour](../README.md).

## Open the app

```sh
npx @troylar/sightline install ./my-plan
```

Open **`my-plan/sightline.html`** in desktop Chrome or Edge. Node.js 18+ is needed for this download command;
the HTML itself needs no server or installation. You can also download the HTML from the repository's latest
release. If you cloned the source, run `npm ci` and `./build.sh`, then open **`dist/sightline.html`**.

At first, the toolbar says **This browser only**. That means you have a local browser plan. Your HTML file
is the app, not the plan. Changing the plan doesn't rewrite the HTML.

## Make the first outcome concrete

Choose **Product updates → Roadmap**. Type this in **New idea**:

> New teams can create their first shared plan.

Choose **+ Add idea**. It starts as an idea; you can choose its timing and detail on its card. A useful outcome
says what becomes possible for someone. “Build onboarding” is work; “New teams can get started in minutes”
explains why that work matters. Keep unknown owners or dates unknown.

Set the horizon to **Four quarters**, choose a starting calendar quarter and year, then organize outcomes by
workstream. Use **Long range** to see broad years, halves and Later. An outside-window count is a route back to
other work; it hasn't been deleted.

<picture><source media="(prefers-color-scheme: dark)" srcset="images/roadmap-dark.png"><img src="images/roadmap-light.png" alt="Four quarters of Northstar outcomes with an outside-window count and Show in long range." width="1440"></picture>

*This example is invented. The “Needs detail” badges are useful prompts for the next conversation.*

## Save something you can hand to a teammate

1. Choose **File → Save as a new shared plan…** and save a separate JSON file.
2. Confirm the toolbar now identifies that shared file. For a detached download, use **File → Download JSON**.
3. Keep the app and plan together in a folder if convenient. They're still different files.
4. To reopen it, open the app, choose **File → Open shared plan…** and select that plan file.

Choose yourself in the toolbar for personal views and author stamps. This isn't a login. A deep link helps
navigate after a plan is available; it cannot open or grant access to the file by itself.

Before closing a tab with unsaved work, save or download JSON. Unsubmitted composer drafts belong to that tab's
session: submit or copy their text too. See [shared files and recovery](onedrive.md) before a team rollout.

## Try the populated Northstar example

The install command puts a complete example in **my-plan/example**. You can also download the repository's
**[Northstar example folder](../examples/northstar/)**. It contains:

```text
plan.json                 The invented team's plan and five outcomes
jira/status.json          Synthetic Jira status, sprints and releases
jira/issues.json          Synthetic issue details
sightline-amendments.json Two example changes for review
```

Open **plan.json** through **File → Open shared plan…**. Connect the example **jira** folder through
**Settings → Jira connection**. These files contain invented work; no Jira credentials or live server are needed.

Explore **Delivery → Timeline** and **Work → Today**. The Jira example's sync timestamp and sprint dates are a
snapshot from the documentation capture; freshness warnings are expected as it ages. To regenerate a current
example from source, run `python3 tools/make-docs-demo.py`. The roadmap targets stay fixed for the walkthrough.

## See the review loop without an AI account

With the example plan open, choose **Connect assistant** in the toolbar. Expand **Use individual files instead**,
choose **Connect that file**, and select the example's **sightline-amendments.json**. This is a prepared example,
not a live AI response.

<picture><source media="(prefers-color-scheme: dark)" srcset="images/review-dark.png"><img src="images/review-light.png" alt="Two synthetic proposals in Sightline's review panel, each with Apply, Skip and Edit controls." width="1440"></picture>

Read the changes. You can **Edit**, **Skip**, or **Apply** a ready change. A changed precondition waits for review;
it isn't forced through. Apply is atomic for each change. Inspect the save state, and use normal **Save** when
required. Choose **Undo** to reverse a just-applied plan edit. A download or local save does not prove cloud sync.

## Bring your own assistant

On Roadmap choose **Plan with AI**, or open an outcome and choose **Ask assistant about this**. Check **Working on**
before sending. A typed draft keeps its original context when you navigate; **Switch context** changes that deliberately.

- For chat inside Sightline, configure the [optional local companion](assistant-workflow.md#talk-to-your-company-endpoint).
- For a file-capable external assistant, connect a private assistant folder and use the [planning skills](skills.md).
- For project-specific terminology, fill in **Settings → Planning guide**. Save the guide, then save the shared plan.

Your next useful session: paste the team's rough notes, ask for proposed changes to the displayed four quarters,
and review them together while the decisions are still fresh.
