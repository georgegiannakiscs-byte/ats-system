#!/usr/bin/env bash
# One-time setup when the codespace is created: dependencies, database schema, production build.
set -euo pipefail
npm ci
npm run db:migrate
npm run build
