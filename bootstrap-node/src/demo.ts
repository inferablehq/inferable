// Some mock Inventory data to interact with
const inventory = [
  {
    id: "1",
    name: "Sonic Screwdriver",
    description: "The Doctor's trusty tool",
    price: 100,
    qty: 10,
  },
  {
    id: "2",
    name: "Towel",
    description: "Don't panic!",
    price: 42,
    qty: 5,
  },
  {
    id: "3",
    name: "Lightsaber",
    description: "An elegant weapon for a more civilized age",
    price: 200,
    qty: 3,
  },
  {
    id: "4",
    name: "Ring of Power",
    description: "One ring to rule them all",
    price: 1000,
    qty: 1,
  },
  {
    id: "5",
    name: "Hoverboard",
    description: "Great Scott!",
    price: 500,
    qty: 2,
  },
];

const orders: Array<{
  itemId: string;
  qty: number;
  at: Date;
}> = [];

function searchInventory({ search }: { search: string }) {
  return inventory.filter((item) => {
    return (
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase())
    );
  });
}

function getInventoryItem({ id }: { id: string }) {
  return inventory.find((item) => item.id === id);
}

function makeOrder({ items }: { items: { id: string; qty: number }[] }) {
  const order = items.map((item) => {
    const inventoryItem = inventory.find((i) => i.id === item.id);

    if (!inventoryItem) {
      throw new Error(`Item with id ${item.id} not found`);
    }

    if (inventoryItem.qty && inventoryItem.qty < item.qty) {
      throw new Error(
        `Not enough stock for item ${inventoryItem.name}. Only ${inventoryItem.qty} left`
      );
    }

    return {
      itemId: item.id,
      qty: item.qty,
      at: new Date(),
    };
  });

  items.forEach((item) => {
    const inventoryItem = inventory.find((i) => i.id === item.id);
    inventoryItem!.qty -= item.qty;
  });

  orders.push(...order);

  return {
    order,
  };
}

function listOrders() {
  return orders;
}

function totalOrderValue() {
  return orders.reduce((total, order) => {
    const item = inventory.find((i) => i.id === order.itemId);

    if (!item) {
      throw new Error(`Item with id ${order.itemId} not found`);
    }

    return total + item.price * order.qty;
  }, 0);
}

export {
  searchInventory,
  getInventoryItem,
  makeOrder,
  listOrders,
  totalOrderValue,
};
