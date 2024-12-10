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

    [JsonPropertyName("metadata")]
    public Dictionary<string, string> Metadata { get; set; }
  }

  /// <summary>
  /// Input object for handleCustomerAuth functions
  /// https://docs.inferable.ai/pages/auth#handlecustomerauth
  /// </summary>
  public struct HandleCustomerAuthInput<T>
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

  public class RunReference
  {
    public required string ID { get; set; }
    public required Func<PollRunOptions?, Task<GetRunResult?>> PollAsync { get; set; }
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

    // Dictionary of service name to list of functions
    private Dictionary<string, List<IFunctionRegistration>> _functionRegistry = new Dictionary<string, List<IFunctionRegistration>>();

    private List<Service> _services = new List<Service>();

    /// <summary>
    /// Convenience reference to a service with the name 'default'.
    /// <code>
    /// // Create a new Inferable instance with an API secret
    /// var client = new InferableClient(new InferableOptions {
    ///     ApiSecret = "API_SECRET"
    /// });
    ///
    /// client.Default.RegisterFunction(new FunctionRegistration<TestInput>
    /// {
    ///     Name = "SayHello",
    ///     Description = "A simple greeting function",
    ///     Func = new Func<TestInput, object?>((input) => {
    ///         didCallSayHello = true;
    ///         return $"Hello {input.testString}";
    ///     }),
    /// });
    ///
    /// // Start the service
    /// await client.Default.StartAsync();
    ///
    /// // Stop the service on shutdown
    /// await client.Default.StopAsync();
    /// </code>
    /// </summary>
    public RegisteredService Default
    {
      get
      {
        return this.RegisterService("default");
      }
    }

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

    /// <summary>
    /// Registers a service with Inferable.
    /// <code>
    /// // Create a new Inferable instance with an API secret
    /// var client = new Inferable(new InferableOptions {
    ///     ApiSecret = "API_SECRET"
    /// });
    ///
    /// // Define and register the service
    /// var service = client.RegisterService("MyService");
    ///
    /// service.RegisterFunction(new FunctionRegistration<TestInput>
    /// {
    ///     Name = "SayHello",
    ///     Description = "A simple greeting function",
    ///     Func = new Func<TestInput, object?>((input) => {
    ///         didCallSayHello = true;
    ///         return $"Hello {input.testString}";
    ///     }),
    /// });
    ///
    /// // Start the service
    /// await service.StartAsync();
    ///
    /// // Stop the service on shutdown
    /// await service.StopAsync();
    /// </code>
    /// </summary>
    public RegisteredService RegisterService(string name)
    { return new RegisteredService(name, this);
    }

    /// <summary>
    /// Creates a run and returns a reference to it.
    /// <code>
    /// // Create a new Inferable instance with an API secret
    /// var client = new InferableClient(new InferableOptions {
    ///     ApiSecret = "API_SECRET"
    /// });
    ///
    /// var run = client.CreateRun(new CreateRunInput {
    ///     InitialPrompt = "Hello world"
    /// });
    ///
    /// Console.WriteLine("Started run with ID: " + run.ID);
    ///
    /// var result = await run.PollAsync();
    /// Console.WriteLine("Run result: " + result);
    /// </code>
    /// </summary>
    async public Task<RunReference> CreateRunAsync(CreateRunInput input)
    {
      var clusterId = await this.GetClusterId();
      var result = await this._client.CreateRunAsync(clusterId, input);

      return new RunReference {
        ID = result.ID,
        PollAsync = async (PollRunOptions? options) => {
          var MaxWaitTime = options?.MaxWaitTime ?? TimeSpan.FromSeconds(60);
          var Interval = options?.Interval ?? TimeSpan.FromMilliseconds(500);

          var start = DateTime.Now;
          var end = start + MaxWaitTime;
          while (DateTime.Now < end) {
            var pollResult = await this._client.GetRun(clusterId, result.ID);

            var transientStates = new List<string> { "paused", "pending", "running" };
            if (transientStates.Contains(pollResult.Status)) {
              await Task.Delay(Interval);
              continue;
            }

            return pollResult;
          }
          return null;
        }
      };
    }

    /// <summary>
    /// An array containing the names of all services currently polling.
    /// </summary>
    public IEnumerable<string> ActiveServices
    {
      get
      {
        return this._services.Where(s => s.Polling).Select(s => s.Name);
      }
    }

    /// <summary>
    /// An array containing the names of all services that are not currently polling.
    /// </summary>
    /// <remarks>
    /// Note that this will only include services that have been started (i.e., <c>StartAsync()</c> method called).
    /// </remarks>
    public IEnumerable<string> InactiveServices
    {
      get
      {
        return this._services.Where(s => !s.Polling).Select(s => s.Name);
      }
    }

    /// <summary>
    /// An array containing the names of all functions that have been registered.
    /// </summary>
    public IEnumerable<string> RegisteredFunctions
    {
      get
      {
        return this._functionRegistry.SelectMany(f => f.Value.Select(v => v.Name));

      }
    }

    internal void RegisterFunction<T>(string serviceName, FunctionRegistration<T> function) where T : struct {
      var existing = this.RegisteredFunctions.FirstOrDefault(f => f == function.Name);
      if (existing != null) {
        throw new Exception($"Function with name '{function.Name}' already registered");
      }

      if (!this._functionRegistry.ContainsKey(serviceName)) {
        this._functionRegistry.Add(serviceName, new List<IFunctionRegistration> { function });
      } else {
        this._functionRegistry[serviceName].Add(function);
      }

    }

    internal async Task StartServiceAsync(string name) {
      var existing = this._services.FirstOrDefault(s => s.Name == name);
      if (existing != null) {
        throw new Exception("Service is already started");
      }

      if (!this._functionRegistry.ContainsKey(name)) {
        throw new Exception($"No functions registered for service '{name}'");
      }

      var functions = this._functionRegistry[name];

      var service = new Service(name, await this.GetClusterId(), this._client, this._logger, functions);

      this._services.Add(service);
      await service.Start();
    }

    internal async Task StopServiceAsync(string name) {
      var existing = this._services.FirstOrDefault(s => s.Name == name);
      if (existing == null) {
        throw new Exception("Service is not started");
      }
      await existing.Stop();
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

  public struct RegisteredService
  {
    private string _name;
    private InferableClient _inferable;

    internal RegisteredService(string name, InferableClient inferable) {
      this._name = name;
      this._inferable = inferable;
    }

    /// <summary>
    /// Registers a function against the Service.
    /// <code>
    /// service.RegisterFunction(new FunctionRegistration<TestInput>
    /// {
    ///     Name = "SayHello",
    ///     Description = "A simple greeting function",
    ///     Func = new Func<TestInput, object?>((input) => {
    ///         didCallSayHello = true;
    ///         return $"Hello {input.testString}";
    ///     }),
    /// });
    /// </code>
    /// </summary>
    public FunctionReference RegisterFunction<T>(FunctionRegistration<T> function) where T : struct {
      this._inferable.RegisterFunction<T>(this._name, function);

      return new FunctionReference {
        Service = this._name,
        Function = function.Name
      };
    }

    /// <summary>
    /// Starts the service
    /// </summary>
    async public Task StartAsync() {
      await this._inferable.StartServiceAsync(this._name);
    }

    /// <summary>
    /// Stops the service
    /// </summary>
    async public Task StopAsync() {
      await this._inferable.StopServiceAsync(this._name);
    }
  }
}
