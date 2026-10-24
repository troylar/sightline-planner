# Screenshot capture notes

The tour uses actual Sightline 1.94.0 UI, captured in Chromium at 1440 × 850 CSS pixels in light and dark themes.
All people, projects, issues, outcomes and proposals belong to the invented Northstar example.

## Recreate the source data

From a trusted source checkout:

```sh
./build.sh
python3 tools/make-docs-demo.py
```

The generator writes `demo/plan.json` and `demo/jira/`. It uses current dates for Jira/sprint examples and fixed
Q4 2026–Q3 2027 roadmap targets. The checked-in `examples/northstar/` is a documentation snapshot, so its Jira
freshness naturally ages. It also contains two deliberately prepared amendments, not a live AI response.

## Capture the actual screens

Open the built HTML in a clean browser profile, open the synthetic plan, connect its synthetic Jira folder,
and choose Avery Stone as the example viewer. Keep **This browser only** visible if working with a detached copy.
Capture:

- Roadmap: Four quarters, starting Q4 2026; the one Later outcome remains outside the window.
- Timeline: by workstream, in weeks, with the Jira and plan work visible.
- Today: Team scope, including its freshness and coverage line.
- Assistant: Roadmap → Plan with AI, with a drafted request and no claimed live response.
- Review: connect the prepared amendments file; show both Ready changes with Apply, Skip and Edit. Scroll the
  inspector enough to show those controls without changing their contents.

The documentation capture used browser automation to load only these synthetic files. It does not establish a
native file-picker permission round trip, live endpoint connectivity, cloud freshness or two-device behavior.
Don't hide warning/coverage information or edit screenshots to imply a capability the app doesn't have.

Use paired `<picture>` sources in Markdown, describe the relevant action in the alt text, and inspect both images
before publishing. Keep image filenames stable when refreshing the tour.
