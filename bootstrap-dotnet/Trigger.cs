using System.Text.Json;
using Inferable;
using Inferable.API;
using NJsonSchema;
using System.Text.Json.Serialization;

public class Report
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("capabilities")]
    public List<string> Capabilities { get; set; } = new();
}

public static class RunSourceInspection
{
    public static async Task RunAsync(InferableClient? client = null)
    {
        // Use the provided client or create a new one if none is provided
        client ??= new InferableClient(new InferableOptions
        {
            ApiSecret = Environment.GetEnvironmentVariable("INFERABLE_API_SECRET"),
            BaseUrl = Environment.GetEnvironmentVariable("INFERABLE_API_ENDPOINT")
        });

        var run = await client.CreateRunAsync(new CreateRunInput
        {
            InitialPrompt = @"
                Iteratively inspect the source code at the current directory, and produce a report.
                You may selectively inspect the contents of files. You can only access files starting with ""./""",
            ResultSchema = JsonSchema.FromType<Report>()
        });

        var result = await run.PollAsync(null);

        if (result?.Result == null)
        {
            throw new Exception("No result found in run");
        }

        var report = JsonSerializer.Deserialize<Report>(result?.Result?.ToString() ?? "");
        Console.WriteLine($"Report: {JsonSerializer.Serialize(report)}");
    }
}
