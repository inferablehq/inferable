<p align="center">
  <img src="../assets/logo.png" alt="Inferable Logo" width="200" />
</p>

# Go SDK for Inferable

[![Go Reference](https://pkg.go.dev/badge/github.com/inferablehq/inferable/sdk-go.svg)](https://pkg.go.dev/github.com/inferablehq/inferable/sdk-go)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)
[![Go Report Card](https://goreportcard.com/badge/github.com/inferablehq/inferable/sdk-go)](https://goreportcard.com/report/github.com/inferablehq/inferable/sdk-go)

Inferable Go Client is a Go package that provides a client for interacting with the Inferable API. It allows you to register your go functions against the Inferable control plane.

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
