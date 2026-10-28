#!/usr/bin/env python3
"""The suite runner must require both a successful process and an exact passing summary."""
import os
import pathlib
import shlex
import subprocess
import sys
import tempfile

RUNNER = pathlib.Path(os.environ.get("SIGHTLINE_RUNNER", pathlib.Path(__file__).with_name("run.sh"))).resolve()
SOURCE = RUNNER.read_text(encoding="utf-8")
passed = failed = 0


def ok(name: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
    else:
        failed += 1
        print(f"  FAIL {name}: {detail}")


def exercise(payload: str, seconds: str = "2") -> subprocess.CompletedProcess[str]:
    if "run_suite(){" in SOURCE:
        command = 'source "$1"; fail=0; run_suite synthetic "$2" "$3" -c "$4"; result=$?; [[ "$result" == 0 && "$fail" == 0 ]]'
        return subprocess.run(["bash", "-c", command, "runner-test", str(RUNNER), seconds, sys.executable, payload], capture_output=True, text=True, timeout=10)
    # Run the original count-only runner against synthetic children, for regression proof without loading the app.
    with tempfile.TemporaryDirectory() as temporary:
        directory = pathlib.Path(temporary)
        copy = directory / "run.sh"
        copy.write_text(SOURCE, encoding="utf-8")
        mock = directory / "timeout"
        mock.write_text("#!/usr/bin/env bash\nshift\nif [[ $1 == node && $2 == harness2.js ]]; then\n"
                        f"  exec {shlex.quote(sys.executable)} -c \"$RUNNER_PAYLOAD\"\nfi\nprintf '1/1 passed\\n'\n", encoding="utf-8")
        mock.chmod(0o755)
        env = dict(os.environ, PATH=str(directory) + os.pathsep + os.environ["PATH"], RUNNER_PAYLOAD=payload)
        return subprocess.run(["bash", str(copy)], capture_output=True, text=True, env=env, timeout=10)


cases = [
    ("accepts exact matching counts and a successful exit", "print('12/12 passed')", True),
    ("rejects a passing summary followed by a nonzero exit", "print('1/1 passed'); raise SystemExit(7)", False),
    ("rejects the suffix of mismatched counts", "print('11/1 passed')", False),
    ("rejects ordinary mismatched counts", "print('2/3 passed')", False),
    ("rejects a summary embedded in another line", "print('prefix 1/1 passed suffix')", False),
    ("rejects a missing summary even on a successful exit", "print('No assertions ran')", False),
    ("rejects a failure printed after an earlier passing summary", "print('1/1 passed'); print('FAIL later assertion')", False),
    ("uses the last exact summary rather than an earlier success", "print('1/1 passed'); print('1/2 passed')", False),
    ("rejects an empty assertion suite", "print('0/0 passed')", False),
    ("rejects a process crash without a summary", "import sys; print('Traceback: synthetic crash', file=sys.stderr); raise SystemExit(9)", False),
]
for name, payload, expected in cases:
    result = exercise(payload)
    ok(name, (result.returncode == 0) == expected, result.stdout[-400:] + result.stderr[-400:])

if "worktree_check(){" in SOURCE:
    with tempfile.TemporaryDirectory() as temporary:
        repo = pathlib.Path(temporary)
        git = lambda *a: subprocess.run(["git", "-C", str(repo), *a], capture_output=True, text=True, check=True)
        git("init", "-q"); (repo / "a.txt").write_text("one\n"); git("add", "a.txt")
        git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "one")
        probe = 'source "$1"; fail=0; before=$(worktree_state "$2"); eval "$3"; worktree_check "$before" "$2"; echo "fail=$fail"'
        same = subprocess.run(["bash", "-c", probe, "runner-test", str(RUNNER), str(repo), ":"], capture_output=True, text=True, timeout=10)
        ok("a run whose tree didn't change passes the worktree check", same.returncode == 0 and "fail=0" in same.stdout, same.stdout + same.stderr)
        edited = subprocess.run(["bash", "-c", probe, "runner-test", str(RUNNER), str(repo), 'echo two >> "$2/a.txt"'], capture_output=True, text=True, timeout=10)
        ok("a file edited during the run fails it, saying so", "fail=1" in edited.stdout and "WORKTREE CHANGED DURING RUN" in edited.stdout, edited.stdout + edited.stderr)
        git("checkout", "-q", "a.txt")
        moved = subprocess.run(["bash", "-c", probe, "runner-test", str(RUNNER), str(repo), 'git -C "$2" -c user.name=T -c user.email=t@example.com commit -q --allow-empty -m two'], capture_output=True, text=True, timeout=10)
        ok("a new commit during the run fails it too", "fail=1" in moved.stdout and "WORKTREE CHANGED DURING RUN" in moved.stdout, moved.stdout + moved.stderr)
else:
    ok("the runner checks that the tree didn't change during the run", False, "run.sh has no worktree_check")

result = exercise("import sys; print('1/1 passed'); print('diagnostic-first', file=sys.stderr); print('Not implemented: diagnostic-last', file=sys.stderr); raise SystemExit(7)")
ok("retains complete stdout and stderr on failure", result.returncode != 0 and all(text in result.stdout for text in ("1/1 passed", "diagnostic-first", "Not implemented: diagnostic-last", "exit 7")), result.stdout[-500:])
payload = "import time; print('1/1 passed', flush=True); time.sleep(5)" if "run_suite(){" in SOURCE else "print('1/1 passed'); raise SystemExit(124)"
result = exercise(payload, "1")
ok("a timeout after a passing summary still fails and is identified", result.returncode != 0 and "timed out" in result.stdout and "1/1 passed" in result.stdout, result.stdout[-500:])

# One suite at a time on the machine: a lock held by a live process makes a run wait and say who holds it; a lock whose
# process is gone, or whose pid now belongs to a process started at another time, is taken over; the lock goes at exit.
if "suite_lock(){" in SOURCE:
    with tempfile.TemporaryDirectory() as temporary:
        lock = pathlib.Path(temporary) / "suite.lock"
        holder = subprocess.Popen(["sleep", "30"])
        try:
            start = subprocess.run(["ps", "-o", "lstart=", "-p", str(holder.pid)], capture_output=True, text=True).stdout.strip()
            def take(owner, held=""):
                if lock.exists():
                    subprocess.run(["rm", "-rf", str(lock)])
                if owner is not None:
                    lock.mkdir(); (lock / "owner").write_text(owner)
                env = dict(os.environ, SIGHTLINE_LOCK=str(lock), SIGHTLINE_LOCK_POLL="0.2", SIGHTLINE_LOCK_HELD=held)
                probe = 'source "$1"; suite_lock; echo GOT; head -1 "$SIGHTLINE_LOCK/owner"'
                try:
                    return subprocess.run(["bash", "-c", probe, "runner-test", str(RUNNER)], capture_output=True, text=True, env=env, timeout=2)
                except subprocess.TimeoutExpired as e:
                    return subprocess.CompletedProcess(e.cmd, 124, (e.stdout or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or ""), "")
            r = take(f"{holder.pid}\n{start}\n01:23\n")
            ok("a run waits while a live process holds the suite lock, and says who and since when", "GOT" not in r.stdout and f"held by pid {holder.pid} since 01:23" in r.stdout, r.stdout + r.stderr)
            r = take("999999\nMon Jan  1 00:00:00 2001\n01:23\n")
            ok("a lock whose process is gone is taken over", "GOT" in r.stdout and "stale" in r.stdout, r.stdout + r.stderr)
            r = take(f"{holder.pid}\nMon Jan  1 00:00:00 2001\n01:23\n")
            ok("a lock whose pid was reused by a newer process is taken over", "GOT" in r.stdout, r.stdout + r.stderr)
            r = take(f"{holder.pid}\n{start}\n01:23\n", held=str(lock))
            ok("a run inside withlock.sh, which already holds the lock, doesn't wait on it", "GOT" in r.stdout, r.stdout + r.stderr)
            r = take(None)
            ok("a free lock is taken, stamped with the run's pid, and gone when the run ends", "GOT" in r.stdout and r.stdout.split()[-1].isdigit() and not lock.exists(), r.stdout + r.stderr)
        finally:
            holder.kill(); holder.wait()
else:
    ok("the runner takes a machine-wide suite lock", False, "run.sh has no suite_lock")

# Skipped browser suites: a failure unless SIGHTLINE_NO_BROWSER=1 says the skip is on purpose, and said either way.
def browser(no_browser: str) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ, CI="", PLAYWRIGHT="/nonexistent/playwright", SIGHTLINE_NO_BROWSER=no_browser)
    command = 'source "$1"; fail=0; browser_checks; exit "$fail"'
    return subprocess.run(["bash", "-c", command, "runner-test", str(RUNNER)], capture_output=True, text=True, env=env, timeout=30)
if "browser_checks(){" in SOURCE:
    result = browser("")
    ok("skipped browser suites fail the run, and say how many", result.returncode != 0 and "SKIPPED: 8 browser suites" in result.stdout and "SIGHTLINE_NO_BROWSER=1" in result.stdout, result.stdout[-500:])
    result = browser("1")
    ok("SIGHTLINE_NO_BROWSER=1 skips them on purpose, still saying so", result.returncode == 0 and "SKIPPED: 8 browser suites" in result.stdout, result.stdout[-500:])
else:
    ok("skipped browser suites fail the run, and say how many", False, "run.sh has no browser_checks")
print(f"{passed}/{passed + failed} passed")
sys.exit(1 if failed else 0)
