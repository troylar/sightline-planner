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

result = exercise("import sys; print('1/1 passed'); print('diagnostic-first', file=sys.stderr); print('Not implemented: diagnostic-last', file=sys.stderr); raise SystemExit(7)")
ok("retains complete stdout and stderr on failure", result.returncode != 0 and all(text in result.stdout for text in ("1/1 passed", "diagnostic-first", "Not implemented: diagnostic-last", "exit 7")), result.stdout[-500:])
payload = "import time; print('1/1 passed', flush=True); time.sleep(5)" if "run_suite(){" in SOURCE else "print('1/1 passed'); raise SystemExit(124)"
result = exercise(payload, "1")
ok("a timeout after a passing summary still fails and is identified", result.returncode != 0 and "timed out" in result.stdout and "1/1 passed" in result.stdout, result.stdout[-500:])

# Skipped browser suites: a failure unless SIGHTLINE_NO_BROWSER=1 says the skip is on purpose, and said either way.
def browser(no_browser: str) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ, CI="", PLAYWRIGHT="/nonexistent/playwright", SIGHTLINE_NO_BROWSER=no_browser)
    command = 'source "$1"; fail=0; browser_checks; exit "$fail"'
    return subprocess.run(["bash", "-c", command, "runner-test", str(RUNNER)], capture_output=True, text=True, env=env, timeout=30)
if "browser_checks(){" in SOURCE:
    result = browser("")
    ok("skipped browser suites fail the run, and say how many", result.returncode != 0 and "SKIPPED: 7 browser suites" in result.stdout and "SIGHTLINE_NO_BROWSER=1" in result.stdout, result.stdout[-500:])
    result = browser("1")
    ok("SIGHTLINE_NO_BROWSER=1 skips them on purpose, still saying so", result.returncode == 0 and "SKIPPED: 7 browser suites" in result.stdout, result.stdout[-500:])
else:
    ok("skipped browser suites fail the run, and say how many", False, "run.sh has no browser_checks")
print(f"{passed}/{passed + failed} passed")
sys.exit(1 if failed else 0)
