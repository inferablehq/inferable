<p align="center">
  <img src="../assets/logo.png" alt="Inferable Logo" width="200" />
</p>

# Inferable Node.js Bootstrap

This is a Node.js bootstrap application that demonstrates how to integrate and use our SDK. It serves as a reference implementation and starting point for Node.js developers.

## Docs

To follow along with the docs, go to our [quickstart](https://docs.inferable.ai/quick-start).

## What does this application do?

The application demonstrates an agent that can inspect and analyze source code by iteratively executing system commands. It shows how to:

1. Register Typescript functions with Inferable ([index.ts](./src/index.ts))
2. Trigger a Run programmatically to provide a goal ([run.ts](./src/run.ts))

```mermaid
sequenceDiagram
    participant Agent
    participant exec
    participant FileSystem

    Agent->>exec: Request file listing (ls)
    exec->>FileSystem: Execute ls command
    FileSystem->>exec: Return file list
    exec->>Agent: File list results
    Agent->>exec: Request file contents (cat)
    exec->>FileSystem: Execute cat command
    FileSystem->>exec: Return file contents
    exec->>Agent: File contents
    Agent->>Agent: Analyze code and generate report
```

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

1. The worker machine uses the Inferable Node.js SDK to register the `exec` function with Inferable. This function:

   - Accepts `ls` or `cat` commands with path arguments
   - Only allows accessing paths that start with "./"
   - Returns the stdout and stderr from the command execution

2. The `run.ts` script creates a Re-Act agent that:

   - Receives an initial prompt to inspect source code in the current directory
   - Can iteratively call the `exec` function to list and read files
   - Produces a final report containing:
     - The name of the program
     - A list of its capabilities

3. The agent will:

   - Use `ls` to discover files in the directory
   - Use `cat` to read the contents of relevant files
   - Analyze the code to understand its functionality
   - Generate a structured report based on its findings

## Security

- The `exec` function is restricted to only allow access to files starting with "./"
- The agent is designed to be safe and only perform actions that are relevant to the task
- The constraints are enforced by source code, and cannot be bypassed by the agent
