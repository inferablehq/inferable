#!/bin/bash

set -e

PIDS=()

# Start 20 instances of the machine
for i in $(seq 1 20); do
  tsx machine.ts &
  echo "Started instance $i"
  PIDS+=($!)
done

# Wait for all instances to finish
for pid in "${PIDS[@]}"; do
  wait $pid
  echo "Instance $pid finished"
done

