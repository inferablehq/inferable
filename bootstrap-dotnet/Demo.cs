public struct InventoryItem
{
  public string Id { get; set; }
  public string Name { get; set; }
  public string Description { get; set; }
  public int Price { get; set; }
  public int Qty { get; set; }
}

public struct Order
{
  public string ItemId { get; set; }
  public int Qty { get; set; }
  public DateTime At { get; set; }
}

public struct SearchInput
{
  public string search { get; set; }
}

public struct GetInventoryItemInput
{
  public string id { get; set; }
}

public struct MakeOrderItem
{
  public string Id { get; set; }
  public int Qty { get; set; }
}

public struct MakeOrderInput
{
  public List<MakeOrderItem> items { get; set; }
}

public struct EmptyInput
{
  public string? noop { get; set; }
}

public static class InventorySystem
{
  private static List<InventoryItem> inventory = new List<InventoryItem>
  {
    new InventoryItem { Id = "1", Name = "Sonic Screwdriver", Description = "The Doctor's trusty tool", Price = 100, Qty = 10 },
        new InventoryItem { Id = "2", Name = "Towel", Description = "Don't panic!", Price = 42, Qty = 5 },
        new InventoryItem { Id = "3", Name = "Lightsaber", Description = "An elegant weapon for a more civilized age", Price = 200, Qty = 3 },
        new InventoryItem { Id = "4", Name = "Ring of Power", Description = "One ring to rule them all", Price = 1000, Qty = 1 },
        new InventoryItem { Id = "5", Name = "Hoverboard", Description = "Great Scott!", Price = 500, Qty = 2 }
  };

  private static List<Order> orders = new List<Order>();

  public static List<InventoryItem> SearchInventory(SearchInput input)
  {
    return inventory.Where(item =>
        item.Name.ToLower().Contains(input.search.ToLower()) ||
        item.Description.ToLower().Contains(input.search.ToLower())
        ).ToList();
  }

  public static InventoryItem? GetInventoryItem(GetInventoryItemInput input)
  {
    return inventory.FirstOrDefault(item => item.Id == input.id);
  }

  public static Order MakeOrder(MakeOrderInput input)
  {
    var order = new List<Order>();

    foreach (var item in input.items)
    {
      var inventoryItem = inventory.FirstOrDefault(i => i.Id == item.Id);
      if (inventoryItem.Equals(default(InventoryItem)))
      {
        throw new Exception($"Item with id {item.Id} not found");
      }

      if (inventoryItem.Qty < item.Qty)
      {
        throw new Exception($"Not enough stock for item {inventoryItem.Name}. Only {inventoryItem.Qty} left");
      }

      order.Add(new Order { ItemId = item.Id, Qty = item.Qty, At = DateTime.Now });
      inventory[inventory.IndexOf(inventoryItem)] = new InventoryItem
      {
        Id = inventoryItem.Id,
           Name = inventoryItem.Name,
           Description = inventoryItem.Description,
           Price = inventoryItem.Price,
           Qty = inventoryItem.Qty - item.Qty
      };
    }

    orders.AddRange(order);

    return order.Last();
  }

  public static List<Order> ListOrders()
  {
    return orders;
  }

  public static int TotalOrderValue()
  {
    return orders.Sum(order =>
        {
        var item = inventory.FirstOrDefault(i => i.Id == order.ItemId);
        if (item.Equals(default(InventoryItem)))
        {
        throw new Exception($"Item with id {order.ItemId} not found");
        }

        return item.Price * order.Qty;
        });
  }
}

