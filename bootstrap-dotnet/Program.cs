using DotNetEnv;
using Inferable;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

class Program
{
    static async Task Main(string[] args)
    {
        if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development")
        {
            Env.Load();
        }

        var services = new ServiceCollection();

        services.AddLogging(builder => {
            builder.AddConsole();
        });

        services.AddSingleton<InferableClient>(sp => {
            var options = new InferableOptions {
                ApiSecret = Environment.GetEnvironmentVariable("INFERABLE_API_SECRET"),
                BaseUrl = Environment.GetEnvironmentVariable("INFERABLE_API_ENDPOINT"),
            };

            var logger = sp.GetRequiredService<ILogger<InferableClient>>();
            return new InferableClient(options, logger);
        });

        var serviceProvider = services.BuildServiceProvider();
        var client = serviceProvider.GetRequiredService<InferableClient>();

        Console.WriteLine("Starting client...");
        Register.RegisterFunctions(client);
        await client.Default.StartAsync();

        Console.WriteLine("Press any key to exit...");
        Console.ReadKey();
    }
}


