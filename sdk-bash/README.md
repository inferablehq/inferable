# Inferable Bash SDK

> **Note**: This is a demonstration project to show that "all we need is HTTP"
> for an Inferable integration. We don't recommend creating bash-based AI
> clients for production use.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

A lightweight Bash SDK for interacting with the Inferable API. This SDK allows
you to register and run Inferable functions directly from shell scripts.

## Installation

1. Download the SDK:

```bash
curl -O https://raw.githubusercontent.com/inferablehq/inferable-bash/main/inferable.sh
chmod +x inferable.sh
```

2. Set up your environment:

```bash
export INFERABLE_API_SECRET="your-api-secret"  # Required
export INFERABLE_API_ENDPOINT="https://api.inferable.ai"  # Optional, defaults to https://api.inferable.ai
export INFERABLE_MACHINE_ID="custom-machine-id"  # Optional, auto-generated if not provided
```

## Quick Start

Here's a minimal example to get you started with the Inferable Bash SDK:

```bash
#!/bin/bash

# Source the SDK
source ./inferable.sh

# Initialize the SDK
inferable_init || exit 1

# Create a handler file (handler.sh)
cat > handler.sh << 'EOF'
#!/bin/bash

function_name=$1
input=$2

case "$function_name" in
    "greet")
        name=$(echo "$input" | jq -r '.name')
        echo "{\"message\": \"Hello, $name!\"}"
        ;;
    *)
        echo "{\"error\": \"Unknown function\"}"
        ;;
esac
EOF

chmod +x handler.sh

# Define your functions
FUNCTIONS='[
    {
        "name": "greet",
        "description": "Greet a user",
        "schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
    }
]'

# Register the service
CLUSTER_ID=$(register_service "greeting-service" "$FUNCTIONS")

# Start polling with your handler
start_service "$CLUSTER_ID" "greeting-service" "./handler.sh"
```

## Dependencies

- `bash` (version 4.0 or later)
- `curl` for making HTTP requests
- `jq` for JSON processing

## API Reference

### Core Functions

#### `inferable_init`

Initializes the SDK and validates the connection to Inferable.

```bash
inferable_init || exit 1
```

#### `register_service`

Registers a new service with Inferable.

```bash
register_service <service_name> <functions_json>
```

Parameters:

- `service_name`: Name of your service
- `functions_json`: JSON array of function definitions

Returns: Cluster ID on success

#### `start_service`

Starts the service and begins polling for jobs.

```bash
start_service <cluster_id> <service_name> <handler_script> [poll_interval]
```

Parameters:

- `cluster_id`: ID returned from register_service
- `service_name`: Name of your service
- `handler_script`: Path to your handler script
- `poll_interval`: Optional polling interval in seconds (default: 10)

### Utility Functions

#### `generate_machine_id`

Generates a unique machine identifier.

```bash
machine_id=$(generate_machine_id <length>)
```

#### `make_request`

Makes an HTTP request to the Inferable API.

```bash
make_request <method> <path> [body]
```

## Handler Script

Your handler script should accept two arguments:

1. Function name
2. JSON input data

Example handler:

```bash
#!/bin/bash

function_name=$1
input=$2

case "$function_name" in
    "myFunction")
        # Process the input
        value=$(echo "$input" | jq -r '.someField')

        # Return JSON result
        echo "{\"result\": \"Processed $value\"}"
        ;;
    *)
        echo "{\"error\": \"Unknown function\"}"
        ;;
esac
```

## Environment Variables

| Variable                 | Required | Default                    | Description                        |
| ------------------------ | -------- | -------------------------- | ---------------------------------- |
| `INFERABLE_API_SECRET`   | Yes      | -                          | Your Inferable API secret          |
| `INFERABLE_API_ENDPOINT` | No       | `https://api.inferable.ai` | Inferable API endpoint             |
| `INFERABLE_MACHINE_ID`   | No       | Auto-generated             | Unique identifier for this machine |

## Error Handling

The SDK includes basic error handling. Functions will return non-zero exit codes
on failure. We recommend wrapping critical operations in error checks:

```bash
if ! inferable_init; then
    echo "Failed to initialize SDK" >&2
    exit 1
fi

CLUSTER_ID=$(register_service "my-service" "$FUNCTIONS")
if [ -z "$CLUSTER_ID" ]; then
    echo "Failed to register service" >&2
    exit 1
fi
```

## Best Practices

1. Always source the SDK rather than executing it:

```bash
source ./inferable.sh  # Correct
./inferable.sh        # Incorrect
```

2. Validate the initialization:

```bash
inferable_init || exit 1
```

3. Use error handling in your handler scripts:

```bash
#!/bin/bash

function_name=$1
input=$2

if [ -z "$input" ]; then
    echo "{\"error\": \"No input provided\"}"
    exit 1
fi

# Process function...
```

4. Set reasonable polling intervals based on your needs:

```bash
# More frequent polling (5 seconds)
start_service "$CLUSTER_ID" "my-service" "./handler.sh" 5

# Less frequent polling (30 seconds)
start_service "$CLUSTER_ID" "my-service" "./handler.sh" 30
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for
details.
