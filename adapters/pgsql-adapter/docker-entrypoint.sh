#!/bin/sh
set -e

# Default values for environment variables
CONNECTION_STRING="${CONNECTION_STRING:-}"
APPROVAL_MODE="${APPROVAL_MODE:-always}"
PRIVACY_MODE="${PRIVACY_MODE:-false}"
SCHEMA="${SCHEMA:-public}"
SECRET="${SECRET:-}"
ENDPOINT="${ENDPOINT:-}"

# Validate required environment variables
if [ -z "$CONNECTION_STRING" ]; then
    echo "Error: CONNECTION_STRING environment variable is required"
    exit 1
fi

if [ -z "$SECRET" ]; then
    echo "Error: SECRET environment variable is required"
    exit 1
fi

# Construct CLI command with environment variables
COMMAND="pgsql-adapter $CONNECTION_STRING \
    --approval-mode=$APPROVAL_MODE \
    --schema=$SCHEMA \
    --secret=$SECRET"

    # Optional flags
if [ "$PRIVACY_MODE" = "true" ]; then
    COMMAND="$COMMAND --privacy-mode"
fi

if [ -n "$ENDPOINT" ]; then
    COMMAND="$COMMAND --endpoint=\"$ENDPOINT\""
fi

# Execute the command
exec $COMMAND
