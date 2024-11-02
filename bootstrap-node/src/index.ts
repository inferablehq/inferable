import { Inferable } from "inferable";
import { z } from "zod";

// Some mock functions to register
import * as functions from "./functions";

// Instantiate the Inferable client.
const client = new Inferable({
  // To get a new key, run:
  // npx @inferable/cli auth keys create 'My New Machine Key' --type='cluster_machine'
  apiSecret: process.env.INFERABLE_API_SECRET,
});

// Register some demo functions
client.default.register({
  name: "getUrlContent",
  func: functions.getUrlContent,
  description: "Gets the content of a URL",
  schema: {
    input: z.object({
      url: z.string().describe("The URL to get the content of"),
    }),
  },
});

client.default.register({
  name: "generatePage",
  func: functions.generatePage,
  description: "Generates a page from markdown",
  schema: {
    input: z.object({
      markdown: z.string().describe("The markdown to generate a page from"),
    }),
  },
});

client.default.register({
  name: "scoreHNPost",
  func: functions.scoreHNPost,
  description:
    "Calculates a score for a Hacker News post given its comment count and upvotes",
  schema: {
    input: z.object({
      commentCount: z.number().describe("The number of comments"),
      upvotes: z.number().describe("The number of upvotes"),
    }),
  },
});

client.default.start().then(() => {
  console.log("Inferable demo service started");
});

// To trigger a run: tsx -r dotenv/config src/run.ts
