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
    [JsonPropertyName("service")]
    public required string Service { get; set; }
    [JsonPropertyName("functions")]
    public required List<Function> Functions { get; set; }
  }

  public struct CreateMachineResult
  {
    [JsonPropertyName("clusterId")]
    public required string ClusterId { get; set; }
  }

  public struct CallMessage
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

  public struct CreateCallInput
  {
    [JsonPropertyName("service")]
    public required string Service { get; set; }

    [JsonPropertyName("function")]
    public required string Function { get; set; }

    [JsonPropertyName("input")]
    public required object Input { get; set; }
  }

  public struct CreateCallResult
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

  public struct Function
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
    public FunctionConfig? Config { get; set; }
  }

  public struct FunctionConfig
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

  public struct CreateRunInput
  {
    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [
      JsonPropertyName("attachedFunctions"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull),
    ]
    public List<FunctionReference>? AttachedFunctions { get; set; }

    [
      JsonPropertyName("metadata"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public Dictionary<string, string>? Metadata { get; set; }

    [
      JsonPropertyName("resultSchema"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull),
      JsonConverter(typeof(JsonSchemaConverter))
    ]
    public JsonSchema? ResultSchema { get; set; }

    [
      JsonPropertyName("onStatusChange"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)
    ]
    public OnStatusChange? OnStatusChange { get; set; }

    [JsonPropertyName("reasoningTraces")]
    public bool? ReasoningTraces { get; set; }

    [JsonPropertyName("callSummarization")]
    public bool? CallSummarization { get; set; }
  }

  public struct OnStatusChange
  {
    [
      JsonPropertyName("function"),
      JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull),
    ]
    public FunctionReference? Function { get; set; }
  }

  public struct FunctionReference
  {
    [JsonPropertyName("service")]
    public required string Service { get; set; }
    [JsonPropertyName("function")]
    public required string Function { get; set; }
  }

  public struct CreateRunResult
  {
    [JsonPropertyName("id")]
    public string ID { get; set; }
  }

  public struct GetRunResult
  {
    [JsonPropertyName("id")]
    public string ID { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; }

    [JsonPropertyName("failureReason")]
    public string FailureReason { get; set; }

    [JsonPropertyName("summary")]
    public string Summary { get; set; }

    [JsonPropertyName("result")]
    public object? Result { get; set; }

    [JsonPropertyName("attachedFunctions")]
    public List<string> AttachedFunctions { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, string> Metadata { get; set; }
  }
}
