<p align="center">
  <img src="../assets/logo.png" alt="Inferable Logo" width="200" />
</p>

# Go SDK for Inferable

[![Go Reference](https://pkg.go.dev/badge/github.com/inferablehq/inferable/sdk-go.svg)](https://pkg.go.dev/github.com/inferablehq/inferable/sdk-go)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)
[![Go Report Card](https://goreportcard.com/badge/github.com/inferablehq/inferable/sdk-go)](https://goreportcard.com/report/github.com/inferablehq/inferable/sdk-go)

Inferable Go Client is a Go package that provides a client for interacting with the Inferable API. It allows you to register your go functions against the Inferable control plane and create powerful LLM-powered workflows with structured outputs, agents, and tools.

## Installation

To install the Inferable Go Client, use the following command:

```
go get github.com/inferablehq/inferable/sdk-go
```

## Quick Start

### Initializing Inferable

To create a new Inferable client, use the `New` function:

```go
import "github.com/inferablehq/inferable/sdk-go/inferable"

client, err := inferable.New("your-api-secret", "https://api.inferable.ai")

if err != nil {
    // Handle error
}
```

If you don't provide an API key or base URL, it will attempt to read them from the following environment variables:

- `INFERABLE_API_SECRET`
- `INFERABLE_API_ENDPOINT`

### Registering a Function

Register a "SayHello" [function](https://docs.inferable.ai/pages/functions) with the [control-plane](https://docs.inferable.ai/pages/control-plane).

```go
type MyInput struct {
    Message string `json:"message"`
}

err := client.Tools.Register(inferable.Tool{
    Func:        myFunc,
    Name:        "SayHello",
    Description: "A simple greeting function",
})

if err != nil {
    // Handle error
}
```

### Creating a Workflow

Workflows are a way to define a sequence of actions to be executed. They run on your own compute and can be triggered from anywhere via the API.

```go
import (
    "fmt"
    "github.com/inferablehq/inferable/sdk-go/inferable"
)

// Create a workflow
workflow := client.Workflows.Create(inferable.WorkflowConfig{
    Name: "simple-workflow",
    InputSchema: struct {
        ExecutionId string `json:"executionId"`
        Text        string `json:"text"`
    }{},
})

// Define the workflow handler
workflow.Version(1).Define(func(ctx inferable.WorkflowContext, input struct {
    ExecutionId string `json:"executionId"`
    Text        string `json:"text"`
}) (interface{}, error) {
    // Log a message
    ctx.Log("info", map[string]interface{}{
        "message": "Starting workflow",
    })

    // Use the LLM to generate structured output
    result, err := ctx.LLM.Structured(inferable.StructuredInput{
        Input: input.Text,
        Schema: struct {
            Summary string `json:"summary"`
            Topics  []string `json:"topics"`
        }{},
    })

    if err != nil {
        return nil, err
    }

    return result, nil
})

// Start listening for workflow executions
err = workflow.Listen()
if err != nil {
    // Handle error
}
defer workflow.Unlisten()
```

### Triggering a Workflow

You can trigger a workflow from your application code:

```go
executionId := "unique-execution-id"

err = client.Workflows.Trigger("simple-workflow", executionId, map[string]interface{}{
    "text": "Inferable is a platform for building LLM-powered applications.",
})
if err != nil {
    // Handle error
}
```

## Agents and Tool Use

You can define tools and agents that can be used within your workflows. For more information on tools and agents, see the [Inferable documentation](https://docs.inferable.ai/pages/agents).

### Adding Tools to Workflows

You can register tools that can be used within your workflows:

```go
// Register a tool for the workflow
workflow.Tools.Register(inferable.WorkflowTool{
    Name: "searchDatabase",
    InputSchema: struct {
        SearchQuery string `json:"searchQuery"`
    }{},
    Func: func(input struct {
        SearchQuery string `json:"searchQuery"`
    }, ctx inferable.ContextInput) (struct {
        Result string `json:"result"`
    }, error) {
        // Implement your tool logic here
        result := struct {
            Result string `json:"result"`
        }{
            Result: "Found data for: " + input.SearchQuery,
        }
        return result, nil
    },
})
```

### Using Agents in Workflows

Agents are autonomous LLM-based reasoning engines that can use tools to achieve pre-defined goals:

```go
// Use the agent to search
result, interrupt, err := ctx.Agents.React(inferable.ReactAgentConfig{
    Name: "search",
    Instructions: inferable.Helpers.StructuredPrompt(struct {
        Facts []string
        Goals []string
    }{
        Facts: []string{"You are a search assistant"},
        Goals: []string{"Find information based on the user's query"},
    }),
    Schema: struct {
        Result string `json:"result"`
    }{},
    Tools: []string{"searchDatabase"},
    Input: "What information can you find about machine learning?",
})

if err != nil {
    // Handle error
}

if interrupt != nil {
    // Handle interrupt (e.g., human-in-the-loop)
    return interrupt, nil
}

// Process the agent result
fmt.Printf("Agent result: %v\n", result)
```

IMPORTANT: The `ctx.Agents.React` will return an interrupt if the workflow needs to pause and resume. Therefore, you should `return` the interrupt as the result of the workflow handler, when present.

```go
if interrupt != nil {
    return interrupt, nil
}
```

### Caching Results with Memo

You can cache expensive operations using the `Memo` function to avoid redundant computations:

```go
// Cache a result with a unique key
cachedResult, err := ctx.Memo("unique-cache-key", func() (interface{}, error) {
    // This expensive operation will only be executed once for the given key
    // Subsequent calls with the same key will return the cached result
    return map[string]interface{}{
        "data": "Expensive computation result",
    }, nil
})

if err != nil {
    // Handle error
}

// Use the cached result
fmt.Printf("Cached result: %v\n", cachedResult)
```

### Logging and Observability

The Inferable Go Client provides a `ctx.Log` function that can be used to log messages and errors:

```go
// Log a message
ctx.Log("info", map[string]interface{}{
    "message": "Starting workflow",
})
```

<details>

<summary>👉 The Golang SDK for Inferable reflects the types from the input struct of the function.</summary>

Unlike the [NodeJs SDK](https://github.com/inferablehq/inferable/sdk-node), the Golang SDK for Inferable reflects the types from the input struct of the function. It uses the [invopop/jsonschema](https://pkg.go.dev/github.com/invopop/jsonschema) library under the hood to generate JSON schemas from Go types through reflection.

If the input struct defines jsonschema properties using struct tags, the SDK will use those in the generated schema. This allows for fine-grained control over the schema generation.

Here's an example to illustrate this:

```go
import (
    "github.com/inferablehq/inferable/sdk-go/inferable"
    "time"
)

type UserInput struct {
    ID        int       `json:"id" jsonschema:"required"`
    Name      string    `json:"name" jsonschema:"minLength=2,maxLength=50"`
    Email     string    `json:"email" jsonschema:"format=email"`
    BirthDate time.Time `json:"birth_date" jsonschema:"format=date"`
    Tags      []string  `json:"tags" jsonschema:"uniqueItems=true"`
}

func createUser(input UserInput, ctx inferable.ContextInput) string {
    // Function implementation
}


err := client.Tools.Register(inferable.Tool{
    Func:        createUser,
    Name:        "CreateUser",
    Description: "Creates a new user",
})

if err != nil {
    // Handle error
}
```

In this example, the UserInput struct uses jsonschema tags to define additional properties for the schema:

- The id field is marked as required.
- The name field has minimum and maximum length constraints.
- The email field is specified to be in email format.
- The birth_date field is set to date format.
- The tags field is defined as an array with unique items.

When this function is registered, the Inferable Go SDK will use these jsonschema tags to generate a more detailed and constrained JSON schema for the input.

The [invopop/jsonschema library](https://pkg.go.dev/github.com/invopop/jsonschema) provides many more options for schema customization, including support for enums, pattern validation, numeric ranges, and more.

</details>

## Documentation

- [Inferable documentation](https://docs.inferable.ai/) contains all the information you need to get started with Inferable.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable Go Client are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
