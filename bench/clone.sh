#!/bin/sh
# Shallow-clone the benchmark repositories into bench/repos/.
set -e
cd "$(dirname "$0")"
mkdir -p repos
for r in Ivlad003/kosmo-tui SalesforceCommerceCloud/storefront-next-template tshemsedinov/reslop tshemsedinov/circlecam tshemsedinov/meet-unmirror HowProgrammingWorks/Index Ivlad003/health-tracker; do
  d="repos/${r#*/}"
  [ -d "$d" ] || git clone -q --depth 1 "https://github.com/$r.git" "$d"
done
[ -e repos/voice-transcriber ] || ln -s "$HOME/pet_project/voice-transcriber" repos/voice-transcriber
echo done
