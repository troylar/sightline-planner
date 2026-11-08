# Which install route gives you which version?

Use **What's new** in the app to check its version. Keep the app's version separate from the version of a
repository, a customized skill folder, or a downloaded plan.

| Route | What you get |
| --- | --- |
| npm: `npx @troylar/sightline install <folder>` | The released app, the **sightline-plan** skill, example plan, and Python helpers, all of one version. |
| Public source: [troylar/sightline-planner](https://github.com/troylar/sightline-planner) | The latest merged source. Build it to get the same files. |
| GitHub release HTML download | Not published. Use npm or a source build. |

To see what a version added, open **What's new** in the app, or read [CHANGELOG.md](../CHANGELOG.md).

## Install with npm

With Node.js 18 or later:

```sh
npx @troylar/sightline install my-sightline
```

Open **my-sightline/sightline.html** in desktop Chrome or Edge. The **sightline-plan** skill is in
**my-sightline/.sightline/skills/** and an invented example is in **my-sightline/example/**. No model account or
Jira server is needed for the example. `npx @troylar/sightline skills --to <folder>` installs only the skill, and
`npx @troylar/sightline helpers` prints where the Python helpers are.

Install never replaces a different file that's already there. To update, install into a new folder and open your
existing plan from the new app. Since 1.184.0 the one **sightline-plan** skill replaces the seven skills earlier
versions installed: point your assistant at the new folder and remove the older `sightline-` skill folders it reads,
so it doesn't follow old instructions.

Update everyone's copy together. An older copy opens a plan that uses newer features read-only, so it can't save the
plan and drop them: for example, a copy older than 1.184.0 opens a plan with request evidence or links read-only.

## Build from source

With Git, Node.js 18+, Python 3.10+, and Bash:

```sh
git clone https://github.com/troylar/sightline-planner.git sightline
cd sightline
npm ci
./build.sh
```

Open **dist/sightline.html** in desktop Chrome or Edge. The **skills/** and **examples/northstar/** folders are
in the same checkout. To make a separate app and example folder from a built checkout:

```sh
node bin/sightline.js install ../my-plan
```

## Before changing an install route

Maintainers check, for each release:

- The registry returns the intended version, and the published package installs into a fresh folder.
- The installed app shows that version, and its helpers carry the same version stamp.
- A visitor without write access to the repository can get the app and example through the documented route.
