# Screenshot capture notes

The tour uses actual Sightline 1.184.1 UI, captured in Chromium at 1440 × 850 CSS pixels (the Planning skills dialog
at 1100 × 900) in light and dark themes. All people, projects, issues, outcomes, requests and proposals belong to the
invented Northstar example.

## Recreate the source data

From a trusted source checkout:

```sh
./build.sh
python3 tools/make-docs-demo.py
```

The generator writes `demo/plan.json` and `demo/jira/`. It uses current dates for Jira, sprint examples and the
requests' raised dates, and fixed Q4 2026–Q3 2027 roadmap targets. Besides the outcomes and work, it gives the
example a priority on three outcomes, a work order, efforts, workstream members, three requests (one heard twice), a
**What matters now** entry and a decision that cites it, so the newer pages have something real to show. The
checked-in `examples/northstar/` is a documentation snapshot of the same plan, so its Jira freshness naturally ages.
It also contains prepared amendments, not live AI responses: `sightline-amendments.json` (two wording changes, for
the first-session walkthrough) and `assistant-reply.json` (a repeated request, a new request and a wording change,
as an assistant would return them).

## Capture the actual screens

```sh
node tools/docs-shots.js            # every shot
node tools/docs-shots.js today,review
```

It opens the built HTML in Chromium, loads only these synthetic files, uses the plan's Jira sprints, chooses Avery
Stone as the viewer, and writes `docs/images/<shot>-light.png` and `-dark.png`:

- **roadmap**: Four quarters, starting Q4 2026, with each outcome's priority; the one Later outcome stays outside the
  window.
- **timeline**: by workstream, in weeks, with the Jira and plan work visible.
- **today**: Mine, with **Sightline noticed** and **Prep our grooming** open, and the freshness and coverage line.
- **review**: `assistant-reply.json` pasted through **Paste proposed changes**, scrolled to the three ready changes,
  grouped by topic, with Apply, Skip and Edit.
- **assistant**: Setup and files, **Use any AI assistant** open: **Copy for my assistant**, **Paste proposed
  changes** and **Copy more about it**.
- **whatif**: Capacity, Forecast, **What if** for the invented sign-in request, with the forecast table below.
- **bundled-skills**: the Planning skills dialog with the one bundled skill.

**This browser only** stays visible because the capture uses a detached copy, not a shared file. The capture does
not establish a native file-picker permission round trip, live endpoint connectivity, cloud freshness or two-device
behavior. Don't hide warning or coverage information or edit screenshots to imply a capability the app doesn't have.

Use paired `<picture>` sources in Markdown, describe the relevant action in the alt text, and inspect both images
before publishing. Keep image filenames stable when refreshing the tour.

## Prepared planning storyboard

`planning-story-*.svg` is an illustration, not a screenshot or model response. Its four variants cover
wide/narrow layouts and light/dark themes. The content follows `examples/northstar/brain-dump.txt` and
`roadmap-session-amendments.json`: a Q2-to-Q1 target move plus an unscheduled idea. Its labels explicitly say
that the proposals are prepared. It makes no capacity or live-connectivity claim. Check all variants when
changing the example, keep text readable, and retain an accurate text equivalent beside the image.

## Roadmap map and decision brief

`roadmap-map-*.svg` is a conceptual map of the planning workflow, not an app screenshot.
`planning-decisions-*.svg` illustrates the ten-note exercise in `roadmap-planning-example.md`; its capacity
numbers belong to one invented Platform sprint, not a delivery forecast. Both sets have wide/mobile and
light/dark variants. Keep their text equivalents in the image descriptions and the linked worked session.
SVGs are static, self-contained source artwork with no scripts, external resources, or embedded app UI.
