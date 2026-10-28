#!/usr/bin/env bash
# gate.sh <pr>: wait for the CI runs on the pull request's head commit (gh run list --commit <head sha>, so runs on
# other commits never count). Reruns cancelled runs once. Exits 0 only when both workflows have run there and every
# run concluded success. SIGHTLINE_REPO names the GitHub repository.
R=${SIGHTLINE_REPO:-troylar/sightline-planner}; N=$1; reran=""
[ -n "$N" ] || { echo "usage: gate.sh <pr number>" >&2; exit 2; }
sha=$(gh pr view "$N" -R "$R" --json headRefOid --jq .headRefOid) || exit 1
while :; do
  j=$(gh run list -R "$R" --commit "$sha" --json databaseId,headSha,workflowName,event,status,conclusion 2>/dev/null) || { sleep 30; continue; }
  j=$(jq --arg s "$sha" '[.[] | select(.headSha == $s)]' <<<"$j")
  if [ "$(jq '([.[].workflowName]|unique|length)>=2 and all(.status=="completed")' <<<"$j")" = true ]; then
    c=$(jq -r '.[]|select(.conclusion=="cancelled")|.databaseId' <<<"$j")
    if [ -n "$c" ] && [ -z "$reran" ]; then for id in $c; do gh run rerun "$id" -R "$R"; echo "rerun $id"; done; reran=1; sleep 60; continue; fi
    jq -r '.[]|"\(.workflowName)/\(.event) \(.conclusion) \(.databaseId)"' <<<"$j"
    [ "$(jq 'all(.conclusion=="success")' <<<"$j")" = true ] && { echo "GATE PASS $N $sha"; exit 0; } || { echo "GATE FAIL $N $sha"; exit 1; }
  fi
  sleep 30
done
