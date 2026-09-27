#!/bin/sh
# Run `keylang map` + `keylang check` on a scratch copy of every benchmark
# repository (the originals are never written to) and print one line each.
set -e
cd "$(dirname "$0")"
bin="$(pwd)/../bin/keylang.js"
work="${KEYLANG_BENCH_WORK:-${TMPDIR:-/tmp}/keylang-bench}"
rm -rf "$work" && mkdir -p "$work"
for d in repos/*/; do
  r=$(basename "$d")
  rsync -a --exclude node_modules --exclude target --exclude .git --exclude keylang --exclude .keylang "$d" "$work/$r/"
  cd "$work/$r"
  start=$(date +%s%N)
  if node "$bin" map >/dev/null 2>"$work/$r.log"; then
    ms=$(( ($(date +%s%N) - start) / 1000000 ))
    warn=$(grep -c '^warning:' "$work/$r.log" || true)
    node "$bin" check >"$work/$r.check" 2>&1 || true
    node "$(dirname "$bin")/../bench/inject.ts" "$work/$r" >"$work/$r.probes" 2>&1 || true
    probe=$(tail -1 "$work/$r.probes")
    echo "$r | ${ms} ms | $(tail -1 "$work/$r.log") | $warn warning(s) | check: $(tail -1 "$work/$r.check") | probe: $probe"
  else
    echo "$r | — | $(tail -1 "$work/$r.log")"
  fi
  cd - >/dev/null
done
echo "logs and maps: $work"
