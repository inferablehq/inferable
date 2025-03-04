import { z } from "zod";
import { inferable } from "./inferable";

async function searchProduct(input: { query: string }) {
  // Simulated product search functionality
  const mockProducts = [
    { id: "P1", name: "Widget A", inStock: true },
    { id: "P2", name: "Widget B", inStock: false },
    { id: "P3", name: "Gadget X", inStock: true },
  ];

  const results = mockProducts.filter((p) =>
    p.name.toLowerCase().includes(input.query.toLowerCase()),
  );

  return { products: results };
}

async function generateQuote(input: {
  productId: string;
  quantity: number;
  specialRequirements: string | undefined;
}) {
  // Simulated quote generation
  const basePrice = Math.floor(Math.random() * 100) + 50; // Random price between 50-150
  const total = basePrice * input.quantity;

  return {
    quoteId: `Q${Date.now()}`,
    unitPrice: basePrice,
    totalPrice: total,
    estimatedDelivery: "5-7 business days",
  };
}

async function translateProductNames(input: {
  text: string;
  fromLanguage: string;
}) {
  // Simulated translation service
  // In a real implementation, this would call a translation API
  return {
    translatedText: input.text,
    detectedLanguage: input.fromLanguage,
    confidence: 0.95,
  };
}

async function getProductAlternatives(input: { productId: string }) {
  // Simulated alternatives lookup
  const mockAlternatives: Record<
    string,
    Array<{ id: string; name: string; inStock: boolean }>
  > = {
    P1: [{ id: "P4", name: "Widget A Pro", inStock: true }],
    P2: [{ id: "P5", name: "Widget B Plus", inStock: true }],
  };

  return {
    alternatives: mockAlternatives[input.productId] || [],
  };
}

async function getShippingCost(input: {
  productId: string;
  quantity: number;
  destination: string;
}) {
  // Simulated shipping cost calculation
  const baseShipping = 10;
  const quantityFactor = Math.ceil(input.quantity / 5);

  return {
    shippingCost: baseShipping * quantityFactor,
    estimatedDays: 5,
    provider: "Standard Shipping",
  };
}

async function calculator(input: {
  operation: "add" | "subtract" | "multiply" | "divide";
  values: number[];
}) {
  let result: number;

  switch (input.operation) {
    case "add":
      result = input.values.reduce((a, b) => a + b, 0);
      break;
    case "subtract":
      result = input.values.reduce((a, b) => a - b);
      break;
    case "multiply":
      result = input.values.reduce((a, b) => a * b, 1);
      break;
    case "divide":
      result = input.values.reduce((a, b) => a / b);
      break;
  }

  return { result };
}

// Register tools with Inferable
inferable.tools.register({
  name: "searchProduct",
  func: searchProduct,
  description: "Searches for product details in the back office system",
  schema: {
    input: z.object({
      query: z
        .string()
        .describe("Product description or details to search for"),
    }),
  },
});

inferable.tools.register({
  name: "generateQuote",
  func: generateQuote,
  description: "Generates a quote for the specified product and quantity",
  schema: {
    input: z.object({
      productId: z.string(),
      quantity: z.number(),
      specialRequirements: z.string().optional(),
    }),
  },
});

inferable.tools.register({
  name: "translateProductNames",
  func: translateProductNames,
  description: "Translates product names to English from other languages",
  schema: {
    input: z.object({
      text: z.string().describe("Text to translate"),
      fromLanguage: z.string().describe("Source language code"),
    }),
  },
});

inferable.tools.register({
  name: "getProductAlternatives",
  func: getProductAlternatives,
  description:
    "Finds alternative products when requested product is out of stock",
  schema: {
    input: z.object({
      productId: z
        .string()
        .describe("ID of the product to find alternatives for"),
    }),
  },
});

inferable.tools.register({
  name: "getShippingCost",
  func: getShippingCost,
  description: "Calculates shipping cost for products",
  schema: {
    input: z.object({
      productId: z.string(),
      quantity: z.number(),
      destination: z.string(),
    }),
  },
});

inferable.tools.register({
  name: "calculator",
  func: calculator,
  description: "Performs basic mathematical operations",
  schema: {
    input: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      values: z.array(z.number()),
    }),
  },
});

export const tools = inferable.tools;
