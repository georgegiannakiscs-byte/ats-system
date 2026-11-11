#!/usr/bin/env bash
# Keeps Ulysse running in the dev container. Started by docker compose (not by the editor), so it
# runs whether or not anyone has a terminal open, and restarts the server if it ever stops.
cd "$(dirname "$0")/.."
mkdir -p .data/storage

# Public address of port 3000 in GitHub Codespaces (used for links and the same-origin check).
CS_ENV=/workspaces/.codespaces/shared/environment-variables.json
if [ -z "${CODESPACE_NAME:-}" ] && [ -f "$CS_ENV" ]; then
  eval "$(node -e 'const e=require(process.argv[1]);for(const k of ["CODESPACE_NAME","GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN","ANTHROPIC_API_KEY"])if(e[k])console.log(`export ${k}=${JSON.stringify(e[k])}`)' "$CS_ENV")"
fi
if [ -n "${CODESPACE_NAME:-}" ]; then
  export APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  export APP_URL="${APP_URL:-http://localhost:3000}"
fi
[ -f .data/codespace-secret ] || node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > .data/codespace-secret
# Listen on IPv4 and IPv6 when the container supports IPv6 (port forwarding may connect over ::1).
if [ -f /proc/net/if_inet6 ] && [ "$(cat /proc/sys/net/ipv6/conf/lo/disable_ipv6 2>/dev/null || echo 1)" = "0" ]; then
  LISTEN_HOST="::"
else
  LISTEN_HOST="0.0.0.0"
fi
export NODE_ENV=production PORT=3000 HOSTNAME="$LISTEN_HOST" LISTEN_HOST
export APP_SECRET="$(cat .data/codespace-secret)"
export STORAGE_DIR="$PWD/.data/storage"
export PLATFORM_ADMIN_EMAILS="demo@example.com"
export DATABASE_URL="${DATABASE_URL:-postgres://deceler:deceler_dev@db:5432/deceler}"

# A plain status file (opened automatically in the editor) with a clickable link to the app,
# whether it answers, and the latest log lines. Refreshed every 5 seconds.
STATUS=.data/ULYSSE-STATUS.md
write_status() {
  local phase v4 v6
  if [ -f .data/setup-done ]; then phase="✅ Setup finished"
  elif [ -f .data/setup-failed ]; then phase="❌ Setup failed - see the setup log below"
  else phase="⏳ Installing and building (first start takes a few minutes)"; fi
  v4=$(curl -s -o /dev/null -m 3 -w "%{http_code}" http://127.0.0.1:3000/login); [ "$v4" = "000" ] && v4="no answer"
  v6=$(curl -s -o /dev/null -m 3 -w "%{http_code}" "http://[::1]:3000/login"); [ "$v6" = "000" ] && v6="no answer"
  {
    echo "# Ulysse - status"
    echo
    echo "**Open the app:** [$APP_URL]($APP_URL)  (⌘/Ctrl + click the link)"
    echo
    echo "Sign in: \`demo@example.com\` / \`Ulysse-demo-2026\`"
    echo
    echo "| Check | Result |"
    echo "|---|---|"
    echo "| Setup | $phase |"
    echo "| App answers (IPv4) | ${v4:-no answer} |"
    echo "| App answers (IPv6) | ${v6:-no answer} |"
    echo "| Listening on | $LISTEN_HOST:3000 |"
    echo "| Updated | $(date -u '+%H:%M:%S UTC') |"
    echo
    echo "200 means the app is running. If the link shows an error, send a screenshot of this file."
    echo
    echo "## Last server log lines"
    echo '```'
    tail -n 25 /tmp/ulysse.log 2>/dev/null
    echo '```'
    echo "## Last setup log lines"
    echo '```'
    tail -n 15 .data/setup.log 2>/dev/null
    echo '```'
  } > "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"
}
( while true; do write_status; sleep 5; done ) &

# While setup runs (or if it failed), port 3000 shows a self-refreshing status page.
WAIT_PID=""
while [ ! -f .data/setup-done ] || [ ! -f .next/standalone/server.js ]; do
  if [ -z "$WAIT_PID" ]; then
    node .devcontainer/waiting-page.mjs "$PWD/.data" &
    WAIT_PID=$!
  fi
  sleep 3
done
if [ -n "$WAIT_PID" ]; then kill "$WAIT_PID" 2>/dev/null; sleep 1; fi

seeded=""
while true; do
  echo "[serve] starting Ulysse on $APP_URL" >> /tmp/ulysse.log
  (cd .next/standalone && exec node server.js) >> /tmp/ulysse.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do curl -sf http://127.0.0.1:3000/login > /dev/null && break; sleep 1; done
  if [ -z "$seeded" ] && node scripts/seed-demo.mjs >> /tmp/ulysse.log 2>&1; then seeded=1; fi
  wait "$SERVER_PID"
  echo "[serve] server stopped (exit $?); restarting in 3s" >> /tmp/ulysse.log
  sleep 3
done
