import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { z } from "zod";
import { createInferableService } from ".";
import { Inferable } from "inferable";
import assert from "assert";

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

const users = [
  { id: "1", name: "John Doe", email: "john.doe@example.com" },
  { id: "2", name: "Jane Doe", email: "jane.doe@example.com" },
];

const appRouter = t.router({
  "": publicProcedure.query(() => {
    return `Inferable TRPC Connector Test v${
      require("../package.json").version
    }`;
  }),
  userById: publicProcedure
    .input(z.object({ id: z.string() }))
    .meta({ inferable: true })
    .query(({ input }) => {
      return users.find((user) => user.id === input.id);
    }),
  users: router({
    create: publicProcedure
      .meta({ description: "Create a new user", inferable: true })
      .input(z.object({ name: z.string(), email: z.string() }))
      .mutation(({ input }) => {
        const newUser = { id: (users.length + 1).toString(), ...input };
        users.push(newUser);
        return newUser;
      }),
  }),
});

const server = createHTTPServer({
  router: appRouter,
});

const client = new Inferable({
  apiSecret: process.env.INFERABLE_API_SECRET,
});

const service = createInferableService({
  router: appRouter,
  createCaller: t.createCallerFactory(appRouter),
  name: "trpcTest",
  client,
});

service
  .start()
  .then(() => {
    console.log("Inferable service started");
  })
  .then((s) => {
    return client
      .run({
        initialPrompt: `Get the user with id 1`,
        resultSchema: z.object({
          id: z.string(),
          firstName: z.string(),
          lastName: z.string(),
          email: z.string(),
        }),
      })
      .then((r) => r.poll());
  })
  .then((r) => {
    assert(r);
    assert(r.result);
    assert.equal(r.result.id, "1");
    assert.equal(r.result.firstName, "John");
    assert.equal(r.result.lastName, "Doe");
    assert.equal(r.result.email, "john.doe@example.com");
    console.log("Test passed");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

server.listen(8001).on("listening", () => {
  console.log("Server is running on port 8001");
});
