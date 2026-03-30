#!/usr/bin/env bash
set -eo pipefail

MAX_WAIT=15

wait_for() {
  local description="$1"
  shift
  local elapsed=0
  echo "Waiting for $description..."
  until "$@" &>/dev/null; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ $elapsed -ge $MAX_WAIT ]; then
      echo "Timed out waiting for $description after ${MAX_WAIT}s"
      exit 1
    fi
  done
  echo "$description ready."
}

# Start containerd if not already running
if ! sudo docker info &>/dev/null; then
  sudo containerd &>/dev/null &
  wait_for "containerd" sudo ctr version

  sudo dockerd --iptables=false --storage-driver=vfs &>/dev/null &
  wait_for "Docker daemon" sudo docker info
fi

# Start datastores
sudo docker compose --profile test up -d
wait_for "MySQL" sudo docker compose exec -T db mysql -u root -ptalkbox -e "SELECT 1"

echo "All services ready."
