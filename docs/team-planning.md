# Run the team from a clear next decision

Use the same plan for the roadmap conversation, delivery review, daily attention and leadership update.
Let your external assistant prepare the discussion and capture proposals; leave the team with an understandable
set of decisions. [Set up the assistant folder](assistant-workflow.md).

## Before the planning meeting

Open the intended shared plan, check its local save state and Jira freshness, and ask your assistant:

> Review the supplied planning scope. Give me the three decisions that most affect delivery, with stable
> item IDs, evidence and missing information. Keep ordinary updates separate from decisions. Do not change the plan.

Before a first session, ask the assistant what it can't see yet:

> List what `coverage.context` says is missing: workstreams without a description, people without skills,
> and work without a story or needs. Propose descriptions for the three busiest workstreams. Do not guess skills.

Point at a workstream's name to check its description, and keep the team's skills in **Settings → Team**.

Use the available evidence. Older exports do not contain the richer planning data described in the
[large-roadmap guide](large-roadmaps.md); supply missing material deliberately rather than guessing.

## During the conversation

Keep rough notes in the assistant tool. Distinguish “we agreed,” “we should explore,” and “we still need to decide.”
A person's name in a conversation does not assign them the work. Ask:

> Capture the agreed plan changes and the ideas we asked to retain. Leave owners and dates unknown where
> we did not decide them. Separate open decisions from amendments. Prepare a small, independently reviewable batch.

Review supported amendments in Sightline while the reasoning is still fresh. Put unsupported decisions, risks,
people or dependency edits into the normal UI. Save according to the visible state. The workflow uses supplied
notes; it does not record meeting audio.

## After the meeting

Ask for a short recap: decisions made, changes applied or still waiting, unresolved questions, and the next
person or decision needed. Have the assistant reread the context and matching results before claiming a proposal
landed. Do not send that recap to others unless you deliberately choose to do so.

For leadership, ask:

> Explain what changed, what needs attention, and the next decision. Name the scope and freshness. Use a
> previous snapshot only if one is supplied; otherwise describe the current state without inventing a change history.

Use **Delivery → Status update** for the shared delivery conversation and **Product updates → Customer release notes**
for customer wording. A proposed or planned outcome is not something that shipped.

## Capture what comes up

Meetings raise things that aren't work yet: "the support team wants to hear when the release process changes", "we
have no way to send release notes to the teams that use them". Keep them in the plan as captures (since 1.131.0):

- Paste your notes into your assistant with the meeting-to-plan skill. It proposes one capture per item: a request,
  idea, process gap or question, with who asked (a person or a group already in the plan), the meeting and its date,
  and the workstream when it's clear. A team that isn't in the plan yet comes as a new group, which always waits for
  your review.
- Or capture one by hand, live in the meeting: **Add** (or press A, then C) → **Capture a request or idea**, or
  **+ Capture a request or idea** in To triage. Only what was raised is needed; who asked and the workstream stay
  unknown unless you pick them, and the meeting and its date carry over to the next capture. **Capture and add
  another** keeps the form open.
- Raised again? As you type what was raised, the form lists captures with a similar name. **Same thing: record it
  there** adds this meeting, who asked and the date to that one instead of capturing it twice; **Capture** keeps it
  separate. Nothing is ever merged on its own. A capture's card lists every time it was raised again, with
  **Record it** to add one by hand and **Remove** to take one out, and its row in To triage says how many times it's
  come up. Your assistant does the same with the meeting-to-plan skill (since 1.133.0).
- **To triage**, on the Roadmap, lists open captures by workstream, oldest first, with **Unassigned** last. Open one
  to **Hand off** (to an initiative or a Jira issue) or **Decline** with a reason; **Reopen** puts it back.

**By asker**, in To triage, lists everything each person or group raised, open ones first, then what became of the
rest. **Copy a note for them** copies a short plain-text note to send back: each thing they raised and where it stands,
naming no one else. **Meeting recap** says what's new, raised again, closed and reopened since your last meeting (pick
another day if you like), with how many are still open. It leaves out who asked unless you tick **Say who asked**, since
a recap is often pasted where others read it. Closed and reopened come from the plan's change log, which keeps 30 days.
Neither saves anything to the plan (since 1.134.0).

A date doesn't commit a capture, and handing it off doesn't mark anything done: those stay roadmap decisions. A Jira
issue it became stays Jira's; the plan keeps only its key. Captures sit in the shared plan file, so write them as you'd
say them in the room.

## Between meetings

- Start in **Work → Today** for attention, blockers and due decisions.
- Use **Work → Sprint** for the current Jira sprint, and **Delivery → Timeline** for sequencing.
- Use **Product updates → Roadmap** for outcomes and the wider horizon. Its whole-plan scope differs from saved Timeline filters.
- Read **From Jira** and **Added here** as distinct ownership; planning does not alter Jira facts.

Choose yourself for personal views and author stamps. This is not a login or verified identity.

## Hand the plan to a teammate

For deliberate editing sessions, use **Start editing → Save → Done editing**, then check the file service's sync
state before a handoff. Quick updates can save immediately; inspect the visible save state. Agree on who is editing
when a device is offline. A local save does not prove another device received the change.

Keep each person's assistant folder private and separate by device and plan. Read the
[shared-file setup and recovery guide](onedrive.md) and perform its two-device check before relying on a rollout.
