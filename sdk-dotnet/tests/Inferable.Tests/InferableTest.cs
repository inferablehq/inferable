using DotNetEnv;
using Inferable.API;
using Microsoft.Extensions.Logging;
using NJsonSchema;

namespace Inferable.Tests
{
  public class InferableTests
  {
    static string EnvFilePath = "../../../../../.env";
    static string TestClusterId;

    static ApiClient ApiClient;

    static InferableTests()
    {
      Env.Load(EnvFilePath);
      ApiClient = new ApiClient(new ApiClientOptions{
          ApiSecret = System.Environment.GetEnvironmentVariable("INFERABLE_TEST_API_SECRET")!,
          BaseUrl = System.Environment.GetEnvironmentVariable("INFERABLE_TEST_API_ENDPOINT")!,
          MachineId = "test"
      });

      TestClusterId = System.Environment.GetEnvironmentVariable("INFERABLE_TEST_CLUSTER_ID")!;
    }

    static InferableClient CreateInferableClient()
    {
      var logger = LoggerFactory.Create(builder =>
      {
        builder.AddConsole();
        builder.SetMinimumLevel(LogLevel.Debug);
      }).CreateLogger<InferableClient>();

      return new InferableClient(new InferableOptions {
          ApiSecret = System.Environment.GetEnvironmentVariable("INFERABLE_TEST_API_SECRET")!,
          BaseUrl = System.Environment.GetEnvironmentVariable("INFERABLE_TEST_API_ENDPOINT")!,
      }, logger);
    }

    private struct TestInput
    {
      public required string testString { get; set; }
    }

    private struct RunOutput
    {
      public bool didSayHello { get; set; }
    }


    [Fact]
    public void Inferable_Can_Instantiate()
    {
      var inferable = CreateInferableClient();

      Assert.NotNull(inferable);
    }

    [Fact]
    async public void Inferable_Can_Generate_Schema()
    {
      var inferable = CreateInferableClient();

      var registration = new ToolRegistration<TestInput>
      {
        Name = "test",
        Func = new Func<TestInput, string>((input) =>
        {
          return "test";
        })
      };

      var expectedJsonSchema = """
      {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "TestInput",
        "additionalProperties": false,
        "type": "object",
        "properties": {
          "testString": {
            "type": "string"
          }
        }
      }
      """;

      var expectedSchema = await JsonSchema.FromJsonAsync(expectedJsonSchema);

      Assert.Equal(expectedSchema.ToJson(), registration.Schema.ToJson());
    }

    [Fact]
    public void Inferable_Should_Throw_If_No_API_Secret_Provided()
    {
      Assert.Throws<ArgumentNullException>(() => new InferableClient());
    }

    [Fact]
    public void Inferable_Should_Throw_If_Invalid_API_Secret_Provided()
    {
      Assert.Throws<ArgumentException>(() => new InferableClient(new InferableOptions
            {
            ApiSecret = "invalid"
            }));
    }

    [Fact]
    async public void Inferable_Can_Register_Function()
    {
      var inferable = CreateInferableClient();

      var registration = new ToolRegistration<TestInput>
      {
        Name = "test",
        Func = new Func<TestInput, string>((input) =>
        {
          Console.WriteLine("Executing test function");
          return "test";
        })
      };

      inferable.RegisterTool(registration);

      await inferable.ListenAsync();
      await inferable.UnListenAsync();
    }

    [Fact]
    async public void Inferable_Can_Handle_Functions()
    {
      var inferable = CreateInferableClient();

      var registration = new ToolRegistration<TestInput>
      {
        Name = "successFunction",
        Func = new Func<TestInput, string>((input) =>
        {
          Console.WriteLine("Executing successFunction");
          return "This is a test response";
        })
      };

      inferable.RegisterTool(registration);

      try
      {
        await inferable.ListenAsync();

        var result = ApiClient.CreateJob(TestClusterId, new CreateJobInput
        {
          Service = "v2",
          Function = "successFunction",
          Input = new Dictionary<string, string>
          {
            { "testString", "test" }
          }
        });

        Assert.NotNull(result);
        Assert.Equal("resolution", result.Result.ResultType);
        Assert.Equal("This is a test response", result.Result.Result?.ToString());

      }
      finally
      {
        await inferable.UnListenAsync();
      }
    }

    [Fact]
    async public void Inferable_Can_Handle_Functions_Failure()
    {
      var inferable = CreateInferableClient();

      var registration = new ToolRegistration<TestInput>{
        Name = "failureFunction",
        Func = new Func<TestInput, string>((input) =>
        {
          Console.WriteLine("Executing failureFunction");
          throw new Exception("This is a test exception");
        })
      };

      inferable.RegisterTool(registration);

      try
      {
        await inferable.ListenAsync();

        var result = ApiClient.CreateJob(TestClusterId, new CreateJobInput
        {
          Service = "v2",
          Function = "failureFunction",
          Input = new Dictionary<string, string>
          {
            { "testString", "test" }
          }
        });

        Assert.NotNull(result);
        Assert.Equal("rejection", result.Result.ResultType);
        Assert.Contains("This is a test exception", result.Result.Result?.ToString());

      }
      finally
      {
        await inferable.UnListenAsync();
      }
    }
  }
}
