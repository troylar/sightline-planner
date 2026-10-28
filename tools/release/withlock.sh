#!/usr/bin/env bash
# withlock.sh <command...>: one test suite at a time on this machine (parallel suites starve each other's timers).
# Takes the same machine-wide lock test/run.sh takes (SIGHTLINE_LOCK, default /tmp/sightline-suite.lock), runs the
# command, releases. A run.sh inside the command sees SIGHTLINE_LOCK_HELD and doesn't wait on it.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../test/run.sh" || exit 1
suite_lock || exit 1
"$@"
