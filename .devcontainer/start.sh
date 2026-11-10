#!/usr/bin/env bash
# Runs on every codespace start: launches the production server and seeds the demo account once.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .data/storage
[ -f .data/codespace-secret ] || node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > .data/codespace-secret

if [ -n "${CODESPACE_NAME:-}" ]; then
  export APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  export APP_URL="http://localhost:3000"
fi
export NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
export APP_SECRET="$(cat .data/codespace-secret)"
export STORAGE_DIR="$PWD/.data/storage"
export PLATFORM_ADMIN_EMAILS="demo@example.com"
export DATABASE_URL="${DATABASE_URL:-postgres://deceler:deceler_dev@db:5432/deceler}"
# ANTHROPIC_API_KEY is picked up automatically if you add it as a Codespaces secret.

[ -f .next/standalone/server.js ] || bash .devcontainer/setup.sh
pkill -f "standalone/server.js" 2>/dev/null || true
# Fully detached (own session, no inherited stdio) so the codespace start step can finish.
(cd .next/standalone && exec setsid nohup node server.js) > /tmp/ulysse.log 2>&1 < /dev/null &

for _ in $(seq 1 60); do curl -sf http://localhost:3000/login > /dev/null && break; sleep 1; done
node scripts/seed-demo.mjs || echo "Demo seed failed — see the message above. The app still runs."
echo "Ulysse is running: $APP_URL  (sign in: demo@example.com / Ulysse-demo-2026). Server log: /tmp/ulysse.log"
