#!/usr/bin/env bash
# The publish gate's browser count: every case that once slipped or wrongly refused, plus the ones that must refuse.
C="$(dirname "$0")/browser-count.sh"; f=0
n=0; p=0
t(){ local want=$1 name=$2 list=$3 out=$4; n=$((n + 1)); printf '%s' "$out" | bash "$C" "$list" >/dev/null; local got=$?; [ $((got == 0)) = "$want" ] && { echo "PASS  $name"; p=$((p + 1)); } || { echo "FAIL  $name (exit $got)"; f=1; }; }
ALL=$'a 3/3 passed\nb 4/4 passed\nc 9/9 passed\nd 2/2 passed\ne 1/1 passed'
t 1 "all five pass" "a b c d e" "$ALL"
t 1 "the list comes with padding and tabs, as wc -w gives it" "  a b c d e	" "$ALL"
t 1 "the list is one name per line" $'a\nb\nc\nd\ne' "$ALL"
t 0 "one suite short of a pass" "a b c d e" $'a 3/3 passed\nb 3/4 passed\nc 9/9 passed\nd 2/2 passed\ne 1/1 passed'
t 0 "one suite missing from the output" "a b c d e" $'a 3/3 passed\nb 4/4 passed\nc 9/9 passed\nd 2/2 passed'
t 0 "a suite that ran nothing (0/0)" "a" $'a 0/0 passed'
t 0 "no suites listed" "" "$ALL"
t 0 "no output at all" "a b" ""
t 0 "a FAILED line" "a" $'a 3/4 passed · FAILED (exit 1)'
echo; echo "$p/$n passed"; exit $f
