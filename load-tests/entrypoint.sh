#!/bin/bash

set -e

PIDS=()

# Start 10 instances of the machine
for i in $(seq 1 10); do
  tsx machine.ts &
  PIDS+=($!)
done

# Every 30 seconds, check if all instances are still running
while true; do
  sleep 30
  for pid in "${PIDS[@]}"; do
    kill -0 $pid || exit 1
  done
  echo "All instances are still running"
done
