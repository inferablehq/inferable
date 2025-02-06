using System.Text.Json.Serialization;
using Inferable.API;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Inferable
{
  public class Links
  {
    public static string DOCS_AUTH = "https://docs.inferable.ai/pages/auth";
  }

  /// <summary>
  /// Input object for onStatusChange functions
  /// Generic type T is the type of the result the run's (resultSchema)
  /// https://docs.inferable.ai/pages/runs#onstatuschange
  /// </summary>
  public struct OnStatusChangeInput<T>
  {
    [JsonPropertyName("runId")]
    public string RunId { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; }

    [JsonPropertyName("result")]
    public T? Result { get; set; }

    [JsonPropertyName("tags")]
    public Dictionary<string, string> Tags { get; set; }
  }

  /// <summary>
  /// Input object for handleCustomAuth functions
  /// https://docs.inferable.ai/pages/custom-auth
  /// </summary>
  public struct HandleCustomAuthInput
  {
    [JsonPropertyName("token")]
    public string Token { get; set; }
  }

  public class InferableOptions
  {
    public string? BaseUrl { get; set; }
    public string? ApiSecret { get; set; }
    public string? MachineId { get; set; }
  }

  public struct PollRunOptions
  {
    public required TimeSpan MaxWaitTime { get; set; }
    public required TimeSpan Interval { get; set; }
  }


  /// <summary>
  /// The Inferable client. This is the main entry point for using Inferable.
  /// Basic usage:
  /// <code>
  /// // create a new Inferable instance
  /// var client = new InferableClient(new InferableOptions {
  ///     ApiSecret = "API_SECRET"
  /// });
  /// </code>
  /// </summary>
  public class InferableClient
  {
    public static string DefaultBaseUrl = "https://api.inferable.ai/";

    private readonly ApiClient _client;
    private readonly ILogger<InferableClient> _logger;
    private string? _clusterId;

    private List<IToolRegistration> _toolRegistry = new List<IToolRegistration>();

    private List<PollingAgent> _pollingAgents = new List<PollingAgent>();

    /// <summary>
    /// Initializes a new instance of the InferableClient class.
    /// Basic usage:
    /// <code>
    /// // Create a new Inferable instance with an API secret
    /// var client = new InferableClient(new InferableOptions {
    ///     ApiSecret = "API_SECRET"
    /// });
    ///
    /// // OR
    ///
    /// Environment.SetEnvironmentVariable("INFERABLE_API_SECRET", "API_SECRET");
    /// var client = new InferableClient();
    /// </code>
    /// </summary>
    public InferableClient(InferableOptions? options = null, ILogger<InferableClient>? logger = null)
    {
      string? apiSecret = options?.ApiSecret ?? Environment.GetEnvironmentVariable("INFERABLE_API_SECRET");
      string baseUrl = options?.BaseUrl ?? Environment.GetEnvironmentVariable("INFERABLE_API_ENDPOINT") ?? DefaultBaseUrl;
      string machineId = options?.MachineId ?? Machine.GenerateMachineId();

      if (apiSecret == null)
      {
        throw new ArgumentNullException($"No API Secret provided. Please see ${Links.DOCS_AUTH}");
      }

      if (!apiSecret.StartsWith("sk_"))
      {
        throw new ArgumentException($"Invalid API Secret. Please see: {Links.DOCS_AUTH}");
      }


      this._client = new ApiClient(new ApiClientOptions{
          ApiSecret = apiSecret,
          BaseUrl = baseUrl,
          MachineId = machineId
      });

      this._logger = logger ?? NullLogger<InferableClient>.Instance;
    }

    public void RegisterTool<T>(ToolRegistration<T> tool) where T : struct {
      var existing = this._toolRegistry.FirstOrDefault(f => f.Name == tool.Name);
      if (existing != null) {
        throw new Exception($"Function with name '{tool.Name}' already registered");
      }

      this._toolRegistry.Add(tool);
    }

    public async Task ListenAsync() {
      if (this._pollingAgents.Count > 0) {
        throw new Exception("Already polling");
      }

      if (this._toolRegistry.Count == 0) {
        throw new Exception($"No functions registered");
      }


      var clusterId = await this.GetClusterId();
      var agent = new PollingAgent(clusterId, this._client, this._logger, this._toolRegistry);

      await agent.Start();
      this._pollingAgents.Add(agent);
    }


    public async Task UnListenAsync() {
      if (this._pollingAgents.Count == 0) {
        throw new Exception("Not polling");
      }

      foreach (var agent in this._pollingAgents) {
        await agent.Stop();
      }

      this._pollingAgents.Clear();
    }

    internal async Task<string> GetClusterId() {
      if (this._clusterId == null) {
        // Call register machine without any services to test API key and get clusterId
        var registerResult = await _client.CreateMachine(new CreateMachineInput {});
        this._clusterId = registerResult.ClusterId;
      }

      return this._clusterId;
    }
  }
}
