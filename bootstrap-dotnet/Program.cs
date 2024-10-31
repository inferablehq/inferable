using DotNetEnv;
using Inferable;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<InferableClient>(sp => {
    var options = new InferableOptions {
      // To get a new key, run:
      // npx @inferable/cli auth keys create 'My New Machine Key' --type='cluster_machine'
      ApiSecret = System.Environment.GetEnvironmentVariable("INFERABLE_API_SECRET"),
      BaseUrl = System.Environment.GetEnvironmentVariable("INFERABLE_API_ENDPOINT"),
    };

    var logger = sp.GetRequiredService<ILogger<InferableClient>>();

    return new InferableClient(options, logger);
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
  // Load vars from .env file
  Env.Load();
}

var inferable = app.Services.GetService<InferableClient>();

if (inferable == null)
{
  throw new Exception("Could not get InferableClient");
}

inferable.Default.RegisterFunction(new FunctionRegistration<SearchInput> {
    Name = "SearchInventory",
    Description = "Searches the inventory",
    Func = new Func<SearchInput, object?>(input => InventorySystem.SearchInventory(input))
    });

inferable.Default.RegisterFunction(new FunctionRegistration<GetInventoryItemInput> {
    Name = "GetInventoryItem",
    Description = "Gets an inventory item",
    Func = new Func<GetInventoryItemInput, object?>(input => InventorySystem.GetInventoryItem(input))
    });

inferable.Default.RegisterFunction(new FunctionRegistration<EmptyInput> {
    Name = "ListOrders",
    Description = "Lists all orders",
    Func = new Func<EmptyInput, object?>(input => InventorySystem.ListOrders())
    });

inferable.Default.RegisterFunction(new FunctionRegistration<EmptyInput> {
    Name = "TotalOrderValue",
    Description = "Calculates the total value of all orders",
    Func = new Func<EmptyInput, object?>(input => InventorySystem.TotalOrderValue())
});

inferable.Default.RegisterFunction(new FunctionRegistration<MakeOrderInput> {
    Name = "MakeOrder",
    Description = "Makes an order",
    Func = new Func<MakeOrderInput, object?>(input => InventorySystem.MakeOrder(input))
    });

await inferable.Default.Start();

app.Run();
