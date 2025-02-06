<p align="center">
  <img src="../assets/logo.png" alt="Inferable Logo" width="200" />
</p>

# Inferable Go Bootstrap

This is a bootstrap project demonstrating how to create an Inferable service in Go.

## Docs

To follow along with the docs, go to our [quickstart](https://docs.inferable.ai/pages/quick-start).

## How to Run

```bash
go run main.go
```

## How it works

The worker machine uses the Inferable Go SDK to register the `exec` function with Inferable. This function:
   - Accepts `ls` or `cat` commands with path arguments
   - Only allows accessing paths that start with "./"
   - Returns the stdout and stderr from the command execution

## Security

- The `exec` function is restricted to only allow `ls` and `cat` commands
- File access is restricted to paths starting with "./"
- The constraints are enforced by source code, and cannot be bypassed by the agent
