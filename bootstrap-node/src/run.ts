import { Inferable } from "inferable";
import { z } from "zod";

const client = new Inferable({
  apiSecret: process.env.INFERABLE_API_SECRET,
});

const reportSchema = z.object({
  name: z.string(),
  capabilities: z
    .array(z.string())
    .describe("The capabilities of the program. What it can do."),
});

client
  .run({
    initialPrompt: `
      Iteratively inspect the source code at the current directory, and produce a report.
      You may selectively inspect the contents of files. You can only access files starting with ./
    `.trim(),
    resultSchema: reportSchema,
  })
  .then((r) => r.poll())
  .then((result) => {
    console.log(result);
  })
  .catch((error) => {
    console.error(error);
  });
