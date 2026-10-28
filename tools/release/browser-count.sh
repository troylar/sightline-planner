#!/usr/bin/env bash
# browser-count.sh "<suite names>": reads "<suite> N/M passed" lines on stdin, prints "NP of NB", and exits 0 only when
# every listed suite (at least one) reported N/N with N > 0. Counts are compared as numbers, so padding can't break it.
NB=$(echo $1 | wc -w | tr -d ' \t'); NP=$(awk 'NF==3 && $3=="passed" { split($2, c, "/"); if (c[1] == c[2] && c[2] > 0) n++ } END { print n+0 }')
echo "$NP of $NB"; [ "$NB" -ge 1 ] 2>/dev/null && [ "$NP" -eq "$NB" ] 2>/dev/null
