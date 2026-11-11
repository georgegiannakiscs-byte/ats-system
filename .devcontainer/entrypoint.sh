#!/usr/bin/env bash
# Main process of the app container: waits for the repository checkout, then keeps Ulysse
# running as the "node" user (serve.sh). It never exits, so the container stays up even if
# something goes wrong; the status page on port 3000 then explains what happened.
until ls /workspaces/*/.devcontainer/serve.sh > /dev/null 2>&1; do sleep 2; done
SERVE="$(ls /workspaces/*/.devcontainer/serve.sh | head -1)"
if [ "$(id -u)" = "0" ]; then
  runuser -u node -- bash "$SERVE" >> /tmp/ulysse-serve.log 2>&1
else
  bash "$SERVE" >> /tmp/ulysse-serve.log 2>&1
fi
sleep infinity
