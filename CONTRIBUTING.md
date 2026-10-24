# Contribute to Sightline

Start with [vision.md](vision.md), the product charter, then [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md).
The app stays one self-contained HTML file, with separate plan files and optional trusted helpers.

## Build and verify

You need Node.js 18+, Python 3.10+, Bash and `timeout` on PATH. On macOS, GNU coreutils can provide the timeout command;
on Windows use a Bash environment with those commands available.

```sh
npm ci
./build.sh
./test/run.sh
```

Edit **src/sightline.template.html**, never generated **dist/** files. Build before testing: harnesses execute
the built HTML. See AGENTS.md for focused checks, deterministic dates and the exact runner requirements.

## Keep contributions reviewable

State whether the change touches Jira facts, the plan, viewer preferences or values computed from both.
For behavior changes add regression coverage in the relevant harness, and prove a fix's check fails on the old
build. Keep unrelated refactors out. User-visible changes need an entry in **src/releases.json**; the build
generates the changelog. The npm version must match the newest release.

Use `type(scope): description` commits. Describe the problem, resulting behavior and validation in the PR.
Report local tests, CI, deployment and real-world validation separately.

## Every example is invented

Never commit real plans, Jira output, credentials, employer/client identifiers, private screenshots or personal
filesystem paths. Generate synthetic examples with `python3 tools/make-docs-demo.py`. Review the intended diff
and run `./tools/check-private.sh` after staging. A missing external private-terms file means that scan skipped;
it doesn't prove the contribution is safe.

## Maintain the visual guide

Screenshots in **docs/images/** are captured from the built app using the invented Northstar plan. Keep the light
and dark versions paired, show actual UI and describe any prepared proposals as examples. Never fabricate a live
AI reply or imply a screenshot verifies cloud sync. [Screenshot capture notes](docs/screenshots.md).

## Prepare a release

Run the build and full suite, inspect `npm pack --dry-run`, then test the real packed tarball in a disposable
folder. Keep npm's runtime dependencies empty. The package should contain the built HTML, CLI, six skills,
trusted helpers, synthetic example and documentation, with no local credentials or generated mailbox files.
Git tags and release assets must match the tested source commit and package version. Publication is a separate,
deliberate action after validation.

## Keep the first-session promise

The README starts with a working source-build path. Before advertising npm or a release asset, run the
[public availability checks](docs/availability.md#before-changing-the-advertised-download-route); a dry run
or changelog entry is not publication evidence.

Keep the [prepared brain-dump session](docs/getting-started.md) reproducible. Its notes, proposal file and
before/after table must agree. Validate proposals against the invented Northstar plan and inspect the rendered
storyboard in light/dark and narrow/wide layouts. Keep its prepared-example label visible.

Keep newer capabilities version-labeled until their matching source or artifact is public. Documentation-only
updates do not need an application version bump.
