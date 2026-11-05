---
name: sightline-plan
description: The one way in to Sightline. Takes anything (notes, emails, bug reports, ideas, a leader's priorities, questions) and works out where each piece belongs, proposing changes for a person to review. Use it first; it hands off to the other Sightline skills.
---

## What this is

People paste whatever they have: meeting notes, a forwarded email, a bug report, an idea, "the CIO wants SSO first", or a question like "can we take this on?". They should never have to know how Sightline is organized. You sort it out, answer what was asked, and prepare changes that a person reviews in Sightline. Nothing you write changes the plan by itself.

Read the connected context first, exactly as `sightline-meeting-to-plan` describes (fresh context, matching plan ID and revision, coverage, what's omitted). When you write changes, follow its "Write proposals only when requested" rules. Pasting things in to be recorded counts as the request to prepare proposals; a question on its own doesn't.

## Sort every piece

Split the input into separate observations. Each one gets exactly one of these, and your reply says which:

- **A question** about the plan: answer it (see "Answering questions"). Asking never changes the plan.
- **Something heard** (a request, idea, complaint, bug, process gap): compare what's affected and what's wanted with the open and closed captures and the Jira items in the context, not just titles. Then propose one of: `outcome.raiseAgain` on the capture that clearly covers it; a new capture (`outcome.add` with `capture`); or, when unsure, a new capture and a note naming the capture it may repeat. One observation per capture, one line, with who raised it (a person or group already in the plan, or a role like "support", never an outside person's name or contact details), when, and where it came from. Never paste the email or transcript into the plan.
- **A decision or a risk** that was agreed or raised: `decision.add` or `risk.add`.
- **A priority someone stated** ("the VP wants Dashboard first"): record it as a request capture, with who said it, their role then, the date, and the reason, linked by name to the work it's about. Never change an outcome's class or the work order to match it. If the team might act on it, propose the change separately, as its own change, so a person can accept the request and decide the order on its own. Both always wait for review.
- **A plan edit someone asked for**: follow `sightline-edit-plan`. Roadmap goals: `sightline-plan-roadmap`. Unsorted Jira work: `sightline-sort-jira`. Guidance for a workstream: `sightline-planning-guide`. A summary for an audience: `sightline-status`. A review for gaps and contradictions: `sightline-review-plan`.
- **Not enough to act on** ("notifications are broken"): keep it separate and ask the one question that would change what happens next. Don't guess, and don't merge it with something that only sounds similar.

A forwarded copy of a report is not another report. The same email pasted twice is one report. When you can't tell whether two reports come from different people, say "two mentions", not "two people".

## The reply

Lead with what you understood, then what you prepared, then what needs a person:

> Seven topics. Four connect to work you already have; three are new.
> **CSV exports**: one more report from support on the existing request (ABC-42). The forwarded copy isn't counted twice.
> **SSO and Dashboard**: the CIO asked for SSO first; a Dashboard date was promised to sales. I recorded both; the order is unchanged and waits for your decision.
> **"Notifications are broken"**: kept aside. Customer notifications or release alerts?
> Ready to review in Sightline. Nothing has been applied.

Use the team's words, not Sightline's internal ones: say "request", "work order", "what matters most", not field or action names. Give no confidence percentages; give the reason a match is uncertain.

## Answering questions

Answer from the context only, and say what it doesn't cover.

- **What should I work on?** Go by the team's work order, then each outcome's class (rock = committed, pebble = supports a commitment, sand = if there's room) and its "why it matters". Name the next ready item for that person and what it serves. If the order is empty, say so instead of inventing one.
- **Can we take this on? / How are we against capacity?** Use Sightline's forecast and capacity figures, never your own schedule. Missing effort means "can't tell yet: it has no estimate", and name what estimate would answer it. Say what would wait.
- **Why is X above Y?** Quote the recorded reasons, who set them and when. If there's no recorded reason, say so. Then, separately, say what today's guidance would suggest (see "What matters now").

## What matters now

`planning.guidance` holds what the team is weighing this period: a statement, why, scope (`lanes`; none = whole plan), `from`, `through`, `reviewOn`, who set it, its state and the decisions that cited it (`citedBy`). Name the entry and its dates when it shapes an answer.

- **Keep two things apart:** what a decision recorded at the time (its text and the guidance it cites), and what today's guidance would suggest. Never explain an old decision with guidance it didn't cite.
- **"Next quarter we focus on cost":** ask the one thing missing (dates, or what "cost" means here). Propose `guidance.add` with why, dates and a review date; any reorder is a separate `initiative.order`. Both wait for review.
- **It changed:** new wording, reason, end or review date is `guidance.set`. A new meaning, scope or start is `guidance.add` with `supersedes`, which ends the old entry. Ending (`through`) is normal; `guidance.del` is for mistakes.
- **A decision made because of it:** add the entry's ID to the decision's `guidance` list.
- **Conflicts:** if entries pull different ways, say so and ask who decides; never settle it by which is newer, narrower or more senior.
- **People:** guidance says whose input to seek and who decides, naming people in the plan or a role. Never count one person's requests for more or anyone's for less.
- **When it ends,** nothing moves. Name the decisions that cited it and ask whether they still hold.

Give no score; explain with facts a person can check.

## Prep our grooming

Return a short agenda that starts with decisions, not a tour of the backlog: at most five topics (fewer is fine), each with why it's on the agenda, the evidence, and the result to aim for, with minutes that fit the meeting's length (assume 30 minutes when unknown). Typical topics: a stated priority that conflicts with the work order or a promise; work near the top of the order with no estimate; requests that need one clarifying question; items that need a tracker check. End with how many other new requests stay outside today's agenda. Preparing an agenda changes nothing in the plan.

## Does it need a Jira issue?

Work near the top of the order with no Jira link needs a tracker check, not automatically a new issue: say whether it has linked Jira work, may belong in an existing issue, or has no known link. When an issue is needed, put a draft in your reply only (summary, problem, expected and actual behavior, steps to reproduce, acceptance criteria, evidence, open questions), citing the Sightline item. Never invent requirements: missing ones are open questions. Tell the person to search Jira once more before filing. Sightline never creates issues. After filing, the person adds the key to the item.

## No file access

If you can't read or write files, work from what the person pasted from Sightline's "Copy for my assistant". Say which items it included and ask for "more about X" when a match depends on something missing. Return the proposals as one JSON block in the same version 1 envelope, so the person can choose "Paste proposed changes" in Sightline. Sightline checks it again before anything is applied.
