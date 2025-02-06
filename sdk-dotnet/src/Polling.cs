using Inferable.API;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Inferable
{
  /// <summary>
  /// Internal class for managing the lifecycle of a service, polling, etc
  /// </summary>
  internal class PollingAgent
  {
    static int MAX_CONSECUTIVE_POLL_FAILURES = 50;
    static int DEFAULT_RETRY_AFTER_SECONDS = 10;

    private string _clusterId;
    private bool _polling = false;

    private int _retryAfter = DEFAULT_RETRY_AFTER_SECONDS;

    private ApiClient _client;
    private ILogger _logger;

    private List<IToolRegistration> _tools = new List<IToolRegistration>();

    internal PollingAgent(string clusterId, ApiClient client, ILogger? logger, List<IToolRegistration> functions)
    {
      this._tools = functions;
      this._clusterId = clusterId;

      this._client = client;
      this._logger = logger ?? NullLogger.Instance;
    }

    internal bool Polling
    {
      get
      {
        return this._polling;
      }
    }

    async internal Task<string> Start()
    {
      this._logger.LogDebug("Starting polling agent");
      await RegisterMachine();

      // Purposely not awaiting
      _ = this.runLoop();

      return this._clusterId;
    }

    async internal Task Stop()
    {
      this._logger.LogDebug("Stopping polling agent");
      this._polling = false;
      await Task.FromResult(0);
    }

    async private Task runLoop() {
      this._polling = true;
      var failureCount = 0;

      while (this._polling && failureCount < PollingAgent.MAX_CONSECUTIVE_POLL_FAILURES) {
        try {
          await this.pollIteration();
        } catch (Exception e) {
          this._logger.LogError(e, "Failed poll iteration");
          failureCount++;
        }

        await Task.Delay(1000 * this._retryAfter);
      }

      this._polling = false;
      this._logger.LogError("Quiting polling agent");
    }
    async private Task pollIteration()
    {
      if (this._clusterId == null) {
        throw new Exception("Failed to poll. Could not find clusterId");
      }

      List<JobMessage> messages = new List<JobMessage>();

      try {
        var toolNames = this._tools.Select(f => f.Name).ToArray();
        var pollResult = await _client.ListJobs(this._clusterId, toolNames);

        messages = pollResult.Item1;
        if (pollResult.Item2 != null) {
          this._retryAfter = pollResult.Item2.Value;
        }
      } catch (HttpRequestException e) {
        if (e.StatusCode == System.Net.HttpStatusCode.Gone) {
          await this.RegisterMachine();
        }

        throw;
      }

      foreach (var call in messages)
      {
        var function = this._tools.FirstOrDefault(f => f.Name == call.Function);
        if (function == null)
        {
          this._logger.LogWarning("Received message for unknown function {TargetFn}", call.Function);
          continue;
        }

        var result = function.Invoke(call.Input);

        try
        {
          await this._client.CreateJobResult(this._clusterId, call.Id, result);
        }
        catch (Exception e)
        {
          this._logger.LogError(e, "Failed to create result for job {CallId}", call.Id);
        }
      }
    }

    async private Task RegisterMachine()
    {
      this._logger.LogDebug("Registering machine");
      var tools = new List<Tool>();

      foreach (var function in this._tools)
      {
        tools.Add(new Tool
            {
            Name = function.Name,
            Config = function.Config,
            Description = function.Description,
            Schema = function.Schema.ToJson()
            });
      };

      var registerResult = await _client.CreateMachine(new CreateMachineInput {
          Tools = tools
          });
    }
  }
}
