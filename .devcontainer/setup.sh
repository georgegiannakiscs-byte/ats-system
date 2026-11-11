#!/usr/bin/env bash
# One-time setup when the codespace is created: dependencies, database schema, production build.
# Progress is written to .data/setup.log; serve.sh shows a "starting" page until .data/setup-done exists.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p .data
rm -f .data/setup-done .data/setup-failed
{
  echo "== Installing dependencies" && npm ci &&
  echo "== Preparing the database" && npm run db:migrate &&
  echo "== Building the app" && npm run build
} 2>&1 | tee .data/setup.log
if [ "${PIPESTATUS[0]}" -eq 0 ]; then
  touch .data/setup-done
else
  touch .data/setup-failed
  exit 1
fi
