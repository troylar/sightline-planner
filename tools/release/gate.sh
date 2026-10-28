#!/usr/bin/env bash
# gate.sh <pr> [sha]: wait for the CI runs on the pull request's head commit (gh run list --commit <head sha>, so runs
# on other commits never count). Reruns cancelled runs once. Exits 0 only when both workflows have run there, every run
# concluded success, and the head is still that commit. Pass the sha you just pushed: GitHub moves the head a moment
# after a push, and without it the gate can check the commit before. Merge with --match-head-commit <sha>.
# SIGHTLINE_REPO names the GitHub repository.
R=${SIGHTLINE_REPO:-troylar/sightline-planner}; N=$1; want=${2:-}; reran=""
[ -n "$N" ] || { echo "usage: gate.sh <pr number> [head sha]" >&2; exit 2; }
prhead() { gh pr view "$N" -R "$R" --json headRefOid --jq .headRefOid; }
sha=$(prhead) || exit 1
if [ -n "$want" ]; then
  for _ in $(seq 20); do case "$sha" in "$want"*) break;; esac; sleep 15; sha=$(prhead) || exit 1; done
  case "$sha" in "$want"*) ;; *) echo "GATE FAIL $N: head is $sha, not $want"; exit 1;; esac
fi
while :; do
  j=$(gh run list -R "$R" --commit "$sha" --json databaseId,headSha,workflowName,event,status,conclusion 2>/dev/null) || { sleep 30; continue; }
  j=$(jq --arg s "$sha" '[.[] | select(.headSha == $s)]' <<<"$j")
  if [ "$(jq '([.[].workflowName]|unique|length)>=2 and all(.status=="completed")' <<<"$j")" = true ]; then
    c=$(jq -r '.[]|select(.conclusion=="cancelled")|.databaseId' <<<"$j")
    if [ -n "$c" ] && [ -z "$reran" ]; then for id in $c; do gh run rerun "$id" -R "$R"; echo "rerun $id"; done; reran=1; sleep 60; continue; fi
    jq -r '.[]|"\(.workflowName)/\(.event) \(.conclusion) \(.databaseId)"' <<<"$j"
    [ "$(prhead)" = "$sha" ] || { echo "GATE FAIL $N: head moved off $sha while waiting"; exit 1; }
    [ "$(jq 'all(.conclusion=="success")' <<<"$j")" = true ] && { echo "GATE PASS $N $sha"; exit 0; } || { echo "GATE FAIL $N $sha"; exit 1; }
  fi
  sleep 30
done
