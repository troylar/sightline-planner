# Which build and download instructions apply?

Use **What's new** in the app to check its version. Keep the app's version separate from the version of a
repository, a customized skill folder, or a downloaded plan.

As checked on October 24, 2026:

| Capability or route | Availability |
| --- | --- |
| Public source checkout | Available at [troylar/sightline-planner](https://github.com/troylar/sightline-planner). Its current application source is 1.94.0. |
| Public npm install | Not currently available; the public registry lookup returns E404. Do not use the old `npx @troylar/sightline` quick start. |
| GitHub release HTML download | No public release assets are published yet. Build the source using the steps below. |
| External assistant folder, proposals and six skill folders | Available in public source 1.94.0. |
| Download/install skills from inside the HTML | Requires a build with 1.95.0 or later. Check that the Planning skills control exists. |
| Rich planning export with capacity, dependencies, risks and decisions | Requires a build with 1.96.0 or later, and `planning.version: 1` in the exported context. |

The newer builds above have been developed locally; this table is not a claim that their source or binaries
have been released publicly. A newer changelog entry in a working copy is not a download. Use the public-source
path below unless a matching artifact has actually been published.

## Available source-build path

With Git, Node.js 18+, Python 3.10+, and Bash:

```sh
git clone https://github.com/troylar/sightline-planner.git sightline
cd sightline
npm ci
./build.sh
```

Open **dist/sightline.html** in desktop Chrome or Edge. The **skills/** and **examples/northstar/** folders are
in the same checkout. No model account or Jira server is needed for the prepared example.

To create a separate app/example folder from a built checkout, the local CLI also works without npm publication:

```sh
node bin/sightline.js install ../my-plan
```

The local CLI refuses to overwrite different existing files. Use a new destination when updating.

## Before changing the advertised download route

Maintainers should verify the actual public route before adding a badge or replacing the instructions:

- The registry returns the intended public package version, and the published tarball installs into a fresh directory.
- The GitHub release has a real HTML asset, tied to the intended source commit and version.
- A visitor without repository write access can obtain the app and example through the documented route.
- The downloaded app identifies the expected version; the documented commands and screenshots match it.

These are release checks, separate from a passing source build or package dry run. Update this page when those
facts change. Until then, keep the working source path visible.
