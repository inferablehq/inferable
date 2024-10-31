import { Inferable } from 'inferable';
import { z } from 'zod';

// Some mock functions to register
import * as demo from './demo';

// Instantiate the Inferable client.
const i = new Inferable({
  // To get a new key, run:
  // npx @inferable/cli auth keys create 'My New Machine Key' --type='cluster_machine'
  apiSecret: process.env.INFERABLE_API_SECRET
})

// Register some demo functions
i.default.register({
  name: "searchInventory",
  func: demo.searchInventory,
  description: "Searches the inventory",
  schema: {
    input: z.object({
      search: z.string().describe("Could match name or description"),
    }),
  },
});

i.default.register({
  name: "getInventoryItem",
  func: demo.getInventoryItem,
  description: "Gets an inventory item",
  schema: {
    input: z.object({
      id: z.string(),
    }),
  },
});

i.default.register({
  name: "listOrders",
  func: demo.listOrders,
  description: "Lists all orders",
  schema: {
    input: z.object({}),
  },
});

i.default.register({
  name: "totalOrderValue",
  func: demo.totalOrderValue,
  description: "Calculates the total value of all orders",
  schema: {
    input: z.object({}),
  },
});

i.default.register({
  name: "makeOrder",
  func: demo.makeOrder,
  description: "Makes an order",
  config: {
    requiresApproval: true,
  },
  schema: {
    input: z.object({
      items: z.array(
        z.object({
          id: z.string().describe("Item ID"),
          qty: z.number().int().positive().describe("Quantity to order"),
        })
      ),
    }),
  },
});

i.default.start().then(() => {
  console.log("Inferable demo service started");
})
