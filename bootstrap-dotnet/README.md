<p align="center">
  <img src="../assets/logo.png" alt="Inferable Logo" width="200" />
</p>

# .NET Bootstrap for Inferable

[![NuGet version](https://img.shields.io/nuget/v/Inferable.svg)](https://www.nuget.org/packages/Inferable/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

This is a bootstrap project demonstrating how to create an Inferable service in .NET.

## Installation

1. Clone this repository
2. Install the Inferable NuGet package:

```bash
dotnet add package Inferable
```

## Quick Start

### Initializing the Client

```csharp
using Inferable;

var options = new InferableOptions
{
    ApiSecret = "your-api-secret", // Get yours at https://console.inferable.ai
    BaseUrl = "https://api.inferable.ai" // Optional
};

var client = new InferableClient(options);
```

If you don't provide an API key or base URL, it will attempt to read them from the following environment variables:

- `INFERABLE_API_SECRET`
- `INFERABLE_API_ENDPOINT`

### Registering the Exec Function

This bootstrap demonstrates registering a secure command execution [function](https://docs.inferable.ai/pages/functions):

```csharp
public class ExecInput
{
    [JsonPropertyName("command")]
    public string Command { get; set; }  // Only "ls" or "cat" allowed

    [JsonPropertyName("arg")]
    public string Arg { get; set; }      // Must start with "./"
}

client.Default.RegisterFunction(new FunctionRegistration<ExecInput> {
    Name = "exec",
    Description = "Executes a system command (only 'ls' and 'cat' are allowed)",
    Func = new Func<ExecInput, object?>(ExecService.Exec),
});

await client.Default.StartAsync();
```

### Using the Function

The exec function can be called through Inferable to execute safe system commands:

```bash
ls ./src           # Lists contents of ./src directory
cat ./README.md    # Shows contents of README.md
```

The function returns:

```csharp
public class ExecResponse
{
    public string Stdout { get; set; }    // Command output
    public string Stderr { get; set; }    // Error output if any
    public string Error { get; set; }     // Exception message if failed
}
```

### Security Features

This bootstrap implements several security measures:

- Whitelist of allowed commands (`ls` and `cat` only)
- Path validation (only allows paths starting with `./`)
- Safe process execution settings
- Full error capture and reporting

## Documentation

- [Inferable Documentation](https://docs.inferable.ai/)
- [.NET SDK Documentation](https://docs.inferable.ai/dotnet)

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable .NET Bootstrap are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.

## License

MIT
