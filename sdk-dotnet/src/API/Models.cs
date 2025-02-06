using System.Text.Json;
using System.Text.Json.Serialization;
using NJsonSchema;

namespace Inferable.API
{

  public class JsonSchemaConverter : JsonConverter<JsonSchema>
  {
    public override JsonSchema Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
      throw new NotImplementedException();
    }
    public override void Write(Utf8JsonWriter writer, JsonSchema value, JsonSerializerOptions options)
    {
      writer.WriteRawValue(value.ToJson());
    }
  }

  public struct CreateMachineInput
  {
    [
      JsonPropertyName("tools"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public List<Tool> Tools { get; set; }
  }

  public struct CreateMachineResult
  {
    [JsonPropertyName("clusterId")]
    public required string ClusterId { get; set; }
  }

  public struct JobMessage
  {
    [JsonPropertyName("id")]
    public required string Id { get; set; }
    [JsonPropertyName("function")]
    public required string Function { get; set; }
    [JsonPropertyName("input")]
    public object Input { get; set; }
  }

  public struct CreateResultMeta {
    [
      JsonPropertyName("functionExecutionTime"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public int? FunctionExecutionTime { get; set; }
  }

  public struct CreateResultInput
  {
    [JsonPropertyName("result")]
    public object? Result { get; set; }
    [JsonPropertyName("resultType")]
    public required string ResultType { get; set; }
    [JsonPropertyName("meta")]
    public CreateResultMeta Meta { get; set; }
  }

  public struct CreateJobInput
  {
    [JsonPropertyName("service")]
    public required string Service { get; set; }

    [JsonPropertyName("function")]
    public required string Function { get; set; }

    [JsonPropertyName("input")]
    public required object Input { get; set; }
  }

  public struct CreateJobResult
  {
    // TODO Make enum
    [JsonPropertyName("resultType")]
    public required string? ResultType { get; set; }

    [JsonPropertyName("result")]
    public object? Result { get; set; }

    // TODO: Make enum
    [JsonPropertyName("status")]
    public required string Status { get; set; }
  }

  public struct Tool
  {
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [
      JsonPropertyName("description"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public string? Description { get; set; }

    [JsonPropertyName("schema")]
    public required string Schema { get; set; }

    [
      JsonPropertyName("config"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public ToolConfig? Config { get; set; }
  }

  public struct ToolConfig
  {
    [
      JsonPropertyName("requiresApproval"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public bool? RequiresApproval { get; set; }

    [
      JsonPropertyName("retryCountOnStall"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public int? RetryCountOnStall { get; set; }

    [
      JsonPropertyName("timeoutSeconds"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public int? TimeoutSeconds { get; set; }
  }
}
