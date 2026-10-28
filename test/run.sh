#!/usr/bin/env bash
# Run every harness; exit non-zero if any check fails.
run_suite(){
  local name=$1 seconds=$2 out code line valid=0
  shift 2
  out=$(timeout "$seconds" "$@" 2>&1); code=$?
  line=$(printf '%s\n' "$out" | grep -E '^[0-9]+/[0-9]+ passed$' | tail -1)
  if [[ "$line" =~ ^([0-9]+)/([0-9]+)\ passed$ ]]; then
    (( 10#${BASH_REMATCH[1]} == 10#${BASH_REMATCH[2]} && 10#${BASH_REMATCH[2]} > 0 )) && valid=1
  fi
  if (( code == 0 && valid )) && ! printf '%s\n' "$out" | grep -qE '^[[:space:]]*FAIL([[:space:]]|$)'; then
    printf "  %-10s %s\n" "$name" "$line"
    return 0
  fi
  printf "  %-10s %s · FAILED (exit %s%s)\n" "$name" "${line:-NO RESULT}" "$code" "$([[ $code == 124 ]] && printf ', timed out')"
  printf '%s\n' "$out" | sed 's/^/      /'
  fail=1
  return 1
}
# The commit and the uncommitted files the run is testing. A run whose tree changed under it proves nothing about either.
worktree_state(){ git -C "$1" rev-parse HEAD 2>/dev/null; git -C "$1" status --porcelain 2>/dev/null; }
worktree_check(){   # before, dir
  [[ "$(worktree_state "$2")" == "$1" ]] && return 0
  printf "  %-10s %s\n" "worktree" "WORKTREE CHANGED DURING RUN: the commit or files changed while the suite ran, so these results don't describe either. Run it again."
  fail=1; return 1
}
# One suite at a time on this machine, from any worktree or session: suites side by side starve each other's timers.
# The lock is a directory holding its owner's pid, that process's start time and when it took the lock. A lock whose
# process is gone, or whose pid now belongs to a process that started at another time, is stale and taken over.
# tools/release/withlock.sh takes the same lock and sets SIGHTLINE_LOCK_HELD, so a run inside it doesn't wait on itself.
SUITE_LOCK=${SIGHTLINE_LOCK:-/tmp/sightline-suite.lock}
proc_start(){ ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//; s/ *$//'; }
lock_stale(){   # owner file -> 0 when nobody alive holds it
  local pid start
  if ! { read -r pid; read -r start; } < "$1" 2>/dev/null; then   # no owner yet: being taken, unless that was over a minute ago
    [[ -n "$(find "$(dirname "$1")" -maxdepth 0 -mmin +1 2>/dev/null)" ]]; return; fi
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 0
  [[ "$(proc_start "$pid")" == "$start" ]] || return 0
  return 1
}
suite_lock(){
  local said=0 pid since
  [[ "${SIGHTLINE_LOCK_HELD:-}" == "$SUITE_LOCK" ]] && return 0
  until mkdir "$SUITE_LOCK" 2>/dev/null; do
    if lock_stale "$SUITE_LOCK/owner"; then
      printf "  %-10s %s\n" "lock" "taking over a stale suite lock (pid $(head -1 "$SUITE_LOCK/owner" 2>/dev/null) is gone)"
      rm -f "$SUITE_LOCK/owner"; rmdir "$SUITE_LOCK" 2>/dev/null && continue   # rmdir, never rm -rf: the path can come from the environment
      printf "  %-10s %s\n" "lock" "FAILED: $SUITE_LOCK has other files in it, so it was left alone. Check it and remove it by hand."; return 1
    fi
    if (( ! said )); then { read -r pid; read -r _; read -r since; } < "$SUITE_LOCK/owner" 2>/dev/null
      printf "  %-10s %s\n" "lock" "waiting for suite lock held by pid ${pid:-?} since ${since:-just now} ($SUITE_LOCK)"; said=1; fi
    sleep "${SIGHTLINE_LOCK_POLL:-5}"
  done
  printf '%s\n%s\n%s\n' "$$" "$(proc_start $$)" "$(date +%H:%M)" > "$SUITE_LOCK/owner"
  export SIGHTLINE_LOCK_HELD="$SUITE_LOCK"; trap 'rm -f "$SUITE_LOCK/owner"; rmdir "$SUITE_LOCK"' EXIT
}
main(){
  local self before
  self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  cd "$(dirname "$self")" || return 1
  fail=0
  suite_lock || return 1
  before=$(worktree_state ..)
  # Each line: name, seconds allowed, command. They run side by side (SIGHTLINE_JOBS at a time, default one per CPU)
  # and print in this order; one after another they took about 25 minutes on CI.
  local specs=(
    "harness2 300 node harness2.js"
    "harness3 300 node harness3.js"
    "harness4 300 node harness4.js"
    "harness5 300 node harness5.js"
    "harness6 300 node harness6.js"
    "harness7 300 node harness7.js"
    "harness8 300 node harness8.js"
    "harness9 300 node harness9.js"
    "harness10 300 node harness10.js"
    "harness11 300 node harness11.js"
    "harness12 300 node harness12.js"
    "harness13 300 node harness13.js"
    "harness14 300 node harness14.js"
    "harness15 300 node harness15.js"
    "harness16 300 node harness16.js"
    "harness17 300 node harness17.js"
    "harness18 300 node harness18.js"
    "harness19 300 node harness19.js"
    "harness20 300 node harness20.js"
    "harness21 300 node harness21.js"
    "harness22 300 node harness22.js"
    "harness23 300 node harness23.js"
    "harness24 300 node harness24.js"
    "harness25 300 node harness25.js"
    "harness26 300 node harness26.js"
    "harness27 300 node harness27.js"
    "harness28 300 node harness28.js"
    "harness29 300 node harness29.js"
    "harness30 300 node harness30.js"
    "harness31 300 node harness31.js"
    "harness32 300 node harness32.js"
    "harness33 300 node harness33.js"
    "harness34 300 node harness34.js"
    "harness35 300 node harness35.js"
    "harness36 300 node harness36.js"
    "harness37 300 node harness37.js"
    "harness38 300 node harness38.js"
    "harness39 300 node harness39.js"
    "harness40 300 node harness40.js"
    "harness41 300 node harness41.js"
    "harness42 300 node harness42.js"
    "harness43 300 node harness43.js"
    "harness44 300 node harness44.js"
    "harness45 300 node harness45.js"
    "harness46 300 node harness46.js"
    "harness47 300 node harness47.js"
    "harness48 300 node harness48.js"
    "harness49 300 node harness49.js"
    "harness50 300 node harness50.js"
    "harness51 300 node harness51.js"
    "harness52 300 node harness52.js"
    "harness53 300 node harness53.js"
    "harness54 300 node harness54.js"
    "harness55 300 node harness55.js"
    "harness56 300 node harness56.js"
    "harness57 300 node harness57.js"
    "harness58 300 node harness58.js"
    "harness59 300 node harness59.js"
    "harness60 300 node harness60.js"
    "harness61 300 node harness61.js"
    "harness62 300 node harness62.js"
    "harness63 300 node harness63.js"
    "harness64 300 node harness64.js"
    "harness65 300 node harness65.js"
    "harness66 300 node harness66.js"
    "harness67 300 node harness67.js"
    "harness68 300 node harness68.js"
    "harness69 300 node harness69.js"
    "harness70 300 node harness70.js"
    "harness71 300 node harness71.js"
    "harness72 300 node harness72.js"
    "harness73 300 node harness73.js"
    "harness74 300 node harness74.js"
    "harness75 300 node harness75.js"
    "harness76 300 node harness76.js"
    "harness77 300 node harness77.js"
    "harness78 300 node harness78.js"
    "harness79 300 node harness79.js"
    "harness80 300 node harness80.js"
    "harness81 300 node harness81.js"
    "harness82 300 node harness82.js"
    "harness83 300 node harness83.js"
    "harness84 300 node harness84.js"
    "harness85 300 node harness85.js"
    "harness86 300 node harness86.js"
    "harness87 300 node harness87.js"
    "harness88 300 node harness88.js"
    "harness89 300 node harness89.js"
    "harness90 300 node harness90.js"
    "harness91 300 node harness91.js"
    "harness92 300 node harness92.js"
    "harness93 300 node harness93.js"
    "harness94 300 node harness94.js"
    "harness95 300 node harness95.js"
    "harness96 300 node harness96.js"
    "harness97 300 node harness97.js"
    "harness98 300 node harness98.js"
    "harness99 300 node harness99.js"
    "harness100 300 node harness100.js"
    "harness101 300 node harness101.js"
    "harness102 300 node harness102.js"
    "harness103 300 node harness103.js"
    "harness104 300 node harness104.js"
    "harness105 300 node harness105.js"
    "harness106 300 node harness106.js"
    "harness107 300 node harness107.js"
    "harness108 300 node harness108.js"
    "harness109 300 node harness109.js"
    "harness110 60 node harness110.js"
    "harness111 60 node harness111.js"
    "harness112 60 node harness112.js"
    "harness113 60 node harness113.js"
    "harness114 60 node harness114.js"
    "harness115 60 node harness115.js"
    "harness116 60 node harness116.js"
    "harness117 60 node harness117.js"
    "harness118 60 node harness118.js"
    "harness119 60 node harness119.js"
    "harness120 60 node harness120.js"
    "harness121 60 node harness121.js"
    "harness122 90 node harness122.js"
    "harness123 90 node harness123.js"
    "harness124 90 node harness124.js"
    "harness125 90 node harness125.js"
    "harness126 90 node harness126.js"
    "harness127 90 node harness127.js"
    "harness128 90 node harness128.js"
    "harness129 90 node harness129.js"
    "harness130 90 node harness130.js"
    "harness131 90 node harness131.js"
    "harness132 90 node harness132.js"
    "harness133 90 node harness133.js"
    "harness134 90 node harness134.js"
    "harness135 90 node harness135.js"
    "harness136 90 node harness136.js"
    "harness137 90 node harness137.js"
    "harness138 90 node harness138.js"
    "harness140 90 node harness140.js"
    "harness141 90 node harness141.js"
    "harness142 90 node harness142.js"
    "harness143 90 node harness143.js"
    "harness145 90 node harness145.js"
    "harness146 300 node harness146.js 1"
    "harness146b 300 node harness146.js 2"
    "harness147 90 node harness147.js"
    "harness148 60 node harness148.js"
    "harness149 60 node harness149.js"
    "harness150 60 node harness150.js"
    "harness151 60 node harness151.js"
    "harness152 60 node harness152.js"
    "harness153 60 node harness153.js"
    "harness154 60 node harness154.js"
    "harness155 60 node harness155.js"
    "harness156 60 node harness156.js"
    "harness157 60 node harness157.js"
    "harness158 60 node harness158.js"
    "harness159 60 node harness159.js"
    "harness160 60 node harness160.js"
    "harness161 60 node harness161.js"
    "harness162 60 node harness162.js"
    "harness163 60 node harness163.js"
    "harness164 60 node harness164.js"
    "harness165 60 node harness165.js"
    "harness166 60 node harness166.js"
    "harness167 60 node harness167.js"
    "harness168 60 node harness168.js"
    "harness169 30 node harness169.js"
    "harness170 60 node harness170.js"
    "harness171 30 node harness171.js"
    "harness172 30 node harness172.js"
    "harness173 30 node harness173.js"
    "harness174 30 node harness174.js"
    "harness175 30 node harness175.js"
    "harness176 30 node harness176.js"
    "harness177 30 node harness177.js"
    "harness178 30 node harness178.js"
    "harness179 30 node harness179.js"
    "harness144 90 node harness144.js"
    "harness139 90 node harness139.js"
    "build 240 python3 test_build.py"
    "jira-sync 120 python3 test_jira_sync.py"
    "assistant 120 python3 test_assistant.py"
    "runner 30 python3 test_runner.py"
    "release-count 30 bash ../tools/release/test-browser-count.sh"
    "release-gate 30 bash ../tools/release/test-gate.sh"
    "repo 30 node repo-files.js"
    "app 90 python3 test_app.py"
    "package 30 node test_package.js"
    "bundled-skills 60 node harness-bundled-skills.js"
  )
  local jobs=${SIGHTLINE_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)} dir spec name i=0 k=1 n=1 mine=()
  # SIGHTLINE_SHARD=k/n runs every n-th line starting at line k, and the browser checks only in the last shard, so CI can
  # split the suite across machines. Every shard together runs every line once.
  if [[ -n "${SIGHTLINE_SHARD:-}" ]]; then
    if [[ ! "$SIGHTLINE_SHARD" =~ ^([0-9]+)/([0-9]+)$ ]] || (( BASH_REMATCH[1] < 1 || BASH_REMATCH[1] > BASH_REMATCH[2] )); then
      echo "SIGHTLINE_SHARD must be k/n with 1 <= k <= n, not '$SIGHTLINE_SHARD'" >&2; return 1
    fi
    k=${BASH_REMATCH[1]} n=${BASH_REMATCH[2]}
  fi
  for spec in "${specs[@]}"; do (( i++ % n == k - 1 )) && mine+=("$spec"); done
  specs=("${mine[@]}")
  dir=$(mktemp -d) || return 1
  printf '%s\n' "${specs[@]}" | RUN_OUT=$dir xargs -P "$jobs" -L 1 bash "$self" --one
  for spec in "${specs[@]}"; do
    name=${spec%% *}
    cat "$dir/$name.out" 2>/dev/null || printf "  %-10s %s\n" "$name" "NO RESULT · FAILED (never ran)"
    [[ "$(cat "$dir/$name.rc" 2>/dev/null)" == 0 ]] || fail=1
  done
  rm -rf "$dir"
  (( k == n )) && browser_checks
  worktree_check "$before" ..
  return "$fail"
}
# Layout in a real browser (jsdom has no layout). CI installs Chromium and must run them. Elsewhere they run when Playwright
# is installed (npm ci, then npx playwright install chromium, or PLAYWRIGHT=/path/to/node_modules/playwright). A skip fails
# the run, so a local pass means what CI's does, unless SIGHTLINE_NO_BROWSER=1 says the skip is on purpose.
browser_checks(){
  local t suites=(layout-shelves layout-labels layout-avatars side-scroll capture-dialog layout-chips back-place layout-nav)
  if node -e 'require(process.env.PLAYWRIGHT || "playwright")' 2>/dev/null || [[ -n "$CI" ]]; then
    for t in "${suites[@]}"; do run_suite "$t" 180 node "$t.js"; done
    return
  fi
  printf "  %-10s %s\n" "browser" "SKIPPED: ${#suites[@]} browser suites (${suites[*]}): Playwright isn't installed here"
  if [[ "${SIGHTLINE_NO_BROWSER:-}" == 1 ]]; then
    printf "  %-10s %s\n" "" "SIGHTLINE_NO_BROWSER=1, so the skip doesn't fail the run"
    return
  fi
  printf "  %-10s %s\n" "" "FAILED: install Playwright (npm ci, then npx playwright install chromium) or set PLAYWRIGHT, or run with SIGHTLINE_NO_BROWSER=1 to skip them on purpose"
  fail=1
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ "${1:-}" == --one ]]; then
    shift; name=$1; cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
    run_suite "$@" > "$RUN_OUT/$name.out"; echo $? > "$RUN_OUT/$name.rc"; exit 0
  fi
  main "$@"
fi
