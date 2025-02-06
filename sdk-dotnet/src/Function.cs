using System.Text.Json;
using Inferable.API;
using NJsonSchema;

namespace Inferable
{
  internal interface IToolRegistration
  {
    string Name { get; set; }
    string? Description { get; set; }
    ToolConfig? Config { get; set; }
    JsonSchema Schema { get; }
    CreateResultInput Invoke(object rawInput);
  }

  public class ToolRegistration<T> : IToolRegistration where T : struct
  {
    public required string Name { get; set; }

    public string? Description { get; set; }

    public ToolConfig? Config { get; set; }

    public required Func<T, object?> Func { get; set; }

    public JsonSchema Schema => JsonSchema.FromType(typeof(T)) ?? throw new Exception("Could not generate JsonSchema");

    public CreateResultInput Invoke(object rawInput)
    {

      var inputJson = JsonSerializer.Serialize(rawInput);
      var start = DateTime.Now;

      T input;
      try
      {
        input = JsonSerializer.Deserialize<T>(inputJson);
      }
      catch (Exception e)
      {
        return new CreateResultInput
        {
          ResultType = "rejection",
          Result = JsonSerializer.Serialize(new SerializableException(e)),
          Meta = new CreateResultMeta()
        };
      }

      try
      {
        var result = this.Func(input);
        var functionExecutionTime = (int)(DateTime.Now - start).TotalMilliseconds;

        return new CreateResultInput
        {
          ResultType = "resolution",
          Result = result,
          Meta = new CreateResultMeta {
            FunctionExecutionTime = functionExecutionTime
          }
        };
      }
      catch (Exception e)
      {
        var functionExecutionTime = (int)(DateTime.Now - start).TotalMilliseconds;
        return new CreateResultInput
        {
          ResultType = "rejection",
          Result = JsonSerializer.Serialize(new SerializableException(e)),
          Meta = new CreateResultMeta {
            FunctionExecutionTime = functionExecutionTime
          }
        };
      }
    }
  }
}


