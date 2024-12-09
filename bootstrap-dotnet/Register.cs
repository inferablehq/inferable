using Inferable;
using System.Text.Json.Serialization;


public class ExecInput
{
    [JsonPropertyName("command")]
    public string Command { get; set; }

    [JsonPropertyName("arg")]
    public string Arg { get; set; }
}

public class ExecResponse
{
    [JsonPropertyName("stdout")]
    public string Stdout { get; set; }

    [JsonPropertyName("stderr")]
    public string Stderr { get; set; }

    [JsonPropertyName("error")]
    public string Error { get; set; }
}

public static class Register
{
    public static void RegisterFunctions(InferableClient client)
    {
        client.Default.RegisterFunction(new FunctionRegistration<ExecInput> {
            Name = "exec",
            Description = "Executes a system command (only 'ls' and 'cat' are allowed)",
            Func = new Func<ExecInput, object?>(ExecService.Exec),
        });
    }
}
