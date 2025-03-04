<p align="center">
  <img src="../assets/logo.png" alt="Inferable Logo" width="200" />
</p>

# Inferable Node.js Bootstrap

This is a Node.js bootstrap application that demonstrates how to integrate and
use our SDK. It serves as a reference implementation and starting point for
Node.js developers.

## Docs

To follow along with the docs, go to our
[quickstart](https://docs.inferable.ai/pages/quick-start).

## How to Run

1. Start the local worker machine

```bash
npm run dev
```

2. Trigger the Run

```bash
npm run trigger
```

## How it works

The worker machine uses the Inferable Node.js SDK to register the `exec`
function with Inferable. This function:

- Accepts `ls` or `cat` commands with path arguments
- Only allows accessing paths that start with "./"

## Security

- The `exec` function is restricted to only allow access to files starting with
  "./"
- The agent is designed to be safe and only perform actions that are relevant to
  the task
- The constraints are enforced by source code, and cannot be bypassed by the
  agent
