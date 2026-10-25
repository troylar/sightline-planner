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
main(){
  cd "$(dirname "${BASH_SOURCE[0]}")" || return 1
  fail=0
  for h in harness2 harness3 harness4 harness5 harness6 harness7 harness8 harness9 harness10 harness11 harness12 harness13 harness14 harness15 harness16 harness17 harness18 harness19 harness20 harness21 harness22 harness23 harness24 harness25 harness26 harness27 harness28 harness29 harness30 harness31 harness32 harness33 harness34 harness35 harness36 harness37 harness38 harness39 harness40 harness41 harness42 harness43 harness44 harness45 harness46 harness47 harness48 harness49 harness50 harness51 harness52 harness53 harness54 harness55 harness56 harness57 harness58 harness59 harness60 harness61 harness62 harness63 harness64 harness65 harness66 harness67 harness68 harness69 harness70 harness71 harness72 harness73 harness74 harness75 harness76 harness77 harness78 harness79 harness80 harness81 harness82 harness83 harness84 harness85 harness86 harness87 harness88 harness89 harness90 harness91 harness92 harness93 harness94 harness95 harness96 harness97 harness98 harness99 harness100 harness101 harness102 harness103 harness104 harness105 harness106 harness107 harness108 harness109; do
    run_suite "$h" 300 node "$h.js"
  done
  run_suite harness110 60 node harness110.js
  run_suite harness111 60 node harness111.js
  run_suite harness112 60 node harness112.js
  run_suite harness113 60 node harness113.js
  run_suite harness114 60 node harness114.js
  run_suite harness115 60 node harness115.js
  run_suite harness116 60 node harness116.js
  run_suite harness117 60 node harness117.js
  run_suite harness118 60 node harness118.js
  run_suite harness119 60 node harness119.js
  run_suite harness120 60 node harness120.js
  run_suite harness121 60 node harness121.js
  run_suite harness122 90 node harness122.js
  run_suite harness123 90 node harness123.js
  run_suite harness124 90 node harness124.js
  run_suite harness125 90 node harness125.js
  run_suite harness126 90 node harness126.js
  run_suite harness127 90 node harness127.js
  run_suite harness128 90 node harness128.js
  run_suite harness129 90 node harness129.js
run_suite harness130 90 node harness130.js
run_suite harness131 90 node harness131.js
run_suite harness132 90 node harness132.js
run_suite harness133 90 node harness133.js
  run_suite build 240 python3 test_build.py
  run_suite jira-sync 120 python3 test_jira_sync.py
  run_suite assistant 120 python3 test_assistant.py
  run_suite runner 30 python3 test_runner.py
  run_suite app 90 python3 test_app.py
  run_suite package 30 node test_package.js
  run_suite bundled-skills 60 node harness-bundled-skills.js
  return "$fail"
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
