#!/bin/bash
# Ulysse — one-click local start for macOS (also works on Linux: run it from a terminal).
# Needs Docker Desktop. Builds and starts Ulysse with its database, adds demo data and opens
# http://localhost:3000 in the browser. The first run takes a few minutes; later runs are fast.
cd "$(dirname "$0")" || exit 1

say_and_wait() { echo; echo "$1"; echo; read -r -p "Press Enter to close this window..." _; exit "${2:-1}"; }

echo "=== Ulysse: local start ==="

if ! command -v docker >/dev/null 2>&1; then
  open "https://www.docker.com/products/docker-desktop/" 2>/dev/null
  say_and_wait "Docker Desktop is not installed. Install it from the page that just opened, start it once, then double-click this file again."
fi

if ! docker info >/dev/null 2>&1; then
  echo "Starting Docker Desktop..."
  open -a Docker 2>/dev/null
  for _ in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || say_and_wait "Docker Desktop did not start. Open Docker Desktop, wait until it says it is running, then double-click this file again."
fi

if [ ! -f .env ]; then
  echo "Creating local settings (.env)..."
  {
    echo "APP_SECRET=$(LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64)"
    echo "PLATFORM_ADMIN_EMAILS=demo@example.com"
  } > .env
fi

echo "Building and starting Ulysse (the first time this takes a few minutes)..."
docker compose up -d --build || say_and_wait "Ulysse could not be started. Copy the messages above and send them to whoever helps you."

echo "Waiting for Ulysse and adding demo data..."
docker compose --profile demo run --rm seed || say_and_wait "Ulysse started, but the demo data could not be added. Copy the messages above."

open "http://localhost:3000/login" 2>/dev/null || xdg-open "http://localhost:3000/login" 2>/dev/null
say_and_wait "Ulysse is running at http://localhost:3000
Sign in with  demo@example.com  /  Ulysse-demo-2026
To stop it: Docker Desktop > Containers > ats-system > Stop." 0
