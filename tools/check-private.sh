#!/usr/bin/env bash
# Fails if the staged changes (or, with --all, the whole tree) contain a private term.
# The terms live OUTSIDE the repo, one per line, in ~/.config/Sightline/private-terms, so they're never committed.
set -euo pipefail
cd "$(dirname "$0")/.."
# A tracked symbolic link points outside the repo (a worktree's linked node_modules once slipped in): never commit one.
links=$(git ls-files -s | awk '$1=="120000"{print $4}')
if [ -n "$links" ]; then echo "check-private: tracked symbolic links (remove with git rm --cached):"; echo "$links"; exit 1; fi
TERMS="${SIGHTLINE_PRIVATE_TERMS:-$HOME/.config/Sightline/private-terms}"
[ -f "$TERMS" ] || { echo "check-private: no terms file at $TERMS (one term per line); skipping" >&2; exit 0; }
pattern=$(grep -v '^\s*$' "$TERMS" | sed 's/[][\.*^$|?+(){}]/\\&/g' | paste -sd'|' -)
[ -n "$pattern" ] || exit 0
if [ "${1:-}" = "--all" ]; then
  hits=$(git ls-files | grep -v '^dist/' | xargs grep -nIiE "$pattern" 2>/dev/null || true)
else
  hits=$(git diff --cached -U0 | grep -E '^\+' | grep -iE "$pattern" || true)
fi
if [ -n "$hits" ]; then echo "check-private: private terms found:"; echo "$hits" | cut -c1-160; exit 1; fi
echo "check-private: clean"
