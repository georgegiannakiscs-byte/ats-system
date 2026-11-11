#!/usr/bin/env bash
# Restarts the Ulysse server; serve.sh (started with the container) brings it back within seconds.
pkill -f "standalone/server.js" 2>/dev/null || pkill -f next-server 2>/dev/null || true
echo "Restarting… open port 3000 again in a few seconds. Log: /tmp/ulysse.log"
