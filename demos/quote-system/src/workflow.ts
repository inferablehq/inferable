import { z } from "zod";
import { inferable } from "./inferable";
import { helpers } from "inferable/bin/workflows/workflow";
import { sendBackOfficeEmail, generateQuote } from "./utils";

export const quoteRequestWorkflow = inferable.workflows.create({
  name: "quoteRequest",
  description: "Processes quote requests from customer emails",
  inputSchema: z.object({
    executionId: z.string(),
    customerEmail: z.string(),
    emailBody: z.string(),
    backOfficeEmail: z.string(),
  }),
});

quoteRequestWorkflow.version(1).define(async (ctx, input) => {
  // Extract product details using an agent
  const productExtractorAgent = ctx.agent({
    name: "productExtractor",
    systemPrompt: helpers.structuredPrompt({
      facts: [
        "You analyze customer emails requesting product quotes",
        "You need to extract product details and quantities",
      ],
      goals: [
        "Identify distinct products mentioned in the email",
        "Extract quantity requirements for each product",
        "Translate product names to english, if they are not in english",
        "Get alternative product names for the product, if out of stock, marking it as an alternative product",
      ],
    }),
    resultSchema: z.object({
      products: z.array(
        z.object({
          id: z.string(),
          description: z.string(),
          quantity: z.number(),
          isAlternativeProduct: z.boolean(),
        }),
      ),
    }),
    tools: [
      "searchProduct",
      "translateProductNames", // translate product names to english, if they are not in english
      "getProductAlternatives", // get alternative product names for the product, if out of stock
    ],
  });

  const extractedProducts = await productExtractorAgent.trigger({
    data: {
      emailBody: input.emailBody,
    },
  });

  const allQuotes: unknown[] = [];

  for (const product of extractedProducts.result.products) {
    const quoteAgent = ctx.agent({
      name: "quoteAgent",
      systemPrompt: helpers.structuredPrompt({
        facts: ["You are given a product quote request and a customer email"],
        goals: [
          "Generate a quote for the given product",
          "Get the shipping cost for the given product",
        ],
      }),
      tools: [
        "generateQuote",
        "getShippingCost",
        "calculator", // a simple calculator tool to prevent LLM doing math
      ],
      resultSchema: z.object({
        quoteId: z.string(),
        productDetails: z.object({
          id: z.string(),
          name: z.string(),
        }),
        shippingCost: z.number(),
        totalPrice: z.number(),
      }),
    });

    const quote = await quoteAgent.trigger({
      data: {
        product,
        customerEmail: input.customerEmail,
      },
    });

    allQuotes.push(quote);
  }

  // Send email to back office with quotes for verification
  await ctx.result("send-backoffice-email", async () => {
    await sendBackOfficeEmail(
      input.backOfficeEmail,
      input.customerEmail,
      allQuotes,
    );
  });

  return {
    success: true,
    quotes: allQuotes,
    customerEmail: input.customerEmail,
  };
});
