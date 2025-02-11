#!/bin/sh
set -e

echo "Running health check"

# Check if required environment variables are set
if [ -z "$CONNECTION_STRING" ]; then
    echo "Error: CONNECTION_STRING environment variable is required for health check"
    exit 1
fi

if [ -z "$SECRET" ]; then
    echo "Error: SECRET environment variable is required for health check"
    exit 1
fi

# Perform the connection test
pgsql-adapter "$CONNECTION_STRING" --secret="$SECRET" --test
