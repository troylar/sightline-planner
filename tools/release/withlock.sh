#!/usr/bin/env bash
# withlock.sh <command...>: one test suite at a time on this machine (parallel suites starve each other's timers).
# Waits for the lock, runs the command, releases. SIGHTLINE_LOCK names the lock directory.
L=${SIGHTLINE_LOCK:-${TMPDIR:-/tmp}/sightline-suite.lock}
until mkdir "$L" 2>/dev/null; do sleep 10; done
trap 'rmdir "$L"' EXIT
"$@"
