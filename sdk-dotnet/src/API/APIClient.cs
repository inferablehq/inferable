using System.Net.Http.Headers;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace Inferable.API
{
  public class ApiClientOptions
  {
    public required string BaseUrl { get; set; }
    public required string ApiSecret { get; set; }
    public required string MachineId { get; set; }
  }

  public class ApiClient
  {

    private readonly HttpClient _client;

    public ApiClient(ApiClientOptions options)
    {
      this._client = new HttpClient();

      var version = Assembly.GetAssembly(typeof(InferableClient))?
        .GetName()?
        .Version?
        .ToString() ?? throw new Exception("Failed to get Inferable SDK version");

      _client.BaseAddress = new Uri(options.BaseUrl);

      _client.DefaultRequestHeaders.Add("x-machine-id", options.MachineId);
      _client.DefaultRequestHeaders.Add("x-machine-sdk-version", version);
      _client.DefaultRequestHeaders.Add("x-machine-sdk-language", "cs");

      _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("bearer", options.ApiSecret);
    }

    async private Task RethrowWithContext(HttpRequestException e, HttpResponseMessage response)
    {
        throw new Exception($"Failed to get run. Response: {await response.Content.ReadAsStringAsync()}", e);
    }



    async public Task<CreateMachineResult> CreateMachine(CreateMachineInput input)
    {
      string jsonData = JsonSerializer.Serialize(input);

      HttpResponseMessage response = await _client.PostAsync(
          "/machines",
          new StringContent(jsonData, Encoding.UTF8, "application/json")
          );

      try {
        response.EnsureSuccessStatusCode();
      } catch (HttpRequestException e) {
        await RethrowWithContext(e, response);
      }

      string responseBody = await response.Content.ReadAsStringAsync();
      return JsonSerializer.Deserialize<CreateMachineResult>(responseBody);
    }

    async public Task CreateJobResult(string clusterId, string callId, CreateResultInput input)
    {
      string jsonData = JsonSerializer.Serialize(input);

      HttpResponseMessage response = await _client.PostAsync(
          $"/clusters/{clusterId}/jobs/{callId}/result",
          new StringContent(jsonData, Encoding.UTF8, "application/json")
          );

      try {
        response.EnsureSuccessStatusCode();
      } catch (HttpRequestException e) {
        await RethrowWithContext(e, response);
      }
    }

    async public Task<CreateRunResult> CreateRunAsync(string clusterId, CreateRunInput input)
    {
      string jsonData = JsonSerializer.Serialize(input);

      HttpResponseMessage response = await _client.PostAsync(
          $"/clusters/{clusterId}/runs",
          new StringContent(jsonData, Encoding.UTF8, "application/json")
          );

      try {
        response.EnsureSuccessStatusCode();
      } catch (HttpRequestException e) {
        await RethrowWithContext(e, response);
      }

      string responseBody = await response.Content.ReadAsStringAsync();
      var result = JsonSerializer.Deserialize<CreateRunResult>(responseBody);

      return result;
    }

    async public Task<GetRunResult> GetRun(string clusterId, string runId)
    {
      HttpResponseMessage response = await _client.GetAsync(
          $"/clusters/{clusterId}/runs/{runId}"
          );

      try {
      try {
        response.EnsureSuccessStatusCode();
      } catch (HttpRequestException e) {
        await RethrowWithContext(e, response);
      }

      } catch (HttpRequestException e) {
        throw new Exception($"Failed to get run. Status Code: {response.StatusCode}, Response: {await response.Content.ReadAsStringAsync()}", e);
      }

      string responseBody = await response.Content.ReadAsStringAsync();
      var result = JsonSerializer.Deserialize<GetRunResult>(responseBody);

      return result;
    }

    async public Task<(List<CallMessage>, int?)> ListJobs(string clusterId, string service)
    {
      HttpResponseMessage response = await _client.GetAsync(
          $"/clusters/{clusterId}/jobs?service={service}&acknowledge=true"
          );

      try {
        response.EnsureSuccessStatusCode();
      } catch (HttpRequestException e) {
        await RethrowWithContext(e, response);
      }

      string responseBody = await response.Content.ReadAsStringAsync();
      var result = JsonSerializer.Deserialize<List<CallMessage>>(responseBody) ?? new List<CallMessage>();

      var retryAfterHeader = response.Headers.RetryAfter?.ToString() ?? "";

      try
      {
        int.Parse(retryAfterHeader);
      }
      catch
      {
        return (result, null);
      }

      return (result, int.Parse(retryAfterHeader));
    }

    async public Task<CreateCallResult> CreateJob(string clusterId, CreateCallInput input)
    {
      string jsonData = JsonSerializer.Serialize(input);

      HttpResponseMessage response = await _client.PostAsync(
          $"/clusters/{clusterId}/jobs?waitTime=20",
          new StringContent(jsonData, Encoding.UTF8, "application/json")
          );

      try {
        response.EnsureSuccessStatusCode();
      } catch (HttpRequestException e) {
        await RethrowWithContext(e, response);
      }

      string responseBody = await response.Content.ReadAsStringAsync();
      return JsonSerializer.Deserialize<CreateCallResult>(responseBody);
    }
  }
}
