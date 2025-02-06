<p align="center">
  <img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# .NET SDK for Inferable

[![NuGet version](https://img.shields.io/nuget/v/Inferable.svg)](https://www.nuget.org/packages/Inferable/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

The **Inferable .NET Client** is a .NET library that allows you to interact with the Inferable API. This library provides functionality to register your .NET functions, manage services, and handle API communication easily.

## Installation

To install the Inferable .NET Client, use the following command in your project:

```bash
dotnet add package Inferable
```

## Quick Start

### Initializing the Client

To create a new Inferable client, use the `InferableClient` class:

```cs
using Inferable;

var options = new InferableOptions
{
    ApiSecret = "your-api-secret", // Replace with your API secret
    BaseUrl = "https://api.inferable.ai" // Optional, uses default if not provided
};

var client = new InferableClient(options);
```

If you don't provide an API key or base URL, it will attempt to read them from the following environment variables:

- `INFERABLE_API_SECRET`
- `INFERABLE_API_ENDPOINT`

### Registering a Function

Register a "sayHello" [function](https://docs.inferable.ai/pages/functions). This file will register the function with the [control-plane](https://docs.inferable.ai/pages/control-plane).

```cs
public class MyInput
{
    public string Message { get; set; }
}

client.Tools.Register(new ToolRegistration<MyInput>
{
    Name = "SayHello",
    Description = "A simple greeting function",
    Func = new Func<MyInput, MyResult>>((input) => {
        // Your code here
    }),
});

_ = client.Default.Start();
```

<details>

<summary>👉 The DotNet SDK for Inferable reflects the types from the input class of the function.</summary>

Unlike the [NodeJs SDK](https://github.com/inferablehq/inferable/sdk-node), the Dotnet SDK for Inferable reflects the types from the input struct of the function. It uses the [NJsonSchema](https://github.com/RicoSuter/NJsonSchema) under the hood to generate JSON schemas from C# types through reflection.

If the input class defines [System.Text.Json.Serialization](https://learn.microsoft.com/en-us/dotnet/api/system.text.json.serialization) attributes, the SDK will use those in the generated schema. This allows for fine-grained control over the schema generation.

Here's an example to illustrate this:

```cs
public struct UserInput
{
  [JsonPropertyName("id")]
  public string Id { get; set; }
  [JsonPropertyName("Name")]
  public string Name { get; set; }
  [
    JsonPropertyName("email"),
    JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
  ]
  public string Email { get; set; }
}

client.Tools.RegisterTool(new FunctionRegistration<MyInput>
{
    Name = "SayHello",
    Description = "A simple greeting function",
    Func = new Func<UserInput, MyResult>>((input) => {
        // Your code here
    }),
});
```

In this example, the UserInput class uses [System.Text.Json.Serialization](https://learn.microsoft.com/en-us/dotnet/api/system.text.json.serialization) attributes to define additional properties for the schema:

- The email field is ignored when writing null.

</details>

## Documentation

- [Inferable documentation](https://docs.inferable.ai/) contains all the information you need to get started with Inferable.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable .NET Client are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
