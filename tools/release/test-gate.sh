#!/usr/bin/env bash
# The merge gate against a stand-in gh: each case scripts what GitHub reports and checks whether the gate passes.
G="$(cd "$(dirname "$0")" && pwd)/gate.sh"; T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; f=0; n=0; p=0
mkdir "$T/bin"; cat > "$T/bin/gh" <<'GH'
#!/usr/bin/env bash
# pr view: the next line of heads.txt each call (the last one repeats). run list --commit X: runs.txt with X as headSha.
case "$1 $2" in
  "pr view") c=$(cat "$GT/calls" 2>/dev/null || echo 0); c=$((c + 1)); echo $c > "$GT/calls"
    l=$(wc -l < "$GT/heads.txt"); sed -n "$(( c < l ? c : l ))p" "$GT/heads.txt";;
  "run list") while [ $# -gt 0 ]; do [ "$1" = --commit ] && s=$2; shift; done; sed "s/HEAD/$s/g" "$GT/runs.txt";;
  "run rerun") echo rerun;;
esac
GH
chmod +x "$T/bin/gh"
OK='[{"databaseId":1,"headSha":"HEAD","workflowName":"Verify","event":"pull_request","status":"completed","conclusion":"success"},{"databaseId":2,"headSha":"HEAD","workflowName":"Performance","event":"pull_request","status":"completed","conclusion":"success"}]'
t(){ local want=$1 name=$2 heads=$3 runs=$4 sha=$5; n=$((n + 1)); local d="$T/c$n"; mkdir "$d"; printf '%s\n' $heads > "$d/heads.txt"; printf '%s' "$runs" > "$d/runs.txt"
  GT=$d PATH="$T/bin:$PATH" SIGHTLINE_GATE_POLL=0 bash "$G" 7 $sha > "$d/out" 2>&1; local got=$?; [ "$want" = 0 ] && ! grep -q "GATE FAIL" "$d/out" && got=0; [ "$want" = 1 ] && [ -n "$sha" ] && ! grep -q "GATE PASS 7 $sha" "$d/out" && got=9
  [ $((got == 0)) = "$want" ] && { echo "PASS  $name"; p=$((p + 1)); } || { echo "FAIL  $name (exit $got: $(tail -1 "$d/out"))"; f=1; }; }
t 1 "the pushed head, every run passed" "aaa1" "$OK" aaa1
t 1 "GitHub moves to the pushed head a moment late" "old0 old0 aaa1" "$OK" aaa1
t 0 "the head never reaches the pushed sha" "old0" "$OK" aaa1
t 0 "the head moves while the gate waits" "aaa1 bbb2" "$OK" aaa1
t 0 "the head moves while waiting, no sha given" "aaa1 bbb2" "$OK" ""
t 0 "one run failed" "aaa1" "${OK/success\"\}\]/failure\"\}]}" aaa1
echo; echo "$p/$n passed"; exit $f
